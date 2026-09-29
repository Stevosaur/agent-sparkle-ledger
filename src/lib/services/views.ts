import type { ApprovalView } from "@/components/app/approval-card";
import type { pendingApprovals } from "./queries";

export function toApprovalView(r: Awaited<ReturnType<typeof pendingApprovals>>[number]): ApprovalView {
  return {
    id: r.a.id,
    kind: r.a.kind,
    title: r.a.title,
    summary: r.a.summary,
    riskClass: r.a.riskClass,
    requestedBy: r.a.requestedBy,
    requestedAt: r.a.requestedAt.toISOString(),
    explanation: r.act?.explanation ?? null,
    confidence: r.act?.confidence ? Number(r.act.confidence) : null,
    affected: r.act?.affectedRecords ?? [],
    payload: r.a.payload,
  };
}
