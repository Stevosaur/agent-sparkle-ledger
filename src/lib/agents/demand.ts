/**
 * Agent 3 — Demand Forecast. Transparent rolling-average engine; the LLM (if configured) only rewrites the
 * explanation in plain language and never changes the numbers.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customer, demandForecast, demandForecastLine, species, standingOrder } from "@/lib/db/schema";
import { forecastDemand } from "@/lib/domain/forecast";
import { addDays, deliveryDateFor, isoWeekday } from "@/lib/domain/time";
import { toKgStr } from "@/lib/domain/decimal";
import { getAI } from "@/lib/integrations/ai";
import { finishRun, proposeAction, startRun, tool } from "./runtime";

export async function runDemandForecast(orgId: string, marketDate: string, trigger: "USER" | "SCHEDULE" | "SEED" | "EVENT" = "USER", at: Date = new Date()) {
  const run = await startRun(orgId, "DEMAND_FORECAST", trigger, { marketDate }, { at });
  const target = deliveryDateFor(marketDate);
  const from = addDays(marketDate, -56);
  const hist = await db.execute(sql`
    SELECT so.customer_id, sol.species_id, so.market_date, SUM(COALESCE(NULLIF(sol.delivered_kg,0), sol.requested_kg)) AS kg
    FROM sales_order_line sol JOIN sales_order so ON so.id = sol.sales_order_id
    WHERE so.org_id = ${orgId} AND so.market_date >= ${from} AND so.market_date < ${marketDate} AND so.status <> 'CANCELLED'
    GROUP BY so.customer_id, sol.species_id, so.market_date`);
  tool(run, "load_sales_history", true, `${hist.rows.length} rows`);
  const waste = await db.execute(sql`
    SELECT l.species_id, SUM(t.input_kg) FILTER (WHERE t.transformation_type = 'WASTE') / NULLIF(SUM(l.quantity_received_kg),0) * 100 AS pct
    FROM catch_lot l LEFT JOIN lot_transformation t ON t.parent_lot_id = l.id
    WHERE l.org_id = ${orgId} AND l.market_date >= ${addDays(marketDate, -14)} AND l.market_date < ${marketDate} AND l.parent_lot_id IS NULL
    GROUP BY l.species_id`);
  const wasteBySpecies = new Map((waste.rows as { species_id: string; pct: string | null }[]).map((r) => [r.species_id, Number(r.pct ?? 0)]));
  const stock = await db.execute(sql`
    SELECT species_id, SUM(quantity_available_kg) AS kg FROM catch_lot
    WHERE org_id = ${orgId} AND market_date < ${marketDate} AND market_date >= ${addDays(marketDate, -2)} AND status IN ('AVAILABLE','PARTIALLY_ALLOCATED') GROUP BY species_id`);
  const stockBySpecies = new Map((stock.rows as { species_id: string; kg: string }[]).map((r) => [r.species_id, Number(r.kg)]));
  const standing = await db.select().from(standingOrder).where(and(eq(standingOrder.orgId, orgId), eq(standingOrder.active, true)));
  const wd = isoWeekday(target);

  type Key = string;
  const series = new Map<Key, { customerId: string; speciesId: string; points: { date: string; kg: number }[] }>();
  for (const r of hist.rows as { customer_id: string; species_id: string; market_date: string; kg: string }[]) {
    const k = `${r.customer_id}|${r.species_id}`;
    const e = series.get(k) ?? { customerId: r.customer_id, speciesId: r.species_id, points: [] };
    // history is keyed by delivery date so weekday logic matches the target delivery morning
    e.points.push({ date: deliveryDateFor(r.market_date), kg: Number(r.kg) });
    series.set(k, e);
  }
  for (const s of standing.filter((s) => s.daysOfWeek.includes(wd))) {
    const k = `${s.customerId}|${s.speciesId}`;
    if (!series.has(k)) series.set(k, { customerId: s.customerId, speciesId: s.speciesId, points: [] });
  }

  const [custs, sps] = await Promise.all([db.select().from(customer).where(eq(customer.orgId, orgId)), db.select().from(species).where(eq(species.orgId, orgId))]);
  const ai = getAI();
  const result = await db.transaction(async (x) => {
    const [fc] = await x.insert(demandForecast).values({ orgId, marketDate, method: "Rolling same-weekday average + damped 14-day trend + wastage + standing orders", agentRunId: run.id, generatedAt: at }).returning();
    const bySpecies = new Map<string, { kg: number; low: number; high: number; stockKg: number; reasons: Set<string> }>();
    let n = 0;
    for (const s of series.values()) {
      const standingKg = standing.filter((so) => so.customerId === s.customerId && so.speciesId === s.speciesId && so.daysOfWeek.includes(wd)).reduce((a, so) => a + Number(so.quantityKg), 0);
      const f = forecastDemand({ targetDate: target, history: s.points, standingOrderKg: standingKg, recentWastagePct: wasteBySpecies.get(s.speciesId) });
      if (f.forecastKg <= 0) continue;
      const c = custs.find((cc) => cc.id === s.customerId);
      const sp = sps.find((p) => p.id === s.speciesId);
      await x.insert(demandForecastLine).values({
        orgId, forecastId: fc.id, customerId: s.customerId, speciesId: s.speciesId, forecastKg: toKgStr(f.forecastKg), lowKg: toKgStr(f.lowKg), highKg: toKgStr(f.highKg),
        components: f.components as unknown as Record<string, number | string>, explanation: `${c?.name ?? "Buyer"} · ${sp?.canonicalName}: ${f.reasons.join(" ")}`,
      });
      const agg = bySpecies.get(s.speciesId) ?? { kg: 0, low: 0, high: 0, stockKg: stockBySpecies.get(s.speciesId) ?? 0, reasons: new Set<string>() };
      agg.kg += f.forecastKg;
      agg.low += f.lowKg;
      agg.high += f.highKg;
      bySpecies.set(s.speciesId, agg);
      n++;
    }
    // Species-level roll-up lines (customerId null) with a combined explanation
    for (const [speciesId, a] of bySpecies) {
      const sp = sps.find((p) => p.id === speciesId);
      const lastSame = await x.execute(sql`
        SELECT so.market_date, SUM(COALESCE(NULLIF(sol.delivered_kg,0), sol.requested_kg)) AS kg FROM sales_order_line sol JOIN sales_order so ON so.id = sol.sales_order_id
        WHERE so.org_id = ${orgId} AND sol.species_id = ${speciesId} AND so.status <> 'CANCELLED' AND so.market_date IN (${addDays(marketDate, -7)}, ${addDays(marketDate, -14)}, ${addDays(marketDate, -21)}, ${addDays(marketDate, -28)})
        GROUP BY so.market_date`);
      const vals = (lastSame.rows as { kg: string }[]).map((r) => Number(r.kg));
      const avg = vals.length ? vals.reduce((p, q) => p + q, 0) / vals.length : 0;
      const recent = await x.execute(sql`
        SELECT SUM(CASE WHEN so.market_date >= ${addDays(marketDate, -14)} THEN sol.requested_kg ELSE 0 END) AS r, SUM(CASE WHEN so.market_date < ${addDays(marketDate, -14)} THEN sol.requested_kg ELSE 0 END) AS p
        FROM sales_order_line sol JOIN sales_order so ON so.id = sol.sales_order_id
        WHERE so.org_id = ${orgId} AND sol.species_id = ${speciesId} AND so.market_date >= ${addDays(marketDate, -28)} AND so.market_date < ${marketDate} AND so.status <> 'CANCELLED'`);
      const rr = recent.rows[0] as { r: string; p: string };
      const trend = Number(rr.p) > 0 ? Math.round((Number(rr.r) / Number(rr.p) - 1) * 100) : 0;
      const wdName = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][wd - 1];
      const recommended = Math.max(0, a.kg - a.stockKg);
      let explanation = `Recommended tomorrow: ${sp?.canonicalName} ${recommended.toFixed(0)} kg.\nWhy:\nLast ${vals.length} ${wdName}s averaged ${avg.toFixed(0)} kg.\nSales have ${trend >= 0 ? "increased" : "decreased"} ${Math.abs(trend)}% over the last two weeks.\nCurrent stock is ${a.stockKg.toFixed(0)} kg.`;
      if (ai.live) {
        const r = await ai.structured<{ explanation: string }>({
          system: "You explain seafood demand forecasts to a Singapore fish merchant in 3-4 short lines. Use ONLY the numbers given. Never change or invent numbers.",
          prompt: JSON.stringify({ species: sp?.canonicalName, forecastKg: Math.round(a.kg), recommendedKg: Math.round(recommended), lowKg: Math.round(a.low), highKg: Math.round(a.high), sameWeekdayAvgKg: Math.round(avg), weekday: wdName, trendPct: trend, stockKg: Math.round(a.stockKg) }),
          schema: { type: "object", additionalProperties: false, required: ["explanation"], properties: { explanation: { type: "string" } } },
          maxTokens: 600,
        });
        if (r?.data.explanation) explanation = r.data.explanation;
      }
      await x.insert(demandForecastLine).values({
        orgId, forecastId: fc.id, customerId: null, speciesId, forecastKg: toKgStr(a.kg), lowKg: toKgStr(a.low), highKg: toKgStr(a.high),
        components: { sameWeekdayAvgKg: Math.round(avg * 10) / 10, trendPct: trend, stockKg: a.stockKg, recommendedKg: Math.round(recommended * 10) / 10 }, explanation,
      });
    }
    await proposeAction(x, run, {
      actionType: "GENERATE_FORECAST",
      title: `Forecast for ${target}`,
      explanation: `Forecast ${n} buyer × species lines across ${bySpecies.size} species. Users can override any line.`,
      proposedAction: { forecastId: fc.id },
      affectedRecords: [{ type: "demand_forecast", id: fc.id, label: `Forecast ${target}`, href: "/demand/forecast" }],
    }, at);
    return { forecastId: fc.id, lines: n, species: bySpecies.size };
  });
  await finishRun(run, { status: "SUCCEEDED", summary: `Predicted tomorrow's requirements: ${result.lines} buyer lines across ${result.species} species.`, output: result, at: new Date(at.getTime() + 2500) });
  return result;
}

export async function latestForecast(orgId: string, marketDate: string) {
  const [fc] = await db.select().from(demandForecast).where(and(eq(demandForecast.orgId, orgId), eq(demandForecast.marketDate, marketDate))).orderBy(sql`${demandForecast.generatedAt} DESC`).limit(1);
  if (!fc) return null;
  const lines = await db
    .select({ l: demandForecastLine, sp: species, c: customer })
    .from(demandForecastLine)
    .innerJoin(species, eq(species.id, demandForecastLine.speciesId))
    .leftJoin(customer, eq(customer.id, demandForecastLine.customerId))
    .where(eq(demandForecastLine.forecastId, fc.id));
  return { fc, lines };
}

export async function overrideForecastLine(orgId: string, lineId: string, kg: number, by: string, reason: string) {
  await db.update(demandForecastLine).set({ overrideKg: toKgStr(kg), overrideBy: by, overrideReason: reason.slice(0, 200) }).where(and(eq(demandForecastLine.id, lineId), eq(demandForecastLine.orgId, orgId)));
}

