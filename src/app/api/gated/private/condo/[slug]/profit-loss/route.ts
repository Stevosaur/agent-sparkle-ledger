import type { NextRequest } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { getProjectTransactions } from "@/lib/data/private";
import { profitLoss, type ProfitLossResponse } from "@/lib/private-insights";
import { gatedJson, getCondoProject, notFoundJson } from "@/components/private/server-data";

export const dynamic = "force-dynamic";

/** GET /api/gated/private/condo/<slug>/profit-loss/ — same-unit repeat-sale pairs (unit-level data only). Gate: property.profit-loss. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireFeature("property.profit-loss");
  if (!gate.ok) return gate.response;
  const { slug } = await ctx.params;
  const project = getCondoProject(slug);
  if (!project) return notFoundJson();
  const body: ProfitLossResponse = profitLoss(project.hasUnitLevel ? getProjectTransactions(slug) : [], project.hasUnitLevel);
  return gatedJson(body);
}
