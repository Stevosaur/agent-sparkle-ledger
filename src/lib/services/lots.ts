/**
 * Catch lots: creation from declarations, confirmation (with alias learning), ETA changes, transformations
 * with full parent → child genealogy, and inventory movements.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { catchLot, inventoryMovement, lotTransformation, species, speciesAlias, vendor, vessel, farm } from "@/lib/db/schema";
import { D, toKgStr, toPriceStr } from "@/lib/domain/decimal";
import { atMarketTime, compactDate, fmtTime } from "@/lib/domain/time";
import { normaliseName } from "@/lib/domain/species-match";
import { audit } from "./audit";
import { DomainError, nowOf, type Ctx } from "./context";
import { nextSeq } from "./sequence";
import { getOrg } from "./common";
import { emit } from "@/lib/events/bus";

export type Lot = typeof catchLot.$inferSelect;

export async function newLotNumber(x: Executor, orgId: string, marketDate: string): Promise<string> {
  const org = await getOrg(x, orgId);
  const n = await nextSeq(x, orgId, `LOT-${marketDate}`);
  return `LOT-${org.siteCode}-${compactDate(marketDate)}-${String(n).padStart(4, "0")}`;
}

export type DeclarationLineInput = {
  speciesId: string | null;
  supplierSpeciesName: string;
  quantityKg: number;
  sizeMinKg?: number | null;
  sizeMaxKg?: number | null;
  askingPricePerKg?: number | null;
  currency?: string;
  processingState?: Lot["processingState"];
  freshOrFrozen?: Lot["freshOrFrozen"];
  fieldConfidence?: Record<string, number>;
  ambiguousFields?: string[];
};

export async function createLotsFromDeclaration(
  x: Executor,
  ctx: Ctx,
  d: {
    marketDate: string;
    vendorId: string | null;
    etaLocal: string | null;
    lines: DeclarationLineInput[];
    messageId?: string | null;
    confirmation: "DRAFT" | "CONFIRMED";
    intakeConfidence?: number | null;
    ambiguousFields?: string[];
    sourceCountry?: string | null;
    landingLocation?: string | null;
  },
): Promise<Lot[]> {
  const v = d.vendorId ? (await x.select().from(vendor).where(and(eq(vendor.id, d.vendorId), eq(vendor.orgId, ctx.orgId))))[0] : undefined;
  const [vsl] = v ? await x.select().from(vessel).where(eq(vessel.vendorId, v.id)).limit(1) : [];
  const [fm] = v && !vsl ? await x.select().from(farm).where(eq(farm.vendorId, v.id)).limit(1) : [];
  const spIds = d.lines.map((l) => l.speciesId).filter(Boolean) as string[];
  const sps = spIds.length ? await x.select().from(species).where(and(eq(species.orgId, ctx.orgId), inArray(species.id, spIds))) : [];
  const eta = d.etaLocal ? atMarketTime(d.marketDate, d.etaLocal) : null;
  const out: Lot[] = [];
  for (const l of d.lines) {
    const sp = sps.find((s) => s.id === l.speciesId);
    const lotNumber = await newLotNumber(x, ctx.orgId, d.marketDate);
    const [lot] = await x
      .insert(catchLot)
      .values({
        orgId: ctx.orgId,
        lotNumber,
        marketDate: d.marketDate,
        confirmation: d.confirmation,
        vendorId: v?.id ?? null,
        vesselId: vsl?.id ?? null,
        farmId: fm?.id ?? null,
        sourceCountry: d.sourceCountry ?? v?.country ?? null,
        sourceLocation: vsl ? `${vsl.name} (${vsl.homePort ?? vsl.flagCountry})` : fm ? `${fm.name}, ${fm.location ?? fm.country}` : v?.region ?? null,
        landingLocation: d.landingLocation ?? (vsl ? "Jurong Fishery Port" : null),
        catchDate: vsl ? d.marketDate : null,
        harvestDate: fm ? d.marketDate : null,
        originalEta: eta,
        expectedArrivalAt: eta,
        speciesId: sp?.id ?? null,
        supplierSpeciesName: l.supplierSpeciesName || null,
        canonicalSpeciesName: sp?.canonicalName ?? null,
        localName: sp?.localNames[0] ?? null,
        scientificName: sp?.scientificName ?? null,
        quantityDeclaredKg: toKgStr(l.quantityKg),
        sizeMinKg: l.sizeMinKg ? toKgStr(l.sizeMinKg) : null,
        sizeMaxKg: l.sizeMaxKg ? toKgStr(l.sizeMaxKg) : null,
        processingState: l.processingState ?? "WHOLE",
        freshOrFrozen: l.freshOrFrozen ?? "FRESH",
        askingPricePerKg: l.askingPricePerKg ? toPriceStr(l.askingPricePerKg) : null,
        currency: l.currency ?? "SGD",
        status: "EXPECTED",
        intakeMessageId: d.messageId ?? null,
        intakeConfidence: d.intakeConfidence === null || d.intakeConfidence === undefined ? null : String(d.intakeConfidence),
        fieldConfidence: l.fieldConfidence ?? null,
        ambiguousFields: [...new Set([...(l.ambiguousFields ?? []), ...(d.ambiguousFields ?? []).filter((f) => !f.startsWith("lines["))])],
        createdBy: ctx.actor.label,
        createdAt: nowOf(ctx),
      })
      .returning();
    out.push(lot);
    await audit(x, ctx, {
      action: d.confirmation === "DRAFT" ? "LOT_DRAFTED" : "LOT_DECLARED",
      entityType: "catch_lot",
      entityId: lot.id,
      summary:
        ctx.actor.type === "AGENT"
          ? `Converted supplier ${d.messageId ? "message" : "declaration"} into ${d.confirmation === "DRAFT" ? "draft " : ""}catch lot ${lot.lotNumber}: ${sp?.canonicalName ?? l.supplierSpeciesName} ${l.quantityKg} kg${l.askingPricePerKg ? ` @ S$${l.askingPricePerKg.toFixed(2)}` : ""}${eta ? `, ETA ${fmtTime(eta)}` : ""}.`
          : `Declared catch lot ${lot.lotNumber}: ${sp?.canonicalName ?? l.supplierSpeciesName} ${l.quantityKg} kg.`,
      after: { status: "EXPECTED", confirmation: d.confirmation, quantityDeclaredKg: l.quantityKg },
      relatedIds: [v?.id ?? "", d.messageId ?? ""].filter(Boolean),
    });
    if (d.confirmation === "CONFIRMED") await emit(x, ctx.orgId, "CATCH_DECLARED", { lotId: lot.id, marketDate: d.marketDate, speciesId: sp?.id ?? null }, { at: nowOf(ctx) });
  }
  return out;
}

async function lockLot(x: Executor, ctx: Ctx, lotId: string): Promise<Lot> {
  const r = await x.execute(sql`SELECT id FROM catch_lot WHERE id = ${lotId} AND org_id = ${ctx.orgId} FOR UPDATE`);
  if (!r.rows.length) throw new DomainError("Lot not found", "NOT_FOUND", 404);
  const [lot] = await x.select().from(catchLot).where(eq(catchLot.id, lotId));
  return lot;
}

export type ConfirmEdits = Partial<{
  speciesId: string;
  quantityKg: number;
  askingPricePerKg: number | null;
  sizeMinKg: number | null;
  sizeMaxKg: number | null;
  etaLocal: string | null;
  vendorId: string;
}>;

/** Human confirmation of a draft lot. Species corrections are learned as organisation aliases. */
export async function confirmLot(ctx: Ctx, lotId: string, edits: ConfirmEdits = {}) {
  return db.transaction(async (x) => {
    const lot = await lockLot(x, ctx, lotId);
    const patch: Partial<Lot> = { confirmation: "CONFIRMED", ambiguousFields: [] };
    const changes: string[] = [];
    if (edits.speciesId && edits.speciesId !== lot.speciesId) {
      const [sp] = await x.select().from(species).where(and(eq(species.id, edits.speciesId), eq(species.orgId, ctx.orgId)));
      if (!sp) throw new DomainError("Unknown species");
      Object.assign(patch, { speciesId: sp.id, canonicalSpeciesName: sp.canonicalName, scientificName: sp.scientificName, localName: sp.localNames[0] ?? null });
      changes.push(`species → ${sp.canonicalName}`);
    }
    const finalSpeciesId = edits.speciesId ?? lot.speciesId;
    if (!finalSpeciesId) throw new DomainError("Choose a species before confirming.");
    if (lot.supplierSpeciesName && finalSpeciesId) await learnAlias(x, ctx, finalSpeciesId, lot.supplierSpeciesName);
    if (edits.quantityKg !== undefined && D(edits.quantityKg).minus(D(lot.quantityDeclaredKg)).abs().gt(0)) {
      if (edits.quantityKg <= 0) throw new DomainError("Quantity must be positive.");
      patch.quantityDeclaredKg = toKgStr(edits.quantityKg);
      changes.push(`quantity ${D(lot.quantityDeclaredKg).toFixed(1)} → ${edits.quantityKg} kg`);
    }
    if (edits.askingPricePerKg !== undefined) {
      patch.askingPricePerKg = edits.askingPricePerKg === null ? null : toPriceStr(edits.askingPricePerKg);
      if (!D(lot.askingPricePerKg).equals(D(edits.askingPricePerKg))) changes.push(`price → ${edits.askingPricePerKg ?? "none"}`);
    }
    if (edits.sizeMinKg !== undefined) patch.sizeMinKg = edits.sizeMinKg === null ? null : toKgStr(edits.sizeMinKg);
    if (edits.sizeMaxKg !== undefined) patch.sizeMaxKg = edits.sizeMaxKg === null ? null : toKgStr(edits.sizeMaxKg);
    if (edits.etaLocal) {
      const eta = atMarketTime(lot.marketDate, edits.etaLocal);
      patch.expectedArrivalAt = eta;
      if (!lot.originalEta) patch.originalEta = eta;
    }
    if (edits.vendorId && edits.vendorId !== lot.vendorId) {
      patch.vendorId = edits.vendorId;
      changes.push("vendor corrected");
    }
    const [updated] = await x.update(catchLot).set(patch).where(eq(catchLot.id, lotId)).returning();
    await audit(x, ctx, {
      action: "LOT_CONFIRMED",
      entityType: "catch_lot",
      entityId: lotId,
      summary: `Confirmed ${lot.confirmation === "DRAFT" ? "draft " : ""}lot ${lot.lotNumber}${changes.length ? ` (${changes.join("; ")})` : ""}.`,
      before: { confirmation: lot.confirmation, speciesId: lot.speciesId, quantityDeclaredKg: lot.quantityDeclaredKg },
      after: { confirmation: "CONFIRMED", speciesId: updated.speciesId, quantityDeclaredKg: updated.quantityDeclaredKg },
      relatedIds: [lot.vendorId ?? ""].filter(Boolean),
    });
    await emit(x, ctx.orgId, "CATCH_DECLARED", { lotId, marketDate: lot.marketDate, speciesId: updated.speciesId }, { at: nowOf(ctx) });
    return updated;
  });
}

