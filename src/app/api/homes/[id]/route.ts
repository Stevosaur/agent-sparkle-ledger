import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
import { requireUser } from "@/lib/auth/require";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isListingId } from "@/lib/homes/filters";
import { LISTING_TABLE } from "@/lib/homes/listings";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** GET /api/homes/<id>/ — whether the current visitor owns this listing (for the owner controls). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isListingId(id)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  const viewer = await getViewer();
  if (!viewer.userId) return NextResponse.json({ isOwner: false, status: null }, { headers: NO_STORE });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ isOwner: false, status: null }, { headers: NO_STORE });
  const { data, error } = await supabase.from(LISTING_TABLE).select("user_id,status").eq("id", id).maybeSingle();
  if (error) {
    console.error("[homes] owner lookup failed:", error.code, error.message);
    return NextResponse.json({ isOwner: false, status: null }, { headers: NO_STORE });
  }
  const row = data as { user_id?: string; status?: string } | null;
  const isOwner = Boolean(row && row.user_id === viewer.userId);
  return NextResponse.json({ isOwner, status: isOwner ? (row?.status ?? null) : null }, { headers: NO_STORE });
}

/** PATCH /api/homes/<id>/ { status: "active" | "closed" } — owner only (requireUser + owner match + RLS; updated_at is set by a trigger). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireUser();
  if (!gate.ok) return gate.response;
  const { id } = await ctx.params;
  if (!isListingId(id)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  let status: unknown;
  try {
    status = ((await req.json()) as { status?: unknown } | null)?.status;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }
  if (status !== "active" && status !== "closed") return NextResponse.json({ error: "invalid", fields: { status: "invalid" } }, { status: 400, headers: NO_STORE });

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "listings_disabled" }, { status: 503, headers: NO_STORE });
  const { data, error } = await supabase
    .from(LISTING_TABLE)
    .update({ status })
    .eq("id", id)
    .eq("user_id", gate.viewer.userId)
    .select("id");
  if (error) {
    console.error("[homes] status update failed:", error.code, error.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500, headers: NO_STORE });
  }
  if (!data || data.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  revalidatePath(`/homes/${id}`);
  revalidatePath("/homes");
  return NextResponse.json({ ok: true, status }, { headers: NO_STORE });
}
