import { ABSD_RATES, BSD_NON_RESIDENTIAL, BSD_RESIDENTIAL, SSD_FROM_2017_03_11, SSD_FROM_2025_07_04, type BuyerProfile, type Tier } from "./rules";

export interface TierBreakdown {
  from: number;
  to: number | null;
  rate: number;
  taxable: number;
  amount: number;
}

/** Progressive tier calculation. Amount is rounded down to the dollar as IRAS does for stamp duty. */
function progressive(value: number, tiers: Tier[]): { total: number; tiers: TierBreakdown[] } {
  const out: TierBreakdown[] = [];
  let lower = 0;
  let total = 0;
  for (const t of tiers) {
    if (value <= lower) break;
    const upper = t.upTo ?? Infinity;
    const taxable = Math.min(value, upper) - lower;
    const amount = taxable * t.rate;
    out.push({ from: lower, to: t.upTo, rate: t.rate, taxable, amount });
    total += amount;
    lower = upper;
  }
  return { total: Math.floor(total + 1e-9), tiers: out };
}

/** Buyer's Stamp Duty on the higher of price and market value. */
export function buyerStampDuty(value: number, kind: "residential" | "non-residential" = "residential") {
  if (!(value > 0)) return { total: 0, tiers: [] as TierBreakdown[] };
  return progressive(value, kind === "residential" ? BSD_RESIDENTIAL : BSD_NON_RESIDENTIAL);
}

/**
 * ABSD rate for a buyer. `propertyCount` is the number of residential properties the buyer will own
 * INCLUDING this purchase (1 = first property).
 */
export function absdRate(profile: BuyerProfile, propertyCount: number): number {
  const idx = Math.min(Math.max(1, Math.floor(propertyCount)), 3) - 1;
  return ABSD_RATES[profile][idx];
}

export function additionalBuyerStampDuty(value: number, profile: BuyerProfile, propertyCount: number): { rate: number; total: number } {
  const rate = absdRate(profile, propertyCount);
  return { rate, total: value > 0 ? Math.floor(value * rate + 1e-9) : 0 };
}

/**
 * For joint purchases the highest applicable ABSD rate among the buyers applies to the whole price.
 */
export function jointAbsdRate(buyers: { profile: BuyerProfile; propertyCount: number }[]): number {
  return buyers.reduce((max, b) => Math.max(max, absdRate(b.profile, b.propertyCount)), 0);
}

function addYears(d: Date, years: number): Date {
  const r = new Date(d.getTime());
  r.setUTCFullYear(r.getUTCFullYear() + years);
  return r;
}

/**
 * Seller's Stamp Duty for residential property sold within the holding period.
 * The holding period runs from the purchase date to the sale date; a sale on or before the n-th
 * anniversary falls in year n.
 */
export function sellerStampDuty(value: number, purchaseDate: Date, saleDate: Date): { rate: number; total: number; holdingYearBand: number | null; regime: string } {
  const regime = purchaseDate.getTime() >= Date.parse(`${SSD_FROM_2025_07_04.since}T00:00:00Z`) ? SSD_FROM_2025_07_04 : purchaseDate.getTime() >= Date.parse(`${SSD_FROM_2017_03_11.since}T00:00:00Z`) ? SSD_FROM_2017_03_11 : null;
  if (!regime || !(value > 0) || saleDate <= purchaseDate) return { rate: 0, total: 0, holdingYearBand: null, regime: regime?.since ?? "pre-2017" };
  for (let i = 0; i < regime.rates.length; i++) {
    if (saleDate.getTime() <= addYears(purchaseDate, i + 1).getTime()) {
      const rate = regime.rates[i];
      return { rate, total: Math.floor(value * rate + 1e-9), holdingYearBand: i + 1, regime: regime.since };
    }
  }
  return { rate: 0, total: 0, holdingYearBand: null, regime: regime.since };
}
