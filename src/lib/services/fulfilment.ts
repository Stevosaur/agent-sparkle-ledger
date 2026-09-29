/**
 * Orders → picking → packing → dispatch → delivery.
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import {
  allocation, catchLot, customer, driver, inventoryMovement, pickList, pickListLine, salesOrder, salesOrderLine, shipment, shipmentOrder, shipmentStop, species, vehicle, warehouseLocation,
} from "@/lib/db/schema";
import { D, toKgStr, toPriceStr } from "@/lib/domain/decimal";
import { planRoutes, type RouteStopInput } from "@/lib/domain/routing";
import { atMarketTime, fmtTime } from "@/lib/domain/time";
import { getRouting } from "@/lib/integrations/routing";
import { audit } from "./audit";
import { DomainError, nowOf, type Ctx } from "./context";
import { notify } from "./common";
import { nextSeq } from "./sequence";
import { emit } from "@/lib/events/bus";

// ---------- Sales orders ----------
export async function createSalesOrder(
  ctx: Ctx,
  o: { customerId: string; marketDate: string; source?: "STANDING_ORDER" | "WHATSAPP" | "PORTAL" | "PHONE" | "MANUAL"; lines: { speciesId: string; requestedKg: number; pricePerKg: number; sizeMinKg?: number | null; sizeMaxKg?: number | null }[]; notes?: string },
  x0?: Executor,
) {
  const run = async (x: Executor) => {
    if (!o.lines.length) throw new DomainError("Add at least one line.");
    const [c] = await x.select().from(customer).where(and(eq(customer.id, o.customerId), eq(customer.orgId, ctx.orgId)));
    if (!c) throw new DomainError("Customer not found");
    const soNumber = `SO-${String(await nextSeq(x, ctx.orgId, "SO")).padStart(5, "0")}`;
    const now = nowOf(ctx);
    const [so] = await x
      .insert(salesOrder)
      .values({ orgId: ctx.orgId, soNumber, customerId: c.id, marketDate: o.marketDate, status: "CONFIRMED", source: o.source ?? "MANUAL", confirmedAt: now, requestedDeliveryBy: c.deliveryWindowEnd ? atMarketTime(o.marketDate, c.deliveryWindowEnd) : null, notes: o.notes ?? null, createdAt: now })
      .returning();
    for (const l of o.lines) {
      if (l.requestedKg <= 0) throw new DomainError("Quantities must be positive.");
      await x.insert(salesOrderLine).values({ orgId: ctx.orgId, salesOrderId: so.id, speciesId: l.speciesId, requestedKg: toKgStr(l.requestedKg), pricePerKg: toPriceStr(l.pricePerKg), sizeMinKg: l.sizeMinKg ? toKgStr(l.sizeMinKg) : null, sizeMaxKg: l.sizeMaxKg ? toKgStr(l.sizeMaxKg) : null });
    }
    await audit(x, ctx, { action: "ORDER_CONFIRMED", entityType: "sales_order", entityId: so.id, summary: `${soNumber} for ${c.name}: ${o.lines.length} line(s), ${o.lines.reduce((a, l) => a + l.requestedKg, 0)} kg.`, relatedIds: [c.id] });
    await emit(x, ctx.orgId, "DEMAND_UPDATED", { marketDate: o.marketDate, salesOrderId: so.id }, { at: nowOf(ctx) });
    return so;
  };
  return x0 ? run(x0) : db.transaction(run);
}

/** Buyer accepts a suggested substitute: adds a new line linked to the short line. */
export async function confirmSubstitution(ctx: Ctx, p: { originalLineId: string; speciesId: string; kg: number; pricePerKg?: number }) {
  return db.transaction(async (x) => {
    const [orig] = await x.select().from(salesOrderLine).where(and(eq(salesOrderLine.id, p.originalLineId), eq(salesOrderLine.orgId, ctx.orgId)));
    if (!orig) throw new DomainError("Order line not found");
    const [sp] = await x.select().from(species).where(eq(species.id, p.speciesId));
    const [line] = await x
      .insert(salesOrderLine)
      .values({ orgId: ctx.orgId, salesOrderId: orig.salesOrderId, speciesId: p.speciesId, requestedKg: toKgStr(p.kg), pricePerKg: toPriceStr(p.pricePerKg ?? Number(orig.pricePerKg)), substituteForLineId: orig.id, substitutionStatus: "CONFIRMED" })
      .returning();
    await x.update(salesOrder).set({ status: "PARTIALLY_ALLOCATED" }).where(and(eq(salesOrder.id, orig.salesOrderId), inArray(salesOrder.status, ["ALLOCATED"])));
    await audit(x, ctx, { action: "SUBSTITUTION_CONFIRMED", entityType: "sales_order", entityId: orig.salesOrderId, summary: `Substitute confirmed: ${p.kg} kg ${sp?.canonicalName} for short line.`, relatedIds: [line.id] });
    return line;
  });
}

