# TenantGuard

Secure multi-tenant SaaS platform demonstrating OIDC + PKCE, refresh-token rotation, PostgreSQL Row-Level Security, RBAC, Redis sliding-window rate limiting, SQS exports with idempotency and a DLQ, Terraform, and OpenTelemetry.

See [docs/architecture.md](docs/architecture.md) for isolation invariants.

## Quick start (recommended)

You need **more than the web app**. The dashboard proxies to the API; without API + IdP you get `ECONNREFUSED` on `/api/auth/me`.

```bash
cp .env.example .env
pnpm install
pnpm app
```

That starts Docker infra, IdP, API, web, and worker.

- Web: http://localhost:3100  
- API health: http://localhost:3101/health  
- Sign in: use IdP user `alice` (any password)

### Manual (four terminals)

```bash
pnpm demo:up
export $(grep -v '^#' .env | xargs)
pnpm --filter @tenantguard/idp dev      # terminal 1 — start first
pnpm --filter @tenantguard/api dev      # terminal 2
pnpm --filter @tenantguard/web dev      # terminal 3
pnpm --filter @tenantguard/worker dev   # terminal 4 (needed for exports)
```

## Interview demo (full stack)

Proves Alice OIDC login, tenant isolation, and async CSV export.

```bash
cp .env.example .env   # if needed
pnpm install
pnpm demo:up           # Postgres + Redis + ElasticMQ + S3 mock, migrate, seed Company B
pnpm test:e2e          # starts IdP/API/web/worker via scripts/demo-serve.sh
```

Manual walkthrough (optional):

1. After `pnpm demo:up`, run `bash scripts/demo-serve.sh` (or start IdP → API → web → worker yourself)
2. Open http://localhost:3100 → Sign in
3. On the IdP, log in as `alice` (any password)
4. Create organization **Company A**, then project **Project Alpha**
5. Confirm the UI never shows **Company B Secret**
6. Request a CSV export; job reaches `completed` and download works

Playwright coverage: home smoke, Alice login + cross-tenant 404, export idempotency + completion.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm demo:up` | Compose `full`, migrate, seed Company B |
| `pnpm demo:seed` | Seed/refresh Company B isolation fixture |
| `pnpm check` | lint, typecheck, unit/integration tests |
| `pnpm test:e2e` | Playwright smoke / Alice / export |
| `pnpm db:migrate` | Apply SQL migrations |

## Apps

- `apps/web` — Next.js dashboard (BFF rewrite to API)
- `apps/api` — NestJS API
- `apps/worker` — SQS export worker
- `apps/idp` — local OIDC provider for development
