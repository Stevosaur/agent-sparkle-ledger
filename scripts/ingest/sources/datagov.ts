/** data.gov.sg dataset downloads (docs/research/datagov-api.md §3). */
import { fetchJson, log, pacer, sleep } from "../http";

const DL = (id: string) => `https://api-open.data.gov.sg/v1/public/api/datasets/${id}`;
const META = (id: string) => `https://api-production.data.gov.sg/v2/public/api/datasets/${id}/metadata`;

export const DATASETS = {
  RESALE_1990_1999: "d_ebc5ab87086db484f88045b47411ebc5",
  RESALE_2000_2012FEB: "d_43f493c6c50d54243cc1eab0df142d6a",
  RESALE_2012MAR_2014: "d_2d5ff9ea31397b66239f245f57751537",
  RESALE_2015_2016: "d_ea9ed51da2787afaf8e51f827c304208",
  RESALE_2017_ON: "d_8b84c4ee58e3cfc0ece0d773c8ca6abc",
  HDB_PROPERTY_INFO: "d_17f5382f26140b1fdae0ba2ef6239d2f",
  HDB_RENTALS: "d_c9f57187485a850908655db0e8cfe651",
  HDB_RPI: "d_14f63e595975691e7c24a27ae4c07c79",
  MOE_SCHOOLS: "d_688b934f82c1059ed0a6993d2a829089",
  LTA_MRT_EXITS: "d_b39d3a0871985372d7e1637193335da5",
} as const;

export const datasetPage = (id: string) => `https://data.gov.sg/datasets/${id}/view`;

function apiHeaders(): Record<string, string> {
  const key = process.env.DATAGOV_API_KEY || process.env.DATA_GOV_SG_API_KEY;
  return key ? { "x-api-key": key } : {};
}

// Anonymous download limit is 2 calls / 10 s (older docs: 5 / minute): pace >= 12 s without a key.
const pace = pacer(apiHeaders()["x-api-key"] ? 3000 : 12_500);

interface Envelope<T> {
  code: number;
  data?: T;
  errorMsg?: string;
  errMsg?: string;
}

export async function datasetLastUpdated(id: string): Promise<string | null> {
  try {
    const body = await getEnvelope<Record<string, unknown>>(META(id), {}, 4);
    const d = body.data ?? {};
    const v = d.lastUpdatedAt ?? d.last_updated_at ?? d.lastUpdated ?? d.updatedAt;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

/** GET JSON with retries on 429/5xx and on the HTTP-200 rate-limit envelope (code 24). */
async function getEnvelope<T>(url: string, init: RequestInit = {}, tries = 8): Promise<Envelope<T>> {
  for (let i = 0; i < tries; i++) {
    await pace();
    const body = await fetchJson<Envelope<T>>(url, { ...init, headers: { ...apiHeaders(), ...(init.headers ?? {}) } });
    if (body.code === 24) {
      log("datagov", `rate limited (code 24); backing off`);
      await sleep(Math.min(15_000 * 2 ** i, 180_000));
      continue;
    }
    return body;
  }
  throw new Error(`${url.split("?")[0]} -> rate limited after ${tries} tries`);
}

/** Expected dataset titles (prefix match, case-insensitive): dataset IDs can be deleted or reassigned. */
export const EXPECTED_TITLES: Partial<Record<string, string>> = {
  [DATASETS.RESALE_1990_1999]: "Resale Flat Prices",
  [DATASETS.RESALE_2000_2012FEB]: "Resale Flat Prices",
  [DATASETS.RESALE_2012MAR_2014]: "Resale Flat Prices",
  [DATASETS.RESALE_2015_2016]: "Resale Flat Prices",
  [DATASETS.RESALE_2017_ON]: "Resale flat prices",
  [DATASETS.HDB_PROPERTY_INFO]: "HDB Property Information",
  [DATASETS.HDB_RENTALS]: "Renting Out of Flats",
  [DATASETS.MOE_SCHOOLS]: "General information of schools",
  [DATASETS.LTA_MRT_EXITS]: "LTA MRT Station Exit",
};

/** Check the dataset's metadata name still matches what we expect (skipped silently if metadata is unavailable). */
export async function assertDatasetTitle(id: string): Promise<void> {
  const expected = EXPECTED_TITLES[id];
  if (!expected) return;
  let name: string | null = null;
  try {
    const body = await getEnvelope<Record<string, unknown>>(META(id), {}, 3);
    name = typeof body.data?.name === "string" ? body.data.name : null;
  } catch (err) {
    log("datagov", `metadata unavailable for ${id} (${(err as Error).message}); skipping title check`);
    return;
  }
  if (name && !name.toLowerCase().startsWith(expected.toLowerCase())) throw new Error(`dataset ${id} is now "${name}" (expected "${expected}…"); update DATASETS`);
}

async function pollForUrl(id: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const p = await getEnvelope<{ status?: string; url?: string }>(`${DL(id)}/poll-download`);
    if (p.code !== 0) throw new Error(`poll-download ${id}: ${p.errorMsg ?? p.errMsg ?? "failed"}`);
    if (p.data?.url) return p.data.url; // CSV: status DOWNLOAD_SUCCESS; GeoJSON: no status
    if (/FAIL|ERROR/i.test(String(p.data?.status ?? ""))) throw new Error(`download ${id} failed: ${p.data?.status}`);
    await sleep(3000);
  }
  throw new Error(`poll-download timed out for ${id}`);
}

/** Initiate (CSV only) then poll until a signed URL is ready; returns the file body as text. */
export async function downloadDataset(id: string, opts: { csv: boolean }): Promise<string> {
  await assertDatasetTitle(id);
  if (opts.csv) {
    let init: Envelope<{ message?: string }>;
    try {
      init = await getEnvelope(`${DL(id)}/initiate-download`);
    } catch (err) {
      // fall back to POST {} if GET is rejected (documented method is GET)
      log("datagov", `initiate GET failed for ${id} (${(err as Error).message}); retrying with POST`);
      init = await getEnvelope(`${DL(id)}/initiate-download`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    }
    if (init.code !== 0) throw new Error(`initiate-download ${id}: ${init.errorMsg ?? init.errMsg ?? "failed"}`);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = await pollForUrl(id);
    // signed S3 URL: no API headers; 403 means the link expired -> poll again for a fresh one
    const res = await fetch(url);
    if (res.status === 403) {
      await res.body?.cancel().catch(() => undefined);
      log("datagov", `signed URL for ${id} expired; re-polling`);
      continue;
    }
    if (!res.ok) throw new Error(`download ${id}: HTTP ${res.status}`);
    const text = await res.text();
    log("datagov", `downloaded ${id} (${(text.length / 1e6).toFixed(1)} MB)`);
    return text;
  }
  throw new Error(`download ${id}: signed URL kept expiring`);
}
