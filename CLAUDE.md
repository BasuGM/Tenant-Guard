# TenantGuard agent notes

## Check command

```bash
docker compose up -d postgres
export DATABASE_URL=postgres://tenantguard:tenantguard@localhost:5432/tenantguard
export DATABASE_APP_URL=postgres://tenantguard_app:tenantguard_app@localhost:5432/tenantguard
export RUN_DB_TESTS=true
pnpm check
```

Optional Redis tests:

```bash
docker compose --profile redis up -d redis
RUN_REDIS_TESTS=true REDIS_URL=redis://localhost:6379 pnpm --filter @tenantguard/api test
```

## Docs

- Architecture invariants: `docs/architecture.md`
- Roadmap status: `docs/ROADMAP.md`
- Verification table: `docs/VERIFICATION.md`
- QA log: `docs/QA_LOG.md`
- Plan checklist: `docs/development/plans/tenantguard-roadmap.md`

## Ports

- Web: `http://localhost:3100`
- API: `http://localhost:3101`
- Local IdP: `http://localhost:3102`
