/**
 * Read models for the Demand, Procurement and Orders screens. Every query is tenant-scoped by orgId.
 */
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  allocation, approval, catchLot, customer, customerInvoice, driver, goodsReceipt, goodsReceiptLine, purchaseOrder, purchaseOrderLine, quote, quoteLine, rfq,
  salesOrder, salesOrderLine, shipment, shipmentOrder, shipmentStop, species, standingOrder, supplierInvoice, vehicle, vendor, vendorSpeciesCapability,
} from "@/lib/db/schema";

// ---------------------------------------------------------------- pickers

export async function customerOptions(orgId: string) {
  return db
    .select({ id: customer.id, code: customer.code, name: customer.name, type: customer.type, priorityTier: customer.priorityTier })
    .from(customer)
    .where(and(eq(customer.orgId, orgId), eq(customer.active, true)))
    .orderBy(asc(customer.name));
}

export async function speciesOptions(orgId: string) {
  return db
    .select({ id: species.id, code: species.code, name: species.canonicalName, localNames: species.localNames, typicalSizeMinKg: species.typicalSizeMinKg, typicalSizeMaxKg: species.typicalSizeMaxKg })
    .from(species)
    .where(and(eq(species.orgId, orgId), eq(species.active, true)))
    .orderBy(asc(species.canonicalName));
}

export async function vendorOptionsWithCapabilities(orgId: string) {
  const [vs, caps] = await Promise.all([
    db
      .select({ id: vendor.id, code: vendor.code, name: vendor.name, type: vendor.type, relationshipTier: vendor.relationshipTier, whatsappNumber: vendor.whatsappNumber })
      .from(vendor)
      .where(and(eq(vendor.orgId, orgId), eq(vendor.active, true)))
      .orderBy(asc(vendor.name)),
    db
      .select({ vendorId: vendorSpeciesCapability.vendorId, speciesId: vendorSpeciesCapability.speciesId, typicalKgPerNight: vendorSpeciesCapability.typicalKgPerNight })
      .from(vendorSpeciesCapability)
      .where(eq(vendorSpeciesCapability.orgId, orgId)),
  ]);
  return { vendors: vs, capabilities: caps };
}

// ---------------------------------------------------------------- sales orders

type SoStatus = (typeof salesOrder.$inferSelect)["status"];

/** Orders for one market night with lines (optionally one customer only — buyers see only their own). */
export async function ordersWithLines(orgId: string, marketDate: string, opts: { customerId?: string | null; statuses?: SoStatus[] } = {}) {
  const sos = await db
    .select({ so: salesOrder, c: customer })
    .from(salesOrder)
    .innerJoin(customer, eq(customer.id, salesOrder.customerId))
    .where(
      and(
        eq(salesOrder.orgId, orgId),
        eq(salesOrder.marketDate, marketDate),
        opts.customerId ? eq(salesOrder.customerId, opts.customerId) : sql`true`,
        opts.statuses ? inArray(salesOrder.status, opts.statuses) : sql`true`,
      ),
    )
    .orderBy(asc(customer.priorityTier), asc(customer.name), asc(salesOrder.soNumber));
  const lines = sos.length
    ? await db
        .select({ l: salesOrderLine, sp: species })
        .from(salesOrderLine)
        .innerJoin(species, eq(species.id, salesOrderLine.speciesId))
        .where(and(eq(salesOrderLine.orgId, orgId), inArray(salesOrderLine.salesOrderId, sos.map((s) => s.so.id))))
        .orderBy(asc(species.canonicalName))
    : [];
  return sos.map((s) => ({ ...s, lines: lines.filter((l) => l.l.salesOrderId === s.so.id) }));
}

