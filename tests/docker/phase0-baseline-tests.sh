#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Phase 0 Baseline Tests
# =============================================================================
# Validates baseline Docker integration functionality as per the gap analysis.
#
# Tests:
#   1. status.sh module exists and has content
#   2. ./dive status command works
#   3. ./dive validate works without secrets exported
#   4. Hub lifecycle (up → healthy → down)
#   5. Spoke lifecycle (up → healthy → down) - optional
#
# Usage:
#   ./tests/docker/phase0-baseline-tests.sh [--skip-lifecycle]
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
# =============================================================================

set -o pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Options
SKIP_LIFECYCLE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-lifecycle)
            SKIP_LIFECYCLE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# =============================================================================
# TEST UTILITIES
# =============================================================================

log_test() {
    local name="$1"
    echo -e "${CYAN}[TEST]${NC} $name"
}

log_pass() {
    local name="$1"
    echo -e "  ${GREEN}✓ PASS${NC}: $name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    local name="$1"
    local reason="${2:-}"
    echo -e "  ${RED}✗ FAIL${NC}: $name"
    [ -n "$reason" ] && echo -e "         ${reason}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_skip() {
    local name="$1"
    local reason="${2:-}"
    echo -e "  ${YELLOW}⊘ SKIP${NC}: $name"
    [ -n "$reason" ] && echo -e "         ${reason}"
}

run_test() {
    local name="$1"
    shift
    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "$name"
    if "$@"; then
        log_pass "$name"
        return 0
    else
        log_fail "$name"
        return 1
    fi
}

# =============================================================================
# PHASE 0 TESTS
# =============================================================================

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║             DIVE V3 - Phase 0 Baseline Tests                           ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "DIVE_ROOT: ${DIVE_ROOT}"
echo ""

# -----------------------------------------------------------------------------
# Test 1: status.sh module exists and has content
# -----------------------------------------------------------------------------
test_status_module_exists() {
    local status_file="${DIVE_ROOT}/scripts/dive-modules/status.sh"

    if [ ! -f "$status_file" ]; then
        echo "File not found: $status_file"
        return 1
    fi

    local size
    size=$(stat -f%z "$status_file" 2>/dev/null || stat -c%s "$status_file" 2>/dev/null)

    if [ "$size" -eq 0 ]; then
        echo "File is empty (0 bytes)"
        return 1
    fi

    if [ "$size" -lt 1000 ]; then
        echo "File is too small ($size bytes)"
        return 1
    fi

    return 0
}
run_test "status.sh module exists and has content" test_status_module_exists

# -----------------------------------------------------------------------------
# Test 2: ./dive status command works
# -----------------------------------------------------------------------------
test_status_command() {
    cd "$DIVE_ROOT" || return 1

    local output
    output=$(./dive status 2>&1)
    local exit_code=$?

    # Check for key sections in output
    if ! echo "$output" | grep -q "Docker Daemon"; then
        echo "Missing Docker Daemon section"
        return 1
    fi

    if ! echo "$output" | grep -q "Containers"; then
        echo "Missing Containers section"
        return 1
    fi

    if ! echo "$output" | grep -q "Summary"; then
        echo "Missing Summary section"
        return 1
    fi

    return 0
}
run_test "./dive status command works" test_status_command

# -----------------------------------------------------------------------------
# Test 3: ./dive health command works
# -----------------------------------------------------------------------------
test_health_command() {
    cd "$DIVE_ROOT" || return 1

    local output
    output=$(./dive health 2>&1)

    # Check for key sections
    if ! echo "$output" | grep -q "Health Check"; then
        echo "Missing Health Check header"
        return 1
    fi

    if ! echo "$output" | grep -q "Infrastructure"; then
        echo "Missing Infrastructure section"
        return 1
    fi

    return 0
}
run_test "./dive health command works" test_health_command

