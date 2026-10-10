import { monthlyPayment, principalFromPayment } from "./mortgage";
import {
  BANK_LTV,
  BANK_LTV_NON_INDIVIDUAL,
  BANK_MAX_TENURE,
  BANK_STRESS_RATE_PCT,
  CPF_LEASE_COVER_AGE,
  HDB_LOAN_AGE_LIMIT,
  HDB_LOAN_LTV,
  HDB_LOAN_MAX_TENURE,
  HDB_LOAN_RATE_PCT,
  HDB_LOAN_STRESS_RATE_PCT,
  LTV_AGE_LIMIT,
  LTV_TENURE_THRESHOLD,
  MSR_LIMIT,
  RULE_META,
  TDSR_LIMIT,
  type RuleStatus,
} from "./rules";

/**
 * Housing-loan limits (docs/research/loan-rules.md): MAS LTV / tenure / TDSR / MSR rules for bank loans and HDB's
 * rules for its concessionary loan. Worked examples A–E of loan-rules.md §7 are reproduced in loan.test.ts.
 */

export type PropertyClass = "hdb" | "ec-new" | "ec-resale" | "private";

export interface LtvResult {
  ltv: number;
  minCashPct: number;
  reduced: boolean;
}

const isHdbFlat = (c: PropertyClass) => c === "hdb";

/**
 * MAS LTV limit for a bank loan to an individual. The reduced limit applies when the tenure exceeds the threshold
 * (25 years for HDB flats, 30 years otherwise) OR the loan runs past age 65 (age + tenure > 65; ending exactly at 65
 * is not "past" — loan-rules.md Example D). `borrowerAge` is the income-weighted average age of the borrowers;
 * `outstandingLoans` is the count of the borrower with the most outstanding housing loans (2+ share a row).
 *
 * `opts.nonIndividual` (a company or other non-individual borrower): flat 15% LTV (BANK_LTV_NON_INDIVIDUAL, since
 * 6 Jul 2018, UNVERIFIED — loan-rules.md §2.1). The research gives no reduced column and no minimum-cash rule for
 * non-individuals ("n/a"), so `reduced` is false and `minCashPct` is 0; the caller must treat the whole down payment as
 * the company's own money (CPF belongs to individual members).
 */
export function bankLtv(propertyClass: PropertyClass, outstandingLoans: number, tenureYears: number, borrowerAge: number, opts: { nonIndividual?: boolean } = {}): LtvResult {
  if (opts.nonIndividual) return { ltv: BANK_LTV_NON_INDIVIDUAL, minCashPct: 0, reduced: false };
  const row = BANK_LTV[Math.min(Math.max(0, Math.floor(outstandingLoans) || 0), 2)];
  const threshold = isHdbFlat(propertyClass) ? LTV_TENURE_THRESHOLD.hdb : LTV_TENURE_THRESHOLD.private;
  const reduced = tenureYears > threshold || borrowerAge + tenureYears > LTV_AGE_LIMIT;
  return { ltv: reduced ? row.reduced : row.standard, minCashPct: reduced ? row.minCashReduced : row.minCashStandard, reduced };
}

/** Maximum bank loan tenure (MAS): 30 years for HDB flats, 35 years for other residential property (incl. ECs). */
export function maxBankTenure(propertyClass: PropertyClass): number {
  return isHdbFlat(propertyClass) ? BANK_MAX_TENURE.hdb : BANK_MAX_TENURE.private;
}

/**
 * Longest bank-loan tenure that keeps the standard (higher) LTV: min(tenure threshold, 65 − age), never negative.
 * loan-rules.md Example E: IWAA 36, private property → min(30, 29) = 29 years.
 */
export function maxTenureForStandardLtv(propertyClass: PropertyClass, borrowerAge: number): number {
  const threshold = isHdbFlat(propertyClass) ? LTV_TENURE_THRESHOLD.hdb : LTV_TENURE_THRESHOLD.private;
  return Math.max(0, Math.min(threshold, LTV_AGE_LIMIT - borrowerAge));
}

