/**
 * Wire protocol of POST /api/ask/ (client-safe: no server imports).
 *
 * Request (JSON):  { question, context, history?, lang? }
 * Response:
 *   - errors before the answer starts: JSON `{ error, message? }` with status 400 / 429 / 503
 *   - otherwise `application/x-ndjson`: one AskStreamEvent per line, ending with "done" or "error".
 */
import type { PropertyRef } from "@/lib/property-ref";

export const MAX_QUESTION_CHARS = 500;
/** prior turns (user + assistant messages) sent with a question */
export const MAX_HISTORY_TURNS = 6;
/** each prior turn is clipped to this many characters */
export const MAX_HISTORY_CHARS = 2000;

export type AskContext = PropertyRef | { kind: "general" };

export interface AskTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AskRequest {
  question: string;
  context: AskContext;
  history?: AskTurn[];
  /** UI language, used as a hint when the question's language is ambiguous */
  lang?: "en" | "zh";
}

export type AskErrorCode = "ai_disabled" | "invalid_request" | "question_too_long" | "rate_limited" | "ai_error" | "ai_overloaded" | "refused";

export type AskStreamEvent =
  /** a data lookup started (name of the tool) */
  | { type: "tool"; name: string }
  /** a piece of answer text */
  | { type: "text"; text: string }
  | { type: "done"; dataMonth: { hdb: string | null; private: string | null }; truncated: boolean; sampleData: boolean }
  | { type: "error"; error: AskErrorCode; message?: string };
