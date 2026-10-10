/**
 * Best-effort in-memory rate limiter (sliding window log per key).
 *
 * Each serverless instance keeps its own counters and they reset on cold start, so this only blunts
 * bursts from one client; it is not a security boundary. Memory is bounded by `maxKeys`.
 */
export interface RateLimitResult {
  allowed: boolean;
  /** requests left in the current window after this one */
  remaining: number;
  /** milliseconds until the next request would be allowed (0 when allowed) */
  retryAfterMs: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor(opts: { limit: number; windowMs: number; maxKeys?: number }) {
    if (!(opts.limit >= 1) || !(opts.windowMs > 0)) throw new Error("RateLimiter: limit >= 1 and windowMs > 0 required");
    this.limit = Math.floor(opts.limit);
    this.windowMs = opts.windowMs;
    this.maxKeys = Math.max(1, opts.maxKeys ?? 10_000);
  }

  /** Record an attempt for `key` and say whether it is within the limit. Rejected attempts are not counted. */
  check(key: string, now: number = Date.now()): RateLimitResult {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, recent[0] + this.windowMs - now) };
    }
    recent.push(now);
    // re-insert so Map order tracks recency of use
    this.hits.delete(key);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.prune(now);
    return { allowed: true, remaining: this.limit - recent.length, retryAfterMs: 0 };
  }

  /** Number of keys currently tracked (for tests and diagnostics). */
  get size(): number {
    return this.hits.size;
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [k, times] of this.hits) {
      if (times.every((t) => t <= cutoff)) this.hits.delete(k);
    }
    // still too many: drop least recently used keys
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value as string;
      this.hits.delete(oldest);
    }
  }
}

/**
 * Client IP for rate limiting, from the platform's forwarding headers (Vercel sets x-forwarded-for
 * and x-real-ip). Falls back to "unknown", which then shares one bucket.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
