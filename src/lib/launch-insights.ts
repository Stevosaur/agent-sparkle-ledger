/**
 * Pure helpers for new-launch pages and the launch catalogue (no server-only imports, so they are unit
 * tested directly and can run in client components).
 *
 * Inputs are the data-contract shapes from `@/lib/data/types`; nothing here reads files.
 */
import type { LatLng, LaunchSalesPoint, LaunchType, MarketSegment, NewLaunch, PrivateProject, PrivateTransaction } from "@/lib/data/types";
import { monthIndex, monthLabel } from "@/lib/data/months";
import { haversineM } from "@/lib/geo-math";
import { median } from "@/lib/stats-math";
import { formatMonth } from "@/lib/format";

export const LAUNCH_TYPES: readonly LaunchType[] = ["condo", "ec", "landed"];
export const LISTING_TYPES = ["condo", "ec", "landed", "upcoming"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];
export const MARKET_SEGMENTS: readonly MarketSegment[] = ["CCR", "RCR", "OCR"];

/** Radius used for the "nearby resale" comparison on launch pages. */
export const NEARBY_RESALE_RADIUS_M = 1500;

/** Landed property types as published by URA (mirrors LANDED_TYPES in the server data layer). */
const LANDED_PROPERTY_TYPES = new Set(["Terrace", "Semi-detached", "Detached", "Strata Terrace", "Strata Semi-detached", "Strata Detached"]);

export function isLaunchType(value: string | null | undefined): value is LaunchType {
  return value != null && (LAUNCH_TYPES as readonly string[]).includes(value);
}

export function isListingType(value: string | null | undefined): value is ListingType {
  return value != null && (LISTING_TYPES as readonly string[]).includes(value);
}

export function launchHref(l: Pick<NewLaunch, "type" | "slug">): string {
  return `/new-launch/${l.type}/${l.slug}/`;
}

/** English label for a launch type ("EC" for executive condominiums). */
export function launchTypeLabel(type: LaunchType): string {
  return type === "ec" ? "Executive condo" : type === "landed" ? "Landed" : "Condo";
}

