import { HDB_FLAT_TYPES, type HdbFlatType, type MarketSegment, type PrivateProject, type TownSummary } from "@/lib/data/types";

/**
 * "Homes that fit" filtering for the affordability tool (pure: takes the town / project summaries the
 * data layer already aggregates, so no transaction arrays are touched or sent to the browser).
 */

export const FIT_LIMIT = 20;
export const DEFAULT_FIT_SIZE_SQFT = 1000;

export interface HdbFitRow {
  town: string;
  townSlug: string;
  region: string;
  flatType: HdbFlatType;
  medianPrice12m: number;
  /** share of the budget the median uses (0-1) */
  budgetShare: number;
}

export interface CondoFitRow {
  slug: string;
  name: string;
  district: number | null;
  segment: MarketSegment | null;
  isEc: boolean;
  tenure: string | null;
  medianPsf12m: number;
  sales12m: number;
  /** median psf (12 months) × the size the visitor chose */
  estPrice: number;
  budgetShare: number;
}

/** HDB town × flat type combinations whose 12-month median resale price is within the budget, priciest first. */
export function fitHdb(towns: TownSummary[], maxPrice: number, limit = FIT_LIMIT): HdbFitRow[] {
  if (!(maxPrice > 0)) return [];
  const rows: HdbFitRow[] = [];
  for (const t of towns) {
    for (const ft of HDB_FLAT_TYPES) {
      const median = t.medianPrice12m?.[ft];
      if (median == null || !(median > 0) || median > maxPrice) continue;
      rows.push({ town: t.town, townSlug: t.slug, region: t.region, flatType: ft, medianPrice12m: median, budgetShare: median / maxPrice });
    }
  }
  rows.sort((a, b) => b.medianPrice12m - a.medianPrice12m || a.town.localeCompare(b.town) || HDB_FLAT_TYPES.indexOf(a.flatType) - HDB_FLAT_TYPES.indexOf(b.flatType));
  return rows.slice(0, limit);
}

export function isEcProject(p: Pick<PrivateProject, "propertyTypes">): boolean {
  return p.propertyTypes.some((t) => /executive condominium/i.test(t));
}

/** Non-landed projects whose 12-month median psf × `sizeSqft` is within the budget, priciest first. */
export function fitCondo(projects: PrivateProject[], maxPrice: number, sizeSqft: number, limit = FIT_LIMIT): CondoFitRow[] {
  if (!(maxPrice > 0) || !(sizeSqft > 0)) return [];
  const rows: CondoFitRow[] = [];
  for (const p of projects) {
    if (p.isLanded) continue;
    const psf = p.tx.medianPsf12m;
    if (psf == null || !(psf > 0)) continue;
    const est = Math.round(psf * sizeSqft);
    if (est > maxPrice) continue;
    rows.push({
      slug: p.slug,
      name: p.name,
      district: p.district,
      segment: p.segment,
      isEc: isEcProject(p),
      tenure: p.tenure?.raw ?? null,
      medianPsf12m: psf,
      sales12m: p.tx.count12m,
      estPrice: est,
      budgetShare: est / maxPrice,
    });
  }
  rows.sort((a, b) => b.estPrice - a.estPrice || b.sales12m - a.sales12m || a.name.localeCompare(b.name));
  return rows.slice(0, limit);
}
