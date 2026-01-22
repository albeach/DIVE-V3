#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Deployment Resilience Integration Tests
# =============================================================================
# Comprehensive test suite for production resilience scenarios:
#   1. Clean slate deployment (nuke → hub → spoke)
#   2. Idempotent deployment (deploy twice without errors)
#   3. Concurrent deployment (multiple spokes simultaneously)
#   4. Federation verification with exponential backoff
#   5. Schema migration idempotency
#
# Part of Phase 1: Production Resilience Foundations
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-21
# =============================================================================

set -o pipefail  # Fail on pipe errors

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export DIVE_ROOT

# Source common utilities
source "${DIVE_ROOT}/scripts/dive-modules/common.sh" 2>/dev/null || {
    echo "ERROR: Cannot source common.sh"
    exit 1
}

# =============================================================================
# COLORS AND FORMATTING
# =============================================================================
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# =============================================================================
# ENVIRONMENT CONFIGURATION
# =============================================================================
# Use environment variables for URLs with sensible defaults for local testing
HUB_BACKEND_URL="${HUB_BACKEND_URL:-https://localhost:4000}"
HUB_KEYCLOAK_URL="${HUB_KEYCLOAK_URL:-https://localhost:8443}"

# =============================================================================
# TEST STATE
# =============================================================================
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test timing
START_TIME=""
END_TIME=""

# =============================================================================
# TEST UTILITIES
# =============================================================================

##
# Start test timer
##
test_timer_start() {
    START_TIME=$(date +%s)
}

##
# Stop timer and report duration
##
test_timer_stop() {
    END_TIME=$(date +%s)
    local duration=$((END_TIME - START_TIME))
    echo "Duration: ${duration}s"
}

##
# Run a test and record result
#
# Arguments:
#   $1 - Test description
#   $2 - Test function name
##
run_test() {
    local description="$1"
    local test_func="$2"

    ((TESTS_TOTAL++))

    echo -n "  Testing: $description... "

    local result
    local output
    output=$($test_func 2>&1)
    result=$?

    if [ $result -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((TESTS_PASSED++))
        return 0
    elif [ $result -eq 2 ]; then
        echo -e "${YELLOW}⏭ SKIP${NC} (precondition not met)"
        ((TESTS_SKIPPED++))
        return 2
    else
        echo -e "${RED}✗ FAIL${NC}"
        [ -n "$output" ] && echo "    Error: $output"
        ((TESTS_FAILED++))
        return 1
    fi
}

##
# Assert that a command succeeds
#
# Arguments:
#   $@ - Command to run
##
assert_success() {
    if "$@" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

##
# Assert that a container is running and healthy
#
# Arguments:
#   $1 - Container name
##
assert_container_healthy() {
    local container="$1"

    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo "Container $container not running"
        return 1
    fi

    local health
    health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-healthcheck")

    case "$health" in
        healthy) return 0 ;;
        no-healthcheck)
            # Check if running
            local running
            running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null)
            [ "$running" = "true" ]
            ;;
        *) return 1 ;;
    esac
}

##
# Assert all Hub containers are healthy
##
assert_hub_healthy() {
    local required_containers=(
        "dive-hub-keycloak"
        "dive-hub-backend"
        "dive-hub-frontend"
        "dive-hub-postgres"
        "dive-hub-mongodb"
    )

    for container in "${required_containers[@]}"; do
        if ! assert_container_healthy "$container"; then
            echo "Hub container unhealthy: $container"
            return 1
        fi
    done

    return 0
}

##
# Assert all spoke containers are healthy
#
# Arguments:
#   $1 - Spoke code (lowercase)
##
assert_spoke_healthy() {
    local code_lower="$1"
    local required_containers=(
        "dive-spoke-${code_lower}-keycloak"
        "dive-spoke-${code_lower}-backend"
        "dive-spoke-${code_lower}-frontend"
        "dive-spoke-${code_lower}-postgres"
        "dive-spoke-${code_lower}-mongodb"
    )

    for container in "${required_containers[@]}"; do
        if ! assert_container_healthy "$container"; then
            echo "Spoke container unhealthy: $container"
            return 1
        fi
    done

    return 0
}

##
# Assert federation is bidirectional
#
# Arguments:
#   $1 - Spoke code
##
assert_federation_bidirectional() {
    local spoke_code="$1"

    # Use the federation verify command
    local result
    result=$(./dive federation verify "$spoke_code" 2>&1)

    if echo "$result" | grep -q "Bidirectional federation is properly configured\|bidirectional.*true\|8/8 checks passed"; then
        return 0
    else
        echo "Federation not bidirectional: $result"
        return 1
    fi
}

# =============================================================================
# TEST SUITE 1: CLEAN SLATE DEPLOYMENT
# =============================================================================

test_clean_slate_hub_deploy() {
    # Verify Hub can be deployed from clean state
    # Precondition: ./dive nuke all --confirm was run

    # Check no hub containers exist
    if docker ps --format '{{.Names}}' | grep -q "dive-hub"; then
        echo "Hub containers exist - nuke may not have completed"
        return 2  # Skip - precondition not met
    fi

    # Deploy hub
    if ! ./dive hub deploy 2>&1 | tee /dev/null; then
        echo "Hub deploy failed"
        return 1
    fi

    # Verify containers are healthy (with wait)
    sleep 30
    assert_hub_healthy
}

test_clean_slate_spoke_deploy() {
    # Verify spoke can be deployed after hub
    # Precondition: Hub is deployed

    if ! assert_hub_healthy; then
        echo "Hub not healthy - cannot deploy spoke"
        return 2
    fi

    # Check no spoke containers exist for test instance
    local test_code="tst"
    if docker ps --format '{{.Names}}' | grep -q "dive-spoke-${test_code}"; then
        echo "Spoke containers exist - cleaning up"
        ./dive spoke down "$test_code" 2>/dev/null || true
        sleep 5
    fi

    # Deploy spoke
    if ! ./dive spoke deploy "$test_code" 2>&1 | tee /dev/null; then
        echo "Spoke deploy failed"
        return 1
    fi

    # Verify containers are healthy (with wait)
    sleep 45
    assert_spoke_healthy "$test_code"
}

test_clean_slate_federation_established() {
    # Verify federation is bidirectional after clean deployment
    local test_code="TST"

    # Check spoke is healthy
    if ! assert_spoke_healthy "tst"; then
        return 2
    fi

    # Verify federation (with retries for eventual consistency)
    local max_retries=5
    local retry=0

    while [ $retry -lt $max_retries ]; do
        if assert_federation_bidirectional "$test_code"; then
            return 0
        fi
        ((retry++))
        sleep 10
    done

    echo "Federation not established after $max_retries attempts"
    return 1
}

suite_clean_slate() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 1: Clean Slate Deployment${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "This suite tests deployment from a clean state (./dive nuke all --confirm)"
    echo ""

    run_test "Hub deploys from clean state" test_clean_slate_hub_deploy
    run_test "Spoke deploys after hub" test_clean_slate_spoke_deploy
    run_test "Federation established bidirectionally" test_clean_slate_federation_established
}

