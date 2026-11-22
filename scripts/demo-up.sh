#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo "==> Starting Compose (postgres + redis + sqs/s3 profiles)"
# `full` includes redis+sqs/s3mock; otel is separate (`--profile otel`).
docker compose --profile full up -d

echo "==> Waiting for Postgres"
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U tenantguard -d tenantguard >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Waiting for Redis"
for i in $(seq 1 20); do
  if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    break
  fi
  sleep 1
done

echo "==> Waiting for S3 mock"
for i in $(seq 1 20); do
  if curl -sf http://localhost:9000/ >/dev/null 2>&1 || curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1; then
    break
  fi
  # s3mock may return 404 on / while healthy
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/ | grep -Eq '200|404|405'; then
    break
  fi
  sleep 1
done

echo "==> Installing deps (if needed)"
if [[ ! -d node_modules ]]; then
  pnpm install
fi

echo "==> Migrating database"
pnpm db:migrate

echo "==> Seeding Company B isolation data"
pnpm demo:seed

cat <<'EOF'

Demo infra is up.

Start these in four terminals (loads .env via each app / shell):

  export $(grep -v '^#' .env | xargs)
  pnpm --filter @tenantguard/idp dev
  pnpm --filter @tenantguard/api dev
  pnpm --filter @tenantguard/web dev
  pnpm --filter @tenantguard/worker dev

Then verify:

  curl -s http://localhost:3101/health
  open http://localhost:3100

E2E (with the four processes running):

  PLAYWRIGHT_SKIP_WEBSERVER=1 pnpm test:e2e

EOF
