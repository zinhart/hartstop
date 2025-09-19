import { Router } from "express";
import { q } from "../db";
import { SQL } from "../db/sql";
import { requireRole } from "../auth/rbac";
import { idempotency } from "../middleware/idempotency";

const r = Router();

// POST /agents/:agent_uuid/tasks  { task_uuid | task_name, parameters }
r.post("/api/v1/agents/:agent_uuid/tasks", requireRole("Operator"), idempotency, async (req, res, next) => {
  try {
    const operator_uuid = (req as any).auth.sub; // map subject to users.user_uuid in your IdP syncing
    let task_uuid = req.body.task_uuid as string | undefined;

    if (!task_uuid && req.body.task_name) {
      const { rows } = await q(`SELECT task_uuid FROM tasking WHERE task_long_name=$1`, [req.body.task_name]);
      task_uuid = rows[0]?.task_uuid;
    }
    if (!task_uuid) return res.status(400).json({ error: "task_required" });

    const { rows } = await q(SQL.insertTaskHistory, [req.params.agent_uuid, operator_uuid, task_uuid]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

export default r;
