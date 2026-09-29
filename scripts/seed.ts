import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/lib/db/client";
import { seedDemo } from "../src/lib/demo/seed";

async function main() {
  const existing = await db.execute(sql`SELECT count(*)::int AS n FROM organization`);
  if (Number((existing.rows[0] as { n: number }).n) > 0 && !process.argv.includes("--force")) {
    console.error("Database already has organisations. Run `npm run db:reset` (drops everything) or pass --force.");
    process.exit(1);
  }
  const t0 = Date.now();
  const r = await seedDemo({ log: (m) => console.log(`  · ${m}`) });
  console.log(`✔ DEMO data seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  tonight=${r.tonight} lastNight=${r.lastNight} demoClock=${r.demoNow.toISOString()}`, r.counts);
  console.log("  Sign in: procurement@demo.pasarcatch.sg / pasarcatch-demo (see README for all demo users)");
  await pool.end();
}
main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
