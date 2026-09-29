import { describe, expect, it } from "vitest";
import { forecastDemand, forecastAccuracyPct } from "@/lib/domain/forecast";
import { addDays } from "@/lib/domain/time";

function history(target: string, fn: (daysAgo: number, date: string) => number, days = 56) {
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(target, -(i + 1));
    return { date: d, kg: fn(i + 1, d) };
  });
}

describe("demand forecast", () => {
  const target = "2026-09-30"; // Wednesday

  it("uses the last four same-weekday observations", () => {
    const h = history(target, (ago) => (ago % 7 === 0 ? [36, 38, 40, 42][ago / 7 - 1] ?? 30 : 20));
    const f = forecastDemand({ targetDate: target, history: h });
    expect(f.components.method).toBe("SAME_WEEKDAY");
    expect(f.components.sameWeekdayAvgKg).toBe(39);
    expect(f.reasons[0]).toContain("Last 4 Wednesdays averaged 39.0 kg");
    expect(f.lowKg).toBeLessThan(f.forecastKg);
    expect(f.highKg).toBeGreaterThan(f.forecastKg);
  });

  it("applies a damped, capped trend adjustment", () => {
    const h = history(target, (ago) => (ago <= 14 ? 22 : 20));
    const f = forecastDemand({ targetDate: target, history: h });
    expect(f.components.trendPct).toBe(10);
    expect(f.components.trendAdjPct).toBe(5);
    expect(f.forecastKg).toBe(22.1); // same-weekday avg (22,22,20,20) × 1.05
  });

  it("subtracts current stock from the purchase recommendation", () => {
    const h = history(target, () => 40);
    const f = forecastDemand({ targetDate: target, history: h, currentStockKg: 3 });
    expect(f.forecastKg).toBe(40);
    expect(f.recommendedPurchaseKg).toBe(37);
    expect(f.reasons.join(" ")).toContain("Current stock is 3.0 kg");
  });

  it("reduces forecast when wastage is high", () => {
    const h = history(target, () => 40);
    const f = forecastDemand({ targetDate: target, history: h, recentWastagePct: 15 });
    expect(f.components.wastageAdjPct).toBe(-5);
    expect(f.forecastKg).toBe(38);
  });

  it("never forecasts below standing orders", () => {
    const f = forecastDemand({ targetDate: target, history: history(target, () => 5), standingOrderKg: 25 });
    expect(f.forecastKg).toBe(25);
    expect(f.lowKg).toBeGreaterThanOrEqual(25);
  });

  it("falls back gracefully with no history", () => {
    expect(forecastDemand({ targetDate: target, history: [] }).components.method).toBe("NO_HISTORY");
    expect(forecastDemand({ targetDate: target, history: [], standingOrderKg: 10 }).forecastKg).toBe(10);
  });

  it("computes forecast accuracy", () => {
    expect(forecastAccuracyPct(42, 40)).toBe(95);
    expect(forecastAccuracyPct(0, 0)).toBe(100);
  });
});
