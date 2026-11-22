# Interview guide

How to **explain, demo, and defend** TenantGuard in a system-design or backend interview. Pair with [tech stack](tech-stack.md) and [architecture invariants](architecture.md).

---

## 30-second pitch

> TenantGuard is a multi-tenant SaaS demo on a **shared Postgres database**. Isolation is enforced with **forced Row-Level Security** and a **non-bypass app role**, not only application filters. Auth is **OIDC with PKCE** and **hashed refresh-token rotation**. On top: **RBAC**, **Redis sliding-window rate limits**, **SQS-backed CSV exports** with idempotency, **OpenTelemetry**, and **Terraform** for AWS. NestJS API, Next.js BFF, separate worker.

---

## What problem it demonstrates

Interviewers care that you understand **tenant isolation failure modes**:

| Mistake | TenantGuard answer |
| --- | --- |
| “We always filter by `tenant_id` in the app” | DB **FORCE RLS**; missing `app.tenant_id` fails closed |
| Superuser / migration role used at runtime | Runtime uses `tenantguard_app` with **NOBYPASSRLS**; boot check |
| Connection pool leaks tenant context | Per-request client + `set_config(..., true)` inside a transaction |
| Cross-tenant 403 leaks that a row exists | Cross-tenant → **404**; missing permission same-tenant → **403** |
| Queue message trusted as source of truth | SQS is a wake-up; worker **claims** `export_jobs` under RLS |
| Refresh token theft / replay | Store **hashes**; reuse of revoked token **revokes the family** |

Lead with isolation; features (exports, rate limits) are supporting evidence of production-minded design.

---

## Architecture sketch (whiteboard)

```
[Browser]
    │  same-origin cookies
    ▼
[Next.js :3100] ──rewrite /api──► [NestJS :3101]
                                      │
                 Session → Permission → RateLimit
                                      │
                         withTenantTransaction + RLS
                                      │
                                      ▼
                              [Postgres 16]
                                      ▲
[IdP :3102] ◄── OIDC+PKCE ── Nest auth                [Worker]
                                      │                    │
                                      └── SQS wake-up ─────┘
                                               │
                                               ▼
                                         [S3 / s3mock]
```

Optional: Redis for rate limits; OTel collector for traces.

---

## Live demo script (~8–10 min)

Prereqs:

```bash
cp .env.example .env
pnpm install
pnpm demo:up
pnpm app          # or bash scripts/demo-serve.sh
```

| Step | What you say | What they see |
| --- | --- | --- |
| 1 | “Local IdP mimics Auth0/Cognito; PKCE on the authorize URL.” | Sign in as `alice` (any password) → authorize → dashboard |
| 2 | “Alice is `owner` for orgs she creates; permissions come from the role matrix.” | Badge: email + `roles: owner` |
| 3 | “Create tenant A; active tenant drives RLS `app.tenant_id`.” | Create **Company A** (unique slug) |
| 4 | “Projects are tenant-scoped rows.” | Create **Project Alpha** |
| 5 | “Company B was seeded; UI never shows it; API returns 404.” | No “Company B Secret”; optional `GET /api/projects/<foreign-id>` → 404 |
| 6 | “Export is async: API inserts job, enqueues SQS, worker claims under RLS.” | Request CSV → pending → completed → Download |

Automated proof: `pnpm test:e2e` (smoke + Alice isolation + export idempotency).

Checklist expectations: [VERIFICATION.md](VERIFICATION.md).

---

## Deep-dive talking points

### 1. RLS & tenancy (highest signal)

- **FORCE RLS** so table owners / app bugs cannot skip policies.  
- Transaction-local `set_config` so pooled connections cannot inherit another tenant.  
- Repositories take the **transaction client**, not the pool (enforced by restricted-import check).  
- `SECURITY DEFINER` for pre-tenant identity only, fixed `search_path`.

**Likely question:** “Why not a schema-per-tenant or DB-per-tenant?”  
**Answer:** Schema/DB isolation is stronger operationally expensive; shared DB + RLS is a common SaaS compromise. Tradeoffs: noisy neighbor, migration complexity, need ironclad policies and roles. TenantGuard shows the **shared-DB** pattern done carefully.

### 2. OIDC + sessions

- Authorization code + **PKCE S256**; state/nonce/verifier stored server-side for the round trip.  
- Session cookie for API auth; refresh cookie path-scoped; production `Secure`.  
- Refresh **rotation** + family revoke on reuse → detects stolen refresh tokens.

**Likely question:** “Why not JWT access tokens in localStorage?”  
**Answer:** HttpOnly cookies reduce XSS token theft; BFF/same-origin simplifies CSRF posture with SameSite; short session + rotating refresh is a solid SPA pattern. JWTs are fine too—discuss tradeoffs (revocation, size, gateway validation).

