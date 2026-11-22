# TenantGuard architecture

TenantGuard is a secure multi-tenant SaaS demo. Multiple organizations share one application and one PostgreSQL database. Tenant isolation is the central invariant.

## Isolation invariants

1. Runtime connects as `tenantguard_app`. That role is not a superuser and does not have `BYPASSRLS`. Migrations use the owner role. The API refuses to boot when `DATABASE_APP_URL` points at a bypassing role.
2. Tenant-owned tables use `ENABLE` and `FORCE ROW LEVEL SECURITY`. Policies compare `tenant_id` (or `id` for `tenants`) to `current_setting('app.tenant_id', true)::uuid`. A missing setting fails closed.
3. Every tenant-scoped request checks out one pooled client, runs `BEGIN`, then `set_config('app.user_id', ..., true)` and `set_config('app.tenant_id', ..., true)`, then commits or rolls back and releases the client.
4. Repositories accept that client. Application code does not import the pool for tenant queries.
5. Cross-tenant reads and writes return **404**. Same-tenant missing permissions return **403**.
6. Identity lookup (session, membership, my tenants, invitation accept) uses `SECURITY DEFINER` functions with a fixed `search_path`.
7. SQS messages are wake-ups. Workers claim `export_jobs` with a conditional status update and use the tenant id stored on the row.
8. Refresh tokens are stored as SHA-256 hashes. Reuse of a revoked token revokes the family.
9. Production requires `COOKIE_SECURE=true`. Cookies are `HttpOnly` and `SameSite=Lax`.
10. Traces may include route, tenant id, user id, and job id. They never include emails, cookies, tokens, or export bodies.
11. Rate limiting fails closed when Redis errors.

## Request path

Browser → Next.js (same origin `/api` rewrite) → NestJS → SessionGuard → PermissionGuard → RateLimitGuard → tenant transaction + RLS → response.

## Modules

| Milestone | Capability |
| --- | --- |
| M1 | Monorepo, health, Compose Postgres, CI, smoke test |
| M2 | Tenants, projects, forced RLS, isolation tests |
| M3 | Local OIDC IdP, PKCE, sessions, refresh rotation |
| M4 | RBAC matrix, invitations, audit log |
| M5 | Redis sliding-window rate limits |
| M6 | SQS exports, worker, MinIO, DLQ, idempotency |
| M7 | OpenTelemetry across API and worker |
| M8 | Terraform for AWS |
| M9 | Security QA, hashed API keys |

## Local stack

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm --filter @tenantguard/api dev
pnpm --filter @tenantguard/web dev
```

Default local ports: web `3100`, API `3101`, IdP `3102`.

Optional profiles: `redis`, `sqs`, `otel`, or `full`.

## See also

- [tech-stack.md](tech-stack.md) — libraries, ports, and component responsibilities  
- [interview-guide.md](interview-guide.md) — how to explain and demo these invariants  
- [VERIFICATION.md](VERIFICATION.md) — expected results for checks and the interview demo  
- [ROADMAP.md](ROADMAP.md) — milestone status  

