import { ArrowRight, Warehouse } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { shipmentsForNight } from "@/lib/services/queries";
import { depotFor, nightsWithRuns, ordersAwaitingRoute } from "@/lib/services/queries-ops";
import { getRouting } from "@/lib/integrations/routing";
import { PageHeader, Empty } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { LiveRefresh } from "@/components/app/live-refresh";
import { kg, kgNum, time } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NightPicker, PastNightNote, resolveNight } from "../_night";
import { PlanRoutesForm } from "./plan-form";

export const metadata = { title: "Routes" };

/** Distinct run colours from theme tokens (work in light and dark). */
const RUN_COLORS = ["var(--info)", "var(--ok)", "var(--surplus)", "var(--spike)", "var(--late)", "var(--ai)", "var(--short)"];

export default async function RoutesPage({ searchParams }: { searchParams: Promise<{ night?: string }> }) {
  const app = await requireApp("ops.view");
  const night = resolveNight((await searchParams).night, app.marketDate);
  const isTonight = night === app.marketDate;
  const canPlan = app.can("ops.dispatch") && isTonight;
  const [runs, depot, nights, awaiting] = await Promise.all([shipmentsForNight(app.org.id, night), depotFor(app.org.id), nightsWithRuns(app.org.id, app.marketDate), ordersAwaitingRoute(app.org.id, night)]);
  const routing = getRouting();
  const awaitingN = awaiting.reduce((a, x) => a + x.n, 0);
  const runProviders = [...new Set(runs.map((r) => r.sh.routingProvider).filter(Boolean))] as string[];
  const estimated = routing.status !== "CONNECTED";

  // ---- schematic projection (equirectangular, scaled by cos(lat) so distances look right near the equator)
  const pts = [{ lat: depot.lat, lng: depot.lng }, ...runs.flatMap((r) => r.stops.filter((s) => s.st.lat && s.st.lng).map((s) => ({ lat: Number(s.st.lat), lng: Number(s.st.lng) })))];
  const minLat = Math.min(...pts.map((p) => p.lat));
  const maxLat = Math.max(...pts.map((p) => p.lat));
  const minLng = Math.min(...pts.map((p) => p.lng));
  const maxLng = Math.max(...pts.map((p) => p.lng));
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max(0.02, (maxLng - minLng) * k);
  const spanY = Math.max(0.02, maxLat - minLat);
  const W = 1000;
  const PAD = 40;
  const PAD_R = 150; // room for stop labels to the right of each point
  const innerW = W - PAD - PAD_R;
  const scale = innerW / spanX;
  const H = Math.max(280, Math.min(560, spanY * scale + PAD * 2));
  const sY = Math.min(scale, (H - PAD * 2) / spanY);
  const proj = (lat: number, lng: number) => ({ x: PAD + (lng - minLng) * k * sY + (innerW - spanX * sY) / 2, y: PAD + (maxLat - lat) * sY + ((H - PAD * 2) - spanY * sY) / 2 });
  const D = proj(depot.lat, depot.lng);

  return (
    <div>
      {isTonight && <LiveRefresh seconds={30} />}
      <PageHeader
        eyebrow="Operations"
        title="Route board"
        subtitle="Delivery runs from the depot to each buyer, with planned arrival against every delivery window. Plan once orders are packed; the logistics agent balances load across the refrigerated fleet."
        actions={<NightPicker path="/operations/routes" night={night} tonight={app.marketDate} extra={nights.slice(0, 4)} />}
      />
      {!isTonight && <PastNightNote night={night} path="/operations/routes" />}

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-text">Routing provider</span>
              <Badge tone={estimated ? "ai" : "ok"} data-testid="routing-provider">{routing.provider}{estimated ? " · MOCK" : " · CONNECTED"}</Badge>
              {runProviders.filter((p) => p !== routing.provider).map((p) => <Badge key={p} tone="neutral">runs used: {p}</Badge>)}
            </div>
            <p className="mt-1 max-w-2xl text-xs text-muted">
              {estimated
                ? "Distances and drive times are straight-line estimates (haversine × 1.35 road factor at a 38 km/h night average) — not real road routing. Connect OneMap (SLA) under Settings → Integrations for road distances."
                : "Road distances and drive times from OneMap (SLA). Any leg OneMap cannot answer falls back to a straight-line estimate."}
            </p>
            {isTonight && <p className="mt-1 text-xs text-text-2"><span className="num font-semibold">{awaitingN}</span> order(s) ready for routing{awaiting.length > 0 && ` (${awaiting.map((a) => `${a.n} ${a.status.toLowerCase()}`).join(", ")})`}.</p>}
          </div>
          {canPlan && <PlanRoutesForm defaultDeparture={app.org.settings.dispatchCutoff && app.org.settings.dispatchCutoff < "06:00" ? app.org.settings.dispatchCutoff : "05:00"} disabledReason={awaitingN === 0 ? "No packed or allocated orders waiting for a run" : undefined} />}
        </CardBody>
      </Card>

      {runs.length === 0 ? (
        <Empty title={isTonight ? "No routes generated tonight" : "No runs on this night"}>
          {isTonight
            ? awaitingN > 0
              ? "Choose a departure time and generate routes. Runs appear here with their stop sequence and a schematic map."
              : "Routes are generated after orders are allocated and packed (≈05:00). Switch to “Last night” to see a completed plan."
            : "Nothing was planned for this night."}
        </Empty>
      ) : (
        <>
          <div className="mb-4 space-y-3" data-testid="route-runs">
            {runs.map((r, i) => {
              const color = RUN_COLORS[i % RUN_COLORS.length];
              const cap = Number(r.v?.capacityKg ?? 0);
              const load = Number(r.sh.totalKg);
              const util = cap ? (load / cap) * 100 : 0;
              const late = r.stops.filter((s) => s.st.plannedArrivalAt && s.st.windowEnd && s.st.plannedArrivalAt > s.st.windowEnd).length;
              return (
                <Card key={r.sh.id} className="overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-2.5">
                    <span className="num text-sm font-semibold text-text">{r.sh.shipmentNumber}</span>
                    <StatusBadge status={r.sh.status} />
                    <span className="text-xs text-text-2">{r.v?.name ?? "—"} <span className="num text-muted">{r.v?.plate}</span> · {r.d?.name ?? "no driver"}</span>
                    {late > 0 && <Badge tone="late">{late} late</Badge>}
                    <div className="ml-auto flex flex-wrap items-center gap-4 text-[11px] text-muted">
                      <span>depart <span className="num text-text">{time(r.sh.plannedDepartureAt)}</span></span>
                      <span className="num">{r.sh.distanceKm ? `${Number(r.sh.distanceKm)} km` : "—"}{estimated || r.sh.routingProvider !== "OneMap (SLA)" ? " est." : ""}</span>
                      <span className="num">{r.sh.durationMin ? `${Math.floor(r.sh.durationMin / 60)}h ${String(r.sh.durationMin % 60).padStart(2, "0")}m` : "—"}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-panel-3"><span className={cn("block h-full rounded-full", util > 100 ? "bg-short" : util > 90 ? "bg-surplus" : "bg-accent")} style={{ width: `${Math.min(100, util)}%` }} /></span>
                        <span className="num text-text-2">{kgNum(load, 0)}/{kgNum(cap, 0)} kg</span>
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <ol className="flex min-w-max items-stretch gap-1 px-4 py-3">
                      <li className="flex items-center gap-1">
                        <div className="rounded-lg border border-border bg-panel-2 px-3 py-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-text"><Warehouse className="size-3.5" style={{ color }} /> {depot.name}</div>
                          <div className="num text-[11px] text-muted">dep {time(r.sh.plannedDepartureAt)}</div>
                        </div>
                      </li>
                      {r.stops.map((s) => {
                        const isLate = s.st.plannedArrivalAt && s.st.windowEnd && s.st.plannedArrivalAt > s.st.windowEnd;
                        const early = s.st.plannedArrivalAt && s.st.windowStart && s.st.plannedArrivalAt < s.st.windowStart;
                        return (
                          <li key={s.st.id} className="flex items-center gap-1">
                            <ArrowRight className="size-3.5 shrink-0 text-muted" />
                            <div className={cn("w-[176px] rounded-lg border px-3 py-2", isLate ? "border-short/50 bg-short-soft" : "border-border bg-panel-2")} title={`${s.c.name} · ${s.st.address ?? ""}`}>
                              <div className="flex items-center gap-1.5">
                                <span className="num flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-bg" style={{ background: color }}>{s.st.sequence}</span>
                                <span className="truncate text-xs font-semibold text-text">{s.c.name}</span>
                              </div>
                              <div className={cn("num mt-1 text-[11px]", isLate ? "font-semibold text-short" : "text-text")}>
                                ETA {time(s.st.plannedArrivalAt)}{isLate && " · LATE"}{early && <span className="text-muted"> · early</span>}
                              </div>
                              <div className="num text-[10px] text-muted">window {time(s.st.windowStart)}–{time(s.st.windowEnd)}</div>
                              <div className="num text-[10px] text-muted">{kgNum(s.st.loadKg)} kg</div>
                              {s.st.status !== "PENDING" && <StatusBadge status={s.st.status} className="mt-1 px-1 py-0 text-[9px]" />}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader title="Schematic map" subtitle={`Straight lines between stops in visiting order — a schematic, not a road map. Hover a point for details.`} />
            <CardBody>
              <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-lg border border-border bg-panel-2" role="img" aria-label="Schematic map of delivery runs" data-testid="route-map">
                <defs>
                  <pattern id="route-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--border)" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width={W} height={H} fill="url(#route-grid)" />
                {runs.map((r, i) => {
                  const color = RUN_COLORS[i % RUN_COLORS.length];
                  const path = [D, ...r.stops.filter((s) => s.st.lat && s.st.lng).map((s) => proj(Number(s.st.lat), Number(s.st.lng)))];
                  return (
                    <g key={r.sh.id}>
                      <polyline points={path.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.85">
                        <title>{`${r.sh.shipmentNumber} · ${r.v?.name ?? ""} · ${r.stops.length} stops · ${kg(r.sh.totalKg, 0)}`}</title>
                      </polyline>
                      {r.stops.filter((s) => s.st.lat && s.st.lng).map((s) => {
                        const p = proj(Number(s.st.lat), Number(s.st.lng));
                        const isLate = s.st.plannedArrivalAt && s.st.windowEnd && s.st.plannedArrivalAt > s.st.windowEnd;
                        return (
                          <g key={s.st.id} className="cursor-default">
                            <title>{`${r.sh.shipmentNumber} #${s.st.sequence} · ${s.c.name}\nETA ${time(s.st.plannedArrivalAt)} (window ${time(s.st.windowStart)}–${time(s.st.windowEnd)})${isLate ? " LATE" : ""}\n${kgNum(s.st.loadKg)} kg`}</title>
                            <circle cx={p.x} cy={p.y} r="10" fill="var(--panel)" stroke={isLate ? "var(--short)" : color} strokeWidth={isLate ? 3 : 2} />
                            <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--text)" className="num">{s.st.sequence}</text>
                            <text x={p.x + 14} y={p.y + 4} fontSize="10" fill="var(--text-2)">{s.c.name.length > 18 ? `${s.c.name.slice(0, 17)}…` : s.c.name}</text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
                <g>
                  <title>{`${depot.name} (depot) · ${depot.lat.toFixed(4)}, ${depot.lng.toFixed(4)}`}</title>
                  <rect x={D.x - 9} y={D.y - 9} width="18" height="18" rx="3" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
                  <text x={D.x} y={D.y - 14} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text)">Depot</text>
                </g>
              </svg>
              <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted">
                {runs.map((r, i) => (
                  <span key={r.sh.id} className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded" style={{ background: RUN_COLORS[i % RUN_COLORS.length] }} /> <span className="num">{r.sh.shipmentNumber}</span> · {r.v?.name}</span>
                ))}
                <span className="flex items-center gap-1.5"><span className="size-3 rounded-full border-2 border-short" /> late vs window</span>
                <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-accent" /> depot</span>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
