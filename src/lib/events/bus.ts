/**
 * Minimal reliable event mechanism for the MVP: a transactional outbox table (`domain_event`) plus a
 * dispatcher that claims events with `FOR UPDATE SKIP LOCKED`, runs handlers, and retries with backoff.
 * Events are written in the same transaction as the state change, so they are never lost or emitted
 * for rolled-back work. Replaceable later by a workflow engine (Temporal, Inngest, SQS…).
 */
import { and, eq, sql } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { domainEvent } from "@/lib/db/schema";
import { log } from "@/lib/log";

export const EVENT_TYPES = [
  "CATCH_DECLARED",
  "VESSEL_ETA_UPDATED",
  "LOT_RECEIVED",
  "LOT_INSPECTED",
  "QUOTE_RECEIVED",
  "DEMAND_UPDATED",
  "SHORTAGE_DETECTED",
  "SURPLUS_DETECTED",
  "PO_APPROVED",
  "LOT_ALLOCATED",
  "ORDER_READY",
  "SHIPMENT_DISPATCHED",
  "DELIVERY_COMPLETED",
  "TEMPERATURE_EXCEPTION",
  "INVOICE_RECEIVED",
  "INVOICE_EXCEPTION",
  "RECALL_OPENED",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type DomainEventRow = typeof domainEvent.$inferSelect;
export type Handler = (e: DomainEventRow) => Promise<void>;

const handlers = new Map<string, Handler[]>();
export function on(type: EventType, h: Handler) {
  handlers.set(type, [...(handlers.get(type) ?? []), h]);
}

export async function emit(x: Executor, orgId: string, type: EventType, payload: Record<string, unknown>, opts: { idempotencyKey?: string; at?: Date } = {}) {
  await x
    .insert(domainEvent)
    .values({ orgId, type, payload, idempotencyKey: opts.idempotencyKey ?? null, occurredAt: opts.at ?? new Date() })
    .onConflictDoNothing();
}

let registered = false;
async function ensureHandlers() {
  if (registered) return;
  registered = true;
  const { registerHandlers } = await import("./handlers");
  registerHandlers();
}

/** Claim and process up to `limit` pending events. Safe to call concurrently from many processes. */
export async function processPending(limit = 25): Promise<number> {
  await ensureHandlers();
  let processed = 0;
  for (let i = 0; i < limit; i++) {
    const claimed = await db.transaction(async (tx) => {
      const r = await tx.execute<{ id: string }>(sql`
        SELECT id FROM domain_event WHERE status = 'PENDING' AND available_at <= now()
        ORDER BY occurred_at LIMIT 1 FOR UPDATE SKIP LOCKED`);
      const id = r.rows[0]?.id;
      if (!id) return null;
      const [row] = await tx.update(domainEvent).set({ status: "PROCESSING", attempts: sql`${domainEvent.attempts} + 1` }).where(eq(domainEvent.id, id)).returning();
      return row;
    });
    if (!claimed) break;
    try {
      for (const h of handlers.get(claimed.type) ?? []) await h(claimed);
      await db.update(domainEvent).set({ status: "DONE", processedAt: new Date(), error: null }).where(eq(domainEvent.id, claimed.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("event handler failed", { eventId: claimed.id, type: claimed.type, err: msg });
      const giveUp = claimed.attempts >= 5;
      await db
        .update(domainEvent)
        .set({ status: giveUp ? "FAILED" : "PENDING", error: msg, availableAt: new Date(Date.now() + 2 ** claimed.attempts * 5000) })
        .where(and(eq(domainEvent.id, claimed.id)));
    }
    processed++;
  }
  return processed;
}

/** Drain the queue (used by scripts and tests). Handlers may emit further events. */
export async function drain(max = 500) {
  let total = 0;
  for (let n = await processPending(50); n > 0 && total < max; n = await processPending(50)) total += n;
  return total;
}
