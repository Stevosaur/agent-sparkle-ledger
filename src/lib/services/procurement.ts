/**
 * Purchasing: purchase orders (always tied to traceable lots), accepting supplier declarations, and the
 * data the Procurement Agent needs about offers and vendor reliability.
 */
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { catchLot, purchaseOrder, purchaseOrderLine, quote, quoteLine, species, vendor } from "@/lib/db/schema";
import { D, gst, money, toKgStr, toMoneyStr, toPriceStr } from "@/lib/domain/decimal";
import { addDays, atMarketTime, fmtTime, minutesBetween } from "@/lib/domain/time";
import type { SupplyOffer } from "@/lib/domain/procurement";
import { audit } from "./audit";
import { DomainError, nowOf, type Ctx } from "./context";
import { getOrg } from "./common";
import { nextSeq } from "./sequence";
import { newLotNumber } from "./lots";
import { emit } from "@/lib/events/bus";

export type POLineInput = { speciesId: string; lotId?: string | null; quantityKg: number; pricePerKg: number; sizeMinKg?: number | null; sizeMaxKg?: number | null };

export async function createPurchaseOrder(
  x: Executor,
  ctx: Ctx,
  p: { vendorId: string; marketDate: string; source: "MANUAL" | "AI_RECOMMENDATION" | "RFQ" | "CATCH_DECLARATION"; lines: POLineInput[]; expectedAt?: Date | null; approvalId?: string | null; notes?: string },
) {
  if (!p.lines.length) throw new DomainError("A purchase order needs at least one line.");
  const org = await getOrg(x, ctx.orgId);
  const [v] = await x.select().from(vendor).where(and(eq(vendor.id, p.vendorId), eq(vendor.orgId, ctx.orgId)));
  if (!v) throw new DomainError("Vendor not found");
  const n = await nextSeq(x, ctx.orgId, "PO");
  const poNumber = `PO-${String(n).padStart(5, "0")}`;
  const subtotal = money(p.lines.reduce((a, l) => a.plus(D(l.quantityKg).times(D(l.pricePerKg))), D(0)));
  const rate = v.gstRegistered && org.gstRegistered ? D(org.gstRatePct) : D(0);
  const gstAmt = gst(subtotal, rate);
  const now = nowOf(ctx);
  const [po] = await x
    .insert(purchaseOrder)
    .values({
      orgId: ctx.orgId,
      poNumber,
      vendorId: v.id,
      marketDate: p.marketDate,
      status: "APPROVED",
      source: p.source,
      expectedAt: p.expectedAt ?? null,
      subtotal: toMoneyStr(subtotal),
      gstRatePct: rate.toFixed(2),
      gstAmount: toMoneyStr(gstAmt),
      total: toMoneyStr(subtotal.plus(gstAmt)),
      approvalId: p.approvalId ?? null,
      approvedBy: ctx.actor.label,
      approvedAt: now,
      notes: p.notes ?? null,
      createdBy: ctx.actor.label,
      createdAt: now,
    })
    .returning();

  const lotIds: string[] = [];
  for (const l of p.lines) {
    if (l.quantityKg <= 0 || l.pricePerKg <= 0) throw new DomainError("PO quantities and prices must be positive.");
    let lotId = l.lotId ?? null;
    if (lotId) {
      const locked = await x.execute(sql`SELECT purchase_order_line_id FROM catch_lot WHERE id = ${lotId} AND org_id = ${ctx.orgId} FOR UPDATE`);
      if (!locked.rows.length) throw new DomainError("Lot not found");
      if ((locked.rows[0] as { purchase_order_line_id: string | null }).purchase_order_line_id) throw new DomainError("This lot has already been purchased.", "DOUBLE_PURCHASE", 409);
    } else {
      // Quote/manual line: create the expected lot now so the purchase is traceable from the start.
      const [sp] = await x.select().from(species).where(eq(species.id, l.speciesId));
      const [lot] = await x
        .insert(catchLot)
        .values({
          orgId: ctx.orgId,
          lotNumber: await newLotNumber(x, ctx.orgId, p.marketDate),
          marketDate: p.marketDate,
          vendorId: v.id,
          sourceCountry: v.country,
          speciesId: l.speciesId,
          canonicalSpeciesName: sp?.canonicalName ?? null,
          scientificName: sp?.scientificName ?? null,
          quantityDeclaredKg: toKgStr(l.quantityKg),
          askingPricePerKg: toPriceStr(l.pricePerKg),
          sizeMinKg: l.sizeMinKg ? toKgStr(l.sizeMinKg) : null,
          sizeMaxKg: l.sizeMaxKg ? toKgStr(l.sizeMaxKg) : null,
          expectedArrivalAt: p.expectedAt ?? null,
          originalEta: p.expectedAt ?? null,
          status: "EXPECTED",
          confirmation: "CONFIRMED",
          createdBy: ctx.actor.label,
          createdAt: now,
        })
        .returning({ id: catchLot.id });
      lotId = lot.id;
    }
    const [line] = await x
      .insert(purchaseOrderLine)
      .values({
        orgId: ctx.orgId,
        purchaseOrderId: po.id,
        speciesId: l.speciesId,
        lotId,
        quantityKg: toKgStr(l.quantityKg),
        pricePerKg: toPriceStr(l.pricePerKg),
        sizeMinKg: l.sizeMinKg ? toKgStr(l.sizeMinKg) : null,
        sizeMaxKg: l.sizeMaxKg ? toKgStr(l.sizeMaxKg) : null,
        lineTotal: toMoneyStr(money(D(l.quantityKg).times(D(l.pricePerKg)))),
      })
      .returning({ id: purchaseOrderLine.id });
    await x
      .update(catchLot)
      .set({ purchaseOrderLineId: line.id, agreedCostPerKg: toPriceStr(l.pricePerKg), confirmation: "CONFIRMED", quantityDeclaredKg: toKgStr(l.quantityKg), ambiguousFields: [] })
      .where(eq(catchLot.id, lotId));
    lotIds.push(lotId);
  }
  await audit(x, ctx, {
    action: "PO_APPROVED",
    entityType: "purchase_order",
    entityId: po.id,
    summary: `${poNumber} to ${v.name}: ${p.lines.map((l) => `${l.quantityKg} kg @ S$${l.pricePerKg.toFixed(2)}`).join(", ")} — total S$${subtotal.plus(gstAmt).toFixed(2)}${p.expectedAt ? `, ETA ${fmtTime(p.expectedAt)}` : ""}.`,
    after: { status: "APPROVED", total: po.total, source: p.source },
    relatedIds: [v.id, ...lotIds, p.approvalId ?? ""].filter(Boolean),
  });
  for (const id of lotIds)
    await audit(x, ctx, { action: "LOT_PURCHASED", entityType: "catch_lot", entityId: id, summary: `Purchased under ${poNumber} (${ctx.actor.type === "AGENT" ? "AI recommendation" : "approved by " + ctx.actor.label}).`, relatedIds: [po.id] });
  await emit(x, ctx.orgId, "PO_APPROVED", { purchaseOrderId: po.id, marketDate: p.marketDate }, { at: nowOf(ctx) });
  return { ...po, lotIds };
}

