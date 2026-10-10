import type { NextRequest } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { getLandedStreet, getLandedStreetTransactions } from "@/lib/data/private";
import { latestFirst, paginate, parsePage, toSaleRow, type Page, type SaleRow } from "@/lib/private-insights";
import { addressSlugMap, gatedJson, notFoundJson } from "@/components/private/server-data";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

/** GET /api/gated/private/landed-street/<slug>/sales/?page=N — every landed sale on the street, latest first. Gate: sales.full. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireFeature("sales.full");
  if (!gate.ok) return gate.response;
  const { slug } = await ctx.params;
  if (!getLandedStreet(slug)) return notFoundJson();
  const slugs = addressSlugMap(slug);
  const page = paginate(latestFirst(getLandedStreetTransactions(slug)), parsePage(req.nextUrl.searchParams.get("page")), PAGE_SIZE);
  const body: Page<SaleRow> = { ...page, rows: page.rows.map((t) => toSaleRow(t, t.address ? (slugs.get(t.address) ?? null) : null)) };
  return gatedJson(body);
}
