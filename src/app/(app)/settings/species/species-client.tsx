"use client";
import { useState, useTransition } from "react";
import { Plus, Search, X } from "lucide-react";
import { useAction } from "@/components/app/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addAliasAction, removeAliasAction } from "@/app/actions";
import { testSpeciesMatchAction } from "@/app/actions/species";
import type { SpeciesMatchResult } from "@/lib/domain/species-match";

export function AddAlias({ speciesId, name }: { speciesId: string; name: string }) {
  const [alias, setAlias] = useState("");
  const { pending, exec } = useAction();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        exec(() => addAliasAction(speciesId, alias.trim()), { onOk: () => setAlias("") });
      }}
    >
      <Input aria-label={`New alias for ${name}`} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g. ikan tenggiri, 马鲛" maxLength={60} className="h-8 max-w-xs text-xs" />
      <Button type="submit" size="sm" variant="secondary" disabled={pending || alias.trim().length < 2}><Plus /> Add alias</Button>
    </form>
  );
}

export function RemoveAlias({ id, alias }: { id: string; alias: string }) {
  const { pending, exec } = useAction();
  return (
    <button
      type="button"
      aria-label={`Remove alias ${alias}`}
      disabled={pending}
      onClick={() => { if (window.confirm(`Remove alias “${alias}”? Supplier messages using it will need confirmation again.`)) exec(() => removeAliasAction(id)); }}
      className="rounded p-1 text-muted hover:bg-short-soft hover:text-short disabled:opacity-40"
    >
      <X className="size-3.5" />
    </button>
  );
}

export function MatcherBox() {
  const [text, setText] = useState("");
  const [res, setRes] = useState<(SpeciesMatchResult & { threshold: number }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (t: string) =>
    start(async () => {
      const r = await testSpeciesMatchAction(t);
      if (r.ok && r.data) { setRes(r.data); setErr(null); } else { setRes(null); setErr(r.ok ? "No result" : r.error); }
    });
  const pct = (c: number) => `${Math.round(c * 100)}%`;
  return (
    <div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) run(text); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a supplier name — batang, 马鲛鱼, ang go li, prawns…" maxLength={80} className="pl-9" data-testid="matcher-input" />
        </div>
        <Button type="submit" variant="primary" disabled={pending || !text.trim()}>{pending ? "Matching…" : "Test"}</Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {["batang", "马鲛鱼", "ang go li", "prawns", "sotong", "kurau"].map((s) => (
          <button key={s} type="button" onClick={() => { setText(s); run(s); }} className="rounded border border-border px-2 py-0.5 text-[11px] text-text-2 hover:border-accent hover:text-accent">{s}</button>
        ))}
      </div>
      {err && <p className="mt-3 text-xs text-short">{err}</p>}
      {res && (
        <div className="mt-3 rounded-lg border border-border bg-panel-2 p-3" data-testid="matcher-result">
          {res.best ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-text">{res.best.canonicalName}</span>
                <span className="num text-xs text-muted">{res.best.code}</span>
                <Badge tone={res.best.confidence >= res.threshold ? "ok" : res.best.confidence >= 0.7 ? "surplus" : "short"} mono>{pct(res.best.confidence)}</Badge>
                {res.needsConfirmation ? <Badge tone="surplus">Needs human confirmation</Badge> : <Badge tone="ok">Auto-applies</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted">Matched on “{res.best.matchedOn}” ({res.best.method.toLowerCase().replace("_", " ")}). Matches at or above {pct(res.threshold)} are applied automatically; lower or ambiguous matches are sent for confirmation.</p>
            </>
          ) : (
            <p className="text-sm text-text-2">No species matched “{res.input}”. An intake with this name would be held for a human to map.</p>
          )}
          {res.alternatives.length > 0 && (
            <div className="mt-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Alternatives</div>
              <ul className="mt-1 space-y-0.5">
                {res.alternatives.map((a) => (
                  <li key={a.speciesId} className="flex items-center gap-2 text-xs text-text-2">
                    <span className="num w-10 text-right text-muted">{pct(a.confidence)}</span>
                    <span>{a.canonicalName}</span>
                    <span className="text-muted">via “{a.matchedOn}”</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
