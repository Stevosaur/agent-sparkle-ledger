/**
 * Data contract between the ingestion pipeline (scripts/ingest) and the app.
 *
 * The pipeline writes these shapes as JSON files under DATA_DIR (default: ./data).
 * Transaction files are columnar (parallel arrays) to keep the committed snapshot small;
 * use the decoders in ./hdb.ts and ./private.ts instead of reading them directly.
 *
 * Conventions
 * - Months are encoded as integers: months since January 1990 (0 = 1990-01). See monthIndex()/monthLabel() in ./months.ts.
 * - Areas are stored in square metres × 10 (integers) in columnar files; decoded objects expose sqm and sqft.
 * - Prices are SGD integers.
 * - Coordinates are WGS84 lat/lng.
 */

/* ------------------------------------------------------------------ */
/* Dataset metadata                                                    */
/* ------------------------------------------------------------------ */

export type SourceStatus = "ok" | "missing-credentials" | "error" | "not-run";

export interface SourceInfo {
  id: string;
  name: string;
  publisher: string;
  url: string;
  licence: string;
  status: SourceStatus;
  /** ISO timestamp of the last successful fetch */
  fetchedAt: string | null;
  /** latest record period covered, e.g. "2026-09" */
  latestPeriod: string | null;
  rows: number;
  note?: string;
}

export interface DatasetMeta {
  /** ISO timestamp the snapshot was generated */
  generatedAt: string;
  /** true when the snapshot was produced by the fixture generator (tests only) */
  fixture: boolean;
  sources: SourceInfo[];
  counts: {
    hdbTransactions: number;
    hdbBlocks: number;
    hdbRentals: number;
    privateTransactions: number;
    condoTransactions: number;
    landedTransactions: number;
    privateRentals: number;
    projects: number;
    landedStreets: number;
    landedAddresses: number;
    launches: number;
    mrtStations: number;
    schools: number;
  };
  /** latest record month per family, "YYYY-MM" (rental fields absent in snapshots built before they were added) */
  latestMonth: { hdb: string | null; private: string | null; hdbRentals?: string | null; privateRentals?: string | null };
}

/* ------------------------------------------------------------------ */
/* Geography                                                           */
/* ------------------------------------------------------------------ */

export interface LatLng {
  lat: number;
  lng: number;
}

export type MrtLineCode = "NSL" | "EWL" | "NEL" | "CCL" | "DTL" | "TEL" | "JRL" | "CRL" | "BPLRT" | "SKLRT" | "PGLRT";

export interface MrtStation extends LatLng {
  /** e.g. "TAMPINES" (official name without "MRT STATION") */
  name: string;
  /** station codes, e.g. ["EW2", "DT32"] */
  codes: string[];
  lines: MrtLineCode[];
  /** "operational" stations are open; "future" stations are announced by LTA */
  status: "operational" | "future";
  /** expected opening year for future stations (LTA announcement), else null */
  expectedYear: number | null;
  /** true when coordinates are approximate (future stations without an exact published location) */
  approximate: boolean;
}

export type SchoolLevel = "PRIMARY" | "SECONDARY" | "JUNIOR COLLEGE" | "MIXED LEVELS" | "CENTRALISED INSTITUTE";

export interface School extends LatLng {
  name: string;
  level: SchoolLevel | string;
  address: string;
  postal: string;
  zone: string | null;
  type: string | null;
}

export interface NearbyStation {
  name: string;
  codes: string[];
  lines: MrtLineCode[];
  status: "operational" | "future";
  expectedYear: number | null;
  /** straight-line distance in metres */
  distanceM: number;
}

/* ------------------------------------------------------------------ */
/* HDB                                                                 */
/* ------------------------------------------------------------------ */

/** Flat types exactly as they appear in HDB data (MULTI GENERATION normalised to MULTI-GENERATION). */
export const HDB_FLAT_TYPES = ["1 ROOM", "2 ROOM", "3 ROOM", "4 ROOM", "5 ROOM", "EXECUTIVE", "MULTI-GENERATION"] as const;
export type HdbFlatType = (typeof HDB_FLAT_TYPES)[number];