/**
 * Income-weighted average age (IWAA) of joint borrowers: Σ(age × income) / Σ income, unrounded (bank rounding
 * practice is unverified). loan-rules.md Example E: (40 × 6,000 + 30 × 4,000) / 10,000 = 36. NaN without income.
 */
export function incomeWeightedAverageAge(borrowers: { age: number; monthlyIncome: number }[]): number {
  const income = borrowers.reduce((s, b) => s + Math.max(0, b.monthlyIncome), 0);
  if (!(income > 0)) return Number.NaN;
  return borrowers.reduce((s, b) => s + b.age * Math.max(0, b.monthlyIncome), 0) / income;
}

/** Joint borrowers: the borrower with the MOST outstanding housing loans decides the LTV row (not the sum). UNVERIFIED. */
export function outstandingLoansForJointBorrowers(perBorrower: number[]): number {
  return perBorrower.length ? Math.max(...perBorrower.map((n) => Math.max(0, Math.floor(n) || 0))) : 0;
}

/** MSR applies to HDB flats and to ECs bought from the developer (bank loans must then pass both MSR and TDSR). */
export function msrApplies(propertyClass: PropertyClass): boolean {
  return propertyClass === "hdb" || propertyClass === "ec-new";
}

/** HDB loan tenure: at most 25 years and, when the age is given, ending by age 65 (never negative). */
export function hdbLoanMaxTenure(requestedYears: number = HDB_LOAN_MAX_TENURE, borrowerAge?: number): number {
  const ageCap = borrowerAge != null && Number.isFinite(borrowerAge) ? HDB_LOAN_AGE_LIMIT - borrowerAge : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(requestedYears, HDB_LOAN_MAX_TENURE, ageCap));
}

export interface ServicingInput {
  /** gross monthly income of all borrowers (variable income should already be haircut by the caller) */
  monthlyIncome: number;
  /** ALL other monthly debt obligations (car loans, other mortgages, card minimums) — counted for TDSR */
  monthlyDebts: number;
  propertyClass: PropertyClass;
  tenureYears: number;
  /** stress-test rate override, % p.a.; by default max(floor, thereafterRatePct) */
  stressRatePct?: number;
  /**
   * instalments on existing property loans (already included in `monthlyDebts`) plus ≥ 20% of any guaranteed property
   * loan — these also count towards MSR (MAS). Default 0.
   */
  monthlyPropertyLoanInstalments?: number;
  /** the loan's "thereafter" rate, % p.a.; the stress rate is max(MAS / HDB floor, this) */
  thereafterRatePct?: number;
  /** borrower (income-weighted average) age; caps an HDB loan's tenure at age 65 */
  borrowerAge?: number;
}

/**
 * Maximum monthly instalment allowed by the servicing ratios and the loan it supports at the stress rate.
 * - Bank loans: TDSR 55% of income minus all other debts; for HDB flats and new ECs ALSO MSR 30% of income minus other
 *   property-loan instalments; the lower binds. Stress rate max(4%, thereafter rate); tenure capped at 30 / 35 years.
 * - HDB loans: HDB's own MSR 30% (TDSR is a MAS rule for financial institutions and is not applied). Stress rate
 *   max(3%, HDB rate); tenure capped at 25 years and, when `borrowerAge` is given, at age 65.
 */
