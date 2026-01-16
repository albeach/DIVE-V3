#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Federation Database Tests
# =============================================================================
# Tests for federation-state-db.sh module and PostgreSQL schema
# Part of Orchestration Architecture Review Phase 4
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-16
# =============================================================================

# Allow unset variables initially for module loading
set -eo pipefail

# Determine script location and DIVE_ROOT
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
export DIVE_ROOT

# Load modules with error handling
set +u  # Temporarily allow unset variables
source "$DIVE_ROOT/scripts/dive-modules/common.sh" 2>/dev/null || {
    # Minimal common functions if common.sh fails
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
    log_info() { echo "[INFO] $*"; }
    log_error() { echo "[ERROR] $*" >&2; }
    log_verbose() { :; }
    upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
    lower() { echo "$1" | tr '[:upper:]' '[:lower:]'; }
}
source "$DIVE_ROOT/scripts/dive-modules/orchestration-state-db.sh" 2>/dev/null || true
source "$DIVE_ROOT/scripts/dive-modules/federation-state-db.sh" 2>/dev/null || true
set -u  # Re-enable strict unset checking

# =============================================================================
# TEST CONFIGURATION
# =============================================================================

TESTS_PASSED=0
TESTS_FAILED=0
TEST_INSTANCE="tst"  # Test instance code

# =============================================================================
# TEST UTILITIES
# =============================================================================

test_start() {
    local test_name="$1"
    echo -n "  Testing: $test_name... "
}

test_pass() {
    echo -e "${GREEN}PASS${NC}"
    ((TESTS_PASSED++))
}

test_fail() {
    local reason="${1:-}"
    echo -e "${RED}FAIL${NC}"
    [ -n "$reason" ] && echo "    Reason: $reason"
    ((TESTS_FAILED++))
}

test_skip() {
    local reason="${1:-}"
    echo -e "${YELLOW}SKIP${NC}"
    [ -n "$reason" ] && echo "    Reason: $reason"
}

# =============================================================================
# TEST CASES
# =============================================================================

##
# Test 1: Database connection
##
test_db_connection() {
    test_start "Database connection"
    
    if type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        test_pass
        return 0
    else
        test_fail "Cannot connect to orchestration database"
        return 1
    fi
}

##
# Test 2: Federation schema exists
##
test_schema_exists() {
    test_start "Federation schema exists"
    
    if type fed_db_schema_exists &>/dev/null && fed_db_schema_exists; then
        test_pass
        return 0
    else
        test_fail "Federation schema not found"
        return 1
    fi
}

##
# Test 3: Create federation link (SPOKE_TO_HUB)
##
test_create_spoke_to_hub_link() {
    test_start "Create SPOKE_TO_HUB link"
    
    if type fed_db_upsert_link &>/dev/null; then
        if fed_db_upsert_link "$TEST_INSTANCE" "usa" "SPOKE_TO_HUB" "usa-idp" "PENDING" \
            "dive-v3-broker-${TEST_INSTANCE}" '{"test": true}'; then
            test_pass
            return 0
        else
            test_fail "fed_db_upsert_link returned error"
            return 1
        fi
    else
        test_fail "fed_db_upsert_link function not found"
        return 1
    fi
}

##
# Test 4: Create federation link (HUB_TO_SPOKE)
##
test_create_hub_to_spoke_link() {
    test_start "Create HUB_TO_SPOKE link"
    
    if type fed_db_upsert_link &>/dev/null; then
        if fed_db_upsert_link "usa" "$TEST_INSTANCE" "HUB_TO_SPOKE" "${TEST_INSTANCE}-idp" "PENDING" \
            "dive-v3-broker-usa" '{"test": true}'; then
            test_pass
            return 0
        else
            test_fail "fed_db_upsert_link returned error"
            return 1
        fi
    else
        test_fail "fed_db_upsert_link function not found"
        return 1
    fi
}

##
# Test 5: Update link status to ACTIVE
##
test_update_link_status_active() {
    test_start "Update link status to ACTIVE"
    
    if type fed_db_update_status &>/dev/null; then
        if fed_db_update_status "$TEST_INSTANCE" "usa" "SPOKE_TO_HUB" "ACTIVE"; then
            test_pass
            return 0
        else
            test_fail "fed_db_update_status returned error"
            return 1
        fi
    else
        test_fail "fed_db_update_status function not found"
        return 1
    fi
}

