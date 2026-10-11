import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/section";
import { Stat, StatGrid } from "@/components/ui/stat";
import { T } from "@/components/i18n/t";
import { formatInt, formatMonth, formatPsf, formatSgd } from "@/lib/format";
import { flatTypeLabel } from "@/lib/hdb-insights";
import { titleCase } from "@/lib/slug";
import type { HdbBlock } from "@/lib/data/types";

export interface BlockHeaderProps {
  block: HdbBlock;
  label: string;
  /** newest resale in this block (from the transaction list), null when there are none */
  lastSale: { price: number; flatType: string; month: string } | null;
  /** whole years of lease left today (floored), null when the lease start is unknown */
  yearsLeft: number | null;
  /** "YYYY-MM" the 12-month windows end at */
  latestMonth: string | null;
}

/** Section 1: h1, town, postal code, lease / completion badges and headline stats. */
export function BlockHeader({ block, label, lastSale, yearsLeft, latestMonth }: BlockHeaderProps) {
  const town = titleCase(block.town);
  const street = titleCase(block.streetFull ?? block.street);
  const rentMedian = block.rentals?.medianRent12m ?? null;
  return (
    <div id="overview" className="scroll-mt-24">
      <PageHeader
        eyebrow={<T k="hdb.header.eyebrow" fallback="HDB block · {town}" vars={{ town }} />}
        title={label}
        description={
          <>
            {block.block} {street}
            {block.postal ? (
              <>
                {" · "}
                <T k="hdb.header.postal" fallback="Singapore {postal}" vars={{ postal: block.postal }} />
              </>
            ) : null}
          </>
        }
      >
        <ul className="flex flex-wrap gap-2">
          {block.leaseCommenceYear != null ? (
            <li>
              <Badge tone="brand">
                <T k="hdb.header.leaseFrom" fallback="99-year lease from {year}" vars={{ year: block.leaseCommenceYear }} />
              </Badge>
            </li>
          ) : null}
          {yearsLeft != null ? (
            <li>
              <Badge tone={yearsLeft < 60 ? "warn" : "neutral"}>
                <T k="hdb.header.yearsLeft" fallback="~{years} years left today" vars={{ years: yearsLeft }} />
              </Badge>
            </li>
          ) : null}
          {block.yearCompleted != null ? (
            <li>
              <Badge>
                <T k="hdb.header.completed" fallback="Completed {year}" vars={{ year: block.yearCompleted }} />
              </Badge>
            </li>
          ) : null}
          {block.maxFloor != null ? (
            <li>
              <Badge>
                <T k="hdb.header.maxFloor" fallback="{floors} storeys" vars={{ floors: block.maxFloor }} />
              </Badge>
            </li>
          ) : null}
        </ul>
      </PageHeader>

      <Card>
        <CardBody>
          <StatGrid>
            <Stat
              label={<T k="hdb.stat.lastSale" fallback="Last sale" />}
              value={lastSale ? formatSgd(lastSale.price) : "—"}
              sub={lastSale ? `${flatTypeLabel(lastSale.flatType)} · ${formatMonth(lastSale.month)}` : <T k="hdb.stat.noSales" fallback="No resales recorded yet" />}
            />
            <Stat
              label={<T k="hdb.stat.medianPsf" fallback="Median psf (12 months)" />}
              value={formatPsf(block.tx.medianPsf12m)}
              sub={latestMonth ? <T k="hdb.stat.toMonth" fallback="12 months to {month}" vars={{ month: formatMonth(latestMonth) }} /> : null}
            />
            <Stat label={<T k="hdb.stat.sales12m" fallback="Sales (12 months)" />} value={formatInt(block.tx.count12m)} sub={<T k="hdb.stat.salesTotal" fallback="{count} since records began" vars={{ count: formatInt(block.tx.count) }} />} />
            <Stat
              label={<T k="hdb.stat.medianRent" fallback="Median rent (12 months)" />}
              value={rentMedian != null ? `${formatSgd(rentMedian)}/mo` : "—"}
              sub={
                block.rentals ? (
                  <T k="hdb.stat.rentCount" fallback="{count} rental approvals" vars={{ count: formatInt(block.rentals.count12m) }} />
                ) : (
                  <T k="hdb.stat.noRentals" fallback="No rental approvals recorded" />
                )
              }
            />
          </StatGrid>
        </CardBody>
      </Card>
    </div>
  );
}
