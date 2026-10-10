import { haversineM } from "@/lib/geo-math";
import { slugify } from "@/lib/slug";
import { FIT_MAX_PLACES, FIT_MAX_WEIGHT } from "./constants";
import type { FitPlace } from "./types";

/**
 * "Fit": rank homes by weighted straight-line distance to up to three places the user cares about
 * (work, parents, school ...). Score = sum(weight_i x distance_i) / sum(weight_i), in metres; lower is
 * better. Pure and client-safe.
 */

/** Place references: any property ref (hdb:, condo:, landed:, landed-street:, launch:type/slug), a town or an MRT station. */
const PLACE_REF = /^(?:(?:hdb|condo|landed|landed-street|town|mrt):[a-z0-9-]{1,100}|launch:(?:condo|ec|landed)\/[a-z0-9-]{1,100})$/;

export function isPlaceRef(value: string): boolean {
  return PLACE_REF.test(value);
}

export function clampWeight(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(FIT_MAX_WEIGHT, Math.max(1, Math.round(n)));
}

/**
 * ?p=hdb:blk-1-x,condo:foo&w=2,1 -> [{ ref, weight }]. Invalid refs are dropped, duplicates removed,
 * at most FIT_MAX_PLACES kept; missing or invalid weights default to 1, others are clamped to 1..5.
 */
export function parseFitParams(p: string | null | undefined, w: string | null | undefined): { ref: string; weight: number }[] {
  if (!p) return [];
  const refs = p.split(",").map((s) => s.trim().toLowerCase());
  const weights = (w ?? "").split(",");
  const out: { ref: string; weight: number }[] = [];
  refs.forEach((ref, i) => {
    if (out.length >= FIT_MAX_PLACES || !isPlaceRef(ref) || out.some((o) => o.ref === ref)) return;
    out.push({ ref, weight: weights[i] !== undefined && weights[i].trim() !== "" ? clampWeight(weights[i]) : 1 });
  });
  return out;
}

export function fitQueryString(places: { ref: string; weight: number }[]): string {
  if (places.length === 0) return "";
  const p = places.map((x) => x.ref).join(",");
  const w = places.map((x) => clampWeight(x.weight)).join(",");
  return `p=${encodeURIComponent(p).replace(/%2C/g, ",").replace(/%3A/g, ":").replace(/%2F/g, "/")}&w=${w}`;
}

/** Map a search result (SearchEntry kind + href + label) to a place ref, or null if it cannot be a place. */
export function placeRefFromSearch(entry: { kind: string; href: string; label: string }): string | null {
  const path = entry.href.split("?")[0];
  let m: RegExpExecArray | null;
  switch (entry.kind) {
    case "hdb":
      m = /^\/hdb\/([a-z0-9-]+)\/?$/.exec(path);
      return m ? `hdb:${m[1]}` : null;
    case "condo":
      m = /^\/condo\/([a-z0-9-]+)\/?$/.exec(path);
      return m ? `condo:${m[1]}` : null;
    case "landed":
      m = /^\/landed\/([a-z0-9-]+)\/?$/.exec(path);
      return m ? `landed:${m[1]}` : null;
    case "landed-street":
      m = /^\/landed-street\/([a-z0-9-]+)\/?$/.exec(path);
      return m ? `landed-street:${m[1]}` : null;
    case "launch":
      m = /^\/new-launch\/(condo|ec|landed)\/([a-z0-9-]+)\/?$/.exec(path);
      return m ? `launch:${m[1]}/${m[2]}` : null;
    case "town": {
      m = /\/([a-z0-9-]+)\/?$/.exec(path);
      return m ? `town:${m[1]}` : null;
    }
    case "mrt": {
      const name = entry.label.replace(/\b(mrt|lrt)\b|\bstation\b/gi, "").trim();
      const slug = slugify(name);
      return slug ? `mrt:${slug}` : null;
    }
    default:
      return null;
  }
}

export interface FitCandidate {
  lat: number | null | undefined;
  lng: number | null | undefined;
}

export interface Ranked<T> {
  item: T;
  score: number;
  distances: number[];
}

/** Rank candidates by weighted mean distance to `places` (ascending); candidates without coordinates are skipped. */
export function rankByWeightedDistance<T extends FitCandidate>(candidates: readonly T[], places: readonly Pick<FitPlace, "lat" | "lng" | "weight">[], limit: number): Ranked<T>[] {
  if (places.length === 0) return [];
  const totalWeight = places.reduce((s, p) => s + p.weight, 0);
  if (!(totalWeight > 0)) return [];
  const ranked: Ranked<T>[] = [];
  for (const c of candidates) {
    if (c.lat == null || c.lng == null || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    const at = { lat: c.lat, lng: c.lng };
    const distances = places.map((p) => Math.round(haversineM(at, p)));
    const score = Math.round(distances.reduce((s, d, i) => s + d * places[i].weight, 0) / totalWeight);
    ranked.push({ item: c, score, distances });
  }
  ranked.sort((a, b) => a.score - b.score || Math.max(...a.distances) - Math.max(...b.distances));
  return ranked.slice(0, Math.max(0, limit));
}
