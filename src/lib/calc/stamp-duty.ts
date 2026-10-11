import { addCalendarYears, dayNumber, daysInMonth, formatDay, toSgDay, type CalendarDay, type DateInput } from "./dates";
import {
  ABSD_RATES,
  ABSD_RATES_OTHER,
  ABSD_TABLES,
  BSD_MINIMUM_DUTY,
  BSD_TABLES,
  FTA_SC_EQUIVALENT,
  RULE_META,
  SSD_REGIMES,
  type AbsdProfile,
  type BuyerProfile,
  type FtaCountry,
  type RuleStatus,
  type Tier,
} from "./rules";

/**
 * Stamp duties (IRAS). All amounts are computed in integer cents × basis points, so there is no floating-point
 * drift at band edges (docs/research/stamp-duty.md §5), then rounded DOWN to the whole dollar.
 * Duty is charged on the higher of price and market value: pass that higher figure as `value`.
 */

export interface TierBreakdown {
  from: number;
  to: number | null;
  rate: number;
  taxable: number;
  /** unrounded duty on this slice */
  amount: number;
}

const toCents = (dollars: number) => Math.round(dollars * 100);
const toBp = (rate: number) => Math.round(rate * 10_000);
/** cents × bp → whole dollars, rounded down (cents × bp / 10,000 = cents of duty; / 100 = dollars). */
const floorDollars = (centsTimesBp: number) => Math.floor(centsTimesBp / 1_000_000);

/** Progressive (marginal) duty, rounded down to the dollar, with the $1 BSD minimum when any value is dutiable. */
function progressive(value: number, tiers: readonly Tier[]): { total: number; tiers: TierBreakdown[] } {
  const valueCents = toCents(value);
  const out: TierBreakdown[] = [];
  let lowerCents = 0;
  let units = 0;
  for (const t of tiers) {
    if (valueCents <= lowerCents) break;
    const upperCents = t.upTo == null ? Number.POSITIVE_INFINITY : toCents(t.upTo);
    const sliceCents = Math.min(valueCents, upperCents) - lowerCents;
    const sliceUnits = sliceCents * toBp(t.rate);
    out.push({ from: lowerCents / 100, to: t.upTo, rate: t.rate, taxable: sliceCents / 100, amount: sliceUnits / 1_000_000 });
    units += sliceUnits;
    lowerCents = upperCents;
  }
  return { total: valueCents > 0 ? Math.max(BSD_MINIMUM_DUTY, floorDollars(units)) : 0, tiers: out };
}

const sinceDay = (since: string) => toSgDay(since) as CalendarDay;

/** BSD table in force on a date of acquisition (default: today's table). An unparseable date gives today's table. */
export function bsdTableAt(date?: DateInput) {
  const day = date == null ? null : toSgDay(date);
  if (!day) return BSD_TABLES[0];
  return BSD_TABLES.find((t) => dayNumber(day) >= dayNumber(sinceDay(t.since))) ?? BSD_TABLES[BSD_TABLES.length - 1];
}

/**
 * Buyer's Stamp Duty on the higher of price and market value: marginal tiers, rounded down to the dollar,
 * $1 minimum. `opts.date` (date of acquisition) selects an earlier table; default is the current
 * (15 Feb 2023) table. `tableSince` reports which table was used.
 */
export function buyerStampDuty(value: number, kind: "residential" | "non-residential" = "residential", opts: { date?: DateInput } = {}) {
  const table = bsdTableAt(opts.date);
  if (!(value > 0)) return { total: 0, tiers: [] as TierBreakdown[], tableSince: table.since };
  return { ...progressive(value, kind === "residential" ? table.residential : table.nonResidential), tableSince: table.since };
}

/** Duty at a flat rate on the full value, rounded down to the dollar (ABSD and SSD). */
export function flatDuty(value: number, rate: number): number {
  if (!(value > 0) || !(rate > 0)) return 0;
  return floorDollars(toCents(value) * toBp(rate));
}

function ratesFor(profile: AbsdProfile): readonly [number, number, number] | undefined {
  if (Object.prototype.hasOwnProperty.call(ABSD_RATES, profile)) return ABSD_RATES[profile as BuyerProfile];
  if (Object.prototype.hasOwnProperty.call(ABSD_RATES_OTHER, profile)) return ABSD_RATES_OTHER[profile as keyof typeof ABSD_RATES_OTHER];
  return undefined;
}

const countIndex = (propertyCount: number) => Math.min(Math.max(1, Math.floor(propertyCount)), 3) - 1;

/**
 * Current ABSD rate (from 27 Apr 2023) for a buyer. `propertyCount` is the number of residential properties the
 * buyer will own INCLUDING this purchase (1 = first). NaN for an unknown profile or a non-finite count.
 */
