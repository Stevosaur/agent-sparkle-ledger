/**
 * Routing adapters. OneMap (Singapore Land Authority) when credentials are provided, otherwise a clearly
 * labelled straight-line estimate.
 *
 * VERIFIED FACT (OneMap docs via search excerpts, see docs/research-notes.md): token from
 * POST https://www.onemap.gov.sg/api/auth/post/getToken ({email,password}), valid ~72h; routing at
 * GET https://www.onemap.gov.sg/api/public/routingsvc/route (authenticated).
 * UNVERIFIED: exact query parameter names — kept isolated here and guarded with a fallback.
 */
import { straightLineDistance } from "@/lib/domain/routing";
import type { RoutingProvider } from "./types";

class StraightLineProvider implements RoutingProvider {
  kind = "ROUTING";
  provider = "Straight-line estimate";
  status = "MOCK" as const;
  description = "Haversine × 1.35 road factor at 38 km/h night average. Set ONEMAP_EMAIL/ONEMAP_PASSWORD for OneMap routing.";
  async leg(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    return { ...straightLineDistance(a, b), estimated: true };
  }
}

class OneMapProvider implements RoutingProvider {
  kind = "ROUTING";
  provider = "OneMap (SLA)";
  status = "CONNECTED" as const;
  description = "OneMap routing service (drive).";
  private token: { value: string; exp: number } | null = null;
  private cache = new Map<string, { km: number; minutes: number; estimated: boolean }>();
  constructor(private email: string, private password: string) {}
  private async getToken() {
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    const res = await fetch("https://www.onemap.gov.sg/api/auth/post/getToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!res.ok) throw new Error(`OneMap token HTTP ${res.status}`);
    const j = (await res.json()) as { access_token: string; expiry_timestamp: string };
    this.token = { value: j.access_token, exp: Number(j.expiry_timestamp) * 1000 };
    return this.token.value;
  }
  async leg(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const key = `${a.lat},${a.lng}>${b.lat},${b.lng}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    try {
      const token = await this.getToken();
      const url = `https://www.onemap.gov.sg/api/public/routingsvc/route?start=${a.lat},${a.lng}&end=${b.lat},${b.lng}&routeType=drive`;
      const res = await fetch(url, { headers: { Authorization: token } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { route_summary?: { total_distance: number; total_time: number } };
      if (!j.route_summary) throw new Error("no summary");
      const out = { km: Math.round(j.route_summary.total_distance / 100) / 10, minutes: Math.round(j.route_summary.total_time / 60), estimated: false };
      this.cache.set(key, out);
      return out;
    } catch {
      return { ...straightLineDistance(a, b), estimated: true };
    }
  }
}

let cached: RoutingProvider | null = null;
export function getRouting(): RoutingProvider {
  if (cached) return cached;
  const e = process.env.ONEMAP_EMAIL;
  const p = process.env.ONEMAP_PASSWORD;
  cached = e && p ? new OneMapProvider(e, p) : new StraightLineProvider();
  return cached;
}
