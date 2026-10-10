import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as streetSalesGet } from "./route";
import { GET as addressSalesGet } from "@/app/api/gated/private/landed/[slug]/sales/route";

const BASE = "http://localhost:3000";
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });

afterEach(() => {
  delete process.env.GATING_MODE;
});

describe("landed-street sales history", () => {
  it("is public even when gating is enforced (the landed-street page is free)", async () => {
    process.env.GATING_MODE = "enforce";
    const res = await streetSalesGet(new NextRequest(`${BASE}/api/gated/private/landed-street/sample-ln/sales/?page=1`), ctx("sample-ln"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(1);
    expect(body.total).toBeGreaterThan(0);
    expect(body.rows.length).toBeGreaterThan(0);
    // the landed address page's full history stays behind "sales.full"
    const gated = await addressSalesGet(new NextRequest(`${BASE}/api/gated/private/landed/15-sample-ln/sales/`), ctx("15-sample-ln"));
    expect(gated.status).toBe(401);
  });

  it("returns 404 for unknown streets", async () => {
    const res = await streetSalesGet(new NextRequest(`${BASE}/api/gated/private/landed-street/no-such-street/sales/`), ctx("no-such-street"));
    expect(res.status).toBe(404);
  });
});
