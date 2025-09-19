// src/middleware/error.ts
import { Request, Response, NextFunction } from "express";
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err.status ?? 500;
  res.status(status).json({ error: err.message ?? "internal_error" });
}
