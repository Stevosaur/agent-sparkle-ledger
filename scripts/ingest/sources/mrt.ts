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

/** Matching key: upper case, "MRT/LRT STATION" suffix dropped, punctuation -> spaces ("one-north" ~ "ONE-NORTH" -> "ONE NORTH"). */
export function stationKey(name: string): string {
  return name
    .toUpperCase()
    .trim()
    .replace(/\s+(MRT|LRT)\s+STATION$/, "")
    .replace(/\s+STATION$/, "")
    .replace(/[^A-Z0-9]+/g, " ")
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
  // LTA sometimes publishes a station code instead of a name (e.g. "CC9" for Paya Lebar)
  const refByCode = new Map(ref.flatMap((r) => r.codes.map((c) => [c.toUpperCase(), r] as const)));
  const stations: MrtStation[] = [];
  const unmatched: string[] = [];
  const operationalKeys = new Set<string>();
  const merged = new Map<string, { ref: StationReference | undefined; lats: number[]; lngs: number[] }>();
  for (const s of exitsGeojson ? stationsFromExits(exitsGeojson) : []) {
    const r = refByKey.get(s.name) ?? (/^[A-Z]{2,3}\d+$/.test(s.name.replace(/\s/g, "")) ? refByCode.get(s.name.replace(/\s/g, "")) : undefined);
    if (!r && ref.length) {
      // not on the allow-list of operating stations (e.g. an unopened station whose exits are already published)
      unmatched.push(s.name);
      continue;
    }
    const key = r ? stationKey(r.name) : s.name;
    const g = merged.get(key) ?? { ref: r, lats: [], lngs: [] };
    // weight by exit count so MRT + LRT records of the same station merge sensibly
    for (let i = 0; i < s.exits; i++) {
      g.lats.push(s.lat);
      g.lngs.push(s.lng);
    }
    merged.set(key, g);
  }
  for (const [key, g] of merged) {
    operationalKeys.add(key);
    stations.push({
      name: g.ref?.name ?? key,
      codes: g.ref?.codes ?? [],
      lines: g.ref?.lines ?? [],
      status: "operational",
      expectedYear: null,
      approximate: false,
      lat: Math.round((g.lats.reduce((a, b) => a + b, 0) / g.lats.length) * 1e6) / 1e6,
      lng: Math.round((g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length) * 1e6) / 1e6,
    });
  }
  const missing = ref.filter((r) => !operationalKeys.has(stationKey(r.name))).map((r) => r.name);
  if (missing.length) unmatched.push(...missing.map((m) => `(no exits) ${m}`));
  for (const f of loadFutureStations()) {
    const key = stationKey(f.name);
    // A future line at an existing station (e.g. a new interchange) stays a separate "future" record, so the
    // operational record never claims a line that is not open yet. It reuses the existing station's location.
    const op = operationalKeys.has(key) ? stations.find((s) => stationKey(s.name) === key && s.status === "operational") : undefined;
    const lat = f.lat ?? op?.lat ?? null;
    const lng = f.lng ?? op?.lng ?? null;
    if (lat == null || lng == null) continue;
    stations.push({ name: f.name.toUpperCase(), codes: f.codes, lines: f.lines, status: "future", expectedYear: f.expectedYear, approximate: f.lat == null ? false : f.approximate, lat, lng });
  }
  return { stations, unmatched };
}
