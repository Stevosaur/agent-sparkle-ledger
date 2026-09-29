import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestDb, userCtx, vendorByCode, speciesByCode, count, db, S, sql, eq, and } from "./helpers";
import { pool } from "@/lib/db/client";
import { ingestSupplierMessage } from "@/lib/agents/catch-intake";
import { runProcurementAgent } from "@/lib/agents/procurement";
import { confirmLot } from "@/lib/services/lots";
import { acceptDeclaredLot } from "@/lib/services/procurement";
import { receiveLot } from "@/lib/services/receiving";
import { commitAllocation, previewAllocation } from "@/lib/services/allocation";
import { createSalesOrder, dispatchShipment, generatePickList, pickAndPackOrder, planDeliveryRuns } from "@/lib/services/fulfilment";
import { draftInvoiceFromPo } from "@/lib/services/finance";
import { traceLot, openRecall } from "@/lib/services/trace";
import { transformLot } from "@/lib/services/lots";
import { decideApproval } from "@/lib/services/approvals";
import { search } from "@/lib/services/search";
import { drain } from "@/lib/events/bus";
import { atMarketTime } from "@/lib/domain/time";
import type { SeedResult } from "@/lib/demo/seed";

let seed: SeedResult;
const PM = "procurement@demo.pasarcatch.sg";
const OPS = "ops@demo.pasarcatch.sg";
const FIN = "finance@demo.pasarcatch.sg";

beforeAll(async () => {
  seed = await setupTestDb();
}, 180_000);
afterAll(async () => {
  await pool.end();
});

describe("catch intake → lot creation", () => {
  it("turns the definition-of-done WhatsApp message into a draft lot with only ambiguous fields flagged", async () => {
    const ah = await vendorByCode(seed.orgId, "V-AHSENG");
    const r = await ingestSupplierMessage(seed.orgId, { channel: "WHATSAPP_SIMULATOR", from: ah.whatsappNumber, body: "Tonight 65kg batang, around 600-800g, asking 8.80. Boat reach 1.30.", at: atMarketTime(seed.tonight, "01:02"), marketDate: seed.tonight }, "USER");
    expect(r.lotIds).toHaveLength(1);
    const [lot] = await db.select().from(S.catchLot).where(eq(S.catchLot.id, r.lotIds[0]));
    const batang = await speciesByCode(seed.orgId, "SPM");
    expect(lot).toMatchObject({ confirmation: "DRAFT", status: "EXPECTED", vendorId: ah.id, speciesId: batang.id, quantityDeclaredKg: "65.000", askingPricePerKg: "8.8000", sizeMinKg: "0.600", sizeMaxKg: "0.800" });
    expect(lot.ambiguousFields).toEqual([]);
    expect(lot.expectedArrivalAt?.toISOString()).toBe(atMarketTime(seed.tonight, "01:30").toISOString());
    expect(lot.lotNumber).toMatch(/^LOT-JFP-\d{8}-\d{4}$/);
    const [run] = await db.select().from(S.agentRun).where(eq(S.agentRun.id, r.runId));
    expect(run.status).toBe("SUCCEEDED");
    expect(run.agent).toBe("CATCH_INTAKE");
    // Templated supplier acknowledgement was auto-sent because the org explicitly enabled that automation.
    expect(await count(sql`SELECT count(*)::int n FROM message WHERE org_id = ${seed.orgId} AND direction = 'OUTBOUND' AND status = 'MOCK_SENT' AND to_handle = ${ah.whatsappNumber}`)).toBeGreaterThan(0);
  });

  it("flags an ambiguous species instead of guessing", async () => {
    const r = await ingestSupplierMessage(seed.orgId, { channel: "WEB", body: "Got 30kg mackerel tonight", at: atMarketTime(seed.tonight, "01:03"), marketDate: seed.tonight }, "USER");
    const [lot] = await db.select().from(S.catchLot).where(eq(S.catchLot.id, r.lotIds[0]));
    expect(lot.ambiguousFields).toContain("species");
    expect(lot.confirmation).toBe("DRAFT");
  });
});

