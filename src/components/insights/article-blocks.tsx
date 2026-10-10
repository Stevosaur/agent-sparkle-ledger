import { EmptyState } from "@/components/ui/notice";
import type { ResolvedBlock } from "@/lib/news/types";
import { ChartView } from "./chart-view";

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
          case "table":
            return (
              <figure key={key} className="my-2">
                <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                  <table className="tabular w-full min-w-max border-collapse text-sm">
                    {b.caption ? <caption className="px-3 pt-3 text-left text-sm font-medium text-ink">{b.caption}</caption> : null}
                    <thead>
                      <tr className="border-b border-line">
                        {b.head.map((cell, j) => (
                          <th key={`${key}-h${j}`} scope="col" className={`px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted ${j === 0 ? "text-left" : "text-right"}`}>
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
                              <th key={`${key}-r${r}c${j}`} scope="row" className="max-w-[18rem] whitespace-normal px-3 py-2 text-left font-normal text-ink">
                                {cell}
                              </th>
                            ) : (
                              <td key={`${key}-r${r}c${j}`} className="whitespace-normal px-3 py-2 text-right text-ink">
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
