/**
 * Agents 6–9 & 11: Allocation, Surplus Clearance, Logistics, Receiving & Quality, AP Reconciliation.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { catchLot, species, vendor } from "@/lib/db/schema";
import { POLICY_LABELS, type AllocationPolicy } from "@/lib/domain/allocation";
import { assessSurplus } from "@/lib/domain/surplus";
import { addDays, atMarketTime, minutesBetween } from "@/lib/domain/time";
import { commitAllocation, previewAllocation } from "@/lib/services/allocation";
import { planDeliveryRuns } from "@/lib/services/fulfilment";
import { matchSupplierInvoice, raiseInvoiceException } from "@/lib/services/finance";
import { getMarket } from "@/lib/services/market";
import { getOrg, notify, raiseException, resolveException } from "@/lib/services/common";
import { agentCtx, type Ctx } from "@/lib/services/context";
import { audit } from "@/lib/services/audit";
import { AGENTS, finishRun, proposeAction, startRun, supersedePending, tool } from "./runtime";

// ---------------- Agent 6: Allocation ----------------
export async function runAllocationAgent(orgId: string, marketDate: string, speciesId: string, trigger: "EVENT" | "USER" | "SEED" = "EVENT", opts: { policy?: AllocationPolicy; at?: Date; triggerEventId?: string } = {}) {
  const at = opts.at ?? new Date();
  const org = await getOrg(db, orgId);
  const policy = (opts.policy ?? org.settings.defaultAllocationPolicy) as AllocationPolicy;
  const run = await startRun(orgId, "ALLOCATION", trigger, { marketDate, speciesId, policy }, { at, triggerEventId: opts.triggerEventId });
  const { result, substitutes } = await previewAllocation(orgId, marketDate, speciesId, policy);
  tool(run, "allocation_engine", true, `${result.lines.length} lines`);
  const [sp] = await db.select().from(species).where(eq(species.id, speciesId));
  if (!result.lines.length || result.totalAllocatedKg <= 0) {
    await finishRun(run, { status: "SUCCEEDED", summary: `No open ${sp?.canonicalName} demand or no available stock to allocate.`, at });
    return { runId: run.id, approvalId: null };
  }
  const approvalId = await db.transaction(async (x) => {
    const dedupeKey = `ALLOC:${marketDate}:${speciesId}:${result.lines.map((l) => `${l.lineId}=${l.allocatedKg}`).join(",")}`;
    await supersedePending(x, orgId, "CONFIRM_ALLOCATION", marketDate, speciesId, dedupeKey);
    const p = await proposeAction(x, run, {
      actionType: "CONFIRM_ALLOCATION",
      title: `Allocate ${result.totalAllocatedKg} kg ${sp?.canonicalName.toLowerCase()} (${POLICY_LABELS[policy].toLowerCase()})`,
      explanation: `${result.explanation}${substitutes.length ? ` Suggested substitutes: ${substitutes.map((s) => `${s.customerName}: ${s.suggestMinKg}–${s.suggestMaxKg} kg ${s.speciesName.toLowerCase()}`).join("; ")} (buyer confirmation required).` : ""}`,
      approvalSummary: result.lines.map((l) => `${l.customerName}: ${l.allocatedKg}/${l.requestedKg} kg${l.shortfallKg > 0 ? ` (short ${l.shortfallKg})` : ""}`).join("\n"),
      proposedAction: { marketDate, speciesId, policy, lines: result.lines.map((l) => ({ lineId: l.lineId, fromLots: l.fromLots.map((f) => ({ lotId: f.lotId, kg: f.kg })) })), substitutes },
      confidence: 0.9,
      affectedRecords: [{ type: "species", id: speciesId, label: sp?.canonicalName ?? "", href: `/procurement/allocations?species=${speciesId}` }, ...result.lines.map((l) => ({ type: "customer", id: l.customerId, label: l.customerName ?? "" }))],
      dedupeKey,
    }, at);
    if (p.autoExecute) await commitAllocation({ ...agentCtx(orgId, AGENTS.ALLOCATION, run.id), now: at }, { marketDate, speciesId, policy, lines: result.lines.map((l) => ({ lineId: l.lineId, fromLots: l.fromLots })) }, x);
    return p.duplicate ? null : p.approvalId;
  });
  await finishRun(run, { status: approvalId ? "AWAITING_APPROVAL" : "SUCCEEDED", summary: approvalId ? `Proposed ${sp?.canonicalName} allocation: ${result.explanation}` : `${sp?.canonicalName}: allocation plan unchanged — existing proposal still pending.`, output: { result, substitutes }, at: new Date(at.getTime() + 1200) });
  return { runId: run.id, approvalId };
}

// ---------------- Agent 7: Surplus clearance ----------------
export async function runSurplusAgent(orgId: string, marketDate: string, trigger: "SCHEDULE" | "USER" | "EVENT" | "SEED" = "USER", at: Date = new Date()) {
  const org = await getOrg(db, orgId);
  const run = await startRun(orgId, "SURPLUS", trigger, { marketDate }, { at });
  const rows = await getMarket(orgId, marketDate);
  const cutoff = atMarketTime(marketDate, org.settings.dispatchCutoff);
  const minutesToCutoff = Math.max(0, minutesBetween(at, cutoff));
  const alerts: string[] = [];
  for (const row of rows) {
    const unallocated = row.availableKg;
    if (unallocated - row.unallocatedDemandKg < 3) continue;
    const [sp] = await db.select().from(species).where(eq(species.id, row.speciesId));
    const lapsed = await db.execute(sql`
      SELECT c.id, c.name, AVG(sol.requested_kg) AS avg_kg FROM sales_order_line sol JOIN sales_order so ON so.id = sol.sales_order_id JOIN customer c ON c.id = so.customer_id
      WHERE so.org_id = ${orgId} AND sol.species_id = ${row.speciesId} AND so.market_date >= ${addDays(marketDate, -30)} AND so.market_date < ${marketDate}
        AND NOT EXISTS (SELECT 1 FROM sales_order s2 JOIN sales_order_line l2 ON l2.sales_order_id = s2.id WHERE s2.customer_id = c.id AND s2.market_date = ${marketDate} AND l2.species_id = ${row.speciesId})
      GROUP BY c.id, c.name ORDER BY avg_kg DESC LIMIT 6`);
    const a = assessSurplus({
      speciesId: row.speciesId, speciesName: row.name, unallocatedKg: unallocated, openDemandKg: row.unallocatedDemandKg, minutesToCutoff,
      freshnessHoursRemaining: Math.max(0, (sp?.freshnessHours ?? 48) - 6), costPerKg: row.wavgCost, listPricePerKg: row.indicativeSell ?? (row.wavgCost ?? 0) * 1.25,
      maxDiscountPct: org.settings.surplusDiscountFloorPct, lapsedBuyers: (lapsed.rows as { id: string; name: string; avg_kg: string }[]).map((l) => ({ customerId: l.id, name: l.name, avgKg: Number(l.avg_kg) })),
    });
    if (a.severity === "NONE") {
      await resolveException(db, orgId, `SURPLUS:${marketDate}:${row.speciesId}`, AGENTS.SURPLUS, "No longer at risk.", at);
      continue;
    }
    alerts.push(`${row.name} ${a.atRiskKg} kg`);
    await db.transaction(async (x) => {
      await raiseException(x, orgId, { type: "SURPLUS", severity: a.severity === "CRITICAL" ? "HIGH" : "MEDIUM", title: `SURPLUS ALERT: ${a.atRiskKg} kg ${row.name.toLowerCase()} at risk`, detail: a.explanation, entityType: "species", entityId: row.speciesId, href: `/market/${row.speciesId}`, dedupeKey: `SURPLUS:${marketDate}:${row.speciesId}`, at });
      const disc = a.actions.find((z) => z.type === "DISCOUNT");
      const offer = a.actions.find((z) => z.type === "OFFER_EXISTING_BUYERS");
      if (disc && disc.type === "DISCOUNT") {
        const recipients = offer && offer.type === "OFFER_EXISTING_BUYERS" ? offer.customers : [];
        await proposeAction(x, run, {
          actionType: "APPLY_DISCOUNT",
          title: `Clear ${a.atRiskKg} kg ${row.name.toLowerCase()} at S$${disc.toPrice.toFixed(2)}/kg`,
          explanation: `${a.explanation} Proposed ${disc.discountPct}% off (S$${disc.fromPrice.toFixed(2)} → S$${disc.toPrice.toFixed(2)}), never below floor S$${disc.floorPrice.toFixed(2)}. ${recipients.length ? `Offer to recent buyers: ${recipients.map((r) => `${r.name} ~${r.suggestKg} kg`).join(", ")}.` : ""}`,
          approvalSummary: `Discounted flash offer\n${row.name}: ${a.atRiskKg} kg at S$${disc.toPrice.toFixed(2)}/kg (floor S$${disc.floorPrice.toFixed(2)})\nRecipients: ${recipients.map((r) => r.name).join(", ") || "none"}`,
          proposedAction: { marketDate, speciesId: row.speciesId, kg: a.atRiskKg, toPrice: disc.toPrice, floorPrice: disc.floorPrice, recipients },
          confidence: 0.8,
          affectedRecords: [{ type: "species", id: row.speciesId, label: row.name, href: `/market/${row.speciesId}` }, ...recipients.map((r) => ({ type: "customer", id: r.customerId, label: r.name }))],
          dedupeKey: `SURPLUS:${marketDate}:${row.speciesId}`,
        }, at);
      }
      await notify(x, orgId, { audience: "PROCUREMENT", title: `${a.atRiskKg} kg ${row.name.toLowerCase()} likely to go unsold`, body: a.explanation, href: "/ai/approvals", at });
    });
  }
  await finishRun(run, { status: alerts.length ? "AWAITING_APPROVAL" : "SUCCEEDED", summary: alerts.length ? `Surplus at risk: ${alerts.join(", ")}.` : "No material surplus detected.", at: new Date(at.getTime() + 1000) });
  return { runId: run.id, alerts };
}

// ---------------- Agent 8: Logistics ----------------
export async function runLogisticsAgent(ctx: Ctx, marketDate: string, departureLocal = "05:00") {
  const run = await startRun(ctx.orgId, "LOGISTICS", "USER", { marketDate, departureLocal }, { at: ctx.now });
  try {
    const res = await planDeliveryRuns({ ...ctx, actor: { type: "AGENT", id: AGENTS.LOGISTICS, label: AGENTS.LOGISTICS }, source: "AGENT", agentRunId: run.id }, marketDate, departureLocal);
    tool(run, res.provider, true, res.estimated ? "estimated drive times" : "road network");
    await db.transaction((x) =>
      proposeAction(x, run, {
        actionType: "PLAN_ROUTES",
        title: `Planned ${res.shipmentIds.length} delivery run(s)`,
        explanation: `Capacity-aware sweep + time-window ordering using ${res.provider}${res.estimated ? " (straight-line estimates — MOCK)" : ""}.${res.unassigned.length ? ` Unassigned: ${res.unassigned.join(", ")}.` : ""}`,
        proposedAction: { shipmentIds: res.shipmentIds },
        affectedRecords: res.shipmentIds.map((id) => ({ type: "shipment", id, label: "Delivery run", href: "/operations/routes" })),
      }, ctx.now),
    );
    await finishRun(run, { status: "SUCCEEDED", summary: `Routes generated: ${res.shipmentIds.length} run(s).`, output: res, at: ctx.now });
    return res;
  } catch (e) {
    await finishRun(run, { status: "FAILED", summary: "Route planning failed", error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

// ---------------- Agent 9: Receiving & Quality ----------------
export async function runReceivingQualityAgent(orgId: string, lotId: string, triggerEventId?: string, at: Date = new Date()) {
  const run = await startRun(orgId, "RECEIVING_QUALITY", "EVENT", { lotId }, { triggerEventId, at });
  const org = await getOrg(db, orgId);
  const [lot] = await db.select().from(catchLot).where(eq(catchLot.id, lotId));
  const [v] = lot.vendorId ? await db.select().from(vendor).where(eq(vendor.id, lot.vendorId)) : [];
  const declared = Number(lot.quantityDeclaredKg);
  const received = Number(lot.quantityReceivedKg ?? 0);
  const variancePct = declared ? Math.round(((received - declared) / declared) * 1000) / 10 : 0;
  const findings: string[] = [];
  await db.transaction(async (x) => {
    if (variancePct <= -org.settings.weightVarianceAlertPct) {
      findings.push(`${Math.abs(variancePct)}% under declared weight`);
      await raiseException(x, orgId, { type: "WEIGHT_VARIANCE", severity: variancePct <= -10 ? "HIGH" : "MEDIUM", title: `${v?.name ?? "Supplier"} delivered ${Math.abs(variancePct)}% less than declared`, detail: `${lot.lotNumber}: ${declared.toFixed(1)} kg declared, ${received.toFixed(1)} kg weighed. Feeds vendor scorecard; check supplier invoice bills the received weight.`, entityType: "catch_lot", entityId: lot.id, href: `/supply/lots/${lot.id}`, dedupeKey: `VAR:${lot.id}`, at });
    }
    if (lot.temperatureAtReceivingC !== null && Number(lot.temperatureAtReceivingC) > org.settings.receivingTempMaxC) {
      findings.push(`temperature ${lot.temperatureAtReceivingC}°C`);
      await raiseException(x, orgId, { type: "TEMPERATURE", severity: "HIGH", title: `Temperature exception on ${lot.lotNumber}`, detail: `Received at ${lot.temperatureAtReceivingC}°C (limit ${org.settings.receivingTempMaxC}°C). Inspect, re-ice and consider rejection/credit.`, entityType: "catch_lot", entityId: lot.id, href: `/supply/lots/${lot.id}`, dedupeKey: `TEMP:${lot.id}`, at });
      await notify(x, orgId, { audience: "OPERATIONS", title: `Temperature exception: ${lot.lotNumber}`, body: `${lot.temperatureAtReceivingC}°C at receiving.`, href: `/supply/lots/${lot.id}`, at });
    }
    if (lot.originalEta && lot.receivedTime && minutesBetween(lot.originalEta, lot.receivedTime) > 45) findings.push(`${minutesBetween(lot.originalEta, lot.receivedTime)} min late`);
    if (Number(lot.quantityRejectedKg) > 0) findings.push(`${Number(lot.quantityRejectedKg).toFixed(1)} kg rejected`);
    await proposeAction(x, run, {
      actionType: "RAISE_EXCEPTION",
      title: `Receiving check ${lot.lotNumber}`,
      explanation: findings.length ? `Variances recorded against ${v?.name}: ${findings.join("; ")}.` : `Within tolerance (${variancePct > 0 ? "+" : ""}${variancePct}% weight).`,
      proposedAction: { lotId, variancePct, findings },
      affectedRecords: [{ type: "catch_lot", id: lot.id, label: lot.lotNumber, href: `/supply/lots/${lot.id}` }, ...(v ? [{ type: "vendor", id: v.id, label: v.name, href: `/vendors/${v.id}` }] : [])],
    }, at);
  });
  await finishRun(run, { status: "SUCCEEDED", summary: findings.length ? `${lot.lotNumber}: ${findings.join("; ")}.` : `${lot.lotNumber} within tolerance.`, at });
  return { findings, variancePct };
}

// ---------------- Agent 11: AP reconciliation ----------------
export async function runApReconciliation(orgId: string, supplierInvoiceId: string, triggerEventId?: string, at: Date = new Date()) {
  const run = await startRun(orgId, "AP_RECONCILIATION", "EVENT", { supplierInvoiceId }, { triggerEventId, at });
  const out = await db.transaction(async (x) => {
    const { result, invoice, vendorName } = await matchSupplierInvoice(x, orgId, supplierInvoiceId);
    tool(run, "three_way_match", true, result.status);
    const ctx = { ...agentCtx(orgId, AGENTS.AP_RECONCILIATION, run.id), now: at };
    await audit(x, ctx, { action: "INVOICE_MATCHED", entityType: "supplier_invoice", entityId: invoice.id, summary: `Three-way match: ${result.status.replaceAll("_", " ").toLowerCase()} — ${result.summary}`, relatedIds: [invoice.purchaseOrderId ?? ""].filter(Boolean), at });
    if (result.status === "EXCEPTION") {
      await raiseInvoiceException(x, orgId, invoice, vendorName, result);
      await proposeAction(x, run, {
        actionType: "APPROVE_INVOICE_EXCEPTION",
        title: `Invoice ${invoice.invoiceNumber} (${vendorName}): ${result.summary.split(";")[0]}`,
        explanation: `${result.summary}. Recommended: request a credit note for S$${result.potentialOverbillingIncGst} incl. GST, or approve the exception with a reason.`,
        approvalSummary: result.lines.map((l) => `${l.description}: billed ${Number(l.billedKg).toFixed(1)} kg, received ${Number(l.receivedKg).toFixed(1)} kg, variance S$${l.amountVariance}`).join("\n"),
        proposedAction: { supplierInvoiceId: invoice.id, overbillingExGst: result.potentialOverbillingExGst },
        confidence: 0.97,
        affectedRecords: [{ type: "supplier_invoice", id: invoice.id, label: invoice.invoiceNumber, href: `/finance/reconciliation/${invoice.id}` }],
        dedupeKey: `INVEXC:${invoice.id}`,
      }, at);
    } else {
      await proposeAction(x, run, { actionType: "THREE_WAY_MATCH", title: `Invoice ${invoice.invoiceNumber} matched`, explanation: result.summary, proposedAction: { supplierInvoiceId: invoice.id, status: result.status }, affectedRecords: [{ type: "supplier_invoice", id: invoice.id, label: invoice.invoiceNumber, href: `/finance/reconciliation/${invoice.id}` }] }, at);
    }
    return result;
  });
  await finishRun(run, { status: out.status === "EXCEPTION" ? "AWAITING_APPROVAL" : "SUCCEEDED", summary: `Three-way match ${out.status.replaceAll("_", " ").toLowerCase()}: ${out.summary}`, output: { status: out.status }, at: new Date(at.getTime() + 800) });
  return out;
}
