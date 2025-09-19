export const cfg = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8080),
  // DB is on a different server
  pg: {
    connectionString: process.env.DATABASE_URL!, // e.g. postgres://user:pass@db-host:5432/avdb
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false
  },
  oidc: {
    issuer: process.env.OIDC_ISSUER!,            // e.g. https://auth.example.com
    audience: process.env.OIDC_AUDIENCE!,        // e.g. api://antivirus
    jwksUri: `${process.env.OIDC_ISSUER}/.well-known/jwks.json`
  },
  security: {
    // idempotency storage retention (hours)
    idemTtlHours: Number(process.env.IDEM_TTL_HOURS ?? 24)
  }
};
