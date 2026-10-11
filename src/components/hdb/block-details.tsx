import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { DataTable } from "@/components/ui/table";
import { T } from "@/components/i18n/t";
import { formatInt, formatPct } from "@/lib/format";
import { compareFlatTypes, flatTypeLabel, mopNote } from "@/lib/hdb-insights";
import { HDB_LEASE_YEARS, HDB_MOP_YEARS, HDB_MOP_YEARS_PLUS_PRIME } from "@/lib/calc/rules";
import { titleCase } from "@/lib/slug";
import { SourceLine } from "./source-line";
import type { HdbBlock } from "@/lib/data/types";

const FACILITIES: { key: keyof NonNullable<HdbBlock["facilities"]>; k: string; label: string }[] = [
  { key: "commercial", k: "hdb.facility.commercial", label: "Commercial units" },
  { key: "marketHawker", k: "hdb.facility.marketHawker", label: "Market / hawker centre" },
  { key: "multistoreyCarpark", k: "hdb.facility.carpark", label: "Multi-storey car park" },
  { key: "precinctPavilion", k: "hdb.facility.pavilion", label: "Precinct pavilion" },
  { key: "miscellaneous", k: "hdb.facility.misc", label: "Other facilities" },
];

function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="tabular text-right text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

/** Section 2 body: unit mix, block facts, facilities, lease info and the MOP note. */
export function BlockDetails({ block, currentYear }: { block: HdbBlock; currentYear: number }) {
  const mix = Object.entries(block.unitMix)
    .filter((e): e is [string, number] => typeof e[1] === "number" && e[1] > 0)
    .sort(([a], [b]) => compareFlatTypes(a, b));
  const mixTotal = mix.reduce((s, [, n]) => s + n, 0);
  const facilities = block.facilities ? FACILITIES.filter((f) => block.facilities![f.key]) : null;
  const mop = mopNote(block.yearCompleted, currentYear);

  return (
    <div className="space-y-4">
      {mop ? (
        <Notice title={<T k="hdb.mop.title" fallback="Minimum Occupation Period" />}>
          {mop.reached ? (
            <T
              k="hdb.mop.reached"
              fallback="Flats here reached their {mopYears}-year MOP around {year} (MOP counts from key collection, so this is approximate). Owners can now sell their flats on the resale market."
              vars={{ year: mop.mopYear, mopYears: HDB_MOP_YEARS }}
            />
          ) : (
            <>
              <T
                k="hdb.mop.upcoming"
                fallback="Flats here reach their {mopYears}-year MOP around {year} (MOP counts from key collection, so this is approximate). Until then owners cannot sell on the open market."
                vars={{ year: mop.mopYear, mopYears: HDB_MOP_YEARS }}
              />{" "}
              <T k="hdb.mop.longer" fallback="PLH, Plus and Prime flats have a {years}-year MOP instead." vars={{ years: HDB_MOP_YEARS_PLUS_PRIME }} />
            </>
          )}
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={<T k="hdb.details.unitMix" fallback="Unit mix" />}
            description={block.dwellingUnits != null ? <T k="hdb.details.dwellingUnits" fallback="{count} flats in this block" vars={{ count: formatInt(block.dwellingUnits) }} /> : null}
          />
          <CardBody className="px-2 py-2">
            <DataTable
              rows={mix}
              rowKey={([ft]) => ft}
              empty={<T k="hdb.details.noMix" fallback="Unit mix not published for this block (HDB property information, data.gov.sg)." />}
              columns={[
                { key: "type", header: <T k="hdb.col.flatType" fallback="Flat type" />, cell: ([ft]) => flatTypeLabel(ft) },
                { key: "units", header: <T k="hdb.col.units" fallback="Flats" />, cell: ([, n]) => formatInt(n), align: "right" },
                { key: "share", header: <T k="hdb.col.share" fallback="Share" />, cell: ([, n]) => formatPct(mixTotal > 0 ? n / mixTotal : null, 0), align: "right" },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<T k="hdb.details.facts" fallback="Block facts" />} />
          <CardBody className="py-2">
            <dl>
              <Fact label={<T k="hdb.details.town" fallback="Town" />}>{titleCase(block.town)}</Fact>
              <Fact label={<T k="hdb.details.completed" fallback="Year completed" />}>{block.yearCompleted ?? "—"}</Fact>
              <Fact label={<T k="hdb.details.leaseStart" fallback="Lease commenced" />}>{block.leaseCommenceYear ?? "—"}</Fact>
              <Fact label={<T k="hdb.details.leaseEnd" fallback="Lease ends (approx.)" />}>{block.leaseCommenceYear != null ? block.leaseCommenceYear + HDB_LEASE_YEARS : "—"}</Fact>
              <Fact label={<T k="hdb.details.maxFloor" fallback="Highest floor" />}>{block.maxFloor ?? "—"}</Fact>
              <Fact label={<T k="hdb.details.dwellingUnitsLabel" fallback="Flats (dwelling units)" />}>{formatInt(block.dwellingUnits)}</Fact>
            </dl>
            <div className="mt-3">
              <div className="mb-2 text-sm text-muted">
                <T k="hdb.details.facilities" fallback="Facilities in the block" />
              </div>
              {facilities == null ? (
                <p className="text-sm text-muted">
                  <T k="hdb.details.noFacilities" fallback="Not published for this block." />
                </p>
              ) : facilities.length === 0 ? (
                <p className="text-sm text-muted">
                  <T k="hdb.details.facilitiesNone" fallback="None listed." />
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {facilities.map((f) => (
                    <li key={f.key}>
                      <Badge tone="brand">
                        <T k={f.k} fallback={f.label} />
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {block.leaseCommenceYear == null ? (
              <p className="mt-3 text-xs text-muted">
                <T k="hdb.details.leaseUnknown" fallback="The lease commencement year appears in HDB resale records once a flat here is resold; none has been recorded yet." />
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>
      <SourceLine>
        <T k="hdb.source.propertyInfo" fallback="HDB property information and resale prices, data.gov.sg" />
      </SourceLine>
    </div>
  );
}
