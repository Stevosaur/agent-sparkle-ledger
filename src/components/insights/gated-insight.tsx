"use client";

import { GatedPanel } from "@/components/gating/gated-panel";
import { useGatedJson } from "@/components/gating/use-gated-json";
import { Notice } from "@/components/ui/notice";
import { useT } from "@/lib/i18n/provider";
import type { InsightResult } from "@/lib/insights/types";
import { InsightBody } from "./insight-card";

function GatedInsightBody({ id }: { id: string }) {
  const t = useT();
  const { data, error, loading } = useGatedJson<InsightResult>(`/api/gated/insights/${encodeURIComponent(id)}/`);
  if (loading) return <div className="h-[300px] animate-pulse rounded-xl bg-canvas" aria-busy="true" aria-label={t("common.loading", "Loading…")} />;
  if (error || !data) return <Notice tone="warn">{t("insights.loadError", "This module could not be loaded. Please try again later.")}</Notice>;
  return <InsightBody result={data} />;
}

/** A Plus-only module: fetched from the gated API only for entitled viewers. */
export function GatedInsight({ id }: { id: string }) {
  return (
    <GatedPanel feature="insights.full" minHeight={260}>
      <GatedInsightBody id={id} />
    </GatedPanel>
  );
}
