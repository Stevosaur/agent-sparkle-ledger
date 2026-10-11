/** SORA from the MAS APIMG gateway (docs/research/rates-data.md §1.3, §1.8) with a dated fallback (§1.7). */
import { fetchJson, log } from "../http";
import type { DatedValue, RatesSnapshot } from "../../../src/lib/data/types";
import { HDB_LOAN_RATE_PCT } from "../../../src/lib/calc/rules";

const MAS_URL =
  "https://eservices.mas.gov.sg/apimg-gw/server/monthly_statistical_bulletin_non610mssql/domestic_interest_rates_daily/views/domestic_interest_rates_daily";

/** Fixed policy rates (constants with a verification date; no machine-readable source exists). */
export const POLICY_RATES = {
  // single source of truth with the calculators (src/lib/calc/rules.ts)
  hdbConcessionaryRate: { value: HDB_LOAN_RATE_PCT, date: "2026-10-01", source: "HDB concessionary loan rate (CPF OA rate + 0.1%), reviewed quarterly" },
  cpfOaRate: { value: 2.5, date: "2026-10-01", source: "CPF Board, Ordinary Account interest rate (legislated minimum 2.5%)" },
};

/** Used only when the live MAS fetch is unavailable; values relayed by third-party mirrors of MAS data. */
export const SORA_FALLBACK: RatesSnapshot["sora"] = {
  overnight: { value: 1.3724, date: "2026-10-02" },
  compounded1m: { value: 1.2902, date: "2026-10-08" },
  compounded3m: { value: 1.231, date: "2026-10-08" },
  compounded6m: { value: 1.1752, date: "2026-10-08" },
  series3m: [],
  source: "MAS Domestic Interest Rates (fallback values as at 8 Oct 2026 relayed via third-party mirrors; not fetched live)",
};

const toNum = (x: unknown): number | null => {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

interface Row {
  date: string;
  sora: number | null;
  m1: number | null;
  m3: number | null;
  m6: number | null;
}

export function parseMasRows(json: unknown): Row[] {
  const j = json as { elements?: unknown[]; result?: { records?: unknown[] } };
  const raw = Array.isArray(j?.elements) ? j.elements : Array.isArray(j?.result?.records) ? j.result.records : [];
  const rows: Row[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (r.preliminary) continue;
    const row: Row = {
      date: String(r.end_of_day ?? "").slice(0, 10),
      sora: toNum(r.sora),
      m1: toNum(r.comp_sora_1m),
      m3: toNum(r.comp_sora_3m),
      m6: toNum(r.comp_sora_6m),
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    if (row.sora == null && row.m1 == null && row.m3 == null && row.m6 == null) continue;
    rows.push(row);
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export function soraFromRows(rows: Row[], now: Date): RatesSnapshot["sora"] {
  if (rows.length === 0) throw new Error("MAS: no rows");
  const latest = (k: keyof Omit<Row, "date">): DatedValue | null => {
    const r = rows.find((x) => x[k] != null);
    return r ? { value: r[k] as number, date: r.date } : null;
  };
  const m3 = latest("m3");
  const m1 = latest("m1");
  if (!m3) throw new Error("MAS: no 3M compounded SORA");
  for (const r of rows) for (const v of [r.sora, r.m1, r.m3, r.m6]) if (v != null && (v < 0 || v > 10)) throw new Error(`MAS: out-of-range value ${v} on ${r.date}`);
  if ((now.getTime() - Date.parse(`${m3.date}T00:00:00Z`)) / 86_400_000 > 10) throw new Error(`MAS: latest 3M SORA ${m3.date} is stale`);
  if (m1 && Math.abs(m3.value - m1.value) >= 1.5) throw new Error("MAS: 1M/3M divergence too large");
  // month-end series of 3M compounded SORA
  const byMonth = new Map<string, DatedValue>();
  for (const r of rows) {
    if (r.m3 == null) continue;
    const month = r.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, { value: r.m3, date: r.date }); // rows are newest-first: first seen = last business day
  }
  return {
    overnight: latest("sora"),
    compounded1m: m1,
    compounded3m: m3,
    compounded6m: latest("m6"),
    series3m: [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date)),
    source: "MAS Domestic Interest Rates (daily), eservices.mas.gov.sg",
  };
}

export async function fetchRates(now = new Date()): Promise<{ rates: RatesSnapshot; live: boolean; note: string }> {
  const key = process.env.MAS_API_KEY_ID;
  let sora = SORA_FALLBACK;
  let live = false;
  let note = "MAS_API_KEY_ID not set: using dated fallback SORA values";
  if (key) {
    try {
      const json = await fetchJson(`${MAS_URL}?$orderby=end_of_day%20desc&$top=400`, { headers: { KeyId: key }, tries: 3, timeoutMs: 30_000 });
      sora = soraFromRows(parseMasRows(json), now);
      live = true;
      note = `live, latest 3M ${sora.compounded3m?.date}`;
    } catch (err) {
      note = `MAS fetch failed (${(err as Error).message}); using dated fallback`;
      log("rates", note);
    }
  }
  return {
    rates: { asOf: now.toISOString().slice(0, 10), sora, hdbConcessionaryRate: POLICY_RATES.hdbConcessionaryRate, cpfOaRate: POLICY_RATES.cpfOaRate },
    live,
    note,
  };
}
