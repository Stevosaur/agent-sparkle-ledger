/**
 * Pure computations behind the home page (market pulse, credibility line, launch carousel, popular
 * towns) and the property-analysis page (grouped search results, recently transacted lists).
 *
 * Nothing here reads the dataset: callers pass loader output in, so every function is unit-testable
 * and safe to import from server components.
 */
import { monthIndex, monthLabel, yearOfMonth } from "@/lib/data/months";
import { formatMonth } from "@/lib/format";
import type { DatasetMeta, LaunchType, MonthlyStat, NewLaunch, SearchEntry, SearchKind, StatSeries, TownSummary, TxSummary } from "@/lib/data/types";

/* ------------------------------------------------------------------ */
/* Months                                                              */
/* ------------------------------------------------------------------ */

/** Singapore is UTC+8 all year (no daylight saving). */
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** "YYYY-MM" of an ISO timestamp in Singapore time; null when unparseable. */
export function sgMonthOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + SGT_OFFSET_MS).toISOString().slice(0, 7);
}

function safeMonthIndex(label: string | null | undefined): number | null {
  if (!label) return null;
  try {
    return monthIndex(label);
  } catch {
    return null;
  }
}

/**
 * The last complete month of a series, used to anchor "latest 3 months" and "sales last month".
 * Starts from the dataset's latest month (falling back to the series' last point) and steps back one
 * month when that month is the month the snapshot was generated in (records still arriving).
 */
export function anchorMonth(latestMonth: string | null, generatedAt: string | null, series: StatSeries | null): number | null {
  let end = safeMonthIndex(latestMonth);
  if (end == null) {
    const last = series?.points.at(-1);
    if (!last) return null;
    end = last.m;
  }
  const generatedMonth = safeMonthIndex(sgMonthOf(generatedAt));
  if (generatedMonth != null && end >= generatedMonth) end = generatedMonth - 1;
  return end;
}

/** "2026-06".."2026-08" -> { from: "2026-06", to: "2026-08" } labels for a window ending at `end`. */
export function windowLabels(end: number, months: number): { from: string; to: string } {
  return { from: monthLabel(end - months + 1), to: monthLabel(end) };
}

/** { from: "2026-06", to: "2026-08" } -> "Jun – Aug 2026"; across years "Nov 2025 – Jan 2026"; one month "Aug 2026". */
export function formatMonthRange({ from, to }: { from: string; to: string }): string {
  if (from === to) return formatMonth(to);
  if (from.slice(0, 4) === to.slice(0, 4)) return `${formatMonth(from).split(" ")[0]} – ${formatMonth(to)}`;
  return `${formatMonth(from)} – ${formatMonth(to)}`;
}

/* ------------------------------------------------------------------ */
/* Medians over a window of monthly medians                            */
/* ------------------------------------------------------------------ */

/**
 * Sales-weighted median of monthly medians: each month's median counts once per sale recorded that
 * month. The pipeline only publishes monthly medians, so this is the closest available stand-in for
 * the median of all sales in a multi-month window (exact when every month has the same distribution).
 * When the cumulative weight lands exactly on half the total, the two middle values are averaged.
 */
export function weightedMedian(items: readonly { value: number; weight: number }[]): number | null {
  const valid = items.filter((i) => Number.isFinite(i.value) && i.weight > 0);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((s, i) => s + i.weight, 0);
  const half = total / 2;
  let cum = 0;
  for (let i = 0; i < sorted.length; i++) {
    cum += sorted[i].weight;
    if (cum > half) return sorted[i].value;
    if (cum === half) return i + 1 < sorted.length ? (sorted[i].value + sorted[i + 1].value) / 2 : sorted[i].value;
  }
  return sorted[sorted.length - 1].value;
}

export interface WindowStat {
  /** sales-weighted median of the monthly median prices in the window */
  medianPrice: number;
  /** sales-weighted median of the monthly median psf in the window (null when the series has no psf) */
  medianPsf: number | null;
  /** sales in the window */
  count: number;
  /** months in the window that had at least one sale */
  monthsWithSales: number;
}

