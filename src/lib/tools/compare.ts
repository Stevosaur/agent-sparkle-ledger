import "server-only";
import { getBlockTransactions, getHdbBlock } from "@/lib/data/hdb";
import {
  getLandedAddress,
  getLandedAddressTransactions,
  getLandedStreet,
  getLandedStreetTransactions,
  getLaunches,
  getProject,
  getProjectTransactions,
} from "@/lib/data/private";
import { getSeries } from "@/lib/data/stats";
import { getMeta } from "@/lib/data/meta";
import { monthIndex } from "@/lib/data/months";
import { resolveProperty } from "@/lib/data/resolve";
import type { HdbTransaction, NearbyStation, NewLaunch, PrivateProject, PrivateTransaction, StatSeries, Tenure, TxSummary } from "@/lib/data/types";
import { seriesGrowth, grossYield } from "@/lib/calc/returns";
import { remainingLeaseYears } from "@/lib/calc/lease";
import { median } from "@/lib/stats-math";
import { formatPropertyRef, type PropertyKind, type PropertyRef } from "@/lib/property-ref";
import { titleCase } from "@/lib/slug";
import { isEcProject } from "./fit";

/**
 * Side-by-side metrics for /compare/ and recent sales / psf points for /compare-units/.
 * Everything is aggregated here on the server; pages only receive the small result objects.
 */

export interface CompareColumn {
  ref: string;
  kind: PropertyKind;
  label: string;
  href: string;
  type: string;
  location: string;
  tenure: string | null;
  lastSale: { month: string; price: number } | null;
  medianPsf12m: number | null;
  medianPrice12m: number | null;
  sales12m: number | null;
  medianRent12m: number | null;
  grossYield: number | null;
  nearestMrt: { name: string; distanceM: number } | null;
  growth5y: { total: number; cagr: number; seriesLabel: string } | null;
  /** label of the series used for growth (also when there was not enough history) */
  growthSeries: string | null;
  /** what is missing, e.g. "No sales recorded" */
  notes: string[];
}

export interface SaleRow {
  month: string;
  monthIndex: number;
  detail: string;
  areaSqm: number;
  price: number;
  psf: number;
}

/** Month index of the dataset's latest month for a family (falls back to the newest sale seen). */
function latestIndex(kind: "hdb" | "private"): number | null {
  const label = getMeta().latestMonth[kind];
  if (!label) return null;
  try {
    return monthIndex(label);
  } catch {
    return null;
  }
}

function fractionalYearNow(): number {
  const d = new Date();
  return d.getUTCFullYear() + d.getUTCMonth() / 12;
}

function tenureText(t: Tenure | null): string | null {
  if (!t) return null;
  if (t.kind === "freehold") return "Freehold";
  if (t.years && t.startYear) {
    const left = Math.max(0, Math.floor(remainingLeaseYears(t.startYear, fractionalYearNow(), t.years)));
    return `${t.years}-year lease from ${t.startYear} (about ${left} years left)`;
  }
  return t.raw;
}

function mrt(n: NearbyStation | null): CompareColumn["nearestMrt"] {
  return n ? { name: titleCase(n.name), distanceM: n.distanceM } : null;
}

function growthFrom(series: StatSeries | null): { growth: CompareColumn["growth5y"]; label: string | null } {
  if (!series) return { growth: null, label: null };
  const g = seriesGrowth(
    series.points.filter((p) => p.medianPsf > 0).map((p) => ({ m: p.m, value: p.medianPsf })),
    5,
  );
  if (!g || !Number.isFinite(g.cagr)) return { growth: null, label: series.label };
  return { growth: { total: g.to / g.from - 1, cagr: g.cagr, seriesLabel: series.label }, label: series.label };
}

function firstSeries(keys: (string | null)[]): StatSeries | null {
  for (const k of keys) {
    if (!k) continue;
    const s = getSeries(k);
    if (s && s.points.length) return s;
  }
  return null;
}

function lastSale(tx: TxSummary): CompareColumn["lastSale"] {
  return tx.last && tx.lastPrice != null ? { month: tx.last, price: tx.lastPrice } : null;
}

function median12m<T extends { monthIndex: number; price: number }>(rows: T[], latest: number | null): number | null {
  if (latest == null) return null;
  const xs = rows.filter((r) => r.monthIndex > latest - 12 && r.monthIndex <= latest).map((r) => r.price);
  return xs.length ? Math.round(median(xs)) : null;
}

function yieldOf(rent: number | null, price: number | null): number | null {
  if (rent == null || price == null) return null;
  const y = grossYield(rent, price);
  return Number.isFinite(y) ? y : null;
}

function singleUnit(t: PrivateTransaction): boolean {
  return t.units === 1 && t.price > 0;
}

