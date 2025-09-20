// src/routes/admin.users.ts
import { Router } from "express";
import { q } from "../db";
import { SQL } from "../db/sql";
import { requireAdmin } from "../auth/rbac";
import { idempotency } from "../middleware/idempotency";
import { z } from "zod";

const r = Router();

const CreateUserDto = z.object({
  username: z.string().min(3).max(128),
  password_hash: z.string().min(32).max(512), // already hashed
  global_role: z.enum(["Analyst","Operator","Admin"]).default("Analyst")
});

// Create user (Admin)
r.post("/api/v1/admin/users", requireAdmin, idempotency, async (req, res, next) => {
  try {
    const dto = CreateUserDto.parse(req.body);
    const { rows } = await q(SQL.insertUser, [dto.username, dto.password_hash, dto.global_role]);
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

// Update global role (Admin)
const UpdateGlobalRoleDto = z.object({ global_role: z.enum(["Analyst","Operator","Admin"]) });
r.patch("/api/v1/admin/users/:user_uuid", requireAdmin, async (req, res, next) => {
  try {
    const { global_role } = UpdateGlobalRoleDto.parse(req.body);
    const { rows } = await q(SQL.updateUserGlobalRole, [req.params.user_uuid, global_role]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
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
