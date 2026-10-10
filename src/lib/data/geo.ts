import "server-only";
import { readJson } from "./store";
import { haversineM } from "@/lib/geo-math";
import type { LatLng, MrtStation, NearbyStation, School } from "./types";

export function getMrtStations(): MrtStation[] {
  return readJson<MrtStation[]>("geo/mrt-stations.json", []);
}

export function getSchools(): School[] {
  return readJson<School[]>("geo/schools.json", []);
}

export { haversineM };

export function toNearby(s: MrtStation, from: LatLng): NearbyStation {
  return {
    name: s.name,
    codes: s.codes,
    lines: s.lines,
    status: s.status,
    expectedYear: s.expectedYear,
    distanceM: Math.round(haversineM(from, s)),
  };
}

export function nearestStations(
  from: LatLng,
  opts: { limit?: number; maxDistanceM?: number; status?: "operational" | "future" | "any" } = {},
): NearbyStation[] {
  const { limit = 3, maxDistanceM = Infinity, status = "operational" } = opts;
  return getMrtStations()
    .filter((s) => status === "any" || s.status === status)
    .map((s) => toNearby(s, from))
    .filter((s) => s.distanceM <= maxDistanceM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}

export function schoolsWithin(from: LatLng, radiusM: number, level?: string): (School & { distanceM: number })[] {
  return getSchools()
    .filter((s) => !level || s.level === level)
    .map((s) => ({ ...s, distanceM: Math.round(haversineM(from, s)) }))
    .filter((s) => s.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** Raffles Place MRT, used as the CBD reference point for "distance to CBD". */
export const CBD_POINT: LatLng = { lat: 1.28393, lng: 103.85143 };
