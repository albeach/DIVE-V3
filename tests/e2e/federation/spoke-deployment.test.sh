#!/bin/bash
# =============================================================================
# DIVE V3 - Spoke Deployment Integration Tests (Phase 2)
# =============================================================================
# Tests for the spoke deployment workflow including:
# - Spoke deploy (full automation)
# - Spoke verify (8-point connectivity)
# - Spoke health
# - Spoke reset
# - Spoke teardown
# - Multi-spoke scenario
#
# Usage:
#   ./tests/e2e/federation/spoke-deployment.test.sh
#   ./tests/e2e/federation/spoke-deployment.test.sh --quick  # Skip long waits
#   ./tests/e2e/federation/spoke-deployment.test.sh --skip-teardown  # Keep test instance
#
# Prerequisites:
#   - Docker running
#   - curl, jq installed
#   - Ports available: 8443, 4000, 8181, 3000
# =============================================================================

set -e

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${SCRIPT_DIR}/../../.."
QUICK_MODE=false
SKIP_TEARDOWN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --quick)
            QUICK_MODE=true
            shift
            ;;
        --skip-teardown)
            SKIP_TEARDOWN=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test spoke code
TEST_SPOKE_CODE="TST"
TEST_SPOKE_CODE_LOWER="tst"
TEST_SPOKE_NAME="Test Spoke Instance"

# =============================================================================
# TEST UTILITIES
# =============================================================================

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((TESTS_SKIPPED++))
}

log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

assert_eq() {
    local expected="$1"
    local actual="$2"
    local message="$3"
    
    ((TESTS_RUN++))
    if [ "$expected" = "$actual" ]; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (expected: $expected, got: $actual)"
        return 1
    fi
}

assert_not_empty() {
    local value="$1"
    local message="$2"
    
    ((TESTS_RUN++))
    if [ -n "$value" ]; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (value is empty)"
        return 1
    fi
}

assert_file_exists() {
    local path="$1"
    local message="$2"
    
    ((TESTS_RUN++))
    if [ -f "$path" ]; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (file not found: $path)"
        return 1
    fi
}

assert_dir_exists() {
    local path="$1"
    local message="$2"
    
    ((TESTS_RUN++))
    if [ -d "$path" ]; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (directory not found: $path)"
        return 1
    fi
}

assert_command_success() {
    local message="$1"
    shift
    local cmd="$*"
    
    ((TESTS_RUN++))
    if eval "$cmd" >/dev/null 2>&1; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (command failed: $cmd)"
        return 1
    fi
}

assert_http_status() {
    local url="$1"
    local expected_status="$2"
    local message="$3"
    
    ((TESTS_RUN++))
    local actual_status=$(curl -kso /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "000")
    
    if [ "$actual_status" = "$expected_status" ]; then
        log_pass "$message (HTTP $actual_status)"
        return 0
    else
        log_fail "$message (expected HTTP $expected_status, got $actual_status)"
        return 1
    fi
}

wait_for_service() {
    local url="$1"
    local timeout="${2:-120}"
    local name="${3:-service}"
    
    log_info "Waiting for $name at $url (up to ${timeout}s)..."
    
    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
        if curl -kfs --max-time 5 "$url" >/dev/null 2>&1; then
            log_info "$name is ready after ${elapsed}s"
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
    done
    
    log_fail "$name not ready after ${timeout}s"
    return 1
}

# =============================================================================
# CLEANUP
# =============================================================================

cleanup() {
    if [ "$SKIP_TEARDOWN" = true ]; then
        log_info "Skipping cleanup (--skip-teardown)"
        return 0
    fi
    
    log_info "Cleaning up test spoke..."
    
    cd "$DIVE_ROOT"
    
    # Teardown test spoke if it exists
    local spoke_dir="${DIVE_ROOT}/instances/${TEST_SPOKE_CODE_LOWER}"
    if [ -d "$spoke_dir" ]; then
        export COMPOSE_PROJECT_NAME="${TEST_SPOKE_CODE_LOWER}"
        cd "$spoke_dir"
        docker compose down -v --remove-orphans 2>/dev/null || true
        cd "$DIVE_ROOT"
        
        # Remove volumes
        docker volume ls -q | grep "^${TEST_SPOKE_CODE_LOWER}_" | xargs -r docker volume rm 2>/dev/null || true
        
        # Remove network
        docker network rm "dive-${TEST_SPOKE_CODE_LOWER}-network" 2>/dev/null || true
        
        # Remove directory
        rm -rf "$spoke_dir"
    fi
    
    log_info "Cleanup complete"
}

