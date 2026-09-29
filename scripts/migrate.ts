import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../src/lib/db/client";

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✔ migrations applied");
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