describe("definition-of-done flow: confirm → shortage → approve → receive → allocate → pick → route → dispatch → invoice → trace", () => {
  let lotId: string;
  it("confirming & buying a declared lot creates an approved PO and committed supply", async () => {
    const [draft] = await db.select().from(S.catchLot).where(and(eq(S.catchLot.orgId, seed.orgId), eq(S.catchLot.marketDate, seed.tonight), eq(S.catchLot.quantityDeclaredKg, "65.000")));
    lotId = draft.id;
    const ctx = await userCtx(seed.orgId, PM, "01:05", seed.tonight);
    await confirmLot(ctx, lotId);
    const po = await acceptDeclaredLot(ctx, lotId);
    expect(po.status).toBe("APPROVED");
    expect(po.total).toBe("572.00"); // 65 × 8.80, vendor not GST registered
    const [lot] = await db.select().from(S.catchLot).where(eq(S.catchLot.id, lotId));
    expect(lot.purchaseOrderLineId).not.toBeNull();
    // A lot can never be bought twice.
    await expect(acceptDeclaredLot(ctx, lotId)).rejects.toThrow(/already been purchased/);
    await drain();
  });

  it("a second supplier's offer is recommended by the procurement agent and executes only after approval", async () => {
    const nel = await vendorByCode(seed.orgId, "V-NELAYAN");
    const r = await ingestSupplierMessage(seed.orgId, { channel: "WHATSAPP_SIMULATOR", from: nel.whatsappNumber, body: "Can give 40kg batang 1-2kg size @ 8.50, reach 2.45", at: atMarketTime(seed.tonight, "01:08"), marketDate: seed.tonight }, "USER");
    await confirmLot(await userCtx(seed.orgId, PM, "01:09", seed.tonight), r.lotIds[0]);
    await drain();
    await runProcurementAgent(seed.orgId, seed.tonight, "USER", { at: atMarketTime(seed.tonight, "01:10") });
    const batang = await speciesByCode(seed.orgId, "SPM");
    const pending = await db.select().from(S.approval).where(and(eq(S.approval.orgId, seed.orgId), eq(S.approval.status, "PENDING"), eq(S.approval.kind, "CREATE_PURCHASE_ORDER"), sql`${S.approval.payload}->>'speciesId' = ${batang.id}`));
    expect(pending).toHaveLength(1);
    expect(pending[0].riskClass).toBe("COMMERCIAL_COMMITMENT");
    const [offer] = await db.select().from(S.catchLot).where(eq(S.catchLot.id, r.lotIds[0]));
    expect(offer.purchaseOrderLineId).toBeNull(); // nothing bought before approval
    const res = await decideApproval(await userCtx(seed.orgId, PM, "01:12", seed.tonight), pending[0].id, "APPROVE");
    expect(res.result.poNumber).toMatch(/^PO-/);
    const [bought] = await db.select().from(S.catchLot).where(eq(S.catchLot.id, r.lotIds[0]));
    expect(bought.purchaseOrderLineId).not.toBeNull();
    await expect(decideApproval(await userCtx(seed.orgId, PM, "01:13", seed.tonight), pending[0].id, "APPROVE")).rejects.toThrow(/Already/);
  });

  it("receiving records actual weight, updates inventory and flags the variance", async () => {
    const r = await receiveLot(await userCtx(seed.orgId, OPS, "01:40", seed.tonight), { lotId, receivedKg: 61.2, qualityGrade: "A", temperatureC: 1.8 });
    expect(r.lot.status).toBe("AVAILABLE");
    expect(r.lot.quantityAvailableKg).toBe("61.200");
    expect(r.variancePct).toBe(-5.8);
    const mv = await db.select().from(S.inventoryMovement).where(eq(S.inventoryMovement.lotId, lotId));
    expect(mv.map((m) => m.type)).toContain("RECEIPT");
    await expect(receiveLot(await userCtx(seed.orgId, OPS, "01:41", seed.tonight), { lotId, receivedKg: 61.2, qualityGrade: "A" })).rejects.toThrow(/already received/);
    await drain();
    expect(await count(sql`SELECT count(*)::int n FROM ops_exception WHERE org_id = ${seed.orgId} AND dedupe_key = ${`VAR:${lotId}`}`)).toBe(1);
    // Receiving triggered the Allocation Agent, which proposes (not commits) an allocation.
    expect(await count(sql`SELECT count(*)::int n FROM approval WHERE org_id = ${seed.orgId} AND kind = 'CONFIRM_ALLOCATION' AND status = 'PENDING'`)).toBeGreaterThan(0);
  });

  it("allocation distributes the lot between buyers and can never over-allocate", async () => {
    const batang = await speciesByCode(seed.orgId, "SPM");
    const ctx = await userCtx(seed.orgId, PM, "02:20", seed.tonight);
    const { result } = await previewAllocation(seed.orgId, seed.tonight, batang.id, "PRO_RATA");
    expect(result.totalAllocatedKg).toBeLessThanOrEqual(result.totalSupplyKg);
    await commitAllocation(ctx, { marketDate: seed.tonight, speciesId: batang.id, policy: "PRO_RATA", lines: result.lines.map((l) => ({ lineId: l.lineId, fromLots: l.fromLots })) });
    const [lot] = await db.select().from(S.catchLot).where(eq(S.catchLot.id, lotId));
    expect(Number(lot.quantityAvailableKg) + Number(lot.quantityAllocatedKg)).toBeCloseTo(61.2, 3);
    expect(Number(lot.quantityAvailableKg)).toBeGreaterThanOrEqual(0);
    // Re-committing the same (now stale) plan must fail rather than double-allocate.
    await expect(commitAllocation(ctx, { marketDate: seed.tonight, speciesId: batang.id, policy: "PRO_RATA", lines: result.lines.map((l) => ({ lineId: l.lineId, fromLots: l.fromLots })) })).rejects.toThrow();
  });

  it("orders move through picking → routes → dispatch, and dispatched stock leaves inventory", async () => {
    const ops = (h: string) => userCtx(seed.orgId, OPS, h, seed.tonight);
    await generatePickList(await ops("03:00"), seed.tonight);
    const picking = await db.select().from(S.salesOrder).where(and(eq(S.salesOrder.orgId, seed.orgId), eq(S.salesOrder.marketDate, seed.tonight), eq(S.salesOrder.status, "PICKING")));
    expect(picking.length).toBeGreaterThan(0);
    for (const so of picking) await pickAndPackOrder(await ops("03:30"), so.id);
    const plan = await planDeliveryRuns(await ops("05:00"), seed.tonight, "05:30");
    expect(plan.shipmentIds.length).toBeGreaterThan(0);
    const stops = await db.select().from(S.shipmentStop).where(sql`${S.shipmentStop.shipmentId} IN (${sql.join(plan.shipmentIds.map((i) => sql`${i}`), sql`, `)})`);
    for (const sh of await db.select().from(S.shipment).where(sql`${S.shipment.id} IN (${sql.join(plan.shipmentIds.map((i) => sql`${i}`), sql`, `)})`)) {
      expect(Number(sh.totalKg)).toBeLessThanOrEqual(1500);
    }
    expect(stops.length).toBeGreaterThan(0);
    for (const id of plan.shipmentIds) await dispatchShipment(await ops("05:30"), id);
    const [lot] = await db.select().from(S.catchLot).where(eq(S.catchLot.id, lotId));
    expect(lot.quantityAllocatedKg).toBe("0.000");
  });

  it("supplier invoice billing declared weight is caught by three-way matching", async () => {
    const [pol] = await db.select().from(S.purchaseOrderLine).where(eq(S.purchaseOrderLine.lotId, lotId));
    const inv = await draftInvoiceFromPo(await userCtx(seed.orgId, FIN, "07:00", seed.tonight), pol.purchaseOrderId, { invoiceNumber: "AHS-TEST-1", billReceivedWeight: false });
    await drain();
    const [si] = await db.select().from(S.supplierInvoice).where(eq(S.supplierInvoice.id, inv.id));
    expect(si.matchStatus).toBe("EXCEPTION");
    expect((si.matchResult as { potentialOverbillingExGst: string }).potentialOverbillingExGst).toBe("33.44"); // 3.8 kg × S$8.80
    await expect(draftInvoiceFromPo(await userCtx(seed.orgId, FIN, "07:01", seed.tonight), pol.purchaseOrderId, { invoiceNumber: "AHS-TEST-1" })).rejects.toThrow(/already imported/);
    expect(await count(sql`SELECT count(*)::int n FROM approval WHERE org_id = ${seed.orgId} AND kind = 'APPROVE_INVOICE_EXCEPTION' AND status = 'PENDING' AND payload->>'supplierInvoiceId' = ${inv.id}`)).toBe(1);
  });

  it("the lot number traces the complete chain", async () => {
    const [lot] = await db.select().from(S.catchLot).where(eq(S.catchLot.id, lotId));
    const t = await traceLot(seed.orgId, lot.lotNumber.slice(-4));
    expect(t?.root.id).toBe(lotId);
    expect(t!.vendor?.code).toBe("V-AHSENG");
    expect(t!.receipts).toHaveLength(1);
    expect(t!.customers.length).toBeGreaterThan(0);
    expect(t!.deliveries.length).toBeGreaterThan(0);
    expect(t!.supplierInvoices.map((s) => s.invoiceNumber)).toContain("AHS-TEST-1");
    expect(t!.timeline.length).toBeGreaterThan(5);
  });
});

