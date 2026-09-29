/**
 * Read models for the vendor, supply and operations screens. Every query is tenant-scoped by orgId.
 * Read-only: no writes happen here.
 */
import "server-only";
import { and, asc, count, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db/client";
import {
  catchLot, customer, farm, goodsReceipt, goodsReceiptLine, inventoryMovement, message, pickList, pickListLine, purchaseOrder, purchaseOrderLine, quote, salesOrder,
  salesOrderLine, shipmentOrder, species, temperatureReading, vendor, vendorContact, vendorDocument, vendorLicence, vendorSpeciesCapability, vessel, warehouseLocation,
} from "@/lib/db/schema";
import { addDays } from "@/lib/domain/time";

// ---------------------------------------------------------------- Vendors

/** All vendors with species capabilities, vessels and farms (for the directory). */
export async function vendorDirectory(orgId: string) {
  const [vs, caps, vss, fms] = await Promise.all([
    db.select().from(vendor).where(eq(vendor.orgId, orgId)).orderBy(asc(vendor.name)),
    db
      .select({ vendorId: vendorSpeciesCapability.vendorId, speciesId: species.id, name: species.canonicalName, code: species.code, typicalKg: vendorSpeciesCapability.typicalKgPerNight })
      .from(vendorSpeciesCapability)
      .innerJoin(species, eq(species.id, vendorSpeciesCapability.speciesId))
      .where(eq(vendorSpeciesCapability.orgId, orgId))
      .orderBy(asc(species.canonicalName)),
    db.select().from(vessel).where(eq(vessel.orgId, orgId)).orderBy(asc(vessel.name)),
    db.select().from(farm).where(eq(farm.orgId, orgId)).orderBy(asc(farm.name)),
  ]);
  return vs.map((v) => ({
    vendor: v,
    capabilities: caps.filter((c) => c.vendorId === v.id),
    vessels: vss.filter((x) => x.vendorId === v.id),
    farms: fms.filter((x) => x.vendorId === v.id),
  }));
}

/** Everything on the vendor profile besides the scorecard (which comes from vendorProfile()). */
export async function vendorDetail(orgId: string, vendorId: string) {
  const [contacts, vss, fms, caps, lots, pos, msgs, resp] = await Promise.all([
    db.select().from(vendorContact).where(and(eq(vendorContact.orgId, orgId), eq(vendorContact.vendorId, vendorId))).orderBy(desc(vendorContact.isPrimary), asc(vendorContact.name)),
    db.select().from(vessel).where(and(eq(vessel.orgId, orgId), eq(vessel.vendorId, vendorId))).orderBy(asc(vessel.name)),
    db.select().from(farm).where(and(eq(farm.orgId, orgId), eq(farm.vendorId, vendorId))).orderBy(asc(farm.name)),
    db
      .select({ speciesId: species.id, name: species.canonicalName, code: species.code, typicalKg: vendorSpeciesCapability.typicalKgPerNight, sizeMinKg: vendorSpeciesCapability.sizeMinKg, sizeMaxKg: vendorSpeciesCapability.sizeMaxKg })
      .from(vendorSpeciesCapability)
      .innerJoin(species, eq(species.id, vendorSpeciesCapability.speciesId))
      .where(and(eq(vendorSpeciesCapability.orgId, orgId), eq(vendorSpeciesCapability.vendorId, vendorId)))
      .orderBy(asc(species.canonicalName)),
    db
      .select()
      .from(catchLot)
      .where(and(eq(catchLot.orgId, orgId), eq(catchLot.vendorId, vendorId), sql`${catchLot.parentLotId} IS NULL`))
      .orderBy(desc(catchLot.marketDate), desc(catchLot.expectedArrivalAt))
      .limit(15),
    db
      .select({ po: purchaseOrder, lines: sql<number>`COUNT(${purchaseOrderLine.id})::int`, kg: sql<string>`COALESCE(SUM(${purchaseOrderLine.quantityKg}),0)` })
      .from(purchaseOrder)
      .leftJoin(purchaseOrderLine, eq(purchaseOrderLine.purchaseOrderId, purchaseOrder.id))
      .where(and(eq(purchaseOrder.orgId, orgId), eq(purchaseOrder.vendorId, vendorId)))
      .groupBy(purchaseOrder.id)
      .orderBy(desc(purchaseOrder.marketDate), desc(purchaseOrder.createdAt))
      .limit(10),
    db.select().from(message).where(and(eq(message.orgId, orgId), eq(message.vendorId, vendorId))).orderBy(desc(message.at)).limit(30),
    db
      .select({ avg: sql<string | null>`AVG(${quote.respondedInMinutes})`, n: count(quote.respondedInMinutes) })
      .from(quote)
      .where(and(eq(quote.orgId, orgId), eq(quote.vendorId, vendorId))),
  ]);
  const avgResponseMinutes = resp[0]?.avg !== null && resp[0]?.avg !== undefined ? Math.round(Number(resp[0].avg)) : null;
  return { contacts, vessels: vss, farms: fms, capabilities: caps, lots, pos, messages: msgs.reverse(), avgResponseMinutes, responseSamples: Number(resp[0]?.n ?? 0) };
}

/** Licences and documents across all vendors. */
export async function vendorCompliance(orgId: string) {
  const [docs, lic] = await Promise.all([
    db
      .select({ d: vendorDocument, v: { id: vendor.id, name: vendor.name, code: vendor.code, type: vendor.type, country: vendor.country } })
      .from(vendorDocument)
      .innerJoin(vendor, eq(vendor.id, vendorDocument.vendorId))
      .where(eq(vendorDocument.orgId, orgId))
      .orderBy(asc(vendorDocument.expiresAt), asc(vendor.name)),
    db
      .select({ l: vendorLicence, v: { id: vendor.id, name: vendor.name, code: vendor.code, type: vendor.type, country: vendor.country } })
      .from(vendorLicence)
      .innerJoin(vendor, eq(vendor.id, vendorLicence.vendorId))
      .where(eq(vendorLicence.orgId, orgId))
      .orderBy(asc(vendorLicence.validTo), asc(vendor.name)),
  ]);
  return { docs, licences: lic };
}

// ---------------------------------------------------------------- Supply

const parentLot = alias(catchLot, "parent_lot");

/** Lots of a night with vendor, vessel/farm, location and parent lot number. Includes child lots. */
export async function lotsWithContext(orgId: string, marketDate: string, opts: { statuses?: (typeof catchLot.$inferSelect)["status"][]; speciesId?: string; onHandOnly?: boolean } = {}) {
  return db
    .select({
      l: catchLot,
      v: { id: vendor.id, name: vendor.name, code: vendor.code, type: vendor.type },
      vs: { name: vessel.name },
      fm: { name: farm.name },
      loc: { code: warehouseLocation.code, name: warehouseLocation.name },
      parent: { id: parentLot.id, lotNumber: parentLot.lotNumber },
      pol: { quantityKg: purchaseOrderLine.quantityKg, pricePerKg: purchaseOrderLine.pricePerKg, purchaseOrderId: purchaseOrderLine.purchaseOrderId },
    })
    .from(catchLot)
    .leftJoin(vendor, eq(vendor.id, catchLot.vendorId))
    .leftJoin(vessel, eq(vessel.id, catchLot.vesselId))
    .leftJoin(farm, eq(farm.id, catchLot.farmId))
    .leftJoin(warehouseLocation, eq(warehouseLocation.id, catchLot.locationId))
    .leftJoin(parentLot, eq(parentLot.id, catchLot.parentLotId))
    .leftJoin(purchaseOrderLine, eq(purchaseOrderLine.id, catchLot.purchaseOrderLineId))
    .where(
      and(
        eq(catchLot.orgId, orgId),
        eq(catchLot.marketDate, marketDate),
        opts.statuses ? inArray(catchLot.status, opts.statuses) : sql`true`,
        opts.speciesId ? eq(catchLot.speciesId, opts.speciesId) : sql`true`,
        opts.onHandOnly ? or(gt(catchLot.quantityAvailableKg, "0"), inArray(catchLot.status, ["AVAILABLE", "PARTIALLY_ALLOCATED", "ALLOCATED"])) : sql`true`,
      ),
    )
    .orderBy(asc(catchLot.expectedArrivalAt), asc(catchLot.lotNumber));
}

export async function speciesOptions(orgId: string) {
  return db.select({ id: species.id, name: species.canonicalName, code: species.code }).from(species).where(and(eq(species.orgId, orgId), eq(species.active, true))).orderBy(asc(species.canonicalName));
}

/** On-hand stock (available + allocated) by species and location for tonight and the previous `carryNights` nights. */
export async function inventoryPosition(orgId: string, marketDate: string, carryNights = 2) {
  const from = addDays(marketDate, -carryNights);
  const r = await db.execute(sql`
    SELECT l.market_date AS market_date, l.species_id AS species_id, COALESCE(s.canonical_name, l.canonical_species_name, 'Unmapped') AS species_name, s.code AS species_code,
           s.storage AS storage, s.freshness_hours AS freshness_hours,
           wl.code AS loc_code, wl.name AS loc_name, wl.type AS loc_type,
           COUNT(*)::int AS lots,
           SUM(l.quantity_available_kg) AS available_kg, SUM(l.quantity_allocated_kg) AS allocated_kg,
           SUM(l.quantity_available_kg * COALESCE(l.agreed_cost_per_kg, 0)) AS cost_value,
           MIN(l.received_time) AS oldest_received
    FROM catch_lot l
    LEFT JOIN species s ON s.id = l.species_id
    LEFT JOIN warehouse_location wl ON wl.id = l.location_id
    WHERE l.org_id = ${orgId} AND l.market_date >= ${from} AND l.market_date <= ${marketDate}
      AND l.status NOT IN ('EXPECTED','LANDED','DISPATCHED','CLOSED','REJECTED')
      AND (l.quantity_available_kg + l.quantity_allocated_kg) > 0
    GROUP BY 1,2,3,4,5,6,7,8,9
    ORDER BY species_name, l.market_date DESC, loc_code`);
  return (r.rows as Record<string, unknown>[]).map((x) => ({
    marketDate: String(x.market_date),
    speciesId: (x.species_id as string | null) ?? null,
    speciesName: String(x.species_name),
    speciesCode: (x.species_code as string | null) ?? null,
    storage: (x.storage as string | null) ?? null,
    freshnessHours: x.freshness_hours === null ? null : Number(x.freshness_hours),
    locCode: (x.loc_code as string | null) ?? null,
    locName: (x.loc_name as string | null) ?? null,
    locType: (x.loc_type as string | null) ?? null,
    lots: Number(x.lots),
    availableKg: Number(x.available_kg),
    allocatedKg: Number(x.allocated_kg),
    costValue: Number(x.cost_value),
    oldestReceived: x.oldest_received ? new Date(x.oldest_received as string).toISOString() : null,
  }));
}

/** Inventory movement ledger, newest first, paginated. */
export async function inventoryLedger(orgId: string, page: number, pageSize = 50, opts: { type?: string } = {}) {
  const where = and(eq(inventoryMovement.orgId, orgId), opts.type ? eq(inventoryMovement.type, opts.type as (typeof inventoryMovement.$inferSelect)["type"]) : sql`true`);
  const [rows, total] = await Promise.all([
    db
      .select({
        m: inventoryMovement,
        l: { id: catchLot.id, lotNumber: catchLot.lotNumber, species: catchLot.canonicalSpeciesName, marketDate: catchLot.marketDate, processingState: catchLot.processingState },
        loc: { code: warehouseLocation.code },
      })
      .from(inventoryMovement)
      .innerJoin(catchLot, eq(catchLot.id, inventoryMovement.lotId))
      .leftJoin(warehouseLocation, eq(warehouseLocation.id, inventoryMovement.locationId))
      .where(where)
      .orderBy(desc(inventoryMovement.at), desc(inventoryMovement.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: count() }).from(inventoryMovement).where(where),
  ]);
  return { rows, total: Number(total[0]?.n ?? 0) };
}

// ---------------------------------------------------------------- Receiving

/** Goods receipt lines for lots of a night (declared vs actual, rejection, temperature, grade). */
export async function receiptsForNight(orgId: string, marketDate: string) {
  return db
    .select({
      grl: goodsReceiptLine,
      gr: { grnNumber: goodsReceipt.grnNumber, receivedAt: goodsReceipt.receivedAt, receivedBy: goodsReceipt.receivedBy },
      l: { id: catchLot.id, lotNumber: catchLot.lotNumber, species: catchLot.canonicalSpeciesName, processingState: catchLot.processingState, status: catchLot.status },
      v: { id: vendor.id, name: vendor.name },
    })
    .from(goodsReceiptLine)
    .innerJoin(goodsReceipt, eq(goodsReceipt.id, goodsReceiptLine.goodsReceiptId))
    .innerJoin(catchLot, eq(catchLot.id, goodsReceiptLine.lotId))
    .leftJoin(vendor, eq(vendor.id, catchLot.vendorId))
    .where(and(eq(goodsReceiptLine.orgId, orgId), eq(catchLot.marketDate, marketDate)))
    .orderBy(desc(goodsReceipt.receivedAt));
}

// ---------------------------------------------------------------- Picking

export async function pickListsForNight(orgId: string, marketDate: string) {
  const lists = await db.select().from(pickList).where(and(eq(pickList.orgId, orgId), eq(pickList.marketDate, marketDate))).orderBy(asc(pickList.pickListNumber));
  const lines = lists.length
    ? await db
        .select({
          pl: pickListLine,
          lot: { id: catchLot.id, lotNumber: catchLot.lotNumber, processingState: catchLot.processingState, qualityGrade: catchLot.qualityGrade },
          sp: { name: species.canonicalName, code: species.code },
          so: { id: salesOrder.id, soNumber: salesOrder.soNumber, status: salesOrder.status },
          c: { name: customer.name, code: customer.code, deliveryWindowStart: customer.deliveryWindowStart, deliveryWindowEnd: customer.deliveryWindowEnd },
          loc: { code: warehouseLocation.code },
        })
        .from(pickListLine)
        .innerJoin(catchLot, eq(catchLot.id, pickListLine.lotId))
        .innerJoin(salesOrderLine, eq(salesOrderLine.id, pickListLine.salesOrderLineId))
        .innerJoin(species, eq(species.id, salesOrderLine.speciesId))
        .innerJoin(salesOrder, eq(salesOrder.id, salesOrderLine.salesOrderId))
        .innerJoin(customer, eq(customer.id, salesOrder.customerId))
        .leftJoin(warehouseLocation, eq(warehouseLocation.id, catchLot.locationId))
        .where(and(eq(pickListLine.orgId, orgId), inArray(pickListLine.pickListId, lists.map((l) => l.id))))
        .orderBy(asc(salesOrder.soNumber), asc(catchLot.lotNumber))
    : [];
  return lists.map((p) => ({ list: p, lines: lines.filter((x) => x.pl.pickListId === p.id) }));
}

/** Confirmed allocations for a night that are not on any pick list yet. */
export async function unpickedAllocationCount(orgId: string, marketDate: string) {
  const r = await db.execute(sql`
    SELECT COUNT(*)::int AS n, COALESCE(SUM(a.quantity_kg),0) AS kg FROM allocation a
    JOIN sales_order_line sol ON sol.id = a.sales_order_line_id JOIN sales_order so ON so.id = sol.sales_order_id
    WHERE a.org_id = ${orgId} AND so.market_date = ${marketDate} AND a.status = 'CONFIRMED'
      AND NOT EXISTS (SELECT 1 FROM pick_list_line pll WHERE pll.allocation_id = a.id)`);
  const row = r.rows[0] as { n: number; kg: string } | undefined;
  return { n: Number(row?.n ?? 0), kg: Number(row?.kg ?? 0) };
}

// ---------------------------------------------------------------- Dispatch & routes

/** Orders per stop and vehicle temperature readings for a set of shipments. */
export async function shipmentExtras(orgId: string, shipmentIds: string[]) {
  if (!shipmentIds.length) return { orders: [], temps: [] };
  const [orders, temps] = await Promise.all([
    db
      .select({ stopId: shipmentOrder.stopId, soId: salesOrder.id, soNumber: salesOrder.soNumber, status: salesOrder.status })
      .from(shipmentOrder)
      .innerJoin(salesOrder, eq(salesOrder.id, shipmentOrder.salesOrderId))
      .where(and(eq(shipmentOrder.orgId, orgId), inArray(shipmentOrder.shipmentId, shipmentIds))),
    db
      .select()
      .from(temperatureReading)
      .where(and(eq(temperatureReading.orgId, orgId), inArray(temperatureReading.shipmentId, shipmentIds)))
      .orderBy(desc(temperatureReading.at)),
  ]);
  return { orders, temps };
}

/** The dispatch depot (falls back to Jurong Fishery Port coordinates). */
export async function depotFor(orgId: string) {
  const [d] = await db.select().from(warehouseLocation).where(and(eq(warehouseLocation.orgId, orgId), eq(warehouseLocation.type, "DISPATCH_BAY"))).limit(1);
  return { name: d?.name ?? "Jurong Fishery Port", lat: Number(d?.lat ?? 1.3036), lng: Number(d?.lng ?? 103.7194) };
}

/** Nights (most recent first) that have delivery runs, for the night picker. */
export async function nightsWithRuns(orgId: string, upTo: string, limit = 7) {
  const r = await db.execute(sql`SELECT market_date, COUNT(*)::int AS n FROM shipment WHERE org_id = ${orgId} AND market_date <= ${upTo} AND status <> 'CANCELLED' GROUP BY market_date ORDER BY market_date DESC LIMIT ${limit}`);
  return (r.rows as { market_date: string; n: number }[]).map((x) => ({ date: String(x.market_date), runs: Number(x.n) }));
}

/** Stops of a night whose SO count/kg is used to show what is waiting for routing. */
export async function ordersAwaitingRoute(orgId: string, marketDate: string) {
  const r = await db.execute(sql`
    SELECT so.status, COUNT(*)::int AS n FROM sales_order so
    WHERE so.org_id = ${orgId} AND so.market_date = ${marketDate} AND so.status IN ('PACKED','PICKING','ALLOCATED')
      AND NOT EXISTS (SELECT 1 FROM shipment_order sho JOIN shipment sh ON sh.id = sho.shipment_id WHERE sho.sales_order_id = so.id AND sh.status <> 'CANCELLED')
    GROUP BY so.status`);
  return (r.rows as { status: string; n: number }[]).map((x) => ({ status: x.status, n: Number(x.n) }));
}

