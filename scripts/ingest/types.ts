/**
 * Normalised records produced by the fetch stage of the pipeline (one fetcher per source) and
 * consumed by build.ts, which turns them into the committed snapshot described in src/lib/data/types.ts.
 */
import type { MrtStation, RatesSnapshot, School, SourceInfo } from "../../src/lib/data/types";

export interface RawHdbSale {
  /** "YYYY-MM" */
  month: string;
  town: string;
  /** normalised: "MULTI GENERATION" -> "MULTI-GENERATION" */
  flatType: string;
  block: string;
  /** street exactly as published by HDB (abbreviated, e.g. "TAMPINES ST 86") */
  street: string;
  /** "04 TO 06" */
  storeyRange: string;
  floorAreaSqm: number;
  flatModel: string;
  leaseCommenceYear: number | null;
  /** remaining lease in months as published (2015+ datasets), else null */
  remainingLeaseMonths: number | null;
  price: number;
}

export interface RawHdbBlockInfo {
  block: string;
  street: string;
  /** HDB town name (decoded from bldg_contract_town code) */
  town: string | null;
  maxFloor: number | null;
  yearCompleted: number | null;
  residential: boolean;
  commercial: boolean;
  marketHawker: boolean;
  miscellaneous: boolean;
  multistoreyCarpark: boolean;
  precinctPavilion: boolean;
  totalDwellingUnits: number | null;
  /** flats per flat type (sold + rental) */
  unitMix: Record<string, number>;
}

export interface RawHdbRental {
  month: string;
  town: string;
  block: string;
  street: string;
  flatType: string;
  monthlyRent: number;
}

export interface Geocode {
  lat: number;
  lng: number;
  postal: string | null;
  /** full road name, e.g. "TAMPINES STREET 86" */
  roadName: string | null;
}

export interface RawPrivateSale {
  project: string;
  street: string;
  district: number | null;
  marketSegment: "CCR" | "RCR" | "OCR" | null;
  propertyType: string;
  /** raw tenure string */
  tenure: string | null;
  month: string;
  areaSqm: number;
  floorRange: string;
  /** 1 = new sale, 2 = sub sale, 3 = resale */
  typeOfSale: 1 | 2 | 3;
  typeOfArea: "Strata" | "Land" | "Unknown";
  noOfUnits: number;
  price: number;
  lat: number | null;
  lng: number | null;
  /** REALIS-style unit-level fields (optional) */
  unit?: string | null;
  address?: string | null;
  postal?: string | null;
}

export interface RawPrivateRental {
  project: string;
  street: string;
  district: number | null;
  propertyType: string;
  month: string;
  monthlyRent: number;
  areaSqmLow: number | null;
  areaSqmHigh: number | null;
  bedrooms: number | null;
  lat: number | null;
  lng: number | null;
}

export interface RawLaunchMonth {
  month: string;
  launchedInMonth: number | null;
  soldInMonth: number | null;
  launchedToDate: number | null;
  soldToDate: number | null;
  medianPsf: number | null;
  lowestPsf: number | null;
  highestPsf: number | null;
}

export interface RawLaunch {
  project: string;
  street: string | null;
  district: number | null;
  marketSegment: "CCR" | "RCR" | "OCR" | null;
  developer: string | null;
  propertyType: string | null;
  totalUnits: number | null;
  expectedCompletionYear: number | null;
  tenure: string | null;
  status: "launched" | "upcoming";
  months: RawLaunchMonth[];
  lat: number | null;
  lng: number | null;
}

export interface SnapshotInput {
  generatedAt: string;
  fixture: boolean;
  sources: SourceInfo[];
  hdbSales: RawHdbSale[];
  hdbBlockInfo: RawHdbBlockInfo[];
  hdbRentals: RawHdbRental[];
  /** keyed by hdbGeoKey(block, street) */
  hdbGeocodes: Map<string, Geocode>;
  privateSales: RawPrivateSale[];
  privateRentals: RawPrivateRental[];
  launches: RawLaunch[];
  mrtStations: MrtStation[];
  schools: School[];
  rates: RatesSnapshot | null;
}

export function hdbGeoKey(block: string, street: string): string {
  return `${block.trim().toUpperCase()}|${street.trim().toUpperCase()}`;
}
