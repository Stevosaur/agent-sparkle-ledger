import "server-only";
import { NextResponse } from "next/server";
import { getMeta } from "@/lib/data/meta";
import { monthIndex } from "@/lib/data/months";
import { getLandedAddresses, getLaunches, getProject } from "@/lib/data/private";
import { CBD_POINT, getMrtStations, haversineM, schoolsWithin, toNearby } from "@/lib/data/geo";
import type { LandedAddress, LatLng, NearbyStation, NewLaunch, PrivateProject, PrivateTransaction } from "@/lib/data/types";

/** Condo / apartment / EC project for /condo/<slug>/ — landed-only projects have no condo page. */
export function getCondoProject(slug: string): PrivateProject | null {
  const p = getProject(slug);
  return p && !p.isLanded ? p : null;
}

/** Latest month covered by the private dataset (meta), falling back to the latest sale in `txs`. */
export function latestPrivateMonth(txs: readonly PrivateTransaction[] = []): number | null {
  const label = getMeta().latestMonth.private;
  if (label) {
    try {
      return monthIndex(label);
    } catch {
      /* fall through */
    }
  }
  let best: number | null = null;
  for (const t of txs) if (best == null || t.monthIndex > best) best = t.monthIndex;
  return best;
}

/** Landed addresses (unit-level data only) on a landed street, sorted by house number. */
export function addressesOnStreet(streetSlug: string): LandedAddress[] {
  return getLandedAddresses()
    .filter((a) => a.streetSlug === streetSlug)
    .sort((a, b) => a.houseNo.localeCompare(b.houseNo, "en", { numeric: true }));
}

/** "13 HAIG LANE" -> "13-haig-ln" for the addresses on one street. */
export function addressSlugMap(streetSlug: string): Map<string, string> {
  return new Map(addressesOnStreet(streetSlug).map((a) => [a.address, a.slug]));
}

/** The new-launch record for a project's launchSlug (any launch type). */
export function launchFor(launchSlug: string | null): NewLaunch | null {
  if (!launchSlug) return null;
  return getLaunches().find((l) => l.slug === launchSlug) ?? null;
}

/** Gated responses are per-viewer: never cache them in shared caches. */
export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function notFoundJson() {
  return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
}

export function gatedJson<T>(body: T) {
  return NextResponse.json(body, { headers: NO_STORE });
}

/* ------------------------------------------------------------------ */
/* Nearby context (schools, MRT, CBD)                                  */
/* ------------------------------------------------------------------ */

export interface StationNear extends NearbyStation {
  lat: number;
  lng: number;
  approximate: boolean;
}

export interface SchoolNear {
  name: string;
  distanceM: number;
  lat: number;
  lng: number;
}

export interface NearbyContext {
  center: LatLng;
  /** nearest three operational stations */
  mrt: StationNear[];
  /** announced (future) stations within 2 km */
  futureMrt: StationNear[];
  /** primary schools within 1 km and between 1 and 2 km (straight line) */
  schools1k: SchoolNear[];
  schools2k: SchoolNear[];
  /** straight-line distance to Raffles Place */
  cbdM: number;
}

/** Schools, MRT stations and CBD distance around a point (straight-line distances). */
export function nearbyContext(center: LatLng): NearbyContext {
  const stations: StationNear[] = getMrtStations()
    .map((s) => ({ ...toNearby(s, center), lat: s.lat, lng: s.lng, approximate: s.approximate }))
    .sort((a, b) => a.distanceM - b.distanceM);
  const primary = schoolsWithin(center, 2000, "PRIMARY").map((s) => ({ name: s.name, distanceM: s.distanceM, lat: s.lat, lng: s.lng }));
  return {
    center,
    mrt: stations.filter((s) => s.status === "operational").slice(0, 3),
    futureMrt: stations.filter((s) => s.status === "future" && s.distanceM <= 2000).slice(0, 5),
    schools1k: primary.filter((s) => s.distanceM <= 1000),
    schools2k: primary.filter((s) => s.distanceM > 1000),
    cbdM: Math.round(haversineM(center, CBD_POINT)),
  };
}

/** Coordinates when both are present. */
export function pointOf(x: { lat?: number | null; lng?: number | null }): LatLng | null {
  return x.lat != null && x.lng != null && Number.isFinite(x.lat) && Number.isFinite(x.lng) ? { lat: x.lat, lng: x.lng } : null;
}