export interface TxSummary {
  count: number;
  /** "YYYY-MM" of first and last recorded sale */
  first: string | null;
  last: string | null;
  lastPrice: number | null;
  /** median price per square foot over the 12 months to the dataset's latest month, null if no sales */
  medianPsf12m: number | null;
  /** number of sales in the 12 months to the dataset's latest month */
  count12m: number;
}

export interface HdbBlock extends Partial<LatLng> {
  /** "blk-872a-tampines-st-86" */
  slug: string;
  /** "872A" */
  block: string;
  /** street exactly as in HDB data, e.g. "TAMPINES ST 86" */
  street: string;
  /** full road name from OneMap if geocoded, e.g. "TAMPINES STREET 86" */
  streetFull: string | null;
  /** HDB town, e.g. "TAMPINES" */
  town: string;
  townSlug: string;
  postal: string | null;
  /** year the 99-year lease commenced (from resale records), null if unknown */
  leaseCommenceYear: number | null;
  /** year completed (HDB property information), null if unknown */
  yearCompleted: number | null;
  maxFloor: number | null;
  dwellingUnits: number | null;
  /** count of flats per flat type (sold + rental) from HDB property information */
  unitMix: Partial<Record<HdbFlatType, number>>;
  facilities: {
    commercial: boolean;
    marketHawker: boolean;
    multistoreyCarpark: boolean;
    precinctPavilion: boolean;
    miscellaneous: boolean;
  } | null;
  tx: TxSummary;
  /** rental approvals summary (HDB "renting out of flats" data) */
  rentals: { count12m: number; medianRent12m: number | null } | null;
  /** nearest operational MRT/LRT station, straight-line */
  nearestMrt: NearbyStation | null;
}

/** Columnar HDB resale file, one per town: data/hdb/tx/<townSlug>.json */
export interface HdbTxFile {
  town: string;
  /** block slugs, referenced by index from `b` */
  blocks: string[];
  flatTypes: string[];
  storeys: string[];
  models: string[];
  /** month index (months since 1990-01) */
  m: number[];
  /** index into blocks */
  b: number[];
  /** index into flatTypes */
  t: number[];
  /** index into storeys */
  s: number[];
  /** floor area, sqm × 10 */
  a: number[];
  /** resale price, SGD */
  p: number[];
  /** index into models */
  md: number[];
  /** remaining lease in months as published by HDB at the time of sale; -1 when not published (pre-2015 records) */
  rl: number[];
}

export interface HdbTransaction {
  /** "YYYY-MM" (registration month; approval month for 1990-1999 records) */
  month: string;
  monthIndex: number;
  blockSlug: string;
  town: string;
  flatType: string;
  /** "04 TO 06" */
  storeyRange: string;
  /** mid-point of the storey range, e.g. 5 */
  storeyMid: number;
  floorAreaSqm: number;
  floorAreaSqft: number;
  price: number;
  psf: number;
  flatModel: string;
  /** remaining lease in months at the time of sale: HDB-published when available, otherwise estimated from lease commencement year */
  remainingLeaseMonths: number | null;
  remainingLeaseEstimated: boolean;
}

/** Columnar HDB rental approvals file, one per town: data/hdb/rentals/<townSlug>.json */
export interface HdbRentFile {
  town: string;
  blocks: string[];
  flatTypes: string[];
  /** month index of rental approval */
  m: number[];
  b: number[];
  t: number[];
  /** monthly rent, SGD */
  r: number[];
}

export interface HdbRental {
  month: string;
  monthIndex: number;
  blockSlug: string;
  town: string;
  flatType: string;
  monthlyRent: number;
}

export interface TownSummary {
  town: string;
  slug: string;
  region: "Central" | "East" | "North" | "North-East" | "West";
  blocks: number;
  tx: TxSummary;
  /** median resale price over the last 12 months per flat type */
  medianPrice12m: Partial<Record<HdbFlatType, number>>;
  medianRent12m: Partial<Record<HdbFlatType, number>>;
}

