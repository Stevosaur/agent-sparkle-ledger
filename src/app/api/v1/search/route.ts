import type { NextRequest } from "next/server";
import { CACHE, apiOptions, handlePublicGet } from "@/lib/api/http";
import { v1Search } from "@/lib/api/v1";

/** GET /api/v1/search/?q=&limit= — public, CORS *, rate-limited. */
export function GET(req: NextRequest) {
  return handlePublicGet(req, CACHE.data, () => v1Search(req.nextUrl.searchParams));
}

export function OPTIONS() {
  return apiOptions();
}