export async function salesOrderDetail(orgId: string, id: string) {
  const [head] = await db
    .select({ so: salesOrder, c: customer })
    .from(salesOrder)
    .innerJoin(customer, eq(customer.id, salesOrder.customerId))
    .where(and(eq(salesOrder.orgId, orgId), eq(salesOrder.id, id)));
  if (!head) return null;
  const lines = await db
    .select({ l: salesOrderLine, sp: species })
    .from(salesOrderLine)
    .innerJoin(species, eq(species.id, salesOrderLine.speciesId))
    .where(and(eq(salesOrderLine.orgId, orgId), eq(salesOrderLine.salesOrderId, id)));
  const lineIds = lines.map((l) => l.l.id);
  const [allocs, ships, invoices] = await Promise.all([
    lineIds.length
      ? db
          .select({ a: allocation, lot: { id: catchLot.id, lotNumber: catchLot.lotNumber, status: catchLot.status, processingState: catchLot.processingState }, v: { id: vendor.id, name: vendor.name } })
          .from(allocation)
          .innerJoin(catchLot, eq(catchLot.id, allocation.lotId))
          .leftJoin(vendor, eq(vendor.id, catchLot.vendorId))
          .where(and(eq(allocation.orgId, orgId), inArray(allocation.salesOrderLineId, lineIds)))
          .orderBy(asc(allocation.createdAt))
      : Promise.resolve([]),
    db
      .select({ sh: shipment, st: shipmentStop, v: vehicle, d: driver })
      .from(shipmentOrder)
      .innerJoin(shipment, eq(shipment.id, shipmentOrder.shipmentId))
      .innerJoin(shipmentStop, eq(shipmentStop.id, shipmentOrder.stopId))
      .leftJoin(vehicle, eq(vehicle.id, shipment.vehicleId))
      .leftJoin(driver, eq(driver.id, shipment.driverId))
      .where(and(eq(shipmentOrder.orgId, orgId), eq(shipmentOrder.salesOrderId, id))),
    db
      .select()
      .from(customerInvoice)
      .where(and(eq(customerInvoice.orgId, orgId), eq(customerInvoice.salesOrderId, id)))
      .orderBy(asc(customerInvoice.createdAt)),
  ]);
  return { ...head, lines, allocs, ships, invoices };
}

// ---------------------------------------------------------------- standing orders

export async function standingOrdersList(orgId: string, customerId?: string | null) {
  return db
    .select({ so: standingOrder, c: customer, sp: species })
    .from(standingOrder)
    .innerJoin(customer, eq(customer.id, standingOrder.customerId))
    .innerJoin(species, eq(species.id, standingOrder.speciesId))
    .where(and(eq(standingOrder.orgId, orgId), customerId ? eq(standingOrder.customerId, customerId) : sql`true`))
    .orderBy(desc(standingOrder.active), asc(customer.name), asc(species.canonicalName));
}

// ---------------------------------------------------------------- RFQs & quotes

export async function rfqsWithQuotes(orgId: string, limit = 60) {
  const rows = await db
    .select({ r: rfq, sp: species })
    .from(rfq)
    .innerJoin(species, eq(species.id, rfq.speciesId))
    .where(eq(rfq.orgId, orgId))
    .orderBy(desc(rfq.createdAt))
    .limit(limit);
  const ids = rows.map((r) => r.r.id);
  const quotes = ids.length
    ? await db
        .select({ q: quote, ql: quoteLine, v: { id: vendor.id, name: vendor.name } })
        .from(quote)
        .innerJoin(vendor, eq(vendor.id, quote.vendorId))
        .leftJoin(quoteLine, eq(quoteLine.quoteId, quote.id))
        .where(and(eq(quote.orgId, orgId), inArray(quote.rfqId, ids)))
        .orderBy(asc(quote.receivedAt))
    : [];
  const approvals = ids.length
    ? await db
        .select({ id: approval.id, status: approval.status, payload: approval.payload, decidedBy: approval.decidedBy, decidedAt: approval.decidedAt })
        .from(approval)
        .where(and(eq(approval.orgId, orgId), eq(approval.kind, "SEND_RFQ")))
    : [];
  return rows.map((r) => ({
    ...r,
    quotes: quotes.filter((q) => q.q.rfqId === r.r.id),
    approval: approvals.find((a) => (a.payload as { rfqId?: string }).rfqId === r.r.id) ?? null,
  }));
}

