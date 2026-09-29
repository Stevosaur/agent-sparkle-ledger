/**
 * Report read models. Every figure is computed in SQL over this organisation's own platform records —
 * nothing is estimated or invented. All queries are tenant-scoped and parameterised.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { addDays } from "@/lib/domain/time";
import { forecastAccuracyPct } from "@/lib/domain/forecast";

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const nn = (v: unknown) => (v === null || v === undefined ? null : Number(v));
/** Market night an instant belongs to (07:00 SGT boundary, same rule as marketDateFor). */
const nightOf = (col: ReturnType<typeof sql.raw>) => sql`((${col} AT TIME ZONE 'Asia/Singapore') - interval '7 hours')::date`;

async function rows<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  const r = await db.execute(q);
  return r.rows as T[];
}

// ---------------------------------------------------------------- Daily procurement
export async function dailyProcurement(orgId: string, marketDate: string) {
  const r = await rows<{ vendor_id: string; vendor: string; species: string; source: string; po_count: string; kg: string; spend: string }>(sql`
    SELECT v.id AS vendor_id, v.name AS vendor, sp.canonical_name AS species, po.source,
      COUNT(DISTINCT po.id) AS po_count, SUM(pol.quantity_kg) AS kg, SUM(pol.line_total) AS spend
    FROM purchase_order_line pol
    JOIN purchase_order po ON po.id = pol.purchase_order_id
    JOIN vendor v ON v.id = po.vendor_id
    JOIN species sp ON sp.id = pol.species_id
    WHERE po.org_id = ${orgId} AND po.market_date = ${marketDate} AND po.status NOT IN ('CANCELLED','DRAFT')
    GROUP BY v.id, v.name, sp.canonical_name, po.source
    ORDER BY v.name, sp.canonical_name`);
  return r.map((x) => ({ vendorId: x.vendor_id, vendor: x.vendor, species: x.species, source: x.source, poCount: n(x.po_count), kg: n(x.kg), spend: n(x.spend), wavg: n(x.kg) > 0 ? n(x.spend) / n(x.kg) : null }));
}

// ---------------------------------------------------------------- Gross margin by species
export async function grossMarginBySpecies(orgId: string, marketDate: string, days = 30) {
  const from = addDays(marketDate, -(days - 1));
  const r = await rows<{ species_id: string; species: string; kg: string; costed_kg: string; sales: string; costed_sales: string; cost: string }>(sql`
    SELECT sp.id AS species_id, sp.canonical_name AS species,
      SUM(a.quantity_kg) AS kg,
      SUM(CASE WHEN COALESCE(l.agreed_cost_per_kg, rl.agreed_cost_per_kg) IS NOT NULL THEN a.quantity_kg ELSE 0 END) AS costed_kg,
      SUM(a.quantity_kg * sol.price_per_kg) AS sales,
      SUM(CASE WHEN COALESCE(l.agreed_cost_per_kg, rl.agreed_cost_per_kg) IS NOT NULL THEN a.quantity_kg * sol.price_per_kg ELSE 0 END) AS costed_sales,
      SUM(a.quantity_kg * COALESCE(l.agreed_cost_per_kg, rl.agreed_cost_per_kg)) AS cost
    FROM allocation a
    JOIN sales_order_line sol ON sol.id = a.sales_order_line_id
    JOIN sales_order so ON so.id = sol.sales_order_id
    JOIN catch_lot l ON l.id = a.lot_id
    LEFT JOIN catch_lot rl ON rl.id = l.root_lot_id
    JOIN species sp ON sp.id = sol.species_id
    WHERE a.org_id = ${orgId} AND a.status <> 'RELEASED' AND so.status <> 'CANCELLED'
      AND so.market_date BETWEEN ${from} AND ${marketDate}
    GROUP BY sp.id, sp.canonical_name
    ORDER BY SUM(a.quantity_kg * sol.price_per_kg) DESC`);
  return r.map((x) => {
    const costedSales = n(x.costed_sales);
    const cost = n(x.cost);
    return { speciesId: x.species_id, species: x.species, kg: n(x.kg), costedKg: n(x.costed_kg), sales: n(x.sales), costedSales, cost, margin: costedSales - cost, marginPct: costedSales > 0 ? ((costedSales - cost) / costedSales) * 100 : null };
  });
}

