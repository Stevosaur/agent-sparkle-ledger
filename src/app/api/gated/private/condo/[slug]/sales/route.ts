import type { NextRequest } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { getProjectTransactions } from "@/lib/data/private";
import { latestFirst, paginate, parsePage, toSaleRow, type Page, type SaleRow } from "@/lib/private-insights";
import { gatedJson, getCondoProject, notFoundJson } from "@/components/private/server-data";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

/** GET /api/gated/private/condo/<slug>/sales/?page=N — full sales history, latest first. Gate: sales.full. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireFeature("sales.full");
  if (!gate.ok) return gate.response;
  const { slug } = await ctx.params;
  if (!getCondoProject(slug)) return notFoundJson();
  const page = paginate(latestFirst(getProjectTransactions(slug)), parsePage(req.nextUrl.searchParams.get("page")), PAGE_SIZE);
  const body: Page<SaleRow> = { ...page, rows: page.rows.map((t) => toSaleRow(t)) };
  return gatedJson(body);
}