// ---------- Picking & packing ----------
export async function generatePickList(ctx: Ctx, marketDate: string) {
  return db.transaction(async (x) => {
    const rows = await x
      .select({ a: allocation, sol: salesOrderLine, so: salesOrder })
      .from(allocation)
      .innerJoin(salesOrderLine, eq(salesOrderLine.id, allocation.salesOrderLineId))
      .innerJoin(salesOrder, eq(salesOrder.id, salesOrderLine.salesOrderId))
      .where(and(eq(allocation.orgId, ctx.orgId), eq(salesOrder.marketDate, marketDate), eq(allocation.status, "CONFIRMED"), sql`NOT EXISTS (SELECT 1 FROM pick_list_line pll WHERE pll.allocation_id = ${allocation.id})`));
    if (!rows.length) throw new DomainError("No confirmed allocations waiting to be picked.");
    const n = await nextSeq(x, ctx.orgId, "PICK");
    const [pl] = await x.insert(pickList).values({ orgId: ctx.orgId, pickListNumber: `PICK-${String(n).padStart(4, "0")}`, marketDate, status: "IN_PROGRESS", createdAt: nowOf(ctx) }).returning();
    for (const r of rows) await x.insert(pickListLine).values({ orgId: ctx.orgId, pickListId: pl.id, allocationId: r.a.id, lotId: r.a.lotId, salesOrderLineId: r.sol.id, quantityKg: r.a.quantityKg });
    const soIds = [...new Set(rows.map((r) => r.so.id))];
    await x.update(salesOrder).set({ status: "PICKING" }).where(and(inArray(salesOrder.id, soIds), inArray(salesOrder.status, ["ALLOCATED", "PARTIALLY_ALLOCATED"])));
    await audit(x, ctx, { action: "PICKING_STARTED", entityType: "pick_list", entityId: pl.id, summary: `${pl.pickListNumber}: ${rows.length} picks across ${soIds.length} orders.`, relatedIds: soIds });
    return pl;
  });
}

export async function confirmPick(ctx: Ctx, pickLineId: string, pickedKg?: number) {
  return db.transaction(async (x) => {
    const [pl] = await x.select().from(pickListLine).where(and(eq(pickListLine.id, pickLineId), eq(pickListLine.orgId, ctx.orgId)));
    if (!pl) throw new DomainError("Pick line not found", "NOT_FOUND", 404);
    if (pl.status !== "PENDING") return pl;
    const kg = D(pickedKg ?? pl.quantityKg);
    if (kg.gt(D(pl.quantityKg))) throw new DomainError("Cannot pick more than allocated.");
    const [u] = await x.update(pickListLine).set({ status: "PICKED", pickedKg: toKgStr(kg), pickedAt: nowOf(ctx) }).where(eq(pickListLine.id, pl.id)).returning();
    await x.update(allocation).set({ status: "PICKED" }).where(eq(allocation.id, pl.allocationId));
    await x.update(salesOrderLine).set({ pickedKg: sql`${salesOrderLine.pickedKg} + ${toKgStr(kg)}` }).where(eq(salesOrderLine.id, pl.salesOrderLineId));
    return u;
  });
}

