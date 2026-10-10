import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import type { ModelClient } from "@/lib/ai/ask";
import { readAskStream } from "@/lib/ai/stream-client";
import type { AskStreamEvent } from "@/lib/ai/protocol";
import { AI_RATE_LIMIT } from "@/lib/ai/config";

/** Fake SDK client: one text answer per call. */
const fake: ModelClient = {
  stream() {
    const listeners: ((d: string, s: string) => void)[] = [];
    const s = {
      on(_e: "text", l: (d: string, s: string) => void) {
        listeners.push(l);
        return s;
      },
      async finalMessage() {
        for (const l of listeners) l("Grounded answer.", "Grounded answer.");
        return {
          id: "m",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [{ type: "text", text: "Grounded answer.", citations: null }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        } as unknown as Anthropic.Beta.BetaMessage;
      },
    };
    return s;
  },
};

vi.mock("@/lib/ai/ask", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai/ask")>()), createAnthropicClient: () => fake }));

const { POST } = await import("./route");

let ipCounter = 0;
function request(body: unknown, opts: { contentType?: string; ip?: string; raw?: string } = {}) {
  return new NextRequest("http://localhost/api/ask/", {
    method: "POST",
    headers: { "content-type": opts.contentType ?? "application/json", "x-real-ip": opts.ip ?? `198.51.100.${++ipCounter}` },
    body: opts.raw ?? JSON.stringify(body),
  });
}

describe("POST /api/ask/", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns 503 ai_disabled without an API key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await POST(request({ question: "Hi" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "ai_disabled" });
  });

  it("rejects non-JSON content types, bad JSON and over-long questions", async () => {
    expect((await POST(request({ question: "Hi" }, { contentType: "text/plain" }))).status).toBe(415);
    const bad = await POST(request(null, { raw: "{not json" }));
    expect(bad.status).toBe(400);
    const long = await POST(request({ question: "x".repeat(501), context: { kind: "general" } }));
    expect(long.status).toBe(400);
    expect(await long.json()).toMatchObject({ error: "question_too_long" });
  });

  it("streams NDJSON events ending with done, privately", async () => {
    const res = await POST(request({ question: "What is the median price in Tampines?", context: { kind: "general" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const events: AskStreamEvent[] = [];
    await readAskStream(res.body!, (e) => events.push(e));
    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("")).toBe("Grounded answer.");
    expect(events.at(-1)).toMatchObject({ type: "done", sampleData: true });
  });

  it("rate-limits anonymous visitors per IP", async () => {
    const ip = "203.0.113.200";
    for (let i = 0; i < AI_RATE_LIMIT.anonymous; i++) {
      const ok = await POST(request({ question: "Hi" }, { ip }));
      expect(ok.status).toBe(200);
      await ok.text();
    }
    const blocked = await POST(request({ question: "Hi" }, { ip }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect(await blocked.json()).toMatchObject({ error: "rate_limited" });
    // another visitor is unaffected
    expect((await POST(request({ question: "Hi" }, { ip: "203.0.113.201" }))).status).toBe(200);
  });
});
