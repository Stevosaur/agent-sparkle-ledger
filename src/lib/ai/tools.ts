import "server-only";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { estimateRemainingLeaseMonths, getBlockTransactions, getHdbBlock, getTown, getTowns } from "@/lib/data/hdb";
import {
  getLandedAddress,
  getLandedAddressTransactions,
  getLandedStreet,
  getLandedStreetTransactions,
  getLaunches,
  getProject,
  getProjectTransactions,
} from "@/lib/data/private";
import { getMeta } from "@/lib/data/meta";
import { getRates } from "@/lib/data/rates";
import { getSeries } from "@/lib/data/stats";
import { nearestStations } from "@/lib/data/geo";
import { monthIndex, monthLabel } from "@/lib/data/months";
import { search } from "@/lib/data/search";
import { affordability } from "@/lib/calc/affordability";
import { maxBankTenure, maxTenureForStandardLtv } from "@/lib/calc/loan";
import { BANK_STRESS_RATE_PCT, HDB_LOAN_MAX_TENURE, HDB_LOAN_RATE_PCT, HDB_MOP_YEARS, HDB_MOP_YEARS_PLUS_PRIME, RULE_META, ruleNeedsDisclaimer } from "@/lib/calc/rules";
import { titleCase, slugify } from "@/lib/slug";
import { formatPropertyRef, parsePropertyRef, type PropertyRef } from "@/lib/property-ref";
import { toJsonSchema } from "@/lib/api/json-schema";
import { BUYER_PROFILES } from "@/lib/api/schemas";
import { sgtDate } from "./config";
import {
  SOURCES,
  condoDto,
  dataMeta,
  hdbBlockDto,
  hdbSaleDto,
  launchDto,
  mortgageResult,
  privateSaleDto,
  searchResultDto,
  stampDutyResult,
  townDto,
} from "@/lib/api/serializers";

/**
 * The assistant's tools: read-only lookups over the data layer and the calculators. Inputs are
 * validated with zod before anything runs; results are compact JSON that always say where the figures
 * come from and which month the data runs to.
 */

export interface ToolContext {
  /** most sales get_recent_sales may return (the full history is an account feature on the site) */
  maxSales: number;
  /** "now", injectable for tests */
  now: Date;
}

export interface ToolOutcome {
  /** JSON text returned to the model */
  content: string;
  isError: boolean;
}

const refString = z
  .string()
  .min(3)
  .max(200)
  .describe('Property reference: "hdb:<block slug>", "condo:<project slug>", "landed:<address slug>", "landed-street:<street slug>" or "launch:<condo|ec|landed>/<slug>". Get it from search_properties or the page context.');

