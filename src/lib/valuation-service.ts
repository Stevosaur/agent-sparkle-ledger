import "server-only";
import { estimateRemainingLeaseMonths, getHdbBlock, getNearbyBlocks, getTownTransactions } from "@/lib/data/hdb";
import {
  LANDED_TYPES,
  getDistrictTransactions,
  getLandedAddress,
  getLandedStreet,
  getLandedStreetTransactions,
  getProject,
  getProjectTransactions,
  getProjects,
} from "@/lib/data/private";
import { getSeries } from "@/lib/data/stats";
import { getMeta } from "@/lib/data/meta";
import { monthIndex, monthLabel } from "@/lib/data/months";
import type { HdbBlock, HdbTransaction, MonthlyStat, PrivateProject, PrivateTransaction, StatSeries } from "@/lib/data/types";
import { haversineM } from "@/lib/geo-math";
import { indexAt, valueByComparables, type ComparableInput } from "@/lib/calc/valuation";
import { BALA_TABLE_STATUS, balaPct } from "@/lib/calc/lease";
import { formatPropertyRef, type PropertyRef } from "@/lib/property-ref";
import { landedAddressSlug, titleCase } from "@/lib/slug";
import { isEcProject } from "@/lib/tools/fit";

/**
 * Server-side comparable selection + valuation for /api/gated/valuation/.
 *
 * HDB:    same block & flat type in the last 24 months; when there are fewer than MIN_SAME_SITE, widen to
 *         blocks within 1 km (same flat type). Index hdb:<TOWN>:<FLAT TYPE>. Storey premium per level.
 *         Lease adjustment via Bala's Table when the table is loaded (balaPct returns non-null).
 * Condo:  same project in the last 36 months; widen to projects within 1 km in the same market segment
 *         (ECs only against ECs). Index private-d:<district>:ALL.
 * Landed: same street in the last 36 months; widen to landed sales of the same type in the district.
 *         Index private:<segment>:Landed.
 * When fewer than MIN_COMPARABLES are found the lookback is extended to EXTENDED_LOOKBACK_MONTHS.
 */

export type ValuationKind = "hdb" | "condo" | "landed";

export const HDB_LOOKBACK_MONTHS = 24;
export const PRIVATE_LOOKBACK_MONTHS = 36;
export const EXTENDED_LOOKBACK_MONTHS = 60;
export const NEARBY_RADIUS_M = 1000;
/** Same-site sales needed before we stop widening to nearby blocks / projects / the district. */
export const MIN_SAME_SITE = 5;
/** Below this many comparables no estimate is returned. */
export const MIN_COMPARABLES = 3;
/** Floor / storey premium applied per level of difference (model assumption, stated in the method note). */
export const FLOOR_PREMIUM_PER_LEVEL = 0.005;
export const MAX_COMPARABLES_USED = 20;
export const COMPARABLES_SHOWN = 10;
/** Sort key for comparables whose location is unknown (sorted after every located one). */
const UNKNOWN_DISTANCE_M = 50_000;

export interface ValuationRequest {
  ref: PropertyRef;
  flatType?: string | null;
  storeyRange?: string | null;
  floor?: number | null;
  areaSqm: number;
}

export interface ValuationComparable {
  month: string;
  label: string;
  href: string | null;
  detail: string;
  /** metres from the subject; 0 = same block / project / street; null = location unknown */
  distanceM: number | null;
  sameSite: boolean;
  areaSqm: number;
  price: number;
  psf: number;
  /** psf after time, floor and lease adjustments */
  adjustedPsf: number;
}

