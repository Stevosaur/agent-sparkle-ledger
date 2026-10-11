import { T } from "@/components/i18n/t";
import { EmptyState } from "@/components/ui/notice";
import { getCoverage } from "@/lib/data/meta";
import { formatInt } from "@/lib/format";
import { freeTopRows, LIST_DEFS, type ListId, type RankGroup } from "@/lib/rankings";
import { RankTable } from "./rank-table";

/**
 * Server-only: the free top 3 of each group in a list (rendered into the page HTML for everyone).
 * Empty groups explain which source is missing or which threshold was not met.
 */
export function ListTop({ id, compact = false, headingLevel = 3 }: { id: ListId; compact?: boolean; headingLevel?: 2 | 3 }) {
  const def = LIST_DEFS[id];
  const groups = freeTopRows(id, 3);
  const coverage = getCoverage();
  const Heading = headingLevel === 2 ? "h2" : "h3";

  function emptyReason(group: RankGroup): { key: string; text: string } {
    if (group === "condo") {
      if (!coverage.private) return { key: "insights.empty.noPrivate", text: "Private transactions are not in this snapshot yet. They need a URA Data Service access key." };
      if (id === "yield" && !coverage.privateRentals) return { key: "insights.empty.noPrivateRent", text: "URA rental contracts are not in this snapshot yet." };
      if (id === "growth") return { key: "insights.empty.privateHistory", text: "Not enough private sales history: a five-year comparison needs sales from more than five years ago, and URA's free API covers the last five years." };
      return { key: "insights.empty.threshold", text: "Nothing meets the minimum sample size for this list yet." };
    }
    if (group === "hdb") {
      if (!coverage.hdb) return { key: "insights.empty.noHdb", text: "HDB resale records (data.gov.sg) are not in this snapshot yet." };
      if (id === "yield" && !coverage.rentals) return { key: "insights.empty.noHdbRent", text: "HDB rental approvals (data.gov.sg) are not in this snapshot yet." };
      return { key: "insights.empty.threshold", text: "Nothing meets the minimum sample size for this list yet." };
    }
    if (group === "launch") {
      if (!coverage.launches) return { key: "insights.empty.noLaunches", text: "New-launch data (URA pipeline and developer sales) is not in this snapshot yet." };
      return { key: "insights.empty.noCompletions", text: "No tracked launch has an expected completion year from this year on." };
    }
    if (!coverage.hdb) return { key: "insights.empty.noHdb", text: "HDB resale records (data.gov.sg) are not in this snapshot yet." };
    return { key: "insights.empty.noTowns", text: "No town has flats reaching their MOP or new launches nearby in this period." };
  }

  return (
    <div className="space-y-5">
      {groups.map(({ group, rows, total }) => {
        const reason = emptyReason(group.id);
        return (
          <div key={group.id}>
            {groups.length > 1 ? (
              <Heading className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                <T k={group.labelKey} fallback={group.label} />
                {total > 0 ? (
                  <span className="ml-2 font-normal normal-case tracking-normal">
                    <T k="insights.rankedCount" fallback="{n} ranked" vars={{ n: formatInt(total) }} />
                  </span>
                ) : null}
              </Heading>
            ) : null}
            {rows.length ? (
              <div className="rounded-xl border border-line bg-surface">
                <RankTable rows={rows.map((r, i) => ({ ...r, rank: i + 1 }))} metricHeader={def.metricHeader} metricHeaderKey={def.metricHeaderKey} columns={def.columns} compact={compact} />
              </div>
            ) : (
              <EmptyState title={<T k="common.noData" fallback="No data yet" />}>
                <T k={reason.key} fallback={reason.text} />
              </EmptyState>
            )}
          </div>
        );
      })}
    </div>
  );
}
