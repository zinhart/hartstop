// src/db/etag.ts
import crypto from "crypto";
export function computeEtag(obj: any) {
  const str = typeof obj === "string" ? obj : JSON.stringify(obj);
  return `W/"${crypto.createHash("sha256").update(str).digest("base64")}"`;
}

export function maybeNotModified(req: any, res: any, body: any) {
  const etag = computeEtag(body);
  const inm = req.headers["if-none-match"];
  if (inm && inm === etag) {
    res.status(304).end();
    return true;
  }
  res.setHeader("ETag", etag);
  return false;
}
