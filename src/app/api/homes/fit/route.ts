import { NextResponse, type NextRequest } from "next/server";
import { parseFitParams } from "@/lib/homes/fit";
import { computeFit } from "@/lib/homes/fit-data";

/**
 * GET /api/homes/fit/?p=<placeRef>,<placeRef>&w=<weight>,<weight>[&t=sale|rent]
 * Public. Up to 3 places (property refs, town:<slug> or mrt:<slug>), weights 1-5 (default 1).
 * Ranks active listings by weighted straight-line distance; with no active listings, ranks HDB blocks
 * and condos with sales in the last 12 months. Cached at the edge for 5 minutes per query.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const places = parseFitParams(sp.get("p"), sp.get("w"));
  const t = sp.get("t");
  const listingType = t === "sale" || t === "rent" ? t : null;
  const result = await computeFit(places, { listingType });
  return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } });
}
