import type { NextRequest } from "next/server";
import { CACHE, apiOptions, handlePublicGet } from "@/lib/api/http";
import { v1Launches } from "@/lib/api/v1";

/** GET /api/v1/launches/?type=&status= — public, CORS *, rate-limited. */
export function GET(req: NextRequest) {
  return handlePublicGet(req, CACHE.data, () => v1Launches(req.nextUrl.searchParams));
}

export function OPTIONS() {
  return apiOptions();
}
