import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/notice";
import { DataTable } from "@/components/ui/table";
import { GatedPanel } from "@/components/gating/gated-panel";
import { T } from "@/components/i18n/t";
import type { HdbSaleRow } from "@/lib/hdb-insights";
import { HdbSalesHistory } from "./hdb-sales-history";
import { LeaseEstimateNote, saleColumns } from "./sale-columns";
import { SourceLine } from "./source-line";

/** Section 5 body: latest 10 sales (free, server-rendered) and the gated full history. */
export function BlockSales({ slug, latest, total, flatTypes }: { slug: string; latest: HdbSaleRow[]; total: number; flatTypes: string[] }) {
  if (latest.length === 0) {
    return (
      <EmptyState title={<T k="hdb.sales.emptyTitle" fallback="No resales recorded yet" />}>
        <T k="hdb.sales.empty" fallback="HDB's resale records (from 1990) have no sale in this block yet. Newer blocks appear after their first resale, once the Minimum Occupation Period is over." />
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={<T k="hdb.sales.latestTitle" fallback="Latest sales" />}
          description={<T k="hdb.sales.latestDesc" fallback="The {count} most recent resales, newest first." vars={{ count: latest.length }} />}
        />
        <CardBody className="px-2 py-2">
          <DataTable rows={latest} rowKey={(r, i) => `${r.month}-${r.storeyRange}-${r.price}-${i}`} columns={saleColumns} dense />
        </CardBody>
      </Card>
      {total > latest.length ? (
        <GatedPanel feature="sales.full" minHeight={200}>
          <HdbSalesHistory slug={slug} flatTypes={flatTypes} />
        </GatedPanel>
      ) : null}
      <LeaseEstimateNote />
      <SourceLine className="mt-1">
        <T k="hdb.source.resale" fallback="HDB resale prices, data.gov.sg" />
      </SourceLine>
    </div>
  );
}
