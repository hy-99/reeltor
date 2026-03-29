import { Pool } from "pg";

import { env, requireDatabaseUrl } from "../config/env.js";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    connectionString: requireDatabaseUrl(),
    max: Math.max(env.BATCH_SIZE + 4, 8),
    application_name: env.WORKER_NAME,
  });

  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
}
