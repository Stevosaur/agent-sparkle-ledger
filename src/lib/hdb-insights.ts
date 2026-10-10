/**
 * Pure computations for HDB block pages: medians by flat type, rental yields, MOP cohorts, price-history
 * series, lease outlook and the response shapes of the gated HDB route handlers.
 *
 * No data-layer (server-only) imports: server pages and route handlers pass data in, client components
 * import the response types only.
 */

import { HDB_FLAT_TYPES, type HdbBlock, type HdbRental, type HdbTransaction, type LatLng, type LaunchType, type MonthlyStat, type NewLaunch, type TownSummary } from "@/lib/data/types";
import { MONTH_EPOCH_YEAR, monthLabel } from "@/lib/data/months";
import { median } from "@/lib/stats-math";
import { haversineM } from "@/lib/geo-math";
import { grossYield } from "@/lib/calc/returns";
import { balaPct, cpfUsage, remainingLeaseYears } from "@/lib/calc/lease";
import { CPF_LEASE_COVER_AGE, HDB_LEASE_YEARS, HDB_MOP_YEARS } from "@/lib/calc/rules";
import { titleCase } from "@/lib/slug";

/* ------------------------------------------------------------------ */
/* Labels & ordering                                                   */
/* ------------------------------------------------------------------ */

/** Position of a flat type in HDB's natural order (1 ROOM … MULTI-GENERATION); unknown types sort last. */
export function flatTypeRank(flatType: string): number {
  const i = (HDB_FLAT_TYPES as readonly string[]).indexOf(flatType);
  return i === -1 ? HDB_FLAT_TYPES.length : i;
}

export function compareFlatTypes(a: string, b: string): number {
  return flatTypeRank(a) - flatTypeRank(b) || a.localeCompare(b);
}

/** "4 ROOM" -> "4 Room" */
export function flatTypeLabel(flatType: string): string {
  return titleCase(flatType);
}

/** "Blk 872A Tampines St 86" */
export function blockLabel(b: Pick<HdbBlock, "block" | "street">): string {
  return `Blk ${b.block} ${titleCase(b.street)}`;
}

/** Distinct flat types in natural order. */
export function distinctFlatTypes(rows: readonly { flatType: string }[]): string[] {
  return [...new Set(rows.map((r) => r.flatType))].sort(compareFlatTypes);
}

/** "04 TO 06" -> "04–06" */
export function storeyLabel(range: string): string {
  return range.replace(/\s*TO\s*/i, "–");
}

/* ------------------------------------------------------------------ */
/* Windows & medians                                                   */
/* ------------------------------------------------------------------ */

/** True when month index `m` falls in the `months`-month window ending at `latest` (inclusive). */
export function inWindow(m: number, latest: number, months: number): boolean {
  return m <= latest && m > latest - months;
}

export interface FlatTypeMedian {
  flatType: string;
  count: number;
  median: number;
}

/** Median of `value` per flat type (non-finite values skipped), flat types in natural order. */
export function mediansByFlatType<T extends { flatType: string }>(rows: readonly T[], value: (row: T) => number): FlatTypeMedian[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const v = value(row);
    if (!Number.isFinite(v)) continue;
    const g = groups.get(row.flatType);
    if (g) g.push(v);
    else groups.set(row.flatType, [v]);
  }
  return [...groups]
    .map(([flatType, values]) => ({ flatType, count: values.length, median: median(values) }))
    .sort((a, b) => compareFlatTypes(a.flatType, b.flatType));
}

/** Most-sold flat type in a block; ties (or no sales) fall back to the largest unit-mix share. */
export function dominantFlatType(txs: readonly { flatType: string }[], unitMix: HdbBlock["unitMix"] = {}): string | null {
  const counts = new Map<string, number>();
  for (const t of txs) counts.set(t.flatType, (counts.get(t.flatType) ?? 0) + 1);
  const mix = unitMix as Record<string, number | undefined>;
  const candidates = counts.size > 0 ? [...counts.keys()] : Object.keys(mix).filter((k) => (mix[k] ?? 0) > 0);
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || (mix[b] ?? 0) - (mix[a] ?? 0) || compareFlatTypes(a, b))[0];
}

/* ------------------------------------------------------------------ */
/* Price history series                                                */
/* ------------------------------------------------------------------ */

export type Granularity = "month" | "quarter" | "year";