function projectColumn(base: Pick<CompareColumn, "ref" | "kind" | "label" | "href">, p: PrivateProject, typeOverride?: string): CompareColumn {
  const latest = latestIndex("private");
  const ec = isEcProject(p);
  const medianPrice = median12m(getProjectTransactions(p.slug).filter(singleUnit), latest);
  const rent = p.rentals?.medianRent12m ?? null;
  const series = firstSeries([p.district != null ? `private-d:${p.district}:NonLanded` : null, p.district != null ? `private-d:${p.district}:ALL` : null, p.segment ? `private:${p.segment}:ALL` : null]);
  const { growth, label } = growthFrom(series);
  const notes: string[] = [];
  if (p.tx.count === 0) notes.push("No sales recorded");
  if (!p.rentals) notes.push("No rental records");
  return {
    ...base,
    type: typeOverride ?? (ec ? "Executive condominium" : p.propertyTypes.join(", ") || "Condominium"),
    location: [p.district != null ? `D${p.district}` : null, p.segment, titleCase(p.street)].filter(Boolean).join(" · "),
    tenure: tenureText(p.tenure),
    lastSale: lastSale(p.tx),
    medianPsf12m: p.tx.medianPsf12m,
    medianPrice12m: medianPrice,
    sales12m: p.tx.count12m,
    medianRent12m: rent,
    grossYield: yieldOf(rent, medianPrice),
    nearestMrt: mrt(p.nearestMrt),
    growth5y: growth,
    growthSeries: label,
    notes,
  };
}

function launchFor(ref: PropertyRef): NewLaunch | null {
  return getLaunches().find((x) => x.slug === ref.slug && (!ref.launchType || x.type === ref.launchType)) ?? null;
}