describe("recall trace with genealogy", () => {
  it("finds child lots and affected customers and drafts (never sends) contacts", async () => {
    // Last night's processed Kim Hock batang has cleaned/filleted child lots.
    const [parent] = await db.select().from(S.catchLot).where(and(eq(S.catchLot.orgId, seed.orgId), eq(S.catchLot.marketDate, seed.lastNight), sql`EXISTS (SELECT 1 FROM catch_lot c WHERE c.parent_lot_id = ${S.catchLot.id})`));
    expect(parent).toBeTruthy();
    const t = await traceLot(seed.orgId, parent.lotNumber);
    expect(t!.lots.length).toBeGreaterThan(1);
    const rc = await openRecall(await userCtx(seed.orgId, "compliance@demo.pasarcatch.sg", "09:00", seed.lastNight), parent.lotNumber, "Precautionary test recall");
    const custs = await db.select().from(S.recallAffectedCustomer).where(eq(S.recallAffectedCustomer.recallCaseId, rc.id));
    expect(custs.length).toBe(t!.customers.length);
    expect(custs.every((c) => c.contactStatus === "DRAFT")).toBe(true);
    const lots = await db.select().from(S.recallAffectedLot).where(eq(S.recallAffectedLot.recallCaseId, rc.id));
    expect(lots.some((l) => l.relation === "CHILD")).toBe(true);
  });

  it("transforming more than is available is refused (no negative inventory)", async () => {
    const [avail] = await db.select().from(S.catchLot).where(and(eq(S.catchLot.orgId, seed.orgId), eq(S.catchLot.marketDate, seed.tonight), eq(S.catchLot.status, "AVAILABLE"), sql`${S.catchLot.quantityAvailableKg} > 5`));
    await expect(transformLot(await userCtx(seed.orgId, OPS, "02:00", seed.tonight), avail.id, [{ processingState: "CLEANED", kg: Number(avail.quantityAvailableKg) + 1, type: "CLEAN" }], 0)).rejects.toThrow(/exceed/);
  });
});

