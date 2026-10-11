import { describe, expect, it } from "vitest";
import { grossYield, repeatSalePairs, seriesGrowth } from "./returns";

describe("repeat-sale pairs", () => {
  it("pairs consecutive sales of the same unit with gain, holding period and CAGR", () => {
    const pairs = repeatSalePairs([
      { monthIndex: 0, price: 500_000, unitKey: "A" },
      { monthIndex: 72, price: 800_000, unitKey: "A" },
      { monthIndex: 100, price: 900_000, unitKey: "A" },
      { monthIndex: 10, price: 1, unitKey: null },
      { monthIndex: 50, price: 600_000, unitKey: "B" },
      { monthIndex: 50, price: 610_000, unitKey: "B" }, // same month: not a pair
    ]);
    expect(pairs).toHaveLength(2);
    // newest sale first
    expect(pairs.map((p) => p.soldMonth)).toEqual([100, 72]);
    const p = pairs[1];
    expect(p).toMatchObject({ unitKey: "A", boughtMonth: 0, soldMonth: 72, gain: 300_000, holdingYears: 6 });
    expect(p.gainPct).toBeCloseTo(0.6, 12);
    expect(p.annualised).toBeCloseTo(Math.pow(1.6, 1 / 6) - 1, 12);
  });
});

describe("seriesGrowth", () => {
  it("a series growing exactly 5% a year gives a 5% CAGR (trailing-window averages)", () => {
    const points = Array.from({ length: 121 }, (_, m) => ({ m, value: 100 * Math.pow(1.05, m / 12) }));
    const g = seriesGrowth(points, 5, 6)!;
    expect(g.cagr).toBeCloseTo(0.05, 10);
    expect(g.to / g.from).toBeCloseTo(Math.pow(1.05, 5), 10);
  });

  it("null when either window has no data", () => {
    expect(seriesGrowth([], 5)).toBeNull();
    expect(seriesGrowth([{ m: 100, value: 1 }], 5)).toBeNull();
  });
});

describe("grossYield", () => {
  it("annual rent / price", () => {
    expect(grossYield(2_500, 600_000)).toBeCloseTo(0.05, 12);
    expect(grossYield(2_500, 0)).toBeNaN();
  });
});
