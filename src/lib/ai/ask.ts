import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getMeta } from "@/lib/data/meta";
import { resolveProperty } from "@/lib/data/resolve";
import { formatPropertyRef } from "@/lib/property-ref";
import { FALLBACK_BETA, MAX_TOKENS, MAX_TOOL_ROUNDS, aiEffort, aiModel, refusalFallbacksEnabled, sgtDate, type Effort } from "./config";
import { dynamicContext, systemPrompt } from "./prompt";
import { executeTool, toolDefinitions, type ToolContext } from "./tools";
import type { AskContext, AskStreamEvent, AskTurn } from "./protocol";

/**
 * The assistant's agentic loop: stream a model turn, run any requested tools over the data layer,
 * feed the results back, and repeat (at most MAX_TOOL_ROUNDS rounds of tools, then the model must
 * answer). Answer text is forwarded to `emit` as it streams.
 */

type StreamParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

/** The slice of the SDK the loop needs, so tests can substitute a fake. */
export interface ModelStream {
  on(event: "text", listener: (delta: string, snapshot: string) => void): unknown;
  finalMessage(): Promise<Anthropic.Beta.BetaMessage>;
}

export interface ModelClient {
  stream(params: StreamParams, options?: { signal?: AbortSignal }): ModelStream;
}

export function createAnthropicClient(): ModelClient {
  // Reads ANTHROPIC_API_KEY from the environment. Two retries on 429/5xx/connection errors; the route's
  // overall deadline aborts anything still running before the platform's function time limit.
  const client = new Anthropic({ maxRetries: 2, timeout: 40_000 });
  return { stream: (params, options) => client.beta.messages.stream(params, options) };
}

export interface RunAskOptions {
  client: ModelClient;
  question: string;
  history: AskTurn[];
  context: AskContext;
  lang: "en" | "zh";
  /** most sales get_recent_sales may return for this viewer */
  maxSales: number;
  emit: (event: AskStreamEvent) => void;
  signal?: AbortSignal;
  now?: Date;
  model?: string;
  effort?: Effort | null;
  fallbacks?: boolean;
  /** after this many ms no more tool rounds are started and the model must answer (keeps replies inside the function time limit) */
  softDeadlineMs?: number;
}

export interface RunAskResult {
  rounds: number;
  inputTokens: number;
  outputTokens: number;
  outcome: "answered" | "refused" | "empty";
}

/** Resolve the page context into a label the model can use (unknown references are ignored). */
export function describeContext(context: AskContext): { label: string; ref: string; path: string } | null {
  if (context.kind === "general") return null;
  const resolved = resolveProperty(context);
  return resolved ? { label: resolved.label, ref: formatPropertyRef(resolved.ref), path: resolved.href } : null;
}

/**
 * Content to send back as the assistant turn. After a mid-output server-side fallback, blocks other than
 * text that precede the last `fallback` block belong to the declined attempt and must not be echoed (nor
 * their tool calls run).
 */
export function echoableContent(content: Anthropic.Beta.BetaContentBlock[]): Anthropic.Beta.BetaContentBlock[] {
  let boundary = -1;
  content.forEach((b, i) => {
    if (b.type === "fallback") boundary = i;
  });
  if (boundary < 0) return content;
  return content.filter((b, i) => i >= boundary || b.type === "text");
}

