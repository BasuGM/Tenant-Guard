# Tech stack

TenantGuard is a **pnpm monorepo** (Node ≥ 22) that implements a secure multi-tenant SaaS demo: shared Postgres with **forced RLS**, **OIDC + PKCE** sessions, **RBAC**, **Redis** rate limits, **SQS** async exports, **OpenTelemetry**, and **Terraform** for AWS.

Related: [architecture invariants](architecture.md) · [interview guide](interview-guide.md) · [roadmap](ROADMAP.md)

---

## Repository layout

| Path | Role |
| --- | --- |
| `apps/web` | Next.js 15 dashboard (BFF: same-origin `/api` → Nest) |
| `apps/api` | NestJS 11 API (auth, tenants, projects, exports, rate limits) |
| `apps/worker` | Long-running SQS consumer for CSV exports |
| `apps/idp` | Local OIDC provider (`oidc-provider`) for demos |
| `packages/db` | Drizzle schema, SQL migrations, `withTenantTransaction` |
| `packages/shared` | Zod schemas, permission strings, role → permission matrix |
| `infra/terraform` | AWS VPC, Aurora PostgreSQL, ElastiCache Redis, SQS, S3 |
| `infra/local` | ElasticMQ, OTel collector, S3 mock configs |
| `e2e` | Playwright: smoke, Alice login + isolation, export |
| `scripts` | `demo:up`, `demo:serve`, seed, `pnpm app` |

Workspace tooling: **TypeScript 5.7**, **pnpm 9**, root `pnpm check` (lint, typecheck, restricted-import gate, unit/integration tests).

---

## Frontend (`apps/web`)

| Concern | Choice |
| --- | --- |
| Framework | **Next.js 15** (App Router), **React 19** |
| Data | **TanStack Query** against `/api/*` |
| Forms | **react-hook-form** + Zod resolvers |
| Contracts | `@tenantguard/shared` Zod types |

The browser never talks to Nest on another origin for cookies: Next rewrites `/api` to `http://localhost:3101`, so session cookies stay first-party (`SameSite=Lax`).

**Port:** `3100`

---

## API (`apps/api`)

| Concern | Choice |
| --- | --- |
| Framework | **NestJS 11** on Express |
| Validation | **Zod** (shared package) |
| Auth client | **openid-client** (OIDC authorization code + PKCE) |
| Cookies | `cookie-parser`; `tg_session` / `tg_refresh` HttpOnly |
| HTTP hardening | **helmet** |
| DB access | `pg` pool via `@tenantguard/db` (no app-level ORM on the hot path beyond Drizzle types/schema) |
| Redis | **ioredis** + Lua sliding-window script |
| Queues / objects | **AWS SDK v3** SQS + S3 (+ presigner) |
| Observability | OpenTelemetry Node SDK → OTLP HTTP |

### Request pipeline

```
Browser → Next rewrite /api → Nest
  → SessionGuard (cookie → SECURITY DEFINER session resolve)
  → PermissionGuard (@RequirePermission)
  → RateLimitGuard (Redis sliding window; fail closed)
  → withTenantTransaction (set_config + RLS)
  → response
```

**Port:** `3101` · health: `GET /health`

---

## Local IdP (`apps/idp`)

| Concern | Choice |
| --- | --- |
| Library | **oidc-provider** |
| Flows | Authorization code + **PKCE S256** required; refresh tokens |
| Demo user | `alice` (any password) |

Used only for local/demo. Production would point `OIDC_*` env at a real IdP (Auth0, Cognito, Okta, etc.).

**Port:** `3102`

---

## Database (`packages/db` + Postgres 16)

| Concern | Choice |
| --- | --- |
| Engine | **PostgreSQL 16** (Compose: `postgres:16-alpine`) |
| Schema / migrations | SQL under `packages/db/migrations` (+ Drizzle kit/types) |
| App role | `tenantguard_app` — **NOSUPERUSER**, **NOBYPASSRLS** |
| Isolation | `ENABLE` + `FORCE ROW LEVEL SECURITY` on tenant tables |
| Policy predicate | `tenant_id = current_setting('app.tenant_id', true)::uuid` |
| Tenant TX helper | `withTenantTransaction` → `BEGIN` → `set_config(..., true)` → work → commit/rollback |

Identity lookups that must run before tenant context (session, membership, “my tenants”) use **`SECURITY DEFINER`** functions with a fixed `search_path`.

Boot guard: API refuses to start if `DATABASE_APP_URL` is a bypassing role.

---

## Auth & sessions

