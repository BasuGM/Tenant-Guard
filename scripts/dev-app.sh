#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

echo "Ensuring Docker infra is up..."
docker compose --profile full up -d
pnpm db:migrate >/dev/null

echo "Starting IdP first (OIDC discovery)..."
pnpm --filter @tenantguard/idp dev &
IDP_PID=$!

for i in $(seq 1 40); do
  if curl -sf "http://localhost:${IDP_PORT:-3102}/.well-known/openid-configuration" >/dev/null; then
    break
  fi
  sleep 0.25
done

cleanup() {
  kill "$IDP_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting API + web + worker..."
echo "  Web:  http://localhost:3100"
echo "  API:  http://localhost:3101/health"
echo "  IdP:  http://localhost:3102"
echo
pnpm exec concurrently -k -n api,web,worker -c blue,green,magenta \
  "pnpm --filter @tenantguard/api dev" \
  "pnpm --filter @tenantguard/web dev" \
  "pnpm --filter @tenantguard/worker dev"