/** Species Normalisation Agent learning: remember supplier wording that a human has mapped. */
export async function learnAlias(x: Executor, ctx: Ctx, speciesId: string, supplierName: string) {
  const norm = normaliseName(supplierName);
  if (!norm || norm.length < 2) return;
  const [existing] = await x.select().from(speciesAlias).where(and(eq(speciesAlias.orgId, ctx.orgId), eq(speciesAlias.normalised, norm)));
  if (existing) {
    await x.update(speciesAlias).set({ useCount: sql`${speciesAlias.useCount} + 1` }).where(eq(speciesAlias.id, existing.id));
    return;
  }
  const [sp] = await x.select({ canonicalName: species.canonicalName }).from(species).where(eq(species.id, speciesId));
  if (sp && normaliseName(sp.canonicalName) === norm) return;
  const [a] = await x
    .insert(speciesAlias)
    .values({ orgId: ctx.orgId, speciesId, alias: supplierName.trim(), normalised: norm, language: "OTHER", source: "LEARNED", useCount: 1, confirmedBy: ctx.actor.label })
    .returning({ id: speciesAlias.id });
  await audit(x, ctx, { action: "ALIAS_LEARNED", entityType: "species", entityId: speciesId, summary: `Learned alias “${supplierName.trim()}” → ${sp?.canonicalName}.`, relatedIds: [a.id] });
}

