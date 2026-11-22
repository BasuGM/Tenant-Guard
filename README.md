# TenantGuard

Secure multi-tenant SaaS platform demonstrating OIDC + PKCE, refresh-token rotation, PostgreSQL Row-Level Security, RBAC, Redis sliding-window rate limiting, SQS exports with idempotency and a DLQ, Terraform, and OpenTelemetry.

See [docs/architecture.md](docs/architecture.md) for isolation invariants.

## Quick start

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm --filter @tenantguard/api dev
pnpm --filter @tenantguard/web dev
```

- Web: http://localhost:3100
- API health: http://localhost:3101/health

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm check` | lint, typecheck, unit/integration tests |
| `pnpm test:e2e` | Playwright smoke / flows |
| `pnpm db:migrate` | Apply SQL migrations |

## Apps

- `apps/web` — Next.js dashboard (BFF rewrite to API)
- `apps/api` — NestJS API
- `apps/worker` — SQS export worker
- `apps/idp` — local OIDC provider for development
