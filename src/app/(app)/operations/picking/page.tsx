import Link from "next/link";
import { requireApp } from "@/lib/auth/session";
import { ordersForNight } from "@/lib/services/queries";
import { pickListsForNight, unpickedAllocationCount } from "@/lib/services/queries-ops";
import { generatePickListAction, pickAndPackAction } from "@/app/actions";
import { PageHeader, Stat, Empty } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ActionButton } from "@/components/app/action-button";
import { LiveRefresh } from "@/components/app/live-refresh";
import { dateTime, kg, kgNum, time } from "@/lib/format";
import { NightPicker, PastNightNote, resolveNight } from "../_night";

export const metadata = { title: "Picking & Packing" };

export default async function PickingPage({ searchParams }: { searchParams: Promise<{ night?: string }> }) {
  const app = await requireApp("ops.view");
  const night = resolveNight((await searchParams).night, app.marketDate);
  const isTonight = night === app.marketDate;
  const canAct = app.can("ops.dispatch");
  const [lists, orders, unpicked] = await Promise.all([pickListsForNight(app.org.id, night), ordersForNight(app.org.id, night), unpickedAllocationCount(app.org.id, night)]);

  // Group every pick line of the night by sales order.
  type Line = (typeof lists)[number]["lines"][number] & { pickListNumber: string };
  const byOrder = new Map<string, { so: Line["so"]; c: Line["c"]; lines: Line[] }>();
  for (const pl of lists) for (const ln of pl.lines) {
    const e = byOrder.get(ln.so.id) ?? { so: ln.so, c: ln.c, lines: [] };
    e.lines.push({ ...ln, pickListNumber: pl.list.pickListNumber });
    byOrder.set(ln.so.id, e);
  }
  const picking = [...byOrder.values()].filter((o) => o.lines.some((l) => l.pl.status !== "PACKED")).sort((a, b) => (a.c.deliveryWindowStart ?? "99").localeCompare(b.c.deliveryWindowStart ?? "99"));
  const waiting = orders.filter((o) => ["ALLOCATED", "PARTIALLY_ALLOCATED"].includes(o.so.status));
  const awaitingAlloc = orders.filter((o) => o.so.status === "CONFIRMED");
  const packed = orders.filter((o) => ["PACKED", "DISPATCHED", "DELIVERED", "INVOICED"].includes(o.so.status));
  const pendingKg = lists.flatMap((l) => l.lines).filter((l) => l.pl.status === "PENDING").reduce((a, l) => a + Number(l.pl.quantityKg), 0);
  const packedByOrder = (soId: string) => byOrder.get(soId)?.lines ?? [];

  return (
    <div>
      <LiveRefresh seconds={20} />
      <PageHeader
        eyebrow="Operations"
        title="Picking & Packing"
        subtitle="Turn confirmed allocations into pick lists, pick each lot to the order and pack it for dispatch. Every pick is recorded against the lot for traceability."
        actions={
          <>
            <NightPicker path="/operations/picking" night={night} tonight={app.marketDate} />
            {isTonight && canAct && (
              <ActionButton variant="primary" size="lg" action={generatePickListAction} disabled={unpicked.n === 0} data-testid="generate-pick-list" title={unpicked.n === 0 ? "No confirmed allocations waiting for a pick list" : undefined}>
                Generate pick list{unpicked.n > 0 && <span className="num opacity-80">· {unpicked.n}</span>}
              </ActionButton>
            )}
          </>
        }
      />
      {!isTonight && <PastNightNote night={night} path="/operations/picking" />}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Allocations not on a list" value={unpicked.n} sub={unpicked.n ? kg(unpicked.kg, 1) : "all listed"} tone={unpicked.n ? "surplus" : "ok"} />
        <Stat label="To pick" value={kg(pendingKg, 1)} sub={`${picking.length} order(s) in progress`} tone={pendingKg > 0 ? "info" : undefined} />
        <Stat label="Waiting (allocated)" value={waiting.length} sub={awaitingAlloc.length ? `${awaitingAlloc.length} confirmed, not yet allocated` : "orders ready to list"} href={awaitingAlloc.length ? "/procurement/allocations" : undefined} />
        <Stat label="Packed" value={packed.length} sub={`of ${orders.length} order(s)`} tone={packed.length && packed.length === orders.length ? "ok" : undefined} />
      </div>

      <Card className="mb-4">
        <CardHeader title="Pick lists" subtitle={lists.length ? `${lists.length} list(s) for this night` : "No pick lists yet"} />
        <CardBody className="space-y-2">
          {lists.length === 0 && (
            <Empty title="No pick lists yet">
              {unpicked.n ? `${unpicked.n} confirmed allocation(s) are ready — generate a pick list to start picking.` : awaitingAlloc.length ? `${awaitingAlloc.length} order(s) are confirmed but not allocated yet. Allocate stock first in Procurement → Allocations.` : "Pick lists are generated once buyer orders are allocated to lots."}
            </Empty>
          )}
          {lists.map(({ list, lines }) => {
            const done = lines.filter((l) => l.pl.status !== "PENDING").length;
            return (
              <div key={list.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
                <span className="num text-sm font-semibold text-text">{list.pickListNumber}</span>
                <StatusBadge status={list.status} />
                <span className="text-xs text-muted">{lines.length} line(s) · {kgNum(lines.reduce((a, l) => a + Number(l.pl.quantityKg), 0))} kg · created {dateTime(list.createdAt)}{list.assignedTo && ` · ${list.assignedTo}`}</span>
                <div className="ml-auto flex min-w-[140px] items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-3"><div className="h-full rounded-full bg-ok" style={{ width: `${lines.length ? (done / lines.length) * 100 : 0}%` }} /></div>
                  <span className="num text-[11px] text-muted">{done}/{lines.length}</span>
                </div>
                {lines.length > 0 && (
                  <details className="w-full">
                    <summary className="cursor-pointer select-none text-xs text-accent">Lines by order</summary>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {[...new Map(lines.map((l) => [l.so.id, l])).values()].map((first) => (
                        <div key={first.so.id} className="rounded-md border border-border/70 bg-panel-2/40">
                          <div className="flex items-center gap-2 border-b border-border/70 px-3 py-1.5 text-xs">
                            <span className="num font-semibold text-text">{first.so.soNumber}</span>
                            <span className="truncate text-text-2">{first.c.name}</span>
                            <StatusBadge status={first.so.status} className="ml-auto" />
                          </div>
                          {lines.filter((l) => l.so.id === first.so.id).map((l) => (
                            <div key={l.pl.id} className="flex items-center gap-2 px-3 py-1 text-xs">
                              <Link href={`/supply/lots/${l.lot.id}`} className="num whitespace-nowrap text-accent hover:underline">{l.lot.lotNumber}</Link>
                              <span className="truncate text-text-2">{l.sp.name}</span>
                              <span className="num ml-auto text-text">{kgNum(l.pl.pickedKg ?? l.pl.quantityKg)} kg</span>
                              <StatusBadge status={l.pl.status} className="px-1 py-0 text-[9px]" />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </CardBody>
      </Card>

      {picking.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">To pick & pack · by delivery window</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {picking.map((o) => (
              <Card key={o.so.id} data-testid={`pick-order-${o.so.soNumber}`}>
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
                  <Link href={`/orders/${o.so.id}`} className="num text-sm font-semibold text-text hover:text-accent">{o.so.soNumber}</Link>
                  <span className="text-sm text-text-2">{o.c.name}</span>
                  {o.c.deliveryWindowStart && <Badge tone="neutral" mono>{o.c.deliveryWindowStart}–{o.c.deliveryWindowEnd}</Badge>}
                  <StatusBadge status={o.so.status} className="ml-auto" />
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="text-[10px] uppercase tracking-wide text-muted"><th className="px-4 py-1.5 text-left font-semibold">Lot</th><th className="px-2 py-1.5 text-left font-semibold">Species</th><th className="px-2 py-1.5 text-right font-semibold">Kg</th><th className="px-4 py-1.5 text-right font-semibold">Status</th></tr></thead>
                  <tbody>
                    {o.lines.map((l) => (
                      <tr key={l.pl.id} className="border-t border-border/60">
                        <td className="px-4 py-1.5"><Link href={`/supply/lots/${l.lot.id}`} className="num whitespace-nowrap text-xs text-accent hover:underline">{l.lot.lotNumber}</Link>{l.loc?.code && <span className="num ml-1 text-[10px] text-muted">@{l.loc.code}</span>}</td>
                        <td className="px-2 py-1.5 text-xs text-text">{l.sp.name} <span className="text-muted">· {l.lot.processingState.toLowerCase()}{l.lot.qualityGrade && ` · ${l.lot.qualityGrade}`}</span></td>
                        <td className="num px-2 py-1.5 text-right text-text">{kgNum(l.pl.pickedKg ?? l.pl.quantityKg)}</td>
                        <td className="px-4 py-1.5 text-right"><StatusBadge status={l.pl.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {canAct && (
                  <div className="border-t border-border px-4 py-2.5">
                    <ActionButton variant="success" size="lg" className="w-full" action={pickAndPackAction.bind(null, o.so.id)} data-testid={`pick-pack-${o.so.soNumber}`}>
                      Pick & pack {o.so.soNumber}
                    </ActionButton>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Waiting to be picked" subtitle="Allocated orders not yet on a pick list" />
          <CardBody className="space-y-1.5">
            {waiting.length === 0 && <p className="text-xs text-muted">{awaitingAlloc.length ? `${awaitingAlloc.length} order(s) confirmed but not allocated yet.` : "No allocated orders waiting."}</p>}
            {waiting.map((o) => (
              <div key={o.so.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                <Link href={`/orders/${o.so.id}`} className="num text-xs font-semibold text-text hover:text-accent">{o.so.soNumber}</Link>
                <span className="truncate text-xs text-text-2">{o.c.name}</span>
                <span className="num ml-auto text-xs text-muted">{kgNum(o.lines.reduce((a, l) => a + Number(l.l.allocatedKg), 0))} / {kgNum(o.lines.reduce((a, l) => a + Number(l.l.requestedKg), 0))} kg</span>
                <StatusBadge status={o.so.status} />
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Packed & beyond" subtitle="Ready for routing and dispatch" action={<Link href={isTonight ? "/operations/routes" : `/operations/routes?night=${night}`} className="text-xs text-accent">Routes →</Link>} />
          <CardBody className="space-y-1.5">
            {packed.length === 0 && <p className="text-xs text-muted">Nothing packed yet.</p>}
            {packed.map((o) => {
              const ls = packedByOrder(o.so.id);
              const last = ls.reduce<Date | null>((a, l) => (l.pl.packedAt && (!a || l.pl.packedAt > a) ? l.pl.packedAt : a), null);
              return (
                <div key={o.so.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                  <Link href={`/orders/${o.so.id}`} className="num text-xs font-semibold text-text hover:text-accent">{o.so.soNumber}</Link>
                  <span className="truncate text-xs text-text-2">{o.c.name}</span>
                  <span className="num ml-auto text-xs text-muted">{kgNum(o.lines.reduce((a, l) => a + Number(l.l.pickedKg), 0))} kg{last && ` · ${time(last)}`}</span>
                  <StatusBadge status={o.so.status} />
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