/** Comparison metrics for one property; null when the ref does not exist. */
export function compareColumn(ref: PropertyRef): CompareColumn | null {
  const resolved = resolveProperty(ref);
  if (!resolved) return null;
  const base = { ref: formatPropertyRef(resolved.ref), kind: ref.kind, label: resolved.label, href: resolved.href };
  switch (ref.kind) {
    case "hdb": {
      const b = getHdbBlock(ref.slug)!;
      const latest = latestIndex("hdb");
      const tx = getBlockTransactions(ref.slug);
      const medianPrice = median12m(tx, latest);
      const rent = b.rentals?.medianRent12m ?? null;
      const { growth, label } = growthFrom(firstSeries([`hdb:${b.town}:ALL`]));
      const notes: string[] = [];
      if (b.tx.count === 0) notes.push("No resales recorded yet");
      if (!b.rentals) notes.push("No rental approvals recorded");
      let tenure: string | null = null;
      if (b.leaseCommenceYear) {
        const left = Math.max(0, Math.floor(remainingLeaseYears(b.leaseCommenceYear, fractionalYearNow())));
        tenure = `99-year lease from ${b.leaseCommenceYear} (about ${left} years left)`;
      } else if (b.yearCompleted) tenure = `99-year lease (completed ${b.yearCompleted})`;
      return {
        ...base,
        type: "HDB flat",
        location: `${titleCase(b.town)}${b.postal ? ` · S${b.postal}` : ""}`,
        tenure,
        lastSale: lastSale(b.tx),
        medianPsf12m: b.tx.medianPsf12m,
        medianPrice12m: medianPrice,
        sales12m: b.tx.count12m,
        medianRent12m: rent,
        grossYield: yieldOf(rent, medianPrice),
        nearestMrt: mrt(b.nearestMrt),
        growth5y: growth,
        growthSeries: label,
        notes,
      };
    }
    case "condo":
      return projectColumn(base, getProject(ref.slug)!);
    case "landed": {
      const a = getLandedAddress(ref.slug)!;
      const latest = latestIndex("private");
      const tx = getLandedAddressTransactions(ref.slug).filter(singleUnit);
      const series = firstSeries([a.segment ? `private:${a.segment}:Landed` : null, "private:ALL:Landed"]);
      const { growth, label } = growthFrom(series);
      const street = getLandedStreet(a.streetSlug);
      const project = street?.projects.map((s) => getProject(s)).find(Boolean) ?? null;
      const rent = project?.rentals?.medianRent12m ?? null;
      const medianPrice = median12m(tx, latest);
      return {
        ...base,
        type: a.propertyType ? `Landed · ${a.propertyType}` : "Landed",
        location: [a.district != null ? `D${a.district}` : null, a.segment, titleCase(a.street)].filter(Boolean).join(" · "),
        tenure: tenureText(a.tenure),
        lastSale: lastSale(a.tx),
        medianPsf12m: a.tx.medianPsf12m,
        medianPrice12m: medianPrice,
        sales12m: a.tx.count12m,
        medianRent12m: rent,
        grossYield: yieldOf(rent, medianPrice),
        nearestMrt: mrt(project?.nearestMrt ?? null),
        growth5y: growth,
        growthSeries: label,
        notes: rent == null ? ["No rental records for this street"] : ["Rent is the street-level median"],
      };
    }
    case "landed-street": {
      const s = getLandedStreet(ref.slug)!;
      const latest = latestIndex("private");
      const tx = getLandedStreetTransactions(ref.slug).filter(singleUnit);
      const series = firstSeries([s.segment ? `private:${s.segment}:Landed` : null, "private:ALL:Landed"]);
      const { growth, label } = growthFrom(series);
      const project = s.projects.map((x) => getProject(x)).find(Boolean) ?? null;
      const rent = project?.rentals?.medianRent12m ?? null;
      const medianPrice = median12m(tx, latest);
      return {
        ...base,
        type: `Landed street${s.propertyTypes.length ? ` · ${s.propertyTypes.join(", ")}` : ""}`,
        location: [s.district != null ? `D${s.district}` : null, s.segment].filter(Boolean).join(" · "),
        tenure: s.tenures.join(", ") || null,
        lastSale: lastSale(s.tx),
        medianPsf12m: s.tx.medianPsf12m,
        medianPrice12m: medianPrice,
        sales12m: s.tx.count12m,
        medianRent12m: rent,
        grossYield: yieldOf(rent, medianPrice),
        nearestMrt: mrt(project?.nearestMrt ?? null),
        growth5y: growth,
        growthSeries: label,
        notes: rent == null ? ["No rental records for this street"] : [],
      };
    }
    case "launch": {
      const l = launchFor(ref)!;
      const typeLabel = `New launch (${l.status === "upcoming" ? "upcoming" : "launched"}${l.type === "ec" ? ", EC" : l.type === "landed" ? ", landed" : ""})`;
      const p = l.projectSlug ? getProject(l.projectSlug) : null;
      if (p) return { ...projectColumn(base, p, typeLabel), tenure: tenureText(l.tenure) ?? tenureText(p.tenure) };
      const series = firstSeries([l.district != null ? `private-d:${l.district}:${l.type === "landed" ? "Landed" : "NonLanded"}` : null, l.district != null ? `private-d:${l.district}:ALL` : null, l.segment ? `private:${l.segment}:ALL` : null]);
      const { growth, label } = growthFrom(series);
      return {
        ...base,
        type: typeLabel,
        location: [l.district != null ? `D${l.district}` : null, l.segment, l.street ? titleCase(l.street) : null].filter(Boolean).join(" · "),
        tenure: tenureText(l.tenure),
        lastSale: null,
        medianPsf12m: null,
        medianPrice12m: null,
        sales12m: null,
        medianRent12m: null,
        grossYield: null,
        nearestMrt: mrt(l.nearestMrt),
        growth5y: growth,
        growthSeries: label,
        notes: ["No caveated sales yet"],
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Sales for /compare-units/                                           */
/* ------------------------------------------------------------------ */

function hdbRow(t: HdbTransaction): SaleRow {
  return { month: t.month, monthIndex: t.monthIndex, detail: `${t.flatType} · ${t.storeyRange}`, areaSqm: t.floorAreaSqm, price: t.price, psf: t.psf };
}

function privateRow(t: PrivateTransaction): SaleRow {
  const where = t.address ? titleCase(t.address) : t.floorRange && t.floorRange !== "-" ? `Floor ${t.floorRange}` : t.propertyType;
  return { month: t.month, monthIndex: t.monthIndex, detail: `${where} · ${t.typeOfSale}`, areaSqm: t.areaSqm, price: t.price, psf: t.psf };
}

/** All usable sales for a property, newest first (server-side only; callers must cap what they send). */
function allSales(ref: PropertyRef): SaleRow[] {
  switch (ref.kind) {
    case "hdb":
      return getBlockTransactions(ref.slug).map(hdbRow);
    case "condo":
      return getProjectTransactions(ref.slug).filter(singleUnit).map(privateRow);
    case "landed":
      return getLandedAddressTransactions(ref.slug).filter(singleUnit).map(privateRow);
    case "landed-street":
      return getLandedStreetTransactions(ref.slug).filter(singleUnit).map(privateRow);
    case "launch": {
      const l = launchFor(ref);
      return l?.projectSlug ? getProjectTransactions(l.projectSlug).filter(singleUnit).map(privateRow) : [];
    }
  }
}

export const PSF_POINTS_CAP = 400;
export const PSF_LOOKBACK_MONTHS = 60;

/** Latest `limit` sales plus psf points (last 5 years, capped) for the chart. */
export function salesForUnits(ref: PropertyRef, limit = 10): { recent: SaleRow[]; points: { x: number; y: number }[]; total: number } {
  const rows = allSales(ref);
  const newest = rows[0]?.monthIndex ?? 0;
  const points = rows
    .filter((r) => r.monthIndex > newest - PSF_LOOKBACK_MONTHS && r.psf > 0)
    .slice(0, PSF_POINTS_CAP)
    .map((r) => ({ x: r.monthIndex, y: r.psf }))
    .reverse();
  return { recent: rows.slice(0, limit), points, total: rows.length };
}