const SCHEMAS = {
  search_properties: z
    .object({
      query: z.string().min(1).max(100).describe("Block and street, project name, street, town or 6-digit postal code"),
    })
    .strict(),
  get_property_summary: z.object({ ref: refString }).strict(),
  get_recent_sales: z
    .object({
      ref: refString,
      limit: z.number().int().min(1).max(20).default(10).describe("How many of the latest sales to return (1-20, default 10)"),
    })
    .strict(),
  get_town_stats: z.object({ town: z.string().min(2).max(60).describe('HDB town name or slug, e.g. "Tampines" or "ang-mo-kio"') }).strict(),
  get_rates: z.object({}).strict(),
  calc_stamp_duty: z
    .object({
      price: z.number().positive().max(100_000_000).describe("Purchase price (or market value if higher) in SGD"),
      profile: z.enum(BUYER_PROFILES).default("SC").describe("SC = Singapore Citizen, SPR = permanent resident, FOREIGNER, ENTITY"),
      propertyCount: z.number().int().min(1).max(10).default(1).describe("Residential properties the buyer will own including this one (1 = first)"),
    })
    .strict(),
  calc_mortgage: z
    .object({
      principal: z.number().positive().max(100_000_000).describe("Loan amount in SGD"),
      ratePct: z.number().min(0).max(20).describe("Interest rate in % per annum"),
      years: z.number().int().min(1).max(35).describe("Loan tenure in years"),
    })
    .strict(),
  calc_affordability: z
    .object({
      monthlyIncome: z.number().min(0).max(1_000_000).describe("Gross monthly income of all buyers, SGD"),
      cash: z.number().min(0).max(100_000_000).describe("Cash available, SGD"),
      cpfOa: z.number().min(0).max(10_000_000).describe("CPF Ordinary Account balance available, SGD"),
      age: z.number().int().min(21).max(80).describe("Income-weighted average age of the buyers"),
      propertyClass: z.enum(["hdb", "ec-new", "ec-resale", "private"]).describe("hdb = HDB flat, ec-new = EC from the developer, ec-resale = resale EC, private = condo or landed"),
      lender: z.enum(["bank", "hdb"]).default("bank").describe("Loan source; HDB loans apply only to HDB flats"),
      buyerProfile: z.enum(BUYER_PROFILES).default("SC"),
      propertyCount: z.number().int().min(1).max(10).default(1).describe("Residential properties owned after this purchase (1 = first)"),
      outstandingLoans: z.number().int().min(0).max(5).default(0).describe("Housing loans still outstanding before this purchase"),
      monthlyDebts: z.number().min(0).max(1_000_000).default(0).describe("Other monthly debt repayments, SGD"),
      tenureYears: z.number().int().min(5).max(35).optional().describe("Loan tenure; defaults to the longest tenure that keeps the standard LTV limit"),
      interestRatePct: z.number().min(0).max(20).optional().describe("Rate for the displayed repayment, % p.a.; defaults to the MAS 4% floor (bank) or the HDB rate"),
      remainingLeaseYears: z.number().min(0).max(99).optional().describe("Remaining lease of the flat in years, if known (applies the CPF lease rules)"),
    })
    .strict(),
} as const;

export type ToolName = keyof typeof SCHEMAS;

const DESCRIPTIONS: Record<ToolName, string> = {
  search_properties:
    "Find HDB blocks, condo projects, landed streets and addresses, new launches and HDB towns by name, street or postal code. Returns up to 8 matches with their property reference (ref) and page path. Use it to turn a name into a ref before calling other tools.",
  get_property_summary:
    "Facts and a sales summary for one property: for HDB blocks the town, lease start, completion year, remaining lease estimate, MOP year, unit mix, sales and rental summary, nearest and upcoming MRT; for condos the district, segment, tenure, sales and rental summary; also landed addresses, landed streets and new launches.",
  get_recent_sales: "The latest recorded sales of a property, newest first, with month, type, floor range, area, price and price per square foot.",
  get_town_stats: "HDB town statistics: number of blocks, sales summary, median resale price and rent by flat type over the latest 12 months, and monthly medians for the last 24 months.",
  get_rates: "Latest SORA (overnight and compounded 1/3/6-month), the HDB concessionary loan rate and the CPF Ordinary Account rate, with dates.",
  calc_stamp_duty: "Buyer's Stamp Duty and Additional Buyer's Stamp Duty for a residential purchase under current IRAS rates.",
  calc_mortgage: "Monthly repayment, total interest and total paid for a fixed-rate amortising loan.",
  calc_affordability:
    "Highest home price a buyer can afford given income, cash, CPF, age and loan rules (LTV, TDSR/MSR stress test, stamp duties). Returns price, loan, downpayment split, stamp duties and the monthly repayment.",
};

/** Tool definitions sent to the model (JSON Schema generated from the zod schemas above). */
export function toolDefinitions(): Anthropic.Beta.BetaTool[] {
  return (Object.keys(SCHEMAS) as ToolName[]).map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    input_schema: toJsonSchema(SCHEMAS[name], "input") as Anthropic.Beta.BetaTool.InputSchema,
    // Stream tool input as it is generated; inputs are validated with zod before running.
    eager_input_streaming: true,
  }));
}