export function maxServiceableLoan(input: ServicingInput, lender: "bank" | "hdb" = "bank") {
  const income = Math.max(0, input.monthlyIncome || 0);
  const tdsrRoom = Math.max(0, income * TDSR_LIMIT - Math.max(0, input.monthlyDebts || 0));
  const msrCapped = lender === "hdb" || msrApplies(input.propertyClass);
  const msrRoom = msrCapped ? Math.max(0, income * MSR_LIMIT - Math.max(0, input.monthlyPropertyLoanInstalments || 0)) : Number.POSITIVE_INFINITY;
  const maxInstalment = lender === "hdb" ? msrRoom : Math.min(tdsrRoom, msrRoom);
  const floor = lender === "hdb" ? HDB_LOAN_STRESS_RATE_PCT : BANK_STRESS_RATE_PCT;
  const thereafter = input.thereafterRatePct ?? (lender === "hdb" ? HDB_LOAN_RATE_PCT : floor);
  const rate = input.stressRatePct ?? Math.max(floor, thereafter);
  const tenure = lender === "hdb" ? hdbLoanMaxTenure(input.tenureYears, input.borrowerAge) : Math.max(0, Math.min(input.tenureYears, maxBankTenure(input.propertyClass)));
  return {
    maxInstalment,
    binding: lender === "hdb" ? ("msr" as const) : msrRoom < tdsrRoom ? ("msr" as const) : ("tdsr" as const),
    stressRatePct: rate,
    tenureYears: tenure,
    maxLoan: principalFromPayment(maxInstalment, rate, tenure),
    /** TDSR instalment room (not applied to HDB loans) */
    tdsrInstalmentCap: tdsrRoom,
    /** MSR instalment room, null when MSR does not apply */
    msrInstalmentCap: msrCapped ? msrRoom : null,
  };
}

/* ------------------------------------------------------------------ */
/* HDB concessionary loan LTV                                          */
/* ------------------------------------------------------------------ */

export interface HdbLoanLtvDetail {
  ltv: number;
  /** true when the remaining lease does not cover the youngest buyer to age 95 */
  prorated: boolean;
  /** remaining lease ÷ (95 − youngest age), capped at 1 */
  ratio: number;
  status: RuleStatus;
}

/**
 * HDB loan LTV: 75% of the lower of price and valuation; pro-rated when the remaining lease cannot cover the youngest
 * buyer to age 95. The pro-rating itself is confirmed (HDB), but the formula 75% × remaining ÷ (95 − youngest age) is
 * the research's assumption by analogy with CPF (loan-rules.md §3–4): status "unverified" whenever it bites.
 */
export function hdbLoanLtvDetail(remainingLeaseYears?: number, youngestBuyerAge?: number): HdbLoanLtvDetail {
  if (remainingLeaseYears == null || youngestBuyerAge == null || !Number.isFinite(remainingLeaseYears) || !Number.isFinite(youngestBuyerAge)) {
    return { ltv: HDB_LOAN_LTV, prorated: false, ratio: 1, status: RULE_META.hdbLoanLtv.status };
  }
  const needed = CPF_LEASE_COVER_AGE - youngestBuyerAge;
  const remaining = Math.max(0, remainingLeaseYears);
  if (needed <= 0 || remaining >= needed) return { ltv: HDB_LOAN_LTV, prorated: false, ratio: 1, status: RULE_META.hdbLoanLtv.status };
  const ratio = remaining / needed;
  return { ltv: HDB_LOAN_LTV * ratio, prorated: true, ratio, status: RULE_META.hdbLoanLtvProration.status };
}

/** HDB loan LTV (0.75), pro-rated when `remainingLeaseYears` and `youngestBuyerAge` show the lease falls short of age 95. */
export function hdbLoanLtv(remainingLeaseYears?: number, youngestBuyerAge?: number): number {
  return hdbLoanLtvDetail(remainingLeaseYears, youngestBuyerAge).ltv;
}

/* ------------------------------------------------------------------ */
/* Full loan eligibility                                               */
/* ------------------------------------------------------------------ */

export interface BankLoanInput {
  price: number;
  /** bank valuation; the LTV base is the lower of price and valuation (default: price) */
  valuation?: number;
  propertyClass: PropertyClass;
  outstandingLoans: number;
  tenureYears: number;
  /** income-weighted average age */
  borrowerAge: number;
  monthlyIncome: number;
  monthlyDebts: number;
  monthlyPropertyLoanInstalments?: number;
  thereafterRatePct?: number;
  stressRatePct?: number;
  /** borrower is a company / non-individual: 15% LTV (see `bankLtv`) */
  nonIndividual?: boolean;
}