export function absdRate(profile: AbsdProfile, propertyCount: number): number {
  const rates = ratesFor(profile);
  if (!rates || !Number.isFinite(propertyCount)) return Number.NaN;
  return rates[countIndex(propertyCount)];
}

/**
 * ABSD rate in force on a date of acquisition (tables from 6 Jul 2018, all unverified-high-confidence).
 * null when the date is before the earliest researched table, or the profile had no ABSD then (trustees before 9 May 2022).
 */
export function absdRateAt(profile: AbsdProfile, propertyCount: number, date: DateInput): number | null {
  const day = toSgDay(date);
  if (!day || !Number.isFinite(propertyCount)) return null;
  const table = ABSD_TABLES.find((t) => dayNumber(day) >= dayNumber(sinceDay(t.since)));
  const rates = table?.rates[profile];
  return rates ? rates[countIndex(propertyCount)] : null;
}

export function additionalBuyerStampDuty(value: number, profile: AbsdProfile, propertyCount: number): { rate: number; total: number } {
  const rate = absdRate(profile, propertyCount);
  return { rate, total: Number.isNaN(rate) ? Number.NaN : flatDuty(value, rate) };
}

/**
 * For joint purchases the highest applicable ABSD rate among the buyers applies to the whole price.
 * (Rule: unverified-high-confidence, stamp-duty.md §2.1.)
 */
export function jointAbsdRate(buyers: { profile: AbsdProfile; propertyCount: number }[]): number {
  return buyers.reduce((max, b) => Math.max(max, absdRate(b.profile, b.propertyCount)), 0);
}

/* ------------------------------------------------------------------ */
/* ABSD for a purchase: FTA treatment and married-couple reliefs       */
/* ------------------------------------------------------------------ */

export interface AbsdBuyer {
  profile: AbsdProfile;
  /** residential properties this buyer will own including this purchase (1 = first) */
  propertyCount: number;
  /** FTA nationality: US nationals, or nationals / permanent residents of Iceland, Liechtenstein, Norway, Switzerland */
  fta?: { country: FtaCountry; basis: "national" | "permanent-resident" };
}

/** True when an individual buyer qualifies for SC-equivalent ABSD under an FTA (individuals only, not entities or trusts). */
export function ftaScEquivalent(buyer: AbsdBuyer): boolean {
  if (!buyer.fta || (buyer.profile !== "FOREIGNER" && buyer.profile !== "SPR")) return false;
  const rule = FTA_SC_EQUIVALENT[buyer.fta.country];
  if (!rule) return false;
  return buyer.fta.basis === "national" ? rule.nationals : rule.permanentResidents;
}

export type MarriedCoupleReliefKind = "married-sc-spr-first-home" | "married-sc-foreigner-first-home" | "married-sc-second-home-refund";

/**
 * Married-couple ABSD remissions and refunds (stamp-duty.md §2.4). ALL UNVERIFIED: the research says to show them as a
 * separate line with an "eligibility subject to IRAS conditions" note and never to change the rate silently, so the
 * calculators only report them (see `absdForPurchase().potentialReliefs`).
 */
export const MARRIED_COUPLE_ABSD_RELIEFS: Record<
  MarriedCoupleReliefKind,
  { mechanism: "remission" | "refund"; summary: string; conditions: readonly string[]; status: RuleStatus; caveat?: string }
> = {
  "married-sc-spr-first-home": {
    mechanism: "remission",
    summary: "SC + SPR married couple jointly buying their first residential property: ABSD remitted to 0%, as for an SC–SC couple.",
    conditions: ["Married couple; one spouse is a Singapore Citizen and the other a Singapore PR", "Bought jointly in both names", "Neither spouse owns any residential property"],
    status: "unverified",
    caveat: "A 2026 secondary source says the remission can be claimed upfront at e-Stamping; otherwise the 5% is paid and claimed back.",
  },
  "married-sc-foreigner-first-home": {
    mechanism: "remission",
    summary: "SC + foreigner married couple jointly buying their first residential property: remission so they are treated like an SC–SC couple (0%).",
    conditions: ["Married couple; one spouse is a Singapore Citizen and the other a foreigner", "Bought jointly in both names", "Neither spouse owns any residential property"],
    status: "unverified",
    caveat: "The research's best understanding is that this remission exists; it must be confirmed with IRAS.",
  },
  "married-sc-second-home-refund": {
    mechanism: "refund",
    summary: "Married couple with at least one SC jointly buying a second residential property: ABSD is paid upfront and can be refunded if the first property is sold in time.",
    conditions: [
      "Married couple with at least one Singapore Citizen spouse, buying jointly",
      "The couple owns no residential property other than the first home and this purchase",
      "The first property is sold within 6 months after the purchase date of the new property (if completed), or after its TOP/CSC, whichever is earlier (if uncompleted)",
      "The refund is applied for within 6 months after the sale of the first property",
    ],
    status: "unverified",
    caveat: "One 2026 practitioner page describes an upfront remission instead; the pay-then-refund model is kept until IRAS confirms.",
  },
};

