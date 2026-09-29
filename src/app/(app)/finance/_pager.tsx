import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Simple offset pager that keeps the other search params. */
export function Pager({ base, params, page, pageSize, total }: { base: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = "inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs";
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted">
      <span className="num">{from}–{to} of {total}</span>
      <div className="flex items-center gap-1.5">
        {page > 1 ? <Link href={href(page - 1)} className={cn(btn, "text-text-2 hover:bg-panel-2")}><ChevronLeft className="size-3.5" /> Prev</Link> : <span className={cn(btn, "opacity-40")}><ChevronLeft className="size-3.5" /> Prev</span>}
        <span className="num px-1">{page}/{pages}</span>
        {page < pages ? <Link href={href(page + 1)} className={cn(btn, "text-text-2 hover:bg-panel-2")}>Next <ChevronRight className="size-3.5" /></Link> : <span className={cn(btn, "opacity-40")}>Next <ChevronRight className="size-3.5" /></span>}
      </div>
    </div>
  );
}

export const pageOf = (v: string | undefined) => Math.max(1, Math.min(10000, Number.parseInt(v ?? "1", 10) || 1));
