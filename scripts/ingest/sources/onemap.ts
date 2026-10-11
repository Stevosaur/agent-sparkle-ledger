/**
 * OneMap search geocoding (docs/research/onemap-api.md §1, §2, §4).
 * - Uses a token when ONEMAP_EMAIL / ONEMAP_PASSWORD are set (250 calls/min); otherwise tokenless with slow pacing.
 * - HDB blocks are matched by BLK_NO + canonical road name, never by block alone.
 * - Results (including confirmed no-match / ambiguous) are cached in ingest-cache/ so re-runs only geocode new keys.
 */
import fs from "node:fs";
import path from "node:path";
import { log, sleep } from "../http";

const SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search";
const TOKEN_URL = "https://www.onemap.gov.sg/api/auth/post/getToken";

export interface OneMapResult {
  SEARCHVAL: string;
  BLK_NO: string;
  ROAD_NAME: string;
  BUILDING: string;
  ADDRESS: string;
  POSTAL: string;
  LATITUDE: string;
  LONGITUDE: string;
}

interface OneMapResponse {
  found: number;
  totalNumPages: number;
  pageNum: number;
  results: OneMapResult[];
  error?: string;
}

export interface GeocodeEntry {
  status: "ok" | "no-match" | "ambiguous";
  lat?: number;
  lng?: number;
  postal?: string | null;
  roadName?: string | null;
  query?: string;
  at: string;
}

/* ------------------------------------------------------------------ */
/* Street name expansion                                               */
/* ------------------------------------------------------------------ */

export const HDB_ABBREV: Record<string, string> = {
  AVE: "AVENUE",
  ST: "STREET",
  RD: "ROAD",
  DR: "DRIVE",
  CRES: "CRESCENT",
  CL: "CLOSE",
  CTRL: "CENTRAL",
  CTR: "CENTRE",
  NTH: "NORTH",
  STH: "SOUTH",
  UPP: "UPPER",
  LOR: "LORONG",
  BT: "BUKIT",
  JLN: "JALAN",
  KG: "KAMPONG",
  TG: "TANJONG",
  PK: "PARK",
  PL: "PLACE",
  TER: "TERRACE",
  GDNS: "GARDENS",
  GDN: "GARDEN",
  HTS: "HEIGHTS",
  MKT: "MARKET",
  "C'WEALTH": "COMMONWEALTH",
  SQ: "SQUARE",
};
// "ST." (with a dot) means SAINT and is intentionally not expanded.

export function expandHdbStreet(street: string): string {
  return street
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .map((t) => HDB_ABBREV[t] ?? t)
    .join(" ");
}

