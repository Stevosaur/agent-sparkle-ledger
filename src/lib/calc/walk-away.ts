import { absdRate as currentAbsdRate, absdRateAt, buyerStampDuty, flatDuty, sellerStampDuty, type SsdResult } from "./stamp-duty";
import { interestPaidOver } from "./mortgage";
import { addCalendarMonths, formatDay, toSgDay } from "./dates";
import type { BuyerProfile } from "./rules";

/**
 * "Walk-away price": the resale price needed after `holdingYears` to recover everything spent — price, BSD + ABSD,
 * interest paid, the seller's agent fee, SSD if sold early, and other costs — i.e. break even.
 * Principal repayments are not a cost: they reduce the loan that the sale proceeds repay, so
 *   net proceeds − outstanding loan − cash put in = S − agentFee(S) − SSD(S) − (price + duties + interest + other costs).
 */
export interface WalkAwayInput {
  price: number;
  loanAmount: number;
  interestRatePct: number;
  tenureYears: number;
  holdingYears: number;
  buyerProfile: BuyerProfile;
  propertyCount: number;
  /** seller's agent commission as a fraction of the sale price, including any GST charged on it (user input) */
  agentFeePct: number;
  /** other one-off costs: legal fees, renovation, etc. */
  otherCosts: number;
  /** date of acquisition (OTP exercised / S&P signed): selects the stamp-duty tables and starts the SSD holding period */
  purchaseDate: Date;
}

export function walkAwayPrice(input: WalkAwayInput) {
  const bsd = buyerStampDuty(input.price, "residential", { date: input.purchaseDate }).total;
  // ABSD in force at the purchase date when the research covers it (from 6 Jul 2018); otherwise today's rate, which the
  // research does NOT support for earlier purchases — `absdFromDatedTable: false` tells the UI to say so.
  const datedRate = absdRateAt(input.buyerProfile, input.propertyCount, input.purchaseDate);
  const absd = flatDuty(input.price, datedRate ?? currentAbsdRate(input.buyerProfile, input.propertyCount));

  const holdingMonths = Math.max(0, Math.round(input.holdingYears * 12));
  // interest actually paid over the holding period, month by month (capped at the loan tenure)
  const interestPaid = interestPaidOver(input.loanAmount, input.interestRatePct, input.tenureYears, holdingMonths);

  const acquired = toSgDay(input.purchaseDate);
  const saleDay = acquired ? formatDay(addCalendarMonths(acquired, holdingMonths)) : null;
  const ssdAt = (s: number): SsdResult => sellerStampDuty(s, input.purchaseDate, saleDay ?? "invalid");

  const fixedCost = input.price + bsd + absd + interestPaid + input.otherCosts;
  // sale price S must satisfy S − agentFee(S) − SSD(S) ≥ fixedCost; net(S) rises with S while fee + SSD rate < 100%
  const net = (s: number) => s - s * input.agentFeePct - ssdAt(s).total;
  let lo = 0;
  let hi = Math.max(1, fixedCost);
  for (let i = 0; i < 60 && net(hi) < fixedCost; i++) hi *= 2;
  // no finite price breaks even when agent fee + SSD take (almost) the whole sale price
  const reachable = net(hi) >= fixedCost;
  for (let i = 0; reachable && i < 200 && hi - lo > 0.01; i++) {
    const mid = (lo + hi) / 2;
    if (net(mid) >= fixedCost) hi = mid;
    else lo = mid;
  }
  const breakEven = reachable ? Math.ceil(hi / 1000) * 1000 : Number.POSITIVE_INFINITY;
  const ssd = ssdAt(breakEven);
  return {
    breakEven,
    bsd,
    absd,
    /** false when the purchase predates the researched ABSD tables (6 Jul 2018) and today's rate was used instead */
    absdFromDatedTable: datedRate != null,
    interestPaid,
    agentFee: breakEven * input.agentFeePct,
    ssd: ssd.total,
    otherCosts: input.otherCosts,
    requiredGainPct: breakEven / input.price - 1,
    /** date the sale is assumed to happen (purchase date + holding period, calendar months) */
    saleDate: saleDay,
    ssdRate: ssd.rate,
    ssdHoldingYearBand: ssd.holdingYearBand,
    /** sale within ±1 day of an SSD anniversary: the band is contested (show "check with IRAS") */
    ssdNearAnniversary: ssd.nearAnniversary,
    ssdAlternative: ssd.alternative,
  };
}
