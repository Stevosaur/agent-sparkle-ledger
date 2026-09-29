import Link from "next/link";
import { Ship, Sprout, Truck } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { lotsWithContext } from "@/lib/services/queries-ops";
import { PageHeader, Stat, Empty } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { LiveRefresh } from "@/components/app/live-refresh";
import { date, kg, kgNum, perKg, time } from "@/lib/format";
import { sgtParts } from "@/lib/domain/time";
import { cn } from "@/lib/utils";
import { ExpectedLotActions } from "./lot-actions";

export const metadata = { title: "Expected Catch" };

const hhmm = (d: Date | null) => {
  if (!d) return null;
  const p = sgtParts(d);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
};

export default async function ExpectedCatchPage() {
  const app = await requireApp("supply.view");
  const lots = await lotsWithContext(app.org.id, app.marketDate, { statuses: ["EXPECTED", "LANDED"] });
  const canEta = app.can("supply.write");
  const canLand = app.can("ops.receive");

  const groups = new Map<string, { vendor: string; vendorId: string | null; source: string | null; kind: "vessel" | "farm" | "other"; rows: typeof lots }>();
  for (const x of lots) {
    const source = x.vs?.name ?? x.fm?.name ?? null;
    const key = `${x.v?.id ?? "none"}|${source ?? ""}`;
    const g = groups.get(key) ?? { vendor: x.v?.name ?? "Unknown vendor", vendorId: x.v?.id ?? null, source, kind: x.vs?.name ? "vessel" : x.fm?.name ? "farm" : "other", rows: [] };
    g.rows.push(x);
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => (a.rows[0].l.expectedArrivalAt?.getTime() ?? Infinity) - (b.rows[0].l.expectedArrivalAt?.getTime() ?? Infinity));

  const lateMin = (x: (typeof lots)[number]) => (x.l.originalEta && x.l.expectedArrivalAt ? Math.round((x.l.expectedArrivalAt.getTime() - x.l.originalEta.getTime()) / 60000) : 0);
  const bought = lots.filter((x) => x.l.purchaseOrderLineId);
  const offered = lots.filter((x) => !x.l.purchaseOrderLineId);
  const drafts = lots.filter((x) => x.l.confirmation === "DRAFT");
  const late = lots.filter((x) => lateMin(x) > 30);
  const sumKg = (xs: typeof lots) => xs.reduce((a, x) => a + Number(x.l.quantityDeclaredKg), 0);

  return (
    <div>
      <LiveRefresh seconds={20} />
      <PageHeader
        eyebrow={`Supply · ${date(app.marketDate)}`}
        title="Expected Catch"
        subtitle="Inbound lots not yet received tonight, grouped by vendor and vessel/farm, in ETA order. Bought lots are on a purchase order; offers are declared by suppliers but not yet bought."
        actions={<Link href="/operations/receiving" className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-text-2 hover:bg-panel-2">Receiving desk →</Link>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bought, inbound" value={kg(sumKg(bought), 0)} sub={`${bought.length} lot(s) on POs`} tone="info" />
        <Stat label="Offered, not bought" value={kg(sumKg(offered), 0)} sub={`${offered.length} supplier offer(s)`} />
        <Stat label="Late (ETA revised >30m)" value={late.length} sub={late.length ? late.map((x) => x.v?.name).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(", ") : "all on schedule"} tone={late.length ? "late" : "ok"} />
        <Stat label="Drafts to review" value={drafts.length} sub="AI-parsed, unconfirmed" tone={drafts.length ? "surplus" : undefined} />
      </div>

      {sorted.length === 0 && <Empty title="Nothing inbound right now">Every declared lot for tonight has been received. New supplier declarations appear here as they arrive via WhatsApp or catch intake.</Empty>}

      <div className="space-y-3" data-testid="expected-groups">
        {sorted.map((g) => (
          <Card key={`${g.vendorId}-${g.source}`} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-panel-2/60 px-4 py-2.5">
              {g.kind === "vessel" ? <Ship className="size-4 text-info" /> : g.kind === "farm" ? <Sprout className="size-4 text-ok" /> : <Truck className="size-4 text-muted" />}
              {g.vendorId ? <Link href={`/vendors/${g.vendorId}`} className="text-sm font-semibold text-text hover:text-accent">{g.vendor}</Link> : <span className="text-sm font-semibold text-text">{g.vendor}</span>}
              {g.source && <span className="text-xs text-muted">· {g.source}</span>}
              <span className="num ml-auto text-xs text-text-2">{g.rows.length} lot(s) · {kg(sumKg(g.rows), 0)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 text-left font-semibold">ETA</th>
                    <th className="px-3 py-2 text-left font-semibold">Lot</th>
                    <th className="px-3 py-2 text-left font-semibold">Species</th>
                    <th className="px-3 py-2 text-right font-semibold">Declared</th>
                    <th className="px-3 py-2 text-right font-semibold">Asking</th>
                    <th className="px-3 py-2 text-right font-semibold">Agreed</th>
                    <th className="px-3 py-2 text-left font-semibold">Deal</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-4 py-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((x) => {
                    const lm = lateMin(x);
                    const isLate = lm > 30;
                    return (
                      <tr key={x.l.id} className="border-t border-border/70 align-top hover:bg-panel-2/60">
                        <td className="px-4 py-2.5">
                          <div className={cn("num font-semibold", isLate ? "text-late" : "text-text")}>{time(x.l.expectedArrivalAt)}</div>
                          {x.l.originalEta && lm !== 0 && <div className="num text-[10px] text-muted line-through">{time(x.l.originalEta)}</div>}
                          {isLate && <Badge tone="late" className="mt-0.5 num">LATE +{lm}min</Badge>}
                        </td>
                        <td className="px-3 py-2.5">
                          <Link href={`/supply/lots/${x.l.id}`} className="num whitespace-nowrap text-xs font-medium text-accent hover:underline">{x.l.lotNumber}</Link>
                          {x.l.landingLocation && <div className="text-[10px] text-muted">{x.l.landingLocation}</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-text">{x.l.canonicalSpeciesName ?? <span className="text-short">Unmapped</span>}</div>
                          <div className="text-[10px] text-muted">
                            {x.l.supplierSpeciesName && x.l.supplierSpeciesName !== x.l.canonicalSpeciesName && <>“{x.l.supplierSpeciesName}” · </>}
                            {x.l.sizeGrade ?? (x.l.sizeMinKg && x.l.sizeMaxKg ? `${Number(x.l.sizeMinKg)}–${Number(x.l.sizeMaxKg)} kg` : "")} {x.l.freshOrFrozen.toLowerCase()}
                          </div>
                        </td>
                        <td className="num px-3 py-2.5 text-right text-text">{kgNum(x.l.quantityDeclaredKg)}</td>
                        <td className="num px-3 py-2.5 text-right text-text-2">{perKg(x.l.askingPricePerKg, x.l.currency)}</td>
                        <td className="num px-3 py-2.5 text-right text-text">{perKg(x.pol?.pricePerKg ?? x.l.agreedCostPerKg, x.l.currency)}</td>
                        <td className="px-3 py-2.5">
                          {x.l.purchaseOrderLineId ? (
                            x.pol?.purchaseOrderId ? <Link href={`/procurement/purchase-orders/${x.pol.purchaseOrderId}`}><Badge tone="ok">Bought</Badge></Link> : <Badge tone="ok">Bought</Badge>
                          ) : (
                            <Badge tone="info">Offer</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            <StatusBadge status={x.l.status} />
                            {x.l.confirmation === "DRAFT" && (
                              <Link href={`/supply/lots/${x.l.id}`} title="AI-parsed declaration — review and confirm"><Badge tone="surplus">DRAFT · review</Badge></Link>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <ExpectedLotActions lotId={x.l.id} lotNumber={x.l.lotNumber} eta={hhmm(x.l.expectedArrivalAt)} status={x.l.status} canEta={canEta} canLand={canLand} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted">Times are SGT. A lot is flagged LATE when its revised ETA is more than 30 minutes after the ETA first declared.</p>
    </div>
  );
}
