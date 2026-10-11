import type { NextRequest } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { getProjectRentals } from "@/lib/data/private";
import { getMeta } from "@/lib/data/meta";
import { monthIndex } from "@/lib/data/months";
import { summariseRentals, type RentalSummary } from "@/lib/private-insights";
import { gatedJson, getCondoProject, latestPrivateMonth, notFoundJson } from "@/components/private/server-data";

export const dynamic = "force-dynamic";

/** Month index of the dataset's latest private rental contract (meta "YYYY-MM"); null when absent or malformed. */
function latestPrivateRentalMonth(): number | null {
  const label = getMeta().latestMonth.privateRentals;
  if (!label) return null;
  try {
    return monthIndex(label);
  } catch {
    return null;
  }
}

/** GET /api/gated/private/condo/<slug>/rentals/ — latest 10 rental contracts + medians by bedrooms / area. Gate: property.context. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireFeature("property.context");
  if (!gate.ok) return gate.response;
  const { slug } = await ctx.params;
  const project = getCondoProject(slug);
  if (!project) return notFoundJson();
  const rentals = getProjectRentals(slug);
  // The 12-month window ends at the latest month of the whole rental dataset, not the latest sale month (URA
  // publishes rental contracts on a different, quarterly schedule) and not the district's own latest rental month
  // (a quiet district would get a window ending months early).
  const asOf = latestPrivateRentalMonth() ?? latestPrivateMonth() ?? 0;
  const body: RentalSummary = summariseRentals(rentals, asOf - 11);
  return gatedJson(body);
}
