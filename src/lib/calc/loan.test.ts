import { describe, expect, it } from "vitest";
import {
  bankLoanEligibility,
  bankLtv,
  hdbLoanEligibility,
  hdbLoanLtv,
  hdbLoanLtvDetail,
  hdbLoanMaxTenure,
  incomeWeightedAverageAge,
  maxBankTenure,
  maxServiceableLoan,
  maxTenureForStandardLtv,
  msrApplies,
  outstandingLoansForJointBorrowers,
} from "./loan";

/** |actual − expected| within one cent (the research rounds to the cent) */
const expectCents = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.01);

describe("bank LTV tiers (loan-rules.md §2.1–2.2)", () => {
  it("first loan 75% / 55%, second 45% / 25%, third+ 35% / 15%, with minimum cash 5/10/25/25%", () => {
    expect(bankLtv("private", 0, 25, 30)).toEqual({ ltv: 0.75, minCashPct: 0.05, reduced: false });
    expect(bankLtv("private", 0, 35, 30)).toEqual({ ltv: 0.55, minCashPct: 0.1, reduced: true });
    expect(bankLtv("private", 1, 25, 30)).toEqual({ ltv: 0.45, minCashPct: 0.25, reduced: false });
    expect(bankLtv("private", 1, 31, 30)).toEqual({ ltv: 0.25, minCashPct: 0.25, reduced: true });
    expect(bankLtv("private", 2, 25, 30)).toEqual({ ltv: 0.35, minCashPct: 0.25, reduced: false });
    expect(bankLtv("private", 5, 31, 30)).toEqual({ ltv: 0.15, minCashPct: 0.25, reduced: true });
  });

  it("tenure threshold is 25 years for HDB flats and 30 years for everything else (incl. ECs)", () => {
    expect(bankLtv("hdb", 0, 25, 30).reduced).toBe(false);
    expect(bankLtv("hdb", 0, 26, 30).reduced).toBe(true);
    for (const c of ["private", "ec-new", "ec-resale"] as const) {
      expect(bankLtv(c, 0, 30, 30).reduced).toBe(false);
      expect(bankLtv(c, 0, 31, 30).reduced).toBe(true);
    }
  });

  it("age rule: age + tenure > 65 reduces the LTV; ending exactly at 65 does not (Example D)", () => {
    expect(bankLtv("private", 0, 20, 45).ltv).toBe(0.75); // 45 + 20 = 65
    expect(bankLtv("private", 0, 25, 45).ltv).toBe(0.55); // 45 + 25 = 70
  });

  it("max tenures and MSR scope", () => {
    expect(maxBankTenure("hdb")).toBe(30);
    expect(maxBankTenure("private")).toBe(35);
    expect(maxBankTenure("ec-new")).toBe(35);
    expect(msrApplies("hdb")).toBe(true);
    expect(msrApplies("ec-new")).toBe(true);
    expect(msrApplies("ec-resale")).toBe(false);
    expect(msrApplies("private")).toBe(false);
  });

  it("Example E: IWAA (40 × 6,000 + 30 × 4,000) / 10,000 = 36; longest standard-LTV tenure min(30, 65 − 36) = 29", () => {
    const iwaa = incomeWeightedAverageAge([
      { age: 40, monthlyIncome: 6_000 },
      { age: 30, monthlyIncome: 4_000 },
    ]);
    expect(iwaa).toBe(36);
    expect(maxTenureForStandardLtv("private", iwaa)).toBe(29);
    expect(maxTenureForStandardLtv("hdb", 30)).toBe(25);
    expect(maxTenureForStandardLtv("private", 70)).toBe(0);
    expect(incomeWeightedAverageAge([{ age: 40, monthlyIncome: 0 }])).toBeNaN();
  });

  it("joint borrowers: the borrower with the most outstanding loans decides the row (not the sum)", () => {
    expect(outstandingLoansForJointBorrowers([1, 1])).toBe(1);
    expect(outstandingLoansForJointBorrowers([0, 2])).toBe(2);
    expect(outstandingLoansForJointBorrowers([])).toBe(0);
  });
});

