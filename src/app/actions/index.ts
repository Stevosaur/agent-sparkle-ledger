"use server";
/**
 * Server actions. Every input is validated with zod; every action checks the caller's role; all domain work
 * goes through the service layer (transactional, audited). Next.js server actions include origin checks (CSRF).
 */
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { automationRule, catchLotPhoto, membership, notification, organization, rfq, species, speciesAlias, vendor } from "@/lib/db/schema";
import { run } from "./_run";
import { ORG_COOKIE } from "@/lib/auth/session";
import { ingestSupplierMessage } from "@/lib/agents/catch-intake";
import { runProcurementAgent, createRfq, recordQuoteFromReply } from "@/lib/agents/procurement";
import { runDemandForecast, overrideForecastLine } from "@/lib/agents/demand";
import { runAllocationAgent, runLogisticsAgent, runSurplusAgent } from "@/lib/agents/operations";
import { answerCommand } from "@/lib/agents/command";
import { confirmLot, markLanded, transformLot, updateEta, learnAlias } from "@/lib/services/lots";
import { acceptDeclaredLot, createPurchaseOrder } from "@/lib/services/procurement";
import { receiveLot } from "@/lib/services/receiving";
import { commitAllocation, previewAllocation, releaseAllocation } from "@/lib/services/allocation";
import { completeStop, confirmSubstitution, createSalesOrder, dispatchShipment, generatePickList, pickAndPackOrder } from "@/lib/services/fulfilment";
import { approveForPayment, approveInvoiceException, createCreditNote, createCustomerInvoice, draftInvoiceFromPo, recordPayment, recordSupplierInvoice, transmitInvoiceNow } from "@/lib/services/finance";
import { openRecall } from "@/lib/services/trace";
import { decideApproval, requestRecallContactApproval } from "@/lib/services/approvals";
import { search } from "@/lib/services/search";
import { audit } from "@/lib/services/audit";
import { normaliseName } from "@/lib/domain/species-match";
import { atMarketTime } from "@/lib/domain/time";
import type { AllocationPolicy } from "@/lib/domain/allocation";

const id = z.string().uuid();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const kg = z.coerce.number().positive().max(100000);
const price = z.coerce.number().positive().max(10000);

// ---------------- Supply ----------------
export async function simulateMessageAction(input: { vendorId?: string | null; body: string; channel?: "WHATSAPP_SIMULATOR" | "WEB" | "VOICE"; transcription?: string | null }) {
  const p = z.object({ vendorId: id.nullish(), body: z.string().trim().min(3).max(2000), channel: z.enum(["WHATSAPP_SIMULATOR", "WEB", "VOICE"]).default("WHATSAPP_SIMULATOR"), transcription: z.string().max(2000).nullish() }).parse(input);
  return run("supply.write", async (app) => {
    let from: string | null = null;
    if (p.vendorId) {
      const [v] = await db.select().from(vendor).where(and(eq(vendor.id, p.vendorId), eq(vendor.orgId, app.org.id)));
      from = v?.whatsappNumber ?? null;
    }
    const r = await ingestSupplierMessage(app.org.id, { channel: p.channel, from, body: p.body, vendorId: p.vendorId ?? null, transcription: p.transcription ?? null, at: app.now }, "USER");
    return { lotIds: r.lotIds, lotNumbers: r.lotNumbers, confirmation: r.confirmation, parsed: r.parsed, mode: r.mode };
  }, (d) => `Created ${d.lotIds.length} draft lot(s)`);
}

/** Supplier self-service declaration (supplier role acts only for their own vendor). */
const photoKey = z.string().regex(/^[a-z0-9-]+\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/i).nullish();

