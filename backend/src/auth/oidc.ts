import { cfg } from "../config";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { Request, Response, NextFunction } from "express";

export interface AuthContext {
  sub: string;
  roles: ("Analyst" | "Operator" | "Admin")[];
  engagements?: string[]; // uuids user can access (optional)
  scopes?: string[];
}

const JWKS = createRemoteJWKSet(new URL(cfg.oidc.jwksUri));

export async function verifyBearer(req: Request, _res: Response, next: NextFunction) {
  try {
    const hdr = req.headers.authorization ?? "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) throw new Error("missing_bearer");

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: cfg.oidc.issuer,
      audience: cfg.oidc.audience
    });

    const ctx: AuthContext = {
      sub: String(payload.sub),
      roles: (payload["roles"] as string[] | undefined)?.filter(Boolean) as any ?? [],
      engagements: (payload["engagements"] as string[] | undefined) ?? [],
      scopes: (payload["scope"] as string | undefined)?.split(" ") ?? []
    };
    (req as any).auth = ctx;
    next();
  } catch (e) {
    next(Object.assign(new Error("unauthorized"), { status: 401 }));
  }
}
