/**
 * Pricing intelligence computed only from platform data (quotes, POs, sales). Never fabricated.
 */
export type PricePoint = { at: Date | string; pricePerKg: number; quantityKg: number };

export type PriceStats = {
  count: number;
  weightedAvg: number | null;
  min: number | null;
  max: number | null;
  totalKg: number;
  trendPctPerWeek: number | null;
};

export function priceStats(points: PricePoint[]): PriceStats {
  const pts = points.filter((p) => p.quantityKg > 0 && p.pricePerKg > 0);
  if (!pts.length) return { count: 0, weightedAvg: null, min: null, max: null, totalKg: 0, trendPctPerWeek: null };
  const totalKg = pts.reduce((a, p) => a + p.quantityKg, 0);
  const wavg = pts.reduce((a, p) => a + p.pricePerKg * p.quantityKg, 0) / totalKg;
  // Least-squares slope of price over time, expressed as % of average per week.
  let trend: number | null = null;
  if (pts.length >= 4) {
    const xs = pts.map((p) => new Date(p.at).getTime() / 86400000);
    const ys = pts.map((p) => p.pricePerKg);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
    const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    if (den > 0) trend = Math.round(((num / den) * 7 * 100 * 10) / my) / 10;
  }
  return {
    count: pts.length,
    weightedAvg: Math.round(wavg * 100) / 100,
    min: Math.min(...pts.map((p) => p.pricePerKg)),
    max: Math.max(...pts.map((p) => p.pricePerKg)),
    totalKg: Math.round(totalKg * 10) / 10,
    trendPctPerWeek: trend,
  };
}

/** Percent difference of a price from a reference average, e.g. +11.2 means 11.2% above. */
export function pctVsAverage(price: number, avg: number | null): number | null {
  if (!avg) return null;
  return Math.round(((price - avg) / avg) * 1000) / 10;
}

/** A price is a "spike" if it is more than `thresholdPct` above the 30-day weighted average. */
export const isPriceSpike = (price: number, avg30: number | null, thresholdPct = 10) => {
  const p = pctVsAverage(price, avg30);
  return p !== null && p >= thresholdPct;
};
