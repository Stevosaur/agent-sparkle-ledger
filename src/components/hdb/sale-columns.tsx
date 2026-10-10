import type { Column } from "@/components/ui/table";
import { T } from "@/components/i18n/t";
import { formatArea, formatLeaseMonths, formatMonth, formatSgd } from "@/lib/format";
import { flatTypeLabel, storeyLabel, type HdbSaleRow } from "@/lib/hdb-insights";

/** Columns for HDB resale tables; shared by the free (server) table and the gated (client) full history. */
export const saleColumns: Column<HdbSaleRow>[] = [
  { key: "month", header: <T k="hdb.col.month" fallback="Month" />, cell: (r) => formatMonth(r.month) },
  { key: "flatType", header: <T k="hdb.col.flatType" fallback="Flat type" />, cell: (r) => flatTypeLabel(r.flatType) },
  { key: "storey", header: <T k="hdb.col.storey" fallback="Storey" />, cell: (r) => storeyLabel(r.storeyRange) },
  { key: "area", header: <T k="hdb.col.area" fallback="Floor area" />, cell: (r) => formatArea(r.floorAreaSqm), align: "right" },
  { key: "price", header: <T k="hdb.col.price" fallback="Price" />, cell: (r) => formatSgd(r.price), align: "right", className: "font-medium" },
  { key: "psf", header: <T k="hdb.col.psf" fallback="PSF" />, cell: (r) => formatSgd(r.psf), align: "right" },
  {
    key: "lease",
    header: <T k="hdb.col.leaseAtSale" fallback="Lease left at sale" />,
    cell: (r) =>
      r.remainingLeaseMonths == null ? (
        "—"
      ) : (
        <>
          {formatLeaseMonths(r.remainingLeaseMonths)}
          {r.remainingLeaseEstimated ? (
            <span className="ml-1 text-muted">
              (<T k="hdb.est" fallback="est." />)
            </span>
          ) : null}
        </>
      ),
    align: "right",
  },
];

/** Footnote explaining the "est." marker in the lease column. */
export function LeaseEstimateNote() {
  return (
    <p className="mt-2 text-xs text-muted">
      <T
        k="hdb.sales.estNote"
        fallback="Lease left at sale is as published by HDB (from 2015); “est.” marks older sales where it is estimated from the lease commencement year."
      />
    </p>
  );
}
