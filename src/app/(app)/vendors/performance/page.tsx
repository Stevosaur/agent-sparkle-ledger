import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { vendorScorecards } from "@/lib/services/vendors";
import { PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { CountryTag, METRICS, metricTone, toneText, vendorTypeLabel, type MetricKey } from "../_shared";

export const metadata = { title: "Vendor Performance" };

type SortKey = MetricKey | "name" | "receipts";

export default async function VendorPerformancePage({ searchParams }: { searchParams: Promise<{ sort?: string; dir?: string; all?: string }> }) {
  const app = await requireApp("vendors.view");
  const sp = await searchParams;
  const valid: SortKey[] = ["name", "receipts", ...METRICS.map((m) => m.key)];
  const sort: SortKey = valid.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "name";
  const dir = sp.dir === "desc" ? "desc" : sp.dir === "asc" ? "asc" : sort === "name" ? "asc" : "desc";
  const showAll = sp.all === "1";

  const cards = await vendorScorecards(app.org.id, app.marketDate);
  const withData = cards.filter((c) => c.metrics.receipts > 0);
  const base = showAll ? cards : withData;
  const val = (c: (typeof cards)[number]): string | number | null => (sort === "name" ? c.vendor.name.toLowerCase() : sort === "receipts" ? c.metrics.receipts : c.metrics[sort]);
  const rows = [...base].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x === null && y === null) return a.vendor.name.localeCompare(b.vendor.name);
    if (x === null) return 1; // nulls always last
    if (y === null) return -1;
    const c = x < y ? -1 : x > y ? 1 : 0;
    return dir === "asc" ? c : -c;
  });

  const link = (k: SortKey) => {
    const p = new URLSearchParams();
    p.set("sort", k);
    p.set("dir", sort === k ? (dir === "asc" ? "desc" : "asc") : k === "name" ? "asc" : "desc");
    if (showAll) p.set("all", "1");
    return `/vendors/performance?${p}`;
  };
  const head = (k: SortKey, label: string, title?: string, left?: boolean) => (
    <th key={k} className={cn("whitespace-nowrap px-3 py-2.5 font-semibold", left ? "text-left" : "text-right")} title={title} aria-sort={sort === k ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={link(k)} className={cn("inline-flex items-center gap-1 hover:text-text", sort === k && "text-accent")} data-testid={`sort-${k}`}>
        {label}
        {sort === k && (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </Link>
    </th>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Vendors"
        title="Vendor Performance"
        subtitle="Scorecards computed from receiving records over the last 60 nights. Every metric is shown on its own — PasarCatch deliberately does not blend them into a single score, because a supplier that is late but always Grade A is a different decision from one that is punctual but short-weights."
      />
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ok" /> meets target</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-surplus" /> watch</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-short" /> below threshold</span>
        <span className="ml-auto">
          {showAll ? (
            <Link href={`/vendors/performance?sort=${sort}&dir=${dir}`} className="text-accent">Hide vendors without receipts</Link>
          ) : (
            <Link href={`/vendors/performance?sort=${sort}&dir=${dir}&all=1`} className="text-accent">Show all {cards.length} vendors ({cards.length - withData.length} without receipts)</Link>
          )}
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] text-sm" data-testid="scorecard-table">
            <thead className="bg-panel-2">
              <tr className="text-[11px] uppercase tracking-wide text-muted">
                {head("name", "Vendor", undefined, true)}
                {head("receipts", "Receipts", "Goods receipt lines in the window")}
                {METRICS.map((m) => head(m.key, m.short, `${m.label}: ${m.help}`))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ vendor: v, metrics }) => (
                <tr key={v.id} className="group border-t border-border hover:bg-panel-2">
                  <td className="px-3 py-2.5">
                    <Link href={`/vendors/${v.id}`} className="flex items-center gap-2">
                      <CountryTag code={v.country} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-text group-hover:text-accent">{v.name}</span>
                        <span className="block text-[11px] text-muted">{vendorTypeLabel(v.type)}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="num px-3 py-2.5 text-right text-text-2">{metrics.receipts}</td>
                  {METRICS.map((m) => {
                    const t = metricTone(m, metrics[m.key]);
                    return <td key={m.key} className={cn("num px-3 py-2.5 text-right", t ? toneText[t] : metrics[m.key] === null ? "text-muted" : "text-text-2")}>{m.fmt(metrics[m.key])}</td>;
                  })}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={METRICS.length + 2} className="px-4 py-10 text-center text-sm text-muted">No receiving records in the last 60 nights.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-1.5 text-[11px] text-muted sm:grid-cols-2 xl:grid-cols-3">
        {METRICS.map((m) => (
          <div key={m.key}>
            <dt className="inline font-semibold text-text-2">{m.label}:</dt> <dd className="inline">{m.help}.{m.good !== undefined && ` Target ${m.lowerIsBetter ? "≤" : "≥"} ${m.good}${m.key === "avgResponseMinutes" ? " min" : "%"}.`}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] text-muted">&quot;—&quot; means there is not enough data for that metric (e.g. no PO lines for fill rate, no RFQ replies for response time). Nulls always sort last.</p>
    </div>
  );
}