export async function supplierDeclareAction(input: { body: string; transcription?: string | null; photoKey?: string | null; previewVendorId?: string | null }) {
  const p = z.object({ body: z.string().trim().min(3).max(2000), transcription: z.string().max(2000).nullish(), photoKey, previewVendorId: id.nullish() }).parse(input);
  return run(null, async (app) => {
    // Suppliers act only for their own vendor; internal users may preview on behalf of a vendor.
    const vendorId = app.role === "SUPPLIER" ? app.membership.vendorId : app.can("supply.write") ? p.previewVendorId : null;
    if (!vendorId) throw new Error("You don't have permission to do that.");
    const [v] = await db.select().from(vendor).where(and(eq(vendor.id, vendorId), eq(vendor.orgId, app.org.id)));
    if (!v) throw new Error("You don't have permission to do that.");
    const r = await ingestSupplierMessage(app.org.id, { channel: p.transcription ? "VOICE" : "WEB", from: v.whatsappNumber, body: p.body, vendorId: v.id, transcription: p.transcription ?? null, at: app.now }, "USER");
    if (p.photoKey) for (const lotId of r.lotIds) await db.insert(catchLotPhoto).values({ orgId: app.org.id, lotId, fileKey: p.photoKey, stage: "DECLARATION", takenBy: app.user.name });
    return { lotIds: r.lotIds, confirmation: r.confirmation, parsed: r.parsed };
  });
}

export async function supplierRfqReplyAction(rfqId: string, reply: string, previewVendorId?: string | null) {
  return run(null, async (app) => {
    const vendorId = app.role === "SUPPLIER" ? app.membership.vendorId : app.can("procurement.write") ? previewVendorId : null;
    const [r] = await db.select().from(rfq).where(and(eq(rfq.id, id.parse(rfqId)), eq(rfq.orgId, app.org.id)));
    if (!vendorId || !r || !r.vendorIds.includes(vendorId)) throw new Error("You don't have permission to do that.");
    return recordQuoteFromReply(app.org.id, r.id, vendorId, z.string().trim().min(3).max(500).parse(reply));
  }, (q) => (q ? "Offer sent to the buyer" : "Please include quantity and price, e.g. 30kg @ 9.10"));
}

export async function supplierConfirmAction(lotIds: string[], previewVendorId?: string | null) {
  const ids = z.array(id).max(20).parse(lotIds);
  return run(null, async (app) => {
    const vendorId = app.role === "SUPPLIER" ? app.membership.vendorId : app.can("lots.confirm") ? previewVendorId : null;
    for (const lotId of ids) {
      const r = await db.execute(sql`SELECT vendor_id, species_id FROM catch_lot WHERE id = ${lotId} AND org_id = ${app.org.id}`);
      const row = r.rows[0] as { vendor_id: string; species_id: string | null } | undefined;
      if (!row || !vendorId || row.vendor_id !== vendorId) throw new Error("You don't have permission to do that.");
      if (row.species_id) await confirmLot({ ...app.ctx, source: "MOBILE" }, lotId);
    }
  }, "Thanks — your catch is confirmed.");
}

const confirmSchema = z.object({ speciesId: id.optional(), quantityKg: kg.optional(), askingPricePerKg: price.nullish(), sizeMinKg: z.coerce.number().positive().nullish(), sizeMaxKg: z.coerce.number().positive().nullish(), etaLocal: hhmm.nullish(), vendorId: id.optional() });
export async function confirmLotAction(lotId: string, edits: z.input<typeof confirmSchema> = {}, buy = false) {
  const lid = id.parse(lotId);
  const e = confirmSchema.parse(edits);
  return run(buy ? "po.approve" : "lots.confirm", async (app) => {
    await confirmLot(app.ctx, lid, { ...e, etaLocal: e.etaLocal ?? undefined });
    if (buy) return acceptDeclaredLot(app.ctx, lid, { pricePerKg: e.askingPricePerKg ?? undefined });
    return null;
  }, buy ? "Confirmed and purchased — lot is on Tonight's Market" : "Lot confirmed");
}

export async function acceptLotAction(lotId: string, overrides: { quantityKg?: number; pricePerKg?: number } = {}) {
  const lid = id.parse(lotId);
  const o = z.object({ quantityKg: kg.optional(), pricePerKg: price.optional() }).parse(overrides);
  return run("po.approve", (app) => acceptDeclaredLot(app.ctx, lid, o), (po) => `${po.poNumber} approved`);
}

export async function updateEtaAction(lotId: string, eta: string, reason?: string) {
  const lid = id.parse(lotId);
  const t = hhmm.parse(eta);
  return run("supply.write", (app) => updateEta(app.ctx, lid, t, reason?.slice(0, 200)), "ETA updated");
}

export async function markLandedAction(lotId: string) {
  return run("ops.receive", (app) => markLanded(app.ctx, id.parse(lotId)), "Marked as landed");
}

