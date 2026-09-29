import "dotenv/config";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL!;
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset in production");
  const pool = new Pool({ connectionString: url });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  console.log("✔ database reset");
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
