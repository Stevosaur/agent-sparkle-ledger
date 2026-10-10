/**
 * Build stage: turns normalised records (types.ts) into the committed snapshot (src/lib/data/types.ts).
 * Pure apart from writing files, deterministic for a given input, used by both the real pipeline
 * (run.ts) and the fixture generator (scripts/fixtures/generate.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { monthIndex, monthLabel } from "../../src/lib/data/months";
import { haversineM, isInSingapore } from "../../src/lib/geo-math";
import { median } from "../../src/lib/stats-math";
import { hdbBlockSlug, landedAddressSlug, landedStreetSlug, projectSlug, titleCase, townSlug } from "../../src/lib/slug";
import type {
  DatasetMeta,
  HdbBlock,
  HdbFlatType,
  HdbRentFile,
  HdbTxFile,
  LandedAddress,
  LandedStreet,
  LaunchType,
  MarketSegment,
  MonthlyStat,
  MrtStation,
  NearbyStation,
  NewLaunch,
  PrivateProject,
  PrivateRentFile,
  PrivateTxFile,
  SearchEntry,
  StatSeries,
  Tenure,
  TownSummary,
  TxSummary,
} from "../../src/lib/data/types";
import { hdbGeoKey, type RawHdbSale, type RawLaunch, type RawPrivateRental, type RawPrivateSale, type SnapshotInput } from "./types";

const SQFT_PER_SQM = 10.764;

/* ------------------------------------------------------------------ */
/* Static reference data                                               */
/* ------------------------------------------------------------------ */

/** URA planning regions of the HDB towns. */
export const TOWN_REGION: Record<string, TownSummary["region"]> = {
  "ANG MO KIO": "North-East",
  BEDOK: "East",
  BISHAN: "Central",
  "BUKIT BATOK": "West",
  "BUKIT MERAH": "Central",
  "BUKIT PANJANG": "West",
  "BUKIT TIMAH": "Central",
  "CENTRAL AREA": "Central",
  "CHOA CHU KANG": "West",
  CLEMENTI: "West",
  GEYLANG: "Central",
  HOUGANG: "North-East",
  "JURONG EAST": "West",
  "JURONG WEST": "West",
  "KALLANG/WHAMPOA": "Central",
  "LIM CHU KANG": "North",
  "MARINE PARADE": "Central",
  "PASIR RIS": "East",
  PUNGGOL: "North-East",
  QUEENSTOWN: "Central",
  SEMBAWANG: "North",
  SENGKANG: "North-East",
  SERANGOON: "North-East",
  TAMPINES: "East",
  TENGAH: "West",
  "TOA PAYOH": "Central",
  WOODLANDS: "North",
  YISHUN: "North",
};

const LANDED_NON_STRATA = new Set(["Terrace", "Semi-detached", "Detached"]);
const GENERIC_LANDED_PROJECT = /^(N\.?\s?A\.?|-|LANDED HOUSING DEVELOPMENT|LANDED HOUSES?|LANDED)$/i;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function psfOf(price: number, sqm: number): number {
  const sqft = sqm * SQFT_PER_SQM;
  return sqft > 0 ? price / sqft : Number.NaN;
}

/** Latest month index across records (loop, not Math.max(...), which overflows the stack on large arrays). */
function maxMonth(rows: readonly { month: string }[]): number | null {
  let best: number | null = null;
  for (const r of rows) {
    const m = monthIndex(r.month);
    if (best == null || m > best) best = m;
  }
  return best;
}

function mode<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

function summarise(rows: { m: number; price: number; psf: number }[], latestMonth: number | null): TxSummary {
  if (rows.length === 0) return { count: 0, first: null, last: null, lastPrice: null, medianPsf12m: null, count12m: 0 };
  let first = rows[0];
  let last = rows[0];
  for (const r of rows) {
    if (r.m < first.m) first = r;
    if (r.m > last.m || (r.m === last.m && r.price > last.price)) last = r;
  }
  const recent = latestMonth == null ? [] : rows.filter((r) => r.m > latestMonth - 12 && r.m <= latestMonth && Number.isFinite(r.psf));
  return {
    count: rows.length,
    first: monthLabel(first.m),
    last: monthLabel(last.m),
    lastPrice: last.price,
    medianPsf12m: recent.length ? Math.round(median(recent.map((r) => r.psf))) : null,
    count12m: recent.length,
  };
}

export function parseTenure(raw: string | null | undefined): Tenure | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || /^n\.?a\.?$/i.test(s)) return null;
  if (/freehold/i.test(s)) return { raw: s, kind: "freehold", years: null, startYear: null };
  const years = /(\d{2,4})\s*(?:yrs?|years?)/i.exec(s);
  const start = /(?:from|commencing)\D*?(?:\d{1,2}\/\d{1,2}\/)?((?:18|19|20)\d{2})/i.exec(s);
  if (!years) return null;
  return { raw: s, kind: "leasehold", years: Number(years[1]), startYear: start ? Number(start[1]) : null };
}