export async function transformLotAction(lotId: string, outputs: { processingState: "GUTTED" | "CLEANED" | "FILLETED" | "PORTIONED" | "FROZEN" | "WHOLE"; kg: number }[], wasteKg: number) {
  const o = z.array(z.object({ processingState: z.enum(["WHOLE", "GUTTED", "CLEANED", "FILLETED", "PORTIONED", "FROZEN"]), kg })).min(1).max(8).parse(outputs);
  const w = z.coerce.number().min(0).parse(wasteKg);
  const typeFor = { WHOLE: "SPLIT", GUTTED: "GUT", CLEANED: "CLEAN", FILLETED: "FILLET", PORTIONED: "PORTION", FROZEN: "FREEZE" } as const;
  return run("ops.receive", (app) => transformLot(app.ctx, id.parse(lotId), o.map((x) => ({ ...x, type: typeFor[x.processingState] })), w), (c) => `Created ${c.length} child lot(s)`);
}

export async function receiveLotAction(input: { lotId: string; receivedKg: number; rejectedKg?: number; rejectionReason?: string | null; temperatureC?: number | null; qualityGrade: "A" | "B" | "C" | "REJECT"; photoKey?: string | null; notes?: string | null }) {
  const p = z
    .object({
      lotId: id,
      receivedKg: z.coerce.number().min(0).max(100000),
      rejectedKg: z.coerce.number().min(0).max(100000).optional(),
      rejectionReason: z.enum(["WRONG_SPECIES", "WRONG_SIZE", "UNDERWEIGHT", "POOR_QUALITY", "TEMPERATURE", "DAMAGED", "LATE", "OTHER"]).nullish(),
      temperatureC: z.coerce.number().min(-40).max(40).nullish(),
      qualityGrade: z.enum(["A", "B", "C", "REJECT"]),
      photoKey: z.string().regex(/^[a-z0-9-]+\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/i).nullish(),
      notes: z.string().max(500).nullish(),
    })
    .parse(input);
  return run("ops.receive", (app) => receiveLot({ ...app.ctx, source: "MOBILE" }, { ...p, rejectionReason: p.rejectionReason ?? null }), (r) => `${r.lot.lotNumber} received · ${r.variancePct > 0 ? "+" : ""}${r.variancePct}% vs declared`);
}

// ---------------- Procurement & approvals ----------------
export async function runProcurementAction() {
  return run("procurement.write", (app) => runProcurementAgent(app.org.id, app.marketDate, "USER", { at: app.now }), (r) => `${r.proposals.length} recommendation(s)`);
}

export async function decideApprovalAction(approvalId: string, decision: "APPROVE" | "REJECT", note?: string, modifications?: Record<string, unknown>) {
  const aid = id.parse(approvalId);
  const d = z.enum(["APPROVE", "REJECT"]).parse(decision);
  return run("approvals.decide", async (app) => {
    const r = await db.execute(sql`SELECT risk_class FROM approval WHERE id = ${aid} AND org_id = ${app.org.id}`);
    const risk = (r.rows[0] as { risk_class: string } | undefined)?.risk_class;
    if (risk === "FINANCIAL" && !app.can("finance.approve")) throw new Error("You don't have permission to do that.");
    if (risk === "COMMERCIAL_COMMITMENT" && !app.can("po.approve") && !app.can("procurement.write")) throw new Error("You don't have permission to do that.");
    if (risk === "COMPLIANCE" && !app.can("recall.manage")) throw new Error("You don't have permission to do that.");
    return decideApproval(app.ctx, aid, d, { note: note?.slice(0, 300), modifications });
  }, d === "APPROVE" ? "Approved — executed" : "Rejected");
}

export async function createPoAction(input: { vendorId: string; lines: { speciesId: string; quantityKg: number; pricePerKg: number }[]; etaLocal?: string | null }) {
  const p = z.object({ vendorId: id, lines: z.array(z.object({ speciesId: id, quantityKg: kg, pricePerKg: price })).min(1).max(20), etaLocal: hhmm.nullish() }).parse(input);
  return run("po.approve", (app) => db.transaction((x) => createPurchaseOrder(x, app.ctx, { vendorId: p.vendorId, marketDate: app.marketDate, source: "MANUAL", lines: p.lines, expectedAt: p.etaLocal ? atMarketTime(app.marketDate, p.etaLocal) : null })), (po) => `${po.poNumber} created`);
}