export async function updateEta(ctx: Ctx, lotId: string, etaLocal: string, reason?: string) {
  return db.transaction(async (x) => {
    const lot = await lockLot(x, ctx, lotId);
    const eta = atMarketTime(lot.marketDate, etaLocal);
    const [u] = await x.update(catchLot).set({ expectedArrivalAt: eta, originalEta: lot.originalEta ?? lot.expectedArrivalAt ?? eta }).where(eq(catchLot.id, lotId)).returning();
    await audit(x, ctx, {
      action: "ETA_UPDATED",
      entityType: "catch_lot",
      entityId: lotId,
      summary: `ETA changed from ${fmtTime(lot.expectedArrivalAt)} to ${fmtTime(eta)}${reason ? ` — ${reason}` : ""}.`,
      before: { expectedArrivalAt: lot.expectedArrivalAt },
      after: { expectedArrivalAt: eta },
    });
    await emit(x, ctx.orgId, "VESSEL_ETA_UPDATED", { lotId, from: lot.expectedArrivalAt, to: eta }, { at: nowOf(ctx) });
    return u;
  });
}

export async function markLanded(ctx: Ctx, lotId: string) {
  return db.transaction(async (x) => {
    const lot = await lockLot(x, ctx, lotId);
    if (lot.status !== "EXPECTED") throw new DomainError(`Lot is ${lot.status}`);
    const [u] = await x.update(catchLot).set({ status: "LANDED", landingTime: nowOf(ctx) }).where(eq(catchLot.id, lotId)).returning();
    await audit(x, ctx, { action: "LOT_LANDED", entityType: "catch_lot", entityId: lotId, summary: `${lot.lotNumber} landed at ${lot.landingLocation ?? "port"}.` });
    return u;
  });
}