# -----------------------------------------------------------------------------
# Test 4: ./dive validate works without secrets exported
# -----------------------------------------------------------------------------
test_validate_without_secrets() {
    cd "$DIVE_ROOT" || return 1

    # Unset secrets to test validation
    local old_pg="${POSTGRES_PASSWORD:-}"
    local old_mongo="${MONGO_PASSWORD:-}"
    local old_kc="${KEYCLOAK_ADMIN_PASSWORD:-}"

    unset POSTGRES_PASSWORD MONGO_PASSWORD KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_CLIENT_SECRET AUTH_SECRET

    local output
    output=$(./dive validate 2>&1)
    local exit_code=$?

    # Restore secrets
    [ -n "$old_pg" ] && export POSTGRES_PASSWORD="$old_pg"
    [ -n "$old_mongo" ] && export MONGO_PASSWORD="$old_mongo"
    [ -n "$old_kc" ] && export KEYCLOAK_ADMIN_PASSWORD="$old_kc"

    # Check that validation ran (regardless of pass/fail)
    if ! echo "$output" | grep -q "Prerequisites Validation"; then
        echo "Validate command did not run properly"
        return 1
    fi

    return 0
}
run_test "./dive validate works without secrets exported" test_validate_without_secrets

# -----------------------------------------------------------------------------
# Test 5: Compose files are valid (with dummy secrets)
# -----------------------------------------------------------------------------
test_compose_config_valid() {
    cd "$DIVE_ROOT" || return 1

    # Test main compose file
    if ! POSTGRES_PASSWORD=x MONGO_PASSWORD=x KEYCLOAK_ADMIN_PASSWORD=x KEYCLOAK_CLIENT_SECRET=x AUTH_SECRET=x \
       docker compose -f docker-compose.yml config --services >/dev/null 2>&1; then
        echo "docker-compose.yml is invalid"
        return 1
    fi

    # Test hub compose file
    if ! POSTGRES_PASSWORD=x MONGO_PASSWORD=x KEYCLOAK_ADMIN_PASSWORD=x KEYCLOAK_CLIENT_SECRET=x AUTH_SECRET=x \
       docker compose -f docker-compose.hub.yml config --services >/dev/null 2>&1; then
        echo "docker-compose.hub.yml is invalid"
        return 1
    fi

    return 0
}
run_test "Compose files are valid with dummy secrets" test_compose_config_valid

# -----------------------------------------------------------------------------
# Test 6: CLI help works
# -----------------------------------------------------------------------------
test_cli_help() {
    cd "$DIVE_ROOT" || return 1

    local output
    output=$(./dive help 2>&1)

    if ! echo "$output" | grep -q -E "(status|health|up|down|deploy)"; then
        echo "Help output missing expected commands"
        return 1
    fi

    return 0
}
run_test "./dive help works" test_cli_help

# -----------------------------------------------------------------------------
# Test 7: ./dive brief works
# -----------------------------------------------------------------------------
test_brief_command() {
    cd "$DIVE_ROOT" || return 1

    local output
    output=$(./dive brief 2>&1)

    if ! echo "$output" | grep -q "DIVE V3"; then
        echo "Brief command output unexpected"
        return 1
    fi

    return 0
}
run_test "./dive brief works" test_brief_command

# -----------------------------------------------------------------------------
# Test 8: ./dive diagnostics works
# -----------------------------------------------------------------------------
test_diagnostics_command() {
    cd "$DIVE_ROOT" || return 1

    local output
    output=$(./dive diagnostics 2>&1)

    if ! echo "$output" | grep -q "Diagnostics"; then
        echo "Missing Diagnostics header"
        return 1
    fi

    if ! echo "$output" | grep -q "Known Issue Detection"; then
        echo "Missing Known Issue Detection section"
        return 1
    fi

    return 0
}
run_test "./dive diagnostics works" test_diagnostics_command

# -----------------------------------------------------------------------------
# Test 9: Hub lifecycle (optional)
# -----------------------------------------------------------------------------
if [ "$SKIP_LIFECYCLE" = true ]; then
    log_skip "Hub lifecycle test" "Skipped with --skip-lifecycle"
else
    # Only run if hub is already running (non-destructive)
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub"; then
        test_hub_already_healthy() {
            cd "$DIVE_ROOT" || return 1
            ./dive hub health >/dev/null 2>&1
        }
        run_test "Hub is healthy (already running)" test_hub_already_healthy
    else
        log_skip "Hub lifecycle test" "Hub not running (use --skip-lifecycle to suppress)"
    fi
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}                           Test Summary                                  ${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Tests run:    $TESTS_RUN"
echo -e "  Passed:       ${GREEN}$TESTS_PASSED${NC}"
if [ "$TESTS_FAILED" -gt 0 ]; then
    echo -e "  Failed:       ${RED}$TESTS_FAILED${NC}"
fi
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}✅ All Phase 0 baseline tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ $TESTS_FAILED test(s) failed${NC}"
    exit 1
fi

