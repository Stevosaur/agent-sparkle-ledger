import { describe, expect, it } from "vitest";
import { affordability, defaultStressRatePct, type AffordabilityInput } from "./affordability";
import { monthlyPayment } from "./mortgage";

/** |actual − expected| within one cent */
const expectCents = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.01);

/** PV factors from loan-rules.md §7 (40-digit decimals): principal serviced by $1/month. */
const PV_4_25 = 189.4524829748;
const PV_4_30 = 209.4612404542;
const PV_3_25 = 210.8764533400;

const base: AffordabilityInput = {
  cash: 0,
  cpfOa: 0,
  monthlyIncome: 0,
  monthlyDebts: 0,
  age: 30,
  propertyClass: "private",
  lender: "bank",
  buyerProfile: "SC",
  propertyCount: 1,
  outstandingLoans: 0,
  tenureYears: 30,
  interestRatePct: 3,
};

describe("affordability — hand-computed scenarios", () => {
  it("1. private condo, bank loan: the TDSR loan binds and all CPF is used", () => {
    // Income 10,000, car loan 800 → TDSR room 5,500 − 800 = 4,700; stress max(4%, 3%) = 4%, 30 years.
    // Max loan = 4,700 × 209.4612405 = 984,467.83. LTV 75% (30 ≤ 30, 30 + 30 = 60 ≤ 65), min cash 5%.
    // Servicing regime once 0.75P ≥ 984,467.83 (P ≥ 1,312,623.77). With CPF exhausted:
    //   cash = BSD + (P − 984,467.83) − 300,000 = (0.04P − 15,400) + P − 1,284,467.83 ≤ 200,000
    //   → 1.04P ≤ 1,499,867.83 → P ≤ 1,442,180.61 (CPF check: D − 5%P = 385,603.75 ≥ 300,000 ✓) → S$1,442,000.
    // At 1,442,000: BSD = 0.04 × 1,442,000 − 15,400 = 42,280; D = 1,442,000 − 984,467.83 = 457,532.17;
    //   cash used = 457,532.17 − 300,000 + 42,280 = 199,812.17.
    const r = affordability({ ...base, cash: 200_000, cpfOa: 300_000, monthlyIncome: 10_000, monthlyDebts: 800 });
    expect(r.maxPrice).toBe(1_442_000);
    expectCents(r.maxServiceableLoan, 4_700 * PV_4_30);
    expectCents(r.loan, 984_467.83);
    expect(r.bsd).toBe(42_280);
    expect(r.absd).toBe(0);
    expectCents(r.downpayment, 457_532.17);
    expect(r.minCash).toBe(72_100);
    expect(r.cpfUsed).toBe(300_000);
    expectCents(r.cashUsed, 199_812.17);
    expect(r.binding).toBe("servicing");
    expect(r.loanLimitedBy).toBe("servicing");
    expect(r.fundsLimitedBy).toBe("cash-and-cpf");
    expect(r.stressRatePct).toBe(4);
    expectCents(r.monthlyPayment, monthlyPayment(r.loan, 3, 30));
  });

  it("2. HDB resale, bank loan: LTV binds and CASH (minimum cash + BSD) runs out while CPF is left", () => {
    // Income 20,000: MSR 6,000 < TDSR 11,000 → max loan 6,000 × 189.4524830 = 1,136,714.90 (4%, 25 years).
    // LTV 75% (25 ≤ 25 for HDB flats; 35 + 25 = 60 ≤ 65), min cash 5%. CPF covers the other 20% up to 400,000.
    // Cash = BSD + 5%P = (0.03P − 5,400) + 0.05P ≤ 60,000 → 0.08P ≤ 65,400 → P ≤ 817,500 → S$817,000.
    // At 817,000: loan 612,750; D 204,250; min cash 40,850; CPF 163,400; BSD 24,510 − 5,400 = 19,110;
    //   cash used = 204,250 − 163,400 + 19,110 = 59,960.
    const r = affordability({ ...base, propertyClass: "hdb", age: 35, tenureYears: 25, cash: 60_000, cpfOa: 400_000, monthlyIncome: 20_000 });
    expectCents(r.maxServiceableLoan, 6_000 * PV_4_25);
    expect(r.maxPrice).toBe(817_000);
    expect(r.loan).toBe(612_750);
    expect(r.minCash).toBe(40_850);
    expect(r.cpfUsed).toBe(163_400);
    expect(r.bsd).toBe(19_110);
    expect(r.cashUsed).toBe(59_960);
    expect(r.cpfLeft).toBe(236_600);
    expect(r.binding).toBe("ltv-funds");
    expect(r.loanLimitedBy).toBe("ltv");
    expect(r.fundsLimitedBy).toBe("cash");
  });

  it("3. HDB loan: LTV binds, no minimum-cash rule, CPF exhausted", () => {
    // Income 9,000: HDB MSR 2,700 at max(3%, 2.6%) = 3% over 25 years → 2,700 × 210.8764533 = 569,366.42.
    // LTV 75% → LTV regime while P ≤ 759,155.22. CPF pays the 25% down payment up to 150,000 (P ≤ 600,000), then cash:
    //   cash = BSD + 0.25P − 150,000 = 0.03P − 5,400 + 0.25P − 150,000 ≤ 50,000 → 0.28P ≤ 205,400 → P ≤ 733,571.43
    //   → S$733,000. Loan 549,750; D 183,250; BSD 21,990 − 5,400 = 16,590; cash used 33,250 + 16,590 = 49,840.
    const r = affordability({ ...base, propertyClass: "hdb", lender: "hdb", tenureYears: 25, cash: 50_000, cpfOa: 150_000, monthlyIncome: 9_000 });
    expectCents(r.maxServiceableLoan, 2_700 * PV_3_25);
    expect(r.maxPrice).toBe(733_000);
    expect(r.loan).toBe(549_750);
    expect(r.minCash).toBe(0);
    expect(r.cpfUsed).toBe(150_000);
    expect(r.bsd).toBe(16_590);
    expect(r.cashUsed).toBe(49_840);
    expect(r.loanLimitedBy).toBe("ltv");
    expect(r.fundsLimitedBy).toBe("cash-and-cpf");
    expect(r.stressRatePct).toBe(3);
    expect(r.tenureYears).toBe(25);
    // repayment shown at the HDB rate actually charged (2.6%), not the 3% stress rate
    expectCents(r.monthlyPayment, monthlyPayment(549_750, 2.6, 25));
  });

  it("4. HDB loan: the MSR loan binds (loan-rules.md Example C income)", () => {
    // Income 8,000: MSR loan 2,400 × 210.8764533 = 506,103.49 (Example C). Servicing regime above P = 674,804.65:
    //   cash = (0.03P − 5,400) + (P − 506,103.49) − 150,000 ≤ 50,000 → 1.03P ≤ 711,503.49 → P ≤ 690,780.09 → S$690,000.
    //   D = 690,000 − 506,103.49 = 183,896.51; BSD 20,700 − 5,400 = 15,300; cash used 33,896.51 + 15,300 = 49,196.51.
    const r = affordability({ ...base, propertyClass: "hdb", lender: "hdb", tenureYears: 25, cash: 50_000, cpfOa: 150_000, monthlyIncome: 8_000 });
    expect(r.maxPrice).toBe(690_000);
    expectCents(r.loan, 506_103.49);
    expect(r.bsd).toBe(15_300);
    expectCents(r.cashUsed, 49_196.51);
    expect(r.binding).toBe("servicing");
  });

  it("5. SPR first purchase: 5% ABSD is paid in cash on top of BSD and the minimum cash", () => {
    // Income 30,000 (servicing irrelevant), LTV 75%, min cash 5%, CPF covers 20%·P while P ≤ 1.5m:
    //   cash = BSD + ABSD + 5%P = (0.04P − 15,400) + 0.05P + 0.05P = 0.14P − 15,400 ≤ 150,000 → P ≤ 1,181,428.57
    //   (flooring the duties to the dollar moves this by < $15) → S$1,181,000.
    // At 1,181,000: BSD 47,240 − 15,400 = 31,840; ABSD 59,050; min cash 59,050; D 295,250; CPF 236,200;
    //   cash used = 295,250 − 236,200 + 31,840 + 59,050 = 149,940.
    const r = affordability({ ...base, buyerProfile: "SPR", cash: 150_000, cpfOa: 300_000, monthlyIncome: 30_000 });
    expect(r.maxPrice).toBe(1_181_000);
    expect(r.bsd).toBe(31_840);
    expect(r.absd).toBe(59_050);
    expect(r.cpfUsed).toBe(236_200);
    expect(r.cashUsed).toBe(149_940);
    expect(r.fundsLimitedBy).toBe("cash");
  });

  it("6. short lease with an HDB loan: CPF share and HDB LTV both pro-rated (UNVERIFIED formula)", () => {
    // Youngest/only buyer 40, lease 25: 40 + 25 = 65 < 95 → ratio = 25 / (95 − 40) = 5/11.
    // HDB LTV = 75% × 5/11 = 34.09%; CPF cap = 5/11 × P. Income 5,000 → MSR loan 1,500 × 210.8764533 = 316,314.68.
    // D = P(1 − 3.75/11); CPF = 5/11 P (< D and < 1,000,000) → cash = BSD + P(1 − 3.75/11 − 5/11) = BSD + 2.25P/11.
    // For P ≤ 360,000: 0.02P − 1,800 + 0.2045P ≤ 50,000 → P ≤ 230,688 → S$230,000.
    // At 230,000: loan 78,409.09; D 151,590.91; CPF 104,545.45; BSD 4,600 − 1,800 = 2,800; cash 49,845.45.
    const r = affordability({
      ...base,
      propertyClass: "hdb",
      lender: "hdb",
      age: 40,
      tenureYears: 25,
      cash: 50_000,
      cpfOa: 1_000_000,
      monthlyIncome: 5_000,
      remainingLeaseYears: 25,
      youngestBuyerAge: 40,
    });
    expect(r.ltv).toBeCloseTo(0.75 * (5 / 11), 12);
    expect(r.cpfShareOfValuationLimit).toBeCloseTo(5 / 11, 12);
    expect(r.maxPrice).toBe(230_000);
    expectCents(r.loan, 78_409.09);
    expectCents(r.cpfUsed, 104_545.45);
    expect(r.bsd).toBe(2_800);
    expectCents(r.cashUsed, 49_845.45);
    expect(r.ltvReduced).toBe(true);
    expect(r.rules).toContain("hdbLoanLtvProration");
    expect(r.rules).toContain("cpfProration");
  });

  it("7. lease under 20 years: no CPF at all", () => {
    // Cash only: cash = 25%P + BSD; for P in (360k, 1m]: 0.25P + 0.03P − 5,400 ≤ 100,000 → P ≤ 376,428.57 → S$376,000.
    // At 376,000: D 94,000; BSD 11,280 − 5,400 = 5,880; cash used 99,880.
    const r = affordability({ ...base, cash: 100_000, cpfOa: 500_000, monthlyIncome: 20_000, remainingLeaseYears: 19, youngestBuyerAge: 30 });
    expect(r.cpfShareOfValuationLimit).toBe(0);
    expect(r.cpfUsed).toBe(0);
    expect(r.maxPrice).toBe(376_000);
    expect(r.cashUsed).toBe(99_880);
  });

  it("8. age 45 with a 25-year bank loan: reduced LTV 55% and 10% minimum cash (age + tenure = 70 > 65)", () => {
    // D = 45%P; min cash 10%P; CPF covers 35%P up to 200,000 (P ≤ 571,428.57), beyond that cash:
    //   cash = (0.03P − 5,400) + 0.45P − 200,000 ≤ 200,000 → 0.48P ≤ 405,400 → P ≤ 844,583.33 → S$844,000.
    // At 844,000: loan 464,200; min cash 84,400; CPF 200,000; BSD 25,320 − 5,400 = 19,920; cash 179,800 + 19,920 = 199,720.
    const r = affordability({ ...base, age: 45, tenureYears: 25, cash: 200_000, cpfOa: 200_000, monthlyIncome: 20_000 });
    expect(r.ltv).toBe(0.55);
    expect(r.ltvReduced).toBe(true);
    expect(r.maxPrice).toBe(844_000);
    expectCents(r.loan, 464_200);
    expectCents(r.minCash, 84_400);
    expect(r.cpfUsed).toBe(200_000);
    expectCents(r.cashUsed, 199_720);
  });

  it("caps tenure before choosing the LTV tier: bank 35 years (private) / 30 (HDB); HDB loan to age 65", () => {
    const priv = affordability({ ...base, tenureYears: 40, cash: 100_000, monthlyIncome: 10_000 });
    expect(priv.tenureYears).toBe(35);
    expect(priv.ltv).toBe(0.55); // 35 > 30
    expect(affordability({ ...base, propertyClass: "hdb", tenureYears: 35, cash: 100_000, monthlyIncome: 10_000 }).tenureYears).toBe(30);
    expect(affordability({ ...base, propertyClass: "hdb", lender: "hdb", age: 60, tenureYears: 25, cash: 100_000, monthlyIncome: 10_000 }).tenureYears).toBe(5);
  });

  it("no funds → nothing affordable; more cash or income never lowers the price", () => {
    expect(affordability({ ...base, monthlyIncome: 10_000 }).maxPrice).toBe(0);
    let prev = 0;
    for (const cash of [50_000, 100_000, 200_000, 400_000, 800_000]) {
      const p = affordability({ ...base, cash, cpfOa: 100_000, monthlyIncome: 8_000 }).maxPrice;
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    prev = 0;
    for (const monthlyIncome of [2_000, 5_000, 10_000, 20_000]) {
      const p = affordability({ ...base, cash: 300_000, cpfOa: 200_000, monthlyIncome }).maxPrice;
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it("the result is always within the buyer's cash and CPF", () => {
    for (const lender of ["bank", "hdb"] as const) {
      for (const cash of [30_000, 120_000, 500_000]) {
        for (const cpfOa of [0, 80_000, 400_000]) {
          const r = affordability({ ...base, propertyClass: "hdb", lender, tenureYears: 25, cash, cpfOa, monthlyIncome: 9_000 });
          expect(r.cashUsed).toBeLessThanOrEqual(cash + 0.01);
          expect(r.cpfUsed).toBeLessThanOrEqual(cpfOa + 0.01);
          expect(r.cashUsed).toBeGreaterThanOrEqual(r.minCash + r.bsd + r.absd - 0.01);
          expect(r.loan).toBeLessThanOrEqual(r.maxServiceableLoan + 0.01);
          expect(r.loan).toBeLessThanOrEqual(r.ltv * r.maxPrice + 0.01);
        }
      }
    }
  });

  it("stress rate: max(4%, entered rate) for banks; max(3%, 2.6%) for HDB; explicit override", () => {
    expect(affordability({ ...base, interestRatePct: 4.5, cash: 100_000, monthlyIncome: 10_000 }).stressRatePct).toBe(4.5);
    expect(affordability({ ...base, interestRatePct: 2.5, cash: 100_000, monthlyIncome: 10_000 }).stressRatePct).toBe(4);
    expect(affordability({ ...base, stressRatePct: 5, cash: 100_000, monthlyIncome: 10_000 }).stressRatePct).toBe(5);
    expect(defaultStressRatePct("hdb", 1)).toBe(3);
    expect(defaultStressRatePct("bank", 3.9)).toBe(4);
  });
});