function nearestOperational(stations: MrtStation[], lat: number | null | undefined, lng: number | null | undefined): NearbyStation | null {
  if (lat == null || lng == null) return null;
  let best: NearbyStation | null = null;
  for (const s of stations) {
    if (s.status !== "operational") continue;
    const d = haversineM({ lat, lng }, s);
    if (!best || d < best.distanceM) {
      best = { name: s.name, codes: s.codes, lines: s.lines, status: s.status, expectedYear: s.expectedYear, distanceM: Math.round(d) };
    }
  }
  return best;
}

function validCoord(lat: number | null | undefined, lng: number | null | undefined): { lat: number; lng: number } | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return isInSingapore({ lat, lng }) ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 } : null;
}

class Dict {
  readonly values: string[] = [];
  private index = new Map<string, number>();
  id(v: string): number {
    let i = this.index.get(v);
    if (i === undefined) {
      i = this.values.length;
      this.values.push(v);
      this.index.set(v, i);
    }
    return i;
  }
}

function writeJson(outDir: string, rel: string, value: unknown) {
  const file = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function monthlyStats(rows: { m: number; price: number; psf: number }[]): MonthlyStat[] {
  const byMonth = new Map<number, { prices: number[]; psfs: number[] }>();
  for (const r of rows) {
    let g = byMonth.get(r.m);
    if (!g) byMonth.set(r.m, (g = { prices: [], psfs: [] }));
    g.prices.push(r.price);
    if (Number.isFinite(r.psf)) g.psfs.push(r.psf);
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([m, g]) => ({
      m,
      count: g.prices.length,
      medianPrice: Math.round(median(g.prices)),
      medianPsf: g.psfs.length ? Math.round(median(g.psfs)) : 0,
    }));
}

export function privateGroup(propertyType: string): "Condo" | "EC" | "Landed" {
  if (propertyType === "Executive Condominium") return "EC";
  if (/terrace|semi-detached|detached/i.test(propertyType)) return "Landed";
  return "Condo";
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export interface BuildResult {
  meta: DatasetMeta;
}

export function buildSnapshot(input: SnapshotInput, outDir: string): BuildResult {
  fs.rmSync(path.join(outDir, "hdb"), { recursive: true, force: true });
  fs.rmSync(path.join(outDir, "private"), { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const stations = [...input.mrtStations].sort((a, b) => a.name.localeCompare(b.name));
  const schools = [...input.schools].sort((a, b) => a.name.localeCompare(b.name));
  writeJson(outDir, "geo/mrt-stations.json", stations);
  writeJson(outDir, "geo/schools.json", schools);

  const search: SearchEntry[] = [];
  const series: StatSeries[] = [];

  /* ------------------------------- HDB ------------------------------- */

  const hdbSales = [...input.hdbSales].sort(
    (a, b) => a.month.localeCompare(b.month) || a.town.localeCompare(b.town) || a.block.localeCompare(b.block) || a.price - b.price,
  );
  const hdbLatest = hdbSales.length ? monthIndex(hdbSales[hdbSales.length - 1].month) : null;

  interface BlockAcc {
    block: string;
    street: string;
    towns: string[];
    leaseYears: number[];
    rows: { m: number; price: number; psf: number }[];
    flatTypes: Set<string>;
  }
  const blockAcc = new Map<string, BlockAcc>();
  for (const s of hdbSales) {
    const key = hdbGeoKey(s.block, s.street);
    let acc = blockAcc.get(key);
    if (!acc) blockAcc.set(key, (acc = { block: s.block.trim().toUpperCase(), street: s.street.trim().toUpperCase(), towns: [], leaseYears: [], rows: [], flatTypes: new Set() }));
    acc.towns.push(s.town);
    if (s.leaseCommenceYear) acc.leaseYears.push(s.leaseCommenceYear);
    acc.rows.push({ m: monthIndex(s.month), price: s.price, psf: psfOf(s.price, s.floorAreaSqm) });
    acc.flatTypes.add(s.flatType);
  }

  const infoByKey = new Map(input.hdbBlockInfo.map((i) => [hdbGeoKey(i.block, i.street), i]));

  // rentals by block
  const rentLatest = maxMonth(input.hdbRentals);
  const rentByKey = new Map<string, number[]>();
  for (const r of input.hdbRentals) {
    if (rentLatest == null || monthIndex(r.month) <= rentLatest - 12) continue;
    const key = hdbGeoKey(r.block, r.street);
    const arr = rentByKey.get(key) ?? [];
    arr.push(r.monthlyRent);
    rentByKey.set(key, arr);
  }

  const blocks: HdbBlock[] = [];
  const allKeys = new Set<string>([...blockAcc.keys(), ...[...infoByKey.entries()].filter(([, i]) => i.residential).map(([k]) => k)]);
  for (const key of allKeys) {
    const acc = blockAcc.get(key);
    const info = infoByKey.get(key);
    const [blockNo, street] = key.split("|");
    const town = (acc ? mode(acc.towns) : null) ?? info?.town ?? null;
    if (!town) continue; // cannot place a block without a town
    const geo = input.hdbGeocodes.get(key);
    const coord = validCoord(geo?.lat, geo?.lng);
    const rents = rentByKey.get(key);
    const unitMix: Partial<Record<HdbFlatType, number>> = {};
    for (const [k, v] of Object.entries(info?.unitMix ?? {})) if (v > 0) unitMix[k as HdbFlatType] = v;
    blocks.push({
      slug: hdbBlockSlug(blockNo, street),
      block: blockNo,
      street,
      streetFull: geo?.roadName ?? null,
      town,
      townSlug: townSlug(town),
      postal: geo?.postal ?? null,
      lat: coord?.lat,
      lng: coord?.lng,
      leaseCommenceYear: acc ? mode(acc.leaseYears) : null,
      yearCompleted: info?.yearCompleted ?? null,
      maxFloor: info?.maxFloor ?? null,
      dwellingUnits: info?.totalDwellingUnits ?? null,
      unitMix,
      facilities: info
        ? {
            commercial: info.commercial,
            marketHawker: info.marketHawker,
            multistoreyCarpark: info.multistoreyCarpark,
            precinctPavilion: info.precinctPavilion,
            miscellaneous: info.miscellaneous,
          }
        : null,
      tx: summarise(acc?.rows ?? [], hdbLatest),
      rentals: rents ? { count12m: rents.length, medianRent12m: Math.round(median(rents)) } : null,
      nearestMrt: coord ? nearestOperational(stations, coord.lat, coord.lng) : null,
    });
  }
  blocks.sort((a, b) => a.slug.localeCompare(b.slug));
  writeJson(outDir, "hdb/blocks.json", blocks);

  // columnar transactions per town
  const salesByTown = new Map<string, RawHdbSale[]>();
  for (const s of hdbSales) {
    const arr = salesByTown.get(s.town) ?? [];
    arr.push(s);
    salesByTown.set(s.town, arr);
  }
  for (const [town, sales] of salesByTown) {
    const blocksD = new Dict();
    const typesD = new Dict();
    const storeysD = new Dict();
    const modelsD = new Dict();
    const f: HdbTxFile = { town, blocks: [], flatTypes: [], storeys: [], models: [], m: [], b: [], t: [], s: [], a: [], p: [], md: [], rl: [] };
    for (const s of sales) {
      f.m.push(monthIndex(s.month));
      f.b.push(blocksD.id(hdbBlockSlug(s.block, s.street)));
      f.t.push(typesD.id(s.flatType));
      f.s.push(storeysD.id(s.storeyRange));
      f.a.push(Math.round(s.floorAreaSqm * 10));
      f.p.push(Math.round(s.price));
      f.md.push(modelsD.id(s.flatModel));
      f.rl.push(s.remainingLeaseMonths ?? -1);
    }
    f.blocks = blocksD.values;
    f.flatTypes = typesD.values;
    f.storeys = storeysD.values;
    f.models = modelsD.values;
    writeJson(outDir, `hdb/tx/${townSlug(town)}.json`, f);
  }

  // columnar rentals per town
  const rentalsByTown = new Map<string, typeof input.hdbRentals>();
  for (const r of [...input.hdbRentals].sort((a, b) => a.month.localeCompare(b.month) || a.block.localeCompare(b.block) || a.monthlyRent - b.monthlyRent)) {
    const arr = rentalsByTown.get(r.town) ?? [];
    arr.push(r);
    rentalsByTown.set(r.town, arr);
  }
  for (const [town, rentals] of rentalsByTown) {
    const blocksD = new Dict();
    const typesD = new Dict();
    const f: HdbRentFile = { town, blocks: [], flatTypes: [], m: [], b: [], t: [], r: [] };
    for (const r of rentals) {
      f.m.push(monthIndex(r.month));
      f.b.push(blocksD.id(hdbBlockSlug(r.block, r.street)));
      f.t.push(typesD.id(r.flatType));
      f.r.push(Math.round(r.monthlyRent));
    }
    f.blocks = blocksD.values;
    f.flatTypes = typesD.values;
    writeJson(outDir, `hdb/rentals/${townSlug(town)}.json`, f);
  }

  // towns
  const towns: TownSummary[] = [];
  const townNames = new Set<string>([...salesByTown.keys(), ...blocks.map((b) => b.town)]);
  for (const town of [...townNames].sort()) {
    const sales = salesByTown.get(town) ?? [];
    const rows = sales.map((s) => ({ m: monthIndex(s.month), price: s.price, psf: psfOf(s.price, s.floorAreaSqm) }));
    const medianPrice12m: TownSummary["medianPrice12m"] = {};
    const medianRent12m: TownSummary["medianRent12m"] = {};
    if (hdbLatest != null) {
      const byType = new Map<string, number[]>();
      for (const s of sales) {
        if (monthIndex(s.month) <= hdbLatest - 12) continue;
        const arr = byType.get(s.flatType) ?? [];
        arr.push(s.price);
        byType.set(s.flatType, arr);
      }
      for (const [t, prices] of byType) medianPrice12m[t as HdbFlatType] = Math.round(median(prices));
    }
    if (rentLatest != null) {
      const byType = new Map<string, number[]>();
      for (const r of rentalsByTown.get(town) ?? []) {
        if (monthIndex(r.month) <= rentLatest - 12) continue;
        const arr = byType.get(r.flatType) ?? [];
        arr.push(r.monthlyRent);
        byType.set(r.flatType, arr);
      }
      for (const [t, rents] of byType) medianRent12m[t as HdbFlatType] = Math.round(median(rents));
    }
    towns.push({
      town,
      slug: townSlug(town),
      region: TOWN_REGION[town] ?? "Central",
      blocks: blocks.filter((b) => b.town === town).length,
      tx: summarise(rows, hdbLatest),
      medianPrice12m,
      medianRent12m,
    });
  }
  writeJson(outDir, "hdb/towns.json", towns);

  // HDB stats series
  {
    const groups = new Map<string, { m: number; price: number; psf: number }[]>();
    const push = (key: string, row: { m: number; price: number; psf: number }) => {
      const arr = groups.get(key) ?? [];
      arr.push(row);
      groups.set(key, arr);
    };
    for (const s of hdbSales) {
      const row = { m: monthIndex(s.month), price: s.price, psf: psfOf(s.price, s.floorAreaSqm) };
      push(`hdb:ALL:ALL`, row);
      push(`hdb:ALL:${s.flatType}`, row);
      push(`hdb:${s.town}:ALL`, row);
      push(`hdb:${s.town}:${s.flatType}`, row);
    }
    for (const r of input.hdbRentals) {
      const row = { m: monthIndex(r.month), price: r.monthlyRent, psf: Number.NaN };
      push(`rent-hdb:ALL:ALL`, row);
      push(`rent-hdb:ALL:${r.flatType}`, row);
      push(`rent-hdb:${r.town}:ALL`, row);
      push(`rent-hdb:${r.town}:${r.flatType}`, row);
    }
    for (const [key, rows] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const [kind, town, type] = key.split(":");
      const where = town === "ALL" ? "All towns" : titleCase(town);
      const what = type === "ALL" ? "all flat types" : type;
      const label = kind === "hdb" ? `HDB resale · ${where} · ${what}` : `HDB rent · ${where} · ${what}`;
      series.push({ key, label, points: monthlyStats(rows) });
    }
  }

  for (const b of blocks) {
    const types = [...(blockAcc.get(hdbGeoKey(b.block, b.street))?.flatTypes ?? [])].sort();
    search.push({
      kind: "hdb",
      href: `/hdb/${b.slug}/`,
      label: `Blk ${b.block} ${titleCase(b.street)}`,
      sub: `${titleCase(b.town)} · HDB${types.length ? ` · ${types.join(", ")}` : ""}`,
      postal: b.postal,
      terms: `${b.streetFull ?? ""} block ${b.block}`.toLowerCase(),
      weight: b.tx.count,
    });
  }
  for (const t of towns) {
    search.push({
      kind: "town",
      href: `/insights/town/${t.slug}/`,
      label: titleCase(t.town),
      sub: `HDB town · ${t.region}`,
      postal: null,
      terms: "town estate",
      weight: t.tx.count,
    });
  }

  /* ----------------------------- Private ----------------------------- */

  const privLatest = maxMonth(input.privateSales);

  // assign project slugs: generic landed names become per-street pseudo projects; duplicate names across districts get a suffix
  // Non-strata landed houses (and generically named landed developments) are grouped per street: landed pages are
  // organised by street, and a named landed estate spanning several streets must not repeat its sales on each.
  const projectKeyOf = (p: { project: string; street: string; propertyType: string }) =>
    GENERIC_LANDED_PROJECT.test(p.project.trim()) || LANDED_NON_STRATA.has(p.propertyType)
      ? `LANDED|${p.street.trim().toUpperCase()}`
      : `P|${p.project.trim().toUpperCase()}`;
  const districtsByKey = new Map<string, Map<number, number>>();
  for (const s of input.privateSales) {
    const k = projectKeyOf(s);
    const m = districtsByKey.get(k) ?? new Map<number, number>();
    m.set(s.district ?? 0, (m.get(s.district ?? 0) ?? 0) + 1);
    districtsByKey.set(k, m);
  }
  const slugFor = (p: { project: string; street: string; propertyType: string; district: number | null }): string => {
    const k = projectKeyOf(p);
    const base = k.startsWith("LANDED|") ? `landed-${landedStreetSlug(p.street)}` : projectSlug(p.project);
    const ds = districtsByKey.get(k);
    if (!ds || ds.size <= 1) return base;
    const main = [...ds.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return (p.district ?? 0) === main ? base : `${base}-d${String(p.district ?? 0).padStart(2, "0")}`;
  };

  interface ProjAcc {
    slug: string;
    name: string;
    streets: string[];
    districts: number[];
    segments: MarketSegment[];
    types: Set<string>;
    tenures: string[];
    lat: number | null;
    lng: number | null;
    rows: { m: number; price: number; psf: number }[];
    unitLevel: boolean;
    generic: boolean;
  }
  const projects = new Map<string, ProjAcc>();
  const privSalesSorted = [...input.privateSales].sort(
    (a, b) => a.month.localeCompare(b.month) || a.project.localeCompare(b.project) || a.price - b.price || a.areaSqm - b.areaSqm,
  );
  for (const s of privSalesSorted) {
    const slug = slugFor(s);
    let acc = projects.get(slug);
    const generic = GENERIC_LANDED_PROJECT.test(s.project.trim()) || LANDED_NON_STRATA.has(s.propertyType);
    if (!acc) {
      projects.set(
        slug,
        (acc = {
          slug,
          name: generic ? s.street.trim().toUpperCase() : s.project.trim().toUpperCase(),
          streets: [],
          districts: [],
          segments: [],
          types: new Set(),
          tenures: [],
          lat: null,
          lng: null,
          rows: [],
          unitLevel: false,
          generic,
        }),
      );
    }
    acc.streets.push(s.street.trim().toUpperCase());
    if (s.district) acc.districts.push(s.district);
    if (s.marketSegment) acc.segments.push(s.marketSegment);
    acc.types.add(s.propertyType);
    if (s.tenure) acc.tenures.push(s.tenure);
    const c = validCoord(s.lat, s.lng);
    if (c && acc.lat == null) {
      acc.lat = c.lat;
      acc.lng = c.lng;
    }
    // bulk caveats (several units in one deal) report total price & area: keep them out of last-sale / median summaries
    if ((s.noOfUnits || 1) === 1) acc.rows.push({ m: monthIndex(s.month), price: s.price, psf: psfOf(s.price, s.areaSqm) });
    if (s.unit || s.address) acc.unitLevel = true;
  }

  // private rentals per project
  const rentPrivLatest = maxMonth(input.privateRentals);
  const privRentBySlug = new Map<string, number[]>();
  const rentalSlug = (r: RawPrivateRental) => slugFor({ project: r.project, street: r.street, propertyType: r.propertyType, district: r.district });
  for (const r of input.privateRentals) {
    if (rentPrivLatest == null || monthIndex(r.month) <= rentPrivLatest - 12) continue;
    const slug = rentalSlug(r);
    const arr = privRentBySlug.get(slug) ?? [];
    arr.push(r.monthlyRent);
    privRentBySlug.set(slug, arr);
  }

  const launchSlugByProject = new Map<string, string>();
  for (const l of input.launches) launchSlugByProject.set(projectSlug(l.project), projectSlug(l.project));

  const projectList: PrivateProject[] = [];
  for (const acc of projects.values()) {
    const latestTenure = acc.tenures.length ? acc.tenures[acc.tenures.length - 1] : null;
    const types = [...acc.types].sort();
    const isLanded = types.every((t) => LANDED_NON_STRATA.has(t));
    const rents = privRentBySlug.get(acc.slug);
    projectList.push({
      slug: acc.slug,
      name: acc.name,
      street: mode(acc.streets) ?? "",
      district: mode(acc.districts),
      segment: mode(acc.segments),
      propertyTypes: types,
      isLanded,
      tenure: parseTenure(latestTenure),
      lat: acc.lat ?? undefined,
      lng: acc.lng ?? undefined,
      tx: summarise(acc.rows, privLatest),
      rentals: rents ? { count12m: rents.length, medianRent12m: Math.round(median(rents)) } : null,
      launchSlug: launchSlugByProject.get(acc.slug) ?? null,
      nearestMrt: nearestOperational(stations, acc.lat, acc.lng),
      hasUnitLevel: acc.unitLevel,
    });
  }
  projectList.sort((a, b) => a.slug.localeCompare(b.slug));
  writeJson(outDir, "private/projects.json", projectList);
  const projectBySlug = new Map(projectList.map((p) => [p.slug, p]));

  // columnar private transactions per district
  const privByDistrict = new Map<number, RawPrivateSale[]>();
  for (const s of privSalesSorted) {
    const d = s.district ?? 0;
    const arr = privByDistrict.get(d) ?? [];
    arr.push(s);
    privByDistrict.set(d, arr);
  }
  const hasUnitLevel = input.privateSales.some((s) => s.unit || s.address);
  for (const [district, sales] of privByDistrict) {
    if (!district) continue;
    const pjD = new Dict();
    const ptD = new Dict();
    const frD = new Dict();
    const f: PrivateTxFile = { district, projects: [], propertyTypes: [], floorRanges: [], m: [], pj: [], a: [], p: [], fr: [], ts: [], pt: [], ta: [], n: [] };
    if (hasUnitLevel) {
      f.unit = [];
      f.address = [];
    }
    for (const s of sales) {
      f.m.push(monthIndex(s.month));
      f.pj.push(pjD.id(slugFor(s)));
      f.a.push(Math.round(s.areaSqm * 10));
      f.p.push(Math.round(s.price));
      f.fr.push(frD.id(s.floorRange || "-"));
      f.ts.push(s.typeOfSale);
      f.pt.push(ptD.id(s.propertyType));
      f.ta.push(s.typeOfArea === "Strata" ? 0 : s.typeOfArea === "Land" ? 1 : 2);
      f.n.push(s.noOfUnits || 1);
      if (hasUnitLevel) {
        f.unit!.push(s.unit ?? null);
        f.address!.push(s.address ? s.address.trim().toUpperCase() : null);
      }
    }
    f.projects = pjD.values;
    f.propertyTypes = ptD.values;
    f.floorRanges = frD.values;
    writeJson(outDir, `private/tx/d${String(district).padStart(2, "0")}.json`, f);
  }

  // columnar private rentals per district
  const rentByDistrict = new Map<number, RawPrivateRental[]>();
  for (const r of [...input.privateRentals].sort((a, b) => a.month.localeCompare(b.month) || a.project.localeCompare(b.project) || a.monthlyRent - b.monthlyRent)) {
    const d = r.district ?? 0;
    if (!d) continue;
    const arr = rentByDistrict.get(d) ?? [];
    arr.push(r);
    rentByDistrict.set(d, arr);
  }
  for (const [district, rentals] of rentByDistrict) {
    const pjD = new Dict();
    const ptD = new Dict();
    const f: PrivateRentFile = { district, projects: [], propertyTypes: [], m: [], pj: [], pt: [], r: [], alo: [], ahi: [], br: [] };
    for (const r of rentals) {
      f.m.push(monthIndex(r.month));
      f.pj.push(pjD.id(rentalSlug(r)));
      f.pt.push(ptD.id(r.propertyType));
      f.r.push(Math.round(r.monthlyRent));
      f.alo.push(r.areaSqmLow ?? -1);
      f.ahi.push(r.areaSqmHigh ?? -1);
      f.br.push(r.bedrooms ?? -1);
    }
    f.projects = pjD.values;
    f.propertyTypes = ptD.values;
    writeJson(outDir, `private/rentals/d${String(district).padStart(2, "0")}.json`, f);
  }

  // landed streets (non-strata landed projects grouped by street)
  const streetAcc = new Map<string, { street: string; projects: Set<string>; rows: { m: number; price: number; psf: number }[]; types: Set<string>; tenures: Set<string>; districts: number[]; segments: MarketSegment[]; lat: number | null; lng: number | null; addresses: Set<string> }>();
  for (const s of privSalesSorted) {
    if (!LANDED_NON_STRATA.has(s.propertyType)) continue;
    const slug = slugFor(s);
    const proj = projectBySlug.get(slug);
    if (!proj?.isLanded) continue;
    const street = s.street.trim().toUpperCase();
    const key = landedStreetSlug(street);
    let acc = streetAcc.get(key);
    if (!acc) streetAcc.set(key, (acc = { street, projects: new Set(), rows: [], types: new Set(), tenures: new Set(), districts: [], segments: [], lat: null, lng: null, addresses: new Set() }));
    acc.projects.add(slug);
    if ((s.noOfUnits || 1) === 1) acc.rows.push({ m: monthIndex(s.month), price: s.price, psf: psfOf(s.price, s.areaSqm) });
    acc.types.add(s.propertyType);
    const t = parseTenure(s.tenure);
    if (t) acc.tenures.add(t.kind === "freehold" ? "Freehold" : `${t.years}-year leasehold`);
    if (s.district) acc.districts.push(s.district);
    if (s.marketSegment) acc.segments.push(s.marketSegment);
    const c = validCoord(s.lat, s.lng);
    if (c && acc.lat == null) {
      acc.lat = c.lat;
      acc.lng = c.lng;
    }
    if (s.address) acc.addresses.add(s.address.trim().toUpperCase());
  }

  // landed addresses (unit-level data only)
  const addrAcc = new Map<string, { address: string; houseNo: string; street: string; rows: { m: number; price: number; psf: number }[]; sales: RawPrivateSale[] }>();
  for (const s of privSalesSorted) {
    if (!s.address || !LANDED_NON_STRATA.has(s.propertyType)) continue;
    const address = s.address.trim().toUpperCase();
    const street = s.street.trim().toUpperCase();
    const houseNo = address.endsWith(street) ? address.slice(0, address.length - street.length).trim() : address.split(/\s+/)[0];
    if (!houseNo) continue;
    const slug = landedAddressSlug(houseNo, street);
    let acc = addrAcc.get(slug);
    if (!acc) addrAcc.set(slug, (acc = { address, houseNo, street, rows: [], sales: [] }));
    if ((s.noOfUnits || 1) === 1) acc.rows.push({ m: monthIndex(s.month), price: s.price, psf: psfOf(s.price, s.areaSqm) });
    acc.sales.push(s);
  }
  const landedAddresses: LandedAddress[] = [];
  for (const [slug, acc] of addrAcc) {
    const latest = acc.sales[acc.sales.length - 1];
    const c = validCoord(latest.lat, latest.lng);
    landedAddresses.push({
      slug,
      address: acc.address,
      houseNo: acc.houseNo,
      street: acc.street,
      streetSlug: landedStreetSlug(acc.street),
      district: latest.district,
      segment: latest.marketSegment,
      propertyType: latest.propertyType,
      tenure: parseTenure(latest.tenure),
      landAreaSqm: latest.typeOfArea === "Land" ? latest.areaSqm : null,
      lat: c?.lat,
      lng: c?.lng,
      tx: summarise(acc.rows, privLatest),
    });
  }
  landedAddresses.sort((a, b) => a.slug.localeCompare(b.slug));

  const landedStreets: LandedStreet[] = [...streetAcc.entries()]
    .map(([slug, acc]) => ({
      slug,
      street: acc.street,
      district: mode(acc.districts),
      segment: mode(acc.segments),
      propertyTypes: [...acc.types].sort(),
      tenures: [...acc.tenures].sort(),
      lat: acc.lat ?? undefined,
      lng: acc.lng ?? undefined,
      tx: summarise(acc.rows, privLatest),
      projects: [...acc.projects].sort(),
      addresses: landedAddresses.filter((a) => a.streetSlug === slug).map((a) => a.slug),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  writeJson(outDir, "private/landed-streets.json", landedStreets);
  writeJson(outDir, "private/landed-addresses.json", landedAddresses);

  // launches
  const launches: NewLaunch[] = input.launches
    .map((l: RawLaunch): NewLaunch => {
      const slug = projectSlug(l.project);
      const type: LaunchType = l.propertyType === "Executive Condominium" ? "ec" : l.propertyType && /terrace|detached/i.test(l.propertyType) && !/strata/i.test(l.propertyType) ? "landed" : "condo";
      const months = [...l.months].sort((a, b) => a.month.localeCompare(b.month));
      const last = months[months.length - 1];
      const c = validCoord(l.lat, l.lng);
      const project = projectBySlug.get(slug);
      return {
        slug,
        name: l.project.trim().toUpperCase(),
        type,
        status: l.status,
        street: l.street,
        district: l.district,
        segment: l.marketSegment,
        developer: l.developer,
        totalUnits: l.totalUnits,
        expectedCompletionYear: l.expectedCompletionYear,
        tenure: parseTenure(l.tenure),
        sales: months,
        unitsSold: last?.soldToDate ?? null,
        unitsLaunched: last?.launchedToDate ?? null,
        projectSlug: project && !project.isLanded ? slug : null,
        lat: c?.lat ?? project?.lat,
        lng: c?.lng ?? project?.lng,
        nearestMrt: nearestOperational(stations, c?.lat ?? project?.lat, c?.lng ?? project?.lng),
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
  writeJson(outDir, "private/launches.json", launches);

  // private stats series
  {
    const groups = new Map<string, { m: number; price: number; psf: number }[]>();
    const push = (key: string, row: { m: number; price: number; psf: number }) => {
      const arr = groups.get(key) ?? [];
      arr.push(row);
      groups.set(key, arr);
    };
    for (const s of privSalesSorted) {
      if ((s.noOfUnits || 1) > 1) continue; // bulk deals distort medians
      const row = { m: monthIndex(s.month), price: s.price, psf: psfOf(s.price, s.areaSqm) };
      const g = privateGroup(s.propertyType);
      const seg = s.marketSegment ?? "ALL";
      push(`private:ALL:ALL`, row);
      push(`private:ALL:${g}`, row);
      if (seg !== "ALL") {
        push(`private:${seg}:ALL`, row);
        push(`private:${seg}:${g}`, row);
      }
      if (s.district) {
        push(`private-d:${s.district}:ALL`, row);
        // separate indices so condo psf (strata area) and landed psf (land area) are not mixed in one median
        // the landed index uses land-area psf, so it takes non-strata houses only; strata landed (strata area) goes with non-landed
        push(`private-d:${s.district}:${LANDED_NON_STRATA.has(s.propertyType) ? "Landed" : "NonLanded"}`, row);
      }
    }
    for (const r of input.privateRentals) {
      const row = { m: monthIndex(r.month), price: r.monthlyRent, psf: Number.NaN };
      push(`rent-private:ALL:ALL`, row);
      if (r.district) push(`rent-private-d:${r.district}:ALL`, row);
    }
    for (const [key, rows] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const [kind, where, what] = key.split(":");
      const label =
        kind === "private"
          ? `Private · ${where === "ALL" ? "All segments" : where} · ${what === "ALL" ? "all types" : what}`
          : kind === "private-d"
            ? `Private · District ${where}${what === "Landed" ? " · landed" : what === "NonLanded" ? " · non-landed" : ""}`
            : kind === "rent-private"
              ? `Private rent · All`
              : `Private rent · District ${where}`;
      series.push({ key, label, points: monthlyStats(rows) });
    }
  }

  for (const p of projectList) {
    if (p.isLanded) continue;
    const kindLabel = p.propertyTypes.includes("Executive Condominium") ? "EC" : "Condo";
    search.push({
      kind: "condo",
      href: `/condo/${p.slug}/`,
      label: titleCase(p.name),
      sub: `${titleCase(p.street)}${p.district ? ` · D${String(p.district).padStart(2, "0")}` : ""} · ${kindLabel}`,
      postal: null,
      terms: `${p.street} ${p.segment ?? ""}`.toLowerCase(),
      weight: p.tx.count,
    });
  }
  for (const s of landedStreets) {
    search.push({
      kind: "landed-street",
      href: `/landed-street/${s.slug}/`,
      label: titleCase(s.street),
      sub: `Landed street${s.district ? ` · D${String(s.district).padStart(2, "0")}` : ""}`,
      postal: null,
      terms: "landed terrace semi-detached detached",
      weight: s.tx.count,
    });
  }
  for (const a of landedAddresses) {
    search.push({
      kind: "landed",
      href: `/landed/${a.slug}/`,
      label: titleCase(a.address),
      sub: `${a.propertyType ?? "Landed"}${a.district ? ` · D${String(a.district).padStart(2, "0")}` : ""}`,
      postal: null,
      terms: "landed house",
      weight: a.tx.count,
    });
  }
  for (const l of launches) {
    search.push({
      kind: "launch",
      href: `/new-launch/${l.type}/${l.slug}/`,
      label: titleCase(l.name),
      sub: `New launch · ${l.status === "upcoming" ? "Upcoming" : "Launched"}${l.district ? ` · D${String(l.district).padStart(2, "0")}` : ""}`,
      postal: null,
      terms: `${l.street ?? ""} ${l.developer ?? ""} new launch`.toLowerCase(),
      weight: 1000 + (l.totalUnits ?? 0),
    });
  }

  /* ------------------------------ Outputs ----------------------------- */

  writeJson(outDir, "stats.json", { series });
  writeJson(outDir, "search-index.json", search);
  if (input.rates) writeJson(outDir, "rates.json", input.rates);

  const condoTx = input.privateSales.filter((s) => !LANDED_NON_STRATA.has(s.propertyType)).length;
  const meta: DatasetMeta = {
    generatedAt: input.generatedAt,
    fixture: input.fixture,
    sources: input.sources,
    counts: {
      hdbTransactions: hdbSales.length,
      hdbBlocks: blocks.length,
      hdbRentals: input.hdbRentals.length,
      privateTransactions: input.privateSales.length,
      condoTransactions: condoTx,
      landedTransactions: input.privateSales.length - condoTx,
      privateRentals: input.privateRentals.length,
      projects: projectList.filter((p) => !p.isLanded).length,
      landedStreets: landedStreets.length,
      landedAddresses: landedAddresses.length,
      launches: launches.length,
      mrtStations: stations.length,
      schools: schools.length,
    },
    latestMonth: {
      hdb: hdbLatest != null ? monthLabel(hdbLatest) : null,
      private: privLatest != null ? monthLabel(privLatest) : null,
      hdbRentals: rentLatest != null ? monthLabel(rentLatest) : null,
      privateRentals: rentPrivLatest != null ? monthLabel(rentPrivLatest) : null,
    },
  };
  writeJson(outDir, "meta.json", meta);
  return { meta };
}