/**
 * Pick a period length so the block's medians are not single-sale noise: monthly only when the most-traded
 * flat type averages 3+ sales a month (and 36+ sales), quarterly at 1+ a month (and 12+ sales), else yearly.
 */
export function chooseGranularity(txs: readonly { monthIndex: number; flatType: string }[]): Granularity {
  const byType = new Map<string, { n: number; min: number; max: number }>();
  for (const t of txs) {
    const g = byType.get(t.flatType);
    if (g) {
      g.n++;
      if (t.monthIndex < g.min) g.min = t.monthIndex;
      if (t.monthIndex > g.max) g.max = t.monthIndex;
    } else byType.set(t.flatType, { n: 1, min: t.monthIndex, max: t.monthIndex });
  }
  let best: { n: number; min: number; max: number } | null = null;
  for (const g of byType.values()) if (!best || g.n > best.n) best = g;
  if (!best) return "year";
  const perMonth = best.n / (best.max - best.min + 1);
  if (best.n >= 36 && perMonth >= 3) return "month";
  if (best.n >= 12 && perMonth >= 1) return "quarter";
  return "year";
}

/** First month index of the period containing `m`. */
export function periodStart(m: number, g: Granularity): number {
  if (g === "month") return m;
  if (g === "quarter") return Math.floor(m / 3) * 3;
  return Math.floor(m / 12) * 12;
}

