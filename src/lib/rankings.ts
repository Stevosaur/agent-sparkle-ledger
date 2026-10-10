import "server-only";
import { getHdbBlocks, getTowns } from "@/lib/data/hdb";
import { getLaunches, getProjects } from "@/lib/data/private";
import { yearOfMonth } from "@/lib/data/months";
import { HDB_FLAT_TYPES, type HdbBlock, type MarketSegment, type NewLaunch, type PrivateProject, type TownSummary } from "@/lib/data/types";
import { enblocTier, type EnblocResult } from "@/lib/calc/enbloc";
import { HDB_MOP_YEARS } from "@/lib/calc/rules";
import { haversineM } from "@/lib/geo-math";
import { formatInt, formatPct, formatPctSigned, formatPsf, formatSgd } from "@/lib/format";
import { titleCase } from "@/lib/slug";
import { getHdbRentScan, getHdbSalesScan, type HdbBlockStats, type RentStat } from "@/lib/insights/hdb-scan";
import { getPrivateRentScan, getPrivateSalesScan, type PrivateProjectRent, type PrivateProjectStats } from "@/lib/insights/private-scan";
import { annualised } from "@/lib/insights/math";
import { memoBySnapshot, referenceYear } from "@/lib/insights/memo";

/* ------------------------------------------------------------------ */
/* Definitions                                                         */
/* ------------------------------------------------------------------ */

export const LIST_IDS = ["yield", "growth", "newest", "cheapest", "demand-supply", "enbloc", "completions"] as const;
export type ListId = (typeof LIST_IDS)[number];
export type RankGroup = "hdb" | "condo" | "town" | "launch";
export type ListFilter = "town" | "flatType" | "segment";

export function isListId(id: string): id is ListId {
  return (LIST_IDS as readonly string[]).includes(id);
}

/** Thresholds (documented on each list page). */
export const RANKING_RULES = {
  yieldMinSales: 3,
  yieldMinRentals: 3,
  growthYears: 5,
  growthMinSalesPerWindow: 3,
  cheapestMinSales: 3,
  demandYears: 3,
  supplyRadiusM: 3000,
} as const;

export interface ListColumn {
  key: string;
  header: string;
  headerKey: string;
}

export interface ListGroupDef {
  id: RankGroup;
  label: string;
  labelKey: string;
}

export interface ListDef {
  id: ListId;
  title: string;
  titleKey: string;
  description: string;
  descKey: string;
  metricHeader: string;
  metricHeaderKey: string;
  columns: ListColumn[];
  groups: ListGroupDef[];
  filters: ListFilter[];
  /** HDB rows are per (block, flat type); growth also has block-level "ALL" rows, which are the default view */
  defaultFlatType: string | null;
  methodology: string[];
  source: string;
}

const G_HDB: ListGroupDef = { id: "hdb", label: "HDB blocks", labelKey: "insights.group.hdb" };
const G_CONDO: ListGroupDef = { id: "condo", label: "Condos & ECs", labelKey: "insights.group.condo" };
const G_TOWN: ListGroupDef = { id: "town", label: "HDB towns", labelKey: "insights.group.town" };
const G_LAUNCH: ListGroupDef = { id: "launch", label: "New launches", labelKey: "insights.group.launch" };

const col = (key: string, header: string): ListColumn => ({ key, header, headerKey: `insights.col.${key}` });

const SRC_HDB = "HDB resale prices and HDB rental approvals, data.gov.sg";
const SRC_PRIVATE = "URA private residential transactions and rental contracts (URA Data Service)";

