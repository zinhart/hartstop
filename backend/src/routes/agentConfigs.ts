import { Router } from "express";
import { q } from "../db";
import { requireRole } from "../auth/rbac";
import { decodeCursor, encodeCursor } from "../db/pagination";
import { maybeNotModified } from "../db/etag";

const r = Router();

/** Create config */
r.post("/api/v1/agent-configs", requireRole("Operator","Admin"), async (req, res, next) => {
  try {
    const {
      build_uuid, build_configuration, platform, type,
      self_uninstall_sec, checkin_interval_sec, load_balancers_uuid
    } = req.body;

    const { rows } = await q(`
      INSERT INTO agent_configuration (build_uuid, build_configuration, platform, type,
        self_uninstall_sec, checkin_interval_sec, load_balancers_uuid)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING build_uuid, platform, type, created_at
    `, [build_uuid, build_configuration, platform, type, self_uninstall_sec ?? null, checkin_interval_sec ?? null, load_balancers_uuid ?? null]);

    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

/** List configs (cursor) */
r.get("/api/v1/agent-configs", requireRole("Analyst","Operator","Admin"), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const cursor = decodeCursor(String(req.query.cursor ?? "") || null);
    const platform = req.query.platform ?? null;
    const type = req.query.type ?? null;

    const params: any[] = [];
    let where = "WHERE 1=1 ";
    if (platform) { params.push(platform); where += `AND platform=$${params.length} `; }
    if (type)     { params.push(type);     where += `AND type=$${params.length} `; }

    let keyset = "";
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      keyset = `AND (created_at, build_uuid) < ($${params.length-1}::timestamptz, $${params.length}::uuid) `;
    }
    params.push(limit + 1);

    const { rows } = await q(`
      SELECT build_uuid, platform, type, created_at
      FROM agent_configuration
      ${where}
      ${keyset}
      ORDER BY created_at DESC, build_uuid DESC
      LIMIT $${params.length}
    `, params);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0,-1) : rows;
    const last = items[items.length-1];
    const nextCursor = hasMore ? encodeCursor(last.created_at.toISOString?.() ?? last.created_at, last.build_uuid) : null;

    if (maybeNotModified(req, res, { items, nextCursor })) return;
    res.json({ items, nextCursor });
  } catch (e) { next(e); }
});

/** Get one config */
r.get("/api/v1/agent-configs/:build_uuid", requireRole("Analyst","Operator","Admin"), async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT build_uuid, platform, type, self_uninstall_sec, checkin_interval_sec,
             load_balancers_uuid, build_configuration, created_at
      FROM agent_configuration WHERE build_uuid=$1
    `, [req.params.build_uuid]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    if (maybeNotModified(req, res, rows[0])) return;
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/** Update config (partial) */
r.patch("/api/v1/agent-configs/:build_uuid", requireRole("Operator","Admin"), async (req, res, next) => {
  try {
    const { build_configuration, self_uninstall_sec, checkin_interval_sec, load_balancers_uuid } = req.body;
    const { rows } = await q(`
      UPDATE agent_configuration SET
        build_configuration = COALESCE($2, build_configuration),
        self_uninstall_sec  = COALESCE($3, self_uninstall_sec),
        checkin_interval_sec= COALESCE($4, checkin_interval_sec),
        load_balancers_uuid = COALESCE($5, load_balancers_uuid)
      WHERE build_uuid=$1
      RETURNING build_uuid, platform, type, created_at
    `, [req.params.build_uuid, build_configuration ?? null, self_uninstall_sec ?? null, checkin_interval_sec ?? null, load_balancers_uuid ?? null]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/** Replace supported tasks */
r.put("/api/v1/agent-configs/:build_uuid/supported-tasks", requireRole("Operator","Admin"), async (req, res, next) => {
  try {
    const tasks: string[] = req.body.task_uuids ?? [];
    await q("DELETE FROM agent_config_supported_tasks WHERE build_uuid=$1", [req.params.build_uuid]);
    if (tasks.length) {
      await q(`
        INSERT INTO agent_config_supported_tasks(build_uuid, task_uuid)
        SELECT $1, unnest($2::uuid[])
      `, [req.params.build_uuid, tasks]);
    }
    res.status(204).end();
  } catch (e) { next(e); }
});

/** Replace configured tasks (subset) */
r.put("/api/v1/agent-configs/:build_uuid/configured-tasks", requireRole("Operator","Admin"), async (req, res, next) => {
  try {
    const tasks: string[] = req.body.task_uuids ?? [];
    await q("DELETE FROM agent_config_configured_tasks WHERE build_uuid=$1", [req.params.build_uuid]);
    if (tasks.length) {
      await q(`
        INSERT INTO agent_config_configured_tasks(build_uuid, task_uuid)
        SELECT $1, unnest($2::uuid[])
      `, [req.params.build_uuid, tasks]);
    }
    res.status(204).end();
  } catch (e) { next(e); }
});

/** Effective tasks view */
r.get("/api/v1/agent-configs/:build_uuid/tasks", requireRole("Analyst","Operator","Admin"), async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT t.task_uuid, t.task_long_name,
             (s.task_uuid IS NOT NULL) AS is_supported,
             (c.task_uuid IS NOT NULL) AS is_configured
      FROM tasking t
      LEFT JOIN agent_config_supported_tasks s ON s.task_uuid=t.task_uuid AND s.build_uuid=$1
      LEFT JOIN agent_config_configured_tasks c ON c.task_uuid=t.task_uuid AND c.build_uuid=$1
      ORDER BY t.task_long_name
    `, [req.params.build_uuid]);
    if (maybeNotModified(req, res, rows)) return;
    res.json(rows);
  } catch (e) { next(e); }
});

export default r;
