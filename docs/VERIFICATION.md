# Verification

Interview talking track: [interview-guide.md](interview-guide.md). Stack reference: [tech-stack.md](tech-stack.md).

| Step | Expected |
| --- | --- |
| `docker compose up -d postgres` | Healthy Postgres |
| `pnpm db:migrate` | Applies `001` and `002` |
| `GET /health` | `{ status: "ok", database: "up" }` |
| Home page | Renders TenantGuard heading |
| Cross-tenant project read | 404 |
| Missing permission | 403 |
| Refresh reuse | Family revoked |
| Rate limit burst | 429 + Retry-After |
| Export idempotency key | Same job returned |
| Terraform fmt/validate | Pass when terraform available |

## Interview demo

| Step | Expected |
| --- | --- |
| `pnpm demo:up` | Postgres/Redis/ElasticMQ/S3 mock up; `.demo/foreign-project-id` written |
| Sign in as `alice` via IdP | Dashboard shows Alice |
| Create Company A + Project Alpha | Project listed |
| UI vs Company B Secret | Not visible |
| `GET /api/projects/<foreign-id>` | 404 |
| `POST /api/exports` + worker | Status becomes `completed`; download URL returned |
| Same Idempotency-Key twice | Same job id |
| `PLAYWRIGHT_SKIP_WEBSERVER=1 pnpm test:e2e` | Smoke + Alice + export pass |
