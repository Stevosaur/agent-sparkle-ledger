import { NextResponse, type NextRequest } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { getHdbBlocks } from "@/lib/data/hdb";
import { titleCase } from "@/lib/slug";
import { parsePropertyRef } from "@/lib/property-ref";
import { singaporeToday } from "@/lib/leads/validate";
import { isListingId } from "@/lib/homes/filters";
import { getListing } from "@/lib/homes/listings";
import { resolveListingProperty } from "@/lib/homes/property";
import { computeExitAudience, type AudienceBlock } from "@/lib/homes/exit-audience";
import { EXIT_AUDIENCE_RADIUS_M } from "@/lib/homes/constants";
import type { ExitAudienceResult } from "@/lib/homes/types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/homes/<id>/exit-audience/ — Plus feature "homes.exit-audience".
 * HDB listing: HDB flats within 2 km reaching MOP this year or in the next two years (likely upgraders /
 * sellers). Private listing: HDB flats within 2 km that passed MOP in the previous five years (potential
 * upgrader buyers). See src/lib/homes/exit-audience.ts for the heuristic.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireFeature("homes.exit-audience");
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  if (!isListingId(id)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  const listing = await getListing(id);
  if (!listing) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const property = resolveListingProperty(listing.ref);
  const lat = listing.lat ?? property?.lat ?? null;
  const lng = listing.lng ?? property?.lng ?? null;
  // From the listing's own reference, so an HDB listing whose block no longer resolves is still treated as HDB.
  const audience = (property?.kind ?? parsePropertyRef(listing.ref)?.kind) === "hdb" ? "hdb" : "private";

  let result: ExitAudienceResult;
  const raw = getHdbBlocks();
  if (lat == null || lng == null) result = { available: false, reason: "no-location" };
  else if (raw.length === 0) result = { available: false, reason: "no-hdb-data" };
  else {
    // cheap bounding-box cut before exact distances (1 degree of latitude is about 111 km)
    const dLat = EXIT_AUDIENCE_RADIUS_M / 111_000 + 0.002;
    const dLng = dLat / Math.cos((lat * Math.PI) / 180);
    const near = raw.filter((b) => b.lat != null && b.lng != null && Math.abs(b.lat - lat) <= dLat && Math.abs(b.lng - lng) <= dLng);
    const blocks: AudienceBlock[] = near.map((b) => ({
      slug: b.slug,
      label: `Blk ${b.block} ${titleCase(b.street)}`,
      town: titleCase(b.town),
      lat: b.lat,
      lng: b.lng,
      yearCompleted: b.yearCompleted,
      dwellingUnits: b.dwellingUnits,
    }));
    const currentYear = Number(singaporeToday().slice(0, 4));
    result = computeExitAudience(blocks, { lat, lng }, audience, currentYear, { radiusM: EXIT_AUDIENCE_RADIUS_M });
  }
  return NextResponse.json(result, { headers: NO_STORE });
}
