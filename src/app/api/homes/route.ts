import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { rejectCrossOrigin } from "@/lib/account/http";
import { parseListingFilters } from "@/lib/homes/filters";
import { LISTING_TABLE, PAGE_SIZE, searchListings } from "@/lib/homes/listings";
import { parseListingInput } from "@/lib/homes/listing-schema";
import { resolveListingProperty } from "@/lib/homes/property";
import { RateLimiter } from "@/lib/leads/rate-limit";

const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_BODY_BYTES = 32 * 1024;
/** Best-effort: 10 new listings per user per day, per server instance. */
const createLimiter = new RateLimiter({ limit: 10, windowMs: 24 * 3600_000, maxKeys: 5000 });

/**
 * GET /api/homes/?type=sale|rent&kind=hdb|condo|landed&area=town:<slug>|d:<n>&min=&max=&beds=&offset=&limit=
 * Public: active listings only (summaries, no contact details). Cached at the edge for 5 minutes.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const filters = parseListingFilters(sp);
  const offset = Number(sp.get("offset") ?? 0) || 0;
  const limit = Number(sp.get("limit") ?? PAGE_SIZE) || PAGE_SIZE;
  const page = await searchListings(filters, { offset, limit });
  return NextResponse.json(
    { filters, ...page },
    { headers: { "Cache-Control": page.unavailable ? "public, max-age=0, s-maxage=30" : "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } },
  );
}

/**
 * POST /api/homes/ — create a listing as the signed-in user (requireUser). Clients have no INSERT
 * privilege on home_listings, so the validated row is written with the server key and an explicit
 * user_id. Coordinates come from the property reference, never from the client. 201 { id } · 400 { error: "invalid", fields } · 401 · 429 · 503.
 */
export async function POST(req: NextRequest) {
  const crossOrigin = rejectCrossOrigin(req);
  if (crossOrigin) return crossOrigin;
  const gate = await requireUser();
  if (!gate.ok) return gate.response;

  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415, headers: NO_STORE });
  }
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413, headers: NO_STORE });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }

  const parsed = parseListingInput(body);
  if (!parsed.ok) return NextResponse.json({ error: "invalid", fields: parsed.errors }, { status: 400, headers: NO_STORE });
  const input = parsed.value;
  const property = resolveListingProperty(input.ref);
  if (!property) return NextResponse.json({ error: "invalid", fields: { ref: "unknown" } }, { status: 400, headers: NO_STORE });

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "listings_disabled" }, { status: 503, headers: NO_STORE });

  // Counted only for valid submissions that reach the database, so fixing a form error never uses up the allowance.
  const rate = createLimiter.check(gate.viewer.userId);
  if (!rate.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } });
  }

  const { data, error } = await supabase
    .from(LISTING_TABLE)
    .insert({
      user_id: gate.viewer.userId,
      listing_type: input.listingType,
      ref: input.ref,
      title: input.title,
      description: input.description,
      asking_price: input.askingPrice,
      flat_type: input.flatType,
      area_sqm: input.areaSqm,
      floor_level: input.floorLevel,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      contact_name: input.contactName,
      whatsapp: input.whatsapp,
      status: "active",
      lat: property.lat,
      lng: property.lng,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[homes] create failed:", error?.code, error?.message);
    return NextResponse.json({ error: "create_failed" }, { status: 500, headers: NO_STORE });
  }
  revalidatePath("/homes");
  return NextResponse.json({ id: (data as { id: string }).id }, { status: 201, headers: NO_STORE });
}
