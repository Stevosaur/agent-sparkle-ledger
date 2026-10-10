import "server-only";
import { getDistrictRentals, getDistrictTransactions, getProjects, LANDED_TYPES } from "@/lib/data/private";
import { getMeta } from "@/lib/data/meta";
import { monthIndex } from "@/lib/data/months";
import type { MarketSegment, PrivateProject } from "@/lib/data/types";
import { SQFT_PER_SQM } from "@/lib/format";
import { median } from "@/lib/stats-math";
import { comparisonWindows, inWindow, upsert, WindowAcc, type MonthWindow } from "./math";
import { memoBySnapshot } from "./memo";
import type { WindowStat } from "./types";
import type { RentStat } from "./hdb-scan";

/**
 * Aggregates over URA private transactions and rentals, one postal district at a time. Bulk deals
 * (more than one unit in a caveat) are excluded from medians because price and area are totals.
 * Everything is empty when no private data is in the snapshot (no URA key configured).
 */

export const POSTAL_DISTRICTS = Array.from({ length: 28 }, (_, i) => i + 1);
export const SEGMENTS: MarketSegment[] = ["CCR", "RCR", "OCR"];
export type PrivateGroup = "Condo" | "EC" | "Landed";

/** Same grouping as the snapshot builder's stats series (private:<seg>:<Condo|EC|Landed>). */
export function privateGroupOf(propertyType: string): PrivateGroup {
  if (propertyType === "Executive Condominium") return "EC";
  if (LANDED_TYPES.has(propertyType) || /terrace|semi-detached|detached/i.test(propertyType)) return "Landed";
  return "Condo";
}

export interface PrivateProjectStats {
  slug: string;
  cur: WindowStat;
  prev5y: WindowStat;
}

export interface SaleTypeCounts {
  newSale: number;
  subSale: number;
  resale: number;
}

export interface PrivateSalesScan {
  latestMonth: number | null;
  windows: { cur: MonthWindow; prev12: MonthWindow; prev5y: MonthWindow } | null;
  projects: Map<string, PrivateProjectStats>;
  /** non-landed sales, latest 12 months */
  districts: { district: number; cur: WindowStat }[];
  /** condo / apartment sales (excluding ECs and landed) by market segment, matching the private:<seg>:Condo series */
  segments: { segment: MarketSegment; cur: WindowStat; prev12: WindowStat }[];
  groups: { group: PrivateGroup; cur: WindowStat; prev12: WindowStat }[];
  /** monthly counts by type of sale over the latest 60 months (zero-filled) */
  saleTypeMonthly: ({ m: number } & SaleTypeCounts)[];
  saleType12m: SaleTypeCounts;
  bulkExcluded12m: number;
}

const EMPTY_SCAN: PrivateSalesScan = {
  latestMonth: null,
  windows: null,
  projects: new Map(),
  districts: [],
  segments: [],
  groups: [],
  saleTypeMonthly: [],
  saleType12m: { newSale: 0, subSale: 0, resale: 0 },
  bulkExcluded12m: 0,
};

function latestPrivateMonth(): number | null {
  const label = getMeta().latestMonth.private;
  if (!label) return null;
  try {
    return monthIndex(label);
  } catch {
    return null;
  }
}

export function getPrivateSalesScan(): PrivateSalesScan {
  return memoBySnapshot("private-sales-scan", computePrivateSalesScan);
}