export async function createRfqAction(input: { speciesId: string; quantityKg: number; sizeMinG?: number | null; sizeMaxG?: number | null; deliverBy?: string | null; targetPrice?: number | null; maxPrice?: number | null; vendorIds: string[] }) {
  const p = z.object({ speciesId: id, quantityKg: kg, sizeMinG: z.coerce.number().positive().nullish(), sizeMaxG: z.coerce.number().positive().nullish(), deliverBy: hhmm.nullish(), targetPrice: price.nullish(), maxPrice: price.nullish(), vendorIds: z.array(id).min(1).max(20) }).parse(input);
  return run("procurement.write", (app) => createRfq(app.org.id, { id: app.user.id, label: app.user.name }, { marketDate: app.marketDate, speciesId: p.speciesId, quantityKg: p.quantityKg, sizeMinKg: p.sizeMinG ? p.sizeMinG / 1000 : null, sizeMaxKg: p.sizeMaxG ? p.sizeMaxG / 1000 : null, deliverByLocal: p.deliverBy ?? null, targetPrice: p.targetPrice ?? null, maxPrice: p.maxPrice ?? null, vendorIds: p.vendorIds }), (r) => `${r.rfqNumber} drafted — approve to send`);
}

export async function recordQuoteReplyAction(rfqId: string, vendorId: string, reply: string) {
  return run("procurement.write", (app) => recordQuoteFromReply(app.org.id, id.parse(rfqId), id.parse(vendorId), z.string().min(3).max(1000).parse(reply)), (q) => (q ? "Quote recorded" : "No quantity/price found in reply"));
}

// ---------------- Demand ----------------
export async function runForecastAction() {
  return run("demand.write", (app) => runDemandForecast(app.org.id, app.marketDate, "USER", app.now), "Forecast generated");
}
export async function overrideForecastAction(lineId: string, kgValue: number, reason: string) {
  return run("demand.write", (app) => overrideForecastLine(app.org.id, id.parse(lineId), kg.parse(kgValue), app.user.name, z.string().min(2).max(200).parse(reason)), "Override saved");
}
export async function createSalesOrderAction(input: { customerId: string; lines: { speciesId: string; requestedKg: number; pricePerKg: number }[] }) {
  const p = z.object({ customerId: id, lines: z.array(z.object({ speciesId: id, requestedKg: kg, pricePerKg: price })).min(1).max(30) }).parse(input);
  return run("orders.write", (app) => createSalesOrder(app.ctx, { customerId: p.customerId, marketDate: app.marketDate, source: "PHONE", lines: p.lines }), (so) => `${so.soNumber} confirmed`);
}

// ---------------- Allocation ----------------
const policy = z.enum(["PRO_RATA", "PRIORITY", "FIRST_CONFIRMED", "MINIMUM_GUARANTEED", "MARGIN_MAX", "MANUAL_RANK"]);
export async function previewAllocationAction(speciesId: string, pol: AllocationPolicy, manualRanks?: Record<string, number>) {
  return run("procurement.view", async (app) => {
    const r = await previewAllocation(app.org.id, app.marketDate, id.parse(speciesId), policy.parse(pol), manualRanks);
    return { result: r.result, substitutes: r.substitutes };
  });
}
export async function commitAllocationAction(speciesId: string, pol: AllocationPolicy, lines: { lineId: string; fromLots: { lotId: string; kg: number }[] }[]) {
  const l = z.array(z.object({ lineId: id, fromLots: z.array(z.object({ lotId: id, kg: z.coerce.number().min(0) })) })).parse(lines);
  return run("procurement.write", (app) => commitAllocation(app.ctx, { marketDate: app.marketDate, speciesId: id.parse(speciesId), policy: policy.parse(pol), lines: l }), "Allocation confirmed — buyers notified");
}
export async function runAllocationAgentAction(speciesId: string) {
  return run("procurement.write", (app) => runAllocationAgent(app.org.id, app.marketDate, id.parse(speciesId), "USER", { at: app.now }), (r) => (r.approvalId ? "Proposal sent to approval inbox" : "Nothing to allocate"));
}
export async function releaseAllocationAction(allocationId: string) {
  return run("procurement.write", (app) => releaseAllocation(app.ctx, id.parse(allocationId)), "Allocation released");
}
export async function confirmSubstitutionAction(originalLineId: string, speciesId: string, kgValue: number) {
  return run("orders.write", (app) => confirmSubstitution(app.ctx, { originalLineId: id.parse(originalLineId), speciesId: id.parse(speciesId), kg: kg.parse(kgValue) }), "Substitute added to order");
}