| Piece | Behavior |
| --- | --- |
| Login | `GET /auth/login` → store state/nonce/verifier → redirect IdP with `code_challenge` |
| Callback | Exchange code, create session + refresh family, set cookies |
| Session cookie | `tg_session` — HttpOnly, SameSite=Lax, ~12h |
| Refresh cookie | `tg_refresh` — HttpOnly, path scoped to refresh, ~30d |
| Storage | Refresh tokens stored as **SHA-256 hashes**; reuse of a revoked token **revokes the family** |
| Switch tenant | `POST /auth/switch-tenant` updates active tenant on the session |
| Prod cookies | `COOKIE_SECURE=true` required |

---

## RBAC (`packages/shared` + Nest guards)

System roles: `owner`, `admin`, `manager`, `member`, `viewer`.

Permissions are string capabilities (e.g. `projects:read`, `exports:create`, `billing:manage`). `ROLE_PERMISSIONS` maps roles → allowed set. Missing permission → **403**; cross-tenant resource → **404** (do not leak existence).

---

## Rate limiting (Redis)

| Concern | Choice |
| --- | --- |
| Store | **Redis 7** (`ioredis`) |
| Algorithm | Sliding window via **Lua** on sorted sets |
| Keys | Per-user and per-tenant |
| Defaults | ~100 req/min user, ~1000 req/min tenant |
| Failure mode | **Fail closed** → rate-limit unavailable / 429 path when Redis errors |

Local: Compose profile `redis` or `full`.

---

## Async exports (SQS + worker + object storage)

| Concern | Choice |
| --- | --- |
| Queue (local) | **ElasticMQ** (SQS-compatible) |
| Queue (AWS) | SQS (+ DLQ in Terraform) |
| Objects (local) | **adobe/s3mock** |
| Objects (AWS) | S3 |
| API | `POST /exports` with **Idempotency-Key**; enqueue `{ jobId, tenantId }` |
| Worker | Claim job with conditional status update; CSV → S3; mark `completed` |
| Download | Presigned GET URL |
| Semantics | SQS is a **wake-up**; source of truth is `export_jobs` under RLS |

Worker runs the same tenant transaction / RLS discipline as the API.

---

## Observability

| Concern | Choice |
| --- | --- |
| Library | `@opentelemetry/sdk-node`, OTLP HTTP exporter |
| Services | API + worker (`OTEL_SERVICE_NAME`) |
| Safe attrs | route, tenant id, user id, job id |
| Forbidden | emails, cookies, tokens, export bodies |

Local collector: Compose profile `otel` (`infra/local/otel-collector-config.yaml`).

---

## Infrastructure as code

`infra/terraform` (AWS provider ~> 5, Terraform ≥ 1.5):

- VPC + private subnets  
- Aurora PostgreSQL cluster  
- ElastiCache Redis  
- SQS (+ related wiring)  
- Supporting networking / security groups as defined in `main.tf`

Local parity uses Docker Compose instead of applying Terraform.

---

## Testing

| Layer | Tooling |
| --- | --- |
| Unit / integration | **Jest** + **supertest** in `apps/api` (and worker); DB tests gated by `RUN_DB_TESTS` |
| E2E | **Playwright** (`e2e/`) against `localhost` (not `127.0.0.1`) so cookies stick |
| Gate | `pnpm check` + restricted-import script (repos must not grab the pool for tenant queries) |

Demo harness: `pnpm demo:up` → migrate + seed Company B → `pnpm test:e2e` (or `pnpm app` for manual UI).

---

## Local ports & Compose

| Service | Port |
| --- | --- |
| Web | 3100 |
| API | 3101 |
| IdP | 3102 |
| Postgres | 5432 |
| Redis | 6379 |
| ElasticMQ | 9324 / 9325 |
| S3 mock | 9000 |
| OTel collector | 4317 / 4318 |

Compose profiles: `redis`, `sqs`, `full`, `otel`.

---

## Why these choices (short)

- **Postgres RLS + non-bypass app role** — isolation enforced in the database, not only in app `WHERE` clauses.  
- **Transaction-local `set_config`** — safe with pooled connections; no sticky session required.  
- **OIDC + PKCE + hashed refresh rotation** — standard IdP integration without embedding passwords.  
- **Next BFF rewrite** — simple cookie model for SPAs.  
- **SQS wake-ups + DB claim** — idempotent workers, DLQ-friendly, tenant id from the row.  
- **Redis sliding window** — fair multi-tenant throttling with fail-closed ops posture.  
- **OTel** — cross-service traces without logging secrets.  
- **Terraform** — reproducible AWS skeleton matching the local mental model.