/** Month index used to plot a period: the month itself, the middle month of a quarter, or July for a year. */
export function periodX(m: number, g: Granularity): number {
  if (g === "month") return m;
  if (g === "quarter") return periodStart(m, g) + 1;
  return periodStart(m, g) + 6;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Human label for the period plotted at `x`: "Aug 2026", "Q3 2026" or "2026". */
export function periodLabel(x: number, g: Granularity): string {
  const year = MONTH_EPOCH_YEAR + Math.floor(x / 12);
  if (g === "year") return String(year);
  if (g === "quarter") return `Q${Math.floor((x % 12) / 3) + 1} ${year}`;
  return `${MONTHS_SHORT[x % 12]} ${year}`;
}

export interface PricePoint {
  /** month index the period is plotted at */
  x: number;
  /** median resale price in the period */
  y: number;
  /** number of sales in the period */
  n: number;
}

export interface FlatTypeSeries {
  flatType: string;
  points: PricePoint[];
}

/** Median resale price per flat type per period, flat types in natural order, points oldest first. */
export function blockPriceSeries(
  txs: readonly Pick<HdbTransaction, "monthIndex" | "flatType" | "price">[],
  granularity: Granularity = chooseGranularity(txs),
): { granularity: Granularity; series: FlatTypeSeries[]; fromMonth: number | null } {
  const groups = new Map<string, Map<number, number[]>>();
  let fromMonth: number | null = null;
  for (const t of txs) {
    if (!(t.price > 0)) continue;
    const x = periodX(t.monthIndex, granularity);
    let byPeriod = groups.get(t.flatType);
    if (!byPeriod) groups.set(t.flatType, (byPeriod = new Map()));
    const arr = byPeriod.get(x);
    if (arr) arr.push(t.price);
    else byPeriod.set(x, [t.price]);
    const start = periodStart(t.monthIndex, granularity);
    if (fromMonth == null || start < fromMonth) fromMonth = start;
  }
  const series = [...groups]
    .sort(([a], [b]) => compareFlatTypes(a, b))
    .map(([flatType, byPeriod]) => ({
      flatType,
      points: [...byPeriod].map(([x, prices]) => ({ x, y: Math.round(median(prices)), n: prices.length })).sort((a, b) => a.x - b.x),
    }));
  return { granularity, series, fromMonth };
}

/** Town monthly median prices from a stats series, clipped to start at `fromMonth`. */
export function townMedianPoints(points: readonly MonthlyStat[] | null | undefined, fromMonth: number | null): { x: number; y: number }[] {
  if (!points) return [];
  return points
    .filter((p) => p.medianPrice > 0 && (fromMonth == null || p.m >= fromMonth))
    .map((p) => ({ x: p.m, y: p.medianPrice }))
    .sort((a, b) => a.x - b.x);
}

/* ------------------------------------------------------------------ */
/* Rentals & yields                                                    */
/* ------------------------------------------------------------------ */

export interface RentalSummary {
  months: number;
  /** "YYYY-MM" window bounds, null when no rental data exists at all */
  fromMonth: string | null;
  toMonth: string | null;
  total: number;
  byFlatType: { flatType: string; count: number; medianRent: number }[];
}

/** Rental approvals in the `months` months to `latestMonth`: count and median rent per flat type. */
export function summariseRentals(rentals: readonly Pick<HdbRental, "monthIndex" | "flatType" | "monthlyRent">[], latestMonth: number | null, months = 24): RentalSummary {
  if (latestMonth == null) return { months, fromMonth: null, toMonth: null, total: 0, byFlatType: [] };
  const recent = rentals.filter((r) => inWindow(r.monthIndex, latestMonth, months) && r.monthlyRent > 0);
  return {
    months,
    fromMonth: monthLabel(latestMonth - months + 1),
    toMonth: monthLabel(latestMonth),
    total: recent.length,
    byFlatType: mediansByFlatType(recent, (r) => r.monthlyRent).map(({ flatType, count, median: m }) => ({ flatType, count, medianRent: Math.round(m) })),
  };
}

export interface YieldRow {
  flatType: string;
  saleCount: number;
  medianPrice: number | null;
  rentCount: number;
  medianRent: number | null;
  /** annual rent / price as a fraction; null unless the block has both sales and rentals in the window */
  grossYield: number | null;
  townMedianPrice: number | null;
  townMedianRent: number | null;
  townGrossYield: number | null;
}

function finiteOrNull(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}

/**
 * Gross yield per flat type: block median rent (12 months) × 12 / block median price (12 months), next to
 * the town's 12-month medians. Rows cover flat types with block sales or rentals in the window plus `extraFlatTypes`.
 */
export function yieldsByFlatType(input: {
  sales: readonly Pick<HdbTransaction, "monthIndex" | "flatType" | "price">[];
  rentals: readonly Pick<HdbRental, "monthIndex" | "flatType" | "monthlyRent">[];
  salesLatestMonth: number | null;
  rentalsLatestMonth: number | null;
  town?: Pick<TownSummary, "medianPrice12m" | "medianRent12m"> | null;
  extraFlatTypes?: readonly string[];
  months?: number;
}): YieldRow[] {
  const months = input.months ?? 12;
  const sales = input.salesLatestMonth == null ? [] : input.sales.filter((t) => inWindow(t.monthIndex, input.salesLatestMonth!, months) && t.price > 0);
  const rentals = input.rentalsLatestMonth == null ? [] : input.rentals.filter((r) => inWindow(r.monthIndex, input.rentalsLatestMonth!, months) && r.monthlyRent > 0);
  const priceBy = new Map(mediansByFlatType(sales, (t) => t.price).map((m) => [m.flatType, m]));
  const rentBy = new Map(mediansByFlatType(rentals, (r) => r.monthlyRent).map((m) => [m.flatType, m]));
  const types = [...new Set([...priceBy.keys(), ...rentBy.keys(), ...(input.extraFlatTypes ?? [])])].sort(compareFlatTypes);
  const townPrice = (input.town?.medianPrice12m ?? {}) as Record<string, number | undefined>;
  const townRent = (input.town?.medianRent12m ?? {}) as Record<string, number | undefined>;
  return types.map((flatType) => {
    const p = priceBy.get(flatType);
    const r = rentBy.get(flatType);
    const medianPrice = p ? Math.round(p.median) : null;
    const medianRent = r ? Math.round(r.median) : null;
    const tp = townPrice[flatType] ?? null;
    const tr = townRent[flatType] ?? null;
    return {
      flatType,
      saleCount: p?.count ?? 0,
      medianPrice,
      rentCount: r?.count ?? 0,
      medianRent,
      grossYield: medianPrice != null && medianRent != null ? finiteOrNull(grossYield(medianRent, medianPrice)) : null,
      townMedianPrice: tp,
      townMedianRent: tr,
      townGrossYield: tp != null && tr != null ? finiteOrNull(grossYield(tr, tp)) : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* MOP                                                                 */
/* ------------------------------------------------------------------ */

export function mopYearOf(yearCompleted: number | null | undefined): number | null {
  return yearCompleted == null ? null : yearCompleted + HDB_MOP_YEARS;
}

/**
 * MOP note for a block: shown while the MOP year is no earlier than last year
 * (yearCompleted + HDB_MOP_YEARS >= currentYear - 1). `reached` switches the copy to past tense.
 */
export function mopNote(yearCompleted: number | null | undefined, currentYear: number): { mopYear: number; reached: boolean } | null {
  const mopYear = mopYearOf(yearCompleted);
  if (mopYear == null || mopYear < currentYear - 1) return null;
  return { mopYear, reached: mopYear < currentYear };
}

export interface MopBlockRow {
  slug: string;
  label: string;
  town: string;
  yearCompleted: number;
  mopYear: number;
  dwellingUnits: number | null;
  distanceM: number;
}

export interface MopCohort {
  radiusM: number;
  fromYear: number;
  toYear: number;
  totalBlocks: number;
  /** sum of dwelling units over blocks that publish them */
  totalUnits: number;
  blocksWithoutUnits: number;
  byYear: { year: number; blocks: number; units: number }[];
  /** nearest-first within each MOP year, capped at `limit` */
  blocks: MopBlockRow[];
}

/**
 * Nearby blocks whose flats reach MOP (yearCompleted + HDB_MOP_YEARS) in the `horizonYears` calendar years
 * starting with `currentYear`. Blocks without a completion year are skipped.
 */
export function mopCohort(
  nearby: readonly (Pick<HdbBlock, "slug" | "block" | "street" | "town" | "yearCompleted" | "dwellingUnits"> & { distanceM: number })[],
  currentYear: number,
  opts: { radiusM: number; horizonYears?: number; limit?: number },
): MopCohort {
  const horizon = opts.horizonYears ?? 5;
  const fromYear = currentYear;
  const toYear = currentYear + horizon - 1;
  const rows: MopBlockRow[] = [];
  for (const b of nearby) {
    if (b.distanceM > opts.radiusM) continue;
    const mopYear = mopYearOf(b.yearCompleted);
    if (mopYear == null || mopYear < fromYear || mopYear > toYear) continue;
    rows.push({ slug: b.slug, label: blockLabel(b), town: b.town, yearCompleted: b.yearCompleted!, mopYear, dwellingUnits: b.dwellingUnits, distanceM: b.distanceM });
  }
  rows.sort((a, b) => a.mopYear - b.mopYear || a.distanceM - b.distanceM);
  const byYear: MopCohort["byYear"] = [];
  for (let y = fromYear; y <= toYear; y++) {
    const inYear = rows.filter((r) => r.mopYear === y);
    byYear.push({ year: y, blocks: inYear.length, units: inYear.reduce((s, r) => s + (r.dwellingUnits ?? 0), 0) });
  }
  return {
    radiusM: opts.radiusM,
    fromYear,
    toYear,
    totalBlocks: rows.length,
    totalUnits: rows.reduce((s, r) => s + (r.dwellingUnits ?? 0), 0),
    blocksWithoutUnits: rows.filter((r) => r.dwellingUnits == null).length,
    byYear,
    blocks: rows.slice(0, opts.limit ?? 25),
  };
}

/* ------------------------------------------------------------------ */
/* New launches nearby                                                 */
/* ------------------------------------------------------------------ */

export interface LaunchRow {
  slug: string;
  type: LaunchType;
  name: string;
  status: NewLaunch["status"];
  href: string;
  totalUnits: number | null;
  expectedCompletionYear: number | null;
  distanceM: number;
}

/** Launches with coordinates within `radiusM` of `from`, nearest first. */
export function launchesNear(launches: readonly NewLaunch[], from: LatLng, radiusM: number, limit = 20): LaunchRow[] {
  const out: LaunchRow[] = [];
  for (const l of launches) {
    if (l.lat == null || l.lng == null) continue;
    const d = haversineM(from, { lat: l.lat, lng: l.lng });
    if (d > radiusM) continue;
    out.push({
      slug: l.slug,
      type: l.type,
      name: titleCase(l.name),
      status: l.status,
      href: `/new-launch/${l.type}/${l.slug}/`,
      totalUnits: l.totalUnits,
      expectedCompletionYear: l.expectedCompletionYear,
      distanceM: Math.round(d),
    });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Lease                                                               */
/* ------------------------------------------------------------------ */

/** Fractional year at the middle of the date's month (matches monthToYearFraction). */
export function yearFraction(date: Date): number {
  return date.getUTCFullYear() + (date.getUTCMonth() + 0.5) / 12;
}

export interface LeaseOutlook {
  leaseCommenceYear: number;
  expiryYear: number;
  /** remaining years (fractional) today and in 10 / 20 years */
  remainingToday: number;
  remainingIn10: number;
  remainingIn20: number;
  /** Bala's Table values (percent of freehold) and the 10/20-year values relative to today; null while the table is unavailable */
  bala: { today: number; in10: number; in20: number; relIn10: number; relIn20: number } | null;
  cpf: { buyerAge: number; yearsNeededForFullUse: number; allowed: boolean; full: boolean; shareOfValuationLimit: number };
}

/**
 * Lease outlook for a 99-year HDB lease. HDB publishes only the commencement year, so the lease is assumed
 * to start mid-year (the same assumption the data layer uses for pre-2015 remaining-lease estimates).
 */
export function leaseOutlook(leaseCommenceYear: number, nowYear: number, youngestBuyerAge = 35): LeaseOutlook {
  const start = leaseCommenceYear + 0.5;
  const remainingToday = remainingLeaseYears(start, nowYear);
  const remainingIn10 = remainingLeaseYears(start, nowYear + 10);
  const remainingIn20 = remainingLeaseYears(start, nowYear + 20);
  const bToday = balaPct(remainingToday);
  const b10 = balaPct(remainingIn10);
  const b20 = balaPct(remainingIn20);
  const bala = bToday != null && bToday > 0 && b10 != null && b20 != null ? { today: bToday, in10: b10, in20: b20, relIn10: b10 / bToday, relIn20: b20 / bToday } : null;
  const usage = cpfUsage(remainingToday, youngestBuyerAge);
  return {
    leaseCommenceYear,
    expiryYear: leaseCommenceYear + HDB_LEASE_YEARS,
    remainingToday,
    remainingIn10,
    remainingIn20,
    bala,
    cpf: { buyerAge: youngestBuyerAge, yearsNeededForFullUse: CPF_LEASE_COVER_AGE - youngestBuyerAge, ...usage },
  };
}

/* ------------------------------------------------------------------ */
/* Sales rows & pagination (gated sales API)                           */
/* ------------------------------------------------------------------ */

export interface HdbSaleRow {
  month: string;
  flatType: string;
  storeyRange: string;
  floorAreaSqm: number;
  floorAreaSqft: number;
  price: number;
  psf: number;
  flatModel: string;
  remainingLeaseMonths: number | null;
  remainingLeaseEstimated: boolean;
}

export function toSaleRow(t: HdbTransaction): HdbSaleRow {
  return {
    month: t.month,
    flatType: t.flatType,
    storeyRange: t.storeyRange,
    floorAreaSqm: t.floorAreaSqm,
    floorAreaSqft: t.floorAreaSqft,
    price: t.price,
    psf: t.psf,
    flatModel: t.flatModel,
    remainingLeaseMonths: t.remainingLeaseMonths,
    remainingLeaseEstimated: t.remainingLeaseEstimated,
  };
}

/** Parse a 1-based page number; anything invalid becomes 1. */
export function parsePage(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Slice a page; `page` is clamped to [1, totalPages] (totalPages is at least 1). */
export function paginate<T>(rows: readonly T[], page: number, pageSize: number): { page: number; pageSize: number; total: number; totalPages: number; rows: T[] } {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, Math.floor(page)), totalPages);
  return { page: p, pageSize, total, totalPages, rows: rows.slice((p - 1) * pageSize, p * pageSize) };
}

/* ------------------------------------------------------------------ */
/* Gated API response shapes                                           */
/* ------------------------------------------------------------------ */

/** GET /api/gated/hdb/<slug>/sales/?page=&flatType= */
export interface HdbSalesPage {
  slug: string;
  flatType: string | null;
  /** flat types with at least one sale in this block */
  flatTypes: string[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rows: HdbSaleRow[];
}

/** GET /api/gated/hdb/<slug>/context/ */
export interface HdbContextData {
  slug: string;
  town: string;
  /** false when the snapshot has no HDB rental data at all */
  rentalsAvailable: boolean;
  rentals: RentalSummary;
  yields: {
    months: number;
    salesToMonth: string | null;
    rentalsToMonth: string | null;
    rows: YieldRow[];
  };
  /** null when the block has no coordinates */
  mop: MopCohort | null;
  launches: {
    /** false when the snapshot has no URA launch / pipeline data */
    available: boolean;
    radiusM: number;
    /** null when the block has no coordinates */
    rows: LaunchRow[] | null;
  };
}
