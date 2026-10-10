import { additionalBuyerStampDuty, buyerStampDuty } from "./stamp-duty";
import { bankLtv, maxServiceableLoan, type PropertyClass } from "./loan";
import { monthlyPayment } from "./mortgage";
import { HDB_LOAN_LTV, HDB_LOAN_MAX_TENURE, HDB_LOAN_RATE_PCT } from "./rules";
import type { BuyerProfile } from "./rules";

export interface AffordabilityInput {
  cash: number;
  cpfOa: number;
  monthlyIncome: number;
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
  /** rate used for the displayed repayment (not the stress test), % p.a. */
  interestRatePct: number;
}

export interface AffordabilityResult {
  maxPrice: number;
  loan: number;
  ltv: number;
  downpayment: number;
  minCash: number;
  cashUsed: number;
  cpfUsed: number;
  bsd: number;
  absd: number;
  monthlyPayment: number;
  maxServiceableLoan: number;
  tenureYears: number;
  /** which limit capped the price */
  binding: "ltv-funds" | "servicing";
}

/**
 * Highest price the buyer can pay: price P is affordable when
 *   loan = min(LTV × P, max serviceable loan)
 *   P + BSD(P) + ABSD(P) - loan <= cash + CPF OA
 *   P × minCash% + (stamp duties) <= cash  (stamp duties may be paid from CPF in practice, but we keep them conservative)
 * Solved by bisection because stamp duty is progressive.
 */
export function affordability(input: AffordabilityInput): AffordabilityResult {
  const lender = input.lender;
  const tenure = lender === "hdb" ? Math.min(input.tenureYears, HDB_LOAN_MAX_TENURE) : input.tenureYears;
  const ltvInfo = lender === "hdb" ? { ltv: HDB_LOAN_LTV, minCashPct: 0 } : bankLtv(input.propertyClass, input.outstandingLoans, tenure, input.age);
  const serv = maxServiceableLoan(
    { monthlyIncome: input.monthlyIncome, monthlyDebts: input.monthlyDebts, propertyClass: input.propertyClass, tenureYears: tenure },
    lender,
  );
  const funds = Math.max(0, input.cash) + Math.max(0, input.cpfOa);

  const feasible = (p: number) => {
    const loan = Math.min(ltvInfo.ltv * p, serv.maxLoan);
    const duties = buyerStampDuty(p).total + additionalBuyerStampDuty(p, input.buyerProfile, input.propertyCount).total;
    const needCash = p * ltvInfo.minCashPct;
    return p + duties - loan <= funds && needCash <= input.cash;
  };

  let lo = 0;
  let hi = 50_000_000;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (feasible(mid)) lo = mid;
    else hi = mid;
  }
  const price = Math.floor(lo / 1000) * 1000;
  const loan = Math.min(ltvInfo.ltv * price, serv.maxLoan);
  const bsd = buyerStampDuty(price).total;
  const absd = additionalBuyerStampDuty(price, input.buyerProfile, input.propertyCount).total;
  const downpayment = price - loan;
  const minCash = price * ltvInfo.minCashPct;
  // pay the cash minimum first, then CPF, then remaining cash
  const cpfUsed = Math.min(Math.max(0, input.cpfOa), Math.max(0, downpayment - minCash));
  const cashUsed = downpayment - cpfUsed + bsd + absd;
  return {
    maxPrice: price,
    loan,
    ltv: ltvInfo.ltv,
    downpayment,
    minCash,
    cashUsed,
    cpfUsed,
    bsd,
    absd,
    monthlyPayment: monthlyPayment(loan, lender === "hdb" ? HDB_LOAN_RATE_PCT : input.interestRatePct, tenure),
    maxServiceableLoan: serv.maxLoan,
    tenureYears: tenure,
    binding: loan >= serv.maxLoan - 1 ? "servicing" : "ltv-funds",
  };
}
