# HARTSTOP API Surface (Exhaustive List · REST-first, GraphQL-ready)

This single document enumerates all planned endpoints, grouped by domain.
Versioning: v1 for REST. OIDC endpoints are mounted by node-oidc-provider.

## 0 Service / Meta

- GET /healthz — liveness
- GET /readyz — readiness (DB, OIDC, queue checks)
- GET /version — git sha, build info
- GET /api/v1/openapi.json — OpenAPI doc (kept in repo)

## 1 Auth / OIDC (served by node-oidc-provider)

- GET /.well-known/openid-configuration
- GET /.well-known/jwks.json
- GET /oidc/authorize
- POST /oidc/token
- POST /oidc/introspection
- POST /oidc/revocation
- GET /oidc/userinfo
- (Optional) POST /oidc/register — dynamic client registration

Note: The API verifies Access Tokens (JWT) via issuer/audience/JWKS.

## 2 Users & Roles (Admin scope)

- POST /api/v1/admin/users — create user (username, initial roles)
- GET /api/v1/admin/users — list users (filters: status, role, created_after/before, q=)
- GET /api/v1/admin/users/:user_uuid — get user
- PATCH /api/v1/admin/users/:user_uuid — update username/status
- DELETE /api/v1/admin/users/:user_uuid — delete user
- POST /api/v1/admin/users/:user_uuid/disable — disable
- POST /api/v1/admin/users/:user_uuid/enable — enable
- GET /api/v1/admin/users/:user_uuid/roles — list roles (global + per-engagement)
- PUT /api/v1/admin/users/:user_uuid/roles — replace roles (supports per-engagement scoping)
- GET /api/v1/admin/users/:user_uuid/last-login — last login snapshot

## 3 Engagements & Membership

- POST /api/v1/engagements — create engagement
- GET /api/v1/engagements — list (filters: active_only, name~)
- GET /api/v1/engagements/:engagement_uuid — get
- PATCH /api/v1/engagements/:engagement_uuid — update name/dates
- DELETE /api/v1/engagements/:engagement_uuid — delete (if empty or with force flag)
- GET /api/v1/engagements/:engagement_uuid/users — list members + roles
- POST /api/v1/engagements/:engagement_uuid/users — add user(s) with roles
- DELETE /api/v1/engagements/:engagement_uuid/users/:user_uuid — remove user
- GET /api/v1/engagements/:engagement_uuid/tasks/overrides — list task overrides
- PUT /api/v1/engagements/:engagement_uuid/tasks/overrides — replace overrides

## 4 Tasking Catalog (Definitions & Permissions)

- POST /api/v1/tasking — define a task (name, min role)
- GET /api/v1/tasking — list tasks (filters: min_role)
- GET /api/v1/tasking/:task_uuid — get task
- PATCH /api/v1/tasking/:task_uuid — update name/min role
- DELETE /api/v1/tasking/:task_uuid — delete (if not referenced, or soft-delete flag)

## 5 Agent Configuration (Builds, Capabilities)

POST /api/v1/agent-configs — create config (build_uuid, platform, type, intervals, LB link, build_configuration JSON)

- GET /api/v1/agent-configs — list (filters: platform, type, created range)
- GET /api/v1/agent-configs/:build_uuid — get config
- PATCH /api/v1/agent-configs/:build_uuid — update mutable fields
- DELETE /api/v1/agent-configs/:build_uuid — delete (if unused or force)
- PUT /api/v1/agent-configs/:build_uuid/supported-tasks — replace supported set (array of task_uuid)
- PUT /api/v1/agent-configs/:build_uuid/configured-tasks — replace configured subset
- GET /api/v1/agent-configs/:build_uuid/tasks — effective supported/configured view
- Build helpers (former /api/agent/build/{type}):
- POST /api/v1/agent-builds — request a build artifact (type/platform/config ref) => returns signed URL or artifact id
- GET /api/v1/agent-builds/:build_request_id — status/links

## 6 Load Balancers

- POST /api/v1/load-balancers — create
- GET /api/v1/load-balancers — list (filters: engagement_uuid)
- GET /api/v1/load-balancers/:load_balancers_uuid — get
- PATCH /api/v1/load-balancers/:load_balancers_uuid — update hops/engagement
- DELETE /api/v1/load-balancers/:load_balancers_uuid — delete (if unused)

