/**
 * Finance read models for the Bills, Invoices and Reconciliation screens. Tenant-scoped, parameterised.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { addDays } from "@/lib/domain/time";

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export type Ageing = { outstanding: number; count: number; notDue: number; notDueN: number; dueSoon: number; dueSoonN: number; overdue: number; overdueN: number };

function toAgeing(r: Record<string, unknown> | undefined): Ageing {
  return {
    outstanding: n(r?.outstanding), count: n(r?.count),
    notDue: n(r?.not_due), notDueN: n(r?.not_due_n),
    dueSoon: n(r?.due_soon), dueSoonN: n(r?.due_soon_n),
    overdue: n(r?.overdue), overdueN: n(r?.overdue_n),
  };
}

/** AP ageing over unpaid supplier invoices, relative to `today` (SGT calendar date). */
export async function apAgeing(orgId: string, today: string): Promise<Ageing> {
  const soon = addDays(today, 7);
  const r = await db.execute(sql`
    SELECT SUM(total) AS outstanding, COUNT(*) AS count,
      SUM(CASE WHEN due_date IS NULL OR due_date > ${soon}::date THEN total ELSE 0 END) AS not_due,
      SUM(CASE WHEN due_date IS NULL OR due_date > ${soon}::date THEN 1 ELSE 0 END) AS not_due_n,
      SUM(CASE WHEN due_date BETWEEN ${today}::date AND ${soon}::date THEN total ELSE 0 END) AS due_soon,
      SUM(CASE WHEN due_date BETWEEN ${today}::date AND ${soon}::date THEN 1 ELSE 0 END) AS due_soon_n,
      SUM(CASE WHEN due_date < ${today}::date THEN total ELSE 0 END) AS overdue,
      SUM(CASE WHEN due_date < ${today}::date THEN 1 ELSE 0 END) AS overdue_n
    FROM supplier_invoice WHERE org_id = ${orgId} AND payment_status <> 'PAID'`);
  return toAgeing(r.rows[0] as Record<string, unknown>);
}

/** AR ageing over unpaid customer tax invoices (credit notes shown separately). */
export async function arAgeing(orgId: string, today: string): Promise<Ageing & { openCredits: number }> {
  const soon = addDays(today, 7);
  const [r, c] = await Promise.all([
    db.execute(sql`
      SELECT SUM(total) AS outstanding, COUNT(*) AS count,
        SUM(CASE WHEN due_date IS NULL OR due_date > ${soon}::date THEN total ELSE 0 END) AS not_due,
        SUM(CASE WHEN due_date IS NULL OR due_date > ${soon}::date THEN 1 ELSE 0 END) AS not_due_n,
        SUM(CASE WHEN due_date BETWEEN ${today}::date AND ${soon}::date THEN total ELSE 0 END) AS due_soon,
        SUM(CASE WHEN due_date BETWEEN ${today}::date AND ${soon}::date THEN 1 ELSE 0 END) AS due_soon_n,
        SUM(CASE WHEN due_date < ${today}::date THEN total ELSE 0 END) AS overdue,
        SUM(CASE WHEN due_date < ${today}::date THEN 1 ELSE 0 END) AS overdue_n
      FROM customer_invoice WHERE org_id = ${orgId} AND type = 'INVOICE' AND status NOT IN ('PAID','VOID','DRAFT')`),
    db.execute(sql`SELECT COALESCE(SUM(total),0) AS credits FROM customer_invoice WHERE org_id = ${orgId} AND type = 'CREDIT_NOTE' AND status NOT IN ('VOID','PAID')`),
  ]);
  return { ...toAgeing(r.rows[0] as Record<string, unknown>), openCredits: n((c.rows[0] as { credits: string }).credits) };
}

export type ReconRow = {
  id: string; invoiceNumber: string; invoiceDate: string; vendor: string; vendorId: string; total: number; matchStatus: string; paymentStatus: string;
  poId: string | null; poNumber: string | null; billedKg: number; receivedKg: number; poLines: number; receivedLines: number; over: number | null; summary: string | null;
};

export async function reconciliationList(orgId: string, statuses: string[] | null, limit = 120): Promise<ReconRow[]> {
  const r = await db.execute(sql`
    SELECT si.id, si.invoice_number, si.invoice_date, v.name AS vendor, v.id AS vendor_id, si.total, si.match_status::text AS match_status, si.payment_status,
      po.id AS po_id, po.po_number,
      (SELECT COALESCE(SUM(sil.quantity_kg),0) FROM supplier_invoice_line sil WHERE sil.supplier_invoice_id = si.id AND sil.org_id = ${orgId}) AS billed_kg,
      (SELECT COALESCE(SUM(grl.accepted_kg),0) FROM goods_receipt_line grl JOIN purchase_order_line pol ON pol.id = grl.purchase_order_line_id WHERE pol.purchase_order_id = si.purchase_order_id AND grl.org_id = ${orgId}) AS received_kg,
      (SELECT COUNT(*) FROM purchase_order_line pol WHERE pol.purchase_order_id = si.purchase_order_id AND pol.org_id = ${orgId}) AS po_lines,
      (SELECT COUNT(DISTINCT grl.purchase_order_line_id) FROM goods_receipt_line grl JOIN purchase_order_line pol ON pol.id = grl.purchase_order_line_id WHERE pol.purchase_order_id = si.purchase_order_id AND grl.org_id = ${orgId}) AS received_lines,
      si.match_result->>'potentialOverbillingExGst' AS over, si.match_result->>'summary' AS summary
    FROM supplier_invoice si
    JOIN vendor v ON v.id = si.vendor_id
    LEFT JOIN purchase_order po ON po.id = si.purchase_order_id
    WHERE si.org_id = ${orgId} ${statuses ? sql`AND si.match_status::text IN (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})` : sql``}
    ORDER BY CASE si.match_status WHEN 'EXCEPTION' THEN 0 WHEN 'UNMATCHED' THEN 1 WHEN 'MATCH_WITHIN_TOLERANCE' THEN 2 ELSE 3 END, si.invoice_date DESC, si.invoice_number DESC
    LIMIT ${limit}`);
  return (r.rows as Record<string, string | null>[]).map((x) => ({
    id: x.id!, invoiceNumber: x.invoice_number!, invoiceDate: x.invoice_date!, vendor: x.vendor!, vendorId: x.vendor_id!, total: n(x.total), matchStatus: x.match_status!, paymentStatus: x.payment_status!,
    poId: x.po_id, poNumber: x.po_number, billedKg: n(x.billed_kg), receivedKg: n(x.received_kg), poLines: n(x.po_lines), receivedLines: n(x.received_lines), over: x.over === null ? null : n(x.over), summary: x.summary,
  }));
}

export async function matchStatusCounts(orgId: string) {
  const r = await db.execute(sql`
    SELECT match_status::text AS s, COUNT(*) AS n, SUM(total) AS total, SUM(COALESCE((match_result->>'potentialOverbillingExGst')::numeric,0)) AS over
    FROM supplier_invoice WHERE org_id = ${orgId} GROUP BY match_status`);
  const m = new Map((r.rows as { s: string; n: string; total: string; over: string }[]).map((x) => [x.s, { count: n(x.n), total: n(x.total), over: n(x.over) }]));
  return (s: string) => m.get(s) ?? { count: 0, total: 0, over: 0 };
}
