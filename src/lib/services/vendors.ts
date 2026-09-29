/**
 * Agent 10 — Vendor Performance: scorecards computed from receiving records. No opaque single score.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { catchLot, goodsReceiptLine, purchaseOrderLine, quote, species, vendor, vendorDocument, vendorLicence } from "@/lib/db/schema";
import { computeVendorMetrics, metricsBySpecies, type ReceiptRecord } from "@/lib/domain/vendor-metrics";
import { addDays } from "@/lib/domain/time";

export async function vendorReceiptRecords(orgId: string, vendorId: string | null, sinceDate: string) {
  const rows = await db
    .select({ grl: goodsReceiptLine, l: catchLot, pol: purchaseOrderLine })
    .from(goodsReceiptLine)
    .innerJoin(catchLot, eq(catchLot.id, goodsReceiptLine.lotId))
    .leftJoin(purchaseOrderLine, eq(purchaseOrderLine.id, goodsReceiptLine.purchaseOrderLineId))
    .where(and(eq(goodsReceiptLine.orgId, orgId), gte(catchLot.marketDate, sinceDate), vendorId ? eq(catchLot.vendorId, vendorId) : sql`true`));
  return rows.map(({ grl, l, pol }) => ({
    vendorId: l.vendorId,
    rec: {
      speciesId: l.speciesId ?? "",
      expectedAt: grl.expectedAt,
      arrivedAt: l.receivedTime,
      declaredKg: Number(grl.declaredKg),
      orderedKg: pol ? Number(pol.quantityKg) : null,
      receivedKg: Number(grl.receivedKg),
      acceptedKg: Number(grl.acceptedKg),
      rejectedKg: Number(grl.rejectedKg),
      temperatureC: grl.temperatureC === null ? null : Number(grl.temperatureC),
      grade: grl.qualityGrade,
      quotedPrice: l.askingPricePerKg ? Number(l.askingPricePerKg) : null,
      finalPrice: pol ? Number(pol.pricePerKg) : l.agreedCostPerKg ? Number(l.agreedCostPerKg) : null,
    } satisfies ReceiptRecord,
  }));
}

export async function vendorScorecards(orgId: string, marketDate: string, days = 60) {
  const since = addDays(marketDate, -days);
  const [vs, recs, docs, resp] = await Promise.all([
    db.select().from(vendor).where(eq(vendor.orgId, orgId)),
    vendorReceiptRecords(orgId, null, since),
    db.select().from(vendorDocument).where(eq(vendorDocument.orgId, orgId)),
    db.select({ vendorId: quote.vendorId, m: quote.respondedInMinutes }).from(quote).where(eq(quote.orgId, orgId)),
  ]);
  return vs.map((v) => {
    const r = recs.filter((x) => x.vendorId === v.id).map((x) => x.rec);
    const d = docs.filter((x) => x.vendorId === v.id);
    const m = computeVendorMetrics(r, {
      responseMinutes: resp.filter((x) => x.vendorId === v.id && x.m !== null).map((x) => x.m!),
      docsRequired: d.length || undefined,
      docsValid: d.filter((x) => x.status === "VALID" || x.status === "EXPIRING").length,
    });
    return { vendor: v, metrics: m };
  });
}

export async function vendorProfile(orgId: string, vendorId: string, marketDate: string) {
  const [v] = await db.select().from(vendor).where(and(eq(vendor.id, vendorId), eq(vendor.orgId, orgId)));
  if (!v) return null;
  const since = addDays(marketDate, -90);
  const recs = (await vendorReceiptRecords(orgId, vendorId, since)).map((x) => x.rec);
  const sps = await db.select().from(species).where(eq(species.orgId, orgId));
  const docs = await db.select().from(vendorDocument).where(eq(vendorDocument.vendorId, v.id));
  const lic = await db.select().from(vendorLicence).where(eq(vendorLicence.vendorId, v.id));
  const bySp = [...metricsBySpecies(recs)].map(([speciesId, m]) => ({ species: sps.find((s) => s.id === speciesId), metrics: m })).filter((x) => x.species);
  return { vendor: v, metrics: computeVendorMetrics(recs, { docsRequired: docs.length || undefined, docsValid: docs.filter((d) => d.status === "VALID" || d.status === "EXPIRING").length }), bySpecies: bySp, docs, licences: lic };
}
