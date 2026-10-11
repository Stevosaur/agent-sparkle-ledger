import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/auth/require";
import { getArticle, resolveBlocks } from "@/lib/news";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/gated/insights/article/<slug>/
 * The full body of a Plus article (blocks after the free teaser), with chart data resolved.
 * Gate: "news.plus" (Plus). 404 for unknown slugs and for articles that are not Plus-only.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const article = getArticle(slug);
  if (!article || !article.plusOnly) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const gate = await requireFeature("news.plus");
  if (!gate.ok) return gate.response;

  return NextResponse.json({ slug: article.slug, blocks: resolveBlocks(article.body.slice(article.teaserBlocks)) }, { headers: NO_STORE });
}
