/** Home listings: shapes shared by the data access layer, route handlers and client components. */

export const LISTING_TYPES = ["sale", "rent"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

/** Property kinds a listing may point at (a PropertyRef kind). */
export const LISTING_KINDS = ["hdb", "condo", "landed"] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

/** A row of `home_listings`, camel-cased. */
export interface HomeListing {
  id: string;
  userId: string | null;
  listingType: ListingType;
  /** property reference, e.g. "hdb:blk-872a-tampines-st-86" or "condo:the-hillford" */
  ref: string;
  title: string;
  description: string | null;
  askingPrice: number;
  /** HDB flat type ("4 ROOM") or a free-form unit type for private homes */
  flatType: string | null;
  areaSqm: number | null;
  /** storey number */
  floorLevel: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  contactName: string | null;
  /** WhatsApp number in international format without "+" (e.g. 6591234567) */
  whatsapp: string | null;
  status: "active" | "closed";
  lat: number | null;
  lng: number | null;
  createdAt: string;
  updatedAt: string | null;
  /** true for the demo listings generated from the synthetic fixture dataset */
  sample?: boolean;
}

/** Public card data for listing grids (no description or contact details). */
export interface ListingSummary {
  id: string;
  listingType: ListingType;
  title: string;
  askingPrice: number;
  flatType: string | null;
  areaSqm: number | null;
  floorLevel: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  createdAt: string;
  ref: string;
  kind: ListingKind | null;
  propertyLabel: string | null;
  propertyHref: string | null;
  /** "town:tampines" or "d:18" */
  areaKey: string | null;
  areaLabel: string | null;
  sample: boolean;
}

export interface ListingFilters {
  type: ListingType;
  kind: ListingKind | null;
  area: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  /** minimum bedrooms; 5 means "5 or more" */
  bedrooms: number | null;
}

export interface AreaOption {
  key: string;
  label: string;
  group: "town" | "district";
}

export interface ListingsPage {
  listings: ListingSummary[];
  total: number;
  /** where listings come from on this deployment */
  backend: ListingsBackend;
  /** true when the listing store could not be read */
  unavailable?: boolean;
}

export type ListingsBackend = "supabase" | "sample" | "none";

/* ------------------------------------------------------------------ */
/* Fair value                                                          */
/* ------------------------------------------------------------------ */

export type FairValueMethod = "block-iqr" | "town-iqr" | "town-median" | "project-psf-iqr" | "district-psf-iqr" | "project-rent-iqr";

export interface FairValueRange {
  basis: "sale" | "rent";
  method: FairValueMethod;
  low: number;
  mid: number;
  high: number;
  /** psf quartiles for psf-based methods */
  psf: { low: number; mid: number; high: number } | null;
  sampleSize: number;
  /** "YYYY-MM" window of the records used */
  from: string;
  to: string;
  /** what the records describe, e.g. "Blk 872A Tampines St 86 · 4 ROOM" */
  scope: string;
  source: string;
}

export type FairValueUnavailableReason =
  | "unresolved"
  | "landed"
  | "no-flat-type"
  | "no-area"
  | "no-hdb-data"
  | "no-private-data"
  | "no-rentals"
  | "no-recent-records";

export type FairValueOutcome = { ok: true; range: FairValueRange; position: "below" | "within" | "above" } | { ok: false; reason: FairValueUnavailableReason; source: string };

/* ------------------------------------------------------------------ */
/* Exit audience                                                       */
/* ------------------------------------------------------------------ */

export interface ExitAudienceBlock {
  slug: string;
  label: string;
  town: string;
  distanceM: number;
  mopYear: number;
  units: number;
}

export interface ExitAudience {
  available: true;
  /** "hdb": nearby flats reaching MOP soon; "private": nearby flats that passed MOP recently */
  audience: "hdb" | "private";
  radiusM: number;
  fromYear: number;
  toYear: number;
  totalUnits: number;
  totalBlocks: number;
  cohorts: { year: number; units: number; blocks: number }[];
  topBlocks: ExitAudienceBlock[];
  /** blocks in the radius left out because year completed or dwelling units are unknown */
  excludedBlocks: number;
}

export type ExitAudienceResult = ExitAudience | { available: false; reason: "no-location" | "no-hdb-data" };

/* ------------------------------------------------------------------ */
/* Fit                                                                 */
/* ------------------------------------------------------------------ */

export interface FitPlace {
  ref: string;
  label: string;
  lat: number;
  lng: number;
  weight: number;
}

export interface FitResultRow {
  id: string;
  kind: "listing" | "hdb" | "condo";
  label: string;
  sub: string | null;
  href: string;
  /** weighted mean straight-line distance to the places, metres */
  score: number;
  /** distance to each place, metres, in place order */
  distances: number[];
  listingType?: ListingType;
  askingPrice?: number;
  medianPsf12m?: number | null;
  count12m?: number;
  lastPrice?: number | null;
}

export interface FitResponse {
  mode: "listings" | "properties";
  places: FitPlace[];
  /** refs that could not be resolved (unknown, or no coordinates) */
  unresolved: string[];
  results: FitResultRow[];
  candidates: number;
}
