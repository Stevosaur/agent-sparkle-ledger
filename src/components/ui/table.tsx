import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

/** Simple responsive table: horizontal scroll on small screens, tabular numerals. */
export function DataTable<T>({ columns, rows, rowKey, empty, className, dense }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T, index: number) => string; empty?: ReactNode; className?: string; dense?: boolean }) {
  if (rows.length === 0) return <div className="px-4 py-6 text-center text-sm text-muted">{empty ?? "No records."}</div>;
  return (
    <div className={cn("overflow-x-auto", className)}>
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
