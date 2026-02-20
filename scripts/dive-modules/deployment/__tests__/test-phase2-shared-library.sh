#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Phase 2 Shared Pipeline Library Tests
# =============================================================================
# Tests for: pipeline-utils.sh health checks, service SSOT, secret loading,
#            retry with backoff, container name helpers
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODULES_DIR="$(cd "$DEPLOYMENT_DIR/.." && pwd)"
DIVE_ROOT="$(cd "$MODULES_DIR/../.." && pwd)"
export DIVE_ROOT

# Prevent re-entry from sourced modules
# shellcheck disable=SC2317
[ -n "${_PHASE2_TEST_RUNNING:-}" ] && { return 0 2>/dev/null || exit 0; }
export _PHASE2_TEST_RUNNING=1

# Test counters
PASS=0
FAIL=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

assert_eq() {
    local expected="$1" actual="$2" desc="$3"
    TOTAL=$((TOTAL + 1))
    if [ "$expected" = "$actual" ]; then
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $desc (expected='$expected', got='$actual')"
        FAIL=$((FAIL + 1))
    fi
}

assert_success() {
    local desc="$1"
    shift
    TOTAL=$((TOTAL + 1))
    if "$@" >/dev/null 2>&1; then
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $desc (command failed: $*)"
        FAIL=$((FAIL + 1))
    fi
}

assert_fail() {
    local desc="$1"
    shift
    TOTAL=$((TOTAL + 1))
    if "$@" >/dev/null 2>&1; then
        echo -e "  ${RED}FAIL${NC} $desc (expected failure but succeeded)"
        FAIL=$((FAIL + 1))
    else
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    fi
}

assert_contains() {
    local haystack="$1" needle="$2" desc="$3"
    TOTAL=$((TOTAL + 1))
    if echo "$haystack" | grep -q "$needle"; then
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $desc (output does not contain '$needle')"
        FAIL=$((FAIL + 1))
    fi
}

assert_not_contains() {
    local haystack="$1" needle="$2" desc="$3"
    TOTAL=$((TOTAL + 1))
    if echo "$haystack" | grep -q "$needle"; then
        echo -e "  ${RED}FAIL${NC} $desc (output contains '$needle' but should not)"
        FAIL=$((FAIL + 1))
    else
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    fi
}

# =============================================================================
# STUB DOCKER AND LOG FUNCTIONS
# =============================================================================
# Docker stub: simulate health check responses based on container name patterns
# This allows testing without Docker daemon.

_DOCKER_STUB_RESPONSES=()

docker_stub_set() {
    local container="$1" health="$2"
    # Replace existing entry if present, otherwise append
    local new_responses=()
    local found=false
    for entry in "${_DOCKER_STUB_RESPONSES[@]}"; do
        local key="${entry%%=*}"
        if [ "$key" = "$container" ]; then
            new_responses+=("${container}=${health}")
            found=true
        else
            new_responses+=("$entry")
        fi
    done
    if [ "$found" = "false" ]; then
        new_responses+=("${container}=${health}")
    fi
    _DOCKER_STUB_RESPONSES=("${new_responses[@]}")
}

docker_stub_clear() {
    _DOCKER_STUB_RESPONSES=()
}

