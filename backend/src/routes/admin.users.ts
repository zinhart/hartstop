import { Router } from "express";
import { q } from "../db";
import { SQL } from "../db/sql";
import { requireAdmin } from "../auth/rbac";
import { idempotency } from "../middleware/idempotency";

const r = Router();

// Create user (Admin)
r.post("/api/v1/admin/users", requireAdmin, idempotency, async (req, res, next) => {
  try {
    const { username, password_hash } = req.body; // password already hashed out-of-band
    const { rows } = await q(SQL.insertUser, [username, password_hash]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// Disable
r.post("/api/v1/admin/users/:user_uuid/disable", requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await q(SQL.disableUser, [req.params.user_uuid]);
    res.json({ user_uuid: rows[0]?.user_uuid, status: "disabled" });
  } catch (e) { next(e); }
});

// Enable
r.post("/api/v1/admin/users/:user_uuid/enable", requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await q(SQL.enableUser, [req.params.user_uuid]);
    res.json({ user_uuid: rows[0]?.user_uuid, status: "enabled" });
  } catch (e) { next(e); }
});

// Delete (Admin-only)
r.delete("/api/v1/admin/users/:user_uuid", requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await q(SQL.deleteUser, [req.params.user_uuid]);
    res.json({ user_uuid: rows[0]?.user_uuid, deleted: true });
  } catch (e) { next(e); }
});

export default r;