export function isToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(SCHEMAS, name);
}

/** Validate the input and run one tool. Never throws: failures come back as is_error results. */
export async function executeTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  if (!isToolName(name)) return error(`Unknown tool "${name}".`);
  const parsed = SCHEMAS[name].safeParse(input ?? {});
  if (!parsed.success) {
    return error(`Invalid input for ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`);
  }
  try {
    const result = run(name, parsed.data as never, ctx);
    return { content: JSON.stringify(result), isError: false };
  } catch (err) {
    console.error(`[ai] tool ${name} failed`, err);
    return error(`The ${name} lookup failed. Tell the user the data could not be retrieved.`);
  }
}

function error(message: string): ToolOutcome {
  return { content: JSON.stringify({ error: message }), isError: true };
}

function run<N extends ToolName>(name: N, input: z.output<(typeof SCHEMAS)[N]>, ctx: ToolContext): unknown {
  switch (name) {
    case "search_properties":
      return searchProperties(input as z.output<(typeof SCHEMAS)["search_properties"]>);
    case "get_property_summary":
      return propertySummary((input as z.output<(typeof SCHEMAS)["get_property_summary"]>).ref, ctx);
    case "get_recent_sales":
      return recentSales(input as z.output<(typeof SCHEMAS)["get_recent_sales"]>, ctx);
    case "get_town_stats":
      return townStats((input as z.output<(typeof SCHEMAS)["get_town_stats"]>).town);
    case "get_rates":
      return rates();
    case "calc_stamp_duty": {
      const i = input as z.output<(typeof SCHEMAS)["calc_stamp_duty"]>;
      return stampDutyResult(i.price, i.profile, i.propertyCount);
    }
    case "calc_mortgage": {
      const i = input as z.output<(typeof SCHEMAS)["calc_mortgage"]>;
      const r = mortgageResult(i.principal, i.ratePct, i.years);
      return { input: r.input, monthlyPayment: r.monthlyPayment, totalInterest: r.totalInterest, totalPaid: r.totalPaid, note: r.note };
    }
    case "calc_affordability":
      return affordabilityResult(input as z.output<(typeof SCHEMAS)["calc_affordability"]>);
    default:
      throw new Error(`unhandled tool ${String(name)}`);
  }
}

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

function searchProperties(input: { query: string }) {
  const results = search(input.query, { limit: 8 }).map((e) => {
    const dto = searchResultDto(e);
    const town = /^\/insights\/town\/([a-z0-9-]+)\/$/.exec(dto.path)?.[1] ?? null;
    return { kind: dto.kind, label: dto.label, sub: dto.sub, path: dto.path, ref: dto.ref, ...(town ? { town } : {}) };
  });
  return results.length ? { results } : { results, note: `No property, street or town on this site matches "${input.query}".` };
}

function notFound(ref: string) {
  return { found: false, message: `No property matches ${ref} in this site's data. Use search_properties to find the right reference.` };
}

/** Month index (months since Jan 1990) of today's date in Singapore. */
function currentMonthIndex(now: Date): number {
  return monthIndex(sgtDate(now));
}

function resolveRef(raw: string): PropertyRef | null {
  return parsePropertyRef(raw.trim().toLowerCase());
}

