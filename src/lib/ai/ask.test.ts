import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { echoableContent, runAsk, type ModelClient, type ModelStream } from "./ask";
import { MAX_TOOL_ROUNDS } from "./config";
import type { AskStreamEvent } from "./protocol";

type Params = Parameters<ModelClient["stream"]>[0];
type Block = Anthropic.Beta.BetaContentBlock;

interface Scripted {
  content: Block[];
  stop: Anthropic.Beta.BetaMessage["stop_reason"];
  /** text deltas to stream before resolving (defaults to the text blocks) */
  deltas?: string[];
  /** make finalMessage() reject with this error */
  reject?: unknown;
}

function message(s: Scripted): Anthropic.Beta.BetaMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: s.content,
    stop_reason: s.stop,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Beta.BetaMessage;
}

/** A fake SDK client that replays scripted turns and records every request. */
function fakeClient(script: Scripted[]) {
  const calls: Params[] = [];
  const client: ModelClient = {
    stream(params) {
      calls.push(structuredClone(params));
      const turn = script.shift();
      if (!turn) throw new Error("unexpected extra model call");
      const listeners: ((d: string, s: string) => void)[] = [];
      const stream: ModelStream = {
        on(_event, listener) {
          listeners.push(listener);
          return stream;
        },
        async finalMessage() {
          const deltas = turn.deltas ?? turn.content.flatMap((b) => (b.type === "text" ? [b.text] : []));
          let snap = "";
          for (const d of deltas) {
            snap += d;
            for (const l of listeners) l(d, snap);
          }
          if (turn.reject) throw turn.reject;
          return message(turn);
        },
      };
      return stream;
    },
  };
  return { client, calls };
}

const text = (t: string): Block => ({ type: "text", text: t, citations: null }) as unknown as Block;
const toolUse = (id: string, name: string, input: unknown): Block => ({ type: "tool_use", id, name, input }) as unknown as Block;
const thinking = (): Block => ({ type: "thinking", thinking: "", signature: "sig" }) as unknown as Block;

async function ask(script: Scripted[], extra: Partial<Parameters<typeof runAsk>[0]> = {}) {
  const { client, calls } = fakeClient(script);
  const events: AskStreamEvent[] = [];
  const result = await runAsk({
    client,
    question: "What did Blk 872A Tampines St 86 sell for?",
    history: [],
    context: { kind: "hdb", slug: "blk-872a-tampines-st-86" },
    lang: "en",
    maxSales: 10,
    emit: (e) => events.push(e),
    now: new Date("2026-10-10T00:00:00Z"),
    model: "claude-opus-5-5",
    effort: "low",
    fallbacks: true,
    ...extra,
  });
  return { result, events, calls };
}

