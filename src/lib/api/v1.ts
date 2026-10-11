import "server-only";
import { getBlockTransactions, getHdbBlock, getTowns } from "@/lib/data/hdb";
import { getLaunches, getProject, getProjectTransactions } from "@/lib/data/private";
import { getRates } from "@/lib/data/rates";
import { getMeta } from "@/lib/data/meta";
import { search } from "@/lib/data/search";
import { absoluteUrl } from "@/lib/seo";
import { API_LATEST_SALES } from "./constants";
import { ApiError, enumParam, numberParam, requireSlug } from "./http";
import { BUYER_PROFILES } from "./schemas";
import type {
  CondoResponseDto,
  HdbBlockResponseDto,
  HdbSalesResponseDto,
  LaunchesResponseDto,
  MortgageResponseDto,
  RatesResponseDto,
  SearchResponseDto,
  StampDutyResponseDto,
  TownsResponseDto,
} from "./schemas";
import { SOURCES, condoDto, dataMeta, hdbBlockDto, hdbBlockName, hdbSaleDto, launchDto, mortgageResult, privateSaleDto, searchResultDto, stampDutyResult, townDto } from "./serializers";

/** Response builders for the public API. Route handlers wrap these with handlePublicGet(). */

export function v1Search(params: URLSearchParams): SearchResponseDto {
  const q = (params.get("q") ?? "").trim();
  if (!q) throw new ApiError(400, "invalid_parameter", 'Query parameter "q" is required.');
  if (q.length > 100) throw new ApiError(400, "invalid_parameter", 'Query parameter "q" must be at most 100 characters.');
  const limit = numberParam(params, "limit", { min: 1, max: 20, integer: true, fallback: 10 });
  return { query: q, results: search(q, { limit }).map(searchResultDto) };
}

export function v1HdbBlock(rawSlug: string): HdbBlockResponseDto {
  const slug = requireSlug(rawSlug, "HDB block");
  const b = getHdbBlock(slug);
  if (!b) throw new ApiError(404, "not_found", "No HDB block matches that slug.");
  return {
    block: hdbBlockDto(b),
    links: { page: absoluteUrl(`/hdb/${b.slug}/`), sales: absoluteUrl(`/api/v1/hdb/blocks/${b.slug}/sales/`) },
    meta: dataMeta("hdb", SOURCES.hdbInfo),
  };
}

export function v1HdbBlockSales(rawSlug: string): HdbSalesResponseDto {
  const slug = requireSlug(rawSlug, "HDB block");
  const b = getHdbBlock(slug);
  if (!b) throw new ApiError(404, "not_found", "No HDB block matches that slug.");
  const all = getBlockTransactions(slug);
  const sales = all.slice(0, API_LATEST_SALES).map(hdbSaleDto);
  return {
    block: b.slug,
    name: hdbBlockName(b),
    totalSales: all.length,
    returned: sales.length,
    sales,
    fullHistory: absoluteUrl(`/hdb/${b.slug}/`),
    meta: dataMeta("hdb", SOURCES.hdb),
  };
}

export function v1Towns(): TownsResponseDto {
  const towns = [...getTowns()].sort((a, b) => a.town.localeCompare(b.town)).map(townDto);
  return { towns, meta: dataMeta("hdb", SOURCES.hdb) };
}

export function v1Condo(rawSlug: string): CondoResponseDto {
  const slug = requireSlug(rawSlug, "condo project");
  const p = getProject(slug);
  if (!p || p.isLanded) {
    const loaded = getMeta().counts.privateTransactions > 0;
    throw new ApiError(404, "not_found", loaded ? "No condo project matches that slug." : "Private transaction data (URA) is not loaded on this deployment.");
  }
  const all = getProjectTransactions(slug);
  const latestSales = all.slice(0, API_LATEST_SALES).map(privateSaleDto);
  return {
    project: condoDto(p),
    totalSales: all.length,
    returned: latestSales.length,
    latestSales,
    fullHistory: absoluteUrl(`/condo/${p.slug}/`),
    meta: dataMeta("private", SOURCES.private),
  };
}

export function v1Launches(params: URLSearchParams): LaunchesResponseDto {
  const type = params.has("type") ? enumParam(params, "type", ["condo", "ec", "landed"] as const) : null;
  const status = params.has("status") ? enumParam(params, "status", ["launched", "upcoming"] as const) : null;
  const limit = numberParam(params, "limit", { min: 1, max: 200, integer: true, fallback: 100 });
  const offset = numberParam(params, "offset", { min: 0, max: 1_000_000, integer: true, fallback: 0 });
  const matching = getLaunches()
    .filter((l) => (!type || l.type === type) && (!status || l.status === status))
    .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
  const launches = matching.slice(offset, offset + limit).map(launchDto);
  return { count: matching.length, offset, returned: launches.length, launches, meta: dataMeta("private", SOURCES.launches) };
}

export function v1Rates(): RatesResponseDto {
  const r = getRates();
  if (!r) throw new ApiError(503, "data_unavailable", "Interest rate data has not been loaded on this deployment.");
  return {
    asOf: r.asOf,
    sora: { ...r.sora, series3m: r.sora.series3m.map((p) => ({ ...p })) },
    hdbConcessionaryRate: { ...r.hdbConcessionaryRate },
    cpfOaRate: { ...r.cpfOaRate },
    sampleData: getMeta().fixture,
  };
}

export function v1StampDuty(params: URLSearchParams): StampDutyResponseDto {
  const price = numberParam(params, "price", { min: 1, max: 100_000_000 });
  const profile = enumParam(params, "profile", BUYER_PROFILES, "SC");
  const count = numberParam(params, "count", { min: 1, max: 10, integer: true, fallback: 1 });
  return stampDutyResult(price, profile, count);
}

export function v1Mortgage(params: URLSearchParams): MortgageResponseDto {
  const principal = numberParam(params, "principal", { min: 1, max: 100_000_000 });
  const rate = numberParam(params, "rate", { min: 0, max: 20 });
  const years = numberParam(params, "years", { min: 1, max: 35, integer: true });
  return mortgageResult(principal, rate, years);
}
