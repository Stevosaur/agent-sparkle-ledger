/**
 * Adversarial verification pass (10 Oct 2026). Every expected value below was recomputed by hand from the research
 * notes (docs/research/*.md) — the arithmetic is in the comments — and annuity factors with 40-digit decimals.
 * These tests deliberately sit on the edges: tier and date boundaries, the ±1 cent / ±1 day around them, exact
 * thresholds (age + tenure = 65, age + lease = 95, lease = 20), and solver properties (monotonicity, binding limit).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { affordability, type AffordabilityInput } from "./affordability";
import { BALA_TABLE, BALA_TABLE_STATUS, balaLookup, balaPct, balaRatio, cpfLimits, cpfUsage } from "./lease";
import { bankLoanEligibility, bankLtv, hdbLoanEligibility, hdbLoanLtvDetail, maxServiceableLoan } from "./loan";
import { amortisationSchedule, balanceAfter, interestPaidOver, monthlyPayment, refinanceSavings, totalInterest } from "./mortgage";
import { RULE_META, RULE_STATUS, ruleNeedsDisclaimer, type RuleKey } from "./rules";
import { absdRate, absdRateAt, additionalBuyerStampDuty, buyerStampDuty, jointAbsdRate, sellerStampDuty } from "./stamp-duty";
import { walkAwayPrice } from "./walk-away";

/** |actual − expected| within one cent */
const cents = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.01);

/** PV of $1/month (40-digit decimals): (1 − (1 + r)^−n) / r, r = rate / 1200, n = 12 × years */
const PV = {
  "4/25": 189.4524829748,
  "4/30": 209.4612404542,
  "4.5/25": 179.9103218413,
  "3/20": 180.3109144125,
  "3.5/30": 222.6949849646,
};

/* ------------------------------------------------------------------ */
/* BSD: every tier edge, ±1 cent / a few dollars either side           */
/* ------------------------------------------------------------------ */

describe("BSD tier boundaries (stamp-duty.md §1.2 closed forms, floor to the dollar, $1 minimum)", () => {
  it.each([
    // P, residential BSD, arithmetic
    [50, 1], // 1% × 50 = 0.50 → floor 0 → $1 minimum
    [179_999, 1_799], // 1% × 179,999 = 1,799.99 → 1,799
    [180_000, 1_800], // 1% × 180,000
    [180_001, 1_800], // 1,800 + 2% × 1 = 1,800.02 → 1,800
    [180_050, 1_801], // 1,800 + 2% × 50 = 1,801
    [359_999, 5_399], // 1,800 + 2% × 179,999 = 1,800 + 3,599.98 = 5,399.98 → 5,399
    [360_000, 5_400], // 0.02 × 360,000 − 1,800
    [360_050, 5_401], // 5,400 + 3% × 50 = 5,401.50 → 5,401
    [999_999, 24_599], // 5,400 + 3% × 639,999 = 5,400 + 19,199.97 = 24,599.97 → 24,599
    [1_000_025, 24_601], // 24,600 + 4% × 25 = 24,601
    [1_499_999, 44_599], // 24,600 + 4% × 499,999 = 24,600 + 19,999.96 = 44,599.96 → 44,599
    [1_500_020, 44_601], // 44,600 + 5% × 20 = 44,601
    [2_999_999, 119_599], // 44,600 + 5% × 1,499,999 = 44,600 + 74,999.95 = 119,599.95 → 119,599
    [3_000_050, 119_603], // 119,600 + 6% × 50 = 119,603
  ] as const)("residential BSD(%i) = %i", (p, bsd) => {
    expect(buyerStampDuty(p).total).toBe(bsd);
  });

  it("one cent either side of each edge never jumps (continuity, no float drift)", () => {
    // 179,999.99: 1% → 1,799.9999 → 1,799; 180,000.01: 1,800 + 2% × 0.01 = 1,800.0002 → 1,800
    expect(buyerStampDuty(179_999.99).total).toBe(1_799);
    expect(buyerStampDuty(180_000.01).total).toBe(1_800);
    // 3,000,000.01: 119,600 + 6% × 0.01 → 119,600
    expect(buyerStampDuty(3_000_000.01).total).toBe(119_600);
  });

  it("non-residential has no 6% tier: $3,000,050 → 44,600 + 5% × 1,500,050 = 44,600 + 75,002.50 = 119,602", () => {
    expect(buyerStampDuty(3_000_050, "non-residential").total).toBe(119_602);
  });

  it("tables switch on the acquisition date: $2,000,000 on 19 Feb 2018 / 20 Feb 2018 / 14 Feb 2023 / 15 Feb 2023", () => {
    // before 20 Feb 2018 (1/2/3%): 5,400 + 3% × 1,640,000 = 5,400 + 49,200 = 54,600
    expect(buyerStampDuty(2_000_000, "residential", { date: "2018-02-19" }).total).toBe(54_600);
    // 20 Feb 2018 – 14 Feb 2023 (4% above $1m): 24,600 + 4% × 1,000,000 = 64,600
    expect(buyerStampDuty(2_000_000, "residential", { date: "2018-02-20" }).total).toBe(64_600);
    expect(buyerStampDuty(2_000_000, "residential", { date: "2023-02-14" }).total).toBe(64_600);
    // from 15 Feb 2023: 44,600 + 5% × 500,000 = 69,600
    expect(buyerStampDuty(2_000_000, "residential", { date: "2023-02-15" }).total).toBe(69_600);
    // 2018 table above $3m stays at 4%: 24,600 + 4% × 2,000,050 = 24,600 + 80,002 = 104,602
    expect(buyerStampDuty(3_000_050, "residential", { date: "2020-01-01" }).total).toBe(104_602);
  });
});