function computePrivateSalesScan(): PrivateSalesScan {
  const projectsBySlug = new Map<string, PrivateProject>(getProjects().map((p) => [p.slug, p]));
  let latest = latestPrivateMonth();
  if (latest == null) {
    // meta without a latest month: derive it from the files (newest first per district)
    let max = -1;
    for (const d of POSTAL_DISTRICTS) {
      const tx = getDistrictTransactions(d);
      if (tx.length && tx[0].monthIndex > max) max = tx[0].monthIndex;
    }
    latest = max >= 0 ? max : null;
  }
  if (latest == null) return EMPTY_SCAN;
  const w = comparisonWindows(latest);
  const monthlyFrom = latest - 59;

  const projAcc = new Map<string, { cur: WindowAcc; prev5y: WindowAcc }>();
  const distAcc = new Map<number, WindowAcc>();
  const segAcc = new Map<MarketSegment, { cur: WindowAcc; prev12: WindowAcc }>();
  const groupAcc = new Map<PrivateGroup, { cur: WindowAcc; prev12: WindowAcc }>();
  const monthly = new Map<number, SaleTypeCounts>();
  for (let m = monthlyFrom; m <= latest; m++) monthly.set(m, { newSale: 0, subSale: 0, resale: 0 });
  const st12: SaleTypeCounts = { newSale: 0, subSale: 0, resale: 0 };
  let bulk12 = 0;
  let seen = 0;

  for (const d of POSTAL_DISTRICTS) {
    const tx = getDistrictTransactions(d);
    for (const t of tx) {
      seen += 1;
      const m = t.monthIndex;
      const isCur = inWindow(m, w.cur);
      const key = t.typeOfSale === "New Sale" ? "newSale" : t.typeOfSale === "Sub Sale" ? "subSale" : "resale";
      const row = monthly.get(m);
      if (row) row[key] += t.units;
      if (isCur) st12[key] += t.units;
      if (t.units > 1) {
        if (isCur) bulk12 += 1;
        continue;
      }
      const isPrev12 = inWindow(m, w.prev12);
      const isPrev5y = inWindow(m, w.prev5y);
      if (!isCur && !isPrev12 && !isPrev5y) continue;
      // unrounded psf, like the snapshot builder (the decoded t.psf is rounded per record)
      const psf = t.areaSqm > 0 ? t.price / (t.areaSqm * SQFT_PER_SQM) : 0;
      const group = privateGroupOf(t.propertyType);
      const landed = group === "Landed";
      const segment = projectsBySlug.get(t.projectSlug)?.segment ?? null;
      if (isCur || isPrev5y) {
        const pa = upsert(projAcc, t.projectSlug, () => ({ cur: new WindowAcc(), prev5y: new WindowAcc() }));
        (isCur ? pa.cur : pa.prev5y).add(t.price, psf);
      }
      if (isCur || isPrev12) {
        const ga = upsert(groupAcc, group, () => ({ cur: new WindowAcc(), prev12: new WindowAcc() }));
        (isCur ? ga.cur : ga.prev12).add(t.price, psf);
        if (group === "Condo" && segment) {
          const sa = upsert(segAcc, segment, () => ({ cur: new WindowAcc(), prev12: new WindowAcc() }));
          (isCur ? sa.cur : sa.prev12).add(t.price, psf);
        }
      }
      if (isCur && !landed) upsert(distAcc, d, () => new WindowAcc()).add(t.price, psf);
    }
  }
  if (seen === 0) return EMPTY_SCAN;

  const projects = new Map<string, PrivateProjectStats>();
  for (const [slug, v] of projAcc) projects.set(slug, { slug, cur: v.cur.stat(), prev5y: v.prev5y.stat() });
  return {
    latestMonth: latest,
    windows: w,
    projects,
    districts: [...distAcc.entries()].map(([district, acc]) => ({ district, cur: acc.stat() })).sort((a, b) => a.district - b.district),
    segments: SEGMENTS.filter((s) => segAcc.has(s)).map((segment) => ({ segment, cur: segAcc.get(segment)!.cur.stat(), prev12: segAcc.get(segment)!.prev12.stat() })),
    groups: (["Condo", "EC", "Landed"] as PrivateGroup[]).filter((g) => groupAcc.has(g)).map((group) => ({ group, cur: groupAcc.get(group)!.cur.stat(), prev12: groupAcc.get(group)!.prev12.stat() })),
    saleTypeMonthly: [...monthly.entries()].map(([m, v]) => ({ m, ...v })).sort((a, b) => a.m - b.m),
    saleType12m: st12,
    bulkExcluded12m: bulk12,
  };
}

/* ------------------------------------------------------------------ */
/* Rentals                                                             */
/* ------------------------------------------------------------------ */

export interface PrivateProjectRent extends RentStat {
  /** rentals with a published floor-area band */
  withArea: number;
  /** median monthly rent per sqft, using the mid-point of URA's floor-area band (approximate) */
  medianRentPsf: number | null;
}

export interface PrivateRentScan {
  latestMonth: number | null;
  window: MonthWindow | null;
  projects: Map<string, PrivateProjectRent>;
  overall: RentStat;
}

/** Monthly rent per sqft from a rent and URA's floor-area band (sqm); null when the band is unknown. */
export function rentPsfFromBand(monthlyRent: number, areaSqmLow: number | null, areaSqmHigh: number | null): number | null {
  if (areaSqmLow == null || areaSqmHigh == null || !(monthlyRent > 0)) return null;
  const mid = (areaSqmLow + areaSqmHigh) / 2;
  if (!(mid > 0)) return null;
  return monthlyRent / (mid * SQFT_PER_SQM);
}

export function getPrivateRentScan(): PrivateRentScan {
  return memoBySnapshot("private-rent-scan", computePrivateRentScan);
}

function computePrivateRentScan(): PrivateRentScan {
  const perDistrict: { d: number; rows: ReturnType<typeof getDistrictRentals> }[] = [];
  let latest = -1;
  for (const d of POSTAL_DISTRICTS) {
    const rows = getDistrictRentals(d);
    if (rows.length === 0) continue;
    if (rows[0].monthIndex > latest) latest = rows[0].monthIndex;
    perDistrict.push({ d, rows });
  }
  if (latest < 0) return { latestMonth: null, window: null, projects: new Map(), overall: { count: 0, medianRent: null } };
  const window = { from: latest - 11, to: latest };
  const rents = new Map<string, number[]>();
  const rentPsf = new Map<string, number[]>();
  const all: number[] = [];
  for (const { rows } of perDistrict) {
    for (const r of rows) {
      if (r.monthIndex < window.from) break; // newest first
      if (!inWindow(r.monthIndex, window) || !(r.monthlyRent > 0)) continue;
      upsert(rents, r.projectSlug, () => []).push(r.monthlyRent);
      all.push(r.monthlyRent);
      const psf = rentPsfFromBand(r.monthlyRent, r.areaSqmLow, r.areaSqmHigh);
      if (psf != null) upsert(rentPsf, r.projectSlug, () => []).push(psf);
    }
  }
  const projects = new Map<string, PrivateProjectRent>();
  for (const [slug, values] of rents) {
    const psfs = rentPsf.get(slug) ?? [];
    projects.set(slug, {
      count: values.length,
      medianRent: Math.round(median(values)),
      withArea: psfs.length,
      medianRentPsf: psfs.length ? median(psfs) : null,
    });
  }
  return { latestMonth: latest, window, projects, overall: { count: all.length, medianRent: all.length ? Math.round(median(all)) : null } };
}
