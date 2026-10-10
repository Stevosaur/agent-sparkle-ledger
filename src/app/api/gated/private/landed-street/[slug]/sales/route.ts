import type { NextRequest } from "next/server";
import { getLandedStreet, getLandedStreetTransactions } from "@/lib/data/private";
import { isLandedHouse, latestFirst, paginate, parsePage, toSaleRow, type Page, type SaleRow } from "@/lib/private-insights";
import { addressSlugMap, gatedJson, notFoundJson } from "@/components/private/server-data";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

/**
 * GET /api/gated/private/landed-street/<slug>/sales/?page=N — every landed sale on the street, latest first.
 * Public (no feature gate): the spec makes the landed-street page free, full sales history included. It stays
 * under /api/gated/ next to the condo / landed-address sales routes, which are gated by "sales.full".
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!getLandedStreet(slug)) return notFoundJson();
  const slugs = addressSlugMap(slug);
  // landed houses only, matching the street page and its summary
  const page = paginate(latestFirst(getLandedStreetTransactions(slug).filter(isLandedHouse)), parsePage(req.nextUrl.searchParams.get("page")), PAGE_SIZE);
  const body: Page<SaleRow> = { ...page, rows: page.rows.map((t) => toSaleRow(t, t.address ? (slugs.get(t.address) ?? null) : null)) };
  return gatedJson(body);
}
