import "server-only";
import { getBlockRentals, getBlockTransactions, getHdbBlock, getTownRentals, getTownTransactions } from "@/lib/data/hdb";
import { LANDED_TYPES, getDistrictRentals, getDistrictTransactions, getProject, getProjectRentals, getProjectTransactions } from "@/lib/data/private";
import { getCoverage, getMeta } from "@/lib/data/meta";
import { monthIndex, monthLabel } from "@/lib/data/months";
import { parsePropertyRef } from "@/lib/property-ref";
import { titleCase } from "@/lib/slug";
import { sqmToSqft } from "@/lib/format";
import { MIN_LOCAL_SAMPLE, MIN_WIDE_SAMPLE, positionInRange, rangeFromPrices, rangeFromPsf, quartiles, roundTo, stepFor } from "./fair-value";
import type { FairValueOutcome, FairValueRange, HomeListing } from "./types";

export const FAIR_VALUE_SOURCES = {
  hdbSale: "HDB resale flat prices, data.gov.sg",
  hdbRent: "HDB renting out of flats, data.gov.sg",
  privateSale: "URA private residential transactions",
  privateRent: "URA private residential rental contracts",
} as const;

const WINDOW_MONTHS = 12;

function safeMonthIndex(label: string | null | undefined): number | null {
  if (!label) return null;
  try {
    return monthIndex(label);
  } catch {
    return null;
  }
}

function ok(range: FairValueRange, asking: number): FairValueOutcome {
  return { ok: true, range, position: positionInRange(asking, range) };
}

/**
 * Fair-value range for a listing (estimate), computed on the server from public records:
 * - HDB sale: resale prices of the same flat type in the same block over the 12 months to the latest
 *   month (interquartile range, >= 3 sales); else the town's same-flat-type sales (>= 5, IQR); else the
 *   town median of whatever recent sales exist.
 * - HDB rent: the same ladder over HDB rental approvals.
 * - Condo sale: the project's 12-month psf quartiles (single-unit, strata sales, >= 3) x the listing's
 *   floor area; else non-landed sales in the same postal district (>= 5).
 * - Condo rent: the project's 12-month rental contracts, narrowed to the same bedroom count or area
 *   band when there are enough of them.
 * - Landed homes: not estimated (land size and built-up area vary too much for a simple range).
 */
