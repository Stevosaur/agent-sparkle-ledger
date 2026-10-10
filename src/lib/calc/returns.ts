import { cagr } from "@/lib/stats-math";
import { monthToYearFraction } from "@/lib/data/months";

export interface SaleLike {
  monthIndex: number;
  price: number;
  /** unique unit identity (unit number / address); required for repeat-sale pairs */
  unitKey: string | null;
}

export interface RepeatSalePair {
  unitKey: string;
  boughtMonth: number;
  soldMonth: number;
  boughtPrice: number;
  soldPrice: number;
  gain: number;
  gainPct: number;
  holdingYears: number;
  annualised: number;
}

/** Consecutive sales of the same unit, e.g. bought 2015 -> sold 2021. Only meaningful with unit-level data. */
export function repeatSalePairs(sales: SaleLike[]): RepeatSalePair[] {
  const byUnit = new Map<string, SaleLike[]>();
  for (const s of sales) {
    if (!s.unitKey) continue;
    const arr = byUnit.get(s.unitKey) ?? [];
    arr.push(s);
    byUnit.set(s.unitKey, arr);
  }
  const pairs: RepeatSalePair[] = [];
  for (const [unitKey, list] of byUnit) {
    list.sort((a, b) => a.monthIndex - b.monthIndex);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      if (b.monthIndex <= a.monthIndex) continue;
      const years = (b.monthIndex - a.monthIndex) / 12;
      pairs.push({
        unitKey,
        boughtMonth: a.monthIndex,
        soldMonth: b.monthIndex,
        boughtPrice: a.price,
        soldPrice: b.price,
        gain: b.price - a.price,
        gainPct: b.price / a.price - 1,
        holdingYears: years,
        annualised: cagr(a.price, b.price, years),
      });
    }
  }
  return pairs.sort((x, y) => y.soldMonth - x.soldMonth);
}

/** Growth of a monthly median series between the average of the first and last `window` months. */
export function seriesGrowth(points: { m: number; value: number }[], years: number, window = 6): { cagr: number; from: number; to: number } | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.m - b.m);
  const end = sorted[sorted.length - 1].m;
  const start = end - Math.round(years * 12);
  const avg = (lo: number, hi: number) => {
    const xs = sorted.filter((p) => p.m > lo && p.m <= hi).map((p) => p.value);
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : Number.NaN;
  };
  const to = avg(end - window, end);
  const from = avg(start - window, start);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return { cagr: cagr(from, to, years), from, to };
}

/** Gross rental yield: annual rent / price. */
export function grossYield(monthlyRent: number, price: number): number {
  return price > 0 ? (monthlyRent * 12) / price : Number.NaN;
}

export { monthToYearFraction };
