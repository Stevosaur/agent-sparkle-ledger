/**
 * Three-way match: Purchase Order ⇄ Goods Receipt ⇄ Supplier Invoice. Decimal arithmetic throughout.
 */
import { D, money, type Decimal } from "./decimal";

export type MatchTolerance = { qtyPct: number; pricePct: number; amountAbs: number };
export const DEFAULT_TOLERANCE: MatchTolerance = { qtyPct: 1, pricePct: 0.5, amountAbs: 5 };

export type POLineIn = { poLineId: string; speciesId: string; description: string; quantityKg: string; pricePerKg: string };
export type ReceiptIn = { poLineId: string | null; speciesId: string; acceptedKg: string };
export type InvoiceLineIn = { invoiceLineId: string; poLineId: string | null; speciesId: string | null; description: string; quantityKg: string; unitPrice: string; lineTotal: string };

export type MatchLineStatus = "MATCHED" | "MATCH_WITHIN_TOLERANCE" | "EXCEPTION";

export type MatchLineResult = {
  invoiceLineId: string | null;
  poLineId: string | null;
  description: string;
  orderedKg: string;
  receivedKg: string;
  billedKg: string;
  poPrice: string;
  billedPrice: string;
  qtyVarianceKg: string;
  qtyVariancePct: number | null;
  priceVariance: string;
  priceVariancePct: number | null;
  expectedAmount: string;
  billedAmount: string;
  amountVariance: string;
  status: MatchLineStatus;
  flags: string[];
};

export type MatchResult = {
  status: MatchLineStatus;
  lines: MatchLineResult[];
  potentialOverbillingExGst: string;
  potentialOverbillingIncGst: string;
  flags: string[];
  summary: string;
};

const pctOf = (diff: Decimal, base: Decimal) => (base.isZero() ? null : diff.dividedBy(base).times(100).toDecimalPlaces(2).toNumber());

