import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { HdbContextData, HdbSalesPage } from "@/lib/hdb-insights";

const gate = vi.hoisted(() => ({ allow: true, calls: [] as string[] }));

vi.mock("@/lib/auth/require", () => ({
  requireFeature: async (feature: string) => {
    gate.calls.push(feature);
    return gate.allow
      ? { ok: true, viewer: {} }
      : { ok: false, response: NextResponse.json({ error: "sign_in_required", feature }, { status: 401, headers: { "Cache-Control": "private, no-store" } }) };
  },
}));

// A copy of Blk 872A without coordinates, to exercise the "not geocoded yet" branches.
vi.mock("@/lib/data/hdb", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/data/hdb")>();
  return {
    ...mod,
    getHdbBlock: (slug: string) => {
      if (slug !== "blk-no-coords") return mod.getHdbBlock(slug);
      const base = mod.getHdbBlock("blk-872a-tampines-st-86");
      return base ? { ...base, slug, lat: undefined, lng: undefined, nearestMrt: null } : null;
    },
  };
});

const { GET: salesGET } = await import("./[slug]/sales/route");
const { GET: contextGET } = await import("./[slug]/context/route");

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const salesReq = (slug: string, qs = "") => new NextRequest(`http://localhost/api/gated/hdb/${slug}/sales/${qs}`);

beforeEach(() => {
  gate.allow = true;
  gate.calls = [];
});

describe("GET /api/gated/hdb/<slug>/sales/", () => {
  it("returns newest-first pages behind sales.full with no-store caching", async () => {
    const res = await salesGET(salesReq("blk-872a-tampines-st-86"), ctx("blk-872a-tampines-st-86"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(gate.calls).toEqual(["sales.full"]);
    const body = (await res.json()) as HdbSalesPage;
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
    expect(body.total).toBeGreaterThan(0);
    expect(body.rows.length).toBe(Math.min(50, body.total));
    const months = body.rows.map((r) => r.month);
    expect([...months].sort().reverse()).toEqual(months);
    expect(body.flatTypes.length).toBeGreaterThan(0);
  });

  it("filters by flat type and clamps the page", async () => {
    const res = await salesGET(salesReq("blk-872a-tampines-st-86", "?flatType=4%20ROOM&page=40"), ctx("blk-872a-tampines-st-86"));
    const body = (await res.json()) as HdbSalesPage;
    expect(body.flatType).toBe("4 ROOM");
    expect(body.page).toBe(body.totalPages);
    expect(body.rows.every((r) => r.flatType === "4 ROOM")).toBe(true);
  });

  it("rejects unknown flat types and unknown blocks", async () => {
    expect((await salesGET(salesReq("blk-872a-tampines-st-86", "?flatType=PENTHOUSE"), ctx("blk-872a-tampines-st-86"))).status).toBe(400);
    const missing = await salesGET(salesReq("blk-does-not-exist"), ctx("blk-does-not-exist"));
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns the gate's response when the viewer is not entitled", async () => {
    gate.allow = false;
    const res = await salesGET(salesReq("blk-872a-tampines-st-86"), ctx("blk-872a-tampines-st-86"));
    expect(res.status).toBe(401);
  });

  it("handles a block with no sales", async () => {
    const body = (await (await salesGET(salesReq("blk-999-tampines-st-99"), ctx("blk-999-tampines-st-99"))).json()) as HdbSalesPage;
    expect(body).toMatchObject({ total: 0, totalPages: 1, page: 1, rows: [], flatTypes: [] });
  });
});

describe("GET /api/gated/hdb/<slug>/context/", () => {
  const req = new Request("http://localhost/");

  it("returns rental demand and competing supply behind property.context", async () => {
    const res = await contextGET(req, ctx("blk-872a-tampines-st-86"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(gate.calls).toEqual(["property.context"]);
    const body = (await res.json()) as HdbContextData;
    expect(body.rentals.months).toBe(24);
    expect(body.rentals.toMonth).not.toBeNull();
    expect(body.yields.rows.length).toBeGreaterThan(0);
    expect(body.mop).not.toBeNull();
    expect(body.mop!.blocks.every((b) => b.slug !== "blk-872a-tampines-st-86" && b.distanceM <= 1000)).toBe(true);
    expect(body.launches.available).toBe(true);
    expect(body.launches.rows!.every((l) => l.distanceM <= 2000)).toBe(true);
  });

  it("agrees with the block summary on 12-month rental approvals", async () => {
    const { getHdbBlock } = await import("@/lib/data/hdb");
    const body = (await (await contextGET(req, ctx("blk-872a-tampines-st-86"))).json()) as HdbContextData;
    const summary = getHdbBlock("blk-872a-tampines-st-86")!.rentals!;
    expect(body.yields.rows.reduce((s, r) => s + r.rentCount, 0)).toBe(summary.count12m);
  });

  it("returns null supply context for a block without coordinates", async () => {
    const res = await contextGET(req, ctx("blk-no-coords"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as HdbContextData;
    expect(body.mop).toBeNull();
    expect(body.launches.rows).toBeNull();
    expect(body.rentals.total).toBe(0);
    expect(body.yields.rows.every((r) => r.grossYield == null)).toBe(true);
  });

  it("404s unknown blocks and honours the gate", async () => {
    expect((await contextGET(req, ctx("blk-does-not-exist"))).status).toBe(404);
    gate.allow = false;
    expect((await contextGET(req, ctx("blk-872a-tampines-st-86"))).status).toBe(401);
  });
});