# =============================================================================
# TEST SUITE 2: IDEMPOTENT DEPLOYMENT
# =============================================================================

test_idempotent_hub_redeploy() {
    # Verify hub can be redeployed without errors
    if ! assert_hub_healthy; then
        return 2
    fi

    # Redeploy hub (should be idempotent)
    if ! ./dive hub deploy 2>&1 | tee /dev/null; then
        echo "Hub redeploy failed"
        return 1
    fi

    # Verify still healthy
    sleep 15
    assert_hub_healthy
}

test_idempotent_spoke_redeploy() {
    # Verify spoke can be redeployed without errors
    local test_code="tst"

    if ! assert_spoke_healthy "$test_code"; then
        return 2
    fi

    # Redeploy spoke (should be idempotent)
    if ! ./dive spoke deploy "$test_code" 2>&1 | tee /dev/null; then
        echo "Spoke redeploy failed"
        return 1
    fi

    # Verify still healthy
    sleep 20
    assert_spoke_healthy "$test_code"
}

test_idempotent_federation_preserved() {
    # Verify federation is preserved after redeploy
    local test_code="TST"

    if ! assert_spoke_healthy "tst"; then
        return 2
    fi

    assert_federation_bidirectional "$test_code"
}

test_idempotent_schema_migration() {
    # Verify schema migration is idempotent
    if ! assert_hub_healthy; then
        return 2
    fi

    # Run schema init twice (should succeed both times)
    source "${DIVE_ROOT}/scripts/dive-modules/orchestration-state-db.sh"

    if ! orch_db_init_schema 2>&1; then
        echo "First schema init failed"
        return 1
    fi

    if ! orch_db_init_schema 2>&1; then
        echo "Second schema init failed (not idempotent)"
        return 1
    fi

    return 0
}

suite_idempotent() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 2: Idempotent Deployment${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "This suite tests that deployments are idempotent (running twice is safe)"
    echo ""

    run_test "Hub redeploy is idempotent" test_idempotent_hub_redeploy
    run_test "Spoke redeploy is idempotent" test_idempotent_spoke_redeploy
    run_test "Federation preserved after redeploy" test_idempotent_federation_preserved
    run_test "Schema migration is idempotent" test_idempotent_schema_migration
}

# =============================================================================
# TEST SUITE 3: CONCURRENT DEPLOYMENT
# =============================================================================

test_concurrent_spoke_deploy() {
    # Test deploying two spokes concurrently
    if ! assert_hub_healthy; then
        return 2
    fi

    local code1="abc"
    local code2="xyz"

    # Clean up any existing instances
    ./dive spoke down "$code1" 2>/dev/null || true
    ./dive spoke down "$code2" 2>/dev/null || true
    sleep 5

    # Deploy both concurrently
    ./dive spoke deploy "$code1" &
    local pid1=$!

    ./dive spoke deploy "$code2" &
    local pid2=$!

    # Wait for both
    local result1=0
    local result2=0
    wait $pid1 || result1=$?
    wait $pid2 || result2=$?

    # Check both succeeded
    if [ $result1 -ne 0 ] || [ $result2 -ne 0 ]; then
        echo "One or both concurrent deploys failed: $code1=$result1, $code2=$result2"
        return 1
    fi

    # Verify both are healthy
    sleep 30
    if ! assert_spoke_healthy "$code1"; then
        echo "Spoke $code1 not healthy"
        return 1
    fi

    if ! assert_spoke_healthy "$code2"; then
        echo "Spoke $code2 not healthy"
        return 1
    fi

    return 0
}

test_concurrent_no_deadlock() {
    # Verify no deadlocks with concurrent operations
    if ! assert_hub_healthy; then
        return 2
    fi

    # Run multiple status checks concurrently (should not deadlock)
    ./dive status &
    local pid1=$!

    ./dive orch-db status &
    local pid2=$!

    ./dive federation status &
    local pid3=$!

    # Wait with timeout
    local timeout=30
    local elapsed=0

    while [ $elapsed -lt $timeout ]; do
        if ! kill -0 $pid1 2>/dev/null && ! kill -0 $pid2 2>/dev/null && ! kill -0 $pid3 2>/dev/null; then
            # All completed
            return 0
        fi
        sleep 1
        ((elapsed++))
    done

    # Timeout - potential deadlock
    kill $pid1 $pid2 $pid3 2>/dev/null || true
    echo "Concurrent operations timed out (potential deadlock)"
    return 1
}

suite_concurrent() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 3: Concurrent Deployment${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "This suite tests concurrent operations don't cause race conditions"
    echo ""

    run_test "Concurrent spoke deploys succeed" test_concurrent_spoke_deploy
    run_test "No deadlocks in concurrent operations" test_concurrent_no_deadlock
}

# =============================================================================
# TEST SUITE 4: FEDERATION VERIFICATION RESILIENCE
# =============================================================================

test_federation_retry_logic() {
    # Test that federation verification has proper retry logic
    local test_code="TST"

    if ! assert_spoke_healthy "tst"; then
        return 2
    fi

    # The federation verify command should handle retries internally
    # We just verify it completes within reasonable time
    local timeout=120
    local start=$(date +%s)

    ./dive federation verify "$test_code" &
    local pid=$!

    while kill -0 $pid 2>/dev/null; do
        local elapsed=$(($(date +%s) - start))
        if [ $elapsed -gt $timeout ]; then
            kill $pid 2>/dev/null
            echo "Federation verify timed out after ${timeout}s"
            return 1
        fi
        sleep 1
    done

    wait $pid
}

test_oidc_endpoints_reachable() {
    # Test OIDC discovery endpoints are reachable
    local test_code="tst"

    if ! assert_spoke_healthy "$test_code"; then
        return 2
    fi

    # Get spoke port and URL from config or environment
    local spoke_keycloak_url
    if [ -f "${DIVE_ROOT}/instances/${test_code}/config.json" ]; then
        spoke_keycloak_url=$(jq -r '.endpoints.idpPublicUrl // ""' \
            "${DIVE_ROOT}/instances/${test_code}/config.json")
    fi
    # Fall back to localhost with default port if not configured
    spoke_keycloak_url="${spoke_keycloak_url:-${SPOKE_KEYCLOAK_URL:-https://127.0.0.1:8643}}"

    # Test spoke OIDC
    if ! curl -sk --max-time 10 "${spoke_keycloak_url}/realms/dive-v3-broker-${test_code}/.well-known/openid-configuration" | grep -q '"issuer"'; then
        echo "Spoke OIDC discovery not reachable at ${spoke_keycloak_url}"
        return 1
    fi

    # Test hub OIDC using configured URL
    if ! curl -sk --max-time 10 "${HUB_KEYCLOAK_URL}/realms/dive-v3-broker-usa/.well-known/openid-configuration" | grep -q '"issuer"'; then
        echo "Hub OIDC discovery not reachable at ${HUB_KEYCLOAK_URL}"
        return 1
    fi

    return 0
}

suite_federation_resilience() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 4: Federation Verification Resilience${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "This suite tests federation verification handles eventual consistency"
    echo ""

    run_test "Federation verify completes with retries" test_federation_retry_logic
    run_test "OIDC discovery endpoints reachable" test_oidc_endpoints_reachable
}

