import "server-only";
import { getBlockTransactions, getHdbBlock, getTownTransactions } from "@/lib/data/hdb";
import { getLandedAddress, getLandedAddressTransactions, getLandedStreet, getLandedStreetTransactions, getLaunches, getProject, getProjectTransactions, LANDED_TYPES } from "@/lib/data/private";
import { search } from "@/lib/data/search";
import { HDB_FLAT_TYPES, type SearchKind } from "@/lib/data/types";
import { median } from "@/lib/stats-math";
import { formatPropertyRef, parsePropertyRef, type PropertyRef } from "@/lib/property-ref";
import { hdbBlockSlug, landedAddressSlug, landedStreetSlug, projectSlug, titleCase } from "@/lib/slug";
import { refFromHref } from "./refs";
import type { ValuationKind } from "@/lib/valuation-service";

/**
 * Free (non-gated) facts the valuation form needs to prefill itself: flat types with typical areas,
 * storey bands, typical unit / land sizes. Aggregated here so no transaction arrays reach the browser.
 */

export interface HdbFlatTypeOption {
  flatType: string;
  /** median floor area of this flat type's resales in the block (or the town when the block has none) */
  typicalAreaSqm: number | null;
  typicalAreaFrom: "block" | "town" | null;
  sales: number;
}

export interface ValuationSubject {
  ref: string;
  kind: ValuationKind;
  label: string;
  href: string;
  /** short description line, e.g. "Tampines · lease from 2015 · 15 storeys" */
  detail: string;
  hdb?: { flatTypes: HdbFlatTypeOption[]; storeyRanges: string[]; defaultStoreyRange: string | null };
  condo?: { typicalAreaSqm: number | null; typicalFloor: number | null; maxFloor: number | null; sales: number };
  landed?: { landAreaSqm: number | null; landAreaFrom: "address" | "street" | null; propertyType: string | null; sales: number };
}

export const VALUATION_SEARCH_KINDS: Record<ValuationKind, SearchKind[]> = {
  hdb: ["hdb"],
  condo: ["condo"],
  landed: ["landed", "landed-street"],
};

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** 3-storey bands as HDB publishes them ("01 TO 03", "04 TO 06", ...), up to the block's top floor. */
export function storeyBands(maxFloor: number | null): string[] {
  const top = maxFloor && maxFloor > 0 ? Math.min(maxFloor, 60) : 51;
  const out: string[] = [];
  for (let lo = 1; lo <= top; lo += 3) out.push(`${String(lo).padStart(2, "0")} TO ${String(lo + 2).padStart(2, "0")}`);
  return out;
}

function hdbSubject(slug: string): ValuationSubject | null {
  const b = getHdbBlock(slug);
  if (!b) return null;
  const tx = getBlockTransactions(slug);
  const types = new Set<string>([...Object.keys(b.unitMix ?? {}), ...tx.map((t) => t.flatType)]);
  let townTx: ReturnType<typeof getTownTransactions> | null = null;
  const flatTypes: HdbFlatTypeOption[] = [];
  for (const ft of [...types].sort((x, y) => idx(x) - idx(y))) {
    const own = tx.filter((t) => t.flatType === ft);
    // prefer the last 10 years of the block's own sales; fall back to all of them, then to the town
    const recent = own.filter((t) => t.monthIndex >= (own[0]?.monthIndex ?? 0) - 120);
    let typical: number | null = recent.length ? round1(median(recent.map((t) => t.floorAreaSqm))) : null;
    let from: HdbFlatTypeOption["typicalAreaFrom"] = typical != null ? "block" : null;
    if (typical == null) {
      townTx ??= getTownTransactions(b.townSlug);
      const latest = townTx[0]?.monthIndex ?? 0;
      const town = townTx.filter((t) => t.flatType === ft && t.monthIndex > latest - 60);
      if (town.length) {
        typical = round1(median(town.map((t) => t.floorAreaSqm)));
        from = "town";
      }
    }
    flatTypes.push({ flatType: ft, typicalAreaSqm: typical, typicalAreaFrom: from, sales: own.length });
  }
  const topFromSales = tx.reduce((m, t) => (Number.isFinite(t.storeyMid) ? Math.max(m, t.storeyMid + 1) : m), 0);
  const bands = storeyBands(b.maxFloor ?? (topFromSales || null));
  const mid = b.maxFloor ? Math.ceil(b.maxFloor / 2) : null;
  const defaultBand = mid ? (bands.find((r) => Number(r.slice(0, 2)) <= mid && Number(r.slice(-2)) >= mid) ?? bands[0]) : (bands[0] ?? null);
  const bits = [titleCase(b.town)];
  if (b.leaseCommenceYear) bits.push(`lease from ${b.leaseCommenceYear}`);
  if (b.maxFloor) bits.push(`${b.maxFloor} storeys`);
  return {
    ref: formatPropertyRef({ kind: "hdb", slug }),
    kind: "hdb",
    label: `Blk ${b.block} ${titleCase(b.street)}`,
    href: `/hdb/${slug}/`,
    detail: bits.join(" · "),
    hdb: { flatTypes, storeyRanges: bands, defaultStoreyRange: defaultBand },
  };
}

