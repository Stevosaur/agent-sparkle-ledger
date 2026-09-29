import Link from "next/link";
import { requireApp } from "@/lib/auth/session";
import { purchaseOrdersList } from "@/lib/services/queries-procurement";
import { addDays } from "@/lib/domain/time";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { AiMark, Bar, Empty, PageHeader, Stat } from "@/components/ui/misc";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { kg, kgNum, sgd, time, date, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Purchase Orders" };

const RANGES = [
  { key: "tonight", label: "Tonight" },
  { key: "7d", label: "Last 7 nights" },
  { key: "all", label: "All" },
] as const;

const SOURCE: Record<string, string> = { MANUAL: "Manual", AI_RECOMMENDATION: "AI recommendation", RFQ: "RFQ", CATCH_DECLARATION: "Catch declaration" };

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const app = await requireApp("procurement.view");
  const sp = await searchParams;
  const range = RANGES.find((r) => r.key === sp.range)?.key ?? "tonight";
  const from = range === "tonight" ? app.marketDate : range === "7d" ? addDays(app.marketDate, -6) : null;
  const pos = await purchaseOrdersList(app.org.id, from, app.marketDate);

  const live = pos.filter((p) => p.po.status !== "CANCELLED");
  const total = live.reduce((a, p) => a + Number(p.po.total), 0);
  const orderedKg = live.reduce((a, p) => a + p.lines.reduce((b, l) => b + Number(l.quantityKg), 0), 0);
  const receivedKg = live.reduce((a, p) => a + p.lines.reduce((b, l) => b + Number(l.receivedKg), 0), 0);
  const aiCount = live.filter((p) => p.po.source === "AI_RECOMMENDATION").length;

  return (
    <div>
      <PageHeader
        eyebrow={`Procurement · ${range === "tonight" ? date(app.marketDate) : range === "7d" ? `${date(from)} – ${date(app.marketDate)}` : "all nights"}`}
        title="Purchase Orders"
        subtitle="Every purchase is tied to traceable lots from the moment it is approved. Received weight comes from the receiving scale, not the supplier's declaration."
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <Link key={r.key} href={r.key === "tonight" ? "/procurement/purchase-orders" : `/procurement/purchase-orders?range=${r.key}`} className={cn("rounded-md border px-2.5 py-1 text-xs", range === r.key ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2")}>
            {r.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Purchase orders" value={live.length} sub={pos.length > live.length ? `${pos.length - live.length} cancelled` : `${new Set(live.map((p) => p.v.id)).size} vendors`} />
        <Stat label="Committed spend" value={sgd(total)} sub="incl. GST" />
        <Stat label="Received" value={kg(receivedKg, 0)} sub={orderedKg ? `${Math.round((receivedKg / orderedKg) * 100)}% of ${kgNum(orderedKg, 0)} kg ordered` : "nothing ordered"} tone={orderedKg && receivedKg >= orderedKg * 0.95 ? "ok" : undefined} />
        <Stat label="From AI recommendations" value={aiCount} sub="approved by a person" tone={aiCount ? "ai" : undefined} />
      </div>

      {pos.length === 0 ? (
        <Empty className="mt-4" title={range === "tonight" ? "No purchase orders tonight yet" : "No purchase orders in this period"}>
          Purchases are created by accepting a supplier declaration, approving a procurement recommendation or awarding an RFQ.
        </Empty>
      ) : (
        <Card className="mt-4 overflow-hidden">
          <Table className="min-w-[980px]" data-testid="po-table">
            <THead>
              <tr>
                <TH>PO</TH>
                <TH>Vendor</TH>
                <TH>Lines</TH>
                <TH>Source</TH>
                <TH align="right">ETA</TH>
                <TH align="right">Total</TH>
                <TH className="w-36">Received</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <tbody>
              {pos.map(({ po, v, lines }) => {
                const q = lines.reduce((a, l) => a + Number(l.quantityKg), 0);
                const r = lines.reduce((a, l) => a + Number(l.receivedKg), 0);
                const pctR = q ? (r / q) * 100 : 0;
                return (
                  <TR key={po.id} className={cn(po.status === "CANCELLED" && "opacity-50")}>
                    <TD>
                      <Link href={`/procurement/purchase-orders/${po.id}`} className="num font-semibold text-accent hover:underline">{po.poNumber}</Link>
                      {range !== "tonight" && <div className="text-[11px] text-muted">{date(po.marketDate)}</div>}
                    </TD>
                    <TD><Link href={`/vendors/${v.id}`} className="text-text hover:text-accent">{v.name}</Link></TD>
                    <TD className="max-w-[280px]">
                      <div className="truncate text-xs text-text-2" title={lines.map((l) => `${kgNum(l.quantityKg)} kg ${l.speciesName}`).join(", ")}>
                        {lines.map((l) => `${kgNum(l.quantityKg)} kg ${l.speciesName}`).join(", ") || "—"}
                      </div>
                    </TD>
                    <TD>
                      <span className="flex items-center gap-1.5 text-xs text-text-2">
                        {po.source === "AI_RECOMMENDATION" && <AiMark />}
                        {SOURCE[po.source] ?? titleCase(po.source)}
                      </span>
                    </TD>
                    <TD num className="text-text-2">{time(po.expectedAt)}</TD>
                    <TD num className="font-semibold text-text">{sgd(po.total, po.currency)}</TD>
                    <TD>
                      <div className="num flex justify-between text-[11px]"><span className={pctR >= 95 ? "text-ok" : r > 0 ? "text-text" : "text-muted"}>{Math.round(pctR)}%</span><span className="text-muted">{kgNum(r)} kg</span></div>
                      <Bar value={r} max={q} tone={pctR >= 95 ? "ok" : r > 0 ? "surplus" : "accent"} className="mt-1" />
                    </TD>
                    <TD><StatusBadge status={po.status} /></TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
          {pos.length >= 300 && <p className="border-t border-border px-4 py-2 text-[11px] text-muted"><Badge>Showing latest 300</Badge></p>}
        </Card>
      )}
    </div>
  );
}
