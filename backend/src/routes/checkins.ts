import { Router } from "express";
import { q } from "../db";
import { SQL } from "../db/sql";
import { idempotency } from "../middleware/idempotency";

const r = Router();

// Record check-in (agent-facing; idempotent if client sends Idempotency-Key)
r.post("/api/v1/agents/:agent_uuid/check-ins", idempotency, async (req, res, next) => {
  try {
    await q(SQL.insertCheckIn, [req.params.agent_uuid]);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

export default r;
