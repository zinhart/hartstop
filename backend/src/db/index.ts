// src/db/index.ts
import { Pool } from "pg";
import { cfg } from "../config";

export const pool = new Pool({ connectionString: cfg.pg.connectionString, ssl: cfg.pg.ssl });

// simple helper
export async function q<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  const client = await pool.connect();
  try {
    return await client.query<T>(text, params);
  } finally {
    client.release();
  }
}
