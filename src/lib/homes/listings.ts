import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabasePublicKey, supabaseUrl } from "@/lib/auth/config";
import { getMeta } from "@/lib/data/meta";
import { matchesFilters } from "./filters";
import { resolveListingProperty } from "./property";
import { sampleListings } from "./sample-listings";
import type { AreaOption, HomeListing, ListingFilters, ListingsBackend, ListingsPage, ListingSummary, ListingType } from "./types";

/**
 * Read access to `home_listings`.
 *
 * Public pages are ISR, so reads use a cookie-less Supabase client with the publishable (anon) key:
 * row-level security exposes only `status = 'active'` rows to it. (createSupabaseServerClient() would
 * read cookies and turn every listings page into a per-request render.) Writes go through the
 * signed-in user's client in the route handlers so the owner policies apply.
 */

export const LISTING_TABLE = "home_listings";
/** Public columns (user_id is deliberately not exposed). */
const PUBLIC_COLUMNS = "id,listing_type,ref,title,description,asking_price,flat_type,area_sqm,floor_level,bedrooms,bathrooms,contact_name,whatsapp,status,lat,lng,created_at,updated_at";
/** Newest active listings considered for browsing / fit (filters on derived fields run in memory). */
export const ACTIVE_LISTING_CAP = 1000;

export function listingsBackend(): ListingsBackend {
  if (isSupabaseConfigured()) return "supabase";
  return getMeta().fixture ? "sample" : "none";
}

let anonClient: SupabaseClient | null = null;
function publicClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!anonClient) {
    anonClient = createClient(supabaseUrl()!, supabasePublicKey()!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return anonClient;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** Map a database row to HomeListing; null for rows that are malformed. */
export function rowToListing(row: Record<string, unknown>): HomeListing | null {
  const id = str(row.id);
  const listingType = row.listing_type === "sale" || row.listing_type === "rent" ? row.listing_type : null;
  const ref = str(row.ref);
  const title = str(row.title);
  const askingPrice = num(row.asking_price);
  if (!id || !listingType || !ref || !title || askingPrice == null || askingPrice <= 0) return null;
  const floor = num(row.floor_level);
  return {
    id,
    userId: str(row.user_id),
    listingType,
    ref,
    title,
    description: str(row.description),
    askingPrice,
    flatType: str(row.flat_type),
    areaSqm: num(row.area_sqm),
    floorLevel: floor != null ? Math.round(floor) : null,
    bedrooms: num(row.bedrooms),
    bathrooms: num(row.bathrooms),
    contactName: str(row.contact_name),
    whatsapp: str(row.whatsapp),
    status: row.status === "closed" ? "closed" : "active",
    lat: num(row.lat),
    lng: num(row.lng),
    createdAt: str(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: str(row.updated_at),
  };
}

export interface ActiveListingsResult {
  listings: HomeListing[];
  backend: ListingsBackend;
  unavailable: boolean;
}

/** Newest active listings (optionally one type), capped at ACTIVE_LISTING_CAP. */
export async function getActiveListings(opts: { type?: ListingType } = {}): Promise<ActiveListingsResult> {
  const backend = listingsBackend();
  if (backend === "sample") {
    const all = sampleListings();
    return { listings: opts.type ? all.filter((l) => l.listingType === opts.type) : all, backend, unavailable: false };
  }
  const client = publicClient();
  if (!client) return { listings: [], backend: "none", unavailable: false };
  let query = client.from(LISTING_TABLE).select(PUBLIC_COLUMNS).eq("status", "active");
  if (opts.type) query = query.eq("listing_type", opts.type);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(ACTIVE_LISTING_CAP);
  if (error) {
    console.error("[homes] listing query failed:", error.code, error.message);
    return { listings: [], backend, unavailable: true };
  }
  const listings = (data ?? []).map((r) => rowToListing(r as Record<string, unknown>)).filter((l): l is HomeListing => l !== null);
  return { listings, backend, unavailable: false };
}

/** One active listing by id (closed or unknown listings are not public: null). */
export async function getListing(id: string): Promise<HomeListing | null> {
  const backend = listingsBackend();
  if (backend === "sample") return sampleListings().find((l) => l.id === id) ?? null;
  const client = publicClient();
  if (!client) return null;
  const { data, error } = await client.from(LISTING_TABLE).select(PUBLIC_COLUMNS).eq("id", id).eq("status", "active").maybeSingle();
  if (error) {
    console.error("[homes] listing lookup failed:", error.code, error.message);
    return null;
  }
  return data ? rowToListing(data as Record<string, unknown>) : null;
}

export function toSummary(l: HomeListing): ListingSummary {
  const prop = resolveListingProperty(l.ref);
  return {
    id: l.id,
    listingType: l.listingType,
    title: l.title,
    askingPrice: l.askingPrice,
    flatType: l.flatType,
    areaSqm: l.areaSqm,
    floorLevel: l.floorLevel,
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    createdAt: l.createdAt,
    ref: l.ref,
    kind: prop?.kind ?? null,
    propertyLabel: prop?.label ?? null,
    propertyHref: prop?.href ?? null,
    areaKey: prop?.areaKey ?? null,
    areaLabel: prop?.areaLabel ?? null,
    sample: Boolean(l.sample),
  };
}

/** Area filter options present among the given listings: HDB towns first, then postal districts. */
export function areaOptions(summaries: ListingSummary[]): AreaOption[] {
  const seen = new Map<string, AreaOption>();
  for (const s of summaries) {
    if (!s.areaKey || !s.areaLabel || seen.has(s.areaKey)) continue;
    seen.set(s.areaKey, { key: s.areaKey, label: s.areaLabel, group: s.areaKey.startsWith("town:") ? "town" : "district" });
  }
  return [...seen.values()].sort((a, b) => {
    if (a.group !== b.group) return a.group === "town" ? -1 : 1;
    if (a.group === "district") return Number(a.key.slice(2)) - Number(b.key.slice(2));
    return a.label.localeCompare(b.label);
  });
}

export const PAGE_SIZE = 24;

/** Filtered, paginated listing summaries for /homes/ and GET /api/homes/. */
export async function searchListings(filters: ListingFilters, opts: { offset?: number; limit?: number } = {}): Promise<ListingsPage> {
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const limit = Math.min(48, Math.max(1, Math.floor(opts.limit ?? PAGE_SIZE)));
  const { listings, backend, unavailable } = await getActiveListings({ type: filters.type });
  const matching = listings.map(toSummary).filter((s) => matchesFilters(s, filters));
  return { listings: matching.slice(offset, offset + limit), total: matching.length, backend, ...(unavailable ? { unavailable } : {}) };
}

export interface HomesIndexData {
  sale: ListingsPage;
  rent: ListingsPage;
  areas: AreaOption[];
  backend: ListingsBackend;
  unavailable: boolean;
}

/** Everything /homes/ renders on the server: first page per tab plus the area filter options. */
export async function homesIndexData(): Promise<HomesIndexData> {
  const { listings, backend, unavailable } = await getActiveListings();
  const summaries = listings.map(toSummary);
  const page = (type: ListingType): ListingsPage => {
    const all = summaries.filter((s) => s.listingType === type);
    return { listings: all.slice(0, PAGE_SIZE), total: all.length, backend, ...(unavailable ? { unavailable } : {}) };
  };
  return { sale: page("sale"), rent: page("rent"), areas: areaOptions(summaries), backend, unavailable };
}
