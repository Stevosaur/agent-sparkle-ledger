/**
 * Pure computations for the private property pages (condo, landed address, landed street) and their
 * gated route handlers. No server-only imports: safe for pages, route handlers, client components and tests.
 */
import { compass, sunPathForDay } from "@/lib/calc/sun";
import { repeatSalePairs } from "@/lib/calc/returns";
import { median } from "@/lib/stats-math";
import { monthLabel } from "@/lib/data/months";
import { titleCase } from "@/lib/slug";
import type { MonthlyStat, PrivateRental, PrivateTransaction, Tenure } from "@/lib/data/types";

/* ------------------------------------------------------------------ */
/* Small formatters                                                    */
/* ------------------------------------------------------------------ */

/** 5 -> "D05"; null -> "—" */
export function formatDistrict(district: number | null | undefined): string {
  if (district == null || !Number.isFinite(district)) return "—";
  return `D${String(district).padStart(2, "0")}`;
}

export type TenureSummary =
  | { kind: "freehold" }
  | { kind: "leasehold"; years: number | null; startYear: number | null; yearsLeft: number | null };

/** Structured tenure for display: Freehold, or "99-year from 2012, ~85 years left". */
export function tenureSummary(tenure: Tenure | null | undefined, currentYear: number): TenureSummary | null {
  if (!tenure) return null;
  if (tenure.kind === "freehold") return { kind: "freehold" };
  const yearsLeft = tenure.years != null && tenure.startYear != null ? Math.max(0, tenure.years - (currentYear - tenure.startYear)) : null;
  return { kind: "leasehold", years: tenure.years, startYear: tenure.startYear, yearsLeft };
}

/** Plain-English tenure line (used in metadata and as a fallback string). */
export function tenureText(tenure: Tenure | null | undefined, currentYear: number): string {
  const t = tenureSummary(tenure, currentYear);
  if (!t) return "Tenure not recorded";
  if (t.kind === "freehold") return "Freehold";
  const head = t.years != null ? `${t.years}-year leasehold` : "Leasehold";
  const from = t.startYear != null ? ` from ${t.startYear}` : "";
  const left = t.yearsLeft != null ? ` (~${t.yearsLeft} years left)` : "";
  return `${head}${from}${left}`;
}

/**
 * Title-case an upper-case address while keeping house-number tokens as published:
 * "17A SAMPLE LANE" -> "17A Sample Lane" (titleCase alone would give "17a").
 */
export function displayAddress(address: string): string {
  return address
    .trim()
    .split(/\s+/)
    .map((w) => (/\d/.test(w) ? w.toUpperCase() : titleCase(w)))
    .join(" ");
}

/* ------------------------------------------------------------------ */
/* Size bands / unit mix                                               */
/* ------------------------------------------------------------------ */

export interface SizeBand {
  key: string;
  label: string;
  /** inclusive lower bound, sqft */
  min: number;
  /** exclusive upper bound, sqft */
  max: number;
}

export const SIZE_BANDS: readonly SizeBand[] = [
  { key: "lt500", label: "<500 sqft", min: 0, max: 500 },
  { key: "500", label: "500–749 sqft", min: 500, max: 750 },
  { key: "750", label: "750–999 sqft", min: 750, max: 1000 },
  { key: "1000", label: "1,000–1,249 sqft", min: 1000, max: 1250 },
  { key: "1250", label: "1,250–1,499 sqft", min: 1250, max: 1500 },
  { key: "1500", label: "1,500+ sqft", min: 1500, max: Number.POSITIVE_INFINITY },
];

/** Size band for a floor area in sqft; null for non-positive / non-finite areas. */
export function sizeBandOf(sqft: number): SizeBand | null {
  if (!(sqft > 0) || !Number.isFinite(sqft)) return null;
  return SIZE_BANDS.find((b) => sqft >= b.min && sqft < b.max) ?? null;
}