docker() {
    local subcmd="${1:-}"
    shift || true

    case "$subcmd" in
        inspect)
            local container=""
            local format=""
            while [ $# -gt 0 ]; do
                case "$1" in
                    --format=*) format="${1#--format=}" ;;
                    --format) shift; format="$1" ;;
                    -*) ;; # ignore other flags
                    *) container="$1" ;;
                esac
                shift
            done

            # Look up stub response
            for entry in "${_DOCKER_STUB_RESPONSES[@]}"; do
                local key="${entry%%=*}"
                local val="${entry#*=}"
                if [ "$key" = "$container" ]; then
                    if echo "$format" | grep -q "Health.Status"; then
                        echo "$val"
                        return 0
                    elif echo "$format" | grep -q "State.Status"; then
                        if [ "$val" = "not_found" ]; then
                            echo "not_found"
                        else
                            echo "running"
                        fi
                        return 0
                    elif echo "$format" | grep -q "State.Running"; then
                        if [ "$val" = "not_found" ]; then
                            echo "false"
                        else
                            echo "true"
                        fi
                        return 0
                    fi
                fi
            done

            # Default: not found — return 1 with no output
            # (caller's || echo "not_found" provides the fallback)
            return 1
            ;;
        ps)
            local filter_name=""
            local format_str=""
            local show_all=false
            while [ $# -gt 0 ]; do
                case "$1" in
                    --filter) shift
                        case "$1" in
                            name=*) filter_name="${1#name=}" ;;
                        esac
                        ;;
                    --format) shift; format_str="$1" ;;
                    -a) show_all=true ;;
                esac
                shift
            done
            # List containers from stub
            for entry in "${_DOCKER_STUB_RESPONSES[@]}"; do
                local key="${entry%%=*}"
                local val="${entry#*=}"
                if [ "$val" = "not_found" ]; then
                    continue
                fi
                if [ -n "$filter_name" ]; then
                    if echo "$key" | grep -q "$filter_name"; then
                        echo "$key"
                    fi
                else
                    echo "$key"
                fi
            done
            return 0
            ;;
        *)
            return 0
            ;;
    esac
}
export -f docker
export DOCKER_CMD=docker

# Stub log functions
log_info() { :; }
log_error() { :; }
log_success() { :; }
log_warn() { :; }
log_step() { :; }
log_verbose() { :; }
upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
lower() { echo "$1" | tr '[:upper:]' '[:lower:]'; }
export -f log_info log_error log_success log_warn log_step log_verbose upper lower
export DIVE_COMMON_LOADED=1

# =============================================================================
# SOURCE MODULE UNDER TEST
# =============================================================================

source "$DEPLOYMENT_DIR/pipeline-utils.sh"

# =============================================================================
# SUITE 1: SERVICE NAME SSOT
# =============================================================================
echo ""
echo "Suite 1: Service Name SSOT"
echo "=========================="

assert_contains "$PIPELINE_HUB_ALL_SERVICES" "postgres" \
    "Hub services include postgres"

assert_contains "$PIPELINE_HUB_ALL_SERVICES" "keycloak" \
    "Hub services include keycloak"

assert_contains "$PIPELINE_HUB_ALL_SERVICES" "backend" \
    "Hub services include backend"

assert_contains "$PIPELINE_HUB_ALL_SERVICES" "frontend" \
    "Hub services include frontend"

assert_contains "$PIPELINE_HUB_ALL_SERVICES" "mongodb" \
    "Hub services include mongodb"

assert_contains "$PIPELINE_HUB_ALL_SERVICES" "redis" \
    "Hub services include redis"

assert_contains "$PIPELINE_HUB_ALL_SERVICES" "opa" \
    "Hub services include opa"

assert_contains "$PIPELINE_HUB_ALL_SERVICES" "opal-client" \
    "Hub services include opal-client"

assert_contains "$PIPELINE_HUB_ALL_SERVICES" "kas" \
    "Hub services include kas"

assert_contains "$PIPELINE_HUB_ALL_SERVICES" "vault-seal" \
    "Hub services include vault-seal"

assert_contains "$PIPELINE_HUB_ALL_SERVICES" "otel-collector" \
    "Hub services include otel-collector"

assert_contains "$PIPELINE_SPOKE_ALL_SERVICES" "postgres" \
    "Spoke services include postgres"

assert_contains "$PIPELINE_SPOKE_ALL_SERVICES" "keycloak" \
    "Spoke services include keycloak"

assert_contains "$PIPELINE_SPOKE_ALL_SERVICES" "backend" \
    "Spoke services include backend"

