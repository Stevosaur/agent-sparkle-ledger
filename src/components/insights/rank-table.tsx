import type { ReactNode } from "react";
import Link from "next/link";
import { T } from "@/components/i18n/t";
import { DataTable, type Column } from "@/components/ui/table";
import type { ListColumn, RankRow } from "@/lib/rankings";

export type RankedRow = RankRow & { rank: number };

/**
 * Ranking table. Every value arrives pre-formatted from the server, so this component is pure and
 * renders the same in server pages (free top 3) and in the gated client view (full ranking).
 */
export function RankTable({ rows, metricHeader, metricHeaderKey, columns, empty, compact = false }: { rows: RankedRow[]; metricHeader: string; metricHeaderKey: string; columns: ListColumn[]; empty?: ReactNode; compact?: boolean }) {
  const cols: Column<RankedRow>[] = [
    { key: "rank", header: "#", cell: (r) => <span className="font-semibold text-muted">{r.rank}</span>, align: "right", className: "w-8" },
    {
      key: "name",
      header: <T k="insights.col.name" fallback="Name" />,
      cell: (r) => (
        <div className="min-w-[10rem] max-w-[16rem] whitespace-normal">
          <Link href={r.href} className="font-medium text-brand-800 hover:underline">
            {r.label}
          </Link>
          <div className="text-xs text-muted">{r.sub}</div>
        </div>
      ),
    },
    { key: "metric", header: <T k={metricHeaderKey} fallback={metricHeader} />, cell: (r) => <span className="font-semibold text-ink">{r.metric}</span>, align: "right" },
    ...(compact
      ? []
      : columns.map(
          (c, i): Column<RankedRow> => ({
            key: c.key,
            header: <T k={c.headerKey} fallback={c.header} />,
            cell: (r) => <span className={c.key === "launches" ? "block max-w-[14rem] whitespace-normal text-xs" : undefined}>{r.cells[i] ?? "—"}</span>,
            align: c.key === "launches" || c.key === "basis" || c.key === "status" || c.key === "tenure" ? "left" : "right",
          }),
        )),
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={empty} dense={compact} />;
}
