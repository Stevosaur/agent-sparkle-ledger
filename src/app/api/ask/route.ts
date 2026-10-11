import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { isAiConfigured } from "@/lib/auth/config";
import { requireFeature } from "@/lib/auth/require";
import { RateLimiter, clientIp, rateLimitHeaders } from "@/lib/api/rate-limit";
import { AI_RATE_LIMIT } from "@/lib/ai/config";
import { createAnthropicClient, runAsk } from "@/lib/ai/ask";
import { parseAskBody } from "@/lib/ai/request";
import type { AskErrorCode, AskStreamEvent } from "@/lib/ai/protocol";

/**
 * POST /api/ask/ — AI assistant grounded in the dataset.
 * Body: { question, context, history?, lang? } (see src/lib/ai/protocol.ts).
 * Streams NDJSON events; errors before streaming are JSON with 400 / 413 / 415 / 429 / 503.
 * Gate: feature "ai.ask" (public), rate-limited per IP (per account when signed in).
 */

export const maxDuration = 60;

const MAX_BODY_BYTES = 32_000;
const limiter = new RateLimiter({ windowMs: AI_RATE_LIMIT.windowSec * 1000, max: AI_RATE_LIMIT.anonymous });
const globalLimiter = new RateLimiter({ windowMs: AI_RATE_LIMIT.windowSec * 1000, max: AI_RATE_LIMIT.global });

const NO_STORE = { "Cache-Control": "private, no-store" };

function fail(status: number, error: AskErrorCode | "unsupported_media_type" | "payload_too_large", message?: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error, ...(message ? { message } : {}) }, { status, headers: { ...NO_STORE, ...headers } });
}

export async function POST(req: NextRequest) {
  if (!isAiConfigured()) return fail(503, "ai_disabled", "The assistant is not configured on this deployment.");

  // JSON only: a non-simple content type forces a CORS preflight, which cross-site pages cannot pass.
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return fail(415, "unsupported_media_type", "Send the question as application/json.");
  }

  const gate = await requireFeature("ai.ask");
  if (!gate.ok) return gate.response;
  const viewer = gate.viewer;

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return fail(413, "payload_too_large", "Request body is too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "invalid_request", "Request body is not valid JSON.");
  }
  const parsed = parseAskBody(body);
  if (!parsed.ok) return fail(400, parsed.error, parsed.message);

  const max = viewer.plan === "plus" ? AI_RATE_LIMIT.plus : viewer.userId ? AI_RATE_LIMIT.free : AI_RATE_LIMIT.anonymous;
  const key = viewer.userId ? `user:${viewer.userId}` : `ip:${clientIp(req.headers)}`;
  const rl = limiter.check(key, max);
  if (!rl.ok) {
    const minutes = Math.max(1, Math.ceil(rl.retryAfterSec / 60));
    return fail(429, "rate_limited", `Question limit reached (${rl.limit} per hour). Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`, rateLimitHeaders(rl));
  }
  const global = globalLimiter.check("all");
  if (!global.ok) return fail(429, "rate_limited", "The assistant is busy right now. Please try again later.", rateLimitHeaders(global));

  const { question, context, history, lang } = parsed.value;
  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });
  // Stop before the platform kills the function (maxDuration), so the client gets a clean error event.
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, (maxDuration - 5) * 1000);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: AskStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        const result = await runAsk({
          client: createAnthropicClient(),
          question,
          history,
          context,
          lang,
          // The full sales history is an account feature on the site; anonymous visitors get the latest 10.
          maxSales: viewer.features["sales.full"] ? 20 : 10,
          emit,
          signal: abort.signal,
        });
        console.info(`[ai] ${result.outcome} rounds=${result.rounds} in=${result.inputTokens} out=${result.outputTokens}`);
      } catch (err) {
        if (timedOut) {
          console.error("[ai] request timed out");
          emit({ type: "error", error: "ai_error", message: "The answer took too long. Please try a narrower question." });
        } else if (!abort.signal.aborted) {
          const overloaded = err instanceof Anthropic.RateLimitError || (err instanceof Anthropic.APIError && err.status === 529);
          console.error("[ai] request failed", err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
          emit({ type: "error", error: overloaded ? "ai_overloaded" : "ai_error", message: overloaded ? "The assistant is busy. Please try again in a minute." : "The assistant could not answer just now. Please try again." });
        }
      } finally {
        clearTimeout(deadline);
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed by a disconnect */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no", ...NO_STORE, ...rateLimitHeaders(rl) },
  });
}
