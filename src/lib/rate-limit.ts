/**
 * Simple fixed-window in-memory rate limiter (per process). Good enough for a single-node MVP;
 * replace with Redis/Upstash in a multi-instance deployment.
 */
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (buckets.size > 10000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  return b.count > limit ? { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) } : { ok: true, retryAfter: 0 };
}

export const clientIp = (h: Headers) => h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "local";
