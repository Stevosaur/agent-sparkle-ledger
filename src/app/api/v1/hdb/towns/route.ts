import type { NextRequest } from "next/server";
import { CACHE, apiOptions, handlePublicGet } from "@/lib/api/http";
import { v1Towns } from "@/lib/api/v1";

/** GET /api/v1/hdb/towns/ — public, CORS *, rate-limited. */
export function GET(req: NextRequest) {
  return handlePublicGet(req, CACHE.data, () => v1Towns());
}

export function OPTIONS() {
  return apiOptions();
}