describe("tenant isolation", () => {
  it("another organisation cannot see or trace this organisation's lots", async () => {
    const [orgB] = await db.select().from(S.organization).where(eq(S.organization.slug, "kelong-fresh-demo"));
    const [lotA] = await db.select().from(S.catchLot).where(eq(S.catchLot.orgId, seed.orgId)).limit(1);
    expect(await traceLot(orgB.id, lotA.lotNumber)).toBeNull();
    expect(await traceLot(orgB.id, lotA.id)).toBeNull();
    const hits = await search(orgB.id, "batang");
    expect(hits.every((h) => h.type !== "Lot" || h.title.startsWith("LOT-SNK"))).toBe(true);
    expect(hits.find((h) => h.type === "Vendor" && /Ah Seng/.test(h.title))).toBeUndefined();
  });

  it("services reject cross-tenant writes", async () => {
    const [orgB] = await db.select().from(S.organization).where(eq(S.organization.slug, "kelong-fresh-demo"));
    const [lotA] = await db.select().from(S.catchLot).where(and(eq(S.catchLot.orgId, seed.orgId), eq(S.catchLot.status, "EXPECTED"))).limit(1);
    const ctxB = { orgId: orgB.id, actor: { type: "USER" as const, id: "x", label: "Intruder" }, source: "WEB" as const };
    await expect(confirmLot(ctxB, lotA.id)).rejects.toThrow(/not found/i);
    await expect(receiveLot(ctxB, { lotId: lotA.id, receivedKg: 1, qualityGrade: "A" })).rejects.toThrow(/not found/i);
  });
});

describe("orders", () => {
  it("rejects invalid orders", async () => {
    const ctx = await userCtx(seed.orgId, PM, "01:30", seed.tonight);
    const [c] = await db.select().from(S.customer).where(eq(S.customer.orgId, seed.orgId)).limit(1);
    const sp = await speciesByCode(seed.orgId, "SPM");
    await expect(createSalesOrder(ctx, { customerId: c.id, marketDate: seed.tonight, lines: [] })).rejects.toThrow();
    await expect(createSalesOrder(ctx, { customerId: c.id, marketDate: seed.tonight, lines: [{ speciesId: sp.id, requestedKg: -2, pricePerKg: 10 }] })).rejects.toThrow();
  });
});
