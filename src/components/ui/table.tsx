import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
// aliased: `T` is DataTable's row type parameter
import { T as Translate } from "@/components/i18n/t";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

/**
 * Simple responsive table: horizontal scroll on small screens, tabular numerals.
 * The scroll wrapper is a focusable, labelled region so keyboard users can scroll wide tables;
 * pass `ariaLabel` to name it (defaults to a translated "Table").
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  className,
  dense,
  ariaLabel,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  empty?: ReactNode;
  className?: string;
  dense?: boolean;
  ariaLabel?: string;
}) {
  // works in server and client components; the default label is translated via <T> in a hidden node
  const labelId = useId();
  if (rows.length === 0) return <div className="px-4 py-6 text-center text-sm text-muted">{empty ?? <Translate k="common.noRecords" fallback="No records." />}</div>;
  return (
    <div
      className={cn("overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500", className)}
      tabIndex={0}
      role="region"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : labelId}
    >
      {ariaLabel ? null : (
        <span id={labelId} hidden>
          <Translate k="common.table" fallback="Table" />
        </span>
      )}
      <table className="tabular w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted", c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="border-b border-line/70 last:border-0 hover:bg-canvas/60">
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3", dense ? "py-1.5" : "py-2.5", c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left", c.className)}>
                  {c.cell(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
