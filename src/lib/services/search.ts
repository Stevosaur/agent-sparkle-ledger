/**
 * Global search across species (incl. aliases), vendors, customers, lots, orders, POs, invoices and documents.
 * Tenant-scoped, parameterised, and tolerant of partial lot numbers like "LOT-0048" or "0048".
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export type SearchHit = { type: string; id: string; title: string; subtitle: string; href: string };

export async function search(orgId: string, raw: string, limit = 30): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const digits = q.replace(/^lot-?/i, "").replace(/^inv(oice)?\s*/i, "").trim();
  const digitLike = `%${digits}%`;
  const hits: SearchHit[] = [];

  const sp = await db.execute(sql`
    SELECT DISTINCT s.id, s.canonical_name, s.chinese_name, s.malay_name, s.local_names FROM species s LEFT JOIN species_alias a ON a.species_id = s.id
    WHERE s.org_id = ${orgId} AND (s.canonical_name ILIKE ${like} OR s.chinese_name ILIKE ${like} OR s.malay_name ILIKE ${like} OR array_to_string(s.local_names, ' ') ILIKE ${like} OR a.alias ILIKE ${like} OR s.scientific_name ILIKE ${like}) LIMIT 5`);
  for (const r of sp.rows as { id: string; canonical_name: string; chinese_name: string | null; malay_name: string | null; local_names: string[] }[])
    hits.push({ type: "Species", id: r.id, title: r.canonical_name, subtitle: [r.local_names?.[0], r.chinese_name, r.malay_name].filter(Boolean).join(" · "), href: `/market/${r.id}` });

  const vs = await db.execute(sql`
    SELECT DISTINCT v.id, v.name, v.type, v.country FROM vendor v LEFT JOIN vendor_contact c ON c.vendor_id = v.id LEFT JOIN vessel ve ON ve.vendor_id = v.id LEFT JOIN farm f ON f.vendor_id = v.id
    WHERE v.org_id = ${orgId} AND (v.name ILIKE ${like} OR v.code ILIKE ${like} OR c.name ILIKE ${like} OR ve.name ILIKE ${like} OR f.name ILIKE ${like}
      OR (lower(${q}) IN ('malaysia','my') AND v.country = 'MY') OR (lower(${q}) IN ('indonesia','id') AND v.country = 'ID') OR (lower(${q}) IN ('singapore','sg') AND v.country = 'SG') OR (lower(${q}) = 'norway' AND v.country = 'NO')) LIMIT 8`);
  for (const r of vs.rows as { id: string; name: string; type: string; country: string }[])
    hits.push({ type: "Vendor", id: r.id, title: r.name, subtitle: `${r.type.replaceAll("_", " ").toLowerCase()} · ${r.country}`, href: `/vendors/${r.id}` });

  const cs = await db.execute(sql`SELECT id, name, type FROM customer WHERE org_id = ${orgId} AND (name ILIKE ${like} OR code ILIKE ${like}) LIMIT 5`);
  for (const r of cs.rows as { id: string; name: string; type: string }[]) hits.push({ type: "Customer", id: r.id, title: r.name, subtitle: r.type.replaceAll("_", " ").toLowerCase(), href: `/orders?customer=${r.id}` });

  const lots = await db.execute(sql`
    SELECT id, lot_number, canonical_species_name, supplier_species_name, status, market_date FROM catch_lot
    WHERE org_id = ${orgId} AND (lot_number ILIKE ${like} OR lot_number ILIKE ${digitLike} OR supplier_species_name ILIKE ${like}) ORDER BY market_date DESC, lot_number DESC LIMIT 8`);
  for (const r of lots.rows as { id: string; lot_number: string; canonical_species_name: string | null; supplier_species_name: string | null; status: string; market_date: string }[])
    hits.push({ type: "Lot", id: r.id, title: r.lot_number, subtitle: `${r.canonical_species_name ?? r.supplier_species_name ?? "?"} · ${r.status.toLowerCase()} · ${r.market_date}`, href: `/supply/lots/${r.id}` });

  const docs = await db.execute(sql`
    SELECT 'PO' AS t, id, po_number AS n, status AS s FROM purchase_order WHERE org_id = ${orgId} AND po_number ILIKE ${digitLike}
    UNION ALL SELECT 'SO', id, so_number, status FROM sales_order WHERE org_id = ${orgId} AND so_number ILIKE ${digitLike}
    UNION ALL SELECT 'Bill', id, invoice_number, match_status::text FROM supplier_invoice WHERE org_id = ${orgId} AND invoice_number ILIKE ${digitLike}
    UNION ALL SELECT 'Invoice', id, invoice_number, status FROM customer_invoice WHERE org_id = ${orgId} AND invoice_number ILIKE ${digitLike}
    UNION ALL SELECT 'Document', vendor_id, title || COALESCE(' · ' || reference_no, ''), status FROM vendor_document WHERE org_id = ${orgId} AND (title ILIKE ${like} OR reference_no ILIKE ${like})
    LIMIT 12`);
  const href: Record<string, (id: string) => string> = {
    PO: (id) => `/procurement/purchase-orders/${id}`,
    SO: (id) => `/orders/${id}`,
    Bill: (id) => `/finance/reconciliation/${id}`,
    Invoice: () => `/finance/invoices`,
    Document: (id) => `/vendors/${id}`,
  };
  for (const r of docs.rows as { t: string; id: string; n: string; s: string }[]) hits.push({ type: r.t === "Bill" ? "Supplier invoice" : r.t, id: r.id, title: r.n, subtitle: r.s.toLowerCase().replaceAll("_", " "), href: href[r.t](r.id) });

  if (/^late$/i.test(q)) {
    const late = await db.execute(sql`
      SELECT id, lot_number, canonical_species_name, original_eta, expected_arrival_at FROM catch_lot
      WHERE org_id = ${orgId} AND status IN ('EXPECTED','LANDED') AND original_eta IS NOT NULL AND expected_arrival_at > original_eta + interval '30 minutes' ORDER BY expected_arrival_at LIMIT 10`);
    for (const r of late.rows as { id: string; lot_number: string; canonical_species_name: string }[]) hits.unshift({ type: "Late supply", id: r.id, title: r.lot_number, subtitle: r.canonical_species_name, href: `/supply/lots/${r.id}` });
    const ld = await db.execute(sql`
      SELECT st.id, c.name, sh.shipment_number FROM shipment_stop st JOIN shipment sh ON sh.id = st.shipment_id JOIN customer c ON c.id = st.customer_id
      WHERE st.org_id = ${orgId} AND st.window_end IS NOT NULL AND COALESCE(st.actual_arrival_at, st.planned_arrival_at) > st.window_end LIMIT 10`);
    for (const r of ld.rows as { id: string; name: string; shipment_number: string }[]) hits.unshift({ type: "Late delivery", id: r.id, title: r.name, subtitle: r.shipment_number, href: `/operations/routes` });
  }
  return hits.slice(0, limit);
}
