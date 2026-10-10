import type { NextRequest } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { handleValuationPost } from "@/lib/tools/valuation-api";

export const dynamic = "force-dynamic";

/**
 * POST /api/gated/valuation/report/  (feature "valuation.report": Plus)
 * Same body and response as /api/gated/valuation/, for the printable report page.
 */
export async function POST(req: NextRequest) {
  const gate = await requireFeature("valuation.report");
  if (!gate.ok) return gate.response;
  return handleValuationPost(req);
}
