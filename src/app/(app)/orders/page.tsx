import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { ordersWithLines } from "@/lib/services/queries-procurement";
import { addDays } from "@/lib/domain/time";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Bar, Empty, PageHeader } from "@/components/ui/misc";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { LiveRefresh } from "@/components/app/live-refresh";
import { kgNum, sgd, time, date, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PIPELINE, SOURCE_LABEL, SOURCE_TONE, stageOf } from "./labels";

export const metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ night?: string; status?: string }> }) {
  const app = await requireApp("orders.view");
  const sp = await searchParams;
  const night = sp.night && /^\d{4}-\d{2}-\d{2}$/.test(sp.night) && !Number.isNaN(Date.parse(sp.night)) ? sp.night : app.marketDate;
  const isBuyer = app.role === "BUYER";
  const buyerId = isBuyer ? app.membership.customerId ?? "00000000-0000-0000-0000-000000000000" : null;
  const orders = await ordersWithLines(app.org.id, night, { customerId: buyerId });

  const stage = sp.status && (PIPELINE as readonly string[]).concat("CANCELLED").includes(sp.status) ? sp.status : null;
  const counts = new Map<string, number>();
  for (const o of orders) counts.set(stageOf(o.so.status), (counts.get(stageOf(o.so.status)) ?? 0) + 1);
  const shown = stage ? orders.filter((o) => stageOf(o.so.status) === stage) : orders;
  const partial = orders.filter((o) => o.so.status === "PARTIALLY_ALLOCATED").length;
  const qs = (p: { night?: string; status?: string | null }) => {
    const u = new URLSearchParams();
    const n = p.night ?? night;
    if (n !== app.marketDate) u.set("night", n);
    const s = p.status === undefined ? stage : p.status;
    if (s) u.set("status", s);
    const q = u.toString();
    return q ? `/orders?${q}` : "/orders";
  };
  const isTonight = night === app.marketDate;

  return (
    <div>
      {isTonight && <LiveRefresh seconds={30} />}
      <PageHeader
        eyebrow={isTonight ? `Tonight · ${date(night)}` : `Market night ${date(night)}`}
        title={isBuyer ? "My orders" : "Orders"}
        subtitle={isBuyer ? "Your orders for this market night and where each one is in the pipeline." : "Sales orders from confirmation through allocation, picking, dispatch, delivery and invoicing."}
        actions={
          <div className="flex items-center gap-1">
            <Link href={qs({ night: addDays(night, -1), status: null })} className="inline-flex size-9 items-center justify-center rounded-md border border-border text-text-2 hover:bg-panel-2" aria-label="Previous night"><ChevronLeft className="size-4" /></Link>
            <Link href={qs({ night: app.marketDate, status: null })} className={cn("inline-flex h-9 items-center rounded-md border px-3 text-xs", isTonight ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2")}>Tonight</Link>
            {night < app.marketDate ? (
              <Link href={qs({ night: addDays(night, 1), status: null })} className="inline-flex size-9 items-center justify-center rounded-md border border-border text-text-2 hover:bg-panel-2" aria-label="Next night"><ChevronRight className="size-4" /></Link>
            ) : (
              <span className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted/40"><ChevronRight className="size-4" /></span>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" data-testid="order-pipeline">
        {PIPELINE.map((s, i) => {
          const n = counts.get(s) ?? 0;
          const active = stage === s;
          return (
            <Link key={s} href={qs({ status: active ? null : s })} className={cn("relative rounded-xl border px-3 py-2.5 transition-colors", active ? "border-accent bg-accent-soft" : "border-border bg-panel hover:bg-panel-2")}>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted"><span className="num text-muted/70">{i + 1}</span>{titleCase(s)}</div>
              <div className={cn("num mt-1 text-2xl font-semibold", n ? "text-text" : "text-muted/50")}>{n}</div>
              {s === "CONFIRMED" && partial > 0 && <div className="text-[10px] text-surplus">{partial} part-allocated</div>}
            </Link>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <Empty className="mt-4" title={stage ? `No ${titleCase(stage).toLowerCase()} orders` : "No orders for this night"}>
          {stage ? <Link href={qs({ status: null })} className="text-accent">Show all orders</Link> : undefined}
        </Empty>
      ) : (
        <Card className="mt-4 overflow-hidden">
          <Table className="min-w-[960px]" data-testid="orders-table">
            <THead>
              <tr>
                <TH>Order</TH>
                {!isBuyer && <TH>Customer</TH>}
                <TH>Lines</TH>
                <TH>Source</TH>
                <TH align="right">Requested</TH>
                <TH className="w-32">Allocated</TH>
                <TH align="right">Value</TH>
                <TH align="right">Deliver by</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <tbody>
              {shown.map((o) => {
                const req = o.lines.reduce((a, x) => a + Number(x.l.requestedKg), 0);
                const alloc = o.lines.reduce((a, x) => a + Number(x.l.allocatedKg), 0);
                const val = o.lines.reduce((a, x) => a + Number(x.l.requestedKg) * Number(x.l.pricePerKg), 0);
                const summary = o.lines.map((x) => `${x.sp.canonicalName} ${kgNum(x.l.requestedKg)}`).join(", ");
                return (
                  <TR key={o.so.id} className={cn(o.so.status === "CANCELLED" && "opacity-50")}>
                    <TD><Link href={`/orders/${o.so.id}`} className="num whitespace-nowrap font-semibold text-accent hover:underline">{o.so.soNumber}</Link></TD>
                    {!isBuyer && (
                      <TD>
                        <div className="min-w-[160px] text-text">{o.c.name}</div>
                        {o.c.priorityTier === 1 && <div className="text-[10px] text-spike">priority</div>}
                      </TD>
                    )}
                    <TD className="max-w-[260px]"><div className="truncate text-xs text-text-2" title={summary}>{summary || "—"}</div></TD>
                    <TD><Badge tone={SOURCE_TONE[o.so.source] ?? "neutral"}>{SOURCE_LABEL[o.so.source] ?? o.so.source}</Badge></TD>
                    <TD num className="text-text">{kgNum(req)}</TD>
                    <TD>
                      <div className="num flex justify-between text-[11px]"><span className="text-text">{kgNum(alloc)}</span><span className="text-muted">{req ? Math.floor((alloc / req) * 100) : 0}%</span></div>
                      <Bar value={alloc} max={req} tone={alloc + 0.05 >= req ? "ok" : alloc > 0 ? "surplus" : "accent"} className="mt-1" />
                    </TD>
                    <TD num className="text-text-2">{sgd(val)}</TD>
                    <TD num className="text-text-2">{time(o.so.requestedDeliveryBy)}</TD>
                    <TD><StatusBadge status={o.so.status} /></TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
