import "server-only";
import { Lru, readJson } from "./store";
import { monthLabel } from "./months";
import { SQFT_PER_SQM } from "@/lib/format";
import type {
  LandedAddress,
  LandedStreet,
  LaunchType,
  NewLaunch,
  PrivateProject,
  PrivateRental,
  PrivateRentFile,
  PrivateTransaction,
  PrivateTxFile,
} from "./types";

/* ------------------------------------------------------------------ */
/* Indexes                                                             */
/* ------------------------------------------------------------------ */

let projectIndex: Map<string, PrivateProject> | null = null;

export function getProjects(): PrivateProject[] {
  return readJson<PrivateProject[]>("private/projects.json", []);
}

export function getProject(slug: string): PrivateProject | null {
  if (!projectIndex) projectIndex = new Map(getProjects().map((p) => [p.slug, p]));
  return projectIndex.get(slug) ?? null;
}

export function getLandedStreets(): LandedStreet[] {
  return readJson<LandedStreet[]>("private/landed-streets.json", []);
}

export function getLandedStreet(slug: string): LandedStreet | null {
  return getLandedStreets().find((s) => s.slug === slug) ?? null;
}

export function getLandedAddresses(): LandedAddress[] {
  return readJson<LandedAddress[]>("private/landed-addresses.json", []);
}

export function getLandedAddress(slug: string): LandedAddress | null {
  return getLandedAddresses().find((a) => a.slug === slug) ?? null;
}

export function getLaunches(): NewLaunch[] {
  return readJson<NewLaunch[]>("private/launches.json", []);
}

export function getLaunch(type: LaunchType, slug: string): NewLaunch | null {
  return getLaunches().find((l) => l.type === type && l.slug === slug) ?? null;
}

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

const SALE_TYPES = { 1: "New Sale", 2: "Sub Sale", 3: "Resale" } as const;
const AREA_TYPES = ["Strata", "Land", "Unknown"] as const;

/** "06-10" -> 8; "B1-B5" -> null; "-" -> null */
export function floorMid(range: string): number | null {
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(range.trim());
  if (!m) return null;
  return (Number(m[1]) + Number(m[2])) / 2;
}

export function districtFile(district: number): string {
  return `d${String(district).padStart(2, "0")}`;
}

const districtTxCache = new Lru<number, PrivateTransaction[]>(6);

export function getDistrictTransactions(district: number): PrivateTransaction[] {
  const hit = districtTxCache.get(district);
  if (hit) return hit;
  const file = readJson<PrivateTxFile | null>(`private/tx/${districtFile(district)}.json`, null);
  if (!file) return [];
  const out: PrivateTransaction[] = new Array(file.m.length);
  for (let i = 0; i < file.m.length; i++) {
    const sqm = file.a[i] / 10;
    const sqft = sqm * SQFT_PER_SQM;
    const units = Math.max(1, file.n[i]);
    const fr = file.floorRanges[file.fr[i]];
    out[i] = {
      month: monthLabel(file.m[i]),
      monthIndex: file.m[i],
      projectSlug: file.projects[file.pj[i]],
      district: file.district,
      propertyType: file.propertyTypes[file.pt[i]],
      floorRange: fr,
      floorMid: floorMid(fr),
      areaSqm: sqm,
      areaSqft: Math.round(sqft),
      price: file.p[i],
      // URA reports the total price and total area for bulk purchases, so psf = price / area either way.
      psf: sqft > 0 ? Math.round(file.p[i] / sqft) : 0,
      typeOfSale: SALE_TYPES[file.ts[i] as 1 | 2 | 3] ?? "Resale",
      typeOfArea: AREA_TYPES[file.ta[i]] ?? "Unknown",
      units,
      unit: file.unit?.[i] ?? null,
      address: file.address?.[i] ?? null,
    };
  }
  out.sort((x, y) => y.monthIndex - x.monthIndex);
  districtTxCache.set(district, out);
  return out;
}

export function getProjectTransactions(slug: string): PrivateTransaction[] {
  const p = getProject(slug);
  if (!p || p.district == null) return [];
  return getDistrictTransactions(p.district).filter((t) => t.projectSlug === slug);
}

export function getLandedStreetTransactions(slug: string): PrivateTransaction[] {
  const s = getLandedStreet(slug);
  if (!s || s.district == null) return [];
  const projects = new Set(s.projects);
  return getDistrictTransactions(s.district).filter((t) => projects.has(t.projectSlug) && LANDED_TYPES.has(t.propertyType));
}

export function getLandedAddressTransactions(slug: string): PrivateTransaction[] {
  const a = getLandedAddress(slug);
  if (!a || a.district == null) return [];
  return getDistrictTransactions(a.district).filter((t) => t.address === a.address);
}

export const LANDED_TYPES = new Set(["Terrace", "Semi-detached", "Detached", "Strata Terrace", "Strata Semi-detached", "Strata Detached"]);

/* ------------------------------------------------------------------ */
/* Rentals                                                             */
/* ------------------------------------------------------------------ */

const districtRentCache = new Lru<number, PrivateRental[]>(6);

export function getDistrictRentals(district: number): PrivateRental[] {
  const hit = districtRentCache.get(district);
  if (hit) return hit;
  const file = readJson<PrivateRentFile | null>(`private/rentals/${districtFile(district)}.json`, null);
  if (!file) return [];
  const out: PrivateRental[] = new Array(file.m.length);
  for (let i = 0; i < file.m.length; i++) {
    out[i] = {
      month: monthLabel(file.m[i]),
      monthIndex: file.m[i],
      projectSlug: file.projects[file.pj[i]],
      district: file.district,
      propertyType: file.propertyTypes[file.pt[i]],
      monthlyRent: file.r[i],
      areaSqmLow: file.alo[i] >= 0 ? file.alo[i] : null,
      areaSqmHigh: file.ahi[i] >= 0 ? file.ahi[i] : null,
      bedrooms: file.br[i] >= 0 ? file.br[i] : null,
    };
  }
  out.sort((x, y) => y.monthIndex - x.monthIndex);
  districtRentCache.set(district, out);
  return out;
}

export function getProjectRentals(slug: string): PrivateRental[] {
  const p = getProject(slug);
  if (!p || p.district == null) return [];
  return getDistrictRentals(p.district).filter((r) => r.projectSlug === slug);
}
