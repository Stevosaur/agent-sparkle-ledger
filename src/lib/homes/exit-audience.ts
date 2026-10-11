import { haversineM } from "@/lib/geo-math";
import { mopCohorts, mopYear, type MopBlock } from "@/lib/calc/supply-demand";
import type { ExitAudience } from "./types";

/**
 * "Exit audience" heuristic: who is likely to be in the market around a listing, from HDB Minimum
 * Occupation Period (MOP) timing. MOP year = year completed + 5; owners may sell, or buy private
 * property, only after MOP.
 *
 * - HDB listing: flats within the radius reaching MOP this year or in the next two (three MOP
 *   cohorts) — owners about to become free to sell and upgrade: likely movers and competing sellers.
 * - Private listing (condo / EC / landed): flats within the radius that passed MOP in the five previous
 *   calendar years — the pool of HDB upgraders most likely to buy private nearby.
 *
 * Straight-line distance; blocks without coordinates, completion year or dwelling-unit counts are
 * excluded (and counted in `excludedBlocks`).
 */

export interface AudienceBlock extends MopBlock {
  slug: string;
  label: string;
  town: string;
}

export function audienceWindow(audience: "hdb" | "private", currentYear: number): { fromYear: number; toYear: number } {
  return audience === "hdb" ? { fromYear: currentYear, toYear: currentYear + 2 } : { fromYear: currentYear - 5, toYear: currentYear - 1 };
}

export function computeExitAudience(
  blocks: readonly AudienceBlock[],
  center: { lat: number; lng: number },
  audience: "hdb" | "private",
  currentYear: number,
  opts: { radiusM: number; excludeSlug?: string | null; topN?: number },
): ExitAudience {
  const { radiusM, excludeSlug = null, topN = 15 } = opts;
  const { fromYear, toYear } = audienceWindow(audience, currentYear);
  const inRadius: (AudienceBlock & { distanceM: number })[] = [];
  let excludedBlocks = 0;
  for (const b of blocks) {
    if (b.slug === excludeSlug) continue;
    if (b.lat == null || b.lng == null) continue;
    const d = haversineM(center, { lat: b.lat, lng: b.lng });
    if (d > radiusM) continue;
    if (b.yearCompleted == null || !b.dwellingUnits) {
      excludedBlocks++;
      continue;
    }
    inRadius.push({ ...b, distanceM: Math.round(d) });
  }
  const cohorts = mopCohorts(inRadius, center, radiusM, fromYear, toYear);
  const topBlocks = inRadius
    // same MOP rule as the cohorts (mopYear honours a block's own mopYears, default 5)
    .map((b) => ({ slug: b.slug, label: b.label, town: b.town, distanceM: b.distanceM, mopYear: mopYear(b) as number, units: b.dwellingUnits as number }))
    .filter((b) => b.mopYear >= fromYear && b.mopYear <= toYear)
    .sort((a, b) => b.units - a.units || a.distanceM - b.distanceM)
    .slice(0, topN);
  return {
    available: true,
    audience,
    radiusM,
    fromYear,
    toYear,
    totalUnits: cohorts.reduce((s, c) => s + c.units, 0),
    totalBlocks: cohorts.reduce((s, c) => s + c.blocks, 0),
    cohorts,
    topBlocks,
    excludedBlocks,
  };
}
