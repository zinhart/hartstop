// src/middleware/idempotency.ts
import { Request, Response, NextFunction } from "express";
import { beginIdempotent, getIdempotent, finishIdempotent } from "../db/idempotency";
import { computeEtag } from "../db/etag";

export async function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.header("Idempotency-Key");
  if (!key) return next();

  const existing = await getIdempotent(key);
  if (existing?.status === 2) {
    if (existing.response_etag) res.setHeader("ETag", existing.response_etag);
    return res.status(200).json(existing.response_body ?? {});
  }
  const won = await beginIdempotent(key);
  if (!won) {
    // Someone else started processing; poll until complete (simple backoff) or return 409
    return res.status(409).json({ error: "duplicate_in_flight" });
  }

  // Monkey-patch res.json to capture body
  const json = res.json.bind(res);
  (res as any).json = async (body: any) => {
    const etag = computeEtag(body);
    res.setHeader("ETag", etag);
    await finishIdempotent(key, etag, body);
    return json(body);
  };

  next();
}