export async function packOrder(ctx: Ctx, salesOrderId: string) {
  return db.transaction(async (x) => {
    const [so] = await x.select().from(salesOrder).where(and(eq(salesOrder.id, salesOrderId), eq(salesOrder.orgId, ctx.orgId)));
    if (!so) throw new DomainError("Order not found", "NOT_FOUND", 404);
    const pending = await x.execute(sql`SELECT COUNT(*)::int AS n FROM pick_list_line pll JOIN sales_order_line sol ON sol.id = pll.sales_order_line_id WHERE sol.sales_order_id = ${so.id} AND pll.status = 'PENDING'`);
    if (Number((pending.rows[0] as { n: number }).n) > 0) throw new DomainError("Some lines are not picked yet.");
    await x.execute(sql`UPDATE pick_list_line SET status = 'PACKED', packed_at = ${nowOf(ctx)} WHERE sales_order_line_id IN (SELECT id FROM sales_order_line WHERE sales_order_id = ${so.id}) AND status = 'PICKED'`);
    await x.update(salesOrder).set({ status: "PACKED" }).where(eq(salesOrder.id, so.id));
    await audit(x, ctx, { action: "ORDER_PACKED", entityType: "sales_order", entityId: so.id, summary: `${so.soNumber} packed and ready for dispatch.` });
    await emit(x, ctx.orgId, "ORDER_READY", { salesOrderId: so.id }, { at: nowOf(ctx) });
  });
}

/** Convenience for the operations board: pick every pending line of the order at allocated weight, then pack. */
export async function pickAndPackOrder(ctx: Ctx, salesOrderId: string) {
  const lines = await db.select({ id: pickListLine.id }).from(pickListLine).innerJoin(salesOrderLine, eq(salesOrderLine.id, pickListLine.salesOrderLineId)).where(and(eq(salesOrderLine.salesOrderId, salesOrderId), eq(pickListLine.status, "PENDING")));
  for (const l of lines) await confirmPick(ctx, l.id);
  await packOrder(ctx, salesOrderId);
}

