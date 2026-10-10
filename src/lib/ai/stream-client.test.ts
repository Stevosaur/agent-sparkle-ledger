import { describe, expect, it } from "vitest";
import { readAskStream } from "./stream-client";
import type { AskStreamEvent } from "./protocol";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

describe("readAskStream", () => {
  it("parses NDJSON events split across chunks, including multi-byte characters", async () => {
    const zh = "淡滨尼四房式";
    const line1 = JSON.stringify({ type: "tool", name: "get_town_stats" }) + "\n";
    const line2 = JSON.stringify({ type: "text", text: zh }) + "\n";
    const line3 = JSON.stringify({ type: "done", dataMonth: { hdb: "2026-08", private: null }, truncated: false, sampleData: true });
    // split inside a multi-byte character and without a trailing newline
    const bytes = new TextEncoder().encode(line1 + line2 + line3);
    const cut = (line1 + "{\"type\":\"text\",\"text\":\"").length + 1;
    const events: AskStreamEvent[] = [];
    await readAskStream(
      new ReadableStream({
        start(c) {
          c.enqueue(bytes.slice(0, cut));
          c.enqueue(bytes.slice(cut));
          c.close();
        },
      }),
      (e) => events.push(e),
    );
    expect(events).toEqual([
      { type: "tool", name: "get_town_stats" },
      { type: "text", text: zh },
      { type: "done", dataMonth: { hdb: "2026-08", private: null }, truncated: false, sampleData: true },
    ]);
  });

  it("skips blank and malformed lines", async () => {
    const events: AskStreamEvent[] = [];
    await readAskStream(streamOf(["\n", "not json\n", "{\"no_type\":1}\n", "{\"type\":\"text\",\"text\":\"ok\"}\n"]), (e) => events.push(e));
    expect(events).toEqual([{ type: "text", text: "ok" }]);
  });
});
