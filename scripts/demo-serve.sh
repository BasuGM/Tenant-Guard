#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

# Ensure built artifacts exist for API
if [[ ! -f apps/api/dist/main.js ]]; then
  pnpm --filter @tenantguard/api build
fi
if [[ ! -d apps/web/.next ]]; then
  API_ORIGIN="${API_ORIGIN:-http://localhost:3101}" pnpm --filter @tenantguard/web build
fi

pnpm --filter @tenantguard/idp exec tsx src/main.ts &
IDP_PID=$!

for i in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${IDP_PORT:-3102}/.well-known/openid-configuration" >/dev/null; then
    break
  fi
  sleep 0.25
done

node apps/api/dist/main.js &
API_PID=$!

pnpm --filter @tenantguard/worker exec tsx src/main.ts &
WORKER_PID=$!

API_ORIGIN="${API_ORIGIN:-http://localhost:3101}" pnpm --filter @tenantguard/web exec next start -p "${WEB_PORT:-3100}" &
WEB_PID=$!

cleanup() {
  kill "$IDP_PID" "$API_PID" "$WORKER_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${API_PORT:-3101}/health" >/dev/null \
    && curl -sf "http://127.0.0.1:${WEB_PORT:-3100}/" >/dev/null; then
    break
  fi
  sleep 0.5
done

echo "demo-serve ready (idp=$IDP_PID api=$API_PID web=$WEB_PID worker=$WORKER_PID)"
wait
