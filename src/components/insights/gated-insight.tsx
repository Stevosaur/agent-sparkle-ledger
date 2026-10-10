"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { GatedPanel } from "@/components/gating/gated-panel";
import { useGatedJson } from "@/components/gating/use-gated-json";
import { Notice } from "@/components/ui/notice";
import { useT } from "@/lib/i18n/provider";
import type { InsightResult } from "@/lib/insights/types";
import { InsightBody } from "./insight-card";

/** True once the element has come within `margin` of the viewport (stays true). */
function useNearViewport<T extends Element>(margin = "400px"): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = window.setTimeout(() => setNear(true), 0);
      return () => window.clearTimeout(id);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin, near]);
  return [ref, near];
}

function GatedInsightBody({ id }: { id: string }) {
  const t = useT();
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const { data, error, loading } = useGatedJson<InsightResult>(near ? `/api/gated/insights/${encodeURIComponent(id)}/` : null);
  return (
    <div ref={ref}>
      {!near || loading ? (
        <div className="h-[300px] animate-pulse rounded-xl bg-canvas" aria-busy="true" aria-label={t("common.loading", "Loading…")} />
      ) : error || !data ? (
        <Notice tone="warn">{t("insights.loadError", "This module could not be loaded. Please try again later.")}</Notice>
      ) : (
        <InsightBody result={data} />
      )}
    </div>
  );
}

/** A Plus-only module: fetched from the gated API (when scrolled near) only for entitled viewers. */
export function GatedInsight({ id }: { id: string }) {
  return (
    <GatedPanel feature="insights.full" minHeight={260}>
      <GatedInsightBody id={id} />
    </GatedPanel>
  );
}