/** Window statistics for months [from, to] inclusive; null when no sale fell in the window. */
export function windowStat(points: readonly MonthlyStat[], from: number, to: number): WindowStat | null {
  const inWindow = points.filter((p) => p.m >= from && p.m <= to && p.count > 0);
  if (inWindow.length === 0) return null;
  const medianPrice = weightedMedian(inWindow.map((p) => ({ value: p.medianPrice, weight: p.count })));
  if (medianPrice == null) return null;
  const psfPoints = inWindow.filter((p) => p.medianPsf > 0);
  const medianPsf = psfPoints.length ? weightedMedian(psfPoints.map((p) => ({ value: p.medianPsf, weight: p.count }))) : null;
  return { medianPrice, medianPsf, count: inWindow.reduce((s, p) => s + p.count, 0), monthsWithSales: inWindow.length };
}

export interface YoYComparison {
  /** month index of the last month in the current window */
  end: number;
  months: number;
  current: WindowStat | null;
  /** the same months one year earlier */
  previous: WindowStat | null;
  /** fractional change in median price (0.05 = +5%); null when either window has no sales */
  change: number | null;
}

/** Latest `months` months ending at `end` vs the same months a year earlier. */
export function compareYoY(series: StatSeries | null, end: number | null, months = 3): YoYComparison | null {
  if (!series || end == null || months < 1) return null;
  const current = windowStat(series.points, end - months + 1, end);
  const previous = windowStat(series.points, end - 12 - months + 1, end - 12);
  const change = current && previous && previous.medianPrice > 0 ? current.medianPrice / previous.medianPrice - 1 : null;
  return { end, months, current, previous, change };
}

/**
 * Sales recorded in one month. Stat series only list months with sales, so a month inside the
 * series' span without a point had none; months outside the span are unknown (null).
 */
export function salesInMonth(series: StatSeries | null, m: number | null): number | null {
  if (!series || m == null || series.points.length === 0) return null;
  const hit = series.points.find((p) => p.m === m);
  if (hit) return hit.count;
  const first = series.points[0].m;
  const last = series.points[series.points.length - 1].m;
  return m >= first && m <= last ? 0 : null;
}

/** Chart points {x: month index, y: median price} for the `months` months ending at `end`. */
export function trailingPoints(series: StatSeries | null, end: number | null, months = 60): { x: number; y: number }[] {
  if (!series || end == null) return [];
  const from = end - months + 1;
  return series.points.filter((p) => p.m >= from && p.m <= end && p.count > 0).map((p) => ({ x: p.m, y: p.medianPrice }));
}

export interface MarketPulse {
  /** anchor (last complete) month index */
  end: number;
  yoy: YoYComparison;
  /** sales in the anchor month */
  salesLastMonth: number | null;
  points: { x: number; y: number }[];
}

/** Everything the market-pulse card shows for one family (HDB or private); null without data. */
export function marketPulse(series: StatSeries | null, latestMonth: string | null, generatedAt: string | null, opts: { windowMonths?: number; chartMonths?: number } = {}): MarketPulse | null {
  if (!series || series.points.length === 0) return null;
  const end = anchorMonth(latestMonth, generatedAt, series);
  const yoy = compareYoY(series, end, opts.windowMonths ?? 3);
  if (end == null || !yoy) return null;
  return { end, yoy, salesLastMonth: salesInMonth(series, end), points: trailingPoints(series, end, opts.chartMonths ?? 60) };
}

/* ------------------------------------------------------------------ */
/* Credibility line                                                    */
/* ------------------------------------------------------------------ */

export interface CredibilityItem {
  kind: "hdb" | "private" | "rentals";
  count: number;
  /** first year covered, when known */
  since: number | null;
}