export interface ValuationResponse {
  subject: { ref: string; kind: ValuationKind; label: string; href: string };
  input: { flatType: string | null; storeyRange: string | null; floor: number | null; areaSqm: number };
  estimate: number;
  low: number;
  high: number;
  psf: number;
  confidence: "high" | "medium" | "low";
  /** "YYYY-MM" the estimate is expressed in (latest month of data) */
  asOf: string;
  comparables: ValuationComparable[];
  comparablesUsed: number;
  comparablesFound: number;
  sameSiteCount: number;
  lookbackMonths: number;
  index: { key: string; label: string } | null;
  leaseAdjusted: boolean;
  method: string[];
  source: string;
}

export type ValuationOutcome = { ok: true; valuation: ValuationResponse } | { ok: false; status: 400 | 404 | 422; error: string; message: string };

/** A candidate comparable with display metadata. */
export interface CandidateComparable {
  monthIndex: number;
  price: number;
  areaSqm: number;
  floor: number | null;
  distanceM: number | null;
  leaseYears: number | null;
  sameSite: boolean;
  label: string;
  href: string | null;
  detail: string;
}

export interface ComparableSelection {
  comps: CandidateComparable[];
  sameSiteCount: number;
  lookbackMonths: number;
  widened: boolean;
  /** why widening could not happen (e.g. subject has no coordinates) */
  note: string | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function latestMonth(kind: "hdb" | "private"): number | null {
  const label = getMeta().latestMonth[kind];
  if (!label) return null;
  try {
    return monthIndex(label);
  } catch {
    return null;
  }
}

function inWindow(m: number, asOf: number, lookback: number): boolean {
  return m <= asOf && m > asOf - lookback;
}

/**
 * First index series in preference order that has data near `asOf` (so it can time-adjust prices); when none does,
 * the first non-empty one (the method note then says prices were not time-adjusted).
 */
function firstSeries(keys: string[], asOf: number): StatSeries | null {
  let fallback: StatSeries | null = null;
  for (const k of keys) {
    const s = getSeries(k);
    if (!s || s.points.length === 0) continue;
    if (indexAt(s.points, asOf) != null) return s;
    fallback ??= s;
  }
  return fallback;
}

function hdbBlockLabel(b: Pick<HdbBlock, "block" | "street">): string {
  return `Blk ${b.block} ${titleCase(b.street)}`;
}

/** "03 TO 05"-style mid storey; null for unparseable input. */
export function storeyRangeMid(range: string | null | undefined): number | null {
  if (!range) return null;
  const m = /(\d+)\s*TO\s*(\d+)/i.exec(range);
  return m ? (Number(m[1]) + Number(m[2])) / 2 : null;
}

function leaseAdjustmentAvailable(): boolean {
  return balaPct(60) != null;
}

/* ------------------------------------------------------------------ */
/* Comparable selection                                                */
/* ------------------------------------------------------------------ */

function hdbCandidate(t: HdbTransaction, block: HdbBlock, distanceM: number, sameSite: boolean): CandidateComparable {
  return {
    monthIndex: t.monthIndex,
    price: t.price,
    areaSqm: t.floorAreaSqm,
    floor: Number.isFinite(t.storeyMid) ? t.storeyMid : null,
    distanceM,
    leaseYears: t.remainingLeaseMonths != null ? t.remainingLeaseMonths / 12 : null,
    sameSite,
    label: hdbBlockLabel(block),
    href: `/hdb/${block.slug}/`,
    detail: `${t.flatType} · storey ${t.storeyRange}`,
  };
}

/** HDB: same block & flat type (24 months), widening to blocks within 1 km, then to 60 months if still thin. */
export function selectHdbComparables(block: HdbBlock, flatType: string, asOf: number): ComparableSelection {
  const nearbyBlocks =
    block.lat != null && block.lng != null ? getNearbyBlocks({ lat: block.lat, lng: block.lng }, NEARBY_RADIUS_M, block.slug, 500) : null;
  let last: ComparableSelection | null = null;
  for (const lookback of [HDB_LOOKBACK_MONTHS, EXTENDED_LOOKBACK_MONTHS]) {
    const same = getTownTransactions(block.townSlug)
      .filter((t) => t.blockSlug === block.slug && t.flatType === flatType && inWindow(t.monthIndex, asOf, lookback))
      .map((t) => hdbCandidate(t, block, 0, true));
    const comps = [...same];
    let widened = false;
    if (same.length < MIN_SAME_SITE && nearbyBlocks && nearbyBlocks.length > 0) {
      widened = true;
      const byTown = new Map<string, Map<string, HdbBlock & { distanceM: number }>>();
      for (const b of nearbyBlocks) {
        const m = byTown.get(b.townSlug) ?? new Map();
        m.set(b.slug, b);
        byTown.set(b.townSlug, m);
      }
      for (const [townSlug, blocks] of byTown) {
        for (const t of getTownTransactions(townSlug)) {
          const b = blocks.get(t.blockSlug);
          if (!b || t.flatType !== flatType || !inWindow(t.monthIndex, asOf, lookback)) continue;
          comps.push(hdbCandidate(t, b, b.distanceM, false));
        }
      }
    }
    last = {
      comps,
      sameSiteCount: same.length,
      lookbackMonths: lookback,
      widened,
      note: nearbyBlocks == null ? "This block has no coordinates, so nearby blocks could not be searched." : null,
    };
    if (comps.length >= MIN_COMPARABLES) break;
  }
  return last!;
}

function isLandedTx(t: PrivateTransaction): boolean {
  return LANDED_TYPES.has(t.propertyType);
}

function usablePrivateTx(t: PrivateTransaction): boolean {
  return t.units === 1 && t.areaSqm > 0 && t.price > 0;
}

function condoCandidate(t: PrivateTransaction, p: PrivateProject, distanceM: number | null, sameSite: boolean): CandidateComparable {
  return {
    monthIndex: t.monthIndex,
    price: t.price,
    areaSqm: t.areaSqm,
    floor: t.floorMid,
    distanceM,
    leaseYears: null,
    sameSite,
    label: titleCase(p.name),
    href: `/condo/${p.slug}/`,
    detail: `${t.floorRange === "-" ? "Floor n/a" : `Floor ${t.floorRange}`} · ${t.typeOfSale}`,
  };
}

/** Condo: same project (36 months), widening to projects within 1 km in the same segment, then 60 months. */
export function selectCondoComparables(project: PrivateProject, asOf: number): ComparableSelection {
  const ec = isEcProject(project);
  const located = project.lat != null && project.lng != null;
  const neighbours: { p: PrivateProject; distanceM: number }[] = [];
  if (located) {
    for (const p of getProjects()) {
      if (p.slug === project.slug || p.isLanded || p.lat == null || p.lng == null) continue;
      if (project.segment && p.segment !== project.segment) continue;
      if (isEcProject(p) !== ec) continue;
      const d = haversineM({ lat: project.lat!, lng: project.lng! }, { lat: p.lat, lng: p.lng });
      if (d <= NEARBY_RADIUS_M) neighbours.push({ p, distanceM: Math.round(d) });
    }
  }
  const ownTx = getProjectTransactions(project.slug).filter((t) => usablePrivateTx(t) && !isLandedTx(t));
  let last: ComparableSelection | null = null;
  for (const lookback of [PRIVATE_LOOKBACK_MONTHS, EXTENDED_LOOKBACK_MONTHS]) {
    const same = ownTx.filter((t) => inWindow(t.monthIndex, asOf, lookback)).map((t) => condoCandidate(t, project, 0, true));
    const comps = [...same];
    let widened = false;
    if (same.length < MIN_SAME_SITE && neighbours.length > 0) {
      widened = true;
      // one pass per district file rather than one per neighbouring project
      const byDistrict = new Map<number, Map<string, { p: PrivateProject; distanceM: number }>>();
      for (const n of neighbours) {
        if (n.p.district == null) continue;
        const m = byDistrict.get(n.p.district) ?? new Map();
        m.set(n.p.slug, n);
        byDistrict.set(n.p.district, m);
      }
      for (const [district, projects] of byDistrict) {
        for (const t of getDistrictTransactions(district)) {
          const n = projects.get(t.projectSlug);
          if (!n || !usablePrivateTx(t) || isLandedTx(t) || !inWindow(t.monthIndex, asOf, lookback)) continue;
          comps.push(condoCandidate(t, n.p, n.distanceM, false));
        }
      }
    }
    last = {
      comps,
      sameSiteCount: same.length,
      lookbackMonths: lookback,
      widened,
      note: located ? null : "This project has no coordinates, so nearby projects could not be searched.",
    };
    if (comps.length >= MIN_COMPARABLES) break;
  }
  return last!;
}

/** Which area URA reports for a landed sale: land area, or strata area for strata (cluster) landed homes. */
export type LandedAreaBasis = "land" | "strata";

/** Area basis for a set of landed property types: null when mixed or unknown (no filtering). */
export function landedAreaBasis(propertyTypes: string[]): LandedAreaBasis | null {
  if (propertyTypes.length === 0) return null;
  const strata = propertyTypes.map((t) => /^strata /i.test(t));
  if (strata.every(Boolean)) return "strata";
  if (strata.every((x) => !x)) return "land";
  return null;
}

export interface LandedSubject {
  label: string;
  href: string;
  ref: PropertyRef;
  streetSlug: string;
  street: string;
  district: number | null;
  segment: string | null;
  /** property types used to filter district comparables (empty = any landed type) */
  propertyTypes: string[];
  lat: number | null;
  lng: number | null;
}

export function landedSubjectFor(ref: PropertyRef): LandedSubject | null {
  if (ref.kind === "landed") {
    const a = getLandedAddress(ref.slug);
    if (!a) return null;
    return {
      label: titleCase(a.address),
      href: `/landed/${a.slug}/`,
      ref,
      streetSlug: a.streetSlug,
      street: a.street,
      district: a.district,
      segment: a.segment,
      propertyTypes: a.propertyType ? [a.propertyType] : [],
      lat: a.lat ?? null,
      lng: a.lng ?? null,
    };
  }
  if (ref.kind === "landed-street") {
    const s = getLandedStreet(ref.slug);
    if (!s) return null;
    return {
      label: titleCase(s.street),
      href: `/landed-street/${s.slug}/`,
      ref,
      streetSlug: s.slug,
      street: s.street,
      district: s.district,
      segment: s.segment,
      propertyTypes: s.propertyTypes,
      lat: s.lat ?? null,
      lng: s.lng ?? null,
    };
  }
  return null;
}

/** Link a unit-level landed sale to its address page when we have one. */
function landedAddressHref(address: string | null): string | null {
  if (!address) return null;
  const m = /^(\S+)\s+(.+)$/.exec(address.trim());
  if (!m) return null;
  const slug = landedAddressSlug(m[1], m[2]);
  return getLandedAddress(slug) ? `/landed/${slug}/` : null;
}

function landedCandidate(t: PrivateTransaction, label: string, href: string | null, distanceM: number | null, sameSite: boolean): CandidateComparable {
  return {
    monthIndex: t.monthIndex,
    price: t.price,
    areaSqm: t.areaSqm,
    floor: null,
    distanceM,
    leaseYears: null,
    sameSite,
    label: t.address ? titleCase(t.address) : label,
    href: landedAddressHref(t.address) ?? href,
    detail: `${t.propertyType}${t.typeOfArea === "Land" ? " · land area" : t.typeOfArea === "Strata" ? " · strata area" : ""} · ${t.typeOfSale}`,
  };
}

/** A sale whose reported area is on a different basis (land vs strata) from the subject cannot be compared per sq ft. */
function sameAreaBasis(t: PrivateTransaction, basis: LandedAreaBasis | null): boolean {
  if (basis === "land") return t.typeOfArea !== "Strata";
  if (basis === "strata") return t.typeOfArea !== "Land";
  return true;
}

/**
 * Landed: same street (36 months), widening to same-type landed sales in the district, then 60 months.
 * Sales whose area is on a different basis (land vs strata area) from the subject are left out.
 */
export function selectLandedComparables(subject: LandedSubject, asOf: number): ComparableSelection {
  const basis = landedAreaBasis(subject.propertyTypes);
  const streetTx = getLandedStreetTransactions(subject.streetSlug).filter((t) => usablePrivateTx(t) && sameAreaBasis(t, basis));
  const street = getLandedStreet(subject.streetSlug);
  const streetProjects = new Set(street?.projects ?? []);
  const types = new Set(subject.propertyTypes);
  const streetLabel = titleCase(subject.street);
  const streetHref = street ? `/landed-street/${street.slug}/` : null;
  let last: ComparableSelection | null = null;
  for (const lookback of [PRIVATE_LOOKBACK_MONTHS, EXTENDED_LOOKBACK_MONTHS]) {
    const same = streetTx.filter((t) => inWindow(t.monthIndex, asOf, lookback)).map((t) => landedCandidate(t, streetLabel, streetHref, 0, true));
    const comps = [...same];
    let widened = false;
    if (same.length < MIN_SAME_SITE && subject.district != null) {
      widened = true;
      const projectCache = new Map<string, PrivateProject | null>();
      for (const t of getDistrictTransactions(subject.district)) {
        if (!isLandedTx(t) || streetProjects.has(t.projectSlug) || !usablePrivateTx(t) || !sameAreaBasis(t, basis) || !inWindow(t.monthIndex, asOf, lookback)) continue;
        if (types.size > 0 && !types.has(t.propertyType)) continue;
        if (!projectCache.has(t.projectSlug)) projectCache.set(t.projectSlug, getProject(t.projectSlug));
        const p = projectCache.get(t.projectSlug) ?? null;
        const distanceM =
          p && p.lat != null && p.lng != null && subject.lat != null && subject.lng != null
            ? Math.round(haversineM({ lat: subject.lat, lng: subject.lng }, { lat: p.lat, lng: p.lng }))
            : null;
        comps.push(landedCandidate(t, p ? titleCase(p.street || p.name) : `District ${subject.district}`, null, distanceM, false));
      }
    }
    last = { comps, sameSiteCount: same.length, lookbackMonths: lookback, widened, note: subject.district == null ? "The district is unknown, so the search could not be widened." : null };
    if (comps.length >= MIN_COMPARABLES) break;
  }
  return last!;
}

/* ------------------------------------------------------------------ */
/* Valuation                                                           */
/* ------------------------------------------------------------------ */

function toInputs(comps: CandidateComparable[]): ComparableInput[] {
  // label carries the candidate index so results can be mapped back to their display metadata
  return comps.map((c, i) => ({
    monthIndex: c.monthIndex,
    price: c.price,
    areaSqm: c.areaSqm,
    floor: c.floor,
    distanceM: c.distanceM ?? UNKNOWN_DISTANCE_M,
    leaseYears: c.leaseYears,
    label: String(i),
  }));
}

function pctText(x: number): string {
  return `${Math.round(x * 1000) / 10}%`;
}

interface RunArgs {
  kind: ValuationKind;
  subject: { ref: PropertyRef; label: string; href: string };
  selection: ComparableSelection;
  target: { areaSqm: number; floor: number | null; leaseYears?: number | null };
  index: StatSeries | null;
  asOf: number;
  leaseValue?: (years: number) => number | null;
  input: ValuationResponse["input"];
  describe: (s: { used: number; same: number; nearby: number; lookback: number }) => string[];
  source: string;
}

function run(args: RunArgs): ValuationOutcome {
  const { selection, index, asOf } = args;
  if (selection.comps.length < MIN_COMPARABLES) {
    return {
      ok: false,
      status: 422,
      error: "not_enough_comparables",
      message: `Only ${selection.comps.length} comparable sale${selection.comps.length === 1 ? "" : "s"} found in the last ${selection.lookbackMonths} months${selection.note ? ` (${selection.note})` : ""}. At least ${MIN_COMPARABLES} are needed for an estimate.`,
    };
  }
  const points: MonthlyStat[] = index?.points ?? [];
  const result = valueByComparables(args.target, toInputs(selection.comps), {
    index: points,
    asOfMonth: asOf,
    floorPremiumPerLevel: FLOOR_PREMIUM_PER_LEVEL,
    leaseValue: args.leaseValue,
    maxComparables: MAX_COMPARABLES_USED,
  });
  if (!result) {
    return { ok: false, status: 422, error: "not_enough_comparables", message: "The comparable sales could not be used for an estimate." };
  }
  const comparables: ValuationComparable[] = result.comparables.map((c) => {
    const meta = selection.comps[Number(c.label)];
    return {
      month: monthLabel(c.monthIndex),
      label: meta.label,
      href: meta.href,
      detail: meta.detail,
      distanceM: meta.distanceM,
      sameSite: meta.sameSite,
      areaSqm: Math.round(c.areaSqm * 10) / 10,
      price: c.price,
      psf: Math.round(c.psf),
      adjustedPsf: Math.round(c.adjustedPsf),
    };
  });
  const same = comparables.filter((c) => c.sameSite).length;
  const leaseAdjusted = Boolean(args.leaseValue) && result.comparables.some((c) => c.leaseFactor !== 1);
  const method = args.describe({ used: comparables.length, same, nearby: comparables.length - same, lookback: selection.lookbackMonths });
  // Say what the time adjustment actually did: the index can have no data near the latest month or near a sale's month,
  // in which case valueByComparables leaves that sale's price unadjusted.
  const indexNow = index ? indexAt(points, asOf) : null;
  const notTimeAdjusted = indexNow == null ? result.comparables.length : result.comparables.filter((c) => indexAt(points, c.monthIndex) == null).length;
  method.push(
    !index
      ? "No market index is available for this segment, so sale prices are not time-adjusted."
      : indexNow == null
        ? `The ${index.label} index has no sales near ${monthLabel(asOf)}, so sale prices are not time-adjusted.`
        : `Each sale's price per square foot is moved to ${monthLabel(asOf)} using the ${index.label} median psf index (3-month smoothed)${
            notTimeAdjusted > 0 ? `; ${plural(notTimeAdjusted, "sale")} with no index data near ${notTimeAdjusted === 1 ? "its" : "their"} month ${notTimeAdjusted === 1 ? "is" : "are"} left unadjusted` : ""
          }.`,
  );
  if (args.target.floor != null && args.kind !== "landed") {
    method.push(`Floor adjustment: ${pctText(FLOOR_PREMIUM_PER_LEVEL)} per level between each sale's floor mid-point and yours (a model assumption, not an official rate).`);
  }
  if (args.kind === "hdb") {
    method.push(
      leaseAdjusted
        ? `Remaining-lease differences are adjusted with Bala's Table (leasehold land value as a share of freehold, used here as a proxy for flats)${
            BALA_TABLE_STATUS.verified ? "" : `. ${BALA_TABLE_STATUS.label}`
          }.`
        : `Remaining-lease differences between sales are not adjusted for${args.target.leaseYears == null ? " (this block's lease start year is unknown)" : ""}.`,
    );
  }
  method.push(
    "Estimate = median adjusted psf × your area. The range is the 25th–75th percentile of adjusted psf. Up to 20 comparables are used, nearest and most recent first.",
    "Confidence reflects how many comparables were found, how many are from the same site and recent, and how closely they agree.",
    "This is an automated estimate from public transaction records, not a formal valuation by a licensed valuer.",
  );
  return {
    ok: true,
    valuation: {
      subject: { ref: formatPropertyRef(args.subject.ref), kind: args.kind, label: args.subject.label, href: args.subject.href },
      input: args.input,
      estimate: result.estimate,
      low: result.low,
      high: result.high,
      psf: result.psf,
      confidence: result.confidence,
      asOf: monthLabel(asOf),
      comparables: comparables.slice(0, COMPARABLES_SHOWN),
      comparablesUsed: comparables.length,
      comparablesFound: selection.comps.length,
      sameSiteCount: selection.sameSiteCount,
      lookbackMonths: selection.lookbackMonths,
      index: index ? { key: index.key, label: index.label } : null,
      leaseAdjusted,
      method,
      source: args.source,
    },
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function valueHdb(req: ValuationRequest): ValuationOutcome {
  const block = getHdbBlock(req.ref.slug);
  if (!block) return { ok: false, status: 404, error: "not_found", message: "That HDB block is not in our records." };
  const flatType = (req.flatType ?? "").toUpperCase().trim();
  const storeyMid = storeyRangeMid(req.storeyRange);
  if (!flatType) return { ok: false, status: 400, error: "invalid_input", message: "Choose a flat type." };
  if (storeyMid == null) return { ok: false, status: 400, error: "invalid_input", message: "Choose a storey range." };
  const asOf = latestMonth("hdb");
  if (asOf == null) return { ok: false, status: 422, error: "no_data", message: "HDB resale data is not loaded on this deployment." };
  const selection = selectHdbComparables(block, flatType, asOf);
  const index = firstSeries([`hdb:${block.town}:${flatType}`, `hdb:${block.town}:ALL`, `hdb:ALL:${flatType}`, `hdb:ALL:ALL`], asOf);
  const useLease = leaseAdjustmentAvailable() && block.leaseCommenceYear != null;
  return run({
    kind: "hdb",
    subject: { ref: { kind: "hdb", slug: block.slug }, label: hdbBlockLabel(block), href: `/hdb/${block.slug}/` },
    selection,
    target: {
      areaSqm: req.areaSqm,
      floor: storeyMid,
      // same convention as the sales' estimated remaining lease (99 years from the middle of the commencement year)
      leaseYears: block.leaseCommenceYear != null ? estimateRemainingLeaseMonths(block.leaseCommenceYear, asOf) / 12 : null,
    },
    index,
    asOf,
    leaseValue: useLease ? (y) => balaPct(y) : undefined,
    input: { flatType, storeyRange: req.storeyRange ?? null, floor: storeyMid, areaSqm: req.areaSqm },
    describe: ({ used, same, nearby, lookback }) => [
      `Comparables: ${plural(used, "resale")} of ${flatType} flats registered in the ${lookback} months to ${monthLabel(asOf)}: ${same} in this block${
        selection.widened ? (nearby > 0 ? ` and ${nearby} in other blocks within ${NEARBY_RADIUS_M / 1000} km` : `; no ${flatType} resales were found in other blocks within ${NEARBY_RADIUS_M / 1000} km`) : ""
      }.${selection.note ? ` ${selection.note}` : ""}`,
    ],
    source: "HDB resale flat prices, data.gov.sg",
  });
}

export function valueCondo(req: ValuationRequest): ValuationOutcome {
  const project = getProject(req.ref.slug);
  if (!project || project.isLanded) return { ok: false, status: 404, error: "not_found", message: "That condo project is not in our records." };
  const asOf = latestMonth("private");
  if (asOf == null) return { ok: false, status: 422, error: "no_data", message: "Private transaction data (URA) is not loaded on this deployment." };
  const selection = selectCondoComparables(project, asOf);
  const ec = isEcProject(project);
  const index = firstSeries([
    project.district != null ? `private-d:${project.district}:ALL` : "",
    project.segment ? `private:${project.segment}:${ec ? "EC" : "Condo"}` : "",
    `private:ALL:${ec ? "EC" : "Condo"}`,
    "private:ALL:ALL",
  ].filter(Boolean), asOf);
  const floor = req.floor != null && Number.isFinite(req.floor) ? req.floor : null;
  return run({
    kind: "condo",
    subject: { ref: { kind: "condo", slug: project.slug }, label: titleCase(project.name), href: `/condo/${project.slug}/` },
    selection,
    target: { areaSqm: req.areaSqm, floor },
    index,
    asOf,
    input: { flatType: null, storeyRange: null, floor, areaSqm: req.areaSqm },
    describe: ({ used, same, nearby, lookback }) => [
      `Comparables: ${plural(used, "sale")} (single-unit, non-landed) in the ${lookback} months to ${monthLabel(asOf)}: ${same} in this project${
        selection.widened
          ? nearby > 0
            ? ` and ${nearby} in other ${ec ? "executive condominiums" : "projects"} within ${NEARBY_RADIUS_M / 1000} km${project.segment ? ` (same ${project.segment} segment)` : ""}`
            : `; no sales were found in other ${ec ? "executive condominiums" : "projects"} within ${NEARBY_RADIUS_M / 1000} km${project.segment ? ` in the ${project.segment}` : ""}`
          : ""
      }.${selection.note ? ` ${selection.note}` : ""}`,
    ],
    source: "URA private residential transactions",
  });
}

export function valueLanded(req: ValuationRequest): ValuationOutcome {
  const subject = landedSubjectFor(req.ref);
  if (!subject) return { ok: false, status: 404, error: "not_found", message: "That landed address or street is not in our records." };
  const asOf = latestMonth("private");
  if (asOf == null) return { ok: false, status: 422, error: "no_data", message: "Private transaction data (URA) is not loaded on this deployment." };
  const selection = selectLandedComparables(subject, asOf);
  const typesText = subject.propertyTypes.length ? subject.propertyTypes.join(" / ").toLowerCase() : "landed";
  const basisText = landedAreaBasis(subject.propertyTypes) === "strata" ? "strata area" : "land area";
  const index = firstSeries([
    subject.segment ? `private:${subject.segment}:Landed` : "",
    "private:ALL:Landed",
    subject.district != null ? `private-d:${subject.district}:ALL` : "",
  ].filter(Boolean), asOf);
  return run({
    kind: "landed",
    subject: { ref: subject.ref, label: subject.label, href: subject.href },
    selection,
    target: { areaSqm: req.areaSqm, floor: null },
    index,
    asOf,
    input: { flatType: null, storeyRange: null, floor: null, areaSqm: req.areaSqm },
    describe: ({ used, same, nearby, lookback }) => [
      `Comparables: ${plural(used, "landed sale")} in the ${lookback} months to ${monthLabel(asOf)}: ${same} on ${titleCase(subject.street)}${
        selection.widened
          ? nearby > 0
            ? ` and ${nearby} ${typesText} sales elsewhere in District ${subject.district}`
            : `; no other ${typesText} sales were found in District ${subject.district}`
          : ""
      }. Prices are compared per square foot of ${basisText}.${selection.note ? ` ${selection.note}` : ""}`,
    ],
    source: "URA private residential transactions (landed)",
  });
}

/** Entry point used by the route handlers. */
export function estimateValuation(req: ValuationRequest): ValuationOutcome {
  if (!(req.areaSqm > 0) || req.areaSqm > 100_000) return { ok: false, status: 400, error: "invalid_input", message: "Enter a valid area." };
  switch (req.ref.kind) {
    case "hdb":
      return valueHdb(req);
    case "condo":
      return valueCondo(req);
    case "landed":
    case "landed-street":
      return valueLanded(req);
    case "launch": {
      return { ok: false, status: 400, error: "invalid_input", message: "New launches are valued from their condo project page once resale records exist." };
    }
  }
}