// ---------------- Operations ----------------
export async function generatePickListAction() {
  return run("ops.dispatch", (app) => generatePickList(app.ctx, app.marketDate), (p) => `${p.pickListNumber} started`);
}
export async function pickAndPackAction(salesOrderId: string) {
  return run("ops.dispatch", (app) => pickAndPackOrder(app.ctx, id.parse(salesOrderId)), "Picked & packed");
}
export async function planRoutesAction(departure: string) {
  return run("ops.dispatch", (app) => runLogisticsAgent(app.ctx, app.marketDate, hhmm.parse(departure)), (r) => `${r.shipmentIds.length} delivery run(s) planned`);
}
export async function dispatchAction(shipmentId: string) {
  return run("ops.dispatch", (app) => dispatchShipment(app.ctx, id.parse(shipmentId)), "Truck dispatched");
}
export async function completeStopAction(stopId: string, podName: string) {
  return run("ops.dispatch", (app) => completeStop(app.ctx, id.parse(stopId), z.string().trim().min(1).max(80).parse(podName)), "Delivery completed");
}
export async function runSurplusAction() {
  return run("procurement.write", (app) => runSurplusAgent(app.org.id, app.marketDate, "USER", app.now), (r) => (r.alerts.length ? `Surplus: ${r.alerts.join(", ")}` : "No surplus at risk"));
}

// ---------------- Finance ----------------
export async function simulateSupplierInvoiceAction(purchaseOrderId: string, billReceivedWeight: boolean) {
  return run("finance.write", async (app) => {
    const n = Math.floor(1000 + Math.random() * 8999);
    return draftInvoiceFromPo(app.ctx, id.parse(purchaseOrderId), { invoiceNumber: `SUP-${n}`, billReceivedWeight });
  }, (i) => `Invoice ${i.invoiceNumber} received — matching…`);
}
export async function recordSupplierInvoiceAction(input: { vendorId: string; purchaseOrderId?: string | null; invoiceNumber: string; invoiceDate: string; lines: { speciesId?: string | null; description: string; quantityKg: number; unitPrice: number }[] }) {
  const p = z.object({ vendorId: id, purchaseOrderId: id.nullish(), invoiceNumber: z.string().trim().min(1).max(40), invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), lines: z.array(z.object({ speciesId: id.nullish(), description: z.string().min(1).max(120), quantityKg: kg, unitPrice: price })).min(1).max(50) }).parse(input);
  return run("finance.write", (app) => recordSupplierInvoice(app.ctx, { ...p, purchaseOrderId: p.purchaseOrderId ?? null }), "Invoice recorded");
}
export async function approveInvoiceExceptionAction(invoiceId: string, note: string) {
  return run("finance.approve", (app) => approveInvoiceException(app.ctx, id.parse(invoiceId), z.string().min(3).max(300).parse(note)), "Exception approved");
}
export async function approvePaymentAction(invoiceId: string) {
  return run("finance.approve", (app) => approveForPayment(app.ctx, id.parse(invoiceId)), "Approved for payment");
}
export async function recordPaymentAction(direction: "AP" | "AR", invoiceId: string, amount: number, method: "PAYNOW" | "GIRO" | "BANK_TRANSFER" | "CHEQUE" | "CASH") {
  return run("finance.write", (app) => recordPayment(app.ctx, { direction: z.enum(["AP", "AR"]).parse(direction), invoiceId: id.parse(invoiceId), amount: z.coerce.number().positive().parse(amount), method }), "Payment recorded");
}
export async function createCustomerInvoiceAction(salesOrderId: string) {
  return run("finance.write", (app) => createCustomerInvoice(app.ctx, id.parse(salesOrderId)), (i) => `${i.invoiceNumber} issued`);
}
export async function creditNoteAction(invoiceId: string, lineId: string, qty: number, reason: string) {
  return run("finance.write", (app) => createCreditNote(app.ctx, id.parse(invoiceId), { lineId: id.parse(lineId), quantityKg: kg.parse(qty), reason: z.string().min(3).max(200).parse(reason) }), (c) => `${c.invoiceNumber} issued`);
}
export async function transmitInvoiceNowAction(invoiceId: string) {
  return run("finance.write", (app) => transmitInvoiceNow(app.ctx, id.parse(invoiceId)), "InvoiceNow payload prepared (MOCK — not transmitted)");
}

