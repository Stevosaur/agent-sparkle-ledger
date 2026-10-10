import { buyerStampDuty, sellerStampDuty, additionalBuyerStampDuty } from "./stamp-duty";
import { amortisationSchedule } from "./mortgage";
import type { BuyerProfile } from "./rules";

/**
 * "Walk-away price": the resale price needed after `holdingYears` to recover everything spent
 * (price, stamp duties, interest paid, agent fee on sale, SSD if sold early, other costs) — i.e. break even.
 */
export interface WalkAwayInput {
  price: number;
  loanAmount: number;
  interestRatePct: number;
  tenureYears: number;
  holdingYears: number;
  buyerProfile: BuyerProfile;
  propertyCount: number;
  /** seller's agent commission as a fraction of the sale price (commonly 1–2% + GST) */
  agentFeePct: number;
  /** other one-off costs: legal fees, renovation, etc. */
  otherCosts: number;
  /** purchase date, for SSD */
  purchaseDate: Date;
}

export function walkAwayPrice(input: WalkAwayInput) {
  const bsd = buyerStampDuty(input.price).total;
  const absd = additionalBuyerStampDuty(input.price, input.buyerProfile, input.propertyCount).total;
  const schedule = amortisationSchedule(input.loanAmount, input.interestRatePct, input.tenureYears);
  const years = Math.max(0, Math.min(input.holdingYears, schedule.length));
  const interestPaid = schedule.slice(0, Math.ceil(years)).reduce((s, y) => s + y.interest, 0);
  const saleDate = new Date(input.purchaseDate.getTime());
  saleDate.setUTCMonth(saleDate.getUTCMonth() + Math.round(input.holdingYears * 12));
  const fixedCost = input.price + bsd + absd + interestPaid + input.otherCosts;
  // sale price S must satisfy S - agentFee(S) - SSD(S) >= fixedCost; solve by bisection (SSD and fee scale with S)
  let lo = 0;
  let hi = fixedCost * 3;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const net = mid - mid * input.agentFeePct - sellerStampDuty(mid, input.purchaseDate, saleDate).total;
    if (net >= fixedCost) hi = mid;
    else lo = mid;
  }
  const breakEven = Math.ceil(hi / 1000) * 1000;
  return {
    breakEven,
    bsd,
    absd,
    interestPaid,
    agentFee: breakEven * input.agentFeePct,
    ssd: sellerStampDuty(breakEven, input.purchaseDate, saleDate).total,
    otherCosts: input.otherCosts,
    requiredGainPct: breakEven / input.price - 1,
  };
}
