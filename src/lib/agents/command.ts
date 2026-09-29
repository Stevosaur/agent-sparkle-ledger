/**
 * AI Command Bar. Answers operational questions ONLY from database-backed tools and always returns links to
 * the records used. With an API key the LLM chooses tools; without one, a deterministic intent router calls
 * the same tools. Either way, numbers come from tools, never from the model.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { approval, supplierInvoice, vendor } from "@/lib/db/schema";
import { findSpeciesInWords } from "@/lib/domain/species-match";
import { priceStats, pctVsAverage } from "@/lib/domain/pricing";
import { fmtTime } from "@/lib/domain/time";
import { getAI, type AIToolDef } from "@/lib/integrations/ai";
import { getMarket } from "@/lib/services/market";
import { speciesDictionary } from "@/lib/services/dictionaries";
import { recentPurchasePrices } from "@/lib/services/procurement";
import { traceLot } from "@/lib/services/trace";
import { search } from "@/lib/services/search";
import { finishRun, startRun, tool } from "./runtime";
import { runAllocationAgent } from "./operations";

export type CommandLink = { label: string; href: string };
export type CommandAnswer = { answer: string; links: CommandLink[]; mode: "LLM" | "DETERMINISTIC"; runId: string; tools: string[] };

type ToolOut = { summary: string; links: CommandLink[]; data?: unknown };

function makeTools(orgId: string, marketDate: string) {
  const resolveSpecies = async (name: string) => {
    const dict = await speciesDictionary(db, orgId);
    const m = findSpeciesInWords(name.toLowerCase().split(/\s+/), dict);
    return m?.best && m.best.confidence >= 0.6 ? m.best : null;
  };
  const tools: Record<string, { def: AIToolDef; run: (i: Record<string, unknown>) => Promise<ToolOut> }> = {
    market_snapshot: {
      def: { name: "market_snapshot", description: "Tonight's supply vs demand by species (kg, status, costs).", input_schema: { type: "object", properties: {}, additionalProperties: false } },
      run: async () => {
        const rows = await getMarket(orgId, marketDate);
        const short = rows.filter((r) => r.balance === "SHORTAGE");
        const surplus = rows.filter((r) => r.balance === "SURPLUS");
        return {
          summary: `Tonight: ${rows.length} species traded. Shortages: ${short.map((r) => `${r.name} ${Math.abs(Math.round(r.gapKg))} kg`).join(", ") || "none"}. Surplus: ${surplus.map((r) => `${r.name} ${Math.round(r.gapKg)} kg`).join(", ") || "none"}.`,
          links: [{ label: "Tonight's Market", href: "/market" }],
          data: rows.map((r) => ({ species: r.name, supplyKg: r.supplyKg, demandKg: r.demandKg, status: r.statusLabel, wavgCost: r.wavgCost })),
        };
      },
    },
    species_position: {
      def: { name: "species_position", description: "Tonight's position for one species: supply, demand, shortage/surplus, offers.", input_schema: { type: "object", properties: { species: { type: "string" } }, required: ["species"], additionalProperties: false } },
      run: async (i) => {
        const sp = await resolveSpecies(String(i.species));
        if (!sp) return { summary: `I couldn't match “${i.species}” to a species in your master.`, links: [{ label: "Species master", href: "/settings/species" }] };
        const row = (await getMarket(orgId, marketDate)).find((r) => r.speciesId === sp.speciesId);
        if (!row) return { summary: `No ${sp.canonicalName} supply or demand recorded tonight.`, links: [{ label: sp.canonicalName, href: `/market/${sp.speciesId}` }] };
        const verdict = row.balance === "SHORTAGE" ? `We are ${Math.abs(Math.round(row.gapKg))} kg short` : row.balance === "SURPLUS" ? `We have ${Math.round(row.gapKg)} kg surplus` : "Supply and demand are balanced";
        return {
          summary: `${verdict} of ${sp.canonicalName.toLowerCase()} tonight: demand ${row.demandKg} kg vs committed supply ${row.supplyKg} kg (${row.expectedKg} expected + ${row.landedKg} landed)${row.offeredKg ? `; ${row.offeredKg} kg more is offered by suppliers but not yet bought` : ""}.`,
          links: [{ label: `${sp.canonicalName} position`, href: `/market/${sp.speciesId}` }, { label: "Recommendations", href: "/procurement/recommendations" }],
          data: row,
        };
      },
    },
    cheapest_suppliers: {
      def: { name: "cheapest_suppliers", description: "Suppliers ranked by weighted average purchase price for a species over N days.", input_schema: { type: "object", properties: { species: { type: "string" }, days: { type: "number" } }, required: ["species"], additionalProperties: false } },
      run: async (i) => {
        const sp = await resolveSpecies(String(i.species));
        if (!sp) return { summary: `Unknown species “${i.species}”.`, links: [] };
        const days = Number(i.days ?? 30);
        const rows = await recentPurchasePrices(orgId, sp.speciesId, days, marketDate);
        const by = new Map<string, { name: string; id: string; pts: { at: string; pricePerKg: number; quantityKg: number }[] }>();
        for (const r of rows) {
          const e = by.get(r.vendorId) ?? { name: r.vendorName, id: r.vendorId, pts: [] };
          e.pts.push({ at: r.at, pricePerKg: Number(r.price), quantityKg: Number(r.qty) });
          by.set(r.vendorId, e);
        }
        const ranked = [...by.values()].map((v) => ({ ...v, s: priceStats(v.pts) })).filter((v) => v.s.weightedAvg).sort((a, b) => a.s.weightedAvg! - b.s.weightedAvg!);
        if (!ranked.length) return { summary: `No ${sp.canonicalName} purchases in the last ${days} days.`, links: [] };
        return {
          summary: `${sp.canonicalName}, last ${days} days (weighted average paid): ${ranked.slice(0, 4).map((v, k) => `${k + 1}. ${v.name} S$${v.s.weightedAvg!.toFixed(2)}/kg over ${v.s.totalKg} kg`).join("; ")}.`,
          links: ranked.slice(0, 4).map((v) => ({ label: v.name, href: `/vendors/${v.id}` })),
          data: ranked.map((v) => ({ vendor: v.name, wavg: v.s.weightedAvg, kg: v.s.totalKg })),
        };
      },
    },
    price_trend: {
      def: { name: "price_trend", description: "Purchase price trend for a species vs its 30-day weighted average.", input_schema: { type: "object", properties: { species: { type: "string" } }, required: ["species"], additionalProperties: false } },
      run: async (i) => {
        const sp = await resolveSpecies(String(i.species));
        if (!sp) return { summary: `Unknown species “${i.species}”.`, links: [] };
        const rows = await recentPurchasePrices(orgId, sp.speciesId, 30, marketDate);
        const pts = rows.map((r) => ({ at: r.at, pricePerKg: Number(r.price), quantityKg: Number(r.qty) }));
        const hist = priceStats(pts.filter((p) => p.at < marketDate));
        const tonight = priceStats(pts.filter((p) => p.at === marketDate));
        const pct = tonight.weightedAvg ? pctVsAverage(tonight.weightedAvg, hist.weightedAvg) : null;
        return {
          summary: tonight.weightedAvg && pct !== null
            ? `${sp.canonicalName} purchase prices tonight (S$${tonight.weightedAvg.toFixed(2)}/kg) are ${Math.abs(pct)}% ${pct >= 0 ? "above" : "below"} the 30-day weighted average of S$${hist.weightedAvg?.toFixed(2)}/kg (range S$${hist.min?.toFixed(2)}–${hist.max?.toFixed(2)}).`
            : `${sp.canonicalName} 30-day weighted average: ${hist.weightedAvg ? `S$${hist.weightedAvg.toFixed(2)}/kg` : "no data"}; no purchases yet tonight.`,
          links: [{ label: "Pricing report", href: `/reports?species=${sp.speciesId}` }],
        };
      },
    },
    late_deliveries: {
      def: { name: "late_deliveries", description: "Deliveries and inbound supply late by more than N minutes.", input_schema: { type: "object", properties: { minutes: { type: "number" } }, additionalProperties: false } },
      run: async (i) => {
        const mins = Number(i.minutes ?? 30);
        const r = await db.execute(sql`
          SELECT st.id, c.name, sh.shipment_number, sh.id AS shid, st.window_end, COALESCE(st.actual_arrival_at, st.planned_arrival_at) AS eta,
            EXTRACT(EPOCH FROM (COALESCE(st.actual_arrival_at, st.planned_arrival_at) - st.window_end))/60 AS late_min
          FROM shipment_stop st JOIN shipment sh ON sh.id = st.shipment_id JOIN customer c ON c.id = st.customer_id
          WHERE st.org_id = ${orgId} AND sh.market_date = ${marketDate} AND st.window_end IS NOT NULL
            AND COALESCE(st.actual_arrival_at, st.planned_arrival_at) > st.window_end + make_interval(mins => ${mins})`);
        const lots = await db.execute(sql`
          SELECT id, lot_number, canonical_species_name, original_eta, expected_arrival_at, EXTRACT(EPOCH FROM (expected_arrival_at - original_eta))/60 AS late_min
          FROM catch_lot WHERE org_id = ${orgId} AND market_date = ${marketDate} AND status IN ('EXPECTED','LANDED') AND expected_arrival_at > original_eta + make_interval(mins => ${mins})`);
        const d = r.rows as { name: string; shipment_number: string; late_min: string }[];
        const l = lots.rows as { id: string; lot_number: string; canonical_species_name: string; original_eta: Date; expected_arrival_at: Date; late_min: string }[];
        return {
          summary: `${d.length ? `Deliveries late by >${mins} min: ${d.map((x) => `${x.name} (${x.shipment_number}, ${Math.round(Number(x.late_min))} min)`).join("; ")}.` : `No deliveries planned or running more than ${mins} min late.`} ${l.length ? `Inbound supply late: ${l.map((x) => `${x.lot_number} ${x.canonical_species_name} ${fmtTime(x.original_eta)}→${fmtTime(x.expected_arrival_at)}`).join("; ")}.` : ""}`.trim(),
          links: [{ label: "Route board", href: "/operations/routes" }, ...l.map((x) => ({ label: x.lot_number, href: `/supply/lots/${x.id}` }))],
        };
      },
    },
    surplus_risk: {
      def: { name: "surplus_risk", description: "Seafood likely to go unsold tonight (unallocated stock beyond open demand).", input_schema: { type: "object", properties: {}, additionalProperties: false } },
      run: async () => {
        const rows = (await getMarket(orgId, marketDate)).map((r) => ({ ...r, risk: Math.round((r.availableKg - r.unallocatedDemandKg + (r.balance === "SURPLUS" ? Math.max(0, r.expectedKg) : 0)) * 10) / 10 })).filter((r) => r.risk >= 3).sort((a, b) => b.risk - a.risk);
        return {
          summary: rows.length ? `Likely to go unsold without action: ${rows.map((r) => `${r.name} ~${r.risk} kg`).join(", ")}.` : "Nothing is currently at risk of going unsold.",
          links: [{ label: "Surplus alerts", href: "/ai/exceptions" }, ...rows.slice(0, 3).map((r) => ({ label: r.name, href: `/market/${r.speciesId}` }))],
        };
      },
    },
    invoice_exceptions: {
      def: { name: "invoice_exceptions", description: "Supplier invoices that don't match receiving (three-way match exceptions).", input_schema: { type: "object", properties: {}, additionalProperties: false } },
      run: async () => {
        const rows = await db.select({ si: supplierInvoice, v: vendor }).from(supplierInvoice).innerJoin(vendor, eq(vendor.id, supplierInvoice.vendorId)).where(and(eq(supplierInvoice.orgId, orgId), eq(supplierInvoice.matchStatus, "EXCEPTION")));
        return {
          summary: rows.length ? `${rows.length} invoice(s) don't match receiving: ${rows.map((r) => `${r.si.invoiceNumber} from ${r.v.name} — ${(r.si.matchResult as { summary?: string })?.summary ?? "exception"}`).join("; ")}.` : "All supplier invoices match receiving within tolerance.",
          links: rows.map((r) => ({ label: r.si.invoiceNumber, href: `/finance/reconciliation/${r.si.id}` })),
        };
      },
    },
    trace_lot: {
      def: { name: "trace_lot", description: "Full chain for a lot number: supplier, receiving, processing, customers, deliveries, invoices.", input_schema: { type: "object", properties: { lot: { type: "string" } }, required: ["lot"], additionalProperties: false } },
      run: async (i) => {
        const t = await traceLot(orgId, String(i.lot));
        if (!t) return { summary: `No lot matching “${i.lot}”.`, links: [{ label: "Lot explorer", href: "/trace" }] };
        const rec = t.receipts[0];
        return {
          summary: `${t.root.lotNumber}: ${t.species?.canonicalName ?? "?"} from ${t.vendor?.name ?? "unknown supplier"}${t.vessel ? ` (vessel ${t.vessel.name})` : t.farm ? ` (farm ${t.farm.name})` : ""}, ${t.root.sourceCountry ?? ""}. ${rec ? `Received ${Number(rec.grl.receivedKg).toFixed(1)} kg at ${fmtTime(rec.gr.receivedAt)} (grade ${rec.grl.qualityGrade}, ${rec.grl.temperatureC ?? "?"}°C).` : "Not yet received."} ${t.lots.length > 1 ? `${t.lots.length - 1} child lot(s). ` : ""}Customers: ${t.customers.map((c) => `${c.name} ${c.kg} kg`).join(", ") || "none yet"}. Deliveries: ${[...new Set(t.deliveries.map((d) => d.sh.shipmentNumber))].join(", ") || "none"}. Invoices: ${[...t.supplierInvoices.map((s) => s.invoiceNumber), ...t.customerInvoices.map((c) => c.invoiceNumber)].join(", ") || "none"}.`,
          links: [{ label: `Trace ${t.root.lotNumber}`, href: `/trace/${t.root.id}` }],
        };
      },
    },
    allocate_species: {
      def: { name: "allocate_species", description: "Ask the Allocation Agent to PROPOSE an allocation for a species (creates an approval, does not commit).", input_schema: { type: "object", properties: { species: { type: "string" } }, required: ["species"], additionalProperties: false } },
      run: async (i) => {
        const sp = await resolveSpecies(String(i.species));
        if (!sp) return { summary: `Unknown species “${i.species}”.`, links: [] };
        const r = await runAllocationAgent(orgId, marketDate, sp.speciesId, "USER");
        return {
          summary: r.approvalId ? `The Allocation Agent proposed a ${sp.canonicalName.toLowerCase()} allocation. It needs your approval before stock is committed.` : `Nothing to allocate for ${sp.canonicalName.toLowerCase()} (no available stock or open demand).`,
          links: [{ label: "Approval inbox", href: "/ai/approvals" }, { label: "Allocation workbench", href: `/procurement/allocations?species=${sp.speciesId}` }],
        };
      },
    },
    pending_approvals: {
      def: { name: "pending_approvals", description: "Actions waiting for human approval.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
      run: async () => {
        const rows = await db.select().from(approval).where(and(eq(approval.orgId, orgId), eq(approval.status, "PENDING")));
        return { summary: rows.length ? `${rows.length} approvals pending: ${rows.slice(0, 5).map((r) => r.title).join("; ")}${rows.length > 5 ? "…" : ""}.` : "No approvals pending.", links: [{ label: "Approval inbox", href: "/ai/approvals" }] };
      },
    },
    search_records: {
      def: { name: "search_records", description: "Search lots, vendors, species, orders, POs and invoices.", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } },
      run: async (i) => {
        const hits = await search(orgId, String(i.query), 8);
        return { summary: hits.length ? `Found: ${hits.map((h) => `${h.type} ${h.title}`).join("; ")}.` : `No records match “${i.query}”.`, links: hits.map((h) => ({ label: `${h.type}: ${h.title}`, href: h.href })) };
      },
    },
  };
  return tools;
}

function route(q: string): { tool: string; input: Record<string, unknown> }[] {
  const s = q.toLowerCase();
  const lot = /lot[-\s]?[a-z]{0,4}-?\d{6,8}-\d{3,4}|lot[-\s]?\d{3,5}/i.exec(q)?.[0];
  const mins = /(\d+)\s*(min|minutes)/.exec(s)?.[1];
  const speciesText = s.replace(/how much|are we|short|tonight|today|who has|supplied|cheapest|over the last|\d+ days|allocate|today's|the|price|prices|trend|of|is|what|for|\?/g, " ");
  if (lot || /\btrace\b/.test(s)) return [{ tool: "trace_lot", input: { lot: lot ?? s.replace(/trace/i, "").trim() } }];
  if (/cheap|lowest price|best price/.test(s)) return [{ tool: "cheapest_suppliers", input: { species: speciesText, days: Number(/(\d+)\s*days?/.exec(s)?.[1] ?? 30) } }];
  if (/\blate\b|delay/.test(s)) return [{ tool: "late_deliveries", input: { minutes: Number(mins ?? 30) } }];
  if (/unsold|surplus|left ?over|go to waste/.test(s)) return [{ tool: "surplus_risk", input: {} }];
  if (/invoice|bill|don'?t match|mismatch|reconcil/.test(s)) return [{ tool: "invoice_exceptions", input: {} }];
  if (/\ballocate\b/.test(s)) return [{ tool: "allocate_species", input: { species: speciesText } }];
  if (/price|trend|average|expensive/.test(s)) return [{ tool: "price_trend", input: { species: speciesText } }];
  if (/approv/.test(s)) return [{ tool: "pending_approvals", input: {} }];
  if (/short|how much|position|supply|demand/.test(s) && speciesText.trim().length > 2) return [{ tool: "species_position", input: { species: speciesText } }];
  if (/market|overview|tonight|status|summary|shortage/.test(s)) return [{ tool: "market_snapshot", input: {} }];
  return [{ tool: "search_records", input: { query: q } }];
}

const SYSTEM = `You are the PasarCatch operations assistant for a Singapore seafood wholesaler. Answer ONLY using the tools provided; every number must come from a tool result. If tools return nothing relevant, say so. Be concise (2-4 sentences), use kg and S$, Singapore time. Never claim an action was executed unless a tool says so. Allocation and purchasing tools only create proposals that need human approval.`;

export async function answerCommand(orgId: string, question: string, marketDate: string): Promise<CommandAnswer> {
  const q = question.trim().slice(0, 500);
  const run = await startRun(orgId, "COMMAND", "COMMAND", { questionLength: q.length, marketDate });
  const tools = makeTools(orgId, marketDate);
  const links: CommandLink[] = [];
  const used: string[] = [];
  try {
    const ai = getAI();
    if (ai.live) {
      const res = await ai.runTools({
        system: `${SYSTEM}\nTonight's market date is ${marketDate}.`,
        question: q,
        tools: Object.values(tools).map((t) => t.def),
        execute: async (name, input) => {
          const t = tools[name];
          if (!t) throw new Error(`Unknown tool ${name}`);
          const out = await t.run(input);
          links.push(...out.links);
          used.push(name);
          tool(run, name, true);
          return { summary: out.summary, data: out.data };
        },
      });
      if (res) {
        await finishRun(run, { status: "SUCCEEDED", summary: `Answered with ${used.length} tool call(s): ${used.join(", ") || "none"}.`, usage: res.usage, output: { tools: used } });
        return { answer: res.text, links: dedupe(links), mode: "LLM", runId: run.id, tools: used };
      }
    }
    const parts: string[] = [];
    for (const r of route(q)) {
      const out = await tools[r.tool].run(r.input);
      tool(run, r.tool, true);
      used.push(r.tool);
      parts.push(out.summary);
      links.push(...out.links);
    }
    await finishRun(run, { status: "SUCCEEDED", summary: `Answered with ${used.join(", ")} (deterministic router).`, output: { tools: used } });
    return { answer: parts.join("\n\n"), links: dedupe(links), mode: "DETERMINISTIC", runId: run.id, tools: used };
  } catch (e) {
    await finishRun(run, { status: "FAILED", summary: "Command failed", error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

const dedupe = (l: CommandLink[]) => [...new Map(l.map((x) => [x.href + x.label, x])).values()].slice(0, 8);
