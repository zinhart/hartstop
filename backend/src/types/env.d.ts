// src/types/env.d.ts

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: "development" | "test" | "production";
    PORT?: string;

    // Database (separate server)
    DATABASE_URL: string;
    PGSSL?: "true" | "false";

    // OIDC resource server config
    OIDC_ISSUER: string;    // e.g. https://auth.example.com
    OIDC_AUDIENCE: string;  // e.g. api://antivirus

    // Idempotency storage TTL
    IDEM_TTL_HOURS?: string;

    // Logging
    LOG_LEVEL?: "trace" | "debug" | "info" | "warn" | "error" | "fatal";

    // Build metadata
    GIT_SHA?: string;
  }
}