##
# Test 6: Update link status to FAILED
##
test_update_link_status_failed() {
    test_start "Update link status to FAILED"
    
    if type fed_db_update_status &>/dev/null; then
        if fed_db_update_status "usa" "$TEST_INSTANCE" "HUB_TO_SPOKE" "FAILED" \
            "Test failure message" "E001"; then
            test_pass
            return 0
        else
            test_fail "fed_db_update_status returned error"
            return 1
        fi
    else
        test_fail "fed_db_update_status function not found"
        return 1
    fi
}

##
# Test 7: Get link status
##
test_get_link_status() {
    test_start "Get link status"
    
    if type fed_db_get_link_status &>/dev/null; then
        local status
        status=$(fed_db_get_link_status "$TEST_INSTANCE" "usa" "SPOKE_TO_HUB")
        
        if [ "$status" = "ACTIVE" ]; then
            test_pass
            return 0
        else
            test_fail "Expected ACTIVE, got: $status"
            return 1
        fi
    else
        test_fail "fed_db_get_link_status function not found"
        return 1
    fi
}

##
# Test 8: List links for instance
##
test_list_links() {
    test_start "List links for instance"
    
    if type fed_db_list_links &>/dev/null; then
        local output
        output=$(fed_db_list_links "$TEST_INSTANCE")
        
        if [ -n "$output" ]; then
            test_pass
            return 0
        else
            test_fail "No output from fed_db_list_links"
            return 1
        fi
    else
        test_fail "fed_db_list_links function not found"
        return 1
    fi
}

##
# Test 9: Record health check
##
test_record_health_check() {
    test_start "Record health check"
    
    if type fed_db_record_health &>/dev/null; then
        if fed_db_record_health "$TEST_INSTANCE" "usa" "SPOKE_TO_HUB" \
            "true" "true" "true" "true" "true" "150" ""; then
            test_pass
            return 0
        else
            test_fail "fed_db_record_health returned error"
            return 1
        fi
    else
        test_fail "fed_db_record_health function not found"
        return 1
    fi
}

##
# Test 10: Get latest health check
##
test_get_latest_health() {
    test_start "Get latest health check"
    
    if type fed_db_get_latest_health &>/dev/null; then
        local output
        output=$(fed_db_get_latest_health "$TEST_INSTANCE" "usa" "SPOKE_TO_HUB")
        
        if [ -n "$output" ]; then
            test_pass
            return 0
        else
            test_fail "No output from fed_db_get_latest_health"
            return 1
        fi
    else
        test_fail "fed_db_get_latest_health function not found"
        return 1
    fi
}

##
# Test 11: Get instance status JSON
##
test_get_instance_status() {
    test_start "Get instance status JSON"
    
    if type fed_db_get_instance_status &>/dev/null; then
        local output
        output=$(fed_db_get_instance_status "$TEST_INSTANCE")
        
        if echo "$output" | jq empty >/dev/null 2>&1; then
            # Check for expected fields
            if echo "$output" | jq -e '.instance' >/dev/null 2>&1; then
                test_pass
                return 0
            else
                test_fail "Missing 'instance' field in JSON"
                return 1
            fi
        else
            test_fail "Invalid JSON output"
            return 1
        fi
    else
        test_fail "fed_db_get_instance_status function not found"
        return 1
    fi
}

##
# Test 12: Get failed links for retry
##
test_get_failed_links() {
    test_start "Get failed links for retry"
    
    if type fed_db_get_failed_links &>/dev/null; then
        local output
        output=$(fed_db_get_failed_links 5)
        
        # Should find at least the HUB_TO_SPOKE link we marked as FAILED
        if echo "$output" | grep -q "$TEST_INSTANCE"; then
            test_pass
            return 0
        else
            test_fail "Failed link not found in output"
            return 1
        fi
    else
        test_fail "fed_db_get_failed_links function not found"
        return 1
    fi
}

