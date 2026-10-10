import { z } from "zod";
import { MAX_HISTORY_CHARS, MAX_HISTORY_TURNS, MAX_QUESTION_CHARS, type AskContext, type AskTurn } from "./protocol";

/** Validation of POST /api/ask/ bodies. */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const RefSchema = z.object({
  kind: z.enum(["hdb", "condo", "landed", "landed-street", "launch"]),
  slug: z.string().max(160).regex(SLUG),
  launchType: z.enum(["condo", "ec", "landed"]).optional(),
});

const ContextSchema = z.union([z.object({ kind: z.literal("general") }), RefSchema]);

const BodySchema = z.object({
  question: z.string().max(10_000),
  context: ContextSchema.optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20_000) }))
    .max(50)
    .optional(),
  lang: z.enum(["en", "zh"]).optional(),
});

export interface ParsedAsk {
  question: string;
  context: AskContext;
  history: AskTurn[];
  lang: "en" | "zh";
}

export type ParseResult = { ok: true; value: ParsedAsk } | { ok: false; error: "invalid_request" | "question_too_long"; message: string };

/** Keep the last MAX_HISTORY_TURNS non-empty turns, clipped, starting with a user turn. */
export function sanitizeHistory(history: AskTurn[]): AskTurn[] {
  const turns = history
    .map((t) => ({ role: t.role, content: t.content.trim().slice(0, MAX_HISTORY_CHARS) }))
    .filter((t) => t.content.length > 0)
    .slice(-MAX_HISTORY_TURNS);
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

export function parseAskBody(body: unknown): ParseResult {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "invalid_request", message: "Send JSON with a question string, a context and optional history." };
  const question = parsed.data.question.trim();
  if (!question) return { ok: false, error: "invalid_request", message: "The question is empty." };
  if (question.length > MAX_QUESTION_CHARS) return { ok: false, error: "question_too_long", message: `Questions are limited to ${MAX_QUESTION_CHARS} characters.` };
  return {
    ok: true,
    value: {
      question,
      context: parsed.data.context ?? { kind: "general" },
      history: sanitizeHistory(parsed.data.history ?? []),
      lang: parsed.data.lang ?? "en",
    },
  };
}
