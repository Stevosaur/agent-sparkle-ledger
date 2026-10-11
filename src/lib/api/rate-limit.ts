/**
 * In-memory rate limiting (sliding-window counter) for route handlers.
 *
 * Each key keeps two fixed-window counters (current and previous). The effective count is
 *   previous × (share of the previous window still inside the sliding window) + current
 * which approximates a true sliding log with O(1) memory per key.
 *
 * Limits are per server instance: on a multi-instance deployment (e.g. several Vercel function
 * instances) the real ceiling is `max × instances`. That is acceptable for abuse protection; use a
 * shared store if hard global limits are ever needed.
 */

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  /** requests left in the current sliding window (0 when blocked) */
  remaining: number;
  /** seconds until the next request is allowed (0 when ok) */
  retryAfterSec: number;
  /** seconds until the current fixed window rolls over */
  resetSec: number;
}

interface Entry {
  windowStart: number;
  current: number;
  previous: number;
}

export interface RateLimiterOptions {
  windowMs: number;
  /** default maximum requests per window (can be overridden per call) */
  max: number;
  /** cap on tracked keys; the least recently used keys are dropped beyond it */
  maxKeys?: number;
  /** clock, injectable for tests */
  now?: () => number;
}

export class RateLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly windowMs: number;
  private readonly max: number;
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(opts: RateLimiterOptions) {
    if (!(opts.windowMs > 0)) throw new Error("windowMs must be positive");
    this.windowMs = opts.windowMs;
    this.max = opts.max;
    this.maxKeys = opts.maxKeys ?? 10_000;
    this.now = opts.now ?? Date.now;
  }

  /** Count one request for `key` and report whether it is allowed. Blocked requests are not counted. */
  check(key: string, max: number = this.max): RateLimitResult {
    const now = this.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { windowStart, current: 0, previous: 0 };
    } else if (entry.windowStart !== windowStart) {
      // roll forward: the old current becomes previous only if it was the immediately preceding window
      entry = { windowStart, current: 0, previous: entry.windowStart === windowStart - this.windowMs ? entry.current : 0 };
    }
    // refresh recency for LRU eviction
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.evict();

    const elapsed = (now - windowStart) / this.windowMs;
    const weightedPrevious = entry.previous * (1 - elapsed);
    const used = weightedPrevious + entry.current;
    const resetSec = Math.max(0, Math.ceil((windowStart + this.windowMs - now) / 1000));

    if (max <= 0 || used + 1 > max) {
      return { ok: false, limit: Math.max(0, max), remaining: 0, retryAfterSec: this.retryAfter(entry, now, windowStart, max), resetSec };
    }
    entry.current += 1;
    return { ok: true, limit: max, remaining: Math.max(0, Math.floor(max - (used + 1))), retryAfterSec: 0, resetSec };
  }

  /** Seconds until the weighted count drops enough to admit one more request. */
  private retryAfter(entry: Entry, now: number, windowStart: number, max: number): number {
    if (max <= 0) return Math.ceil(this.windowMs / 1000);
    // Within the current window the previous window's weight decays linearly; if the current window
    // alone is full we must wait for the next window (when current becomes the decaying "previous").
    if (entry.current + 1 > max) {
      const nextWindow = windowStart + this.windowMs;
      // In the next window, used(t) = current × (1 - t) ≤ max - 1  =>  t ≥ 1 - (max - 1) / current
      const t = entry.current > 0 ? Math.max(0, 1 - (max - 1) / entry.current) : 0;
      return Math.max(1, Math.ceil((nextWindow + t * this.windowMs - now) / 1000));
    }
    // used(t) = previous × (1 - t) + current ≤ max - 1  =>  t ≥ 1 - (max - 1 - current) / previous
    const t = entry.previous > 0 ? Math.max(0, 1 - (max - 1 - entry.current) / entry.previous) : 0;
    return Math.max(1, Math.ceil((windowStart + t * this.windowMs - now) / 1000));
  }

  private evict(): void {
    while (this.entries.size > this.maxKeys) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  /** Number of tracked keys (tests / diagnostics). */
  get size(): number {
    return this.entries.size;
  }

  reset(): void {
    this.entries.clear();
  }
}

/**
 * Client IP from proxy headers. On Vercel `x-real-ip` and the first `x-forwarded-for` entry are set by
 * the platform (client-supplied values are overwritten). Falls back to "unknown" so local requests share
 * one bucket rather than bypassing the limit.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/** Standard headers describing a rate-limit decision. */
export function rateLimitHeaders(r: RateLimitResult, opts: { includeRemaining?: boolean } = {}): Record<string, string> {
  const h: Record<string, string> = { "X-RateLimit-Limit": String(r.limit) };
  if (opts.includeRemaining ?? true) {
    h["X-RateLimit-Remaining"] = String(r.remaining);
    h["X-RateLimit-Reset"] = String(r.resetSec);
  }
  if (!r.ok) h["Retry-After"] = String(r.retryAfterSec);
  return h;
}
