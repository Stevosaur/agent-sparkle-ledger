import { cagr, median } from "@/lib/stats-math";
import { monthIndex } from "@/lib/data/months";
import type { HomeGain } from "./types";

/** Pure helpers behind the tracked-home value estimates (quarterly medians and gain vs purchase). */

/** Keep at most this many quarters (15 years) in a tracked home's series. */
export const MAX_QUARTERS = 60;

/** Quarter number since 1990 Q1 for a month index. */
export function quarterOf(monthIdx: number): number {
  return Math.floor(monthIdx / 3);
}

/** 146 -> "2026 Q3" */
export function quarterLabel(q: number): string {
  return `${1990 + Math.floor(q / 4)} Q${(q % 4) + 1}`;
}

export interface QuarterMedian {
  q: number;
  /** middle month of the quarter (month index) */
  x: number;
  median: number;
  n: number;
}

/** Median of `value` per calendar quarter, oldest first, limited to the most recent `maxQuarters`. */
export function quarterlyMedians(sales: readonly { monthIndex: number; value: number }[], maxQuarters: number = MAX_QUARTERS): QuarterMedian[] {
  const byQuarter = new Map<number, number[]>();
  for (const s of sales) {
    if (!Number.isFinite(s.monthIndex) || !(s.value > 0)) continue;
    const q = quarterOf(s.monthIndex);
    const list = byQuarter.get(q);
    if (list) list.push(s.value);
    else byQuarter.set(q, [s.value]);
  }
  return [...byQuarter.keys()]
    .sort((a, b) => a - b)
    .slice(-Math.max(1, maxQuarters))
    .map((q) => {
      const values = byQuarter.get(q)!;
      return { q, x: q * 3 + 1, median: median(values), n: values.length };
    });
}

/**
 * Gain of the latest estimate over the purchase price. `annualised` is the compound annual rate from the
 * purchase month to the estimate's month, only when at least 12 months apart.
 */
export function gainVsPurchase(latestValue: number, latestMonthIndex: number, purchasePrice: number | null, purchaseMonth: string | null): HomeGain | null {
  if (purchasePrice == null || !(purchasePrice > 0) || !(latestValue > 0)) return null;
  const amount = latestValue - purchasePrice;
  let annualised: number | null = null;
  if (purchaseMonth) {
    let held = Number.NaN;
    try {
      held = latestMonthIndex - monthIndex(purchaseMonth);
    } catch {
      held = Number.NaN;
    }
    if (held >= 12) {
      const r = cagr(purchasePrice, latestValue, held / 12);
      annualised = Number.isFinite(r) ? r : null;
    }
  }
  return { amount, pct: amount / purchasePrice, annualised };
}

/** Round a psf x area product to the nearest S$1,000 (the inputs do not support more precision). */
export function roundToThousand(v: number): number {
  return Math.round(v / 1000) * 1000;
}