/* ------------------------------------------------------------------ */
/* ABSD: every profile × count                                         */
/* ------------------------------------------------------------------ */

describe("ABSD by profile and property count (stamp-duty.md §2.2), P = $1,234,567, floored", () => {
  it.each([
    ["SC", 1, 0, 0],
    ["SC", 2, 0.2, 246_913], // 20% × 1,234,567 = 246,913.40
    ["SC", 3, 0.3, 370_370], // 30% → 370,370.10
    ["SC", 4, 0.3, 370_370], // 4th property uses the "3rd and subsequent" rate
    ["SPR", 1, 0.05, 61_728], // 5% → 61,728.35
    ["SPR", 2, 0.3, 370_370], // 30% → 370,370.10
    ["SPR", 3, 0.35, 432_098], // 35% → 432,098.45
    ["FOREIGNER", 1, 0.6, 740_740], // 60% → 740,740.20
    ["FOREIGNER", 3, 0.6, 740_740],
    ["ENTITY", 1, 0.65, 802_468], // 65% → 802,468.55
    ["TRUSTEE", 2, 0.65, 802_468],
    ["HOUSING_DEVELOPER", 1, 0.4, 493_826], // 35% + 5% = 40% → 493,826.80
  ] as const)("%s owning %i → rate %f, ABSD %i", (profile, count, rate, total) => {
    expect(absdRate(profile, count)).toBe(rate);
    expect(additionalBuyerStampDuty(1_234_567, profile, count)).toEqual({ rate, total });
  });

  it("count below 1 is a first property; a non-finite count is NaN (never silently 0)", () => {
    expect(absdRate("SPR", 0)).toBe(0.05);
    expect(absdRate("SPR", Number.NaN)).toBeNaN();
    expect(additionalBuyerStampDuty(1_000_000, "SPR", Number.NaN).total).toBeNaN();
  });

  it("joint purchases take the highest rate: SPR (2nd, 30%) + foreigner (60%) → 60%; SC (3rd, 30%) + SPR (1st, 5%) → 30%", () => {
    expect(jointAbsdRate([{ profile: "SPR", propertyCount: 2 }, { profile: "FOREIGNER", propertyCount: 1 }])).toBe(0.6);
    expect(jointAbsdRate([{ profile: "SC", propertyCount: 3 }, { profile: "SPR", propertyCount: 1 }])).toBe(0.3);
  });

  it("historical tables switch on the exact acquisition day (§2.3)", () => {
    // SC 2nd property: 12% (6 Jul 2018) → 17% (16 Dec 2021) → 20% (27 Apr 2023)
    expect(absdRateAt("SC", 2, "2018-07-05")).toBeNull(); // before the earliest researched table
    expect(absdRateAt("SC", 2, "2018-07-06")).toBe(0.12);
    expect(absdRateAt("SC", 2, "2021-12-15")).toBe(0.12);
    expect(absdRateAt("SC", 2, "2021-12-16")).toBe(0.17);
    expect(absdRateAt("SC", 2, "2023-04-26")).toBe(0.17);
    expect(absdRateAt("SC", 2, "2023-04-27")).toBe(0.2);
    // trustees: no ABSD (Trust) before 9 May 2022, then 35%, then 65%
    expect(absdRateAt("TRUSTEE", 1, "2022-05-08")).toBeNull();
    expect(absdRateAt("TRUSTEE", 1, "2022-05-09")).toBe(0.35);
    expect(absdRateAt("TRUSTEE", 1, "2023-04-27")).toBe(0.65);
    // developers 25% + 5% = 30% from 6 Jul 2018; foreigners 20% then
    expect(absdRateAt("HOUSING_DEVELOPER", 1, "2018-07-06")).toBe(0.3);
    expect(absdRateAt("FOREIGNER", 1, "2018-07-06")).toBe(0.2);
  });
});

/* ------------------------------------------------------------------ */
/* SSD: exact anniversaries, the 4 Jul 2025 switch, leap days          */
/* ------------------------------------------------------------------ */

