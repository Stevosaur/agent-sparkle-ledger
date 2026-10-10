"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, SendHorizontal, Sparkles, Trash2 } from "lucide-react";
import type { PropertyRef } from "@/lib/property-ref";
import { useViewer } from "@/lib/auth/viewer-context";
import { useLang } from "@/lib/i18n/provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { MarkdownLite } from "@/components/ai/markdown-lite";
import { MAX_HISTORY_TURNS, MAX_QUESTION_CHARS, type AskErrorCode, type AskRequest, type AskTurn } from "@/lib/ai/protocol";
import { readAskStream } from "@/lib/ai/stream-client";
import { formatMonth } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface AskPanelProps {
  /** what the question is about; "general" for site-wide questions */
  context: PropertyRef | { kind: "general" };
  title?: string;
  /** suggested starter questions */
  suggestions?: string[];
}

interface Exchange {
  id: number;
  question: string;
  answer: string;
  status: "streaming" | "done" | "error";
  tool: string | null;
  error: AskErrorCode | null;
  dataMonth: { hdb: string | null; private: string | null } | null;
  truncated: boolean;
  sampleData: boolean;
}

const SUGGESTION_KEYS: Record<string, { key: string; fallback: string }[]> = {
  hdb: [
    { key: "ai.suggest.hdb1", fallback: "What did flats in this block sell for recently?" },
    { key: "ai.suggest.hdb2", fallback: "How much lease is left on this block?" },
    { key: "ai.suggest.hdb3", fallback: "When does this block reach its MOP?" },
  ],
  condo: [
    { key: "ai.suggest.condo1", fallback: "What are the latest transacted prices here?" },
    { key: "ai.suggest.condo2", fallback: "What is the stamp duty on a S$1.5M purchase as my second property?" },
    { key: "ai.suggest.condo3", fallback: "How far is the nearest MRT station?" },
  ],
  landed: [
    { key: "ai.suggest.landed1", fallback: "What has this house sold for before?" },
    { key: "ai.suggest.landed2", fallback: "What is the tenure and land area?" },
  ],
  "landed-street": [
    { key: "ai.suggest.street1", fallback: "What have homes on this street sold for recently?" },
    { key: "ai.suggest.street2", fallback: "What tenures are there on this street?" },
  ],
  launch: [
    { key: "ai.suggest.launch1", fallback: "How many units have been sold so far?" },
    { key: "ai.suggest.launch2", fallback: "When is it expected to be completed?" },
  ],
  general: [
    { key: "ai.suggest.general1", fallback: "What is the median 4-room resale price in Tampines?" },
    { key: "ai.suggest.general2", fallback: "How much stamp duty for a S$1.2M condo as my second property?" },
    { key: "ai.suggest.general3", fallback: "Monthly repayment on a S$500,000 loan at 2.6% over 25 years?" },
  ],
};

const TOOL_LABELS: Record<string, { key: string; fallback: string }> = {
  search_properties: { key: "ai.tool.search", fallback: "Searching properties…" },
  get_property_summary: { key: "ai.tool.summary", fallback: "Reading property details…" },
  get_recent_sales: { key: "ai.tool.sales", fallback: "Checking recent sales…" },
  get_town_stats: { key: "ai.tool.town", fallback: "Looking up town statistics…" },
  get_rates: { key: "ai.tool.rates", fallback: "Checking interest rates…" },
  calc_stamp_duty: { key: "ai.tool.stampDuty", fallback: "Calculating stamp duty…" },
  calc_mortgage: { key: "ai.tool.mortgage", fallback: "Calculating repayments…" },
  calc_affordability: { key: "ai.tool.affordability", fallback: "Working out affordability…" },
};