/* ------------------------------------------------------------------ */
/* Private (URA / REALIS)                                              */
/* ------------------------------------------------------------------ */

export type MarketSegment = "CCR" | "RCR" | "OCR";

export type PrivatePropertyType =
  | "Condominium"
  | "Apartment"
  | "Executive Condominium"
  | "Strata Terrace"
  | "Strata Semi-detached"
  | "Strata Detached"
  | "Terrace"
  | "Semi-detached"
  | "Detached"
  | string;

export interface Tenure {
  /** raw tenure string, e.g. "99 yrs lease commencing from 2012" or "Freehold" */
  raw: string;
  kind: "freehold" | "leasehold";
  /** lease length in years (e.g. 99, 999, 103); null for freehold */
  years: number | null;
  /** year the lease commenced; null for freehold or unknown */
  startYear: number | null;
}

export interface PrivateProject extends Partial<LatLng> {
  /** "the-hillford" */
  slug: string;
  /** "THE HILLFORD" */
  name: string;
  street: string;
  /** postal district 1-28 */
  district: number | null;
  segment: MarketSegment | null;
  propertyTypes: PrivatePropertyType[];
  /** true when every sale in the project is a landed type (no strata apartments) */
  isLanded: boolean;
  tenure: Tenure | null;
  tx: TxSummary;
  rentals: { count12m: number; medianRent12m: number | null } | null;
  /** slug of the matching new launch, if any */
  launchSlug: string | null;
  nearestMrt: NearbyStation | null;
  /** true when unit-level (REALIS-style) records exist for this project */
  hasUnitLevel: boolean;
}

/** Columnar private transactions file, one per postal district: data/private/tx/d<NN>.json */
export interface PrivateTxFile {
  district: number;
  projects: string[];
  propertyTypes: string[];
  floorRanges: string[];
  m: number[];
  /** index into projects */
  pj: number[];
  /** area, sqm × 10 */
  a: number[];
  /** price, SGD (for bulk deals: total price of all units) */
  p: number[];
  /** index into floorRanges ("-" / "B1-B5" / "01-05" ...) */
  fr: number[];
  /** type of sale: 1 = new sale, 2 = sub sale, 3 = resale */
  ts: number[];
  /** index into propertyTypes */
  pt: number[];
  /** type of area: 0 = strata, 1 = land, 2 = unknown */
  ta: number[];
  /** number of units in the transaction (bulk deals > 1) */
  n: number[];
  /** OPTIONAL unit-level fields (REALIS-style imports only); parallel arrays when present */
  unit?: (string | null)[];
  address?: (string | null)[];
}

export interface PrivateTransaction {
  month: string;
  monthIndex: number;
  projectSlug: string;
  district: number;
  propertyType: string;
  floorRange: string;
  /** mid-point floor of floorRange, null for landed / unknown */
  floorMid: number | null;
  areaSqm: number;
  areaSqft: number;
  price: number;
  psf: number;
  typeOfSale: "New Sale" | "Sub Sale" | "Resale";
  typeOfArea: "Strata" | "Land" | "Unknown";
  units: number;
  /** "#05-12" when unit-level data is available */
  unit: string | null;
  /** full address when unit-level data is available, e.g. "13 HAIG LANE" */
  address: string | null;
}

/** Columnar private rentals file, one per postal district: data/private/rentals/d<NN>.json */
export interface PrivateRentFile {
  district: number;
  projects: string[];
  propertyTypes: string[];
  /** lease start month index */
  m: number[];
  pj: number[];
  pt: number[];
  /** monthly rent, SGD */
  r: number[];
  /** floor area range lower / upper bound in sqm (URA publishes ranges); -1 when unknown */
  alo: number[];
  ahi: number[];
  /** bedrooms; -1 when not published */
  br: number[];
}

export interface PrivateRental {
  month: string;
  monthIndex: number;
  projectSlug: string;
  district: number;
  propertyType: string;
  monthlyRent: number;
  areaSqmLow: number | null;
  areaSqmHigh: number | null;
  bedrooms: number | null;
}