export const LIST_DEFS: Record<ListId, ListDef> = {
  yield: {
    id: "yield",
    title: "Highest gross rental yield",
    titleKey: "insights.list.yield.title",
    description: "Annual rent as a share of price, from the last 12 months of sales and rentals in the same block or project.",
    descKey: "insights.list.yield.desc",
    metricHeader: "Gross yield",
    metricHeaderKey: "insights.col.grossYield",
    columns: [col("medianRent", "Median rent"), col("priceBasis", "Median price / psf"), col("sales12m", "Sales (12m)"), col("rentals12m", "Rentals (12m)")],
    groups: [G_HDB, G_CONDO],
    filters: ["town", "flatType", "segment"],
    defaultFlatType: null,
    methodology: [
      `HDB: for each block and flat type with at least ${RANKING_RULES.yieldMinSales} resales and ${RANKING_RULES.yieldMinRentals} rental approvals in the latest 12 months, gross yield = median monthly rent × 12 ÷ median resale price.`,
      `Condos and ECs: URA publishes rents with a floor-area band, so rent per sqft uses the band mid-point (approximate). Gross yield = median monthly rent psf × 12 ÷ median sale psf, with at least ${RANKING_RULES.yieldMinSales} non-bulk sales and ${RANKING_RULES.yieldMinRentals} rentals in 12 months.`,
      "HDB rents are declared by flat owners and are not verified by HDB. Gross yield ignores property tax, maintenance, agent fees and vacancy, so net yields are lower. It is an estimate, not a forecast.",
    ],
    source: `${SRC_HDB}; ${SRC_PRIVATE}`,
  },
  growth: {
    id: "growth",
    title: "Highest price growth",
    titleKey: "insights.list.growth.title",
    description: "Five-year compound annual growth in median price per square foot.",
    descKey: "insights.list.growth.desc",
    metricHeader: "Growth a year",
    metricHeaderKey: "insights.col.cagr",
    columns: [col("psfThen", "Median psf 5 yrs ago"), col("psfNow", "Median psf now"), col("samples", "Sales then / now")],
    groups: [G_HDB, G_CONDO],
    filters: ["town", "flatType", "segment"],
    defaultFlatType: "ALL",
    methodology: [
      `Median psf over the latest 12 months compared with the 12 months ending ${RANKING_RULES.growthYears} years earlier, annualised (CAGR).`,
      `Each window needs at least ${RANKING_RULES.growthMinSalesPerWindow} sales. HDB blocks are ranked on all flat types together by default; pick a flat type to compare like with like. Private bulk deals are excluded.`,
      "Price per square foot changes with the mix of units sold, so small samples can swing. Past growth does not predict future growth.",
    ],
    source: `${SRC_HDB}; ${SRC_PRIVATE}`,
  },
  newest: {
    id: "newest",
    title: "Newest developments",
    titleKey: "insights.list.newest.title",
    description: "HDB blocks by lease start (or completion year), and condos by the start of their lease.",
    descKey: "insights.list.newest.desc",
    metricHeader: "Year",
    metricHeaderKey: "insights.col.year",
    columns: [col("basis", "Based on"), col("units", "Units"), col("sales12m", "Sales (12m)")],
    groups: [G_HDB, G_CONDO],
    filters: ["town", "segment"],
    defaultFlatType: null,
    methodology: [
      "HDB blocks use the 99-year lease commencement year from resale records, or the completion year from HDB property information when the block has no resales yet.",
      "Condos and ECs use the year their lease commenced. Freehold projects have no lease start in URA data, so they are not ranked here.",
    ],
    source: "HDB property information and resale prices, data.gov.sg; URA private residential transactions (tenure)",
  },
  cheapest: {
    id: "cheapest",
    title: "Lowest price per square foot",
    titleKey: "insights.list.cheapest.title",
    description: "Lowest median price per square foot over the last 12 months.",
    descKey: "insights.list.cheapest.desc",
    metricHeader: "Median psf",
    metricHeaderKey: "insights.col.medianPsf",
    columns: [col("medianPrice", "Median price"), col("sales12m", "Sales (12m)")],
    groups: [G_HDB, G_CONDO],
    filters: ["town", "flatType", "segment"],
    defaultFlatType: null,
    methodology: [
      `HDB: per block and flat type with at least ${RANKING_RULES.cheapestMinSales} resales in the latest 12 months. Condos and ECs: per project with at least ${RANKING_RULES.cheapestMinSales} non-bulk sales.`,
      "A low psf often reflects an older lease, a larger flat or a less central location. Compare like with like before reading it as value.",
    ],
    source: `${SRC_HDB}; ${SRC_PRIVATE}`,
  },
  "demand-supply": {
    id: "demand-supply",
    title: "Upgrader demand vs new-launch supply",
    titleKey: "insights.list.demandSupply.title",
    description: "HDB flats reaching their Minimum Occupation Period in the next three years, against new-launch units near each town.",
    descKey: "insights.list.demandSupply.desc",
    metricHeader: "MOP flats per launch unit",
    metricHeaderKey: "insights.col.ratio",
    columns: [col("mopFlats", "Flats reaching MOP"), col("launchUnits", "Launch units nearby"), col("launches", "Launches")],
    groups: [G_TOWN],
    filters: [],
    defaultFlatType: null,
    methodology: [
      `Demand (estimate): dwelling units in blocks whose completion year + ${HDB_MOP_YEARS} (the standard Minimum Occupation Period) falls in the next ${RANKING_RULES.demandYears} calendar years. MOP is when owners may first sell or buy private property, so these households are the likeliest upgraders. Unit counts can include rental flats, and blocks without a completion year are left out.`,
      `Supply: total units in new launches (launched or upcoming, not yet completed) within ${RANKING_RULES.supplyRadiusM / 1000} km of the town's centre (the average position of its blocks).`,
      "A higher ratio means more potential upgraders per competing new unit. It is a heuristic, not a forecast: buyers also look beyond their own town.",
    ],
    source: "HDB property information, data.gov.sg; URA private residential pipeline and developer sales",
  },
  enbloc: {
    id: "enbloc",
    title: "En-bloc potential",
    titleKey: "insights.list.enbloc.title",
    description: "Condos ranked by a transparent en-bloc tier, then by age.",
    descKey: "insights.list.enbloc.desc",
    metricHeader: "Tier",
    metricHeaderKey: "insights.col.tier",
    columns: [col("tenure", "Tenure"), col("age", "Age"), col("basis", "Based on")],
    groups: [G_CONDO],
    filters: ["segment"],
    defaultFlatType: null,
    methodology: [
      "Tier A: freehold or 999-year and about 30+ years old. Tier B: freehold or 999-year and 20+ years old, or a 99-year lease that is 40+ years old. Tier C: a 99-year lease 25+ years old. Executive condominiums are rated unlikely.",
      "Age runs from the lease start for 99-year projects. Freehold and 999-year projects have no usable start year, so age runs from their earliest developer (new) sale on record, a proxy for the launch year. Older projects have no developer sale in URA's five-year record, so their age is unknown and they are listed as \"Not enough data\" rather than guessed.",
      "This is a heuristic based only on tenure and age. Collective sales also depend on owners' consent, land value and planning rules, none of which are modelled.",
    ],
    source: SRC_PRIVATE,
  },
  completions: {
    id: "completions",
    title: "Upcoming completions",
    titleKey: "insights.list.completions.title",
    description: "New launches by expected completion (TOP) year, soonest first.",
    descKey: "insights.list.completions.desc",
    metricHeader: "Expected completion",
    metricHeaderKey: "insights.col.completion",
    columns: [col("units", "Units"), col("status", "Status"), col("sold", "Sold / launched"), col("segment", "Segment")],
    groups: [G_LAUNCH],
    filters: ["segment"],
    defaultFlatType: null,
    methodology: ["Expected completion years come from URA's pipeline data and can move. Units sold are developer sales reported to URA."],
    source: "URA private residential pipeline and developer sales",
  },
};

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export interface RankRow {
  id: string;
  group: RankGroup;
  label: string;
  href: string;
  sub: string;
  townSlug: string | null;
  /** HDB flat type, "ALL" for block-level rows, null for non-HDB rows */
  flatType: string | null;
  segment: MarketSegment | null;
  /** numeric metric used for ordering; null when it is not a number (e.g. no nearby launches) */
  value: number | null;
  metric: string;
  /** formatted values aligned with ListDef.columns */
  cells: string[];
}

