import * as React from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "short" | "ok" | "surplus" | "late" | "spike" | "info" | "ai" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-panel-2 text-text-2 border-border",
  short: "bg-short-soft text-short border-short/30",
  ok: "bg-ok-soft text-ok border-ok/30",
  surplus: "bg-surplus-soft text-surplus border-surplus/30",
  late: "bg-late-soft text-late border-late/30",
  spike: "bg-spike-soft text-spike border-spike/30",
  info: "bg-info-soft text-info border-info/30",
  ai: "bg-accent-soft text-ai border-ai/30",
  accent: "bg-accent text-accent-fg border-transparent",
};

export function Badge({ tone = "neutral", className, mono, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; mono?: boolean }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", mono && "num normal-case", tones[tone], className)} {...p} />;
}

/** Map a status/enum to a tone so statuses read the same everywhere. */
export function toneFor(status: string | null | undefined): Tone {
  const s = (status ?? "").toUpperCase();
  if (/SHORT|EXCEPTION|REJECT|FAILED|EXPIRED|CRITICAL|MISSING|HIGH|OVERDUE/.test(s)) return "short";
  if (/SURPLUS|WARN|MEDIUM|EXPIRING|PARTIAL|DRAFT|PENDING|AWAITING/.test(s)) return "surplus";
  if (/LATE|DELAY/.test(s)) return "late";
  if (/SPIKE/.test(s)) return "spike";
  if (/MATCHED|BALANCED|APPROVED|DELIVERED|COMPLETED|VALID|SUCCEEDED|EXECUTED|AUTO_EXECUTED|AVAILABLE|RECEIVED|PAID|CONNECTED|RESOLVED|INVOICED|ALLOCATED|CLOSED|DONE|SENT/.test(s)) return "ok";
  if (/MOCK|AI|AGENT/.test(s)) return "ai";
  if (/EXPECTED|PLANNED|PICKING|PACKED|DISPATCHED|CONFIRMED|OPEN|IN_PROGRESS|LANDED|RUNNING|SUPERSEDED/.test(s)) return "info";
  return "neutral";
}

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return null;
  return <Badge tone={toneFor(status)} className={className}>{status.replaceAll("_", " ")}</Badge>;
}
