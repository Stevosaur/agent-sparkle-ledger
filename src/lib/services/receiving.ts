/**
 * Receiving: weigh, temperature, grade, reject — in one transaction that updates the lot, goods receipt,
 * PO line, quality inspection, temperature log and inventory ledger. Designed for < 20 s per lot on a phone.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { catchLot, catchLotPhoto, goodsReceipt, goodsReceiptLine, inventoryMovement, purchaseOrder, purchaseOrderLine, qualityInspection, temperatureReading } from "@/lib/db/schema";
import { D, toKgStr } from "@/lib/domain/decimal";
import { fmtTime, minutesBetween } from "@/lib/domain/time";
import { audit } from "./audit";
import { DomainError, nowOf, type Ctx } from "./context";
import { getOrg } from "./common";
import { nextSeq } from "./sequence";
import { emit } from "@/lib/events/bus";

export type RejectionReason = "WRONG_SPECIES" | "WRONG_SIZE" | "UNDERWEIGHT" | "POOR_QUALITY" | "TEMPERATURE" | "DAMAGED" | "LATE" | "OTHER";

export type ReceiveInput = {
  lotId: string;
  receivedKg: number;
  rejectedKg?: number;
  rejectionReason?: RejectionReason | null;
  temperatureC?: number | null;
  qualityGrade: "A" | "B" | "C" | "REJECT";
  photoKey?: string | null;
  notes?: string | null;
};

export async function receiveLot(ctx: Ctx, input: ReceiveInput) {
  const at = nowOf(ctx);
  if (!(input.receivedKg >= 0)) throw new DomainError("Enter the weighed quantity.");
  const rejected = D(input.rejectedKg ?? 0);
  if (rejected.lt(0) || rejected.gt(D(input.receivedKg))) throw new DomainError("Rejected quantity must be between 0 and the weighed quantity.");
  if (rejected.gt(0) && !input.rejectionReason) throw new DomainError("Select a rejection reason.");
  const grade = input.qualityGrade;
  const acceptedAll = grade === "REJECT";

  return db.transaction(async (x) => {
    const org = await getOrg(x, ctx.orgId);
    const locked = await x.execute(sql`SELECT id FROM catch_lot WHERE id = ${input.lotId} AND org_id = ${ctx.orgId} FOR UPDATE`);
    if (!locked.rows.length) throw new DomainError("Lot not found", "NOT_FOUND", 404);
    const [lot] = await x.select().from(catchLot).where(eq(catchLot.id, input.lotId));
    if (!["EXPECTED", "LANDED"].includes(lot.status)) throw new DomainError(`${lot.lotNumber} was already received (${lot.status}).`, "ALREADY_RECEIVED", 409);

    const received = D(input.receivedKg);
    const rej = acceptedAll ? received : rejected;
    const accepted = received.minus(rej);
    const declared = D(lot.quantityDeclaredKg);
    const tempMax = org.settings.receivingTempMaxC;
    const tempException = input.temperatureC !== null && input.temperatureC !== undefined && input.temperatureC > tempMax;

    // Goods receipt (linked to PO when the lot was purchased)
    let poId: string | null = null;
    if (lot.purchaseOrderLineId) {
      const [pol] = await x.select().from(purchaseOrderLine).where(eq(purchaseOrderLine.id, lot.purchaseOrderLineId));
      poId = pol?.purchaseOrderId ?? null;
    }
    const grnNo = `GRN-${String(await nextSeq(x, ctx.orgId, "GRN")).padStart(5, "0")}`;
    const [grn] = await x
      .insert(goodsReceipt)
      .values({ orgId: ctx.orgId, grnNumber: grnNo, purchaseOrderId: poId, vendorId: lot.vendorId!, receivedAt: at, receivedBy: ctx.actor.label, locationId: lot.locationId })
      .returning();
    const lateMin = lot.originalEta ? Math.max(0, minutesBetween(lot.originalEta, at)) : null;
    const [grl] = await x
      .insert(goodsReceiptLine)
      .values({
        orgId: ctx.orgId,
        goodsReceiptId: grn.id,
        purchaseOrderLineId: lot.purchaseOrderLineId,
        lotId: lot.id,
        declaredKg: toKgStr(declared),
        receivedKg: toKgStr(received),
        acceptedKg: toKgStr(accepted),
        rejectedKg: toKgStr(rej),
        rejectionReason: rej.gt(0) ? (input.rejectionReason ?? (acceptedAll ? "POOR_QUALITY" : "OTHER")) : null,
        temperatureC: input.temperatureC === null || input.temperatureC === undefined ? null : String(input.temperatureC),
        qualityGrade: grade,
        expectedAt: lot.originalEta,
        arrivedLateMinutes: lateMin,
      })
      .returning();
    await x.insert(qualityInspection).values({
      orgId: ctx.orgId,
      lotId: lot.id,
      goodsReceiptLineId: grl.id,
      inspectedAt: at,
      inspector: ctx.actor.label,
      grade,
      temperatureC: input.temperatureC === null || input.temperatureC === undefined ? null : String(input.temperatureC),
      rejectedKg: toKgStr(rej),
      rejectionReason: rej.gt(0) ? (input.rejectionReason ?? "POOR_QUALITY") : null,
      notes: input.notes ?? null,
    });
    if (input.temperatureC !== null && input.temperatureC !== undefined) {
      await x.insert(temperatureReading).values({ orgId: ctx.orgId, lotId: lot.id, readingC: String(input.temperatureC), thresholdMaxC: String(tempMax), isException: tempException, source: "PROBE", at });
    }
    if (input.photoKey) await x.insert(catchLotPhoto).values({ orgId: ctx.orgId, lotId: lot.id, fileKey: input.photoKey, stage: "RECEIVING", takenBy: ctx.actor.label });

    const status = accepted.isZero() ? "REJECTED" : "AVAILABLE";
    const [updated] = await x
      .update(catchLot)
      .set({
        status,
        receivedTime: at,
        landingTime: lot.landingTime ?? at,
        quantityReceivedKg: toKgStr(received),
        quantityRejectedKg: toKgStr(rej),
        quantityAvailableKg: toKgStr(accepted),
        qualityGrade: grade,
        temperatureAtReceivingC: input.temperatureC === null || input.temperatureC === undefined ? null : String(input.temperatureC),
      })
      .where(eq(catchLot.id, lot.id))
      .returning();

    await x.insert(inventoryMovement).values({ orgId: ctx.orgId, lotId: lot.id, type: "RECEIPT", quantityKg: toKgStr(received), availableAfterKg: toKgStr(received), refType: "goods_receipt", refId: grn.id, actor: ctx.actor.label, at });
    if (rej.gt(0))
      await x.insert(inventoryMovement).values({ orgId: ctx.orgId, lotId: lot.id, type: "REJECT", quantityKg: toKgStr(rej.neg()), availableAfterKg: toKgStr(accepted), refType: "goods_receipt", refId: grn.id, actor: ctx.actor.label, at });

    if (lot.purchaseOrderLineId) {
      await x.update(purchaseOrderLine).set({ receivedKg: sql`${purchaseOrderLine.receivedKg} + ${toKgStr(accepted)}` }).where(eq(purchaseOrderLine.id, lot.purchaseOrderLineId));
      if (poId) {
        const open = await x.execute(sql`SELECT COUNT(*)::int AS n FROM purchase_order_line pol JOIN catch_lot l ON l.id = pol.lot_id WHERE pol.purchase_order_id = ${poId} AND l.status IN ('EXPECTED','LANDED')`);
        await x.update(purchaseOrder).set({ status: Number((open.rows[0] as { n: number }).n) === 0 ? "RECEIVED" : "PARTIALLY_RECEIVED" }).where(and(eq(purchaseOrder.id, poId)));
      }
    }

    const variancePct = declared.isZero() ? 0 : received.minus(declared).dividedBy(declared).times(100).toDecimalPlaces(1).toNumber();
    await audit(x, ctx, {
      action: "LOT_RECEIVED",
      entityType: "catch_lot",
      entityId: lot.id,
      summary: `Received ${lot.lotNumber}: actual ${received.toFixed(1)} kg vs ${declared.toFixed(1)} kg declared (${variancePct > 0 ? "+" : ""}${variancePct}%)${rej.gt(0) ? `, rejected ${rej.toFixed(1)} kg` : ""}, grade ${grade}${input.temperatureC !== null && input.temperatureC !== undefined ? `, ${input.temperatureC}°C` : ""} at ${fmtTime(at)}.`,
      before: { status: lot.status, quantityDeclaredKg: lot.quantityDeclaredKg },
      after: { status, quantityReceivedKg: updated.quantityReceivedKg, quantityAvailableKg: updated.quantityAvailableKg },
      relatedIds: [grn.id, poId ?? "", lot.vendorId ?? ""].filter(Boolean),
    });
    await emit(x, ctx.orgId, "LOT_RECEIVED", { lotId: lot.id, goodsReceiptId: grn.id, variancePct, tempException, marketDate: lot.marketDate, speciesId: lot.speciesId }, { at: nowOf(ctx) });
    if (tempException) await emit(x, ctx.orgId, "TEMPERATURE_EXCEPTION", { lotId: lot.id, readingC: input.temperatureC, thresholdC: tempMax }, { at: nowOf(ctx) });
    return { lot: updated, goodsReceiptId: grn.id, grnNumber: grnNo, variancePct, acceptedKg: accepted.toNumber(), tempException };
  });
}
