import { execSync } from "node:child_process";

export default async function globalSetup() {
  const DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/pasarcatch_e2e";
  if (!/_e2e\b/.test(DB)) throw new Error("E2E database name must end with _e2e");
  const env = { ...process.env, DATABASE_URL: DB, NODE_ENV: "test" } as NodeJS.ProcessEnv;
  execSync("npx tsx scripts/reset.ts && npx tsx scripts/migrate.ts && npx tsx scripts/seed.ts", { stdio: "inherit", env });
}
