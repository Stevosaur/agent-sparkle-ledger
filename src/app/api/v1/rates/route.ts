import type { NextRequest } from "next/server";
import { CACHE, apiOptions, handlePublicGet } from "@/lib/api/http";
import { v1Rates } from "@/lib/api/v1";

/** GET /api/v1/rates/ — public, CORS *, rate-limited. */
export function GET(req: NextRequest) {
  return handlePublicGet(req, CACHE.data, () => v1Rates());
}

export function OPTIONS() {
  return apiOptions();
}
