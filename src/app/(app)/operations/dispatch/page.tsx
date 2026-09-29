import Link from "next/link";
import { Thermometer, Truck, User } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { shipmentsForNight } from "@/lib/services/queries";
import { nightsWithRuns, ordersAwaitingRoute, shipmentExtras } from "@/lib/services/queries-ops";
import { dispatchAction } from "@/app/actions";
import { PageHeader, Stat, Empty } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ActionButton } from "@/components/app/action-button";
import { LiveRefresh } from "@/components/app/live-refresh";
import { kg, kgNum, time } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NightPicker, PastNightNote, resolveNight } from "../_night";
import { CompleteStopForm } from "./complete-stop";

export const metadata = { title: "Dispatch" };

export default async function DispatchPage({ searchParams }: { searchParams: Promise<{ night?: string }> }) {
  const app = await requireApp("ops.view");
  const night = resolveNight((await searchParams).night, app.marketDate);
  const isTonight = night === app.marketDate;
  const canAct = app.can("ops.dispatch");
  const [runs, nights, awaiting] = await Promise.all([shipmentsForNight(app.org.id, night), nightsWithRuns(app.org.id, app.marketDate), ordersAwaitingRoute(app.org.id, night)]);
  const extras = await shipmentExtras(app.org.id, runs.map((r) => r.sh.id));

  const stops = runs.flatMap((r) => r.stops);
  const delivered = stops.filter((s) => s.st.status === "DELIVERED").length;
  const isLate = (s: (typeof stops)[number]) => {
    const arr = s.st.actualArrivalAt ?? s.st.plannedArrivalAt;
    return !!(arr && s.st.windowEnd && arr.getTime() > s.st.windowEnd.getTime());
  };
  const lateStops = stops.filter(isLate).length;
  const tempFlags = extras.temps.filter((t) => t.isException || (t.thresholdMaxC !== null && Number(t.readingC) > Number(t.thresholdMaxC)));
  const awaitingN = awaiting.reduce((a, x) => a + x.n, 0);

  return (
    <div>
      <LiveRefresh seconds={15} />
      <PageHeader
        eyebrow="Operations"
        title="Dispatch"
        subtitle="Delivery runs for the night: load, driver, departure and every stop with its delivery window. Dispatch a run when the truck leaves; complete each stop with the receiver's name as proof of delivery."
        actions={
          <>
            <NightPicker path="/operations/dispatch" night={night} tonight={app.marketDate} extra={nights.slice(0, 4)} />
            <Link href={isTonight ? "/operations/routes" : `/operations/routes?night=${night}`} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-text-2 hover:bg-panel-2">Route board</Link>
          </>
        }
      />
      {!isTonight && <PastNightNote night={night} path="/operations/dispatch" />}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Runs" value={runs.length} sub={`${runs.filter((r) => r.sh.status === "DISPATCHED").length} on the road · ${runs.filter((r) => r.sh.status === "COMPLETED").length} completed`} />
        <Stat label="Stops delivered" value={`${delivered}/${stops.length}`} tone={stops.length && delivered === stops.length ? "ok" : undefined} />
        <Stat label="Late vs window" value={lateStops} sub="arrival after window end" tone={lateStops ? "late" : "ok"} />
        <Stat label="Temp exceptions" value={tempFlags.length} sub={extras.temps.length ? `${extras.temps.length} vehicle reading(s)` : "no vehicle readings logged"} tone={tempFlags.length ? "short" : undefined} />
      </div>

      {runs.length === 0 && (
        <Empty title={`No delivery runs ${isTonight ? "tonight yet" : "for this night"}`}>
          {awaitingN > 0 ? <>{awaitingN} order(s) are ready for routing. Plan runs on the <Link href="/operations/routes" className="text-accent">Route board</Link>.</> : isTonight ? "Runs are planned after orders are picked and packed (usually ≈05:00). Use the night switcher to review last night's runs." : "No runs were planned on this night."}
        </Empty>
      )}

      <div className="space-y-4">
        {runs.map((r) => {
          const cap = Number(r.v?.capacityKg ?? 0);
          const load = Number(r.sh.totalKg);
          const util = cap ? (load / cap) * 100 : 0;
          const vt = extras.temps.filter((t) => t.shipmentId === r.sh.id);
          const vtEx = vt.filter((t) => t.isException || (t.thresholdMaxC !== null && Number(t.readingC) > Number(t.thresholdMaxC)));
          const done = r.stops.filter((s) => s.st.status === "DELIVERED").length;
          return (
            <Card key={r.sh.id} data-testid={`run-${r.sh.shipmentNumber}`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Truck className="size-4 text-info" />
                  <span className="num text-sm font-semibold text-text">{r.sh.shipmentNumber}</span>
                  <StatusBadge status={r.sh.status} />
                  {vtEx.length > 0 && <Badge tone="short"><Thermometer className="size-3" /> Temp</Badge>}
                  {r.stops.some(isLate) && <Badge tone="late">Late stop</Badge>}
                </div>
                <div className="text-xs text-text-2">{r.v ? <>{r.v.name} <span className="num text-muted">{r.v.plate}</span>{r.v.refrigerated && <span className="text-muted"> · reefer {r.v.tempMinC}–{r.v.tempMaxC}°C</span>}</> : "No vehicle"}</div>
                <div className="flex items-center gap-1 text-xs text-text-2"><User className="size-3.5 text-muted" />{r.d?.name ?? "Unassigned"}{r.d?.phone && <span className="num text-muted"> · {r.d.phone}</span>}</div>
                <div className="ml-auto flex items-center gap-3">
                  <div className="text-right text-[11px] text-muted">
                    <div>Depart <span className="num text-text">{time(r.sh.plannedDepartureAt)}</span>{r.sh.actualDepartureAt && <> · left <span className="num text-text">{time(r.sh.actualDepartureAt)}</span></>}</div>
                    <div className="num">{r.sh.distanceKm ? `${Number(r.sh.distanceKm)} km` : "—"} · {r.sh.durationMin ? `${r.sh.durationMin} min` : "—"}</div>
                  </div>
                  {canAct && (r.sh.status === "PLANNED" || r.sh.status === "LOADING") && (
                    <ActionButton variant="primary" size="lg" action={dispatchAction.bind(null, r.sh.id)} confirm={`Dispatch ${r.sh.shipmentNumber}? Stock on this run will be marked as left the building.`} data-testid={`dispatch-${r.sh.shipmentNumber}`}>
                      Dispatch
                    </ActionButton>
                  )}
                </div>
              </div>
              <div className="grid gap-3 border-b border-border px-4 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="mb-1 flex justify-between text-[11px] text-muted"><span>Load vs capacity</span><span className="num">{kg(load, 1)} / {kg(cap, 0)} · {util.toFixed(0)}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-panel-3"><div className={cn("h-full rounded-full", util > 100 ? "bg-short" : util > 90 ? "bg-surplus" : "bg-accent")} style={{ width: `${Math.min(100, util)}%` }} /></div>
                </div>
                <div className="num text-xs text-muted">{done}/{r.stops.length} delivered{vt.length > 0 && <> · last reading <span className={vtEx.length ? "text-short" : "text-text-2"}>{Number(vt[0].readingC).toFixed(1)}°C</span></>}</div>
              </div>
              <ol>
                {r.stops.map((s) => {
                  const late = isLate(s);
                  const sos = extras.orders.filter((o) => o.stopId === s.st.id);
                  return (
                    <li key={s.st.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 px-4 py-2.5 last:border-0">
                      <span className={cn("num flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", s.st.status === "DELIVERED" ? "border-ok bg-ok-soft text-ok" : "border-border-strong text-text-2")}>{s.st.sequence}</span>
                      <div className="min-w-[180px] flex-1">
                        <div className="text-sm font-medium text-text">{s.c.name}</div>
                        <div className="text-[11px] text-muted">{s.st.address ?? s.c.address}{sos.length > 0 && <> · {sos.map((o, i) => <span key={o.soId}>{i > 0 && ", "}<Link href={`/orders/${o.soId}`} className="num hover:text-text">{o.soNumber}</Link></span>)}</>}</div>
                      </div>
                      <div className="num text-xs text-text-2">{kgNum(s.st.loadKg)} kg</div>
                      <div className="text-right text-[11px]">
                        <div className="num text-muted">window {time(s.st.windowStart)}–{time(s.st.windowEnd)}</div>
                        <div className={cn("num", late ? "font-semibold text-late" : "text-text-2")}>
                          {s.st.actualArrivalAt ? `arrived ${time(s.st.actualArrivalAt)}` : `ETA ${time(s.st.plannedArrivalAt)}`}{late && " · LATE"}
                        </div>
                      </div>
                      <div className="flex w-full justify-end sm:w-auto sm:min-w-[120px]">
                        {s.st.status === "DELIVERED" ? (
                          <div className="text-right">
                            <StatusBadge status="DELIVERED" />
                            <div className="text-[10px] text-muted">POD {s.st.podName ?? "—"} · <span className="num">{time(s.st.podAt)}</span></div>
                          </div>
                        ) : r.sh.status === "DISPATCHED" && canAct ? (
                          <CompleteStopForm stopId={s.st.id} customer={s.c.name} testId={`${r.sh.shipmentNumber}-${s.st.sequence}`} />
                        ) : (
                          <StatusBadge status={s.st.status} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
