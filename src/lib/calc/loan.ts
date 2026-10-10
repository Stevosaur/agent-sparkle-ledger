import { principalFromPayment } from "./mortgage";
import {
  BANK_LTV,
  BANK_MAX_TENURE,
  BANK_STRESS_RATE_PCT,
  HDB_LOAN_LTV,
  HDB_LOAN_MAX_TENURE,
  HDB_LOAN_STRESS_RATE_PCT,
  LTV_AGE_LIMIT,
  LTV_TENURE_THRESHOLD,
  MSR_LIMIT,
  TDSR_LIMIT,
} from "./rules";

export type PropertyClass = "hdb" | "ec-new" | "ec-resale" | "private";

export interface LtvResult {
  ltv: number;
  minCashPct: number;
  reduced: boolean;
}

/**
 * MAS LTV limit for a bank loan. The reduced limit applies when the tenure exceeds the threshold
 * (25 years for HDB flats, 30 years otherwise) or the loan runs past the borrower's age 65.
 * `borrowerAge` should be the income-weighted average age of borrowers.
 */
export function bankLtv(propertyClass: PropertyClass, outstandingLoans: number, tenureYears: number, borrowerAge: number): LtvResult {
  const row = BANK_LTV[Math.min(Math.max(0, Math.floor(outstandingLoans)), 2)];
  const threshold = propertyClass === "hdb" ? LTV_TENURE_THRESHOLD.hdb : LTV_TENURE_THRESHOLD.private;
  const reduced = tenureYears > threshold || borrowerAge + tenureYears > LTV_AGE_LIMIT;
  return { ltv: reduced ? row.reduced : row.standard, minCashPct: reduced ? row.minCashReduced : row.minCashStandard, reduced };
}

export function maxBankTenure(propertyClass: PropertyClass): number {
  return propertyClass === "hdb" ? BANK_MAX_TENURE.hdb : BANK_MAX_TENURE.private;
}

/** MSR applies to HDB flats and to ECs bought from the developer. */
export function msrApplies(propertyClass: PropertyClass): boolean {
  return propertyClass === "hdb" || propertyClass === "ec-new";
}

export interface ServicingInput {
  /** gross monthly income of all borrowers (variable income should already be haircut by the caller) */
  monthlyIncome: number;
  /** other monthly debt obligations (car loans, other mortgages, card minimums) */
  monthlyDebts: number;
  propertyClass: PropertyClass;
  tenureYears: number;
  /** stress-test rate, defaults to the MAS / HDB floor */
  stressRatePct?: number;
}

/** Maximum monthly instalment allowed by TDSR (and MSR where it applies), and the loan it supports at the stress rate. */
export function maxServiceableLoan(input: ServicingInput, lender: "bank" | "hdb" = "bank") {
  const tdsrRoom = Math.max(0, input.monthlyIncome * TDSR_LIMIT - input.monthlyDebts);
  const msrRoom = msrApplies(input.propertyClass) || lender === "hdb" ? input.monthlyIncome * MSR_LIMIT : Infinity;
  const maxInstalment = lender === "hdb" ? msrRoom : Math.min(tdsrRoom, msrRoom);
  const rate = input.stressRatePct ?? (lender === "hdb" ? HDB_LOAN_STRESS_RATE_PCT : BANK_STRESS_RATE_PCT);
  const tenure = Math.min(input.tenureYears, lender === "hdb" ? HDB_LOAN_MAX_TENURE : maxBankTenure(input.propertyClass));
  return {
    maxInstalment,
    binding: lender === "hdb" ? ("msr" as const) : msrRoom < tdsrRoom ? ("msr" as const) : ("tdsr" as const),
    stressRatePct: rate,
    tenureYears: tenure,
    maxLoan: principalFromPayment(maxInstalment, rate, tenure),
  };
}

export function hdbLoanLtv(): number {
  return HDB_LOAN_LTV;
}