/**
 * Transform a lot (e.g. 100 kg whole → 40 whole + 30 cleaned + 20 fillets + 10 waste). Creates child lots
 * with parent/root links, transformation records and balanced inventory movements. Transactional.
 */
export async function transformLot(
  ctx: Ctx,
  parentId: string,
  outputs: { processingState: Lot["processingState"]; kg: number; type: "GUT" | "CLEAN" | "FILLET" | "PORTION" | "FREEZE" | "SPLIT" }[],
  wasteKg: number,
) {
  return db.transaction(async (x) => {
    const parent = await lockLot(x, ctx, parentId);
    const avail = D(parent.quantityAvailableKg);
    const total = outputs.reduce((a, o) => a.plus(D(o.kg)), D(wasteKg));
    if (outputs.some((o) => o.kg <= 0) || wasteKg < 0) throw new DomainError("Quantities must be positive.");
    if (total.gt(avail)) throw new DomainError(`Outputs (${total.toFixed(1)} kg) exceed available ${avail.toFixed(1)} kg.`, "NEGATIVE_INVENTORY");
    const children: Lot[] = [];
    let i = 0;
    for (const o of outputs) {
      i++;
      const [child] = await x
        .insert(catchLot)
        .values({
          ...pickInherit(parent),
          orgId: ctx.orgId,
          lotNumber: `${parent.lotNumber}-${String.fromCharCode(64 + i)}${await childSuffix(x, parent.id)}`,
          parentLotId: parent.id,
          rootLotId: parent.rootLotId ?? parent.id,
          processingState: o.processingState,
          quantityDeclaredKg: toKgStr(o.kg),
          quantityReceivedKg: toKgStr(o.kg),
          quantityAvailableKg: toKgStr(o.kg),
          quantityAllocatedKg: "0",
          status: "AVAILABLE",
          confirmation: "CONFIRMED",
          createdBy: ctx.actor.label,
          createdAt: nowOf(ctx),
        })
        .returning();
      children.push(child);
      await x.insert(lotTransformation).values({ orgId: ctx.orgId, parentLotId: parent.id, childLotId: child.id, transformationType: o.type, inputKg: toKgStr(o.kg), outputKg: toKgStr(o.kg), performedBy: ctx.actor.label, at: nowOf(ctx) });
      await x.insert(inventoryMovement).values({ orgId: ctx.orgId, lotId: child.id, type: "TRANSFORM_IN", quantityKg: toKgStr(o.kg), availableAfterKg: toKgStr(o.kg), refType: "lot", refId: parent.id, actor: ctx.actor.label, at: nowOf(ctx) });
    }
    if (wasteKg > 0) {
      await x.insert(lotTransformation).values({ orgId: ctx.orgId, parentLotId: parent.id, childLotId: null, transformationType: "WASTE", inputKg: toKgStr(wasteKg), outputKg: "0", performedBy: ctx.actor.label, at: nowOf(ctx) });
    }
    const left = avail.minus(total);
    await x.insert(inventoryMovement).values({ orgId: ctx.orgId, lotId: parent.id, type: "TRANSFORM_OUT", quantityKg: toKgStr(total.neg()), availableAfterKg: toKgStr(left), refType: "transformation", actor: ctx.actor.label, at: nowOf(ctx) });
    await x
      .update(catchLot)
      .set({ quantityAvailableKg: toKgStr(left), status: left.isZero() && D(parent.quantityAllocatedKg).isZero() ? "CLOSED" : parent.status })
      .where(eq(catchLot.id, parent.id));
    await audit(x, ctx, {
      action: "LOT_TRANSFORMED",
      entityType: "catch_lot",
      entityId: parent.id,
      summary: `Processed ${total.toFixed(1)} kg of ${parent.lotNumber} into ${children.map((c) => `${c.lotNumber} (${c.processingState.toLowerCase()} ${D(c.quantityAvailableKg).toFixed(1)} kg)`).join(", ")}${wasteKg > 0 ? ` + ${wasteKg} kg waste` : ""}.`,
      relatedIds: children.map((c) => c.id),
    });
    return children;
  });
}