/** "Confirm & buy": accept a supplier's declared lot at its asking price (human action). */
export async function acceptDeclaredLot(ctx: Ctx, lotId: string, overrides: { quantityKg?: number; pricePerKg?: number } = {}) {
  return db.transaction(async (x) => {
    const [lot] = await x.select().from(catchLot).where(and(eq(catchLot.id, lotId), eq(catchLot.orgId, ctx.orgId)));
    if (!lot) throw new DomainError("Lot not found", "NOT_FOUND", 404);
    if (!lot.vendorId) throw new DomainError("Assign a vendor before buying this lot.");
    if (!lot.speciesId) throw new DomainError("Confirm the species before buying this lot.");
    const price = overrides.pricePerKg ?? (lot.askingPricePerKg ? Number(lot.askingPricePerKg) : null);
    if (!price) throw new DomainError("Enter an agreed price before buying this lot.");
    return createPurchaseOrder(x, ctx, {
      vendorId: lot.vendorId,
      marketDate: lot.marketDate,
      source: "CATCH_DECLARATION",
      expectedAt: lot.expectedArrivalAt,
      lines: [{ speciesId: lot.speciesId, lotId: lot.id, quantityKg: overrides.quantityKg ?? Number(lot.quantityDeclaredKg), pricePerKg: price, sizeMinKg: lot.sizeMinKg ? Number(lot.sizeMinKg) : null, sizeMaxKg: lot.sizeMaxKg ? Number(lot.sizeMaxKg) : null }],
    });
  });
}

