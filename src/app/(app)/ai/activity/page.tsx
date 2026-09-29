import Link from "next/link";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Lock, X } from "lucide-react";
import { requireApp } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { agentAction, agentRun, approval } from "@/lib/db/schema";
import { AGENTS } from "@/lib/agents/runtime";
import { RISK_LABELS, type RiskClass } from "@/lib/domain/risk";
import { PageHeader, Empty, AiMark, Dl } from "@/components/ui/misc";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge, StatusBadge, type Tone } from "@/components/ui/badge";
import { LiveRefresh } from "@/components/app/live-refresh";
import { dateTime, time } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Agent Activity" };

const STATUSES = ["RUNNING", "SUCCEEDED", "AWAITING_APPROVAL", "FAILED"] as const;
const RISK_TONE: Record<string, Tone> = { READ_ONLY: "neutral", LOW_RISK_WRITE: "info", COMMERCIAL_COMMITMENT: "surplus", FINANCIAL: "short", EXTERNAL_COMMUNICATION: "info", COMPLIANCE: "spike" };
const agentName = (k: string) => AGENTS[k as keyof typeof AGENTS] ?? k;
const ms = (v: number | null) => (v === null ? "—" : v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`);

function Json({ value }: { value: unknown }) {
  const s = JSON.stringify(value ?? {}, null, 2);
  return <pre className="num max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-panel-2 p-3 text-[11px] leading-relaxed text-text-2">{s === "{}" ? "—" : s}</pre>;
}

export default async function AgentActivityPage({ searchParams }: { searchParams: Promise<{ agent?: string; status?: string; run?: string }> }) {
  const app = await requireApp("ai.view");
  const sp = await searchParams;
  const agent = sp.agent && sp.agent in AGENTS ? sp.agent : undefined;
  const status = STATUSES.find((s) => s === sp.status);
  const runId = sp.run && /^[0-9a-f-]{36}$/i.test(sp.run) ? sp.run : undefined;

  const [runs, byAgent, byStatus, selected] = await Promise.all([
    db
      .select()
      .from(agentRun)
      .where(and(eq(agentRun.orgId, app.org.id), agent ? eq(agentRun.agent, agent) : sql`true`, status ? eq(agentRun.status, status) : sql`true`))
      .orderBy(desc(agentRun.startedAt))
      .limit(100),
    db.select({ agent: agentRun.agent, n: sql<number>`count(*)::int` }).from(agentRun).where(eq(agentRun.orgId, app.org.id)).groupBy(agentRun.agent),
    db.select({ status: agentRun.status, n: sql<number>`count(*)::int` }).from(agentRun).where(and(eq(agentRun.orgId, app.org.id), agent ? eq(agentRun.agent, agent) : sql`true`)).groupBy(agentRun.status),
    runId ? db.select().from(agentRun).where(and(eq(agentRun.id, runId), eq(agentRun.orgId, app.org.id))).then((r) => r[0] ?? null) : Promise.resolve(null),
  ]);
  const actions = selected ? await db.select().from(agentAction).where(and(eq(agentAction.agentRunId, selected.id), eq(agentAction.orgId, app.org.id))).orderBy(asc(agentAction.createdAt)) : [];
  const approvals = actions.length
    ? await db.select({ id: approval.id, actionId: approval.agentActionId, status: approval.status, decidedBy: approval.decidedBy, decidedAt: approval.decidedAt }).from(approval).where(and(eq(approval.orgId, app.org.id), inArray(approval.agentActionId, actions.map((a) => a.id))))
    : [];

  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ agent, status, run: runId, ...patch })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/ai/activity?${s}` : "/ai/activity";
  };
  const total = byAgent.reduce((a, r) => a + r.n, 0);
  const agentKeys = (Object.keys(AGENTS) as (keyof typeof AGENTS)[]).filter((k) => byAgent.some((b) => b.agent === k));

  return (
    <div>
      <LiveRefresh seconds={30} />
      <PageHeader
        eyebrow="AI Operations"
        title="Agent Activity"
        subtitle="Every agent execution is an observable run with its trigger, provider, tool calls and proposed actions. Actions are risk-classified; anything commercial, financial, outbound or compliance-related waits for a human."
      />
      <div className="mb-4 flex gap-2.5 rounded-xl border border-border bg-panel-2 px-4 py-2.5 text-xs text-text-2">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-muted" />
        <span>Only concise operational explanations are stored — what the agent did and why, in business terms. Private model reasoning (chain-of-thought) and raw prompts are never persisted or shown.</span>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        <Link href={href({ agent: undefined, run: undefined })} className={cn("rounded-md border px-2.5 py-1 text-xs", !agent ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2")}>All agents <span className="num ml-1 text-muted">{total}</span></Link>
        {agentKeys.map((k) => (
          <Link key={k} href={href({ agent: k, run: undefined })} className={cn("rounded-md border px-2.5 py-1 text-xs", agent === k ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2")}>
            {AGENTS[k].replace(/ Agent$/, "")} <span className="num ml-1 text-muted">{byAgent.find((b) => b.agent === k)?.n}</span>
          </Link>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href={href({ status: undefined, run: undefined })} className={cn("rounded-md border px-2.5 py-1 text-xs", !status ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2")}>Any status</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={href({ status: s, run: undefined })} className={cn("rounded-md border px-2.5 py-1 text-xs", status === s ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:bg-panel-2")}>
            {s.replaceAll("_", " ").toLowerCase()} <span className="num ml-1 text-muted">{byStatus.find((b) => b.status === s)?.n ?? 0}</span>
          </Link>
        ))}
      </div>

      <div className={cn("grid grid-cols-1 gap-4", selected && "xl:grid-cols-[minmax(0,1fr)_minmax(0,540px)]")}>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className={cn("w-full text-sm", selected ? "min-w-[620px]" : "min-w-[860px]")} data-testid="agent-runs">
              <thead className="bg-panel-2">
                <tr className="text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 text-left font-semibold">Started</th>
                  <th className="px-3 py-2 text-left font-semibold">Agent</th>
                  {!selected && <th className="px-3 py-2 text-left font-semibold">Trigger</th>}
                  <th className="px-3 py-2 text-left font-semibold">Provider</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  {!selected && <th className="px-3 py-2 text-right font-semibold">Latency</th>}
                  <th className="px-3 py-2 text-left font-semibold">Summary</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const active = r.id === selected?.id;
                  return (
                    <tr key={r.id} className={cn("border-t border-border align-top hover:bg-panel-2", active && "bg-accent-soft")}>
                      <td className="num whitespace-nowrap px-3 py-2 text-xs text-text-2"><Link href={href({ run: r.id })} className="block">{dateTime(r.startedAt)}</Link></td>
                      <td className="px-3 py-2"><Link href={href({ run: r.id })} className={cn("block whitespace-nowrap text-xs font-medium", active ? "text-accent" : "text-text hover:text-accent")}>{agentName(r.agent)}</Link></td>
                      {!selected && <td className="px-3 py-2"><Badge tone="neutral">{r.trigger}</Badge></td>}
                      <td className="px-3 py-2">
                        <Badge tone={r.provider === "ANTHROPIC" ? "ai" : "neutral"}>{r.provider === "ANTHROPIC" ? "Anthropic" : "Deterministic"}</Badge>
                        {r.model && <div className="num mt-0.5 text-[10px] text-muted">{r.model}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={r.status} />
                          {r.approvalStatus !== "NOT_REQUIRED" && <span className="text-[10px] text-muted">approval: {r.approvalStatus.toLowerCase()}</span>}
                        </div>
                      </td>
                      {!selected && <td className="num whitespace-nowrap px-3 py-2 text-right text-xs text-text-2">{ms(r.latencyMs)}</td>}
                      <td className="px-3 py-2"><Link href={href({ run: r.id })} className="line-clamp-2 text-xs text-muted hover:text-text">{r.summary ?? r.error ?? "—"}</Link></td>
                    </tr>
                  );
                })}
                {runs.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">No agent runs match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          {runs.length === 100 && <div className="border-t border-border px-4 py-2 text-[11px] text-muted">Showing the 100 most recent runs. Filter by agent or status to narrow.</div>}
        </Card>

        {runId && !selected && <Empty title="Run not found">It may belong to another workspace or have been removed.</Empty>}
        {selected && (
          <div className="order-first space-y-4 xl:order-none xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto" data-testid="run-detail">
            <Card>
              <CardHeader
                title={<span className="flex items-center gap-2"><AiMark /> {agentName(selected.agent)}</span>}
                subtitle={<span className="num">{selected.id}</span>}
                action={<Link href={href({ run: undefined })} className="rounded p-1 text-muted hover:bg-panel-2 hover:text-text" aria-label="Close run detail"><X className="size-4" /></Link>}
              />
              <CardBody className="space-y-4">
                <Dl
                  className="text-xs"
                  items={[
                    ["Status", <span key="s" className="flex flex-wrap gap-1.5"><StatusBadge status={selected.status} />{selected.approvalStatus !== "NOT_REQUIRED" && <Badge tone="neutral">approval {selected.approvalStatus.toLowerCase()}</Badge>}</span>],
                    ["Trigger", selected.trigger.toLowerCase()],
                    ["Provider / model", <span key="p">{selected.provider === "ANTHROPIC" ? "Anthropic" : "Deterministic engine (MOCK MODE)"}{selected.model ? ` · ${selected.model}` : ""}</span>],
                    ["Started → finished", <span key="t" className="num">{dateTime(selected.startedAt)} → {selected.finishedAt ? time(selected.finishedAt) : "running"}</span>],
                    ["Latency", <span key="l" className="num">{ms(selected.latencyMs)}</span>],
                    ...(selected.inputTokens !== null ? [["Tokens in / out", <span key="k" className="num">{selected.inputTokens} / {selected.outputTokens ?? 0}</span>] as [string, React.ReactNode]] : []),
                  ]}
                />
                {selected.summary && <p className="rounded-lg border border-border px-3 py-2 text-sm text-text">{selected.summary}</p>}
                {selected.error && <p className="rounded-lg border border-short/40 bg-short-soft px-3 py-2 text-xs text-short">{selected.error}</p>}
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Input reference</div>
                  <Json value={selected.inputRef} />
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Tool calls ({selected.toolCalls.length})</div>
                  {selected.toolCalls.length === 0 ? <p className="text-xs text-muted">No tool calls recorded.</p> : (
                    <ol className="space-y-1">
                      {selected.toolCalls.map((t, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", t.ok ? "bg-ok" : "bg-short")} />
                          <span className="num text-text">{t.tool}</span>
                          {t.ms !== undefined && <span className="num text-muted">{ms(t.ms)}</span>}
                          {t.note && <span className="text-muted">— {t.note}</span>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
                {selected.output && (
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Output summary</div>
                    <Json value={selected.output} />
                  </div>
                )}
              </CardBody>
            </Card>

            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Proposed actions ({actions.length})</h2>
              {actions.length === 0 && <Empty title="This run proposed no actions" />}
              <div className="space-y-3">
                {actions.map((a) => {
                  const ap = approvals.find((x) => x.actionId === a.id);
                  return (
                    <Card key={a.id} className="p-4" data-testid="agent-action">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral" mono>{a.actionType}</Badge>
                        <Badge tone={RISK_TONE[a.riskClass] ?? "neutral"}>{RISK_LABELS[a.riskClass as RiskClass] ?? a.riskClass}</Badge>
                        <StatusBadge status={a.executionStatus} />
                        {a.confidence !== null && <span className="num ml-auto text-[11px] text-muted">confidence {Math.round(Number(a.confidence) * 100)}%</span>}
                      </div>
                      <h3 className="mt-2 text-sm font-semibold text-text">{a.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-text-2"><span className="text-muted">Explanation: </span>{a.explanation}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                        <span>{a.requiresApproval ? "Requires human approval" : "Ran automatically (audited)"}</span>
                        {ap && <span>Approval: <span className="text-text-2">{ap.status.toLowerCase()}</span>{ap.decidedBy ? ` by ${ap.decidedBy}` : ""}{ap.decidedAt ? ` · ${dateTime(ap.decidedAt)}` : ""}</span>}
                        {ap?.status === "PENDING" && <Link href="/ai/approvals" className="text-accent">Open approval inbox →</Link>}
                        {a.executedAt && <span className="num">executed {dateTime(a.executedAt)}</span>}
                      </div>
                      {a.affectedRecords.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {a.affectedRecords.map((r) => (r.href ? (
                            <Link key={r.type + r.id} href={r.href} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-accent hover:border-accent">{r.label || r.type}</Link>
                          ) : (
                            <span key={r.type + r.id} className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted">{r.label || r.type}</span>
                          )))}
                        </div>
                      )}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] text-muted hover:text-text">Proposed action (JSON){a.executionResult ? " & result" : ""}</summary>
                        <div className="mt-1.5 space-y-2">
                          <Json value={a.proposedAction} />
                          {a.executionResult && <Json value={a.executionResult} />}
                        </div>
                      </details>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