export function threeWayMatch(args: {
  poLines: POLineIn[];
  receipts: ReceiptIn[];
  invoiceLines: InvoiceLineIn[];
  invoiceSubtotal: string;
  invoiceGst: string;
  gstRatePct: string;
  tolerance?: MatchTolerance;
}): MatchResult {
  const tol = args.tolerance ?? DEFAULT_TOLERANCE;
  const received = new Map<string, Decimal>();
  for (const r of args.receipts) {
    const key = r.poLineId ?? `species:${r.speciesId}`;
    received.set(key, (received.get(key) ?? D(0)).plus(D(r.acceptedKg)));
  }
  const poById = new Map(args.poLines.map((p) => [p.poLineId, p]));
  const usedPo = new Set<string>();
  const flags: string[] = [];
  const lines: MatchLineResult[] = [];

  for (const il of args.invoiceLines) {
    let po = il.poLineId ? poById.get(il.poLineId) : undefined;
    if (!po && il.speciesId) po = args.poLines.find((p) => p.speciesId === il.speciesId && !usedPo.has(p.poLineId));
    const lf: string[] = [];
    if (!po) {
      lines.push({
        invoiceLineId: il.invoiceLineId, poLineId: null, description: il.description, orderedKg: "0", receivedKg: "0",
        billedKg: D(il.quantityKg).toFixed(3), poPrice: "0", billedPrice: D(il.unitPrice).toFixed(4), qtyVarianceKg: D(il.quantityKg).toFixed(3),
        qtyVariancePct: null, priceVariance: "0", priceVariancePct: null, expectedAmount: "0.00", billedAmount: money(il.lineTotal).toFixed(2),
        amountVariance: money(il.lineTotal).toFixed(2), status: "EXCEPTION", flags: ["Billed item not on the purchase order"],
      });
      continue;
    }
    usedPo.add(po.poLineId);
    const rec = received.get(po.poLineId) ?? received.get(`species:${po.speciesId}`) ?? D(0);
    const billedQty = D(il.quantityKg);
    const billedPrice = D(il.unitPrice);
    const poPrice = D(po.pricePerKg);
    const qtyVar = billedQty.minus(rec);
    const priceVar = billedPrice.minus(poPrice);
    const expected = money(rec.times(poPrice));
    const billed = money(il.lineTotal);
    const amountVar = billed.minus(expected);
    const computed = money(billedQty.times(billedPrice));
    if (!computed.equals(billed)) lf.push(`Line arithmetic: ${billedQty.toFixed(2)} kg × ${billedPrice.toFixed(2)} = ${computed.toFixed(2)}, invoice shows ${billed.toFixed(2)}`);
    if (qtyVar.gt(0)) lf.push(`${qtyVar.toFixed(2)} kg billed above quantity received`);
    if (qtyVar.lt(0)) lf.push(`${qtyVar.abs().toFixed(2)} kg received but not billed`);
    if (priceVar.gt(0)) lf.push(`Unit price S$${priceVar.toFixed(2)}/kg above PO`);
    if (priceVar.lt(0)) lf.push(`Unit price S$${priceVar.abs().toFixed(2)}/kg below PO`);
    if (billedQty.gt(D(po.quantityKg))) lf.push(`Billed quantity exceeds ordered quantity (${D(po.quantityKg).toFixed(2)} kg)`);

    const qPct = pctOf(qtyVar.abs(), rec);
    const pPct = pctOf(priceVar.abs(), poPrice);
    let status: MatchLineStatus;
    if (qtyVar.isZero() && priceVar.isZero() && amountVar.isZero()) status = "MATCHED";
    else if ((qPct ?? 100) <= tol.qtyPct && (pPct ?? 100) <= tol.pricePct && amountVar.abs().lte(tol.amountAbs)) status = "MATCH_WITHIN_TOLERANCE";
    else if (amountVar.lt(0) && amountVar.abs().lte(tol.amountAbs)) status = "MATCH_WITHIN_TOLERANCE"; // under-billing within tolerance
    else status = "EXCEPTION";

    lines.push({
      invoiceLineId: il.invoiceLineId,
      poLineId: po.poLineId,
      description: il.description || po.description,
      orderedKg: D(po.quantityKg).toFixed(3),
      receivedKg: rec.toFixed(3),
      billedKg: billedQty.toFixed(3),
      poPrice: poPrice.toFixed(4),
      billedPrice: billedPrice.toFixed(4),
      qtyVarianceKg: qtyVar.toFixed(3),
      qtyVariancePct: pctOf(qtyVar, rec),
      priceVariance: priceVar.toFixed(4),
      priceVariancePct: pctOf(priceVar, poPrice),
      expectedAmount: expected.toFixed(2),
      billedAmount: billed.toFixed(2),
      amountVariance: amountVar.toFixed(2),
      status,
      flags: lf,
    });
  }

  for (const p of args.poLines) {
    if (usedPo.has(p.poLineId)) continue;
    const rec = received.get(p.poLineId) ?? D(0);
    if (rec.gt(0)) flags.push(`${p.description}: ${rec.toFixed(2)} kg received but not invoiced`);
  }

  // Header arithmetic and GST.
  const lineSum = money(args.invoiceLines.reduce((a, l) => a.plus(D(l.lineTotal)), D(0)));
  if (!lineSum.equals(money(args.invoiceSubtotal))) flags.push(`Invoice subtotal ${money(args.invoiceSubtotal).toFixed(2)} ≠ sum of lines ${lineSum.toFixed(2)}`);
  const expectedGst = money(D(args.invoiceSubtotal).times(D(args.gstRatePct)).dividedBy(100));
  if (expectedGst.minus(money(args.invoiceGst)).abs().gt(0.01)) flags.push(`GST ${money(args.invoiceGst).toFixed(2)} differs from ${D(args.gstRatePct).toFixed(0)}% of subtotal (${expectedGst.toFixed(2)})`);

  const over = lines.reduce((a, l) => (D(l.amountVariance).gt(0) ? a.plus(D(l.amountVariance)) : a), D(0));
  const overInc = money(over.times(D(100).plus(D(args.gstRatePct))).dividedBy(100));
  const worst: MatchLineStatus = lines.some((l) => l.status === "EXCEPTION") || flags.some((f) => f.startsWith("Invoice subtotal") || f.startsWith("GST"))
    ? "EXCEPTION"
    : lines.some((l) => l.status === "MATCH_WITHIN_TOLERANCE")
      ? "MATCH_WITHIN_TOLERANCE"
      : "MATCHED";

  const qtyIssues = lines.filter((l) => D(l.qtyVarianceKg).gt(0));
  let summary: string;
  if (worst === "MATCHED") summary = "PO, goods receipt and invoice agree exactly.";
  else if (worst === "MATCH_WITHIN_TOLERANCE") summary = `Minor differences within tolerance (±${tol.qtyPct}% qty, ±${tol.pricePct}% price, S$${tol.amountAbs} amount).`;
  else
    summary = [
      qtyIssues.length ? `${qtyIssues.map((l) => `${D(l.qtyVarianceKg).toFixed(1)} kg`).join(" + ")} quantity discrepancy` : null,
      over.gt(0) ? `S$${money(over).toFixed(2)} potential overbilling before tax` : null,
      ...flags,
    ]
      .filter(Boolean)
      .join("; ") || "Invoice lines outside tolerance.";

  return { status: worst, lines, potentialOverbillingExGst: money(over).toFixed(2), potentialOverbillingIncGst: overInc.toFixed(2), flags, summary };
}