# =============================================================================
# TEST: Spoke Deploy
# =============================================================================

test_spoke_deploy() {
    log_test "Testing spoke deploy command..."
    
    cd "$DIVE_ROOT"
    
    # Clean any previous test instance
    local spoke_dir="${DIVE_ROOT}/instances/${TEST_SPOKE_CODE_LOWER}"
    if [ -d "$spoke_dir" ]; then
        log_info "Removing previous test instance..."
        export COMPOSE_PROJECT_NAME="${TEST_SPOKE_CODE_LOWER}"
        cd "$spoke_dir"
        docker compose down -v 2>/dev/null || true
        cd "$DIVE_ROOT"
        rm -rf "$spoke_dir"
    fi
    
    # Time the deployment
    local start_time=$(date +%s)
    
    # Run deploy
    log_info "Running: ./dive spoke deploy $TEST_SPOKE_CODE '$TEST_SPOKE_NAME'"
    
    if [ "$QUICK_MODE" = true ]; then
        # In quick mode, just test initialization part
        export DIVE_PILOT_MODE=false
        ./dive spoke init "$TEST_SPOKE_CODE" "$TEST_SPOKE_NAME" 2>&1 | tail -20
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        ((TESTS_RUN++))
        if [ -d "$spoke_dir" ] && [ -f "$spoke_dir/docker-compose.yml" ]; then
            log_pass "Spoke init completed in ${duration}s"
        else
            log_fail "Spoke init failed"
            return 1
        fi
    else
        # Full deploy
        export DIVE_PILOT_MODE=false
        ./dive spoke deploy "$TEST_SPOKE_CODE" "$TEST_SPOKE_NAME" 2>&1 | tail -50
        
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        ((TESTS_RUN++))
        if [ $duration -lt 120 ]; then
            log_pass "Spoke deployed in ${duration}s (<120s target)"
        else
            log_fail "Spoke deployment took ${duration}s (>120s target)"
        fi
    fi
    
    # Verify directory structure
    assert_dir_exists "$spoke_dir" "Spoke directory created"
    assert_file_exists "$spoke_dir/docker-compose.yml" "docker-compose.yml created"
    assert_file_exists "$spoke_dir/config.json" "config.json created"
    assert_file_exists "$spoke_dir/.env" ".env file created"
    assert_dir_exists "$spoke_dir/certs" "Certs directory created"
    assert_file_exists "$spoke_dir/certs/spoke.key" "Spoke private key generated"
    assert_file_exists "$spoke_dir/certs/spoke.crt" "Spoke certificate generated"
    
    # Verify config.json content
    ((TESTS_RUN++))
    local spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$spoke_dir/config.json" | cut -d'"' -f4)
    if [ -n "$spoke_id" ] && echo "$spoke_id" | grep -q "spoke-${TEST_SPOKE_CODE_LOWER}"; then
        log_pass "Spoke ID correctly generated: $spoke_id"
    else
        log_fail "Spoke ID not correctly generated"
    fi
}

# =============================================================================
# TEST: Spoke Up (Start Services)
# =============================================================================

test_spoke_up() {
    log_test "Testing spoke up command..."
    
    cd "$DIVE_ROOT"
    
    local spoke_dir="${DIVE_ROOT}/instances/${TEST_SPOKE_CODE_LOWER}"
    
    if [ ! -d "$spoke_dir" ]; then
        log_skip "Spoke not deployed, skipping up test"
        return 0
    fi
    
    # If in quick mode and services not running, start them
    export COMPOSE_PROJECT_NAME="${TEST_SPOKE_CODE_LOWER}"
    cd "$spoke_dir"
    
    local running_count=$(docker compose ps -q 2>/dev/null | wc -l | tr -d ' ')
    
    if [ "$running_count" -eq 0 ]; then
        log_info "Starting spoke services..."
        docker compose up -d 2>&1 | tail -5
        
        # Wait for services
        if [ "$QUICK_MODE" = false ]; then
            sleep 30
        else
            sleep 10
        fi
    fi
    
    # Verify containers are running
    ((TESTS_RUN++))
    running_count=$(docker compose ps -q 2>/dev/null | wc -l | tr -d ' ')
    if [ "$running_count" -gt 0 ]; then
        log_pass "$running_count containers running"
    else
        log_fail "No containers running"
    fi
    
    cd "$DIVE_ROOT"
}

