// src/routes/tasking.ts
import { Router } from "express";
import { q } from "../db";
import { requireRole, requireAdmin } from "../auth/rbac";
import { decodeCursor, encodeCursor } from "../db/pagination";
import { maybeNotModified } from "../db/etag";

const r = Router();

/**
 * POST /api/v1/tasking
 * Define a task (name, min role)
 * Body: { task_long_name: string, task_permission: 'Analyst'|'Operator'|'Admin' }
 */
r.post("/api/v1/tasking", requireRole("Operator", "Admin"), async (req, res, next) => {
  try {
    const { task_long_name, task_permission } = req.body;
    if (!task_long_name || !task_permission) {
      return res.status(400).json({ error: "task_long_name_and_task_permission_required" });
    }
    const { rows } = await q(
      `INSERT INTO tasking (task_long_name, task_permission)
       VALUES ($1, $2)
       RETURNING task_uuid, task_long_name, task_permission, created_at`,
      [task_long_name, task_permission]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

/**
 * GET /api/v1/tasking
 * List tasks (filters + cursor pagination)
 * Query: ?min_role=Operator&limit=50&cursor=...
 * Returns: { items: [...], nextCursor: string|null }
 */
r.get("/api/v1/tasking", requireRole("Analyst", "Operator", "Admin"), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const cursor = decodeCursor(String(req.query.cursor ?? "") || null);
    const minRole = req.query.min_role as string | undefined;

    const params: any[] = [];
    let where = "WHERE 1=1 ";
    if (minRole) { params.push(minRole); where += `AND task_permission >= $${params.length}::role_enum `; }
    // Note: role_enum has an order only if defined; if not, just use equality filter:
    // if (minRole) { params.push(minRole); where += `AND task_permission = $${params.length} `; }

    let keyset = "";
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      keyset = `AND (created_at, task_uuid) < ($${params.length-1}::timestamptz, $${params.length}::uuid) `;
    }
    params.push(limit + 1);

    const { rows } = await q(
      `SELECT task_uuid, task_long_name, task_permission, created_at
       FROM tasking
       ${where}
       ${keyset}
       ORDER BY created_at DESC, task_uuid DESC
       LIMIT $${params.length}`,
      params
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore
      ? encodeCursor(last.created_at.toISOString?.() ?? last.created_at, last.task_uuid)
      : null;

    const body = { items, nextCursor };
    if (maybeNotModified(req, res, body)) return;
    res.json(body);
  } catch (e) { next(e); }
});

/**
 * GET /api/v1/tasking/:task_uuid
 * Get a single task definition
 */
r.get("/api/v1/tasking/:task_uuid", requireRole("Analyst", "Operator", "Admin"), async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT task_uuid, task_long_name, task_permission, created_at
       FROM tasking WHERE task_uuid=$1`,
      [req.params.task_uuid]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    if (maybeNotModified(req, res, rows[0])) return;
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/**
 * PATCH /api/v1/tasking/:task_uuid
 * Update task name and/or minimum role
 * Body: { task_long_name?, task_permission? }
 */
r.patch("/api/v1/tasking/:task_uuid", requireRole("Operator", "Admin"), async (req, res, next) => {
  try {
    const { task_long_name, task_permission } = req.body;
    const { rows } = await q(
      `UPDATE tasking SET
         task_long_name   = COALESCE($2, task_long_name),
         task_permission  = COALESCE($3, task_permission)
       WHERE task_uuid = $1
       RETURNING task_uuid, task_long_name, task_permission, created_at`,
      [req.params.task_uuid, task_long_name ?? null, task_permission ?? null]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/**
 * DELETE /api/v1/tasking/:task_uuid
 * Admin-only delete (ensure safe: deny if referenced, or rely on FK with RESTRICT)
 */
r.delete("/api/v1/tasking/:task_uuid", requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await q(
      `DELETE FROM tasking WHERE task_uuid=$1 RETURNING task_uuid`,
      [req.params.task_uuid]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ task_uuid: rows[0].task_uuid, deleted: true });
  } catch (e) { next(e); }
});

export default r;