/**
 * A sale that describes one unit: bulk purchases (several units in one caveat) report the total price and
 * total area, so they are excluded from size, floor and unit statistics.
 */
export function isSingleUnitSale(t: Pick<PrivateTransaction, "units" | "areaSqft" | "price">): boolean {
  return t.units <= 1 && t.areaSqft > 0 && t.price > 0;
}

export interface UnitMixRow {
  key: string;
  label: string;
  count: number;
  medianPrice: number;
  medianPsf: number;
}

export function unitMix(txs: readonly PrivateTransaction[]): { rows: UnitMixRow[]; sales: number; excludedBulk: number } {
  const groups = new Map<string, { prices: number[]; psfs: number[] }>();
  let excludedBulk = 0;
  let sales = 0;
  for (const t of txs) {
    if (!isSingleUnitSale(t)) {
      if (t.units > 1) excludedBulk++;
      continue;
    }
    const band = sizeBandOf(t.areaSqft);
    if (!band) continue;
    sales++;
    const g = groups.get(band.key) ?? { prices: [], psfs: [] };
    g.prices.push(t.price);
    if (t.psf > 0) g.psfs.push(t.psf);
    groups.set(band.key, g);
  }
  const rows: UnitMixRow[] = [];
  for (const band of SIZE_BANDS) {
    const g = groups.get(band.key);
    if (!g) continue;
    rows.push({ key: band.key, label: band.label, count: g.prices.length, medianPrice: Math.round(median(g.prices)), medianPsf: Math.round(median(g.psfs)) });
  }
  return { rows, sales, excludedBulk };
}

/* ------------------------------------------------------------------ */
/* Sale-type mix                                                       */
/* ------------------------------------------------------------------ */

export interface SaleTypeMix {
  newSale: number;
  subSale: number;
  resale: number;
  total: number;
}

export function saleTypeMix(txs: readonly Pick<PrivateTransaction, "typeOfSale">[]): SaleTypeMix {
  const mix: SaleTypeMix = { newSale: 0, subSale: 0, resale: 0, total: 0 };
  for (const t of txs) {
    mix.total++;
    if (t.typeOfSale === "New Sale") mix.newSale++;
    else if (t.typeOfSale === "Sub Sale") mix.subSale++;
    else mix.resale++;
  }
  return mix;
}

/* ------------------------------------------------------------------ */
/* Chart series                                                        */
/* ------------------------------------------------------------------ */

export interface XY {
  x: number;
  y: number;
}

/** Monthly median psf of a set of sales, ascending by month. */
export function monthlyMedianPsf(txs: readonly Pick<PrivateTransaction, "monthIndex" | "psf">[]): XY[] {
  const byMonth = new Map<number, number[]>();
  for (const t of txs) {
    if (!(t.psf > 0)) continue;
    const arr = byMonth.get(t.monthIndex) ?? [];
    arr.push(t.psf);
    byMonth.set(t.monthIndex, arr);
  }
  return [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([x, v]) => ({ x, y: Math.round(median(v)) }));
}

/**
 * Individual sales since `sinceMonth` as scatter points, ascending by month. Large projects can have thousands of
 * sales, so above `cap` an even sample across the whole period is kept (first and last sale included) rather than
 * only the most recent ones; `total` is the number of sales before sampling so the chart can say it is a sample.
 */
