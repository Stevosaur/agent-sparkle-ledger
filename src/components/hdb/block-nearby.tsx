import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/notice";
import { DataTable } from "@/components/ui/table";
import { T } from "@/components/i18n/t";
import { formatDistance, formatMonth, formatPsf, formatSgd } from "@/lib/format";
import { SourceLine } from "./source-line";

export interface NearbyBlockRow {
  slug: string;
  label: string;
  distanceM: number;
  leaseCommenceYear: number | null;
  medianPsf12m: number | null;
  lastPrice: number | null;
  lastMonth: string | null;
}

/** Section 8 body: nearby blocks within the radius (server-rendered internal links). */
export function BlockNearby({ rows, hasCoords, radiusM }: { rows: NearbyBlockRow[]; hasCoords: boolean; radiusM: number }) {
  if (!hasCoords) {
    return (
      <EmptyState title={<T k="hdb.nearby.noCoordsTitle" fallback="Location not available" />}>
        <T k="hdb.nearby.noCoords" fallback="This block has not been geocoded yet (OneMap), so nearby blocks cannot be listed." />
      </EmptyState>
    );
  }
  return (
    <div>
      <Card>
        <CardBody className="px-2 py-2">
          <DataTable
            rows={rows}
            rowKey={(r) => r.slug}
            empty={<T k="hdb.nearby.none" fallback="No other HDB blocks within {radius}." vars={{ radius: formatDistance(radiusM) }} />}
            columns={[
              {
                key: "block",
                header: <T k="hdb.col.block" fallback="Block" />,
                cell: (r) => (
                  <Link href={`/hdb/${r.slug}/`} className="font-medium text-brand-700 hover:underline">
                    {r.label}
                  </Link>
                ),
              },
              { key: "distance", header: <T k="hdb.col.distance" fallback="Distance" />, cell: (r) => formatDistance(r.distanceM), align: "right" },
              { key: "lease", header: <T k="hdb.col.leaseStart" fallback="Lease from" />, cell: (r) => r.leaseCommenceYear ?? "—", align: "right" },
              { key: "psf", header: <T k="hdb.col.medianPsf" fallback="Median psf (12m)" />, cell: (r) => formatPsf(r.medianPsf12m), align: "right" },
              {
                key: "last",
                header: <T k="hdb.col.lastSale" fallback="Last sale" />,
                cell: (r) =>
                  r.lastPrice != null ? (
                    <span>
                      {formatSgd(r.lastPrice)} <span className="text-muted">· {formatMonth(r.lastMonth)}</span>
                    </span>
                  ) : (
                    "—"
                  ),
                align: "right",
              },
            ]}
          />
        </CardBody>
      </Card>
      <SourceLine>
        <T k="hdb.source.nearby" fallback="HDB resale prices and property information, data.gov.sg; OneMap coordinates. Straight-line distances." />
      </SourceLine>
    </div>
  );
}
