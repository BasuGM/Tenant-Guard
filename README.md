# TenantGuard

**Multi-tenant SaaS on a shared database — with isolation enforced where it actually matters.**

TenantGuard is a full-stack reference implementation of the hard parts of B2B SaaS: **PostgreSQL Row-Level Security**, **OIDC + PKCE** sessions with refresh-token rotation, **RBAC**, Redis rate limits, async **SQS** exports, OpenTelemetry, and Terraform for AWS.

Built as a pnpm monorepo: **Next.js** dashboard, **NestJS** API, export **worker**, and a local **OIDC** IdP for demos.

---

## Why this exists

Most “multi-tenant” demos stop at `WHERE tenant_id = ?` in application code. That fails when someone forgets a filter, uses the wrong DB role, or trusts a queue message.

TenantGuard treats isolation as a **database invariant**:

| Failure mode | What TenantGuard does |
| --- | --- |
| Missing app filter | **FORCE RLS** on tenant tables; unset `app.tenant_id` fails closed |
| Runtime as superuser | App connects as `tenantguard_app` (**NOBYPASSRLS**); boot refuses bypass roles |
| Pooled connection leaks context | Per-request client + transaction-local `set_config` |
| Cross-tenant probing | Foreign rows → **404** (not 403) |
| Stolen refresh token replay | Tokens stored as **hashes**; reuse **revokes the family** |
| Worker trusts SQS body | Queue is a wake-up; worker **claims** the DB row under RLS |

If you are preparing for backend / platform interviews, start with the [interview guide](docs/interview-guide.md).

---

## Architecture

```
 Browser ──► Next.js (:3100) ── /api rewrite ──► NestJS (:3101)
                                                    │
                              Session → Permission → RateLimit
                                                    │
                                       tenant TX + Postgres RLS
                                                    │
 Local IdP (:3102) ◄── OIDC + PKCE ─────────────────┤
                                                    │
                                         SQS wake-up ▼
                                              Export worker → S3
```

| Layer | Tech |
| --- | --- |
| Web | Next.js 15, React 19, TanStack Query (BFF cookies via rewrite) |
| API | NestJS 11, Zod, openid-client, helmet |
| Data | PostgreSQL 16, Drizzle schema/migrations, forced RLS |
| Auth | OIDC authorization code + PKCE S256, HttpOnly cookies |
| Limits | Redis 7 sliding window (Lua), fail closed |
| Jobs | SQS (ElasticMQ locally), S3 (s3mock locally), idempotent exports |
| Ops | OpenTelemetry (OTLP), Terraform (VPC, Aurora, Redis, SQS) |
| Tests | Jest + Supertest, Playwright e2e |

Full breakdown: [docs/tech-stack.md](docs/tech-stack.md) · invariants: [docs/architecture.md](docs/architecture.md)

---

## Quick start

**Requirements:** Node ≥ 22, pnpm 9, Docker.

```bash
cp .env.example .env
pnpm install
pnpm app
```

`pnpm app` brings up Compose infra, IdP, API, web, and worker.

| What | Where |
| --- | --- |
| Dashboard | http://localhost:3100 |
| API health | http://localhost:3101/health |
| Sign in | IdP user **`alice`** — any password |

> Running only the Next app is not enough. `/api` is proxied to Nest; without API + IdP you will see `ECONNREFUSED` on `/api/auth/me`.

### Manual terminals (optional)

```bash
pnpm demo:up
# then, in separate shells (IdP first):
pnpm --filter @tenantguard/idp dev
pnpm --filter @tenantguard/api dev
pnpm --filter @tenantguard/web dev
pnpm --filter @tenantguard/worker dev   # required for CSV exports
```

---

## What you can do in the UI

1. **Sign in** via the local IdP (OIDC + PKCE) from the brand-first landing page.
2. **Create organizations** (tenants) and click one to switch the active context.
3. **Create projects** scoped to the active tenant.
4. **Request a CSV export** — job goes pending → worker completes → download link.
5. **Sign out** from the dashboard header.

Under the hood you also get invitations/RBAC, audit-oriented permissions, rate limiting, and hashed API-key support from the M1–M9 roadmap.

---

## Prove it (interview / CI demo)

Seeds a foreign tenant (**Company B**) you must not see, then runs Playwright.

```bash
pnpm demo:up    # Postgres, Redis, ElasticMQ, S3 mock + migrate + seed
pnpm test:e2e   # smoke + Alice login/isolation + export idempotency
```

**Manual walkthrough**

1. `pnpm demo:up` then `pnpm app` (or `pnpm demo:serve`)
2. Open http://localhost:3100 → Sign in as `alice`
3. Create **Company A** + **Project Alpha**
4. Confirm **Company B Secret** never appears in the UI
5. `GET /api/projects/<id-from-.demo/foreign-project-id>` → **404**
6. Request CSV export → `completed` + download

Talking track while you click: [docs/interview-guide.md](docs/interview-guide.md)  
Expected outcomes: [docs/VERIFICATION.md](docs/VERIFICATION.md)

---

## Repository layout

```
apps/
  web/       Next.js dashboard (BFF)
  api/       NestJS API
  worker/    SQS export consumer
  idp/       Local OIDC provider
packages/
  db/        Schema, migrations, withTenantTransaction
  shared/    Zod schemas, permission matrix
infra/
  terraform/ AWS (VPC, Aurora, Redis, SQS, …)
  local/     ElasticMQ / OTel / s3mock config
e2e/         Playwright
scripts/     demo:up, demo:serve, seed, pnpm app
docs/        Architecture, stack, interview prep
```

---

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm app` | One-command local stack |
| `pnpm demo:up` | Compose `full` + migrate + seed Company B |
| `pnpm demo:serve` | IdP + API + web + worker |
| `pnpm demo:seed` | Refresh isolation fixture |
| `pnpm check` | Lint, typecheck, restricted imports, unit/integration tests |
| `pnpm test:e2e` | Playwright suites |
| `pnpm db:migrate` | Apply SQL migrations |

Optional Redis-only tests:

```bash
docker compose --profile redis up -d redis
RUN_REDIS_TESTS=true REDIS_URL=redis://localhost:6379 pnpm --filter @tenantguard/api test
```

---

## Ports

| Service | Port |
| --- | --- |
| Web | 3100 |
| API | 3101 |
| IdP | 3102 |
| Postgres | 5432 |
| Redis | 6379 |
| ElasticMQ | 9324 |
| S3 mock | 9000 |

Compose profiles: `redis`, `sqs`, `full`, `otel`.

---

## Documentation

| Doc | When to open it |
| --- | --- |
| [Interview guide](docs/interview-guide.md) | Pitch, whiteboard, Q&A, resume bullets |
| [Tech stack](docs/tech-stack.md) | Libraries and how pieces connect |
| [Architecture](docs/architecture.md) | The 11 isolation invariants |
| [Roadmap](docs/ROADMAP.md) | M1–M9 status |
| [Verification](docs/VERIFICATION.md) | Checklist for demos and CI |
| [Docs index](docs/README.md) | Everything else |

---

## License

Private / portfolio project unless otherwise noted.
