/** Assistant configuration (env-driven). Server-side only by convention: reads non-public env vars. */

/** Default model when ANTHROPIC_MODEL is not set. */
export const DEFAULT_MODEL = "claude-opus-5-5";

/** Maximum rounds of tool calls per question; after the last round the model must answer. */
export const MAX_TOOL_ROUNDS = 6;

/** Output cap per model call (thinking + answer). */
export const MAX_TOKENS = 4096;

/** Questions per hour, per IP for visitors and per account when signed in. */
export const AI_RATE_LIMIT = {
  windowSec: 3600,
  anonymous: 10,
  free: 30,
  plus: 100,
  /** all visitors together, per server instance: a cost backstop */
  global: 1000,
} as const;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

export function aiModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Effort level sent with each request. ANTHROPIC_EFFORT overrides ("off" sends none, for models that
 * do not accept the parameter). Without it, the default model runs at "low": short grounded answers over
 * tool results do not need deep reasoning, and lower effort keeps latency and cost down.
 */
export function aiEffort(model: string): Effort | null {
  const raw = process.env.ANTHROPIC_EFFORT?.trim().toLowerCase();
  if (raw === "off" || raw === "none") return null;
  if (raw && (EFFORTS as readonly string[]).includes(raw)) return raw as Effort;
  return model === DEFAULT_MODEL ? "low" : null;
}

/** Models that accept server-side refusal fallbacks (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Server-side refusal fallback is on by default for supported models; ANTHROPIC_FALLBACKS=off disables it. */
export function useRefusalFallbacks(model: string): boolean {
  if (process.env.ANTHROPIC_FALLBACKS?.trim().toLowerCase() === "off") return false;
  return FALLBACK_MODELS.has(model);
}