export interface AbsdRelief {
  kind: MarriedCoupleReliefKind;
  mechanism: "remission" | "refund";
  /** ABSD that would be remitted or refunded if the conditions are met */
  amount: number;
  /** never applied to `total` */
  applied: false;
  status: RuleStatus;
  summary: string;
  conditions: readonly string[];
  caveat?: string;
  source: string;
}

export interface AbsdPurchaseResult {
  /** highest rate among the buyers (FTA treatment applied), charged on the whole value */
  rate: number;
  /** ABSD payable before any married-couple remission or refund */
  total: number;
  buyerRates: number[];
  /** index of the buyer whose rate applies (-1 when there are no buyers) */
  decidingBuyer: number;
  ftaApplied: boolean[];
  /** married-couple reliefs that MAY apply; shown separately, not deducted from `total` */
  potentialReliefs: AbsdRelief[];
  status: RuleStatus;
}

/**
 * ABSD for a purchase by one or more buyers: each buyer's rate (FTA nationals at SC rates), the highest rate applied
 * to the whole value, and any married-couple relief that might apply (reported, not applied).
 */
export function absdForPurchase(value: number, buyers: AbsdBuyer[], opts: { married?: boolean } = {}): AbsdPurchaseResult {
  const ftaApplied = buyers.map(ftaScEquivalent);
  const buyerRates = buyers.map((b, i) => absdRate(ftaApplied[i] ? "SC" : b.profile, b.propertyCount));
  let decidingBuyer = -1;
  let rate = 0;
  buyerRates.forEach((r, i) => {
    if (Number.isNaN(r)) {
      rate = Number.NaN;
      decidingBuyer = i;
    } else if (!Number.isNaN(rate) && (decidingBuyer < 0 || r > rate)) {
      rate = r;
      decidingBuyer = i;
    }
  });
  const total = Number.isNaN(rate) ? Number.NaN : flatDuty(value, rate);
  return {
    rate,
    total,
    buyerRates,
    decidingBuyer,
    ftaApplied,
    potentialReliefs: opts.married ? marriedCoupleReliefs(total, buyers) : [],
    status: ftaApplied.some(Boolean) ? RULE_META.absdFta.status : RULE_META.absdRates.status,
  };
}

function marriedCoupleReliefs(total: number, buyers: AbsdBuyer[]): AbsdRelief[] {
  if (buyers.length !== 2 || !(total > 0)) return [];
  if (!buyers.every((b) => b.profile === "SC" || b.profile === "SPR" || b.profile === "FOREIGNER")) return [];
  if (!buyers.some((b) => b.profile === "SC")) return [];
  const counts = buyers.map((b) => Math.floor(b.propertyCount));
  if (!counts.every((c) => c >= 1)) return [];
  const maxCount = Math.max(...counts);
  let kind: MarriedCoupleReliefKind | null = null;
  if (maxCount === 1) {
    const other = buyers.find((b) => b.profile !== "SC");
    if (other?.profile === "SPR") kind = "married-sc-spr-first-home";
    else if (other?.profile === "FOREIGNER") kind = "married-sc-foreigner-first-home";
  } else if (maxCount === 2) {
    kind = "married-sc-second-home-refund";
  }
  if (!kind) return [];
  const r = MARRIED_COUPLE_ABSD_RELIEFS[kind];
  return [{ kind, mechanism: r.mechanism, amount: total, applied: false, status: r.status, summary: r.summary, conditions: r.conditions, caveat: r.caveat, source: RULE_META.absdMarriedCoupleReliefs.source }];
}

/* ------------------------------------------------------------------ */
/* Seller's Stamp Duty                                                 */
/* ------------------------------------------------------------------ */

export interface SsdBand {
  rate: number;
  total: number;
  /** 1 = sold within the first year, …; null = no SSD */
  holdingYearBand: number | null;
}

export interface SsdResult extends SsdBand {
  /** regime by date of acquisition: "2025-07-04", "2017-03-11", "2011-01-14", "pre-2011" or "invalid-date" */
  regime: string;
  /** status of the regime's rates; "unverified-conflict" when `nearAnniversary` (the band itself is contested) */
  status: RuleStatus;
  /** false when the acquisition predates the modelled regimes (2010 SSD rules) or a date is invalid */
  supported: boolean;
  acquired: string | null;
  disposed: string | null;
  /** disposal within ±1 day of an anniversary: show both bands and a "check with IRAS" note (stamp-duty.md §3.3) */
  nearAnniversary: boolean;
  anniversaryDate: string | null;
  /** the band under the other reading (a sale ON the anniversary falls in the later band), when it differs */
  alternative: SsdBand | null;
}

