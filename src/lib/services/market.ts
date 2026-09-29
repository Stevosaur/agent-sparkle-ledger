/**
 * Tonight's Market: per-species supply vs demand for a market night. All numbers computed from platform data.
 *
 * Supply definitions
 * - committed expected: lots we have bought (PO linked) that have not been received yet
 * - landed: accepted kg of received root lots (children are derived from these)
 * - offered: declared lots from suppliers not yet bought (draft or confirmed offers)
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { balanceStatus } from "@/lib/domain/procurement";
import { addDays } from "@/lib/domain/time";

export type MarketRow = {
  speciesId: string;
  code: string;
  name: string;
  localName: string | null;
  expectedKg: number;
  landedKg: number;
  offeredKg: number;
  supplyKg: number;
  demandKg: number;
  allocatedKg: number;
  availableKg: number;
  unallocatedDemandKg: number;
  wavgCost: number | null;
  indicativeSell: number | null;
  avg30Cost: number | null;
  gapKg: number;
  balance: "SHORTAGE" | "BALANCED" | "SURPLUS";
  flags: ("LATE SUPPLY" | "PRICE SPIKE")[];
  statusLabel: string;
  lotCount: number;
  lateLots: number;
};

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const nn = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function getMarket(orgId: string, marketDate: string): Promise<MarketRow[]> {
  const from30 = addDays(marketDate, -30);
  const r = await db.execute(sql`
    WITH lots AS (
      SELECT l.*, (l.purchase_order_line_id IS NOT NULL) AS bought
      FROM catch_lot l WHERE l.org_id = ${orgId} AND l.market_date = ${marketDate} AND l.species_id IS NOT NULL
    ),
    supply AS (
      SELECT species_id,
        SUM(CASE WHEN bought AND status IN ('EXPECTED','LANDED') THEN quantity_declared_kg ELSE 0 END) AS expected_kg,
        SUM(CASE WHEN parent_lot_id IS NULL AND status NOT IN ('EXPECTED','LANDED','REJECTED') THEN COALESCE(quantity_received_kg,0) - quantity_rejected_kg ELSE 0 END) AS landed_kg,
        SUM(CASE WHEN NOT bought AND parent_lot_id IS NULL AND status IN ('EXPECTED','LANDED') THEN quantity_declared_kg ELSE 0 END) AS offered_kg,
        SUM(CASE WHEN status IN ('AVAILABLE','PARTIALLY_ALLOCATED','ALLOCATED','INSPECTED','RECEIVED') THEN quantity_available_kg ELSE 0 END) AS available_kg,
        SUM(CASE WHEN bought AND parent_lot_id IS NULL AND status <> 'REJECTED' THEN COALESCE(agreed_cost_per_kg, asking_price_per_kg, 0) * COALESCE(quantity_received_kg - quantity_rejected_kg, quantity_declared_kg) ELSE 0 END) AS cost_value,
        SUM(CASE WHEN bought AND parent_lot_id IS NULL AND status <> 'REJECTED' AND COALESCE(agreed_cost_per_kg, asking_price_per_kg) IS NOT NULL THEN COALESCE(quantity_received_kg - quantity_rejected_kg, quantity_declared_kg) ELSE 0 END) AS cost_kg,
        COUNT(*) FILTER (WHERE parent_lot_id IS NULL AND status <> 'REJECTED') AS lot_count,
        COUNT(*) FILTER (WHERE status IN ('EXPECTED','LANDED') AND bought AND original_eta IS NOT NULL AND expected_arrival_at > original_eta + interval '30 minutes') AS late_lots
      FROM lots GROUP BY species_id
    ),
    demand AS (
      SELECT sol.species_id, SUM(sol.requested_kg) AS demand_kg, SUM(sol.allocated_kg) AS allocated_kg,
             SUM(sol.price_per_kg * sol.requested_kg) / NULLIF(SUM(sol.requested_kg),0) AS sell_price
      FROM sales_order_line sol JOIN sales_order so ON so.id = sol.sales_order_id
      WHERE so.org_id = ${orgId} AND so.market_date = ${marketDate} AND so.status NOT IN ('CANCELLED','DRAFT')
      GROUP BY sol.species_id
    ),
    hist AS (
      SELECT pol.species_id, SUM(pol.price_per_kg * pol.quantity_kg) / NULLIF(SUM(pol.quantity_kg),0) AS avg30
      FROM purchase_order_line pol JOIN purchase_order po ON po.id = pol.purchase_order_id
      WHERE po.org_id = ${orgId} AND po.market_date >= ${from30} AND po.market_date < ${marketDate} AND po.status NOT IN ('CANCELLED','DRAFT')
      GROUP BY pol.species_id
    )
    SELECT s.id AS species_id, s.code, s.canonical_name AS name, s.local_names[1] AS local_name, s.indicative_markup_pct,
      sp.expected_kg, sp.landed_kg, sp.offered_kg, sp.available_kg, sp.cost_value, sp.cost_kg, sp.lot_count, sp.late_lots,
      d.demand_kg, d.allocated_kg, d.sell_price, h.avg30
    FROM species s
    LEFT JOIN supply sp ON sp.species_id = s.id
    LEFT JOIN demand d ON d.species_id = s.id
    LEFT JOIN hist h ON h.species_id = s.id
    WHERE s.org_id = ${orgId} AND (sp.species_id IS NOT NULL OR d.species_id IS NOT NULL)
    ORDER BY s.canonical_name`);

  return (r.rows as Record<string, unknown>[]).map((row) => {
    const expectedKg = n(row.expected_kg);
    const landedKg = n(row.landed_kg);
    const supplyKg = expectedKg + landedKg;
    const demandKg = n(row.demand_kg);
    const allocatedKg = n(row.allocated_kg);
    const costKg = n(row.cost_kg);
    const wavgCost = costKg > 0 ? Math.round((n(row.cost_value) / costKg) * 100) / 100 : null;
    const avg30 = nn(row.avg30) === null ? null : Math.round(n(row.avg30) * 100) / 100;
    const sell = nn(row.sell_price) ?? (wavgCost ? wavgCost * (1 + n(row.indicative_markup_pct) / 100) : null);
    const { status, gapKg } = balanceStatus(demandKg, supplyKg);
    const flags: MarketRow["flags"] = [];
    if (n(row.late_lots) > 0) flags.push("LATE SUPPLY");
    if (wavgCost && avg30 && wavgCost > avg30 * 1.1) flags.push("PRICE SPIKE");
    const statusLabel = status === "SHORTAGE" ? `SHORT ${Math.abs(Math.round(gapKg))} KG` : status === "SURPLUS" ? `SURPLUS ${Math.round(gapKg)} KG` : "BALANCED";
    return {
      speciesId: String(row.species_id),
      code: String(row.code),
      name: String(row.name),
      localName: (row.local_name as string) ?? null,
      expectedKg: round1(expectedKg),
      landedKg: round1(landedKg),
      offeredKg: round1(n(row.offered_kg)),
      supplyKg: round1(supplyKg),
      demandKg: round1(demandKg),
      allocatedKg: round1(allocatedKg),
      availableKg: round1(n(row.available_kg)),
      unallocatedDemandKg: round1(Math.max(0, demandKg - allocatedKg)),
      wavgCost,
      indicativeSell: sell === null ? null : Math.round(sell * 100) / 100,
      avg30Cost: avg30,
      gapKg,
      balance: status,
      flags,
      statusLabel,
      lotCount: n(row.lot_count),
      lateLots: n(row.late_lots),
    };
  });
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export async function getDashboardKpis(orgId: string, marketDate: string) {
  const rows = await getMarket(orgId, marketDate);
  const r = await db.execute(sql`
    SELECT
      (SELECT COUNT(DISTINCT COALESCE(vessel_id::text, farm_id::text, vendor_id::text)) FROM catch_lot
         WHERE org_id = ${orgId} AND market_date = ${marketDate} AND status IN ('EXPECTED','LANDED') AND parent_lot_id IS NULL AND purchase_order_line_id IS NOT NULL) AS inbound,
      (SELECT COUNT(*) FROM shipment_stop st JOIN shipment sh ON sh.id = st.shipment_id WHERE sh.org_id = ${orgId} AND sh.market_date = ${marketDate} AND sh.status <> 'CANCELLED') AS deliveries,
      (SELECT COUNT(*) FROM ops_exception WHERE org_id = ${orgId} AND status <> 'RESOLVED') AS exceptions,
      (SELECT COUNT(*) FROM approval WHERE org_id = ${orgId} AND status = 'PENDING') AS approvals,
      (SELECT COUNT(*) FROM catch_lot WHERE org_id = ${orgId} AND market_date = ${marketDate} AND confirmation = 'DRAFT' AND status = 'EXPECTED') AS drafts`);
  const k = r.rows[0] as Record<string, unknown>;
  return {
    expectedSupplyKg: round1(rows.reduce((a, x) => a + x.supplyKg, 0)),
    offeredKg: round1(rows.reduce((a, x) => a + x.offeredKg, 0)),
    confirmedDemandKg: round1(rows.reduce((a, x) => a + x.demandKg, 0)),
    shortages: rows.filter((x) => x.balance === "SHORTAGE").length,
    shortageKg: round1(rows.filter((x) => x.balance === "SHORTAGE").reduce((a, x) => a - x.gapKg, 0)),
    atRiskSurplusKg: round1(rows.filter((x) => x.balance === "SURPLUS").reduce((a, x) => a + x.gapKg, 0)),
    inboundVessels: n(k.inbound),
    deliveriesPlanned: n(k.deliveries),
    exceptions: n(k.exceptions),
    pendingApprovals: n(k.approvals),
    draftLots: n(k.drafts),
    rows,
  };
}
