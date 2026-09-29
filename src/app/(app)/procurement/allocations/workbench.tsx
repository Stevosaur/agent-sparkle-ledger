"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Check, Sparkles, UserCheck } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AiMark, Bar } from "@/components/ui/misc";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ActionButton, useAction } from "@/components/app/action-button";
import { commitAllocationAction, confirmSubstitutionAction, previewAllocationAction, runAllocationAgentAction } from "@/app/actions";
import type { AllocationPolicy, AllocationResult, SubstituteSuggestion } from "@/lib/domain/allocation";
import { kgNum } from "@/lib/format";
import { cn } from "@/lib/utils";

type Preview = { result: AllocationResult; substitutes: SubstituteSuggestion[] };

export function AllocationWorkbench({
  speciesId, speciesName, defaultPolicy, policies, canWrite, canConfirmSubstitute,
}: { speciesId: string; speciesName: string; defaultPolicy: AllocationPolicy; policies: { key: AllocationPolicy; label: string }[]; canWrite: boolean; canConfirmSubstitute: boolean }) {
  const [policy, setPolicy] = useState<AllocationPolicy>(defaultPolicy);
  const [order, setOrder] = useState<string[]>([]);
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [loading, start] = useTransition();
  const commit = useAction();
  const seq = useRef(0);

  const ranks = useMemo(() => (policy === "MANUAL_RANK" && order.length ? Object.fromEntries(order.map((id, i) => [id, i + 1])) : undefined), [policy, order]);

  const load = useCallback(() => {
    const my = ++seq.current;
    start(async () => {
      const r = await previewAllocationAction(speciesId, policy, ranks);
      if (my !== seq.current) return; // a newer preview superseded this one
      if (r.ok && r.data) {
        const d = r.data as Preview;
        setData(d);
        setError(null);
        setOrder((o) => (o.length && d.result.lines.every((l) => o.includes(l.lineId)) ? o : d.result.lines.map((l) => l.lineId)));
      } else if (!r.ok) setError(r.error);
    });
  }, [speciesId, policy, ranks]);

  useEffect(() => { load(); }, [load, nonce]);

  const res = data?.result;
  const lines = useMemo(() => {
    if (!res) return [];
    if (policy !== "MANUAL_RANK") return res.lines;
    const idx = new Map(order.map((id, i) => [id, i]));
    return [...res.lines].sort((a, b) => (idx.get(a.lineId) ?? 999) - (idx.get(b.lineId) ?? 999));
  }, [res, policy, order]);

  const move = (lineId: string, dir: -1 | 1) =>
    setOrder((o) => {
      const i = o.indexOf(lineId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const n = [...o];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const plan = res?.lines.filter((l) => l.fromLots.length > 0).map((l) => ({ lineId: l.lineId, fromLots: l.fromLots.map((f) => ({ lotId: f.lotId, kg: f.kg })) })) ?? [];
  const cover = res && res.totalDemandKg > 0 ? Math.min(100, (res.totalAllocatedKg / res.totalDemandKg) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2">Live preview · {speciesName}{loading && <span className="live-dot text-[11px] font-normal text-muted">recalculating…</span>}</span>}
          subtitle="Choose a policy to see how tonight's landed stock would be shared. Nothing is committed until you confirm."
          action={canWrite ? <ActionButton size="sm" variant="secondary" action={() => runAllocationAgentAction(speciesId)} data-testid="ask-allocation-agent"><Sparkles /> Ask Allocation Agent</ActionButton> : undefined}
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Allocation policy">
            {policies.map((p) => (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={policy === p.key}
                onClick={() => setPolicy(p.key)}
                className={cn("min-h-9 rounded-md border px-3 text-xs font-medium", policy === p.key ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2")}
                data-testid={`policy-${p.key}`}
              >
                {p.label}{p.key === defaultPolicy && <span className="ml-1 text-[10px] text-muted">default</span>}
              </button>
            ))}
          </div>

          {error && <p className="rounded-md border border-short/30 bg-short-soft px-3 py-2 text-xs text-short">{error}</p>}

          {res && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ["Supply", res.totalSupplyKg, "text-text"],
                  ["Open demand", res.totalDemandKg, "text-text"],
                  ["Allocated", res.totalAllocatedKg, "text-ok"],
                  ["Shortfall", res.totalShortfallKg, res.totalShortfallKg > 0 ? "text-short" : "text-muted"],
                  ["Left over", res.unallocatedSupplyKg, res.unallocatedSupplyKg > 0 ? "text-surplus" : "text-muted"],
                ].map(([label, v, c]) => (
                  <div key={label as string} className="rounded-lg bg-panel-2 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
                    <div className={cn("num text-lg font-semibold", c as string)}>{kgNum(v)}<span className="ml-0.5 text-[11px] text-muted">kg</span></div>
                  </div>
                ))}
              </div>
              <div>
                <Bar value={cover} max={100} tone={cover >= 99.9 ? "ok" : "accent"} className="h-2" />
                <p className="mt-2 text-xs leading-relaxed text-text-2">{res.explanation}</p>
              </div>
            </>
          )}
        </CardBody>

        {res && lines.length === 0 && <p className="border-t border-border px-4 py-6 text-center text-xs text-muted">No open demand for {speciesName.toLowerCase()} — every order line is already fully allocated.</p>}
        {res && lines.length > 0 && (
          <Table className="min-w-[720px]" data-testid="allocation-preview">
            <THead>
              <tr>
                {policy === "MANUAL_RANK" && <TH className="w-20">Rank</TH>}
                <TH>Buyer</TH>
                <TH align="right">Requested</TH>
                <TH align="right">Allocated</TH>
                <TH align="right">Shortfall</TH>
                <TH>From lots</TH>
              </tr>
            </THead>
            <tbody>
              {lines.map((l, i) => (
                <TR key={l.lineId}>
                  {policy === "MANUAL_RANK" && (
                    <TD>
                      <div className="flex items-center gap-0.5">
                        <span className="num w-5 text-xs text-muted">{i + 1}</span>
                        <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${l.customerName} up`} disabled={i === 0 || loading} onClick={() => move(l.lineId, -1)}><ArrowUp /></Button>
                        <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${l.customerName} down`} disabled={i === lines.length - 1 || loading} onClick={() => move(l.lineId, 1)}><ArrowDown /></Button>
                      </div>
                    </TD>
                  )}
                  <TD className="font-medium text-text">{l.customerName}</TD>
                  <TD num className="text-text-2">{kgNum(l.requestedKg)}</TD>
                  <TD num>
                    <div className="font-semibold text-text">{kgNum(l.allocatedKg)}</div>
                    <Bar value={l.allocatedKg} max={l.requestedKg} tone={l.shortfallKg <= 0 ? "ok" : l.allocatedKg > 0 ? "surplus" : "short"} className="ml-auto mt-1 w-20" />
                  </TD>
                  <TD num className={l.shortfallKg > 0 ? "font-semibold text-short" : "text-muted"}>{l.shortfallKg > 0 ? `−${kgNum(l.shortfallKg)}` : "—"}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {l.fromLots.length === 0 && <span className="text-xs text-muted">—</span>}
                      {l.fromLots.map((f) => (
                        <Link key={f.lotId} href={`/supply/lots/${f.lotId}`} className="num rounded border border-border px-1.5 py-0.5 text-[11px] text-text-2 hover:border-accent hover:text-accent">
                          {(f.lotNumber ?? "lot").replace(/^LOT-/, "")} · {kgNum(f.kg)}
                        </Link>
                      ))}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}

        {res && canWrite && (
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-muted">Confirming reserves stock from the lots shown (oldest first) and notifies each buyer. Availability is re-checked under lock.</p>
            <Button
              variant="primary"
              size="lg"
              data-testid="confirm-allocation"
              disabled={commit.pending || loading || plan.length === 0}
              onClick={() => {
                if (!window.confirm(`Confirm ${kgNum(res.totalAllocatedKg)} kg of ${speciesName.toLowerCase()} across ${plan.length} buyer(s)? Buyers will be notified.`)) return;
                commit.exec(() => commitAllocationAction(speciesId, policy, plan), { onOk: () => setNonce((n) => n + 1) });
              }}
            >
              <Check /> {commit.pending ? "Confirming…" : "Confirm allocation"}
            </Button>
          </div>
        )}
      </Card>

      {data && data.substitutes.length > 0 && (
        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><AiMark /> Suggested substitutes</span>}
            subtitle="For buyers left short, similar species with free stock tonight. Only add a substitute after the buyer has agreed to it."
          />
          <CardBody className="space-y-2">
            {data.substitutes.map((s) => <SubstituteRow key={`${s.lineId}-${s.speciesId}`} s={s} canConfirm={canConfirmSubstitute} onDone={() => setNonce((n) => n + 1)} />)}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function SubstituteRow({ s, canConfirm, onDone }: { s: SubstituteSuggestion; canConfirm: boolean; onDone: () => void }) {
  const [kgValue, setKgValue] = useState(String(s.suggestMinKg));
  const [agreed, setAgreed] = useState(false);
  const { pending, exec } = useAction();
  const n = Number(kgValue);
  const inRange = n >= s.suggestMinKg && n <= s.suggestMaxKg;
  return (
    <div className="grid gap-3 rounded-lg border border-border p-3 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="min-w-0">
        <div className="text-sm text-text">
          <span className="font-medium">{s.customerName}</span> is short <span className="num font-semibold text-short">{kgNum(s.shortfallKg)} kg</span> → offer <span className="font-medium text-accent">{s.speciesName}</span>
        </div>
        <div className="num mt-0.5 text-[11px] text-muted">Suggested {s.suggestMinKg}–{s.suggestMaxKg} kg</div>
      </div>
      {canConfirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Substitute kg" className="num w-24" type="number" inputMode="decimal" step="0.1" min={s.suggestMinKg} max={s.suggestMaxKg} value={kgValue} onChange={(e) => setKgValue(e.target.value)} />
          <label className="flex min-h-9 items-center gap-2 rounded-md border border-border px-2.5 text-xs text-text-2">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} data-testid="substitute-buyer-agreed" />
            Buyer has agreed
          </label>
          <Button
            variant="secondary"
            disabled={!agreed || !inRange || pending}
            title={!agreed ? "Tick once the buyer has confirmed" : !inRange ? `Enter ${s.suggestMinKg}–${s.suggestMaxKg} kg` : undefined}
            onClick={() => exec(() => confirmSubstitutionAction(s.lineId, s.speciesId, n), { onOk: () => { setAgreed(false); onDone(); } })}
            data-testid="confirm-substitute"
          >
            <UserCheck /> {pending ? "Adding…" : "Confirm substitute"}
          </Button>
        </div>
      ) : (
        <Badge tone="info">Needs buyer confirmation</Badge>
      )}
    </div>
  );
}
