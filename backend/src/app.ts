// src/app.ts
import express from "express";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./logger";
import { verifyBearer } from "./auth/oidc";
import { errorHandler } from "./middleware/error";
import { etagResponse } from "./middleware/etag";

// ---- Routes ----
// public
import healthRoutes from "./routes/health";

// secured (OIDC bearer required)
import adminUsers from "./routes/admin.users";
import userMemberships from "./routes/admin.users.memberships";
import engagements from "./routes/engagements";
import agentConfigs from "./routes/agentConfigs";
import loadBalancers from "./routes/loadBalancers";
import taskingCatalog from "./routes/tasking";
import agents from "./routes/agents";
import checkins from "./routes/checkins";
import tasks from "./routes/tasks";
import endpoints from "./routes/endpoints";
import dirwalks from "./routes/dirwalks";
import gqlAnalytics from "./routes/analytics.graphql";

const app = express();

// --- Core middleware ---
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "16mb" })); // larger to accommodate dirwalk payloads

// not sure we need this globally
//app.use(etagResponse());

app.use(pinoHttp({ logger }));

// --- Public routes (no auth) ---
app.use(healthRoutes); // /healthz, /readyz, /version

// --- Auth guard for everything else ---
app.use(verifyBearer);

// --- Domain routes (secured) ---
app.use(adminUsers);     // /api/v1/admin/users...

app.use(engagements);    // /api/v1/engagements...
app.use(agentConfigs);   // /api/v1/agent-configs...
app.use(loadBalancers);  // /api/v1/load-balancers...
app.use(taskingCatalog);  // /api/v1/tasking (catalog CRUD)
app.use(agents);         // /api/v1/agents...
app.use(checkins);       // /api/v1/agents/:agent_uuid/check-ins...
app.use(tasks);          // /api/v1/agents/:agent_uuid/tasks...
app.use(endpoints);      // /api/v1/endpoints...
app.use(dirwalks);       // /api/v1/dirwalks..., /api/v1/agents/:agent_uuid/dirwalks
app.use(gqlAnalytics);   // /api/v1/analytics/graphql

// --- Global error handler (last) ---
app.use(errorHandler);

export default app;