export function districtLabel(district: number | null | undefined): string | null {
  return district == null ? null : `D${String(district).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Sales progress                                                      */
/* ------------------------------------------------------------------ */

/** `part / whole` clamped to [0, 1]; null when either side is missing or `whole` is not positive. */
export function fraction(part: number | null | undefined, whole: number | null | undefined): number | null {
  if (part == null || whole == null || !Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0 || part < 0) return null;
  return Math.min(1, part / whole);
}

/** Developer-sales months in ascending order (the snapshot is sorted, but never trust it). */
export function sortedSales(sales: readonly LaunchSalesPoint[]): LaunchSalesPoint[] {
  return [...sales].filter((s) => /^\d{4}-\d{2}$/.test(s.month)).sort((a, b) => a.month.localeCompare(b.month));
}

function findLast<T>(items: readonly T[], pred: (item: T) => boolean): T | undefined {
  for (let i = items.length - 1; i >= 0; i--) if (pred(items[i])) return items[i];
  return undefined;
}

export interface LaunchProgress {
  /** units sold to date (developer sales) */
  sold: number | null;
  /** units launched (released for sale) to date */
  launched: number | null;
  /** total units in the project */
  total: number | null;
  soldOfTotal: number | null;
  launchedOfTotal: number | null;
  soldOfLaunched: number | null;
  /** launched but not yet sold */
  unsoldLaunched: number | null;
  /** "YYYY-MM" of the latest developer-sales month used */
  asOf: string | null;
}

export function launchProgress(l: Pick<NewLaunch, "sales" | "unitsSold" | "unitsLaunched" | "totalUnits">): LaunchProgress {
  const sales = sortedSales(l.sales);
  const lastSold = findLast(sales, (p) => p.soldToDate != null);
  const lastLaunched = findLast(sales, (p) => p.launchedToDate != null);
  const sold = l.unitsSold ?? lastSold?.soldToDate ?? null;
  const launched = l.unitsLaunched ?? lastLaunched?.launchedToDate ?? null;
  const total = l.totalUnits != null && l.totalUnits > 0 ? l.totalUnits : null;
  const asOf = sales.length ? sales[sales.length - 1].month : null;
  return {
    sold,
    launched,
    total,
    soldOfTotal: fraction(sold, total),
    launchedOfTotal: fraction(launched, total),
    soldOfLaunched: fraction(sold, launched),
    unsoldLaunched: sold != null && launched != null ? Math.max(0, launched - sold) : null,
    asOf,
  };
}

/* ------------------------------------------------------------------ */
/* Prices                                                              */
/* ------------------------------------------------------------------ */

export interface LaunchPriceSummary {
  /** "YYYY-MM" of the latest month with a reported price */
  month: string;
  medianPsf: number | null;
  lowestPsf: number | null;
  highestPsf: number | null;
  /** "from" price: the lowest psf transacted in the latest priced month */
  fromPsf: number | null;
}

const validPsf = (v: number | null | undefined): number | null => (v != null && Number.isFinite(v) && v > 0 ? v : null);

/** Latest month with any reported psf, or null when the developer has not reported prices. */
export function latestPrice(sales: readonly LaunchSalesPoint[]): LaunchPriceSummary | null {
  const p = findLast(sortedSales(sales), (s) => validPsf(s.medianPsf) != null || validPsf(s.lowestPsf) != null || validPsf(s.highestPsf) != null);
  if (!p) return null;
  return {
    month: p.month,
    medianPsf: validPsf(p.medianPsf),
    lowestPsf: validPsf(p.lowestPsf),
    highestPsf: validPsf(p.highestPsf),
    fromPsf: validPsf(p.lowestPsf),
  };
}

export interface ChartSeries {
  name: string;
  points: { x: number; y: number }[];
}

/** Median / lowest / highest psf by month for the trend chart (x = month index). */
export function psfTrendSeries(sales: readonly LaunchSalesPoint[]): ChartSeries[] {
  const rows = sortedSales(sales);
  const series = (name: string, pick: (s: LaunchSalesPoint) => number | null | undefined): ChartSeries => ({
    name,
    points: rows.flatMap((s) => {
      const y = validPsf(pick(s));
      return y == null ? [] : [{ x: monthIndex(s.month), y }];
    }),
  });
  return [series("Median psf", (s) => s.medianPsf), series("Lowest psf", (s) => s.lowestPsf), series("Highest psf", (s) => s.highestPsf)].filter((s) => s.points.length > 0);
}

/** Units sold per month for the bar chart (latest `maxMonths` months with a reported figure). */
export function monthlySoldBars(sales: readonly LaunchSalesPoint[], maxMonths = 36): { label: string; value: number }[] {
  return sortedSales(sales)
    .filter((s) => s.soldInMonth != null && Number.isFinite(s.soldInMonth))
    .slice(-maxMonths)
    .map((s) => ({ label: formatMonth(s.month), value: Math.max(0, s.soldInMonth as number) }));
}

/** Latest developer-sales month, "YYYY-MM", or null. */
export function latestSalesMonth(l: Pick<NewLaunch, "sales">): string | null {
  const s = sortedSales(l.sales);
  return s.length ? s[s.length - 1].month : null;
}

/** "2026-09-30" -> "30 Sep 2026" (calendar date, no time-zone conversion); other input is returned as is. */
export function formatIsoDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${Number(m[3])} ${formatMonth(`${m[1]}-${m[2]}`)}` : iso;
}

/** Estimated price for a unit size from a psf figure, rounded to the nearest S$1,000. */
export function estimatePrice(psf: number | null | undefined, sizeSqft: number | null | undefined): number | null {
  if (psf == null || sizeSqft == null || !(psf > 0) || !(sizeSqft > 0)) return null;
  return Math.round((psf * sizeSqft) / 1000) * 1000;
}

/* ------------------------------------------------------------------ */
/* Nearby resale comparison                                            */
/* ------------------------------------------------------------------ */

export interface NearbyProject {
  slug: string;
  name: string;
  isLanded: boolean;
  district: number | null;
  lat: number;
  lng: number;
  distanceM: number;
}

/**
 * Projects with coordinates within `radiusM` of `origin`, nearest first. `landed` picks landed or
 * non-landed (condo / apartment / EC) projects; `excludeSlugs` drops the launch's own project.
 */
export function nearbyProjects(
  origin: LatLng,
  projects: readonly PrivateProject[],
  opts: { radiusM: number; landed: boolean; excludeSlugs?: readonly (string | null | undefined)[] },
): NearbyProject[] {
  const exclude = new Set(opts.excludeSlugs?.filter(Boolean) as string[] | undefined);
  const degPad = opts.radiusM / 111_000 + 0.001;
  const out: NearbyProject[] = [];
  for (const p of projects) {
    if (p.lat == null || p.lng == null || p.isLanded !== opts.landed || exclude.has(p.slug)) continue;
    if (Math.abs(p.lat - origin.lat) > degPad || Math.abs(p.lng - origin.lng) > degPad) continue;
    const d = haversineM(origin, { lat: p.lat, lng: p.lng });
    if (d <= opts.radiusM) out.push({ slug: p.slug, name: p.name, isLanded: p.isLanded, district: p.district, lat: p.lat, lng: p.lng, distanceM: Math.round(d) });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM || a.slug.localeCompare(b.slug));
}

