import Link from "next/link";
import { requireApp } from "@/lib/auth/session";
import { customerOptions, ordersWithLines, speciesOptions } from "@/lib/services/queries-procurement";
import { getMarket } from "@/lib/services/market";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Bar, Empty, PageHeader, Stat } from "@/components/ui/misc";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { LiveRefresh } from "@/components/app/live-refresh";
import { kg, kgNum, perKg, sgd, time, date, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NewOrderDialog } from "./new-order-dialog";
import { SOURCE_LABEL, SOURCE_TONE, lineFillStatus } from "../../orders/labels";

export const metadata = { title: "Buyer Requirements" };

export default async function RequirementsPage({ searchParams }: { searchParams: Promise<{ species?: string }> }) {
  const app = await requireApp("demand.view");
  const { species: speciesFilter } = await searchParams;
  const buyerOnly = app.role === "BUYER" ? app.membership.customerId ?? "00000000-0000-0000-0000-000000000000" : null;
  const canCreate = app.can("orders.write") && !buyerOnly;

  const [orders, customers, sps, market] = await Promise.all([
    ordersWithLines(app.org.id, app.marketDate, { customerId: buyerOnly }),
    canCreate ? customerOptions(app.org.id) : Promise.resolve([]),
    canCreate ? speciesOptions(app.org.id) : Promise.resolve([]),
    canCreate ? getMarket(app.org.id, app.marketDate) : Promise.resolve([]),
  ]);
  const live = orders.filter((o) => o.so.status !== "CANCELLED");

  // Species roll-up across all live orders (unfiltered so the chips always show the full picture)
  const totals = new Map<string, { id: string; name: string; local: string | null; requested: number; allocated: number; buyers: Set<string>; value: number }>();
  for (const o of live)
    for (const { l, sp } of o.lines) {
      const t = totals.get(sp.id) ?? { id: sp.id, name: sp.canonicalName, local: sp.localNames[0] ?? null, requested: 0, allocated: 0, buyers: new Set<string>(), value: 0 };
      t.requested += Number(l.requestedKg);
      t.allocated += Number(l.allocatedKg);
      t.value += Number(l.requestedKg) * Number(l.pricePerKg);
      t.buyers.add(o.c.id);
      totals.set(sp.id, t);
    }
  const speciesRows = [...totals.values()].sort((a, b) => b.requested - a.requested);
  const maxReq = Math.max(1, ...speciesRows.map((s) => s.requested));
  const activeSpecies = speciesFilter && totals.has(speciesFilter) ? totals.get(speciesFilter)! : null;

  const shown = orders
    .map((o) => ({ ...o, lines: activeSpecies ? o.lines.filter((x) => x.sp.id === activeSpecies.id) : o.lines }))
    .filter((o) => o.lines.length > 0);

  const reqKg = speciesRows.reduce((a, s) => a + s.requested, 0);
  const allocKg = speciesRows.reduce((a, s) => a + s.allocated, 0);
  const value = speciesRows.reduce((a, s) => a + s.value, 0);
  const buyers = new Set(live.map((o) => o.c.id)).size;
  const sellBy = new Map(market.map((m) => [m.speciesId, m.indicativeSell]));

  return (
    <div>
      <LiveRefresh seconds={30} />
      <PageHeader
        eyebrow={`Demand · ${date(app.marketDate)}`}
        title="Buyer Requirements"
        subtitle={buyerOnly ? "Your confirmed orders for tonight's market." : "Every confirmed buyer order for tonight's market, by customer and species. Allocation fills these from landed stock."}
        actions={
          canCreate ? (
            <NewOrderDialog
              marketDateLabel={date(app.marketDate)}
              customers={customers.map((c) => ({ id: c.id, code: c.code, name: c.name, priorityTier: c.priorityTier }))}
              species={sps.map((s) => ({ id: s.id, code: s.code, name: s.name, localName: s.localNames[0] ?? null, indicativeSell: sellBy.get(s.id) ?? null }))}
            />
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Buyers ordering" value={buyers} sub={`${live.length} order${live.length === 1 ? "" : "s"}`} />
        <Stat label="Requested" value={kg(reqKg, 0)} sub={`${speciesRows.length} species`} />
        <Stat label="Allocated" value={kg(allocKg, 0)} sub={reqKg ? `${pct((allocKg / reqKg) * 100)} filled` : "nothing requested"} tone={reqKg && allocKg + 0.05 >= reqKg ? "ok" : allocKg > 0 ? "surplus" : undefined} />
        <Stat label="Order value" value={sgd(value)} sub="before GST, at order prices" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="order-2 space-y-3 xl:order-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href="/demand/requirements" className={cn("rounded-md border px-2.5 py-1 text-xs", !activeSpecies ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2")}>
              All species <span className="num ml-1 text-muted">{speciesRows.length}</span>
            </Link>
            {speciesRows.map((s) => (
              <Link key={s.id} href={`/demand/requirements?species=${s.id}`} className={cn("rounded-md border px-2.5 py-1 text-xs", activeSpecies?.id === s.id ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2")}>
                {s.name} <span className="num ml-1 text-muted">{kgNum(s.requested, 0)}</span>
              </Link>
            ))}
          </div>

          {shown.length === 0 && (
            <Empty title={activeSpecies ? `No orders for ${activeSpecies.name} tonight` : "No buyer orders for tonight yet"}>
              {canCreate ? "Standing orders are generated at market open; WhatsApp and phone orders appear here as they are confirmed." : undefined}
            </Empty>
          )}

          {shown.map((o) => {
            const req = o.lines.reduce((a, x) => a + Number(x.l.requestedKg), 0);
            const alloc = o.lines.reduce((a, x) => a + Number(x.l.allocatedKg), 0);
            const cancelled = o.so.status === "CANCELLED";
            return (
              <Card key={o.so.id} className={cn(cancelled && "opacity-60")} data-testid="requirement-order">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-text">{o.c.name}</span>
                      {o.c.priorityTier === 1 && <Badge tone="spike">Priority</Badge>}
                      <Badge tone={SOURCE_TONE[o.so.source] ?? "neutral"}>{SOURCE_LABEL[o.so.source] ?? o.so.source}</Badge>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      <Link href={`/orders/${o.so.id}`} className="num text-accent hover:underline">{o.so.soNumber}</Link>
                      {" · "}confirmed {time(o.so.confirmedAt)}
                      {o.c.deliveryWindowStart && ` · deliver ${o.c.deliveryWindowStart}–${o.c.deliveryWindowEnd ?? ""}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="num text-sm font-semibold text-text">{kgNum(alloc)} / {kgNum(req)} kg</div>
                      <Bar value={alloc} max={req} tone={alloc + 0.05 >= req ? "ok" : alloc > 0 ? "surplus" : "accent"} className="mt-1 w-28" />
                    </div>
                    <StatusBadge status={o.so.status} />
                  </div>
                </div>
                <Table className="min-w-[560px]">
                  <THead>
                    <tr>
                      <TH>Species</TH>
                      <TH align="right">Requested</TH>
                      <TH align="right">Allocated</TH>
                      <TH align="right">Price</TH>
                      <TH align="right">Line value</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {o.lines.map(({ l, sp }) => {
                      const st = lineFillStatus(l.requestedKg, l.allocatedKg);
                      return (
                        <TR key={l.id}>
                          <TD>
                            <span className="text-text">{sp.canonicalName}</span>
                            {l.substituteForLineId && <Badge tone="info" className="ml-2">Substitute</Badge>}
                            {l.sizeMinKg && <span className="num ml-2 text-[11px] text-muted">{Math.round(Number(l.sizeMinKg) * 1000)}–{Math.round(Number(l.sizeMaxKg ?? l.sizeMinKg) * 1000)} g</span>}
                          </TD>
                          <TD num className="text-text">{kgNum(l.requestedKg)}</TD>
                          <TD num className={Number(l.allocatedKg) > 0 ? "text-text" : "text-muted"}>{kgNum(l.allocatedKg)}</TD>
                          <TD num className="text-text-2">{perKg(l.pricePerKg)}</TD>
                          <TD num className="text-text-2">{sgd(Number(l.requestedKg) * Number(l.pricePerKg))}</TD>
                          <TD><Badge tone={st.tone}>{st.label}</Badge></TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              </Card>
            );
          })}
        </div>

        <Card className="order-1 self-start xl:order-2 xl:sticky xl:top-4">
          <CardHeader title="Totals by species" subtitle="Requested (bar) and allocated (fill) across all buyers." />
          <CardBody className="space-y-2.5">
            {speciesRows.length === 0 && <p className="text-xs text-muted">No demand recorded tonight.</p>}
            {speciesRows.map((s) => (
              <Link key={s.id} href={activeSpecies?.id === s.id ? "/demand/requirements" : `/demand/requirements?species=${s.id}`} className={cn("block rounded-md px-2 py-1.5 hover:bg-panel-2", activeSpecies?.id === s.id && "bg-panel-2")}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-medium text-text">{s.name}</span>
                  <span className="num shrink-0 text-xs text-text">{kgNum(s.allocated, 0)} <span className="text-muted">/ {kgNum(s.requested, 0)} kg</span></span>
                </div>
                <div className="relative mt-1 h-2 rounded-full bg-panel-3">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-panel-3 ring-1 ring-border-strong" style={{ width: `${(s.requested / maxReq) * 100}%` }} />
                  <div className={cn("absolute inset-y-0 left-0 rounded-full", s.allocated + 0.05 >= s.requested ? "bg-ok" : "bg-accent")} style={{ width: `${(Math.min(s.allocated, s.requested) / maxReq) * 100}%` }} />
                </div>
                <div className="mt-0.5 text-[10px] text-muted">{s.buyers.size} buyer{s.buyers.size === 1 ? "" : "s"}{s.local ? ` · ${s.local}` : ""}</div>
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
