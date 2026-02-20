#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Shared Tier Module - Unit Test Suite
# =============================================================================
# Tests for scripts/dive-modules/shared/module.sh
# Run with: bash tests/unit/shared-tier.test.sh
# =============================================================================

set -euo pipefail

export DIVE_ROOT="${DIVE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export DIVE_TEST_MODE=true

# Test counters
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

# =============================================================================
# TEST FRAMEWORK
# =============================================================================

# Helper: capture CLI output and check for pattern (avoids SIGPIPE under pipefail)
cli_grep() {
    local pattern="$1"; shift
    local output
    output=$("${DIVE_ROOT}/dive" "$@" 2>/dev/null) || true
    echo "$output" | grep -q "$pattern"
}

run_test() {
    local name="$1"
    local command="$2"

    TEST_COUNT=$((TEST_COUNT + 1))

    if (eval "$command") 2>/dev/null; then
        PASS_COUNT=$((PASS_COUNT + 1))
        echo "ok $TEST_COUNT - $name"
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
        echo "not ok $TEST_COUNT - $name"
    fi
}

# =============================================================================
# 1. MODULE LOADING
# =============================================================================

echo "# --- Module Loading ---"

run_test "shared module file exists" \
    '[ -f "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh" ]'

run_test "shared module is executable-safe (bash source)" \
    'bash -n "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh"'

# =============================================================================
# 2. DISPATCH WIRING
# =============================================================================

echo "# --- Dispatch Wiring ---"

run_test "dive script has shared dispatch case" \
    'grep -q "shared)" "${DIVE_ROOT}/dive"'

run_test "shared dispatch sources module.sh" \
    'grep -A2 "shared)" "${DIVE_ROOT}/dive" | grep -q "shared/module.sh"'

run_test "shared dispatch calls module_shared" \
    'grep -A3 "shared)" "${DIVE_ROOT}/dive" | grep -q "module_shared"'

# =============================================================================
# 3. HELP TEXT
# =============================================================================

echo "# --- Help Text ---"

run_test "./dive shared --help shows usage" \
    'cli_grep "Usage: ./dive shared" shared --help'

run_test "help shows up command" \
    'cli_grep "up, start" shared help'

run_test "help shows down command" \
    'cli_grep "down, stop" shared help'

run_test "help shows status command" \
    'cli_grep "status" shared help'

run_test "help shows health command" \
    'cli_grep "health, verify" shared help'

run_test "help shows logs command" \
    'cli_grep "logs" shared help'

run_test "help shows examples" \
    'cli_grep "Examples:" shared help'

# =============================================================================
# 4. COMMAND ALIASES
# =============================================================================

echo "# --- Command Aliases ---"

run_test "start is alias for up" \
    'grep -A1 "up|start)" "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh" | grep -q "shared_up"'

run_test "stop is alias for down" \
    'grep -A1 "down|stop)" "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh" | grep -q "shared_down"'

run_test "verify is alias for health" \
    'grep -A1 "health|verify)" "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh" | grep -q "shared_health"'

# =============================================================================
# 5. MODULE STRUCTURE
# =============================================================================

echo "# --- Module Structure ---"

run_test "module has load guard" \
    'grep -q "DIVE_SHARED_MODULE_LOADED" "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh"'

run_test "module sources common.sh" \
    'grep -q "common.sh" "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh"'

run_test "module exports all functions" \
    'grep -c "export -f" "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh" | grep -q "6"'

run_test "SHARED_COMPOSE_DIR points to docker/instances/shared" \
    'grep -q "docker/instances/shared" "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh"'

# =============================================================================
# 6. HEALTH CHECK FORMAT
# =============================================================================

echo "# --- Health Check Format ---"

run_test "health uses conditional docker inspect format" \
    'grep -q "if .State.Health" "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh"'

run_test "health trims whitespace" \
    'grep -q "tr -d" "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh"'

run_test "health has fallback for empty health" \
    'grep -q "health=..{health:-no-healthcheck}" "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh"'

# =============================================================================
# 7. STATUS COMMAND (live — requires Docker)
# =============================================================================

echo "# --- Status (live) ---"

run_test "./dive shared status runs without error" \
    '"${DIVE_ROOT}/dive" shared status >/dev/null 2>&1'

run_test "status shows header" \
    'cli_grep "Shared Tier Status" shared status'

# =============================================================================
# 8. HEALTH COMMAND (live — requires Docker)
# =============================================================================

echo "# --- Health (live) ---"

run_test "health shows header" \
    'cli_grep "Shared Tier Health" shared health'

run_test "health shows summary line" \
    'cli_grep "Summary:" shared health'

run_test "health output has no newline in status" \
    'output=$("${DIVE_ROOT}/dive" shared health 2>/dev/null) || true; ! echo "$output" | grep -P "running\s*$" > /dev/null'

run_test "health shows OK for running containers" \
    'cli_grep "\[OK\]" shared health'

run_test "health output has no WARN for running containers" \
    'output=$("${DIVE_ROOT}/dive" shared health 2>/dev/null) || true; ! echo "$output" | grep -q "\[WARN\]"'

# =============================================================================
# 9. ERROR HANDLING
# =============================================================================

echo "# --- Error Handling ---"

run_test "shared_up checks for compose file" \
    'grep -q "Shared compose file not found" "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh"'

run_test "shared_up suggests ./dive hub deploy" \
    'grep -q "Try: ./dive hub deploy first" "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh"'

run_test "health shows hint when no containers" \
    'grep -q "Start with: ./dive shared up" "${DIVE_ROOT}/scripts/dive-modules/shared/module.sh"'

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo "1..$TEST_COUNT"
echo "# Tests: $TEST_COUNT, Passed: $PASS_COUNT, Failed: $FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo "# FAIL"
    exit 1
else
    echo "# ALL TESTS PASSED"
    exit 0
fi
