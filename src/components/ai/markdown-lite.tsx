import Link from "next/link";
import type { ReactNode } from "react";
import { parseMarkdownLite, type Inline } from "@/lib/ai/markdown";

/** Renders assistant text (markdown-lite) as React elements. Model output is never set as HTML. */
export function MarkdownLite({ text }: { text: string }) {
  const blocks = parseMarkdownLite(text);
  return (
    <div className="space-y-2 text-sm leading-6 text-ink">
      {blocks.map((b, i) => {
        if (b.t === "p") return <p key={i}>{renderInline(b.c)}</p>;
        if (b.t === "ul")
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {b.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        return (
          <ol key={i} start={b.start} className="list-decimal space-y-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{renderInline(item)}</li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    if (n.t === "text") return <span key={i}>{n.v}</span>;
    if (n.t === "bold") return <strong key={i} className="font-semibold">{renderInline(n.c)}</strong>;
    return (
      <Link key={i} href={n.href} className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800">
        {renderInline(n.c)}
      </Link>
    );
  });
}
