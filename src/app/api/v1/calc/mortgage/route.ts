import type { NextRequest } from "next/server";
import { CACHE, apiOptions, handlePublicGet } from "@/lib/api/http";
import { v1Mortgage } from "@/lib/api/v1";

/** GET /api/v1/calc/mortgage/?principal=&rate=&years= — public, CORS *, rate-limited. */
export function GET(req: NextRequest) {
  return handlePublicGet(req, CACHE.calc, () => v1Mortgage(req.nextUrl.searchParams));
}

export function OPTIONS() {
  return apiOptions();
}
