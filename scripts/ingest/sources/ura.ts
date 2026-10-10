/**
 * URA Data Service (docs/research/ura-api.md). Requires URA_ACCESS_KEY (free registration).
 * Private residential transactions (5 years), rentals (~3 years), developer sales (~3 years), pipeline.
 * Response shapes for developer sales and pipeline are partly UNVERIFIED, so parsing is defensive and
 * the first raw record of each service is logged for verification.
 */
import { fetchWithRetry, log, pushAll, sleep } from "../http";
import { monthIndexFromMmyy, monthLabel } from "../../../src/lib/data/months";
import { svy21ToWgs84 } from "./svy21";
import type { RawLaunch, RawLaunchMonth, RawPrivateRental, RawPrivateSale } from "../types";

const URA_BASE = "https://eservice.ura.gov.sg/uraDataService";
const UA = "Mozilla/5.0 (compatible; PlotlineIngest/1.0; +https://github.com/stevosaur/agent-sparkle-ledger)";

interface Envelope<T> {
  Status: string;
  Message?: string;
  Result: T;
}

function decodeBody(buf: ArrayBuffer): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // accented project names (e.g. ENCHANTÉ) arrive as Windows-1252
    text = new TextDecoder("windows-1252").decode(buf);
  }
  return JSON.parse(text);
}

const numOf = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "" || s === "-" || /^na$/i.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const SEGMENTS = new Set(["CCR", "RCR", "OCR"]);
const segmentOf = (v: unknown): "CCR" | "RCR" | "OCR" | null => {
  const s = String(v ?? "").toUpperCase();
  return SEGMENTS.has(s) ? (s as "CCR" | "RCR" | "OCR") : null;
};

function coords(x: unknown, y: unknown): { lat: number | null; lng: number | null } {
  const e = numOf(x);
  const nN = numOf(y);
  if (e == null || nN == null) return { lat: null, lng: null };
  const p = svy21ToWgs84(nN, e);
  if (!(p.lat > 1.15 && p.lat < 1.48 && p.lng > 103.59 && p.lng < 104.1)) return { lat: null, lng: null };
  return { lat: p.lat, lng: p.lng };
}

export class UraClient {
  private token: string | null = null;
  constructor(private readonly accessKey: string) {}

  private async getToken(): Promise<string> {
    const res = await fetchWithRetry(`${URA_BASE}/insertNewToken/v1`, { headers: { AccessKey: this.accessKey, "User-Agent": UA, Accept: "application/json" }, tries: 3, timeoutMs: 60_000 });
    const body = decodeBody(await res.arrayBuffer()) as Envelope<string>;
    if (body.Status !== "Success" || typeof body.Result !== "string" || !body.Result) throw new Error(`URA token: ${body.Message || body.Status}`);
    this.token = body.Result;
    return this.token;
  }

  async invoke<T>(params: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams(params).toString();
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = this.token ?? (await this.getToken());
      const res = await fetchWithRetry(`${URA_BASE}/invokeUraDS/v1?${qs}`, {
        headers: { AccessKey: this.accessKey, Token: token, "User-Agent": UA, Accept: "application/json" },
        tries: 3,
        timeoutMs: 180_000,
      });
      const body = decodeBody(await res.arrayBuffer()) as Envelope<T>;
      if (body.Status === "Success") return body.Result;
      if (attempt === 0 && /token/i.test(body.Message ?? "")) {
        this.token = null;
        continue;
      }
      throw new Error(`URA ${params.service}: ${body.Message || body.Status}`);
    }
    throw new Error(`URA ${params.service}: token refresh failed`);
  }
}

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

interface UraTxProject {
  project: string;
  street: string;
  marketSegment?: string;
  x?: string;
  y?: string;
  transaction?: Record<string, unknown>[];
}