export function canonRoad(s: string): string {
  return expandHdbStreet(s)
    .split(" ")
    .map((t) => (t === "SAINT" ? "ST." : t))
    .join(" ")
    .replace(/[.']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function hdbQueryVariants(block: string, street: string): string[] {
  const b = block.trim().toUpperCase().replace(/^(BLK|BLOCK)\s+/, "");
  const raw = street.trim().toUpperCase().replace(/\s+/g, " ");
  const exp = expandHdbStreet(raw);
  const v = [`${b} ${exp}`, `${b} ${raw}`];
  if (exp.includes("ST. ")) v.push(`${b} ${exp.replace("ST. ", "SAINT ")}`);
  return [...new Set(v)];
}

export function matchesHdb(r: Pick<OneMapResult, "BLK_NO" | "ROAD_NAME" | "ADDRESS">, block: string, street: string): boolean {
  const b = block.trim().toUpperCase().replace(/^(BLK|BLOCK)\s+/, "");
  if ((r.BLK_NO ?? "").trim().toUpperCase() !== b) return false;
  const want = canonRoad(street);
  if (r.ROAD_NAME && r.ROAD_NAME !== "NIL") return canonRoad(r.ROAD_NAME) === want;
  return ` ${canonRoad(r.ADDRESS ?? "")} `.includes(` ${want} `);
}

function inSingapore(lat: number, lng: number) {
  return lat >= 1.15 && lat <= 1.48 && lng >= 103.59 && lng <= 104.1;
}

/** Pick the matching result, or report ambiguity when matches carry different postal codes. */
export function pickHdbMatch(results: OneMapResult[], block: string, street: string): { match: OneMapResult | null; ambiguous: boolean } {
  const matches = results.filter((r) => matchesHdb(r, block, street)).filter((r) => inSingapore(parseFloat(r.LATITUDE), parseFloat(r.LONGITUDE)));
  if (matches.length === 0) return { match: null, ambiguous: false };
  const withPostal = matches.filter((r) => /^\d{6}$/.test(r.POSTAL));
  const pool = withPostal.length ? withPostal : matches;
  const postals = new Set(pool.map((r) => r.POSTAL));
  if (postals.size > 1) return { match: null, ambiguous: true };
  const plain = pool.find((r) => r.BUILDING === "NIL" || r.SEARCHVAL === r.ADDRESS) ?? pool[0];
  return { match: plain, ambiguous: false };
}

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

class RateLimited extends Error {}

export class OneMapClient {
  private token: { value: string; expiresAtMs: number } | null = null;
  private last = 0;
  readonly gapMs: number;
  calls = 0;

  constructor(private readonly creds = { email: process.env.ONEMAP_EMAIL, password: process.env.ONEMAP_PASSWORD }) {
    this.gapMs = creds.email && creds.password ? 350 : 1600;
  }

  get hasToken() {
    return Boolean(this.creds.email && this.creds.password);
  }

  private async getToken(force = false): Promise<string | null> {
    if (!this.hasToken) return null;
    const now = Date.now();
    if (!force && this.token && this.token.expiresAtMs - 6 * 3600_000 > now) return this.token.value;
    const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: this.creds.email, password: this.creds.password }) });
    if (!res.ok) throw new Error(`OneMap getToken HTTP ${res.status}`);
    const data = (await res.json()) as { access_token?: string; expiry_timestamp?: string | number; error?: string };
    if (!data.access_token) throw new Error(`OneMap getToken failed: ${data.error ?? "no access_token"}`);
    let exp = Number(data.expiry_timestamp);
    if (!Number.isFinite(exp) || exp <= 0) exp = now / 1000 + 72 * 3600;
    if (exp > 1e12) exp /= 1000;
    this.token = { value: data.access_token, expiresAtMs: exp * 1000 };
    return this.token.value;
  }

  private async pace() {
    const wait = this.last + this.gapMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
  }

  /** One search page; retries 429s with a long pause, refreshes the token once on auth errors. */
  async search(searchVal: string, pageNum = 1): Promise<OneMapResponse> {
    const url = `${SEARCH_URL}?${new URLSearchParams({ searchVal, returnGeom: "Y", getAddrDetails: "Y", pageNum: String(pageNum) })}`;
    let refreshed = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      await this.pace();
      this.calls++;
      const token = await this.getToken(refreshed && attempt > 0);
      let res: Response;
      try {
        res = await fetch(url, { headers: { Accept: "application/json", ...(token ? { Authorization: token } : {}) } });
      } catch (err) {
        log("onemap", `network error (${(err as Error).message}); retrying`);
        await sleep(5000 * (attempt + 1));
        continue;
      }
      const ct = res.headers.get("content-type") ?? "";
      if (res.status === 429 || (res.ok && !ct.includes("json"))) {
        await res.body?.cancel().catch(() => undefined);
        const pause = 60_000 * Math.min(4, attempt + 1);
        log("onemap", `rate limited; pausing ${pause / 1000}s`);
        await sleep(pause);
        continue;
      }
      if (res.status === 401 && !refreshed && this.hasToken) {
        refreshed = true;
        continue;
      }
      if (!res.ok) throw new Error(`OneMap search HTTP ${res.status}`);
      const body = (await res.json()) as OneMapResponse;
      if (body.error && /expired|invalid/i.test(body.error) && this.hasToken && !refreshed) {
        refreshed = true;
        continue;
      }
      if (body.error && (!Array.isArray(body.results) || body.results.length === 0) && /token/i.test(body.error)) {
        throw new RateLimited(`OneMap auth error: ${body.error}`);
      }
      return { ...body, results: Array.isArray(body.results) ? body.results : [] };
    }
    throw new RateLimited("OneMap: giving up after repeated rate limits");
  }

  /** Geocode an HDB block. Never returns no-match on auth/rate errors (those throw). */
  async geocodeHdb(block: string, street: string): Promise<GeocodeEntry> {
    let sawAmbiguous = false;
    for (const q of hdbQueryVariants(block, street)) {
      const first = await this.search(q, 1);
      const results = [...first.results];
      for (let p = 2; p <= Math.min(3, first.totalNumPages || 1); p++) results.push(...(await this.search(q, p)).results);
      const { match, ambiguous } = pickHdbMatch(results, block, street);
      if (match) {
        return {
          status: "ok",
          lat: Math.round(parseFloat(match.LATITUDE) * 1e6) / 1e6,
          lng: Math.round(parseFloat(match.LONGITUDE) * 1e6) / 1e6,
          postal: /^\d{6}$/.test(match.POSTAL) ? match.POSTAL : null,
          roadName: match.ROAD_NAME && match.ROAD_NAME !== "NIL" ? match.ROAD_NAME : null,
          query: q,
          at: new Date().toISOString(),
        };
      }
      if (ambiguous) sawAmbiguous = true;
    }
    return { status: sawAmbiguous ? "ambiguous" : "no-match", at: new Date().toISOString() };
  }

  /** Geocode a 6-digit postal code (schools, listings). */
  async geocodePostal(postal: string): Promise<GeocodeEntry> {
    const res = await this.search(postal, 1);
    const hit = res.results.find((r) => r.POSTAL === postal && inSingapore(parseFloat(r.LATITUDE), parseFloat(r.LONGITUDE)));
    if (!hit) return { status: "no-match", at: new Date().toISOString() };
    return {
      status: "ok",
      lat: Math.round(parseFloat(hit.LATITUDE) * 1e6) / 1e6,
      lng: Math.round(parseFloat(hit.LONGITUDE) * 1e6) / 1e6,
      postal,
      roadName: hit.ROAD_NAME && hit.ROAD_NAME !== "NIL" ? hit.ROAD_NAME : null,
      query: postal,
      at: new Date().toISOString(),
    };
  }
}

export { RateLimited as OneMapRateLimited };

/* ------------------------------------------------------------------ */
/* Persistent cache                                                    */
/* ------------------------------------------------------------------ */

export class GeocodeCache {
  private data: Record<string, GeocodeEntry>;
  private dirty = 0;
  constructor(private readonly file: string) {
    try {
      this.data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      this.data = {};
    }
  }
  get(key: string): GeocodeEntry | undefined {
    return this.data[key];
  }
  set(key: string, entry: GeocodeEntry) {
    this.data[key] = entry;
    if (++this.dirty >= 50) this.save();
  }
  /** keys needing a lookup: never seen, or a no-match/ambiguous older than `retryDays` */
  needsLookup(key: string, retryDays = 30): boolean {
    const e = this.data[key];
    if (!e) return true;
    if (e.status === "ok") return false;
    return Date.now() - Date.parse(e.at) > retryDays * 86_400_000;
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const sorted = Object.fromEntries(Object.entries(this.data).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(this.file, `${JSON.stringify(sorted, null, 0).replace(/\},"/g, '},\n"')}\n`);
    this.dirty = 0;
  }
  entries() {
    return Object.entries(this.data);
  }
}
