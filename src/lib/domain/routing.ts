/**
 * Delivery run planning: capacity-aware sweep clustering + nearest-neighbour ordering with
 * time-window urgency. Distances come from an injected matrix so any RoutingProvider
 * (OneMap, straight-line mock) can back it.
 */
export type GeoPoint = { lat: number; lng: number };
export type RouteStopInput = GeoPoint & {
  id: string;
  label: string;
  loadKg: number;
  windowStart?: Date | null;
  windowEnd?: Date | null;
  priority?: number; // 1 = highest
};
export type VehicleInput = { id: string; label: string; capacityKg: number };

export type PlannedStop = RouteStopInput & { sequence: number; plannedArrivalAt: Date; lateMinutes: number };
export type PlannedRun = {
  vehicleId: string;
  vehicleLabel: string;
  stops: PlannedStop[];
  loadKg: number;
  capacityKg: number;
  distanceKm: number;
  durationMin: number;
  plannedDepartureAt: Date;
  returnAt: Date;
};

export type DistanceFn = (a: GeoPoint, b: GeoPoint) => { km: number; minutes: number };

/** Straight-line distance with a road-network factor and night-time average speed. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const straightLineDistance: DistanceFn = (a, b) => {
  const km = haversineKm(a, b) * 1.35;
  return { km: Math.round(km * 10) / 10, minutes: Math.max(3, Math.round((km / 38) * 60)) };
};

export function planRoutes(args: {
  origin: GeoPoint;
  stops: RouteStopInput[];
  vehicles: VehicleInput[];
  departureAt: Date;
  serviceMinutes?: number;
  distance?: DistanceFn;
}): { runs: PlannedRun[]; unassigned: RouteStopInput[] } {
  const dist = args.distance ?? straightLineDistance;
  const service = args.serviceMinutes ?? 8;
  const vehicles = [...args.vehicles].sort((a, b) => b.capacityKg - a.capacityKg);
  // Sweep: order stops by polar angle around the depot so each vehicle gets a geographic wedge.
  const angle = (p: GeoPoint) => Math.atan2(p.lat - args.origin.lat, p.lng - args.origin.lng);
  const sorted = [...args.stops].sort((a, b) => angle(a) - angle(b));
  const totalLoad = sorted.reduce((a, s) => a + s.loadKg, 0);
  const totalCap = vehicles.reduce((a, v) => a + v.capacityKg, 0);
  // Balance load across vehicles in proportion to capacity (but never above capacity).
  const buckets: { v: VehicleInput; stops: RouteStopInput[]; load: number; target: number }[] = vehicles.map((v) => ({
    v, stops: [], load: 0, target: totalCap > 0 ? Math.min(v.capacityKg, (totalLoad * v.capacityKg) / totalCap * 1.05) : 0,
  }));
  const unassigned: RouteStopInput[] = [];
  let bi = 0;
  for (const s of sorted) {
    while (bi < buckets.length && buckets[bi].load + s.loadKg > buckets[bi].target && buckets[bi].stops.length > 0) bi++;
    let b = buckets[bi];
    if (!b || b.load + s.loadKg > b.v.capacityKg) b = buckets.find((x) => x.load + s.loadKg <= x.v.capacityKg)!;
    if (!b) {
      unassigned.push(s);
      continue;
    }
    b.stops.push(s);
    b.load += s.loadKg;
  }

  const runs: PlannedRun[] = [];
  for (const b of buckets) {
    if (!b.stops.length) continue;
    const remaining = [...b.stops];
    let cur: GeoPoint = args.origin;
    let t = args.departureAt.getTime();
    let km = 0;
    const planned: PlannedStop[] = [];
    while (remaining.length) {
      // Pick the stop minimising arrival time, heavily penalising a stop whose window would be missed.
      let bestIdx = 0;
      let bestCost = Infinity;
      remaining.forEach((s, i) => {
        const d = dist(cur, s);
        const arrive = t + d.minutes * 60000;
        const slack = s.windowEnd ? (s.windowEnd.getTime() - arrive) / 60000 : 240;
        const cost = d.minutes + (slack < 0 ? 1000 - slack : slack < 45 ? -30 : 0) + (s.priority ?? 2) * 2;
        if (cost < bestCost) {
          bestCost = cost;
          bestIdx = i;
        }
      });
      const s = remaining.splice(bestIdx, 1)[0];
      const d = dist(cur, s);
      km += d.km;
      t += d.minutes * 60000;
      if (s.windowStart && t < s.windowStart.getTime()) t = s.windowStart.getTime();
      const late = s.windowEnd ? Math.max(0, Math.round((t - s.windowEnd.getTime()) / 60000)) : 0;
      planned.push({ ...s, sequence: planned.length + 1, plannedArrivalAt: new Date(t), lateMinutes: late });
      t += service * 60000;
      cur = s;
    }
    const back = dist(cur, args.origin);
    km += back.km;
    const returnAt = new Date(t + back.minutes * 60000);
    runs.push({
      vehicleId: b.v.id, vehicleLabel: b.v.label, stops: planned, loadKg: Math.round(b.load * 10) / 10, capacityKg: b.v.capacityKg,
      distanceKm: Math.round(km * 10) / 10, durationMin: Math.round((returnAt.getTime() - args.departureAt.getTime()) / 60000),
      plannedDepartureAt: args.departureAt, returnAt,
    });
  }
  return { runs, unassigned };
}
