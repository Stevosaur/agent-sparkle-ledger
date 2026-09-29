import { auditEvent } from "@/lib/db/schema";
import type { Executor } from "@/lib/db/client";
import type { Ctx } from "./context";
import { nowOf } from "./context";

/**
 * Append-only audit trail. Every operational change records who (human/AI/system), what, when,
 * source, and before/after where applicable. Keep payloads free of secrets and unnecessary PII.
 */
export async function audit(
  x: Executor,
  ctx: Ctx,
  e: { action: string; entityType: string; entityId: string; summary: string; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; relatedIds?: string[]; at?: Date },
) {
  await x.insert(auditEvent).values({
    orgId: ctx.orgId,
    at: e.at ?? nowOf(ctx),
    actorType: ctx.actor.type,
    actorId: ctx.actor.id,
    actorLabel: ctx.actor.label,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    summary: e.summary,
    before: e.before ?? null,
    after: e.after ?? null,
    source: ctx.source,
    agentRunId: ctx.agentRunId ?? null,
    relatedIds: (e.relatedIds ?? []).filter(Boolean),
  });
}
