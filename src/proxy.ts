import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight edge guard: bounce requests without a session cookie to /login.
 * Real authentication and tenant/role checks happen server-side in every page and action.
 */
const PUBLIC = ["/login", "/api/auth", "/api/webhooks", "/api/health", "/api/jobs", "/manifest.webmanifest", "/sw.js", "/icon.svg", "/offline"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const hasSession = req.cookies.getAll().some((c) => c.name.endsWith("better-auth.session_token"));
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|ico)$).*)"] };
