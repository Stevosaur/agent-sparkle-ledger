/**
 * Read models for screens. All tenant-scoped. Keep heavy aggregation in SQL.
 */
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  agentAction, agentRun, allocation, approval, auditEvent, catchLot, customer, opsException, purchaseOrder, purchaseOrderLine, quote, quoteLine, salesOrder, salesOrderLine, shipment, shipmentStop, species, vendor, vessel, farm, driver, vehicle,
} from "@/lib/db/schema";
import { addDays } from "@/lib/domain/time";
import { priceStats } from "@/lib/domain/pricing";

export async function lotsForNight(orgId: string, marketDate: string, opts: { statuses?: (typeof catchLot.$inferSelect)["status"][]; speciesId?: string; includeChildren?: boolean } = {}) {
  return db
    .select({ l: catchLot, v: vendor, vs: vessel, fm: farm })
    .from(catchLot)
    .leftJoin(vendor, eq(vendor.id, catchLot.vendorId))
    .leftJoin(vessel, eq(vessel.id, catchLot.vesselId))
    .leftJoin(farm, eq(farm.id, catchLot.farmId))
    .where(
      and(
        eq(catchLot.orgId, orgId),
        eq(catchLot.marketDate, marketDate),
        opts.statuses ? inArray(catchLot.status, opts.statuses) : sql`true`,
        opts.speciesId ? eq(catchLot.speciesId, opts.speciesId) : sql`true`,
        opts.includeChildren ? sql`true` : isNull(catchLot.parentLotId),
      ),
    )
    .orderBy(asc(catchLot.expectedArrivalAt), asc(catchLot.lotNumber));
}

export async function pendingApprovals(orgId: string, limit = 50) {
  return db
    .select({ a: approval, act: agentAction, run: agentRun })
    .from(approval)
    .leftJoin(agentAction, eq(agentAction.id, approval.agentActionId))
    .leftJoin(agentRun, eq(agentRun.id, agentAction.agentRunId))
    .where(and(eq(approval.orgId, orgId), eq(approval.status, "PENDING")))
    .orderBy(desc(approval.requestedAt))
    .limit(limit);
}

export async function recentApprovals(orgId: string, limit = 30) {
  return db
    .select({ a: approval, act: agentAction })
    .from(approval)
    .leftJoin(agentAction, eq(agentAction.id, approval.agentActionId))
    .where(and(eq(approval.orgId, orgId), sql`${approval.status} <> 'PENDING'`))
    .orderBy(desc(sql`coalesce(${approval.decidedAt}, ${approval.requestedAt})`))
    .limit(limit);
}

export async function openExceptions(orgId: string, types?: (typeof opsException.$inferSelect)["type"][]) {
  return db
    .select()
    .from(opsException)
    .where(and(eq(opsException.orgId, orgId), sql`${opsException.status} <> 'RESOLVED'`, types ? inArray(opsException.type, types) : sql`true`))
    .orderBy(desc(opsException.openedAt));
}

export async function recentAgentRuns(orgId: string, limit = 20, agent?: string) {
  return db
    .select()
    .from(agentRun)
    .where(and(eq(agentRun.orgId, orgId), agent ? eq(agentRun.agent, agent) : sql`true`))
    .orderBy(desc(agentRun.startedAt))
    .limit(limit);
}

export async function shipmentsForNight(orgId: string, marketDate: string) {
  const shs = await db
    .select({ sh: shipment, v: vehicle, d: driver })
    .from(shipment)
    .leftJoin(vehicle, eq(vehicle.id, shipment.vehicleId))
    .leftJoin(driver, eq(driver.id, shipment.driverId))
    .where(and(eq(shipment.orgId, orgId), eq(shipment.marketDate, marketDate), sql`${shipment.status} <> 'CANCELLED'`))
    .orderBy(asc(shipment.shipmentNumber));
  const stops = shs.length
    ? await db
        .select({ st: shipmentStop, c: customer })
        .from(shipmentStop)
        .innerJoin(customer, eq(customer.id, shipmentStop.customerId))
        .where(inArray(shipmentStop.shipmentId, shs.map((s) => s.sh.id)))
        .orderBy(asc(shipmentStop.sequence))
    : [];
  return shs.map((s) => ({ ...s, stops: stops.filter((x) => x.st.shipmentId === s.sh.id) }));
}

