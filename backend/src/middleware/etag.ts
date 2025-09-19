// src/middleware/etag.ts
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/** Hash any payload deterministically */
function computeEtag(body: any): string {
  const str = typeof body === "string" ? body : JSON.stringify(body);
  return `W/"${crypto.createHash("sha256").update(str).digest("base64")}"`;
}

/**
 * Middleware: auto-ETag for successful GET JSON responses.
 * - If handler calls res.json(body), we compute an ETag (unless already set)
 * - If client's If-None-Match matches, we send 304 and suppress the body
 *
 * Notes:
 * - Skips non-GET or non-200 responses
 * - Plays nice with handlers that already set ETag manually
 * - Safe to use alongside route-level maybeNotModified() (that path will typically end the response earlier)
 */
export function etagResponse() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only wrap for GET
    if (req.method !== "GET") return next();

    const origJson = res.json.bind(res);

    (res as any).json = (body: any) => {
      // Only apply to 200 OK responses
      const status = res.statusCode || 200;
      if (status !== 200) return origJson(body);

      // If handler already set an ETag, just honor If-None-Match and return
      let etag = res.getHeader("ETag") as string | undefined;
      if (!etag) {
        try {
          etag = computeEtag(body);
          res.setHeader("ETag", etag);
        } catch {
          // Fallback: if hashing fails for some reason, just continue without ETag
          return origJson(body);
        }
      }

      const inm = req.headers["if-none-match"];
      if (inm && inm === etag) {
        // Not Modified
        res.status(304);
        // Do not include body for 304
        return res.end();
      }

      return origJson(body);
    };

    next();
  };
}
