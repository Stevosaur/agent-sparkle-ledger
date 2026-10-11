import { NextResponse, type NextRequest } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { getBlockTransactions, getHdbBlock } from "@/lib/data/hdb";
import { HDB_FLAT_TYPES } from "@/lib/data/types";
import { distinctFlatTypes, paginate, parsePage, toSaleRow, type HdbSalesPage } from "@/lib/hdb-insights";

const PAGE_SIZE = 50;
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/gated/hdb/<slug>/sales/?page=1&flatType=4%20ROOM
 * Full resale history for one block, newest first, 50 per page. Gate: "sales.full" (free account).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireFeature("sales.full");
  if (!gate.ok) return gate.response;

  const { slug } = await ctx.params;
  const block = getHdbBlock(slug);
  if (!block) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const flatTypeParam = (req.nextUrl.searchParams.get("flatType") ?? "").trim().toUpperCase();
  if (flatTypeParam && !(HDB_FLAT_TYPES as readonly string[]).includes(flatTypeParam)) {
    return NextResponse.json({ error: "invalid_flat_type" }, { status: 400, headers: NO_STORE });
  }

  const all = getBlockTransactions(slug);
  const filtered = flatTypeParam ? all.filter((t) => t.flatType === flatTypeParam) : all;
  const page = paginate(filtered, parsePage(req.nextUrl.searchParams.get("page")), PAGE_SIZE);

  const body: HdbSalesPage = {
    slug,
    flatType: flatTypeParam || null,
    flatTypes: distinctFlatTypes(all),
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    totalPages: page.totalPages,
    rows: page.rows.map(toSaleRow),
  };
  return NextResponse.json(body, { headers: NO_STORE });
}
