/**
 * Agent runtime: every agent execution is an observable, auditable AgentRun; every proposed action is an
 * AgentAction classified by risk. Actions that need a human create an Approval; the rest execute
 * automatically and are audited. We store concise operational explanations — never chain-of-thought —
 * and avoid persisting raw prompts.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { agentAction, agentRun, approval, automationRule, type AffectedRecord } from "@/lib/db/schema";
import { requiresApproval, type RiskClass } from "@/lib/domain/risk";
import { getAI } from "@/lib/integrations/ai";

export const AGENTS = {
  CATCH_INTAKE: "Catch Intake Agent",
  SPECIES_NORMALISATION: "Species Normalisation Agent",
  DEMAND_FORECAST: "Demand Forecast Agent",
  PROCUREMENT: "Procurement Agent",
  RFQ: "Supplier RFQ Agent",
  ALLOCATION: "Allocation Agent",
  SURPLUS: "Surplus Clearance Agent",
  LOGISTICS: "Logistics Agent",
  RECEIVING_QUALITY: "Receiving & Quality Agent",
  VENDOR_PERFORMANCE: "Vendor Performance Agent",
  AP_RECONCILIATION: "AP Reconciliation Agent",
  TRACEABILITY: "Traceability & Recall Agent",
  COMMAND: "AI Command Bar",
} as const;
export type AgentKey = keyof typeof AGENTS;

export type RunHandle = { id: string; orgId: string; agent: AgentKey; startedAt: Date; toolCalls: { tool: string; ok: boolean; ms?: number; note?: string }[] };

export async function startRun(
  orgId: string,
  agent: AgentKey,
  trigger: "EVENT" | "USER" | "SCHEDULE" | "COMMAND" | "WEBHOOK" | "SEED",
  inputRef: Record<string, unknown>,
  opts: { triggerEventId?: string | null; at?: Date; x?: Executor } = {},
): Promise<RunHandle> {
  const ai = getAI();
  const startedAt = opts.at ?? new Date();
  const [r] = await (opts.x ?? db)
    .insert(agentRun)
    .values({
      orgId,
      agent,
      trigger,
      triggerEventId: opts.triggerEventId ?? null,
      inputRef,
      provider: ai.live ? "ANTHROPIC" : "DETERMINISTIC",
      model: ai.model,
      status: "RUNNING",
      startedAt,
    })
    .returning({ id: agentRun.id });
  return { id: r.id, orgId, agent, startedAt, toolCalls: [] };
}

export function tool(run: RunHandle, name: string, ok = true, note?: string) {
  run.toolCalls.push({ tool: name, ok, note });
}

export async function finishRun(
  run: RunHandle,
  r: { status: "SUCCEEDED" | "FAILED" | "AWAITING_APPROVAL"; summary: string; output?: Record<string, unknown>; error?: string; usage?: { inputTokens: number; outputTokens: number }; at?: Date; approvalStatus?: "NOT_REQUIRED" | "PENDING" },
  x: Executor = db,
) {
  const finishedAt = r.at ?? new Date();
  await x
    .update(agentRun)
    .set({
      status: r.status,
      summary: r.summary,
      output: r.output ?? null,
      error: r.error ?? null,
      toolCalls: run.toolCalls,
      finishedAt,
      latencyMs: Math.max(0, finishedAt.getTime() - run.startedAt.getTime()),
      inputTokens: r.usage?.inputTokens ?? null,
      outputTokens: r.usage?.outputTokens ?? null,
      approvalStatus: r.approvalStatus ?? (r.status === "AWAITING_APPROVAL" ? "PENDING" : "NOT_REQUIRED"),
    })
    .where(eq(agentRun.id, run.id));
}

export type ProposedAction = {
  actionType: string;
  title: string;
  explanation: string;
  proposedAction: Record<string, unknown>;
  input?: Record<string, unknown>;
  confidence?: number | null;
  affectedRecords?: AffectedRecord[];
  /** For commercial automation thresholds. */
  amount?: number;
  /** Idempotency: a PENDING approval with the same key is not duplicated. */
  dedupeKey?: string;
  approvalSummary?: string;
};

/**
 * Record an action. Returns `autoExecute: true` when policy allows the caller to execute it immediately;
 * otherwise an Approval is created (or an identical pending one reused).
 */