function ssdRegimeFor(acq: CalendarDay) {
  return SSD_REGIMES.find((r) => dayNumber(acq) >= dayNumber(sinceDay(r.since))) ?? null;
}

const SSD_STATUS: Record<string, RuleStatus> = {
  "2025-07-04": RULE_META.ssd2025.status,
  "2017-03-11": RULE_META.ssd2017.status,
  "2011-01-14": RULE_META.ssd2011.status,
};

/**
 * Seller's Stamp Duty for residential property (flat rate on the higher of selling price and market value, rounded
 * down to the dollar). The regime is chosen by the date of acquisition (OTP exercised / S&P signed) and the holding
 * period runs to the date of disposal. Dates are Singapore calendar days (see dates.ts).
 *
 * Anniversary convention (stamp-duty.md §3.3, UNVERIFIED and contested): a disposal ON the n-th anniversary is
 * "up to n years" (`disposal <= addYears(acquisition, n)`, 29 Feb + 1 year = 28 Feb). A practitioner example implies
 * the later band instead, so for disposals within ±1 day of an anniversary `nearAnniversary` is set and `alternative`
 * holds the other reading's band when it differs. A disposal on the acquisition day itself is in band 1.
 * HDB flats: SSD does not bite because of the MOP (not a formal exemption) — callers should not apply it to HDB.
 */
export function sellerStampDuty(value: number, purchaseDate: DateInput, saleDate: DateInput): SsdResult {
  const acq = toSgDay(purchaseDate);
  const disp = toSgDay(saleDate);
  const none: SsdBand = { rate: 0, total: 0, holdingYearBand: null };
  const base = { acquired: acq ? formatDay(acq) : null, disposed: disp ? formatDay(disp) : null, nearAnniversary: false, anniversaryDate: null, alternative: null };
  if (!acq || !disp) return { ...none, ...base, regime: "invalid-date", status: "unverified", supported: false };
  const regime = ssdRegimeFor(acq);
  if (!regime) return { ...none, ...base, regime: "pre-2011", status: "unverified", supported: false };
  const status = SSD_STATUS[regime.since];
  const d = dayNumber(disp);
  if (d < dayNumber(acq)) return { ...none, ...base, regime: regime.since, status, supported: false };

  const anniversaries = regime.rates.map((_, i) => dayNumber(addCalendarYears(acq, i + 1)));
  const bandOf = (inclusive: boolean): SsdBand => {
    const i = anniversaries.findIndex((a) => (inclusive ? d <= a : d < a));
    if (i < 0 || !(value > 0)) return none;
    const rate = regime.rates[i];
    return { rate, total: flatDuty(value, rate), holdingYearBand: i + 1 };
  };
  const primary = bandOf(true);
  const other = bandOf(false);
  const nearIdx = anniversaries.findIndex((a) => Math.abs(d - a) <= 1);
  return {
    ...primary,
    regime: regime.since,
    // the band of a sale within ±1 day of an anniversary rests on the contested day-count convention
    status: nearIdx >= 0 ? RULE_META.ssdAnniversary.status : status,
    supported: true,
    acquired: base.acquired,
    disposed: base.disposed,
    nearAnniversary: nearIdx >= 0,
    anniversaryDate: nearIdx >= 0 ? formatDay(addCalendarYears(acq, nearIdx + 1)) : null,
    alternative: other.holdingYearBand !== primary.holdingYearBand ? other : null,
  };
}

/**
 * SSD schedule for a purchase: the rate for each holding-year band and the last day of each band (the anniversary,
 * under the convention above), plus the first day with no SSD. Empty when the acquisition predates the modelled regimes.
 */
export function ssdSchedule(purchaseDate: DateInput): { regime: string | null; bands: { band: number; rate: number; lastDay: string }[]; ssdFreeFrom: string | null } {
  const acq = toSgDay(purchaseDate);
  const regime = acq ? ssdRegimeFor(acq) : null;
  if (!acq || !regime) return { regime: null, bands: [], ssdFreeFrom: null };
  const bands = regime.rates.map((rate, i) => ({ band: i + 1, rate, lastDay: formatDay(addCalendarYears(acq, i + 1)) }));
  const last = addCalendarYears(acq, regime.rates.length);
  const next = last.d < daysInMonth(last.y, last.m) ? { ...last, d: last.d + 1 } : last.m < 12 ? { y: last.y, m: last.m + 1, d: 1 } : { y: last.y + 1, m: 1, d: 1 };
  return { regime: regime.since, bands, ssdFreeFrom: formatDay(next) };
}