function idx(ft: string): number {
  const i = (HDB_FLAT_TYPES as readonly string[]).indexOf(ft);
  return i < 0 ? 99 : i;
}

function condoSubject(slug: string): ValuationSubject | null {
  const p = getProject(slug);
  if (!p || p.isLanded) return null;
  const tx = getProjectTransactions(slug).filter((t) => t.units === 1 && t.areaSqm > 0 && !LANDED_TYPES.has(t.propertyType));
  const recent = tx.slice(0, 60);
  const floors = tx.map((t) => t.floorMid).filter((f): f is number => f != null);
  const recentFloors = recent.map((t) => t.floorMid).filter((f): f is number => f != null);
  const bits = [p.district != null ? `D${p.district}` : null, p.segment, p.tenure?.raw ?? null].filter(Boolean) as string[];
  return {
    ref: formatPropertyRef({ kind: "condo", slug }),
    kind: "condo",
    label: titleCase(p.name),
    href: `/condo/${slug}/`,
    detail: bits.join(" · "),
    condo: {
      typicalAreaSqm: recent.length ? round1(median(recent.map((t) => t.areaSqm))) : null,
      typicalFloor: recentFloors.length ? Math.round(median(recentFloors)) : null,
      maxFloor: floors.length ? Math.max(...floors.map((f) => Math.ceil(f + 2))) : null,
      sales: tx.length,
    },
  };
}

function landedSubject(ref: PropertyRef): ValuationSubject | null {
  if (ref.kind === "landed") {
    const a = getLandedAddress(ref.slug);
    if (!a) return null;
    const tx = getLandedAddressTransactions(ref.slug);
    const bits = [a.propertyType, a.district != null ? `D${a.district}` : null, a.tenure?.raw ?? null].filter(Boolean) as string[];
    return {
      ref: formatPropertyRef(ref),
      kind: "landed",
      label: titleCase(a.address),
      href: `/landed/${a.slug}/`,
      detail: bits.join(" · "),
      landed: { landAreaSqm: a.landAreaSqm, landAreaFrom: a.landAreaSqm != null ? "address" : null, propertyType: a.propertyType, sales: tx.length },
    };
  }
  if (ref.kind === "landed-street") {
    const s = getLandedStreet(ref.slug);
    if (!s) return null;
    const tx = getLandedStreetTransactions(ref.slug).filter((t) => t.units === 1 && t.areaSqm > 0);
    const recent = tx.slice(0, 30);
    const bits = ["Landed street", s.district != null ? `D${s.district}` : null, s.propertyTypes.join(", ") || null].filter(Boolean) as string[];
    return {
      ref: formatPropertyRef(ref),
      kind: "landed",
      label: titleCase(s.street),
      href: `/landed-street/${s.slug}/`,
      detail: bits.join(" · "),
      landed: {
        landAreaSqm: recent.length ? round1(median(recent.map((t) => t.areaSqm))) : null,
        landAreaFrom: recent.length ? "street" : null,
        propertyType: s.propertyTypes.length === 1 ? s.propertyTypes[0] : null,
        sales: tx.length,
      },
    };
  }
  return null;
}