export interface NearbyResaleRow extends NearbyProject {
  medianPsf: number;
  count: number;
}

export interface NearbyResaleSummary {
  radiusM: number;
  /** "YYYY-MM" inclusive window */
  windowStart: string;
  windowEnd: string;
  /** median psf over every qualifying resale in the window (pooled) */
  medianPsf: number | null;
  count: number;
  /** projects with at least one qualifying resale, nearest first, capped at `limit` */
  projects: NearbyResaleRow[];
  /** total projects with resales in the window (before the cap) */
  projectCount: number;
}

/**
 * Median resale psf in the `months` months to `endMonthIndex` across the given nearby projects.
 * Only secondary-market resales of single units count (new sales, sub sales and bulk deals are
 * excluded), and landed / strata types are matched to the comparison (landed vs non-landed).
 */
export function nearbyResalePsf(input: {
  nearby: readonly NearbyProject[];
  transactions: readonly PrivateTransaction[];
  endMonthIndex: number;
  months?: number;
  radiusM: number;
  landed: boolean;
  limit?: number;
}): NearbyResaleSummary {
  const months = input.months ?? 12;
  const start = input.endMonthIndex - months + 1;
  const bySlug = new Map(input.nearby.map((p) => [p.slug, p]));
  const psfBySlug = new Map<string, number[]>();
  const pooled: number[] = [];
  for (const t of input.transactions) {
    if (t.typeOfSale !== "Resale" || t.units > 1 || !(t.psf > 0)) continue;
    if (t.monthIndex < start || t.monthIndex > input.endMonthIndex) continue;
    if (!bySlug.has(t.projectSlug)) continue;
    if (LANDED_PROPERTY_TYPES.has(t.propertyType) !== input.landed) continue;
    pooled.push(t.psf);
    const arr = psfBySlug.get(t.projectSlug);
    if (arr) arr.push(t.psf);
    else psfBySlug.set(t.projectSlug, [t.psf]);
  }
  const rows: NearbyResaleRow[] = [];
  for (const [slug, values] of psfBySlug) {
    const p = bySlug.get(slug)!;
    rows.push({ ...p, medianPsf: Math.round(median(values)), count: values.length });
  }
  rows.sort((a, b) => a.distanceM - b.distanceM || a.slug.localeCompare(b.slug));
  return {
    radiusM: input.radiusM,
    windowStart: monthLabel(start),
    windowEnd: monthLabel(input.endMonthIndex),
    medianPsf: pooled.length ? Math.round(median(pooled)) : null,
    count: pooled.length,
    projects: rows.slice(0, input.limit ?? 10),
    projectCount: rows.length,
  };
}

/** Launch psf relative to a comparison psf: 0.12 = 12% above. Null when either side is missing. */
export function premiumOver(launchPsf: number | null | undefined, comparePsf: number | null | undefined): number | null {
  if (launchPsf == null || comparePsf == null || !(launchPsf > 0) || !(comparePsf > 0)) return null;
  return launchPsf / comparePsf - 1;
}

/* ------------------------------------------------------------------ */
/* Catalogue (/listings/)                                              */
/* ------------------------------------------------------------------ */

export const LISTINGS_PAGE_SIZE = 24;

