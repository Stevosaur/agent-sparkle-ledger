import { eq, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { notification, opsException, organization, type OrgSettings } from "@/lib/db/schema";

export const DEFAULT_SETTINGS: Required<OrgSettings> = {
  dispatchCutoff: "06:00",
  marketOpens: "22:00",
  defaultAllocationPolicy: "PRIORITY",
  procurementWeights: { price: 0.35, reliability: 0.25, quality: 0.15, freshness: 0.1, eta: 0.1, relationship: 0.05 },
  invoiceTolerance: { qtyPct: 1, pricePct: 0.5, amountAbs: 5 },
  weightVarianceAlertPct: 5,
  receivingTempMaxC: 4,
  surplusDiscountFloorPct: 15,
  demoClockOffsetMs: 0,
};

/** Operational "now" for an organisation (real time, or the labelled demo clock for DEMO workspaces). */
export function orgNow(org: { isDemo: boolean; settings: OrgSettings | null }): Date {
  const off = org.isDemo ? Number(org.settings?.demoClockOffsetMs ?? 0) : 0;
  return new Date(Date.now() + off);
}

export async function getOrg(x: Executor, orgId: string) {
  const [o] = await x.select().from(organization).where(eq(organization.id, orgId));
  if (!o) throw new Error("Organisation not found");
  return { ...o, settings: { ...DEFAULT_SETTINGS, ...(o.settings ?? {}) } as Required<OrgSettings> };
}

/** Upsert an operational exception (deduplicated so repeated agent runs don't spam the inbox). */
export async function raiseException(
  x: Executor,
  orgId: string,
  e: { type: (typeof opsException.$inferInsert)["type"]; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; title: string; detail: string; entityType?: string; entityId?: string; href?: string; dedupeKey: string; at?: Date },
) {
  await x
    .insert(opsException)
    .values({ orgId, type: e.type, severity: e.severity, title: e.title, detail: e.detail, entityType: e.entityType ?? null, entityId: e.entityId ?? null, href: e.href ?? null, dedupeKey: e.dedupeKey, openedAt: e.at ?? new Date() })
    .onConflictDoUpdate({
      target: [opsException.orgId, opsException.dedupeKey],
      set: { title: e.title, detail: e.detail, severity: e.severity, href: e.href ?? null },
      where: sql`${opsException.status} <> 'RESOLVED'`,
    });
}

export async function notify(
  x: Executor,
  orgId: string,
  n: { audience: (typeof notification.$inferInsert)["audience"]; title: string; body: string; href?: string; vendorId?: string; customerId?: string; channel?: "IN_APP" | "WHATSAPP" | "SMS" | "EMAIL"; status?: (typeof notification.$inferInsert)["status"]; at?: Date },
) {
  await x.insert(notification).values({
    orgId,
    audience: n.audience,
    title: n.title,
    body: n.body,
    href: n.href ?? null,
    vendorId: n.vendorId ?? null,
    customerId: n.customerId ?? null,
    channel: n.channel ?? "IN_APP",
    status: n.status ?? "UNREAD",
    createdAt: n.at ?? new Date(),
  });
}

/** Close an open exception when the underlying condition has cleared. */
export async function resolveException(x: Executor, orgId: string, dedupeKey: string, by: string, note: string, at?: Date) {
  await x
    .update(opsException)
    .set({ status: "RESOLVED", resolvedAt: at ?? new Date(), resolvedBy: by, resolutionNote: note })
    .where(sql`${opsException.orgId} = ${orgId} AND ${opsException.dedupeKey} = ${dedupeKey} AND ${opsException.status} <> 'RESOLVED'`);
}
