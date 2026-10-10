import { describe, expect, it } from "vitest";
import type { MonthlyStat } from "@/lib/data/types";
import { indexAt, valueByComparables, type ComparableInput } from "./valuation";
import { balaPct } from "./lease";

const SQFT = 10.7639;
const stat = (m: number, medianPsf: number): MonthlyStat => ({ m, count: 10, medianPrice: 0, medianPsf });
/** Index: 500 psf around month 100, 550 psf around month 112 */
const index = [stat(99, 500), stat(100, 500), stat(101, 500), stat(111, 550), stat(112, 550), stat(113, 550)];
const comp = (over: Partial<ComparableInput>): ComparableInput => ({
  monthIndex: 112,
  price: 500 * 100 * SQFT,
  areaSqm: 100,
  floor: 10,
  distanceM: 0,
  label: "c",
  ...over,
});

describe("indexAt", () => {
  it("3-month median around the month; falls back to the nearest month within 6", () => {
    expect(indexAt(index, 100)).toBe(500);
    expect(indexAt([stat(99, 400), stat(100, 500), stat(101, 900)], 100)).toBe(500);
    // month 106: nothing within ±1; months 101 and 111 are both 5 away — the earlier one is kept
    expect(indexAt(index, 106)).toBe(500);
    expect(indexAt(index, 119)).toBe(550); // month 113 is 6 away
    expect(indexAt(index, 120)).toBeNull(); // nearest is 7 months away
  });
});

describe("valueByComparables", () => {
  it("time-adjusts by the index ratio: a 500 psf sale at month 100 is 550 psf at month 112", () => {
    const r = valueByComparables({ areaSqm: 100, floor: 10 }, [comp({ monthIndex: 100 })], { index, asOfMonth: 112 })!;
    expect(r.comparables[0].timeFactor).toBeCloseTo(1.1, 12);
    expect(r.comparables[0].adjustedPsf).toBeCloseTo(550, 9);
    expect(r.psf).toBe(550);
    // 550 psf × 1,076.39 sqft = 592,014.5 → nearest 1,000
    expect(r.estimate).toBe(592_000);
  });

  it("floor premium 0.5% per level and the lease factor B(target) / B(comparable)", () => {
    const r = valueByComparables({ areaSqm: 100, floor: 10, leaseYears: 60 }, [comp({ floor: 5, leaseYears: 99 })], { index, asOfMonth: 112, leaseValue: balaPct })!;
    const c = r.comparables[0];
    expect(c.floorFactor).toBeCloseTo(1.025, 12);
    expect(c.leaseFactor).toBeCloseTo(80 / 96, 12);
    expect(c.adjustedPsf).toBeCloseTo(500 * 1.025 * (80 / 96), 9);
  });

  it("median and interquartile range of adjusted psf; prefers the closest, then most recent, comparables", () => {
    const comps = [400, 450, 500, 550, 600].map((psf, i) => comp({ price: psf * 100 * SQFT, label: `s${i}` }));
    const far = comp({ price: 9_999 * 100 * SQFT, distanceM: 900, label: "far" });
    const r = valueByComparables({ areaSqm: 100, floor: 10 }, [...comps, far], { index, asOfMonth: 112, maxComparables: 5 })!;
    expect(r.comparables.map((c) => c.label)).not.toContain("far");
    expect(r.psf).toBe(500);
    expect(r.low).toBe(Math.round((450 * 100 * SQFT) / 1000) * 1000);
    expect(r.high).toBe(Math.round((550 * 100 * SQFT) / 1000) * 1000);
    expect(r.confidence).toBe("medium"); // ≥ 4 comparables, IQR spread (550 − 450) / 500 = 20% < 30%
  });

  it("confidence is high with ≥ 8 comparables, ≥ 4 recent, ≥ 3 in the same block and a tight spread", () => {
    const comps = Array.from({ length: 10 }, (_, i) => comp({ price: (500 + i) * 100 * SQFT }));
    expect(valueByComparables({ areaSqm: 100, floor: 10 }, comps, { index, asOfMonth: 112 })!.confidence).toBe("high");
  });

  it("returns null without a usable target area or comparables", () => {
    expect(valueByComparables({ areaSqm: 0, floor: null }, [comp({})], { index, asOfMonth: 112 })).toBeNull();
    expect(valueByComparables({ areaSqm: 100, floor: null }, [comp({ price: 0 })], { index, asOfMonth: 112 })).toBeNull();
  });
});
