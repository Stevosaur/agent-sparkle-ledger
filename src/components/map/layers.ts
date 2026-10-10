/**
 * Map layer payload for GET /api/map/layers/ and the decoders the client uses. Pure module (no
 * server-only imports): the route handler feeds it snapshot data, the browser decodes the tuples.
 *
 * Tuples keep the payload small: a few hundred launches, ~200 stations and ~180 primary schools.
 */
import type { LaunchType, MarketSegment, MrtStation, NewLaunch, School } from "@/lib/data/types";
import { isInSingapore } from "@/lib/geo-math";

/** [lat, lng, slug, name, type, launched (1) / upcoming (0), district, segment, totalUnits, expectedCompletionYear] */
export type LaunchTuple = [number, number, string, string, LaunchType, 0 | 1, number | null, MarketSegment | null, number | null, number | null];
/** [lat, lng, name, codes ("EW2 DT32"), approximate location (1/0), expected opening year] */
export type MrtTuple = [number, number, string, string, 0 | 1, number | null];
/** [lat, lng, name, address, postal] */
export type SchoolTuple = [number, number, string, string, string];

export interface MapLayersPayload {
  launches: LaunchTuple[];
  mrt: MrtTuple[];
  futureMrt: MrtTuple[];
  schools: SchoolTuple[];
  /** records left off the map because they have no usable coordinates */
  missingCoords: { launches: number; mrt: number; schools: number };
}

const round5 = (v: number) => Math.round(v * 1e5) / 1e5;

function coord(p: { lat?: number | null; lng?: number | null }): [number, number] | null {
  if (p.lat == null || p.lng == null || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
  if (!isInSingapore({ lat: p.lat, lng: p.lng })) return null;
  return [round5(p.lat), round5(p.lng)];
}

export function buildMapLayers(input: { launches: readonly NewLaunch[]; stations: readonly MrtStation[]; schools: readonly School[] }): MapLayersPayload {
  const out: MapLayersPayload = { launches: [], mrt: [], futureMrt: [], schools: [], missingCoords: { launches: 0, mrt: 0, schools: 0 } };

  for (const l of input.launches) {
    const c = coord(l);
    if (!c) {
      out.missingCoords.launches++;
      continue;
    }
    out.launches.push([c[0], c[1], l.slug, l.name, l.type, l.status === "launched" ? 1 : 0, l.district, l.segment, l.totalUnits, l.expectedCompletionYear]);
  }

  for (const s of input.stations) {
    const c = coord(s);
    if (!c) {
      out.missingCoords.mrt++;
      continue;
    }
    const t: MrtTuple = [c[0], c[1], s.name, s.codes.join(" "), s.approximate ? 1 : 0, s.expectedYear];
    (s.status === "future" ? out.futureMrt : out.mrt).push(t);
  }

  for (const s of input.schools) {
    if (s.level !== "PRIMARY") continue;
    const c = coord(s);
    if (!c) {
      out.missingCoords.schools++;
      continue;
    }
    out.schools.push([c[0], c[1], s.name, s.address, s.postal]);
  }

  out.launches.sort((a, b) => a[2].localeCompare(b[2]));
  out.mrt.sort((a, b) => a[2].localeCompare(b[2]));
  out.futureMrt.sort((a, b) => a[2].localeCompare(b[2]));
  out.schools.sort((a, b) => a[2].localeCompare(b[2]));
  return out;
}

/* ------------------------------------------------------------------ */
/* Client-side decoding                                                */
/* ------------------------------------------------------------------ */

export interface MapLaunch {
  lat: number;
  lng: number;
  slug: string;
  name: string;
  type: LaunchType;
  status: "launched" | "upcoming";
  district: number | null;
  segment: MarketSegment | null;
  totalUnits: number | null;
  expectedCompletionYear: number | null;
}

export interface MapStation {
  lat: number;
  lng: number;
  name: string;
  codes: string[];
  approximate: boolean;
  expectedYear: number | null;
}

export interface MapSchool {
  lat: number;
  lng: number;
  name: string;
  address: string;
  postal: string;
}

export function decodeLaunch(t: LaunchTuple): MapLaunch {
  return { lat: t[0], lng: t[1], slug: t[2], name: t[3], type: t[4], status: t[5] === 1 ? "launched" : "upcoming", district: t[6], segment: t[7], totalUnits: t[8], expectedCompletionYear: t[9] };
}

export function decodeStation(t: MrtTuple): MapStation {
  return { lat: t[0], lng: t[1], name: t[2], codes: t[3] ? t[3].split(" ") : [], approximate: t[4] === 1, expectedYear: t[5] };
}

export function decodeSchool(t: SchoolTuple): MapSchool {
  return { lat: t[0], lng: t[1], name: t[2], address: t[3], postal: t[4] };
}

/* ------------------------------------------------------------------ */
/* Deep links                                                          */
/* ------------------------------------------------------------------ */

export const MAP_MIN_ZOOM = 11;
export const MAP_MAX_ZOOM = 19;

/** Parse `?focus=lat,lng,zoom` (zoom optional, default 16). Null unless the point is in Singapore. */
export function parseFocus(raw: string | null | undefined): { lat: number; lng: number; zoom: number } | null {
  if (!raw) return null;
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((s) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN));
  const [lat, lng] = nums;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInSingapore({ lat, lng })) return null;
  const z = parts.length === 3 && Number.isFinite(nums[2]) ? Math.round(nums[2]) : 16;
  return { lat, lng, zoom: Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, z)) };
}

/** "/map/?focus=1.35400,103.94400,16" */
export function focusHref(lat: number, lng: number, zoom = 16): string {
  return `/map/?focus=${lat.toFixed(5)},${lng.toFixed(5)},${Math.round(zoom)}`;
}