/**
 * Maximum bank loan for a purchase: min(LTV × lower of price and valuation, servicing loan at the stress rate).
 * Tenure is capped at the MAS maximum before the LTV tier is chosen.
 */
export function bankLoanEligibility(input: BankLoanInput) {
  const tenureYears = Math.max(0, Math.min(input.tenureYears, maxBankTenure(input.propertyClass)));
  const ltvBase = Math.min(input.price, input.valuation ?? input.price);
  const ltv = bankLtv(input.propertyClass, input.outstandingLoans, tenureYears, input.borrowerAge, { nonIndividual: input.nonIndividual });
  const servicing = maxServiceableLoan(
    {
      monthlyIncome: input.monthlyIncome,
      monthlyDebts: input.monthlyDebts,
      monthlyPropertyLoanInstalments: input.monthlyPropertyLoanInstalments,
      propertyClass: input.propertyClass,
      tenureYears,
      thereafterRatePct: input.thereafterRatePct,
      stressRatePct: input.stressRatePct,
    },
    "bank",
  );
  const ltvLoan = ltv.ltv * ltvBase;
  const maxLoan = Math.min(ltvLoan, servicing.maxLoan);
  return {
    tenureYears,
    ltvBase,
    ltv: ltv.ltv,
    reducedLtv: ltv.reduced,
    minCashPct: ltv.minCashPct,
    ltvLoan,
    servicing,
    maxLoan,
    binding: ltvLoan <= servicing.maxLoan ? ("ltv" as const) : servicing.binding,
    downpayment: input.price - maxLoan,
    /** minimum cash down payment, as a share of the LTV base (price = valuation in the research examples) */
    minCash: ltv.minCashPct * ltvBase,
    instalmentAtStressRate: monthlyPayment(maxLoan, servicing.stressRatePct, tenureYears),
  };
}

export interface HdbLoanInput {
  price: number;
  valuation?: number;
  monthlyIncome: number;
  monthlyPropertyLoanInstalments?: number;
  /** default 25 */
  tenureYears?: number;
  borrowerAge?: number;
  remainingLeaseYears?: number;
  youngestBuyerAge?: number;
  /** concessionary rate charged, default HDB_LOAN_RATE_PCT */
  ratePct?: number;
}

/** Maximum HDB concessionary loan: min(LTV × lower of price and valuation, MSR loan at max(3%, HDB rate)). */
export function hdbLoanEligibility(input: HdbLoanInput) {
  const ratePct = input.ratePct ?? HDB_LOAN_RATE_PCT;
  const ltvBase = Math.min(input.price, input.valuation ?? input.price);
  const ltv = hdbLoanLtvDetail(input.remainingLeaseYears, input.youngestBuyerAge);
  const servicing = maxServiceableLoan(
    {
      monthlyIncome: input.monthlyIncome,
      monthlyDebts: 0,
      monthlyPropertyLoanInstalments: input.monthlyPropertyLoanInstalments,
      propertyClass: "hdb",
      tenureYears: input.tenureYears ?? HDB_LOAN_MAX_TENURE,
      thereafterRatePct: ratePct,
      borrowerAge: input.borrowerAge,
    },
    "hdb",
  );
  const ltvLoan = ltv.ltv * ltvBase;
  const maxLoan = Math.min(ltvLoan, servicing.maxLoan);
  return {
    tenureYears: servicing.tenureYears,
    ltvBase,
    ltv: ltv.ltv,
    ltvDetail: ltv,
    ltvLoan,
    servicing,
    maxLoan,
    binding: ltvLoan <= servicing.maxLoan ? ("ltv" as const) : ("msr" as const),
    downpayment: input.price - maxLoan,
    instalment: monthlyPayment(maxLoan, ratePct, servicing.tenureYears),
    instalmentAtStressRate: monthlyPayment(maxLoan, servicing.stressRatePct, servicing.tenureYears),
  };
}
