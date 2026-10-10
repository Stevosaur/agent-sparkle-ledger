import { describe, expect, it } from "vitest";
import { amortisationSchedule, monthlyPayment } from "@/lib/calc/mortgage";
import { comparePackages, defaultHorizon, effectiveRate, interestOverYears, type MortgagePackageInput } from "./package-compare";

const pkg = (p: Partial<MortgagePackageInput> & Pick<MortgagePackageInput, "id">): MortgagePackageInput => ({
  name: p.id,
  kind: "fixed",
  ratePct: 3,
  lockInYears: 2,
  fees: 0,
  ...p,
});

describe("effectiveRate", () => {
  it("uses the fixed rate or 3M SORA + spread", () => {
    expect(effectiveRate({ kind: "fixed", ratePct: 2.75 }, 1.7)).toBe(2.75);
    expect(effectiveRate({ kind: "sora", ratePct: 0.3 }, 1.7)).toBeCloseTo(2.0, 10);
    expect(effectiveRate({ kind: "sora", ratePct: 0.3 }, null)).toBeNull();
    expect(effectiveRate({ kind: "fixed", ratePct: null }, 1.7)).toBeNull();
    expect(effectiveRate({ kind: "fixed", ratePct: -1 }, 1.7)).toBeNull();
  });
});

describe("interestOverYears", () => {
  it("sums the amortisation schedule's interest for the first N years", () => {
    const sched = amortisationSchedule(500_000, 3, 25);
    expect(interestOverYears(500_000, 3, 25, 2)).toBeCloseTo(sched[0].interest + sched[1].interest, 6);
  });

  it("matches the closed form over the whole tenure and is zero at 0%", () => {
    const loan = 100_000;
    const total = monthlyPayment(loan, 6, 5) * 60 - loan;
    expect(interestOverYears(loan, 6, 5, 5)).toBeCloseTo(total, 4);
    expect(interestOverYears(loan, 6, 5, 40)).toBeCloseTo(total, 4);
    expect(interestOverYears(loan, 0, 5, 3)).toBe(0);
    expect(interestOverYears(0, 3, 25, 3)).toBe(0);
  });

  it("first-year interest on a level-payment loan is just under principal × rate", () => {
    const i = interestOverYears(1_000_000, 4, 30, 1);
    expect(i).toBeLessThan(40_000);
    expect(i).toBeGreaterThan(39_000);
  });
});

describe("comparePackages", () => {
  const sora = 1.7;

  it("ranks by interest + fees over the common horizon", () => {
    const rows = comparePackages(
      600_000,
      25,
      sora,
      [pkg({ id: "fixed", kind: "fixed", ratePct: 2.6, lockInYears: 2, fees: 0 }), pkg({ id: "float", kind: "sora", ratePct: 0.6, lockInYears: 3, fees: 3000 })],
      3,
    );
    const fixed = rows.find((r) => r.id === "fixed")!;
    const float = rows.find((r) => r.id === "float")!;
    expect(float.effectiveRatePct).toBeCloseTo(2.3, 10);
    expect(fixed.interestOverHorizon).toBeCloseTo(interestOverYears(600_000, 2.6, 25, 3), 6);
    expect(float.costOverHorizon).toBeCloseTo(interestOverYears(600_000, 2.3, 25, 3) + 3000, 6);
    expect(fixed.interestOverLockIn).toBeCloseTo(interestOverYears(600_000, 2.6, 25, 2), 6);
    expect(float.rank).toBe(float.costOverHorizon < fixed.costOverHorizon ? 1 : 2);
    expect(new Set(rows.map((r) => r.rank))).toEqual(new Set([1, 2]));
    expect(fixed.monthlyPayment).toBeCloseTo(monthlyPayment(600_000, 2.6, 25), 6);
  });

  it("lets fees flip the ranking", () => {
    const cheapRate = pkg({ id: "a", ratePct: 2.0, fees: 50_000 });
    const dearRate = pkg({ id: "b", ratePct: 2.1, fees: 0 });
    const rows = comparePackages(500_000, 25, sora, [cheapRate, dearRate], 2);
    expect(rows.find((r) => r.id === "b")!.rank).toBe(1);
  });

  it("skips packages without a usable rate and floating packages when SORA is missing", () => {
    const rows = comparePackages(500_000, 25, null, [pkg({ id: "f", ratePct: 2.5 }), pkg({ id: "s", kind: "sora", ratePct: 0.5 }), pkg({ id: "x", ratePct: null })], 2);
    expect(rows.map((r) => r.id)).toEqual(["f"]);
    expect(rows[0].rank).toBe(1);
  });

  it("reports no lock-in interest when there is no lock-in and keeps input order on ties", () => {
    const rows = comparePackages(500_000, 25, sora, [pkg({ id: "one", lockInYears: 0 }), pkg({ id: "two", lockInYears: 0 })], 1);
    expect(rows[0].interestOverLockIn).toBe(0);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("returns nothing for an empty loan and defaults the horizon to the longest lock-in", () => {
    expect(comparePackages(0, 25, sora, [pkg({ id: "a" })])).toEqual([]);
    expect(defaultHorizon([{ lockInYears: 2 }, { lockInYears: 5 }])).toBe(5);
    expect(defaultHorizon([{ lockInYears: 0 }])).toBe(1);
    expect(defaultHorizon([])).toBe(1);
  });
});
