import { Router } from "express";
import { q } from "../db";
import { requireRole } from "../auth/rbac";
import { decodeCursor, encodeCursor } from "../db/pagination";
import { maybeNotModified } from "../db/etag";

const r = Router();

/** Create dirwalk (large JSON payload) */
r.post("/api/v1/dirwalks", requireRole("Operator","Admin"), async (req, res, next) => {
  try {
    const { engagement_uuid, agent_uuid, payload } = req.body;
    const { rows } = await q(`
      INSERT INTO dirwalks(engagement_uuid, agent_uuid, payload)
      VALUES ($1,$2,$3)
      RETURNING engagement_uuid, agent_uuid, created_at
    `, [engagement_uuid, agent_uuid, payload]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

/** Get dirwalk by synthetic key (created_at+agent+engagement) — or add a surrogate id in schema if preferred */
r.get("/api/v1/dirwalks/:agent_uuid/:created_at",
  requireRole("Analyst","Operator","Admin"),
  async (req, res, next) => {
    try {
      const { rows } = await q(`
        SELECT engagement_uuid, agent_uuid, created_at, payload
        FROM dirwalks WHERE agent_uuid=$1 AND created_at=$2::timestamptz
      `, [req.params.agent_uuid, req.params.created_at]);
      if (!rows[0]) return res.status(404).json({ error: "not_found" });
      if (maybeNotModified(req, res, rows[0])) return;
      res.json(rows[0]);
    } catch (e) { next(e); }
});

/** List dirwalks by agent (cursor + window) */
r.get("/api/v1/agents/:agent_uuid/dirwalks", requireRole("Analyst","Operator","Admin"), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const cursor = decodeCursor(String(req.query.cursor ?? "") || null);
    const from = req.query.from ? String(req.query.from) : null;
    const to   = req.query.to   ? String(req.query.to)   : null;

    const params: any[] = [req.params.agent_uuid];
    let where = `WHERE agent_uuid=$1 `;
    if (from) { params.push(from); where += `AND created_at >= $${params.length}::timestamptz `; }
    if (to)   { params.push(to);   where += `AND created_at <  $${params.length}::timestamptz `; }

    let keyset = "";
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      keyset = `AND (created_at, agent_uuid) < ($${params.length-1}::timestamptz, $${params.length}::uuid) `;
    }
    params.push(limit + 1);

    const { rows } = await q(`
      SELECT engagement_uuid, agent_uuid, created_at
      FROM dirwalks
      ${where}
      ${keyset}
      ORDER BY created_at DESC, agent_uuid DESC
      LIMIT $${params.length}
    `, params);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0,-1) : rows;
    const last = items[items.length-1];
    const nextCursor = hasMore ? encodeCursor(last.created_at.toISOString?.() ?? last.created_at, last.agent_uuid) : null;

    if (maybeNotModified(req, res, { items, nextCursor })) return;
    res.json({ items, nextCursor });
  } catch (e) { next(e); }
});

export default r;
