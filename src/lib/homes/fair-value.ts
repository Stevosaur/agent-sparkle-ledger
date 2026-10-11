import { quantileSorted } from "@/lib/stats-math";
import type { FairValueRange } from "./types";

/**
 * Fair-value range maths (pure). The range is the interquartile range (25th to 75th percentile) of
 * comparable records, so half of recent comparable deals fell inside it; the mid point is the median.
 * See fair-value-data.ts for which records are used.
 */

/** Minimum records for a block / project range, and for the wider town / district fallback. */
export const MIN_LOCAL_SAMPLE = 3;
export const MIN_WIDE_SAMPLE = 5;

export interface Quartiles {
  q1: number;
  median: number;
  q3: number;
  n: number;
}

export function quartiles(values: readonly number[]): Quartiles | null {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  return { q1: quantileSorted(clean, 0.25), median: quantileSorted(clean, 0.5), q3: quantileSorted(clean, 0.75), n: clean.length };
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Rounding step for a price: S$1,000 for sale prices, S$10 for monthly rents. */
export function stepFor(basis: "sale" | "rent"): number {
  return basis === "sale" ? 1000 : 10;
}

/** Range from comparable prices (or rents), or null with fewer than `minSample` records. */
export function rangeFromPrices(prices: readonly number[], basis: "sale" | "rent", minSample: number): { low: number; mid: number; high: number; n: number } | null {
  const q = quartiles(prices);
  if (!q || q.n < minSample) return null;
  const step = stepFor(basis);
  return { low: roundTo(q.q1, step), mid: roundTo(q.median, step), high: roundTo(q.q3, step), n: q.n };
}

/** Range from comparable psf values applied to a floor area (sqft), or null with too few records. */
export function rangeFromPsf(psfs: readonly number[], areaSqft: number, minSample: number): { low: number; mid: number; high: number; psf: { low: number; mid: number; high: number }; n: number } | null {
  if (!(areaSqft > 0)) return null;
  const q = quartiles(psfs);
  if (!q || q.n < minSample) return null;
  return {
    low: roundTo(q.q1 * areaSqft, 1000),
    mid: roundTo(q.median * areaSqft, 1000),
    high: roundTo(q.q3 * areaSqft, 1000),
    psf: { low: Math.round(q.q1), mid: Math.round(q.median), high: Math.round(q.q3) },
    n: q.n,
  };
}

export function positionInRange(asking: number, range: Pick<FairValueRange, "low" | "high">): "below" | "within" | "above" {
  if (asking < range.low) return "below";
  if (asking > range.high) return "above";
  return "within";
}

/** Where `value` sits along [min, max] as a 0-100 percentage (clamped), for the range bar. */
export function percentAlong(value: number, min: number, max: number): number {
  if (!(max > min)) return 50;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}
