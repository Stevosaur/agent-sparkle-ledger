/**
 * Traceability & recall: one step back (supplier, vessel/farm, receipt) and one step forward
 * (child lots, buyers, deliveries, invoices), plus full genealogy via recursive CTE.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  allocation, auditEvent, catchLot, catchLotDocument, customer, customerInvoice, customerInvoiceLine, farm, goodsReceipt, goodsReceiptLine, lotTransformation, purchaseOrder, purchaseOrderLine,
  qualityInspection, recallAffectedCustomer, recallAffectedLot, recallCase, salesOrder, salesOrderLine, shipment, shipmentOrder, shipmentStop, species, supplierInvoice, temperatureReading, vendor, vessel,
} from "@/lib/db/schema";
import { D, toKgStr } from "@/lib/domain/decimal";
import { audit } from "./audit";
import { DomainError, nowOf, type Ctx } from "./context";
import { notify } from "./common";
import { nextSeq } from "./sequence";
import { findLotByNumberOrId } from "./lots";
import { emit } from "@/lib/events/bus";

export async function lotFamily(orgId: string, lotId: string) {
  const r = await db.execute(sql`
    WITH RECURSIVE up AS (
      SELECT id, parent_lot_id, 0 AS depth FROM catch_lot WHERE id = ${lotId} AND org_id = ${orgId}
      UNION ALL SELECT l.id, l.parent_lot_id, up.depth - 1 FROM catch_lot l JOIN up ON l.id = up.parent_lot_id
    ),
    root AS (SELECT id FROM up ORDER BY depth ASC LIMIT 1),
    down AS (
      SELECT id, parent_lot_id, 0 AS depth FROM catch_lot WHERE id = (SELECT id FROM root)
      UNION ALL SELECT l.id, l.parent_lot_id, down.depth + 1 FROM catch_lot l JOIN down ON l.parent_lot_id = down.id
    )
    SELECT id, parent_lot_id, depth FROM down`);
  return r.rows as { id: string; parent_lot_id: string | null; depth: number }[];
}

export async function traceLot(orgId: string, ref: string) {
  const lot = await findLotByNumberOrId(orgId, ref);
  if (!lot) return null;
  const family = await lotFamily(orgId, lot.id);
  const ids = family.map((f) => f.id);
  if (!ids.length) return null;
  const lots = await db.select().from(catchLot).where(inArray(catchLot.id, ids));
  const root = lots.find((l) => !l.parentLotId) ?? lot;
  const [v] = root.vendorId ? await db.select().from(vendor).where(eq(vendor.id, root.vendorId)) : [];
  const [vsl] = root.vesselId ? await db.select().from(vessel).where(eq(vessel.id, root.vesselId)) : [];
  const [fm] = root.farmId ? await db.select().from(farm).where(eq(farm.id, root.farmId)) : [];
  const [sp] = root.speciesId ? await db.select().from(species).where(eq(species.id, root.speciesId)) : [];
  const po = root.purchaseOrderLineId
    ? (await db.select({ po: purchaseOrder, pol: purchaseOrderLine }).from(purchaseOrderLine).innerJoin(purchaseOrder, eq(purchaseOrder.id, purchaseOrderLine.purchaseOrderId)).where(eq(purchaseOrderLine.id, root.purchaseOrderLineId)))[0] ?? null
    : null;
  const receipts = await db.select({ grl: goodsReceiptLine, gr: goodsReceipt }).from(goodsReceiptLine).innerJoin(goodsReceipt, eq(goodsReceipt.id, goodsReceiptLine.goodsReceiptId)).where(inArray(goodsReceiptLine.lotId, ids));
  const inspections = await db.select().from(qualityInspection).where(inArray(qualityInspection.lotId, ids));
  const temps = await db.select().from(temperatureReading).where(inArray(temperatureReading.lotId, ids));
  const transformations = await db.select().from(lotTransformation).where(inArray(lotTransformation.parentLotId, ids));
  const docs = await db.select().from(catchLotDocument).where(inArray(catchLotDocument.lotId, ids));
  const allocs = await db
    .select({ a: allocation, sol: salesOrderLine, so: salesOrder, c: customer })
    .from(allocation)
    .innerJoin(salesOrderLine, eq(salesOrderLine.id, allocation.salesOrderLineId))
    .innerJoin(salesOrder, eq(salesOrder.id, salesOrderLine.salesOrderId))
    .innerJoin(customer, eq(customer.id, salesOrder.customerId))
    .where(and(inArray(allocation.lotId, ids), sql`${allocation.status} <> 'RELEASED'`));
  const soIds = [...new Set(allocs.map((a) => a.so.id))];
  const deliveries = soIds.length
    ? await db.select({ sho: shipmentOrder, sh: shipment, st: shipmentStop }).from(shipmentOrder).innerJoin(shipment, eq(shipment.id, shipmentOrder.shipmentId)).innerJoin(shipmentStop, eq(shipmentStop.id, shipmentOrder.stopId)).where(inArray(shipmentOrder.salesOrderId, soIds))
    : [];
  const supplierInvoices = po ? await db.select().from(supplierInvoice).where(eq(supplierInvoice.purchaseOrderId, po.po.id)) : [];
  const customerInvoices = await db
    .selectDistinct({ ci: customerInvoice })
    .from(customerInvoiceLine)
    .innerJoin(customerInvoice, eq(customerInvoice.id, customerInvoiceLine.customerInvoiceId))
    .where(or(inArray(customerInvoiceLine.lotId, ids), soIds.length ? inArray(customerInvoice.salesOrderId, soIds) : sql`false`));
  const timeline = await db
    .select()
    .from(auditEvent)
    .where(and(eq(auditEvent.orgId, orgId), or(inArray(auditEvent.entityId, [...ids, ...soIds, ...(po ? [po.po.id] : []), ...supplierInvoices.map((s) => s.id)]), sql`${auditEvent.relatedIds} && ARRAY[${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}]`)))
    .orderBy(desc(auditEvent.at))
    .limit(200);

  const byCustomer = new Map<string, { customerId: string; name: string; kg: number; orders: Set<string>; lots: Set<string> }>();
  for (const a of allocs) {
    const e = byCustomer.get(a.c.id) ?? { customerId: a.c.id, name: a.c.name, kg: 0, orders: new Set<string>(), lots: new Set<string>() };
    e.kg += Number(a.a.quantityKg);
    e.orders.add(a.so.soNumber);
    e.lots.add(lots.find((l) => l.id === a.a.lotId)?.lotNumber ?? "");
    byCustomer.set(a.c.id, e);
  }
  const completeness = [
    { item: "Supplier identified", ok: !!v },
    { item: "Vessel / farm recorded", ok: !!(vsl || fm) },
    { item: "Source country", ok: !!root.sourceCountry },
    { item: "Species mapped", ok: !!sp },
    { item: "Receiving weight & grade", ok: receipts.length > 0 },
    { item: "Temperature at receiving", ok: temps.length > 0 },
    { item: "Downstream customers linked", ok: allocs.length > 0 || root.status === "EXPECTED" },
    { item: "Import / catch document reference", ok: docs.length > 0 || !!Object.keys(root.compliance ?? {}).length || root.sourceCountry === "SG" },
  ];
  return {
    lot, root, lots, family, vendor: v ?? null, vessel: vsl ?? null, farm: fm ?? null, species: sp ?? null, po, receipts, inspections, temps, transformations, docs, allocations: allocs, deliveries,
    supplierInvoices, customerInvoices: customerInvoices.map((c) => c.ci), timeline,
    customers: [...byCustomer.values()].map((c) => ({ ...c, kg: Math.round(c.kg * 10) / 10, orders: [...c.orders], lots: [...c.lots] })),
    completeness,
  };
}

/** Open a recall: lock down on-hand affected stock and draft (never send) a customer contact list. */
export async function openRecall(ctx: Ctx, lotRef: string, reason: string, severity: "PRECAUTIONARY" | "CLASS_II" | "CLASS_I" = "PRECAUTIONARY") {
  const t = await traceLot(ctx.orgId, lotRef);
  if (!t) throw new DomainError("Lot not found", "NOT_FOUND", 404);
  return db.transaction(async (x) => {
    const n = await nextSeq(x, ctx.orgId, "RECALL");
    const [rc] = await x.insert(recallCase).values({ orgId: ctx.orgId, caseNumber: `RC-${String(n).padStart(4, "0")}`, rootLotId: t.root.id, reason, severity, openedBy: ctx.actor.label }).returning();
    for (const l of t.lots) {
      const onHand = D(l.quantityAvailableKg).plus(D(l.quantityAllocatedKg));
      await x.insert(recallAffectedLot).values({ orgId: ctx.orgId, recallCaseId: rc.id, lotId: l.id, relation: l.id === t.root.id ? "ROOT" : l.parentLotId === t.root.id ? "CHILD" : "DESCENDANT", quantityOnHandKg: toKgStr(onHand), holdPlaced: onHand.gt(0) });
    }
    for (const c of t.customers) {
      await x.insert(recallAffectedCustomer).values({ orgId: ctx.orgId, recallCaseId: rc.id, customerId: c.customerId, quantityKg: toKgStr(c.kg), lotNumbers: c.lots, salesOrderNumbers: c.orders, contactStatus: "DRAFT" });
    }
    await audit(x, ctx, {
      action: "RECALL_OPENED",
      entityType: "catch_lot",
      entityId: t.root.id,
      summary: `${rc.caseNumber} opened (${severity.toLowerCase().replace("_", " ")}): ${reason}. ${t.lots.length} lot(s), ${t.customers.length} customer(s) potentially affected. Contact list drafted — not sent.`,
      relatedIds: [rc.id, ...t.lots.map((l) => l.id)],
    });
    await notify(x, ctx.orgId, { audience: "COMPLIANCE", title: `Recall ${rc.caseNumber} opened`, body: `${t.customers.length} customers potentially affected. Review and approve the draft contact list.`, href: `/trace/recall/${rc.id}` });
    await emit(x, ctx.orgId, "RECALL_OPENED", { recallCaseId: rc.id }, { at: nowOf(ctx) });
    return rc;
  });
}

export async function getRecall(orgId: string, id: string) {
  const [rc] = await db.select().from(recallCase).where(and(eq(recallCase.id, id), eq(recallCase.orgId, orgId)));
  if (!rc) return null;
  const lots = await db.select({ ral: recallAffectedLot, l: catchLot }).from(recallAffectedLot).innerJoin(catchLot, eq(catchLot.id, recallAffectedLot.lotId)).where(eq(recallAffectedLot.recallCaseId, rc.id));
  const customers = await db.select({ rac: recallAffectedCustomer, c: customer }).from(recallAffectedCustomer).innerJoin(customer, eq(customer.id, recallAffectedCustomer.customerId)).where(eq(recallAffectedCustomer.recallCaseId, rc.id));
  const [root] = await db.select().from(catchLot).where(eq(catchLot.id, rc.rootLotId));
  return { rc, root, lots, customers };
}
