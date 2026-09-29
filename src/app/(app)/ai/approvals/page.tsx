import { requireApp } from "@/lib/auth/session";
import { pendingApprovals, recentApprovals } from "@/lib/services/queries";
import { toApprovalView } from "@/lib/services/views";
import { ApprovalCard } from "@/components/app/approval-card";
import { Empty, PageHeader, Section } from "@/components/ui/misc";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { dateTime } from "@/lib/format";
import { RISK_LABELS, type RiskClass } from "@/lib/domain/risk";

export const metadata = { title: "Approval Inbox" };

export default async function ApprovalsPage() {
  const app = await requireApp("ai.view");
  const [pending, recent] = await Promise.all([pendingApprovals(app.org.id, 100), recentApprovals(app.org.id, 30)]);
  const groups = new Map<string, typeof pending>();
  for (const p of pending) groups.set(p.a.riskClass, [...(groups.get(p.a.riskClass) ?? []), p]);
  return (
    <div>
      <PageHeader
        eyebrow="AI operations"
        title="Approval Inbox"
        subtitle="AI recommends → a human approves → the system executes. Commercial commitments, financial and compliance actions always stop here; outbound messages do too unless templated automation is explicitly enabled."
      />
      {pending.length === 0 && <Empty title="Inbox zero">Agents will post recommendations here as supply, demand and invoices change.</Empty>}
      {[...groups.entries()].map(([risk, items]) => (
        <Section key={risk} title={`${RISK_LABELS[risk as RiskClass] ?? risk} · ${items.length}`}>
          <div className="grid gap-3 lg:grid-cols-2">
            {items.map((a) => <ApprovalCard key={a.a.id} a={toApprovalView(a)} />)}
          </div>
        </Section>
      ))}
      <Section title="Recent decisions">
        <div className="divide-y divide-border rounded-xl border border-border bg-panel">
          {recent.length === 0 && <p className="p-4 text-xs text-muted">No decisions yet.</p>}
          {recent.map(({ a }) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <StatusBadge status={a.status} />
              <span className="min-w-0 flex-1 truncate text-text">{a.title}</span>
              <Badge tone="neutral">{RISK_LABELS[a.riskClass as RiskClass]}</Badge>
              <span className="text-xs text-muted">{a.decidedBy ?? "—"}</span>
              <span className="num text-xs text-muted">{dateTime(a.decidedAt ?? a.requestedAt)}</span>
              {a.decisionNote && <span className="w-full text-xs text-muted">“{a.decisionNote}”</span>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
