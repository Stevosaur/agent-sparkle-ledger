import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { getInsight, isInsightId } from "@/lib/insights/modules";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/gated/insights/<module>/
 * One computed market module (chart data, caption, source). Gate: "insights.full" (Plus).
 * 404 for unknown modules and for modules whose source data is not in the snapshot.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ module: string }> }) {
  const { module } = await ctx.params;
  if (!isInsightId(module)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const gate = await requireFeature("insights.full");
  if (!gate.ok) return gate.response;

  const result = getInsight(module);
  if (!result) return NextResponse.json({ error: "no_data" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(result, { headers: NO_STORE });
}
