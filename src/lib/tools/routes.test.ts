import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as valuationPost } from "@/app/api/gated/valuation/route";
import { POST as reportPost } from "@/app/api/gated/valuation/report/route";
import { GET as supplyDemandGet } from "@/app/api/gated/supply-demand/[slug]/route";
import { GET as fitGet } from "@/app/api/affordability/fit/route";
import { POST as savePost } from "@/app/api/affordability/save/route";

/**
 * Route handlers under both gating modes. Supabase is not configured in tests, so every visitor is
 * anonymous: "enforce" must refuse gated data, "open" must serve it.
 */

const BASE = "http://localhost:3000";
const valuationBody = JSON.stringify({ ref: "hdb:blk-872a-tampines-st-86", flatType: "4 ROOM", storeyRange: "07 TO 09", areaSqm: 93 });
const post = (path: string, body: string) => new NextRequest(`${BASE}${path}`, { method: "POST", body, headers: { "content-type": "application/json" } });
const sdCtx = (slug: string) => ({ params: Promise.resolve({ slug }) });

afterEach(() => {
  delete process.env.GATING_MODE;
});

describe("gated routes when gating is enforced", () => {
  it("refuses anonymous visitors without leaking data", async () => {
    process.env.GATING_MODE = "enforce";
    const v = await valuationPost(post("/api/gated/valuation/", valuationBody));
    expect(v.status).toBe(401);
    expect(v.headers.get("cache-control")).toBe("private, no-store");
    expect(await v.json()).toMatchObject({ error: "sign_in_required", feature: "valuation.estimate" });
    expect((await reportPost(post("/api/gated/valuation/report/", valuationBody))).status).toBe(401);
    const sd = await supplyDemandGet(new NextRequest(`${BASE}/api/gated/supply-demand/blk-872a-tampines-st-86/`), sdCtx("blk-872a-tampines-st-86"));
    expect(sd.status).toBe(401);
    expect(await sd.json()).toMatchObject({ feature: "supply-demand" });
  });

  it("keeps public endpoints public", async () => {
    process.env.GATING_MODE = "enforce";
    const fit = await fitGet(new NextRequest(`${BASE}/api/affordability/fit/?maxPrice=650000&kind=hdb`));
    expect(fit.status).toBe(200);
    expect(fit.headers.get("cache-control")).toContain("public");
  });
});

describe("gated routes in open (preview) mode", () => {
  it("serves valuation and supply-demand data, privately", async () => {
    process.env.GATING_MODE = "open";
    const v = await valuationPost(post("/api/gated/valuation/", valuationBody));
    expect(v.status).toBe(200);
    expect(v.headers.get("cache-control")).toBe("private, no-store");
    const body = await v.json();
    expect(body.subject.ref).toBe("hdb:blk-872a-tampines-st-86");
    expect(body.comparables.length).toBeGreaterThan(0);
    const sd = await supplyDemandGet(new NextRequest(`${BASE}/api/gated/supply-demand/blk-872a-tampines-st-86/?radius=3000`), sdCtx("blk-872a-tampines-st-86"));
    expect(sd.status).toBe(200);
    expect((await sd.json()).radiusM).toBe(3000);
  });

  it("validates input", async () => {
    process.env.GATING_MODE = "open";
    expect((await valuationPost(post("/api/gated/valuation/", "not json"))).status).toBe(400);
    expect((await valuationPost(post("/api/gated/valuation/", JSON.stringify({ ref: "nope", areaSqm: 90 })))).status).toBe(400);
    expect((await valuationPost(post("/api/gated/valuation/", JSON.stringify({ ref: "hdb:blk-x", areaSqm: -1 })))).status).toBe(400);
    expect((await valuationPost(post("/api/gated/valuation/", "x".repeat(5000)))).status).toBe(413);
    expect((await supplyDemandGet(new NextRequest(`${BASE}/api/gated/supply-demand/x/?radius=1500`), sdCtx("blk-872a-tampines-st-86"))).status).toBe(400);
    expect((await supplyDemandGet(new NextRequest(`${BASE}/api/gated/supply-demand/nope/`), sdCtx("nope"))).status).toBe(404);
    expect((await fitGet(new NextRequest(`${BASE}/api/affordability/fit/?maxPrice=0&kind=hdb`))).status).toBe(400);
    expect((await fitGet(new NextRequest(`${BASE}/api/affordability/fit/?maxPrice=900000&kind=condo&sizeSqft=50`))).status).toBe(400);
  });

  it("reports saving as unavailable without accounts", async () => {
    const res = await savePost(post("/api/affordability/save/", JSON.stringify({ label: "x", input: {}, result: {} })));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "saving_unavailable" });
  });
});
