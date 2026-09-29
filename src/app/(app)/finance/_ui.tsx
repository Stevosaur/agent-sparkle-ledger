import Link from "next/link";
import { Badge, type Tone } from "@/components/ui/badge";
import { Stat } from "@/components/ui/misc";
import { sgd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Ageing } from "./_data";

export const MATCH_LABEL: Record<string, string> = {
  UNMATCHED: "Not matched yet",
  MATCHED: "Matched",
  MATCH_WITHIN_TOLERANCE: "Within tolerance",
  EXCEPTION: "Exception",
  APPROVED_EXCEPTION: "Approved exception",
};
const MATCH_TONE: Record<string, Tone> = { UNMATCHED: "neutral", MATCHED: "ok", MATCH_WITHIN_TOLERANCE: "info", EXCEPTION: "short", APPROVED_EXCEPTION: "spike" };

export function MatchBadge({ status, ...p }: { status: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return <Badge tone={MATCH_TONE[status] ?? "neutral"} {...p}>{MATCH_LABEL[status] ?? status.replaceAll("_", " ")}</Badge>;
}

const PAY_TONE: Record<string, Tone> = { UNPAID: "neutral", APPROVED_FOR_PAYMENT: "info", PAID: "ok", ON_HOLD: "surplus" };
export function PaymentBadge({ status }: { status: string }) {
  return <Badge tone={PAY_TONE[status] ?? "neutral"}>{status === "APPROVED_FOR_PAYMENT" ? "Approved to pay" : status.replaceAll("_", " ")}</Badge>;
}

export function AgeingCards({ a, label, extra }: { a: Ageing; label: "AP" | "AR"; extra?: React.ReactNode }) {
  const noun = label === "AP" ? "bill" : "invoice";
  const pl = (k: number) => `${k} ${noun}${k === 1 ? "" : "s"}`;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid={`${label.toLowerCase()}-ageing`}>
      <Stat label={label === "AP" ? "Payables outstanding" : "Receivables outstanding"} value={sgd(a.outstanding)} sub={extra ?? pl(a.count)} />
      <Stat label="Not yet due (>7 days)" value={sgd(a.notDue)} sub={pl(a.notDueN)} />
      <Stat label="Due within 7 days" value={sgd(a.dueSoon)} sub={pl(a.dueSoonN)} tone={a.dueSoonN ? "surplus" : undefined} />
      <Stat label="Overdue" value={sgd(a.overdue)} sub={pl(a.overdueN)} tone={a.overdueN ? "short" : "ok"} />
    </div>
  );
}

/** A row of link "chips" that set one search param while keeping the others. */
export function FilterChips({ base, param, value, options, params }: { base: string; param: string; value: string; options: { key: string; label: string; count?: number }[]; params: Record<string, string | undefined> }) {
  const href = (k: string) => {
    const q = new URLSearchParams();
    for (const [pk, pv] of Object.entries(params)) if (pv && pk !== param) q.set(pk, pv);
    if (k !== "all") q.set(param, k);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Link key={o.key} href={href(o.key)} className={cn("rounded-md border px-2.5 py-1 text-xs", value === o.key ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2")}>
          {o.label}
          {o.count !== undefined && <span className="num ml-1 text-muted">{o.count}</span>}
        </Link>
      ))}
    </div>
  );
}