### 3. RBAC

- Capability strings (`projects:create`, `exports:read`, …).  
- System roles map to permission sets in `@tenantguard/shared`.  
- Nest `PermissionGuard` + `@RequirePermission`.

**Likely question:** “How do custom roles work?”  
**Answer:** Matrix is data-driven; invitations/membership roles extend the same permission checks. Owner retains billing; viewer is read-only projects.

### 4. Rate limiting

- Redis sorted-set **sliding window** (Lua) per user and tenant.  
- **Fail closed** if Redis is down—prefer temporary unavailability over unbounded abuse.

### 5. Exports & workers

- Idempotency-Key → same job id on retry.  
- Message body is not authoritative; **conditional update** claims the row.  
- Presigned download URLs; no export body in traces.

### 6. Observability & IaC

- OTel spans with tenant/job ids; deny-list sensitive attributes.  
- Terraform: VPC, Aurora, Redis, SQS/S3-shaped prod topology.

---

## Question bank (practice aloud)

**Design**

1. How does a request become tenant-scoped end-to-end?  
2. What happens if `app.tenant_id` is unset?  
3. How do you prevent the API from connecting as a superuser in prod?  
4. Walk through refresh-token reuse detection.  
5. Why 404 vs 403 for cross-tenant access?  
6. How would you add a second region or read replica without breaking RLS?  
7. How would you migrate from shared-DB RLS to schema-per-tenant?

**Security**

8. What does PKCE protect against?  
9. Cookie flags and CSRF for this BFF setup?  
10. What must never appear in OpenTelemetry attributes?  
11. API keys (M9): hashing, scopes, rotation—how would you extend?

**Reliability**

12. Export worker crashes mid-upload—what is retry-safe?  
13. Why fail closed on Redis errors?  
14. DLQ purpose for export messages?

**Process**

15. What does `pnpm check` prove vs Playwright?  
16. How do you demo isolation without showing another user’s data in the UI?

Sketch answers from [architecture.md](architecture.md); do not memorize code line numbers—memorize **invariants**.

---

## Suggested STAR stories

Use real work from this repo as stories:

| Story | Situation → Action → Result |
| --- | --- |
| Isolation | Needed shared DB multi-tenancy → FORCE RLS + app role + TX `set_config` + 404 semantics → e2e proves cross-tenant 404 |
| Auth | Browser login without embedding IdP → OIDC PKCE, hashed refresh rotation → reuse revokes family (tests) |
| Async jobs | CSV export under load → SQS wake-up + DB claim + idempotency key → duplicate POSTs return same job; worker completes download |
| Abuse control | Multi-tenant API fair use → Redis sliding window, fail closed → 429 + Retry-After |

---

## What to put on a resume / LinkedIn

> Built **TenantGuard**, a multi-tenant SaaS reference: NestJS + Next.js, PostgreSQL **Row-Level Security**, OIDC/PKCE sessions with refresh rotation, RBAC, Redis rate limiting, SQS/S3 export pipeline, OpenTelemetry, and Terraform (AWS).

Bullets:

- Enforced tenant isolation with forced RLS and a non-bypass DB role; cross-tenant access returns 404.  
- Implemented OIDC authorization-code + PKCE login and hashed refresh-token rotation with family revoke.  
- Designed idempotent async exports (SQS + worker + presigned S3) claimed under the same RLS context.  
- Added Redis sliding-window rate limits (fail closed) and OTel tracing with a sensitive-attribute deny list.

---

## Repo map for quick navigation in an interview

| Topic | Start here |
| --- | --- |
| Invariants | `docs/architecture.md` |
| Stack detail | `docs/tech-stack.md` |
| Tenant TX | `packages/db` (`withTenantTransaction`) |
| RLS SQL | `packages/db/migrations/` |
| Auth | `apps/api/src/auth/` |
| Permissions | `packages/shared/src/permissions.ts` |
| Rate limit | `apps/api/src/rate-limit/` |
| Exports API | `apps/api/src/exports/` |
| Worker | `apps/worker/src/` |
| E2E | `e2e/alice-login.spec.ts`, `e2e/export.spec.ts` |
| AWS | `infra/terraform/main.tf` |

---

## Honesty boundaries

TenantGuard is a **teaching / portfolio** system: local IdP, Compose mocks (ElasticMQ, s3mock), and a focused UI. In interviews, say what is production-shaped (RLS, auth, worker semantics) vs what you would harden next (real IdP, HA Redis, private networking, secrets manager, chaos tests, formal threat model). That distinction reads as senior judgment.
