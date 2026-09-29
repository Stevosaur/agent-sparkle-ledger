import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { inventoryLedger, inventoryPosition } from "@/lib/services/queries-ops";
import { PageHeader, Empty, Stat } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { LiveRefresh } from "@/components/app/live-refresh";
import { date, dateTime, kg, kgNum, sgd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Tone } from "@/components/ui/badge";

export const metadata = { title: "Inventory" };

const PAGE_SIZE = 50;
const TYPES = ["RECEIPT", "REJECT", "ALLOCATE", "DEALLOCATE", "PICK", "DISPATCH", "TRANSFORM_OUT", "TRANSFORM_IN", "WASTE", "ADJUSTMENT"] as const;
const typeTone: Record<string, Tone> = { RECEIPT: "ok", REJECT: "short", ALLOCATE: "info", DEALLOCATE: "surplus", PICK: "info", DISPATCH: "neutral", TRANSFORM_OUT: "spike", TRANSFORM_IN: "spike", WASTE: "short", ADJUSTMENT: "late" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ page?: string; type?: string }> }) {
  const app = await requireApp("supply.view");
  const sp = await searchParams;
  const type = TYPES.includes(sp.type as (typeof TYPES)[number]) ? sp.type : undefined;
  const requested = Math.max(1, Math.floor(Number(sp.page) || 1));
  const [position, first] = await Promise.all([inventoryPosition(app.org.id, app.marketDate, 2), inventoryLedger(app.org.id, requested, PAGE_SIZE, { type })]);
  const pages = Math.max(1, Math.ceil(first.total / PAGE_SIZE));
  const page = Math.min(requested, pages);
  // Out-of-range page numbers fall back to the last page.
  const ledger = page === requested ? first : await inventoryLedger(app.org.id, page, PAGE_SIZE, { type });

  const bySpecies = new Map<string, typeof position>();
  for (const r of position) bySpecies.set(r.speciesName, [...(bySpecies.get(r.speciesName) ?? []), r]);
  const tonightKg = position.filter((r) => r.marketDate === app.marketDate).reduce((a, r) => a + r.availableKg + r.allocatedKg, 0);
  const carryKg = position.filter((r) => r.marketDate !== app.marketDate).reduce((a, r) => a + r.availableKg + r.allocatedKg, 0);
  const availKg = position.reduce((a, r) => a + r.availableKg, 0);
  const value = position.reduce((a, r) => a + r.costValue, 0);

  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (n > 1) p.set("page", String(n));
    if (type) p.set("type", type);
    const s = p.toString();
    return `/supply/inventory${s ? `?${s}` : ""}#ledger`;
  };
  const typeHref = (t?: string) => (t ? `/supply/inventory?type=${t}#ledger` : "/supply/inventory#ledger");

  return (
    <div>
      <LiveRefresh seconds={30} />
      <PageHeader eyebrow={`Supply · ${date(app.marketDate)}`} title="Inventory" subtitle="On-hand stock (available + allocated) by species and warehouse location, for tonight and carry-over from the previous two nights, with the full movement ledger." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="On hand — tonight" value={kg(tonightKg, 0)} />
        <Stat label="Carry-over (2 nights)" value={kg(carryKg, 0)} tone={carryKg > 0 ? "surplus" : undefined} sub={carryKg > 0 ? "sell or process first" : "none"} />
        <Stat label="Unallocated" value={kg(availKg, 0)} tone={availKg > 0 ? "info" : undefined} />
        <Stat label="Unallocated at cost" value={sgd(value)} sub="agreed cost × available kg" />
      </div>

      <Card className="mb-5">
        <CardHeader title="Position by species & location" subtitle="Carry-over rows are older stock still on hand — check freshness before allocating." />
        {position.length === 0 ? (
          <div className="p-4"><Empty title="No stock on hand">Received lots appear here until they are dispatched.</Empty></div>
        ) : (
          <Table className="min-w-[860px]" data-testid="inventory-position">
            <THead>
              <tr><TH>Species</TH><TH>Night</TH><TH>Location</TH><TH align="right">Lots</TH><TH align="right">Available</TH><TH align="right">Allocated</TH><TH align="right">On hand</TH><TH align="right">Oldest receipt</TH></tr>
            </THead>
            <tbody>
              {[...bySpecies.entries()].map(([name, rs]) => {
                const t = rs.reduce((a, r) => ({ av: a.av + r.availableKg, al: a.al + r.allocatedKg, n: a.n + r.lots }), { av: 0, al: 0, n: 0 });
                return rs.map((r, i) => {
                  const carry = r.marketDate !== app.marketDate;
                  return (
                    <TR key={`${name}-${r.marketDate}-${r.locCode}`} className={cn(i === 0 && "border-t-2 border-t-border")}>
                      <TD>
                        {i === 0 ? (
                          <div>
                            {r.speciesId ? <Link href={`/market/${r.speciesId}`} className="font-medium text-text hover:text-accent">{name}</Link> : <span className="font-medium text-text">{name}</span>}
                            {rs.length > 1 && <div className="num text-[10px] text-muted">{t.n} lots · {kgNum(t.av + t.al)} kg total</div>}
                          </div>
                        ) : null}
                      </TD>
                      <TD className="whitespace-nowrap text-xs">{carry ? <Badge tone="surplus">{date(r.marketDate)}</Badge> : <span className="text-text-2">Tonight</span>}</TD>
                      <TD className="text-xs text-text-2"><span className="num">{r.locCode ?? "—"}</span>{r.locName && <span className="text-muted"> · {r.locName}</span>}</TD>
                      <TD num className="text-text-2">{r.lots}</TD>
                      <TD num className={r.availableKg > 0 ? "text-ok" : "text-muted"}>{kgNum(r.availableKg)}</TD>
                      <TD num className="text-text-2">{kgNum(r.allocatedKg)}</TD>
                      <TD num className="font-semibold text-text">{kgNum(r.availableKg + r.allocatedKg)}</TD>
                      <TD num className="text-xs text-muted">{dateTime(r.oldestReceived)}</TD>
                    </TR>
                  );
                });
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card id="ledger">
        <CardHeader title="Movement ledger" subtitle={`${ledger.total.toLocaleString("en-SG")} movement(s), newest first. Signed kg: + into stock / reservation released, − out of stock / reserved.`} />
        <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5">
          <Link href={typeHref()} className={cn("rounded-md border px-2 py-0.5 text-[11px]", !type ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2")}>All</Link>
          {TYPES.map((t) => <Link key={t} href={typeHref(t)} className={cn("rounded-md border px-2 py-0.5 text-[11px]", type === t ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2")}>{t.replaceAll("_", " ").toLowerCase()}</Link>)}
        </div>
        {ledger.rows.length === 0 ? (
          <div className="p-4"><Empty title="No movements" /></div>
        ) : (
          <Table className="min-w-[900px]" data-testid="inventory-ledger">
            <THead>
              <tr><TH>Time</TH><TH>Type</TH><TH>Lot</TH><TH>Species</TH><TH align="right">Kg</TH><TH align="right">Available after</TH><TH>Location</TH><TH>Ref</TH><TH>Actor</TH></tr>
            </THead>
            <tbody>
              {ledger.rows.map(({ m, l, loc }) => {
                const q = Number(m.quantityKg);
                return (
                  <TR key={m.id}>
                    <TD className="num whitespace-nowrap text-xs text-text-2">{dateTime(m.at)}</TD>
                    <TD><Badge tone={typeTone[m.type] ?? "neutral"}>{m.type.replaceAll("_", " ")}</Badge></TD>
                    <TD><Link href={`/supply/lots/${l.id}`} className="num whitespace-nowrap text-xs text-accent hover:underline">{l.lotNumber}</Link></TD>
                    <TD className="text-xs text-text">{l.species ?? "—"} <span className="text-muted">· {l.processingState.toLowerCase()}</span></TD>
                    <TD num className={cn("font-semibold", q > 0 ? "text-ok" : q < 0 ? "text-short" : "text-muted")}>{q > 0 ? "+" : q < 0 ? "−" : ""}{kgNum(Math.abs(q))}</TD>
                    <TD num className="text-text-2">{kgNum(m.availableAfterKg)}</TD>
                    <TD className="num text-xs text-muted">{loc?.code ?? "—"}</TD>
                    <TD className="text-[11px] text-muted">{m.refType?.replaceAll("_", " ") ?? "—"}</TD>
                    <TD className="max-w-[180px] truncate text-xs text-text-2" title={m.actor ?? undefined}>{m.actor ?? "—"}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
        <nav className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs" aria-label="Ledger pagination">
          <span className="num text-muted">Page {page} of {pages} · rows {ledger.total ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, ledger.total)}</span>
          <div className="flex gap-1.5">
            {page > 1 ? <Link href={pageHref(page - 1)} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-text-2 hover:bg-panel-2" data-testid="ledger-prev"><ChevronLeft className="size-3.5" /> Newer</Link> : <span className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-muted opacity-50"><ChevronLeft className="size-3.5" /> Newer</span>}
            {page < pages ? <Link href={pageHref(page + 1)} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-text-2 hover:bg-panel-2" data-testid="ledger-next">Older <ChevronRight className="size-3.5" /></Link> : <span className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-muted opacity-50">Older <ChevronRight className="size-3.5" /></span>}
          </div>
        </nav>
      </Card>
    </div>
  );
}
