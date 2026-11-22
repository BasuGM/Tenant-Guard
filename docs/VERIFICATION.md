# Verification

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