/** Record counts worth bragging about (only those > 0) and the month the data runs to. */
export function credibility(meta: DatasetMeta, firstMonth: { hdb: number | null; private: number | null }): { items: CredibilityItem[]; latestMonth: string | null } {
  const items: CredibilityItem[] = [];
  const c = meta.counts;
  if (c.hdbTransactions > 0) items.push({ kind: "hdb", count: c.hdbTransactions, since: firstMonth.hdb != null ? yearOfMonth(firstMonth.hdb) : null });
  if (c.privateTransactions > 0) items.push({ kind: "private", count: c.privateTransactions, since: firstMonth.private != null ? yearOfMonth(firstMonth.private) : null });
  const rentals = c.hdbRentals + c.privateRentals;
  if (rentals > 0) items.push({ kind: "rentals", count: rentals, since: null });
  const months = [meta.latestMonth.hdb, meta.latestMonth.private].filter((m): m is string => !!m && safeMonthIndex(m) != null).sort();
  return { items, latestMonth: months.at(-1) ?? null };
}

/* ------------------------------------------------------------------ */
/* New-launch carousel                                                 */
/* ------------------------------------------------------------------ */

export type LaunchTab = "condo" | "ec" | "landed" | "upcoming";
export const LAUNCH_TABS: LaunchTab[] = ["condo", "ec", "landed", "upcoming"];

export interface LaunchCard {
  slug: string;
  type: LaunchType;
  name: string;
  href: string;
  status: NewLaunch["status"];
  district: number | null;
  segment: NewLaunch["segment"];
  expectedCompletionYear: number | null;
  totalUnits: number | null;
  developer: string | null;
  sold: number | null;
  launched: number | null;
  /** sold / launched in [0, 1]; null when either is unknown */
  soldShare: number | null;
  latestMedianPsf: number | null;
  /** "YYYY-MM" of the sales point the median psf comes from */
  latestPsfMonth: string | null;
  /** "YYYY-MM" of the latest sales report (sort key) */
  latestSalesMonth: string | null;
}

