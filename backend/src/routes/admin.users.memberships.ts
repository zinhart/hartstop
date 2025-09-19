import { Router } from "express";
import { q } from "../db";
import { requireAdmin } from "../auth/rbac";
import { decodeCursor, encodeCursor } from "../db/pagination";
import { maybeNotModified } from "../db/etag";

const r = Router();

/** List engagements for a user (cursor pagination) */
r.get("/api/v1/admin/users/:user_uuid/engagements", requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const cursor = decodeCursor(String(req.query.cursor ?? "") || null);
    const params: any[] = [req.params.user_uuid];

    let keyset = "";
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      keyset = `AND (e.created_at, e.engagement_uuid) < ($${params.length-1}::timestamptz, $${params.length}::uuid) `;
    }
    params.push(limit + 1);

    const { rows } = await q(`
      SELECT e.engagement_uuid, e.engagement_name, e.start_ts, e.end_ts, e.created_at
      FROM engagement_users eu
      JOIN engagements e ON e.engagement_uuid = eu.engagement_uuid
      WHERE eu.user_uuid = $1
      ${keyset}
      ORDER BY e.created_at DESC, e.engagement_uuid DESC
      LIMIT $${params.length}
    `, params);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore
      ? encodeCursor(last.created_at.toISOString?.() ?? last.created_at, last.engagement_uuid)
      : null;

    const body = { items, nextCursor };
    if (maybeNotModified(req, res, body)) return;
    res.json(body);
  } catch (e) { next(e); }
});

/** Add engagements to a user */
r.post("/api/v1/admin/users/:user_uuid/engagements", requireAdmin, async (req, res, next) => {
  try {
    const arr: string[] = req.body?.engagement_uuids ?? [];
    if (!arr.length) return res.status(400).json({ error: "engagement_uuids_required" });

    await q(
      `INSERT INTO engagement_users(engagement_uuid, user_uuid)
       SELECT unnest($1::uuid[]), $2
       ON CONFLICT DO NOTHING`,
      [arr, req.params.user_uuid]
    );
    res.status(204).end();
  } catch (e) { next(e); }
});

/** Remove user from one engagement */
r.delete("/api/v1/admin/users/:user_uuid/engagements/:engagement_uuid", requireAdmin, async (req, res, next) => {
  try {
    await q(
      `DELETE FROM engagement_users WHERE user_uuid=$1 AND engagement_uuid=$2`,
      [req.params.user_uuid, req.params.engagement_uuid]
    );
    res.status(204).end();
  } catch (e) { next(e); }
});

export default r;
