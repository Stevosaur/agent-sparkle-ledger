import "server-only";
import { getMeta } from "@/lib/data/meta";
import { getLaunches } from "@/lib/data/private";
import { absoluteUrl } from "@/lib/seo";
import { titleCase } from "@/lib/slug";
import { additionalBuyerStampDuty, buyerStampDuty } from "@/lib/calc/stamp-duty";
import { amortisationSchedule, monthlyPayment } from "@/lib/calc/mortgage";
import type { BuyerProfile } from "@/lib/calc/rules";
import type { HdbBlock, HdbTransaction, NewLaunch, PrivateProject, PrivateTransaction, SearchEntry, TownSummary } from "@/lib/data/types";
import { refIdFromPath } from "./refs";
import type {
  CondoDto,
  DataMetaDto,
  HdbBlockDto,
  HdbSaleDto,
  LaunchDto,
  MortgageResponseDto,
  PrivateSaleDto,
  SearchResultDto,
  StampDutyResponseDto,
  TownDto,
} from "./schemas";

/**
 * Data-layer records -> public DTOs. Shared by the public API (/api/v1) and the AI assistant's tools so
 * both expose the same fields. Unit numbers are never exposed.
 */

export const SOURCES = {
  hdb: "HDB resale flat prices, Housing & Development Board via data.gov.sg (Singapore Open Data Licence)",
  hdbInfo: "HDB resale flat prices and HDB Property Information via data.gov.sg (Singapore Open Data Licence)",
  hdbRent: "HDB renting out of flats, via data.gov.sg (Singapore Open Data Licence)",
  private: "URA private residential transactions (URA Data Service)",
  launches: "URA developer sales and project pipeline (URA Data Service)",
  rates: "MAS SORA; HDB concessionary rate; CPF Board",
  rules: "IRAS stamp duty rates (BSD from 15 Feb 2023, ABSD from 27 Apr 2023)",
} as const;

export function dataMeta(family: "hdb" | "private", source: string): DataMetaDto {
  const meta = getMeta();
  return {
    source: meta.fixture ? `Synthetic sample data standing in for: ${source}` : source,
    dataMonth: family === "hdb" ? meta.latestMonth.hdb : meta.latestMonth.private,
    sampleData: meta.fixture,
  };
}

export function hdbBlockName(b: Pick<HdbBlock, "block" | "street">): string {
  return `Blk ${b.block} ${titleCase(b.street)}`;
}

export function hdbBlockDto(b: HdbBlock): HdbBlockDto {
  const path = `/hdb/${b.slug}/`;
  return {
    slug: b.slug,
    name: hdbBlockName(b),
    path,
    url: absoluteUrl(path),
    block: b.block,
    street: b.street,
    streetFull: b.streetFull,
    town: b.town,
    townSlug: b.townSlug,
    postal: b.postal,
    lat: b.lat ?? null,
    lng: b.lng ?? null,
    leaseCommenceYear: b.leaseCommenceYear,
    yearCompleted: b.yearCompleted,
    maxFloor: b.maxFloor,
    dwellingUnits: b.dwellingUnits,
    unitMix: { ...b.unitMix } as Record<string, number>,
    facilities: b.facilities ? { ...b.facilities } : null,
    sales: { ...b.tx },
    rentals: b.rentals ? { ...b.rentals } : null,
    nearestMrt: b.nearestMrt ? { ...b.nearestMrt } : null,
  };
}

export function hdbSaleDto(t: HdbTransaction): HdbSaleDto {
  return {
    month: t.month,
    flatType: t.flatType,
    storeyRange: t.storeyRange,
    floorAreaSqm: t.floorAreaSqm,
    floorAreaSqft: t.floorAreaSqft,
    price: t.price,
    psf: t.psf,
    flatModel: t.flatModel,
    remainingLeaseMonths: t.remainingLeaseMonths,
    remainingLeaseEstimated: t.remainingLeaseEstimated,
  };
}

export function townDto(t: TownSummary): TownDto {
  return {
    town: t.town,
    slug: t.slug,
    region: t.region,
    blocks: t.blocks,
    sales: { ...t.tx },
    medianPrice12m: { ...t.medianPrice12m } as Record<string, number>,
    medianRent12m: { ...t.medianRent12m } as Record<string, number>,
    path: `/insights/town/${t.slug}/`,
  };
}

