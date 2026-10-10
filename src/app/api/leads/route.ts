import { NextResponse, type NextRequest } from "next/server";
import { parseLeadPayload } from "@/lib/leads/schema";
import { RateLimiter, clientIpFrom } from "@/lib/leads/rate-limit";
import { deliverLead } from "@/lib/leads/deliver";
import { getViewer } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
/** Lead payloads are small; anything larger is not a form submission. */
const MAX_BODY_BYTES = 16 * 1024;
/** 10 submissions per IP per 10 minutes, per server instance (best effort). */
const limiter = new RateLimiter({ limit: 10, windowMs: 10 * 60_000, maxKeys: 5000 });

function json(body: Record<string, unknown>, status: number, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

/**
 * POST /api/leads/ — mortgage, enquiry, services, listing, valuation and general leads.
 * Body: { type, name, email?, phone?, message?, context?, consent: true, website?: "" (honeypot) }.
 * 200 { ok: true } · 400 { error: "invalid", fields } · 413 · 415 · 429 · 503 { error: "leads_disabled" } · 502.
 * Responses never echo submitted personal data.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return json({ error: "unsupported_media_type" }, 415);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

  const rate = limiter.check(clientIpFrom(req.headers));
  if (!rate.allowed) return json({ error: "rate_limited" }, 429, { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) });

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = parseLeadPayload(body);
  // Honeypot tripped: pretend success so automated submitters learn nothing.
  if (!parsed.ok && parsed.spam) return json({ ok: true }, 200);
  if (!parsed.ok) return json({ error: "invalid", fields: parsed.errors }, 400);

  let userId: string | null = null;
  try {
    userId = (await getViewer()).userId;
  } catch {
    userId = null;
  }

  const result = await deliverLead(parsed.lead, { userId });
  if (result.status === "disabled") return json({ error: "leads_disabled" }, 503);
  if (result.status === "failed") return json({ error: "delivery_failed" }, 502);
  return json({ ok: true }, 200);
}
