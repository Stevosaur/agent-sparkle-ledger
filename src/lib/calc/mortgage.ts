/**
 * Standard amortising loan maths (monthly compounding, payments in arrears). Rates are % per annum, tenures in years
 * (rounded to whole months). Formulas (docs/research/loan-rules.md §7):
 *   r = rate / 12, n = years × 12
 *   instalment = P × r / (1 − (1 + r)^−n)
 *   principal  = instalment × (1 − (1 + r)^−n) / r
 *   balance after k payments = P × (1 + r)^k − instalment × ((1 + r)^k − 1) / r
 */

export function monthlyPayment(principal: number, annualRatePct: number, years: number): number {
  if (!(principal > 0) || !(years > 0)) return 0;
  const n = Math.round(years * 12);
  if (n <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Largest principal that a monthly payment can service. */
export function principalFromPayment(payment: number, annualRatePct: number, years: number): number {
  if (!(payment > 0) || !(years > 0)) return 0;
  const n = Math.round(years * 12);
  if (n <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return payment * n;
  return (payment * (1 - Math.pow(1 + r, -n))) / r;
}

/** Outstanding balance after `months` scheduled payments (closed form; 0 once the loan is repaid). */
export function balanceAfter(principal: number, annualRatePct: number, years: number, months: number): number {
  if (!(principal > 0) || !(years > 0)) return 0;
  const n = Math.round(years * 12);
  const k = Math.max(0, Math.min(Math.round(months), n));
  if (k >= n) return 0;
  const r = annualRatePct / 100 / 12;
  const pmt = monthlyPayment(principal, annualRatePct, years);
  if (r === 0) return Math.max(0, principal - pmt * k);
  const g = Math.pow(1 + r, k);
  return Math.max(0, principal * g - (pmt * (g - 1)) / r);
}

/** Interest paid over the first `months` payments (= payments made − principal repaid). */
export function interestPaidOver(principal: number, annualRatePct: number, years: number, months: number): number {
  if (!(principal > 0) || !(years > 0)) return 0;
  const n = Math.round(years * 12);
  const k = Math.max(0, Math.min(Math.round(months), n));
  const pmt = monthlyPayment(principal, annualRatePct, years);
  return pmt * k - (principal - balanceAfter(principal, annualRatePct, years, k));
}

export interface AmortisationYear {
  year: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

/** Year-by-year schedule (the last row may cover fewer than 12 months when the tenure is not a whole number of years). */
export function amortisationSchedule(principal: number, annualRatePct: number, years: number): AmortisationYear[] {
  const n = Math.round(years * 12);
  const r = annualRatePct / 100 / 12;
  const pmt = monthlyPayment(principal, annualRatePct, years);
  const out: AmortisationYear[] = [];
  let balance = principal;
  let yi = 0;
  let yp = 0;
  let ypay = 0;
  for (let m = 1; m <= n; m++) {
    const interest = balance * r;
    // the final payment clears any floating-point residue
    const princ = m === n ? balance : Math.min(balance, pmt - interest);
    balance = Math.max(0, balance - princ);
    yi += interest;
    yp += princ;
    ypay += interest + princ;
    if (m % 12 === 0 || m === n) {
      out.push({ year: Math.ceil(m / 12), payment: ypay, interest: yi, principal: yp, balance });
      yi = 0;
      yp = 0;
      ypay = 0;
    }
  }
  return out;
}

export function totalInterest(principal: number, annualRatePct: number, years: number): number {
  return monthlyPayment(principal, annualRatePct, years) * Math.round(years * 12) - principal;
}

/**
 * Refinancing saver: moving the outstanding balance to a new rate for the remaining tenure.
 * `savingOverHorizon` = instalment difference × months − fees (cash-flow view, as before).
 * `interestSavedOverHorizon` = interest at the current rate − interest at the new rate over the horizon − fees
 * (the cheaper loan also repays principal faster, so this is the economic saving).
 */
export function refinanceSavings(balance: number, currentRatePct: number, newRatePct: number, remainingYears: number, fees = 0, horizonYears = Math.min(3, remainingYears)) {
  const cur = monthlyPayment(balance, currentRatePct, remainingYears);
  const nxt = monthlyPayment(balance, newRatePct, remainingYears);
  const months = Math.round(horizonYears * 12);
  return {
    currentPayment: cur,
    newPayment: nxt,
    monthlySaving: cur - nxt,
    savingOverHorizon: (cur - nxt) * months - fees,
    interestSavedOverHorizon: interestPaidOver(balance, currentRatePct, remainingYears, months) - interestPaidOver(balance, newRatePct, remainingYears, months) - fees,
    horizonYears,
  };
}