// ---------------------------------------------------------------- Quantity variance (declared vs received)
export async function quantityVarianceByVendor(orgId: string, marketDate: string, days = 30, alertPct = 5) {
  const from = addDays(marketDate, -(days - 1));
  const r = await rows<{ vendor_id: string; vendor: string; receipts: string; declared: string; received: string; accepted: string; rejected: string; flagged: string }>(sql`
    SELECT v.id AS vendor_id, v.name AS vendor, COUNT(*) AS receipts,
      SUM(grl.declared_kg) AS declared, SUM(grl.received_kg) AS received, SUM(grl.accepted_kg) AS accepted, SUM(grl.rejected_kg) AS rejected,
      SUM(CASE WHEN grl.declared_kg > 0 AND ABS(grl.received_kg - grl.declared_kg) / grl.declared_kg * 100 > ${alertPct} THEN 1 ELSE 0 END) AS flagged
    FROM goods_receipt_line grl
    JOIN catch_lot l ON l.id = grl.lot_id
    JOIN vendor v ON v.id = l.vendor_id
    WHERE grl.org_id = ${orgId} AND l.market_date BETWEEN ${from} AND ${marketDate}
    GROUP BY v.id, v.name
    ORDER BY SUM(grl.received_kg - grl.declared_kg) ASC`);
  return r.map((x) => {
    const declared = n(x.declared);
    const received = n(x.received);
    return { vendorId: x.vendor_id, vendor: x.vendor, receipts: n(x.receipts), declared, received, accepted: n(x.accepted), rejected: n(x.rejected), varianceKg: received - declared, variancePct: declared > 0 ? ((received - declared) / declared) * 100 : null, flagged: n(x.flagged) };
  });
}

// ---------------------------------------------------------------- Waste / shrinkage
export async function wasteBySpecies(orgId: string, marketDate: string, days = 30) {
  const from = addDays(marketDate, -(days - 1));
  const r = await rows<{ species_id: string | null; species: string; waste: string; reject: string; trim: string; received: string }>(sql`
    WITH m AS (
      SELECT l.species_id,
        SUM(CASE WHEN im.type = 'WASTE' THEN ABS(im.quantity_kg) ELSE 0 END) AS waste,
        SUM(CASE WHEN im.type = 'REJECT' THEN ABS(im.quantity_kg) ELSE 0 END) AS reject
      FROM inventory_movement im JOIN catch_lot l ON l.id = im.lot_id
      WHERE im.org_id = ${orgId} AND im.type IN ('WASTE','REJECT') AND l.market_date BETWEEN ${from} AND ${marketDate}
      GROUP BY l.species_id
    ), t AS (
      SELECT l.species_id, SUM(lt.input_kg - lt.output_kg) AS trim
      FROM lot_transformation lt JOIN catch_lot l ON l.id = lt.parent_lot_id
      WHERE lt.org_id = ${orgId} AND lt.transformation_type = 'WASTE' AND l.market_date BETWEEN ${from} AND ${marketDate}
      GROUP BY l.species_id
    ), rcv AS (
      SELECT l.species_id, SUM(grl.received_kg) AS received
      FROM goods_receipt_line grl JOIN catch_lot l ON l.id = grl.lot_id
      WHERE grl.org_id = ${orgId} AND l.market_date BETWEEN ${from} AND ${marketDate}
      GROUP BY l.species_id
    )
    SELECT sp.id AS species_id, sp.canonical_name AS species, COALESCE(m.waste,0) AS waste, COALESCE(m.reject,0) AS reject, COALESCE(t.trim,0) AS trim, COALESCE(rcv.received,0) AS received
    FROM species sp
    LEFT JOIN m ON m.species_id = sp.id LEFT JOIN t ON t.species_id = sp.id LEFT JOIN rcv ON rcv.species_id = sp.id
    WHERE sp.org_id = ${orgId} AND (COALESCE(m.waste,0) + COALESCE(m.reject,0) + COALESCE(t.trim,0)) > 0
    ORDER BY (COALESCE(m.waste,0) + COALESCE(m.reject,0) + COALESCE(t.trim,0)) DESC`);
  return r.map((x) => {
    const total = n(x.waste) + n(x.reject) + n(x.trim);
    return { speciesId: x.species_id, species: x.species, waste: n(x.waste), reject: n(x.reject), trim: n(x.trim), total, received: n(x.received), pctOfReceived: n(x.received) > 0 ? (total / n(x.received)) * 100 : null };
  });
}

