/** Execution context passed to every service call: which tenant, and who (human, agent, system) is acting. */
export type Actor = { type: "USER" | "AGENT" | "SYSTEM" | "INTEGRATION"; id: string | null; label: string };
export type Source = "WEB" | "MOBILE" | "WHATSAPP" | "API" | "AGENT" | "SEED" | "SYSTEM";
export type Ctx = { orgId: string; actor: Actor; source: Source; agentRunId?: string | null; now?: Date };

export const systemCtx = (orgId: string, label = "System"): Ctx => ({ orgId, actor: { type: "SYSTEM", id: null, label }, source: "SYSTEM" });
export const agentCtx = (orgId: string, agentLabel: string, agentRunId: string | null): Ctx => ({
  orgId,
  actor: { type: "AGENT", id: agentLabel, label: agentLabel },
  source: "AGENT",
  agentRunId,
});
export const nowOf = (ctx: Ctx) => ctx.now ?? new Date();

export class DomainError extends Error {
  constructor(message: string, public code: string = "DOMAIN_ERROR", public status = 400) {
    super(message);
  }
}