// ---------- Logistics Agent: route planning ----------
export async function planDeliveryRuns(ctx: Ctx, marketDate: string, departureLocal = "05:00") {
  const orders = await db
    .select({ so: salesOrder, c: customer })
    .from(salesOrder)
    .innerJoin(customer, eq(customer.id, salesOrder.customerId))
    .where(and(eq(salesOrder.orgId, ctx.orgId), eq(salesOrder.marketDate, marketDate), inArray(salesOrder.status, ["PACKED", "PICKING", "ALLOCATED"]), sql`NOT EXISTS (SELECT 1 FROM shipment_order sho JOIN shipment sh ON sh.id = sho.shipment_id WHERE sho.sales_order_id = ${salesOrder.id} AND sh.status <> 'CANCELLED')`));
  if (!orders.length) throw new DomainError("No allocated orders waiting for a delivery run.");
  const loads = await db.execute(sql`SELECT sol.sales_order_id, SUM(GREATEST(sol.picked_kg, sol.allocated_kg)) AS kg FROM sales_order_line sol WHERE sol.sales_order_id IN (${sql.join(orders.map((o) => sql`${o.so.id}`), sql`, `)}) GROUP BY sol.sales_order_id`);
  const loadBySo = new Map((loads.rows as { sales_order_id: string; kg: string }[]).map((r) => [r.sales_order_id, Number(r.kg)]));
  const [depot] = await db.select().from(warehouseLocation).where(and(eq(warehouseLocation.orgId, ctx.orgId), eq(warehouseLocation.type, "DISPATCH_BAY"))).limit(1);
  const origin = { lat: Number(depot?.lat ?? 1.3036), lng: Number(depot?.lng ?? 103.7194) };

  // One stop per customer.
  const byCustomer = new Map<string, { c: typeof customer.$inferSelect; soIds: string[]; kg: number }>();
  for (const o of orders) {
    const e = byCustomer.get(o.c.id) ?? { c: o.c, soIds: [], kg: 0 };
    e.soIds.push(o.so.id);
    e.kg += loadBySo.get(o.so.id) ?? 0;
    byCustomer.set(o.c.id, e);
  }
  const stops: RouteStopInput[] = [...byCustomer.values()].filter((s) => s.c.lat && s.c.lng).map((s) => ({
    id: s.c.id,
    label: s.c.name,
    lat: Number(s.c.lat),
    lng: Number(s.c.lng),
    loadKg: Math.round(s.kg * 10) / 10,
    windowStart: s.c.deliveryWindowStart ? atMarketTime(marketDate, s.c.deliveryWindowStart) : null,
    windowEnd: s.c.deliveryWindowEnd ? atMarketTime(marketDate, s.c.deliveryWindowEnd) : null,
    priority: s.c.priorityTier,
  }));
  const vehicles = await db.select().from(vehicle).where(and(eq(vehicle.orgId, ctx.orgId), eq(vehicle.active, true)));
  const drivers = await db.select().from(driver).where(and(eq(driver.orgId, ctx.orgId), eq(driver.active, true)));
  const busy = await db.execute(sql`SELECT vehicle_id FROM shipment WHERE org_id = ${ctx.orgId} AND market_date = ${marketDate} AND status IN ('PLANNED','LOADING','DISPATCHED')`);
  const busyIds = new Set((busy.rows as { vehicle_id: string }[]).map((r) => r.vehicle_id));
  const freeVehicles = vehicles.filter((v) => !busyIds.has(v.id));
  if (!freeVehicles.length) throw new DomainError("All vehicles are already assigned tonight.");

  // Pre-compute legs with the routing provider (OneMap if connected, else straight-line estimate).
  const provider = getRouting();
  const pts = [origin, ...stops];
  const legs = new Map<string, { km: number; minutes: number }>();
  for (const a of pts) for (const b of pts) if (a !== b) legs.set(`${a.lat},${a.lng}>${b.lat},${b.lng}`, await provider.leg(a, b));
  const departureAt = atMarketTime(marketDate, departureLocal);
  const plan = planRoutes({
    origin,
    stops,
    vehicles: freeVehicles.map((v) => ({ id: v.id, label: `${v.name} (${v.plate})`, capacityKg: Number(v.capacityKg) })),
    departureAt,
    distance: (a, b) => legs.get(`${a.lat},${a.lng}>${b.lat},${b.lng}`) ?? { km: 0, minutes: 0 },
  });

  return db.transaction(async (x) => {
    const shipments: string[] = [];
    let di = 0;
    for (const run of plan.runs) {
      const n = await nextSeq(x, ctx.orgId, "RUN");
      const [sh] = await x
        .insert(shipment)
        .values({
          orgId: ctx.orgId, shipmentNumber: `RUN-${String(n).padStart(4, "0")}`, marketDate, vehicleId: run.vehicleId, driverId: drivers[di++ % Math.max(1, drivers.length)]?.id ?? null,
          status: "PLANNED", plannedDepartureAt: run.plannedDepartureAt, totalKg: toKgStr(run.loadKg), distanceKm: String(run.distanceKm), durationMin: run.durationMin,
          routingProvider: provider.provider, agentRunId: ctx.agentRunId ?? null, createdAt: nowOf(ctx),
        })
        .returning();
      shipments.push(sh.id);
      for (const s of run.stops) {
        const e = byCustomer.get(s.id)!;
        const [stop] = await x
          .insert(shipmentStop)
          .values({ orgId: ctx.orgId, shipmentId: sh.id, sequence: s.sequence, customerId: s.id, address: e.c.address, lat: e.c.lat, lng: e.c.lng, windowStart: s.windowStart ?? null, windowEnd: s.windowEnd ?? null, plannedArrivalAt: s.plannedArrivalAt, loadKg: toKgStr(s.loadKg) })
          .returning();
        for (const soId of e.soIds) await x.insert(shipmentOrder).values({ orgId: ctx.orgId, shipmentId: sh.id, stopId: stop.id, salesOrderId: soId });
      }
      await audit(x, ctx, {
        action: "ROUTE_PLANNED",
        entityType: "shipment",
        entityId: sh.id,
        summary: `${sh.shipmentNumber}: ${run.vehicleLabel}, ${run.stops.length} stops (${run.stops.map((s) => s.label).join(" → ")}), ${run.loadKg} kg, ${run.distanceKm} km, depart ${fmtTime(run.plannedDepartureAt)}.`,
        relatedIds: run.stops.flatMap((s) => byCustomer.get(s.id)!.soIds),
      });
    }
    return { shipmentIds: shipments, unassigned: plan.unassigned.map((u) => u.label), provider: provider.provider, estimated: provider.status !== "CONNECTED" };
  });
}

