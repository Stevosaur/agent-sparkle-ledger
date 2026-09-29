/**
 * Agent 4 — Procurement, and Agent 5 — Supplier RFQ.
 * AI RECOMMENDS → HUMAN APPROVES → SYSTEM EXECUTES. Never places a PO without an approval unless the
 * organisation has explicitly enabled the AUTO_PO_UNDER_LIMIT automation rule.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { message, quote, quoteLine, rfq, species, vendor } from "@/lib/db/schema";
import { recommendPurchases } from "@/lib/domain/procurement";
import { atMarketTime, fmtTime } from "@/lib/domain/time";
import { parseCatchMessage } from "@/lib/domain/intake-parser";
import { getMarket } from "@/lib/services/market";
import { createPurchaseOrder, openOffers } from "@/lib/services/procurement";
import { getOrg, notify, raiseException, resolveException } from "@/lib/services/common";
import { agentCtx } from "@/lib/services/context";
import { audit } from "@/lib/services/audit";
import { nextSeq } from "@/lib/services/sequence";
import { speciesDictionary } from "@/lib/services/dictionaries";
import { emit } from "@/lib/events/bus";
import { toKgStr, toPriceStr } from "@/lib/domain/decimal";
import { AGENTS, finishRun, proposeAction, recentlyRan, startRun, supersedePending, tool } from "./runtime";

export async function runProcurementAgent(orgId: string, marketDate: string, trigger: "EVENT" | "USER" | "SCHEDULE" | "SEED" = "USER", opts: { at?: Date; triggerEventId?: string; speciesId?: string } = {}) {
  const at = opts.at ?? new Date();
  if (trigger === "EVENT" && (await recentlyRan(orgId, "PROCUREMENT", at, { marketDate, speciesId: opts.speciesId ?? null }))) return { runId: null, proposals: [] };
  const run = await startRun(orgId, "PROCUREMENT", trigger, { marketDate, speciesId: opts.speciesId ?? null }, { at, triggerEventId: opts.triggerEventId });
  const org = await getOrg(db, orgId);
  const rows = (await getMarket(orgId, marketDate)).filter((r) => !opts.speciesId || r.speciesId === opts.speciesId);
  tool(run, "market_snapshot", true, `${rows.length} species`);
  const proposals: { speciesName: string; vendorName: string; kg: number; approvalId: string | null }[] = [];
  const shortages = rows.filter((r) => r.balance === "SHORTAGE");
  for (const row of shortages) {
    const need = -row.gapKg;
    await db.transaction(async (x) => {
      await raiseException(x, orgId, {
        type: "SHORTAGE", severity: need >= 20 ? "HIGH" : "MEDIUM", title: `${row.name}: short ${Math.round(need)} kg tonight`,
        detail: `Demand ${row.demandKg} kg vs committed supply ${row.supplyKg} kg${row.offeredKg ? `; ${row.offeredKg} kg offered by suppliers not yet bought` : ""}.`,
        entityType: "species", entityId: row.speciesId, href: `/market/${row.speciesId}`, dedupeKey: `SHORTAGE:${marketDate}:${row.speciesId}`, at,
      });
    });
    const offers = await openOffers(db, orgId, marketDate, row.speciesId, org.settings.dispatchCutoff);
    tool(run, "open_offers", true, `${row.code}: ${offers.length}`);
    if (!offers.length) {
      await db.transaction((x) => notify(x, orgId, { audience: "PROCUREMENT", title: `We are ${Math.round(need)} kg short of ${row.name.toLowerCase()}`, body: "No open supplier offers. Consider sending an RFQ or offering a substitute.", href: `/market/${row.speciesId}`, at }));
      continue;
    }
    const rec = recommendPurchases(need, offers, org.settings.procurementWeights);
    const byVendor = new Map<string, typeof rec.lines>();
    for (const l of rec.lines) byVendor.set(l.vendorId, [...(byVendor.get(l.vendorId) ?? []), l]);
    for (const [vendorId, lines] of byVendor) {
      const total = Math.round(lines.reduce((a, l) => a + l.lineCost, 0) * 100) / 100;
      const kg = Math.round(lines.reduce((a, l) => a + l.buyKg, 0) * 10) / 10;
      const lotEta = lines[0].source === "LOT" ? await etaOfLot(lines[0].offerId) : null;
      await db.transaction(async (x) => {
        const p = await proposeAction(x, run, {
          actionType: "CREATE_PURCHASE_ORDER",
          title: `Buy ${kg} kg ${row.name.toLowerCase()} from ${lines[0].vendorName}`,
          explanation: `${row.name} is short ${Math.round(need)} kg. ${lines.map((l) => l.reason).join(" ")} Weighted price S$${(total / kg).toFixed(2)}/kg vs 30-day average ${row.avg30Cost ? `S$${row.avg30Cost.toFixed(2)}` : "n/a"}.`,
          approvalSummary: `Buy ${kg} kg ${row.name.toLowerCase()}\nVendor: ${lines[0].vendorName}\nPrice: S$${lines[0].pricePerKg.toFixed(2)}/kg\nTotal: S$${total.toFixed(2)} (before GST)${lotEta ? `\nDelivery ETA: ${fmtTime(lotEta)}` : ""}`,
          proposedAction: {
            vendorId, marketDate, speciesId: row.speciesId, expectedAt: lotEta?.toISOString() ?? null,
            lines: lines.map((l) => ({ speciesId: row.speciesId, lotId: l.source === "LOT" ? l.offerId : null, quoteLineId: l.source === "QUOTE" ? l.offerId : null, quantityKg: l.buyKg, pricePerKg: l.pricePerKg })),
            totalBeforeGst: total,
          },
          input: { needKg: need, offers: offers.length, weights: org.settings.procurementWeights },
          confidence: Math.min(0.95, 0.6 + lines[0].score * 0.4),
          amount: total,
          affectedRecords: [
            { type: "species", id: row.speciesId, label: row.name, href: `/market/${row.speciesId}` },
            { type: "vendor", id: vendorId, label: lines[0].vendorName, href: `/vendors/${vendorId}` },
            ...lines.filter((l) => l.source === "LOT").map((l) => ({ type: "catch_lot", id: l.offerId, label: "Offered lot", href: `/supply/lots/${l.offerId}` })),
          ],
          dedupeKey: `PO:${marketDate}:${row.speciesId}:${lines.map((l) => `${l.offerId}=${l.buyKg}`).sort().join(",")}`,
        }, at);
        if (!p.duplicate) await supersedePending(x, orgId, "CREATE_PURCHASE_ORDER", marketDate, row.speciesId, `PO:${marketDate}:${row.speciesId}:${lines.map((l) => `${l.offerId}=${l.buyKg}`).sort().join(",")}`);
        if (p.autoExecute) {
          await createPurchaseOrder(x, { ...agentCtx(orgId, AGENTS.PROCUREMENT, run.id), now: at }, {
            vendorId, marketDate, source: "AI_RECOMMENDATION", expectedAt: lotEta,
            lines: lines.map((l) => ({ speciesId: row.speciesId, lotId: l.source === "LOT" ? l.offerId : null, quantityKg: l.buyKg, pricePerKg: l.pricePerKg })),
          });
        }
        proposals.push({ speciesName: row.name, vendorName: lines[0].vendorName, kg, approvalId: p.duplicate ? null : p.approvalId });
        if (!p.duplicate && p.approvalId) await notify(x, orgId, { audience: "PROCUREMENT", title: `Approve: buy ${kg} kg ${row.name.toLowerCase()}`, body: `${lines[0].vendorName} @ S$${lines[0].pricePerKg.toFixed(2)}/kg. We are ${Math.round(need)} kg short.`, href: `/ai/approvals`, at });
      });
    }
  }
  for (const row of rows.filter((r) => r.balance !== "SHORTAGE")) {
    await supersedePending(db, orgId, "CREATE_PURCHASE_ORDER", marketDate, row.speciesId);
    await resolveException(db, orgId, `SHORTAGE:${marketDate}:${row.speciesId}`, AGENTS.PROCUREMENT, `Supply now covers demand (${row.supplyKg} kg vs ${row.demandKg} kg).`, at);
  }
  const pending = proposals.filter((p) => p.approvalId).length;
  await finishRun(run, {
    status: pending ? "AWAITING_APPROVAL" : "SUCCEEDED",
    summary: shortages.length
      ? `Detected ${shortages.length} shortage${shortages.length > 1 ? "s" : ""} (${shortages.map((s) => `${s.name} ${Math.abs(Math.round(s.gapKg))} kg`).join(", ")}); ${proposals.length} purchase recommendation${proposals.length === 1 ? "" : "s"}${pending ? " awaiting approval" : ""}.`
      : `No shortages: ${rows.filter((r) => r.balance === "BALANCED").length} balanced, ${rows.filter((r) => r.balance === "SURPLUS").length} surplus.`,
    output: { proposals, balance: rows.map((r) => ({ species: r.name, status: r.statusLabel })) },
    at: new Date(at.getTime() + 2000),
  });
  return { runId: run.id, proposals };
}

async function etaOfLot(lotId: string) {
  const { catchLot } = await import("@/lib/db/schema");
  const [l] = await db.select({ eta: catchLot.expectedArrivalAt }).from(catchLot).where(eq(catchLot.id, lotId));
  return l?.eta ?? null;
}

// ---------------- RFQ agent ----------------
export async function createRfq(
  orgId: string,
  actor: { id: string; label: string },
  r: { marketDate: string; speciesId: string; quantityKg: number; sizeMinKg?: number | null; sizeMaxKg?: number | null; deliverByLocal?: string | null; targetPrice?: number | null; maxPrice?: number | null; vendorIds: string[]; negotiationEnabled?: boolean },
) {
  const run = await startRun(orgId, "RFQ", "USER", { speciesId: r.speciesId, vendorIds: r.vendorIds });
  const [sp] = await db.select().from(species).where(eq(species.id, r.speciesId));
  const vendors = await db.select().from(vendor).where(and(eq(vendor.orgId, orgId), inArray(vendor.id, r.vendorIds)));
  const rfqRow = await db.transaction(async (x) => {
    const n = await nextSeq(x, orgId, "RFQ");
    const [row] = await x
      .insert(rfq)
      .values({
        orgId, rfqNumber: `RFQ-${String(n).padStart(4, "0")}`, marketDate: r.marketDate, speciesId: r.speciesId, quantityKg: toKgStr(r.quantityKg),
        sizeMinKg: r.sizeMinKg ? toKgStr(r.sizeMinKg) : null, sizeMaxKg: r.sizeMaxKg ? toKgStr(r.sizeMaxKg) : null,
        deliverBy: r.deliverByLocal ? atMarketTime(r.marketDate, r.deliverByLocal) : null, targetPricePerKg: r.targetPrice ? toPriceStr(r.targetPrice) : null,
        maxPricePerKg: r.maxPrice ? toPriceStr(r.maxPrice) : null, negotiationEnabled: !!r.negotiationEnabled, status: "PENDING_APPROVAL", vendorIds: vendors.map((v) => v.id), createdBy: actor.label,
      })
      .returning();
    const size = r.sizeMinKg ? `${Math.round(r.sizeMinKg * 1000)}–${Math.round((r.sizeMaxKg ?? r.sizeMinKg) * 1000)}g` : "";
    const body = `RFQ ${row.rfqNumber}: need ${r.quantityKg}kg ${sp.canonicalName.toLowerCase()}${sp.localNames[0] ? ` (${sp.localNames[0]})` : ""} ${size}${r.deliverByLocal ? `, deliver before ${r.deliverByLocal}` : ""}. Please reply with qty, price/kg and ETA.`;
    await proposeAction(x, run, {
      actionType: "SEND_RFQ",
      title: `Send ${row.rfqNumber} to ${vendors.length} supplier${vendors.length === 1 ? "" : "s"}`,
      explanation: `Request quotes for ${r.quantityKg} kg ${sp.canonicalName}. Target price and maximum price are kept internal and never disclosed.`,
      approvalSummary: body,
      proposedAction: { rfqId: row.id, recipients: vendors.map((v) => ({ vendorId: v.id, to: v.whatsappNumber })).filter((v) => v.to), body },
      affectedRecords: vendors.map((v) => ({ type: "vendor", id: v.id, label: v.name, href: `/vendors/${v.id}` })),
      dedupeKey: `RFQ:${row.id}`,
    });
    await audit(x, { orgId, actor: { type: "USER", ...actor }, source: "WEB" }, { action: "RFQ_CREATED", entityType: "rfq", entityId: row.id, summary: `${row.rfqNumber}: ${r.quantityKg} kg ${sp.canonicalName} to ${vendors.map((v) => v.name).join(", ")} (awaiting approval to send).` });
    return row;
  });
  await finishRun(run, { status: "AWAITING_APPROVAL", summary: `Drafted ${rfqRow.rfqNumber}; sending requires approval.` });
  return rfqRow;
}

/** Supplier reply → quote. Never invents supplier approval: only stated quantities/prices are recorded. */
export async function recordQuoteFromReply(orgId: string, rfqId: string, vendorId: string, replyText: string) {
  const run = await startRun(orgId, "RFQ", "WEBHOOK", { rfqId, vendorId });
  const [r] = await db.select().from(rfq).where(and(eq(rfq.id, rfqId), eq(rfq.orgId, orgId)));
  const dict = await speciesDictionary(db, orgId);
  const parsed = parseCatchMessage(replyText, { species: dict });
  const line = parsed.lines.find((l) => l.speciesId === r.speciesId) ?? parsed.lines[0];
  const q = await db.transaction(async (x) => {
    const [msg] = await x.insert(message).values({ orgId, channel: "WHATSAPP_SIMULATOR", direction: "INBOUND", vendorId, body: replyText, status: "PARSED", agentRunId: run.id }).returning();
    if (!line?.quantityKg || !line.askingPricePerKg) return null;
    const [qq] = await x
      .insert(quote)
      .values({ orgId, rfqId, vendorId, marketDate: r.marketDate, status: "RECEIVED", etaAt: parsed.etaLocal ? atMarketTime(r.marketDate, parsed.etaLocal) : null, messageId: msg.id, respondedInMinutes: Math.round((Date.now() - r.createdAt.getTime()) / 60000) })
      .returning();
    await x.insert(quoteLine).values({ orgId, quoteId: qq.id, speciesId: r.speciesId, quantityKg: toKgStr(line.quantityKg), pricePerKg: toPriceStr(line.askingPricePerKg), sizeMinKg: line.sizeMinKg ? toKgStr(line.sizeMinKg) : null, sizeMaxKg: line.sizeMaxKg ? toKgStr(line.sizeMaxKg) : null });
    const within = !r.maxPricePerKg || line.askingPricePerKg <= Number(r.maxPricePerKg);
    await proposeAction(x, run, {
      actionType: "UPDATE_QUOTE_FROM_REPLY",
      title: `Quote recorded from supplier reply`,
      explanation: `Supplier offered ${line.quantityKg} kg @ S$${line.askingPricePerKg.toFixed(2)}/kg${within ? "" : " — ABOVE the maximum price boundary; will not be auto-accepted"}.`,
      proposedAction: { quoteId: qq.id },
      affectedRecords: [{ type: "rfq", id: r.id, label: r.rfqNumber, href: `/procurement/rfqs` }],
    });
    await audit(x, { orgId, actor: { type: "AGENT", id: AGENTS.RFQ, label: AGENTS.RFQ }, source: "WHATSAPP", agentRunId: run.id }, { action: "QUOTE_RECEIVED", entityType: "rfq", entityId: r.id, summary: `Quote: ${line.quantityKg} kg @ S$${line.askingPricePerKg.toFixed(2)}.`, relatedIds: [vendorId, qq.id] });
    await emit(x, orgId, "QUOTE_RECEIVED", { quoteId: qq.id, marketDate: r.marketDate, speciesId: r.speciesId }, { at: new Date() });
    return qq;
  });
  await finishRun(run, { status: "SUCCEEDED", summary: q ? "Supplier reply converted into a quote." : "Reply did not contain a quantity and price; left for a human." });
  return q;
}
