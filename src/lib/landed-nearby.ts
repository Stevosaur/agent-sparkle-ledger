import "server-only";
import { getDistrictTransactions, getLandedAddresses, getLandedStreets, getProject, LANDED_HOUSE_TYPES } from "@/lib/data/private";
import { haversineM } from "@/lib/geo-math";
import type { LandedAddress, LandedStreet, LatLng, PrivateTransaction } from "@/lib/data/types";

/**
 * "Nearby landed sales" for a landed address page: recent landed-house sales on OTHER streets whose house
 * (or, when the house is not geocoded, its street) is within a short straight-line distance.
 */

export const NEARBY_LANDED_RADIUS_M = 500;
export const NEARBY_LANDED_MONTHS = 24;
export const NEARBY_LANDED_LIMIT = 10;

export interface NearbyLandedSale {
  tx: PrivateTransaction;
  street: Pick<LandedStreet, "slug" | "street">;
  /** /landed/<slug>/ of the sale's address, when the address has a page */
  addressSlug: string | null;
  /** straight-line metres from the subject to the house, or to its street's point when the house is not geocoded */
  distanceM: number;
}

export interface NearbyLandedResult {
  /** latest first (nearest first within a month), at most `limit` */
  sales: NearbyLandedSale[];
  /** every qualifying sale before the cap */
  total: number;
  /** first month index of the window (inclusive) */
  fromMonth: number;
  /** last month index of the window (the dataset's latest private month) */
  toMonth: number;
}

function point(x: { lat?: number | null; lng?: number | null }): LatLng | null {
  return x.lat != null && x.lng != null && Number.isFinite(x.lat) && Number.isFinite(x.lng) ? { lat: x.lat, lng: x.lng } : null;
}

const addressKey = (address: string) => address.trim().toUpperCase();

/**
 * Pure selection, so it can be unit-tested with synthetic data. Only the postal districts of the streets that
 * can be in range are read (via `districtTransactions`), never every district file.
 */
export function selectNearbyLandedSales(input: {
  origin: LatLng;
  /** the subject's own street: its sales are shown separately on the page */
  excludeStreetSlug: string;
  streets: readonly LandedStreet[];
  addresses: readonly LandedAddress[];
  districtTransactions: (district: number) => readonly PrivateTransaction[];
  projectDistrict: (projectSlug: string) => number | null;
  /** latest month index of the private dataset */
  latestMonth: number;
  radiusM?: number;
  months?: number;
  limit?: number;
}): NearbyLandedResult {
  const { origin, excludeStreetSlug, latestMonth, radiusM = NEARBY_LANDED_RADIUS_M, months = NEARBY_LANDED_MONTHS, limit = NEARBY_LANDED_LIMIT } = input;
  const fromMonth = latestMonth - months + 1;
  const within = (p: LatLng | null): number | null => {
    if (!p) return null;
    const d = haversineM(origin, p);
    return d <= radiusM ? d : null;
  };

  // geocoded addresses on other streets, and the streets that have at least one of them in range
  const addressByKey = new Map<string, { slug: string; point: LatLng | null }>();
  const streetsWithAddressInRange = new Set<string>();
  for (const a of input.addresses) {
    if (a.streetSlug === excludeStreetSlug) continue;
    const p = point(a);
    addressByKey.set(addressKey(a.address), { slug: a.slug, point: p });
    if (within(p) != null) streetsWithAddressInRange.add(a.streetSlug);
  }

  // candidate streets: street point in range, or any of its geocoded houses in range
  const streetByProject = new Map<string, { street: LandedStreet; point: LatLng | null }>();
  const districts = new Set<number>();
  for (const s of input.streets) {
    if (s.slug === excludeStreetSlug) continue;
    const p = point(s);
    if (within(p) == null && !streetsWithAddressInRange.has(s.slug)) continue;
    if (s.district != null) districts.add(s.district);
    for (const proj of s.projects) {
      streetByProject.set(proj, { street: s, point: p });
      const d = input.projectDistrict(proj);
      if (d != null) districts.add(d);
    }
  }

  const all: NearbyLandedSale[] = [];
  for (const district of [...districts].sort((a, b) => a - b)) {
    for (const tx of input.districtTransactions(district)) {
      if (tx.monthIndex < fromMonth || tx.monthIndex > latestMonth) continue;
      if (!LANDED_HOUSE_TYPES.has(tx.propertyType)) continue;
      const hit = streetByProject.get(tx.projectSlug);
      if (!hit) continue;
      const addr = tx.address ? addressByKey.get(addressKey(tx.address)) : undefined;
      // the house's own point when geocoded, else its street's point
      const d = within(addr?.point ?? hit.point);
      if (d == null) continue;
      all.push({ tx, street: { slug: hit.street.slug, street: hit.street.street }, addressSlug: addr?.slug ?? null, distanceM: Math.round(d) });
    }
  }
  all.sort((a, b) => b.tx.monthIndex - a.tx.monthIndex || a.distanceM - b.distanceM || b.tx.price - a.tx.price);
  return { sales: all.slice(0, Math.max(0, limit)), total: all.length, fromMonth, toMonth: latestMonth };
}

/** Nearby landed sales around a geocoded landed address, from the snapshot. */
export function nearbyLandedSales(address: Pick<LandedAddress, "streetSlug">, origin: LatLng, latestMonth: number): NearbyLandedResult {
  return selectNearbyLandedSales({
    origin,
    excludeStreetSlug: address.streetSlug,
    streets: getLandedStreets(),
    addresses: getLandedAddresses(),
    districtTransactions: getDistrictTransactions,
    projectDistrict: (slug) => getProject(slug)?.district ?? null,
    latestMonth,
  });
}
