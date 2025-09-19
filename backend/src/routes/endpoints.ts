import { Router } from "express";
import { q } from "../db";
import { requireRole } from "../auth/rbac";
import { decodeCursor, encodeCursor } from "../db/pagination";
import { maybeNotModified } from "../db/etag";

const r = Router();

/** Create endpoint */
r.post("/api/v1/endpoints", requireRole("Operator","Admin"), async (req, res, next) => {
  try {
    const { engagement_uuid, agent_uuid, os_version, ip, system_info, gateway, routing_table, arp, installed_applications, drivers, patch_history } = req.body;
    const { rows } = await q(`
      INSERT INTO endpoints(engagement_uuid, agent_uuid, os_version, ip, system_info, gateway, routing_table, arp, installed_applications, drivers, patch_history)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING endpoint_uuid, engagement_uuid, agent_uuid, created_at
    `, [engagement_uuid, agent_uuid ?? null, os_version ?? null, ip ?? [], system_info ?? null, gateway ?? [], routing_table ?? null, arp ?? null, installed_applications ?? null, drivers ?? null, patch_history ?? null]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

/** List endpoints (cursor + filters) */
r.get("/api/v1/endpoints", requireRole("Analyst","Operator","Admin"), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const cursor = decodeCursor(String(req.query.cursor ?? "") || null);
    const engagement_uuid = req.query.engagement_uuid ?? null;
    const agent_uuid = req.query.agent_uuid ?? null;
    const os = req.query.os ?? null;
    const qip = req.query.ip ?? null;

    const params: any[] = [];
    let where = "WHERE 1=1 ";
    if (engagement_uuid) { params.push(engagement_uuid); where += `AND engagement_uuid=$${params.length} `; }
    if (agent_uuid)      { params.push(agent_uuid);      where += `AND agent_uuid=$${params.length} `; }
    if (os)              { params.push(`%${os}%`);       where += `AND os_version ILIKE $${params.length} `; }
    if (qip)             { params.push(qip);             where += `AND $${params.length}::inet = ANY(ip) `; }

    let keyset = "";
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      keyset = `AND (created_at, endpoint_uuid) < ($${params.length-1}::timestamptz, $${params.length}::uuid) `;
    }
    params.push(limit + 1);

    const { rows } = await q(`
      SELECT endpoint_uuid, engagement_uuid, agent_uuid, os_version, ip, gateway, created_at
      FROM endpoints
      ${where}
      ${keyset}
      ORDER BY created_at DESC, endpoint_uuid DESC
      LIMIT $${params.length}
    `, params);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0,-1) : rows;
    const last = items[items.length-1];
    const nextCursor = hasMore ? encodeCursor(last.created_at.toISOString?.() ?? last.created_at, last.endpoint_uuid) : null;

    if (maybeNotModified(req, res, { items, nextCursor })) return;
    res.json({ items, nextCursor });
  } catch (e) { next(e); }
});

/** Get endpoint */
r.get("/api/v1/endpoints/:endpoint_uuid", requireRole("Analyst","Operator","Admin"), async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT endpoint_uuid, engagement_uuid, agent_uuid, os_version, ip, system_info, gateway, routing_table, arp, installed_applications, drivers, patch_history, created_at
      FROM endpoints WHERE endpoint_uuid=$1
    `, [req.params.endpoint_uuid]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    if (maybeNotModified(req, res, rows[0])) return;
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/** Update endpoint (partial) */
r.patch("/api/v1/endpoints/:endpoint_uuid", requireRole("Operator","Admin"), async (req, res, next) => {
  try {
    const { engagement_uuid, agent_uuid, os_version, ip, system_info, gateway, routing_table, arp, installed_applications, drivers, patch_history } = req.body;
    const { rows } = await q(`
      UPDATE endpoints SET
        engagement_uuid = COALESCE($2, engagement_uuid),
        agent_uuid = COALESCE($3, agent_uuid),
        os_version = COALESCE($4, os_version),
        ip = COALESCE($5, ip),
        system_info = COALESCE($6, system_info),
        gateway = COALESCE($7, gateway),
        routing_table = COALESCE($8, routing_table),
        arp = COALESCE($9, arp),
        installed_applications = COALESCE($10, installed_applications),
        drivers = COALESCE($11, drivers),
        patch_history = COALESCE($12, patch_history)
      WHERE endpoint_uuid=$1
      RETURNING endpoint_uuid, engagement_uuid, agent_uuid, created_at
    `, [req.params.endpoint_uuid, engagement_uuid ?? null, agent_uuid ?? null, os_version ?? null, ip ?? null, system_info ?? null, gateway ?? null, routing_table ?? null, arp ?? null, installed_applications ?? null, drivers ?? null, patch_history ?? null]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/** Inventory upload (upsert parts) */
r.post("/api/v1/endpoints/:endpoint_uuid/inventory", requireRole("Operator","Admin"), async (req, res, next) => {
  try {
    const { system_info, drivers, installed_applications, patch_history, routing_table, arp } = req.body;
    const { rows } = await q(`
      UPDATE endpoints SET
        system_info = COALESCE($2, system_info),
        drivers = COALESCE($3, drivers),
        installed_applications = COALESCE($4, installed_applications),
        patch_history = COALESCE($5, patch_history),
        routing_table = COALESCE($6, routing_table),
        arp = COALESCE($7, arp)
      WHERE endpoint_uuid=$1
      RETURNING endpoint_uuid
    `, [req.params.endpoint_uuid, system_info ?? null, drivers ?? null, installed_applications ?? null, patch_history ?? null, routing_table ?? null, arp ?? null]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.status(204).end();
  } catch (e) { next(e); }
});

export default r;