describe("runAsk", () => {
  it("runs tools over the data layer and streams the grounded answer", async () => {
    const { result, events, calls } = await ask([
      { content: [thinking(), toolUse("tu_1", "get_recent_sales", { ref: "hdb:blk-872a-tampines-st-86", limit: 3 }), toolUse("tu_2", "get_property_summary", { ref: "hdb:blk-872a-tampines-st-86" })], stop: "tool_use" },
      { content: [text("The latest sale was **S$464,000** in Aug 2026.")], stop: "end_turn", deltas: ["The latest sale was ", "**S$464,000** in Aug 2026."] },
    ]);
    expect(result).toMatchObject({ rounds: 1, outcome: "answered" });
    expect(events.filter((e) => e.type === "tool").map((e) => (e as { name: string }).name)).toEqual(["get_recent_sales", "get_property_summary"]);
    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("")).toBe("The latest sale was **S$464,000** in Aug 2026.");
    expect(events.at(-1)).toMatchObject({ type: "done", dataMonth: { hdb: "2026-08" }, truncated: false, sampleData: true });

    // first request: model, limits, cached system prompt, tools, effort and refusal fallback
    const first = calls[0];
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.max_tokens).toBeLessThanOrEqual(8192);
    expect(first.tool_choice).toEqual({ type: "auto" });
    expect(first.output_config).toEqual({ effort: "low" });
    expect(first.cache_control).toEqual({ type: "ephemeral" });
    expect(first.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect((first as unknown as { fallbacks: string }).fallbacks).toBe("default");
    const system = first.system as Anthropic.Beta.BetaTextBlockParam[];
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(system[0].text).toContain("Never estimate");
    expect(system[1].text).toContain("Blk 872A Tampines St 86");
    expect(system[1].text).toContain("sample data");
    expect(first.tools?.map((t) => (t as { name: string }).name)).toContain("calc_affordability");

    // second request: assistant turn echoed unchanged (incl. thinking), then all tool results in one user message
    const second = calls[1].messages;
    expect(second).toHaveLength(3);
    expect(second[1].role).toBe("assistant");
    expect((second[1].content as Block[])[0].type).toBe("thinking");
    const results = second[2].content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results.map((r) => r.tool_use_id)).toEqual(["tu_1", "tu_2"]);
    const sales = JSON.parse(results[0].content as string);
    expect(sales.returned).toBe(3);
    expect(sales.sales[0].price).toBe(464000);
    expect(results[0].is_error).toBeUndefined();
  });

  it("returns tool errors to the model as is_error results", async () => {
    const { calls } = await ask([
      { content: [toolUse("tu_1", "calc_mortgage", { principal: "lots" })], stop: "tool_use" },
      { content: [text("I need the loan amount.")], stop: "end_turn" },
    ]);
    const results = calls[1].messages[2].content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results[0].is_error).toBe(true);
  });

  it("caps tool rounds and then forces a text answer", async () => {
    const loop: Scripted[] = Array.from({ length: MAX_TOOL_ROUNDS }, (_, i) => ({ content: [toolUse(`tu_${i}`, "get_rates", {})], stop: "tool_use" as const }));
    const { result, calls, events } = await ask([...loop, { content: [text("Here is what I found.")], stop: "end_turn" }]);
    expect(result.rounds).toBe(MAX_TOOL_ROUNDS);
    expect(calls).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(calls.at(-1)!.tool_choice).toEqual({ type: "none" });
    expect(calls.slice(0, -1).every((c) => (c.tool_choice as { type: string }).type === "auto")).toBe(true);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("passes history before the question and omits effort/fallbacks when disabled", async () => {
    const { calls } = await ask([{ content: [text("Hello")], stop: "end_turn" }], {
      history: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello! Ask me about a property." },
      ],
      context: { kind: "general" },
      effort: null,
      fallbacks: false,
      model: "claude-haiku-4-5",
    });
    const msgs = calls[0].messages;
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(msgs[2].content).toBe("What did Blk 872A Tampines St 86 sell for?");
    expect(calls[0]).not.toHaveProperty("output_config");
    expect(calls[0]).not.toHaveProperty("betas");
    expect((calls[0].system as Anthropic.Beta.BetaTextBlockParam[])[1].text).toContain("general page");
  });

  it("reports a refusal instead of an answer", async () => {
    const { result, events } = await ask([{ content: [], stop: "refusal" }]);
    expect(result.outcome).toBe("refused");
    expect(events.at(-1)).toMatchObject({ type: "error", error: "refused" });
  });

  it("flags truncated answers and empty answers", async () => {
    const truncated = await ask([{ content: [text("Partial")], stop: "max_tokens" }]);
    expect(truncated.events.at(-1)).toMatchObject({ type: "done", truncated: true });
    const empty = await ask([{ content: [], stop: "end_turn" }]);
    expect(empty.events.at(-1)).toMatchObject({ type: "error", error: "ai_error" });
  });

  it("never runs a tool call cut off by max_tokens", async () => {
    const { events, calls } = await ask([{ content: [toolUse("tu_1", "get_recent_sales", { ref: "hdb:blk" })], stop: "max_tokens" }]);
    expect(calls).toHaveLength(1);
    expect(events.some((e) => e.type === "tool")).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "error" });
  });

  it("re-issues a turn whose tool input JSON could not be parsed, but not API errors", async () => {
    const retried = await ask([
      { content: [], stop: "tool_use", reject: new Error("Unable to parse tool parameter JSON") },
      { content: [text("Answer after retry")], stop: "end_turn" },
    ]);
    expect(retried.calls).toHaveLength(2);
    expect(retried.events.at(-1)?.type).toBe("done");

    const apiError = new Anthropic.APIError(500, { type: "error" }, "boom", new Headers());
    await expect(ask([{ content: [], stop: "end_turn", reject: apiError }])).rejects.toBe(apiError);
  });

  it("drops blocks of a declined attempt before a mid-output fallback", () => {
    const content = [text("Partial "), thinking(), toolUse("old", "get_rates", {}), { type: "fallback" } as unknown as Block, text("continued"), toolUse("new", "get_rates", {})];
    const echoed = echoableContent(content);
    expect(echoed.map((b) => b.type)).toEqual(["text", "fallback", "text", "tool_use"]);
    expect((echoed[3] as Anthropic.Beta.BetaToolUseBlock).id).toBe("new");
    const plain = [thinking(), text("x")];
    expect(echoableContent(plain)).toBe(plain);
  });
});

describe("runAsk soft deadline", () => {
  it("stops starting tool rounds after the deadline and asks for an answer", async () => {
    const { calls, result } = await ask(
      [
        { content: [toolUse("tu_1", "get_rates", {})], stop: "tool_use" },
        { content: [text("Done.")], stop: "end_turn" },
      ],
      { softDeadlineMs: -1 },
    );
    expect(result.rounds).toBe(1);
    expect(calls[1].tool_choice).toEqual({ type: "none" });
  });
});
