import Link from "next/link";
import { requireApp } from "@/lib/auth/session";
import { getMarket } from "@/lib/services/market";
import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { LiveRefresh } from "@/components/app/live-refresh";
import { ActionButton } from "@/components/app/action-button";
import { runProcurementAction } from "@/app/actions";
import { kgNum, perKg, date } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tonight's Market" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "short", label: "Short" },
  { key: "surplus", label: "Surplus" },
  { key: "late", label: "Late supply" },
  { key: "spike", label: "Price spike" },
];

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const app = await requireApp("market.view");
  const f = (await searchParams).f ?? "all";
  const all = await getMarket(app.org.id, app.marketDate);
  const rows = all
    .filter((r) => f === "all" || (f === "short" && r.balance === "SHORTAGE") || (f === "surplus" && r.balance === "SURPLUS") || (f === "late" && r.flags.includes("LATE SUPPLY")) || (f === "spike" && r.flags.includes("PRICE SPIKE")))
    .sort((a, b) => (a.balance === "SHORTAGE" ? a.gapKg : a.balance === "SURPLUS" ? 1000 - a.gapKg : 500) - (b.balance === "SHORTAGE" ? b.gapKg : b.balance === "SURPLUS" ? 1000 - b.gapKg : 500));
  const tot = (k: "expectedKg" | "landedKg" | "demandKg" | "allocatedKg" | "availableKg" | "offeredKg") => all.reduce((a, r) => a + r[k], 0);

  return (
    <div>
      <LiveRefresh seconds={15} />
      <PageHeader
        eyebrow={<span className="flex items-center gap-2"><span className="live-dot size-1.5 rounded-full bg-ok" /> Live · {date(app.marketDate)}</span>}
        title="Tonight's Market"
        subtitle="Every species on the floor tonight: what's coming in, what's landed, what buyers want, and where we stand. Click a species for suppliers, lots, buyers, quotes, allocations, prices and the AI recommendation."
        actions={app.can("procurement.write") ? <ActionButton variant="primary" action={runProcurementAction}>Run procurement agent</ActionButton> : undefined}
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((x) => {
          const n = x.key === "all" ? all.length : all.filter((r) => (x.key === "short" && r.balance === "SHORTAGE") || (x.key === "surplus" && r.balance === "SURPLUS") || (x.key === "late" && r.flags.includes("LATE SUPPLY")) || (x.key === "spike" && r.flags.includes("PRICE SPIKE"))).length;
          return (
            <Link key={x.key} href={x.key === "all" ? "/market" : `/market?f=${x.key}`} className={cn("rounded-md border px-2.5 py-1 text-xs", f === x.key ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2")}>
              {x.label} <span className="num ml-1 text-muted">{n}</span>
            </Link>
          );
        })}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm" data-testid="market-table">
            <thead className="bg-panel-2">
              <tr className="text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 text-left font-semibold">Species</th>
                <th className="px-3 py-2.5 text-right font-semibold">Expected kg</th>
                <th className="px-3 py-2.5 text-right font-semibold">Landed kg</th>
                <th className="px-3 py-2.5 text-right font-semibold">Demand kg</th>
                <th className="px-3 py-2.5 text-right font-semibold">Allocated kg</th>
                <th className="px-3 py-2.5 text-right font-semibold">Available kg</th>
                <th className="px-3 py-2.5 text-right font-semibold">W. avg cost</th>
                <th className="px-3 py-2.5 text-right font-semibold">Indic. sell</th>
                <th className="px-4 py-2.5 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.speciesId} className="group border-t border-border hover:bg-panel-2">
                  <td className="px-4 py-2.5">
                    <Link href={`/market/${r.speciesId}`} className="block" data-testid={`market-row-${r.code}`}>
                      <div className="font-medium text-text group-hover:text-accent">{r.name}</div>
                      <div className="text-[11px] text-muted">{[r.localName, r.code].filter(Boolean).join(" · ")}{r.offeredKg > 0 && <span className="ml-1 text-info">· {kgNum(r.offeredKg, 0)} kg offered</span>}</div>
                    </Link>
                  </td>
                  <td className="num px-3 py-2.5 text-right text-text-2">{kgNum(r.expectedKg)}</td>
                  <td className="num px-3 py-2.5 text-right text-text">{kgNum(r.landedKg)}</td>
                  <td className="num px-3 py-2.5 text-right font-semibold text-text">{kgNum(r.demandKg)}</td>
                  <td className="num px-3 py-2.5 text-right text-text-2">{kgNum(r.allocatedKg)}</td>
                  <td className="num px-3 py-2.5 text-right text-text-2">{kgNum(r.availableKg)}</td>
                  <td className="num px-3 py-2.5 text-right text-text-2">{perKg(r.wavgCost)}</td>
                  <td className="num px-3 py-2.5 text-right text-text-2">{perKg(r.indicativeSell)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={r.balance === "SHORTAGE" ? "short" : r.balance === "SURPLUS" ? "surplus" : "ok"} className="num">{r.statusLabel}</Badge>
                      {r.flags.map((fl) => <Badge key={fl} tone={fl === "LATE SUPPLY" ? "late" : "spike"}>{fl}</Badge>)}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-muted">Nothing matches this filter.</td></tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-border-strong bg-panel-2">
              <tr className="text-xs font-semibold text-text">
                <td className="px-4 py-2.5">{all.length} species</td>
                <td className="num px-3 py-2.5 text-right">{kgNum(tot("expectedKg"), 0)}</td>
                <td className="num px-3 py-2.5 text-right">{kgNum(tot("landedKg"), 0)}</td>
                <td className="num px-3 py-2.5 text-right">{kgNum(tot("demandKg"), 0)}</td>
                <td className="num px-3 py-2.5 text-right">{kgNum(tot("allocatedKg"), 0)}</td>
                <td className="num px-3 py-2.5 text-right">{kgNum(tot("availableKg"), 0)}</td>
                <td colSpan={3} className="px-3 py-2.5 text-right text-muted">+{kgNum(tot("offeredKg"), 0)} kg offered by suppliers, not yet bought</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted">Expected = purchased supply not yet received. Landed = accepted weight of received lots. Available = unallocated stock on hand. Costs and prices are calculated only from PasarCatch records. Tolerance: ±5% or 3 kg.</p>
    </div>
  );
}
