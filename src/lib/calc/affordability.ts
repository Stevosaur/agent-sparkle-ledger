import { additionalBuyerStampDuty, buyerStampDuty } from "./stamp-duty";
import { bankLtv, hdbLoanLtvDetail, hdbLoanMaxTenure, maxBankTenure, maxServiceableLoan, msrApplies, type PropertyClass } from "./loan";
import { cpfUsage } from "./lease";
import { monthlyPayment } from "./mortgage";
import { BANK_STRESS_RATE_PCT, HDB_LOAN_RATE_PCT, HDB_LOAN_STRESS_RATE_PCT, type RuleKey } from "./rules";
import type { BuyerProfile } from "./rules";

export interface AffordabilityInput {
  cash: number;
  cpfOa: number;
  monthlyIncome: number;
  /** all other monthly debt repayments (TDSR) */
  monthlyDebts: number;
  /** income-weighted average age of borrowers */
  age: number;
  propertyClass: PropertyClass;
  lender: "bank" | "hdb";
  buyerProfile: BuyerProfile;
  /** residential properties owned after this purchase (1 = first) */
  propertyCount: number;
  /** outstanding housing loans before this purchase (bank LTV tier) */
  outstandingLoans: number;
  tenureYears: number;
  /** rate used for the displayed repayment, % p.a. (bank loans: also the "thereafter" rate for the stress test) */
  interestRatePct: number;
  /** instalments on existing property loans (already in `monthlyDebts`); they also count for MSR. Default 0. */
  monthlyPropertyLoanInstalments?: number;
  /** remaining lease of the flat, years: enables the CPF lease rules and HDB-loan LTV pro-rating */
  remainingLeaseYears?: number;
  /** youngest buyer's age for the lease-to-95 rules (default: `age`) */
  youngestBuyerAge?: number;
  /** stress-test rate override, % p.a. Default: bank max(4%, interestRatePct); HDB max(3%, HDB rate). */
  stressRatePct?: number;
}

export interface AffordabilityResult {
  maxPrice: number;
  loan: number;
  ltv: number;
  downpayment: number;
  /** minimum cash part of the down payment (bank loans) */
  minCash: number;
  /** cash paid: minimum cash + down payment not covered by CPF + BSD + ABSD */
  cashUsed: number;
  cpfUsed: number;
  bsd: number;
  absd: number;
  monthlyPayment: number;
  maxServiceableLoan: number;
  tenureYears: number;
  /** which limit capped the price: the loan hit the income (TDSR/MSR) cap, or the loan is at the LTV cap and funds ran out */
  binding: "ltv-funds" | "servicing";
  /** the loan cap that applies at the result: LTV × price, or the servicing (stress-test) loan */
  loanLimitedBy: "ltv" | "servicing";
  /**
   * which funding constraint stops a higher price: "cash" = cash for the minimum cash down payment and stamp duties
   * runs out while usable CPF is left; "cash-and-cpf" = all usable CPF and all cash are used
   */
  fundsLimitedBy: "cash" | "cash-and-cpf";
  stressRatePct: number;
  ltvReduced: boolean;
  /** share of the price CPF may cover under the lease rules (1 = full use; 0 = not allowed) */
  cpfShareOfValuationLimit: number;
  cashLeft: number;
  cpfLeft: number;
  /** the search ceiling (S$10bn) was reached */
  searchCapped: boolean;
  /** rules applied, for status badges (see RULE_META) */
  rules: RuleKey[];
}

const PRICE_CEILING = 1e10;

/**
 * Highest price the buyer can pay. For a price P (valuation assumed equal to P):
 *   loan      = min(LTV × P, max serviceable loan at the stress rate)
 *   D         = P − loan                                  (down payment)
 *   minCash   = minCash% × P                              (bank loans; HDB loans have no minimum-cash rule in the research)
 *   cpfUsed   = min(CPF OA, CPF share × P, D − minCash)    (CPF share < 1 for short leases, 0 below 20 years)
 *   cashNeed  = D − cpfUsed + BSD(P) + ABSD(P)            (stamp duties are paid in CASH: the research does not cover
 *                                                          paying them from CPF, so the conservative case is used)
 *   affordable ⇔ cashNeed ≤ cash
 * cashNeed rises with P, so the limit is found by bisection, then rounded down to the S$1,000.
 * Tenure is capped first (bank: 30 / 35 years; HDB loan: 25 years and age 65), and the LTV tier follows the capped tenure.
 * `buyerProfile: "ENTITY"` with a bank loan uses the non-individual 15% LTV and no CPF (a company has no CPF account).
 * With an HDB loan the whole down payment may come from CPF (loan-rules.md §7 Example C; the split is UNVERIFIED).
 */
