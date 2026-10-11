import type { NextRequest } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { handleValuationPost } from "@/lib/tools/valuation-api";

export const dynamic = "force-dynamic";

/**
 * POST /api/gated/valuation/  (feature "valuation.estimate": free account)
 * Body: { ref: "hdb:blk-…" | "condo:…" | "landed:…" | "landed-street:…", flatType?, storeyRange?, floor?, areaSqm }
 * Returns the estimate, range, confidence, top-10 comparables and method notes (private, no-store).
 */
export async function POST(req: NextRequest) {
  const gate = await requireFeature("valuation.estimate");
  if (!gate.ok) return gate.response;
  return handleValuationPost(req);
}