function propertySummary(rawRef: string, ctx: ToolContext) {
  const ref = resolveRef(rawRef);
  if (!ref) return { found: false, message: `"${rawRef}" is not a valid reference. Use search_properties first.` };
  const refId = formatPropertyRef(ref);
  switch (ref.kind) {
    case "hdb": {
      const b = getHdbBlock(ref.slug);
      if (!b) return notFound(refId);
      const dto = hdbBlockDto(b);
      const { url: _url, lat: _lat, lng: _lng, ...rest } = dto;
      const remaining = b.leaseCommenceYear != null ? estimateRemainingLeaseMonths(b.leaseCommenceYear, currentMonthIndex(ctx.now)) : null;
      const upcoming = b.lat != null && b.lng != null ? nearestStations({ lat: b.lat, lng: b.lng }, { status: "future", maxDistanceM: 1500, limit: 3 }) : [];
      return {
        found: true,
        ref: refId,
        ...rest,
        remainingLeaseEstimate:
          remaining != null
            ? { years: Math.floor(remaining / 12), months: remaining % 12, note: "Estimate: 99-year lease from the lease commencement year, as of today." }
            : { years: null, note: "Lease commencement year is not recorded for this block." },
        mopYear: b.yearCompleted != null ? b.yearCompleted + HDB_MOP_YEARS : null,
        mopNote:
          b.yearCompleted != null
            ? `Owners who collected keys at completion reach the ${HDB_MOP_YEARS}-year Minimum Occupation Period around ${b.yearCompleted + HDB_MOP_YEARS}; each owner's MOP counts from their own key collection or resale completion. Flats sold under the Plus or Prime models have a ${HDB_MOP_YEARS_PLUS_PRIME}-year MOP instead; this dataset does not record which model a block was sold under.`
            : "Completion year is not recorded for this block, so its MOP year is unknown.",
        upcomingMrtWithin1500m: b.lat == null || b.lng == null ? "Block location not available" : upcoming,
        meta: dataMeta("hdb", SOURCES.hdbInfo),
      };
    }
    case "condo": {
      const p = getProject(ref.slug);
      if (!p) return notFound(refId);
      const { url: _url, lat: _lat, lng: _lng, ...rest } = condoDto(p);
      return { found: true, ref: refId, isLanded: p.isLanded, ...rest, meta: dataMeta("private", SOURCES.private) };
    }
    case "landed": {
      const a = getLandedAddress(ref.slug);
      if (!a) return notFound(refId);
      return {
        found: true,
        ref: refId,
        address: titleCase(a.address),
        path: `/landed/${a.slug}/`,
        street: titleCase(a.street),
        streetPath: `/landed-street/${a.streetSlug}/`,
        district: a.district,
        segment: a.segment,
        propertyType: a.propertyType,
        tenure: a.tenure,
        landAreaSqm: a.landAreaSqm,
        sales: a.tx,
        meta: dataMeta("private", SOURCES.private),
      };
    }
    case "landed-street": {
      const s = getLandedStreet(ref.slug);
      if (!s) return notFound(refId);
      return {
        found: true,
        ref: refId,
        street: titleCase(s.street),
        path: `/landed-street/${s.slug}/`,
        district: s.district,
        segment: s.segment,
        propertyTypes: s.propertyTypes,
        tenures: s.tenures,
        sales: s.tx,
        addressesWithRecords: s.addresses.length,
        meta: dataMeta("private", SOURCES.private),
      };
    }
    case "launch": {
      const l = getLaunches().find((x) => x.slug === ref.slug && (!ref.launchType || x.type === ref.launchType));
      if (!l) return notFound(refId);
      const { url: _url, ...rest } = launchDto(l);
      return { found: true, ref: formatPropertyRef({ kind: "launch", slug: l.slug, launchType: l.type }), ...rest, meta: dataMeta("private", SOURCES.launches) };
    }
  }
}