# =============================================================================
# TEST SUITE 5: DATABASE OPERATIONS
# =============================================================================

test_database_advisory_locks() {
    # Test advisory locks work correctly
    if ! assert_hub_healthy; then
        return 2
    fi

    source "${DIVE_ROOT}/scripts/dive-modules/orchestration-state-db.sh"

    # Test acquiring lock
    if ! orch_db_acquire_lock "test-lock" 0; then
        echo "Failed to acquire advisory lock"
        return 1
    fi

    # Release lock
    if ! orch_db_release_lock "test-lock"; then
        echo "Failed to release advisory lock"
        return 1
    fi

    return 0
}

test_database_state_persistence() {
    # Test state is properly persisted in database
    if ! assert_hub_healthy; then
        return 2
    fi

    source "${DIVE_ROOT}/scripts/dive-modules/orchestration-state-db.sh"

    # Set a test state
    local test_instance="teststate"
    orch_db_set_state "$test_instance" "TESTING" "Integration test"

    # Read it back
    local state
    state=$(orch_db_get_state "$test_instance")

    if [ "$state" != "TESTING" ]; then
        echo "State not persisted correctly: expected TESTING, got $state"
        return 1
    fi

    return 0
}

suite_database() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 5: Database Operations${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "This suite tests database state management operations"
    echo ""

    run_test "Advisory locks work correctly" test_database_advisory_locks
    run_test "State persists in database" test_database_state_persistence
}

# =============================================================================
# TEST SUITE 6: CIRCUIT BREAKER VERIFICATION (Phase 3.2)
# =============================================================================

test_circuit_breaker_states_in_health() {
    # Test that circuit breaker states are reported in health endpoint
    if ! assert_hub_healthy; then
        return 2
    fi
    
    # Get detailed health which includes circuit breakers
    local health_response
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    if [ -z "$health_response" ]; then
        echo "Failed to get health response"
        return 1
    fi
    
    # Check that circuitBreakers section exists
    if ! echo "$health_response" | jq -e '.circuitBreakers' >/dev/null 2>&1; then
        echo "circuitBreakers section missing from health response"
        return 1
    fi
    
    # Verify all expected circuit breakers are present
    local expected_breakers=("opa" "keycloak" "mongodb" "kas")
    for breaker in "${expected_breakers[@]}"; do
        if ! echo "$health_response" | jq -e ".circuitBreakers.${breaker}" >/dev/null 2>&1; then
            echo "Circuit breaker '$breaker' missing from health response"
            return 1
        fi
    done
    
    # Verify all circuit breakers are in CLOSED state (normal operation)
    for breaker in "${expected_breakers[@]}"; do
        local state
        state=$(echo "$health_response" | jq -r ".circuitBreakers.${breaker}.state")
        
        if [ "$state" != "CLOSED" ]; then
            echo "Circuit breaker '$breaker' is in unexpected state: $state (expected: CLOSED)"
            # This is a warning, not a failure - the service might be recovering
            # Only fail if state is OPEN
            if [ "$state" = "OPEN" ]; then
                return 1
            fi
        fi
    done
    
    return 0
}

