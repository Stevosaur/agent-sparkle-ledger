import { NextResponse, type NextRequest } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { getSeries } from "@/lib/data/stats";
import { isPublicSeriesKey, isValidSeriesKey } from "@/lib/insights/series-keys";

const NO_STORE = { "Cache-Control": "private, no-store" };
const PUBLIC = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

/**
 * GET /api/stats/series/?key=hdb:ALL:4%20ROOM
 * Monthly statistics for one series ({ key, label, points: [{ m, count, medianPrice, medianPsf }] }).
 * The national HDB series ("hdb:ALL:*") are public; every other key needs "insights.full" (Plus).
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!isValidSeriesKey(key)) return NextResponse.json({ error: "invalid_key" }, { status: 400, headers: NO_STORE });

  const isPublic = isPublicSeriesKey(key);
  if (!isPublic) {
    const gate = await requireFeature("insights.full");
    if (!gate.ok) return gate.response;
  }

  const series = getSeries(key);
  if (!series) return NextResponse.json({ error: "not_found" }, { status: 404, headers: isPublic ? PUBLIC : NO_STORE });
  return NextResponse.json({ key: series.key, label: series.label, points: series.points }, { headers: isPublic ? PUBLIC : NO_STORE });
}
