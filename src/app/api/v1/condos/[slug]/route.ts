import type { NextRequest } from "next/server";
import { CACHE, apiOptions, handlePublicGet } from "@/lib/api/http";
import { v1Condo } from "@/lib/api/v1";

/** GET /api/v1/condos/<slug>/ — project summary + latest 10 sales. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handlePublicGet(req, CACHE.data, () => v1Condo(slug));
}

export function OPTIONS() {
  return apiOptions();
}