/** Dispatch a delivery run: stock leaves the building. Lots' allocated quantities move to dispatched. */
export async function dispatchShipment(ctx: Ctx, shipmentId: string) {
  return db.transaction(async (x) => {
    const [sh] = await x.select().from(shipment).where(and(eq(shipment.id, shipmentId), eq(shipment.orgId, ctx.orgId)));
    if (!sh) throw new DomainError("Delivery run not found", "NOT_FOUND", 404);
    if (sh.status !== "PLANNED" && sh.status !== "LOADING") throw new DomainError(`Run is ${sh.status}.`);
    const at = nowOf(ctx);
    const soIds = (await x.select({ id: shipmentOrder.salesOrderId }).from(shipmentOrder).where(eq(shipmentOrder.shipmentId, sh.id))).map((r) => r.id);
    const allocs = await x
      .select({ a: allocation })
      .from(allocation)
      .innerJoin(salesOrderLine, eq(salesOrderLine.id, allocation.salesOrderLineId))
      .where(and(inArray(salesOrderLine.salesOrderId, soIds), notInArray(allocation.status, ["RELEASED", "DISPATCHED"])));
    const lotIds = [...new Set(allocs.map((r) => r.a.lotId))];
    if (lotIds.length) await x.execute(sql`SELECT id FROM catch_lot WHERE id IN (${sql.join(lotIds.map((i) => sql`${i}`), sql`, `)}) ORDER BY id FOR UPDATE`);
    for (const { a } of allocs) {
      const [lot] = await x.select().from(catchLot).where(eq(catchLot.id, a.lotId));
      const alloc = D(lot.quantityAllocatedKg).minus(D(a.quantityKg));
      if (alloc.lt(0)) throw new DomainError("Negative inventory prevented.", "NEGATIVE_INVENTORY", 409);
      const done = alloc.isZero() && D(lot.quantityAvailableKg).isZero();
      await x.update(catchLot).set({ quantityAllocatedKg: toKgStr(alloc), status: done ? "DISPATCHED" : lot.status }).where(eq(catchLot.id, lot.id));
      await x.update(allocation).set({ status: "DISPATCHED" }).where(eq(allocation.id, a.id));
      await x.insert(inventoryMovement).values({ orgId: ctx.orgId, lotId: lot.id, type: "DISPATCH", quantityKg: toKgStr(D(a.quantityKg).neg()), availableAfterKg: lot.quantityAvailableKg, refType: "shipment", refId: sh.id, actor: ctx.actor.label, at });
      await audit(x, ctx, { action: "LOT_DISPATCHED", entityType: "catch_lot", entityId: lot.id, summary: `${D(a.quantityKg).toFixed(1)} kg dispatched on ${sh.shipmentNumber}.`, relatedIds: [sh.id], at });
    }
    await x.update(shipment).set({ status: "DISPATCHED", actualDepartureAt: at }).where(eq(shipment.id, sh.id));
    await x.update(salesOrder).set({ status: "DISPATCHED" }).where(inArray(salesOrder.id, soIds));
    const [v] = sh.vehicleId ? await x.select().from(vehicle).where(eq(vehicle.id, sh.vehicleId)) : [];
    await audit(x, ctx, { action: "SHIPMENT_DISPATCHED", entityType: "shipment", entityId: sh.id, summary: `${sh.shipmentNumber} departed at ${fmtTime(at)}${v ? ` (${v.name})` : ""} with ${D(sh.totalKg).toFixed(1)} kg.`, relatedIds: soIds, at });
    for (const id of soIds) await audit(x, ctx, { action: "ORDER_DISPATCHED", entityType: "sales_order", entityId: id, summary: `Dispatched on ${sh.shipmentNumber}.`, relatedIds: [sh.id], at });
    await emit(x, ctx.orgId, "SHIPMENT_DISPATCHED", { shipmentId: sh.id }, { at: nowOf(ctx) });
  });
}

