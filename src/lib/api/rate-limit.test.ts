import { describe, expect, it } from "vitest";
import { RateLimiter, clientIp, rateLimitHeaders } from "./rate-limit";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("RateLimiter", () => {
  it("allows up to max requests per window and then blocks", () => {
    const c = clock(0);
    const rl = new RateLimiter({ windowMs: 60_000, max: 3, now: c.now });
    expect([1, 2, 3].map(() => rl.check("a").ok)).toEqual([true, true, true]);
    const blocked = rl.check("a");
    expect(blocked).toMatchObject({ ok: false, limit: 3, remaining: 0 });
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    // other keys are independent
    expect(rl.check("b").ok).toBe(true);
  });

  it("reports remaining requests", () => {
    const c = clock(0);
    const rl = new RateLimiter({ windowMs: 60_000, max: 5, now: c.now });
    expect(rl.check("a").remaining).toBe(4);
    expect(rl.check("a").remaining).toBe(3);
  });

  it("slides: the previous window's count decays across the next window", () => {
    const c = clock(0);
    const rl = new RateLimiter({ windowMs: 60_000, max: 10, now: c.now });
    for (let i = 0; i < 10; i++) expect(rl.check("a").ok).toBe(true);
    expect(rl.check("a").ok).toBe(false);
    // just after the window rolls, the previous 10 still weigh ~10
    c.advance(60_000 + 1_000);
    const early = rl.check("a");
    expect(early.ok).toBe(false);
    // retry-after points at the moment one request fits again
    c.advance(early.retryAfterSec * 1000);
    expect(rl.check("a").ok).toBe(true);
    // two windows later everything has decayed
    c.advance(120_000);
    for (let i = 0; i < 10; i++) expect(rl.check("a").ok).toBe(true);
  });

  it("does not count blocked requests", () => {
    const c = clock(0);
    const rl = new RateLimiter({ windowMs: 1_000, max: 1, now: c.now });
    expect(rl.check("a").ok).toBe(true);
    for (let i = 0; i < 5; i++) expect(rl.check("a").ok).toBe(false);
    c.advance(2_000);
    expect(rl.check("a").ok).toBe(true);
  });

  it("supports a per-call limit (e.g. higher for signed-in users)", () => {
    const c = clock(0);
    const rl = new RateLimiter({ windowMs: 60_000, max: 1, now: c.now });
    expect(rl.check("user:1", 3).ok).toBe(true);
    expect(rl.check("user:1", 3).ok).toBe(true);
    expect(rl.check("user:1", 3).ok).toBe(true);
    expect(rl.check("user:1", 3).ok).toBe(false);
    expect(rl.check("ip:x").ok).toBe(true);
    expect(rl.check("ip:x").ok).toBe(false);
    expect(rl.check("zero", 0).ok).toBe(false);
  });

  it("evicts the least recently used keys beyond maxKeys", () => {
    const rl = new RateLimiter({ windowMs: 60_000, max: 1, maxKeys: 2, now: () => 0 });
    rl.check("a");
    rl.check("b");
    rl.check("c");
    expect(rl.size).toBe(2);
    // "a" was evicted, so it starts fresh
    expect(rl.check("a").ok).toBe(true);
  });
});

describe("clientIp / headers", () => {
  it("prefers x-real-ip, then the first x-forwarded-for entry", () => {
    expect(clientIp(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "3.3.3.3, 10.0.0.1" }))).toBe("3.3.3.3");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("builds rate-limit headers", () => {
    expect(rateLimitHeaders({ ok: true, limit: 60, remaining: 59, retryAfterSec: 0, resetSec: 30 })).toEqual({ "X-RateLimit-Limit": "60", "X-RateLimit-Remaining": "59", "X-RateLimit-Reset": "30" });
    expect(rateLimitHeaders({ ok: true, limit: 60, remaining: 59, retryAfterSec: 0, resetSec: 30 }, { includeRemaining: false })).toEqual({ "X-RateLimit-Limit": "60" });
    expect(rateLimitHeaders({ ok: false, limit: 60, remaining: 0, retryAfterSec: 12, resetSec: 30 })["Retry-After"]).toBe("12");
  });
});
