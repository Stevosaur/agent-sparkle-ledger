/**
 * Stat-series key helpers shared by the trend builder (client), the series API and pages.
 * Keys look like "hdb:TAMPINES:4 ROOM", "rent-hdb:ALL:ALL", "private:OCR:Condo", "private-d:15:ALL".
 */

export type SeriesKind = "hdb" | "rent-hdb" | "private" | "private-d" | "rent-private" | "rent-private-d" | "other";

const KEY_RE = /^[a-z-]{2,20}:[A-Za-z0-9 /&'.-]{1,40}:[A-Za-z0-9 .-]{1,30}$/;

export function isValidSeriesKey(key: string): boolean {
  return key.length <= 100 && KEY_RE.test(key);
}

/** National HDB resale series are free for everyone; every other series needs insights.full. */
export function isPublicSeriesKey(key: string): boolean {
  return key.startsWith("hdb:ALL:");
}

export function seriesKind(key: string): SeriesKind {
  const k = key.split(":")[0];
  return k === "hdb" || k === "rent-hdb" || k === "private" || k === "private-d" || k === "rent-private" || k === "rent-private-d" ? k : "other";
}

/** Rent series carry the median monthly rent in medianPrice and no psf. */
export function isRentSeries(key: string): boolean {
  const k = seriesKind(key);
  return k === "rent-hdb" || k === "rent-private" || k === "rent-private-d";
}

export interface SeriesOption {
  key: string;
  label: string;
  public: boolean;
}

export interface SeriesGroup {
  id: string;
  label: string;
  labelKey: string;
  options: SeriesOption[];
}

const GROUPS: { id: string; label: string; labelKey: string; test: (key: string) => boolean }[] = [
  { id: "hdb-national", label: "HDB resale · all towns", labelKey: "insights.trend.groupHdbNational", test: (k) => k.startsWith("hdb:ALL:") },
  { id: "hdb-town", label: "HDB resale · by town", labelKey: "insights.trend.groupHdbTown", test: (k) => k.startsWith("hdb:") },
  { id: "hdb-rent", label: "HDB rents", labelKey: "insights.trend.groupHdbRent", test: (k) => k.startsWith("rent-hdb:") },
  { id: "private", label: "Private · segments and types", labelKey: "insights.trend.groupPrivate", test: (k) => k.startsWith("private:") },
  { id: "private-district", label: "Private · postal districts", labelKey: "insights.trend.groupPrivateDistrict", test: (k) => k.startsWith("private-d:") },
  { id: "private-rent", label: "Private rents", labelKey: "insights.trend.groupPrivateRent", test: (k) => k.startsWith("rent-private") },
];

function districtNumber(key: string): number {
  return Number(key.split(":")[1]) || 0;
}

/** Group series keys for the picker; unknown prefixes are dropped. */
export function groupSeriesKeys(keys: { key: string; label: string }[]): SeriesGroup[] {
  const out: SeriesGroup[] = GROUPS.map((g) => ({ id: g.id, label: g.label, labelKey: g.labelKey, options: [] }));
  for (const k of keys) {
    const idx = GROUPS.findIndex((g) => g.test(k.key));
    if (idx < 0) continue;
    out[idx].options.push({ key: k.key, label: k.label, public: isPublicSeriesKey(k.key) });
  }
  for (const g of out) {
    if (g.id === "private-district" || g.id === "private-rent") g.options.sort((a, b) => districtNumber(a.key) - districtNumber(b.key) || a.key.localeCompare(b.key));
    else g.options.sort((a, b) => a.label.localeCompare(b.label));
  }
  return out.filter((g) => g.options.length > 0);
}

export type TrendMetric = "price" | "psf" | "volume";

export const MAX_TREND_SERIES = 6;

export interface TrendState {
  keys: string[];
  metric: TrendMetric;
  from: number | null;
  to: number | null;
}

/** Parse ?s=key1,key2&metric=psf&from=2015&to=2026 (invalid parts dropped). */
export function parseTrendParams(params: { get(name: string): string | null }, validKeys?: ReadonlySet<string>): TrendState {
  const raw = params.get("s") ?? "";
  const keys: string[] = [];
  for (const part of raw.split(",")) {
    const k = part.trim();
    if (!k || !isValidSeriesKey(k) || keys.includes(k)) continue;
    if (validKeys && !validKeys.has(k)) continue;
    keys.push(k);
    if (keys.length >= MAX_TREND_SERIES) break;
  }
  const m = params.get("metric");
  const metric: TrendMetric = m === "psf" || m === "volume" ? m : "price";
  const year = (v: string | null) => {
    const n = Number(v);
    return v && Number.isInteger(n) && n >= 1990 && n <= 2100 ? n : null;
  };
  let from = year(params.get("from"));
  let to = year(params.get("to"));
  if (from != null && to != null && from > to) [from, to] = [to, from];
  return { keys, metric, from, to };
}

/** Inverse of parseTrendParams; omits defaults. Commas between keys stay readable. */
export function trendQueryString(state: TrendState): string {
  const parts: string[] = [];
  if (state.keys.length) parts.push(`s=${state.keys.map((k) => encodeURIComponent(k)).join(",")}`);
  if (state.metric !== "price") parts.push(`metric=${state.metric}`);
  if (state.from != null) parts.push(`from=${state.from}`);
  if (state.to != null) parts.push(`to=${state.to}`);
  return parts.join("&");
}