export interface ListingFilters {
  type: ListingType;
  segment: MarketSegment | null;
  district: number | null;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Normalise /listings/ query parameters; unknown values fall back to defaults instead of erroring. */
export function parseListingFilters(params: RawParams): ListingFilters {
  const rawType = first(params.type)?.toLowerCase();
  const rawSegment = first(params.segment)?.toUpperCase();
  const rawDistrict = first(params.district)?.replace(/^d/i, "");
  const rawPage = first(params.page);
  const district = rawDistrict && /^\d{1,2}$/.test(rawDistrict) ? Number(rawDistrict) : null;
  const page = rawPage && /^\d{1,4}$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1;
  return {
    type: isListingType(rawType) ? rawType : "condo",
    segment: rawSegment && (MARKET_SEGMENTS as readonly string[]).includes(rawSegment) ? (rawSegment as MarketSegment) : null,
    district: district != null && district >= 1 && district <= 28 ? district : null,
    page,
  };
}

/** Canonical /listings/ URL for a filter set (defaults omitted except type). */
export function listingsHref(f: Partial<ListingFilters>): string {
  const qs = new URLSearchParams();
  qs.set("type", f.type ?? "condo");
  if (f.segment) qs.set("segment", f.segment);
  if (f.district != null) qs.set("district", String(f.district));
  if (f.page != null && f.page > 1) qs.set("page", String(f.page));
  return `/listings/?${qs.toString()}`;
}

/** "upcoming" = not yet launched (any type); the other tabs list launched projects of that type. */
export function matchesListingType(l: Pick<NewLaunch, "type" | "status">, type: ListingType): boolean {
  return type === "upcoming" ? l.status === "upcoming" : l.status === "launched" && l.type === type;
}

function matches(l: NewLaunch, f: { type?: ListingType; segment?: MarketSegment | null; district?: number | null }): boolean {
  if (f.type && !matchesListingType(l, f.type)) return false;
  if (f.segment && l.segment !== f.segment) return false;
  if (f.district != null && l.district !== f.district) return false;
  return true;
}

/**
 * Catalogue order: launched projects with the most recent developer sales first (then most units sold);
 * upcoming projects by expected completion, soonest first. Name breaks ties.
 */
export function sortLaunches(list: readonly NewLaunch[], type: ListingType): NewLaunch[] {
  // sort keys computed once per launch (each derivation copies and sorts the monthly sales)
  const keyed = list.map((l) => ({
    l,
    year: l.expectedCompletionYear ?? Number.MAX_SAFE_INTEGER,
    month: type === "upcoming" ? "" : (latestSalesMonth(l) ?? ""),
    sold: type === "upcoming" ? -1 : (launchProgress(l).sold ?? -1),
  }));
  keyed.sort((a, b) => {
    if (type === "upcoming") {
      if (a.year !== b.year) return a.year - b.year;
    } else {
      if (a.month !== b.month) return b.month.localeCompare(a.month);
      if (a.sold !== b.sold) return b.sold - a.sold;
    }
    return a.l.name.localeCompare(b.l.name);
  });
  return keyed.map((k) => k.l);
}

export function filterLaunches(launches: readonly NewLaunch[], f: Pick<ListingFilters, "type" | "segment" | "district">): NewLaunch[] {
  return sortLaunches(
    launches.filter((l) => matches(l, f)),
    f.type,
  );
}

/** Tab counts for each listing type under the current segment / district filters. */
export function listingTypeCounts(launches: readonly NewLaunch[], f: Pick<ListingFilters, "segment" | "district">): Record<ListingType, number> {
  const out = { condo: 0, ec: 0, landed: 0, upcoming: 0 } as Record<ListingType, number>;
  for (const l of launches) {
    if (!matches(l, { segment: f.segment, district: f.district })) continue;
    for (const t of LISTING_TYPES) if (matchesListingType(l, t)) out[t]++;
  }
  return out;
}

/** Segment chip counts for the current type / district. */
export function segmentCounts(launches: readonly NewLaunch[], f: Pick<ListingFilters, "type" | "district">): Record<MarketSegment, number> {
  const out = { CCR: 0, RCR: 0, OCR: 0 } as Record<MarketSegment, number>;
  for (const l of launches) if (l.segment && matches(l, { type: f.type, district: f.district })) out[l.segment]++;
  return out;
}

/** Districts that have launches for the current type / segment, ascending, with counts. */
export function districtOptions(launches: readonly NewLaunch[], f: Pick<ListingFilters, "type" | "segment">): { district: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const l of launches) {
    if (l.district == null || !matches(l, { type: f.type, segment: f.segment })) continue;
    counts.set(l.district, (counts.get(l.district) ?? 0) + 1);
  }
  return [...counts.entries()].map(([district, count]) => ({ district, count })).sort((a, b) => a.district - b.district);
}

/** Page slice + paging info (pages are 1-based; an out-of-range page clamps to the last page). */
export function paginate<T>(items: readonly T[], page: number, pageSize = LISTINGS_PAGE_SIZE): { items: T[]; page: number; pages: number; total: number } {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const p = Math.min(Math.max(1, Math.floor(page)), pages);
  return { items: items.slice((p - 1) * pageSize, p * pageSize), page: p, pages, total: items.length };
}
