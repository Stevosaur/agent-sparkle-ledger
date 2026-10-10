import { haversineM } from "@/lib/geo-math";
import { HDB_MOP_YEARS } from "./rules";

/**
 * Demand vs supply around a point.
 * Demand proxy ("upgrader pool"): HDB flats within the radius reaching their Minimum Occupation Period in each year,
 * since MOP is when owners may first buy private property while keeping or selling the flat.
 * MOP year = year completed + HDB_MOP_YEARS (5). The MOP runs from key collection (hdb-rules.md §1.2), which is
 * approximated by the completion year; Plus / Prime / PLH flats (10 years) and Fresh Start flats (20 years) can pass
 * `mopYears` per block. The public data has no Standard/Plus/Prime/PLH column: Plus/Prime flats were first launched
 * in Oct 2024 and none had reached MOP by Oct 2026 (hdb-rules.md §1.3), but PLH blocks (launched from Nov 2021) are
 * not flagged either, so callers that know a block is PLH / Plus / Prime should pass `mopYears: 10`.
 * Supply: private units in launches / pipeline projects within the radius, by expected completion year.
 */
export interface MopBlock {
  lat?: number | null;
  lng?: number | null;
  yearCompleted: number | null;
  dwellingUnits: number | null;
  /** MOP length for this block's flats, default HDB_MOP_YEARS (5); 10 for Plus / Prime / PLH */
  mopYears?: number | null;
}

/** Year a block's flats reach MOP (completion year + MOP), null when the completion year is unknown. */
export function mopYear(block: Pick<MopBlock, "yearCompleted" | "mopYears">): number | null {
  if (block.yearCompleted == null) return null;
  return block.yearCompleted + (block.mopYears ?? HDB_MOP_YEARS);
}

export interface SupplyProject {
  lat?: number | null;
  lng?: number | null;
  expectedCompletionYear: number | null;
  totalUnits: number | null;
  name: string;
}

export function mopCohorts(blocks: MopBlock[], center: { lat: number; lng: number }, radiusM: number, fromYear: number, toYear: number): { year: number; units: number; blocks: number }[] {
  const out = new Map<number, { units: number; blocks: number }>();
  for (let y = fromYear; y <= toYear; y++) out.set(y, { units: 0, blocks: 0 });
  for (const b of blocks) {
    if (b.lat == null || b.lng == null || b.yearCompleted == null || !b.dwellingUnits) continue;
    if (haversineM(center, { lat: b.lat, lng: b.lng }) > radiusM) continue;
    const y = mopYear(b);
    const row = y == null ? undefined : out.get(y);
    if (row) {
      row.units += b.dwellingUnits;
      row.blocks += 1;
    }
  }
  return [...out.entries()].map(([year, v]) => ({ year, ...v }));
}

export function supplyByYear(projects: SupplyProject[], center: { lat: number; lng: number }, radiusM: number, fromYear: number, toYear: number): { year: number; units: number; projects: string[] }[] {
  const out = new Map<number, { units: number; projects: string[] }>();
  for (let y = fromYear; y <= toYear; y++) out.set(y, { units: 0, projects: [] });
  for (const p of projects) {
    if (p.lat == null || p.lng == null || p.expectedCompletionYear == null || !p.totalUnits) continue;
    if (haversineM(center, { lat: p.lat, lng: p.lng }) > radiusM) continue;
    const row = out.get(p.expectedCompletionYear);
    if (row) {
      row.units += p.totalUnits;
      row.projects.push(p.name);
    }
  }
  return [...out.entries()].map(([year, v]) => ({ year, ...v }));
}
