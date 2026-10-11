/** Public API limits and cache lifetimes (shared by route handlers, the OpenAPI document and /docs/). */

export const PUBLIC_API_RATE_LIMIT = { max: 60, windowSec: 60 } as const;

/** CDN cache lifetimes (seconds) for the public API. */
export const CACHE = {
  /** dataset-backed responses: the snapshot changes at most daily */
  data: 3600,
  /** pure calculators: only change when rules change (deploy) */
  calc: 86400,
} as const;

/** Number of latest sales the public API returns; the full history stays on the website. */
export const API_LATEST_SALES = 10;