// ---------------------------------------------------------------- purchase orders

export async function purchaseOrdersList(orgId: string, from: string | null, to: string) {
  const pos = await db
    .select({ po: purchaseOrder, v: { id: vendor.id, name: vendor.name } })
    .from(purchaseOrder)
    .innerJoin(vendor, eq(vendor.id, purchaseOrder.vendorId))
    .where(and(eq(purchaseOrder.orgId, orgId), from ? gte(purchaseOrder.marketDate, from) : sql`true`, lte(purchaseOrder.marketDate, to)))
    .orderBy(desc(purchaseOrder.marketDate), desc(purchaseOrder.poNumber))
    .limit(300);
  const lines = pos.length
    ? await db
        .select({ purchaseOrderId: purchaseOrderLine.purchaseOrderId, speciesName: species.canonicalName, quantityKg: purchaseOrderLine.quantityKg, receivedKg: purchaseOrderLine.receivedKg, pricePerKg: purchaseOrderLine.pricePerKg })
        .from(purchaseOrderLine)
        .innerJoin(species, eq(species.id, purchaseOrderLine.speciesId))
        .where(and(eq(purchaseOrderLine.orgId, orgId), inArray(purchaseOrderLine.purchaseOrderId, pos.map((p) => p.po.id))))
    : [];
  return pos.map((p) => ({ ...p, lines: lines.filter((l) => l.purchaseOrderId === p.po.id) }));
}

export async function purchaseOrderDetail(orgId: string, id: string) {
  const [head] = await db
    .select({ po: purchaseOrder, v: vendor })
    .from(purchaseOrder)
    .innerJoin(vendor, eq(vendor.id, purchaseOrder.vendorId))
    .where(and(eq(purchaseOrder.orgId, orgId), eq(purchaseOrder.id, id)));
  if (!head) return null;
  const [lines, receipts, invoices, appr] = await Promise.all([
    db
      .select({ pol: purchaseOrderLine, sp: species, lot: { id: catchLot.id, lotNumber: catchLot.lotNumber, status: catchLot.status } })
      .from(purchaseOrderLine)
      .innerJoin(species, eq(species.id, purchaseOrderLine.speciesId))
      .leftJoin(catchLot, eq(catchLot.id, purchaseOrderLine.lotId))
      .where(and(eq(purchaseOrderLine.orgId, orgId), eq(purchaseOrderLine.purchaseOrderId, id))),
    db
      .select({ gr: goodsReceipt, grl: goodsReceiptLine, lot: { id: catchLot.id, lotNumber: catchLot.lotNumber } })
      .from(goodsReceipt)
      .leftJoin(goodsReceiptLine, eq(goodsReceiptLine.goodsReceiptId, goodsReceipt.id))
      .leftJoin(catchLot, eq(catchLot.id, goodsReceiptLine.lotId))
      .where(and(eq(goodsReceipt.orgId, orgId), eq(goodsReceipt.purchaseOrderId, id)))
      .orderBy(asc(goodsReceipt.receivedAt)),
    db
      .select()
      .from(supplierInvoice)
      .where(and(eq(supplierInvoice.orgId, orgId), eq(supplierInvoice.purchaseOrderId, id)))
      .orderBy(asc(supplierInvoice.receivedAt)),
    head.po.approvalId
      ? db.select().from(approval).where(and(eq(approval.orgId, orgId), eq(approval.id, head.po.approvalId)))
      : Promise.resolve([] as (typeof approval.$inferSelect)[]),
  ]);
  return { ...head, lines, receipts, invoices, approval: appr[0] ?? null };
}