export interface LandedStreet extends Partial<LatLng> {
  /** "haig-ln" */
  slug: string;
  /** "HAIG LANE" */
  street: string;
  district: number | null;
  segment: MarketSegment | null;
  propertyTypes: string[];
  tenures: string[];
  tx: TxSummary;
  /** slugs of the PrivateProject records whose landed sales are on this street */
  projects: string[];
  /** slugs of landed addresses on this street (REALIS-style data only) */
  addresses: string[];
}

export interface LandedAddress extends Partial<LatLng> {
  /** "13-haig-ln" */
  slug: string;
  /** "13 HAIG LANE" */
  address: string;
  houseNo: string;
  street: string;
  streetSlug: string;
  district: number | null;
  segment: MarketSegment | null;
  propertyType: string | null;
  tenure: Tenure | null;
  /** land area in sqm from the latest sale, null if unknown */
  landAreaSqm: number | null;
  tx: TxSummary;
}

export type LaunchType = "condo" | "ec" | "landed";

export interface LaunchSalesPoint {
  /** "YYYY-MM" */
  month: string;
  launchedInMonth: number | null;
  soldInMonth: number | null;
  launchedToDate: number | null;
  soldToDate: number | null;
  medianPsf: number | null;
  lowestPsf: number | null;
  highestPsf: number | null;
}

export interface NewLaunch extends Partial<LatLng> {
  slug: string;
  name: string;
  type: LaunchType;
  /** launched = units released for sale; upcoming = in URA pipeline, not yet launched */
  status: "launched" | "upcoming";
  street: string | null;
  district: number | null;
  segment: MarketSegment | null;
  developer: string | null;
  totalUnits: number | null;
  /** expected TOP / completion year from URA pipeline data */
  expectedCompletionYear: number | null;
  tenure: Tenure | null;
  sales: LaunchSalesPoint[];
  unitsSold: number | null;
  unitsLaunched: number | null;
  /** slug of the matching /condo/ project page, if transactions exist */
  projectSlug: string | null;
  nearestMrt: NearbyStation | null;
}

/* ------------------------------------------------------------------ */
/* Aggregate statistics                                                */
/* ------------------------------------------------------------------ */

/** One row of monthly statistics for a series (e.g. town × flat type). */
export interface MonthlyStat {
  /** month index */
  m: number;
  count: number;
  medianPrice: number;
  medianPsf: number;
}

export interface StatSeries {
  /** "hdb:TAMPINES:4 ROOM", "hdb:ALL:ALL", "private:OCR:Condominium", "private:D15:ALL", "rent-hdb:TAMPINES:4 ROOM" */
  key: string;
  label: string;
  points: MonthlyStat[];
}

export interface StatsFile {
  series: StatSeries[];
}

/* ------------------------------------------------------------------ */
/* Rates                                                               */
/* ------------------------------------------------------------------ */

export interface DatedValue {
  /** percent per annum */
  value: number;
  /** "YYYY-MM-DD" */
  date: string;
}

export interface RatesSnapshot {
  asOf: string;
  sora: {
    overnight: DatedValue | null;
    compounded1m: DatedValue | null;
    compounded3m: DatedValue | null;
    compounded6m: DatedValue | null;
    /** monthly series of 3M compounded SORA for charts */
    series3m: DatedValue[];
    source: string;
  };
  hdbConcessionaryRate: DatedValue & { source: string };
  cpfOaRate: DatedValue & { source: string };
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export type SearchKind = "hdb" | "condo" | "landed" | "landed-street" | "launch" | "town" | "mrt";

export interface SearchEntry {
  kind: SearchKind;
  /** URL path, e.g. "/hdb/blk-872a-tampines-st-86/" */
  href: string;
  /** primary label, e.g. "Blk 872A Tampines St 86" */
  label: string;
  /** secondary label, e.g. "Tampines · 4 ROOM, 5 ROOM" */
  sub: string;
  postal: string | null;
  /** extra lowercase search terms (full street name, aliases) */
  terms: string;
  /** ranking boost: number of transactions */
  weight: number;
}
