import type { NextRequest } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { getProjectTransactions } from "@/lib/data/private";
import { stackingPlan, type StackingResponse } from "@/lib/private-insights";
import { gatedJson, getCondoProject, latestPrivateMonth, notFoundJson } from "@/components/private/server-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/gated/private/condo/<slug>/stacking/ — stack x floor grid of latest psf (unit-level data), otherwise
 * floor range x size band median psf over the last five years. Gate: property.stacking.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireFeature("property.stacking");
  if (!gate.ok) return gate.response;
  const { slug } = await ctx.params;
  const project = getCondoProject(slug);
  if (!project) return notFoundJson();
  const txs = getProjectTransactions(slug);
  const asOf = latestPrivateMonth(txs) ?? 0;
  const body: StackingResponse = stackingPlan(txs, project.hasUnitLevel, asOf - 59);
  return gatedJson(body);
}
