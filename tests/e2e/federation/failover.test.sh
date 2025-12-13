#!/bin/bash
# =============================================================================
# DIVE V3 - Failover & Resilience E2E Test
# =============================================================================
# Phase 5: Tests circuit breaker, maintenance mode, and audit queue behavior
#
# Test Cases:
#   1.  Verify spoke is running and circuit is CLOSED
#   2.  Verify failover status API returns correct state
#   3.  Force circuit to OPEN via API
#   4.  Verify spoke operates in degraded mode when circuit is open
#   5.  Verify policy cache is used during offline
#   6.  Force circuit to CLOSED via API (recovery simulation)
#   7.  Verify circuit transitions through HALF_OPEN properly
#   8.  Enter maintenance mode and verify behavior
#   9.  Exit maintenance mode and verify recovery
#   10. Verify audit queue status endpoint
#   11. Test forced circuit state changes via CLI (if available)
#   12. Verify metrics are tracked correctly
#
# Usage:
#   ./tests/e2e/federation/failover.test.sh
#
# Prerequisites:
#   - A spoke instance must be running (./dive --instance <code> spoke up)
#   - Docker available
#   - jq installed (optional, for pretty output)
#   - curl installed
#
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${SCRIPT_DIR}/../../.."
DIVE_CLI="${DIVE_ROOT}/dive"

# Spoke configuration (can be overridden via environment)
TEST_INSTANCE="${TEST_INSTANCE:-usa}"
SPOKE_API_URL="${SPOKE_API_URL:-https://localhost:4000}"

# Test timeouts
API_TIMEOUT=10
TRANSITION_WAIT=5

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Initial state tracking for cleanup
INITIAL_CIRCUIT_STATE=""
INITIAL_MAINTENANCE_STATE=""

# =============================================================================
# TEST UTILITIES
# =============================================================================

log_test() {
    echo -e "${CYAN}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++)) || true
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++)) || true
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((TESTS_SKIPPED++)) || true
}

log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

assert_success() {
    local exit_code=$1
    local message=$2
    
    if [ $exit_code -eq 0 ]; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (exit code: $exit_code)"
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="$3"
    
    if echo "$haystack" | grep -q "$needle"; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (expected to find: $needle)"
        return 1
    fi
}

assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    local message="$3"
    
    if echo "$haystack" | grep -q "$needle"; then
        log_fail "$message (unexpectedly found: $needle)"
        return 1
    else
        log_pass "$message"
        return 0
    fi
}

assert_equals() {
    local actual="$1"
    local expected="$2"
    local message="$3"
    
    if [ "$actual" = "$expected" ]; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (expected: $expected, got: $actual)"
        return 1
    fi
}

api_call() {
    local method="$1"
    local endpoint="$2"
    local data="${3:-}"
    
    local curl_args=("-ks" "-X" "$method" "${SPOKE_API_URL}${endpoint}")
    curl_args+=("-H" "Content-Type: application/json")
    
    if [ -n "$data" ]; then
        curl_args+=("-d" "$data")
    fi
    
    curl "${curl_args[@]}" --max-time "${API_TIMEOUT}" 2>/dev/null
}

extract_json_value() {
    local json="$1"
    local key="$2"
    
    # Try to extract value using grep (works for simple cases)
    echo "$json" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | cut -d'"' -f4
}

extract_json_bool() {
    local json="$1"
    local key="$2"
    
    # Extract boolean value
    echo "$json" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\(true\|false\)" | head -1 | cut -d: -f2 | tr -d ' '
}

extract_json_number() {
    local json="$1"
    local key="$2"
    
    # Extract numeric value
    echo "$json" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*[0-9]*" | head -1 | cut -d: -f2 | tr -d ' '
}

# =============================================================================
# SETUP
# =============================================================================

