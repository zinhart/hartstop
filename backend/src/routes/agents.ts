import { Router } from "express";
import { q } from "../db";
import { SQL } from "../db/sql";
import { idempotency } from "../middleware/idempotency";
import { requireRole } from "../auth/rbac"; // Operator+ can enroll, Admin anyway

const r = Router();

// Enroll agent (idempotent)
r.post("/api/v1/agents", requireRole("Operator"), idempotency, async (req, res, next) => {
  try {
    const { agent_uuid, agent_configuration_uuid } = req.body;
    const { rows } = await q(SQL.insertAgentCore, [agent_uuid, agent_configuration_uuid]);
    res.status(201).json(rows[0] ?? { agent_uuid, agent_configuration_uuid, created: "existing" });
  } catch (e) { next(e); }
});

// Get agent summary
r.get("/api/v1/agents/:agent_uuid", async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT a.agent_uuid, a.created_at, a.last_seen, a.uninstall_date,
             ac.build_uuid, ac.platform, ac.type
      FROM agent_core a
      JOIN agent_configuration ac ON ac.build_uuid = a.agent_configuration_uuid
      WHERE a.agent_uuid=$1
    `, [req.params.agent_uuid]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

export default r;
