import { EmptyState } from "@/components/ui/notice";
import type { ResolvedBlock } from "@/lib/news/types";
import { ChartView } from "./chart-view";

/** Figures ("S$24,600", "3%", "12 yrs", "—") are right-aligned; columns of prose stay left-aligned. */
const FIGURE_RE = /^(?:[-+]?(?:S\$)?\d[\d,.]*(?:%| ?psf|\/mo| yrs?)?|—)$/;

function numericColumns(rows: string[][], width: number): boolean[] {
  return Array.from({ length: width }, (_, j) => j > 0 && rows.length > 0 && rows.every((r) => FIGURE_RE.test((r[j] ?? "").trim())));
}

/**
 * Renders resolved article blocks. Pure (no hooks), so the same markup is produced on the server for
 * free articles and on the client for the gated remainder of Plus articles.
 */
export function ArticleBlocks({ blocks, slug }: { blocks: ResolvedBlock[]; slug: string }) {
  return (
    <>
      {blocks.map((b, i) => {
        const key = `${slug}-${i}`;
        switch (b.type) {
          case "paragraph":
            return (
              <p key={key} className="leading-7 text-ink">
                {b.text}
              </p>
            );
          case "heading":
            return (
              <h2 key={key} className="pt-4 text-xl font-semibold text-ink">
                {b.text}
              </h2>
            );
          case "list": {
            const Tag = b.ordered ? "ol" : "ul";
            return (
              <Tag key={key} className={`${b.ordered ? "list-decimal" : "list-disc"} space-y-2 pl-6 leading-7 text-ink`}>
                {b.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{item}</li>
                ))}
              </Tag>
            );
          }
          case "table": {
            const numeric = numericColumns(b.rows, b.head.length);
            return (
              <figure key={key} className="my-2">
                <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                  <table className="tabular w-full border-collapse text-sm">
                    {b.caption ? <caption className="px-3 pt-3 text-left text-sm font-medium text-ink">{b.caption}</caption> : null}
                    <thead>
                      <tr className="border-b border-line">
                        {b.head.map((cell, j) => (
                          <th key={`${key}-h${j}`} scope="col" className={`px-3 py-2 align-bottom text-xs font-medium uppercase tracking-wide text-muted ${numeric[j] ? "text-right" : "text-left"}`}>
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {b.rows.map((row, r) => (
                        <tr key={`${key}-r${r}`} className="border-b border-line/70 last:border-0">
                          {row.map((cell, j) =>
                            j === 0 ? (
                              <th key={`${key}-r${r}c${j}`} scope="row" className="min-w-[7rem] px-3 py-2 text-left align-top font-normal text-ink">
                                {cell}
                              </th>
                            ) : (
                              <td key={`${key}-r${r}c${j}`} className={`px-3 py-2 align-top text-ink ${numeric[j] ? "whitespace-nowrap text-right" : "min-w-[10rem] text-left"}`}>
                                {cell}
                              </td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {b.note ? <figcaption className="mt-1 text-xs text-muted">{b.note}</figcaption> : null}
              </figure>
            );
          }
          case "chart":
            return (
              <figure key={key} className="my-2 rounded-xl border border-line bg-surface p-4">
                <figcaption className="mb-2 text-sm font-medium text-ink">{b.title}</figcaption>
                {b.chart ? (
                  <ChartView chart={b.chart} name={b.title} height={260} />
                ) : (
                  <EmptyState title={b.title} className="border-0">
                    {b.missing}
                  </EmptyState>
                )}
              </figure>
            );
        }
      })}
    </>
  );
}
