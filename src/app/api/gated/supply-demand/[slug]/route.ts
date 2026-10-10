import { NextResponse, type NextRequest } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { resolveSlug } from "@/lib/data/resolve";
import { parseRadius, SD_DEFAULT_RADIUS, supplyDemand } from "@/lib/tools/supply-demand";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * GET /api/gated/supply-demand/<slug>/?radius=1000|2000|3000  (feature "supply-demand": Plus)
 * HDB flats reaching MOP by year vs private units completing by year within the radius.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireFeature("supply-demand");
  if (!gate.ok) return gate.response;
  const { slug } = await ctx.params;
  const property = /^[a-z0-9-]{1,120}$/.test(slug) ? resolveSlug(slug) : null;
  if (!property) return NextResponse.json({ error: "not_found", message: "Unknown property" }, { status: 404, headers: NO_STORE });
  const radiusParam = req.nextUrl.searchParams.get("radius");
  const radius = radiusParam == null ? SD_DEFAULT_RADIUS : parseRadius(radiusParam);
  if (radius == null) return NextResponse.json({ error: "invalid_radius", message: "radius must be 1000, 2000 or 3000" }, { status: 400, headers: NO_STORE });
  if (property.lat == null || property.lng == null) {
    return NextResponse.json({ error: "no_location", message: "This property has no map location yet, so nearby supply cannot be measured." }, { status: 422, headers: NO_STORE });
  }
  const result = supplyDemand({ lat: property.lat, lng: property.lng }, radius);
  return NextResponse.json({ property: { label: property.label, href: property.href }, ...result }, { headers: NO_STORE });
}