describe("maxServiceableLoan", () => {
  it("bank loan on a private home: TDSR only — 55% × income − debts at 4% (Example B: 4,700 → 984,467.83)", () => {
    const s = maxServiceableLoan({ monthlyIncome: 10_000, monthlyDebts: 800, propertyClass: "private", tenureYears: 30 });
    expect(s.maxInstalment).toBe(4_700);
    expect(s.binding).toBe("tdsr");
    expect(s.stressRatePct).toBe(4);
    expect(s.msrInstalmentCap).toBeNull();
    expectCents(s.maxLoan, 984_467.83);
  });

  it("bank loan on an HDB flat: MSR 30% binds below TDSR (Example A: 3,000 × 189.452483 = 568,357.45)", () => {
    const s = maxServiceableLoan({ monthlyIncome: 10_000, monthlyDebts: 0, propertyClass: "hdb", tenureYears: 25 });
    expect(s).toMatchObject({ maxInstalment: 3_000, binding: "msr", tdsrInstalmentCap: 5_500, msrInstalmentCap: 3_000 });
    expectCents(s.maxLoan, 568_357.45);
  });

  it("TDSR can bind for an HDB flat when other debts are large (TDSR 5,500 − 3,000 = 2,500 < MSR 3,000)", () => {
    const s = maxServiceableLoan({ monthlyIncome: 10_000, monthlyDebts: 3_000, propertyClass: "ec-new", tenureYears: 25 });
    expect(s.binding).toBe("tdsr");
    expect(s.maxInstalment).toBe(2_500);
  });

  it("MSR counts existing property-loan instalments; TDSR counts all debts", () => {
    const s = maxServiceableLoan({ monthlyIncome: 10_000, monthlyDebts: 1_000, monthlyPropertyLoanInstalments: 1_000, propertyClass: "hdb", tenureYears: 25 });
    expect(s.msrInstalmentCap).toBe(2_000); // 3,000 − 1,000
    expect(s.tdsrInstalmentCap).toBe(4_500); // 5,500 − 1,000
    expect(s.maxInstalment).toBe(2_000);
  });

  it("HDB loan: HDB's MSR at max(3%, 2.6%) = 3% (Example C: 2,400 × 210.876453 = 506,103.49); TDSR not applied", () => {
    const s = maxServiceableLoan({ monthlyIncome: 8_000, monthlyDebts: 5_000, propertyClass: "hdb", tenureYears: 25 }, "hdb");
    expect(s).toMatchObject({ maxInstalment: 2_400, binding: "msr", stressRatePct: 3, tenureYears: 25 });
    expectCents(s.maxLoan, 506_103.49);
  });

  it("stress rate is max(floor, thereafter rate); an explicit override wins", () => {
    const base = { monthlyIncome: 10_000, monthlyDebts: 0, propertyClass: "private" as const, tenureYears: 30 };
    expect(maxServiceableLoan({ ...base, thereafterRatePct: 3.2 }).stressRatePct).toBe(4);
    expect(maxServiceableLoan({ ...base, thereafterRatePct: 4.6 }).stressRatePct).toBe(4.6);
    expect(maxServiceableLoan({ ...base, stressRatePct: 3.5 }).stressRatePct).toBe(3.5);
    expect(maxServiceableLoan({ ...base, propertyClass: "hdb", thereafterRatePct: 3.4 }, "hdb").stressRatePct).toBe(3.4);
  });

  it("tenure caps: bank 30 (HDB flat) / 35; HDB loan 25 and age 65", () => {
    expect(maxServiceableLoan({ monthlyIncome: 1, monthlyDebts: 0, propertyClass: "hdb", tenureYears: 35 }).tenureYears).toBe(30);
    expect(maxServiceableLoan({ monthlyIncome: 1, monthlyDebts: 0, propertyClass: "private", tenureYears: 40 }).tenureYears).toBe(35);
    expect(maxServiceableLoan({ monthlyIncome: 1, monthlyDebts: 0, propertyClass: "hdb", tenureYears: 30 }, "hdb").tenureYears).toBe(25);
    expect(maxServiceableLoan({ monthlyIncome: 1, monthlyDebts: 0, propertyClass: "hdb", tenureYears: 25, borrowerAge: 50 }, "hdb").tenureYears).toBe(15);
    expect(hdbLoanMaxTenure(25, 70)).toBe(0);
    expect(hdbLoanMaxTenure()).toBe(25);
  });
});