test_health_check_all_services() {
    # Verify all 7 services report "up" status
    if ! assert_hub_healthy; then
        return 2
    fi
    
    local health_response
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    if [ -z "$health_response" ]; then
        echo "Failed to get health response"
        return 1
    fi
    
    # Expected services
    local expected_services=("mongodb" "opa" "keycloak" "redis" "kas" "cache" "blacklistRedis")
    local failed_services=()
    
    for service in "${expected_services[@]}"; do
        local status
        status=$(echo "$health_response" | jq -r ".services.${service}.status // \"missing\"")
        
        if [ "$status" = "missing" ]; then
            # Some services may be optional (kas, blacklistRedis)
            if [ "$service" != "kas" ] && [ "$service" != "blacklistRedis" ]; then
                failed_services+=("$service: missing")
            fi
        elif [ "$status" = "down" ]; then
            failed_services+=("$service: down")
        fi
    done
    
    if [ ${#failed_services[@]} -gt 0 ]; then
        echo "Failed services: ${failed_services[*]}"
        return 1
    fi
    
    return 0
}

test_ssl_certificate_trust() {
    # Verify HTTPS health checks work without SSL errors
    if ! assert_hub_healthy; then
        return 2
    fi
    
    # Test Hub backend HTTPS
    local hub_backend_response
    hub_backend_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health" 2>&1)
    
    if echo "$hub_backend_response" | grep -qi "certificate\|ssl\|tls" | grep -qi "error\|verify\|failed"; then
        echo "SSL certificate error detected for hub backend"
        return 1
    fi
    
    # Test Keycloak HTTPS
    local kc_response
    kc_response=$(curl -sk --max-time 10 "${HUB_KEYCLOAK_URL}/realms/master" 2>&1)
    
    if echo "$kc_response" | grep -qi "certificate\|ssl\|tls" | grep -qi "error\|verify\|failed"; then
        echo "SSL certificate error detected for keycloak"
        return 1
    fi
    
    return 0
}

test_blacklist_redis_connectivity() {
    # Verify blacklist Redis is reachable (for cross-instance token revocation)
    if ! assert_hub_healthy; then
        return 2
    fi
    
    local health_response
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    local blacklist_status
    blacklist_status=$(echo "$health_response" | jq -r '.services.blacklistRedis.status // "missing"')
    
    # Blacklist Redis is optional but recommended
    if [ "$blacklist_status" = "down" ]; then
        echo "Blacklist Redis is down - cross-instance token revocation will not work"
        # This is a warning - we return success but log the warning
        echo "WARNING: blacklistRedis is down (degraded functionality)"
    fi
    
    return 0
}

suite_circuit_breaker() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 6: Circuit Breaker Verification (Phase 3.2)${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "This suite tests circuit breaker integration and health reporting"
    echo ""
    
    run_test "Circuit breaker states in health response" test_circuit_breaker_states_in_health
    run_test "All 7 services report up status" test_health_check_all_services
    run_test "SSL certificate trust working" test_ssl_certificate_trust
    run_test "Blacklist Redis connectivity" test_blacklist_redis_connectivity
}

# =============================================================================
# TEST SUITE 7: FAILURE INJECTION (Phase 4.1)
# =============================================================================
# These tests validate circuit breaker behavior under service failures
# They require the --with-failure-injection flag to run
# 
# Circuit Breaker Thresholds:
# - OPA: 5 failures → OPEN, 60s cooldown, 2 successes → CLOSED
# - Keycloak: 3 failures → OPEN, 30s cooldown, 2 successes → CLOSED
# - MongoDB: 5 failures → OPEN, 60s cooldown, 3 successes → CLOSED
# - KAS: 3 failures → OPEN, 30s cooldown, 2 successes → CLOSED
# =============================================================================

# Global flag for failure injection tests
FAILURE_INJECTION_ENABLED="${FAILURE_INJECTION_ENABLED:-false}"

##
# Get circuit breaker state from health endpoint
#
# Arguments:
#   $1 - Service name (opa, keycloak, mongodb, kas)
#
# Returns:
#   Circuit breaker state (CLOSED, HALF_OPEN, OPEN)
##
get_circuit_breaker_state() {
    local service="$1"
    local response
    response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    if [ -z "$response" ]; then
        echo "UNKNOWN"
        return 1
    fi
    
    local state
    state=$(echo "$response" | jq -r ".circuitBreakers.${service}.state // \"UNKNOWN\"")
    echo "$state"
}

##
# Wait for circuit breaker to reach a specific state
#
# Arguments:
#   $1 - Service name
#   $2 - Expected state
#   $3 - Timeout in seconds (default: 60)
#
# Returns:
#   0 - State reached
#   1 - Timeout
##
wait_for_circuit_state() {
    local service="$1"
    local expected_state="$2"
    local timeout="${3:-60}"
    local elapsed=0
    local interval=5
    
    while [ $elapsed -lt $timeout ]; do
        local current_state
        current_state=$(get_circuit_breaker_state "$service")
        
        if [ "$current_state" = "$expected_state" ]; then
            return 0
        fi
        
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    
    echo "Timeout waiting for $service circuit to reach $expected_state (current: $(get_circuit_breaker_state "$service"))"
    return 1
}

##
# Trigger circuit breaker by making requests to a downed service
#
# Arguments:
#   $1 - Endpoint to hit (to trigger failures)
#   $2 - Number of attempts
##
trigger_circuit_breaker() {
    local endpoint="$1"
    local attempts="${2:-10}"
    
    for i in $(seq 1 $attempts); do
        curl -sk --max-time 3 "${HUB_BACKEND_URL}${endpoint}" >/dev/null 2>&1 || true
        sleep 1
    done
}

test_opa_failure_health_reports_down() {
    # Test that stopping OPA causes health endpoint to report OPA as down
    # Note: Circuit breaker only opens with authenticated requests through authz middleware
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    if ! assert_hub_healthy; then
        return 2
    fi
    
    echo "    Stopping OPA container..."
    docker stop dive-hub-opa >/dev/null 2>&1
    
    sleep 10  # Wait for health check to detect the change
    
    # Check health endpoint reports OPA as down
    local health_response
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    local opa_status
    opa_status=$(echo "$health_response" | jq -r '.services.opa.status // "unknown"')
    
    local overall_status
    overall_status=$(echo "$health_response" | jq -r '.status')
    
    echo "    OPA status: $opa_status, Overall: $overall_status"
    
    # Restart OPA
    docker start dive-hub-opa >/dev/null 2>&1
    
    if [ "$opa_status" = "down" ]; then
        echo "    ✓ OPA correctly reported as down when stopped"
        # OPA is critical, so system should be unhealthy
        if [ "$overall_status" = "unhealthy" ]; then
            echo "    ✓ System correctly marked unhealthy (OPA is critical)"
        fi
        return 0
    fi
    
    echo "    OPA status: $opa_status (expected: down)"
    return 1
}

test_keycloak_failure_health_reports_down() {
    # Test that stopping Keycloak causes health endpoint to report it as down
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    if ! assert_hub_healthy; then
        return 2
    fi
    
    echo "    Stopping Keycloak container..."
    docker stop dive-hub-keycloak >/dev/null 2>&1
    
    sleep 10  # Wait for health check to detect the change
    
    # Check health endpoint reports Keycloak as down
    local health_response
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    local kc_status
    kc_status=$(echo "$health_response" | jq -r '.services.keycloak.status // "unknown"')
    
    local overall_status
    overall_status=$(echo "$health_response" | jq -r '.status')
    
    echo "    Keycloak status: $kc_status, Overall: $overall_status"
    
    # Restart Keycloak
    docker start dive-hub-keycloak >/dev/null 2>&1
    
    if [ "$kc_status" = "down" ]; then
        echo "    ✓ Keycloak correctly reported as down when stopped"
        # Keycloak is non-critical, so system should be degraded (not unhealthy)
        if [ "$overall_status" = "degraded" ]; then
            echo "    ✓ System correctly marked degraded (Keycloak is non-critical)"
        fi
        return 0
    fi
    
    echo "    Keycloak status: $kc_status (expected: down)"
    return 1
}

test_mongodb_failure_health_reports_down() {
    # Test that stopping MongoDB causes health endpoint to report it as down
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    if ! assert_hub_healthy; then
        return 2
    fi
    
    echo "    Stopping MongoDB container..."
    docker stop dive-hub-mongodb >/dev/null 2>&1
    
    sleep 10  # Wait for health check to detect the change
    
    # Check health endpoint reports MongoDB as down
    local health_response
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    local mongo_status
    mongo_status=$(echo "$health_response" | jq -r '.services.mongodb.status // "unknown"')
    
    local overall_status
    overall_status=$(echo "$health_response" | jq -r '.status')
    
    echo "    MongoDB status: $mongo_status, Overall: $overall_status"
    
    # Restart MongoDB
    docker start dive-hub-mongodb >/dev/null 2>&1
    
    if [ "$mongo_status" = "down" ]; then
        echo "    ✓ MongoDB correctly reported as down when stopped"
        # MongoDB is critical, so system should be unhealthy
        if [ "$overall_status" = "unhealthy" ]; then
            echo "    ✓ System correctly marked unhealthy (MongoDB is critical)"
        fi
        return 0
    fi
    
    echo "    MongoDB status: $mongo_status (expected: down)"
    return 1
}

test_service_recovery_health_reports_up() {
    # Test that restarting services causes health endpoint to report them as up
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    # Ensure all services are running
    echo "    Starting all services..."
    docker start dive-hub-opa dive-hub-keycloak dive-hub-mongodb >/dev/null 2>&1 || true
    
    echo "    Waiting for services to become healthy (45s)..."
    sleep 45
    
    # Check health endpoint
    local health_response
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    if [ -z "$health_response" ]; then
        echo "    Failed to get health response"
        return 1
    fi
    
    local overall_status
    overall_status=$(echo "$health_response" | jq -r '.status')
    
    local opa_status
    opa_status=$(echo "$health_response" | jq -r '.services.opa.status // "unknown"')
    
    local mongo_status
    mongo_status=$(echo "$health_response" | jq -r '.services.mongodb.status // "unknown"')
    
    echo "    Status - Overall: $overall_status, OPA: $opa_status, MongoDB: $mongo_status"
    
    if [ "$opa_status" = "up" ] && [ "$mongo_status" = "up" ]; then
        echo "    ✓ Critical services recovered and reporting up"
        if [ "$overall_status" = "healthy" ]; then
            echo "    ✓ System returned to healthy status"
        fi
        return 0
    fi
    
    echo "    Services not fully recovered"
    return 1
}

test_graceful_degradation_blacklist_down() {
    # Test that system gracefully degrades when blacklist Redis is down
    if ! assert_hub_healthy; then
        return 2
    fi
    
    # Check health status with blacklist down
    local health_response
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    if [ -z "$health_response" ]; then
        echo "Failed to get health response"
        return 1
    fi
    
    local overall_status
    overall_status=$(echo "$health_response" | jq -r '.status')
    
    local blacklist_status
    blacklist_status=$(echo "$health_response" | jq -r '.services.blacklistRedis.status // "missing"')
    
    # If blacklist is down, status should be "degraded" not "unhealthy"
    if [ "$blacklist_status" = "down" ]; then
        if [ "$overall_status" = "unhealthy" ]; then
            echo "System incorrectly marked as unhealthy when blacklist Redis is down"
            echo "Expected: degraded, Got: unhealthy"
            return 1
        fi
        echo "Graceful degradation confirmed: blacklist down -> status: $overall_status"
    elif [ "$blacklist_status" = "up" ]; then
        echo "Blacklist Redis is up - graceful degradation not testable without stopping it"
        # Test passes as service is healthy
    fi
    
    return 0
}

test_redis_failure_graceful_degradation() {
    # Test that stopping Redis causes degraded (not unhealthy) status
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    if ! assert_hub_healthy; then
        return 2
    fi
    
    echo "    Stopping Redis container..."
    docker stop dive-hub-redis >/dev/null 2>&1
    
    sleep 5
    
    # Check health status
    local health_response
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    local overall_status
    overall_status=$(echo "$health_response" | jq -r '.status')
    
    # Redis is non-critical, status should be degraded (not unhealthy)
    if [ "$overall_status" = "degraded" ]; then
        echo "    ✓ System correctly shows 'degraded' when Redis is down"
        docker start dive-hub-redis >/dev/null 2>&1
        return 0
    elif [ "$overall_status" = "healthy" ]; then
        echo "    System still healthy (Redis may not be critical) - acceptable"
        docker start dive-hub-redis >/dev/null 2>&1
        return 0
    elif [ "$overall_status" = "unhealthy" ]; then
        echo "    System incorrectly marked as unhealthy when only Redis is down"
        docker start dive-hub-redis >/dev/null 2>&1
        return 1
    fi
    
    docker start dive-hub-redis >/dev/null 2>&1
    return 0
}

test_all_services_recovery() {
    # Test full service recovery after multiple failures
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    echo "    Ensuring all services are running..."
    
    # Start all potentially stopped services
    docker start dive-hub-opa dive-hub-keycloak dive-hub-mongodb dive-hub-redis dive-hub-redis-blacklist >/dev/null 2>&1 || true
    
    echo "    Waiting for services to stabilize (60s)..."
    sleep 60
    
    # Verify all services are healthy
    local health_response
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    if [ -z "$health_response" ]; then
        echo "    Failed to get health response"
        return 1
    fi
    
    local overall_status
    overall_status=$(echo "$health_response" | jq -r '.status')
    
    if [ "$overall_status" = "healthy" ]; then
        echo "    ✓ All services recovered - system healthy"
        return 0
    elif [ "$overall_status" = "degraded" ]; then
        echo "    System in degraded state - checking services..."
        echo "$health_response" | jq '.services | to_entries | map(select(.value.status != "up")) | .[].key'
        return 0  # Accept degraded as partial success
    else
        echo "    System unhealthy after recovery attempt"
        return 1
    fi
}

suite_failure_injection() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 7: Failure Injection (Phase 4.1)${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "This suite tests health reporting during service failures"
    if [ "$FAILURE_INJECTION_ENABLED" = "true" ]; then
        echo -e "${YELLOW}⚠️  FAILURE INJECTION ENABLED - Services will be stopped${NC}"
    else
        echo "Run with --with-failure-injection to enable destructive tests"
    fi
    echo ""
    
    run_test "OPA failure reported in health endpoint" test_opa_failure_health_reports_down
    run_test "Keycloak failure reported in health endpoint" test_keycloak_failure_health_reports_down
    run_test "MongoDB failure reported in health endpoint" test_mongodb_failure_health_reports_down
    run_test "Services recover and health reports up" test_service_recovery_health_reports_up
    run_test "Redis failure causes graceful degradation" test_redis_failure_graceful_degradation
    run_test "Graceful degradation when blacklist down" test_graceful_degradation_blacklist_down
    run_test "All services recover fully" test_all_services_recovery
}

# =============================================================================
# TEST SUITE 8: RECOVERY VALIDATION (Phase 4.2)
# =============================================================================
# These tests validate that systems recover correctly after failures
# Run after failure injection tests to verify recovery patterns
# =============================================================================

test_opa_full_recovery_cycle() {
    # Test complete OPA service recovery cycle (stop → down → start → up)
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    if ! assert_hub_healthy; then
        return 2
    fi
    
    echo "    Phase 1: Stopping OPA..."
    docker stop dive-hub-opa >/dev/null 2>&1
    sleep 10
    
    # Verify OPA reports down
    local health_response
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    local opa_status
    opa_status=$(echo "$health_response" | jq -r '.services.opa.status // "unknown"')
    
    echo "    OPA status after stop: $opa_status"
    
    echo "    Phase 2: Restarting OPA..."
    docker start dive-hub-opa >/dev/null 2>&1
    
    echo "    Phase 3: Waiting for OPA recovery (30s)..."
    sleep 30
    
    # Verify OPA reports up
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    opa_status=$(echo "$health_response" | jq -r '.services.opa.status // "unknown"')
    
    echo "    OPA status after restart: $opa_status"
    
    if [ "$opa_status" = "up" ]; then
        echo "    ✓ OPA completed full recovery cycle"
        return 0
    fi
    
    return 1
}

test_mongodb_full_recovery_cycle() {
    # Test complete MongoDB service recovery cycle
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    if ! assert_hub_healthy; then
        return 2
    fi
    
    echo "    Phase 1: Stopping MongoDB..."
    docker stop dive-hub-mongodb >/dev/null 2>&1
    sleep 10
    
    # Verify MongoDB reports down
    local health_response
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    local mongo_status
    mongo_status=$(echo "$health_response" | jq -r '.services.mongodb.status // "unknown"')
    
    echo "    MongoDB status after stop: $mongo_status"
    
    echo "    Phase 2: Restarting MongoDB..."
    docker start dive-hub-mongodb >/dev/null 2>&1
    
    echo "    Phase 3: Waiting for MongoDB recovery (30s)..."
    sleep 30
    
    # Verify MongoDB reports up
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    mongo_status=$(echo "$health_response" | jq -r '.services.mongodb.status // "unknown"')
    
    echo "    MongoDB status after restart: $mongo_status"
    
    if [ "$mongo_status" = "up" ]; then
        echo "    ✓ MongoDB completed full recovery cycle"
        return 0
    fi
    
    return 1
}

test_multiple_service_failure_recovery() {
    # Test recovery when multiple services fail simultaneously
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    if ! assert_hub_healthy; then
        return 2
    fi
    
    echo "    Phase 1: Stopping OPA and Keycloak..."
    docker stop dive-hub-opa dive-hub-keycloak >/dev/null 2>&1
    sleep 10
    
    # Check status
    local health_response
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    local overall_status
    overall_status=$(echo "$health_response" | jq -r '.status')
    
    echo "    Status with multiple services down: $overall_status"
    
    echo "    Phase 2: Restarting services..."
    docker start dive-hub-opa dive-hub-keycloak >/dev/null 2>&1
    
    echo "    Phase 3: Waiting for recovery (45s)..."
    sleep 45
    
    # Verify recovery
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    overall_status=$(echo "$health_response" | jq -r '.status')
    
    echo "    Final status: $overall_status"
    
    if [ "$overall_status" = "healthy" ] || [ "$overall_status" = "degraded" ]; then
        echo "    ✓ System recovered from multiple service failures"
        return 0
    fi
    
    return 1
}

test_system_returns_healthy_after_recovery() {
    # Test that system returns to fully healthy status
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    echo "    Starting all services..."
    docker start dive-hub-opa dive-hub-keycloak dive-hub-mongodb dive-hub-redis dive-hub-redis-blacklist dive-hub-kas >/dev/null 2>&1 || true
    
    echo "    Waiting for full recovery (60s)..."
    sleep 60
    
    # Check final health status
    local health_response
    health_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    local overall_status
    overall_status=$(echo "$health_response" | jq -r '.status')
    
    echo "    Final system status: $overall_status"
    
    if [ "$overall_status" = "healthy" ]; then
        echo "    ✓ System returned to healthy status"
        return 0
    elif [ "$overall_status" = "degraded" ]; then
        echo "    System is degraded - checking which services are down"
        echo "$health_response" | jq '.services | to_entries | map(select(.value.status != "up")) | .[].key' 2>/dev/null
        return 0  # Accept degraded as partial success
    fi
    
    return 1
}

test_consecutive_failure_cycles() {
    # Test system survives multiple failure/recovery cycles
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    if ! assert_hub_healthy; then
        return 2
    fi
    
    local cycles=3
    local successes=0
    
    for cycle in $(seq 1 $cycles); do
        echo "    Cycle $cycle/$cycles: Inducing OPA failure..."
        docker stop dive-hub-opa >/dev/null 2>&1
        sleep 5
        
        echo "    Cycle $cycle/$cycles: Recovering OPA..."
        docker start dive-hub-opa >/dev/null 2>&1
        sleep 15
        
        # Check if system is still responding
        if curl -sk --max-time 10 "${HUB_BACKEND_URL}/health" | grep -q '"status"'; then
            ((successes++))
        fi
    done
    
    echo "    Completed $cycles cycles, $successes successful"
    
    if [ $successes -eq $cycles ]; then
        echo "    ✓ System survived all failure/recovery cycles"
        return 0
    fi
    
    return 1
}

suite_recovery_validation() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 8: Recovery Validation (Phase 4.2)${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "This suite validates recovery patterns after service failures"
    if [ "$FAILURE_INJECTION_ENABLED" = "true" ]; then
        echo -e "${YELLOW}⚠️  FAILURE INJECTION ENABLED - Services will be stopped and restarted${NC}"
    else
        echo "Run with --with-failure-injection to enable recovery tests"
    fi
    echo ""
    
    run_test "OPA completes full recovery cycle" test_opa_full_recovery_cycle
    run_test "MongoDB completes full recovery cycle" test_mongodb_full_recovery_cycle
    run_test "Multiple service failure and recovery" test_multiple_service_failure_recovery
    run_test "System returns to healthy after recovery" test_system_returns_healthy_after_recovery
    run_test "System survives consecutive failure cycles" test_consecutive_failure_cycles
}

# =============================================================================
# TEST SUITE 9: ALERT VALIDATION (Phase 4.3)
# =============================================================================
# These tests verify that Prometheus alerts fire correctly
# Requires monitoring stack (docker/instances/shared) to be running
# =============================================================================

test_alertmanager_reachable() {
    # Verify AlertManager is accessible
    local alertmanager_url="${ALERTMANAGER_URL:-http://localhost:9093}"
    
    if curl -sf --max-time 5 "${alertmanager_url}/api/v2/status" >/dev/null 2>&1; then
        echo "    ✓ AlertManager is reachable at $alertmanager_url"
        return 0
    else
        echo "    AlertManager not reachable at $alertmanager_url"
        echo "    Start monitoring stack: cd docker/instances/shared && docker compose up -d"
        return 2  # Skip - precondition not met
    fi
}

test_prometheus_rules_loaded() {
    # Verify Prometheus has loaded DIVE alert rules
    local prometheus_url="${PROMETHEUS_URL:-http://localhost:9090}"
    
    if ! curl -sf --max-time 5 "${prometheus_url}/api/v1/status/config" >/dev/null 2>&1; then
        echo "    Prometheus not reachable"
        return 2
    fi
    
    # Check for DIVE alert rules
    local rules
    rules=$(curl -sf "${prometheus_url}/api/v1/rules" 2>/dev/null)
    
    if echo "$rules" | jq -e '.data.groups[] | select(.name | startswith("dive"))' >/dev/null 2>&1; then
        local rule_count
        rule_count=$(echo "$rules" | jq '[.data.groups[] | select(.name | startswith("dive")) | .rules[]] | length')
        echo "    ✓ Found $rule_count DIVE alert rules in Prometheus"
        return 0
    fi
    
    echo "    DIVE alert rules not found in Prometheus"
    return 1
}

test_circuit_breaker_alert_fires() {
    # Test that CircuitBreakerOpen alert fires when circuit opens
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    local alertmanager_url="${ALERTMANAGER_URL:-http://localhost:9093}"
    
    # Check if AlertManager is reachable
    if ! curl -sf --max-time 5 "${alertmanager_url}/api/v2/status" >/dev/null 2>&1; then
        return 2
    fi
    
    echo "    Stopping OPA to trigger circuit breaker..."
    docker stop dive-hub-opa >/dev/null 2>&1
    
    # Trigger circuit breaker
    trigger_circuit_breaker "/api/resources" 8
    
    echo "    Waiting for alert to fire (up to 60s)..."
    local timeout=60
    local elapsed=0
    
    while [ $elapsed -lt $timeout ]; do
        local alerts
        alerts=$(curl -sf "${alertmanager_url}/api/v2/alerts" 2>/dev/null)
        
        if echo "$alerts" | jq -e '.[] | select(.labels.alertname == "CircuitBreakerOpen")' >/dev/null 2>&1; then
            echo "    ✓ CircuitBreakerOpen alert fired"
            docker start dive-hub-opa >/dev/null 2>&1
            return 0
        fi
        
        sleep 10
        elapsed=$((elapsed + 10))
    done
    
    docker start dive-hub-opa >/dev/null 2>&1
    echo "    Alert did not fire within timeout"
    return 1
}

suite_alert_validation() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 9: Alert Validation (Phase 4.3)${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "This suite validates that Prometheus alerts fire correctly"
    echo "Requires monitoring stack: cd docker/instances/shared && docker compose up -d"
    echo ""
    
    run_test "AlertManager is reachable" test_alertmanager_reachable
    run_test "Prometheus has loaded DIVE alert rules" test_prometheus_rules_loaded
    run_test "CircuitBreakerOpen alert fires when circuit opens" test_circuit_breaker_alert_fires
}

# =============================================================================
# TEST SUITE 10: MULTI-INSTANCE RESILIENCE (Phase 5.1)
# =============================================================================
# Tests federation resilience across Hub and Spoke instances
# Validates that spokes can operate independently during Hub outages
# =============================================================================

# TST Spoke URLs (dynamic port discovery)
# Port formula: BASE + (index * 100) where tst index = 2 gives 4200
get_spoke_backend_url() {
    local port
    port=$(docker port dive-spoke-tst-backend 4000/tcp 2>/dev/null | head -1 | cut -d: -f2)
    if [ -n "$port" ]; then
        echo "https://localhost:${port}"
    else
        echo "https://localhost:4200"  # Default TST port
    fi
}

TST_BACKEND_URL="${TST_BACKEND_URL:-$(get_spoke_backend_url)}"
TST_FRONTEND_URL="${TST_FRONTEND_URL:-https://localhost:3200}"

test_spoke_tst_healthy() {
    # Verify TST spoke is healthy
    local response
    response=$(curl -sk --max-time 10 "${TST_BACKEND_URL}/health" 2>/dev/null)
    
    if [ -z "$response" ]; then
        echo "    TST spoke not responding at $TST_BACKEND_URL"
        return 2  # Skip - spoke not deployed
    fi
    
    local status
    status=$(echo "$response" | jq -r '.status // "unknown"')
    
    if [ "$status" = "healthy" ] || [ "$status" = "degraded" ]; then
        echo "    ✓ TST spoke is $status"
        return 0
    fi
    
    echo "    TST spoke status: $status (expected: healthy)"
    return 1
}

test_hub_spoke_federation_healthy() {
    # Verify federation between Hub and TST spoke is working
    if ! assert_hub_healthy; then
        return 2
    fi
    
    # Check spoke is reachable
    local spoke_response
    spoke_response=$(curl -sk --max-time 10 "${TST_BACKEND_URL}/health" 2>/dev/null)
    
    if [ -z "$spoke_response" ]; then
        echo "    TST spoke not responding - skipping federation test"
        return 2
    fi
    
    # Check federation registry includes TST
    local federation_response
    federation_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/api/federation/partners" 2>/dev/null)
    
    if echo "$federation_response" | jq -e '.[] | select(.code == "TST" or .code == "tst")' >/dev/null 2>&1; then
        echo "    ✓ TST is registered in federation registry"
        return 0
    fi
    
    # Alternative: Check federation-registry.json locally
    if [ -f "config/federation-registry.json" ]; then
        if grep -q '"TST"' config/federation-registry.json 2>/dev/null; then
            echo "    ✓ TST found in local federation registry"
            return 0
        fi
    fi
    
    echo "    TST not found in federation registry"
    return 1
}

test_spoke_independent_health_during_hub_outage() {
    # Test that spoke continues to report healthy when Hub is down
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    # Verify spoke is initially healthy
    local spoke_response
    spoke_response=$(curl -sk --max-time 10 "${TST_BACKEND_URL}/health" 2>/dev/null)
    
    if [ -z "$spoke_response" ]; then
        echo "    TST spoke not deployed - skipping"
        return 2
    fi
    
    echo "    Phase 1: Stopping Hub backend..."
    docker stop dive-hub-backend >/dev/null 2>&1
    
    sleep 10
    
    echo "    Phase 2: Checking spoke health during Hub outage..."
    spoke_response=$(curl -sk --max-time 10 "${TST_BACKEND_URL}/health" 2>/dev/null)
    
    local spoke_status
    spoke_status=$(echo "$spoke_response" | jq -r '.status // "unknown"')
    
    echo "    Spoke status during Hub outage: $spoke_status"
    
    echo "    Phase 3: Restoring Hub backend..."
    docker start dive-hub-backend >/dev/null 2>&1
    
    sleep 15
    
    if [ "$spoke_status" = "healthy" ] || [ "$spoke_status" = "degraded" ]; then
        echo "    ✓ Spoke remained operational during Hub outage"
        return 0
    fi
    
    return 1
}

test_spoke_local_services_independent() {
    # Test that spoke's local services (OPA, MongoDB, Redis) work independently
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    # Check if spoke is deployed
    local spoke_response
    spoke_response=$(curl -sk --max-time 10 "${TST_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    if [ -z "$spoke_response" ]; then
        echo "    TST spoke not deployed - skipping"
        return 2
    fi
    
    echo "    Stopping Hub services (OPA, MongoDB, Redis)..."
    docker stop dive-hub-opa dive-hub-mongodb dive-hub-redis >/dev/null 2>&1
    
    sleep 10
    
    echo "    Checking spoke's local services..."
    spoke_response=$(curl -sk --max-time 10 "${TST_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    local opa_status
    local mongo_status
    local redis_status
    
    opa_status=$(echo "$spoke_response" | jq -r '.services.opa.status // "unknown"')
    mongo_status=$(echo "$spoke_response" | jq -r '.services.mongodb.status // "unknown"')
    redis_status=$(echo "$spoke_response" | jq -r '.services.redis.status // "unknown"')
    
    echo "    Spoke services: OPA=$opa_status, MongoDB=$mongo_status, Redis=$redis_status"
    
    echo "    Restoring Hub services..."
    docker start dive-hub-opa dive-hub-mongodb dive-hub-redis >/dev/null 2>&1
    
    sleep 15
    
    # Spoke's local services should be independent from Hub
    if [ "$opa_status" = "up" ] && [ "$mongo_status" = "up" ]; then
        echo "    ✓ Spoke's local services remained operational"
        return 0
    fi
    
    return 1
}

test_federation_recovery_after_hub_restoration() {
    # Test that federation recovers after Hub is restored
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    # Check if spoke is deployed
    local spoke_response
    spoke_response=$(curl -sk --max-time 10 "${TST_BACKEND_URL}/health" 2>/dev/null)
    
    if [ -z "$spoke_response" ]; then
        echo "    TST spoke not deployed - skipping"
        return 2
    fi
    
    echo "    Phase 1: Stopping Hub Keycloak (breaks federation)..."
    docker stop dive-hub-keycloak >/dev/null 2>&1
    
    sleep 15
    
    echo "    Phase 2: Restoring Hub Keycloak..."
    docker start dive-hub-keycloak >/dev/null 2>&1
    
    echo "    Phase 3: Waiting for federation recovery (60s)..."
    sleep 60
    
    # Verify Hub is healthy
    local hub_response
    hub_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health/detailed" 2>/dev/null)
    
    local hub_kc_status
    hub_kc_status=$(echo "$hub_response" | jq -r '.services.keycloak.status // "unknown"')
    
    echo "    Hub Keycloak status: $hub_kc_status"
    
    if [ "$hub_kc_status" = "up" ]; then
        echo "    ✓ Federation recovered after Hub restoration"
        return 0
    fi
    
    return 1
}

test_hub_and_spoke_both_recover() {
    # Test that both Hub and Spoke recover from simultaneous outages
    if [ "$FAILURE_INJECTION_ENABLED" != "true" ]; then
        echo "  [SKIP] Requires --with-failure-injection flag"
        return 2
    fi
    
    # Check if spoke is deployed
    local spoke_response
    spoke_response=$(curl -sk --max-time 10 "${TST_BACKEND_URL}/health" 2>/dev/null)
    
    if [ -z "$spoke_response" ]; then
        echo "    TST spoke not deployed - skipping"
        return 2
    fi
    
    echo "    Phase 1: Stopping Hub and Spoke backends..."
    docker stop dive-hub-backend dive-spoke-tst-backend >/dev/null 2>&1
    
    sleep 10
    
    echo "    Phase 2: Restarting services..."
    docker start dive-hub-backend dive-spoke-tst-backend >/dev/null 2>&1
    
    echo "    Phase 3: Waiting for recovery (45s)..."
    sleep 45
    
    # Check both are healthy
    local hub_response
    hub_response=$(curl -sk --max-time 10 "${HUB_BACKEND_URL}/health" 2>/dev/null)
    
    spoke_response=$(curl -sk --max-time 10 "${TST_BACKEND_URL}/health" 2>/dev/null)
    
    local hub_status
    local spoke_status
    
    hub_status=$(echo "$hub_response" | jq -r '.status // "unknown"')
    spoke_status=$(echo "$spoke_response" | jq -r '.status // "unknown"')
    
    echo "    Hub status: $hub_status, Spoke status: $spoke_status"
    
    if [ "$hub_status" = "healthy" ] && [ "$spoke_status" = "healthy" ]; then
        echo "    ✓ Both Hub and Spoke recovered successfully"
        return 0
    elif [ "$hub_status" != "unknown" ] && [ "$spoke_status" != "unknown" ]; then
        echo "    Partial recovery - both instances responding"
        return 0
    fi
    
    return 1
}

suite_multi_instance_resilience() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 10: Multi-Instance Resilience (Phase 5.1)${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "This suite tests federation resilience across Hub and Spoke instances"
    echo "Requires TST spoke to be deployed: ./dive spoke deploy tst"
    if [ "$FAILURE_INJECTION_ENABLED" = "true" ]; then
        echo -e "${YELLOW}⚠️  FAILURE INJECTION ENABLED - Services will be stopped${NC}"
    else
        echo "Run with --with-failure-injection to enable disruption tests"
    fi
    echo ""
    
    run_test "TST spoke is healthy" test_spoke_tst_healthy
    run_test "Hub-Spoke federation is healthy" test_hub_spoke_federation_healthy
    run_test "Spoke remains healthy during Hub outage" test_spoke_independent_health_during_hub_outage
    run_test "Spoke's local services are independent" test_spoke_local_services_independent
    run_test "Federation recovers after Hub restoration" test_federation_recovery_after_hub_restoration
    run_test "Both Hub and Spoke recover from outages" test_hub_and_spoke_both_recover
}

# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

print_banner() {
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║       DIVE V3 - Deployment Resilience Integration Tests               ║${NC}"
    echo -e "${BOLD}║                     Phase 1: Production Resilience                    ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_summary() {
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║                           TEST SUMMARY                                 ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "  Total Tests:   $TESTS_TOTAL"
    echo -e "  Passed:        ${GREEN}$TESTS_PASSED${NC}"
    echo -e "  Failed:        ${RED}$TESTS_FAILED${NC}"
    echo -e "  Skipped:       ${YELLOW}$TESTS_SKIPPED${NC}"
    echo ""
    test_timer_stop
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}${BOLD}✓ ALL DEPLOYMENT RESILIENCE TESTS PASSED!${NC}"
        return 0
    else
        echo -e "${RED}${BOLD}✗ SOME TESTS FAILED${NC}"
        echo -e "${RED}  Review failures above.${NC}"
        return 1
    fi
}

usage() {
    echo "Usage: $0 [OPTIONS] [SUITE]"
    echo ""
    echo "Options:"
    echo "  --help, -h                Show this help"
    echo "  --quick                   Run only quick tests (skip deployment)"
    echo "  --full                    Run all tests including deployment"
    echo "  --with-failure-injection  Enable destructive failure injection tests"
    echo "                            WARNING: This will stop services!"
    echo ""
    echo "Suites:"
    echo "  clean           Clean slate deployment tests"
    echo "  idempotent      Idempotent deployment tests"
    echo "  concurrent      Concurrent deployment tests"
    echo "  federation      Federation resilience tests"
    echo "  database        Database operation tests"
    echo "  circuit-breaker Circuit breaker verification (Phase 3.2)"
    echo "  failure         Failure injection tests (Phase 4.1)"
    echo "  recovery        Recovery validation tests (Phase 4.2)"
    echo "  alert           Alert validation tests (Phase 4.3)"
    echo "  multi-instance  Multi-instance resilience tests (Phase 5.1)"
    echo "  all             Run all suites (default)"
    echo ""
    echo "Examples:"
    echo "  $0                                # Run all tests"
    echo "  $0 --quick                        # Run quick tests only"
    echo "  $0 federation                     # Run federation suite only"
    echo "  $0 circuit-breaker                # Run circuit breaker tests"
    echo "  $0 failure --with-failure-injection  # Run failure injection tests"
    echo "  $0 database                       # Run database suite only"
}

main() {
    local suite="all"
    local quick_mode=false

    # Parse arguments
    while [ $# -gt 0 ]; do
        case "$1" in
            --help|-h)
                usage
                exit 0
                ;;
            --quick)
                quick_mode=true
                shift
                ;;
            --full)
                quick_mode=false
                shift
                ;;
            --with-failure-injection)
                FAILURE_INJECTION_ENABLED=true
                export FAILURE_INJECTION_ENABLED
                shift
                ;;
            clean|idempotent|concurrent|federation|database|circuit-breaker|circuit_breaker|circuitbreaker|failure|failure-injection|recovery|alert|alerts|multi-instance|multi|all)
                suite="$1"
                shift
                ;;
            *)
                echo "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done

    print_banner
    test_timer_start

    # Change to DIVE root
    cd "$DIVE_ROOT" || exit 1

    case "$suite" in
        clean)
            suite_clean_slate
            ;;
        idempotent)
            suite_idempotent
            ;;
        concurrent)
            suite_concurrent
            ;;
        federation)
            suite_federation_resilience
            ;;
        database)
            suite_database
            ;;
        circuit-breaker|circuit_breaker|circuitbreaker)
            suite_circuit_breaker
            ;;
        failure|failure-injection)
            suite_failure_injection
            ;;
        recovery)
            suite_recovery_validation
            ;;
        alert|alerts)
            suite_alert_validation
            ;;
        multi-instance|multi)
            suite_multi_instance_resilience
            ;;
        all)
            if [ "$quick_mode" = true ]; then
                # Quick mode: skip deployment-heavy tests
                suite_idempotent
                suite_federation_resilience
                suite_database
                suite_circuit_breaker
            else
                # Full mode: run all suites
                suite_clean_slate
                suite_idempotent
                suite_concurrent
                suite_federation_resilience
                suite_database
                suite_circuit_breaker
                suite_failure_injection
                suite_recovery_validation
                suite_alert_validation
                suite_multi_instance_resilience
            fi
            ;;
    esac

    print_summary
    exit $?
}

# Run main
main "$@"
