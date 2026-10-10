"use client";

import { GatedPanel } from "@/components/gating/gated-panel";
import { useGatedJson } from "@/components/gating/use-gated-json";
import { Notice } from "@/components/ui/notice";
import { useT } from "@/lib/i18n/provider";
import type { ResolvedBlock } from "@/lib/news/types";
import { ArticleBlocks } from "./article-blocks";

function Remainder({ slug }: { slug: string }) {
  const t = useT();
  const { data, error, loading } = useGatedJson<{ slug: string; blocks: ResolvedBlock[] }>(`/api/gated/insights/article/${encodeURIComponent(slug)}/`);
  if (loading) return <div className="h-64 animate-pulse rounded-xl bg-canvas" aria-busy="true" aria-label={t("common.loading", "Loading…")} />;
  if (error || !data) return <Notice tone="warn">{t("insights.news.loadError", "The rest of this article could not be loaded. Please try again later.")}</Notice>;
  return (
    <div className="space-y-4">
      <ArticleBlocks blocks={data.blocks} slug={slug} />
    </div>
  );
}

/** The Plus-only remainder of an article, fetched from the gated API for entitled readers. */
export function GatedArticle({ slug }: { slug: string }) {
  return (
    <GatedPanel feature="news.plus" minHeight={220}>
      <Remainder slug={slug} />
    </GatedPanel>
  );
}
