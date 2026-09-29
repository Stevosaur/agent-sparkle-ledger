/**
 * Database client. Kept free of `server-only` so scripts (seed/migrate) and tests can import it.
 * A single pooled connection is reused across hot reloads in development.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, types } from "pg";
import * as schema from "./schema";

// Return DATE columns as plain 'YYYY-MM-DD' strings (no timezone shifting).
types.setTypeParser(1082, (v) => v);

const globalForDb = globalThis as unknown as { __pcPool?: Pool };

export const pool =
  globalForDb.__pcPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/pasarcatch",
    max: Number(process.env.DB_POOL_MAX ?? 10),
  });
if (process.env.NODE_ENV !== "production") globalForDb.__pcPool = pool;

export const db = drizzle(pool, { schema });
export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Either the root db or an open transaction. Services accept this so they can compose inside transactions. */
export type Executor = DB | Tx;
