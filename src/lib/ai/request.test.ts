import { describe, expect, it } from "vitest";
import { parseAskBody, sanitizeHistory } from "./request";
import { MAX_HISTORY_CHARS, MAX_HISTORY_TURNS, MAX_QUESTION_CHARS } from "./protocol";

describe("ask request validation", () => {
  it("accepts a question with a property context", () => {
    const r = parseAskBody({ question: "  How much lease is left?  ", context: { kind: "hdb", slug: "blk-872a-tampines-st-86" }, lang: "zh" });
    expect(r).toEqual({ ok: true, value: { question: "How much lease is left?", context: { kind: "hdb", slug: "blk-872a-tampines-st-86" }, history: [], lang: "zh" } });
  });

  it("defaults to a general context and English", () => {
    const r = parseAskBody({ question: "Hi" });
    expect(r.ok && r.value.context).toEqual({ kind: "general" });
    expect(r.ok && r.value.lang).toBe("en");
  });

  it("rejects empty, oversized and malformed requests", () => {
    expect(parseAskBody({ question: "   " })).toMatchObject({ ok: false, error: "invalid_request" });
    expect(parseAskBody({ question: "x".repeat(MAX_QUESTION_CHARS + 1) })).toMatchObject({ ok: false, error: "question_too_long" });
    expect(parseAskBody({ question: "x".repeat(MAX_QUESTION_CHARS) }).ok).toBe(true);
    expect(parseAskBody({ question: 42 })).toMatchObject({ ok: false, error: "invalid_request" });
    expect(parseAskBody({ question: "q", context: { kind: "hdb", slug: "../etc/passwd" } })).toMatchObject({ ok: false });
    expect(parseAskBody({ question: "q", context: { kind: "mansion", slug: "x" } })).toMatchObject({ ok: false });
    expect(parseAskBody(null)).toMatchObject({ ok: false });
  });

  it("keeps the last turns, clipped, starting with the user", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant", content: `turn ${i} ${"x".repeat(i === 9 ? MAX_HISTORY_CHARS + 50 : 0)}` }));
    const out = sanitizeHistory(history);
    expect(out.length).toBeLessThanOrEqual(MAX_HISTORY_TURNS);
    expect(out[0].role).toBe("user");
    expect(out.at(-1)!.content.length).toBeLessThanOrEqual(MAX_HISTORY_CHARS);
    expect(sanitizeHistory([{ role: "assistant", content: "hello" }, { role: "user", content: "  " }])).toEqual([]);
  });
});
