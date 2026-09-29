"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as D from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { ArrowRight, Database, Search, Sparkles } from "lucide-react";
import { commandAction, searchAction } from "@/app/actions";

const SUGGESTIONS = [
  "How much batang are we short tonight?",
  "Who has supplied threadfin cheapest over the last 30 days?",
  "Allocate today's seabass",
  "Show all deliveries late by more than 30 minutes",
  "What seafood is likely to go unsold today?",
  "Which invoices don't match receiving?",
  "Are batang prices above the 30-day average?",
  "What approvals are pending?",
];

type Hit = { type: string; id: string; title: string; subtitle: string; href: string };
type Answer = { answer: string; links: { label: string; href: string }[]; mode: "LLM" | "DETERMINISTIC"; tools: string[] };

export function CommandBar({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thinking, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = (o: boolean) => {
    if (!o) {
      setQ("");
      setHits([]);
      setAnswer(null);
      setError(null);
    }
    onOpenChange(o);
  };

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) return;
    timer.current = setTimeout(async () => {
      const r = await searchAction(q);
      if (r.ok) setHits((r.data as Hit[]) ?? []);
    }, 180);
  }, [q]);
  const shownHits = q.trim().length < 2 ? [] : hits;

  function ask(question: string) {
    setAnswer(null);
    setError(null);
    setQ(question);
    start(async () => {
      const r = await commandAction(question);
      if (r.ok) setAnswer(r.data as Answer);
      else setError(r.error);
    });
  }
  const go = (href: string) => {
    close(false);
    router.push(href);
  };

  return (
    <D.Root open={open} onOpenChange={close}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <D.Content className="fixed left-1/2 top-[10vh] z-50 w-[calc(100vw-20px)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-panel shadow-2xl" aria-describedby={undefined}>
          <D.Title className="sr-only">AI command bar</D.Title>
          <Command shouldFilter={false} label="AI command bar" className="text-sm">
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Sparkles className="size-4 text-accent" />
              <Command.Input
                value={q}
                onValueChange={(v) => {
                  setQ(v);
                  setAnswer(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && q.trim().length > 2 && (e.metaKey || e.ctrlKey || !shownHits.length || /\?|how|who|what|which|show|allocate|trace|are|is /i.test(q))) {
                    e.preventDefault();
                    ask(q.trim());
                  }
                }}
                placeholder="Ask about tonight's operation, or search lots, vendors, species, invoices…"
                className="h-12 flex-1 bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
                data-testid="command-input"
              />
              {thinking && <span className="live-dot text-xs text-accent">querying…</span>}
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              {answer && (
                <div className="mb-2 rounded-lg border border-border bg-panel-2 p-4" data-testid="command-answer">
                  <div className="mb-2 flex items-center gap-2 text-[11px] text-muted">
                    <Database className="size-3" /> Answered from database tools: {answer.tools.join(", ")}
                    <span className="ml-auto rounded bg-accent-soft px-1.5 py-0.5 font-semibold text-ai">{answer.mode === "LLM" ? "Claude + tools" : "Deterministic engine"}</span>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-text">{answer.answer}</p>
                  {answer.links.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {answer.links.map((l) => (
                        <button key={l.href + l.label} onClick={() => go(l.href)} className="inline-flex items-center gap-1 rounded-md border border-border bg-panel px-2 py-1 text-xs text-accent hover:border-accent">
                          {l.label} <ArrowRight className="size-3" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {error && <p className="mb-2 rounded-md border border-short/30 bg-short-soft p-3 text-xs text-short">{error}</p>}
              {q.trim().length > 2 && !answer && (
                <Command.Item value="__ask" onSelect={() => ask(q.trim())} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-text data-[selected=true]:bg-panel-3">
                  <Sparkles className="size-4 text-accent" /> Ask AI: <span className="truncate text-text-2">“{q}”</span>
                  <span className="ml-auto text-[10px] text-muted">Enter</span>
                </Command.Item>
              )}
              {shownHits.length > 0 && (
                <Command.Group heading="Records" className="mt-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted">
                  {shownHits.map((h) => (
                    <Command.Item key={h.type + h.id + h.title} value={h.type + h.id + h.title} onSelect={() => go(h.href)} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 data-[selected=true]:bg-panel-3">
                      <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">{h.type}</span>
                      <span className="num truncate text-text">{h.title}</span>
                      <span className="ml-auto truncate text-xs text-muted">{h.subtitle}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {q.trim().length < 2 && !answer && (
                <Command.Group heading="Try asking" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted">
                  {SUGGESTIONS.map((s) => (
                    <Command.Item key={s} value={s} onSelect={() => ask(s)} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-text-2 data-[selected=true]:bg-panel-3 data-[selected=true]:text-text">
                      <Search className="size-3.5 text-muted" /> {s}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
            <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted">
              <span>Answers use live database tools and link to records. AI never places orders from here without approval.</span>
              <span className="num">esc</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
