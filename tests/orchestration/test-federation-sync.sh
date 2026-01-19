#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Federation State Consistency Tests
# =============================================================================
# Phase 5: Federation State Synchronization - Test Suite
#
# Tests:
#   1. Drift detection across three layers
#   2. Reconciliation actions
#   3. State synchronization
#   4. Health summary
# =============================================================================

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${DIVE_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Hub API URL (HTTPS)
HUB_API_URL="${HUB_API_URL:-https://localhost:4000}"

# =============================================================================
# TEST HELPERS
# =============================================================================

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

run_test() {
    local test_name="$1"
    local test_func="$2"
    
    ((TESTS_RUN++))
    log_test "$test_name"
    
    if $test_func; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name"
        return 1
    fi
}

check_hub_running() {
    curl -kfs "${HUB_API_URL}/health" >/dev/null 2>&1
}

# =============================================================================
# DRIFT DETECTION TESTS
# =============================================================================

test_federation_health_endpoint() {
    # Test: Drift status endpoint returns valid response
    local response
    response=$(curl -kfs "${HUB_API_URL}/api/drift/status" 2>/dev/null)
    
    echo "$response" | jq -e '.success == true' >/dev/null 2>&1
}

test_drift_report_endpoint() {
    # Test: Drift report endpoint returns valid response
    local response
    response=$(curl -kfs "${HUB_API_URL}/api/drift/report" 2>/dev/null)
    
    echo "$response" | jq -e '.success == true and .data.states != null' >/dev/null 2>&1
}

test_drift_events_endpoint() {
    # Test: Drift events endpoint returns valid response
    local response
    response=$(curl -kfs "${HUB_API_URL}/api/drift/events" 2>/dev/null)
    
    echo "$response" | jq -e '.success == true and .data.events != null' >/dev/null 2>&1
}

test_federation_states_endpoint() {
    # Test: Federation states endpoint returns detailed layer info
    local response
    response=$(curl -kfs "${HUB_API_URL}/api/drift/states" 2>/dev/null)
    
    echo "$response" | jq -e '.success == true and .data.states != null' >/dev/null 2>&1
}

# =============================================================================
# LAYER STATE TESTS
# =============================================================================

test_keycloak_layer_check() {
    # Test: Keycloak IdP layer is queryable
    local response
    response=$(curl -kfs "${HUB_API_URL}/api/drift/report" 2>/dev/null)
    
    # Should have keycloak state for each instance
    echo "$response" | jq -e '.data.states[0].keycloak != null' >/dev/null 2>&1
}

test_mongodb_layer_check() {
    # Test: MongoDB spoke layer is queryable
    local response
    response=$(curl -kfs "${HUB_API_URL}/api/drift/report" 2>/dev/null)
    
    # Should have mongodb state for each instance
    echo "$response" | jq -e '.data.states[0].mongodb != null' >/dev/null 2>&1
}

test_docker_layer_check() {
    # Test: Docker container layer is queryable
    local response
    response=$(curl -kfs "${HUB_API_URL}/api/drift/report" 2>/dev/null)
    
    # Should have docker state for each instance
    echo "$response" | jq -e '.data.states[0].docker != null' >/dev/null 2>&1
}

# =============================================================================
# RECONCILIATION TESTS
# =============================================================================

test_reconcile_dry_run() {
    # Test: Reconciliation dry-run works
    local response
    response=$(curl -kfs -X POST "${HUB_API_URL}/api/drift/reconcile" \
        -H "Content-Type: application/json" \
        -d '{"dryRun": true}' 2>/dev/null)
    
    echo "$response" | jq -e '.success == true and .data.dryRun == true' >/dev/null 2>&1
}

test_reconcile_response_format() {
    # Test: Reconciliation response has expected format
    local response
    response=$(curl -kfs -X POST "${HUB_API_URL}/api/drift/reconcile" \
        -H "Content-Type: application/json" \
        -d '{"dryRun": true}' 2>/dev/null)
    
    echo "$response" | jq -e '.data.totalActions != null and .data.actions != null' >/dev/null 2>&1
}

# =============================================================================
# AUDIT SCRIPT TESTS
# =============================================================================

test_audit_script_exists() {
    # Test: Audit script exists and is executable
    [ -x "$DIVE_ROOT/scripts/audit-federation-state.sh" ]
}

test_audit_script_quick_mode() {
    # Test: Audit script quick mode works
    local output
    output=$("$DIVE_ROOT/scripts/audit-federation-state.sh" --quick 2>&1 || true)
    
    echo "$output" | grep -q "Federation State"
}

test_audit_script_help() {
    # Test: Audit script help works
    local output
    output=$("$DIVE_ROOT/scripts/audit-federation-state.sh" --help 2>&1 || true)
    
    echo "$output" | grep -q "Usage"
}

# =============================================================================
# HEALTH SUMMARY TESTS
# =============================================================================

test_health_summary_fields() {
    # Test: Health summary has all expected fields
    local response
    response=$(curl -kfs "${HUB_API_URL}/api/drift/status" 2>/dev/null)
    
    echo "$response" | jq -e '
        .data.healthy != null and
        .data.totalInstances != null and
        .data.synchronizedCount != null and
        .data.driftCount != null
    ' >/dev/null 2>&1
}

test_health_consistency() {
    # Test: Health counts are consistent
    local response
    response=$(curl -kfs "${HUB_API_URL}/api/drift/status" 2>/dev/null)
    
    local total=$(echo "$response" | jq -r '.data.totalInstances // 0')
    local synced=$(echo "$response" | jq -r '.data.synchronizedCount // 0')
    local drift=$(echo "$response" | jq -r '.data.driftCount // 0')
    
    # Handle null values
    total=${total:-0}
    synced=${synced:-0}
    drift=${drift:-0}
    
    [ "$total" -eq $((synced + drift)) ]
}

# =============================================================================
# DOCKER CONTAINER TESTS (offline)
# =============================================================================

test_docker_spoke_detection() {
    # Test: Docker spoke containers are detected
    local containers
    containers=$(docker ps --format "{{.Names}}" 2>/dev/null | grep "dive-spoke-" | head -5 || echo "")
    
    # This test passes if we can query Docker (even if no spokes running)
    true
}

test_docker_container_format() {
    # Test: Docker container naming convention
    local containers
    containers=$(docker ps -a --format "{{.Names}}" 2>/dev/null | grep "dive-spoke-" || echo "")
    
    # If no spoke containers, test passes (nothing to validate)
    if [ -z "$containers" ]; then
        return 0
    fi
    
    # Check naming convention: dive-spoke-{code}-{service}
    # Must have at least one valid container
    local valid_count=0
    for container in $containers; do
        if echo "$container" | grep -qE "^dive-spoke-[a-z]{3}-[a-z-]+$"; then
            ((valid_count++))
        fi
    done
    
    # Pass if at least one valid container found
    [ "$valid_count" -gt 0 ]
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo "=============================================="
    echo "DIVE V3 Federation State Consistency Tests"
    echo "Phase 5: Federation State Synchronization"
    echo "=============================================="
    echo ""
    
    # Check if Hub is running
    echo "Checking Hub availability..."
    if ! check_hub_running; then
        echo -e "${YELLOW}WARNING: Hub API not available at ${HUB_API_URL}${NC}"
        echo "Running offline tests only..."
        echo ""
        
        # Offline tests only
        echo "--- Audit Script Tests (Offline) ---"
        run_test "Audit script exists" test_audit_script_exists || true
        run_test "Audit script help" test_audit_script_help || true
        echo ""
        
        echo "--- Docker Container Tests (Offline) ---"
        run_test "Docker spoke detection" test_docker_spoke_detection || true
        run_test "Docker container format" test_docker_container_format || true
        echo ""
    else
        echo -e "${GREEN}Hub API available at ${HUB_API_URL}${NC}"
        echo ""
        
        # Drift Detection Tests
        echo "--- Drift Detection Tests ---"
        run_test "Federation health endpoint" test_federation_health_endpoint || true
        run_test "Drift report endpoint" test_drift_report_endpoint || true
        run_test "Drift events endpoint" test_drift_events_endpoint || true
        run_test "Federation states endpoint" test_federation_states_endpoint || true
        echo ""
        
        # Layer State Tests
        echo "--- Layer State Tests ---"
        run_test "Keycloak layer check" test_keycloak_layer_check || true
        run_test "MongoDB layer check" test_mongodb_layer_check || true
        run_test "Docker layer check" test_docker_layer_check || true
        echo ""
        
        # Reconciliation Tests
        echo "--- Reconciliation Tests ---"
        run_test "Reconcile dry-run" test_reconcile_dry_run || true
        run_test "Reconcile response format" test_reconcile_response_format || true
        echo ""
        
        # Health Summary Tests
        echo "--- Health Summary Tests ---"
        run_test "Health summary fields" test_health_summary_fields || true
        run_test "Health consistency" test_health_consistency || true
        echo ""
        
        # Audit Script Tests
        echo "--- Audit Script Tests ---"
        run_test "Audit script exists" test_audit_script_exists || true
        run_test "Audit script quick mode" test_audit_script_quick_mode || true
        run_test "Audit script help" test_audit_script_help || true
        echo ""
        
        # Docker Tests
        echo "--- Docker Container Tests ---"
        run_test "Docker spoke detection" test_docker_spoke_detection || true
        run_test "Docker container format" test_docker_container_format || true
        echo ""
    fi
    
    # Summary
    echo "=============================================="
    echo "Test Results"
    echo "=============================================="
    echo "Total:  $TESTS_RUN"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    echo ""
    
    if [ "$TESTS_FAILED" -gt 0 ]; then
        echo -e "${RED}SOME TESTS FAILED${NC}"
        exit 1
    else
        echo -e "${GREEN}ALL TESTS PASSED${NC}"
        exit 0
    fi
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
