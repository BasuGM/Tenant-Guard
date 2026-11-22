# TenantGuard roadmap checklist

Copied from the approved plan for implementation tracking. Do not treat this as a substitute for the Cursor plan file.

## Definition of done

- `pnpm check` passes
- Compose Postgres + migrations apply
- `/health` returns database up
- Playwright smoke opens the home page
- Isolation, auth, RBAC, rate limit, export, telemetry, and terraform checks covered by milestone tests/docs

## Checklist

- [x] M1 Foundation
- [x] M2 Multi-tenancy and RLS
- [x] M3 OIDC and refresh rotation
- [x] M4 RBAC
- [x] M5 Redis rate limiting
- [x] M6 SQS exports
- [x] M7 OpenTelemetry
- [x] M8 Terraform
- [x] M9 Security and QA / API keys
