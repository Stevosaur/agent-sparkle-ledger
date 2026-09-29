/**
 * Vendor scorecards. Individual metrics stay visible — there is deliberately no single opaque score.
 */
export type ReceiptRecord = {
  speciesId: string;
  expectedAt: Date | string | null;
  arrivedAt: Date | string | null;
  declaredKg: number;
  orderedKg: number | null;
  receivedKg: number;
  acceptedKg: number;
  rejectedKg: number;
  temperatureC: number | null;
  tempMaxC?: number;
  grade: string | null;
  quotedPrice: number | null;
  finalPrice: number | null;
};

export type VendorMetrics = {
  receipts: number;
  onTimePct: number | null;
  fillRatePct: number | null;
  acceptedPct: number | null;
  rejectionPct: number | null;
  avgWeightVariancePct: number | null;
  avgQuotedPrice: number | null;
  avgFinalPrice: number | null;
  gradeAPct: number | null;
  qualityConsistencyPct: number | null;
  tempExceptionRatePct: number | null;
  avgResponseMinutes: number | null;
  documentCompletenessPct: number | null;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeVendorMetrics(
  recs: ReceiptRecord[],
  extra: { responseMinutes?: number[]; docsRequired?: number; docsValid?: number; lateGraceMinutes?: number } = {},
): VendorMetrics {
  const grace = extra.lateGraceMinutes ?? 30;
  const n = recs.length;
  const timed = recs.filter((r) => r.expectedAt && r.arrivedAt);
  const onTime = timed.filter((r) => new Date(r.arrivedAt!).getTime() - new Date(r.expectedAt!).getTime() <= grace * 60000).length;
  const ordered = recs.filter((r) => r.orderedKg && r.orderedKg > 0);
  const sumOrdered = ordered.reduce((a, r) => a + (r.orderedKg ?? 0), 0);
  const sumRecvOrdered = ordered.reduce((a, r) => a + r.receivedKg, 0);
  const sumRecv = recs.reduce((a, r) => a + r.receivedKg, 0);
  const sumAcc = recs.reduce((a, r) => a + r.acceptedKg, 0);
  const sumRej = recs.reduce((a, r) => a + r.rejectedKg, 0);
  const declared = recs.filter((r) => r.declaredKg > 0);
  const variance = declared.map((r) => ((r.receivedKg - r.declaredKg) / r.declaredKg) * 100);
  const q = recs.filter((r) => r.quotedPrice !== null);
  const f = recs.filter((r) => r.finalPrice !== null);
  const graded = recs.filter((r) => r.grade);
  const gradeScore = (g: string): number => (g === "A" ? 3 : g === "B" ? 2 : g === "C" ? 1 : 0);
  const gs = graded.map((r) => gradeScore(r.grade!));
  const gMean = gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : 0;
  const gSd = gs.length > 1 ? Math.sqrt(gs.reduce((a, x) => a + (x - gMean) ** 2, 0) / (gs.length - 1)) : 0;
  const temps = recs.filter((r) => r.temperatureC !== null);
  const tempEx = temps.filter((r) => r.temperatureC! > (r.tempMaxC ?? 4)).length;
  const resp = extra.responseMinutes ?? [];

  return {
    receipts: n,
    onTimePct: timed.length ? r1((onTime / timed.length) * 100) : null,
    fillRatePct: sumOrdered > 0 ? r1(Math.min(100, (sumRecvOrdered / sumOrdered) * 100)) : null,
    acceptedPct: sumRecv > 0 ? r1((sumAcc / sumRecv) * 100) : null,
    rejectionPct: sumRecv > 0 ? r1((sumRej / sumRecv) * 100) : null,
    avgWeightVariancePct: variance.length ? r1(variance.reduce((a, b) => a + b, 0) / variance.length) : null,
    avgQuotedPrice: q.length ? r2(q.reduce((a, r) => a + r.quotedPrice!, 0) / q.length) : null,
    avgFinalPrice: f.length ? r2(f.reduce((a, r) => a + r.finalPrice!, 0) / f.length) : null,
    gradeAPct: graded.length ? r1((graded.filter((r) => r.grade === "A").length / graded.length) * 100) : null,
    // 100% when every receipt is the same grade; falls as grades scatter (σ of 1.5 grade points → 0%).
    qualityConsistencyPct: graded.length > 1 ? r1(Math.max(0, 100 - (gSd / 1.5) * 100)) : graded.length ? 100 : null,
    tempExceptionRatePct: temps.length ? r1((tempEx / temps.length) * 100) : null,
    avgResponseMinutes: resp.length ? Math.round(resp.reduce((a, b) => a + b, 0) / resp.length) : null,
    documentCompletenessPct: extra.docsRequired ? r1(((extra.docsValid ?? 0) / extra.docsRequired) * 100) : null,
  };
}

export function metricsBySpecies(recs: ReceiptRecord[]): Map<string, VendorMetrics> {
  const groups = new Map<string, ReceiptRecord[]>();
  for (const r of recs) groups.set(r.speciesId, [...(groups.get(r.speciesId) ?? []), r]);
  return new Map([...groups].map(([k, v]) => [k, computeVendorMetrics(v)]));
}
