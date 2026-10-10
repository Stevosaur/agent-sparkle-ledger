import type { NextRequest } from "next/server";
import { CACHE, apiOptions, handlePublicGet } from "@/lib/api/http";
import { v1HdbBlockSales } from "@/lib/api/v1";

/** GET /api/v1/hdb/blocks/<slug>/sales/ — latest 10 sales only (full history stays on the site). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handlePublicGet(req, CACHE.data, () => v1HdbBlockSales(slug));
}

export function OPTIONS() {
  return apiOptions();
}
