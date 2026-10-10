import type { NextRequest } from "next/server";
import { CACHE, apiOptions, handlePublicGet } from "@/lib/api/http";
import { v1HdbBlock } from "@/lib/api/v1";

/** GET /api/v1/hdb/blocks/<slug>/ — public, CORS *, rate-limited. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handlePublicGet(req, CACHE.data, () => v1HdbBlock(slug));
}

export function OPTIONS() {
  return apiOptions();
}