export async function ordersForNight(orgId: string, marketDate: string) {
  const sos = await db
    .select({ so: salesOrder, c: customer })
    .from(salesOrder)
    .innerJoin(customer, eq(customer.id, salesOrder.customerId))
    .where(and(eq(salesOrder.orgId, orgId), eq(salesOrder.marketDate, marketDate)))
    .orderBy(asc(customer.priorityTier), asc(customer.name));
  const lines = sos.length
    ? await db
        .select({ l: salesOrderLine, sp: species })
        .from(salesOrderLine)
        .innerJoin(species, eq(species.id, salesOrderLine.speciesId))
        .where(inArray(salesOrderLine.salesOrderId, sos.map((s) => s.so.id)))
    : [];
  return sos.map((s) => ({ ...s, lines: lines.filter((l) => l.l.salesOrderId === s.so.id) }));
}

export async function demandLinesForSpecies(orgId: string, marketDate: string, speciesId: string) {
  return db
    .select({ l: salesOrderLine, so: salesOrder, c: customer })
    .from(salesOrderLine)
    .innerJoin(salesOrder, eq(salesOrder.id, salesOrderLine.salesOrderId))
    .innerJoin(customer, eq(customer.id, salesOrder.customerId))
    .where(and(eq(salesOrder.orgId, orgId), eq(salesOrder.marketDate, marketDate), eq(salesOrderLine.speciesId, speciesId), sql`${salesOrder.status} <> 'CANCELLED'`))
    .orderBy(asc(customer.priorityTier), asc(salesOrder.confirmedAt));
}

export async function allocationsForSpecies(orgId: string, marketDate: string, speciesId: string) {
  return db
    .select({ a: allocation, l: catchLot, c: customer, so: salesOrder })
    .from(allocation)
    .innerJoin(catchLot, eq(catchLot.id, allocation.lotId))
    .innerJoin(salesOrderLine, eq(salesOrderLine.id, allocation.salesOrderLineId))
    .innerJoin(salesOrder, eq(salesOrder.id, salesOrderLine.salesOrderId))
    .innerJoin(customer, eq(customer.id, salesOrder.customerId))
    .where(and(eq(allocation.orgId, orgId), eq(salesOrder.marketDate, marketDate), eq(catchLot.speciesId, speciesId), sql`${allocation.status} <> 'RELEASED'`))
    .orderBy(asc(customer.name));
}

export async function quotesForSpecies(orgId: string, marketDate: string, speciesId: string) {
  return db
    .select({ q: quote, ql: quoteLine, v: vendor })
    .from(quoteLine)
    .innerJoin(quote, eq(quote.id, quoteLine.quoteId))
    .innerJoin(vendor, eq(vendor.id, quote.vendorId))
    .where(and(eq(quote.orgId, orgId), eq(quote.marketDate, marketDate), eq(quoteLine.speciesId, speciesId)));
}

