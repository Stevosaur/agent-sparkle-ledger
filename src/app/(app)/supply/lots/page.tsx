import Link from "next/link";
import { CornerDownRight } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { lotsWithContext } from "@/lib/services/queries-ops";
import { PageHeader, Empty } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { LiveRefresh } from "@/components/app/live-refresh";
import { date, kgNum, perKg, time } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Available Lots" };

export default async function AvailableLotsPage({ searchParams }: { searchParams: Promise<{ species?: string; all?: string }> }) {
  const app = await requireApp("supply.view");
  const sp = await searchParams;
  const showAll = sp.all === "1";
  const [night, onHand] = await Promise.all([
    lotsWithContext(app.org.id, app.marketDate),
    lotsWithContext(app.org.id, app.marketDate, { onHandOnly: true }),
  ]);
  const base = showAll ? night : onHand;
  const speciesList = [...new Map(base.filter((x) => x.l.speciesId).map((x) => [x.l.speciesId!, x.l.canonicalSpeciesName ?? "—"])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const speciesId = speciesList.some(([id]) => id === sp.species) ? sp.species : undefined;
  const rows = base.filter((x) => !speciesId || x.l.speciesId === speciesId);
  const tempMax = app.org.settings.receivingTempMaxC;

  const q = (patch: { species?: string; all?: string }) => {
    const p = new URLSearchParams();
    const next = { species: speciesId, all: showAll ? "1" : undefined, ...patch };
    if (next.species) p.set("species", next.species);
    if (next.all) p.set("all", next.all);
    const s = p.toString();
    return s ? `/supply/lots?${s}` : "/supply/lots";
  };
  const chip = (active: boolean) => cn("rounded-md border px-2.5 py-1 text-xs", active ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2");
  const tot = (k: "quantityReceivedKg" | "quantityAvailableKg" | "quantityAllocatedKg") => rows.reduce((a, x) => a + Number(x.l[k] ?? 0), 0);

  return (
    <div>
      <LiveRefresh seconds={30} />
      <PageHeader
        eyebrow={`Supply · ${date(app.marketDate)}`}
        title="Available Lots"
        subtitle={showAll ? "Every lot of tonight's market, including expected, dispatched and rejected lots." : "Stock on hand tonight: lots with unallocated kg, or received and not yet dispatched. Child lots from gutting, filleting or splitting show their parent."}
        actions={
          <div className="inline-flex rounded-lg border border-border bg-panel p-0.5 text-xs">
            <Link href={q({ all: undefined })} className={cn("rounded-md px-3 py-1.5", !showAll ? "bg-panel-3 text-text" : "text-muted hover:text-text")}>On hand <span className="num text-muted">{onHand.length}</span></Link>
            <Link href={q({ all: "1" })} className={cn("rounded-md px-3 py-1.5", showAll ? "bg-panel-3 text-text" : "text-muted hover:text-text")} data-testid="lots-all">All tonight <span className="num text-muted">{night.length}</span></Link>
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Filter by species">
        <Link href={q({ species: undefined })} className={chip(!speciesId)}>All species <span className="num ml-1 text-muted">{base.length}</span></Link>
        {speciesList.map(([id, name]) => (
          <Link key={id} href={q({ species: id })} className={chip(speciesId === id)}>{name} <span className="num ml-1 text-muted">{base.filter((x) => x.l.speciesId === id).length}</span></Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty title={showAll ? "No lots recorded tonight" : "Nothing on hand yet"}>{showAll ? "Lots appear as suppliers declare catch." : "Stock appears here once lots are received. See Expected Catch for what is inbound."}</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm" data-testid="lots-table">
              <thead className="bg-panel-2">
                <tr className="text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 text-left font-semibold">Lot</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Species</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Vendor</th>
                  <th className="px-3 py-2.5 text-left font-semibold">State</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Grade</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Received</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Available</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Allocated</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Cost</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Received at</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Temp</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => {
                  const temp = x.l.temperatureAtReceivingC === null ? null : Number(x.l.temperatureAtReceivingC);
                  const avail = Number(x.l.quantityAvailableKg);
                  return (
                    <tr key={x.l.id} className="border-t border-border hover:bg-panel-2">
                      <td className="px-4 py-2.5">
                        <div className={cn("flex items-start gap-1", x.parent?.id && "pl-3")}>
                          {x.parent?.id && <CornerDownRight className="mt-0.5 size-3 shrink-0 text-muted" />}
                          <div>
                            <Link href={`/supply/lots/${x.l.id}`} className="num whitespace-nowrap text-xs font-medium text-accent hover:underline" data-testid={`lot-${x.l.lotNumber}`}>{x.l.lotNumber}</Link>
                            {x.parent?.id && <div className="num text-[10px] text-muted">from <Link href={`/supply/lots/${x.parent.id}`} className="hover:text-text">{x.parent.lotNumber}</Link></div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-text">{x.l.canonicalSpeciesName ?? "—"}</div>
                        {x.l.sizeGrade && <div className="text-[10px] text-muted">{x.l.sizeGrade}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-text-2">
                        {x.v?.id ? <Link href={`/vendors/${x.v.id}`} className="hover:text-accent">{x.v.name}</Link> : "—"}
                        {(x.vs?.name || x.fm?.name) && <div className="text-[10px] text-muted">{x.vs?.name ?? x.fm?.name}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-text-2">{x.l.processingState.toLowerCase()}{x.loc?.code && <div className="num text-[10px] text-muted">{x.loc.code}</div>}</td>
                      <td className="px-3 py-2.5 text-center">{x.l.qualityGrade ? <Badge tone={x.l.qualityGrade === "A" ? "ok" : x.l.qualityGrade === "B" ? "info" : x.l.qualityGrade === "C" ? "surplus" : "short"}>{x.l.qualityGrade}</Badge> : <span className="text-muted">—</span>}</td>
                      <td className="num px-3 py-2.5 text-right text-text-2">{kgNum(x.l.quantityReceivedKg)}</td>
                      <td className={cn("num px-3 py-2.5 text-right font-semibold", avail > 0 ? "text-ok" : "text-muted")}>{kgNum(avail)}</td>
                      <td className="num px-3 py-2.5 text-right text-text-2">{kgNum(x.l.quantityAllocatedKg)}</td>
                      <td className="num px-3 py-2.5 text-right text-text-2">{perKg(x.pol?.pricePerKg ?? x.l.agreedCostPerKg, x.l.currency)}</td>
                      <td className="num px-3 py-2.5 text-right text-xs text-text-2">{time(x.l.receivedTime)}</td>
                      <td className={cn("num px-3 py-2.5 text-right text-xs", temp !== null && temp > tempMax ? "font-semibold text-short" : "text-text-2")}>{temp === null ? "—" : `${temp.toFixed(1)}°C`}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={x.l.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-border-strong bg-panel-2">
                <tr className="text-xs font-semibold text-text">
                  <td className="px-4 py-2.5" colSpan={5}>{rows.length} lot(s)</td>
                  <td className="num px-3 py-2.5 text-right">{kgNum(tot("quantityReceivedKg"), 0)}</td>
                  <td className="num px-3 py-2.5 text-right text-ok">{kgNum(tot("quantityAvailableKg"), 0)}</td>
                  <td className="num px-3 py-2.5 text-right">{kgNum(tot("quantityAllocatedKg"), 0)}</td>
                  <td colSpan={4} className="px-3 py-2.5 text-right font-normal text-muted">Temp limit {tempMax}°C at receiving</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