export function condoDto(p: PrivateProject): CondoDto {
  const path = `/condo/${p.slug}/`;
  const launch = p.launchSlug ? getLaunches().find((l) => l.slug === p.launchSlug) ?? null : null;
  return {
    slug: p.slug,
    name: titleCase(p.name),
    path,
    url: absoluteUrl(path),
    street: p.street,
    district: p.district,
    segment: p.segment,
    propertyTypes: [...p.propertyTypes],
    tenure: p.tenure ? { ...p.tenure } : null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    sales: { ...p.tx },
    rentals: p.rentals ? { ...p.rentals } : null,
    nearestMrt: p.nearestMrt ? { ...p.nearestMrt } : null,
    launch: launch ? { path: `/new-launch/${launch.type}/${launch.slug}/`, status: launch.status, totalUnits: launch.totalUnits, unitsSold: launch.unitsSold } : null,
  };
}

export function privateSaleDto(t: PrivateTransaction): PrivateSaleDto {
  return {
    month: t.month,
    propertyType: t.propertyType,
    floorRange: t.floorRange,
    areaSqm: t.areaSqm,
    areaSqft: t.areaSqft,
    price: t.price,
    psf: t.psf,
    typeOfSale: t.typeOfSale,
    typeOfArea: t.typeOfArea,
    units: t.units,
  };
}

export function launchDto(l: NewLaunch): LaunchDto {
  const path = `/new-launch/${l.type}/${l.slug}/`;
  const latest = l.sales.length ? l.sales.reduce((a, b) => (b.month > a.month ? b : a)) : null;
  return {
    slug: l.slug,
    name: titleCase(l.name),
    type: l.type,
    status: l.status,
    path,
    url: absoluteUrl(path),
    street: l.street,
    district: l.district,
    segment: l.segment,
    developer: l.developer,
    totalUnits: l.totalUnits,
    unitsLaunched: l.unitsLaunched,
    unitsSold: l.unitsSold,
    expectedCompletionYear: l.expectedCompletionYear,
    tenure: l.tenure ? { ...l.tenure } : null,
    latestSales: latest ? { ...latest } : null,
    projectPath: l.projectSlug ? `/condo/${l.projectSlug}/` : null,
    nearestMrt: l.nearestMrt ? { ...l.nearestMrt } : null,
  };
}

export function searchResultDto(e: SearchEntry): SearchResultDto {
  return { kind: e.kind, label: e.label, sub: e.sub, path: e.href, url: absoluteUrl(e.href), ref: refIdFromPath(e.href) };
}

/* ------------------------------------------------------------------ */
/* Calculators                                                         */
/* ------------------------------------------------------------------ */

export function stampDutyResult(price: number, profile: BuyerProfile, propertyCount: number): StampDutyResponseDto {
  const bsd = buyerStampDuty(price, "residential");
  const absd = additionalBuyerStampDuty(price, profile, propertyCount);
  return {
    input: { price, profile, propertyCount },
    bsd: { total: bsd.total, tiers: bsd.tiers.map((t) => ({ from: t.from, to: t.to, rate: t.rate, taxable: t.taxable, amount: Math.round(t.amount * 100) / 100 })) },
    absd: { rate: absd.rate, total: absd.total },
    total: bsd.total + absd.total,
    rules: { bsd: "IRAS residential Buyer's Stamp Duty, documents executed on or after 15 Feb 2023", absd: "IRAS Additional Buyer's Stamp Duty, acquisitions on or after 27 Apr 2023" },
    note: "Estimate for a residential purchase by a single buyer type, on the price given (duty is charged on the higher of price and market value). propertyCount includes this purchase. Remissions and refunds (e.g. for some married couples) are not applied. Check with IRAS before you commit.",
  };
}

export function mortgageResult(principal: number, ratePct: number, years: number): MortgageResponseDto {
  const pmt = monthlyPayment(principal, ratePct, years);
  const n = Math.round(years * 12);
  const totalPaid = pmt * n;
  return {
    input: { principal, ratePct, years },
    monthlyPayment: Math.round(pmt * 100) / 100,
    totalInterest: Math.round((totalPaid - principal) * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    schedule: amortisationSchedule(principal, ratePct, years).map((y) => ({
      year: y.year,
      payment: Math.round(y.payment),
      interest: Math.round(y.interest),
      principal: Math.round(y.principal),
      balance: Math.round(y.balance),
    })),
    note: "Fixed-rate amortising loan, monthly compounding, payments in arrears. Real loans reprice (e.g. SORA-pegged packages), so treat this as an estimate.",
  };
}
