import type { AskStreamEvent } from "./protocol";

/**
 * Read an NDJSON body from POST /api/ask/ and call `onEvent` for each event, in order.
 * Malformed lines are skipped; a trailing line without a newline is still delivered.
 * Client-safe (uses only web streams).
 */
export async function readAskStream(body: ReadableStream<Uint8Array>, onEvent: (event: AskStreamEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deliver = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (parsed && typeof parsed === "object" && typeof (parsed as { type?: unknown }).type === "string") onEvent(parsed as AskStreamEvent);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      deliver(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  buffer += decoder.decode();
  deliver(buffer);
}