export async function proposeAction(x: Executor, run: RunHandle, p: ProposedAction, at?: Date) {
  const rules = await x.select().from(automationRule).where(eq(automationRule.orgId, run.orgId));
  const decision = requiresApproval(p.actionType, { rules: rules.map((r) => ({ key: r.key, enabled: r.enabled, params: r.params })), amount: p.amount });

  if (decision.required && p.dedupeKey) {
    const existing = await x
      .select({ id: approval.id, actionId: approval.agentActionId })
      .from(approval)
      .where(and(eq(approval.orgId, run.orgId), eq(approval.dedupeKey, p.dedupeKey)))
      .limit(1);
    if (existing[0]) return { actionId: existing[0].actionId, approvalId: existing[0].id, autoExecute: false, riskClass: decision.riskClass, duplicate: true };
  }

  const [a] = await x
    .insert(agentAction)
    .values({
      orgId: run.orgId,
      agentRunId: run.id,
      actionType: p.actionType,
      riskClass: decision.riskClass,
      title: p.title,
      input: p.input ?? {},
      explanation: p.explanation,
      proposedAction: p.proposedAction,
      confidence: p.confidence === undefined || p.confidence === null ? null : String(Math.round(p.confidence * 1000) / 1000),
      affectedRecords: p.affectedRecords ?? [],
      requiresApproval: decision.required,
      executionStatus: decision.required ? "PENDING_APPROVAL" : "AUTO_EXECUTED",
      executedAt: decision.required ? null : at ?? new Date(),
      createdAt: at ?? new Date(),
    })
    .returning({ id: agentAction.id });

  let approvalId: string | null = null;
  if (decision.required) {
    const [ap] = await x
      .insert(approval)
      .values({
        orgId: run.orgId,
        agentActionId: a.id,
        kind: p.actionType,
        title: p.title,
        summary: p.approvalSummary ?? p.explanation,
        riskClass: decision.riskClass as RiskClass,
        payload: p.proposedAction,
        requestedBy: AGENTS[run.agent],
        requestedAt: at ?? new Date(),
        dedupeKey: p.dedupeKey ?? null,
      })
      .returning({ id: approval.id });
    approvalId = ap.id;
  }
  return { actionId: a.id, approvalId, autoExecute: !decision.required, riskClass: decision.riskClass, duplicate: false, reason: decision.reason };
}

/** Mark older pending proposals of the same kind for the same species/night as superseded by a newer one. */
export async function supersedePending(x: Executor, orgId: string, kind: string, marketDate: string, speciesId: string, keepDedupeKey?: string) {
  const rows = await x.execute<{ id: string; agent_action_id: string | null }>(sql`
    UPDATE approval SET status = 'SUPERSEDED', decided_at = now(), decided_by = 'System', decision_note = 'Superseded by a newer recommendation'
    WHERE org_id = ${orgId} AND kind = ${kind} AND status = 'PENDING' AND payload->>'marketDate' = ${marketDate} AND payload->>'speciesId' = ${speciesId}
      AND (${keepDedupeKey ?? null}::text IS NULL OR dedupe_key IS DISTINCT FROM ${keepDedupeKey ?? null})
    RETURNING id, agent_action_id`);
  for (const r of rows.rows) {
    if (!r.agent_action_id) continue;
    const [a] = await x.update(agentAction).set({ executionStatus: "SUPERSEDED" }).where(eq(agentAction.id, r.agent_action_id)).returning({ runId: agentAction.agentRunId });
    await x.execute(sql`UPDATE agent_run SET status = 'SUCCEEDED', approval_status = 'NOT_REQUIRED'
      WHERE id = ${a.runId} AND status = 'AWAITING_APPROVAL' AND NOT EXISTS (SELECT 1 FROM agent_action WHERE agent_run_id = ${a.runId} AND execution_status = 'PENDING_APPROVAL')`);
  }
  return rows.rows.length;
}

/**
 * Event-triggered agents coalesce bursts: skip only if a run for the same scope already started at or after
 * this event occurred (so it has already seen this state). Later events always get a fresh run.
 */
export async function recentlyRan(orgId: string, agent: AgentKey, at: Date, scope: Record<string, unknown>) {
  const r = await db.execute(sql`
    SELECT 1 FROM agent_run WHERE org_id = ${orgId} AND agent = ${agent}
      AND started_at >= ${at} AND started_at < ${new Date(at.getTime() + 10 * 60000)} AND input_ref @> ${JSON.stringify(scope)}::jsonb LIMIT 1`);
  return r.rows.length > 0;
}
