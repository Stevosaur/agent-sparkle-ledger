import { NextResponse, type NextRequest } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { isListId, LIST_DEFS, pageRows, parseListQuery } from "@/lib/rankings";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/gated/lists/<list>/?group=hdb&town=tampines&flatType=4%20ROOM&segment=OCR&offset=0&limit=50
 * Full ranking for one list with filters, paged (max 100 rows per request). Gate: "lists.full" (Plus).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ list: string }> }) {
  const { list } = await ctx.params;
  if (!isListId(list)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const gate = await requireFeature("lists.full");
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const query = parseListQuery(LIST_DEFS[list], sp);
  const page = pageRows(list, query, Number(sp.get("offset") ?? 0), Number(sp.get("limit") ?? 50));
  return NextResponse.json({ ...page, query }, { headers: NO_STORE });
}
