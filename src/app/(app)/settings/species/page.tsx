import { and, asc, desc, eq } from "drizzle-orm";
import { ChevronRight, Info } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { species, speciesAlias } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { kgNum } from "@/lib/format";
import { AddAlias, MatcherBox, RemoveAlias } from "./species-client";

export const metadata = { title: "Species Master" };

const SOURCE_TONE: Record<string, Tone> = { SEED: "neutral", LEARNED: "ai", ADMIN: "info" };
const LANG: Record<string, string> = { EN: "English", ZH: "Chinese", MS: "Malay", HOKKIEN: "Hokkien", TEOCHEW: "Teochew", CANTONESE: "Cantonese", PINYIN: "Pinyin", OTHER: "Other" };
const size = (a: string | null, b: string | null) => {
  if (!a && !b) return "—";
  const g = (v: string | null) => (v === null ? "?" : Number(v) < 1 ? `${Math.round(Number(v) * 1000)} g` : `${kgNum(v)} kg`);
  return `${g(a)} – ${g(b)}`;
};

export default async function SpeciesPage() {
  const app = await requireApp("supply.view");
  const canEdit = app.can("species.manage");
  const [sps, aliases] = await Promise.all([
    db.select().from(species).where(eq(species.orgId, app.org.id)).orderBy(asc(species.category), asc(species.canonicalName)),
    db.select().from(speciesAlias).where(and(eq(speciesAlias.orgId, app.org.id))).orderBy(desc(speciesAlias.useCount), asc(speciesAlias.alias)),
  ]);
  const byCode = new Map(sps.map((s) => [s.code, s.canonicalName]));

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Species Master"
        subtitle="The canonical species list and every name suppliers use for them — English, Chinese, Malay, dialect and trade names. Catch intake maps messy supplier names to these entries."
      />
      <div className="mb-4 flex gap-3 rounded-xl border border-surplus/30 bg-surplus-soft px-4 py-3 text-xs leading-relaxed text-text-2">
        <Info className="mt-0.5 size-4 shrink-0 text-surplus" />
        <span>This taxonomy is an <span className="font-semibold text-text">operational mapping</span> for trading and traceability inside PasarCatch. It is not legally or scientifically authoritative — for labelling, import permits or SFA declarations, confirm species identity against the official source documents.</span>
      </div>

      <Card className="mb-4">
        <CardHeader title="Test the matcher" subtitle="See how a supplier's wording would be mapped — best match, confidence, alternatives, and whether a human must confirm. Nothing is saved." />
        <CardBody><MatcherBox /></CardBody>
      </Card>

      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>{sps.length} species · {aliases.length} aliases</span>
        {!canEdit && <span>Read-only — editing aliases needs the species.manage permission.</span>}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-panel">
        <div className="hidden grid-cols-[minmax(180px,1.3fr)_minmax(180px,1.4fr)_minmax(120px,1fr)_110px_70px_110px_minmax(120px,1fr)_60px] gap-3 border-b border-border bg-panel-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted xl:grid">
          <span>Species</span><span>Chinese · Malay · local</span><span>Scientific name</span><span>Size range</span><span className="text-right">Yield</span><span>Storage</span><span>Substitutes</span><span className="text-right">Aliases</span>
        </div>
        {sps.map((s) => {
          const al = aliases.filter((a) => a.speciesId === s.id);
          return (
            <details key={s.id} className="group border-b border-border last:border-0" data-testid="species-row">
              <summary className="grid cursor-pointer list-none grid-cols-2 gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-panel-2 xl:grid-cols-[minmax(180px,1.3fr)_minmax(180px,1.4fr)_minmax(120px,1fr)_110px_70px_110px_minmax(120px,1fr)_60px] xl:items-center [&::-webkit-details-marker]:hidden">
                <span className="col-span-2 flex min-w-0 items-center gap-2 xl:col-span-1">
                  <ChevronRight className="size-3.5 shrink-0 text-muted transition-transform group-open:rotate-90" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text">{s.canonicalName}{!s.active && <Badge className="ml-2" tone="neutral">inactive</Badge>}</span>
                    <span className="num text-[10px] text-muted">{s.code} · {s.category.toLowerCase()}</span>
                  </span>
                </span>
                <span className="col-span-2 min-w-0 text-xs text-text-2 xl:col-span-1">
                  {[s.chineseName, s.malayName].filter(Boolean).join(" · ") || "—"}
                  {s.localNames.length > 0 && <span className="block truncate text-[11px] text-muted">{s.localNames.join(", ")}</span>}
                </span>
                <span className="truncate text-xs italic text-text-2">{s.scientificName ?? "—"}</span>
                <span className="num text-xs text-text-2">{size(s.typicalSizeMinKg, s.typicalSizeMaxKg)}</span>
                <span className="num text-xs text-text-2 xl:text-right"><span className="font-sans text-muted xl:hidden">Yield </span>{s.typicalYieldPct ? `${Number(s.typicalYieldPct).toFixed(0)}%` : "—"}</span>
                <span className="text-xs text-text-2">{s.storage.toLowerCase()} · <span className="num">{s.freshnessHours}h</span></span>
                <span className="truncate text-xs text-muted"><span className="xl:hidden">Subs: </span>{s.substituteCodes.map((c) => byCode.get(c) ?? c).join(", ") || "—"}</span>
                <span className="num text-xs text-text-2 xl:text-right">{al.length}<span className="font-sans text-muted xl:hidden"> aliases</span></span>
              </summary>
              <div className="border-t border-border bg-panel-2/50 px-4 py-3 xl:pl-10">
                {s.notes && <p className="mb-2 text-xs text-muted">{s.notes}</p>}
                {al.length === 0 ? <p className="text-xs text-muted">No aliases yet.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-xs">
                      <thead><tr className="text-[10px] uppercase tracking-wide text-muted"><th className="py-1 text-left font-semibold">Alias</th><th className="py-1 text-left font-semibold">Language</th><th className="py-1 text-left font-semibold">Source</th><th className="py-1 text-right font-semibold">Uses</th><th className="py-1 pl-4 text-left font-semibold">Confirmed by</th><th className="w-8" /></tr></thead>
                      <tbody>
                        {al.map((a) => (
                          <tr key={a.id} className="border-t border-border/60">
                            <td className="py-1.5 text-text">{a.alias}</td>
                            <td className="py-1.5 text-text-2">{LANG[a.language] ?? a.language}</td>
                            <td className="py-1.5"><Badge tone={SOURCE_TONE[a.source] ?? "neutral"}>{a.source}</Badge></td>
                            <td className="num py-1.5 text-right text-text-2">{a.useCount}</td>
                            <td className="py-1.5 pl-4 text-muted">{a.confirmedBy ?? "—"}</td>
                            <td className="py-1.5 text-right">{canEdit && <RemoveAlias id={a.id} alias={a.alias} />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {canEdit && <div className="mt-3"><AddAlias speciesId={s.id} name={s.canonicalName} /></div>}
              </div>
            </details>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted">SEED = shipped with PasarCatch · LEARNED = confirmed by a user during catch intake · ADMIN = added here. Adding an alias that already exists re-maps it to this species.</p>
    </div>
  );
}