/** Valuation subject for a property ref; launches map to their condo project when one exists. */
export function getValuationSubject(ref: PropertyRef): ValuationSubject | null {
  switch (ref.kind) {
    case "hdb":
      return hdbSubject(ref.slug);
    case "condo":
      return condoSubject(ref.slug);
    case "landed":
    case "landed-street":
      return landedSubject(ref);
    case "launch": {
      const l = getLaunches().find((x) => x.slug === ref.slug && (!ref.launchType || x.type === ref.launchType));
      return l?.projectSlug ? condoSubject(l.projectSlug) : null;
    }
  }
}

function norm(s: string | undefined): string {
  return (s ?? "").replace(/\+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function firstRefFromSearch(q: string, kinds: SearchKind[]): PropertyRef | null {
  if (!q) return null;
  const hits = search(q, { limit: 5, kinds });
  const exact = hits.find((h) => h.label.toLowerCase() === q.toLowerCase());
  const hit = exact ?? hits[0];
  return hit ? refFromHref(hit.href) : null;
}

export interface ValuationDeepLink {
  type: ValuationKind;
  subject: ValuationSubject | null;
  /** human description of a deep link that could not be resolved */
  unresolved: string | null;
}

/**
 * Resolve the /valuation/ query string:
 *   ?ref=hdb:blk-872a-tampines-st-86
 *   ?type=hdb&block=872A&street=TAMPINES+ST+86   (or &postal=521872)
 *   ?type=condo&project=THE+HILLFORD
 *   ?type=landed&address=13+HAIG+LANE   |   ?type=landed&street=HAIG+LANE
 */
export function resolveValuationDeepLink(params: Record<string, string | undefined>): ValuationDeepLink {
  const typeParam = (params.type ?? "").toLowerCase();
  let type: ValuationKind = typeParam === "condo" ? "condo" : typeParam === "landed" ? "landed" : "hdb";

  if (params.ref) {
    const ref = parsePropertyRef(params.ref);
    const subject = ref ? getValuationSubject(ref) : null;
    if (subject) return { type: subject.kind, subject, unresolved: null };
    if (ref) type = ref.kind === "condo" || ref.kind === "launch" ? "condo" : ref.kind === "hdb" ? "hdb" : "landed";
    return { type, subject: null, unresolved: norm(params.ref) };
  }

  let ref: PropertyRef | null = null;
  let asked = "";
  if (type === "hdb") {
    const block = norm(params.block).toUpperCase();
    const street = norm(params.street).toUpperCase();
    const postal = norm(params.postal);
    if (block && street) {
      asked = `Blk ${block} ${street}`;
      const slug = hdbBlockSlug(block, street);
      ref = getHdbBlock(slug) ? { kind: "hdb", slug } : firstRefFromSearch(`${block} ${street}`, VALUATION_SEARCH_KINDS.hdb);
    } else if (/^\d{6}$/.test(postal)) {
      asked = postal;
      ref = firstRefFromSearch(postal, VALUATION_SEARCH_KINDS.hdb);
    }
  } else if (type === "condo") {
    const name = norm(params.project);
    if (name) {
      asked = name;
      const slug = projectSlug(name);
      const p = getProject(slug);
      ref = p && !p.isLanded ? { kind: "condo", slug } : firstRefFromSearch(name, VALUATION_SEARCH_KINDS.condo);
    }
  } else {
    const address = norm(params.address).toUpperCase();
    const street = norm(params.street).toUpperCase();
    if (address) {
      asked = address;
      const m = /^(\S+)\s+(.+)$/.exec(address);
      const slug = m ? landedAddressSlug(m[1], m[2]) : null;
      ref = slug && getLandedAddress(slug) ? { kind: "landed", slug } : firstRefFromSearch(address, ["landed"]);
    } else if (street) {
      asked = street;
      const slug = landedStreetSlug(street);
      ref = getLandedStreet(slug) ? { kind: "landed-street", slug } : firstRefFromSearch(street, ["landed-street"]);
    }
  }
  if (!asked) return { type, subject: null, unresolved: null };
  const subject = ref ? getValuationSubject(ref) : null;
  return { type: subject?.kind ?? type, subject, unresolved: subject ? null : asked };
}
