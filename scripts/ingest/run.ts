/**
 * Ingestion pipeline entry point: `npm run ingest` (see .github/workflows/ingest.yml).
 *
 *   tsx scripts/ingest/run.ts [--out data] [--skip hdb,ura,...] [--geocode-minutes 300]
 *
 * Fetches every source, normalises it, and rebuilds the committed snapshot in data/ via build.ts.
 * Fail-safe rules:
 * - HDB resale data is the backbone: if any era fails validation the run aborts and data/ is untouched.
 * - Optional sources (URA, MAS, OneMap, MOE, LTA) that fail or lack credentials fall back to the
 *   previous snapshot's records and are marked in meta.sources with their status.
 */
import path from "node:path";
import { buildSnapshot } from "./build";
import { log } from "./http";
import { hdbGeoKey, type Geocode, type RawHdbBlockInfo, type RawHdbRental, type RawHdbSale, type RawLaunch, type RawPrivateRental, type RawPrivateSale, type SnapshotInput } from "./types";
import { DATASETS, datasetPage, downloadDataset } from "./sources/datagov";
import { parsePropertyInfo, parseRentals, parseResaleEra, RESALE_ERAS } from "./sources/hdb";
import { GeocodeCache, OneMapClient, OneMapRateLimited } from "./sources/onemap";
import { buildStations } from "./sources/mrt";
import { parseSchools, toSchool } from "./sources/schools";
import { fetchRates } from "./sources/rates";
import { fetchUra } from "./sources/ura";
import { loadRealis } from "./sources/realis";
import { loadPrevious } from "./previous";
import type { MrtStation, School, SourceInfo } from "../../src/lib/data/types";

const ROOT = path.resolve(__dirname, "../..");
const args = process.argv.slice(2);
const argValue = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const OUT = path.resolve(ROOT, argValue("out") ?? "data");
const SKIP = new Set((argValue("skip") ?? "").split(",").filter(Boolean));
const GEOCODE_MINUTES = Number(argValue("geocode-minutes") ?? process.env.GEOCODE_MINUTES ?? 300);
const CACHE_DIR = path.join(ROOT, "ingest-cache");

const SODL = "Singapore Open Data Licence v1.0";

function source(partial: Partial<SourceInfo> & Pick<SourceInfo, "id" | "name" | "publisher" | "url">): SourceInfo {
  return { licence: SODL, status: "not-run", fetchedAt: null, latestPeriod: null, rows: 0, ...partial };
}

function latest(months: { month: string }[]): string | null {
  let best: string | null = null;
  for (const r of months) if (!best || r.month > best) best = r.month;
  return best;
}