export function parseTransactions(result: UraTxProject[]): RawPrivateSale[] {
  const out: RawPrivateSale[] = [];
  for (const p of result ?? []) {
    const { lat, lng } = coords(p.x, p.y);
    for (const t of p.transaction ?? []) {
      const area = numOf(t.area);
      const price = numOf(t.price);
      const cd = String(t.contractDate ?? "");
      if (!area || !price || !/^\d{4}$/.test(cd)) continue;
      const ts = Number(t.typeOfSale);
      const toa = String(t.typeOfArea ?? "");
      out.push({
        project: String(p.project ?? "").trim().toUpperCase(),
        street: String(p.street ?? "").trim().toUpperCase(),
        district: numOf(t.district),
        marketSegment: segmentOf(p.marketSegment),
        propertyType: String(t.propertyType ?? "").trim(),
        tenure: t.tenure ? String(t.tenure).trim() : null,
        month: monthLabel(monthIndexFromMmyy(cd)),
        areaSqm: area,
        floorRange: String(t.floorRange ?? "-").trim() || "-",
        typeOfSale: ts === 1 || ts === 2 || ts === 3 ? ts : 3,
        typeOfArea: /strata/i.test(toa) ? "Strata" : /land/i.test(toa) ? "Land" : "Unknown",
        noOfUnits: numOf(t.noOfUnits) ?? 1,
        price,
        lat,
        lng,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Rentals                                                             */
/* ------------------------------------------------------------------ */

interface UraRentProject {
  project: string;
  street: string;
  x?: string;
  y?: string;
  rental?: Record<string, unknown>[];
}

/** "1500-1600" -> [1500, 1600]; ">3000" -> [3000, null]; "<400" -> [null, 400] */
function band(v: unknown): [number | null, number | null] {
  const s = String(v ?? "").replace(/\s/g, "");
  let m = /^(\d+)-(\d+)$/.exec(s);
  if (m) return [Number(m[1]), Number(m[2])];
  m = /^>(\d+)$/.exec(s);
  if (m) return [Number(m[1]), null];
  m = /^<(\d+)$/.exec(s);
  if (m) return [null, Number(m[1])];
  return [null, null];
}

export function parseRentals(result: UraRentProject[]): RawPrivateRental[] {
  const out: RawPrivateRental[] = [];
  for (const p of result ?? []) {
    const { lat, lng } = coords(p.x, p.y);
    for (const r of p.rental ?? []) {
      const rent = numOf(r.rent);
      const ld = String(r.leaseDate ?? "");
      if (!rent || !/^\d{4}$/.test(ld)) continue;
      // prefer the sqft band (always matches URA's e-service), convert to sqm
      const [lo, hi] = band(r.areaSqft);
      const [sLo, sHi] = band(r.areaSqm);
      out.push({
        project: String(p.project ?? "").trim().toUpperCase(),
        street: String(p.street ?? "").trim().toUpperCase(),
        district: numOf(r.district),
        propertyType: String(r.propertyType ?? "").trim(),
        month: monthLabel(monthIndexFromMmyy(ld)),
        monthlyRent: rent,
        areaSqmLow: lo != null ? Math.round(lo / 10.764) : sLo,
        areaSqmHigh: hi != null ? Math.round(hi / 10.764) : sHi,
        bedrooms: numOf(r.noOfBedRoom),
        lat,
        lng,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Developer sales + pipeline -> launches                              */
/* ------------------------------------------------------------------ */

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) if (o[k] != null && o[k] !== "") return o[k];
  return undefined;
};

export function parseDeveloperSales(result: Record<string, unknown>[], refPeriod: string): { key: string; meta: Partial<RawLaunch>; month: RawLaunchMonth }[] {
  const out: { key: string; meta: Partial<RawLaunch>; month: RawLaunchMonth }[] = [];
  const month = monthLabel(monthIndexFromMmyy(refPeriod));
  for (const p of result ?? []) {
    const project = String(p.project ?? "").trim().toUpperCase();
    if (!project) continue;
    const rows = (Array.isArray(p.developerSales) ? p.developerSales : Array.isArray(p.developerSale) ? p.developerSale : [p]) as Record<string, unknown>[];
    const { lat, lng } = coords(p.x, p.y);
    for (const r of rows) {
      out.push({
        key: `${project}|${String(p.street ?? "").trim().toUpperCase()}`,
        meta: {
          project,
          street: p.street ? String(p.street).trim().toUpperCase() : null,
          district: numOf(pick(p, "district") ?? pick(r, "district")),
          marketSegment: segmentOf(pick(p, "marketSegment") ?? pick(r, "marketSegment")),
          developer: (pick(p, "developer", "developerName") as string | undefined)?.trim() ?? null,
          propertyType: (pick(p, "propertyType") ?? pick(r, "propertyType")) as string | null,
          totalUnits: numOf(pick(r, "unitsAvail", "totalUnits") ?? pick(p, "unitsAvail", "totalUnits")),
          lat,
          lng,
        },
        month: {
          month,
          launchedInMonth: numOf(pick(r, "launchedInMonth")),
          soldInMonth: numOf(pick(r, "soldInMonth")),
          launchedToDate: numOf(pick(r, "launchedToDate")),
          soldToDate: numOf(pick(r, "soldToDate")),
          medianPsf: numOf(pick(r, "medianPrice", "medianPsf")),
          lowestPsf: numOf(pick(r, "lowestPrice", "lowestPsf")),
          highestPsf: numOf(pick(r, "highestPrice", "highestPsf")),
        },
      });
    }
  }
  return out;
}

export function parsePipeline(result: Record<string, unknown>[]): RawLaunch[] {
  return (result ?? [])
    .map((p) => {
      const project = String(p.project ?? "").trim().toUpperCase();
      const landed = (numOf(p.noOfDetachedHouse) ?? 0) + (numOf(p.noOfSemiDetached) ?? 0) + (numOf(p.noOfTerrace) ?? 0);
      const nonLanded = (numOf(p.noOfApartment) ?? 0) + (numOf(p.noOfCondo) ?? 0);
      return {
        project,
        street: p.street ? String(p.street).trim().toUpperCase() : null,
        district: numOf(p.district),
        marketSegment: segmentOf(p.marketSegment),
        developer: (pick(p, "developerName", "developer") as string | undefined)?.trim() ?? null,
        propertyType: landed > 0 && nonLanded === 0 ? "Terrace" : (pick(p, "propertyType") as string | undefined) ?? null,
        totalUnits: numOf(p.totalUnits),
        expectedCompletionYear: numOf(pick(p, "expectedTOPYear", "expectedTopYear", "expectedTOP")),
        tenure: null,
        status: "upcoming" as const,
        months: [],
        ...coords(p.x, p.y),
      };
    })
    .filter((p) => p.project);
}

/** Merge developer-sales months with pipeline entries into launches. */
export function buildLaunches(devSales: ReturnType<typeof parseDeveloperSales>, pipeline: RawLaunch[]): RawLaunch[] {
  const map = new Map<string, RawLaunch>();
  for (const d of devSales) {
    let l = map.get(d.key);
    if (!l) {
      l = {
        project: d.meta.project!,
        street: d.meta.street ?? null,
        district: d.meta.district ?? null,
        marketSegment: d.meta.marketSegment ?? null,
        developer: d.meta.developer ?? null,
        propertyType: d.meta.propertyType ?? null,
        totalUnits: d.meta.totalUnits ?? null,
        expectedCompletionYear: null,
        tenure: null,
        status: "launched",
        months: [],
        lat: d.meta.lat ?? null,
        lng: d.meta.lng ?? null,
      };
      map.set(d.key, l);
    }
    if (!l.months.some((m) => m.month === d.month.month)) l.months.push(d.month);
    l.totalUnits = l.totalUnits ?? d.meta.totalUnits ?? null;
  }
  // a project counts as launched once any units have been launched
  for (const l of map.values()) {
    const launched = l.months.some((m) => (m.launchedToDate ?? 0) > 0 || (m.soldToDate ?? 0) > 0);
    if (!launched) l.status = "upcoming";
  }
  for (const p of pipeline) {
    const existing = [...map.values()].find((l) => l.project === p.project);
    if (existing) {
      existing.expectedCompletionYear = existing.expectedCompletionYear ?? p.expectedCompletionYear;
      existing.totalUnits = existing.totalUnits ?? p.totalUnits;
      existing.developer = existing.developer ?? p.developer;
    } else map.set(`${p.project}|${p.street ?? ""}`, p);
  }
  return [...map.values()];
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

function lastMonths(now: Date, count: number): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = 0; i < count; i++) {
    d.setUTCMonth(d.getUTCMonth() - 1);
    out.push(`${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCFullYear() % 100).padStart(2, "0")}`);
  }
  return out;
}

function lastQuarters(now: Date, count: number): string[] {
  const out: string[] = [];
  let y = now.getUTCFullYear();
  let q = Math.floor(now.getUTCMonth() / 3) + 1;
  for (let i = 0; i < count; i++) {
    out.push(`${String(y % 100).padStart(2, "0")}q${q}`);
    q -= 1;
    if (q === 0) {
      q = 4;
      y -= 1;
    }
  }
  return out;
}

export async function fetchUra(accessKey: string, now = new Date()) {
  const ura = new UraClient(accessKey);
  const sales: RawPrivateSale[] = [];
  for (const batch of ["1", "2", "3", "4"]) {
    const result = await ura.invoke<UraTxProject[]>({ service: "PMI_Resi_Transaction", batch });
    if (batch === "1" && result?.[0]) log("ura", `sample transaction project: ${JSON.stringify(result[0]).slice(0, 400)}`);
    const parsed = parseTransactions(result);
    if (parsed.length === 0) throw new Error(`URA transactions batch ${batch} returned no rows`);
    log("ura", `transactions batch ${batch}: ${parsed.length} rows`);
    pushAll(sales, parsed);
    await sleep(1000);
  }

  const rentals: RawPrivateRental[] = [];
  for (const refPeriod of lastQuarters(now, 13)) {
    try {
      const result = await ura.invoke<UraRentProject[]>({ service: "PMI_Resi_Rental", refPeriod });
      const parsed = parseRentals(result);
      log("ura", `rentals ${refPeriod}: ${parsed.length} rows`);
      pushAll(rentals, parsed);
    } catch (err) {
      log("ura", `rentals ${refPeriod} failed: ${(err as Error).message}`);
    }
    await sleep(500);
  }

  const dev: ReturnType<typeof parseDeveloperSales> = [];
  let loggedDev = false;
  for (const refPeriod of lastMonths(now, 36)) {
    try {
      const result = await ura.invoke<Record<string, unknown>[]>({ service: "PMI_Resi_Developer_Sales", refPeriod });
      if (!loggedDev && result?.[0]) {
        log("ura", `sample developer sales record: ${JSON.stringify(result[0]).slice(0, 600)}`);
        loggedDev = true;
      }
      pushAll(dev, parseDeveloperSales(result, refPeriod));
    } catch (err) {
      log("ura", `developer sales ${refPeriod} failed: ${(err as Error).message}`);
    }
    await sleep(300);
  }
  let pipeline: RawLaunch[] = [];
  try {
    const result = await ura.invoke<Record<string, unknown>[]>({ service: "PMI_Resi_Pipeline" });
    if (result?.[0]) log("ura", `sample pipeline record: ${JSON.stringify(result[0]).slice(0, 600)}`);
    pipeline = parsePipeline(result);
  } catch (err) {
    log("ura", `pipeline failed: ${(err as Error).message}`);
  }

  // Rental projects carry no coordinates for some rows and no segment: fill from transactions where names match.
  const coordByProject = new Map<string, { lat: number; lng: number }>();
  for (const s of sales) if (s.lat != null && s.lng != null && !coordByProject.has(s.project)) coordByProject.set(s.project, { lat: s.lat, lng: s.lng });
  for (const r of rentals) {
    if (r.lat == null) {
      const c = coordByProject.get(r.project);
      if (c) {
        r.lat = c.lat;
        r.lng = c.lng;
      }
    }
  }
  const launches = buildLaunches(dev, pipeline);
  for (const l of launches) {
    if (l.lat == null) {
      const c = coordByProject.get(l.project);
      if (c) {
        l.lat = c.lat;
        l.lng = c.lng;
      }
    }
    if (!l.tenure) l.tenure = sales.find((s) => s.project === l.project && s.tenure)?.tenure ?? null;
  }
  return { sales, rentals, launches };
}
