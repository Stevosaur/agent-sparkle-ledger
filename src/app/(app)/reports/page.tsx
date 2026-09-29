import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requireApp, type AppContext } from "@/lib/auth/session";
import { addDays } from "@/lib/domain/time";
import { priceHistory } from "@/lib/services/queries";
import { vendorScorecards } from "@/lib/services/vendors";
import {
  dailyProcurement, forecastAccuracy, grossMarginBySpecies, invoiceExceptionSummary, onTimeDelivery, purchasedSpecies, quantityVarianceByVendor, shortagesByNight, surplusAndMarkdown, traceabilityCompleteness, wasteBySpecies,
} from "@/lib/services/reports";
import { PageHeader, Stat, Empty, Bar } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { date, dateTime, kgNum, pct, perKg, sgd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PriceChart } from "./price-chart";

export const metadata = { title: "Reports" };

const REPORTS = [
  { key: "procurement", label: "Daily procurement", group: "Buying" },
  { key: "prices", label: "Purchase price trend", group: "Buying" },
  { key: "vendors", label: "Vendor performance", group: "Buying" },
  { key: "variance", label: "Quantity variance", group: "Buying" },
  { key: "margin", label: "Gross margin by species", group: "Selling" },
  { key: "forecast", label: "Forecast accuracy", group: "Selling" },
  { key: "shortages", label: "Supply shortages", group: "Selling" },
  { key: "surplus", label: "Surplus & markdown", group: "Selling" },
  { key: "waste", label: "Waste & shrinkage", group: "Operations" },
  { key: "delivery", label: "On-time delivery", group: "Operations" },
  { key: "invoices", label: "Invoice exceptions", group: "Finance & compliance" },
  { key: "trace", label: "Traceability completeness", group: "Finance & compliance" },
] as const;
type Key = (typeof REPORTS)[number]["key"];

