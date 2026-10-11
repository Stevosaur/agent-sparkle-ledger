import "server-only";
import { getBlockTransactions, getHdbBlock, getTownTransactions } from "@/lib/data/hdb";
import { getLandedAddress, getLandedStreetTransactions, getProject, getProjectTransactions } from "@/lib/data/private";
import { getCoverage } from "@/lib/data/meta";
import { SQFT_PER_SQM } from "@/lib/format";
import type { PropertyRef } from "@/lib/property-ref";
import { gainVsPurchase, quarterlyMedians, quarterLabel, roundToThousand, type QuarterMedian } from "./estimate-math";
import type { EstimateMethod, EstimateUnavailableReason, HomeEstimate } from "./types";

/**
 * Estimated value series for a tracked home, aggregated on the server (only the quarterly series leaves
 * the server — never the underlying transactions).
 *   HDB:    median resale price of the flat type in the block, by quarter (falls back to the town's
 *           median for the flat type when the block has no sales of that type)
 *   Condo:  project median psf by quarter x the home's floor area
 *   Landed: street median psf (land area) by quarter x the land area
 */
export interface EstimateInput {
  ref: PropertyRef;
  flatType: string | null;
  areaSqm: number | null;
  purchasePrice: number | null;
  purchaseMonth: string | null;
}

function unavailable(reason: EstimateUnavailableReason): HomeEstimate {
  return { status: "unavailable", reason };
}

function build(method: EstimateMethod, quarters: QuarterMedian[], toValue: (median: number) => number, input: EstimateInput, area: number | null): HomeEstimate {
  const series = quarters.map((q) => ({ x: q.x, y: toValue(q.median), n: q.n })).filter((p) => p.y > 0);
  if (series.length === 0) return unavailable("no-sales");
  const last = series[series.length - 1];
  const lastQuarter = quarters[quarters.length - 1];
  return {
    status: "ok",
    method,
    flatType: input.ref.kind === "hdb" ? input.flatType : null,
    areaSqm: area,
    series,
    latest: { value: last.y, monthIndex: last.x, quarter: quarterLabel(lastQuarter.q), sales: last.n },
    gain: gainVsPurchase(last.y, last.x, input.purchasePrice, input.purchaseMonth),
  };
}

/**
 * The transaction file an estimate reads (HDB town or private district). The data layer caches only a few
 * of these files, so callers estimating many homes should process them grouped by this key.
 */
export function estimateSourceKey(ref: PropertyRef): string {
  switch (ref.kind) {
    case "hdb":
      return `hdb:${getHdbBlock(ref.slug)?.townSlug ?? ""}`;
    case "condo":
      return `d:${getProject(ref.slug)?.district ?? ""}`;
    case "landed":
      return `d:${getLandedAddress(ref.slug)?.district ?? ""}`;
    default:
      return "";
  }
}

export function estimateHome(input: EstimateInput): HomeEstimate {
  const { ref } = input;
  switch (ref.kind) {
    case "hdb": {
      const block = getHdbBlock(ref.slug);
      if (!block) return unavailable("not-found");
      if (!input.flatType) return unavailable("needs-flat-type");
      let method: EstimateMethod = "block-flat-type-median";
      let sales = getBlockTransactions(ref.slug).filter((t) => t.flatType === input.flatType);
      if (sales.length === 0) {
        method = "town-flat-type-median";
        sales = getTownTransactions(block.townSlug).filter((t) => t.flatType === input.flatType);
      }
      if (sales.length === 0) return unavailable("no-sales");
      const quarters = quarterlyMedians(sales.map((t) => ({ monthIndex: t.monthIndex, value: t.price })));
      return build(method, quarters, (m) => Math.round(m), input, null);
    }
    case "condo": {
      const project = getProject(ref.slug);
      if (!project) return unavailable(getCoverage().private ? "not-found" : "no-private-data");
      if (project.isLanded) return unavailable("unsupported");
      const area = input.areaSqm;
      if (!area) return unavailable("needs-area");
      const sales = getProjectTransactions(ref.slug).filter((t) => t.psf > 0 && t.typeOfArea !== "Land");
      if (sales.length === 0) return unavailable("no-sales");
      const sqft = area * SQFT_PER_SQM;
      const quarters = quarterlyMedians(sales.map((t) => ({ monthIndex: t.monthIndex, value: t.psf })));
      return build("project-median-psf", quarters, (psf) => roundToThousand(psf * sqft), input, area);
    }
    case "landed": {
      const address = getLandedAddress(ref.slug);
      if (!address) return unavailable(getCoverage().private ? "not-found" : "no-private-data");
      const area = input.areaSqm ?? address.landAreaSqm;
      if (!area) return unavailable("needs-area");
      const street = getLandedStreetTransactions(address.streetSlug).filter((t) => t.psf > 0);
      // URA quotes landed psf on land area; prefer land-area records when the street has them.
      const landOnly = street.filter((t) => t.typeOfArea === "Land");
      const sales = landOnly.length > 0 ? landOnly : street;
      if (sales.length === 0) return unavailable("no-sales");
      const sqft = area * SQFT_PER_SQM;
      const quarters = quarterlyMedians(sales.map((t) => ({ monthIndex: t.monthIndex, value: t.psf })));
      return build("street-median-psf", quarters, (psf) => roundToThousand(psf * sqft), input, area);
    }
    default:
      return unavailable("unsupported");
  }
}