# =============================================================================
# TEST: Spoke Verify (8-Point Connectivity)
# =============================================================================

test_spoke_verify() {
    log_test "Testing spoke verify command..."
    
    cd "$DIVE_ROOT"
    
    local spoke_dir="${DIVE_ROOT}/instances/${TEST_SPOKE_CODE_LOWER}"
    
    if [ ! -d "$spoke_dir" ]; then
        log_skip "Spoke not deployed, skipping verify test"
        return 0
    fi
    
    # Run verify command
    export INSTANCE="${TEST_SPOKE_CODE_LOWER}"
    export DIVE_INSTANCE="${TEST_SPOKE_CODE_LOWER}"
    
    local verify_output
    verify_output=$(./dive --instance "${TEST_SPOKE_CODE_LOWER}" spoke verify 2>&1) || true
    
    echo "$verify_output" | tail -20
    
    # Check that verify ran
    ((TESTS_RUN++))
    if echo "$verify_output" | grep -q "8-Point Connectivity Test\|Verification Summary"; then
        log_pass "Spoke verify command executed"
    else
        log_fail "Spoke verify command did not run properly"
    fi
    
    # In quick mode, we don't wait for all services, so some checks may fail
    if [ "$QUICK_MODE" = true ]; then
        log_skip "Skipping individual verification checks in quick mode"
    else
        # Check individual results
        ((TESTS_RUN++))
        if echo "$verify_output" | grep -q "OPA Health.*✓"; then
            log_pass "OPA health check passed"
        else
            log_fail "OPA health check failed"
        fi
        
        ((TESTS_RUN++))
        if echo "$verify_output" | grep -q "Backend Health.*✓"; then
            log_pass "Backend health check passed"
        else
            log_fail "Backend health check failed"
        fi
    fi
}

# =============================================================================
# TEST: Spoke Health
# =============================================================================

test_spoke_health() {
    log_test "Testing spoke health command..."
    
    cd "$DIVE_ROOT"
    
    local spoke_dir="${DIVE_ROOT}/instances/${TEST_SPOKE_CODE_LOWER}"
    
    if [ ! -d "$spoke_dir" ]; then
        log_skip "Spoke not deployed, skipping health test"
        return 0
    fi
    
    # Run health command
    local health_output
    health_output=$(./dive --instance "${TEST_SPOKE_CODE_LOWER}" spoke health 2>&1) || true
    
    echo "$health_output" | tail -15
    
    ((TESTS_RUN++))
    if echo "$health_output" | grep -q "Service Health\|Services"; then
        log_pass "Spoke health command executed"
    else
        log_fail "Spoke health command did not run properly"
    fi
}

# =============================================================================
# TEST: Spoke Status
# =============================================================================

test_spoke_status() {
    log_test "Testing spoke status command..."
    
    cd "$DIVE_ROOT"
    
    local spoke_dir="${DIVE_ROOT}/instances/${TEST_SPOKE_CODE_LOWER}"
    
    if [ ! -d "$spoke_dir" ]; then
        log_skip "Spoke not deployed, skipping status test"
        return 0
    fi
    
    # Run status command
    local status_output
    status_output=$(./dive --instance "${TEST_SPOKE_CODE_LOWER}" spoke status 2>&1) || true
    
    echo "$status_output" | tail -15
    
    ((TESTS_RUN++))
    if echo "$status_output" | grep -q "Federation Status\|Identity"; then
        log_pass "Spoke status command executed"
    else
        log_fail "Spoke status command did not run properly"
    fi
    
    # Verify spoke ID is displayed
    ((TESTS_RUN++))
    if echo "$status_output" | grep -q "spoke-${TEST_SPOKE_CODE_LOWER}"; then
        log_pass "Spoke ID displayed in status"
    else
        log_fail "Spoke ID not displayed in status"
    fi
}