/** Everything the rankings need, as plain data, so the builders below are pure and testable. */
export interface RankingInputs {
  referenceYear: number;
  hdbBlocks: HdbBlock[];
  towns: TownSummary[];
  projects: PrivateProject[];
  launches: NewLaunch[];
  hdbBlockStats: Map<string, HdbBlockStats>;
  /** key `${blockSlug}|${flatType}` */
  hdbRents: Map<string, RentStat>;
  privateProjectStats: Map<string, PrivateProjectStats>;
  privateRents: Map<string, PrivateProjectRent>;
  /** month index of each project's earliest developer (New Sale) record */
  privateFirstNewSale: Map<string, number>;
}

function hdbLabel(b: HdbBlock): string {
  return `Blk ${b.block} ${titleCase(b.street)}`;
}

function projectSub(p: { district: number | null; segment: MarketSegment | null }): string {
  return [p.district != null ? `D${String(p.district).padStart(2, "0")}` : null, p.segment].filter(Boolean).join(" · ");
}

function isEc(p: PrivateProject): boolean {
  return p.propertyTypes.includes("Executive Condominium");
}

function byValueDesc(a: RankRow, b: RankRow): number {
  return (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.label.localeCompare(b.label);
}

function byValueAsc(a: RankRow, b: RankRow): number {
  return (a.value ?? Infinity) - (b.value ?? Infinity) || a.label.localeCompare(b.label);
}

export function buildYieldRows(inp: RankingInputs): RankRow[] {
  const rows: RankRow[] = [];
  for (const b of inp.hdbBlocks) {
    const stats = inp.hdbBlockStats.get(b.slug);
    if (!stats) continue;
    for (const [flatType, s] of Object.entries(stats.byType)) {
      const r = inp.hdbRents.get(`${b.slug}|${flatType}`);
      if (!r || s.cur.count < RANKING_RULES.yieldMinSales || r.count < RANKING_RULES.yieldMinRentals) continue;
      if (!s.cur.medianPrice || !r.medianRent) continue;
      const y = (r.medianRent * 12) / s.cur.medianPrice;
      rows.push({
        id: `hdb:${b.slug}:${flatType}`,
        group: "hdb",
        label: hdbLabel(b),
        href: `/hdb/${b.slug}/`,
        sub: `${titleCase(b.town)} · ${flatType}`,
        townSlug: b.townSlug,
        flatType,
        segment: null,
        value: y,
        metric: formatPct(y, 2),
        cells: [`${formatSgd(r.medianRent)}/mo`, formatSgd(s.cur.medianPrice), formatInt(s.cur.count), formatInt(r.count)],
      });
    }
  }
  for (const p of inp.projects) {
    if (p.isLanded) continue;
    const s = inp.privateProjectStats.get(p.slug)?.cur;
    const r = inp.privateRents.get(p.slug);
    if (!s || !r || s.count < RANKING_RULES.yieldMinSales || r.withArea < RANKING_RULES.yieldMinRentals) continue;
    if (!s.medianPsf || r.medianRentPsf == null) continue;
    const y = (r.medianRentPsf * 12) / s.medianPsf;
    rows.push({
      id: `condo:${p.slug}`,
      group: "condo",
      label: titleCase(p.name),
      href: `/condo/${p.slug}/`,
      sub: [isEc(p) ? "EC" : "Condo", projectSub(p)].filter(Boolean).join(" · "),
      townSlug: null,
      flatType: null,
      segment: p.segment,
      value: y,
      metric: formatPct(y, 2),
      cells: [r.medianRent != null ? `${formatSgd(r.medianRent)}/mo` : "—", formatPsf(s.medianPsf), formatInt(s.count), formatInt(r.count)],
    });
  }
  return rows.sort(byValueDesc);
}

export function buildGrowthRows(inp: RankingInputs): RankRow[] {
  const years = RANKING_RULES.growthYears;
  const min = RANKING_RULES.growthMinSalesPerWindow;
  const rows: RankRow[] = [];
  const push = (base: Omit<RankRow, "value" | "metric" | "cells">, then: { count: number; medianPsf: number | null }, now: { count: number; medianPsf: number | null }) => {
    if (then.count < min || now.count < min) return;
    const g = annualised(then.medianPsf, now.medianPsf, years);
    if (g == null) return;
    rows.push({ ...base, value: g, metric: `${formatPctSigned(g)}/yr`, cells: [formatPsf(then.medianPsf), formatPsf(now.medianPsf), `${formatInt(then.count)} / ${formatInt(now.count)}`] });
  };
  for (const b of inp.hdbBlocks) {
    const stats = inp.hdbBlockStats.get(b.slug);
    if (!stats) continue;
    const base = { group: "hdb" as const, label: hdbLabel(b), href: `/hdb/${b.slug}/`, townSlug: b.townSlug, segment: null };
    push({ ...base, id: `hdb:${b.slug}:ALL`, flatType: "ALL", sub: `${titleCase(b.town)} · all flat types` }, stats.all.prev5y, stats.all.cur);
    for (const [flatType, s] of Object.entries(stats.byType)) {
      push({ ...base, id: `hdb:${b.slug}:${flatType}`, flatType, sub: `${titleCase(b.town)} · ${flatType}` }, s.prev5y, s.cur);
    }
  }
  for (const p of inp.projects) {
    if (p.isLanded) continue;
    const s = inp.privateProjectStats.get(p.slug);
    if (!s) continue;
    push(
      { id: `condo:${p.slug}`, group: "condo", label: titleCase(p.name), href: `/condo/${p.slug}/`, sub: [isEc(p) ? "EC" : "Condo", projectSub(p)].filter(Boolean).join(" · "), townSlug: null, flatType: null, segment: p.segment },
      s.prev5y,
      s.cur,
    );
  }
  return rows.sort(byValueDesc);
}

export function buildNewestRows(inp: RankingInputs): RankRow[] {
  const rows: (RankRow & { busy: number })[] = [];
  for (const b of inp.hdbBlocks) {
    const year = b.leaseCommenceYear ?? b.yearCompleted;
    if (year == null) continue;
    rows.push({
      busy: b.tx.count12m,
      id: `hdb:${b.slug}`,
      group: "hdb",
      label: hdbLabel(b),
      href: `/hdb/${b.slug}/`,
      sub: titleCase(b.town),
      townSlug: b.townSlug,
      flatType: null,
      segment: null,
      value: year,
      metric: String(year),
      cells: [b.leaseCommenceYear != null ? "Lease start" : "Completion year", b.dwellingUnits != null ? formatInt(b.dwellingUnits) : "—", formatInt(b.tx.count12m)],
    });
  }
  for (const p of inp.projects) {
    if (p.isLanded || p.tenure?.kind !== "leasehold" || p.tenure.startYear == null || (p.tenure.years ?? 0) >= 999) continue;
    rows.push({
      busy: p.tx.count12m,
      id: `condo:${p.slug}`,
      group: "condo",
      label: titleCase(p.name),
      href: `/condo/${p.slug}/`,
      sub: [isEc(p) ? "EC" : "Condo", projectSub(p)].filter(Boolean).join(" · "),
      townSlug: null,
      flatType: null,
      segment: p.segment,
      value: p.tenure.startYear,
      metric: String(p.tenure.startYear),
      cells: ["Lease start", "—", formatInt(p.tx.count12m)],
    });
  }
  // newest first; busier first within a year
  return rows
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || b.busy - a.busy || a.label.localeCompare(b.label))
    .map(({ busy: _busy, ...r }) => r);
}

