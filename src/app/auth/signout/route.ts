import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NO_STORE, rejectCrossOrigin } from "@/lib/account/http";

export const dynamic = "force-dynamic";

/** POST (form submit from /profile/): end the Supabase session, clear its cookies and go home. */
export async function POST(request: NextRequest) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) console.warn("[auth/signout] sign-out failed:", error.message);
  }
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303, headers: NO_STORE });
}
