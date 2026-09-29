import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "@/lib/db/client";
import * as S from "@/lib/db/schema";
import { seedDemo, type SeedResult } from "@/lib/demo/seed";
import type { Ctx } from "@/lib/services/context";
import { atMarketTime } from "@/lib/domain/time";

let seeded: SeedResult | null = null;

/** Fresh schema + a small demo seed (3 nights of history) in the dedicated test database. */
export async function setupTestDb(): Promise<SeedResult> {
  if (seeded) return seeded;
  if (!/_test\b/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing to run integration tests against a non-test database");
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await migrate(db, { migrationsFolder: "./drizzle" });
  seeded = await seedDemo({ realNow: new Date("2026-09-29T10:00:00Z"), historyNights: 3 });
  return seeded;
}

export async function userCtx(orgId: string, email: string, hhmm: string, marketDate: string): Promise<Ctx> {
  const [u] = await db.select().from(S.user).where(eq(S.user.email, email));
  return { orgId, actor: { type: "USER", id: u.id, label: u.name }, source: "WEB", now: atMarketTime(marketDate, hhmm) };
}

export async function vendorByCode(orgId: string, code: string) {
  const [v] = await db.select().from(S.vendor).where(and(eq(S.vendor.orgId, orgId), eq(S.vendor.code, code)));
  return v;
}
export async function speciesByCode(orgId: string, code: string) {
  const [s] = await db.select().from(S.species).where(and(eq(S.species.orgId, orgId), eq(S.species.code, code)));
  return s;
}
export async function count(q: ReturnType<typeof sql>) {
  const r = await db.execute(q);
  return Number((r.rows[0] as { n: number }).n);
}
export { db, S, sql, eq, and };