export function launchCard(l: NewLaunch): LaunchCard {
  const sales = [...(l.sales ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  const lastPoint = sales.at(-1) ?? null;
  const lastWithPsf = [...sales].reverse().find((s) => s.medianPsf != null && s.medianPsf > 0) ?? null;
  const sold = l.unitsSold ?? lastPoint?.soldToDate ?? null;
  const launched = l.unitsLaunched ?? lastPoint?.launchedToDate ?? null;
  const soldShare = sold != null && launched != null && launched > 0 ? Math.min(1, Math.max(0, sold / launched)) : null;
  return {
    slug: l.slug,
    type: l.type,
    name: l.name,
    href: `/new-launch/${l.type}/${l.slug}/`,
    status: l.status,
    district: l.district,
    segment: l.segment,
    expectedCompletionYear: l.expectedCompletionYear,
    totalUnits: l.totalUnits,
    developer: l.developer,
    sold,
    launched,
    soldShare,
    latestMedianPsf: lastWithPsf?.medianPsf ?? null,
    latestPsfMonth: lastWithPsf?.month ?? null,
    latestSalesMonth: lastPoint?.month ?? null,
  };
}

/** The carousel tab a launch belongs to: "upcoming" for any type not yet launched, else its type. */
export function launchTab(l: Pick<NewLaunch, "type" | "status">): LaunchTab | null {
  if (l.status === "upcoming") return "upcoming";
  return l.type === "condo" || l.type === "ec" || l.type === "landed" ? l.type : null;
}

/** Number of launches per carousel tab, before the per-tab cap applied by groupLaunches. */
export function countLaunchTabs(launches: readonly Pick<NewLaunch, "type" | "status">[]): Record<LaunchTab, number> {
  const out: Record<LaunchTab, number> = { condo: 0, ec: 0, landed: 0, upcoming: 0 };
  for (const l of launches) {
    const tab = launchTab(l);
    if (tab) out[tab]++;
  }
  return out;
}

/**
 * Carousel tabs: launched condo / EC / landed projects (most recently reported sales first), and
 * upcoming projects of any type (soonest expected completion first). Each tab is capped at `perTab`;
 * use countLaunchTabs for the uncapped totals.
 */
export function groupLaunches(launches: readonly NewLaunch[], perTab = 12): Record<LaunchTab, LaunchCard[]> {
  const out: Record<LaunchTab, LaunchCard[]> = { condo: [], ec: [], landed: [], upcoming: [] };
  for (const l of launches) {
    const tab = launchTab(l);
    if (tab) out[tab].push(launchCard(l));
  }
  const byRecent = (a: LaunchCard, b: LaunchCard) =>
    (b.latestSalesMonth ?? "").localeCompare(a.latestSalesMonth ?? "") || (b.sold ?? -1) - (a.sold ?? -1) || a.name.localeCompare(b.name);
  const bySoonest = (a: LaunchCard, b: LaunchCard) =>
    (a.expectedCompletionYear ?? 9999) - (b.expectedCompletionYear ?? 9999) || (b.totalUnits ?? -1) - (a.totalUnits ?? -1) || a.name.localeCompare(b.name);
  for (const tab of LAUNCH_TABS) {
    out[tab].sort(tab === "upcoming" ? bySoonest : byRecent);
    out[tab] = out[tab].slice(0, perTab);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Towns and recently transacted                                       */
/* ------------------------------------------------------------------ */

/** Busiest towns over the last 12 months. */
export function popularTowns(towns: readonly TownSummary[], limit = 12): TownSummary[] {
  return towns
    .filter((t) => t.tx.count12m > 0)
    .sort((a, b) => b.tx.count12m - a.tx.count12m || b.tx.count - a.tx.count || a.town.localeCompare(b.town))
    .slice(0, limit);
}

/** Plain code-unit comparison: "YYYY-MM" labels and slugs are ASCII, and this avoids ICU collation in a hot loop. */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareRecent(a: { slug: string; tx: TxSummary }, b: { slug: string; tx: TxSummary }): number {
  return cmp(b.tx.last ?? "", a.tx.last ?? "") || b.tx.count12m - a.tx.count12m || cmp(a.slug, b.slug);
}

/**
 * The `limit` items with the latest recorded sale (ties: busier first, then slug). Single pass with a
 * small sorted buffer, so it stays cheap over ~13k HDB blocks.
 */
export function recentlyTransacted<T extends { slug: string; tx: TxSummary }>(items: readonly T[], limit = 10): T[] {
  if (limit <= 0) return [];
  const top: T[] = [];
  for (const item of items) {
    if (!item.tx.last) continue;
    if (top.length === limit && compareRecent(item, top[top.length - 1]) >= 0) continue;
    let i = top.length;
    while (i > 0 && compareRecent(item, top[i - 1]) < 0) i--;
    top.splice(i, 0, item);
    if (top.length > limit) top.pop();
  }
  return top;
}

/* ------------------------------------------------------------------ */
/* Search results                                                      */
/* ------------------------------------------------------------------ */

export interface SearchGroup {
  kind: SearchKind;
  entries: SearchEntry[];
}

/** Group ranked search results by kind; groups appear in the order of their best-ranked entry. */
export function groupSearchResults(entries: readonly SearchEntry[]): SearchGroup[] {
  const groups = new Map<SearchKind, SearchEntry[]>();
  for (const e of entries) {
    const list = groups.get(e.kind);
    if (list) list.push(e);
    else groups.set(e.kind, [e]);
  }
  return [...groups.entries()].map(([kind, list]) => ({ kind, entries: list }));
}

/** Trimmed, length-capped search query from a raw searchParams value. */
export function normaliseQuery(raw: string | string[] | undefined, maxLength = 100): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-30" -> "30 Sep 2026"; passes through anything it cannot parse. */
export function formatIsoDate(date: string | null | undefined): string {
  if (!date) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return date;
  return `${Number(m[3])} ${MONTHS_SHORT[month - 1]} ${m[1]}`;
}
