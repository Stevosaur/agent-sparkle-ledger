import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../../src/lib/db/client";
import { getMarket } from "../../src/lib/services/market";
async function main() {
  const [org] = (await db.execute(sql`select id from organization where slug='selat-fresh-demo'`)).rows as {id:string}[];
  for (const d of ["2026-09-28","2026-09-29"]) {
    console.log("== market", d);
    for (const r of await getMarket(org.id, d)) console.log(r.code.padEnd(4), String(r.supplyKg).padStart(7), String(r.demandKg).padStart(7), String(r.offeredKg).padStart(6), String(r.availableKg).padStart(6), r.statusLabel, r.flags.join(","));
  }
  const q = async (label: string, s: ReturnType<typeof sql>) => console.log(label, JSON.stringify((await db.execute(s)).rows));
  await q("approvals", sql`select kind, status, count(*) from approval group by 1,2 order by 1,2`);
  await q("exceptions", sql`select type, severity, status, title from ops_exception order by opened_at`);
  await q("events", sql`select status, count(*) from domain_event group by 1`);
  await q("failed", sql`select type, error from domain_event where status <> 'DONE' limit 5`);
  await q("runs", sql`select agent, status, count(*) from agent_run group by 1,2 order by 1`);
  await q("invoices lastnight", sql`select si.invoice_number, si.match_status, si.match_result->>'summary' s from supplier_invoice si join purchase_order po on po.id=si.purchase_order_id where po.market_date='2026-09-28'`);
  await q("so tonight", sql`select status, count(*) from sales_order where market_date='2026-09-29' group by 1`);
  await q("so lastnight", sql`select status, count(*) from sales_order where market_date='2026-09-28' group by 1`);
  await q("lots tonight", sql`select status, confirmation, (purchase_order_line_id is not null) bought, count(*) from catch_lot where market_date='2026-09-29' group by 1,2,3`);
  await pool.end();
}
main();
