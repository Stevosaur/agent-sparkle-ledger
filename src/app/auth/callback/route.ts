import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/account/next-path";
import { NO_STORE } from "@/lib/account/http";

export const dynamic = "force-dynamic";

/**
 * Supabase auth callback for magic links and OAuth (PKCE). Exchanges ?code= (or verifies ?token_hash=&type=
 * when the email template links here directly), stores the session cookies and redirects to ?next= (a
 * same-origin path only).
 */

const OTP_TYPES: ReadonlySet<string> = new Set(["magiclink", "email", "signup", "invite", "recovery", "email_change"]);

function redirectTo(path: string, base: URL): NextResponse {
  return NextResponse.redirect(new URL(path, base.origin), { status: 303, headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));
  const fail = (code: string) => redirectTo(`/login/?error=${code}&next=${encodeURIComponent(next)}`, url);

  if (!isSupabaseConfigured()) return redirectTo("/login/", url);
  if (url.searchParams.get("error") || url.searchParams.get("error_code")) return fail("link_invalid");

  const supabase = await createSupabaseServerClient();
  if (!supabase) return redirectTo("/login/", url);

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (code) {
    const flowId = url.searchParams.get("sb_flow_id");
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error) {
      console.warn("[auth/callback] code exchange failed:", error.message);
      return fail("link_invalid");
    }
  } else if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    if (error) {
      console.warn("[auth/callback] OTP verification failed:", error.message);
      return fail("link_invalid");
    }
  } else {
    return fail("link_invalid");
  }

  return redirectTo(next, url);
}
