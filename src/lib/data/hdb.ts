import "server-only";
import { Lru, readJson } from "./store";
import { monthLabel } from "./months";
import { haversineM } from "./geo";
import { SQFT_PER_SQM } from "@/lib/format";
import type { HdbBlock, HdbRental, HdbRentFile, HdbTransaction, HdbTxFile, LatLng, TownSummary } from "./types";

/* ------------------------------------------------------------------ */
/* Blocks & towns                                                      */
/* ------------------------------------------------------------------ */

let blockIndex: Map<string, HdbBlock> | null = null;

export function getHdbBlocks(): HdbBlock[] {
  return readJson<HdbBlock[]>("hdb/blocks.json", []);
}

export function getHdbBlock(slug: string): HdbBlock | null {
  if (!blockIndex) blockIndex = new Map(getHdbBlocks().map((b) => [b.slug, b]));
  return blockIndex.get(slug) ?? null;
}

export function getTowns(): TownSummary[] {
  return readJson<TownSummary[]>("hdb/towns.json", []);
}

export function getTown(slug: string): TownSummary | null {
  return getTowns().find((t) => t.slug === slug) ?? null;
}

export function getBlocksInTown(townSlug: string): HdbBlock[] {
  return getHdbBlocks().filter((b) => b.townSlug === townSlug);
}

/** Blocks within radiusM of a point (excluding `excludeSlug`), nearest first. */
export function getNearbyBlocks(from: LatLng, radiusM: number, excludeSlug?: string, limit = 20): (HdbBlock & { distanceM: number })[] {
  const out: (HdbBlock & { distanceM: number })[] = [];
  for (const b of getHdbBlocks()) {
    if (b.slug === excludeSlug || b.lat == null || b.lng == null) continue;
    // cheap bounding-box reject before haversine (1 deg lat ~ 111 km)
    if (Math.abs(b.lat - from.lat) > radiusM / 111_000 + 0.001 || Math.abs(b.lng - from.lng) > radiusM / 111_000 + 0.001) continue;
    const d = haversineM(from, { lat: b.lat, lng: b.lng });
    if (d <= radiusM) out.push({ ...b, distanceM: Math.round(d) });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

/** "04 TO 06" -> 5; "10 TO 12" -> 11; unknown -> NaN */
export function storeyMid(range: string): number {
  const m = /(\d+)\s*TO\s*(\d+)/i.exec(range);
  if (!m) return Number.NaN;
  return (Number(m[1]) + Number(m[2])) / 2;
}

/**
 * Remaining lease estimate (months) when HDB did not publish it: 99-year lease assumed to start mid-year
 * of the lease commencement year, measured to the middle of the sale month.
 */
export function estimateRemainingLeaseMonths(leaseCommenceYear: number, saleMonthIndex: number): number {
  const leaseStartMonthIndex = (leaseCommenceYear - 1990) * 12 + 6;
  return Math.max(0, 99 * 12 - (saleMonthIndex - leaseStartMonthIndex));
}

const townTxCache = new Lru<string, HdbTransaction[]>(6);

export function readHdbTxFile(townSlug: string): HdbTxFile | null {
  return readJson<HdbTxFile | null>(`hdb/tx/${townSlug}.json`, null);
}

/** All resale transactions in a town, newest first. */
export function getTownTransactions(townSlug: string): HdbTransaction[] {
  const hit = townTxCache.get(townSlug);
  if (hit) return hit;
  const file = readHdbTxFile(townSlug);
  if (!file) return [];
  const leaseYearBySlug = new Map<string, number | null>();
  for (const slug of file.blocks) leaseYearBySlug.set(slug, getHdbBlock(slug)?.leaseCommenceYear ?? null);
  const out: HdbTransaction[] = new Array(file.m.length);
  for (let i = 0; i < file.m.length; i++) {
    const blockSlug = file.blocks[file.b[i]];
    const storeyRange = file.storeys[file.s[i]];
    const sqm = file.a[i] / 10;
    const sqft = sqm * SQFT_PER_SQM;
    const leaseYear = leaseYearBySlug.get(blockSlug) ?? null;
    const published = file.rl[i] >= 0 ? file.rl[i] : null;
    const remaining = published ?? (leaseYear != null ? estimateRemainingLeaseMonths(leaseYear, file.m[i]) : null);
    out[i] = {
      month: monthLabel(file.m[i]),
      monthIndex: file.m[i],
      blockSlug,
      town: file.town,
      flatType: file.flatTypes[file.t[i]],
      storeyRange,
      storeyMid: storeyMid(storeyRange),
      floorAreaSqm: sqm,
      floorAreaSqft: Math.round(sqft),
      price: file.p[i],
      psf: sqft > 0 ? Math.round(file.p[i] / sqft) : 0,
      flatModel: file.models[file.md[i]],
      remainingLeaseMonths: remaining,
      remainingLeaseEstimated: published == null && remaining != null,
    };
  }
  out.sort((x, y) => y.monthIndex - x.monthIndex);
  townTxCache.set(townSlug, out);
  return out;
}

/** All resale transactions for one block, newest first. */
export function getBlockTransactions(slug: string): HdbTransaction[] {
  const block = getHdbBlock(slug);
  if (!block) return [];
  return getTownTransactions(block.townSlug).filter((t) => t.blockSlug === slug);
}

/* ------------------------------------------------------------------ */
/* Rentals                                                             */
/* ------------------------------------------------------------------ */

const townRentCache = new Lru<string, HdbRental[]>(6);

export function getTownRentals(townSlug: string): HdbRental[] {
  const hit = townRentCache.get(townSlug);
  if (hit) return hit;
  const file = readJson<HdbRentFile | null>(`hdb/rentals/${townSlug}.json`, null);
  if (!file) return [];
  const out: HdbRental[] = new Array(file.m.length);
  for (let i = 0; i < file.m.length; i++) {
    out[i] = {
      month: monthLabel(file.m[i]),
      monthIndex: file.m[i],
      blockSlug: file.blocks[file.b[i]],
      town: file.town,
      flatType: file.flatTypes[file.t[i]],
      monthlyRent: file.r[i],
    };
  }
  out.sort((x, y) => y.monthIndex - x.monthIndex);
  townRentCache.set(townSlug, out);
  return out;
}

export function getBlockRentals(slug: string): HdbRental[] {
  const block = getHdbBlock(slug);
  if (!block) return [];
  return getTownRentals(block.townSlug).filter((r) => r.blockSlug === slug);
}
