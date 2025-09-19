// src/db/idempotency.ts
import { q } from "./index";

export async function beginIdempotent(key: string) {
  const sql = `INSERT INTO api_idempotency(key,status) VALUES ($1,1) ON CONFLICT (key) DO NOTHING RETURNING key;`;
  const { rows } = await q(sql, [key]);
  return rows.length > 0; // true if we "won" the insert
}

export async function getIdempotent(key: string) {
  const { rows } = await q(`SELECT status, response_etag, response_body FROM api_idempotency WHERE key=$1`, [key]);
  return rows[0];
}

export async function finishIdempotent(key: string, etag: string, body: any) {
  await q(`UPDATE api_idempotency SET status=2, response_etag=$2, response_body=$3 WHERE key=$1`, [key, etag, body]);
}
