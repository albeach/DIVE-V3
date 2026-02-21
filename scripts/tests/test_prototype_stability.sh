#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HUB_URL="${HUB_URL:-https://localhost:4000}"
SPOKES="${SPOKES:-usa gbr}"

pass() { printf '[PASS] %s\n' "$1"; }
warn() { printf '[WARN] %s\n' "$1"; }
fail() { printf '[FAIL] %s\n' "$1"; exit 1; }

check_hub_health() {
  if curl -kfsS --max-time 5 "${HUB_URL}/api/health" >/dev/null; then
    pass "Hub backend health endpoint reachable (${HUB_URL}/api/health)"
  else
    fail "Hub backend health endpoint unreachable (${HUB_URL}/api/health)"
  fi
}

check_shared_token_store_container() {
  if docker ps --format '{{.Names}}' | grep -q '^shared-token-store$'; then
    pass "shared-token-store container running"
  else
    fail "shared-token-store container not running"
  fi
}

extract_backend_port() {
  local compose_file="$1"
  rg -o '127\\.0\\.0\\.1:[0-9]+:4000|0\\.0\\.0\\.0:[0-9]+:4000' "$compose_file" \
    | head -n1 \
    | sed -E 's/.*:([0-9]+):4000/\1/'
}

check_spoke_health() {
  local code="$1"
  local compose_file="${ROOT_DIR}/instances/${code}/docker-compose.yml"

  if [[ ! -f "$compose_file" ]]; then
    warn "Skipping ${code}: compose file not found"
    return 0
  fi

  local port
  port="$(extract_backend_port "$compose_file" || true)"

  if [[ -z "$port" ]]; then
    warn "Skipping ${code}: could not determine backend host port"
    return 0
  fi

  if curl -kfsS --max-time 5 "https://localhost:${port}/api/health" >/dev/null; then
    pass "Spoke ${code^^} backend healthy on https://localhost:${port}/api/health"
  else
    fail "Spoke ${code^^} backend health failed on https://localhost:${port}/api/health"
  fi
}

check_blacklist_wiring() {
  local file="$1"
  if rg -q 'BLACKLIST_REDIS_URL: \$\{BLACKLIST_REDIS_URL-rediss://:\$\{REDIS_PASSWORD_BLACKLIST\}@shared-token-store:6379\}' "$file"; then
    pass "Blacklist wiring standardized in ${file#${ROOT_DIR}/}"
  else
    warn "Blacklist wiring not standardized in ${file#${ROOT_DIR}/}"
  fi
}

main() {
  check_hub_health
  check_shared_token_store_container

  for code in $SPOKES; do
    check_spoke_health "$code"
    check_blacklist_wiring "${ROOT_DIR}/instances/${code}/docker-compose.yml"
  done

  check_blacklist_wiring "${ROOT_DIR}/templates/spoke/docker-compose.template.yml"
  pass "Prototype stability checks complete"
}

main "$@"