export function salesScatterSample(txs: readonly Pick<PrivateTransaction, "monthIndex" | "psf">[], sinceMonth: number, cap = 600): { points: XY[]; total: number } {
  const all = txs
    .filter((t) => t.monthIndex >= sinceMonth && t.psf > 0)
    .map((t) => ({ x: t.monthIndex, y: t.psf }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const n = all.length;
  const k = Math.max(1, Math.floor(cap));
  if (n <= k) return { points: all, total: n };
  if (k === 1) return { points: [all[n - 1]], total: n };
  const points: XY[] = [];
  for (let i = 0; i < k; i++) points.push(all[Math.round((i * (n - 1)) / (k - 1))]);
  return { points, total: n };
}

/** Points of salesScatterSample() only. */
export function salesScatter(txs: readonly Pick<PrivateTransaction, "monthIndex" | "psf">[], sinceMonth: number, cap = 600): XY[] {
  return salesScatterSample(txs, sinceMonth, cap).points;
}

/** Median psf points of a precomputed stats series from `fromMonth` onwards. */
export function seriesPsfPoints(points: readonly MonthlyStat[] | null | undefined, fromMonth: number, toMonth = Number.POSITIVE_INFINITY): XY[] {
  if (!points) return [];
  return points.filter((p) => p.m >= fromMonth && p.m <= toMonth && p.medianPsf > 0).map((p) => ({ x: p.m, y: p.medianPsf }));
}

/* ------------------------------------------------------------------ */
/* Floor x size grid / stacking plan                                   */
/* ------------------------------------------------------------------ */

/** Sort key for URA floor ranges: "06-10" -> 8, "B1-B5" -> -3, anything else -> null. */
export function floorRangeSortKey(range: string): number | null {
  const m = /^(B?)(\d+)\s*-\s*(B?)(\d+)$/i.exec(range.trim());
  if (!m) return null;
  const lo = (m[1] ? -1 : 1) * Number(m[2]);
  const hi = (m[3] ? -1 : 1) * Number(m[4]);
  return (lo + hi) / 2;
}

export interface GridColumn {
  key: string;
  label: string;
}

export interface FloorSizeCell {
  row: string;
  col: string;
  count: number;
  medianPsf: number;
}

export interface FloorSizeGrid {
  mode: "floor-size";
  /** floor ranges, highest first */
  rows: string[];
  cols: GridColumn[];
  cells: FloorSizeCell[];
  sinceMonth: string;
  sales: number;
}

/** Median psf by floor range x size band for single-unit sales since `sinceMonth` (URA data has no unit numbers). */
export function floorSizeGrid(txs: readonly PrivateTransaction[], sinceMonth: number): FloorSizeGrid {
  const groups = new Map<string, number[]>();
  const rowKeys = new Map<string, number>();
  const colKeys = new Set<string>();
  let sales = 0;
  for (const t of txs) {
    if (t.monthIndex < sinceMonth || !isSingleUnitSale(t) || !(t.psf > 0)) continue;
    const sort = floorRangeSortKey(t.floorRange);
    const band = sizeBandOf(t.areaSqft);
    if (sort == null || !band) continue;
    sales++;
    rowKeys.set(t.floorRange, sort);
    colKeys.add(band.key);
    const k = `${t.floorRange}|${band.key}`;
    const arr = groups.get(k) ?? [];
    arr.push(t.psf);
    groups.set(k, arr);
  }
  const rows = [...rowKeys.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
  const cols = SIZE_BANDS.filter((b) => colKeys.has(b.key)).map((b) => ({ key: b.key, label: b.label }));
  const cells: FloorSizeCell[] = [];
  for (const [k, psfs] of groups) {
    const [row, col] = k.split("|");
    cells.push({ row, col, count: psfs.length, medianPsf: Math.round(median(psfs)) });
  }
  return { mode: "floor-size", rows, cols, cells, sinceMonth: monthLabel(sinceMonth), sales };
}

/** "#05-12" -> { floor: "05", floorNum: 5, stack: "12" }; "#B1-03" -> floorNum -1; null if unparseable. */
export function parseUnit(unit: string | null | undefined): { floor: string; floorNum: number; stack: string } | null {
  if (!unit) return null;
  const m = /^#?\s*(B?)(\d{1,3})\s*-\s*([0-9A-Z]{1,6})$/i.exec(unit.trim());
  if (!m) return null;
  const n = Number(m[2]);
  return { floor: `${m[1].toUpperCase()}${m[2]}`, floorNum: m[1] ? -n : n, stack: m[3].toUpperCase() };
}

export interface StackCell {
  row: string;
  col: string;
  psf: number;
  price: number;
  month: string;
  areaSqft: number;
  unit: string;
}

export interface StackGrid {
  mode: "unit";
  /** floors, highest first */
  rows: string[];
  cols: GridColumn[];
  cells: StackCell[];
  units: number;
}

/** Latest psf per unit on a stack x floor grid (unit-level records only). */
export function stackGrid(txs: readonly PrivateTransaction[]): StackGrid {
  const parsed = txs
    .filter((t) => isSingleUnitSale(t) && t.psf > 0)
    .map((t) => ({ t, u: parseUnit(t.unit) }))
    .filter((x): x is { t: PrivateTransaction; u: NonNullable<ReturnType<typeof parseUnit>> } => x.u != null);
  const addresses = new Set(parsed.map((x) => x.t.address ?? ""));
  const multiBlock = addresses.size > 1;
  const latest = new Map<string, { t: PrivateTransaction; u: NonNullable<ReturnType<typeof parseUnit>>; col: string }>();
  for (const x of parsed) {
    const block = multiBlock && x.t.address ? x.t.address.trim().split(/\s+/)[0] : "";
    const col = block ? `${block}/${x.u.stack}` : x.u.stack;
    const key = `${col}|${x.u.floor}`;
    const prev = latest.get(key);
    if (!prev || x.t.monthIndex > prev.t.monthIndex) latest.set(key, { ...x, col });
  }
  const floors = new Map<string, number>();
  const cols = new Set<string>();
  const cells: StackCell[] = [];
  for (const { t, u, col } of latest.values()) {
    floors.set(u.floor, u.floorNum);
    cols.add(col);
    cells.push({ row: u.floor, col, psf: t.psf, price: t.price, month: t.month, areaSqft: t.areaSqft, unit: t.unit ?? "" });
  }
  const rows = [...floors.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  const colList = [...cols].sort((a, b) => a.localeCompare(b, "en", { numeric: true })).map((c) => ({ key: c, label: multiBlock ? `Blk ${c.replace("/", " #")}` : `#${c}` }));
  return { mode: "unit", rows, cols: colList, cells, units: cells.length };
}

/* ------------------------------------------------------------------ */
/* Repeat-sale (profit & loss) key                                      */
/* ------------------------------------------------------------------ */

/** Identity of a unit for repeat-sale pairs: the unit number, qualified by the address when one is recorded. */
export function unitKeyOf(t: Pick<PrivateTransaction, "unit" | "address">): string | null {
  if (!t.unit) return null;
  return t.address ? `${t.address.trim()} ${t.unit.trim()}` : t.unit.trim();
}

/* ------------------------------------------------------------------ */
/* Time-adjusted estimate                                               */
/* ------------------------------------------------------------------ */

/**
 * Index level at month `m`: median of the series' monthly median psf over the trailing `window` months
 * (m - window, m]. Null when the series has no sales in that window.
 */
export function seriesLevel(points: readonly MonthlyStat[], m: number, window = 6): number | null {
  const vals = points.filter((p) => p.m > m - window && p.m <= m && p.medianPsf > 0 && p.count > 0).map((p) => p.medianPsf);
  return vals.length ? median(vals) : null;
}

export interface TimeAdjustedEstimate {
  estimate: number;
  /** index level now / index level at the sale month */
  factor: number;
  fromLevel: number;
  toLevel: number;
  saleMonth: string;
  /** latest month of the index used (may be earlier than the requested as-of month in thin districts) */
  asOfMonth: string;
}

/**
 * Latest sale price moved by the change in a market index (e.g. the district's median psf series) between the
 * sale month and the index's latest reading at or before `asOfMonth`. Returns null when either end has no index
 * data, or when the latest reading is more than `maxStaleMonths` old. This is an ESTIMATE: it assumes the home
 * moved with its district.
 */
export function timeAdjustedEstimate(
  sale: { monthIndex: number; price: number },
  points: readonly MonthlyStat[],
  asOfMonth: number,
  opts: { window?: number; roundTo?: number; maxStaleMonths?: number } = {},
): TimeAdjustedEstimate | null {
  const { window = 6, roundTo = 10_000, maxStaleMonths = 12 } = opts;
  if (!(sale.price > 0) || sale.monthIndex > asOfMonth) return null;
  let anchor: number | null = null;
  for (const p of points) if (p.m <= asOfMonth && p.medianPsf > 0 && p.count > 0 && (anchor == null || p.m > anchor)) anchor = p.m;
  if (anchor == null || asOfMonth - anchor > maxStaleMonths) return null;
  const fromLevel = seriesLevel(points, Math.min(sale.monthIndex, anchor), window);
  const toLevel = seriesLevel(points, anchor, window);
  if (fromLevel == null || toLevel == null) return null;
  const factor = toLevel / fromLevel;
  return {
    estimate: Math.round((sale.price * factor) / roundTo) * roundTo,
    factor,
    fromLevel,
    toLevel,
    saleMonth: monthLabel(sale.monthIndex),
    asOfMonth: monthLabel(Math.max(anchor, sale.monthIndex)),
  };
}

/* ------------------------------------------------------------------ */
/* Landed houses                                                       */
/* ------------------------------------------------------------------ */

/**
 * Landed house types that landed streets and addresses are built from (the ingest's street and address summaries
 * leave out strata landed homes, whose caveats record floor area rather than land area).
 */
export const LANDED_HOUSE_TYPES: ReadonlySet<string> = new Set(["Terrace", "Semi-detached", "Detached"]);

export function isLandedHouse(t: Pick<PrivateTransaction, "propertyType">): boolean {
  return LANDED_HOUSE_TYPES.has(t.propertyType);
}

/* ------------------------------------------------------------------ */
/* Price range summary (district landed context)                       */
/* ------------------------------------------------------------------ */

export interface PriceRangeSummary {
  count: number;
  minPrice: number | null;
  maxPrice: number | null;
  medianPrice: number | null;
  medianPsf: number | null;
}

/**
 * Count, price range, median price and median psf of single-unit sales. With `landPsfOnly`, the median psf uses only
 * sales whose recorded area is land area (strata landed homes record floor area, so their psf is not a land psf).
 */
export function priceRangeSummary(
  txs: readonly (Pick<PrivateTransaction, "price" | "psf" | "units"> & Partial<Pick<PrivateTransaction, "typeOfArea">>)[],
  opts: { landPsfOnly?: boolean } = {},
): PriceRangeSummary {
  const single = txs.filter((t) => t.units <= 1 && t.price > 0);
  if (single.length === 0) return { count: 0, minPrice: null, maxPrice: null, medianPrice: null, medianPsf: null };
  const prices = single.map((t) => t.price);
  const psfs = single
    .filter((t) => !opts.landPsfOnly || t.typeOfArea === "Land")
    .map((t) => t.psf)
    .filter((v) => v > 0);
  return {
    count: single.length,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    medianPrice: Math.round(median(prices)),
    medianPsf: psfs.length ? Math.round(median(psfs)) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Sun path summary                                                    */
/* ------------------------------------------------------------------ */

export const SUN_DAYS = [
  { key: "mar", month: 3, day: 21, label: "21 Mar" },
  { key: "jun", month: 6, day: 21, label: "21 Jun" },
  { key: "dec", month: 12, day: 21, label: "21 Dec" },
] as const;

export type SunDayKey = (typeof SUN_DAYS)[number]["key"];

/** 16-point compass order, used to sort direction labels. */
const COMPASS_ORDER = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export const AFTERNOON_FROM = "15:00";

export interface SunDaySummary {
  key: SunDayKey;
  label: string;
  /** compass directions the sun is in after 15:00, in the order it passes through them */
  directions: string[];
  fromAzimuth: number;
  toAzimuth: number;
  /** last sampled time with the sun above the horizon */
  lastLight: string;
}

export interface SunSummary {
  days: SunDaySummary[];
  /** each direction the afternoon sun comes from, with the dates it does */
  facings: { direction: string; days: SunDayKey[] }[];
  /**
   * 8-point facings that get direct sun after 15:00 on every one of the dates: the sun is above the horizon and
   * less than 90° from the facade's outward normal at some sampled time (west-facing in Singapore).
   */
  litAllDates: string[];
  /** 8-point facings that get no direct sun after 15:00 on any of the dates (sun always behind the facade) */
  shaded: string[];
}

const PRINCIPAL: [string, number][] = [
  ["N", 0],
  ["NE", 45],
  ["E", 90],
  ["SE", 135],
  ["S", 180],
  ["SW", 225],
  ["W", 270],
  ["NW", 315],
];

/** Smallest angle between two bearings, 0-180. */
export function angleBetween(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/**
 * Which facings get afternoon sun: the sun's azimuth from 15:00 until sunset on the solstices and the March
 * equinox, labelled with the 16-point compass. Computed from coordinates only (no surrounding buildings).
 */
export function sunSummary(lat: number, lng: number, year: number, stepMinutes = 15): SunSummary {
  const days: SunDaySummary[] = [];
  const facing = new Map<string, Set<SunDayKey>>();
  const azimuths: number[] = [];
  const perDay: number[][] = [];
  for (const d of SUN_DAYS) {
    const pts = sunPathForDay(year, d.month, d.day, lat, lng, stepMinutes).filter((p) => p.time >= AFTERNOON_FROM && p.altitude > 0);
    if (pts.length === 0) continue;
    perDay.push(pts.map((p) => p.azimuth));
    const directions: string[] = [];
    for (const p of pts) {
      azimuths.push(p.azimuth);
      const c = compass(p.azimuth);
      if (!directions.includes(c)) directions.push(c);
      const set = facing.get(c) ?? new Set<SunDayKey>();
      set.add(d.key);
      facing.set(c, set);
    }
    days.push({ key: d.key, label: d.label, directions, fromAzimuth: pts[0].azimuth, toAzimuth: pts[pts.length - 1].azimuth, lastLight: pts[pts.length - 1].time });
  }
  const facings = [...facing.entries()]
    .sort((a, b) => COMPASS_ORDER.indexOf(a[0]) - COMPASS_ORDER.indexOf(b[0]))
    .map(([direction, set]) => ({ direction, days: SUN_DAYS.filter((d) => set.has(d.key)).map((d) => d.key) }));
  const litAllDates =
    days.length === SUN_DAYS.length ? PRINCIPAL.filter(([, bearing]) => perDay.every((az) => az.some((a) => angleBetween(a, bearing) < 90))).map(([d]) => d) : [];
  const shaded = azimuths.length ? PRINCIPAL.filter(([, bearing]) => azimuths.every((az) => angleBetween(az, bearing) >= 90)).map(([d]) => d) : [];
  return { days, facings, litAllDates, shaded };
}

/* ------------------------------------------------------------------ */
/* Rentals                                                             */
/* ------------------------------------------------------------------ */

export interface GroupRow {
  key: string;
  label: string;
  count: number;
  median: number;
}

export interface RentalRow {
  month: string;
  bedrooms: number | null;
  areaSqmLow: number | null;
  areaSqmHigh: number | null;
  monthlyRent: number;
}

export interface RentalSummary {
  total: number;
  /** "12m" when medians use the last 12 months, "all" when no contracts fall in that window */
  window: "12m" | "all";
  windowCount: number;
  sinceMonth: string;
  byBedrooms: GroupRow[];
  byArea: GroupRow[];
  latest: RentalRow[];
}

function groupMedian<T>(items: readonly T[], keyOf: (t: T) => { key: string; label: string; sort: number }, valueOf: (t: T) => number): GroupRow[] {
  const groups = new Map<string, { label: string; sort: number; values: number[] }>();
  for (const it of items) {
    const k = keyOf(it);
    const g = groups.get(k.key) ?? { label: k.label, sort: k.sort, values: [] };
    g.values.push(valueOf(it));
    groups.set(k.key, g);
  }
  return [...groups.entries()]
    .sort((a, b) => a[1].sort - b[1].sort)
    .map(([key, g]) => ({ key, label: g.label, count: g.values.length, median: Math.round(median(g.values)) }));
}

/** Median rent by bedrooms and by URA's published floor-area range, plus the latest 10 contracts. */
export function summariseRentals(rentals: readonly PrivateRental[], sinceMonth: number): RentalSummary {
  const valid = rentals.filter((r) => r.monthlyRent > 0);
  const recent = valid.filter((r) => r.monthIndex >= sinceMonth);
  const base = recent.length ? recent : valid;
  const byBedrooms = groupMedian(
    base,
    (r) => (r.bedrooms == null ? { key: "na", label: "Not published", sort: 1e9 } : { key: String(r.bedrooms), label: String(r.bedrooms), sort: r.bedrooms }),
    (r) => r.monthlyRent,
  );
  const byArea = groupMedian(
    base,
    (r) =>
      r.areaSqmLow == null || r.areaSqmHigh == null
        ? { key: "na", label: "Not published", sort: 1e9 }
        : { key: `${r.areaSqmLow}-${r.areaSqmHigh}`, label: `${r.areaSqmLow}–${r.areaSqmHigh} sqm`, sort: r.areaSqmLow },
    (r) => r.monthlyRent,
  );
  const latest = [...valid]
    .sort((a, b) => b.monthIndex - a.monthIndex)
    .slice(0, 10)
    .map((r) => ({ month: r.month, bedrooms: r.bedrooms, areaSqmLow: r.areaSqmLow, areaSqmHigh: r.areaSqmHigh, monthlyRent: r.monthlyRent }));
  return { total: valid.length, window: recent.length ? "12m" : "all", windowCount: base.length, sinceMonth: monthLabel(sinceMonth), byBedrooms, byArea, latest };
}

/* ------------------------------------------------------------------ */
/* Sales rows (free tables and gated API)                              */
/* ------------------------------------------------------------------ */

export interface SaleRow {
  month: string;
  areaSqm: number;
  areaSqft: number;
  floorRange: string;
  price: number;
  psf: number;
  typeOfSale: PrivateTransaction["typeOfSale"];
  typeOfArea: PrivateTransaction["typeOfArea"];
  propertyType: string;
  units: number;
  unit: string | null;
  address: string | null;
  /** /landed/<slug>/ page for the address, when one exists */
  addressSlug: string | null;
}

export function toSaleRow(t: PrivateTransaction, addressSlug: string | null = null): SaleRow {
  return {
    month: t.month,
    areaSqm: t.areaSqm,
    areaSqft: t.areaSqft,
    floorRange: t.floorRange,
    price: t.price,
    psf: t.psf,
    typeOfSale: t.typeOfSale,
    typeOfArea: t.typeOfArea,
    propertyType: t.propertyType,
    units: t.units,
    unit: t.unit,
    address: t.address,
    addressSlug,
  };
}

/** Latest first (stable for equal months). */
export function latestFirst<T extends { monthIndex: number }>(txs: readonly T[]): T[] {
  return txs
    .map((t, i) => ({ t, i }))
    .sort((a, b) => b.t.monthIndex - a.t.monthIndex || a.i - b.i)
    .map((x) => x.t);
}

export interface Page<T> {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rows: T[];
}

/** "3" -> 3; anything invalid -> 1. Clamped to the available pages by paginate(). */
export function parsePage(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function paginate<T>(rows: readonly T[], page: number, pageSize: number): Page<T> {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, Math.floor(page)), totalPages);
  return { page: p, pageSize, total, totalPages, rows: rows.slice((p - 1) * pageSize, p * pageSize) };
}

/* ------------------------------------------------------------------ */
/* En-bloc age input                                                   */
/* ------------------------------------------------------------------ */

/**
 * Start year for the en-bloc heuristic: the lease start for leasehold projects; for freehold projects the
 * year of the earliest recorded new sale (a launch-year proxy). Null when neither is known — resale-only
 * freehold records do not tell us how old the development is.
 */
export function enblocStartYear(tenure: Tenure | null | undefined, txs: readonly Pick<PrivateTransaction, "monthIndex" | "typeOfSale">[]): number | null {
  if (tenure?.kind === "leasehold" && tenure.startYear != null) return tenure.startYear;
  let earliest: number | null = null;
  for (const t of txs) if (t.typeOfSale === "New Sale" && (earliest == null || t.monthIndex < earliest)) earliest = t.monthIndex;
  return earliest == null ? null : Number(monthLabel(earliest).slice(0, 4));
}

/* ------------------------------------------------------------------ */
/* Profit & loss pairs (unit-level data only)                          */
/* ------------------------------------------------------------------ */

export interface ProfitLossRow {
  unit: string;
  bought: string;
  sold: string;
  boughtPrice: number;
  soldPrice: number;
  gain: number;
  gainPct: number;
  holdingYears: number;
  /** compound annual growth; null when undefined (e.g. same-month resale) */
  annualised: number | null;
}

export interface ProfitLossResponse {
  /** false when the project has no unit-level records */
  available: boolean;
  total: number;
  profitable: number;
  medianAnnualised: number | null;
  medianHoldingYears: number | null;
  /** most recent resales first, capped at `cap` */
  rows: ProfitLossRow[];
}

/** Same-unit repeat-sale pairs (bought -> sold) from unit-level transactions. */
export function profitLoss(txs: readonly PrivateTransaction[], hasUnitLevel: boolean, cap = 200): ProfitLossResponse {
  if (!hasUnitLevel) return { available: false, total: 0, profitable: 0, medianAnnualised: null, medianHoldingYears: null, rows: [] };
  const pairs = repeatSalePairs(txs.filter((t) => t.units <= 1).map((t) => ({ monthIndex: t.monthIndex, price: t.price, unitKey: unitKeyOf(t) })));
  const ann = pairs.map((p) => p.annualised).filter((v) => Number.isFinite(v));
  return {
    available: true,
    total: pairs.length,
    profitable: pairs.filter((p) => p.gain > 0).length,
    medianAnnualised: ann.length ? median(ann) : null,
    medianHoldingYears: pairs.length ? median(pairs.map((p) => p.holdingYears)) : null,
    rows: pairs.slice(0, cap).map((p) => ({
      unit: p.unitKey,
      bought: monthLabel(p.boughtMonth),
      sold: monthLabel(p.soldMonth),
      boughtPrice: p.boughtPrice,
      soldPrice: p.soldPrice,
      gain: p.gain,
      gainPct: p.gainPct,
      holdingYears: p.holdingYears,
      annualised: Number.isFinite(p.annualised) ? p.annualised : null,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Stacking plan                                                       */
/* ------------------------------------------------------------------ */

export type StackingResponse = StackGrid | FloorSizeGrid;

/**
 * Stacking plan: with unit-level records, the latest psf per unit on a stack x floor grid; otherwise median
 * psf by floor range x size band over the last five years (`sinceMonth`).
 */
export function stackingPlan(txs: readonly PrivateTransaction[], hasUnitLevel: boolean, sinceMonth: number): StackingResponse {
  if (hasUnitLevel) {
    const grid = stackGrid(txs);
    if (grid.units > 0) return grid;
  }
  return floorSizeGrid(txs, sinceMonth);
}
