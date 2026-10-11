import { NextResponse } from "next/server";
import { getMrtStations, getSchools } from "@/lib/data/geo";
import { getLaunches } from "@/lib/data/private";
import { buildMapLayers } from "@/components/map/layers";

/**
 * GET /api/map/layers/ — public map layers for /map/: new launches (launched / upcoming), operational
 * and future MRT/LRT stations, primary schools. Compact tuple arrays (see components/map/layers.ts),
 * cached at the CDN for a day since the snapshot changes at most daily.
 */
export async function GET() {
  const payload = buildMapLayers({ launches: getLaunches(), stations: getMrtStations(), schools: getSchools() });
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
