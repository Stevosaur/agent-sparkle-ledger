import { describe, expect, it } from "vitest";
import { walkAwayPrice, type WalkAwayInput } from "./walk-away";

const base: WalkAwayInput = {
  price: 1_000_000,
  loanAmount: 0,
  interestRatePct: 3,
  tenureYears: 25,
  holdingYears: 5,
  buyerProfile: "SC",
  propertyCount: 1,
  agentFeePct: 0.02,
  otherCosts: 10_000,
  purchaseDate: new Date("2026-01-15"),
};

/** Closed-form interest over the first k payments: k × instalment − (P − balance_k). */
function interestOver(P: number, ratePct: number, years: number, k: number): number {
  const r = ratePct / 1200;
  const n = years * 12;
  const pmt = (P * r) / (1 - Math.pow(1 + r, -n));
  const g = Math.pow(1 + r, k);
  const balance = P * g - (pmt * (g - 1)) / r;
  return k * pmt - (P - balance);
}

describe("walk-away (break-even) price", () => {
  it("cash purchase held 5 years (no SSD): S × (1 − 2%) ≥ 1,000,000 + 24,600 BSD + 10,000 → S ≥ 1,055,714.29 → 1,056,000", () => {
    const r = walkAwayPrice(base);
    expect(r.bsd).toBe(24_600);
    expect(r.absd).toBe(0);
    expect(r.interestPaid).toBe(0);
    expect(r.ssd).toBe(0);
    expect(r.breakEven).toBe(1_056_000);
    expect(r.agentFee).toBeCloseTo(21_120, 6);
    expect(r.saleDate).toBe("2031-01-15");
    expect(r.requiredGainPct).toBeCloseTo(0.056, 12);
  });

  it("SPR, $1.5m with a $1.125m loan at 3%/30y, sold after 18 months inside SSD band 2 (12%)", () => {
    // BSD 44,600; ABSD 5% = 75,000; interest over 18 months = 49,876.63 (closed form);
    // fixed = 1,500,000 + 44,600 + 75,000 + 49,876.63 + 5,000 = 1,674,476.63.
    // Sale 1 Feb 2027 is after the 1st anniversary (1 Aug 2026) and before the 2nd → 12% SSD.
    // S × (1 − 0.02 − 0.12) ≥ 1,674,476.63 → S ≥ 1,947,065.85 → 1,948,000; SSD = 12% × 1,948,000 = 233,760.
    const r = walkAwayPrice({
      ...base,
      price: 1_500_000,
      loanAmount: 1_125_000,
      interestRatePct: 3,
      tenureYears: 30,
      holdingYears: 1.5,
      buyerProfile: "SPR",
      otherCosts: 5_000,
      purchaseDate: new Date("2025-08-01"),
    });
    expect(r.bsd).toBe(44_600);
    expect(r.absd).toBe(75_000);
    expect(r.interestPaid).toBeCloseTo(interestOver(1_125_000, 3, 30, 18), 6);
    expect(Math.round(r.interestPaid * 100) / 100).toBe(49_876.63);
    expect(r.saleDate).toBe("2027-02-01");
    expect(r.ssdHoldingYearBand).toBe(2);
    expect(r.ssdRate).toBe(0.12);
    expect(r.breakEven).toBe(1_948_000);
    expect(r.ssd).toBe(233_760);
    expect(r.ssdNearAnniversary).toBe(false);
    // the break-even really breaks even, and $1,000 less does not
    const fixed = 1_500_000 + 44_600 + 75_000 + r.interestPaid + 5_000;
    expect(r.breakEven - r.agentFee - r.ssd).toBeGreaterThanOrEqual(fixed);
    expect((r.breakEven - 1_000) * 0.86).toBeLessThan(fixed);
  });

  it("interest is counted month by month for part years (30 months, not 3 whole years)", () => {
    const r = walkAwayPrice({ ...base, price: 700_000, loanAmount: 500_000, interestRatePct: 2.6, tenureYears: 25, holdingYears: 2.5 });
    expect(r.interestPaid).toBeCloseTo(interestOver(500_000, 2.6, 25, 30), 6);
    expect(Math.round(r.interestPaid * 100) / 100).toBe(31_360.2);
  });

  it("selling exactly on the 4th anniversary: 4% under the coded convention, flagged as contested", () => {
    const r = walkAwayPrice({ ...base, holdingYears: 4, purchaseDate: new Date("2025-09-01") });
    expect(r.saleDate).toBe("2029-09-01");
    expect(r.ssdHoldingYearBand).toBe(4);
    expect(r.ssdRate).toBe(0.04);
    expect(r.ssdNearAnniversary).toBe(true);
    expect(r.ssdAlternative).toEqual({ rate: 0, total: 0, holdingYearBand: null });
  });

  it("uses the stamp-duty tables in force on the purchase date", () => {
    // 2020: BSD top rate 4% above $1m → 24,600 + 4% × 1,500,000 = 84,600; SC 2nd property ABSD 12% → 300,000
    const r = walkAwayPrice({ ...base, price: 2_500_000, propertyCount: 2, purchaseDate: new Date("2020-03-01") });
    expect(r.bsd).toBe(84_600);
    expect(r.absd).toBe(300_000);
  });

  it("month-end purchase dates clamp (31 Jan + 1 month = 28 Feb)", () => {
    expect(walkAwayPrice({ ...base, holdingYears: 1 / 12, purchaseDate: new Date("2026-01-31") }).saleDate).toBe("2026-02-28");
  });

  it("no finite break-even when the agent fee alone takes the whole price", () => {
    expect(walkAwayPrice({ ...base, agentFeePct: 1 }).breakEven).toBe(Number.POSITIVE_INFINITY);
  });
});
