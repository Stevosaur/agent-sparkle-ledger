import { describe, expect, it } from "vitest";
import { annualised, comparisonWindows, describeChange, extremes, inWindow, leaseBand, pctChange, storeyBand, sumCounts, toChartPoints, windowLabel, WindowAcc } from "./math";
import { monthIndex } from "@/lib/data/months";

describe("comparison windows", () => {
  it("covers the latest 12 months, the 12 before, and the 12 ending five years earlier", () => {
    const L = monthIndex("2026-08");
    const w = comparisonWindows(L);
    expect(w.cur).toEqual({ from: monthIndex("2025-09"), to: L });
    expect(w.prev12).toEqual({ from: monthIndex("2024-09"), to: monthIndex("2025-08") });
    expect(w.prev5y).toEqual({ from: monthIndex("2020-09"), to: monthIndex("2021-08") });
    expect(inWindow(L - 11, w.cur)).toBe(true);
    expect(inWindow(L - 12, w.cur)).toBe(false);
  });
  it("labels a window by its last month", () => {
    expect(windowLabel(monthIndex("2026-08"))).toBe("the 12 months to Aug 2026");
  });
});

describe("WindowAcc", () => {
  it("summarises medians and ignores non-positive psf", () => {
    const acc = new WindowAcc();
    acc.add(500_000, 500);
    acc.add(700_000, 0);
    acc.add(600_000, 700);
    expect(acc.stat()).toEqual({ count: 3, medianPrice: 600_000, medianPsf: 600 });
  });
  it("returns nulls when empty", () => {
    expect(new WindowAcc().stat()).toEqual({ count: 0, medianPrice: null, medianPsf: null });
  });
});

describe("change helpers", () => {
  it("computes relative change and CAGR", () => {
    expect(pctChange(100, 110)).toBeCloseTo(0.1);
    expect(pctChange(0, 110)).toBeNull();
    expect(pctChange(null, 110)).toBeNull();
    expect(annualised(100, 200, 5)).toBeCloseTo(Math.pow(2, 1 / 5) - 1);
    expect(annualised(100, null, 5)).toBeNull();
    expect(annualised(100, 120, 0)).toBeNull();
  });
  it("describes changes in words", () => {
    expect(describeChange(0.042)).toBe("up 4.2%");
    expect(describeChange(-0.01)).toBe("down 1.0%");
    expect(describeChange(0.0001)).toBe("unchanged");
    expect(describeChange(null)).toBeNull();
  });
  it("finds extremes", () => {
    const ex = extremes([{ v: 2 }, { v: 9 }, { v: -1 }], (x) => x.v);
    expect(ex?.max.v).toBe(9);
    expect(ex?.min.v).toBe(-1);
    expect(extremes([], (x: number) => x)).toBeNull();
  });
});

describe("bands", () => {
  it("bins remaining lease in years", () => {
    expect(leaseBand(49 * 12 + 11)).toBe("lt50");
    expect(leaseBand(50 * 12)).toBe("50s");
    expect(leaseBand(69 * 12 + 6)).toBe("60s");
    expect(leaseBand(95 * 12)).toBe("90plus");
    expect(leaseBand(null)).toBeNull();
    expect(leaseBand(-5)).toBeNull();
  });
  it("bins storey mid-points", () => {
    expect(storeyBand(2)).toBe("low");
    expect(storeyBand(5)).toBe("low");
    expect(storeyBand(8)).toBe("mid");
    expect(storeyBand(14)).toBe("mid");
    expect(storeyBand(17)).toBe("high");
    expect(storeyBand(Number.NaN)).toBeNull();
  });
});

describe("series helpers", () => {
  const pts = [
    { m: 10, count: 2, medianPrice: 100, medianPsf: 0 },
    { m: 11, count: 3, medianPrice: 110, medianPsf: 50 },
    { m: 12, count: 4, medianPrice: 120, medianPsf: 60 },
  ];
  it("sums counts in a window", () => {
    expect(sumCounts(pts, { from: 11, to: 12 })).toBe(7);
  });
  it("maps to chart points, dropping zero medians but keeping zero counts", () => {
    expect(toChartPoints(pts, "medianPsf")).toEqual([
      { x: 11, y: 50 },
      { x: 12, y: 60 },
    ]);
    expect(toChartPoints(pts, "medianPrice", 11)).toEqual([
      { x: 11, y: 110 },
      { x: 12, y: 120 },
    ]);
    expect(toChartPoints([{ m: 1, count: 0, medianPrice: 0, medianPsf: 0 }], "count")).toEqual([{ x: 1, y: 0 }]);
  });
});
