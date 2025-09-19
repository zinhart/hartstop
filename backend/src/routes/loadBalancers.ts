import { Router } from "express";
import { q } from "../db";
import { requireRole, requireAdmin } from "../auth/rbac";
import { decodeCursor, encodeCursor } from "../db/pagination";
import { maybeNotModified } from "../db/etag";

const r = Router();

/** Create */
r.post("/api/v1/load-balancers", requireRole("Operator","Admin"), async (req, res, next) => {
  try {
    const { engagement_uuid, first_hop, second_hop, third_hop, last_hop } = req.body;
    const { rows } = await q(`
      INSERT INTO load_balancers(engagement_uuid, first_hop, second_hop, third_hop, last_hop)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING load_balancers_uuid, engagement_uuid, first_hop, second_hop, third_hop, last_hop
    `, [engagement_uuid ?? null, first_hop ?? null, second_hop ?? null, third_hop ?? null, last_hop ?? null]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

/** List (cursor) */
r.get("/api/v1/load-balancers", requireRole("Analyst","Operator","Admin"), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const cursor = decodeCursor(String(req.query.cursor ?? "") || null);
    const engagement_uuid = req.query.engagement_uuid ?? null;

    const params: any[] = [];
    let where = "WHERE 1=1 ";
    if (engagement_uuid) { params.push(engagement_uuid); where += `AND engagement_uuid=$${params.length} `; }

    let keyset = "";
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      keyset = `AND (created_at, load_balancers_uuid) < ($${params.length-1}::timestamptz, $${params.length}::uuid) `;
    }
    params.push(limit + 1);

    const { rows } = await q(`
      SELECT load_balancers_uuid, engagement_uuid, first_hop, second_hop, third_hop, last_hop, now() AS created_at
      FROM load_balancers
      ${where}
      ${keyset}
      ORDER BY created_at DESC, load_balancers_uuid DESC
      LIMIT $${params.length}
    `, params);

    // load_balancers lacks created_at in earlier schema; if you added it, select it. otherwise the 'now()' is a placeholder for ordering.
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0,-1) : rows;
    const nextCursor = hasMore ? encodeCursor(new Date().toISOString(), items[items.length-1].load_balancers_uuid) : null;

    if (maybeNotModified(req, res, { items, nextCursor })) return;
    res.json({ items, nextCursor });
  } catch (e) { next(e); }
});

/** Get one */
r.get("/api/v1/load-balancers/:load_balancers_uuid", requireRole("Analyst","Operator","Admin"), async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT load_balancers_uuid, engagement_uuid, first_hop, second_hop, third_hop, last_hop
      FROM load_balancers WHERE load_balancers_uuid=$1
    `, [req.params.load_balancers_uuid]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    if (maybeNotModified(req, res, rows[0])) return;
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/** Update */
r.patch("/api/v1/load-balancers/:load_balancers_uuid", requireRole("Operator","Admin"), async (req, res, next) => {
  try {
    const { engagement_uuid, first_hop, second_hop, third_hop, last_hop } = req.body;
    const { rows } = await q(`
      UPDATE load_balancers SET
        engagement_uuid = COALESCE($2, engagement_uuid),
        first_hop = COALESCE($3, first_hop),
        second_hop = COALESCE($4, second_hop),
        third_hop = COALESCE($5, third_hop),
        last_hop  = COALESCE($6, last_hop)
      WHERE load_balancers_uuid=$1
      RETURNING load_balancers_uuid, engagement_uuid, first_hop, second_hop, third_hop, last_hop
    `, [req.params.load_balancers_uuid, engagement_uuid ?? null, first_hop ?? null, second_hop ?? null, third_hop ?? null, last_hop ?? null]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/** Delete (Admin only) */
r.delete("/api/v1/load-balancers/:load_balancers_uuid", requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await q(`DELETE FROM load_balancers WHERE load_balancers_uuid=$1 RETURNING load_balancers_uuid`, [req.params.load_balancers_uuid]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ load_balancers_uuid: rows[0].load_balancers_uuid, deleted: true });
  } catch (e) { next(e); }
});

export default r;
