/**
 * Finance: supplier bills (with duplicate protection), three-way matching, customer invoices and credit
 * notes with configurable GST, payments, and InvoiceNow-ready documents (mock transmission only).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import {
  customer, customerInvoice, customerInvoiceLine, goodsReceiptLine, organization, payment, purchaseOrder, purchaseOrderLine, salesOrder, salesOrderLine, species, supplierInvoice, supplierInvoiceLine, vendor, allocation, catchLot,
} from "@/lib/db/schema";
import { D, gst, money, toKgStr, toMoneyStr, toPriceStr } from "@/lib/domain/decimal";
import { threeWayMatch, type MatchResult } from "@/lib/domain/matching";
import { addDays } from "@/lib/domain/time";
import { getInvoiceNow } from "@/lib/integrations/invoicenow";
import { audit } from "./audit";
import { DomainError, nowOf, type Ctx } from "./context";
import { getOrg, raiseException, notify } from "./common";
import { nextSeq } from "./sequence";
import { emit } from "@/lib/events/bus";

export type SupplierInvoiceInput = {
  vendorId: string;
  purchaseOrderId: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  lines: { purchaseOrderLineId?: string | null; speciesId?: string | null; description: string; quantityKg: number; unitPrice: number }[];
  gstAmount?: number | null;
  source?: "UPLOAD" | "EMAIL" | "PEPPOL" | "MANUAL" | "WHATSAPP";
  fileKey?: string | null;
};

export async function recordSupplierInvoice(ctx: Ctx, inv: SupplierInvoiceInput) {
  return db.transaction(async (x) => {
    const [v] = await x.select().from(vendor).where(and(eq(vendor.id, inv.vendorId), eq(vendor.orgId, ctx.orgId)));
    if (!v) throw new DomainError("Vendor not found");
    const number = inv.invoiceNumber.trim();
    if (!number) throw new DomainError("Invoice number is required.");
    const [dup] = await x.select({ id: supplierInvoice.id }).from(supplierInvoice).where(and(eq(supplierInvoice.orgId, ctx.orgId), eq(supplierInvoice.vendorId, v.id), eq(supplierInvoice.invoiceNumber, number)));
    if (dup) throw new DomainError(`Invoice ${number} from ${v.name} was already imported.`, "DUPLICATE_INVOICE", 409);
    const org = await getOrg(x, ctx.orgId);
    const subtotal = money(inv.lines.reduce((a, l) => a.plus(money(D(l.quantityKg).times(D(l.unitPrice)))), D(0)));
    const rate = v.gstRegistered ? D(org.gstRatePct) : D(0);
    const gstAmt = inv.gstAmount === null || inv.gstAmount === undefined ? gst(subtotal, rate) : money(inv.gstAmount);
    const [si] = await x
      .insert(supplierInvoice)
      .values({
        orgId: ctx.orgId, vendorId: v.id, purchaseOrderId: inv.purchaseOrderId, invoiceNumber: number, invoiceDate: inv.invoiceDate,
        dueDate: addDays(inv.invoiceDate, v.paymentTermsDays), subtotal: toMoneyStr(subtotal), gstAmount: toMoneyStr(gstAmt), total: toMoneyStr(subtotal.plus(gstAmt)),
        source: inv.source ?? "MANUAL", fileKey: inv.fileKey ?? null, receivedAt: nowOf(ctx),
      })
      .returning();
    for (const l of inv.lines) {
      await x.insert(supplierInvoiceLine).values({
        orgId: ctx.orgId, supplierInvoiceId: si.id, purchaseOrderLineId: l.purchaseOrderLineId ?? null, speciesId: l.speciesId ?? null, description: l.description,
        quantityKg: toKgStr(l.quantityKg), unitPrice: toPriceStr(l.unitPrice), lineTotal: toMoneyStr(money(D(l.quantityKg).times(D(l.unitPrice)))), gstCode: v.gstRegistered ? "SR" : "NA",
      });
    }
    await audit(x, ctx, { action: "INVOICE_RECEIVED", entityType: "supplier_invoice", entityId: si.id, summary: `Supplier invoice ${number} from ${v.name}: S$${si.total}.`, relatedIds: [v.id, inv.purchaseOrderId ?? ""].filter(Boolean) });
    await emit(x, ctx.orgId, "INVOICE_RECEIVED", { supplierInvoiceId: si.id }, { at: nowOf(ctx) });
    return si;
  });
}

/** Draft a supplier bill from a PO the way suppliers typically do: billing the ordered/declared weight. */
export async function draftInvoiceFromPo(ctx: Ctx, purchaseOrderId: string, opts: { invoiceNumber: string; billReceivedWeight?: boolean }) {
  const [po] = await db.select().from(purchaseOrder).where(and(eq(purchaseOrder.id, purchaseOrderId), eq(purchaseOrder.orgId, ctx.orgId)));
  if (!po) throw new DomainError("PO not found", "NOT_FOUND", 404);
  const lines = await db.select({ pol: purchaseOrderLine, sp: species }).from(purchaseOrderLine).innerJoin(species, eq(species.id, purchaseOrderLine.speciesId)).where(eq(purchaseOrderLine.purchaseOrderId, po.id));
  return recordSupplierInvoice(ctx, {
    vendorId: po.vendorId,
    purchaseOrderId: po.id,
    invoiceNumber: opts.invoiceNumber,
    invoiceDate: addDays(po.marketDate, 1),
    source: "UPLOAD",
    lines: lines.map(({ pol, sp }) => ({ purchaseOrderLineId: pol.id, speciesId: pol.speciesId, description: sp.canonicalName, quantityKg: Number(opts.billReceivedWeight ? pol.receivedKg : pol.quantityKg), unitPrice: Number(pol.pricePerKg) })),
  });
}