async function childSuffix(x: Executor, parentId: string) {
  const r = await x.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM catch_lot WHERE parent_lot_id = ${parentId}`);
  const n = Number(r.rows[0].n);
  return n >= 26 ? String(n) : "";
}

function pickInherit(p: Lot) {
  return {
    marketDate: p.marketDate,
    vendorId: p.vendorId,
    vesselId: p.vesselId,
    farmId: p.farmId,
    sourceCountry: p.sourceCountry,
    sourceLocation: p.sourceLocation,
    landingLocation: p.landingLocation,
    catchDate: p.catchDate,
    harvestDate: p.harvestDate,
    landingTime: p.landingTime,
    receivedTime: p.receivedTime,
    speciesId: p.speciesId,
    supplierSpeciesName: p.supplierSpeciesName,
    canonicalSpeciesName: p.canonicalSpeciesName,
    localName: p.localName,
    scientificName: p.scientificName,
    sizeMinKg: p.sizeMinKg,
    sizeMaxKg: p.sizeMaxKg,
    sizeGrade: p.sizeGrade,
    qualityGrade: p.qualityGrade,
    freshOrFrozen: p.freshOrFrozen,
    temperatureAtReceivingC: p.temperatureAtReceivingC,
    agreedCostPerKg: p.agreedCostPerKg,
    askingPricePerKg: p.askingPricePerKg,
    currency: p.currency,
    compliance: p.compliance,
    locationId: p.locationId,
  };
}

export async function findLotByNumberOrId(orgId: string, ref: string) {
  const r = ref.trim();
  const isUuid = /^[0-9a-f-]{36}$/i.test(r);
  // NOTE: the OR is parenthesised so it can never escape the tenant filter.
  const rows = await db
    .select()
    .from(catchLot)
    .where(and(eq(catchLot.orgId, orgId), isUuid ? eq(catchLot.id, r) : sql`(upper(${catchLot.lotNumber}) = upper(${r}) OR upper(${catchLot.lotNumber}) LIKE upper(${"%" + r.replace(/^LOT-?/i, "").replace(/[%_]/g, "")}))`))
    .orderBy(sql`(upper(${catchLot.lotNumber}) = upper(${r})) DESC`, desc(catchLot.marketDate), asc(catchLot.lotNumber))
    .limit(1);
  return rows[0] ?? null;
}