assert_contains "$PIPELINE_SPOKE_ALL_SERVICES" "frontend" \
    "Spoke services include frontend"

assert_contains "$PIPELINE_SPOKE_ALL_SERVICES" "kas" \
    "Spoke services include kas"

assert_not_contains "$PIPELINE_SPOKE_ALL_SERVICES" "vault-seal" \
    "Spoke services do NOT include vault-seal"

assert_not_contains "$PIPELINE_SPOKE_ALL_SERVICES" "opal-server" \
    "Spoke services do NOT include opal-server"

# =============================================================================
# SUITE 2: SERVICE TIMEOUTS
# =============================================================================
echo ""
echo "Suite 2: Service Timeouts"
echo "========================="

assert_eq "60" "$(pipeline_get_service_timeout postgres)" \
    "Postgres default timeout is 60s"

assert_eq "90" "$(pipeline_get_service_timeout mongodb)" \
    "MongoDB default timeout is 90s"

assert_eq "30" "$(pipeline_get_service_timeout redis)" \
    "Redis default timeout is 30s"

assert_eq "180" "$(pipeline_get_service_timeout keycloak)" \
    "Keycloak default timeout is 180s"

assert_eq "120" "$(pipeline_get_service_timeout backend)" \
    "Backend default timeout is 120s"

assert_eq "60" "$(pipeline_get_service_timeout unknown-service)" \
    "Unknown service default timeout is 60s"

# Override via env var
TIMEOUT_POSTGRES=120
assert_eq "120" "$(pipeline_get_service_timeout postgres)" \
    "Postgres timeout override via TIMEOUT_POSTGRES=120"
unset TIMEOUT_POSTGRES

# =============================================================================
# SUITE 3: CONTAINER NAME HELPERS
# =============================================================================
echo ""
echo "Suite 3: Container Name Helpers"
echo "==============================="

assert_eq "dive-hub-postgres" "$(pipeline_container_name hub postgres)" \
    "Hub postgres container name"

assert_eq "dive-hub-keycloak" "$(pipeline_container_name hub keycloak)" \
    "Hub keycloak container name"

assert_eq "dive-spoke-gbr-mongodb" "$(pipeline_container_name spoke mongodb GBR)" \
    "Spoke GBR mongodb container name"

assert_eq "dive-spoke-fra-backend" "$(pipeline_container_name spoke backend FRA)" \
    "Spoke FRA backend container name"

# Test COMPOSE_PROJECT_NAME override
COMPOSE_PROJECT_NAME=custom-project
assert_eq "custom-project-vault-1" "$(pipeline_container_name hub vault-1)" \
    "Hub vault-1 with custom COMPOSE_PROJECT_NAME"
unset COMPOSE_PROJECT_NAME

# =============================================================================
# SUITE 4: HEALTH CHECK PRIMITIVES
# =============================================================================
echo ""
echo "Suite 4: Health Check Primitives"
echo "================================"

docker_stub_clear
docker_stub_set "dive-hub-postgres" "healthy"
docker_stub_set "dive-hub-keycloak" "unhealthy"
docker_stub_set "dive-hub-backend" "starting"

assert_eq "healthy" "$(pipeline_get_container_health dive-hub-postgres)" \
    "Get health: postgres = healthy"

assert_eq "unhealthy" "$(pipeline_get_container_health dive-hub-keycloak)" \
    "Get health: keycloak = unhealthy"

assert_eq "starting" "$(pipeline_get_container_health dive-hub-backend)" \
    "Get health: backend = starting"

assert_eq "not_found" "$(pipeline_get_container_health dive-hub-nonexistent)" \
    "Get health: nonexistent = not_found"

assert_success "Container exists: postgres" \
    pipeline_container_exists "dive-hub-postgres"

assert_fail "Container not exists: nonexistent" \
    pipeline_container_exists "dive-hub-nonexistent"

assert_success "Container running: postgres" \
    pipeline_container_running "dive-hub-postgres"