## 7 Agents (Enroll, Info, Config Binding)

- POST /api/v1/agents — enroll/register agent (provides agent_uuid, agent_configuration_uuid)
- GET /api/v1/agents — list (filters: platform via join, active_since, config_uuid, engagement via endpoint join, q=)
- GET /api/v1/agents/:agent_uuid — get
- PATCH /api/v1/agents/:agent_uuid — rebind configuration, update created_at (rare), set uninstall date (admin)
- GET /api/v1/agents/:agent_uuid/config — resolve bound config summary
- GET /api/v1/agents/:agent_uuid/latest-checkin — one-row view
- GET /api/v1/agents/active — by window (minutes param; maps to view/query)

## 8 Agent Check-ins (High-volume, Agent-facing)

- POST /api/v1/agents/:agent_uuid/check-ins — record check-in (also bumps last_seen)
- GET /api/v1/agents/:agent_uuid/check-ins — list (cursor or time-window; partitions under the hood)

## 9 Tasking (Issue Commands to Agents & Audit)

- POST /api/v1/agents/:agent_uuid/tasks — body: { task_uuid | task_name, parameters }
- GET /api/v1/agents/:agent_uuid/tasks — list issued tasks (recent first)
- GET /api/v1/agents/:agent_uuid/tasks/history — alias of list with broader window
- GET /api/v1/agents/:agent_uuid/tasks/:task_uuid — details (who issued, when)
- (Optional) POST /api/v1/agents/:agent_uuid/task-outputs — if storing results/telemetry separately
- Audit, cross-cutting:
- GET /api/v1/tasking/history — global history (filters: agent_uuid, operator_uuid, task_uuid, time range)

## 10 Endpoints (Machines) & Inventories

- POST /api/v1/endpoints — create endpoint record (engagement & optional agent link)
- GET /api/v1/endpoints — list (filters: engagement_uuid, agent_uuid, IP contains, OS, q=)
- GET /api/v1/endpoints/:endpoint_uuid — get
- PATCH /api/v1/endpoints/:endpoint_uuid — update (link agent, minor fields)
- Inventories (JSONB uploads; agent/collector-facing):
- POST /api/v1/endpoints/:endpoint_uuid/inventory — upsert system_info/drivers/apps/patches/etc.
- Dirwalk snapshots (large JSON; tied to agent & engagement):
- POST /api/v1/dirwalks — { engagement_uuid, agent_uuid, payload } → returns dirwalk_id
- GET /api/v1/dirwalks/:dirwalk_id — fetch snapshot (paged streaming optional)
- GET /api/v1/agents/:agent_uuid/dirwalks — list snapshots by agent (time-window)

## 11 Analytics (GraphQL, Read-only)

- POST /api/v1/analytics/graphql — GraphQL endpoint (queries only; no mutations initially)
- (Dev-only) GET /api/v1/analytics/graphiql — IDE (behind admin/auth flag)
- (Optional) POST /api/v1/analytics/refresh — trigger MV refreshes (if you keep any MVs)

### Example domains: agent => config => latest check-in; task issuance rollups; endpoint inventories; per-engagement activity timelines.

## 12 Search & Export (Quality of Life)
- GET /api/v1/search — cross-entity search (agents, endpoints, configs) with q= + scopes
- POST /api/v1/exports/check-ins — export CSV/Parquet for a window (async job; returns job id)
- GET /api/v1/exports/:job_id — status + signed URL

## 13 Admin Ops (Guard tightly)

- POST /api/v1/admin/archive/rotate — advance rotation (invokes DB function)
- POST /api/v1/admin/archive/dump — enqueue a specific archive partition
- GET /api/v1/admin/archive/ops — list partition_archive_ops states (ready/dumping/dumped/dropped)

### Notes
- Shared conventions (applies to list endpoints; for later implementation)
- Pagination: ?limit=50&cursor=… (opaque cursor)
- Time windows: ?from=2025-01-01T00:00:00Z&to=2025-01-31T23:59:59Z
- Sorting: ?sort=-created_at (minus = desc)
- Filtering: e.g., ?platform=win&type=beacon&engagement_uuid=…
- Projection: ?fields=agent_uuid,last_seen,platform (server whitelists)
- Idempotency (POST): Idempotency-Key: <uuid> for enroll, check-in, issue task, build requests.
- Caching: ETag/If-None-Match on readable resources.