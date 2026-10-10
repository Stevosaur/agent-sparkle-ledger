import { LISTING_KINDS, type ListingFilters, type ListingKind, type ListingSummary, type ListingType } from "./types";

/** Pure listing-filter helpers shared by /homes/, GET /api/homes/ and the client browser. */

export const DEFAULT_FILTERS: ListingFilters = { type: "sale", kind: null, area: null, minPrice: null, maxPrice: null, bedrooms: null };

/** Largest asking price accepted anywhere (S$100M): keeps filters and inputs sane. */
export const MAX_PRICE = 100_000_000;
export const BEDROOM_OPTIONS = [1, 2, 3, 4, 5] as const;

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(params: ParamSource, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key);
  const v = params[key];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function readPrice(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), MAX_PRICE) : null;
}

export function isAreaKey(value: string): boolean {
  if (/^town:[a-z0-9-]{1,60}$/.test(value)) return true;
  const m = /^d:(\d{1,2})$/.exec(value);
  return Boolean(m && Number(m[1]) >= 1 && Number(m[1]) <= 28);
}

/** ?type=rent&kind=hdb&area=town:tampines&min=400000&max=700000&beds=3 -> filters (invalid values ignored). */
export function parseListingFilters(params: ParamSource): ListingFilters {
  const type: ListingType = read(params, "type") === "rent" ? "rent" : "sale";
  const kindRaw = read(params, "kind");
  const kind = kindRaw && (LISTING_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as ListingKind) : null;
  const areaRaw = read(params, "area");
  const area = areaRaw && isAreaKey(areaRaw) ? areaRaw : null;
  let minPrice = readPrice(read(params, "min"));
  let maxPrice = readPrice(read(params, "max"));
  if (minPrice != null && maxPrice != null && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  const bedsRaw = Number(read(params, "beds"));
  const bedrooms = Number.isInteger(bedsRaw) && bedsRaw >= 1 && bedsRaw <= 5 ? bedsRaw : null;
  return { type, kind, area, minPrice, maxPrice, bedrooms };
}

/** Inverse of parseListingFilters; defaults are omitted so the canonical URL stays short. */
export function filtersToSearchParams(f: ListingFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.type !== "sale") p.set("type", f.type);
  if (f.kind) p.set("kind", f.kind);
  if (f.area) p.set("area", f.area);
  if (f.minPrice != null) p.set("min", String(f.minPrice));
  if (f.maxPrice != null) p.set("max", String(f.maxPrice));
  if (f.bedrooms != null) p.set("beds", String(f.bedrooms));
  return p;
}

/** True when only the listing type is set (the server-rendered first page can be reused). */
export function isUnfiltered(f: ListingFilters): boolean {
  return f.kind == null && f.area == null && f.minPrice == null && f.maxPrice == null && f.bedrooms == null;
}

export function matchesFilters(l: ListingSummary, f: ListingFilters): boolean {
  if (l.listingType !== f.type) return false;
  if (f.kind && l.kind !== f.kind) return false;
  if (f.area && l.areaKey !== f.area) return false;
  if (f.minPrice != null && l.askingPrice < f.minPrice) return false;
  if (f.maxPrice != null && l.askingPrice > f.maxPrice) return false;
  if (f.bedrooms != null) {
    if (l.bedrooms == null) return false;
    if (f.bedrooms >= 5 ? l.bedrooms < 5 : l.bedrooms !== f.bedrooms) return false;
  }
  return true;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isListingId(id: string): boolean {
  return UUID.test(id);
}
