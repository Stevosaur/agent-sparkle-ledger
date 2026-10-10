import "server-only";
import { estimateRemainingLeaseMonths, getHdbBlock, getTownRentals, getTowns, readHdbTxFile, storeyMid } from "@/lib/data/hdb";
import { getMeta } from "@/lib/data/meta";
import { monthLabel, yearOfMonth } from "@/lib/data/months";
import { getSeries } from "@/lib/data/stats";
import { anchorMonth } from "@/lib/home-insights";
import { SQFT_PER_SQM } from "@/lib/format";
import { median } from "@/lib/stats-math";
import { comparisonWindows, inWindow, LEASE_BANDS, leaseBand, STOREY_BANDS, storeyBand, upsert, WindowAcc, type MonthWindow } from "./math";
import { memoBySnapshot } from "./memo";
import type { WindowStat } from "./types";

/**
 * One pass over every HDB resale file (columnar, never decoded into objects) producing the compact
 * aggregates used by rankings, insights modules, town pages and the market report. Only medians and
 * counts are kept, so the memoised result stays small even with ~1M records.
 */

export interface HdbBlockStats {
  slug: string;
  townSlug: string;
  all: { cur: WindowStat; prev5y: WindowStat };
  byType: Record<string, { cur: WindowStat; prev5y: WindowStat }>;
}

export interface HdbTownStats {
  slug: string;
  town: string;
  region: string;
  cur: WindowStat;
  prev12: WindowStat;
  prev5y: WindowStat;
  byType: Record<string, { cur: WindowStat; prev12: WindowStat }>;
}

export interface HdbSalesScan {
  latestMonth: number | null;
  windows: { cur: MonthWindow; prev12: MonthWindow; prev5y: MonthWindow } | null;
  national: { cur: WindowStat; prev12: WindowStat; prev5y: WindowStat; byType: Record<string, { cur: WindowStat; prev12: WindowStat }> };
  towns: HdbTownStats[];
  blocks: Map<string, HdbBlockStats>;
  regions: { region: string; cur: WindowStat; prev5y: WindowStat }[];
  /** every calendar year with sales: total count and resales at or above S$1,000,000 */
  yearly: { year: number; count: number; million: number }[];
  leaseBands: { id: string; label: string; stat: WindowStat }[];
  storeyBands: { id: string; label: string; stat: WindowStat }[];
  /** records whose remaining lease had to be estimated from the lease commencement year (cur window) */
  leaseEstimated12m: number;
}

const EMPTY: WindowStat = { count: 0, medianPrice: null, medianPsf: null };

/**
 * The last COMPLETE month of HDB resales, the end of every window here (and so of rankings, insights modules and the
 * market report). Same anchor as the home page's market pulse: the month the snapshot was generated in is still
 * receiving records, so it is skipped (see `anchorMonth`).
 */
function latestHdbMonth(): number | null {
  const meta = getMeta();
  const generatedAt = meta.generatedAt || null;
  const anchored = anchorMonth(meta.latestMonth.hdb, generatedAt, getSeries("hdb:ALL:ALL"));
  if (anchored != null) return anchored;
  // no usable meta month or national series: derive the latest month from the files
  let max = -1;
  for (const t of getTowns()) {
    const f = readHdbTxFile(t.slug);
    if (!f) continue;
    for (const m of f.m) if (m > max) max = m;
  }
  return max >= 0 ? anchorMonth(monthLabel(max), generatedAt, null) : null;
}

export function getHdbSalesScan(): HdbSalesScan {
  return memoBySnapshot("hdb-sales-scan", computeHdbSalesScan);
}

