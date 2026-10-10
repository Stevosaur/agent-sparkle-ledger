import { describe, expect, it } from "vitest";
import { amortisationSchedule, balanceAfter, interestPaidOver, monthlyPayment, principalFromPayment, refinanceSavings, totalInterest } from "./mortgage";

/** |actual − expected| within half a cent */
const expectCents = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.005);

/**
 * Independent closed form for the instalment, written differently from the module ((1+r)^n via exp/log1p and the
 * "P·r·g/(g−1)" arrangement), so a transcription error in either would show.
 */
function closedFormInstalment(P: number, ratePct: number, years: number): number {
  const r = ratePct / 1200;
  const g = Math.exp(years * 12 * Math.log1p(r)); // (1 + r)^n
  return (P * r * g) / (g - 1);
}

describe("annuity factors (loan-rules.md §7, computed there with 40-digit decimals)", () => {
  // [rate %, years, (1+r)^n, PV factor]
  const table: [number, number, number, number][] = [
    [4, 20, 2.222582, 165.021858],
    [4, 25, 2.713765, 189.452483],
    [4, 30, 3.313498, 209.46124],
    [4, 35, 4.04577, 225.848475],
    [3, 25, 2.11502, 210.876453],
    [2.6, 25, 1.914194, 220.424777],
  ];
  it.each(table)("%f%% over %i years: PV factor %f", (rate, years, growth, factor) => {
    expect(Math.exp(years * 12 * Math.log1p(rate / 1200))).toBeCloseTo(growth, 6);
    // principal serviced by $1/month = the PV factor
    expect(principalFromPayment(1, rate, years)).toBeCloseTo(factor, 5);
    // and $1 of principal costs 1/factor a month
    expect(monthlyPayment(1, rate, years)).toBeCloseTo(1 / factor, 9);
  });
});

describe("monthlyPayment / principalFromPayment", () => {
  it("S$500,000 at 2.6% over 25 years = S$2,268.35 a month (closed form; 500,000 / 220.4247771 = 2,268.3475)", () => {
    const pmt = monthlyPayment(500_000, 2.6, 25);
    expect(pmt).toBeCloseTo(closedFormInstalment(500_000, 2.6, 25), 8);
    expectCents(pmt, 2_268.3475);
    expect(Math.round(pmt * 100) / 100).toBe(2_268.35);
  });

  it("loan-rules.md worked instalments: $525,000 @4%/25y = 2,771.14; $450,000 @2.6%/25y = 2,041.51; @3% = 2,133.95", () => {
    expectCents(monthlyPayment(525_000, 4, 25), 2_771.1434);
    expectCents(monthlyPayment(450_000, 2.6, 25), 2_041.5128);
    expectCents(monthlyPayment(450_000, 3, 25), 2_133.9509);
  });

  it("principalFromPayment inverts monthlyPayment", () => {
    for (const [P, rate, years] of [
      [500_000, 2.6, 25],
      [1_234_567, 4, 35],
      [80_000, 0.5, 5],
      [300_000, 0, 20],
    ]) {
      expect(principalFromPayment(monthlyPayment(P, rate, years), rate, years)).toBeCloseTo(P, 6);
    }
  });

  it("zero rate divides evenly; non-positive inputs give 0", () => {
    expect(monthlyPayment(120_000, 0, 10)).toBe(1_000);
    expect(principalFromPayment(1_000, 0, 10)).toBe(120_000);
    expect(monthlyPayment(0, 3, 25)).toBe(0);
    expect(monthlyPayment(100_000, 3, 0)).toBe(0);
    expect(principalFromPayment(-1, 3, 25)).toBe(0);
  });
});

describe("amortisation", () => {
  const P = 500_000;
  const rate = 2.6;
  const years = 25;
  const r = rate / 1200;
  const pmt = closedFormInstalment(P, rate, years);
  /** closed-form balance after k payments: P·g − pmt·(g − 1)/r with g = (1 + r)^k */
  const bal = (k: number) => {
    const g = Math.exp(k * Math.log1p(r));
    return P * g - (pmt * (g - 1)) / r;
  };

  it("schedule has 25 rows, repays exactly the principal and ends at 0", () => {
    const s = amortisationSchedule(P, rate, years);
    expect(s).toHaveLength(25);
    expect(s.reduce((t, y) => t + y.principal, 0)).toBeCloseTo(P, 6);
    expect(s[24].balance).toBe(0);
    expect(s.map((y) => y.year)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("each year's balance, interest and principal match the closed form", () => {
    const s = amortisationSchedule(P, rate, years);
    for (const y of [1, 5, 10, 24]) {
      const k = y * 12;
      expect(s[y - 1].balance).toBeCloseTo(bal(k), 4);
      expect(s[y - 1].principal).toBeCloseTo(bal(k - 12) - bal(k), 4);
      // interest = payments − principal repaid
      expect(s[y - 1].interest).toBeCloseTo(12 * pmt - (bal(k - 12) - bal(k)), 4);
      expect(s[y - 1].payment).toBeCloseTo(12 * pmt, 4);
    }
    // first month's interest is P·r: year 1 interest exceeds 11 × that and is below 12 ×
    expect(s[0].interest).toBeLessThan(12 * P * r);
  });

  it("totalInterest = n × instalment − principal = sum of scheduled interest", () => {
    const total = 300 * pmt - P;
    expect(totalInterest(P, rate, years)).toBeCloseTo(total, 6);
    expect(amortisationSchedule(P, rate, years).reduce((t, y) => t + y.interest, 0)).toBeCloseTo(total, 4);
  });

  it("balanceAfter / interestPaidOver match the closed form and clamp at the tenure", () => {
    expect(balanceAfter(P, rate, years, 60)).toBeCloseTo(bal(60), 6);
    expect(interestPaidOver(P, rate, years, 60)).toBeCloseTo(60 * pmt - (P - bal(60)), 6);
    expect(balanceAfter(P, rate, years, 0)).toBe(P);
    expect(balanceAfter(P, rate, years, 400)).toBe(0);
    expect(interestPaidOver(P, rate, years, 400)).toBeCloseTo(300 * pmt - P, 6);
    expect(interestPaidOver(0, rate, years, 12)).toBe(0);
  });

  it("a fractional tenure gives a short final row", () => {
    const s = amortisationSchedule(100_000, 3, 2.5);
    expect(s).toHaveLength(3);
    expect(s[2].balance).toBe(0);
    expect(s[2].payment).toBeCloseTo(6 * monthlyPayment(100_000, 3, 2.5), 6);
  });
});

describe("refinanceSavings", () => {
  it("instalment saving and interest saving over 3 years, net of fees", () => {
    const res = refinanceSavings(600_000, 4, 3, 20, 2_000);
    const cur = closedFormInstalment(600_000, 4, 20);
    const nxt = closedFormInstalment(600_000, 3, 20);
    expect(res.monthlySaving).toBeCloseTo(cur - nxt, 8);
    expect(res.savingOverHorizon).toBeCloseTo((cur - nxt) * 36 - 2_000, 6);
    // the cheaper loan also repays more principal, so the interest saved exceeds the instalment saving
    expect(res.interestSavedOverHorizon).toBeGreaterThan(res.savingOverHorizon);
    expect(res.interestSavedOverHorizon).toBeCloseTo(interestPaidOver(600_000, 4, 20, 36) - interestPaidOver(600_000, 3, 20, 36) - 2_000, 6);
    expect(res.horizonYears).toBe(3);
  });
});