async function main() {
  const started = Date.now();
  const now = new Date();
  const nowIso = now.toISOString();
  const previous = loadPrevious(OUT);
  const sources: SourceInfo[] = [];
  log("run", `output ${OUT}; skip [${[...SKIP].join(",")}]; geocode budget ${GEOCODE_MINUTES} min`);

  /* ------------------------------- HDB resale (required) ------------------------------- */
  let hdbSales: RawHdbSale[] = [];
  let hdbBlockInfo: RawHdbBlockInfo[] = [];
  let hdbRentals: RawHdbRental[] = [];
  if (SKIP.has("hdb")) {
    hdbSales = previous.hdbSales;
    hdbBlockInfo = previous.hdbBlockInfo;
    hdbRentals = previous.hdbRentals;
    sources.push(...previous.sources.filter((s) => s.id.startsWith("hdb")));
    log("run", `hdb skipped: reusing ${hdbSales.length} previous sales`);
  } else {
    for (const era of RESALE_ERAS) {
      const id = DATASETS[era.key as keyof typeof DATASETS];
      const csv = await downloadDataset(id, { csv: true });
      const { sales, report } = parseResaleEra(csv, era);
      log("hdb", `${era.key}: ${report.rows} rows, kept ${report.kept}, dropped ${JSON.stringify(report.dropped)}${report.unknownTowns.length ? `, new towns ${report.unknownTowns.join("/")}` : ""}`);
      if (report.rows < era.minRows) throw new Error(`${era.key}: only ${report.rows} rows (expected >= ${era.minRows}); aborting without touching data/`);
      if (report.kept < report.rows * 0.98) throw new Error(`${era.key}: dropped too many rows (${report.rows - report.kept}); aborting`);
      hdbSales.push(...sales);
    }
    sources.push(
      source({
        id: "hdb-resale",
        name: "Resale flat prices (1990 onwards)",
        publisher: "Housing & Development Board via data.gov.sg",
        url: "https://data.gov.sg/collections/189/view",
        status: "ok",
        fetchedAt: nowIso,
        latestPeriod: latest(hdbSales),
        rows: hdbSales.length,
        note: "Months up to Feb 2012 are approval dates; from Mar 2012 registration dates. Excludes resales between relatives and part-share resales.",
      }),
    );

    const infoCsv = await downloadDataset(DATASETS.HDB_PROPERTY_INFO, { csv: true });
    hdbBlockInfo = parsePropertyInfo(infoCsv);
    if (hdbBlockInfo.length < 12_000) throw new Error(`HDB property information: only ${hdbBlockInfo.length} rows`);
    sources.push(source({ id: "hdb-property-info", name: "HDB Property Information", publisher: "Housing & Development Board via data.gov.sg", url: datasetPage(DATASETS.HDB_PROPERTY_INFO), status: "ok", fetchedAt: nowIso, rows: hdbBlockInfo.length }));

    try {
      const rentCsv = await downloadDataset(DATASETS.HDB_RENTALS, { csv: true });
      const { rentals, report } = parseRentals(rentCsv);
      if (report.rows < 150_000) throw new Error(`only ${report.rows} rows`);
      hdbRentals = rentals;
      sources.push(source({ id: "hdb-rentals", name: "Renting out of flats (2021 onwards)", publisher: "Housing & Development Board via data.gov.sg", url: datasetPage(DATASETS.HDB_RENTALS), status: "ok", fetchedAt: nowIso, latestPeriod: latest(rentals), rows: rentals.length, note: "Rents are declared by owners and not verified by HDB." }));
    } catch (err) {
      log("hdb", `rentals failed: ${(err as Error).message}; reusing previous`);
      hdbRentals = previous.hdbRentals;
      sources.push({ ...(previous.sources.find((s) => s.id === "hdb-rentals") ?? source({ id: "hdb-rentals", name: "Renting out of flats (2021 onwards)", publisher: "Housing & Development Board via data.gov.sg", url: datasetPage(DATASETS.HDB_RENTALS) })), status: "error", note: (err as Error).message });
    }
  }

  /* ------------------------------- MRT stations ------------------------------- */
  let mrtStations: MrtStation[] = previous.mrtStations;
  if (!SKIP.has("mrt")) {
    try {
      const text = await downloadDataset(DATASETS.LTA_MRT_EXITS, { csv: false });
      const geojson = JSON.parse(text) as { features?: unknown[] };
      const n = geojson.features?.length ?? 0;
      if (n < 400) throw new Error(`only ${n} exit features`);
      const { stations, unmatched } = buildStations(geojson as never);
      if (unmatched.length) log("mrt", `stations without line reference (codes/lines empty): ${unmatched.join(", ")}`);
      mrtStations = stations;
      sources.push(source({ id: "lta-mrt", name: "MRT station exits", publisher: "Land Transport Authority via data.gov.sg", url: datasetPage(DATASETS.LTA_MRT_EXITS), status: "ok", fetchedAt: nowIso, rows: stations.filter((s) => s.status === "operational").length, note: "Station positions are the average of exit locations. Future stations from LTA announcements (scripts/ingest/reference)." }));
    } catch (err) {
      log("mrt", `failed: ${(err as Error).message}; reusing previous`);
      sources.push({ ...(previous.sources.find((s) => s.id === "lta-mrt") ?? source({ id: "lta-mrt", name: "MRT station exits", publisher: "Land Transport Authority via data.gov.sg", url: datasetPage(DATASETS.LTA_MRT_EXITS) })), status: "error", note: (err as Error).message });
    }
  }

  /* ------------------------------- Geocoding ------------------------------- */
  const cache = new GeocodeCache(path.join(CACHE_DIR, "geocodes.json"));
  const onemap = new OneMapClient();
  const deadline = started + GEOCODE_MINUTES * 60_000;
  let geocodeStatus: SourceInfo["status"] = "ok";
  let geocodeNote = onemap.hasToken ? "OneMap search with token" : "OneMap search without token (slow; set ONEMAP_EMAIL / ONEMAP_PASSWORD)";

  // HDB blocks: unique (block, street) keys, most recently transacted first.
  const lastSale = new Map<string, string>();
  for (const s of hdbSales) {
    const k = hdbGeoKey(s.block, s.street);
    if ((lastSale.get(k) ?? "") < s.month) lastSale.set(k, s.month);
  }
  for (const b of hdbBlockInfo) if (b.residential && !lastSale.has(hdbGeoKey(b.block, b.street))) lastSale.set(hdbGeoKey(b.block, b.street), "0000-00");
  const keys = [...lastSale.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([k]) => k);
  const todo = SKIP.has("geocode") ? [] : keys.filter((k) => cache.needsLookup(`HDB|${k}`));
  log("geocode", `${keys.length} HDB blocks, ${todo.length} need lookup (${geocodeNote})`);
  let done = 0;
  try {
    for (const k of todo) {
      if (Date.now() > deadline) {
        geocodeNote += `; time budget reached with ${todo.length - done} blocks left for the next run`;
        break;
      }
      const [block, street] = k.split("|");
      cache.set(`HDB|${k}`, await onemap.geocodeHdb(block, street));
      if (++done % 250 === 0) log("geocode", `${done}/${todo.length} (${onemap.calls} calls)`);
    }
  } catch (err) {
    geocodeStatus = "error";
    geocodeNote += `; stopped${err instanceof OneMapRateLimited ? " (rate limited / auth)" : ""}: ${(err as Error).message}`;
    log("geocode", `stopped: ${(err as Error).message}`);
  }

  /* ------------------------------- Schools ------------------------------- */
  let schools: School[] = previous.schools;
  if (!SKIP.has("schools")) {
    try {
      const csv = await downloadDataset(DATASETS.MOE_SCHOOLS, { csv: true });
      const raw = parseSchools(csv);
      if (raw.length < 300) throw new Error(`only ${raw.length} schools`);
      const out: School[] = [];
      for (const s of raw) {
        const key = `POSTAL|${s.postal}`;
        if (cache.needsLookup(key) && Date.now() < deadline + 30 * 60_000) cache.set(key, await onemap.geocodePostal(s.postal));
        const g = cache.get(key);
        if (g?.status === "ok" && g.lat != null && g.lng != null) out.push(toSchool(s, g.lat, g.lng));
      }
      schools = out;
      sources.push(source({ id: "moe-schools", name: "General information of schools", publisher: "Ministry of Education via data.gov.sg; locations from OneMap (SLA)", url: datasetPage(DATASETS.MOE_SCHOOLS), status: "ok", fetchedAt: nowIso, rows: out.length, note: out.length < raw.length ? `${raw.length - out.length} schools not yet geocoded` : undefined }));
    } catch (err) {
      log("schools", `failed: ${(err as Error).message}; reusing previous`);
      sources.push({ ...(previous.sources.find((s) => s.id === "moe-schools") ?? source({ id: "moe-schools", name: "General information of schools", publisher: "Ministry of Education via data.gov.sg", url: datasetPage(DATASETS.MOE_SCHOOLS) })), status: "error", note: (err as Error).message });
    }
  }
  cache.save();

  const hdbGeocodes = new Map<string, Geocode>();
  let geocoded = 0;
  for (const [key, e] of cache.entries()) {
    if (!key.startsWith("HDB|") || e.status !== "ok" || e.lat == null || e.lng == null) continue;
    hdbGeocodes.set(key.slice(4), { lat: e.lat, lng: e.lng, postal: e.postal ?? null, roadName: e.roadName ?? null });
    geocoded++;
  }
  sources.push(source({ id: "onemap", name: "OneMap search (block locations and postal codes)", publisher: "Singapore Land Authority", url: "https://www.onemap.gov.sg/", licence: "OneMap API Terms of Service", status: geocodeStatus, fetchedAt: nowIso, rows: geocoded, note: `${geocoded} of ${keys.length} HDB blocks located. ${geocodeNote}` }));

  /* ------------------------------- URA (private) ------------------------------- */
  let privateSales: RawPrivateSale[] = previous.privateSales;
  let privateRentals: RawPrivateRental[] = previous.privateRentals;
  let launches: RawLaunch[] = previous.launches;
  const uraKey = process.env.URA_ACCESS_KEY;
  const uraSource = (partial: Partial<SourceInfo>) =>
    source({ id: "ura", name: "Private residential transactions, rentals and developer sales", publisher: "Urban Redevelopment Authority (URA) Data Service", url: "https://eservice.ura.gov.sg/maps/api/", ...partial });
  if (SKIP.has("ura")) {
    sources.push(...previous.sources.filter((s) => s.id === "ura"));
  } else if (!uraKey) {
    const prev = previous.sources.find((s) => s.id === "ura");
    sources.push(prev ? { ...prev, status: "missing-credentials", note: "URA_ACCESS_KEY not set; showing the previous snapshot" } : uraSource({ status: "missing-credentials", note: "Set URA_ACCESS_KEY (free registration) to load private property data." }));
  } else {
    try {
      const ura = await fetchUra(uraKey, now);
      // guard against truncated responses: refuse to shrink by more than half
      if (previous.privateSales.length && ura.sales.length < previous.privateSales.length * 0.5) throw new Error(`URA returned ${ura.sales.length} transactions vs ${previous.privateSales.length} previously`);
      privateSales = ura.sales;
      privateRentals = ura.rentals.length ? ura.rentals : previous.privateRentals;
      launches = ura.launches.length ? ura.launches : previous.launches;
      sources.push(uraSource({ status: "ok", fetchedAt: nowIso, latestPeriod: latest(privateSales), rows: privateSales.length, note: `${privateRentals.length} rental contracts, ${launches.length} launches/pipeline projects. URA does not endorse this site; figures are computed from URA data.` }));
    } catch (err) {
      log("ura", `failed: ${(err as Error).message}; reusing previous`);
      const prev = previous.sources.find((s) => s.id === "ura");
      sources.push({ ...(prev ?? uraSource({})), status: "error", note: (err as Error).message });
    }
  }

  /* ------------------------------- REALIS-style unit-level import (optional, local) ------------------------------- */
  const realisDir = process.env.REALIS_CSV_DIR;
  if (realisDir) {
    const realis = loadRealis(realisDir);
    log("realis", `${realis.length} unit-level transactions from ${realisDir}`);
    if (realis.length) {
      privateSales = mergeUnitLevel(privateSales, realis);
      sources.push(source({ id: "realis", name: "Unit-level private transactions (licensed import)", publisher: "Licensed data provider", url: "", licence: "Licensed — see the provider's terms", status: "ok", fetchedAt: nowIso, latestPeriod: latest(realis), rows: realis.length }));
    }
  }

  /* ------------------------------- Rates ------------------------------- */
  const { rates, live, note } = await fetchRates(now);
  sources.push(source({ id: "mas-sora", name: "SORA and compounded SORA", publisher: "Monetary Authority of Singapore", url: "https://eservices.mas.gov.sg/statistics/dir/domesticinterestrates.aspx", licence: "MAS website terms", status: live ? "ok" : process.env.MAS_API_KEY_ID ? "error" : "missing-credentials", fetchedAt: live ? nowIso : null, latestPeriod: rates.sora.compounded3m?.date ?? null, rows: rates.sora.series3m.length, note }));

  /* ------------------------------- Build ------------------------------- */
  const input: SnapshotInput = { generatedAt: nowIso, fixture: false, sources, hdbSales, hdbBlockInfo, hdbRentals, hdbGeocodes, privateSales, privateRentals, launches, mrtStations, schools, rates };
  const { meta } = buildSnapshot(input, OUT);
  log("run", `snapshot written in ${Math.round((Date.now() - started) / 60000)} min: ${JSON.stringify(meta.counts)}`);
}

/** Unit-level rows replace URA rows for the same project & month & price (URA has no unit numbers); others are appended. */
function mergeUnitLevel(ura: RawPrivateSale[], unit: RawPrivateSale[]): RawPrivateSale[] {
  const key = (s: RawPrivateSale) => `${s.project}|${s.month}|${s.price}|${Math.round(s.areaSqm)}`;
  const unitKeys = new Set(unit.map(key));
  return [...ura.filter((s) => !unitKeys.has(key(s))), ...unit];
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
