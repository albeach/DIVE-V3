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

    # Get spoke port from config
    local spoke_port
    if [ -f "${DIVE_ROOT}/instances/${test_code}/config.json" ]; then
        spoke_port=$(jq -r '.endpoints.idpPublicUrl // "https://localhost:8443"' \
            "${DIVE_ROOT}/instances/${test_code}/config.json" | grep -o ':[0-9]*' | tr -d ':')
    fi
    spoke_port="${spoke_port:-8443}"

    # Test spoke OIDC
    if ! curl -sk --max-time 10 "https://localhost:${spoke_port}/realms/dive-v3-broker-${test_code}/.well-known/openid-configuration" | grep -q '"issuer"'; then
        echo "Spoke OIDC discovery not reachable"
        return 1
    fi

    # Test hub OIDC
    if ! curl -sk --max-time 10 "https://localhost:8443/realms/dive-v3-broker-usa/.well-known/openid-configuration" | grep -q '"issuer"'; then
        echo "Hub OIDC discovery not reachable"
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
    echo "  --help, -h     Show this help"
    echo "  --quick        Run only quick tests (skip deployment)"
    echo "  --full         Run all tests including deployment"
    echo ""
    echo "Suites:"
    echo "  clean          Clean slate deployment tests"
    echo "  idempotent     Idempotent deployment tests"
    echo "  concurrent     Concurrent deployment tests"
    echo "  federation     Federation resilience tests"
    echo "  database       Database operation tests"
    echo "  all            Run all suites (default)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Run all tests"
    echo "  $0 --quick            # Run quick tests only"
    echo "  $0 federation         # Run federation suite only"
    echo "  $0 database           # Run database suite only"
}

main() {
    local suite="${1:-all}"
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
            clean|idempotent|concurrent|federation|database|all)
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
        all)
            if [ "$quick_mode" = true ]; then
                # Quick mode: skip deployment-heavy tests
                suite_idempotent
                suite_federation_resilience
                suite_database
            else
                # Full mode: run all suites
                suite_clean_slate
                suite_idempotent
                suite_concurrent
                suite_federation_resilience
                suite_database
            fi
            ;;
    esac

    print_summary
    exit $?
}

# Run main
main "$@"
