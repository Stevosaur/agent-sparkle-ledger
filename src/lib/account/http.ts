import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { FEATURES, type FeatureKey } from "@/lib/auth/entitlements";
import { requireUser } from "@/lib/auth/require";
import type { Viewer } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { site } from "@/lib/config/site";

/** Shared plumbing for the account route handlers. Every response is per-user: private, no-store. */

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function errorJson(error: string, status: number, extra?: Record<string, unknown>): NextResponse {
  return json({ error, ...extra }, status);
}

/** 503 when Supabase is not configured on this deployment. */
export function accountsDisabled(): NextResponse {
  return errorJson("accounts_disabled", 503);
}

const MAX_BODY_BYTES = 16_384;

/** Parse a small JSON request body; undefined when missing, too large or malformed. */
export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (!text || text.length > MAX_BODY_BYTES) return undefined;
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * CSRF hardening for cookie-authenticated mutations: browsers always send Origin on cross-site POST /
 * PATCH / DELETE, so reject any request whose Origin is a different host. Requests without Origin
 * (server-to-server, curl) carry no browser cookies by accident and pass.
 */
export function rejectCrossOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return errorJson("forbidden_origin", 403);
  }
  const hosts = new Set<string>();
  const host = req.headers.get("host");
  const forwarded = req.headers.get("x-forwarded-host");
  if (host) hosts.add(host);
  if (forwarded) for (const h of forwarded.split(",")) hosts.add(h.trim());
  try {
    hosts.add(new URL(req.url).host);
  } catch {
    /* ignore */
  }
  return hosts.has(originHost) ? null : errorJson("forbidden_origin", 403);
}

/** Origin for links back to this site (Stripe redirects): NEXT_PUBLIC_SITE_URL when set, else the request's. */
export function appOrigin(req: Request): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return site.url;
  return new URL(req.url).origin;
}

export type AccountGuard = { ok: true; viewer: Viewer & { userId: string }; supabase: SupabaseClient } | { ok: false; response: NextResponse };

/**
 * Accounts enabled (503 otherwise) + signed in (401) + optional feature (402 Plus required). Returns a
 * per-request Supabase client acting as the user, so RLS applies to every query.
 */
export async function guardAccount(feature?: FeatureKey): Promise<AccountGuard> {
  if (!isSupabaseConfigured()) return { ok: false, response: accountsDisabled() };
  const gate = await requireUser();
  if (!gate.ok) return gate;
  if (feature && !gate.viewer.features[feature]) {
    return { ok: false, response: errorJson("plus_required", 402, { feature, level: FEATURES[feature] }) };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, response: accountsDisabled() };
  return { ok: true, viewer: gate.viewer, supabase };
}

/** Log a database error server-side and return a generic 500. */
export function dbError(scope: string, error: unknown): NextResponse {
  console.error(`[account] ${scope}:`, error);
  return errorJson("server_error", 500);
}