export async function runAsk(opts: RunAskOptions): Promise<RunAskResult> {
  const now = opts.now ?? new Date();
  const model = opts.model ?? aiModel();
  const effort = opts.effort === undefined ? aiEffort(model) : opts.effort;
  const fallbacks = opts.fallbacks ?? refusalFallbacksEnabled(model);
  const meta = getMeta();
  const toolCtx: ToolContext = { maxSales: opts.maxSales, now };
  const startedAt = Date.now();
  const softDeadlineMs = opts.softDeadlineMs ?? 35_000;
  const tools = toolDefinitions();

  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    // Stable prefix (tools + this block) is cached across questions.
    { type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } },
    { type: "text", text: dynamicContext({ meta, today: sgtDate(now), lang: opts.lang, page: describeContext(opts.context) }) },
  ];

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...opts.history.map((t) => ({ role: t.role, content: t.content }) as Anthropic.Beta.BetaMessageParam),
    { role: "user", content: opts.question },
  ];

  let rounds = 0;
  let jsonRetries = 0;
  let pauses = 0;
  let anyText = false;
  let inputTokens = 0;
  let outputTokens = 0;
  const dataMonth = { hdb: meta.latestMonth.hdb, private: meta.latestMonth.private };

  for (;;) {
    const finalRound = rounds >= MAX_TOOL_ROUNDS || (rounds > 0 && Date.now() - startedAt > softDeadlineMs);
    const params: StreamParams = {
      model,
      max_tokens: MAX_TOKENS,
      system,
      tools,
      tool_choice: finalRound ? { type: "none" } : { type: "auto" },
      messages,
      // Also cache the growing conversation, so each tool round re-reads the earlier turns from cache.
      cache_control: { type: "ephemeral" },
      ...(effort ? { output_config: { effort } } : {}),
      ...(fallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
    };

    let textThisTurn = false;
    const stream = opts.client.stream(params, { signal: opts.signal });
    stream.on("text", (delta) => {
      if (!delta) return;
      textThisTurn = true;
      anyText = true;
      opts.emit({ type: "text", text: delta });
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // With eager input streaming, a tool input that is not valid JSON rejects finalMessage(). Re-issue
      // that turn (it was never appended) unless it is an API error, the request was aborted, answer
      // text already went out, or we have retried twice.
      if (err instanceof Anthropic.APIError || opts.signal?.aborted || textThisTurn || jsonRetries >= 2) throw err;
      jsonRetries += 1;
      continue;
    }
    inputTokens += (message.usage?.input_tokens ?? 0) + (message.usage?.cache_read_input_tokens ?? 0) + (message.usage?.cache_creation_input_tokens ?? 0);
    outputTokens += message.usage?.output_tokens ?? 0;

    if (message.stop_reason === "refusal") {
      opts.emit({ type: "error", error: "refused", message: "The assistant could not answer that question." });
      return { rounds, inputTokens, outputTokens, outcome: "refused" };
    }

    if (message.stop_reason === "pause_turn" && pauses < 2) {
      pauses += 1;
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    const content = echoableContent(message.content);
    const toolUses = content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0 || finalRound) {
      if (!anyText) {
        opts.emit({ type: "error", error: "ai_error", message: "No answer was produced. Please try rephrasing your question." });
        return { rounds, inputTokens, outputTokens, outcome: "empty" };
      }
      opts.emit({ type: "done", dataMonth, truncated: message.stop_reason === "max_tokens", sampleData: meta.fixture });
      return { rounds, inputTokens, outputTokens, outcome: "answered" };
    }

    // A tool input cut off by max_tokens can still look valid: never run it.
    if (message.stop_reason === "max_tokens") {
      opts.emit({ type: "error", error: "ai_error", message: "The answer ran too long. Please ask a narrower question." });
      return { rounds, inputTokens, outputTokens, outcome: "empty" };
    }

    messages.push({ role: "assistant", content });
    rounds += 1;
    for (const t of toolUses) opts.emit({ type: "tool", name: t.name });
    const results = await Promise.all(toolUses.map((t) => executeTool(t.name, t.input, toolCtx)));
    // All results go back in one user message, in the same order as the calls.
    messages.push({
      role: "user",
      content: toolUses.map((t, i) => ({
        type: "tool_result" as const,
        tool_use_id: t.id,
        content: results[i].content,
        ...(results[i].isError ? { is_error: true } : {}),
      })),
    });
    if (textThisTurn) opts.emit({ type: "text", text: "\n\n" });
  }
}
