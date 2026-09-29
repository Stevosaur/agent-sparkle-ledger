"use client";
import Link from "next/link";
import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AiMark } from "@/components/ui/misc";
import { useAction } from "./action-button";
import { decideApprovalAction } from "@/app/actions";
import { time } from "@/lib/format";

export type ApprovalView = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  riskClass: string;
  requestedBy: string;
  requestedAt: string;
  explanation: string | null;
  confidence: number | null;
  affected: { type: string; id: string; label: string; href?: string }[];
  payload: Record<string, unknown>;
};

const RISK_TONE: Record<string, "surplus" | "short" | "info" | "spike" | "ai"> = {
  COMMERCIAL_COMMITMENT: "surplus",
  FINANCIAL: "short",
  EXTERNAL_COMMUNICATION: "info",
  COMPLIANCE: "spike",
};

/** Approve / Modify / Reject card — AI recommends, a human approves, the system executes. */
export function ApprovalCard({ a, compact }: { a: ApprovalView; compact?: boolean }) {
  const { pending, exec } = useAction();
  const [modify, setModify] = useState(false);
  const lines = (a.payload.lines as { quantityKg?: number; pricePerKg?: number }[] | undefined) ?? [];
  const [mods, setMods] = useState(lines.map((l) => ({ quantityKg: l.quantityKg, pricePerKg: l.pricePerKg })));
  const [toPrice, setToPrice] = useState<number | undefined>(a.payload.toPrice as number | undefined);
  const canModify = a.kind === "CREATE_PURCHASE_ORDER" || a.kind === "APPLY_DISCOUNT";

  return (
    <div className="rounded-xl border border-border bg-panel p-4" data-testid="approval-card">
      <div className="flex flex-wrap items-center gap-2">
        <AiMark />
        <Badge tone={RISK_TONE[a.riskClass] ?? "neutral"}>{a.riskClass.replaceAll("_", " ")}</Badge>
        <span className="text-[11px] text-muted">{a.requestedBy} · {time(a.requestedAt)}</span>
        {a.confidence !== null && <span className="num ml-auto text-[11px] text-muted">confidence {Math.round(a.confidence * 100)}%</span>}
      </div>
      <h3 className="mt-2 text-sm font-semibold text-text">{a.title}</h3>
      <pre className="num mt-2 whitespace-pre-wrap rounded-lg bg-panel-2 p-3 text-[13px] leading-relaxed text-text">{a.summary}</pre>
      {!compact && a.explanation && <p className="mt-2 text-xs leading-relaxed text-muted">{a.explanation}</p>}
      {!compact && a.affected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {a.affected.slice(0, 8).map((r) => (r.href ? <Link key={r.id + r.type} href={r.href} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-accent hover:border-accent">{r.label || r.type}</Link> : <span key={r.id + r.type} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted">{r.label || r.type}</span>))}
        </div>
      )}
      {modify && a.kind === "CREATE_PURCHASE_ORDER" && (
        <div className="mt-3 space-y-2">
          {mods.map((m, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted">Quantity (kg)<Input type="number" step="0.1" inputMode="decimal" value={m.quantityKg ?? ""} onChange={(e) => setMods(mods.map((x, j) => (j === i ? { ...x, quantityKg: Number(e.target.value) } : x)))} /></label>
              <label className="text-[11px] text-muted">Price (S$/kg)<Input type="number" step="0.01" inputMode="decimal" value={m.pricePerKg ?? ""} onChange={(e) => setMods(mods.map((x, j) => (j === i ? { ...x, pricePerKg: Number(e.target.value) } : x)))} /></label>
            </div>
          ))}
        </div>
      )}
      {modify && a.kind === "APPLY_DISCOUNT" && (
        <label className="mt-3 block text-[11px] text-muted">Offer price (S$/kg) — floor S${Number(a.payload.floorPrice).toFixed(2)}
          <Input type="number" step="0.01" value={toPrice ?? ""} onChange={(e) => setToPrice(Number(e.target.value))} />
        </label>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="success" size="lg" className="flex-1 sm:flex-none" disabled={pending} data-testid="approve-btn"
          onClick={() => exec(() => decideApprovalAction(a.id, "APPROVE", undefined, modify ? (a.kind === "APPLY_DISCOUNT" ? { toPrice } : { lines: mods }) : undefined))}>
          <Check /> {modify ? "Approve changes" : "Approve"}
        </Button>
        {canModify && <Button variant="secondary" size="lg" disabled={pending} onClick={() => setModify((v) => !v)}><Pencil /> Modify</Button>}
        <Button variant="ghost" size="lg" disabled={pending} onClick={() => { const n = window.prompt("Reason for rejecting (optional)") ?? undefined; exec(() => decideApprovalAction(a.id, "REJECT", n)); }}><X /> Reject</Button>
      </div>
    </div>
  );
}