export function fairValueForListing(listing: Pick<HomeListing, "ref" | "listingType" | "flatType" | "areaSqm" | "bedrooms" | "askingPrice">): FairValueOutcome {
  const ref = parsePropertyRef(listing.ref);
  const basis = listing.listingType;
  if (!ref) return { ok: false, reason: "unresolved", source: FAIR_VALUE_SOURCES.hdbSale };

  if (ref.kind === "hdb") {
    const source = basis === "sale" ? FAIR_VALUE_SOURCES.hdbSale : FAIR_VALUE_SOURCES.hdbRent;
    const block = getHdbBlock(ref.slug);
    if (!block) return { ok: false, reason: "unresolved", source };
    const flatType = listing.flatType?.trim().toUpperCase() ?? "";
    if (!flatType) return { ok: false, reason: "no-flat-type", source };
    const blockLabel = `Blk ${block.block} ${titleCase(block.street)}`;
    const townLabel = titleCase(block.town);

    if (basis === "sale") {
      const townTx = getTownTransactions(block.townSlug);
      if (townTx.length === 0 && !getCoverage().hdb) return { ok: false, reason: "no-hdb-data", source };
      const latest = safeMonthIndex(getMeta().latestMonth.hdb) ?? townTx[0]?.monthIndex ?? null;
      if (latest == null) return { ok: false, reason: "no-recent-records", source };
      const from = latest - (WINDOW_MONTHS - 1);
      const window = { from: monthLabel(from), to: monthLabel(latest) };
      const blockPrices = getBlockTransactions(block.slug)
        .filter((t) => t.flatType === flatType && t.monthIndex >= from && t.monthIndex <= latest)
        .map((t) => t.price);
      const local = rangeFromPrices(blockPrices, "sale", MIN_LOCAL_SAMPLE);
      if (local) return ok({ basis, method: "block-iqr", ...local, psf: null, sampleSize: local.n, ...window, scope: `${blockLabel} · ${flatType}`, source }, listing.askingPrice);
      const townPrices = townTx.filter((t) => t.flatType === flatType && t.monthIndex >= from && t.monthIndex <= latest).map((t) => t.price);
      const wide = rangeFromPrices(townPrices, "sale", MIN_WIDE_SAMPLE);
      if (wide) return ok({ basis, method: "town-iqr", ...wide, psf: null, sampleSize: wide.n, ...window, scope: `${townLabel} · ${flatType}`, source }, listing.askingPrice);
      const q = quartiles(townPrices);
      if (q) {
        const mid = roundTo(q.median, stepFor("sale"));
        return ok({ basis, method: "town-median", low: mid, mid, high: mid, psf: null, sampleSize: q.n, ...window, scope: `${townLabel} · ${flatType}`, source }, listing.askingPrice);
      }
      return { ok: false, reason: "no-recent-records", source };
    }

    const townRent = getTownRentals(block.townSlug);
    if (townRent.length === 0) return { ok: false, reason: getCoverage().rentals ? "no-recent-records" : "no-rentals", source };
    // Window ends at the dataset's latest rental month (not this town's newest record), so "latest 12 months" is the same everywhere.
    const latest = safeMonthIndex(getMeta().latestMonth.hdbRentals) ?? townRent[0].monthIndex;
    const from = latest - (WINDOW_MONTHS - 1);
    const window = { from: monthLabel(from), to: monthLabel(latest) };
    const inWindow = (r: { monthIndex: number }) => r.monthIndex >= from && r.monthIndex <= latest;
    const blockRents = getBlockRentals(block.slug)
      .filter((r) => r.flatType === flatType && inWindow(r))
      .map((r) => r.monthlyRent);
    const local = rangeFromPrices(blockRents, "rent", MIN_LOCAL_SAMPLE);
    if (local) return ok({ basis, method: "block-iqr", ...local, psf: null, sampleSize: local.n, ...window, scope: `${blockLabel} · ${flatType}`, source }, listing.askingPrice);
    const townRents = townRent.filter((r) => r.flatType === flatType && inWindow(r)).map((r) => r.monthlyRent);
    const wide = rangeFromPrices(townRents, "rent", MIN_WIDE_SAMPLE);
    if (wide) return ok({ basis, method: "town-iqr", ...wide, psf: null, sampleSize: wide.n, ...window, scope: `${townLabel} · ${flatType}`, source }, listing.askingPrice);
    const q = quartiles(townRents);
    if (q) {
      const mid = roundTo(q.median, stepFor("rent"));
      return ok({ basis, method: "town-median", low: mid, mid, high: mid, psf: null, sampleSize: q.n, ...window, scope: `${townLabel} · ${flatType}`, source }, listing.askingPrice);
    }
    return { ok: false, reason: "no-recent-records", source };
  }

  if (ref.kind === "condo") {
    const source = basis === "sale" ? FAIR_VALUE_SOURCES.privateSale : FAIR_VALUE_SOURCES.privateRent;
    const project = getProject(ref.slug);
    if (!project || project.isLanded) return { ok: false, reason: "unresolved", source };
    const coverage = getCoverage();
    const projectLabel = titleCase(project.name);

    if (basis === "sale") {
      if (!coverage.private) return { ok: false, reason: "no-private-data", source };
      const areaSqft = listing.areaSqm != null && listing.areaSqm > 0 ? sqmToSqft(listing.areaSqm) : 0;
      if (!areaSqft) return { ok: false, reason: "no-area", source };
      const districtTx = project.district != null ? getDistrictTransactions(project.district) : [];
      const latest = safeMonthIndex(getMeta().latestMonth.private) ?? districtTx[0]?.monthIndex ?? null;
      if (latest == null) return { ok: false, reason: "no-recent-records", source };
      const from = latest - (WINDOW_MONTHS - 1);
      const window = { from: monthLabel(from), to: monthLabel(latest) };
      const usable = (t: { units: number; typeOfArea: string; monthIndex: number; psf: number; propertyType: string }) =>
        t.units === 1 && t.typeOfArea !== "Land" && t.monthIndex >= from && t.monthIndex <= latest && t.psf > 0 && !LANDED_TYPES.has(t.propertyType);
      const projectPsf = getProjectTransactions(project.slug).filter(usable).map((t) => t.psf);
      const local = rangeFromPsf(projectPsf, areaSqft, MIN_LOCAL_SAMPLE);
      if (local) return ok({ basis, method: "project-psf-iqr", ...local, sampleSize: local.n, ...window, scope: projectLabel, source }, listing.askingPrice);
      const districtPsf = districtTx.filter(usable).map((t) => t.psf);
      const wide = rangeFromPsf(districtPsf, areaSqft, MIN_WIDE_SAMPLE);
      if (wide && project.district != null) {
        return ok({ basis, method: "district-psf-iqr", ...wide, sampleSize: wide.n, ...window, scope: `District ${project.district} · non-landed homes`, source }, listing.askingPrice);
      }
      return { ok: false, reason: "no-recent-records", source };
    }

    const districtRent = project.district != null ? getDistrictRentals(project.district) : [];
    if (districtRent.length === 0) return { ok: false, reason: coverage.privateRentals ? "no-recent-records" : "no-rentals", source };
    const latest = safeMonthIndex(getMeta().latestMonth.privateRentals) ?? districtRent[0].monthIndex;
    const from = latest - (WINDOW_MONTHS - 1);
    const window = { from: monthLabel(from), to: monthLabel(latest) };
    const rents = getProjectRentals(project.slug).filter((r) => r.monthIndex >= from && r.monthIndex <= latest && r.monthlyRent > 0);
    const byBeds = listing.bedrooms != null ? rents.filter((r) => r.bedrooms === listing.bedrooms) : [];
    const area = listing.areaSqm;
    const byArea = area != null ? rents.filter((r) => r.areaSqmLow != null && r.areaSqmHigh != null && area >= r.areaSqmLow && area <= r.areaSqmHigh) : [];
    const candidates: [typeof rents, string][] = [
      [byBeds, `${projectLabel} · ${listing.bedrooms === 0 ? "studio" : `${listing.bedrooms}-bedroom`}`],
      [byArea, `${projectLabel} · similar size`],
      [rents, projectLabel],
    ];
    for (const [rows, scope] of candidates) {
      const r = rangeFromPrices(
        rows.map((x) => x.monthlyRent),
        "rent",
        MIN_LOCAL_SAMPLE,
      );
      if (r) return ok({ basis, method: "project-rent-iqr", ...r, psf: null, sampleSize: r.n, ...window, scope, source }, listing.askingPrice);
    }
    return { ok: false, reason: "no-recent-records", source };
  }

  return { ok: false, reason: ref.kind === "landed" || ref.kind === "landed-street" ? "landed" : "unresolved", source: FAIR_VALUE_SOURCES.privateSale };
}