assert_eq "running" "$(pipeline_get_container_state dive-hub-postgres)" \
    "Get state: postgres = running"

# =============================================================================
# SUITE 5: WAIT FOR HEALTHY
# =============================================================================
echo ""
echo "Suite 5: Wait for Healthy"
echo "========================="

docker_stub_clear
docker_stub_set "dive-hub-healthy-svc" "healthy"

# Container already healthy -> immediate return
assert_success "Wait returns immediately for healthy container" \
    pipeline_wait_for_healthy "dive-hub-healthy-svc" 5 1

# Container not found -> returns failure
docker_stub_clear
docker_stub_set "dive-hub-missing-svc" "not_found"
assert_fail "Wait returns failure for not_found container" \
    pipeline_wait_for_healthy "dive-hub-missing-svc" 2 1

# Container unhealthy with short timeout -> returns failure
docker_stub_clear
docker_stub_set "dive-hub-sick-svc" "unhealthy"
assert_fail "Wait returns failure for unhealthy container after timeout" \
    pipeline_wait_for_healthy "dive-hub-sick-svc" 2 1

# =============================================================================
# SUITE 6: BATCH HEALTH CHECK
# =============================================================================
echo ""
echo "Suite 6: Batch Health Check"
echo "==========================="

docker_stub_clear
docker_stub_set "dive-hub-postgres" "healthy"
docker_stub_set "dive-hub-keycloak" "healthy"
docker_stub_set "dive-hub-backend" "healthy"

local_output=$(pipeline_batch_health_check "dive-hub" "postgres" "keycloak" "backend")
assert_contains "$local_output" "postgres:healthy" \
    "Batch check: postgres healthy"
assert_contains "$local_output" "keycloak:healthy" \
    "Batch check: keycloak healthy"
assert_contains "$local_output" "backend:healthy" \
    "Batch check: backend healthy"
assert_success "Batch check returns 0 when all healthy" \
    pipeline_batch_health_check "dive-hub" "postgres" "keycloak" "backend"

docker_stub_set "dive-hub-keycloak" "unhealthy"
assert_fail "Batch check returns 1 when any unhealthy" \
    pipeline_batch_health_check "dive-hub" "postgres" "keycloak" "backend"

# =============================================================================
# SUITE 7: RETRY WITH BACKOFF
# =============================================================================
echo ""
echo "Suite 7: Retry with Backoff"
echo "==========================="

_test_retry_counter=0
_test_retry_succeed_on_attempt() {
    _test_retry_counter=$((_test_retry_counter + 1))
    [ "$_test_retry_counter" -ge 2 ]
}
export -f _test_retry_succeed_on_attempt

_test_retry_counter=0
assert_success "Retry succeeds on second attempt" \
    pipeline_retry_with_backoff 3 0 _test_retry_succeed_on_attempt

_test_retry_always_fail() {
    return 1
}
export -f _test_retry_always_fail
assert_fail "Retry fails after max attempts" \
    pipeline_retry_with_backoff 2 0 _test_retry_always_fail

_test_retry_always_pass() {
    return 0
}
export -f _test_retry_always_pass
assert_success "Retry succeeds on first attempt" \
    pipeline_retry_with_backoff 3 0 _test_retry_always_pass

# =============================================================================
# SUITE 8: SECRET LOADING
# =============================================================================
echo ""
echo "Suite 8: Secret Loading"
echo "======================="

# Test pipeline_load_secret with env vars
export MONGO_PASSWORD_GBR="test-mongo-pass"
result=$(pipeline_load_secret "MONGO_PASSWORD" "GBR")
assert_eq "test-mongo-pass" "$result" \
    "Load secret from env var: MONGO_PASSWORD_GBR"
unset MONGO_PASSWORD_GBR

