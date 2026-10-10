/** Standard amortising loan maths (monthly compounding, payments in arrears). Rates are % per annum. */

export function monthlyPayment(principal: number, annualRatePct: number, years: number): number {
  if (!(principal > 0) || !(years > 0)) return 0;
  const n = Math.round(years * 12);
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Largest principal that a monthly payment can service. */
export function principalFromPayment(payment: number, annualRatePct: number, years: number): number {
  if (!(payment > 0) || !(years > 0)) return 0;
  const n = Math.round(years * 12);
  const r = annualRatePct / 100 / 12;
  if (r === 0) return payment * n;
  return (payment * (1 - Math.pow(1 + r, -n))) / r;
}

export interface AmortisationYear {
  year: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

/** Year-by-year schedule. */
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
    const princ = Math.min(balance, pmt - interest);
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
 * Refinancing saver: monthly and total interest saved by moving the outstanding balance to a new rate
 * for the remaining tenure (ignores fees unless given).
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
    horizonYears,
  };
}
