import type { NextRequest } from "next/server";
import { CACHE, apiOptions, handlePublicGet } from "@/lib/api/http";
import { v1StampDuty } from "@/lib/api/v1";

/** GET /api/v1/calc/stamp-duty/?price=&profile=&count= — public, CORS *, rate-limited. */
export function GET(req: NextRequest) {
  return handlePublicGet(req, CACHE.calc, () => v1StampDuty(req.nextUrl.searchParams));
}

export function OPTIONS() {
  return apiOptions();
}
