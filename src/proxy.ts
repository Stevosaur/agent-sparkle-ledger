import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session cookie before account pages and API routes render, so server code always
 * sees a valid access token (Server Components cannot write cookies themselves).
 *
 * Runs only on the paths in `config.matcher` — never on property pages, which stay static/ISR.
 * A no-op when Supabase is not configured or the request carries no Supabase auth cookie.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();
  // Supabase auth cookies are named "sb-<project-ref>-auth-token" (possibly chunked ".0", ".1", ...).
  if (!request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Responses that set auth cookies must never be cached by a CDN.
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  try {
    // Validates the JWT and refreshes an expiring session; refreshed tokens are written via setAll.
    await supabase.auth.getClaims();
  } catch (err) {
    console.error("[proxy] session refresh failed:", err);
  }
  return response;
}

export const config = {
  // the public read-only API (/api/v1/) never needs a session refresh
  matcher: ["/api/((?!v1/).*)", "/login/:path*", "/auth/:path*", "/profile/:path*", "/my-property/:path*", "/plus/:path*"],
};