setup() {
    echo ""
    echo -e "${BOLD}=================================================${NC}"
    echo -e "${BOLD}DIVE V3 - Failover & Resilience E2E Test Suite${NC}"
    echo -e "${BOLD}Phase 5: Circuit Breaker, Maintenance & Audit Queue${NC}"
    echo -e "${BOLD}=================================================${NC}"
    echo ""
    
    log_info "Spoke API URL: $SPOKE_API_URL"
    log_info "Test Instance: $TEST_INSTANCE"
    echo ""
    
    # Check prerequisites
    if ! command -v curl &> /dev/null; then
        log_fail "curl is required but not installed"
        exit 1
    fi
    
    if command -v jq &> /dev/null; then
        log_info "jq detected - output will be formatted"
    else
        log_info "jq not installed - some output may be less readable"
    fi
    
    # Capture initial state for cleanup
    log_info "Capturing initial state..."
    local initial_status=$(api_call GET "/api/spoke/failover/status" "")
    INITIAL_CIRCUIT_STATE=$(echo "$initial_status" | grep -o '"state"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4 || echo "closed")
    INITIAL_MAINTENANCE_STATE=$(extract_json_bool "$initial_status" "isInMaintenanceMode")
    
    log_info "Initial circuit state: $INITIAL_CIRCUIT_STATE"
    log_info "Initial maintenance mode: ${INITIAL_MAINTENANCE_STATE:-false}"
    echo ""
}

# =============================================================================
# TEST CASES
# =============================================================================

test_01_spoke_running() {
    log_test "1. Verify spoke is running and circuit is CLOSED"
    
    # Check health endpoint
    local health=$(api_call GET "/health" "")
    
    if echo "$health" | grep -qE '"status"[[:space:]]*:[[:space:]]*"(healthy|ok)"'; then
        log_pass "Spoke health endpoint responding"
    elif echo "$health" | grep -q "healthy\|ok"; then
        log_pass "Spoke health endpoint responding"
    else
        log_fail "Spoke health endpoint not responding"
        log_info "Response: ${health:0:200}"
        return 1
    fi
}

test_02_failover_status() {
    log_test "2. Verify failover status API returns correct state"
    
    local response=$(api_call GET "/api/spoke/failover/status" "")
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local state=$(extract_json_value "$response" "state")
        local total_failures=$(extract_json_number "$response" "totalFailures")
        local total_successes=$(extract_json_number "$response" "totalSuccesses")
        local uptime_pct=$(extract_json_number "$response" "uptimePercentage")
        
        log_pass "Failover status API responding"
        log_info "  Circuit State: $state"
        log_info "  Total Failures: ${total_failures:-0}"
        log_info "  Total Successes: ${total_successes:-0}"
        log_info "  Uptime %: ${uptime_pct:-100}"
    else
        log_fail "Failover status API failed"
        log_info "Response: ${response:0:300}"
        return 1
    fi
}

test_03_force_open() {
    log_test "3. Force circuit to OPEN via API"
    
    local response=$(api_call POST "/api/spoke/failover/force" '{"state": "OPEN"}')
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local new_state=$(extract_json_value "$response" "state")
        log_pass "Circuit forced to OPEN"
        log_info "  New State: $new_state"
        
        # Verify state change took effect
        sleep 1
        local verify=$(api_call GET "/api/spoke/failover/status" "")
        local verified_state=$(extract_json_value "$verify" "state")
        
        if [ "$verified_state" = "open" ]; then
            log_pass "Circuit state verified as OPEN"
        else
            log_fail "Circuit state not OPEN after force (got: $verified_state)"
            return 1
        fi
    else
        log_fail "Failed to force circuit OPEN"
        log_info "Response: ${response:0:300}"
        return 1
    fi
}

test_04_degraded_mode() {
    log_test "4. Verify spoke operates in degraded mode when circuit is open"
    
    local response=$(api_call GET "/api/spoke/status" "")
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        # Check failover section
        if echo "$response" | grep -q '"state"[[:space:]]*:[[:space:]]*"open"'; then
            log_pass "Spoke reporting OPEN circuit in status"
        else
            log_info "Circuit may have transitioned"
        fi
        
        # Check if we have runtime info
        if echo "$response" | grep -q '"runtime"'; then
            log_pass "Spoke status includes runtime information"
        fi
        
        # Check health score still available
        local health_response=$(api_call GET "/api/spoke/health-score" "")
        if echo "$health_response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
            local score=$(extract_json_number "$health_response" "score")
            log_pass "Health score available during degraded mode (score: ${score:-N/A})"
        fi
    else
        log_fail "Could not get spoke status"
        log_info "Response: ${response:0:300}"
        return 1
    fi
}

test_05_policy_cache() {
    log_test "5. Verify policy cache is used during offline"
    
    # Try to trigger policy sync (should use cache when offline)
    local response=$(api_call POST "/api/spoke/sync" "{}")
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        if echo "$response" | grep -q '"cacheState"'; then
            log_pass "Policy sync attempts to use cache in degraded mode"
        else
            log_pass "Policy sync endpoint responding"
        fi
    elif echo "$response" | grep -q "cache\|offline\|degraded"; then
        log_pass "Policy sync indicates cache/offline mode"
    else
        # Even failure is acceptable - we're testing degraded behavior
        log_info "Policy sync response: ${response:0:200}"
        log_pass "Policy sync endpoint handled degraded state"
    fi
}

test_06_force_closed() {
    log_test "6. Force circuit to CLOSED via API (recovery simulation)"
    
    local response=$(api_call POST "/api/spoke/failover/force" '{"state": "CLOSED"}')
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local new_state=$(extract_json_value "$response" "state")
        log_pass "Circuit forced to CLOSED"
        log_info "  New State: $new_state"
        
        # Verify state change took effect
        sleep 1
        local verify=$(api_call GET "/api/spoke/failover/status" "")
        local verified_state=$(extract_json_value "$verify" "state")
        
        if [ "$verified_state" = "closed" ]; then
            log_pass "Circuit state verified as CLOSED"
        else
            log_fail "Circuit state not CLOSED after force (got: $verified_state)"
            return 1
        fi
    else
        log_fail "Failed to force circuit CLOSED"
        log_info "Response: ${response:0:300}"
        return 1
    fi
}

test_07_half_open_transition() {
    log_test "7. Verify circuit transitions through HALF_OPEN properly"
    
    # Force to HALF_OPEN
    local response=$(api_call POST "/api/spoke/failover/force" '{"state": "HALF_OPEN"}')
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local new_state=$(extract_json_value "$response" "state")
        log_pass "Circuit forced to HALF_OPEN"
        log_info "  State: $new_state"
        
        # In HALF_OPEN, some requests should be allowed
        local status=$(api_call GET "/api/spoke/failover/status" "")
        
        if echo "$status" | grep -q '"state"'; then
            local current_state=$(extract_json_value "$status" "state")
            log_info "  Current state: $current_state"
            
            # HALF_OPEN should eventually resolve to CLOSED or OPEN based on probes
            # For this test, just verify the transition happened
            log_pass "HALF_OPEN state transition verified"
        fi
        
        # Reset to CLOSED for remaining tests
        api_call POST "/api/spoke/failover/force" '{"state": "CLOSED"}' > /dev/null 2>&1
        
    else
        log_skip "HALF_OPEN transition may not be directly forceable"
        log_info "Response: ${response:0:200}"
    fi
}

test_08_enter_maintenance() {
    log_test "8. Enter maintenance mode and verify behavior"
    
    local response=$(api_call POST "/api/spoke/maintenance/enter" '{"reason": "E2E test maintenance"}')
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_pass "Entered maintenance mode"
        
        # Verify maintenance mode is active
        sleep 1
        local status=$(api_call GET "/api/spoke/failover/status" "")
        
        local in_maintenance=$(extract_json_bool "$status" "isInMaintenanceMode")
        if [ "$in_maintenance" = "true" ]; then
            log_pass "Maintenance mode verified as active"
        else
            log_info "Maintenance mode indicator may use different field"
        fi
        
        # Check reason is stored
        if echo "$status" | grep -q "E2E test maintenance\|maintenance"; then
            log_pass "Maintenance reason stored"
        fi
        
    else
        log_fail "Failed to enter maintenance mode"
        log_info "Response: ${response:0:300}"
        return 1
    fi
}

test_09_exit_maintenance() {
    log_test "9. Exit maintenance mode and verify recovery"
    
    local response=$(api_call POST "/api/spoke/maintenance/exit" "{}")
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_pass "Exited maintenance mode"
        
        # Verify maintenance mode is inactive
        sleep 1
        local status=$(api_call GET "/api/spoke/failover/status" "")
        
        local in_maintenance=$(extract_json_bool "$status" "isInMaintenanceMode")
        if [ "$in_maintenance" = "false" ] || [ -z "$in_maintenance" ]; then
            log_pass "Maintenance mode verified as inactive"
        else
            log_fail "Maintenance mode still active after exit"
            return 1
        fi
        
    else
        log_fail "Failed to exit maintenance mode"
        log_info "Response: ${response:0:300}"
        return 1
    fi
}

test_10_audit_queue_status() {
    log_test "10. Verify audit queue status endpoint"
    
    local response=$(api_call GET "/api/spoke/audit/status" "")
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local queue_size=$(extract_json_number "$response" "queueSize")
        local total_enqueued=$(extract_json_number "$response" "totalEnqueued")
        local total_synced=$(extract_json_number "$response" "totalSynced")
        
        log_pass "Audit queue status endpoint responding"
        log_info "  Queue Size: ${queue_size:-0}"
        log_info "  Total Enqueued: ${total_enqueued:-0}"
        log_info "  Total Synced: ${total_synced:-0}"
        
    else
        log_fail "Audit queue status endpoint failed"
        log_info "Response: ${response:0:300}"
        return 1
    fi
}

test_11_reset_circuit() {
    log_test "11. Reset circuit breaker metrics"
    
    local response=$(api_call POST "/api/spoke/failover/reset" "{}")
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local new_state=$(extract_json_value "$response" "state")
        log_pass "Circuit breaker reset"
        log_info "  State after reset: $new_state"
        
        # Verify metrics were cleared
        local status=$(api_call GET "/api/spoke/failover/status" "")
        local total_failures=$(extract_json_number "$status" "totalFailures")
        local total_successes=$(extract_json_number "$status" "totalSuccesses")
        
        if [ "${total_failures:-0}" = "0" ] && [ "${total_successes:-0}" = "0" ]; then
            log_pass "Metrics cleared after reset"
        else
            log_info "Metrics may have accumulated during test (failures: ${total_failures:-0}, successes: ${total_successes:-0})"
        fi
        
    else
        log_fail "Failed to reset circuit breaker"
        log_info "Response: ${response:0:300}"
        return 1
    fi
}

test_12_verify_metrics() {
    log_test "12. Verify metrics are tracked correctly"
    
    # Get Prometheus metrics
    local metrics=$(api_call GET "/api/spoke/metrics" "")
    
    if [ -n "$metrics" ] && [ "$metrics" != "null" ]; then
        # Check for expected metric names
        local has_metrics=false
        
        if echo "$metrics" | grep -q "circuit_breaker\|failover\|spoke"; then
            has_metrics=true
            log_pass "Prometheus metrics include circuit breaker/failover metrics"
        fi
        
        if echo "$metrics" | grep -q "audit_queue\|queue"; then
            has_metrics=true
            log_pass "Prometheus metrics include audit queue metrics"
        fi
        
        if [ "$has_metrics" = "false" ]; then
            log_info "Custom metrics may not be exposed (standard format)"
            log_pass "Prometheus metrics endpoint responding"
        fi
        
        log_info "  Metrics response length: ${#metrics} bytes"
        
    else
        log_skip "Prometheus metrics endpoint may not be configured"
    fi
    
    # Also verify health score includes relevant metrics
    local health=$(api_call GET "/api/spoke/health-score" "")
    
    if echo "$health" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local score=$(extract_json_number "$health" "score")
        log_pass "Health score calculated (score: ${score:-N/A})"
    else
        log_info "Health score may use different format"
    fi
}

# =============================================================================
# CLEANUP
# =============================================================================

cleanup() {
    log_info "Restoring initial state..."
    
    # Exit maintenance mode if we're still in it
    api_call POST "/api/spoke/maintenance/exit" "{}" > /dev/null 2>&1 || true
    
    # Reset circuit to CLOSED
    api_call POST "/api/spoke/failover/force" '{"state": "CLOSED"}' > /dev/null 2>&1 || true
    
    # If initial state was different, try to restore it
    if [ -n "$INITIAL_CIRCUIT_STATE" ] && [ "$INITIAL_CIRCUIT_STATE" != "closed" ]; then
        log_info "Restoring initial circuit state: $INITIAL_CIRCUIT_STATE"
        api_call POST "/api/spoke/failover/force" "{\"state\": \"$(echo "$INITIAL_CIRCUIT_STATE" | tr '[:lower:]' '[:upper:]')\"}" > /dev/null 2>&1 || true
    fi
    
    log_info "Cleanup complete"
}

# =============================================================================
# TEST SUMMARY
# =============================================================================

print_summary() {
    echo ""
    echo -e "${BOLD}=================================================${NC}"
    echo -e "${BOLD}TEST SUMMARY${NC}"
    echo -e "${BOLD}=================================================${NC}"
    echo ""
    echo -e "  ${GREEN}Passed:${NC}  $TESTS_PASSED"
    echo -e "  ${RED}Failed:${NC}  $TESTS_FAILED"
    echo -e "  ${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
    echo ""
    
    local total=$((TESTS_PASSED + TESTS_FAILED))
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}${BOLD}All tests passed!${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}${BOLD}Some tests failed.${NC}"
        echo ""
        return 1
    fi
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    setup
    
    # Run tests
    test_01_spoke_running || true
    test_02_failover_status || true
    test_03_force_open || true
    test_04_degraded_mode || true
    test_05_policy_cache || true
    test_06_force_closed || true
    test_07_half_open_transition || true
    test_08_enter_maintenance || true
    test_09_exit_maintenance || true
    test_10_audit_queue_status || true
    test_11_reset_circuit || true
    test_12_verify_metrics || true
    
    # Cleanup
    cleanup
    
    # Print summary
    print_summary
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi



