/** Client-safe constants for home listings. */

/**
 * Typical bedroom count by HDB flat type (HDB floor plans). Used to prefill the listing form and for
 * the sample listings; listers can change it. 1-room flats are left out (combined living / sleeping).
 */
export const HDB_TYPICAL_BEDROOMS: Record<string, number> = {
  "2 ROOM": 1,
  "3 ROOM": 2,
  "4 ROOM": 3,
  "5 ROOM": 3,
  EXECUTIVE: 3,
  "MULTI-GENERATION": 4,
};

/** Listing text limits (mirrored by the API schema). */
export const LISTING_LIMITS = {
  title: 120,
  description: 4000,
  contactName: 80,
  minSalePrice: 50_000,
  maxSalePrice: 100_000_000,
  minRent: 300,
  maxRent: 100_000,
  minAreaSqm: 10,
  maxAreaSqm: 10_000,
  maxFloor: 80,
  maxRooms: 20,
} as const;

/** Radius for the exit-audience heuristic (straight-line). */
export const EXIT_AUDIENCE_RADIUS_M = 2000;
/** Most places the fit tool accepts. */
export const FIT_MAX_PLACES = 3;
export const FIT_MAX_WEIGHT = 5;
