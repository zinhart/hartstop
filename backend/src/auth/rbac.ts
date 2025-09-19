// src/auth/rbac.ts
import { Request, Response, NextFunction } from "express";

export function requireRole(...accepted: ("Analyst"|"Operator"|"Admin")[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const roles = (req as any).auth?.roles ?? [];
    if (roles.includes("Admin")) return next(); // Admin can do anything
    const ok = roles.some(r => accepted.includes(r as any));
    if (!ok) return next(Object.assign(new Error("forbidden"), { status: 403 }));
    next();
  };
}

// Admin-only guard (for DELETE etc.)
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const roles = (req as any).auth?.roles ?? [];
  if (!roles.includes("Admin")) {
    return next(Object.assign(new Error("admin_only"), { status: 403 }));
  }
  next();
}

// Engagement scoping (if route has :engagement_uuid)
export function requireEngagementAccess(paramName = "engagement_uuid") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const allowed = (req as any).auth?.engagements ?? [];
    const eid = req.params[paramName] ?? req.query[paramName];
    if (!eid) return next(); // if route not engagement-scoped
    if (allowed.includes(String(eid))) return next();
    const roles = (req as any).auth?.roles ?? [];
    if (roles.includes("Admin")) return next();
    return next(Object.assign(new Error("engagement_forbidden"), { status: 403 }));
  };
}
