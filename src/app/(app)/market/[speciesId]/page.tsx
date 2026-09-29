import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { species } from "@/lib/db/schema";
import { getMarket } from "@/lib/services/market";
import { actionsForSpecies, allocationsForSpecies, demandLinesForSpecies, lotsForNight, pendingApprovals, priceHistory, quotesForSpecies } from "@/lib/services/queries";
import { toApprovalView } from "@/lib/services/views";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Empty, PageHeader, Stat, AiMark } from "@/components/ui/misc";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ApprovalCard } from "@/components/app/approval-card";
import { ActionButton } from "@/components/app/action-button";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PriceChart } from "@/components/market/price-chart";
import { runAllocationAgentAction, runProcurementAction } from "@/app/actions";
import { kg, kgNum, perKg, time } from "@/lib/format";
import { pctVsAverage } from "@/lib/domain/pricing";
import { addDays } from "@/lib/domain/time";

export default async function SpeciesMarket({ params }: { params: Promise<{ speciesId: string }> }) {
  const app = await requireApp("market.view");
  const { speciesId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(speciesId)) notFound();
  const [sp] = await db.select().from(species).where(and(eq(species.id, speciesId), eq(species.orgId, app.org.id)));
  if (!sp) notFound();
  const [rows, lots, demand, allocs, quotes, prices, approvals, actions] = await Promise.all([
    getMarket(app.org.id, app.marketDate),
    lotsForNight(app.org.id, app.marketDate, { speciesId, includeChildren: true }),
    demandLinesForSpecies(app.org.id, app.marketDate, speciesId),
    allocationsForSpecies(app.org.id, app.marketDate, speciesId),
    quotesForSpecies(app.org.id, app.marketDate, speciesId),
    priceHistory(app.org.id, speciesId, app.marketDate, 90),
    pendingApprovals(app.org.id, 100),
    actionsForSpecies(app.org.id, speciesId, new Date(new Date(`${addDays(app.marketDate, -1)}T00:00:00Z`))),
  ]);
  const row = rows.find((r) => r.speciesId === speciesId);
  const mine = approvals.filter((a) => (a.a.payload as { speciesId?: string }).speciesId === speciesId);
  const tonightBuy = row?.wavgCost ?? null;
  const vs30 = tonightBuy ? pctVsAverage(tonightBuy, prices.s30.weightedAvg) : null;

  return (
    <div>
      <LiveRefresh seconds={20} />
      <PageHeader
        eyebrow={<Link href="/market" className="hover:underline">Tonight&apos;s Market</Link>}
        title={sp.canonicalName}
        subtitle={[sp.localNames.join(", "), sp.chineseName, sp.malayName, sp.scientificName].filter(Boolean).join(" · ")}
        actions={
          <>
            {row && <Badge tone={row.balance === "SHORTAGE" ? "short" : row.balance === "SURPLUS" ? "surplus" : "ok"} className="num text-xs">{row.statusLabel}</Badge>}
            {row?.flags.map((f) => <Badge key={f} tone={f === "LATE SUPPLY" ? "late" : "spike"}>{f}</Badge>)}
            {app.can("procurement.write") && <ActionButton action={runProcurementAction}>Re-run procurement</ActionButton>}
            {app.can("procurement.write") && <ActionButton variant="primary" action={() => runAllocationAgentAction(speciesId)}>Ask allocation agent</ActionButton>}
            <Link href={`/procurement/allocations?species=${speciesId}`} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-text hover:bg-panel-2">Allocation workbench</Link>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Demand" value={kg(row?.demandKg ?? 0, 0)} />
        <Stat label="Committed supply" value={kg(row?.supplyKg ?? 0, 0)} sub={`${kgNum(row?.expectedKg ?? 0, 0)} expected · ${kgNum(row?.landedKg ?? 0, 0)} landed`} />
        <Stat label="Offered (not bought)" value={kg(row?.offeredKg ?? 0, 0)} tone={row?.offeredKg ? "info" : undefined} />
        <Stat label="Gap" value={`${(row?.gapKg ?? 0) > 0 ? "+" : ""}${kgNum(row?.gapKg ?? 0, 0)} kg`} tone={row?.balance === "SHORTAGE" ? "short" : row?.balance === "SURPLUS" ? "surplus" : "ok"} />
        <Stat label="W. avg cost tonight" value={perKg(tonightBuy)} sub={vs30 !== null ? `${vs30 > 0 ? "+" : ""}${vs30}% vs 30-day avg` : "no purchases yet"} tone={vs30 !== null && vs30 >= 10 ? "spike" : undefined} />
        <Stat label="Indicative sell" value={perKg(row?.indicativeSell)} sub={`markup ${Number(sp.indicativeMarkupPct).toFixed(0)}%`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Suppliers & lots" subtitle="Everything declared, bought and received for this species tonight" />
          <CardBody className="p-0">
            <Table>
              <THead><tr><TH>Lot</TH><TH>Vendor</TH><TH>ETA</TH><TH align="right">Declared</TH><TH align="right">Received</TH><TH align="right">Available</TH><TH align="right">Price</TH><TH>Status</TH></tr></THead>
              <tbody>
                {lots.map(({ l, v }) => {
                  const late = l.originalEta && l.expectedArrivalAt && l.expectedArrivalAt.getTime() - l.originalEta.getTime() > 30 * 60000;
                  return (
                    <TR key={l.id}>
                      <TD><Link href={`/supply/lots/${l.id}`} className="num text-accent">{l.lotNumber.slice(-9)}</Link>{l.parentLotId && <span className="ml-1 text-[10px] text-muted">{l.processingState.toLowerCase()}</span>}</TD>
                      <TD className="max-w-40 truncate">{v?.name ?? "—"}</TD>
                      <TD num className={late ? "text-late" : ""}>{time(l.expectedArrivalAt)}</TD>
                      <TD num>{kgNum(l.quantityDeclaredKg)}</TD>
                      <TD num>{l.quantityReceivedKg ? kgNum(l.quantityReceivedKg) : "—"}</TD>
                      <TD num>{kgNum(l.quantityAvailableKg)}</TD>
                      <TD num>{perKg(l.agreedCostPerKg ?? l.askingPricePerKg)}</TD>
                      <TD><div className="flex gap-1">{!l.purchaseOrderLineId && !l.parentLotId ? <Badge tone={l.confirmation === "DRAFT" ? "surplus" : "info"}>{l.confirmation === "DRAFT" ? "Draft" : "Offer"}</Badge> : <StatusBadge status={l.status} />}</div></TD>
                    </TR>
                  );
                })}
                {lots.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-xs text-muted">No supply declared yet.</td></tr>}
              </tbody>
            </Table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /> AI recommendation</span>} subtitle="Latest agent proposals for this species" />
          <CardBody className="space-y-3">
            {mine.map((a) => <ApprovalCard key={a.a.id} a={toApprovalView(a)} />)}
            {mine.length === 0 && actions.length === 0 && <Empty title="No open recommendations">Agents re-evaluate automatically when supply, demand or quotes change.</Empty>}
            {mine.length === 0 && actions.slice(0, 3).map(({ act, run }) => (
              <div key={act.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 text-[11px] text-muted"><AiMark /> {time(act.createdAt)} · <StatusBadge status={act.executionStatus} /></div>
                <div className="mt-1 text-sm font-medium text-text">{act.title}</div>
                <p className="mt-1 text-xs text-muted">{act.explanation}</p>
                <Link href={`/ai/activity?run=${run.id}`} className="mt-1 inline-block text-[11px] text-accent">Agent run →</Link>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Buyers" subtitle="Confirmed demand, allocation and shortfall" />
          <CardBody className="p-0">
            <Table>
              <THead><tr><TH>Customer</TH><TH>Tier</TH><TH>Order</TH><TH align="right">Requested</TH><TH align="right">Allocated</TH><TH align="right">Short</TH><TH align="right">Price</TH></tr></THead>
              <tbody>
                {demand.map(({ l, so, c }) => {
                  const short = Number(l.requestedKg) - Number(l.allocatedKg);
                  return (
                    <TR key={l.id}>
                      <TD className="max-w-48 truncate">{c.name}</TD>
                      <TD><Badge tone={c.priorityTier === 1 ? "accent" : "neutral"}>P{c.priorityTier}</Badge></TD>
                      <TD><Link href={`/orders/${so.id}`} className="num text-accent">{so.soNumber}</Link></TD>
                      <TD num>{kgNum(l.requestedKg)}</TD>
                      <TD num>{kgNum(l.allocatedKg)}</TD>
                      <TD num className={short > 0.05 ? "text-short" : "text-muted"}>{short > 0.05 ? kgNum(short) : "—"}</TD>
                      <TD num>{perKg(l.pricePerKg)}</TD>
                    </TR>
                  );
                })}
                {demand.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-xs text-muted">No buyer demand tonight.</td></tr>}
              </tbody>
            </Table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Quotes & allocations" />
          <CardBody className="space-y-4">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">RFQ quotes</div>
              {quotes.length === 0 ? <p className="text-xs text-muted">No RFQ quotes for this species tonight.</p> : quotes.map(({ q, ql, v }) => (
                <div key={ql.id} className="flex items-center gap-3 border-b border-border/60 py-1.5 text-sm last:border-0"><span className="text-text">{v.name}</span><span className="num text-text-2">{kg(ql.quantityKg)} @ {perKg(ql.pricePerKg)}</span><span className="num text-xs text-muted">ETA {time(q.etaAt)}</span><span className="ml-auto"><StatusBadge status={q.status} /></span></div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Allocations</div>
              {allocs.length === 0 ? <p className="text-xs text-muted">Nothing allocated yet.</p> : allocs.map(({ a, l, c }) => (
                <div key={a.id} className="flex items-center gap-3 border-b border-border/60 py-1.5 text-sm last:border-0"><span className="max-w-48 truncate text-text">{c.name}</span><Link href={`/supply/lots/${l.id}`} className="num text-xs text-accent">{l.lotNumber.slice(-9)}</Link><span className="num ml-auto text-text">{kg(a.quantityKg)}</span><StatusBadge status={a.status} /></div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Price history" subtitle="Calculated only from PasarCatch purchase, sales and asking-price records" />
        <CardBody>
          <div className="mb-3 grid grid-cols-3 gap-3 text-sm">
            {([["7 days", prices.s7], ["30 days", prices.s30], ["90 days", prices.s90]] as const).map(([label, s]) => (
              <div key={label} className="rounded-lg border border-border bg-panel-2 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
                <div className="num mt-1 font-semibold text-text">{perKg(s.weightedAvg)}</div>
                <div className="num text-[11px] text-muted">{s.min ? `S$${s.min.toFixed(2)}–${s.max?.toFixed(2)}` : "no data"}{s.trendPctPerWeek !== null ? ` · ${s.trendPctPerWeek > 0 ? "+" : ""}${s.trendPctPerWeek}%/wk` : ""}</div>
              </div>
            ))}
          </div>
          {prices.points.length > 1 ? <PriceChart points={prices.points} /> : <Empty title="Not enough price history yet" />}
        </CardBody>
      </Card>
    </div>
  );
}