function recentSales(input: { ref: string; limit: number }, ctx: ToolContext) {
  const ref = resolveRef(input.ref);
  if (!ref) return { found: false, message: `"${input.ref}" is not a valid reference. Use search_properties first.` };
  const refId = formatPropertyRef(ref);
  const limit = Math.min(input.limit, ctx.maxSales);
  // Only mention the cap when it actually withheld sales.
  const capNote = (total: number) =>
    input.limit > ctx.maxSales && total > ctx.maxSales
      ? { capNote: `Only the latest ${ctx.maxSales} sales are available here; the full history is on the property page with a free account.` }
      : {};

  const wrap = (name: string, path: string, total: number, sales: unknown[], meta: ReturnType<typeof dataMeta>) => ({
    found: true,
    ref: refId,
    name,
    path,
    totalRecorded: total,
    returned: sales.length,
    sales,
    ...(total === 0 ? { note: "No sales are recorded for this property in the dataset." } : {}),
    ...capNote(total),
    meta,
  });

  switch (ref.kind) {
    case "hdb": {
      const b = getHdbBlock(ref.slug);
      if (!b) return notFound(refId);
      const all = getBlockTransactions(ref.slug);
      return wrap(`Blk ${b.block} ${titleCase(b.street)}`, `/hdb/${b.slug}/`, all.length, all.slice(0, limit).map(hdbSaleDto), dataMeta("hdb", SOURCES.hdb));
    }
    case "condo": {
      const p = getProject(ref.slug);
      if (!p) return notFound(refId);
      const all = getProjectTransactions(ref.slug);
      return wrap(titleCase(p.name), `/condo/${p.slug}/`, all.length, all.slice(0, limit).map(privateSaleDto), dataMeta("private", SOURCES.private));
    }
    case "landed": {
      const a = getLandedAddress(ref.slug);
      if (!a) return notFound(refId);
      const all = getLandedAddressTransactions(ref.slug);
      return wrap(titleCase(a.address), `/landed/${a.slug}/`, all.length, all.slice(0, limit).map(privateSaleDto), dataMeta("private", SOURCES.private));
    }
    case "landed-street": {
      const s = getLandedStreet(ref.slug);
      if (!s) return notFound(refId);
      const all = getLandedStreetTransactions(ref.slug);
      return wrap(titleCase(s.street), `/landed-street/${s.slug}/`, all.length, all.slice(0, limit).map(privateSaleDto), dataMeta("private", SOURCES.private));
    }
    case "launch": {
      const l = getLaunches().find((x) => x.slug === ref.slug && (!ref.launchType || x.type === ref.launchType));
      if (!l) return notFound(refId);
      if (!l.projectSlug) {
        return { found: true, ref: refId, name: titleCase(l.name), totalRecorded: 0, returned: 0, sales: [], note: "No individual transactions are recorded for this launch yet. Monthly developer sales figures are in get_property_summary.", meta: dataMeta("private", SOURCES.launches) };
      }
      const all = getProjectTransactions(l.projectSlug);
      return wrap(titleCase(l.name), `/condo/${l.projectSlug}/`, all.length, all.slice(0, limit).map(privateSaleDto), dataMeta("private", SOURCES.private));
    }
  }
}

function townStats(rawTown: string) {
  const slug = slugify(rawTown);
  const town = getTown(slug) ?? getTowns().find((t) => slugify(t.town) === slug || t.town.toLowerCase() === rawTown.trim().toLowerCase()) ?? null;
  if (!town) {
    return { found: false, message: `"${rawTown}" is not an HDB town in this dataset.`, availableTowns: getTowns().map((t) => titleCase(t.town)) };
  }
  const series = getSeries(`hdb:${town.town}:ALL`);
  const recentMonths = (series?.points ?? []).slice(-24).map((p) => ({ month: monthLabel(p.m), sales: p.count, medianPrice: p.medianPrice, medianPsf: p.medianPsf }));
  return {
    found: true,
    ...townDto(town),
    recentMonths,
    meta: dataMeta("hdb", SOURCES.hdb),
  };
}

function rates() {
  const r = getRates();
  if (!r) return { found: false, message: "Interest rate data has not been loaded on this site." };
  return {
    found: true,
    asOf: r.asOf,
    sora: { overnight: r.sora.overnight, compounded1m: r.sora.compounded1m, compounded3m: r.sora.compounded3m, compounded6m: r.sora.compounded6m, recent3m: r.sora.series3m.slice(-6), source: r.sora.source },
    hdbConcessionaryRate: r.hdbConcessionaryRate,
    cpfOaRate: r.cpfOaRate,
    sampleData: getMeta().fixture,
  };
}

