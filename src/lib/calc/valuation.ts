import { median, quantileSorted } from "@/lib/stats-math";
import type { MonthlyStat } from "@/lib/data/types";

/**
 * Comparable-sales valuation.
 * 1. Take comparable sales (same block / project first, widening to nearby) within a lookback window.
 * 2. Time-adjust each sale's psf to the latest month with a market index (monthly median psf series,
 *    smoothed over 3 months).
 * 3. Adjust for floor using `floorPremiumPerLevel` and, for HDB, for remaining lease where comparables differ.
 * 4. Estimate = median adjusted psf × target area; range = interquartile range of adjusted psf.
 */

export interface ComparableInput {
  monthIndex: number;
  price: number;
  areaSqm: number;
  /** mid floor / storey */
  floor: number | null;
  /** distance from target (m); 0 for same block/project */
  distanceM: number;
  /** remaining lease (years) at time of sale, if known */
  leaseYears?: number | null;
  label: string;
}

export interface ValuationTarget {
  areaSqm: number;
  floor: number | null;
  /** remaining lease (years) today, if known */
  leaseYears?: number | null;
}

export interface AdjustedComparable extends ComparableInput {
  psf: number;
  adjustedPsf: number;
  timeFactor: number;
  floorFactor: number;
  leaseFactor: number;
}

export interface ValuationResult {
  estimate: number;
  low: number;
  high: number;
  psf: number;
  comparables: AdjustedComparable[];
  confidence: "high" | "medium" | "low";
  asOfMonth: number;
}

const SQFT = 10.764;

/** Smoothed index value at month m (median psf of months m-1..m+1 that exist). */
export function indexAt(index: MonthlyStat[], m: number): number | null {
  const vals = index.filter((p) => Math.abs(p.m - m) <= 1 && p.medianPsf > 0).map((p) => p.medianPsf);
  if (vals.length) return median(vals);
  // nearest available month within 6 months
  let best: MonthlyStat | null = null;
  for (const p of index) if (p.medianPsf > 0 && Math.abs(p.m - m) <= 6 && (!best || Math.abs(p.m - m) < Math.abs(best.m - m))) best = p;
  return best ? best.medianPsf : null;
}

export function valueByComparables(
  target: ValuationTarget,
  comps: ComparableInput[],
  opts: { index: MonthlyStat[]; asOfMonth: number; floorPremiumPerLevel?: number; leaseValue?: (years: number) => number | null; maxComparables?: number },
): ValuationResult | null {
  const { index, asOfMonth, floorPremiumPerLevel = 0.005, leaseValue, maxComparables = 20 } = opts;
  if (!(target.areaSqm > 0)) return null;
  const base = indexAt(index, asOfMonth);
  const adjusted: AdjustedComparable[] = [];
  for (const c of comps) {
    if (!(c.areaSqm > 0) || !(c.price > 0)) continue;
    const psf = c.price / (c.areaSqm * SQFT);
    const then = indexAt(index, c.monthIndex);
    const timeFactor = base && then ? base / then : 1;
    const floorFactor = target.floor != null && c.floor != null ? 1 + (target.floor - c.floor) * floorPremiumPerLevel : 1;
    let leaseFactor = 1;
    if (leaseValue && target.leaseYears != null && c.leaseYears != null) {
      const a = leaseValue(target.leaseYears);
      const b = leaseValue(c.leaseYears);
      if (a && b) leaseFactor = a / b;
    }
    adjusted.push({ ...c, psf, adjustedPsf: psf * timeFactor * floorFactor * leaseFactor, timeFactor, floorFactor, leaseFactor });
  }
  if (adjusted.length === 0) return null;
  // prefer closest and most recent
  adjusted.sort((a, b) => a.distanceM - b.distanceM || b.monthIndex - a.monthIndex);
  const used = adjusted.slice(0, maxComparables);
  const sorted = used.map((c) => c.adjustedPsf).sort((a, b) => a - b);
  const psf = quantileSorted(sorted, 0.5);
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  const sqft = target.areaSqm * SQFT;
  const recent = used.filter((c) => asOfMonth - c.monthIndex <= 12).length;
  const sameSite = used.filter((c) => c.distanceM === 0).length;
  const spread = (q3 - q1) / psf;
  const confidence: ValuationResult["confidence"] = used.length >= 8 && recent >= 4 && sameSite >= 3 && spread < 0.15 ? "high" : used.length >= 4 && spread < 0.3 ? "medium" : "low";
  return {
    estimate: Math.round((psf * sqft) / 1000) * 1000,
    low: Math.round((q1 * sqft) / 1000) * 1000,
    high: Math.round((q3 * sqft) / 1000) * 1000,
    psf: Math.round(psf),
    comparables: used,
    confidence,
    asOfMonth,
  };
}
