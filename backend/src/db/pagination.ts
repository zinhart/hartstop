// src/db/pagination.ts  (cursor = base64("created_at|uuid"))

// Cursor format: base64url("created_at ISO|uuid")
export function encodeCursor(createdAt: string, id: string) {
  return Buffer.from(`${createdAt}|${id}`).toString("base64url");
}
export function decodeCursor(cursor?: string | null) {
  if (!cursor) return null;
  const [createdAt, id] = Buffer.from(cursor, "base64url").toString().split("|");
  return { createdAt, id };
}

/**
 * Build WHERE + ORDER for keyset pagination on (created_at, id)
 * order: 'desc' (default) or 'asc'
 * Returns {cmp, orderDir} to append to SQL
 */
export function keysetCompare(cursor: {createdAt:string,id:string}|null, order: "desc"|"asc" = "desc") {
  if (!cursor) return { clause: "", params: [] as any[], orderDir: order.toUpperCase() };
  // When DESC, we want rows strictly "before" the cursor:
  // (created_at, id) < (cursor.createdAt, cursor.id)
  // When ASC, we want rows strictly "after" the cursor.
  const op = order === "desc" ? "<" : ">";
  return {
    clause: `AND (created_at, %I) ${op} (to_timestamp($1, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')::timestamptz, $2)`,
    params: [cursor.createdAt, cursor.id],
    orderDir: order.toUpperCase()
  };
}
