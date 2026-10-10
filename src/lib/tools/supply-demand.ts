import "server-only";
import { getHdbBlocks } from "@/lib/data/hdb";
import { getLaunches } from "@/lib/data/private";
import { mopCohorts, supplyByYear } from "@/lib/calc/supply-demand";
import { HDB_MOP_YEARS } from "@/lib/calc/rules";
import { titleCase } from "@/lib/slug";

/**
 * Demand (HDB flats reaching MOP) vs supply (private launches by expected completion) around a point.
 * Wraps the pure calculators with the data layer; only per-year totals and capped project lists leave
 * the server.
 */

export const SD_RADII = [1000, 2000, 3000] as const;
export type SdRadius = (typeof SD_RADII)[number];
export const SD_DEFAULT_RADIUS: SdRadius = 2000;
export const SD_HEADLINE_RADIUS = 2000;
export const SD_HEADLINE_YEARS = 3;

export function parseRadius(raw: string | null | undefined): SdRadius | null {
  const n = Number(raw);
  return (SD_RADII as readonly number[]).includes(n) ? (n as SdRadius) : null;
}

/** The current calendar year in Singapore (UTC+8). */
export function currentYearSg(now: Date = new Date()): number {
  return new Date(now.getTime() + 8 * 3600_000).getUTCFullYear();
}

export interface SdYearRow {
  year: number;
  /** HDB flats in blocks completed in (year − MOP) */
  mopUnits: number;
  mopBlocks: number;
  /** private units expected to complete this year */
  supplyUnits: number;
  supplyProjects: string[];
}

export interface SupplyDemandResult {
  radiusM: number;
  fromYear: number;
  toYear: number;
  rows: SdYearRow[];
  /**
   * false when the snapshot has no new-launch records at all: supply is then unknown, not zero, and the UI must
   * not say "no new supply" (supply figures are still 0 in `rows` / `totals` and must not be shown as such)
   */
  launchData: boolean;
  totals: { mopUnits: number; supplyUnits: number; ratio: number | null };
  coverage: {
    blocksTotal: number;
    blocksMissingCoordsOrYear: number;
    launchesTotal: number;
    launchesUsable: number;
  };
}

export interface MopHeadline {
  radiusM: number;
  fromYear: number;
  toYear: number;
  units: number;
  blocks: number;
  blocksMissingData: number;
}

/** Free headline: HDB flats within 2 km reaching MOP in the next three calendar years. */
export function mopHeadline(center: { lat: number; lng: number }, now: Date = new Date()): MopHeadline {
  const year = currentYearSg(now);
  const fromYear = year + 1;
  const toYear = year + SD_HEADLINE_YEARS;
  const blocks = getHdbBlocks();
  const cohorts = mopCohorts(blocks, center, SD_HEADLINE_RADIUS, fromYear, toYear);
  return {
    radiusM: SD_HEADLINE_RADIUS,
    fromYear,
    toYear,
    units: cohorts.reduce((s, c) => s + c.units, 0),
    blocks: cohorts.reduce((s, c) => s + c.blocks, 0),
    blocksMissingData: blocks.filter((b) => b.lat == null || b.lng == null || b.yearCompleted == null || !b.dwellingUnits).length,
  };
}

/** Plus view: MOP cohorts vs private completions from (this year − 2) to (this year + 5). */
export function supplyDemand(center: { lat: number; lng: number }, radiusM: number, now: Date = new Date()): SupplyDemandResult {
  const year = currentYearSg(now);
  const fromYear = year - 2;
  const toYear = year + 5;
  const blocks = getHdbBlocks();
  const launches = getLaunches();
  const usable = launches.filter((l) => l.expectedCompletionYear != null && l.totalUnits != null && l.totalUnits > 0);
  const mop = mopCohorts(blocks, center, radiusM, fromYear, toYear);
  const supply = supplyByYear(
    usable.map((l) => ({ lat: l.lat, lng: l.lng, expectedCompletionYear: l.expectedCompletionYear, totalUnits: l.totalUnits, name: titleCase(l.name) })),
    center,
    radiusM,
    fromYear,
    toYear,
  );
  const supplyByYearMap = new Map(supply.map((s) => [s.year, s]));
  const rows: SdYearRow[] = mop.map((m) => {
    const s = supplyByYearMap.get(m.year);
    return { year: m.year, mopUnits: m.units, mopBlocks: m.blocks, supplyUnits: s?.units ?? 0, supplyProjects: (s?.projects ?? []).slice(0, 20) };
  });
  const mopUnits = rows.reduce((a, r) => a + r.mopUnits, 0);
  const supplyUnits = rows.reduce((a, r) => a + r.supplyUnits, 0);
  return {
    radiusM,
    fromYear,
    toYear,
    rows,
    launchData: launches.length > 0,
    totals: { mopUnits, supplyUnits, ratio: supplyUnits > 0 ? mopUnits / supplyUnits : null },
    coverage: {
      blocksTotal: blocks.length,
      blocksMissingCoordsOrYear: blocks.filter((b) => b.lat == null || b.lng == null || b.yearCompleted == null || !b.dwellingUnits).length,
      launchesTotal: launches.length,
      launchesUsable: usable.filter((l) => l.lat != null && l.lng != null).length,
    },
  };
}

export { HDB_MOP_YEARS };