export function buildCheapestRows(inp: RankingInputs): RankRow[] {
  const rows: RankRow[] = [];
  for (const b of inp.hdbBlocks) {
    const stats = inp.hdbBlockStats.get(b.slug);
    if (!stats) continue;
    for (const [flatType, s] of Object.entries(stats.byType)) {
      if (s.cur.count < RANKING_RULES.cheapestMinSales || !s.cur.medianPsf) continue;
      rows.push({
        id: `hdb:${b.slug}:${flatType}`,
        group: "hdb",
        label: hdbLabel(b),
        href: `/hdb/${b.slug}/`,
        sub: `${titleCase(b.town)} · ${flatType}`,
        townSlug: b.townSlug,
        flatType,
        segment: null,
        value: s.cur.medianPsf,
        metric: formatPsf(s.cur.medianPsf),
        cells: [formatSgd(s.cur.medianPrice), formatInt(s.cur.count)],
      });
    }
  }
  for (const p of inp.projects) {
    if (p.isLanded) continue;
    const s = inp.privateProjectStats.get(p.slug)?.cur;
    if (!s || s.count < RANKING_RULES.cheapestMinSales || !s.medianPsf) continue;
    rows.push({
      id: `condo:${p.slug}`,
      group: "condo",
      label: titleCase(p.name),
      href: `/condo/${p.slug}/`,
      sub: [isEc(p) ? "EC" : "Condo", projectSub(p)].filter(Boolean).join(" · "),
      townSlug: null,
      flatType: null,
      segment: p.segment,
      value: s.medianPsf,
      metric: formatPsf(s.medianPsf),
      cells: [formatSgd(s.medianPrice), formatInt(s.count)],
    });
  }
  return rows.sort(byValueAsc);
}

export interface TownDemandSupply {
  townSlug: string;
  town: string;
  demandUnits: number;
  demandBlocks: number;
  blocksWithoutYear: number;
  /** null when no block in the town has coordinates */
  supplyUnits: number | null;
  launches: string[];
  ratio: number | null;
}

/** MOP-based upgrader pool vs nearby new-launch supply per town (see LIST_DEFS["demand-supply"].methodology). */
export function townDemandSupply(inp: Pick<RankingInputs, "referenceYear" | "hdbBlocks" | "towns" | "launches">): TownDemandSupply[] {
  const fromYear = inp.referenceYear + 1;
  const toYear = inp.referenceYear + RANKING_RULES.demandYears;
  const out: TownDemandSupply[] = [];
  const blocksByTown = new Map<string, HdbBlock[]>();
  for (const b of inp.hdbBlocks) {
    const arr = blocksByTown.get(b.townSlug) ?? [];
    arr.push(b);
    blocksByTown.set(b.townSlug, arr);
  }
  for (const t of inp.towns) {
    const blocks = blocksByTown.get(t.slug) ?? [];
    let demandUnits = 0;
    let demandBlocks = 0;
    let blocksWithoutYear = 0;
    let lat = 0;
    let lng = 0;
    let n = 0;
    for (const b of blocks) {
      if (b.lat != null && b.lng != null) {
        lat += b.lat;
        lng += b.lng;
        n += 1;
      }
      if (b.yearCompleted == null) {
        blocksWithoutYear += 1;
        continue;
      }
      const mop = b.yearCompleted + HDB_MOP_YEARS;
      if (mop >= fromYear && mop <= toYear && b.dwellingUnits) {
        demandUnits += b.dwellingUnits;
        demandBlocks += 1;
      }
    }
    let supplyUnits: number | null = null;
    const launches: string[] = [];
    if (n > 0) {
      const centre = { lat: lat / n, lng: lng / n };
      supplyUnits = 0;
      for (const l of inp.launches) {
        if (l.lat == null || l.lng == null || !l.totalUnits) continue;
        if (l.expectedCompletionYear != null && l.expectedCompletionYear < inp.referenceYear) continue;
        if (haversineM(centre, { lat: l.lat, lng: l.lng }) > RANKING_RULES.supplyRadiusM) continue;
        supplyUnits += l.totalUnits;
        launches.push(titleCase(l.name));
      }
    }
    out.push({
      townSlug: t.slug,
      town: t.town,
      demandUnits,
      demandBlocks,
      blocksWithoutYear,
      supplyUnits,
      launches,
      ratio: supplyUnits != null && supplyUnits > 0 ? demandUnits / supplyUnits : null,
    });
  }
  return out;
}

export function buildDemandSupplyRows(inp: RankingInputs): RankRow[] {
  const fromYear = inp.referenceYear + 1;
  const toYear = inp.referenceYear + RANKING_RULES.demandYears;
  const rank = (r: TownDemandSupply): [number, number] => {
    // 0: demand with no competing launches nearby; 1: finite ratio; 2: location unknown
    if (r.supplyUnits === 0) return [0, r.demandUnits];
    if (r.ratio != null) return [1, r.ratio];
    return [2, r.demandUnits];
  };
  return townDemandSupply(inp)
    .filter((r) => r.demandUnits > 0 || (r.supplyUnits ?? 0) > 0)
    .sort((a, b) => {
      const [ka, va] = rank(a);
      const [kb, vb] = rank(b);
      return ka - kb || vb - va || b.demandUnits - a.demandUnits || a.town.localeCompare(b.town);
    })
    .map((r) => ({
      id: `town:${r.townSlug}`,
      group: "town" as const,
      label: titleCase(r.town),
      href: `/insights/town/${r.townSlug}/`,
      sub: `MOP ${fromYear}–${toYear}`,
      townSlug: r.townSlug,
      flatType: null,
      segment: null,
      value: r.ratio,
      metric: r.ratio != null ? `${r.ratio.toFixed(2)}×` : r.supplyUnits === 0 ? "No launches nearby" : "Location unknown",
      cells: [formatInt(r.demandUnits), r.supplyUnits == null ? "—" : formatInt(r.supplyUnits), r.launches.length ? r.launches.join(", ") : "—"],
    }));
}

const TIER_ORDER: Record<EnblocResult["tier"], number> = { A: 0, B: 1, C: 2, Unlikely: 3, Unknown: 4 };

export function buildEnblocRows(inp: RankingInputs): RankRow[] {
  const rows: (RankRow & { age: number })[] = [];
  for (const p of inp.projects) {
    if (p.isLanded) continue;
    const long = p.tenure?.kind === "freehold" || (p.tenure?.years ?? 0) >= 999;
    // Freehold / 999-year: the earliest developer sale is a launch-year proxy. The earliest sale of any kind is
    // not: URA's record only reaches back about five years, so an old project would look five years old.
    const firstNew = inp.privateFirstNewSale.get(p.slug);
    const startYear = long ? (firstNew != null ? yearOfMonth(firstNew) : null) : (p.tenure?.startYear ?? null);
    const result = enblocTier({
      tenureKind: p.tenure?.kind ?? null,
      leaseYears: p.tenure?.years ?? null,
      startYear,
      currentYear: inp.referenceYear,
      propertyTypes: p.propertyTypes,
    });
    const age = startYear != null ? inp.referenceYear - startYear : -1;
    rows.push({
      id: `condo:${p.slug}`,
      group: "condo",
      label: titleCase(p.name),
      href: `/condo/${p.slug}/`,
      sub: [isEc(p) ? "EC" : "Condo", projectSub(p)].filter(Boolean).join(" · "),
      townSlug: null,
      flatType: null,
      segment: p.segment,
      value: TIER_ORDER[result.tier],
      metric: result.tier === "A" || result.tier === "B" || result.tier === "C" ? `Tier ${result.tier} · ${result.label}` : result.label,
      cells: [
        p.tenure ? (p.tenure.kind === "freehold" ? "Freehold" : `${p.tenure.years ?? "?"}-yr lease${p.tenure.startYear != null && !long ? ` from ${p.tenure.startYear}` : ""}`) : "Unknown",
        age >= 0 ? `${age} yrs` : "—",
        startYear == null ? (long && p.tenure ? "No developer sale on record" : "—") : long ? "Earliest developer sale" : "Lease start",
      ],
      age,
    });
  }
  return rows
    .sort((a, b) => (a.value ?? 9) - (b.value ?? 9) || b.age - a.age || a.label.localeCompare(b.label))
    .map(({ age: _age, ...r }) => r);
}

export function buildCompletionRows(inp: RankingInputs): RankRow[] {
  return inp.launches
    .filter((l) => l.expectedCompletionYear != null && l.expectedCompletionYear >= inp.referenceYear)
    .sort((a, b) => (a.expectedCompletionYear ?? 0) - (b.expectedCompletionYear ?? 0) || (b.totalUnits ?? 0) - (a.totalUnits ?? 0) || a.name.localeCompare(b.name))
    .map((l) => ({
      id: `launch:${l.type}/${l.slug}`,
      group: "launch" as const,
      label: titleCase(l.name),
      href: `/new-launch/${l.type}/${l.slug}/`,
      sub: [l.type === "ec" ? "EC" : l.type === "landed" ? "Landed" : "Condo", projectSub(l)].filter(Boolean).join(" · "),
      townSlug: null,
      flatType: null,
      segment: l.segment,
      value: l.expectedCompletionYear,
      metric: String(l.expectedCompletionYear),
      cells: [
        l.totalUnits != null ? formatInt(l.totalUnits) : "—",
        l.status === "launched" ? "Launched" : "Upcoming",
        l.unitsSold != null && l.unitsLaunched != null ? `${formatInt(l.unitsSold)} / ${formatInt(l.unitsLaunched)}` : "—",
        l.segment ?? "—",
      ],
    }));
}

const BUILDERS: Record<ListId, (inp: RankingInputs) => RankRow[]> = {
  yield: buildYieldRows,
  growth: buildGrowthRows,
  newest: buildNewestRows,
  cheapest: buildCheapestRows,
  "demand-supply": buildDemandSupplyRows,
  enbloc: buildEnblocRows,
  completions: buildCompletionRows,
};

export function buildListRows(id: ListId, inp: RankingInputs): RankRow[] {
  return BUILDERS[id](inp);
}

/* ------------------------------------------------------------------ */
/* Data-layer wiring (memoised per process and snapshot)               */
/* ------------------------------------------------------------------ */

export function getRankingInputs(): RankingInputs {
  return memoBySnapshot("ranking-inputs", () => ({
    referenceYear: referenceYear(),
    hdbBlocks: getHdbBlocks(),
    towns: getTowns(),
    projects: getProjects(),
    launches: getLaunches(),
    hdbBlockStats: getHdbSalesScan().blocks,
    hdbRents: getHdbRentScan().byBlockType,
    privateProjectStats: getPrivateSalesScan().projects,
    privateRents: getPrivateRentScan().projects,
    privateFirstNewSale: getPrivateSalesScan().firstNewSale,
  }));
}

export function getListRows(id: ListId): RankRow[] {
  return memoBySnapshot(`ranking:${id}`, () => buildListRows(id, getRankingInputs()));
}

/* ------------------------------------------------------------------ */
/* Filtering and paging                                                */
/* ------------------------------------------------------------------ */

export interface ListQuery {
  group?: RankGroup | null;
  town?: string | null;
  flatType?: string | null;
  segment?: MarketSegment | null;
}

export function filterRows(def: ListDef, rows: readonly RankRow[], q: ListQuery): RankRow[] {
  const flatType = q.flatType ?? def.defaultFlatType;
  return rows.filter((r) => {
    if (q.group && r.group !== q.group) return false;
    if (q.town && r.townSlug !== q.town) return false;
    if (q.segment && r.segment !== q.segment) return false;
    // flat-type filters apply to HDB rows only; other groups have no flat type
    if (flatType && r.group === "hdb" && r.flatType != null && r.flatType !== flatType) return false;
    // a specific flat type is an HDB-only filter; "ALL" (block-level view) leaves other groups alone
    if (q.flatType && q.flatType !== "ALL" && r.group !== "hdb") return false;
    return true;
  });
}

/** The free view: the top 3 of each group under the list's default view. */
export function freeTopRows(id: ListId, n = 3): { group: ListGroupDef; rows: RankRow[]; total: number }[] {
  const def = LIST_DEFS[id];
  const rows = getListRows(id);
  return def.groups.map((group) => {
    const all = filterRows(def, rows, { group: group.id });
    return { group, rows: all.slice(0, n), total: all.length };
  });
}

/** Parse and validate query-string filters (unknown values are dropped). */
export function parseListQuery(def: ListDef, params: URLSearchParams): ListQuery {
  const group = params.get("group");
  const town = params.get("town");
  const flatType = params.get("flatType");
  const segment = params.get("segment");
  return {
    group: group && def.groups.some((g) => g.id === group) ? (group as RankGroup) : null,
    town: town && def.filters.includes("town") && /^[a-z0-9-]{1,40}$/.test(town) ? town : null,
    flatType: flatType && def.filters.includes("flatType") && (flatType === "ALL" ? def.defaultFlatType === "ALL" : (HDB_FLAT_TYPES as readonly string[]).includes(flatType)) ? flatType : null,
    segment: segment && def.filters.includes("segment") && ["CCR", "RCR", "OCR"].includes(segment) ? (segment as MarketSegment) : null,
  };
}

export interface ListPage {
  list: ListId;
  total: number;
  offset: number;
  limit: number;
  rows: (RankRow & { rank: number })[];
}

export const LIST_PAGE_MAX = 100;

export function pageRows(id: ListId, q: ListQuery, offset: number, limit: number): ListPage {
  const def = LIST_DEFS[id];
  const filtered = filterRows(def, getListRows(id), q);
  const safeOffset = Math.max(0, Math.floor(offset) || 0);
  const safeLimit = Math.min(LIST_PAGE_MAX, Math.max(1, Math.floor(limit) || 50));
  return {
    list: id,
    total: filtered.length,
    offset: safeOffset,
    limit: safeLimit,
    rows: filtered.slice(safeOffset, safeOffset + safeLimit).map((r, i) => ({ ...r, rank: safeOffset + i + 1 })),
  };
}

/** Public filter options for the gated ranking UI (metadata only, no ranking data). */
export function listFilterOptions(): { towns: { slug: string; name: string }[]; flatTypes: string[]; segments: MarketSegment[] } {
  return {
    towns: getTowns()
      .map((t) => ({ slug: t.slug, name: titleCase(t.town) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    flatTypes: [...HDB_FLAT_TYPES],
    segments: ["CCR", "RCR", "OCR"],
  };
}
