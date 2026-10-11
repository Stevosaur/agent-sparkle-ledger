/**
 * Pure helpers for windowed statistics, bands and captions. No data-layer imports, so everything
 * here is unit-testable with plain inputs.
 */
import { median } from "@/lib/stats-math";
import { monthLabel } from "@/lib/data/months";
import type { WindowStat } from "./types";

/** Inclusive month-index window. */
export interface MonthWindow {
  from: number;
  to: number;
}

/**
 * The three comparison windows used across rankings and insights, relative to the latest month L:
 *  cur    = the 12 months to L
 *  prev12 = the 12 months before that
 *  prev5y = the 12 months ending five years (60 months) before L
 */
export function comparisonWindows(latest: number): { cur: MonthWindow; prev12: MonthWindow; prev5y: MonthWindow } {
  return {
    cur: { from: latest - 11, to: latest },
    prev12: { from: latest - 23, to: latest - 12 },
    prev5y: { from: latest - 71, to: latest - 60 },
  };
}

export function inWindow(m: number, w: MonthWindow): boolean {
  return m >= w.from && m <= w.to;
}

/** Collects prices and psf values, then summarises them as a WindowStat. */
export class WindowAcc {
  prices: number[] = [];
  psfs: number[] = [];
  add(price: number, psf: number): void {
    this.prices.push(price);
    if (psf > 0 && Number.isFinite(psf)) this.psfs.push(psf);
  }
  get count(): number {
    return this.prices.length;
  }
  stat(): WindowStat {
    return {
      count: this.prices.length,
      medianPrice: this.prices.length ? Math.round(median(this.prices)) : null,
      medianPsf: this.psfs.length ? Math.round(median(this.psfs)) : null,
    };
  }
}

/** Get-or-create for Map-based accumulators. */
export function upsert<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  let v = map.get(key);
  if (v === undefined) {
    v = make();
    map.set(key, v);
  }
  return v;
}

/** Relative change b vs a (0.05 = +5%); null when either side is missing or a is not positive. */
export function pctChange(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !(a > 0) || !Number.isFinite(b)) return null;
  return b / a - 1;
}

/** Compound annual growth; null when undefined. */
export function annualised(from: number | null | undefined, to: number | null | undefined, years: number): number | null {
  if (from == null || to == null || !(from > 0) || !(to > 0) || !(years > 0)) return null;
  return Math.pow(to / from, 1 / years) - 1;
}

/* ------------------------------------------------------------------ */
/* Bands                                                               */
/* ------------------------------------------------------------------ */

export const LEASE_BANDS = [
  { id: "lt50", label: "Under 50 yrs", min: 0, max: 50 },
  { id: "50s", label: "50–59 yrs", min: 50, max: 60 },
  { id: "60s", label: "60–69 yrs", min: 60, max: 70 },
  { id: "70s", label: "70–79 yrs", min: 70, max: 80 },
  { id: "80s", label: "80–89 yrs", min: 80, max: 90 },
  { id: "90plus", label: "90+ yrs", min: 90, max: Infinity },
] as const;

/** Remaining lease (months) -> band id, or null when unknown. */
export function leaseBand(remainingLeaseMonths: number | null | undefined): (typeof LEASE_BANDS)[number]["id"] | null {
  if (remainingLeaseMonths == null || !Number.isFinite(remainingLeaseMonths) || remainingLeaseMonths < 0) return null;
  const years = remainingLeaseMonths / 12;
  for (const b of LEASE_BANDS) if (years >= b.min && years < b.max) return b.id;
  return null;
}

/** Storey bands by the mid-point of HDB's storey range: low 1–6, mid 7–15, high 16+. */
export const STOREY_BANDS = [
  { id: "low", label: "Low (storeys 1–6)", min: 0, max: 6.99 },
  { id: "mid", label: "Mid (storeys 7–15)", min: 7, max: 15.99 },
  { id: "high", label: "High (storey 16+)", min: 16, max: Infinity },
] as const;

export function storeyBand(storeyMid: number): (typeof STOREY_BANDS)[number]["id"] | null {
  if (!Number.isFinite(storeyMid) || storeyMid <= 0) return null;
  for (const b of STOREY_BANDS) if (storeyMid >= b.min && storeyMid <= b.max) return b.id;
  return null;
}

/* ------------------------------------------------------------------ */
/* Series helpers                                                      */
/* ------------------------------------------------------------------ */

export interface SeriesPointLike {
  m: number;
  count: number;
  medianPrice: number;
  medianPsf: number;
}

/** Sum of counts over a window (exact, unlike medians which cannot be combined). */
export function sumCounts(points: readonly SeriesPointLike[], w: MonthWindow): number {
  let s = 0;
  for (const p of points) if (inWindow(p.m, w)) s += p.count;
  return s;
}

/** Points from `fromMonth` onward, mapped to chart x/y. Zero / non-finite values are dropped. */
export function toChartPoints(points: readonly SeriesPointLike[], value: "medianPrice" | "medianPsf" | "count", fromMonth = -Infinity): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p.m < fromMonth) continue;
    const y = p[value];
    if (value !== "count" && !(y > 0)) continue;
    if (!Number.isFinite(y)) continue;
    out.push({ x: p.m, y });
  }
  return out.sort((a, b) => a.x - b.x);
}

/** "the 12 months to Aug 2026" style label for a window ending at month index `to`. */
export function windowLabel(to: number): string {
  const [y, m] = monthLabel(to).split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `the 12 months to ${names[Number(m) - 1]} ${y}`;
}

/** Highest and lowest entries by value (ties keep input order). */
export function extremes<T>(items: readonly T[], value: (t: T) => number): { max: T; min: T } | null {
  if (items.length === 0) return null;
  let max = items[0];
  let min = items[0];
  for (const it of items) {
    if (value(it) > value(max)) max = it;
    if (value(it) < value(min)) min = it;
  }
  return { max, min };
}

/** "up 4.2%" / "down 1.0%" / "unchanged" */
export function describeChange(change: number | null, digits = 1): string | null {
  if (change == null || !Number.isFinite(change)) return null;
  const pct = Math.abs(change * 100).toFixed(digits);
  if (Number(pct) === 0) return "unchanged";
  return change > 0 ? `up ${pct}%` : `down ${pct}%`;
}
