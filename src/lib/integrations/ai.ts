/**
 * AIProvider: the only place the Anthropic SDK is called. Agents depend on this interface, never on the SDK.
 * Without ANTHROPIC_API_KEY the platform runs in MOCK mode, where agents use their deterministic engines.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ProviderInfo } from "./types";

export type AIToolDef = { name: string; description: string; input_schema: Anthropic.Tool["input_schema"] };
export type AIToolExecutor = (name: string, input: Record<string, unknown>) => Promise<unknown>;

export interface AIProvider extends ProviderInfo {
  model: string | null;
  live: boolean;
  /** Structured output constrained by a JSON schema. Returns null if the provider is not live or the call fails. */
  structured<T>(args: { system: string; prompt: string; schema: Record<string, unknown>; maxTokens?: number }): Promise<{ data: T; usage: Usage } | null>;
  /** Tool-calling loop over database-backed tools. */
  runTools(args: { system: string; question: string; tools: AIToolDef[]; execute: AIToolExecutor; maxTurns?: number }): Promise<{
    text: string;
    toolCalls: { tool: string; input: Record<string, unknown>; ok: boolean; ms: number }[];
    usage: Usage;
  } | null>;
}

type Usage = { inputTokens: number; outputTokens: number };

class AnthropicProvider implements AIProvider {
  kind = "AI";
  provider = "Anthropic";
  status = "CONNECTED" as const;
  description = "Claude via the Anthropic API — structured outputs and tool calling.";
  live = true;
  model: string;
  private client: Anthropic;
  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
    this.model = model;
  }

  async structured<T>({ system, prompt, schema, maxTokens }: { system: string; prompt: string; schema: Record<string, unknown>; maxTokens?: number }) {
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens ?? 4000,
        system,
        output_config: { effort: "low", format: { type: "json_schema", schema } },
        messages: [{ role: "user", content: prompt }],
      } as Anthropic.MessageCreateParamsNonStreaming);
      if (res.stop_reason === "refusal") return null;
      const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
      if (!text) return null;
      return { data: JSON.parse(text) as T, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
    } catch (err) {
      if (err instanceof Anthropic.APIError) console.error(JSON.stringify({ level: "error", msg: "anthropic structured call failed", status: err.status }));
      else console.error(JSON.stringify({ level: "error", msg: "anthropic structured call failed" }));
      return null;
    }
  }

  async runTools({ system, question, tools, execute, maxTurns = 6 }: { system: string; question: string; tools: AIToolDef[]; execute: AIToolExecutor; maxTurns?: number }) {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
    const toolCalls: { tool: string; input: Record<string, unknown>; ok: boolean; ms: number }[] = [];
    const usage = { inputTokens: 0, outputTokens: 0 };
    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        const res = await this.client.messages.create({
          model: this.model,
          max_tokens: 4000,
          system,
          output_config: { effort: "low" },
          tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
          messages,
        } as Anthropic.MessageCreateParamsNonStreaming);
        usage.inputTokens += res.usage.input_tokens;
        usage.outputTokens += res.usage.output_tokens;
        if (res.stop_reason === "refusal") return null;
        const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        if (res.stop_reason !== "tool_use" || !uses.length) {
          const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
          return { text, toolCalls, usage };
        }
        messages.push({ role: "assistant", content: res.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const u of uses) {
          const t0 = Date.now();
          try {
            const out = await execute(u.name, (u.input ?? {}) as Record<string, unknown>);
            toolCalls.push({ tool: u.name, input: u.input as Record<string, unknown>, ok: true, ms: Date.now() - t0 });
            results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out).slice(0, 20000) });
          } catch (e) {
            toolCalls.push({ tool: u.name, input: u.input as Record<string, unknown>, ok: false, ms: Date.now() - t0 });
            results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: e instanceof Error ? e.message : "Tool failed" });
          }
        }
        messages.push({ role: "user", content: results });
      }
      return { text: "I could not complete that request within the tool-call budget.", toolCalls, usage };
    } catch {
      console.error(JSON.stringify({ level: "error", msg: "anthropic tool loop failed" }));
      return null;
    }
  }
}

class HeuristicProvider implements AIProvider {
  kind = "AI";
  provider = "PasarCatch deterministic engines";
  status = "MOCK" as const;
  description = "No ANTHROPIC_API_KEY set. Agents run transparent rule-based engines; language explanations are templated.";
  live = false;
  model = null;
  async structured<T>(): Promise<{ data: T; usage: Usage } | null> {
    return null;
  }
  async runTools() {
    return null;
  }
}

let cached: AIProvider | null = null;
export function getAI(): AIProvider {
  if (cached) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  cached = key ? new AnthropicProvider(key, process.env.ANTHROPIC_MODEL || "claude-opus-5-5") : new HeuristicProvider();
  return cached;
}
/** For tests. */
export function setAI(p: AIProvider | null) {
  cached = p;
}