# =============================================================================
# TEST: Spoke Reset
# =============================================================================

test_spoke_reset() {
    log_test "Testing spoke reset command..."
    
    if [ "$QUICK_MODE" = true ]; then
        log_skip "Skipping reset test in quick mode"
        return 0
    fi
    
    cd "$DIVE_ROOT"
    
    local spoke_dir="${DIVE_ROOT}/instances/${TEST_SPOKE_CODE_LOWER}"
    
    if [ ! -d "$spoke_dir" ]; then
        log_skip "Spoke not deployed, skipping reset test"
        return 0
    fi
    
    # Create .initialized marker if it doesn't exist
    touch "$spoke_dir/.initialized"
    
    # Run reset with auto-confirm
    log_info "Running spoke reset (with yes confirmation)..."
    echo "yes" | ./dive --instance "${TEST_SPOKE_CODE_LOWER}" spoke reset 2>&1 | tail -10
    
    # Verify .initialized marker is removed
    ((TESTS_RUN++))
    if [ ! -f "$spoke_dir/.initialized" ]; then
        log_pass ".initialized marker removed"
    else
        log_fail ".initialized marker still exists"
    fi
    
    # Verify config files still exist
    assert_file_exists "$spoke_dir/config.json" "config.json preserved after reset"
    assert_file_exists "$spoke_dir/.env" ".env preserved after reset"
    assert_file_exists "$spoke_dir/certs/spoke.key" "Certificates preserved after reset"
}

# =============================================================================
# TEST: Spoke Teardown
# =============================================================================

test_spoke_teardown() {
    log_test "Testing spoke teardown command..."
    
    if [ "$SKIP_TEARDOWN" = true ]; then
        log_skip "Skipping teardown test (--skip-teardown)"
        return 0
    fi
    
    cd "$DIVE_ROOT"
    
    local spoke_dir="${DIVE_ROOT}/instances/${TEST_SPOKE_CODE_LOWER}"
    
    if [ ! -d "$spoke_dir" ]; then
        log_skip "Spoke not deployed, skipping teardown test"
        return 0
    fi
    
    # Run teardown with confirmation
    log_info "Running spoke teardown (with confirmation)..."
    echo "${TEST_SPOKE_CODE}" | ./dive --instance "${TEST_SPOKE_CODE_LOWER}" spoke teardown 2>&1 | tail -10
    
    # Verify directory is removed
    ((TESTS_RUN++))
    if [ ! -d "$spoke_dir" ]; then
        log_pass "Spoke directory removed"
    else
        log_fail "Spoke directory still exists"
    fi
    
    # Verify volumes are removed
    ((TESTS_RUN++))
    local volume_count=$(docker volume ls -q | grep "^${TEST_SPOKE_CODE_LOWER}_" | wc -l | tr -d ' ')
    if [ "$volume_count" -eq 0 ]; then
        log_pass "Docker volumes removed"
    else
        log_fail "$volume_count Docker volumes still exist"
    fi
}

# =============================================================================
# TEST: CLI Help
# =============================================================================

test_spoke_help() {
    log_test "Testing spoke help command..."
    
    cd "$DIVE_ROOT"
    
    # Run help command
    local help_output
    help_output=$(./dive spoke help 2>&1)
    
    # Check for new Phase 2 commands
    ((TESTS_RUN++))
    if echo "$help_output" | grep -q "deploy"; then
        log_pass "Help shows deploy command"
    else
        log_fail "Help missing deploy command"
    fi
    
    ((TESTS_RUN++))
    if echo "$help_output" | grep -q "verify"; then
        log_pass "Help shows verify command"
    else
        log_fail "Help missing verify command"
    fi
    
    ((TESTS_RUN++))
    if echo "$help_output" | grep -q "reset"; then
        log_pass "Help shows reset command"
    else
        log_fail "Help missing reset command"
    fi
    
    ((TESTS_RUN++))
    if echo "$help_output" | grep -q "teardown"; then
        log_pass "Help shows teardown command"
    else
        log_fail "Help missing teardown command"
    fi
}

