/**
 * Agent 1 — Catch Intake (with Agent 2 — Species Normalisation).
 * Converts messy supplier communication into draft catch lots. Only ambiguous fields are flagged.
 * LLM extraction (when configured) is always re-validated by the deterministic species matcher.
 */
import { eq } from "drizzle-orm";
import { db, type Executor } from "@/lib/db/client";
import { message, vendor } from "@/lib/db/schema";
import { parseCatchMessage, confirmationText, type ParsedCatchDeclaration } from "@/lib/domain/intake-parser";
import { matchSpecies } from "@/lib/domain/species-match";
import { marketDateFor, addDays } from "@/lib/domain/time";
import { getAI } from "@/lib/integrations/ai";
import { getWhatsApp } from "@/lib/integrations/messaging";
import { speciesDictionary, vendorDictionary, normalisePhone } from "@/lib/services/dictionaries";
import { createLotsFromDeclaration } from "@/lib/services/lots";
import { agentCtx, type Ctx } from "@/lib/services/context";
import { audit } from "@/lib/services/audit";
import { AGENTS, finishRun, proposeAction, startRun, tool } from "./runtime";

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["vendorMention", "etaLocal", "tomorrow", "lines", "notes"],
  properties: {
    vendorMention: { type: ["string", "null"], description: "Supplier/boat/farm name mentioned, if any" },
    etaLocal: { type: ["string", "null"], description: "Arrival time as HH:MM 24h Singapore time, or null" },
    tomorrow: { type: "boolean" },
    notes: { type: "array", items: { type: "string" } },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["supplierSpeciesName", "quantityKg", "quantityIsEstimate", "sizeMinGrams", "sizeMaxGrams", "askingPricePerKg", "currency", "priceCondition"],
        properties: {
          supplierSpeciesName: { type: "string", description: "Species exactly as the supplier wrote it" },
          quantityKg: { type: ["number", "null"] },
          quantityIsEstimate: { type: "boolean" },
          sizeMinGrams: { type: ["number", "null"] },
          sizeMaxGrams: { type: ["number", "null"] },
          askingPricePerKg: { type: ["number", "null"] },
          currency: { type: "string", enum: ["SGD", "MYR", "IDR"] },
          priceCondition: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

const SYSTEM = `You extract seafood catch declarations sent by fishermen, farms and suppliers to a Singapore seafood wholesaler.
Messages mix English, Singlish, Malay, Hokkien/Teochew romanisations and Chinese. Extract only what is stated; use null when absent.
Quantities are kilograms (1 kati = 0.6048 kg). Prices are per kg; default currency SGD unless RM/MYR or Rp/IDR is written.
Times like "1.30" or "reach 2" at night mean early morning (01:30, 02:00). Do not invent vendors, species, prices or times.`;

type IntakeResult = { messageId: string; lotIds: string[]; lotNumbers: string[]; parsed: ParsedCatchDeclaration; runId: string; confirmation: string; mode: "LLM" | "DETERMINISTIC" };

export async function ingestSupplierMessage(
  orgId: string,
  m: { channel: "WHATSAPP" | "WHATSAPP_SIMULATOR" | "WEB" | "VOICE" | "SMS" | "EMAIL"; from?: string | null; body: string; vendorId?: string | null; transcription?: string | null; externalId?: string | null; at?: Date; marketDate?: string },
  trigger: "WEBHOOK" | "USER" | "SEED" = "USER",
): Promise<IntakeResult> {
  const at = m.at ?? new Date();
  const text = (m.transcription ?? m.body).slice(0, 2000);
  const vendors = await vendorDictionary(db, orgId);
  const senderVendor = m.vendorId ?? vendors.find((v) => v.whatsapp && m.from && normalisePhone(v.whatsapp) === normalisePhone(m.from))?.vendorId ?? null;

  const [msg] = await db
    .insert(message)
    .values({ orgId, channel: m.channel, direction: "INBOUND", vendorId: senderVendor, fromHandle: m.from ?? null, body: m.body, transcription: m.transcription ?? null, externalId: m.externalId ?? null, status: "RECEIVED", at })
    .returning({ id: message.id });

  const run = await startRun(orgId, "CATCH_INTAKE", trigger, { messageId: msg.id, channel: m.channel }, { at });
  try {
    const dict = await speciesDictionary(db, orgId);
    tool(run, "load_species_master", true, `${dict.length} species`);
    let parsed = parseCatchMessage(text, { species: dict, vendors, senderVendorId: senderVendor });
    let mode: IntakeResult["mode"] = "DETERMINISTIC";
    let usage: { inputTokens: number; outputTokens: number } | undefined;

    const ai = getAI();
    if (ai.live) {
      const r = await ai.structured<{ vendorMention: string | null; etaLocal: string | null; tomorrow: boolean; notes: string[]; lines: { supplierSpeciesName: string; quantityKg: number | null; quantityIsEstimate: boolean; sizeMinGrams: number | null; sizeMaxGrams: number | null; askingPricePerKg: number | null; currency: "SGD" | "MYR" | "IDR"; priceCondition: string | null }[] }>({
        system: SYSTEM,
        prompt: `Supplier message:\n"""${text}"""`,
        schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
      });
      tool(run, "llm_structured_extraction", !!r);
      if (r && r.data.lines.length) {
        mode = "LLM";
        usage = r.usage;
        parsed = mergeLlm(parsed, r.data, dict, vendors);
      }
    }
    tool(run, "species_normalisation", true, parsed.lines.map((l) => `${l.supplierSpeciesName}→${l.speciesCode ?? "?"}`).join(", "));

    const marketDate = m.marketDate ?? addDays(marketDateFor(at), parsed.dayOffset);
    const ctx: Ctx = { ...agentCtx(orgId, AGENTS.CATCH_INTAKE, run.id), now: at };
    const lots = await db.transaction(async (x) => {
      const created = await createLotsFromDeclaration(x, ctx, {
        marketDate,
        vendorId: parsed.vendor?.vendorId ?? null,
        etaLocal: parsed.etaLocal,
        messageId: msg.id,
        confirmation: "DRAFT",
        intakeConfidence: parsed.overallConfidence,
        ambiguousFields: parsed.ambiguousFields,
        lines: parsed.lines
          .filter((l) => l.quantityKg !== null && l.quantityKg > 0)
          .map((l, i) => ({
            speciesId: l.speciesId,
            supplierSpeciesName: l.supplierSpeciesName,
            quantityKg: l.quantityKg!,
            sizeMinKg: l.sizeMinKg,
            sizeMaxKg: l.sizeMaxKg,
            askingPricePerKg: l.askingPricePerKg,
            currency: l.currency,
            processingState: l.processingState,
            freshOrFrozen: l.freshOrFrozen,
            fieldConfidence: { species: l.confidence.species, quantity: l.confidence.quantity, ...(l.confidence.size !== null ? { size: l.confidence.size } : {}), ...(l.confidence.price !== null ? { price: l.confidence.price } : {}), eta: parsed.etaConfidence },
            ambiguousFields: parsed.ambiguousFields.filter((f) => f.startsWith(`lines[${i}].`)).map((f) => f.replace(`lines[${i}].`, "")).concat(parsed.lines.length === 1 ? parsed.ambiguousFields.filter((f) => ["species", "quantity", "price"].includes(f)) : []),
          })),
      });
      await x.update(message).set({ status: parsed.ambiguousFields.length ? "NEEDS_REVIEW" : "PARSED", agentRunId: run.id, vendorId: parsed.vendor?.vendorId ?? senderVendor }).where(eq(message.id, msg.id));
      for (const lot of created) {
        await proposeAction(x, run, {
          actionType: "CREATE_DRAFT_LOT",
          title: `Draft lot ${lot.lotNumber}`,
          explanation: `Parsed ${lot.canonicalSpeciesName ?? lot.supplierSpeciesName} ${Number(lot.quantityDeclaredKg)} kg from the supplier's message (confidence ${Math.round(parsed.overallConfidence * 100)}%).${lot.ambiguousFields.length ? ` Needs a human to check: ${lot.ambiguousFields.join(", ")}.` : ""}`,
          proposedAction: { lotId: lot.id },
          confidence: parsed.overallConfidence,
          affectedRecords: [{ type: "catch_lot", id: lot.id, label: lot.lotNumber, href: `/supply/lots/${lot.id}` }],
        }, at);
      }
      return created;
    });
    tool(run, "create_draft_lots", true, `${lots.length} lots`);

    // Reply to the supplier with the extraction for confirmation (EXTERNAL_COMMUNICATION).
    const confirmation = confirmationText(parsed);
    if (m.from && (m.channel === "WHATSAPP" || m.channel === "WHATSAPP_SIMULATOR")) {
      await db.transaction(async (x) => {
        const p = await proposeAction(x, run, {
          actionType: "SEND_SUPPLIER_ACK",
          title: `Reply to ${parsed.vendor?.name ?? m.from}: catch received`,
          explanation: "Templated acknowledgement listing the extracted catch so the supplier can confirm or correct it.",
          proposedAction: { to: m.from, body: confirmation, vendorId: parsed.vendor?.vendorId ?? null },
          affectedRecords: lots.map((l) => ({ type: "catch_lot", id: l.id, label: l.lotNumber, href: `/supply/lots/${l.id}` })),
          dedupeKey: `ACK:${msg.id}`,
        }, at);
        if (p.autoExecute) await sendOutbound(x, orgId, { to: m.from!, body: confirmation, vendorId: parsed.vendor?.vendorId ?? null, channel: m.channel, at });
      });
      tool(run, "supplier_ack", true);
    }

    await finishRun(run, {
      status: "SUCCEEDED",
      summary: `Converted ${m.channel === "WEB" ? "declaration" : "supplier message"} into ${lots.length} draft lot${lots.length === 1 ? "" : "s"} (${lots.map((l) => l.lotNumber).join(", ")})${parsed.ambiguousFields.length ? `; flagged ${parsed.ambiguousFields.join(", ")}` : ""}.`,
      output: { lotIds: lots.map((l) => l.id), parsed, mode },
      usage,
      at: new Date(at.getTime() + 1500),
    });
    return { messageId: msg.id, lotIds: lots.map((l) => l.id), lotNumbers: lots.map((l) => l.lotNumber), parsed, runId: run.id, confirmation, mode };
  } catch (e) {
    await finishRun(run, { status: "FAILED", summary: "Catch intake failed", error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

function mergeLlm(
  base: ParsedCatchDeclaration,
  llm: { vendorMention: string | null; etaLocal: string | null; tomorrow: boolean; notes: string[]; lines: { supplierSpeciesName: string; quantityKg: number | null; quantityIsEstimate: boolean; sizeMinGrams: number | null; sizeMaxGrams: number | null; askingPricePerKg: number | null; currency: "SGD" | "MYR" | "IDR"; priceCondition: string | null }[] },
  dict: Awaited<ReturnType<typeof speciesDictionary>>,
  vendors: Awaited<ReturnType<typeof vendorDictionary>>,
): ParsedCatchDeclaration {
  const lines = llm.lines.map((l) => {
    const m = matchSpecies(l.supplierSpeciesName, dict);
    return {
      supplierSpeciesName: l.supplierSpeciesName,
      speciesId: m.best && !m.needsConfirmation ? m.best.speciesId : m.best?.speciesId ?? null,
      speciesCode: m.best?.code ?? null,
      canonicalName: m.best?.canonicalName ?? null,
      speciesAlternatives: m.alternatives.map((a) => ({ speciesId: a.speciesId, canonicalName: a.canonicalName, confidence: a.confidence })),
      quantityKg: l.quantityKg,
      quantityIsEstimate: l.quantityIsEstimate,
      sizeMinKg: l.sizeMinGrams ? l.sizeMinGrams / 1000 : null,
      sizeMaxKg: l.sizeMaxGrams ? l.sizeMaxGrams / 1000 : null,
      askingPricePerKg: l.askingPricePerKg,
      currency: l.currency,
      priceCondition: l.priceCondition ?? undefined,
      confidence: { species: m.best?.confidence ?? 0, quantity: l.quantityKg === null ? 0 : l.quantityIsEstimate ? 0.8 : 0.93, size: l.sizeMinGrams ? 0.88 : null, price: l.askingPricePerKg ? 0.9 : null },
    };
  });
  let vendorRes = base.vendor;
  if (!vendorRes && llm.vendorMention) {
    const v = vendors.find((x) => [x.name, ...x.aliases].some((a) => a.toLowerCase().includes(llm.vendorMention!.toLowerCase()) || llm.vendorMention!.toLowerCase().includes(a.toLowerCase())));
    if (v) vendorRes = { vendorId: v.vendorId, name: v.name, confidence: 0.8, matchedOn: llm.vendorMention };
  }
  const ambiguous: string[] = [];
  lines.forEach((l, i) => {
    const tag = lines.length > 1 ? `lines[${i}].` : "";
    if (l.confidence.species < 0.8) ambiguous.push(`${tag}species`);
    if (l.quantityKg === null) ambiguous.push(`${tag}quantity`);
  });
  const eta = llm.etaLocal && /^\d{2}:\d{2}$/.test(llm.etaLocal) ? llm.etaLocal : base.etaLocal;
  if (!eta) ambiguous.push("eta");
  if (!vendorRes) ambiguous.push("vendor");
  const core = lines.length ? Math.min(...lines.map((l) => Math.min(l.confidence.species, l.confidence.quantity))) : 0;
  return {
    vendor: vendorRes,
    etaLocal: eta,
    etaConfidence: eta ? 0.9 : 0,
    dayOffset: llm.tomorrow ? 1 : 0,
    lines,
    notes: [...llm.notes, ...lines.filter((l) => l.priceCondition).map((l) => `${l.canonicalName ?? l.supplierSpeciesName}: ${l.priceCondition}`)],
    ambiguousFields: ambiguous,
    overallConfidence: Math.round((core * 0.7 + ((eta ? 0.9 : 0.5) + (vendorRes?.confidence ?? 0.6)) / 2 * 0.3) * 1000) / 1000,
  };
}

/** Send (or simulate) an outbound message and record it. Only call after policy/approval allows it. */
export async function sendOutbound(
  x: Executor,
  orgId: string,
  m: { to: string; body: string; vendorId?: string | null; customerId?: string | null; channel?: string; at?: Date },
) {
  const provider = getWhatsApp();
  const res = await provider.send({ to: m.to, body: m.body });
  const [row] = await x
    .insert(message)
    .values({
      orgId,
      channel: provider.status === "MOCK" ? "WHATSAPP_SIMULATOR" : "WHATSAPP",
      direction: "OUTBOUND",
      vendorId: m.vendorId ?? null,
      customerId: m.customerId ?? null,
      toHandle: m.to,
      body: m.body,
      externalId: res.externalId ?? null,
      status: res.status,
      at: m.at ?? new Date(),
    })
    .returning({ id: message.id });
  if (m.vendorId) {
    const [v] = await x.select({ name: vendor.name }).from(vendor).where(eq(vendor.id, m.vendorId));
    await audit(x, { orgId, actor: { type: "INTEGRATION", id: provider.provider, label: provider.provider }, source: "WHATSAPP" }, {
      action: "MESSAGE_SENT",
      entityType: "vendor",
      entityId: m.vendorId,
      summary: `${res.status === "MOCK_SENT" ? "Simulated" : "Sent"} WhatsApp to ${v?.name ?? "supplier"}.`,
      relatedIds: [row.id],
      at: m.at,
    });
  }
  return { ...res, messageId: row.id };
}