function affordabilityResult(i: z.output<(typeof SCHEMAS)["calc_affordability"]>) {
  const assumptions: string[] = [];
  const lender = i.propertyClass === "hdb" ? i.lender : "bank";
  if (i.lender === "hdb" && lender !== "hdb") assumptions.push("HDB loans are only for HDB flats, so a bank loan was assumed.");
  let tenure = i.tenureYears;
  if (tenure == null) {
    const standard = maxTenureForStandardLtv(i.propertyClass, i.age);
    tenure = lender === "hdb" ? HDB_LOAN_MAX_TENURE : standard >= 5 ? standard : maxBankTenure(i.propertyClass);
    assumptions.push(lender === "hdb" ? `HDB loan tenure up to ${tenure} years (capped at age 65).` : `Loan tenure ${tenure} years (the longest that keeps the standard LTV limit), since none was given.`);
  }
  let rate = i.interestRatePct;
  if (lender === "hdb") {
    rate = HDB_LOAN_RATE_PCT;
  } else if (rate == null) {
    rate = BANK_STRESS_RATE_PCT;
    assumptions.push(`Repayment shown at ${BANK_STRESS_RATE_PCT}% p.a. (the MAS medium-term floor rate), since no rate was given.`);
  }
  if (i.remainingLeaseYears == null && (i.propertyClass === "hdb" || i.propertyClass === "ec-resale")) {
    assumptions.push("Remaining lease not given, so CPF lease limits were not applied.");
  }
  const r = affordability({
    cash: i.cash,
    cpfOa: i.cpfOa,
    monthlyIncome: i.monthlyIncome,
    monthlyDebts: i.monthlyDebts,
    age: i.age,
    propertyClass: i.propertyClass,
    lender,
    buyerProfile: i.buyerProfile,
    propertyCount: i.propertyCount,
    outstandingLoans: i.outstandingLoans,
    tenureYears: tenure,
    interestRatePct: rate,
    ...(i.remainingLeaseYears != null ? { remainingLeaseYears: i.remainingLeaseYears } : {}),
  });
  const round = (n: number) => Math.round(n);
  const indicativeRules = [...new Set(r.rules)].filter(ruleNeedsDisclaimer);
  return {
    estimate: true,
    maxPrice: r.maxPrice,
    loan: round(r.loan),
    ltv: r.ltv,
    ltvReduced: r.ltvReduced,
    downpayment: round(r.downpayment),
    minimumCashDownpayment: round(r.minCash),
    cpfUsed: round(r.cpfUsed),
    cashUsedIncludingStampDuty: round(r.cashUsed),
    buyersStampDuty: r.bsd,
    additionalBuyersStampDuty: r.absd,
    monthlyRepayment: round(r.monthlyPayment),
    repaymentRatePct: rate,
    stressTestRatePct: r.stressRatePct,
    maxServiceableLoan: round(r.maxServiceableLoan),
    tenureYears: r.tenureYears,
    loanLimitedBy: r.loanLimitedBy === "servicing" ? "income (TDSR/MSR stress test)" : "loan-to-value limit",
    fundsLimitedBy: r.fundsLimitedBy === "cash" ? "cash (for the minimum cash down payment and stamp duties)" : "cash and CPF",
    cpfShareAllowed: r.cpfShareOfValuationLimit,
    assumptions,
    indicative: indicativeRules.length > 0,
    indicativeRules: indicativeRules.map((k) => ({ rule: k, status: RULE_META[k].status, checkAt: RULE_META[k].source })),
    note: "Estimate only. Banks and HDB assess eligibility individually (e.g. variable income haircuts, valuation, HDB Flat Eligibility letter).",
  };
}

export const TOOL_NAMES = Object.keys(SCHEMAS) as ToolName[];
