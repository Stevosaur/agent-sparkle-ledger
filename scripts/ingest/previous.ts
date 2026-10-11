/**
 * Reconstruct normalised records from the previously committed snapshot, so a run can keep data from a
 * source that is unavailable this time (no URA key, MRT download failed, --skip hdb, ...).
 */
import fs from "node:fs";
import path from "node:path";
import { monthLabel } from "../../src/lib/data/months";
import type {
  DatasetMeta,
  HdbBlock,
  HdbRentFile,
  HdbTxFile,
  MrtStation,
  NewLaunch,
  PrivateProject,
  PrivateRentFile,
  PrivateTxFile,
  School,
  SourceInfo,
} from "../../src/lib/data/types";
import type { RawHdbBlockInfo, RawHdbRental, RawHdbSale, RawLaunch, RawPrivateRental, RawPrivateSale } from "./types";

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function listJson(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

export interface PreviousSnapshot {
  sources: SourceInfo[];
  hdbSales: RawHdbSale[];
  hdbBlockInfo: RawHdbBlockInfo[];
  hdbRentals: RawHdbRental[];
  privateSales: RawPrivateSale[];
  privateRentals: RawPrivateRental[];
  launches: RawLaunch[];
  mrtStations: MrtStation[];
  schools: School[];
}

export function loadPrevious(dir: string): PreviousSnapshot {
  const meta = readJson<DatasetMeta | null>(path.join(dir, "meta.json"), null);
  const out: PreviousSnapshot = { sources: meta?.fixture ? [] : (meta?.sources ?? []), hdbSales: [], hdbBlockInfo: [], hdbRentals: [], privateSales: [], privateRentals: [], launches: [], mrtStations: [], schools: [] };
  if (!meta || meta.fixture) return out; // never carry synthetic fixture data into a real snapshot

  out.mrtStations = readJson<MrtStation[]>(path.join(dir, "geo/mrt-stations.json"), []);
  out.schools = readJson<School[]>(path.join(dir, "geo/schools.json"), []);

  const blocks = readJson<HdbBlock[]>(path.join(dir, "hdb/blocks.json"), []);
  const blockBySlug = new Map(blocks.map((b) => [b.slug, b]));
  for (const b of blocks) {
    if (b.yearCompleted == null && b.dwellingUnits == null) continue;
    out.hdbBlockInfo.push({
      block: b.block,
      street: b.street,
      town: b.town,
      maxFloor: b.maxFloor,
      yearCompleted: b.yearCompleted,
      residential: true,
      commercial: b.facilities?.commercial ?? false,
      marketHawker: b.facilities?.marketHawker ?? false,
      miscellaneous: b.facilities?.miscellaneous ?? false,
      multistoreyCarpark: b.facilities?.multistoreyCarpark ?? false,
      precinctPavilion: b.facilities?.precinctPavilion ?? false,
      totalDwellingUnits: b.dwellingUnits,
      unitMix: b.unitMix as Record<string, number>,
    });
  }
  for (const file of listJson(path.join(dir, "hdb/tx"))) {
    const f = readJson<HdbTxFile | null>(file, null);
    if (!f) continue;
    for (let i = 0; i < f.m.length; i++) {
      const b = blockBySlug.get(f.blocks[f.b[i]]);
      if (!b) continue;
      out.hdbSales.push({
        month: monthLabel(f.m[i]),
        town: f.town,
        flatType: f.flatTypes[f.t[i]],
        block: b.block,
        street: b.street,
        storeyRange: f.storeys[f.s[i]],
        floorAreaSqm: f.a[i] / 10,
        flatModel: f.models[f.md[i]],
        leaseCommenceYear: b.leaseCommenceYear,
        remainingLeaseMonths: f.rl[i] >= 0 ? f.rl[i] : null,
        price: f.p[i],
      });
    }
  }
  for (const file of listJson(path.join(dir, "hdb/rentals"))) {
    const f = readJson<HdbRentFile | null>(file, null);
    if (!f) continue;
    for (let i = 0; i < f.m.length; i++) {
      const b = blockBySlug.get(f.blocks[f.b[i]]);
      if (!b) continue;
      out.hdbRentals.push({ month: monthLabel(f.m[i]), town: f.town, block: b.block, street: b.street, flatType: f.flatTypes[f.t[i]], monthlyRent: f.r[i] });
    }
  }

  const projects = readJson<PrivateProject[]>(path.join(dir, "private/projects.json"), []);
  const projBySlug = new Map(projects.map((p) => [p.slug, p]));
  const projectName = (p: PrivateProject) => (p.slug.startsWith("landed-") ? "LANDED HOUSING DEVELOPMENT" : p.name);
  for (const file of listJson(path.join(dir, "private/tx"))) {
    const f = readJson<PrivateTxFile | null>(file, null);
    if (!f) continue;
    for (let i = 0; i < f.m.length; i++) {
      const p = projBySlug.get(f.projects[f.pj[i]]);
      if (!p) continue;
      out.privateSales.push({
        project: projectName(p),
        street: p.street,
        district: f.district,
        marketSegment: p.segment,
        propertyType: f.propertyTypes[f.pt[i]],
        tenure: p.tenure?.raw ?? null,
        month: monthLabel(f.m[i]),
        areaSqm: f.a[i] / 10,
        floorRange: f.floorRanges[f.fr[i]],
        typeOfSale: (f.ts[i] as 1 | 2 | 3) ?? 3,
        typeOfArea: f.ta[i] === 0 ? "Strata" : f.ta[i] === 1 ? "Land" : "Unknown",
        noOfUnits: f.n[i],
        price: f.p[i],
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        unit: f.unit?.[i] ?? null,
        address: f.address?.[i] ?? null,
      });
    }
  }
  for (const file of listJson(path.join(dir, "private/rentals"))) {
    const f = readJson<PrivateRentFile | null>(file, null);
    if (!f) continue;
    for (let i = 0; i < f.m.length; i++) {
      const p = projBySlug.get(f.projects[f.pj[i]]);
      if (!p) continue;
      out.privateRentals.push({
        project: projectName(p),
        street: p.street,
        district: f.district,
        propertyType: f.propertyTypes[f.pt[i]],
        month: monthLabel(f.m[i]),
        monthlyRent: f.r[i],
        areaSqmLow: f.alo[i] >= 0 ? f.alo[i] : null,
        areaSqmHigh: f.ahi[i] >= 0 ? f.ahi[i] : null,
        bedrooms: f.br[i] >= 0 ? f.br[i] : null,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
      });
    }
  }
  out.launches = readJson<NewLaunch[]>(path.join(dir, "private/launches.json"), []).map((l) => ({
    project: l.name,
    street: l.street,
    district: l.district,
    marketSegment: l.segment,
    developer: l.developer,
    propertyType: l.type === "ec" ? "Executive Condominium" : l.type === "landed" ? "Terrace" : "Condominium",
    totalUnits: l.totalUnits,
    expectedCompletionYear: l.expectedCompletionYear,
    tenure: l.tenure?.raw ?? null,
    status: l.status,
    months: l.sales,
    lat: l.lat ?? null,
    lng: l.lng ?? null,
  }));
  return out;
}