export async function completeStop(ctx: Ctx, stopId: string, podName: string) {
  return db.transaction(async (x) => {
    const [st] = await x.select().from(shipmentStop).where(and(eq(shipmentStop.id, stopId), eq(shipmentStop.orgId, ctx.orgId)));
    if (!st) throw new DomainError("Stop not found", "NOT_FOUND", 404);
    const at = nowOf(ctx);
    await x.update(shipmentStop).set({ status: "DELIVERED", actualArrivalAt: st.actualArrivalAt ?? at, podName: podName.slice(0, 80), podAt: at }).where(eq(shipmentStop.id, st.id));
    const soIds = (await x.select({ id: shipmentOrder.salesOrderId }).from(shipmentOrder).where(eq(shipmentOrder.stopId, st.id))).map((r) => r.id);
    if (soIds.length) {
      await x.execute(sql`UPDATE sales_order_line SET delivered_kg = GREATEST(picked_kg, allocated_kg) WHERE sales_order_id IN (${sql.join(soIds.map((i) => sql`${i}`), sql`, `)})`);
      await x.update(salesOrder).set({ status: "DELIVERED" }).where(inArray(salesOrder.id, soIds));
    }
    const [c] = await x.select().from(customer).where(eq(customer.id, st.customerId));
    const late = st.windowEnd && at > st.windowEnd ? Math.round((at.getTime() - st.windowEnd.getTime()) / 60000) : 0;
    await audit(x, ctx, { action: "DELIVERY_COMPLETED", entityType: "shipment", entityId: st.shipmentId, summary: `Delivered to ${c?.name} at ${fmtTime(at)}; POD signed by ${podName}${late ? ` (${late} min late)` : ""}.`, relatedIds: soIds, at });
    for (const id of soIds) await audit(x, ctx, { action: "ORDER_DELIVERED", entityType: "sales_order", entityId: id, summary: `Delivered; POD ${podName}.`, at });
    const remaining = await x.execute(sql`SELECT COUNT(*)::int AS n FROM shipment_stop WHERE shipment_id = ${st.shipmentId} AND status <> 'DELIVERED'`);
    if (Number((remaining.rows[0] as { n: number }).n) === 0) await x.update(shipment).set({ status: "COMPLETED", completedAt: at }).where(eq(shipment.id, st.shipmentId));
    await notify(x, ctx.orgId, { audience: "BUYER", customerId: st.customerId, title: "Delivered", body: `Your order was delivered at ${fmtTime(at)}.`, at });
    await emit(x, ctx.orgId, "DELIVERY_COMPLETED", { stopId: st.id, salesOrderIds: soIds }, { at: nowOf(ctx) });
  });
}
