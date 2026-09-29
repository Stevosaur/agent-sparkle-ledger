/**
 * Approval Inbox: human decisions on agent proposals. On approval the SYSTEM executes the action exactly as
 * approved (or as modified within allowed bounds). Every decision is audited against the agent action.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { agentAction, agentRun, approval, customer, quoteLine, quote, recallAffectedCustomer, recallCase, rfq, species } from "@/lib/db/schema";
import { audit } from "./audit";
import { DomainError, nowOf, type Ctx } from "./context";
import { createPurchaseOrder } from "./procurement";
import { commitAllocation } from "./allocation";
import { approveInvoiceException } from "./finance";
import { notify } from "./common";
import { sendOutbound } from "@/lib/agents/catch-intake";

type Decision = "APPROVE" | "REJECT";

export async function decideApproval(ctx: Ctx, approvalId: string, decision: Decision, opts: { note?: string; modifications?: Record<string, unknown> } = {}) {
  return db.transaction(async (x) => {
    const locked = await x.execute(sql`SELECT id FROM approval WHERE id = ${approvalId} AND org_id = ${ctx.orgId} FOR UPDATE`);
    if (!locked.rows.length) throw new DomainError("Approval not found", "NOT_FOUND", 404);
    const [ap] = await x.select().from(approval).where(eq(approval.id, approvalId));
    if (ap.status !== "PENDING") throw new DomainError(`Already ${ap.status.toLowerCase()}.`, "ALREADY_DECIDED", 409);
    const at = nowOf(ctx);
    const modified = decision === "APPROVE" && opts.modifications && Object.keys(opts.modifications).length > 0;
    let result: Record<string, unknown> = {};
    if (decision === "APPROVE") result = await execute(x, ctx, ap, opts.modifications ?? {});
    await x
      .update(approval)
      .set({ status: decision === "REJECT" ? "REJECTED" : modified ? "MODIFIED" : "APPROVED", decidedBy: ctx.actor.label, decidedAt: at, decisionNote: opts.note ?? null, modifications: opts.modifications ?? null })
      .where(eq(approval.id, ap.id));
    if (ap.agentActionId) {
      await x.update(agentAction).set({ executionStatus: decision === "REJECT" ? "REJECTED" : "EXECUTED", executedAt: decision === "APPROVE" ? at : null, executionResult: result }).where(eq(agentAction.id, ap.agentActionId));
      const [act] = await x.select({ runId: agentAction.agentRunId }).from(agentAction).where(eq(agentAction.id, ap.agentActionId));
      const pending = await x.execute(sql`SELECT COUNT(*)::int AS n FROM agent_action WHERE agent_run_id = ${act.runId} AND execution_status = 'PENDING_APPROVAL'`);
      if (Number((pending.rows[0] as { n: number }).n) === 0) {
        await x.update(agentRun).set({ approvalStatus: decision === "REJECT" ? "REJECTED" : "APPROVED", status: "SUCCEEDED" }).where(and(eq(agentRun.id, act.runId), eq(agentRun.status, "AWAITING_APPROVAL")));
      } else await x.update(agentRun).set({ approvalStatus: "PARTIAL" }).where(eq(agentRun.id, act.runId));
    }
    await audit(x, ctx, {
      action: decision === "REJECT" ? "APPROVAL_REJECTED" : "APPROVAL_GRANTED",
      entityType: "approval",
      entityId: ap.id,
      summary: `${decision === "REJECT" ? "Rejected" : modified ? "Approved with changes" : "Approved"}: ${ap.title}${opts.note ? ` — “${opts.note}”` : ""}.`,
      relatedIds: [ap.agentActionId ?? "", ...(Array.isArray(result.relatedIds) ? (result.relatedIds as string[]) : [])].filter(Boolean),
      at,
    });
    return { status: decision, result };
  });
}

async function execute(x: Executor, ctx: Ctx, ap: typeof approval.$inferSelect, mods: Record<string, unknown>): Promise<Record<string, unknown>> {
  const p = ap.payload as Record<string, unknown>;
  switch (ap.kind) {
    case "CREATE_PURCHASE_ORDER": {
      type L = { speciesId: string; lotId: string | null; quoteLineId?: string | null; quantityKg: number; pricePerKg: number };
      const lines = (p.lines as L[]).map((l, i) => {
        const m = (mods.lines as Partial<L>[] | undefined)?.[i] ?? {};
        return { ...l, quantityKg: Number(m.quantityKg ?? l.quantityKg), pricePerKg: Number(m.pricePerKg ?? l.pricePerKg) };
      });
      const po = await createPurchaseOrder(x, ctx, { vendorId: p.vendorId as string, marketDate: p.marketDate as string, source: "AI_RECOMMENDATION", approvalId: ap.id, expectedAt: p.expectedAt ? new Date(p.expectedAt as string) : null, lines });
      for (const l of lines.filter((z) => z.quoteLineId)) {
        const [ql] = await x.select().from(quoteLine).where(eq(quoteLine.id, l.quoteLineId!));
        if (ql) await x.update(quote).set({ status: "ACCEPTED", lotId: po.lotIds[0] }).where(eq(quote.id, ql.quoteId));
      }
      return { purchaseOrderId: po.id, poNumber: po.poNumber, relatedIds: [po.id, ...po.lotIds] };
    }
    case "CONFIRM_ALLOCATION": {
      const r = await commitAllocation(ctx, { marketDate: p.marketDate as string, speciesId: p.speciesId as string, policy: p.policy as never, lines: p.lines as never }, x);
      return { allocationIds: r.allocationIds };
    }
    case "APPROVE_INVOICE_EXCEPTION": {
      await approveInvoiceException(ctx, p.supplierInvoiceId as string, (mods.note as string) ?? "Approved via Approval Inbox", x);
      return { relatedIds: [p.supplierInvoiceId as string] };
    }
    case "APPLY_DISCOUNT": {
      const floor = Number(p.floorPrice);
      const price = Number(mods.toPrice ?? p.toPrice);
      if (price < floor) throw new DomainError(`S$${price.toFixed(2)} is below the approved floor of S$${floor.toFixed(2)}.`, "BELOW_FLOOR");
      const [sp] = await x.select().from(species).where(eq(species.id, p.speciesId as string));
      const recips = (p.recipients as { customerId: string; name: string; suggestKg: number }[]) ?? [];
      for (const r of recips) {
        const [c] = await x.select().from(customer).where(eq(customer.id, r.customerId));
        const body = `Flash offer tonight: ${sp.canonicalName}${sp.localNames[0] ? ` (${sp.localNames[0]})` : ""} ~${r.suggestKg}kg at S$${price.toFixed(2)}/kg. Reply YES to confirm before 05:30.`;
        if (c?.phone) await sendOutbound(x, ctx.orgId, { to: c.phone, body, customerId: c.id, at: nowOf(ctx) });
      }
      await audit(x, ctx, { action: "DISCOUNT_APPROVED", entityType: "species", entityId: sp.id, summary: `Discounted offer approved: ${Number(p.kg)} kg ${sp.canonicalName} at S$${price.toFixed(2)}/kg (floor S$${floor.toFixed(2)}), sent to ${recips.length} buyer(s).` });
      return { price, recipients: recips.length };
    }
    case "SEND_SUPPLIER_ACK":
    case "SEND_BUYER_CONFIRMATION": {
      const r = await sendOutbound(x, ctx.orgId, { to: p.to as string, body: String(mods.body ?? p.body), vendorId: (p.vendorId as string) ?? null, customerId: (p.customerId as string) ?? null, at: nowOf(ctx) });
      return { status: r.status };
    }
    case "SEND_RFQ": {
      const recips = (p.recipients as { vendorId: string; to: string }[]) ?? [];
      for (const r of recips) await sendOutbound(x, ctx.orgId, { to: r.to, body: String(mods.body ?? p.body), vendorId: r.vendorId, at: nowOf(ctx) });
      await x.update(rfq).set({ status: "SENT" }).where(eq(rfq.id, p.rfqId as string));
      return { sent: recips.length };
    }
    case "NOTIFY_RECALL_CONTACTS": {
      const rcId = p.recallCaseId as string;
      await x.update(recallAffectedCustomer).set({ contactStatus: "APPROVED" }).where(eq(recallAffectedCustomer.recallCaseId, rcId));
      await x.update(recallCase).set({ status: "CONTACTS_APPROVED" }).where(eq(recallCase.id, rcId));
      const rows = await x.select({ rac: recallAffectedCustomer, c: customer }).from(recallAffectedCustomer).innerJoin(customer, eq(customer.id, recallAffectedCustomer.customerId)).where(eq(recallAffectedCustomer.recallCaseId, rcId));
      for (const r of rows) {
        const body = String(mods.body ?? p.body ?? "").replace("{customer}", r.c.name).replace("{lots}", r.rac.lotNumbers.join(", ")).replace("{kg}", Number(r.rac.quantityKg).toFixed(1));
        if (r.c.phone) await sendOutbound(x, ctx.orgId, { to: r.c.phone, body, customerId: r.c.id, at: nowOf(ctx) });
        await x.update(recallAffectedCustomer).set({ contactStatus: "CONTACTED" }).where(eq(recallAffectedCustomer.id, r.rac.id));
        await notify(x, ctx.orgId, { audience: "BUYER", customerId: r.c.id, title: "Product recall notice", body, at: nowOf(ctx) });
      }
      return { contacted: rows.length, relatedIds: [rcId] };
    }
    default:
      return { note: "No executor required." };
  }
}

/** Request approval to contact recall customers (COMPLIANCE). Never auto-sends. */
export async function requestRecallContactApproval(ctx: Ctx, recallCaseId: string, body: string) {
  const { startRun, proposeAction, finishRun } = await import("@/lib/agents/runtime");
  const run = await startRun(ctx.orgId, "TRACEABILITY", "USER", { recallCaseId });
  const [rc] = await db.select().from(recallCase).where(and(eq(recallCase.id, recallCaseId), eq(recallCase.orgId, ctx.orgId)));
  if (!rc) throw new DomainError("Recall not found", "NOT_FOUND", 404);
  const rows = await db.select({ c: customer }).from(recallAffectedCustomer).innerJoin(customer, eq(customer.id, recallAffectedCustomer.customerId)).where(eq(recallAffectedCustomer.recallCaseId, rc.id));
  const res = await db.transaction((x) =>
    proposeAction(x, run, {
      actionType: "NOTIFY_RECALL_CONTACTS",
      title: `Contact ${rows.length} customer(s) for ${rc.caseNumber}`,
      explanation: `Draft recall notice to all potentially affected customers. Nothing is sent until approved.`,
      approvalSummary: body,
      proposedAction: { recallCaseId: rc.id, body },
      affectedRecords: rows.map((r) => ({ type: "customer", id: r.c.id, label: r.c.name })),
      dedupeKey: `RECALL:${rc.id}`,
    }),
  );
  await finishRun(run, { status: "AWAITING_APPROVAL", summary: `Recall contact list for ${rc.caseNumber} awaiting approval.` });
  return res;
}
