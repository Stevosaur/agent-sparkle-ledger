import { NextResponse, type NextRequest } from "next/server";
import { RateLimiter, clientIp, rateLimitHeaders } from "./rate-limit";
import { PUBLIC_API_RATE_LIMIT } from "./constants";

export { CACHE, PUBLIC_API_RATE_LIMIT } from "./constants";

/**
 * Shared plumbing for the public read-only API (/api/v1/...): CORS, CDN caching, per-IP rate limiting
 * and a consistent error shape `{ error: "<code>", message: "<human readable>" }`.
 */

const limiter = new RateLimiter({ windowMs: PUBLIC_API_RATE_LIMIT.windowSec * 1000, max: PUBLIC_API_RATE_LIMIT.max });

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
  "Access-Control-Max-Age": "86400",
};

export function cacheControl(sMaxAge: number): string {
  return `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 4}`;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function apiErrorResponse(status: number, code: string, message: string, extraHeaders: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ error: code, message }, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store", ...extraHeaders } });
}

/** Preflight response for every /api/v1 route. */
export function apiOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=86400" } });
}

/**
 * Wrap a public API GET handler: rate limit by client IP, add CORS + cache headers, and turn
 * ApiError (and unexpected errors) into JSON error responses that are never cached.
 */
export async function handlePublicGet(req: NextRequest, sMaxAge: number, produce: () => unknown | Promise<unknown>): Promise<NextResponse> {
  const rl = limiter.check(`ip:${clientIp(req.headers)}`);
  if (!rl.ok) {
    return apiErrorResponse(429, "rate_limited", `Too many requests: the public API allows ${rl.limit} requests per ${PUBLIC_API_RATE_LIMIT.windowSec} seconds per IP address.`, rateLimitHeaders(rl));
  }
  try {
    const body = await produce();
    return NextResponse.json(body, {
      status: 200,
      // Remaining/reset are per client, so they are omitted from responses a CDN may share.
      headers: { ...CORS_HEADERS, ...rateLimitHeaders(rl, { includeRemaining: false }), "Cache-Control": cacheControl(sMaxAge) },
    });
  } catch (err) {
    if (err instanceof ApiError) return apiErrorResponse(err.status, err.code, err.message);
    console.error("[api/v1] unexpected error", err);
    return apiErrorResponse(500, "internal_error", "Unexpected error. Please try again later.");
  }
}

/* ------------------------------------------------------------------ */
/* Parameter parsing                                                   */
/* ------------------------------------------------------------------ */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DECIMAL_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Validate a path slug; unknown shapes are treated as not found. */
export function requireSlug(slug: string | undefined, what: string): string {
  const s = (slug ?? "").trim().toLowerCase();
  if (!s || s.length > 160 || !SLUG_RE.test(s)) throw new ApiError(404, "not_found", `No ${what} matches that slug.`);
  return s;
}

/** Parse a numeric query parameter with bounds; `fallback` (if given) is used when the parameter is absent. */
export function numberParam(params: URLSearchParams, name: string, opts: { min: number; max: number; integer?: boolean; fallback?: number }): number {
  const raw = params.get(name);
  if (raw == null || raw.trim() === "") {
    if (opts.fallback !== undefined) return opts.fallback;
    throw new ApiError(400, "invalid_parameter", `Query parameter "${name}" is required.`);
  }
  const cleaned = raw.replace(/[,_\s]/g, "");
  // Plain decimal numbers only (Number() would also accept "0x10", "0b1" and "Infinity").
  const value = DECIMAL_RE.test(cleaned) ? Number(cleaned) : Number.NaN;
  if (!Number.isFinite(value)) throw new ApiError(400, "invalid_parameter", `Query parameter "${name}" must be a number.`);
  if (opts.integer && !Number.isInteger(value)) throw new ApiError(400, "invalid_parameter", `Query parameter "${name}" must be a whole number.`);
  if (value < opts.min || value > opts.max) throw new ApiError(400, "invalid_parameter", `Query parameter "${name}" must be between ${opts.min} and ${opts.max}.`);
  return value;
}

/** Parse an enum query parameter (case-insensitive). */
export function enumParam<T extends string>(params: URLSearchParams, name: string, values: readonly T[], fallback?: T): T {
  const raw = params.get(name);
  if (raw == null || raw.trim() === "") {
    if (fallback !== undefined) return fallback;
    throw new ApiError(400, "invalid_parameter", `Query parameter "${name}" is required (one of ${values.join(", ")}).`);
  }
  const match = values.find((v) => v.toLowerCase() === raw.trim().toLowerCase());
  if (!match) throw new ApiError(400, "invalid_parameter", `Query parameter "${name}" must be one of ${values.join(", ")}.`);
  return match;
}

/** Test hook: clear rate-limit state. */
export function resetPublicApiRateLimit(): void {
  limiter.reset();
}