# Test pipeline_load_secret from .env file
_test_env_dir=$(mktemp -d)
echo 'REDIS_PASSWORD_FRA=test-redis-pass' > "$_test_env_dir/.env"
result=$(pipeline_load_secret "REDIS_PASSWORD" "FRA" "$_test_env_dir/.env")
assert_eq "test-redis-pass" "$result" \
    "Load secret from .env file: REDIS_PASSWORD_FRA"
rm -rf "$_test_env_dir"

# Test pipeline_load_secret returns failure for missing
assert_fail "Load secret fails for missing secret" \
    pipeline_load_secret "NONEXISTENT_SECRET" "XYZ" "/nonexistent/.env"

# Use temp DIVE_ROOT for secret tests to avoid sourcing real .env.hub
_ORIG_DIVE_ROOT="$DIVE_ROOT"
_TEMP_DIVE_ROOT=$(mktemp -d)
export DIVE_ROOT="$_TEMP_DIVE_ROOT"

# Test pipeline_ensure_secrets_loaded rejects placeholders
export KEYCLOAK_ADMIN_PASSWORD="PLACEHOLDER_changeme"
export POSTGRES_PASSWORD_USA="real-password"
export MONGO_PASSWORD_USA="real-password"
export REDIS_PASSWORD_USA="real-password"
assert_fail "Secret validation rejects placeholder values" \
    pipeline_ensure_secrets_loaded "hub"
unset KEYCLOAK_ADMIN_PASSWORD POSTGRES_PASSWORD_USA MONGO_PASSWORD_USA REDIS_PASSWORD_USA

# Test pipeline_ensure_secrets_loaded rejects empty
export KEYCLOAK_ADMIN_PASSWORD=""
export POSTGRES_PASSWORD_USA="real-password"
export MONGO_PASSWORD_USA="real-password"
export REDIS_PASSWORD_USA="real-password"
assert_fail "Secret validation rejects empty values" \
    pipeline_ensure_secrets_loaded "hub"
unset KEYCLOAK_ADMIN_PASSWORD POSTGRES_PASSWORD_USA MONGO_PASSWORD_USA REDIS_PASSWORD_USA

# Test pipeline_ensure_secrets_loaded succeeds with all valid
export KEYCLOAK_ADMIN_PASSWORD="valid-pass"
export POSTGRES_PASSWORD_USA="valid-pass"
export MONGO_PASSWORD_USA="valid-pass"
export REDIS_PASSWORD_USA="valid-pass"
assert_success "Secret validation passes with all valid values" \
    pipeline_ensure_secrets_loaded "hub"
unset KEYCLOAK_ADMIN_PASSWORD POSTGRES_PASSWORD_USA MONGO_PASSWORD_USA REDIS_PASSWORD_USA

# Restore DIVE_ROOT
rm -rf "$_TEMP_DIVE_ROOT"
export DIVE_ROOT="$_ORIG_DIVE_ROOT"

# =============================================================================
# SUITE 9: WAIT FOR HEALTHY OR RUNNING
# =============================================================================
echo ""
echo "Suite 9: Wait for Healthy or Running"
echo "====================================="

docker_stub_clear
docker_stub_set "dive-hub-healthy-svc2" "healthy"
assert_success "Wait-or-running returns immediately for healthy container" \
    pipeline_wait_for_healthy_or_running "dive-hub-healthy-svc2" 5 1 2

docker_stub_clear
docker_stub_set "dive-hub-no-health-svc" "none"
# Container running with no healthcheck, grace period 0 for instant pass
assert_success "Wait-or-running passes for running container with no healthcheck" \
    pipeline_wait_for_healthy_or_running "dive-hub-no-health-svc" 5 1 0

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "================================"
echo -e "Results: ${PASS}/${TOTAL} passed, ${FAIL} failed"
echo "================================"

if [ $FAIL -gt 0 ]; then
    echo -e "${RED}SOME TESTS FAILED${NC}"
    exit 1
fi

echo -e "${GREEN}ALL TESTS PASSED${NC}"
exit 0