// ---------------------------------------------------------------- Forecast accuracy
export async function forecastAccuracy(orgId: string, marketDate: string, days = 30) {
  const from = addDays(marketDate, -(days - 1));
  const r = await rows<{ market_date: string; species_id: string; species: string; forecast: string; low: string; high: string; actual: string | null }>(sql`
    WITH f AS (
      SELECT DISTINCT ON (df.market_date) df.id, df.market_date FROM demand_forecast df
      WHERE df.org_id = ${orgId} AND df.market_date BETWEEN ${from} AND ${marketDate}
      ORDER BY df.market_date, df.generated_at DESC
    ), fl AS (
      SELECT f.market_date, dfl.species_id, SUM(COALESCE(dfl.override_kg, dfl.forecast_kg)) AS forecast, SUM(dfl.low_kg) AS low, SUM(dfl.high_kg) AS high
      FROM demand_forecast_line dfl JOIN f ON f.id = dfl.forecast_id
      WHERE dfl.org_id = ${orgId} AND dfl.customer_id IS NULL
      GROUP BY f.market_date, dfl.species_id
    ), act AS (
      SELECT so.market_date, sol.species_id, SUM(sol.requested_kg) AS actual
      FROM sales_order_line sol JOIN sales_order so ON so.id = sol.sales_order_id
      WHERE so.org_id = ${orgId} AND so.status <> 'CANCELLED' AND so.market_date BETWEEN ${from} AND ${marketDate} AND sol.substitute_for_line_id IS NULL
      GROUP BY so.market_date, sol.species_id
    )
    SELECT fl.market_date, fl.species_id, sp.canonical_name AS species, fl.forecast, fl.low, fl.high, act.actual
    FROM fl JOIN species sp ON sp.id = fl.species_id
    LEFT JOIN act ON act.market_date = fl.market_date AND act.species_id = fl.species_id
    ORDER BY fl.market_date DESC, sp.canonical_name`);
  const all = r.map((x) => {
    const forecast = n(x.forecast);
    const actual = nn(x.actual);
    return { marketDate: x.market_date, speciesId: x.species_id, species: x.species, forecast, low: n(x.low), high: n(x.high), actual, accuracyPct: actual === null ? null : forecastAccuracyPct(forecast, actual), inBand: actual === null ? null : actual >= n(x.low) && actual <= n(x.high) };
  });
  const forecastNights = new Set(all.map((x) => x.marketDate)).size;
  return { rows: all.filter((x) => x.actual !== null), forecastNights, withoutActual: all.filter((x) => x.actual === null).length };
}

// ---------------------------------------------------------------- Shortages
export async function shortagesByNight(orgId: string, marketDate: string, days = 30) {
  const from = addDays(marketDate, -(days - 1));
  const r = await rows<{ night: string; id: string; title: string; detail: string; severity: string; status: string; href: string | null }>(sql`
    SELECT ${nightOf(sql.raw("opened_at"))}::text AS night, id, title, detail, severity, status, href
    FROM ops_exception
    WHERE org_id = ${orgId} AND type = 'SHORTAGE' AND ${nightOf(sql.raw("opened_at"))} BETWEEN ${from}::date AND ${marketDate}::date
    ORDER BY opened_at DESC`);
  const by = new Map<string, typeof r>();
  for (const x of r) by.set(x.night, [...(by.get(x.night) ?? []), x]);
  return [...by.entries()].map(([night, items]) => ({ night, count: items.length, open: items.filter((i) => i.status !== "RESOLVED").length, items }));
}

