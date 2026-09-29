import { requireApp } from "@/lib/auth/session";
import { standingOrdersList } from "@/lib/services/queries-procurement";
import { deliveryDateFor, isoWeekday } from "@/lib/domain/time";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty, PageHeader, Stat } from "@/components/ui/misc";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { kg, kgNum, perKg, date } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Standing Orders" };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DayChips({ days, today }: { days: number[]; today: number }) {
  return (
    <div className="flex gap-0.5" aria-label={days.map((d) => DAYS[d - 1]).join(", ")}>
      {DAYS.map((d, i) => {
        const on = days.includes(i + 1);
        return (
          <span
            key={d}
            className={cn(
              "inline-flex h-6 w-8 items-center justify-center rounded text-[10px] font-semibold",
              on ? "bg-accent-soft text-accent ring-1 ring-accent/40" : "bg-panel-2 text-muted/60",
              i + 1 === today && "outline outline-1 outline-offset-1 outline-text-2",
            )}
          >
            {d}
          </span>
        );
      })}
    </div>
  );
}

export default async function StandingOrdersPage() {
  const app = await requireApp("demand.view");
  const buyerOnly = app.role === "BUYER" ? app.membership.customerId ?? "00000000-0000-0000-0000-000000000000" : null;
  const rows = await standingOrdersList(app.org.id, buyerOnly);
  const delivery = deliveryDateFor(app.marketDate);
  const wd = isoWeekday(delivery);
  const active = rows.filter((r) => r.so.active);
  const tonight = active.filter((r) => r.so.daysOfWeek.includes(wd));
  const weeklyKg = active.reduce((a, r) => a + Number(r.so.quantityKg) * r.so.daysOfWeek.length, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Demand"
        title="Standing Orders"
        subtitle={`Recurring buyer commitments. Days are delivery mornings; tonight's market delivers on ${date(delivery)}. Standing orders become confirmed orders at market open and feed the demand forecast.`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active standing orders" value={active.length} sub={`${rows.length - active.length} paused`} />
        <Stat label={`Due ${DAYS[wd - 1]} delivery`} value={tonight.length} sub={kg(tonight.reduce((a, r) => a + Number(r.so.quantityKg), 0), 0)} tone="info" />
        <Stat label="Buyers" value={new Set(active.map((r) => r.c.id)).size} sub="with a standing order" />
        <Stat label="Committed per week" value={kg(weeklyKg, 0)} sub="across all active orders" />
      </div>

      {rows.length === 0 ? (
        <Empty className="mt-4" title="No standing orders yet">Standing orders are agreed with buyers and set up by the procurement team.</Empty>
      ) : (
        <Card className="mt-4 overflow-hidden">
          <Table className="min-w-[820px]" data-testid="standing-orders-table">
            <THead>
              <tr>
                <TH>Customer</TH>
                <TH>Species</TH>
                <TH>Delivery days</TH>
                <TH align="right">Quantity</TH>
                <TH align="right">Size</TH>
                <TH align="right">Agreed price</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map(({ so, c, sp }) => (
                <TR key={so.id} className={cn(!so.active && "opacity-55")}>
                  <TD>
                    <div className="font-medium text-text">{c.name}</div>
                    <div className="text-[11px] text-muted">{c.code}{c.priorityTier === 1 ? " · priority" : ""}</div>
                  </TD>
                  <TD>
                    <div className="text-text">{sp.canonicalName}</div>
                    {sp.localNames[0] && <div className="text-[11px] text-muted">{sp.localNames[0]}</div>}
                  </TD>
                  <TD><DayChips days={so.daysOfWeek} today={wd} /></TD>
                  <TD num className="font-semibold text-text">{kgNum(so.quantityKg)} kg</TD>
                  <TD num className="text-text-2">{so.sizeMinKg ? `${Math.round(Number(so.sizeMinKg) * 1000)}–${Math.round(Number(so.sizeMaxKg ?? so.sizeMinKg) * 1000)} g` : "—"}</TD>
                  <TD num className="text-text-2">{so.agreedPricePerKg ? perKg(so.agreedPricePerKg) : <span className="text-muted">market</span>}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={so.active ? "ok" : "neutral"}>{so.active ? "Active" : "Paused"}</Badge>
                      {so.active && so.daysOfWeek.includes(wd) && <Badge tone="info">Tonight</Badge>}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
