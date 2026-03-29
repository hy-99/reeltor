import { Pool } from "pg";

import { env } from "../config/env.js";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (pool) {
    return pool;
  }

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for database-backed worker mode.");
  }

  pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.REELTOR_DB_POOL_MAX,
  });

  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = undefined;
}
