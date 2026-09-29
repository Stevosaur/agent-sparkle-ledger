import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { automationRule } from "@/lib/db/schema";
import { ACTION_RISK, RISK_LABELS, type RiskClass } from "@/lib/domain/risk";
import { PageHeader, Empty } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { dateTime, titleCase } from "@/lib/format";
import { RuleControls } from "./rule-controls";

export const metadata = { title: "Automation Rules" };

const RISK_TONE: Record<string, Tone> = { READ_ONLY: "neutral", LOW_RISK_WRITE: "info", COMMERCIAL_COMMITMENT: "surplus", FINANCIAL: "short", EXTERNAL_COMMUNICATION: "info", COMPLIANCE: "spike" };
const MATRIX: { risk: RiskClass; policy: string; tone: Tone; detail: string }[] = [
  { risk: "READ_ONLY", policy: "Automatic", tone: "ok", detail: "Answers, forecasts explained, scorecards, traces. Nothing changes." },
  { risk: "LOW_RISK_WRITE", policy: "Automatic where reversible", tone: "ok", detail: "Draft lots, alias mapping, exceptions, three-way match, route plans. Audited and reversible." },
  { risk: "COMMERCIAL_COMMITMENT", policy: "Approval required", tone: "surplus", detail: "Purchase orders, allocations, discounts, substitutions. An organisation rule may auto-approve POs under a set amount." },
  { risk: "FINANCIAL", policy: "Always approval", tone: "short", detail: "Invoice exceptions, payment approval, credit notes. Cannot be automated." },
  { risk: "EXTERNAL_COMMUNICATION", policy: "Approval unless templated automation is enabled", tone: "info", detail: "RFQs, supplier acks, buyer confirmations, flash offers. Only listed templated messages may auto-send." },
  { risk: "COMPLIANCE", policy: "Always approval", tone: "short", detail: "Recalls, lot holds, recall contact notices. Cannot be automated." },
];

export default async function AutomationPage() {
  const app = await requireApp();
  if (!app.can("settings.manage") && !app.can("ai.view")) redirect("/forbidden?need=settings.manage");
  const rules = await db.select().from(automationRule).where(eq(automationRule.orgId, app.org.id)).orderBy(asc(automationRule.name));
  const canEdit = app.can("settings.manage");
  const templated = Object.entries(ACTION_RISK).filter(([, r]) => r === "EXTERNAL_COMMUNICATION").map(([k]) => ({ key: k, label: titleCase(k) }));
  const actionsFor = (r: RiskClass) => Object.entries(ACTION_RISK).filter(([, x]) => x === r).map(([k]) => k);

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Automation rules"
        subtitle="AI recommends → a human approves → the system executes. These rules are the only way to let specific low-stakes actions skip approval. Financial and compliance actions can never be automated."
      />

      <div className="space-y-3" data-testid="automation-rules">
        {rules.length === 0 && <Empty title="No automation rules configured">Every agent action follows the default policy below.</Empty>}
        {rules.map((r) => {
          const locked = r.riskClass === "FINANCIAL" || r.riskClass === "COMPLIANCE";
          return (
            <Card key={r.id} className="p-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-text">{r.name}</h3>
                    <Badge tone={RISK_TONE[r.riskClass] ?? "neutral"}>{RISK_LABELS[r.riskClass as RiskClass] ?? r.riskClass}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-text-2">{r.description}</p>
                  <p className="num mt-2 text-[11px] text-muted">{r.key}{r.updatedBy ? ` · last changed by ${r.updatedBy} · ${dateTime(r.updatedAt)}` : ""}</p>
                </div>
                <RuleControls id={r.id} ruleKey={r.key} name={r.name} enabled={r.enabled} params={r.params} locked={locked} canEdit={canEdit} templatedActions={templated} />
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-5 overflow-hidden">
        <CardHeader title="Default approval policy by risk class" subtitle="Every agent action is classified. The class decides whether a human must approve before anything executes." />
        <Table className="min-w-[860px]">
          <THead><tr><TH>Risk class</TH><TH>Default policy</TH><TH>What it covers</TH><TH>Action types</TH></tr></THead>
          <tbody>
            {MATRIX.map((m) => (
              <TR key={m.risk}>
                <TD><Badge tone={RISK_TONE[m.risk]}>{RISK_LABELS[m.risk]}</Badge></TD>
                <TD><Badge tone={m.tone}>{m.policy}</Badge></TD>
                <TD className="max-w-[320px] text-xs text-text-2">{m.detail}</TD>
                <TD className="max-w-[360px]"><div className="flex flex-wrap gap-1">{actionsFor(m.risk).map((a) => <code key={a} className="num rounded bg-panel-2 px-1 py-px text-[10px] text-muted">{a}</code>)}</div></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