describe("SSD boundary dates (stamp-duty.md §3; anniversary convention UNVERIFIED and flagged)", () => {
  it.each([
    // acquired 4 Jul 2025 (16/12/8/4 over 4 years), $1,000,000
    ["2025-07-04", "2026-07-04", 1, 0.16, 160_000, 2], // exactly 1 year: band 1 (other reading: band 2)
    ["2025-07-04", "2027-07-04", 2, 0.12, 120_000, 3], // exactly 2 years
    ["2025-07-04", "2028-07-04", 3, 0.08, 80_000, 4], // exactly 3 years
    ["2025-07-04", "2029-07-04", 4, 0.04, 40_000, null], // exactly 4 years: other reading has no SSD
    // acquired 10 Jan 2022 (12/8/4 over 3 years)
    ["2022-01-10", "2024-01-10", 2, 0.08, 80_000, 3],
    ["2022-01-10", "2025-01-10", 3, 0.04, 40_000, null],
  ] as const)("acquired %s, sold %s (an anniversary) → band %i, rate %f, SSD %i; alternative band %s", (acq, sold, band, rate, total, altBand) => {
    const r = sellerStampDuty(1_000_000, acq, sold);
    expect(r).toMatchObject({ holdingYearBand: band, rate, total, nearAnniversary: true, anniversaryDate: sold });
    expect(r.alternative?.holdingYearBand ?? null).toBe(altBand);
  });

  it("a sale within ±1 day of an anniversary reports the contested-convention status, not the regime's", () => {
    expect(sellerStampDuty(1_000_000, "2025-07-04", "2026-07-04").status).toBe("unverified-conflict");
    expect(sellerStampDuty(1_000_000, "2025-07-04", "2026-07-05").status).toBe("unverified-conflict");
    expect(sellerStampDuty(1_000_000, "2025-07-04", "2026-07-06").status).toBe("verified-secondary");
  });

  it("one day past the last anniversary is SSD-free under both readings", () => {
    expect(sellerStampDuty(1_000_000, "2025-07-04", "2029-07-05")).toMatchObject({ total: 0, holdingYearBand: null, alternative: null });
    expect(sellerStampDuty(1_000_000, "2022-01-10", "2025-01-11")).toMatchObject({ total: 0, holdingYearBand: null, alternative: null });
  });

  it("the 4 Jul 2025 regime switch: one day apart at purchase, same sale date three years later", () => {
    // acquired 3 Jul 2025 → old 3-year regime; 3 Jul 2028 is its 3rd anniversary → 4%
    expect(sellerStampDuty(1_000_000, "2025-07-03", "2028-07-03")).toMatchObject({ regime: "2017-03-11", holdingYearBand: 3, rate: 0.04 });
    // a day later the old regime is over …
    expect(sellerStampDuty(1_000_000, "2025-07-03", "2028-07-05")).toMatchObject({ regime: "2017-03-11", total: 0 });
    // … but a purchase on 4 Jul 2025 is in the new regime: 5 Jul 2028 is > 3 years, ≤ 4 years → 4%
    expect(sellerStampDuty(1_000_000, "2025-07-04", "2028-07-05")).toMatchObject({ regime: "2025-07-04", holdingYearBand: 4, rate: 0.04, total: 40_000 });
  });

  it("leap days: 29 Feb 2028 + 3 years = 28 Feb 2031 (clamped); + 4 years = 29 Feb 2032", () => {
    expect(sellerStampDuty(1_000_000, "2028-02-29", "2031-02-28")).toMatchObject({ holdingYearBand: 3, rate: 0.08, anniversaryDate: "2031-02-28" });
    expect(sellerStampDuty(1_000_000, "2028-02-29", "2031-03-01")).toMatchObject({ holdingYearBand: 4, rate: 0.04 });
    expect(sellerStampDuty(1_000_000, "2028-02-29", "2032-02-29")).toMatchObject({ holdingYearBand: 4, anniversaryDate: "2032-02-29" });
    expect(sellerStampDuty(1_000_000, "2028-02-29", "2032-03-01").total).toBe(0);
    // old regime: 29 Feb 2024 + 3 years = 28 Feb 2027 → last SSD day; 1 Mar 2027 free
    expect(sellerStampDuty(1_000_000, "2024-02-29", "2027-02-28")).toMatchObject({ holdingYearBand: 3, total: 40_000 });
    expect(sellerStampDuty(1_000_000, "2024-02-29", "2027-03-01").total).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Bank LTV thresholds                                                  */
/* ------------------------------------------------------------------ */

describe("bank LTV at the exact thresholds (loan-rules.md §2.1–2.2)", () => {
  it("private: tenure 30 and age 35 ends exactly at 65 → 75%; age 35.5 (65.5 > 65) or tenure 31 (> 30) → 55%", () => {
    expect(bankLtv("private", 0, 30, 35)).toEqual({ ltv: 0.75, minCashPct: 0.05, reduced: false });
    expect(bankLtv("private", 0, 30, 35.5)).toEqual({ ltv: 0.55, minCashPct: 0.1, reduced: true });
    expect(bankLtv("private", 0, 31, 30)).toEqual({ ltv: 0.55, minCashPct: 0.1, reduced: true });
  });

  it("HDB flat: tenure 25 at age 40 → 75%; 26 years → 55%; 25 years at age 41 (66 > 65) → 55%", () => {
    expect(bankLtv("hdb", 0, 25, 40).ltv).toBe(0.75);
    expect(bankLtv("hdb", 0, 26, 30).ltv).toBe(0.55);
    expect(bankLtv("hdb", 0, 25, 41).ltv).toBe(0.55);
    // ECs use the 30-year threshold, not 25
    expect(bankLtv("ec-new", 0, 26, 30).ltv).toBe(0.75);
  });

  it("2nd loan 45% / 25%, 3rd+ 35% / 15%, minimum cash 25% either way", () => {
    expect(bankLtv("private", 1, 30, 30)).toEqual({ ltv: 0.45, minCashPct: 0.25, reduced: false });
    expect(bankLtv("private", 1, 35, 30)).toEqual({ ltv: 0.25, minCashPct: 0.25, reduced: true });
    expect(bankLtv("private", 5, 20, 30)).toEqual({ ltv: 0.35, minCashPct: 0.25, reduced: false });
    expect(bankLtv("private", 2, 20, 50)).toEqual({ ltv: 0.15, minCashPct: 0.25, reduced: true }); // 50 + 20 = 70 > 65
  });

  it("non-individual (company) borrowers: flat 15% LTV (§2.1, UNVERIFIED); $2,000,000 → LTV loan 300,000", () => {
    expect(bankLtv("private", 0, 20, 30, { nonIndividual: true })).toEqual({ ltv: 0.15, minCashPct: 0, reduced: false });
    const e = bankLoanEligibility({ price: 2_000_000, propertyClass: "private", outstandingLoans: 0, tenureYears: 20, borrowerAge: 30, monthlyIncome: 50_000, monthlyDebts: 0, nonIndividual: true });
    expect(e.ltvLoan).toBe(300_000); // 15% × 2,000,000
    expect(e.maxLoan).toBe(300_000);
    expect(e.binding).toBe("ltv");
  });
});

/* ------------------------------------------------------------------ */
/* TDSR / MSR at the stress rate                                        */
/* ------------------------------------------------------------------ */

describe("TDSR / MSR loan limits at the stress rate (loan-rules.md §1, §7)", () => {
  it("private, income 12,000, debts 1,000: TDSR room 6,600 − 1,000 = 5,600; at 4%/25y → 5,600 × 189.4524830 = 1,060,933.90", () => {
    const s = maxServiceableLoan({ monthlyIncome: 12_000, monthlyDebts: 1_000, propertyClass: "private", tenureYears: 25 });
    expect(s).toMatchObject({ binding: "tdsr", stressRatePct: 4, msrInstalmentCap: null });
    cents(s.maxInstalment, 5_600); // 0.55 × 12,000 is 6,600.000000000001 in binary floating point
    cents(s.maxLoan, 1_060_933.9);
  });

  it("a 4.5% thereafter rate replaces the 4% floor: 5,600 × 179.9103218 = 1,007,497.80", () => {
    const s = maxServiceableLoan({ monthlyIncome: 12_000, monthlyDebts: 1_000, propertyClass: "private", tenureYears: 25, thereafterRatePct: 4.5 });
    expect(s.stressRatePct).toBe(4.5);
    cents(s.maxLoan, 5_600 * PV["4.5/25"]);
    cents(s.maxLoan, 1_007_497.8);
  });

  it("HDB flat, bank loan, an existing property loan of 1,000/month inside debts of 1,500: MSR 3,000 − 1,000 = 2,000 < TDSR 5,500 − 1,500 = 4,000 → 2,000 × 189.4524830 = 378,904.97", () => {
    const s = maxServiceableLoan({ monthlyIncome: 10_000, monthlyDebts: 1_500, monthlyPropertyLoanInstalments: 1_000, propertyClass: "hdb", tenureYears: 25 });
    expect(s).toMatchObject({ maxInstalment: 2_000, binding: "msr", tdsrInstalmentCap: 4_000, msrInstalmentCap: 2_000 });
    cents(s.maxLoan, 378_904.97);
  });

  it("HDB loan, income 6,000, age 45: tenure min(25, 65 − 45) = 20; MSR 1,800 at max(3%, 2.6%) → 1,800 × 180.3109144 = 324,559.65", () => {
    const s = maxServiceableLoan({ monthlyIncome: 6_000, monthlyDebts: 9_999, propertyClass: "hdb", tenureYears: 25, borrowerAge: 45 }, "hdb");
    expect(s).toMatchObject({ tenureYears: 20, stressRatePct: 3, maxInstalment: 1_800 });
    cents(s.maxLoan, 324_559.65);
  });

  it("the instalment on the maximum loan at the stress rate equals the servicing room exactly", () => {
    const s = maxServiceableLoan({ monthlyIncome: 12_000, monthlyDebts: 1_000, propertyClass: "private", tenureYears: 25 });
    cents(monthlyPayment(s.maxLoan, 4, 25), 5_600);
  });
});

/* ------------------------------------------------------------------ */
/* HDB loan LTV pro-rating and CPF lease rules                          */
/* ------------------------------------------------------------------ */

describe("HDB loan pro-rating and CPF usage at the lease boundaries (loan-rules.md §3–4, UNVERIFIED formulas)", () => {
  it("youngest 60, lease 30: 60 + 30 = 90 < 95 → 75% × 30/35 = 64.2857%; $300,000 → LTV loan 192,857.14", () => {
    const d = hdbLoanLtvDetail(30, 60);
    expect(d.prorated).toBe(true);
    expect(d.ratio).toBeCloseTo(30 / 35, 12);
    expect(d.ltv).toBeCloseTo(0.6428571428571, 12);
    expect(d.status).toBe("unverified");
    cents(hdbLoanEligibility({ price: 300_000, monthlyIncome: 50_000, remainingLeaseYears: 30, youngestBuyerAge: 60 }).ltvLoan, 192_857.14);
  });

  it("youngest 35, lease exactly 60 (35 + 60 = 95) → full 75%; lease 59.5 → 75% × 59.5/60 = 74.375%", () => {
    expect(hdbLoanLtvDetail(60, 35)).toMatchObject({ ltv: 0.75, prorated: false, status: "verified-search" });
    expect(hdbLoanLtvDetail(59.5, 35).ltv).toBeCloseTo(0.74375, 12);
  });

  it("CPF: lease 19.99 → none; exactly 20 → allowed; age 75 + 20 = 95 → full; age 30, lease 20 → 20/65", () => {
    expect(cpfUsage(19.99, 30)).toEqual({ allowed: false, full: false, shareOfValuationLimit: 0 });
    expect(cpfUsage(20, 75)).toEqual({ allowed: true, full: true, shareOfValuationLimit: 1 });
    expect(cpfUsage(20, 76)).toEqual({ allowed: true, full: true, shareOfValuationLimit: 1 });
    const u = cpfUsage(20, 30);
    expect(u.full).toBe(false);
    expect(u.shareOfValuationLimit).toBeCloseTo(20 / 65, 12);
  });

  it("CPF limits: VL = min(520,000, 500,000) = 500,000; × 20/65 = 153,846.15; WL 600,000 × 20/65 = 184,615.38", () => {
    const l = cpfLimits(520_000, 20, 30, 500_000);
    expect(l.valuationLimit).toBe(500_000);
    cents(l.usableUpToValuationLimit, 153_846.15);
    cents(l.withdrawalLimit, 184_615.38);
    expect(l.status).toBe("unverified");
  });
});

/* ------------------------------------------------------------------ */
/* Bala's Table                                                         */
/* ------------------------------------------------------------------ */

/** The machine-readable JSON block in docs/research/bala-table.md §4. */
function researchBalaJson(): { values: Record<string, number>; disputedByReproductionR1: { valuesWhereDifferent: Record<string, number> }; corroboratedYears: number[] } {
  const md = readFileSync(path.resolve(__dirname, "../../../docs/research/bala-table.md"), "utf8");
  const block = /## 4\. Machine-readable table[\s\S]*?```json\n([\s\S]*?)\n```/.exec(md);
  if (!block) throw new Error("bala-table.md §4 JSON block not found");
  return JSON.parse(block[1]);
}

describe("Bala's Table against the research file and interpolation", () => {
  it("every one of the 99 rows, the R1 disputed values and the anchors equal the JSON in bala-table.md §4", () => {
    const j = researchBalaJson();
    for (let y = 1; y <= 99; y++) expect(BALA_TABLE[y], `row ${y}`).toBe(j.values[String(y)]);
    const disputed = Object.fromEntries(Object.entries(BALA_TABLE_STATUS.disputedByR1).map(([k, v]) => [k, v]));
    expect(disputed).toEqual(j.disputedByReproductionR1.valuesWhereDifferent);
    expect([...BALA_TABLE_STATUS.corroboratedYears]).toEqual(j.corroboratedYears);
  });

  it("interpolates linearly: 55.25 → 77.3 + 0.6 × 0.25 = 77.45; 19.5 → 46.6 + 1.4 × 0.5 = 47.3; 98.75 → 95.8 + 0.2 × 0.75 = 95.95", () => {
    expect(balaPct(55.25)).toBeCloseTo(77.45, 10);
    expect(balaLookup(19.5)).toMatchObject({ rowStatus: "conflict" }); // row 20 is the "~49%" conflict row
    expect(balaPct(19.5)).toBeCloseTo(47.3, 10);
    expect(balaLookup(98.75)).toMatchObject({ rowStatus: "disputed", capped: false });
    expect(balaPct(98.75)).toBeCloseTo(95.95, 10);
    expect(balaLookup(99.0001)).toMatchObject({ pct: 96, capped: true });
  });

  it("40 vs 99 years: 68.5 / 96 = 0.7135417; non-decreasing on a 0.05-year grid from 0 to 100", () => {
    expect(balaRatio(40, 99)).toBeCloseTo(0.71354166667, 10);
    let prev = -1;
    for (let y = 0; y <= 100; y += 0.05) {
      const v = balaPct(y)!;
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

/* ------------------------------------------------------------------ */
/* Mortgage amortisation                                                */
/* ------------------------------------------------------------------ */

describe("amortisation: $600,000 at 3.5% over 30 years", () => {
  // r = 3.5% / 12 = 0.0029166…, n = 360, PV factor 222.6949849646 → instalment 600,000 / 222.6949849646 = 2,694.268127
  const P = 600_000;
  const pmt = monthlyPayment(P, 3.5, 30);

  it("instalment 2,694.27; month 1 = 1,750.00 interest (600,000 × 0.035/12) + 944.27 principal", () => {
    cents(pmt, 2_694.27);
    cents(pmt, P / PV["3.5/30"]);
    cents(interestPaidOver(P, 3.5, 30, 1), 1_750);
    cents(P - balanceAfter(P, 3.5, 30, 1), 944.27);
  });

  it("balance after 12 payments 588,485.23; before the last payment it is pmt / (1 + r) = 2,686.43; then 0", () => {
    cents(balanceAfter(P, 3.5, 30, 12), 588_485.23);
    cents(balanceAfter(P, 3.5, 30, 359), 2_686.43);
    expect(balanceAfter(P, 3.5, 30, 360)).toBe(0);
  });

  it("schedule: principal sums to the loan, the balance ends at 0, interest = 360 × 2,694.268127 − 600,000 = 369,936.53", () => {
    const rows = amortisationSchedule(P, 3.5, 30);
    expect(rows).toHaveLength(30);
    cents(rows[0].balance, 588_485.23);
    cents(rows.reduce((s, r) => s + r.principal, 0), P);
    expect(rows[29].balance).toBe(0);
    const interest = rows.reduce((s, r) => s + r.interest, 0);
    cents(interest, 369_936.53);
    cents(totalInterest(P, 3.5, 30), 369_936.53);
    cents(rows.reduce((s, r) => s + r.payment, 0), 360 * pmt);
    // every year's payment is 12 instalments
    for (const r of rows) cents(r.payment, 12 * pmt);
  });

  it("refinancing: a horizon longer than the remaining tenure counts only the instalments left", () => {
    // 2 years left: instalment saving × 24 months, not × 60; interest saving = total interest difference over the loan
    const r = refinanceSavings(100_000, 4, 3, 2, 0, 5);
    expect(r.horizonYears).toBe(2);
    cents(r.savingOverHorizon, (monthlyPayment(100_000, 4, 2) - monthlyPayment(100_000, 3, 2)) * 24);
    cents(r.interestSavedOverHorizon, totalInterest(100_000, 4, 2) - totalInterest(100_000, 3, 2));
    // over the whole loan the two views agree (both repay the same principal)
    cents(r.savingOverHorizon, r.interestSavedOverHorizon);
  });

  it("zero rate: $120,000 over 10 years = 1,000/month exactly, 12,000 principal a year", () => {
    expect(monthlyPayment(120_000, 0, 10)).toBe(1_000);
    for (const r of amortisationSchedule(120_000, 0, 10)) expect(r).toMatchObject({ payment: 12_000, interest: 0, principal: 12_000 });
  });
});

/* ------------------------------------------------------------------ */
/* Affordability: hand-solved cases, binding constraint, monotonicity  */
/* ------------------------------------------------------------------ */

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

describe("affordability — hand-solved limits and the binding constraint", () => {
  it("servicing binds: income 6,000 → loan 3,300 × 209.4612405 = 691,222.09; cash 1m → P ≤ 1,721,622.09 / 1.05 = 1,639,640.09 → 1,639,000", () => {
    // cash = P − 691,222.09 + (0.05P − 30,400) ≤ 1,000,000 (BSD band 1.5m–3m) → 1.05P ≤ 1,721,622.09
    // at 1,639,000: BSD 81,950 − 30,400 = 51,550; D = 947,777.91; cash = 999,327.91. At 1,640,000: 1,000,377.91 > 1m.
    const r = affordability({ ...base, cash: 1_000_000, monthlyIncome: 6_000 });
    expect(r.maxPrice).toBe(1_639_000);
    cents(r.loan, 691_222.09);
    expect(r.bsd).toBe(51_550);
    cents(r.cashUsed, 999_327.91);
    expect(r.loanLimitedBy).toBe("servicing");
    expect(r.binding).toBe("servicing");
  });

  it("LTV binds: income 50,000, cash 100,000, no CPF → 0.25P + 0.03P − 5,400 ≤ 100,000 → P ≤ 376,428.57 → 376,000", () => {
    // at 376,000: loan 282,000; D 94,000; BSD 11,280 − 5,400 = 5,880; cash 99,880. 377,000 → 94,250 + 5,910 = 100,160.
    const r = affordability({ ...base, cash: 100_000, monthlyIncome: 50_000 });
    expect(r.maxPrice).toBe(376_000);
    expect(r.loan).toBe(282_000);
    expect(r.bsd).toBe(5_880);
    expect(r.cashUsed).toBe(99_880);
    expect(r.loanLimitedBy).toBe("ltv");
    expect(r.fundsLimitedBy).toBe("cash-and-cpf");
  });

  it("minimum cash binds while CPF is left: cash 50,000, CPF 500,000 → 0.05P + 0.03P − 5,400 ≤ 50,000 → P ≤ 692,500 → 692,000", () => {
    // at 692,000: min cash 34,600 + BSD 20,760 − 5,400 = 15,360 → 49,960 cash; CPF covers 20% = 138,400 of 500,000
    const r = affordability({ ...base, cash: 50_000, cpfOa: 500_000, monthlyIncome: 50_000 });
    expect(r.maxPrice).toBe(692_000);
    expect(r.minCash).toBe(34_600);
    expect(r.cpfUsed).toBe(138_400);
    expect(r.cashUsed).toBe(49_960);
    expect(r.fundsLimitedBy).toBe("cash");
    expect(r.cpfLeft).toBe(361_600);
  });

  it("HDB loan at age 45: 20-year tenure, MSR loan 324,559.65 binds; cash 100,000 + CPF 300,000 → 1.03P − 629,959.65 ≤ 100,000 → 708,000", () => {
    // P above 624,559.65 needs cash beyond BSD: P − 324,559.65 − 300,000 + (0.03P − 5,400) ≤ 100,000 → P ≤ 708,698.69
    // at 708,000: D 383,440.35 − CPF 300,000 = 83,440.35 + BSD 15,840 = 99,280.35
    const r = affordability({ ...base, propertyClass: "hdb", lender: "hdb", age: 45, tenureYears: 25, cash: 100_000, cpfOa: 300_000, monthlyIncome: 6_000 });
    expect(r.tenureYears).toBe(20);
    expect(r.stressRatePct).toBe(3);
    expect(r.maxPrice).toBe(708_000);
    cents(r.loan, 324_559.65);
    cents(r.cashUsed, 99_280.35);
    expect(r.cpfUsed).toBe(300_000);
    expect(r.loanLimitedBy).toBe("servicing");
    expect(r.fundsLimitedBy).toBe("cash-and-cpf");
    cents(r.monthlyPayment, monthlyPayment(324_559.645942, 2.6, 20));
    expect(r.rules).toContain("hdbLoanDownpaymentCpf");
  });

  it("a company (ENTITY) gets the 15% non-individual LTV and no CPF: 0.85P + (0.03P − 5,400) + 0.65P ≤ 1,000,000 → 657,000", () => {
    // 1.53P ≤ 1,005,400 → P ≤ 657,124.18. At 657,000: loan 98,550; D 558,450; BSD 14,310; ABSD 65% = 427,050 → 999,810.
    // (Before the fix the solver gave a company the individual 75% LTV and let it spend CPF.)
    const r = affordability({ ...base, buyerProfile: "ENTITY", cash: 1_000_000, cpfOa: 500_000, monthlyIncome: 50_000 });
    expect(r.ltv).toBe(0.15);
    expect(r.maxPrice).toBe(657_000);
    expect(r.loan).toBe(98_550);
    expect(r.absd).toBe(427_050);
    expect(r.cpfUsed).toBe(0);
    expect(r.cashUsed).toBe(999_810);
    expect(r.rules).toContain("bankLtvNonIndividual");
    expect(r.rules).not.toContain("bankLtv");
  });

  it("a missing bank rate shows the repayment at the 4% floor instead of NaN", () => {
    const r = affordability({ ...base, interestRatePct: Number.NaN, cash: 100_000, monthlyIncome: 10_000 });
    expect(Number.isFinite(r.monthlyPayment)).toBe(true);
    cents(r.monthlyPayment, monthlyPayment(r.loan, 4, 30));
  });
});

/** Cash the buyer needs at price P, rebuilt from the rule functions (not from the solver's internals). */
function cashNeededAt(input: AffordabilityInput, p: number, r: ReturnType<typeof affordability>): number {
  const loan = Math.min(r.ltv * p, r.maxServiceableLoan);
  const downpayment = p - loan;
  const minCashPct = input.lender === "hdb" || input.buyerProfile === "ENTITY" ? 0 : bankLtv(input.propertyClass, input.outstandingLoans, r.tenureYears, input.age).minCashPct;
  const cpfCap = Math.min(input.buyerProfile === "ENTITY" && input.lender === "bank" ? 0 : input.cpfOa, r.cpfShareOfValuationLimit * p);
  const cpf = Math.min(cpfCap, Math.max(0, downpayment - minCashPct * p));
  return downpayment - cpf + buyerStampDuty(p).total + additionalBuyerStampDuty(p, input.buyerProfile, input.propertyCount).total;
}

describe("affordability — properties over a deterministic grid", () => {
  let seed = 20261010;
  const rnd = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const cases: AffordabilityInput[] = Array.from({ length: 150 }, () => {
    const lender = pick(["bank", "bank", "hdb"] as const);
    return {
      cash: Math.round(rnd() * 600_000),
      cpfOa: Math.round(rnd() * 500_000),
      monthlyIncome: Math.round(rnd() * 30_000),
      monthlyDebts: Math.round(rnd() * 3_000),
      age: 21 + Math.floor(rnd() * 45),
      propertyClass: lender === "hdb" ? "hdb" : pick(["hdb", "ec-new", "ec-resale", "private"] as const),
      lender,
      buyerProfile: pick(["SC", "SC", "SPR", "FOREIGNER", "ENTITY"] as const),
      propertyCount: 1 + Math.floor(rnd() * 3),
      outstandingLoans: Math.floor(rnd() * 3),
      tenureYears: 5 + Math.floor(rnd() * 36),
      interestRatePct: 1 + rnd() * 5,
      ...(rnd() < 0.5 ? { remainingLeaseYears: 10 + rnd() * 89, youngestBuyerAge: 21 + Math.floor(rnd() * 50) } : {}),
    };
  });

  it("more cash, income or CPF, or fewer debts, never lowers the maximum price", () => {
    for (const c of cases) {
      const p = affordability(c).maxPrice;
      expect(affordability({ ...c, cash: c.cash + 10_000 }).maxPrice).toBeGreaterThanOrEqual(p);
      expect(affordability({ ...c, monthlyIncome: c.monthlyIncome + 500 }).maxPrice).toBeGreaterThanOrEqual(p);
      expect(affordability({ ...c, cpfOa: c.cpfOa + 10_000 }).maxPrice).toBeGreaterThanOrEqual(p);
      expect(affordability({ ...c, monthlyDebts: Math.max(0, c.monthlyDebts - 500) }).maxPrice).toBeGreaterThanOrEqual(p);
    }
  });

  it("the price is affordable and $1,000 more is not (unless the search ceiling was hit)", () => {
    for (const c of cases) {
      const r = affordability(c);
      expect(cashNeededAt(c, r.maxPrice, r)).toBeLessThanOrEqual(c.cash + 0.01);
      if (!r.searchCapped) expect(cashNeededAt(c, r.maxPrice + 1_000, r)).toBeGreaterThan(c.cash);
    }
  });

  it("the reported binding loan limit is the one the loan sits on", () => {
    for (const c of cases) {
      const r = affordability(c);
      if (r.loanLimitedBy === "servicing") cents(r.loan, r.maxServiceableLoan);
      else cents(r.loan, r.ltv * r.maxPrice);
      expect(r.loan).toBeLessThanOrEqual(Math.min(r.maxServiceableLoan, r.ltv * r.maxPrice) + 0.01);
      cents(r.loan + r.downpayment, r.maxPrice);
      expect(r.cashLeft).toBeGreaterThanOrEqual(-0.01);
      expect(r.cpfLeft).toBeGreaterThanOrEqual(-0.01);
    }
  });
});

describe("walk-away price: which ABSD table was used", () => {
  it("dated table from 6 Jul 2018; earlier purchases fall back to today's rate and say so", () => {
    const w = { price: 1_000_000, loanAmount: 0, interestRatePct: 3, tenureYears: 25, holdingYears: 5, buyerProfile: "SC" as const, propertyCount: 2, agentFeePct: 0.02, otherCosts: 0 };
    // 6 Jul 2018: SC 2nd property 12% → 120,000
    expect(walkAwayPrice({ ...w, purchaseDate: new Date("2018-07-06") })).toMatchObject({ absd: 120_000, absdFromDatedTable: true });
    // 5 Jul 2018 is outside the researched tables: today's 20% (200,000), flagged
    expect(walkAwayPrice({ ...w, purchaseDate: new Date("2018-07-05") })).toMatchObject({ absd: 200_000, absdFromDatedTable: false });
  });
});

/* ------------------------------------------------------------------ */
/* Rule registry vs the research                                        */
/* ------------------------------------------------------------------ */

describe("every UNVERIFIED rule is flagged for the UI", () => {
  it("rules the research marks UNVERIFIED / conflicting / unverified-reproduction need a disclaimer", () => {
    const mustFlag: RuleKey[] = [
      "bsdNonResidential", // §1.3 UNVERIFIED (high confidence)
      "bsdHistorical",
      "absdRates", // §2.2 UNVERIFIED (high confidence)
      "absdOtherProfiles",
      "absdHistorical",
      "absdJointHighestRate",
      "absdRounding",
      "absdFta",
      "absdMarriedCoupleReliefs",
      "ssd2011",
      "ssdBase",
      "ssdRounding",
      "ssdAnniversary", // conflicting secondary evidence
      "ssdTransitional",
      "bankLtv", // loan-rules §2.1 UNVERIFIED as a full table
      "bankLtvNonIndividual",
      "bankMinCash",
      "incomeWeightedAge",
      "jointBorrowerLoanCount",
      "hdbLoanLtvProration", // formula assumed
      "hdbLoanRate", // rates-data §2 UNVERIFIED for Q4 2026
      "hdbLoanDownpaymentCpf",
      "cpfOaRate",
      "cpfMinLease", // loan-rules §4: everything UNVERIFIED
      "cpfFullUse",
      "cpfProration",
      "cpfWithdrawalLimit",
      "hdbMopPlh", // hdb-rules §1.1 UNVERIFIED this session
      "hdbLease",
      "propertyTaxOwnerOccupied", // loan-rules §5 all UNVERIFIED
      "propertyTaxNonOwnerOccupied",
      "bala",
    ];
    for (const k of mustFlag) expect(ruleNeedsDisclaimer(k), k).toBe(true);
    expect(RULE_STATUS.hdbMopPlh).toBe("unverified-high-confidence");
    expect(RULE_STATUS.cpfOaRate).toBe("unverified-high-confidence");
  });

  it("verified rules are exactly those the research verified (search, secondary or data)", () => {
    const verified = (Object.keys(RULE_META) as RuleKey[]).filter((k) => !ruleNeedsDisclaimer(k)).sort();
    expect(verified).toEqual(
      [
        "bsdResidential",
        "bsdRounding",
        "ssd2025",
        "ssd2017",
        "tdsr",
        "msr",
        "bankStressRate",
        "hdbStressRate",
        "bankLtvTriggers",
        "bankMaxTenure",
        "hdbLoanLtv",
        "hdbLoanMsr",
        "hdbLoanTenure",
        "hdbMop",
        "remainingLeaseEstimate",
      ].sort(),
    );
  });
});