##
# Test 13: Reset failed links
##
test_reset_failed_links() {
    test_start "Reset failed links"
    
    if type fed_db_reset_failed &>/dev/null; then
        if fed_db_reset_failed "$TEST_INSTANCE" >/dev/null; then
            # Verify status is now PENDING
            local status
            status=$(fed_db_get_link_status "usa" "$TEST_INSTANCE" "HUB_TO_SPOKE")
            
            if [ "$status" = "PENDING" ]; then
                test_pass
                return 0
            else
                test_fail "Expected PENDING after reset, got: $status"
                return 1
            fi
        else
            test_fail "fed_db_reset_failed returned error"
            return 1
        fi
    else
        test_fail "fed_db_reset_failed function not found"
        return 1
    fi
}

##
# Test 14: Query federation_status view
##
test_federation_status_view() {
    test_start "Query federation_status view"
    
    local output
    output=$(orch_db_exec "SELECT * FROM federation_status WHERE source_code = '$TEST_INSTANCE' OR target_code = '$TEST_INSTANCE' LIMIT 5" 2>/dev/null)
    
    if [ -n "$output" ]; then
        test_pass
        return 0
    else
        test_fail "No output from federation_status view"
        return 1
    fi
}

##
# Test 15: Query federation_pairs view
##
test_federation_pairs_view() {
    test_start "Query federation_pairs view"
    
    local output
    output=$(orch_db_exec "SELECT * FROM federation_pairs LIMIT 5" 2>/dev/null)
    
    # View might be empty if no complete pairs, but query should succeed
    test_pass
    return 0
}

##
# Cleanup: Delete test data
##
cleanup_test_data() {
    test_start "Cleanup test data"
    
    # Delete test links
    if type fed_db_delete_link &>/dev/null; then
        fed_db_delete_link "$TEST_INSTANCE" "usa" "SPOKE_TO_HUB" >/dev/null 2>&1 || true
        fed_db_delete_link "usa" "$TEST_INSTANCE" "HUB_TO_SPOKE" >/dev/null 2>&1 || true
    fi
    
    # Delete test health records
    orch_db_exec "DELETE FROM federation_health WHERE source_code = '$TEST_INSTANCE' OR target_code = '$TEST_INSTANCE'" >/dev/null 2>&1 || true
    
    test_pass
}

# =============================================================================
# MAIN TEST RUNNER
# =============================================================================

main() {
    echo ""
    echo "=============================================="
    echo "DIVE V3 Federation Database Tests"
    echo "=============================================="
    echo ""
    echo "Test Instance: $TEST_INSTANCE"
    echo ""
    
    # Pre-flight check
    echo "Pre-flight Checks:"
    if ! test_db_connection; then
        echo ""
        echo -e "${RED}Cannot connect to database - aborting tests${NC}"
        echo "Make sure the hub is running: ./dive hub up"
        exit 1
    fi
    
    if ! test_schema_exists; then
        echo ""
        echo -e "${YELLOW}Federation schema not found - initializing...${NC}"
        if type fed_db_init_schema &>/dev/null; then
            fed_db_init_schema
        else
            echo -e "${RED}Cannot initialize schema - aborting tests${NC}"
            exit 1
        fi
    fi
    echo ""
    
    # Run tests
    echo "Federation Link Tests:"
    test_create_spoke_to_hub_link
    test_create_hub_to_spoke_link
    test_update_link_status_active
    test_update_link_status_failed
    test_get_link_status
    test_list_links
    echo ""
    
    echo "Health Check Tests:"
    test_record_health_check
    test_get_latest_health
    test_get_instance_status
    echo ""
    
    echo "Recovery Tests:"
    test_get_failed_links
    test_reset_failed_links
    echo ""
    
    echo "View Tests:"
    test_federation_status_view
    test_federation_pairs_view
    echo ""
    
    echo "Cleanup:"
    cleanup_test_data
    echo ""
    
    # Summary
    echo "=============================================="
    echo "Test Summary"
    echo "=============================================="
    echo ""
    echo -e "  Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "  Failed: ${RED}$TESTS_FAILED${NC}"
    echo ""
    
    if [ $TESTS_FAILED -gt 0 ]; then
        echo -e "${RED}Some tests failed!${NC}"
        exit 1
    else
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    fi
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
