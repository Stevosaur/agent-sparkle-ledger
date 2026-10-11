import "server-only";
import { NextResponse } from "next/server";
import { FEATURES, type FeatureKey } from "./entitlements";
import { getViewer, type Viewer } from "./viewer";

/**
 * Guard for route handlers that return gated data:
 *   const gate = await requireFeature("sales.full");
 *   if (!gate.ok) return gate.response;
 * 401 when an account is needed and the visitor is signed out; 402 when Plus is needed.
 */
export async function requireFeature(feature: FeatureKey): Promise<{ ok: true; viewer: Viewer } | { ok: false; response: NextResponse }> {
  const viewer = await getViewer();
  if (viewer.features[feature]) return { ok: true, viewer };
  const level = FEATURES[feature];
  const status = level === "plus" && viewer.userId ? 402 : 401;
  return {
    ok: false,
    response: NextResponse.json(
      { error: status === 401 ? "sign_in_required" : "plus_required", feature, level },
      { status, headers: { "Cache-Control": "private, no-store" } },
    ),
  };
}

/** Guard for routes that need a signed-in user regardless of gating mode (watchlist, tracked homes). */
export async function requireUser(): Promise<{ ok: true; viewer: Viewer & { userId: string } } | { ok: false; response: NextResponse }> {
  const viewer = await getViewer();
  if (viewer.userId) return { ok: true, viewer: viewer as Viewer & { userId: string } };
  return { ok: false, response: NextResponse.json({ error: "sign_in_required" }, { status: 401, headers: { "Cache-Control": "private, no-store" } }) };
}