/** Daily purchase (and sell) price history for charts — from platform records only. */
export async function priceHistory(orgId: string, speciesId: string, marketDate: string, days = 90) {
  const from = addDays(marketDate, -days);
  const buy = await db.execute(sql`
    SELECT po.market_date AS d, SUM(pol.price_per_kg * pol.quantity_kg) / NULLIF(SUM(pol.quantity_kg),0) AS wavg, MIN(pol.price_per_kg) AS lo, MAX(pol.price_per_kg) AS hi, SUM(pol.quantity_kg) AS kg
    FROM purchase_order_line pol JOIN purchase_order po ON po.id = pol.purchase_order_id
    WHERE po.org_id = ${orgId} AND pol.species_id = ${speciesId} AND po.market_date >= ${from} AND po.market_date <= ${marketDate} AND po.status NOT IN ('CANCELLED','DRAFT')
    GROUP BY po.market_date ORDER BY po.market_date`);
  const sell = await db.execute(sql`
    SELECT so.market_date AS d, SUM(sol.price_per_kg * sol.requested_kg) / NULLIF(SUM(sol.requested_kg),0) AS wavg
    FROM sales_order_line sol JOIN sales_order so ON so.id = sol.sales_order_id
    WHERE so.org_id = ${orgId} AND sol.species_id = ${speciesId} AND so.market_date >= ${from} AND so.market_date <= ${marketDate} AND so.status <> 'CANCELLED'
    GROUP BY so.market_date ORDER BY so.market_date`);
  const ask = await db.execute(sql`
    SELECT market_date AS d, AVG(asking_price_per_kg) AS ask FROM catch_lot
    WHERE org_id = ${orgId} AND species_id = ${speciesId} AND market_date >= ${from} AND market_date <= ${marketDate} AND asking_price_per_kg IS NOT NULL
    GROUP BY market_date ORDER BY market_date`);
  const sellBy = new Map((sell.rows as { d: string; wavg: string }[]).map((r) => [r.d, Number(r.wavg)]));
  const askBy = new Map((ask.rows as { d: string; ask: string }[]).map((r) => [r.d, Number(r.ask)]));
  const points = (buy.rows as { d: string; wavg: string; lo: string; hi: string; kg: string }[]).map((r) => ({
    date: r.d,
    buy: Math.round(Number(r.wavg) * 100) / 100,
    lo: Number(r.lo),
    hi: Number(r.hi),
    kg: Number(r.kg),
    sell: sellBy.has(r.d) ? Math.round(sellBy.get(r.d)! * 100) / 100 : null,
    ask: askBy.has(r.d) ? Math.round(askBy.get(r.d)! * 100) / 100 : null,
  }));
  const stats = (d: number) => priceStats(points.filter((p) => p.date > addDays(marketDate, -d) && p.date < marketDate).map((p) => ({ at: p.date, pricePerKg: p.buy, quantityKg: p.kg })));
  return { points, s7: stats(7), s30: stats(30), s90: stats(90) };
}

export async function timelineFor(orgId: string, entityIds: string[], limit = 100) {
  if (!entityIds.length) return [];
  return db
    .select()
    .from(auditEvent)
    .where(and(eq(auditEvent.orgId, orgId), sql`(${inArray(auditEvent.entityId, entityIds)} OR ${auditEvent.relatedIds} && ARRAY[${sql.join(entityIds.map((i) => sql`${i}::uuid`), sql`, `)}])`))
    .orderBy(desc(auditEvent.at))
    .limit(limit);
}

export async function actionsForSpecies(orgId: string, speciesId: string, since: Date) {
  return db
    .select({ act: agentAction, run: agentRun })
    .from(agentAction)
    .innerJoin(agentRun, eq(agentRun.id, agentAction.agentRunId))
    .where(and(eq(agentAction.orgId, orgId), gte(agentAction.createdAt, since), sql`${agentAction.affectedRecords} @> ${JSON.stringify([{ id: speciesId }])}::jsonb`))
    .orderBy(desc(agentAction.createdAt))
    .limit(10);
}

export async function poLinesForNight(orgId: string, marketDate: string) {
  return db
    .select({ po: purchaseOrder, pol: purchaseOrderLine, v: vendor, sp: species })
    .from(purchaseOrderLine)
    .innerJoin(purchaseOrder, eq(purchaseOrder.id, purchaseOrderLine.purchaseOrderId))
    .innerJoin(vendor, eq(vendor.id, purchaseOrder.vendorId))
    .innerJoin(species, eq(species.id, purchaseOrderLine.speciesId))
    .where(and(eq(purchaseOrder.orgId, orgId), eq(purchaseOrder.marketDate, marketDate)));
}

