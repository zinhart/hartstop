import { Router } from "express";
import { q } from "../db";
import { requireRole, requireAdmin, requireEngagementAccess } from "../auth/rbac";
import { decodeCursor, encodeCursor } from "../db/pagination";
import { maybeNotModified } from "../db/etag";

const r = Router();

/** Create engagement */
r.post("/api/v1/engagements", requireRole("Operator","Admin"), async (req, res, next) => {
  try {
    const { engagement_name, start_ts, end_ts } = req.body;
    const { rows } = await q(`
      INSERT INTO engagements (engagement_name, start_ts, end_ts)
      VALUES ($1,$2,$3)
      RETURNING engagement_uuid, engagement_name, start_ts, end_ts, created_at
    `, [engagement_name, start_ts, end_ts ?? null]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

/** List engagements (cursor pagination) */
r.get("/api/v1/engagements", requireRole("Analyst","Operator","Admin"), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const cursor = decodeCursor(String(req.query.cursor ?? "") || null);
    const activeOnly = String(req.query.active_only ?? "false") === "true";
    const nameLike = req.query.name ?? null;

    const params: any[] = [];
    let where = "WHERE 1=1 ";
    if (activeOnly) where += "AND (end_ts IS NULL OR end_ts > now()) ";
    if (nameLike) { params.push(`%${nameLike}%`); where += `AND engagement_name ILIKE $${params.length} `; }

    // Keyset where
    let keysetClause = "";
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      keysetClause = `AND (created_at, engagement_uuid) < ($${params.length-1}::timestamptz, $${params.length}::uuid) `;
    }

    params.push(limit + 1);
    const { rows } = await q(`
      SELECT engagement_uuid, engagement_name, start_ts, end_ts, created_at
      FROM engagements
      ${where}
      ${keysetClause}
      ORDER BY created_at DESC, engagement_uuid DESC
      LIMIT $${params.length}
    `, params);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const nextCursor = hasMore ? encodeCursor(items[items.length-1].created_at.toISOString?.() ?? items[items.length-1].created_at, items[items.length-1].engagement_uuid) : null;

    if (maybeNotModified(req, res, { items, nextCursor })) return;
    res.json({ items, nextCursor });
  } catch (e) { next(e); }
});

/** Get one engagement */
r.get("/api/v1/engagements/:engagement_uuid",
  requireEngagementAccess("engagement_uuid"),
  async (req, res, next) => {
    try {
      const { rows } = await q(`
        SELECT engagement_uuid, engagement_name, start_ts, end_ts, created_at
        FROM engagements WHERE engagement_uuid=$1
      `, [req.params.engagement_uuid]);
      if (!rows[0]) return res.status(404).json({ error: "not_found" });
      if (maybeNotModified(req, res, rows[0])) return;
      res.json(rows[0]);
    } catch (e) { next(e); }
});

/** Update engagement */
r.patch("/api/v1/engagements/:engagement_uuid", requireRole("Operator","Admin"),
  requireEngagementAccess("engagement_uuid"),
  async (req, res, next) => {
    try {
      const { engagement_name, start_ts, end_ts } = req.body;
      const { rows } = await q(`
        UPDATE engagements SET
          engagement_name = COALESCE($2, engagement_name),
          start_ts = COALESCE($3, start_ts),
          end_ts = COALESCE($4, end_ts)
        WHERE engagement_uuid=$1
        RETURNING engagement_uuid, engagement_name, start_ts, end_ts, created_at
      `, [req.params.engagement_uuid, engagement_name ?? null, start_ts ?? null, end_ts ?? null]);
      if (!rows[0]) return res.status(404).json({ error: "not_found" });
      res.json(rows[0]);
    } catch (e) { next(e); }
});

/** Delete engagement (Admin only) */
r.delete("/api/v1/engagements/:engagement_uuid", requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await q(`DELETE FROM engagements WHERE engagement_uuid=$1 RETURNING engagement_uuid`, [req.params.engagement_uuid]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ engagement_uuid: rows[0].engagement_uuid, deleted: true });
  } catch (e) { next(e); }
});

/** Membership: list users */
r.get("/api/v1/engagements/:engagement_uuid/users",
  requireEngagementAccess("engagement_uuid"),
  async (req, res, next) => {
    try {
      const { rows } = await q(`
        SELECT eu.user_uuid, u.username
        FROM engagement_users eu JOIN users u USING(user_uuid)
        WHERE eu.engagement_uuid=$1
        ORDER BY u.username ASC
      `, [req.params.engagement_uuid]);
      if (maybeNotModified(req, res, rows)) return;
      res.json(rows);
    } catch (e) { next(e); }
});

/** Membership: add users */
r.post("/api/v1/engagements/:engagement_uuid/users", requireRole("Operator","Admin"),
  requireEngagementAccess("engagement_uuid"),
  async (req, res, next) => {
    try {
      const users: string[] = req.body.user_uuids ?? [];
      if (!users.length) return res.status(400).json({ error: "user_uuids_required" });
      await q(`INSERT INTO engagement_users(engagement_uuid,user_uuid)
               SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`, [req.params.engagement_uuid, users]);
      res.status(204).end();
    } catch (e) { next(e); }
});

/** Membership: remove */
r.delete("/api/v1/engagements/:engagement_uuid/users/:user_uuid", requireRole("Operator","Admin"),
  requireEngagementAccess("engagement_uuid"),
  async (req, res, next) => {
    try {
      await q(`DELETE FROM engagement_users WHERE engagement_uuid=$1 AND user_uuid=$2`,
              [req.params.engagement_uuid, req.params.user_uuid]);
      res.status(204).end();
    } catch (e) { next(e); }
});

export default r;