function computeHdbSalesScan(): HdbSalesScan {
  const latest = latestHdbMonth();
  const towns = getTowns();
  const yearlyMap = new Map<number, { count: number; million: number }>();
  if (latest == null) {
    return {
      latestMonth: null,
      windows: null,
      national: { cur: EMPTY, prev12: EMPTY, prev5y: EMPTY, byType: {} },
      towns: [],
      blocks: new Map(),
      regions: [],
      yearly: [],
      leaseBands: [],
      storeyBands: [],
      leaseEstimated12m: 0,
    };
  }
  const w = comparisonWindows(latest);

  const nat = { cur: new WindowAcc(), prev12: new WindowAcc(), prev5y: new WindowAcc() };
  const natType = new Map<string, { cur: WindowAcc; prev12: WindowAcc }>();
  const regionAcc = new Map<string, { cur: WindowAcc; prev5y: WindowAcc }>();
  const leaseAcc = new Map<string, WindowAcc>();
  const storeyAcc = new Map<string, WindowAcc>();
  const blockAcc = new Map<string, { townSlug: string; all: { cur: WindowAcc; prev5y: WindowAcc }; byType: Map<string, { cur: WindowAcc; prev5y: WindowAcc }> }>();
  const townStats: HdbTownStats[] = [];
  let leaseEstimated12m = 0;

  for (const t of towns) {
    const f = readHdbTxFile(t.slug);
    const tAcc = { cur: new WindowAcc(), prev12: new WindowAcc(), prev5y: new WindowAcc() };
    const tType = new Map<string, { cur: WindowAcc; prev12: WindowAcc }>();
    const rAcc = upsert(regionAcc, t.region, () => ({ cur: new WindowAcc(), prev5y: new WindowAcc() }));
    if (f) {
      const leaseYearCache = new Map<number, number | null>();
      for (let i = 0; i < f.m.length; i++) {
        const m = f.m[i];
        const price = f.p[i];
        const y = yearOfMonth(m);
        const yr = upsert(yearlyMap, y, () => ({ count: 0, million: 0 }));
        yr.count += 1;
        if (price >= 1_000_000) yr.million += 1;

        const isCur = inWindow(m, w.cur);
        const isPrev12 = !isCur && inWindow(m, w.prev12);
        const isPrev5y = inWindow(m, w.prev5y);
        if (!isCur && !isPrev12 && !isPrev5y) continue;

        const sqft = (f.a[i] / 10) * SQFT_PER_SQM;
        // unrounded, like the snapshot builder, so medians match towns.json / blocks.json exactly
        const psf = sqft > 0 ? price / sqft : 0;
        const flatType = f.flatTypes[f.t[i]];
        const blockSlug = f.blocks[f.b[i]];

        if (isCur) {
          nat.cur.add(price, psf);
          tAcc.cur.add(price, psf);
          rAcc.cur.add(price, psf);
          upsert(natType, flatType, () => ({ cur: new WindowAcc(), prev12: new WindowAcc() })).cur.add(price, psf);
          upsert(tType, flatType, () => ({ cur: new WindowAcc(), prev12: new WindowAcc() })).cur.add(price, psf);

          let remaining: number | null = f.rl[i] >= 0 ? f.rl[i] : null;
          if (remaining == null) {
            const bi = f.b[i];
            if (!leaseYearCache.has(bi)) leaseYearCache.set(bi, getHdbBlock(blockSlug)?.leaseCommenceYear ?? null);
            const ly = leaseYearCache.get(bi) ?? null;
            if (ly != null) {
              remaining = estimateRemainingLeaseMonths(ly, m);
              leaseEstimated12m += 1;
            }
          }
          const lb = leaseBand(remaining);
          if (lb) upsert(leaseAcc, lb, () => new WindowAcc()).add(price, psf);
          const sb = storeyBand(storeyMid(f.storeys[f.s[i]]));
          if (sb) upsert(storeyAcc, sb, () => new WindowAcc()).add(price, psf);
        } else if (isPrev12) {
          nat.prev12.add(price, psf);
          tAcc.prev12.add(price, psf);
          upsert(natType, flatType, () => ({ cur: new WindowAcc(), prev12: new WindowAcc() })).prev12.add(price, psf);
          upsert(tType, flatType, () => ({ cur: new WindowAcc(), prev12: new WindowAcc() })).prev12.add(price, psf);
        }
        if (isPrev5y) {
          nat.prev5y.add(price, psf);
          tAcc.prev5y.add(price, psf);
          rAcc.prev5y.add(price, psf);
        }
        if (isCur || isPrev5y) {
          const b = upsert(blockAcc, blockSlug, () => ({ townSlug: t.slug, all: { cur: new WindowAcc(), prev5y: new WindowAcc() }, byType: new Map() }));
          const bt = upsert(b.byType, flatType, () => ({ cur: new WindowAcc(), prev5y: new WindowAcc() }));
          if (isCur) {
            b.all.cur.add(price, psf);
            bt.cur.add(price, psf);
          } else {
            b.all.prev5y.add(price, psf);
            bt.prev5y.add(price, psf);
          }
        }
      }
    }
    townStats.push({
      slug: t.slug,
      town: t.town,
      region: t.region,
      cur: tAcc.cur.stat(),
      prev12: tAcc.prev12.stat(),
      prev5y: tAcc.prev5y.stat(),
      byType: Object.fromEntries([...tType.entries()].map(([k, v]) => [k, { cur: v.cur.stat(), prev12: v.prev12.stat() }])),
    });
  }

  const blocks = new Map<string, HdbBlockStats>();
  for (const [slug, b] of blockAcc) {
    blocks.set(slug, {
      slug,
      townSlug: b.townSlug,
      all: { cur: b.all.cur.stat(), prev5y: b.all.prev5y.stat() },
      byType: Object.fromEntries([...b.byType.entries()].map(([k, v]) => [k, { cur: v.cur.stat(), prev5y: v.prev5y.stat() }])),
    });
  }

  return {
    latestMonth: latest,
    windows: w,
    national: {
      cur: nat.cur.stat(),
      prev12: nat.prev12.stat(),
      prev5y: nat.prev5y.stat(),
      byType: Object.fromEntries([...natType.entries()].map(([k, v]) => [k, { cur: v.cur.stat(), prev12: v.prev12.stat() }])),
    },
    towns: townStats.sort((a, b) => a.town.localeCompare(b.town)),
    blocks,
    regions: [...regionAcc.entries()].map(([region, v]) => ({ region, cur: v.cur.stat(), prev5y: v.prev5y.stat() })).sort((a, b) => a.region.localeCompare(b.region)),
    yearly: [...yearlyMap.entries()].map(([year, v]) => ({ year, ...v })).sort((a, b) => a.year - b.year),
    leaseBands: LEASE_BANDS.map((b) => ({ id: b.id, label: b.label, stat: leaseAcc.get(b.id)?.stat() ?? EMPTY })),
    storeyBands: STOREY_BANDS.map((b) => ({ id: b.id, label: b.label, stat: storeyAcc.get(b.id)?.stat() ?? EMPTY })),
    leaseEstimated12m,
  };
}

