"use server";
/**
 * Operational exception inbox actions. Tenant-scoped, role-checked, audited.
 */
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { opsException } from "@/lib/db/schema";
import { audit } from "@/lib/services/audit";
import { DomainError } from "@/lib/services/context";
import { run } from "./_run";

const id = z.string().uuid();

export async function acknowledgeExceptionAction(exceptionId: string) {
  const eid = id.parse(exceptionId);
  return run("ai.view", async (app) => {
    const [e] = await db.select().from(opsException).where(and(eq(opsException.id, eid), eq(opsException.orgId, app.org.id)));
    if (!e) throw new DomainError("Exception not found", "NOT_FOUND", 404);
    if (e.status !== "OPEN") throw new DomainError(`This exception is already ${e.status.toLowerCase()}.`);
    await db.update(opsException).set({ status: "ACKNOWLEDGED" }).where(and(eq(opsException.id, e.id), eq(opsException.orgId, app.org.id)));
    await audit(db, app.ctx, { action: "EXCEPTION_ACKNOWLEDGED", entityType: "ops_exception", entityId: e.id, summary: `Acknowledged: ${e.title}`, before: { status: e.status }, after: { status: "ACKNOWLEDGED" }, relatedIds: e.entityId ? [e.entityId] : [] });
  }, "Exception acknowledged");
}

export async function resolveExceptionAction(exceptionId: string, note: string) {
  const eid = id.parse(exceptionId);
  const n = z.string().trim().min(3, "Add a short resolution note").max(300).parse(note);
  return run("approvals.decide", async (app) => {
    const [e] = await db.select().from(opsException).where(and(eq(opsException.id, eid), eq(opsException.orgId, app.org.id)));
    if (!e) throw new DomainError("Exception not found", "NOT_FOUND", 404);
    if (e.status === "RESOLVED") throw new DomainError("This exception is already resolved.");
    const at = app.now;
    await db.update(opsException).set({ status: "RESOLVED", resolvedAt: at, resolvedBy: app.user.name, resolutionNote: n }).where(and(eq(opsException.id, e.id), eq(opsException.orgId, app.org.id)));
    await audit(db, app.ctx, { action: "EXCEPTION_RESOLVED", entityType: "ops_exception", entityId: e.id, summary: `Resolved: ${e.title} — ${n}`, before: { status: e.status }, after: { status: "RESOLVED", resolutionNote: n }, relatedIds: e.entityId ? [e.entityId] : [] });
  }, "Exception resolved");
}