// ---------------------------------------------------------------- Surplus & markdown
export async function surplusAndMarkdown(orgId: string, marketDate: string, days = 30) {
  const from = addDays(marketDate, -(days - 1));
  const [ex, ap] = await Promise.all([
    rows<{ night: string; id: string; title: string; detail: string; severity: string; status: string; href: string | null; resolution_note: string | null }>(sql`
      SELECT ${nightOf(sql.raw("opened_at"))}::text AS night, id, title, detail, severity, status, href, resolution_note
      FROM ops_exception
      WHERE org_id = ${orgId} AND type = 'SURPLUS' AND ${nightOf(sql.raw("opened_at"))} BETWEEN ${from}::date AND ${marketDate}::date
      ORDER BY opened_at DESC`),
    rows<{ id: string; title: string; status: string; requested_at: string; decided_by: string | null; payload: Record<string, unknown>; modifications: Record<string, unknown> | null; species: string | null }>(sql`
      SELECT a.id, a.title, a.status, a.requested_at, a.decided_by, a.payload, a.modifications, sp.canonical_name AS species
      FROM approval a LEFT JOIN species sp ON sp.id::text = a.payload->>'speciesId' AND sp.org_id = a.org_id
      WHERE a.org_id = ${orgId} AND a.kind = 'APPLY_DISCOUNT' AND ${nightOf(sql.raw("a.requested_at"))} BETWEEN ${from}::date AND ${marketDate}::date
      ORDER BY a.requested_at DESC`),
  ]);
  return {
    exceptions: ex,
    markdowns: ap.map((a) => ({
      id: a.id, title: a.title, status: a.status, requestedAt: new Date(a.requested_at).toISOString(), decidedBy: a.decided_by, species: a.species,
      kg: nn(a.payload.kg), fromPrice: nn(a.payload.fromPrice ?? a.payload.currentPrice), toPrice: nn(a.modifications?.toPrice ?? a.payload.toPrice), floorPrice: nn(a.payload.floorPrice),
    })),
  };
}

// ---------------------------------------------------------------- On-time delivery
export async function onTimeDelivery(orgId: string, marketDate: string, days = 30) {
  const from = addDays(marketDate, -(days - 1));
  const r = await rows<{ customer_id: string; customer: string; stops: string; timed: string; on_time: string; avg_late_min: string | null; failed: string }>(sql`
    SELECT c.id AS customer_id, c.name AS customer, COUNT(*) AS stops,
      SUM(CASE WHEN st.actual_arrival_at IS NOT NULL AND st.window_end IS NOT NULL THEN 1 ELSE 0 END) AS timed,
      SUM(CASE WHEN st.actual_arrival_at IS NOT NULL AND st.window_end IS NOT NULL AND st.actual_arrival_at <= st.window_end THEN 1 ELSE 0 END) AS on_time,
      AVG(CASE WHEN st.actual_arrival_at > st.window_end THEN EXTRACT(EPOCH FROM (st.actual_arrival_at - st.window_end)) / 60 END) AS avg_late_min,
      SUM(CASE WHEN st.status = 'FAILED' THEN 1 ELSE 0 END) AS failed
    FROM shipment_stop st
    JOIN shipment sh ON sh.id = st.shipment_id
    JOIN customer c ON c.id = st.customer_id
    WHERE st.org_id = ${orgId} AND sh.status <> 'CANCELLED' AND sh.market_date BETWEEN ${from} AND ${marketDate}
    GROUP BY c.id, c.name
    ORDER BY c.name`);
  return r.map((x) => ({ customerId: x.customer_id, customer: x.customer, stops: n(x.stops), timed: n(x.timed), onTime: n(x.on_time), onTimePct: n(x.timed) > 0 ? (n(x.on_time) / n(x.timed)) * 100 : null, avgLateMin: nn(x.avg_late_min), failed: n(x.failed) }));
}

// ---------------------------------------------------------------- Invoice exceptions
export async function invoiceExceptionSummary(orgId: string) {
  const [counts, list] = await Promise.all([
    rows<{ match_status: string; n: string; total: string; over: string }>(sql`
      SELECT match_status::text, COUNT(*) AS n, SUM(total) AS total, SUM(COALESCE((match_result->>'potentialOverbillingExGst')::numeric, 0)) AS over
      FROM supplier_invoice WHERE org_id = ${orgId} GROUP BY match_status`),
    rows<{ id: string; invoice_number: string; invoice_date: string; vendor: string; total: string; match_status: string; over: string | null; over_inc: string | null; summary: string | null }>(sql`
      SELECT si.id, si.invoice_number, si.invoice_date, v.name AS vendor, si.total, si.match_status::text,
        si.match_result->>'potentialOverbillingExGst' AS over, si.match_result->>'potentialOverbillingIncGst' AS over_inc, si.match_result->>'summary' AS summary
      FROM supplier_invoice si JOIN vendor v ON v.id = si.vendor_id
      WHERE si.org_id = ${orgId} AND si.match_status IN ('EXCEPTION','APPROVED_EXCEPTION','MATCH_WITHIN_TOLERANCE')
      ORDER BY si.invoice_date DESC LIMIT 50`),
  ]);
  return {
    counts: counts.map((c) => ({ status: c.match_status, count: n(c.n), total: n(c.total), overbilling: n(c.over) })),
    list: list.map((x) => ({ id: x.id, invoiceNumber: x.invoice_number, invoiceDate: x.invoice_date, vendor: x.vendor, total: n(x.total), status: x.match_status, over: nn(x.over), overInc: nn(x.over_inc), summary: x.summary })),
  };
}

