import { haversineM } from "@/lib/geo-math";
import { HDB_MOP_YEARS } from "./rules";

/**
 * Demand vs supply around a point.
 * Demand proxy ("upgrader pool"): HDB flats within the radius reaching their 5-year Minimum Occupation
 * Period in each year (year completed + 5), since MOP is when owners may first buy private property
 * while keeping or selling the flat.
 * Supply: private units in launches / pipeline projects within the radius, by expected completion year.
 */
export interface MopBlock {
  lat?: number | null;
  lng?: number | null;
  yearCompleted: number | null;
  dwellingUnits: number | null;
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
    const y = b.yearCompleted + HDB_MOP_YEARS;
    const row = out.get(y);
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