/* ------------------------------------------------------------------ */
/* Rentals                                                             */
/* ------------------------------------------------------------------ */

export interface RentStat {
  count: number;
  medianRent: number | null;
}

export interface HdbRentScan {
  latestMonth: number | null;
  window: MonthWindow | null;
  /** key: `${blockSlug}|${flatType}` */
  byBlockType: Map<string, RentStat>;
  /** key: `${townSlug}|${flatType}` */
  byTownType: Map<string, RentStat>;
  byTown: Map<string, RentStat>;
  byType: Map<string, RentStat>;
  overall: RentStat;
}

function rentStat(values: number[]): RentStat {
  return { count: values.length, medianRent: values.length ? Math.round(median(values)) : null };
}

export function getHdbRentScan(): HdbRentScan {
  return memoBySnapshot("hdb-rent-scan", computeHdbRentScan);
}

function computeHdbRentScan(): HdbRentScan {
  // Each town's rentals are sorted newest first. A record inside the global 12-month window is at most
  // 11 months older than its own town's latest month, so that filter is a safe superset.
  const candidates: { town: string; block: string; type: string; m: number; rent: number }[] = [];
  let latest = -1;
  for (const t of getTowns()) {
    const rentals = getTownRentals(t.slug);
    if (rentals.length === 0) continue;
    const townLatest = rentals[0].monthIndex;
    if (townLatest > latest) latest = townLatest;
    for (const r of rentals) {
      if (r.monthIndex < townLatest - 11) break;
      candidates.push({ town: t.slug, block: r.blockSlug, type: r.flatType, m: r.monthIndex, rent: r.monthlyRent });
    }
  }
  if (latest < 0) {
    return { latestMonth: null, window: null, byBlockType: new Map(), byTownType: new Map(), byTown: new Map(), byType: new Map(), overall: { count: 0, medianRent: null } };
  }
  const window = { from: latest - 11, to: latest };
  const bt = new Map<string, number[]>();
  const tt = new Map<string, number[]>();
  const tw = new Map<string, number[]>();
  const ty = new Map<string, number[]>();
  const all: number[] = [];
  for (const c of candidates) {
    if (!inWindow(c.m, window) || !(c.rent > 0)) continue;
    upsert(bt, `${c.block}|${c.type}`, () => []).push(c.rent);
    upsert(tt, `${c.town}|${c.type}`, () => []).push(c.rent);
    upsert(tw, c.town, () => []).push(c.rent);
    upsert(ty, c.type, () => []).push(c.rent);
    all.push(c.rent);
  }
  const toStats = (m: Map<string, number[]>) => new Map([...m.entries()].map(([k, v]) => [k, rentStat(v)]));
  return { latestMonth: latest, window, byBlockType: toStats(bt), byTownType: toStats(tt), byTown: toStats(tw), byType: toStats(ty), overall: rentStat(all) };
}