// ---------------------------------------------------------------- Traceability completeness
export async function traceabilityCompleteness(orgId: string, marketDates: string[]) {
  const r = await rows<{ market_date: string; lots: string; with_vendor: string; with_source: string; with_country: string; received: string; with_receipt: string; with_temp: string; allocated: string; with_customer: string }>(sql`
    WITH lots AS (
      SELECT l.* FROM catch_lot l
      WHERE l.org_id = ${orgId} AND l.parent_lot_id IS NULL AND l.confirmation = 'CONFIRMED' AND l.market_date IN (${sql.join(marketDates.map((d) => sql`${d}::date`), sql`, `)})
    )
    SELECT l.market_date::text,
      COUNT(*) AS lots,
      SUM(CASE WHEN l.vendor_id IS NOT NULL THEN 1 ELSE 0 END) AS with_vendor,
      SUM(CASE WHEN l.vessel_id IS NOT NULL OR l.farm_id IS NOT NULL THEN 1 ELSE 0 END) AS with_source,
      SUM(CASE WHEN l.source_country IS NOT NULL THEN 1 ELSE 0 END) AS with_country,
      SUM(CASE WHEN l.status NOT IN ('EXPECTED','LANDED') THEN 1 ELSE 0 END) AS received,
      SUM(CASE WHEN l.status NOT IN ('EXPECTED','LANDED') AND EXISTS (SELECT 1 FROM goods_receipt_line g WHERE g.lot_id = l.id AND g.org_id = ${orgId}) THEN 1 ELSE 0 END) AS with_receipt,
      SUM(CASE WHEN l.status NOT IN ('EXPECTED','LANDED') AND l.temperature_at_receiving_c IS NOT NULL THEN 1 ELSE 0 END) AS with_temp,
      SUM(CASE WHEN l.quantity_allocated_kg > 0 OR l.status IN ('ALLOCATED','PARTIALLY_ALLOCATED','DISPATCHED','CLOSED') THEN 1 ELSE 0 END) AS allocated,
      SUM(CASE WHEN EXISTS (
        SELECT 1 FROM allocation a JOIN catch_lot x ON x.id = a.lot_id
        WHERE a.org_id = ${orgId} AND a.status <> 'RELEASED' AND (x.id = l.id OR x.root_lot_id = l.id)
      ) THEN 1 ELSE 0 END) AS with_customer
    FROM lots l
    GROUP BY l.market_date
    ORDER BY l.market_date DESC`);
  return r.map((x) => ({
    marketDate: x.market_date,
    lots: n(x.lots),
    checks: [
      { key: "vendor", label: "Vendor recorded", num: n(x.with_vendor), den: n(x.lots) },
      { key: "source", label: "Vessel / farm recorded", num: n(x.with_source), den: n(x.lots) },
      { key: "country", label: "Source country", num: n(x.with_country), den: n(x.lots) },
      { key: "receipt", label: "Goods receipt (received lots)", num: n(x.with_receipt), den: n(x.received) },
      { key: "temp", label: "Receiving temperature (received lots)", num: n(x.with_temp), den: n(x.received) },
      { key: "customer", label: "Downstream customer link (allocated lots)", num: n(x.with_customer), den: n(x.allocated) },
    ],
  }));
}

/** Species that were actually purchased recently, most-purchased first — for the price-trend selector. */
export async function purchasedSpecies(orgId: string, marketDate: string, days = 90) {
  const from = addDays(marketDate, -days);
  const r = await rows<{ id: string; name: string; kg: string }>(sql`
    SELECT sp.id, sp.canonical_name AS name, SUM(pol.quantity_kg) AS kg
    FROM purchase_order_line pol JOIN purchase_order po ON po.id = pol.purchase_order_id JOIN species sp ON sp.id = pol.species_id
    WHERE po.org_id = ${orgId} AND po.market_date BETWEEN ${from} AND ${marketDate} AND po.status NOT IN ('CANCELLED','DRAFT')
    GROUP BY sp.id, sp.canonical_name ORDER BY SUM(pol.quantity_kg) DESC`);
  return r.map((x) => ({ id: x.id, name: x.name, kg: n(x.kg) }));
}
