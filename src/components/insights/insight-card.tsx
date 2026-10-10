import type { ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { T } from "@/components/i18n/t";
import type { InsightResult } from "@/lib/insights/types";
import { ChartView } from "./chart-view";

/** Chart + computed caption + source line. Pure (no hooks): usable from server pages and client panels. */
export function InsightBody({ result }: { result: InsightResult }) {
  return (
    <div className="space-y-3">
      <ChartView chart={result.chart} name={result.title} height={260} />
      <p className="text-sm text-ink">{result.caption}</p>
      {result.note ? <p className="text-xs text-muted">{result.note}</p> : null}
      <p className="text-xs text-muted">
        <T k="common.source" fallback="Source" />: {result.source}
      </p>
    </div>
  );
}

/** A market module card. Title and teaser are translatable chrome; captions are data-derived English. */
export function InsightCard({ id, title, teaser, children }: { id: string; title: string; teaser: string; children: ReactNode }) {
  return (
    <Card id={`m-${id}`} className="scroll-mt-24">
      <CardHeader title={<T k={`insights.mod.${id}.title`} fallback={title} />} description={<T k={`insights.mod.${id}.teaser`} fallback={teaser} />} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}
