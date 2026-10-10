import type { NextRequest } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { getDistrictRentals, getProjectRentals } from "@/lib/data/private";
import { summariseRentals, type RentalSummary } from "@/lib/private-insights";
import { gatedJson, getCondoProject, latestPrivateMonth, notFoundJson } from "@/components/private/server-data";

export const dynamic = "force-dynamic";

/** GET /api/gated/private/condo/<slug>/rentals/ — latest 10 rental contracts + medians by bedrooms / area. Gate: property.context. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireFeature("property.context");
  if (!gate.ok) return gate.response;
  const { slug } = await ctx.params;
  const project = getCondoProject(slug);
  if (!project) return notFoundJson();
  const rentals = getProjectRentals(slug);
  // The 12-month window ends at the latest month of the rental data (as the page's "median rent (12 mths)" stat
  // does), not the latest sale month: URA publishes rental contracts on a different, quarterly schedule.
  const districtRentals = project.district != null ? getDistrictRentals(project.district) : [];
  const latestRental = districtRentals.reduce<number | null>((m, r) => (m == null || r.monthIndex > m ? r.monthIndex : m), null);
  const asOf = latestRental ?? latestPrivateMonth() ?? 0;
  const body: RentalSummary = summariseRentals(rentals, asOf - 11);
  return gatedJson(body);
}