describe("worked examples (loan-rules.md §7)", () => {
  it("Example A, option 1: HDB resale $700k, bank loan, 25 years, IWAA 35 → LTV 75%, max loan 525,000, min cash 35,000", () => {
    const r = bankLoanEligibility({ price: 700_000, propertyClass: "hdb", outstandingLoans: 0, tenureYears: 25, borrowerAge: 35, monthlyIncome: 10_000, monthlyDebts: 0 });
    expect(r.ltv).toBe(0.75);
    expectCents(r.servicing.maxLoan, 568_357.45);
    expect(r.ltvLoan).toBe(525_000);
    expect(r.maxLoan).toBe(525_000);
    expect(r.binding).toBe("ltv");
    expectCents(r.instalmentAtStressRate, 2_771.14); // ≤ 3,000 MSR cap
    expect(r.downpayment).toBe(175_000);
    expect(r.minCash).toBe(35_000); // the other 140,000 can be CPF or cash
  });

  it("Example A, option 2: 30-year tenure on an HDB flat → LTV 55%: 385,000; min cash 10% = 70,000", () => {
    const r = bankLoanEligibility({ price: 700_000, propertyClass: "hdb", outstandingLoans: 0, tenureYears: 30, borrowerAge: 35, monthlyIncome: 10_000, monthlyDebts: 0 });
    expectCents(r.servicing.maxLoan, 628_383.72);
    expect(r.maxLoan).toBeCloseTo(385_000, 6);
    expect(r.minCash).toBeCloseTo(70_000, 6);
    expect(r.reducedLtv).toBe(true);
  });

  it("Example B: private $1.5m, TDSR 4,700 → max loan 984,467.83 (TDSR binds); down payment 515,532.17; min cash 75,000", () => {
    const r = bankLoanEligibility({ price: 1_500_000, propertyClass: "private", outstandingLoans: 0, tenureYears: 30, borrowerAge: 30, monthlyIncome: 10_000, monthlyDebts: 800 });
    expect(r.ltvLoan).toBe(1_125_000);
    expectCents(r.maxLoan, 984_467.83);
    expect(r.binding).toBe("tdsr");
    expectCents(r.downpayment, 515_532.17);
    expect(r.minCash).toBe(75_000);
    expectCents(r.instalmentAtStressRate, 4_700);
  });

  it("Example C: HDB loan, $600k, income 8,000 → MSR loan 506,103.49, LTV 450,000 binds; 2,041.51/month at 2.6%, 2,133.95 at 3%", () => {
    const r = hdbLoanEligibility({ price: 600_000, monthlyIncome: 8_000, tenureYears: 25 });
    expectCents(r.servicing.maxLoan, 506_103.49);
    expect(r.ltvLoan).toBe(450_000);
    expect(r.maxLoan).toBe(450_000);
    expect(r.binding).toBe("ltv");
    expectCents(r.instalment, 2_041.51);
    expectCents(r.instalmentAtStressRate, 2_133.95);
    expect(r.downpayment).toBe(150_000);
  });

  it("Example D: IWAA 45 — 25 years → LTV 55%, loan min(1,041,988.66, 660,000); 20 years → 75%, min(907,620.22, 900,000)", () => {
    const base = { price: 1_200_000, propertyClass: "private" as const, outstandingLoans: 0, borrowerAge: 45, monthlyIncome: 10_000, monthlyDebts: 0 };
    const t25 = bankLoanEligibility({ ...base, tenureYears: 25 });
    expect(t25.ltv).toBe(0.55);
    expectCents(t25.servicing.maxLoan, 1_041_988.66);
    expect(t25.maxLoan).toBeCloseTo(660_000, 6);
    const t20 = bankLoanEligibility({ ...base, tenureYears: 20 });
    expect(t20.ltv).toBe(0.75);
    expectCents(t20.servicing.maxLoan, 907_620.22);
    expect(t20.maxLoan).toBe(900_000);
  });

  it("LTV is applied to the lower of price and valuation", () => {
    const r = bankLoanEligibility({ price: 1_000_000, valuation: 900_000, propertyClass: "private", outstandingLoans: 0, tenureYears: 25, borrowerAge: 30, monthlyIncome: 50_000, monthlyDebts: 0 });
    expect(r.ltvBase).toBe(900_000);
    expect(r.maxLoan).toBe(675_000);
    expect(r.downpayment).toBe(325_000);
  });
});

describe("HDB loan LTV pro-rating for short leases (loan-rules.md §3–4, formula UNVERIFIED)", () => {
  it("full 75% when the lease covers the youngest buyer to 95 (age + lease ≥ 95)", () => {
    expect(hdbLoanLtv()).toBe(0.75);
    expect(hdbLoanLtv(60, 35)).toBe(0.75); // 35 + 60 = 95
    expect(hdbLoanLtvDetail(60, 35)).toMatchObject({ prorated: false, ratio: 1, status: "verified-search" });
  });

  it("pro-rated 75% × lease / (95 − youngest age) otherwise: youngest 50, lease 40 → 75% × 40/45 = 66.67%", () => {
    const d = hdbLoanLtvDetail(40, 50);
    expect(d.prorated).toBe(true);
    expect(d.ratio).toBeCloseTo(40 / 45, 12);
    expect(d.ltv).toBeCloseTo(0.75 * (40 / 45), 12);
    expect(d.status).toBe("unverified");
  });

  it("feeds hdbLoanEligibility: youngest 50, lease 40, $400k → LTV loan 400,000 × 2/3 = 266,666.67", () => {
    const r = hdbLoanEligibility({ price: 400_000, monthlyIncome: 20_000, remainingLeaseYears: 40, youngestBuyerAge: 50, borrowerAge: 50 });
    expect(r.ltvLoan).toBeCloseTo(266_666.6667, 3);
    expect(r.tenureYears).toBe(15); // 65 − 50
  });
});
