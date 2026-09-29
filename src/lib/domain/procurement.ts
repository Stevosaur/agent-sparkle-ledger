/**
 * Procurement: supply/demand balance per species and weighted multi-criteria purchase recommendations.
 * Weights are set by the procurement manager (Settings) and every score is decomposed for explanation.
 */
export type BalanceStatus = "SHORTAGE" | "BALANCED" | "SURPLUS";

export function balanceStatus(demandKg: number, supplyKg: number, opts: { tolerancePct?: number; toleranceKg?: number } = {}) {
  const tolPct = opts.tolerancePct ?? 5;
  const tolKg = opts.toleranceKg ?? 3;
  const gap = supplyKg - demandKg;
  const tol = Math.max(tolKg, (demandKg * tolPct) / 100);
  const status: BalanceStatus = gap < -tol ? "SHORTAGE" : gap > tol ? "SURPLUS" : "BALANCED";
  return { status, gapKg: Math.round(gap * 10) / 10 };
}

export type ProcurementWeights = { price: number; reliability: number; quality: number; freshness: number; eta: number; relationship: number };
export const DEFAULT_WEIGHTS: ProcurementWeights = { price: 0.35, reliability: 0.25, quality: 0.15, freshness: 0.1, eta: 0.1, relationship: 0.05 };

export type SupplyOffer = {
  offerId: string; // lot id or quote line id
  source: "LOT" | "QUOTE";
  vendorId: string;
  vendorName: string;
  availableKg: number;
  pricePerKg: number;
  /** Historical fill rate 0–1 (received ÷ declared). */
  reliability: number;
  /** Share of recent receipts graded A, 0–1. */
  quality: number;
  /** Minutes between ETA and dispatch cut-off; negative means it arrives after cut-off. */
  etaSlackMinutes: number | null;
  /** Hours since catch/harvest; lower is fresher. */
  ageHours: number | null;
  relationshipTier: "PREFERRED" | "STANDARD" | "PROBATION";
  minOrderKg?: number | null;
  isEstimate: boolean;
};

export type ScoredOffer = SupplyOffer & { score: number; parts: Record<keyof ProcurementWeights, number> };
export type RecommendationLine = ScoredOffer & { buyKg: number; expectedKg: number; lineCost: number; reason: string };

export function scoreOffers(offers: SupplyOffer[], weights: ProcurementWeights = DEFAULT_WEIGHTS): ScoredOffer[] {
  if (!offers.length) return [];
  const minPrice = Math.min(...offers.map((o) => o.pricePerKg));
  const wSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  return offers
    .map((o) => {
      const parts = {
        price: o.pricePerKg > 0 ? minPrice / o.pricePerKg : 0,
        reliability: Math.max(0, Math.min(1, o.reliability)),
        quality: Math.max(0, Math.min(1, o.quality)),
        freshness: o.ageHours === null ? 0.6 : Math.max(0, 1 - o.ageHours / 72),
        eta: o.etaSlackMinutes === null ? 0.6 : o.etaSlackMinutes < 0 ? 0 : Math.min(1, o.etaSlackMinutes / 180),
        relationship: o.relationshipTier === "PREFERRED" ? 1 : o.relationshipTier === "STANDARD" ? 0.6 : 0.2,
      };
      const score = (Object.keys(parts) as (keyof ProcurementWeights)[]).reduce((a, k) => a + parts[k] * weights[k], 0) / wSum;
      return { ...o, score: Math.round(score * 1000) / 1000, parts };
    })
    .sort((a, b) => b.score - a.score || a.pricePerKg - b.pricePerKg);
}

/**
 * Greedy fill of the open need using the best-scoring offers. Estimated supply is discounted by the
 * vendor's historical fill rate so we don't under-buy against optimistic declarations.
 */
export function recommendPurchases(needKg: number, offers: SupplyOffer[], weights: ProcurementWeights = DEFAULT_WEIGHTS) {
  const scored = scoreOffers(offers.filter((o) => o.availableKg > 0 && (o.etaSlackMinutes === null || o.etaSlackMinutes >= 0)), weights);
  const lines: RecommendationLine[] = [];
  let remaining = needKg;
  for (const o of scored) {
    if (remaining <= 0.05) break;
    const factor = o.isEstimate ? Math.max(0.5, o.reliability) : 1;
    let buy = Math.min(o.availableKg, remaining / factor);
    if (o.minOrderKg && buy < o.minOrderKg) {
      if (o.availableKg < o.minOrderKg || o.minOrderKg > remaining * 1.5) continue;
      buy = o.minOrderKg;
    }
    buy = Math.round(buy * 10) / 10;
    const expected = Math.round(buy * factor * 10) / 10;
    remaining -= expected;
    const top = (Object.entries(o.parts) as [keyof ProcurementWeights, number][]).sort((a, b) => b[1] * weights[b[0]] - a[1] * weights[a[0]]).slice(0, 2).map(([k]) => k);
    lines.push({
      ...o,
      buyKg: buy,
      expectedKg: expected,
      lineCost: Math.round(buy * o.pricePerKg * 100) / 100,
      reason: `Score ${(o.score * 100).toFixed(0)}/100 — strongest on ${top.join(" & ")}${o.isEstimate ? `; estimated supply discounted to ${Math.round(factor * 100)}% (fill-rate history)` : ""}.`,
    });
  }
  const totalBuy = Math.round(lines.reduce((a, l) => a + l.buyKg, 0) * 10) / 10;
  const totalCost = Math.round(lines.reduce((a, l) => a + l.lineCost, 0) * 100) / 100;
  return {
    lines,
    totalBuyKg: totalBuy,
    totalCost,
    weightedAvgPrice: totalBuy > 0 ? Math.round((totalCost / totalBuy) * 100) / 100 : null,
    residualShortfallKg: Math.max(0, Math.round(remaining * 10) / 10),
  };
}