// ---------------- Traceability ----------------
export async function openRecallAction(lotRef: string, reason: string, severity: "PRECAUTIONARY" | "CLASS_II" | "CLASS_I") {
  return run("recall.manage", (app) => openRecall(app.ctx, z.string().min(3).max(60).parse(lotRef), z.string().min(5).max(300).parse(reason), z.enum(["PRECAUTIONARY", "CLASS_II", "CLASS_I"]).parse(severity)), (r) => `${r.caseNumber} opened`);
}
export async function requestRecallContactsAction(recallCaseId: string, body: string) {
  return run("recall.manage", (app) => requestRecallContactApproval(app.ctx, id.parse(recallCaseId), z.string().min(10).max(1000).parse(body)), "Contact list sent for approval — nothing has been sent");
}

// ---------------- AI & search ----------------
export async function commandAction(question: string) {
  return run("market.view", (app) => answerCommand(app.org.id, z.string().trim().min(2).max(500).parse(question), app.marketDate));
}
export async function searchAction(q: string) {
  return run(null, (app) => search(app.org.id, z.string().max(80).parse(q)));
}
export async function markNotificationsReadAction() {
  return run(null, (app) => db.update(notification).set({ status: "READ", readAt: new Date() }).where(and(eq(notification.orgId, app.org.id), eq(notification.status, "UNREAD"))));
}

