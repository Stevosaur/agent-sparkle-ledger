/**
 * Allocation: preview (pure engine over live data) and commit (transactional, lock-protected so a lot can
 * never be double-allocated or driven negative).
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { allocation, catchLot, customer, inventoryMovement, salesOrder, salesOrderLine, species } from "@/lib/db/schema";
import { allocate, suggestSubstitutes, type AllocationPolicy, type AllocationResult, type SubstituteSuggestion } from "@/lib/domain/allocation";
import { D, toKgStr } from "@/lib/domain/decimal";
import { audit } from "./audit";
import { DomainError, nowOf, type Ctx } from "./context";
import { notify } from "./common";
import { emit } from "@/lib/events/bus";

const ALLOCATABLE = ["AVAILABLE", "PARTIALLY_ALLOCATED", "INSPECTED", "RECEIVED"] as const;

export async function loadAllocationInputs(x: Executor, orgId: string, marketDate: string, speciesId: string) {
  const lots = await x
    .select()
    .from(catchLot)
    .where(and(eq(catchLot.orgId, orgId), eq(catchLot.marketDate, marketDate), eq(catchLot.speciesId, speciesId), inArray(catchLot.status, [...ALLOCATABLE]), sql`${catchLot.quantityAvailableKg} > 0`))
    .orderBy(asc(catchLot.receivedTime));
  const lines = await x
    .select({ sol: salesOrderLine, so: salesOrder, c: customer })
    .from(salesOrderLine)
    .innerJoin(salesOrder, eq(salesOrder.id, salesOrderLine.salesOrderId))
    .innerJoin(customer, eq(customer.id, salesOrder.customerId))
    .where(and(eq(salesOrder.orgId, orgId), eq(salesOrder.marketDate, marketDate), eq(salesOrderLine.speciesId, speciesId), inArray(salesOrder.status, ["CONFIRMED", "PARTIALLY_ALLOCATED", "ALLOCATED"]), sql`${salesOrderLine.requestedKg} > ${salesOrderLine.allocatedKg}`));
  return { lots, lines };
}

export async function previewAllocation(orgId: string, marketDate: string, speciesId: string, policy: AllocationPolicy, manualRanks?: Record<string, number>) {
  const { lots, lines } = await loadAllocationInputs(db, orgId, marketDate, speciesId);
  const result = allocate(
    policy,
    lots.map((l) => ({ lotId: l.id, lotNumber: l.lotNumber, availableKg: l.quantityAvailableKg, costPerKg: l.agreedCostPerKg, receivedAt: l.receivedTime })),
    lines.map(({ sol, so, c }) => ({
      lineId: sol.id,
      customerId: c.id,
      customerName: c.name,
      requestedKg: D(sol.requestedKg).minus(D(sol.allocatedKg)).toNumber(),
      priorityTier: c.priorityTier,
      confirmedAt: so.confirmedAt,
      pricePerKg: sol.pricePerKg,
      manualRank: manualRanks?.[sol.id],
    })),
  );
  const substitutes = await substituteSuggestions(orgId, marketDate, speciesId, result);
  return { result, substitutes, lots, lines };
}

async function substituteSuggestions(orgId: string, marketDate: string, speciesId: string, result: AllocationResult): Promise<SubstituteSuggestion[]> {
  if (result.totalShortfallKg < 0.5) return [];
  const [sp] = await db.select().from(species).where(eq(species.id, speciesId));
  if (!sp?.substituteCodes.length) return [];
  const subs = await db.select().from(species).where(and(eq(species.orgId, orgId), inArray(species.code, sp.substituteCodes)));
  const pool: { speciesId: string; speciesName: string; availableKg: number }[] = [];
  for (const s of subs) {
    const r = await db.execute(sql`
      SELECT COALESCE(SUM(l.quantity_available_kg),0) AS avail,
        (SELECT COALESCE(SUM(sol.requested_kg - sol.allocated_kg),0) FROM sales_order_line sol JOIN sales_order so ON so.id = sol.sales_order_id
          WHERE so.org_id = ${orgId} AND so.market_date = ${marketDate} AND sol.species_id = ${s.id} AND so.status NOT IN ('CANCELLED','DRAFT')) AS open_demand
      FROM catch_lot l WHERE l.org_id = ${orgId} AND l.market_date = ${marketDate} AND l.species_id = ${s.id} AND l.status IN ('AVAILABLE','PARTIALLY_ALLOCATED')`);
    const row = r.rows[0] as { avail: string; open_demand: string };
    const free = Number(row.avail) - Number(row.open_demand);
    if (free > 0.5) pool.push({ speciesId: s.id, speciesName: s.canonicalName, availableKg: Math.round(free * 10) / 10 });
  }
  return suggestSubstitutes(result, pool);
}

/** Commit an allocation plan. Re-validates availability under row locks; fails rather than over-allocating. */
export async function commitAllocation(ctx: Ctx, plan: { marketDate: string; speciesId: string; policy: AllocationPolicy; lines: { lineId: string; fromLots: { lotId: string; kg: number }[] }[] }, x0?: Executor) {
  const run = async (x: Executor) => {
    const at = nowOf(ctx);
    const lotIds = [...new Set(plan.lines.flatMap((l) => l.fromLots.map((f) => f.lotId)))];
    if (!lotIds.length) throw new DomainError("Nothing to allocate.");
    await x.execute(sql`SELECT id FROM catch_lot WHERE org_id = ${ctx.orgId} AND id IN (${sql.join(lotIds.map((id) => sql`${id}`), sql`, `)}) ORDER BY id FOR UPDATE`);
    const lots = new Map((await x.select().from(catchLot).where(inArray(catchLot.id, lotIds))).map((l) => [l.id, { ...l, avail: D(l.quantityAvailableKg), alloc: D(l.quantityAllocatedKg) }]));
    const lineIds = plan.lines.map((l) => l.lineId);
    await x.execute(sql`SELECT id FROM sales_order_line WHERE org_id = ${ctx.orgId} AND id IN (${sql.join(lineIds.map((id) => sql`${id}`), sql`, `)}) ORDER BY id FOR UPDATE`);
    const solRows = await x.select({ sol: salesOrderLine, so: salesOrder, c: customer }).from(salesOrderLine).innerJoin(salesOrder, eq(salesOrder.id, salesOrderLine.salesOrderId)).innerJoin(customer, eq(customer.id, salesOrder.customerId)).where(inArray(salesOrderLine.id, lineIds));
    const sols = new Map(solRows.map((r) => [r.sol.id, r]));
    const created: string[] = [];
    const [sp] = await x.select().from(species).where(eq(species.id, plan.speciesId));

    for (const line of plan.lines) {
      const s = sols.get(line.lineId);
      if (!s) throw new DomainError("Order line not found");
      if (s.sol.speciesId !== plan.speciesId) throw new DomainError("Species mismatch");
      let lineTotal = D(0);
      for (const f of line.fromLots) {
        if (f.kg <= 0) continue;
        const lot = lots.get(f.lotId);
        if (!lot || lot.orgId !== ctx.orgId) throw new DomainError("Lot not found");
        const kg = D(f.kg);
        if (kg.gt(lot.avail)) throw new DomainError(`${lot.lotNumber} has only ${lot.avail.toFixed(1)} kg available — allocation refreshed elsewhere. Re-run the preview.`, "OVER_ALLOCATION", 409);
        lot.avail = lot.avail.minus(kg);
        lot.alloc = lot.alloc.plus(kg);
        lineTotal = lineTotal.plus(kg);
        const [a] = await x
          .insert(allocation)
          .values({ orgId: ctx.orgId, lotId: lot.id, salesOrderLineId: line.lineId, quantityKg: toKgStr(kg), status: "CONFIRMED", policy: plan.policy, agentRunId: ctx.agentRunId ?? null, confirmedBy: ctx.actor.label, createdAt: at })
          .returning({ id: allocation.id });
        created.push(a.id);
        await x.insert(inventoryMovement).values({ orgId: ctx.orgId, lotId: lot.id, type: "ALLOCATE", quantityKg: toKgStr(kg.neg()), availableAfterKg: toKgStr(lot.avail), refType: "allocation", refId: a.id, actor: ctx.actor.label, at });
        await audit(x, ctx, { action: "LOT_ALLOCATED", entityType: "catch_lot", entityId: lot.id, summary: `Allocated ${kg.toFixed(1)} kg to ${s.c.name} (${s.so.soNumber}).`, relatedIds: [s.so.id, s.c.id, a.id], at });
      }
      const remaining = D(s.sol.requestedKg).minus(D(s.sol.allocatedKg));
      if (lineTotal.gt(remaining)) throw new DomainError(`Allocation exceeds ${s.c.name}'s open quantity.`, "OVER_ALLOCATION", 409);
      if (lineTotal.gt(0)) {
        await x.update(salesOrderLine).set({ allocatedKg: sql`${salesOrderLine.allocatedKg} + ${toKgStr(lineTotal)}` }).where(eq(salesOrderLine.id, line.lineId));
        await notify(x, ctx.orgId, { audience: "BUYER", customerId: s.c.id, title: "Allocation confirmed", body: `Your ${lineTotal.toFixed(1)} kg ${sp?.canonicalName.toLowerCase()} allocation is confirmed (${s.so.soNumber}).`, href: `/orders/${s.so.id}`, at });
      }
    }
    for (const lot of lots.values()) {
      if (lot.avail.lt(0)) throw new DomainError("Negative inventory prevented.", "NEGATIVE_INVENTORY", 409);
      const status = lot.avail.isZero() ? "ALLOCATED" : lot.alloc.gt(0) ? "PARTIALLY_ALLOCATED" : lot.status;
      await x.update(catchLot).set({ quantityAvailableKg: toKgStr(lot.avail), quantityAllocatedKg: toKgStr(lot.alloc), status }).where(eq(catchLot.id, lot.id));
    }
    const soIds = [...new Set(solRows.map((r) => r.so.id))];
    await refreshOrderStatuses(x, soIds);
    for (const soId of soIds) {
      const r = solRows.find((s) => s.so.id === soId)!;
      await audit(x, ctx, { action: "ORDER_ALLOCATED", entityType: "sales_order", entityId: soId, summary: `${sp?.canonicalName} allocated under ${plan.policy.replace("_", " ").toLowerCase()} policy.`, relatedIds: [r.c.id], at });
    }
    await emit(x, ctx.orgId, "LOT_ALLOCATED", { marketDate: plan.marketDate, speciesId: plan.speciesId, allocationIds: created }, { at: nowOf(ctx) });
    return { allocationIds: created };
  };
  return x0 ? run(x0) : db.transaction(run);
}

export async function refreshOrderStatuses(x: Executor, soIds: string[]) {
  for (const id of soIds) {
    const r = await x.execute(sql`SELECT SUM(requested_kg) AS req, SUM(allocated_kg) AS alloc FROM sales_order_line WHERE sales_order_id = ${id}`);
    const row = r.rows[0] as { req: string; alloc: string };
    const [so] = await x.select({ status: salesOrder.status }).from(salesOrder).where(eq(salesOrder.id, id));
    if (!so || !["CONFIRMED", "PARTIALLY_ALLOCATED", "ALLOCATED"].includes(so.status)) continue;
    const status = D(row.alloc).isZero() ? "CONFIRMED" : D(row.alloc).gte(D(row.req)) ? "ALLOCATED" : "PARTIALLY_ALLOCATED";
    await x.update(salesOrder).set({ status }).where(eq(salesOrder.id, id));
  }
}

/** Release a confirmed (unpicked) allocation back to available stock. */
export async function releaseAllocation(ctx: Ctx, allocationId: string) {
  return db.transaction(async (x) => {
    const [a] = await x.select().from(allocation).where(and(eq(allocation.id, allocationId), eq(allocation.orgId, ctx.orgId)));
    if (!a) throw new DomainError("Allocation not found", "NOT_FOUND", 404);
    if (a.status !== "CONFIRMED" && a.status !== "PROPOSED") throw new DomainError("Only unpicked allocations can be released.");
    await x.execute(sql`SELECT id FROM catch_lot WHERE id = ${a.lotId} FOR UPDATE`);
    const [lot] = await x.select().from(catchLot).where(eq(catchLot.id, a.lotId));
    const avail = D(lot.quantityAvailableKg).plus(D(a.quantityKg));
    const alloc = D(lot.quantityAllocatedKg).minus(D(a.quantityKg));
    await x.update(catchLot).set({ quantityAvailableKg: toKgStr(avail), quantityAllocatedKg: toKgStr(alloc), status: alloc.isZero() ? "AVAILABLE" : "PARTIALLY_ALLOCATED" }).where(eq(catchLot.id, lot.id));
    await x.update(allocation).set({ status: "RELEASED" }).where(eq(allocation.id, a.id));
    await x.update(salesOrderLine).set({ allocatedKg: sql`${salesOrderLine.allocatedKg} - ${a.quantityKg}` }).where(eq(salesOrderLine.id, a.salesOrderLineId));
    await x.insert(inventoryMovement).values({ orgId: ctx.orgId, lotId: lot.id, type: "DEALLOCATE", quantityKg: a.quantityKg, availableAfterKg: toKgStr(avail), refType: "allocation", refId: a.id, actor: ctx.actor.label, at: nowOf(ctx) });
    const [sol] = await x.select().from(salesOrderLine).where(eq(salesOrderLine.id, a.salesOrderLineId));
    await refreshOrderStatuses(x, [sol.salesOrderId]);
    await audit(x, ctx, { action: "ALLOCATION_RELEASED", entityType: "catch_lot", entityId: lot.id, summary: `Released ${D(a.quantityKg).toFixed(1)} kg back to stock.`, relatedIds: [sol.salesOrderId] });
  });
}
