/**
 * MRT/LRT stations: LTA "MRT Station Exit" GeoJSON (docs/research/datagov-api.md §5.6) grouped by station
 * name and averaged, joined with the curated line/code table and future stations in scripts/ingest/reference/.
 */
import fs from "node:fs";
import path from "node:path";
import type { MrtLineCode, MrtStation } from "../../../src/lib/data/types";

export interface StationReference {
  /** official name, upper case, without "MRT STATION" / "LRT STATION" */
  name: string;
  codes: string[];
  lines: MrtLineCode[];
}

export interface FutureStationReference extends StationReference {
  expectedYear: number | null;
  lat: number | null;
  lng: number | null;
  /** true when coordinates are approximate */
  approximate: boolean;
  source: string;
}

const REF_DIR = path.join(__dirname, "../reference");

export function loadStationReference(): StationReference[] {
  try {
    return JSON.parse(fs.readFileSync(path.join(REF_DIR, "mrt-stations.json"), "utf8")) as StationReference[];
  } catch {
    return [];
  }
}

export function loadFutureStations(): FutureStationReference[] {
  try {
    return JSON.parse(fs.readFileSync(path.join(REF_DIR, "future-stations.json"), "utf8")) as FutureStationReference[];
  } catch {
    return [];
  }
}

export function stationKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/\s+(MRT|LRT)\s+STATION$/, "")
    .replace(/\s+STATION$/, "")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface Feature {
  geometry?: { type?: string; coordinates?: number[] };
  properties?: Record<string, unknown>;
}

function stationName(props: Record<string, unknown>): string | null {
  const direct = props.STATION_NA ?? props.station_na ?? props.STATION_NAME;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const desc = props.Description ?? props.description;
  if (typeof desc === "string") {
    const m = /<th>\s*STATION_NA\s*<\/th>\s*<td>([^<]+)<\/td>/i.exec(desc);
    if (m) return m[1].trim();
  }
  return null;
}

/** Group exits into stations (mean of exit coordinates). */
export function stationsFromExits(geojson: { features?: Feature[] }): { name: string; mode: "MRT" | "LRT"; lat: number; lng: number; exits: number }[] {
  const groups = new Map<string, { name: string; mode: "MRT" | "LRT"; lats: number[]; lngs: number[] }>();
  for (const f of geojson.features ?? []) {
    const c = f.geometry?.coordinates;
    if (f.geometry?.type !== "Point" || !c || c.length < 2) continue;
    const raw = stationName(f.properties ?? {});
    if (!raw) continue;
    const key = stationKey(raw);
    const mode = /LRT/i.test(raw) ? "LRT" : "MRT";
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { name: key, mode, lats: [], lngs: [] }));
    g.lngs.push(c[0]);
    g.lats.push(c[1]);
  }
  return [...groups.values()].map((g) => ({
    name: g.name,
    mode: g.mode,
    lat: Math.round((g.lats.reduce((s, v) => s + v, 0) / g.lats.length) * 1e6) / 1e6,
    lng: Math.round((g.lngs.reduce((s, v) => s + v, 0) / g.lngs.length) * 1e6) / 1e6,
    exits: g.lats.length,
  }));
}

export function buildStations(exitsGeojson: { features?: Feature[] } | null): { stations: MrtStation[]; unmatched: string[] } {
  const ref = loadStationReference();
  const refByKey = new Map(ref.map((r) => [stationKey(r.name), r]));
  const stations: MrtStation[] = [];
  const unmatched: string[] = [];
  const operationalKeys = new Set<string>();
  for (const s of exitsGeojson ? stationsFromExits(exitsGeojson) : []) {
    const r = refByKey.get(s.name);
    if (!r) unmatched.push(s.name);
    operationalKeys.add(s.name);
    stations.push({
      name: s.name,
      codes: r?.codes ?? [],
      lines: r?.lines ?? [],
      status: "operational",
      expectedYear: null,
      approximate: false,
      lat: s.lat,
      lng: s.lng,
    });
  }
  for (const f of loadFutureStations()) {
    const key = stationKey(f.name);
    // A future line at an existing station (e.g. a new interchange) stays a separate "future" record, so the
    // operational record never claims a line that is not open yet. It reuses the existing station's location.
    const op = operationalKeys.has(key) ? stations.find((s) => s.name === key && s.status === "operational") : undefined;
    const lat = f.lat ?? op?.lat ?? null;
    const lng = f.lng ?? op?.lng ?? null;
    if (lat == null || lng == null) continue;
    stations.push({ name: key, codes: f.codes, lines: f.lines, status: "future", expectedYear: f.expectedYear, approximate: f.lat == null ? false : f.approximate, lat, lng });
  }
  return { stations, unmatched };
}