export function affordability(input: AffordabilityInput): AffordabilityResult {
  const hdbLoan = input.lender === "hdb";
  const age = input.age;
  const youngest = input.youngestBuyerAge ?? age;
  const tenure = hdbLoan ? hdbLoanMaxTenure(input.tenureYears, age) : Math.max(0, Math.min(input.tenureYears, maxBankTenure(input.propertyClass)));

  // A company (ABSD profile "ENTITY") borrows as a non-individual: 15% LTV (loan-rules.md §2.1, UNVERIFIED), and it has
  // no CPF account, so the whole down payment is its own cash. Before this, entities got the individual 75% tier.
  const entity = !hdbLoan && input.buyerProfile === "ENTITY";
  const hdbLtv = hdbLoan ? hdbLoanLtvDetail(input.remainingLeaseYears, youngest) : null;
  const ltvInfo = hdbLtv
    ? { ltv: hdbLtv.ltv, minCashPct: 0, reduced: hdbLtv.prorated }
    : bankLtv(input.propertyClass, input.outstandingLoans, tenure, age, { nonIndividual: entity });

  const thereafter = hdbLoan ? HDB_LOAN_RATE_PCT : Number.isFinite(input.interestRatePct) ? input.interestRatePct : BANK_STRESS_RATE_PCT;
  // repayment shown at the entered rate (bank) or the HDB rate; a missing bank rate falls back to the 4% floor, not NaN
  const displayRate = thereafter;
  const serv = maxServiceableLoan(
    {
      monthlyIncome: input.monthlyIncome,
      monthlyDebts: input.monthlyDebts,
      monthlyPropertyLoanInstalments: input.monthlyPropertyLoanInstalments,
      propertyClass: input.propertyClass,
      tenureYears: tenure,
      thereafterRatePct: thereafter,
      stressRatePct: input.stressRatePct,
      borrowerAge: age,
    },
    input.lender,
  );

  const cpf = entity
    ? { allowed: false, full: false, shareOfValuationLimit: 0 }
    : input.remainingLeaseYears != null
      ? cpfUsage(input.remainingLeaseYears, youngest)
      : { allowed: true, full: true, shareOfValuationLimit: 1 };
  const cash = Math.max(0, input.cash || 0);
  const cpfOa = entity ? 0 : Math.max(0, input.cpfOa || 0);

  const evaluate = (p: number) => {
    const loan = Math.min(ltvInfo.ltv * p, serv.maxLoan);
    const downpayment = p - loan;
    const bsd = buyerStampDuty(p).total;
    const absd = additionalBuyerStampDuty(p, input.buyerProfile, input.propertyCount).total;
    const minCash = p * ltvInfo.minCashPct;
    const cpfCap = Math.min(cpfOa, cpf.shareOfValuationLimit * p);
    const cpfUsed = Math.min(cpfCap, Math.max(0, downpayment - minCash));
    const cashNeeded = downpayment - cpfUsed + bsd + absd;
    return { loan, downpayment, bsd, absd, minCash, cpfCap, cpfUsed, cashNeeded };
  };
  // tolerance of a tenth of a cent for floating-point noise in the loan maths
  const feasible = (p: number) => evaluate(p).cashNeeded <= cash + 1e-3;

  let lo = 0;
  let hi = 1_000_000;
  while (hi < PRICE_CEILING && feasible(hi)) {
    lo = hi;
    hi *= 2;
  }
  const searchCapped = hi >= PRICE_CEILING && feasible(hi);
  if (searchCapped) lo = hi;
  else {
    for (let i = 0; i < 200 && hi - lo > 0.01; i++) {
      const mid = (lo + hi) / 2;
      if (feasible(mid)) lo = mid;
      else hi = mid;
    }
  }

  const atLimit = evaluate(lo);
  const price = Math.floor(lo / 1000) * 1000;
  const r = evaluate(price);
  const cashUsed = r.cashNeeded;

  const rules: RuleKey[] = ["bsdResidential", "bsdRounding", "absdRates", "absdRounding"];
  if (hdbLoan) rules.push("hdbLoanLtv", "hdbLoanMsr", "hdbStressRate", "hdbLoanRate", "hdbLoanTenure", "hdbLoanDownpaymentCpf");
  else if (entity) {
    rules.push("tdsr", "bankStressRate", "bankLtvNonIndividual", "bankMaxTenure");
    if (msrApplies(input.propertyClass)) rules.push("msr");
  } else {
    rules.push("tdsr", "bankStressRate", "bankLtv", "bankMinCash", "bankLtvTriggers", "bankMaxTenure", "incomeWeightedAge");
    if (msrApplies(input.propertyClass)) rules.push("msr");
  }
  if (hdbLtv?.prorated) rules.push("hdbLoanLtvProration");
  if (input.remainingLeaseYears != null && !entity) rules.push("cpfMinLease", "cpfFullUse", "cpfProration");

  const loanLimitedBy = ltvInfo.ltv * price >= serv.maxLoan ? ("servicing" as const) : ("ltv" as const);
  return {
    maxPrice: price,
    loan: r.loan,
    ltv: ltvInfo.ltv,
    downpayment: r.downpayment,
    minCash: r.minCash,
    cashUsed,
    cpfUsed: r.cpfUsed,
    bsd: r.bsd,
    absd: r.absd,
    monthlyPayment: monthlyPayment(r.loan, displayRate, tenure),
    maxServiceableLoan: serv.maxLoan,
    tenureYears: tenure,
    binding: loanLimitedBy === "servicing" ? "servicing" : "ltv-funds",
    loanLimitedBy,
    fundsLimitedBy: atLimit.cpfUsed < atLimit.cpfCap - 0.01 ? "cash" : "cash-and-cpf",
    stressRatePct: serv.stressRatePct,
    ltvReduced: ltvInfo.reduced,
    cpfShareOfValuationLimit: cpf.shareOfValuationLimit,
    cashLeft: cash - cashUsed,
    cpfLeft: cpfOa - r.cpfUsed,
    searchCapped,
    rules,
  };
}

/** Default stress rate the solver uses when none is given (exported for UI copy). */
export function defaultStressRatePct(lender: "bank" | "hdb", interestRatePct: number): number {
  return lender === "hdb" ? Math.max(HDB_LOAN_STRESS_RATE_PCT, HDB_LOAN_RATE_PCT) : Math.max(BANK_STRESS_RATE_PCT, Number.isFinite(interestRatePct) ? interestRatePct : 0);
}
