// src/types/claims.ts

/**
 * Token claims we expect from the OIDC provider when validating
 * API requests (Access Tokens). Keep this aligned with your OP config.
 */
export type Role = "Analyst" | "Operator" | "Admin";

export interface AccessTokenClaims {
  iss: string;          // issuer
  aud: string | string[]; // audience(s)
  sub: string;          // subject (user id - ideally users.user_uuid)
  scope?: string;       // space-separated scopes
  roles?: Role[];       // RBAC roles
  engagements?: string[]; // engagement_uuids permitted for this user

  iat?: number;         // issued at (seconds)
  exp?: number;         // expiry (seconds)
  nbf?: number;         // not before
  jti?: string;         // token id
  client_id?: string;   // OAuth client id
  nonce?: string;       // used by OIDC code flow (usually in ID tokens)
}

/**
 * Convenience shape we stash on req.auth in middleware.
 * (See src/auth/oidc.ts)
 */
export interface AuthContext {
  sub: string;
  roles: Role[];
  engagements?: string[];
  scopes?: string[];
}