/** Run the three-way match for an invoice and persist the result (AP Reconciliation Agent calls this). */
export async function matchSupplierInvoice(x: Executor, orgId: string, supplierInvoiceId: string): Promise<{ result: MatchResult; invoice: typeof supplierInvoice.$inferSelect; vendorName: string }> {
  const [si] = await x.select().from(supplierInvoice).where(and(eq(supplierInvoice.id, supplierInvoiceId), eq(supplierInvoice.orgId, orgId)));
  if (!si) throw new DomainError("Invoice not found", "NOT_FOUND", 404);
  const [v] = await x.select().from(vendor).where(eq(vendor.id, si.vendorId));
  const org = await getOrg(x, orgId);
  const ilines = await x.select().from(supplierInvoiceLine).where(eq(supplierInvoiceLine.supplierInvoiceId, si.id));
  const poLines = si.purchaseOrderId
    ? await x.select({ pol: purchaseOrderLine, sp: species }).from(purchaseOrderLine).innerJoin(species, eq(species.id, purchaseOrderLine.speciesId)).where(eq(purchaseOrderLine.purchaseOrderId, si.purchaseOrderId))
    : [];
  const receipts = poLines.length
    ? await x.select().from(goodsReceiptLine).where(inArray(goodsReceiptLine.purchaseOrderLineId, poLines.map((p) => p.pol.id)))
    : [];
  const result = threeWayMatch({
    poLines: poLines.map(({ pol, sp }) => ({ poLineId: pol.id, speciesId: pol.speciesId, description: sp.canonicalName, quantityKg: pol.quantityKg, pricePerKg: pol.pricePerKg })),
    receipts: receipts.map((r) => ({ poLineId: r.purchaseOrderLineId, speciesId: poLines.find((p) => p.pol.id === r.purchaseOrderLineId)?.pol.speciesId ?? "", acceptedKg: r.acceptedKg })),
    invoiceLines: ilines.map((l) => ({ invoiceLineId: l.id, poLineId: l.purchaseOrderLineId, speciesId: l.speciesId, description: l.description, quantityKg: l.quantityKg, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
    invoiceSubtotal: si.subtotal,
    invoiceGst: si.gstAmount,
    gstRatePct: v.gstRegistered ? org.gstRatePct : "0",
    tolerance: org.settings.invoiceTolerance,
  });
  if (!si.purchaseOrderId) {
    result.status = "EXCEPTION";
    result.flags.push("No purchase order referenced");
    result.summary = `No purchase order referenced. ${result.summary}`;
  }
  const [updated] = await x.update(supplierInvoice).set({ matchStatus: si.matchStatus === "APPROVED_EXCEPTION" ? "APPROVED_EXCEPTION" : result.status, matchResult: result as unknown as Record<string, unknown> }).where(eq(supplierInvoice.id, si.id)).returning();
  return { result, invoice: updated, vendorName: v.name };
}

export async function approveInvoiceException(ctx: Ctx, supplierInvoiceId: string, note: string, x0?: Executor) {
  const run = async (x: Executor) => {
    const [si] = await x.select().from(supplierInvoice).where(and(eq(supplierInvoice.id, supplierInvoiceId), eq(supplierInvoice.orgId, ctx.orgId)));
    if (!si) throw new DomainError("Invoice not found", "NOT_FOUND", 404);
    await x.update(supplierInvoice).set({ matchStatus: "APPROVED_EXCEPTION", approvedBy: ctx.actor.label }).where(eq(supplierInvoice.id, si.id));
    await x.execute(sql`UPDATE ops_exception SET status = 'RESOLVED', resolved_at = ${nowOf(ctx)}, resolved_by = ${ctx.actor.label}, resolution_note = ${note} WHERE org_id = ${ctx.orgId} AND entity_id = ${si.id} AND status <> 'RESOLVED'`);
    await audit(x, ctx, { action: "INVOICE_EXCEPTION_APPROVED", entityType: "supplier_invoice", entityId: si.id, summary: `Exception approved: ${note}`, before: { matchStatus: si.matchStatus }, after: { matchStatus: "APPROVED_EXCEPTION" } });
  };
  return x0 ? run(x0) : db.transaction(run);
}

export async function approveForPayment(ctx: Ctx, supplierInvoiceId: string) {
  return db.transaction(async (x) => {
    const [si] = await x.select().from(supplierInvoice).where(and(eq(supplierInvoice.id, supplierInvoiceId), eq(supplierInvoice.orgId, ctx.orgId)));
    if (!si) throw new DomainError("Invoice not found", "NOT_FOUND", 404);
    if (!["MATCHED", "MATCH_WITHIN_TOLERANCE", "APPROVED_EXCEPTION"].includes(si.matchStatus)) throw new DomainError("Resolve the matching exception before approving payment.");
    await x.update(supplierInvoice).set({ paymentStatus: "APPROVED_FOR_PAYMENT", approvedBy: ctx.actor.label }).where(eq(supplierInvoice.id, si.id));
    await audit(x, ctx, { action: "INVOICE_APPROVED_FOR_PAYMENT", entityType: "supplier_invoice", entityId: si.id, summary: `Approved for payment (S$${si.total}, due ${si.dueDate}).` });
  });
}

export async function recordPayment(ctx: Ctx, p: { direction: "AP" | "AR"; invoiceId: string; amount: number; method: "PAYNOW" | "GIRO" | "BANK_TRANSFER" | "CHEQUE" | "CASH"; reference?: string }) {
  return db.transaction(async (x) => {
    await x.insert(payment).values({
      orgId: ctx.orgId, direction: p.direction, supplierInvoiceId: p.direction === "AP" ? p.invoiceId : null, customerInvoiceId: p.direction === "AR" ? p.invoiceId : null,
      amount: toMoneyStr(p.amount), method: p.method, reference: p.reference ?? null, paidAt: nowOf(ctx),
    });
    if (p.direction === "AP") await x.update(supplierInvoice).set({ paymentStatus: "PAID" }).where(eq(supplierInvoice.id, p.invoiceId));
    else await x.update(customerInvoice).set({ status: "PAID" }).where(eq(customerInvoice.id, p.invoiceId));
    await audit(x, ctx, { action: "PAYMENT_RECORDED", entityType: p.direction === "AP" ? "supplier_invoice" : "customer_invoice", entityId: p.invoiceId, summary: `Payment S$${money(p.amount).toFixed(2)} via ${p.method} recorded (no funds moved by PasarCatch).` });
  });
}

/** Customer tax invoice from delivered quantities, lot-referenced lines for traceability. */
export async function createCustomerInvoice(ctx: Ctx, salesOrderId: string) {
  return db.transaction(async (x) => {
    const [so] = await x.select().from(salesOrder).where(and(eq(salesOrder.id, salesOrderId), eq(salesOrder.orgId, ctx.orgId)));
    if (!so) throw new DomainError("Order not found", "NOT_FOUND", 404);
    const [existing] = await x.select({ id: customerInvoice.id }).from(customerInvoice).where(and(eq(customerInvoice.salesOrderId, so.id), eq(customerInvoice.type, "INVOICE")));
    if (existing) throw new DomainError("This order is already invoiced.", "DUPLICATE_INVOICE", 409);
    const org = await getOrg(x, ctx.orgId);
    const [c] = await x.select().from(customer).where(eq(customer.id, so.customerId));
    const lines = await x.select({ sol: salesOrderLine, sp: species }).from(salesOrderLine).innerJoin(species, eq(species.id, salesOrderLine.speciesId)).where(eq(salesOrderLine.salesOrderId, so.id));
    const rate = org.gstRegistered ? D(org.gstRatePct) : D(0);
    const invNo = `INV-${String(await nextSeq(x, ctx.orgId, "INV")).padStart(5, "0")}`;
    const billable: { sol: typeof salesOrderLine.$inferSelect; sp: typeof species.$inferSelect; qty: ReturnType<typeof D>; lotId: string | null; lotNumber: string | null }[] = [];
    for (const { sol, sp } of lines) {
      const qty = D(sol.deliveredKg).gt(0) ? D(sol.deliveredKg) : D(sol.pickedKg).gt(0) ? D(sol.pickedKg) : D(sol.allocatedKg);
      if (qty.lte(0)) continue;
      const [al] = await x.select({ lotId: allocation.lotId, lotNumber: catchLot.lotNumber }).from(allocation).innerJoin(catchLot, eq(catchLot.id, allocation.lotId)).where(eq(allocation.salesOrderLineId, sol.id)).limit(1);
      billable.push({ sol, sp, qty, lotId: al?.lotId ?? null, lotNumber: al?.lotNumber ?? null });
    }
    if (!billable.length) throw new DomainError("Nothing delivered to invoice yet.");
    const subtotal = money(billable.reduce((a, b) => a.plus(money(b.qty.times(D(b.sol.pricePerKg)))), D(0)));
    const gstAmt = gst(subtotal, rate);
    const [inv] = await x
      .insert(customerInvoice)
      .values({
        orgId: ctx.orgId, type: "INVOICE", invoiceNumber: invNo, customerId: c.id, salesOrderId: so.id, invoiceDate: addDays(so.marketDate, 1), dueDate: addDays(so.marketDate, 1 + c.creditTermsDays),
        subtotal: toMoneyStr(subtotal), gstRatePct: rate.toFixed(2), gstAmount: toMoneyStr(gstAmt), total: toMoneyStr(subtotal.plus(gstAmt)), status: "ISSUED", createdAt: nowOf(ctx),
      })
      .returning();
    for (const b of billable) {
      await x.insert(customerInvoiceLine).values({
        orgId: ctx.orgId, customerInvoiceId: inv.id, salesOrderLineId: b.sol.id, lotId: b.lotId, speciesId: b.sp.id,
        description: `${b.sp.canonicalName}${b.lotNumber ? ` (lot ${b.lotNumber})` : ""}`, quantityKg: toKgStr(b.qty), unitPrice: b.sol.pricePerKg,
        lineTotal: toMoneyStr(money(b.qty.times(D(b.sol.pricePerKg)))), gstCode: rate.gt(0) ? "SR" : "NA",
      });
    }
    await x.update(salesOrder).set({ status: "INVOICED" }).where(eq(salesOrder.id, so.id));
    await audit(x, ctx, { action: "CUSTOMER_INVOICE_ISSUED", entityType: "customer_invoice", entityId: inv.id, summary: `${invNo} to ${c.name}: S$${inv.total} incl. GST ${rate.toFixed(0)}%.`, relatedIds: [so.id, c.id, ...billable.map((b) => b.lotId ?? "")].filter(Boolean) });
    await audit(x, ctx, { action: "ORDER_INVOICED", entityType: "sales_order", entityId: so.id, summary: `Invoiced on ${invNo}.`, relatedIds: [inv.id] });
    return inv;
  });
}

export async function createCreditNote(ctx: Ctx, invoiceId: string, p: { lineId: string; quantityKg: number; reason: string }) {
  return db.transaction(async (x) => {
    const [inv] = await x.select().from(customerInvoice).where(and(eq(customerInvoice.id, invoiceId), eq(customerInvoice.orgId, ctx.orgId)));
    if (!inv || inv.type !== "INVOICE") throw new DomainError("Invoice not found", "NOT_FOUND", 404);
    const [line] = await x.select().from(customerInvoiceLine).where(and(eq(customerInvoiceLine.id, p.lineId), eq(customerInvoiceLine.customerInvoiceId, inv.id)));
    if (!line) throw new DomainError("Invoice line not found");
    if (D(p.quantityKg).gt(D(line.quantityKg)) || p.quantityKg <= 0) throw new DomainError("Credit quantity must be positive and not exceed the invoiced quantity.");
    const sub = money(D(p.quantityKg).times(D(line.unitPrice)));
    const g = gst(sub, inv.gstRatePct);
    const cnNo = `CN-${String(await nextSeq(x, ctx.orgId, "CN")).padStart(5, "0")}`;
    const [cn] = await x
      .insert(customerInvoice)
      .values({ orgId: ctx.orgId, type: "CREDIT_NOTE", invoiceNumber: cnNo, customerId: inv.customerId, salesOrderId: inv.salesOrderId, creditNoteForId: inv.id, invoiceDate: new Date().toISOString().slice(0, 10), subtotal: toMoneyStr(sub), gstRatePct: inv.gstRatePct, gstAmount: toMoneyStr(g), total: toMoneyStr(sub.plus(g)), status: "ISSUED" })
      .returning();
    await x.insert(customerInvoiceLine).values({ orgId: ctx.orgId, customerInvoiceId: cn.id, salesOrderLineId: line.salesOrderLineId, lotId: line.lotId, speciesId: line.speciesId, description: `Credit: ${line.description} — ${p.reason}`, quantityKg: toKgStr(p.quantityKg), unitPrice: line.unitPrice, lineTotal: toMoneyStr(sub), gstCode: line.gstCode });
    await audit(x, ctx, { action: "CREDIT_NOTE_ISSUED", entityType: "customer_invoice", entityId: cn.id, summary: `${cnNo} against ${inv.invoiceNumber} (original invoice dated ${inv.invoiceDate}): S$${cn.total} — ${p.reason}.`, relatedIds: [inv.id] });
    return cn;
  });
}

/** Build an InvoiceNow document and hand it to the (mock) Access Point provider. */
export async function transmitInvoiceNow(ctx: Ctx, invoiceId: string) {
  const [inv] = await db.select().from(customerInvoice).where(and(eq(customerInvoice.id, invoiceId), eq(customerInvoice.orgId, ctx.orgId)));
  if (!inv) throw new DomainError("Invoice not found", "NOT_FOUND", 404);
  const [org] = await db.select().from(organization).where(eq(organization.id, ctx.orgId));
  const [c] = await db.select().from(customer).where(eq(customer.id, inv.customerId));
  const lines = await db.select().from(customerInvoiceLine).where(eq(customerInvoiceLine.customerInvoiceId, inv.id));
  const prior = inv.creditNoteForId ? (await db.select().from(customerInvoice).where(eq(customerInvoice.id, inv.creditNoteForId)))[0] : null;
  const res = await getInvoiceNow().transmit({
    type: inv.type,
    number: inv.invoiceNumber,
    issueDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    supplier: { name: org.name, uen: org.uen, gstRegNo: org.gstRegNo, peppolId: org.uen ? `0195:SG${org.uen}` : null },
    buyer: { name: c.name, peppolId: c.peppolId },
    lines: lines.map((l) => ({ description: l.description, quantity: l.quantityKg, unitCode: "KGM" as const, unitPrice: l.unitPrice, lineTotal: l.lineTotal, taxCategory: l.gstCode, taxPct: inv.gstRatePct })),
    subtotal: inv.subtotal,
    taxTotal: inv.gstAmount,
    total: inv.total,
    precedingInvoiceRef: prior?.invoiceNumber ?? null,
  });
  await db.update(customerInvoice).set({ peppolStatus: res.status === "MOCK_TRANSMITTED" ? "MOCK_TRANSMITTED" : res.status === "QUEUED" ? "QUEUED" : "FAILED", peppolMessageId: res.messageId }).where(eq(customerInvoice.id, inv.id));
  await audit(db, ctx, { action: "INVOICENOW_MOCK", entityType: "customer_invoice", entityId: inv.id, summary: `InvoiceNow payload prepared (MOCK — not transmitted to Peppol/IRAS).` });
  return res;
}

export async function raiseInvoiceException(x: Executor, orgId: string, inv: typeof supplierInvoice.$inferSelect, vendorName: string, result: MatchResult) {
  await raiseException(x, orgId, {
    type: "INVOICE_MISMATCH",
    severity: Number(result.potentialOverbillingExGst) >= 50 ? "HIGH" : "MEDIUM",
    title: `Invoice ${inv.invoiceNumber} (${vendorName}) does not match receiving`,
    detail: result.summary,
    entityType: "supplier_invoice",
    entityId: inv.id,
    href: `/finance/reconciliation/${inv.id}`,
    dedupeKey: `INVOICE:${inv.id}`,
  });
  await notify(x, orgId, { audience: "FINANCE", title: `Invoice ${inv.invoiceNumber} differs from receiving by S$${result.potentialOverbillingExGst}`, body: result.summary, href: `/finance/reconciliation/${inv.id}` });
}