const signedKg = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${kgNum(Math.abs(v))}`;
const signedPct = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);
const Note = ({ children }: { children: React.ReactNode }) => <p className="mt-3 text-[11px] leading-relaxed text-muted">{children}</p>;
const None = ({ children }: { children?: React.ReactNode }) => <tr><td colSpan={20} className="px-4 py-10 text-center text-sm text-muted">{children ?? "No records in this period."}</td></tr>;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ r?: string; species?: string }> }) {
  const app = await requireApp("reports.view");
  const sp = await searchParams;
  const r: Key = REPORTS.find((x) => x.key === sp.r)?.key ?? "procurement";
  const groups = [...new Set(REPORTS.map((x) => x.group))];

  return (
    <div>
      <PageHeader
        eyebrow={`Reports · night of ${date(app.marketDate)}`}
        title="Reports"
        subtitle="Operational reports computed directly from PasarCatch records — purchase orders, goods receipts, allocations, deliveries, invoices and exceptions. Nothing is estimated or pulled from outside sources."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav aria-label="Reports" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <div className="flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
            {REPORTS.map((x) => (
              <Link key={x.key} href={`/reports?r=${x.key}`} className={cn("shrink-0 rounded-md border px-2.5 py-1 text-xs", r === x.key ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2")}>{x.label}</Link>
            ))}
          </div>
          <div className="hidden space-y-4 lg:block">
            {groups.map((g) => (
              <div key={g}>
                <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{g}</div>
                {REPORTS.filter((x) => x.group === g).map((x) => (
                  <Link key={x.key} href={`/reports?r=${x.key}`} className={cn("block rounded-md px-2 py-1.5 text-[13px]", r === x.key ? "bg-panel-3 font-medium text-text" : "text-text-2 hover:bg-panel-2 hover:text-text")}>{x.label}</Link>
                ))}
              </div>
            ))}
          </div>
        </nav>
        <div className="min-w-0" data-testid={`report-${r}`}>
          {r === "procurement" && <Procurement app={app} />}
          {r === "prices" && <Prices app={app} speciesId={sp.species} />}
          {r === "vendors" && <Vendors app={app} />}
          {r === "variance" && <Variance app={app} />}
          {r === "margin" && <Margin app={app} />}
          {r === "forecast" && <Forecast app={app} />}
          {r === "shortages" && <Shortages app={app} />}
          {r === "surplus" && <Surplus app={app} />}
          {r === "waste" && <Waste app={app} />}
          {r === "delivery" && <Delivery app={app} />}
          {r === "invoices" && <Invoices app={app} />}
          {r === "trace" && <Trace app={app} />}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Daily procurement
async function Procurement({ app }: { app: AppContext }) {
  const rows = await dailyProcurement(app.org.id, app.marketDate);
  const kg = rows.reduce((a, x) => a + x.kg, 0);
  const spend = rows.reduce((a, x) => a + x.spend, 0);
  const ai = rows.filter((x) => x.source === "AI_RECOMMENDATION");
  const aiSpend = ai.reduce((a, x) => a + x.spend, 0);
  const vendors = new Set(rows.map((x) => x.vendorId)).size;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Bought tonight" value={`${kgNum(kg, 0)} kg`} sub={`${rows.length} vendor × species lines`} />
        <Stat label="Spend ex GST" value={sgd(spend)} sub={`${vendors} vendor(s)`} />
        <Stat label="Weighted avg cost" value={kg > 0 ? perKg(spend / kg) : "—"} sub="all species" />
        <Stat label="Via AI recommendation" value={spend > 0 ? pct((aiSpend / spend) * 100) : "—"} sub={`${sgd(aiSpend)} approved by a human`} tone="ai" />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Daily procurement summary" subtitle={`Purchase orders for the night of ${date(app.marketDate)}, by vendor and species. Draft and cancelled POs excluded.`} action={<Link href="/procurement/purchase-orders" className="text-xs text-accent">Purchase orders →</Link>} />
        <Table className="min-w-[760px]">
          <THead><tr><TH>Vendor</TH><TH>Species</TH><TH>Source</TH><TH align="right">POs</TH><TH align="right">kg</TH><TH align="right">Spend</TH><TH align="right">W. avg S$/kg</TH></tr></THead>
          <tbody>
            {rows.map((x, i) => (
              <TR key={i}>
                <TD className="text-text">{x.vendor}</TD>
                <TD className="text-text-2">{x.species}</TD>
                <TD>{x.source === "AI_RECOMMENDATION" ? <Badge tone="ai">AI → approved</Badge> : <Badge tone="neutral">{x.source === "CATCH_DECLARATION" ? "Catch declaration" : x.source === "RFQ" ? "RFQ" : "Manual"}</Badge>}</TD>
                <TD num className="text-text-2">{x.poCount}</TD>
                <TD num>{kgNum(x.kg)}</TD>
                <TD num className="text-text">{sgd(x.spend)}</TD>
                <TD num className="text-text-2">{perKg(x.wavg)}</TD>
              </TR>
            ))}
            {rows.length === 0 && <None>No purchase orders for tonight yet.</None>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Price trend
async function Prices({ app, speciesId }: { app: AppContext; speciesId?: string }) {
  const options = await purchasedSpecies(app.org.id, app.marketDate, 90);
  const sel = options.find((o) => o.id === speciesId) ?? options[0];
  if (!sel) return <Empty title="No purchases in the last 90 nights">Price trends appear once purchase orders are recorded.</Empty>;
  const h = await priceHistory(app.org.id, sel.id, app.marketDate, 90);
  const windows = [{ k: "7 nights", s: h.s7 }, { k: "30 nights", s: h.s30 }, { k: "90 nights", s: h.s90 }];
  return (
    <div className="space-y-4">
      <form method="get" action="/reports" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="r" value="prices" />
        <label className="text-xs text-muted">
          Species
          <select name="species" defaultValue={sel.id} className="mt-1 block h-9 w-64 rounded-md border border-border bg-panel-2 px-3 text-sm text-text">
            {options.map((o) => <option key={o.id} value={o.id}>{o.name} · {kgNum(o.kg, 0)} kg</option>)}
          </select>
        </label>
        <Button type="submit" size="md">Show</Button>
        <Link href={`/market/${sel.id}`} className="ml-auto inline-flex items-center gap-1 text-xs text-accent">Species on tonight&apos;s market <ArrowUpRight className="size-3" /></Link>
      </form>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {windows.map((w) => (
          <Stat
            key={w.k}
            label={`${w.k} · weighted avg`}
            value={perKg(w.s.weightedAvg)}
            sub={w.s.count ? <>range {sgd(w.s.min)}–{sgd(w.s.max)} · {kgNum(w.s.totalKg, 0)} kg · trend {w.s.trendPctPerWeek === null ? "n/a (<4 nights)" : `${w.s.trendPctPerWeek > 0 ? "+" : ""}${w.s.trendPctPerWeek}%/wk`}</> : "no purchases"}
            tone={w.s.trendPctPerWeek !== null && Math.abs(w.s.trendPctPerWeek) >= 5 ? (w.s.trendPctPerWeek > 0 ? "short" : "ok") : undefined}
          />
        ))}
      </div>
      <Card>
        <CardHeader title={`${sel.name} — price per kg by market night`} subtitle="Buy = weighted average PO price. Asking = average supplier asking price on declared lots. Sell = weighted average price on buyer orders. Windows exclude tonight." />
        <CardBody>
          {h.points.length ? <PriceChart points={h.points} /> : <Empty title="No priced purchases in 90 nights" />}
        </CardBody>
      </Card>
      <details className="rounded-xl border border-border bg-panel">
        <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-text-2">Table view ({h.points.length} nights)</summary>
        <Table>
          <THead><tr><TH>Night</TH><TH align="right">kg bought</TH><TH align="right">Buy w.avg</TH><TH align="right">Low</TH><TH align="right">High</TH><TH align="right">Asking</TH><TH align="right">Sell w.avg</TH></tr></THead>
          <tbody>
            {[...h.points].reverse().map((p) => (
              <TR key={p.date}><TD className="text-text-2">{date(p.date)}</TD><TD num>{kgNum(p.kg)}</TD><TD num className="text-text">{sgd(p.buy)}</TD><TD num>{sgd(p.lo)}</TD><TD num>{sgd(p.hi)}</TD><TD num>{sgd(p.ask)}</TD><TD num>{sgd(p.sell)}</TD></TR>
            ))}
          </tbody>
        </Table>
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ Vendor performance
async function Vendors({ app }: { app: AppContext }) {
  const cards = (await vendorScorecards(app.org.id, app.marketDate, 30)).filter((c) => c.metrics.receipts > 0);
  const ranked = [...cards].sort((a, b) => (b.metrics.fillRatePct ?? 0) + (b.metrics.onTimePct ?? 0) - ((a.metrics.fillRatePct ?? 0) + (a.metrics.onTimePct ?? 0)));
  const top = ranked.slice(0, 5);
  const bottom = ranked.length > 5 ? ranked.slice(-Math.min(5, ranked.length - 5)).reverse() : [];
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader title="Top vendors — last 30 nights" subtitle="Ranked by fill rate + on-time rate from goods receipts. Individual metrics are shown; there is no opaque single score." action={<Link href="/vendors/performance" className="text-xs text-accent">Full scorecards →</Link>} />
        <VendorRows list={top} />
      </Card>
      {bottom.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="Needs attention" subtitle="Lowest-ranked vendors on the same measures." />
          <VendorRows list={bottom} />
        </Card>
      )}
      <Note>On time = arrived within 30 minutes of the expected time. Fill rate = received ÷ ordered kg. Weight variance = received vs declared.</Note>
    </div>
  );
}

function VendorRows({ list }: { list: Awaited<ReturnType<typeof vendorScorecards>> }) {
  return (
    <Table className="min-w-[760px]">
      <THead><tr><TH>Vendor</TH><TH align="right">Receipts</TH><TH align="right">On time</TH><TH align="right">Fill rate</TH><TH align="right">Accepted</TH><TH align="right">Avg weight var.</TH><TH align="right">Grade A</TH><TH align="right">Temp exceptions</TH></tr></THead>
      <tbody>
        {list.map(({ vendor: v, metrics: m }) => (
          <TR key={v.id}>
            <TD><Link href={`/vendors/${v.id}`} className="text-text hover:text-accent">{v.name}</Link></TD>
            <TD num>{m.receipts}</TD>
            <TD num className={m.onTimePct !== null && m.onTimePct < 80 ? "text-short" : "text-text"}>{pct(m.onTimePct)}</TD>
            <TD num className={m.fillRatePct !== null && m.fillRatePct < 90 ? "text-short" : "text-text"}>{pct(m.fillRatePct)}</TD>
            <TD num>{pct(m.acceptedPct)}</TD>
            <TD num className={m.avgWeightVariancePct !== null && Math.abs(m.avgWeightVariancePct) > 5 ? "text-short" : ""}>{signedPct(m.avgWeightVariancePct)}</TD>
            <TD num>{pct(m.gradeAPct)}</TD>
            <TD num>{pct(m.tempExceptionRatePct)}</TD>
          </TR>
        ))}
        {list.length === 0 && <None>No receipts in the last 30 nights.</None>}
      </tbody>
    </Table>
  );
}

// ------------------------------------------------------------------ Quantity variance
async function Variance({ app }: { app: AppContext }) {
  const alert = app.org.settings.weightVarianceAlertPct;
  const rows = await quantityVarianceByVendor(app.org.id, app.marketDate, 30, alert);
  const decl = rows.reduce((a, x) => a + x.declared, 0);
  const rec = rows.reduce((a, x) => a + x.received, 0);
  const max = Math.max(1, ...rows.map((x) => Math.abs(x.variancePct ?? 0)));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Declared" value={`${kgNum(decl, 0)} kg`} sub="last 30 nights" />
        <Stat label="Received" value={`${kgNum(rec, 0)} kg`} sub="weighed at receiving" />
        <Stat label="Net variance" value={`${signedKg(rec - decl)} kg`} sub={decl ? signedPct(((rec - decl) / decl) * 100) : "—"} tone={rec < decl ? "short" : "ok"} />
        <Stat label={`Receipts beyond ±${alert}%`} value={rows.reduce((a, x) => a + x.flagged, 0)} sub={`of ${rows.reduce((a, x) => a + x.receipts, 0)} receipts`} tone="surplus" />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Declared vs received by vendor" subtitle="Goods receipt lines for lots on the last 30 market nights. Most under-delivering vendors first." />
        <Table className="min-w-[820px]">
          <THead><tr><TH>Vendor</TH><TH align="right">Receipts</TH><TH align="right">Declared kg</TH><TH align="right">Received kg</TH><TH align="right">Variance kg</TH><TH align="right">Variance</TH><TH className="w-32" /><TH align="right">Rejected kg</TH><TH align="right">Beyond ±{alert}%</TH></tr></THead>
          <tbody>
            {rows.map((x) => (
              <TR key={x.vendorId}>
                <TD><Link href={`/vendors/${x.vendorId}`} className="text-text hover:text-accent">{x.vendor}</Link></TD>
                <TD num>{x.receipts}</TD>
                <TD num>{kgNum(x.declared)}</TD>
                <TD num className="text-text">{kgNum(x.received)}</TD>
                <TD num className={x.varianceKg < 0 ? "text-short" : "text-text-2"}>{signedKg(x.varianceKg)}</TD>
                <TD num className={x.variancePct !== null && Math.abs(x.variancePct) > alert ? "font-semibold text-short" : "text-text-2"}>{signedPct(x.variancePct)}</TD>
                <TD><Bar value={Math.abs(x.variancePct ?? 0)} max={max} tone={x.variancePct !== null && Math.abs(x.variancePct) > alert ? "short" : "accent"} /></TD>
                <TD num className="text-text-2">{kgNum(x.rejected)}</TD>
                <TD num className={x.flagged ? "text-surplus" : "text-muted"}>{x.flagged}</TD>
              </TR>
            ))}
            {rows.length === 0 && <None />}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Gross margin
async function Margin({ app }: { app: AppContext }) {
  const rows = await grossMarginBySpecies(app.org.id, app.marketDate, 30);
  const sales = rows.reduce((a, x) => a + x.costedSales, 0);
  const cost = rows.reduce((a, x) => a + x.cost, 0);
  const uncosted = rows.reduce((a, x) => a + (x.kg - x.costedKg), 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Sales value (costed)" value={sgd(sales)} sub="allocated kg × order price" />
        <Stat label="Cost of allocated kg" value={sgd(cost)} sub="× lot agreed cost/kg" />
        <Stat label="Gross margin" value={sgd(sales - cost)} sub="before GST, freight & waste" tone={sales - cost >= 0 ? "ok" : "short"} />
        <Stat label="Margin %" value={sales > 0 ? pct(((sales - cost) / sales) * 100, 1) : "—"} sub={uncosted > 0.05 ? `${kgNum(uncosted)} kg without a cost excluded` : "all allocations costed"} />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Gross margin by species — last 30 nights" subtitle="Confirmed allocations (lot → buyer order line). Cost uses the lot's agreed cost, or its parent lot's for processed lots." />
        <Table className="min-w-[760px]">
          <THead><tr><TH>Species</TH><TH align="right">Allocated kg</TH><TH align="right">Sales value</TH><TH align="right">Cost</TH><TH align="right">Margin</TH><TH align="right">Margin %</TH><TH align="right">Uncosted kg</TH></tr></THead>
          <tbody>
            {rows.map((x) => (
              <TR key={x.speciesId}>
                <TD><Link href={`/market/${x.speciesId}`} className="text-text hover:text-accent">{x.species}</Link></TD>
                <TD num>{kgNum(x.kg)}</TD>
                <TD num className="text-text">{sgd(x.costedSales)}</TD>
                <TD num className="text-text-2">{sgd(x.cost)}</TD>
                <TD num className={x.margin < 0 ? "text-short" : "text-text"}>{sgd(x.margin)}</TD>
                <TD num className={x.marginPct !== null && x.marginPct < 10 ? "font-semibold text-short" : "text-ok"}>{x.marginPct === null ? "—" : pct(x.marginPct, 1)}</TD>
                <TD num className="text-muted">{x.kg - x.costedKg > 0.05 ? kgNum(x.kg - x.costedKg) : "—"}</TD>
              </TR>
            ))}
            {rows.length === 0 && <None>No allocations in the last 30 nights.</None>}
          </tbody>
        </Table>
      </Card>
      <Note>Sales value counts only kg with a known cost so margin compares like with like. Figures are before GST, delivery cost, processing yield and waste.</Note>
    </div>
  );
}

// ------------------------------------------------------------------ Forecast accuracy
async function Forecast({ app }: { app: AppContext }) {
  const f = await forecastAccuracy(app.org.id, app.marketDate, 30);
  const acc = f.rows.filter((x) => x.accuracyPct !== null);
  const avg = acc.length ? acc.reduce((a, x) => a + (x.accuracyPct ?? 0), 0) / acc.length : null;
  const inBand = f.rows.filter((x) => x.inBand).length;
  const nights = [...new Set(f.rows.map((x) => x.marketDate))];
  return (
    <div className="space-y-4">
      {(f.forecastNights < 7 || f.withoutActual > 0) && (
        <div className="rounded-xl border border-surplus/30 bg-surplus-soft px-4 py-3 text-xs text-text-2">
          <span className="font-semibold text-surplus">Limited history.</span> Accuracy is only reported where both a species-level forecast and actual buyer orders exist for the same night. {f.forecastNights} forecast night(s) found in the last 30{f.withoutActual ? `; ${f.withoutActual} forecast line(s) had no orders to compare against and are excluded` : ""}. Tonight&apos;s figures may still change as orders arrive.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Mean accuracy" value={avg === null ? "—" : pct(avg, 1)} sub={`${acc.length} species-nights compared`} />
        <Stat label="Actual inside forecast band" value={f.rows.length ? pct((inBand / f.rows.length) * 100) : "—"} sub={`${inBand} of ${f.rows.length}`} />
        <Stat label="Forecast nights" value={f.forecastNights} sub="latest forecast per night" />
        <Stat label="Nights compared" value={nights.length} sub="with orders" />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Forecast vs actual requested kg" subtitle="Species roll-up forecasts (override where a planner changed it) vs requested kg on buyer orders for the same market night." action={<Link href="/demand/forecast" className="text-xs text-accent">Forecast →</Link>} />
        <Table className="min-w-[760px]">
          <THead><tr><TH>Night</TH><TH>Species</TH><TH align="right">Forecast kg</TH><TH align="right">Band</TH><TH align="right">Actual kg</TH><TH align="right">Error</TH><TH align="right">Accuracy</TH></tr></THead>
          <tbody>
            {f.rows.map((x) => (
              <TR key={x.marketDate + x.speciesId}>
                <TD className="whitespace-nowrap text-text-2">{date(x.marketDate)}</TD>
                <TD className="text-text">{x.species}</TD>
                <TD num>{kgNum(x.forecast)}</TD>
                <TD num className="text-muted">{kgNum(x.low, 0)}–{kgNum(x.high, 0)}</TD>
                <TD num className="text-text">{kgNum(x.actual)}</TD>
                <TD num className={x.inBand ? "text-text-2" : "text-surplus"}>{signedKg(x.forecast - (x.actual ?? 0))}</TD>
                <TD num className={x.accuracyPct !== null && x.accuracyPct < 70 ? "font-semibold text-short" : "text-ok"}>{x.accuracyPct === null ? "—" : pct(x.accuracyPct, 1)}</TD>
              </TR>
            ))}
            {f.rows.length === 0 && <None>No nights with both a forecast and buyer orders yet.</None>}
          </tbody>
        </Table>
      </Card>
      <Note>Accuracy = 100% − |forecast − actual| ÷ actual (floored at 0%). Substitute order lines are excluded from actuals.</Note>
    </div>
  );
}

// ------------------------------------------------------------------ Shortages
async function Shortages({ app }: { app: AppContext }) {
  const nights = await shortagesByNight(app.org.id, app.marketDate, 30);
  const total = nights.reduce((a, x) => a + x.count, 0);
  const max = Math.max(1, ...nights.map((x) => x.count));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Stat label="Shortage exceptions" value={total} sub="last 30 nights" tone={total ? "short" : "ok"} />
        <Stat label="Nights with a shortage" value={nights.length} sub="of 30" />
        <Stat label="Still open" value={nights.reduce((a, x) => a + x.open, 0)} sub="not yet resolved" href="/ai/exceptions?type=SHORTAGE" />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Supply shortages per night" subtitle="SHORTAGE exceptions raised when confirmed demand exceeded committed supply." />
        {nights.length === 0 ? <CardBody><Empty title="No shortages in the last 30 nights" /></CardBody> : (
          <ul className="divide-y divide-border">
            {nights.map((n) => (
              <li key={n.night} className="grid gap-2 px-4 py-3 sm:grid-cols-[140px_1fr]">
                <div>
                  <div className="text-sm font-medium text-text">{date(n.night)}</div>
                  <div className="mt-1 flex items-center gap-2"><Bar value={n.count} max={max} tone="short" className="w-20" /><span className="num text-xs text-muted">{n.count}</span></div>
                </div>
                <ul className="space-y-1">
                  {n.items.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <StatusBadge status={i.severity} />
                      {i.href ? <Link href={i.href} className="text-text hover:text-accent">{i.title}</Link> : <span className="text-text">{i.title}</span>}
                      {i.status !== "RESOLVED" && <Badge tone="info">{i.status.toLowerCase()}</Badge>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Surplus & markdown
async function Surplus({ app }: { app: AppContext }) {
  const s = await surplusAndMarkdown(app.org.id, app.marketDate, 30);
  const approved = s.markdowns.filter((m) => m.status === "APPROVED" || m.status === "MODIFIED");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Surplus alerts" value={s.exceptions.length} sub="last 30 nights" tone={s.exceptions.length ? "surplus" : "ok"} />
        <Stat label="Markdowns proposed" value={s.markdowns.length} sub="APPLY_DISCOUNT approvals" />
        <Stat label="Markdowns approved" value={approved.length} sub={`${kgNum(approved.reduce((a, m) => a + (m.kg ?? 0), 0), 0)} kg offered`} tone="ok" />
        <Stat label="Pending decision" value={s.markdowns.filter((m) => m.status === "PENDING").length} sub="in approval inbox" href="/ai/approvals" />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Markdown proposals" subtitle="Discounted flash offers proposed by the Surplus Clearance Agent. Never below the floor price; every offer needs approval." />
        <Table className="min-w-[760px]">
          <THead><tr><TH>Requested</TH><TH>Species</TH><TH align="right">kg</TH><TH align="right">Offer S$/kg</TH><TH align="right">Floor S$/kg</TH><TH>Status</TH><TH>Decided by</TH></tr></THead>
          <tbody>
            {s.markdowns.map((m) => (
              <TR key={m.id}>
                <TD className="num whitespace-nowrap text-xs text-text-2">{dateTime(m.requestedAt)}</TD>
                <TD className="text-text">{m.species ?? m.title}</TD>
                <TD num>{kgNum(m.kg)}</TD>
                <TD num className="text-text">{sgd(m.toPrice)}</TD>
                <TD num className="text-muted">{sgd(m.floorPrice)}</TD>
                <TD><StatusBadge status={m.status} /></TD>
                <TD className="text-xs text-text-2">{m.decidedBy ?? "—"}</TD>
              </TR>
            ))}
            {s.markdowns.length === 0 && <None>No markdowns proposed in the last 30 nights.</None>}
          </tbody>
        </Table>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Surplus alerts" subtitle="SURPLUS exceptions: stock at risk of going unsold." />
        <Table className="min-w-[640px]">
          <THead><tr><TH>Night</TH><TH>Alert</TH><TH>Severity</TH><TH>Status</TH></tr></THead>
          <tbody>
            {s.exceptions.map((e) => (
              <TR key={e.id}>
                <TD className="whitespace-nowrap text-text-2">{date(e.night)}</TD>
                <TD>{e.href ? <Link href={e.href} className="text-text hover:text-accent">{e.title}</Link> : e.title}<div className="text-[11px] text-muted">{e.resolution_note ?? e.detail}</div></TD>
                <TD><StatusBadge status={e.severity} /></TD>
                <TD><StatusBadge status={e.status} /></TD>
              </TR>
            ))}
            {s.exceptions.length === 0 && <None>No surplus alerts in the last 30 nights.</None>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Waste
async function Waste({ app }: { app: AppContext }) {
  const rows = await wasteBySpecies(app.org.id, app.marketDate, 30);
  const tot = (k: "waste" | "reject" | "trim" | "total") => rows.reduce((a, x) => a + x[k], 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Total loss" value={`${kgNum(tot("total"))} kg`} sub="last 30 nights" tone={tot("total") ? "short" : "ok"} />
        <Stat label="Rejected at receiving" value={`${kgNum(tot("reject"))} kg`} sub="REJECT movements" />
        <Stat label="Written off" value={`${kgNum(tot("waste"))} kg`} sub="WASTE movements" />
        <Stat label="Processing trim" value={`${kgNum(tot("trim"))} kg`} sub="gutting / filleting waste" />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Waste & shrinkage by species" subtitle="Inventory movements of type WASTE and REJECT plus WASTE transformations, for lots on the last 30 market nights." />
        <Table className="min-w-[760px]">
          <THead><tr><TH>Species</TH><TH align="right">Rejected kg</TH><TH align="right">Written-off kg</TH><TH align="right">Trim kg</TH><TH align="right">Total kg</TH><TH align="right">Received kg</TH><TH align="right">% of received</TH></tr></THead>
          <tbody>
            {rows.map((x) => (
              <TR key={x.speciesId ?? x.species}>
                <TD className="text-text">{x.species}</TD>
                <TD num>{kgNum(x.reject)}</TD>
                <TD num>{kgNum(x.waste)}</TD>
                <TD num>{kgNum(x.trim)}</TD>
                <TD num className="font-semibold text-text">{kgNum(x.total)}</TD>
                <TD num className="text-text-2">{kgNum(x.received)}</TD>
                <TD num className={x.pctOfReceived !== null && x.pctOfReceived > 5 ? "text-short" : "text-text-2"}>{x.pctOfReceived === null ? "—" : pct(x.pctOfReceived, 1)}</TD>
              </TR>
            ))}
            {rows.length === 0 && <None>No waste, rejections or trim recorded in the last 30 nights.</None>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ On-time delivery
async function Delivery({ app }: { app: AppContext }) {
  const rows = await onTimeDelivery(app.org.id, app.marketDate, 30);
  const timed = rows.reduce((a, x) => a + x.timed, 0);
  const on = rows.reduce((a, x) => a + x.onTime, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="On-time rate" value={timed ? pct((on / timed) * 100, 1) : "—"} sub={`${on} of ${timed} timed stops`} tone={timed && on / timed < 0.9 ? "late" : "ok"} />
        <Stat label="Stops" value={rows.reduce((a, x) => a + x.stops, 0)} sub="last 30 nights" />
        <Stat label="Late stops" value={timed - on} sub="arrived after window end" tone={timed - on ? "late" : undefined} />
        <Stat label="Failed deliveries" value={rows.reduce((a, x) => a + x.failed, 0)} sub="stop status FAILED" />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="On-time delivery by customer" subtitle="Actual arrival vs the end of the customer's delivery window. Stops without an arrival or window are not counted as timed." action={<Link href="/operations/routes" className="text-xs text-accent">Routes →</Link>} />
        <Table className="min-w-[720px]">
          <THead><tr><TH>Customer</TH><TH align="right">Stops</TH><TH align="right">Timed</TH><TH align="right">On time</TH><TH align="right">On-time %</TH><TH className="w-32" /><TH align="right">Avg late by</TH><TH align="right">Failed</TH></tr></THead>
          <tbody>
            {rows.map((x) => (
              <TR key={x.customerId}>
                <TD className="text-text">{x.customer}</TD>
                <TD num>{x.stops}</TD>
                <TD num className="text-text-2">{x.timed}</TD>
                <TD num>{x.onTime}</TD>
                <TD num className={x.onTimePct !== null && x.onTimePct < 90 ? "font-semibold text-late" : "text-ok"}>{x.onTimePct === null ? "—" : pct(x.onTimePct)}</TD>
                <TD><Bar value={x.onTimePct ?? 0} max={100} tone={x.onTimePct !== null && x.onTimePct < 90 ? "surplus" : "ok"} /></TD>
                <TD num className="text-text-2">{x.avgLateMin === null ? "—" : `${Math.round(x.avgLateMin)} min`}</TD>
                <TD num className={x.failed ? "text-short" : "text-muted"}>{x.failed}</TD>
              </TR>
            ))}
            {rows.length === 0 && <None>No delivery stops in the last 30 nights.</None>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Invoice exceptions
async function Invoices({ app }: { app: AppContext }) {
  const s = await invoiceExceptionSummary(app.org.id);
  const c = (k: string) => s.counts.find((x) => x.status === k) ?? { count: 0, total: 0, overbilling: 0 };
  const all = s.counts.reduce((a, x) => a + x.count, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Supplier invoices" value={all} sub={`${c("MATCHED").count} matched exactly`} />
        <Stat label="Open exceptions" value={c("EXCEPTION").count} sub={`${sgd(c("EXCEPTION").overbilling)} potential overbilling`} tone={c("EXCEPTION").count ? "short" : "ok"} href="/finance/reconciliation" />
        <Stat label="Approved exceptions" value={c("APPROVED_EXCEPTION").count} sub={`${sgd(c("APPROVED_EXCEPTION").overbilling)} accepted over receipt`} tone="spike" />
        <Stat label="Within tolerance" value={c("MATCH_WITHIN_TOLERANCE").count} sub="minor differences" tone="info" />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Invoices that did not match exactly" subtitle="Most recent 50 — exceptions, approved exceptions and within-tolerance matches. Overbilling is ex GST." action={<Link href="/finance/reconciliation" className="text-xs text-accent">Reconciliation →</Link>} />
        <Table className="min-w-[860px]">
          <THead><tr><TH>Invoice</TH><TH>Vendor</TH><TH>Date</TH><TH align="right">Total</TH><TH align="right">Overbilling</TH><TH>Status</TH><TH>Summary</TH></tr></THead>
          <tbody>
            {s.list.map((x) => (
              <TR key={x.id}>
                <TD className="whitespace-nowrap"><Link href={`/finance/reconciliation/${x.id}`} className="num text-accent hover:underline">{x.invoiceNumber}</Link></TD>
                <TD className="text-text">{x.vendor}</TD>
                <TD className="whitespace-nowrap text-text-2">{date(x.invoiceDate)}</TD>
                <TD num>{sgd(x.total)}</TD>
                <TD num className={x.over && x.over > 0 ? "font-semibold text-short" : "text-muted"}>{x.over && x.over > 0 ? sgd(x.over) : "—"}</TD>
                <TD><StatusBadge status={x.status === "APPROVED_EXCEPTION" ? "APPROVED EXCEPTION" : x.status} /></TD>
                <TD className="max-w-[320px] text-xs text-muted">{x.summary}</TD>
              </TR>
            ))}
            {s.list.length === 0 && <None>Every supplier invoice matched exactly.</None>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Traceability
async function Trace({ app }: { app: AppContext }) {
  const nights = [app.marketDate, addDays(app.marketDate, -1)];
  const rows = await traceabilityCompleteness(app.org.id, nights);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        {nights.map((d) => {
          const r = rows.find((x) => x.marketDate === d);
          return (
            <Card key={d}>
              <CardHeader title={d === app.marketDate ? `Tonight · ${date(d)}` : `Last night · ${date(d)}`} subtitle={r ? `${r.lots} confirmed source lot(s)` : "No confirmed lots"} action={<Link href="/trace" className="text-xs text-accent">Lot explorer →</Link>} />
              <CardBody className="space-y-3">
                {!r && <Empty title="No lots for this night" />}
                {r?.checks.map((c) => {
                  const p = c.den ? (c.num / c.den) * 100 : null;
                  return (
                    <div key={c.key}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                        <span className="text-text-2">{c.label}</span>
                        <span className="num"><span className={cn("font-semibold", p === null ? "text-muted" : p >= 99.5 ? "text-ok" : p >= 80 ? "text-surplus" : "text-short")}>{p === null ? "n/a" : pct(p)}</span> <span className="text-muted">{c.num}/{c.den}</span></span>
                      </div>
                      <Bar value={c.num} max={c.den || 1} tone={p === null ? "accent" : p >= 99.5 ? "ok" : p >= 80 ? "surplus" : "short"} />
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          );
        })}
      </div>
      <Note>Source lots only (processed child lots inherit from their parent). Receipt and temperature are measured over lots already received; downstream customer link over lots with stock allocated to a buyer (including via processed child lots). Tonight&apos;s figures fill in as the night progresses.</Note>
    </div>
  );
}