/** Historical reliability & quality per vendor (last 60 nights) — feeds procurement scoring. */
export async function vendorReliability(x: Executor, orgId: string, marketDate: string) {
  const from = addDays(marketDate, -60);
  const r = await x.execute(sql`
    SELECT l.vendor_id,
      SUM(grl.received_kg) / NULLIF(SUM(grl.declared_kg),0) AS fill,
      AVG(CASE WHEN grl.quality_grade = 'A' THEN 1.0 ELSE 0 END) AS quality
    FROM goods_receipt_line grl JOIN catch_lot l ON l.id = grl.lot_id
    WHERE grl.org_id = ${orgId} AND l.market_date >= ${from} AND l.market_date < ${marketDate}
    GROUP BY l.vendor_id`);
  return new Map((r.rows as { vendor_id: string; fill: string; quality: string }[]).map((row) => [row.vendor_id, { reliability: Math.min(1, Number(row.fill ?? 0.9)), quality: Number(row.quality ?? 0.6) }]));
}

/** Unbought supply offered for a species tonight: confirmed declared lots and open quotes. */
export async function openOffers(x: Executor, orgId: string, marketDate: string, speciesId: string, cutoff: string): Promise<SupplyOffer[]> {
  const rel = await vendorReliability(x, orgId, marketDate);
  const cutoffAt = atMarketTime(marketDate, cutoff);
  const lots = await x
    .select({ l: catchLot, v: vendor })
    .from(catchLot)
    .innerJoin(vendor, eq(vendor.id, catchLot.vendorId))
    .where(and(eq(catchLot.orgId, orgId), eq(catchLot.marketDate, marketDate), eq(catchLot.speciesId, speciesId), isNull(catchLot.purchaseOrderLineId), eq(catchLot.confirmation, "CONFIRMED"), inArray(catchLot.status, ["EXPECTED", "LANDED"])));
  const quotes = await x
    .select({ q: quote, ql: quoteLine, v: vendor })
    .from(quoteLine)
    .innerJoin(quote, eq(quote.id, quoteLine.quoteId))
    .innerJoin(vendor, eq(vendor.id, quote.vendorId))
    .where(and(eq(quote.orgId, orgId), eq(quote.marketDate, marketDate), eq(quoteLine.speciesId, speciesId), eq(quote.status, "RECEIVED"), isNull(quote.lotId)));
  const offers: SupplyOffer[] = [];
  for (const { l, v } of lots) {
    const price = Number(l.askingPricePerKg ?? 0);
    if (!price) continue;
    const r = rel.get(v.id) ?? { reliability: 0.9, quality: 0.6 };
    offers.push({
      offerId: l.id, source: "LOT", vendorId: v.id, vendorName: v.name, availableKg: Number(l.quantityDeclaredKg), pricePerKg: price,
      reliability: r.reliability, quality: r.quality,
      etaSlackMinutes: l.expectedArrivalAt ? minutesBetween(l.expectedArrivalAt, cutoffAt) : null,
      ageHours: 4, relationshipTier: v.relationshipTier, minOrderKg: v.minOrderKg ? Number(v.minOrderKg) : null,
      isEstimate: l.status === "EXPECTED",
    });
  }
  for (const { q, ql, v } of quotes) {
    const r = rel.get(v.id) ?? { reliability: 0.9, quality: 0.6 };
    offers.push({
      offerId: ql.id, source: "QUOTE", vendorId: v.id, vendorName: v.name, availableKg: Number(ql.quantityKg), pricePerKg: Number(ql.pricePerKg),
      reliability: r.reliability, quality: r.quality,
      etaSlackMinutes: q.etaAt ? minutesBetween(q.etaAt, cutoffAt) : null, ageHours: 6, relationshipTier: v.relationshipTier,
      minOrderKg: v.minOrderKg ? Number(v.minOrderKg) : null, isEstimate: true,
    });
  }
  return offers;
}

export async function recentPurchasePrices(orgId: string, speciesId: string, days: number, marketDate: string) {
  const from = addDays(marketDate, -days);
  return db
    .select({ at: purchaseOrder.marketDate, price: purchaseOrderLine.pricePerKg, qty: purchaseOrderLine.quantityKg, vendorName: vendor.name, vendorId: vendor.id })
    .from(purchaseOrderLine)
    .innerJoin(purchaseOrder, eq(purchaseOrder.id, purchaseOrderLine.purchaseOrderId))
    .innerJoin(vendor, eq(vendor.id, purchaseOrder.vendorId))
    .where(and(eq(purchaseOrder.orgId, orgId), eq(purchaseOrderLine.speciesId, speciesId), gte(purchaseOrder.marketDate, from), sql`${purchaseOrder.status} NOT IN ('CANCELLED','DRAFT')`));
}
