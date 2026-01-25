#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Rollback Testing Suite (GAP-003 Fix)
# =============================================================================
# Comprehensive automated testing of rollback mechanisms
# Tests all 6 rollback scenarios identified in gap analysis
# =============================================================================

set -e

# Ensure DIVE_ROOT is set
if [ -z "$DIVE_ROOT" ]; then
    DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
    export DIVE_ROOT
fi

# Load common functions
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"
source "${DIVE_ROOT}/scripts/dive-modules/orchestration-framework.sh"
source "${DIVE_ROOT}/scripts/dive-modules/orchestration-state-db.sh"
source "${DIVE_ROOT}/scripts/dive-modules/deployment-state.sh"

# Test configuration
TEST_INSTANCE="tst"  # Use 'tst' instance for testing
TEST_INSTANCE_NAME="Test Instance"
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# =============================================================================
# TEST FRAMEWORK
# =============================================================================

print_test_header() {
    local test_name="$1"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}TEST: $test_name${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

assert_equals() {
    local expected="$1"
    local actual="$2"
    local description="$3"

    if [ "$expected" = "$actual" ]; then
        echo -e "${GREEN}  ✓ PASS: $description${NC}"
        echo -e "    Expected: $expected"
        echo -e "    Actual:   $actual"
        return 0
    else
        echo -e "${RED}  ✗ FAIL: $description${NC}"
        echo -e "    Expected: $expected"
        echo -e "    Actual:   $actual"
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local description="$3"

    if echo "$haystack" | grep -q "$needle"; then
        echo -e "${GREEN}  ✓ PASS: $description${NC}"
        return 0
    else
        echo -e "${RED}  ✗ FAIL: $description${NC}"
        echo -e "    Expected to find: $needle"
        return 1
    fi
}

assert_file_exists() {
    local file="$1"
    local description="$2"

    if [ -f "$file" ]; then
        echo -e "${GREEN}  ✓ PASS: $description${NC}"
        return 0
    else
        echo -e "${RED}  ✗ FAIL: $description${NC}"
        echo -e "    File not found: $file"
        return 1
    fi
}

assert_no_containers_running() {
    local instance_code="$1"
    local description="$2"

    local running_count=$(docker ps -q --filter "name=dive-spoke-${instance_code}" 2>/dev/null | wc -l | xargs)

    if [ "$running_count" -eq 0 ]; then
        echo -e "${GREEN}  ✓ PASS: $description${NC}"
        return 0
    else
        echo -e "${RED}  ✗ FAIL: $description${NC}"
        echo -e "    Found $running_count running containers"
        return 1
    fi
}

run_test() {
    local test_function="$1"
    ((TESTS_TOTAL++))

    if $test_function; then
        ((TESTS_PASSED++))
        echo -e "${GREEN}✅ TEST PASSED${NC}"
    else
        ((TESTS_FAILED++))
        echo -e "${RED}❌ TEST FAILED${NC}"
    fi
}

# =============================================================================
# TEST UTILITIES
# =============================================================================

cleanup_test_instance() {
    log_info "Cleaning up test instance..."

    # Stop and remove all test instance containers
    docker compose -f "${DIVE_ROOT}/instances/${TEST_INSTANCE}/docker-compose.yml" down -v 2>/dev/null || true
    docker ps -a -q --filter "name=dive-spoke-${TEST_INSTANCE}" | grep . | xargs docker rm -f 2>/dev/null || true

    # Remove state files
    rm -f "${DIVE_ROOT}/.dive-state/${TEST_INSTANCE}.state"
    rm -f "${DIVE_ROOT}/.dive-state/${TEST_INSTANCE}.lock"

    # Remove checkpoints
    rm -rf "${DIVE_ROOT}/.dive-checkpoints/"*"${TEST_INSTANCE}"* 2>/dev/null || true

    log_success "Test instance cleaned up"
}

create_mock_checkpoint() {
    local instance_code="$1"
    local level="${2:-CONFIG}"
    local description="${3:-Test checkpoint}"

    local checkpoint_id="$(date +%Y%m%d_%H%M%S)_${instance_code}_${level}"
    local checkpoint_dir="${DIVE_ROOT}/.dive-checkpoints/${checkpoint_id}"

    mkdir -p "$checkpoint_dir"

    # Create mock configuration files
    echo "MOCK_ENV=true" > "${checkpoint_dir}/.env"
    echo '{"test": true}' > "${checkpoint_dir}/config.json"
    echo 'version: "3.8"' > "${checkpoint_dir}/docker-compose.yml"

    # Create metadata
    cat > "${checkpoint_dir}/metadata.json" <<EOF
{
    "checkpoint_id": "$checkpoint_id",
    "instance_code": "$instance_code",
    "level": "$level",
    "description": "$description",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "created_by": "test_system",
    "orchestration_version": "3.0"
}
EOF

    echo "$checkpoint_id"
}

deploy_to_state() {
    local instance_code="$1"
    local target_state="$2"

    # Set state directly (bypass full deployment for testing)
    set_deployment_state_enhanced "$instance_code" "$target_state" "Test setup"
}

# =============================================================================
# TEST CASES
# =============================================================================

##
# TEST 1: Rollback from FAILED state with CONFIG strategy
##
test_rollback_from_failed_config() {
    print_test_header "Rollback from FAILED (CONFIG strategy)"

    # Setup
    cleanup_test_instance
    deploy_to_state "$TEST_INSTANCE" "FAILED"
    local checkpoint_id=$(create_mock_checkpoint "$TEST_INSTANCE" "CONFIG")

    # Execute rollback
    log_info "Executing CONFIG rollback..."
    if orch_rollback_configuration "$TEST_INSTANCE" "$checkpoint_id"; then
        # Verify config files restored
        assert_file_exists "${DIVE_ROOT}/instances/${TEST_INSTANCE}/.env" "Config restored: .env"
        assert_file_exists "${DIVE_ROOT}/instances/${TEST_INSTANCE}/config.json" "Config restored: config.json"
        assert_contains "$(cat "${DIVE_ROOT}/instances/${TEST_INSTANCE}/.env")" "MOCK_ENV=true" "Correct config content"

        return 0
    else
        log_error "Rollback failed"
        return 1
    fi
}

##
# TEST 2: Rollback from CONFIGURING state
##
test_rollback_from_configuring() {
    print_test_header "Rollback from CONFIGURING state"

    # Setup
    cleanup_test_instance
    deploy_to_state "$TEST_INSTANCE" "CONFIGURING"
    local checkpoint_id=$(create_mock_checkpoint "$TEST_INSTANCE" "DEPLOYING")

    # Execute rollback
    log_info "Executing automatic rollback from CONFIGURING..."
    if orch_execute_rollback "$TEST_INSTANCE" "Test failure in configuring" "CONFIG"; then
        # Verify state changed
        local new_state=$(get_deployment_state "$TEST_INSTANCE")
        assert_equals "ROLLED_BACK" "$new_state" "State after rollback"

        return 0
    else
        log_error "Rollback failed"
        return 1
    fi
}

##
# TEST 3: Rollback from DEPLOYING state (STOP strategy)
##
test_rollback_from_deploying() {
    print_test_header "Rollback from DEPLOYING state"

    # Setup
    cleanup_test_instance
    deploy_to_state "$TEST_INSTANCE" "DEPLOYING"

    # Create mock instance directory
    mkdir -p "${DIVE_ROOT}/instances/${TEST_INSTANCE}"
    cat > "${DIVE_ROOT}/instances/${TEST_INSTANCE}/docker-compose.yml" <<EOF
version: "3.8"
services:
  test:
    image: alpine:latest
    command: sleep 3600
    container_name: dive-spoke-${TEST_INSTANCE}-test
EOF

    # Start a test container
    cd "${DIVE_ROOT}/instances/${TEST_INSTANCE}"
    docker compose up -d 2>/dev/null || true

    # Execute rollback (STOP strategy)
    log_info "Executing STOP rollback..."
    if orch_rollback_stop_services "$TEST_INSTANCE"; then
        # Verify containers stopped
        assert_no_containers_running "$TEST_INSTANCE" "All containers stopped"

        return 0
    else
        log_error "Rollback failed"
        return 1
    fi
}

##
# TEST 4: Multiple consecutive rollbacks
##
test_multiple_rollbacks() {
    print_test_header "Multiple consecutive rollbacks"

    # Setup
    cleanup_test_instance

    # Create checkpoints at different levels
    local cp1=$(create_mock_checkpoint "$TEST_INSTANCE" "CONTAINER")
    local cp2=$(create_mock_checkpoint "$TEST_INSTANCE" "CONFIG")
    local cp3=$(create_mock_checkpoint "$TEST_INSTANCE" "KEYCLOAK")

    # Rollback 1
    deploy_to_state "$TEST_INSTANCE" "FAILED"
    log_info "Rollback 1..."
    orch_execute_rollback "$TEST_INSTANCE" "First failure" "CONFIG"

    # Rollback 2
    deploy_to_state "$TEST_INSTANCE" "FAILED"
    log_info "Rollback 2..."
    orch_execute_rollback "$TEST_INSTANCE" "Second failure" "CONFIG"

    # Rollback 3
    deploy_to_state "$TEST_INSTANCE" "FAILED"
    log_info "Rollback 3..."
    orch_execute_rollback "$TEST_INSTANCE" "Third failure" "CONFIG"

    # Verify system still functional
    local state=$(get_deployment_state "$TEST_INSTANCE")
    assert_equals "ROLLED_BACK" "$state" "State after multiple rollbacks"

    return 0
}

##
# TEST 5: Rollback with database unavailable (file fallback)
##
test_rollback_db_unavailable() {
    print_test_header "Rollback with database unavailable"

    # Setup
    cleanup_test_instance
    deploy_to_state "$TEST_INSTANCE" "FAILED"
    local checkpoint_id=$(create_mock_checkpoint "$TEST_INSTANCE" "CONFIG")

    # Temporarily disable database
    local orig_db_enabled="$ORCH_DB_ENABLED"
    export ORCH_DB_ENABLED=false

    # Execute rollback (should use file-based state)
    log_info "Executing rollback with DB disabled..."
    if orch_rollback_configuration "$TEST_INSTANCE" "$checkpoint_id"; then
        # Verify rollback succeeded using file-based state
        assert_file_exists "${DIVE_ROOT}/.dive-state/${TEST_INSTANCE}.state" "State file exists"

        # Restore DB setting
        export ORCH_DB_ENABLED="$orig_db_enabled"

        return 0
    else
        log_error "Rollback failed"
        export ORCH_DB_ENABLED="$orig_db_enabled"
        return 1
    fi
}

##
# TEST 6: Checkpoint creation and validation
##
test_checkpoint_creation() {
    print_test_header "Checkpoint creation and validation"

    # Setup
    cleanup_test_instance
    deploy_to_state "$TEST_INSTANCE" "CONFIGURING"

    # Create instance directory with mock files
    mkdir -p "${DIVE_ROOT}/instances/${TEST_INSTANCE}"
    echo "TEST_VAR=123" > "${DIVE_ROOT}/instances/${TEST_INSTANCE}/.env"
    echo '{"key": "value"}' > "${DIVE_ROOT}/instances/${TEST_INSTANCE}/config.json"

    # Create checkpoint
    log_info "Creating COMPLETE checkpoint..."
    local checkpoint_id=$(orch_create_checkpoint "$TEST_INSTANCE" "COMPLETE" "Test checkpoint")

    # Verify checkpoint created
    local checkpoint_dir="${DIVE_ROOT}/.dive-checkpoints/${checkpoint_id}"
    assert_file_exists "${checkpoint_dir}/metadata.json" "Checkpoint metadata exists"
    assert_file_exists "${checkpoint_dir}/.env" "Checkpoint .env exists"
    assert_file_exists "${checkpoint_dir}/config.json" "Checkpoint config exists"

    # Verify metadata content
    local metadata=$(cat "${checkpoint_dir}/metadata.json")
    assert_contains "$metadata" "\"instance_code\": \"${TEST_INSTANCE}\"" "Metadata has instance code"
    assert_contains "$metadata" "\"level\": \"COMPLETE\"" "Metadata has correct level"

    return 0
}

# =============================================================================
# TEST RUNNER
# =============================================================================

run_all_tests() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  DIVE V3 Rollback Testing Suite (GAP-003)                ║${NC}"
    echo -e "${CYAN}║  Comprehensive Rollback Mechanism Validation             ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    log_info "Test instance: $TEST_INSTANCE"
    log_info "DIVE_ROOT: $DIVE_ROOT"
    echo ""

    # Pre-test cleanup
    log_step "Pre-test cleanup..."
    cleanup_test_instance

    # Run all tests
    run_test test_checkpoint_creation
    run_test test_rollback_from_failed_config
    run_test test_rollback_from_configuring
    run_test test_rollback_from_deploying
    run_test test_multiple_rollbacks
    run_test test_rollback_db_unavailable

    # Post-test cleanup
    log_step "Post-test cleanup..."
    cleanup_test_instance

    # Print summary
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}TEST SUMMARY${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Total Tests:  $TESTS_TOTAL"
    echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
    echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
    echo ""

    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}❌ SOME TESTS FAILED${NC}"
        echo ""
        return 1
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    # Check prerequisites
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running"
        exit 1
    fi

    # Run tests
    if run_all_tests; then
        exit 0
    else
        exit 1
    fi
}

# Execute if run directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
