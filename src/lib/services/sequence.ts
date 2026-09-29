import { sql } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";

/** Gap-free, per-tenant document numbering (atomic upsert). */
export async function nextSeq(x: Executor, orgId: string, key: string): Promise<number> {
  const r = await x.execute<{ value: number }>(sql`
    INSERT INTO sequence_counter (org_id, key, value) VALUES (${orgId}, ${key}, 1)
    ON CONFLICT (org_id, key) DO UPDATE SET value = sequence_counter.value + 1
    RETURNING value`);
  return Number(r.rows[0].value);
}

export async function nextNumber(x: Executor, orgId: string, prefix: string, scope = "", width = 4): Promise<string> {
  const n = await nextSeq(x, orgId, `${prefix}${scope}`);
  return `${prefix}${scope ? `-${scope}` : ""}-${String(n).padStart(width, "0")}`;
}
