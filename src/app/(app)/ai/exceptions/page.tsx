import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { opsException } from "@/lib/db/schema";
import { PageHeader, Empty } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { LiveRefresh } from "@/components/app/live-refresh";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ExceptionActions } from "./exception-actions";

export const metadata = { title: "Exceptions" };

type ExType = (typeof opsException.$inferSelect)["type"];
const TYPES: { type: ExType; label: string; hint: string }[] = [
  { type: "SHORTAGE", label: "Shortage", hint: "Confirmed demand exceeds committed supply" },
  { type: "SURPLUS", label: "Surplus", hint: "Stock at risk of going unsold" },
  { type: "LATE_VESSEL", label: "Late vessel", hint: "Supplier ETA revised later" },
  { type: "WEIGHT_VARIANCE", label: "Weight variance", hint: "Received weight differs from declared" },
  { type: "TEMPERATURE", label: "Temperature", hint: "Receiving temperature above limit" },
  { type: "INVOICE_MISMATCH", label: "Invoice mismatch", hint: "Supplier bill does not match PO / receipt" },
  { type: "DOCUMENT_EXPIRY", label: "Document expiry", hint: "Vendor licence or certificate expiring" },
  { type: "LATE_DELIVERY", label: "Late delivery", hint: "Delivery outside customer window" },
  { type: "QUALITY", label: "Quality", hint: "Grade or inspection issue" },
  { type: "SPECIES_MAPPING", label: "Species mapping", hint: "Supplier name needs a species confirmed" },
];
const SEV_TONE: Record<string, Tone> = { CRITICAL: "short", HIGH: "short", MEDIUM: "surplus", LOW: "info" };
const SEV_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const TABS = [
  { key: "OPEN", label: "Open" },
  { key: "ACKNOWLEDGED", label: "Acknowledged" },
  { key: "RESOLVED", label: "Resolved" },
] as const;

export default async function ExceptionsPage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string }> }) {
  const app = await requireApp("ai.view");
  const sp = await searchParams;
  const status = TABS.find((t) => t.key === sp.status)?.key ?? "OPEN";
  const typeFilter = TYPES.find((t) => t.type === sp.type)?.type;

  const [counts, items] = await Promise.all([
    db.select({ status: opsException.status, n: sql<number>`count(*)::int` }).from(opsException).where(eq(opsException.orgId, app.org.id)).groupBy(opsException.status),
    db
      .select()
      .from(opsException)
      .where(and(eq(opsException.orgId, app.org.id), eq(opsException.status, status), typeFilter ? eq(opsException.type, typeFilter) : sql`true`))
      .orderBy(status === "RESOLVED" ? desc(opsException.resolvedAt) : desc(opsException.openedAt))
      .limit(status === "RESOLVED" ? 200 : 500),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const groups = TYPES.map((t) => ({ ...t, items: items.filter((i) => i.type === t.type).sort((a, b) => (status === "RESOLVED" ? 0 : SEV_RANK[a.severity] - SEV_RANK[b.severity])) })).filter((g) => g.items.length);
  const canAck = app.can("ai.view");
  const canResolve = app.can("approvals.decide");
  const qs = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { status: status === "OPEN" ? undefined : status, type: typeFilter, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/ai/exceptions?${s}` : "/ai/exceptions";
  };

  return (
    <div>
      <LiveRefresh seconds={30} />
      <PageHeader
        eyebrow="AI Operations"
        title="Exceptions"
        subtitle="Operational exceptions raised by agents and receiving checks. Acknowledge to show someone is on it; resolve with a note once the underlying issue is handled. Exceptions whose condition clears are closed automatically."
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-lg border border-border bg-panel p-1" role="tablist">
          {TABS.map((t) => (
            <Link key={t.key} role="tab" aria-selected={status === t.key} href={qs({ status: t.key === "OPEN" ? undefined : t.key })} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", status === t.key ? "bg-panel-3 text-text" : "text-muted hover:text-text")}>
              {t.label} <span className="num ml-1 text-muted">{count(t.key)}</span>
            </Link>
          ))}
        </div>
        {typeFilter && (
          <span className="flex items-center gap-2 text-xs text-muted">
            Type: <Badge tone="info">{TYPES.find((t) => t.type === typeFilter)?.label}</Badge>
            <Link href={qs({ type: undefined })} className="text-accent">Clear</Link>
          </span>
        )}
      </div>

      {groups.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {groups.map((g) => (
            <a key={g.type} href={`#${g.type}`} className="rounded-md border border-border px-2.5 py-1 text-xs text-text-2 hover:bg-panel-2">
              {g.label} <span className="num ml-1 text-muted">{g.items.length}</span>
            </a>
          ))}
        </div>
      )}

      {groups.length === 0 && (
        <Empty title={status === "OPEN" ? "No open exceptions" : status === "ACKNOWLEDGED" ? "Nothing acknowledged and waiting" : "No resolved exceptions yet"}>
          {status === "OPEN" ? "Shortages, late vessels, weight and temperature issues and invoice mismatches will appear here as they are detected." : undefined}
        </Empty>
      )}

      <div className="space-y-4">
        {groups.map((g) => (
          <Card key={g.type} id={g.type} className="scroll-mt-20">
            <CardHeader
              title={<span className="flex items-center gap-2"><AlertTriangle className="size-4 text-muted" /> {g.label} <span className="num text-xs font-normal text-muted">{g.items.length}</span></span>}
              subtitle={g.hint}
              action={!typeFilter ? <Link href={qs({ type: g.type })} className="text-xs text-accent">Only this type</Link> : undefined}
            />
            <ul className="divide-y divide-border">
              {g.items.map((e) => (
                <li key={e.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start" data-testid="exception-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={SEV_TONE[e.severity] ?? "neutral"}>{e.severity}</Badge>
                      <span className="text-sm font-medium text-text">{e.title}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-text-2">{e.detail}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                      <span className="num">Opened {dateTime(e.openedAt)}</span>
                      {e.resolvedAt && <span className="num">Resolved {dateTime(e.resolvedAt)}{e.resolvedBy ? ` by ${e.resolvedBy}` : ""}</span>}
                      {e.href && <Link href={e.href} className="inline-flex items-center gap-0.5 text-accent hover:underline">Open record <ArrowUpRight className="size-3" /></Link>}
                    </div>
                    {e.resolutionNote && <p className="mt-1.5 rounded-md bg-panel-2 px-2.5 py-1.5 text-xs text-text-2"><span className="text-muted">Resolution:</span> {e.resolutionNote}</p>}
                  </div>
                  {e.status !== "RESOLVED" && <ExceptionActions id={e.id} title={e.title} status={e.status} canAck={canAck} canResolve={canResolve} />}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
