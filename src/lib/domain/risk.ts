/**
 * Agent safety architecture: every agent action is classified, and the class decides whether a
 * human must approve it. Automation rules can only relax EXTERNAL_COMMUNICATION (templated) and
 * explicitly configured commercial thresholds — never FINANCIAL or COMPLIANCE.
 */
export type RiskClass = "READ_ONLY" | "LOW_RISK_WRITE" | "COMMERCIAL_COMMITMENT" | "FINANCIAL" | "EXTERNAL_COMMUNICATION" | "COMPLIANCE";

export const RISK_LABELS: Record<RiskClass, string> = {
  READ_ONLY: "Read only",
  LOW_RISK_WRITE: "Low-risk write",
  COMMERCIAL_COMMITMENT: "Commercial commitment",
  FINANCIAL: "Financial",
  EXTERNAL_COMMUNICATION: "External communication",
  COMPLIANCE: "Compliance",
};

export const ACTION_RISK: Record<string, RiskClass> = {
  ANSWER_QUERY: "READ_ONLY",
  EXPLAIN_FORECAST: "READ_ONLY",
  CREATE_DRAFT_LOT: "LOW_RISK_WRITE",
  MAP_SPECIES_ALIAS: "LOW_RISK_WRITE",
  GENERATE_FORECAST: "LOW_RISK_WRITE",
  RAISE_EXCEPTION: "LOW_RISK_WRITE",
  PROPOSE_ALLOCATION: "LOW_RISK_WRITE",
  PLAN_ROUTES: "LOW_RISK_WRITE",
  UPDATE_QUOTE_FROM_REPLY: "LOW_RISK_WRITE",
  COMPUTE_SCORECARD: "READ_ONLY",
  THREE_WAY_MATCH: "LOW_RISK_WRITE",
  TRACE_LOT: "READ_ONLY",
  CREATE_PURCHASE_ORDER: "COMMERCIAL_COMMITMENT",
  CONFIRM_ALLOCATION: "COMMERCIAL_COMMITMENT",
  ACCEPT_QUOTE: "COMMERCIAL_COMMITMENT",
  APPLY_DISCOUNT: "COMMERCIAL_COMMITMENT",
  CONFIRM_SUBSTITUTION: "COMMERCIAL_COMMITMENT",
  APPROVE_INVOICE_EXCEPTION: "FINANCIAL",
  APPROVE_PAYMENT: "FINANCIAL",
  ISSUE_CREDIT_NOTE: "FINANCIAL",
  SEND_RFQ: "EXTERNAL_COMMUNICATION",
  SEND_SUPPLIER_ACK: "EXTERNAL_COMMUNICATION",
  SEND_FLASH_OFFER: "EXTERNAL_COMMUNICATION",
  SEND_BUYER_CONFIRMATION: "EXTERNAL_COMMUNICATION",
  NOTIFY_RECALL_CONTACTS: "COMPLIANCE",
  OPEN_RECALL: "COMPLIANCE",
  PLACE_LOT_HOLD: "COMPLIANCE",
};

export type AutomationRuleState = { key: string; enabled: boolean; params: Record<string, unknown> };

/** Decide whether an action needs human approval. */
export function requiresApproval(actionType: string, ctx: { rules?: AutomationRuleState[]; amount?: number } = {}): { required: boolean; riskClass: RiskClass; reason: string } {
  const riskClass = ACTION_RISK[actionType] ?? "COMMERCIAL_COMMITMENT";
  const rule = (k: string) => ctx.rules?.find((r) => r.key === k && r.enabled);
  switch (riskClass) {
    case "READ_ONLY":
      return { required: false, riskClass, reason: "Read-only actions run automatically." };
    case "LOW_RISK_WRITE":
      return { required: false, riskClass, reason: "Reversible low-risk write; runs automatically and is audited." };
    case "EXTERNAL_COMMUNICATION": {
      const r = rule("AUTO_TEMPLATED_MESSAGES");
      const templated = (r?.params?.actions as string[] | undefined)?.includes(actionType);
      return templated
        ? { required: false, riskClass, reason: "Templated message automation enabled by the organisation." }
        : { required: true, riskClass, reason: "Outbound messages need approval unless templated automation is enabled." };
    }
    case "COMMERCIAL_COMMITMENT": {
      const r = rule("AUTO_PO_UNDER_LIMIT");
      const limit = Number(r?.params?.maxAmount ?? 0);
      if (actionType === "CREATE_PURCHASE_ORDER" && r && ctx.amount !== undefined && ctx.amount <= limit) {
        return { required: false, riskClass, reason: `Auto-PO rule: under S$${limit.toFixed(0)} limit set by the organisation.` };
      }
      return { required: true, riskClass, reason: "Commercial commitments require human approval (AI recommends → human approves → system executes)." };
    }
    case "FINANCIAL":
      return { required: true, riskClass, reason: "Financial actions always require approval." };
    case "COMPLIANCE":
      return { required: true, riskClass, reason: "Compliance actions always require approval." };
  }
}
