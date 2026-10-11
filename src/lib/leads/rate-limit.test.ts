import { describe, expect, it } from "vitest";
import { RateLimiter, clientIpFrom } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows `limit` requests per window, then blocks with a retry hint", () => {
    const rl = new RateLimiter({ limit: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    expect(rl.check("ip", t0)).toEqual({ allowed: true, remaining: 2, retryAfterMs: 0 });
    expect(rl.check("ip", t0 + 1).allowed).toBe(true);
    expect(rl.check("ip", t0 + 2)).toEqual({ allowed: true, remaining: 0, retryAfterMs: 0 });
    const blocked = rl.check("ip", t0 + 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(50_000);
  });

  it("slides: requests become available again as old ones leave the window", () => {
    const rl = new RateLimiter({ limit: 2, windowMs: 1000 });
    expect(rl.check("k", 0).allowed).toBe(true);
    expect(rl.check("k", 500).allowed).toBe(true);
    expect(rl.check("k", 900).allowed).toBe(false);
    expect(rl.check("k", 1001).allowed).toBe(true); // the t=0 hit expired
    expect(rl.check("k", 1200).allowed).toBe(false); // t=500 and t=1001 still inside
  });

  it("does not count rejected attempts", () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.check("k", 0).allowed).toBe(true);
    for (let t = 100; t < 1000; t += 100) expect(rl.check("k", t).allowed).toBe(false);
    expect(rl.check("k", 1001).allowed).toBe(true);
  });

  it("keeps keys independent", () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("b", 0).allowed).toBe(true);
    expect(rl.check("a", 1).allowed).toBe(false);
  });

  it("bounds memory by evicting expired, then least recently used keys", () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3 });
    rl.check("a", 0);
    rl.check("b", 0);
    rl.check("c", 0);
    rl.check("d", 10); // over the cap: nothing expired yet, so "a" (least recent) goes
    expect(rl.size).toBe(3);
    expect(rl.check("a", 20).allowed).toBe(true); // forgotten, so allowed again
    rl.check("e", 5000); // everything else has expired by now
    expect(rl.size).toBeLessThanOrEqual(3);
  });

  it("rejects nonsensical configuration", () => {
    expect(() => new RateLimiter({ limit: 0, windowMs: 1000 })).toThrow();
    expect(() => new RateLimiter({ limit: 1, windowMs: 0 })).toThrow();
  });
});

describe("clientIpFrom", () => {
  it("uses the first x-forwarded-for hop, then x-real-ip", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIpFrom(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