# =============================================================================
# TEST: Templates
# =============================================================================

test_templates() {
    log_test "Testing spoke templates..."
    
    local templates_dir="${DIVE_ROOT}/templates/spoke"
    
    assert_dir_exists "$templates_dir" "templates/spoke directory exists"
    assert_file_exists "$templates_dir/docker-compose.template.yml" "Docker compose template exists"
    assert_file_exists "$templates_dir/config.template.json" "Config template exists"
    assert_file_exists "$templates_dir/.env.template" "Env template exists"
    assert_file_exists "$templates_dir/README.md" "Template README exists"
    
    # Verify templates contain placeholders
    ((TESTS_RUN++))
    if grep -q "{{INSTANCE_CODE_UPPER}}" "$templates_dir/docker-compose.template.yml"; then
        log_pass "Docker compose template contains placeholders"
    else
        log_fail "Docker compose template missing placeholders"
    fi
    
    ((TESTS_RUN++))
    if grep -q "{{SPOKE_ID}}" "$templates_dir/config.template.json"; then
        log_pass "Config template contains placeholders"
    else
        log_fail "Config template missing placeholders"
    fi
}

# =============================================================================
# TEST: Syntax Validation
# =============================================================================

test_syntax() {
    log_test "Testing spoke.sh syntax..."
    
    cd "$DIVE_ROOT"
    
    ((TESTS_RUN++))
    if bash -n scripts/dive-modules/spoke.sh 2>&1; then
        log_pass "spoke.sh syntax is valid"
    else
        log_fail "spoke.sh has syntax errors"
        bash -n scripts/dive-modules/spoke.sh 2>&1 | head -10
    fi
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo ""
    echo "=============================================="
    echo " DIVE V3 Spoke Deployment Integration Tests"
    echo " Phase 2: Spoke-in-a-Box Automation"
    echo "=============================================="
    echo ""
    
    if [ "$QUICK_MODE" = true ]; then
        echo -e "${YELLOW}Running in QUICK mode (shorter waits)${NC}"
        echo ""
    fi
    
    if [ "$SKIP_TEARDOWN" = true ]; then
        echo -e "${YELLOW}SKIP_TEARDOWN enabled (test instance will be preserved)${NC}"
        echo ""
    fi
    
    # Check prerequisites
    if ! command -v docker >/dev/null 2>&1; then
        log_fail "Docker not found"
        exit 1
    fi
    
    if ! command -v curl >/dev/null 2>&1; then
        log_fail "curl not found"
        exit 1
    fi
    
    # Ensure we're in the right directory
    if [ ! -f "$DIVE_ROOT/dive" ]; then
        log_fail "Cannot find DIVE CLI at $DIVE_ROOT/dive"
        exit 1
    fi
    
    # Set up trap for cleanup
    if [ "$SKIP_TEARDOWN" = false ]; then
        trap cleanup EXIT
    fi
    
    # Disable pilot mode for spoke testing
    export DIVE_PILOT_MODE=false
    
    # Run tests in order
    test_syntax
    test_templates
    test_spoke_help
    test_spoke_deploy
    
    if [ "$QUICK_MODE" = false ]; then
        test_spoke_up
        test_spoke_verify
        test_spoke_health
        test_spoke_status
        test_spoke_reset
    else
        log_skip "Skipping service tests in quick mode"
        ((TESTS_SKIPPED += 4))
    fi
    
    test_spoke_teardown
    
    # Summary
    echo ""
    echo "=============================================="
    echo " Test Results"
    echo "=============================================="
    echo ""
    echo -e "  Total:   ${TESTS_RUN}"
    echo -e "  Passed:  ${GREEN}${TESTS_PASSED}${NC}"
    echo -e "  Failed:  ${RED}${TESTS_FAILED}${NC}"
    echo -e "  Skipped: ${YELLOW}${TESTS_SKIPPED}${NC}"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed${NC}"
        exit 1
    fi
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi



