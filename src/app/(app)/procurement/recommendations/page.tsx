import Link from "next/link";
import { Settings2, Sparkles } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getMarket } from "@/lib/services/market";
import { openOffers } from "@/lib/services/procurement";
import { pendingApprovals } from "@/lib/services/queries";
import { toApprovalView } from "@/lib/services/views";
import { recommendPurchases, scoreOffers, type ProcurementWeights } from "@/lib/domain/procurement";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AiMark, Empty, PageHeader, Stat } from "@/components/ui/misc";
import { ApprovalCard } from "@/components/app/approval-card";
import { ActionButton } from "@/components/app/action-button";
import { LiveRefresh } from "@/components/app/live-refresh";
import { runProcurementAction } from "@/app/actions";
import { kg, kgNum, perKg, sgd, date } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Procurement Recommendations" };

const FACTORS: { key: keyof ProcurementWeights; label: string }[] = [
  { key: "price", label: "Price" },
  { key: "reliability", label: "Reliability" },
  { key: "quality", label: "Quality" },
  { key: "freshness", label: "Freshness" },
  { key: "eta", label: "ETA" },
  { key: "relationship", label: "Relationship" },
];

function ScoreParts({ parts, weights }: { parts: Record<keyof ProcurementWeights, number>; weights: ProcurementWeights }) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 sm:grid-cols-6">
      {FACTORS.map((f) => (
        <div key={f.key} title={`${f.label}: ${(parts[f.key] * 100).toFixed(0)}/100 × weight ${Math.round(weights[f.key] * 100)}%`}>
          <div className="flex justify-between text-[10px] text-muted"><span>{f.label}</span><span className="num">{Math.round(parts[f.key] * 100)}</span></div>
          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-panel-3">
            <div className={cn("h-full rounded-full", parts[f.key] >= 0.75 ? "bg-ok" : parts[f.key] >= 0.4 ? "bg-accent" : "bg-short")} style={{ width: `${Math.max(2, parts[f.key] * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function RecommendationsPage() {
  const app = await requireApp("procurement.view");
  const weights = app.org.settings.procurementWeights;
  const cutoff = app.org.settings.dispatchCutoff;
  const [market, approvals] = await Promise.all([getMarket(app.org.id, app.marketDate), pendingApprovals(app.org.id, 100)]);
  const poApprovals = approvals.filter((a) => a.a.kind === "CREATE_PURCHASE_ORDER");
  const shortages = market.filter((r) => r.balance === "SHORTAGE").sort((a, b) => a.gapKg - b.gapKg);

  const analyses = await Promise.all(
    shortages.map(async (row) => {
      const need = -row.gapKg;
      const offers = await openOffers(db, app.org.id, app.marketDate, row.speciesId, cutoff);
      const scored = scoreOffers(offers, weights);
      const rec = recommendPurchases(need, offers, weights);
      const buyBy = new Map(rec.lines.map((l) => [l.offerId, l]));
      return { row, need, scored, rec, buyBy };
    }),
  );

  const balanced = market.filter((r) => r.balance === "BALANCED").length;
  const surplus = market.filter((r) => r.balance === "SURPLUS").length;
  const shortKg = shortages.reduce((a, r) => a - r.gapKg, 0);
  const maxKg = Math.max(1, ...market.map((r) => Math.max(r.supplyKg + r.offeredKg, r.demandKg)));
  const wSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

  return (
    <div>
      <LiveRefresh seconds={30} />
      <PageHeader
        eyebrow={<span className="flex items-center gap-2"><AiMark /> Procurement Agent · {date(app.marketDate)}</span>}
        title="Procurement Recommendations"
        subtitle="Where committed supply falls short of confirmed demand, the agent scores every open supplier offer against your weights and proposes purchases. Nothing is bought until someone approves it."
        actions={app.can("procurement.write") ? <ActionButton variant="primary" action={runProcurementAction} data-testid="run-procurement"><Sparkles /> Run procurement agent</ActionButton> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Short species" value={shortages.length} sub={shortages.length ? `${kgNum(shortKg, 0)} kg short in total` : "supply covers demand"} tone={shortages.length ? "short" : "ok"} />
        <Stat label="Balanced" value={balanced} sub="within ±5% / 3 kg" tone="ok" />
        <Stat label="Surplus" value={surplus} sub="more supply than orders" tone={surplus ? "surplus" : undefined} />
        <Stat label="Awaiting approval" value={poApprovals.length} sub="purchase recommendations" tone={poApprovals.length ? "ai" : undefined} href="/ai/approvals" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Supply vs demand" subtitle="Committed supply (bar), offered but not bought (dashed) vs confirmed demand (marker)." action={<Link href="/market" className="text-xs text-accent">Market →</Link>} />
            <CardBody className="space-y-1.5">
              {market.length === 0 && <Empty title="No supply or demand recorded tonight" />}
              {[...market].sort((a, b) => a.gapKg - b.gapKg).map((r) => {
                const s = (r.supplyKg / maxKg) * 100;
                const o = (r.offeredKg / maxKg) * 100;
                const d = (r.demandKg / maxKg) * 100;
                return (
                  <Link key={r.speciesId} href={`/market/${r.speciesId}`} className="grid grid-cols-[110px_1fr_92px] items-center gap-3 rounded-md px-1 py-0.5 hover:bg-panel-2 sm:grid-cols-[160px_1fr_110px]">
                    <span className="truncate text-xs text-text">{r.name}</span>
                    <div className="relative h-3 rounded bg-panel-3">
                      <div className={cn("absolute inset-y-0 left-0 rounded opacity-80", r.balance === "SHORTAGE" ? "bg-short" : r.balance === "SURPLUS" ? "bg-surplus" : "bg-ok")} style={{ width: `${s}%` }} />
                      {o > 0 && <div className="absolute inset-y-0 rounded border border-dashed border-text-2/50" style={{ left: `${s}%`, width: `${Math.min(o, 100 - s)}%` }} />}
                      <div className="absolute -inset-y-1 w-0.5 bg-text" style={{ left: `${d}%` }} />
                    </div>
                    <span className={cn("num text-right text-[11px] font-semibold", r.balance === "SHORTAGE" ? "text-short" : r.balance === "SURPLUS" ? "text-surplus" : "text-ok")}>{r.statusLabel}</span>
                  </Link>
                );
              })}
            </CardBody>
          </Card>

          <h2 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Shortages · open offers scored</h2>
          {analyses.length === 0 && <Empty title="No shortages tonight">Committed supply covers confirmed demand for every species.</Empty>}
          {analyses.map(({ row, need, scored, rec, buyBy }) => (
            <Card key={row.speciesId} data-testid="shortage-card">
              <CardHeader
                title={<span className="flex flex-wrap items-center gap-2">{row.name}<Badge tone="short" className="num">short {kgNum(need, 0)} kg</Badge>{row.flags.map((f) => <Badge key={f} tone={f === "LATE SUPPLY" ? "late" : "spike"}>{f}</Badge>)}</span>}
                subtitle={`Demand ${kg(row.demandKg)} · committed ${kg(row.supplyKg)} · offered ${kg(row.offeredKg)}${row.avg30Cost ? ` · 30-day avg cost ${perKg(row.avg30Cost)}` : ""}`}
                action={<Link href={`/procurement/rfqs?species=${row.speciesId}&qty=${Math.ceil(rec.residualShortfallKg || need)}`} className="text-xs text-accent">Send RFQ →</Link>}
              />
              <CardBody className="space-y-2.5">
                {scored.length === 0 ? (
                  <p className="text-xs text-muted">No open supplier offers for this species. Send an RFQ to preferred suppliers or offer buyers a substitute in <Link href={`/procurement/allocations?species=${row.speciesId}`} className="text-accent">Allocations</Link>.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-panel-2 px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5 text-text"><AiMark />Suggested buy <span className="num font-semibold">{kg(rec.totalBuyKg)}</span></span>
                      <span className="text-muted">cost <span className="num text-text">{sgd(rec.totalCost)}</span></span>
                      <span className="text-muted">avg <span className="num text-text">{perKg(rec.weightedAvgPrice)}</span></span>
                      {rec.residualShortfallKg > 0 && <span className="text-short">still short <span className="num">{kgNum(rec.residualShortfallKg)} kg</span> after these offers</span>}
                    </div>
                    {scored.map((o, i) => {
                      const pick = buyBy.get(o.offerId);
                      const late = o.etaSlackMinutes !== null && o.etaSlackMinutes < 0;
                      return (
                        <div key={o.offerId} className={cn("rounded-lg border p-3", pick ? "border-accent/50 bg-accent-soft/40" : "border-border", late && "opacity-60")}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="num w-5 text-xs text-muted">#{i + 1}</span>
                            <Link href={`/vendors/${o.vendorId}`} className="text-sm font-medium text-text hover:text-accent">{o.vendorName}</Link>
                            <Badge tone={o.source === "LOT" ? "info" : "neutral"}>{o.source === "LOT" ? "Declared lot" : "Quote"}</Badge>
                            {o.relationshipTier !== "STANDARD" && <Badge tone={o.relationshipTier === "PREFERRED" ? "ok" : "late"}>{o.relationshipTier}</Badge>}
                            {late && <Badge tone="late">After {cutoff} cut-off</Badge>}
                            {pick && <Badge tone="ai">Buy {kgNum(pick.buyKg)} kg</Badge>}
                            <span className="ml-auto flex items-baseline gap-3">
                              <span className="num text-xs text-muted">{kgNum(o.availableKg)} kg @ <span className="text-text">{perKg(o.pricePerKg)}</span></span>
                              <span className="num text-lg font-semibold text-text">{Math.round(o.score * 100)}<span className="text-[10px] text-muted">/100</span></span>
                            </span>
                          </div>
                          <div className="mt-2.5"><ScoreParts parts={o.parts} weights={weights} /></div>
                          {pick && <p className="mt-2 text-[11px] text-muted">{pick.reason}</p>}
                        </div>
                      );
                    })}
                  </>
                )}
              </CardBody>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title={<span className="flex items-center gap-2"><Settings2 className="size-4 text-muted" /> Scoring weights</span>}
              subtitle="Set by the procurement manager. Each offer's score is the weighted sum of its factor scores."
              action={app.can("settings.manage") ? <Link href="/settings" className="text-xs text-accent">Edit →</Link> : undefined}
            />
            <CardBody className="space-y-2">
              {FACTORS.map((f) => (
                <div key={f.key} className="grid grid-cols-[96px_1fr_40px] items-center gap-2">
                  <span className="text-xs text-text-2">{f.label}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-panel-3"><div className="h-full rounded-full bg-accent" style={{ width: `${(weights[f.key] / wSum) * 100}%` }} /></div>
                  <span className="num text-right text-xs text-text">{Math.round((weights[f.key] / wSum) * 100)}%</span>
                </div>
              ))}
              <p className="pt-1 text-[11px] text-muted">Offers arriving after the {cutoff} dispatch cut-off are never recommended. Estimated supply is discounted by the vendor&apos;s historical fill rate.</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /> Purchase approvals</span>} subtitle="Agent proposals waiting for a human decision" action={<Link href="/ai/approvals" className="text-xs text-accent">Inbox →</Link>} />
            <CardBody className="space-y-3">
              {poApprovals.length === 0 && <p className="text-xs text-muted">No purchase recommendations waiting. Run the procurement agent after new offers arrive.</p>}
              {poApprovals.map((a) => (app.can("approvals.decide") ? <ApprovalCard key={a.a.id} a={toApprovalView(a)} /> : (
                <div key={a.a.id} className="rounded-lg border border-border p-3">
                  <div className="text-sm font-medium text-text">{a.a.title}</div>
                  <pre className="num mt-1 whitespace-pre-wrap text-xs text-muted">{a.a.summary}</pre>
                </div>
              )))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