// ---------------- Settings ----------------
export async function switchOrgAction(orgId: string) {
  const oid = id.parse(orgId);
  return run(null, async (app) => {
    const ok = await db.select({ id: membership.id }).from(membership).where(and(eq(membership.userId, app.user.id), eq(membership.orgId, oid)));
    if (!ok.length) throw new Error("You don't have permission to do that.");
    (await cookies()).set(ORG_COOKIE, oid, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  });
}

export async function toggleAutomationRuleAction(ruleId: string, enabled: boolean, params?: Record<string, unknown>) {
  return run("settings.manage", async (app) => {
    const [r] = await db.select().from(automationRule).where(and(eq(automationRule.id, id.parse(ruleId)), eq(automationRule.orgId, app.org.id)));
    if (!r) throw new Error("Rule not found");
    if (r.riskClass === "FINANCIAL" || r.riskClass === "COMPLIANCE") throw new Error("Financial and compliance actions can never be automated.");
    await db.update(automationRule).set({ enabled, params: params ?? r.params, updatedBy: app.user.name }).where(eq(automationRule.id, r.id));
    await audit(db, app.ctx, { action: "AUTOMATION_RULE_CHANGED", entityType: "automation_rule", entityId: r.id, summary: `${enabled ? "Enabled" : "Disabled"} automation “${r.name}”.`, before: { enabled: r.enabled, params: r.params }, after: { enabled, params: params ?? r.params } });
  }, "Automation rule updated");
}

export async function updateSettingsAction(input: { dispatchCutoff?: string; defaultAllocationPolicy?: string; gstRatePct?: number; gstRegistered?: boolean; receivingTempMaxC?: number; weightVarianceAlertPct?: number; surplusDiscountFloorPct?: number; tolQtyPct?: number; tolPricePct?: number; tolAmountAbs?: number; weights?: Record<string, number> }) {
  const p = z.object({
    dispatchCutoff: hhmm.optional(), defaultAllocationPolicy: policy.optional(), gstRatePct: z.coerce.number().min(0).max(30).optional(), gstRegistered: z.boolean().optional(),
    receivingTempMaxC: z.coerce.number().min(-30).max(15).optional(), weightVarianceAlertPct: z.coerce.number().min(0).max(50).optional(), surplusDiscountFloorPct: z.coerce.number().min(0).max(60).optional(),
    tolQtyPct: z.coerce.number().min(0).max(20).optional(), tolPricePct: z.coerce.number().min(0).max(20).optional(), tolAmountAbs: z.coerce.number().min(0).max(1000).optional(),
    weights: z.record(z.string(), z.coerce.number().min(0).max(1)).optional(),
  }).parse(input);
  return run("settings.manage", async (app) => {
    const s = app.org.settings;
    const next = {
      ...s,
      dispatchCutoff: p.dispatchCutoff ?? s.dispatchCutoff,
      defaultAllocationPolicy: p.defaultAllocationPolicy ?? s.defaultAllocationPolicy,
      receivingTempMaxC: p.receivingTempMaxC ?? s.receivingTempMaxC,
      weightVarianceAlertPct: p.weightVarianceAlertPct ?? s.weightVarianceAlertPct,
      surplusDiscountFloorPct: p.surplusDiscountFloorPct ?? s.surplusDiscountFloorPct,
      invoiceTolerance: { qtyPct: p.tolQtyPct ?? s.invoiceTolerance.qtyPct, pricePct: p.tolPricePct ?? s.invoiceTolerance.pricePct, amountAbs: p.tolAmountAbs ?? s.invoiceTolerance.amountAbs },
      procurementWeights: p.weights ? { ...s.procurementWeights, ...p.weights } : s.procurementWeights,
    };
    await db.update(organization).set({ settings: next, gstRatePct: p.gstRatePct === undefined ? app.org.gstRatePct : p.gstRatePct.toFixed(2), gstRegistered: p.gstRegistered ?? app.org.gstRegistered }).where(eq(organization.id, app.org.id));
    await audit(db, app.ctx, { action: "SETTINGS_CHANGED", entityType: "organization", entityId: app.org.id, summary: "Organisation settings updated.", before: s as Record<string, unknown>, after: next as Record<string, unknown> });
  }, "Settings saved");
}

export async function addAliasAction(speciesId: string, alias: string) {
  return run("species.manage", async (app) => {
    const sid = id.parse(speciesId);
    const a = z.string().trim().min(2).max(60).parse(alias);
    const norm = normaliseName(a);
    const [existing] = await db.select().from(speciesAlias).where(and(eq(speciesAlias.orgId, app.org.id), eq(speciesAlias.normalised, norm)));
    if (existing) {
      await db.update(speciesAlias).set({ speciesId: sid, source: "ADMIN", confirmedBy: app.user.name }).where(eq(speciesAlias.id, existing.id));
    } else {
      await db.insert(speciesAlias).values({ orgId: app.org.id, speciesId: sid, alias: a, normalised: norm, source: "ADMIN", confirmedBy: app.user.name });
    }
    await audit(db, app.ctx, { action: "ALIAS_MAPPED", entityType: "species", entityId: sid, summary: `Alias “${a}” mapped by ${app.user.name}${existing ? ` (was mapped to another species)` : ""}.` });
  }, "Alias saved");
}

export async function removeAliasAction(aliasId: string) {
  return run("species.manage", async (app) => {
    const [a] = await db.delete(speciesAlias).where(and(eq(speciesAlias.id, id.parse(aliasId)), eq(speciesAlias.orgId, app.org.id))).returning();
    if (a) await audit(db, app.ctx, { action: "ALIAS_REMOVED", entityType: "species", entityId: a.speciesId, summary: `Alias “${a.alias}” removed.` });
  }, "Alias removed");
}

export async function learnAliasAction(speciesId: string, supplierName: string) {
  return run("species.manage", (app) => learnAlias(db, app.ctx, id.parse(speciesId), z.string().min(2).max(60).parse(supplierName)), "Alias learned");
}

/** DEMO workspaces only: move the labelled demo clock (e.g. jump to 04:15 to show the surplus agent). */
export async function setDemoClockAction(toLocal: string) {
  const t = hhmm.parse(toLocal);
  return run("settings.manage", async (app) => {
    if (!app.org.isDemo) throw new Error("The demo clock only exists in DEMO workspaces.");
    const target = atMarketTime(app.marketDate, t);
    if (target.getTime() < app.now.getTime() - 60000) throw new Error("The demo clock can only move forward.");
    await db.update(organization).set({ settings: { ...app.org.settings, demoClockOffsetMs: target.getTime() - Date.now() } }).where(eq(organization.id, app.org.id));
    await audit(db, app.ctx, { action: "DEMO_CLOCK_SET", entityType: "organization", entityId: app.org.id, summary: `Demo clock moved to ${t} SGT.` });
  }, `Demo clock set to ${toLocal}`);
}

export async function speciesList() {
  return run(null, (app) => db.select({ id: species.id, name: species.canonicalName, code: species.code }).from(species).where(eq(species.orgId, app.org.id)));
}
