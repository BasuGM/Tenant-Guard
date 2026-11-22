# QA log

| Date | Area | Result | Notes |
| --- | --- | --- | --- |
| 2026-11-22 | `pnpm check` | PASS | lint, typecheck, restricted imports, 23 API tests |
| 2026-11-22 | M1 health + home | PASS | `/health` ok; Playwright smoke on `:3100` |
| 2026-11-22 | M2 RLS SQL/HTTP/concurrent | PASS | Cross-tenant 404; missing tenant context empty; WITH CHECK rejects |
| 2026-11-22 | M3 refresh reuse | PASS | Unit test revokes family on reuse |
| 2026-11-22 | M4 RBAC | PASS | Viewer/member 403; owner delete 200 |
| 2026-11-22 | M5 Redis rate limit | PASS | Sliding window + fail-closed |
| 2026-11-22 | M6 export idempotency | PASS | Same key returns same job; conditional claim once |
| 2026-11-22 | M7 telemetry attrs | PASS | Rejects cookie/email/authorization |
| 2026-11-22 | M8 terraform | PASS | `terraform fmt -check` + `validate` |
| 2026-11-22 | M9 cookie secure | PASS | Production requires `COOKIE_SECURE=true` |
| 2026-11-22 | IDE browser localhost | BLOCKED | Cursor browser could not reach host localhost; verified via curl + Playwright |

## Known issues

- Jest may force-exit because Redis clients opened in fail-closed tests keep handles.
- Local default ports are **3100** (web) and **3101** (API) to avoid collisions with other apps on 3000/3001.
- Full OIDC browser login against `apps/idp` was implemented but not exercised end-to-end in this run (IdP + Alice flow code is present).
