# QA log

| Date | Area | Result | Notes |
| --- | --- | --- | --- |
| 2026-11-22 | `pnpm check` | PASS | lint, typecheck, restricted imports, API tests |
| 2026-11-22 | M1–M9 automated | PASS | See prior rows in git history |
| 2026-11-22 | Demo harness | PASS | `pnpm demo:up` (ElasticMQ + adobe/s3mock; MinIO Hub unavailable) |
| 2026-11-22 | Playwright smoke | PASS | Home page |
| 2026-11-22 | Playwright Alice OIDC | PASS | Login, Company A, cross-tenant project 404 |
| 2026-11-22 | Playwright export | PASS | Idempotency key + worker completion + download URL |

## Known issues

- Local ports: web **3100**, API **3101**, IdP **3102**
- Local object storage uses `adobe/s3mock` (MinIO images were not pullable in this environment)
- OTEL collector is `--profile otel` only (not required for demo e2e)