const ERROR_LABELS: Record<AskErrorCode, { key: string; fallback: string }> = {
  ai_disabled: { key: "ai.error.disabled", fallback: "The assistant is not available right now." },
  invalid_request: { key: "ai.error.invalid", fallback: "Please type a question." },
  question_too_long: { key: "ai.error.tooLong", fallback: "Please keep your question under 500 characters." },
  rate_limited: { key: "ai.error.rateLimited", fallback: "You have reached the question limit for now. Please try again later." },
  ai_error: { key: "ai.error.generic", fallback: "The assistant could not answer just now. Please try again." },
  ai_overloaded: { key: "ai.error.overloaded", fallback: "The assistant is busy. Please try again in a minute." },
  refused: { key: "ai.error.refused", fallback: "Sorry, the assistant can't help with that question." },
};

const KNOWN_ERRORS = new Set(Object.keys(ERROR_LABELS));

/** Prior completed exchanges as alternating turns (most recent MAX_HISTORY_TURNS). */
function historyOf(exchanges: Exchange[]): AskTurn[] {
  const turns: AskTurn[] = [];
  for (const e of exchanges) {
    if (e.status !== "done" || !e.answer.trim()) continue;
    turns.push({ role: "user", content: e.question }, { role: "assistant", content: e.answer });
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}

/** AI assistant grounded in the dataset (POST /api/ask/). Renders nothing when the assistant is not configured. */
export function AskPanel({ context, title, suggestions }: AskPanelProps) {
  const { viewer } = useViewer();
  const { t, lang } = useLang();
  const inputId = useId();
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const busy = exchanges.some((e) => e.status === "streaming");

  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the newest exchange in view as the answer streams in.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [exchanges]);

  if (!viewer?.integrations.ai) return null;

  const update = (id: number, patch: (e: Exchange) => Partial<Exchange>) => setExchanges((list) => list.map((e) => (e.id === id ? { ...e, ...patch(e) } : e)));

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    if (q.length > MAX_QUESTION_CHARS) return;
    const id = nextId.current++;
    const body: AskRequest = { question: q, context, history: historyOf(exchanges), lang };
    setExchanges((list) => [...list, { id, question: q, answer: "", status: "streaming", tool: null, error: null, dataMonth: null, truncated: false, sampleData: false }]);
    setQuestion("");
    const controller = new AbortController();
    abortRef.current = controller;

    const fail = (code: AskErrorCode) => update(id, () => ({ status: "error", error: code, tool: null }));
    try {
      const res = await fetch("/api/ask/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        fail(err?.error && KNOWN_ERRORS.has(err.error) ? (err.error as AskErrorCode) : "ai_error");
        return;
      }
      let finished = false;
      await readAskStream(res.body, (ev) => {
        if (ev.type === "text") update(id, (e) => ({ answer: e.answer + ev.text, tool: null }));
        else if (ev.type === "tool") update(id, () => ({ tool: ev.name }));
        else if (ev.type === "done") {
          finished = true;
          update(id, () => ({ status: "done", tool: null, dataMonth: ev.dataMonth, truncated: ev.truncated, sampleData: ev.sampleData }));
        } else if (ev.type === "error") {
          finished = true;
          // A refusal discards any partial answer; other errors keep what already arrived.
          update(id, (e) => ({ status: "error", error: KNOWN_ERRORS.has(ev.error) ? ev.error : "ai_error", tool: null, answer: ev.error === "refused" ? "" : e.answer }));
        }
      });
      if (!finished) fail("ai_error");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      fail("ai_error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(question);
  }

  function clear() {
    abortRef.current?.abort();
    setExchanges([]);
  }

  const chipItems = suggestions?.length ? suggestions.map((s) => ({ text: s })) : (SUGGESTION_KEYS[context.kind] ?? SUGGESTION_KEYS.general).map((s) => ({ text: t(s.key, s.fallback) }));
  const tooLong = question.trim().length > MAX_QUESTION_CHARS;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-2">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink">{title ?? t(context.kind === "general" ? "ai.titleGeneral" : "ai.title", context.kind === "general" ? "Ask about Singapore property" : "Ask about this property")}</h3>
            <p className="mt-0.5 text-xs text-muted">{t("ai.subtitle", "Answers come from this site's transaction data and calculators.")}</p>
          </div>
        </div>
        {exchanges.length ? (
          <Button type="button" variant="ghost" size="sm" onClick={clear} aria-label={t("ai.clear", "Clear conversation")} title={t("ai.clear", "Clear conversation")}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {exchanges.length ? (
          <ol ref={listRef} className="max-h-[28rem] space-y-4 overflow-y-auto" aria-label={t("ai.conversation", "Conversation")}>
            {exchanges.map((e) => (
              <li key={e.id} className="space-y-2">
                <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-sm bg-brand-50 px-3 py-2 text-sm text-brand-900">
                  <span className="sr-only">{t("ai.you", "You")}: </span>
                  {e.question}
                </p>
                <div aria-live="polite" aria-busy={e.status === "streaming"} className="max-w-full rounded-2xl rounded-bl-sm border border-line bg-canvas/60 px-3 py-2">
                  <span className="sr-only">{t("ai.assistant", "Assistant")}: </span>
                  {e.answer ? <MarkdownLite text={e.answer} /> : null}
                  {e.status === "streaming" && (!e.answer || e.tool) ? (
                    <p className={cn("flex items-center gap-2 text-sm text-muted", e.answer && "mt-2")}>
                      <LoaderCircle className="size-4 animate-spin" aria-hidden />
                      {e.tool ? t(TOOL_LABELS[e.tool]?.key ?? "ai.tool.generic", TOOL_LABELS[e.tool]?.fallback ?? "Looking up data…") : t("ai.thinking", "Thinking…")}
                    </p>
                  ) : null}
                  {e.status === "error" && e.error ? (
                    <p role="alert" className={cn("text-sm text-down", e.answer && "mt-2")}>
                      {t(ERROR_LABELS[e.error].key, ERROR_LABELS[e.error].fallback)}
                    </p>
                  ) : null}
                  {e.status === "done" ? (
                    <p className="mt-2 text-xs text-muted">
                      {e.truncated ? `${t("ai.truncated", "Answer shortened.")} ` : ""}
                      {e.sampleData ? `${t("ai.sampleData", "Sample data, not real transactions.")} ` : ""}
                      {e.dataMonth?.hdb || e.dataMonth?.private
                        ? t("ai.dataTo", "Data to {hdb} (HDB) · {private} (private)", { hdb: formatMonth(e.dataMonth?.hdb), private: e.dataMonth?.private ? formatMonth(e.dataMonth.private) : t("ai.notLoaded", "not loaded") })
                        : null}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div>
            <p className="mb-2 text-xs font-medium text-muted">{t("ai.try", "Try asking")}</p>
            <ul className="flex flex-wrap gap-2">
              {chipItems.map((s) => (
                <li key={s.text}>
                  <button
                    type="button"
                    onClick={() => void ask(s.text)}
                    disabled={busy}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-sm text-ink transition-colors hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50"
                  >
                    {s.text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-1.5">
          <label htmlFor={inputId} className="sr-only">
            {t("ai.inputLabel", "Your question")}
          </label>
          <div className="flex gap-2">
            <Input
              id={inputId}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t("ai.placeholder", "Ask a question…")}
              maxLength={MAX_QUESTION_CHARS + 50}
              autoComplete="off"
              aria-invalid={tooLong || undefined}
              aria-describedby={`${inputId}-hint`}
            />
            <Button type="submit" aria-label={t("ai.send", "Ask")} disabled={busy || !question.trim() || tooLong} className="shrink-0 px-3">
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <SendHorizontal className="size-4" aria-hidden />}
            </Button>
          </div>
          <p id={`${inputId}-hint`} className={cn("text-xs", tooLong ? "text-down" : "text-muted")}>
            {tooLong
              ? t("ai.error.tooLong", "Please keep your question under 500 characters.")
              : t("ai.disclaimer", "AI answers can be wrong. Information only, not financial advice. Check figures with official sources.")}
            {question.length > MAX_QUESTION_CHARS - 100 ? ` (${question.trim().length}/${MAX_QUESTION_CHARS})` : ""}
          </p>
        </form>
      </div>
    </Card>
  );
}
