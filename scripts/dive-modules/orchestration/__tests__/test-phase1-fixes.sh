#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Phase 1 Critical Fix Tests
# =============================================================================
# Tests for: SQL injection prevention, state machine validation,
#            nuke safety, flag exports, function name fixes
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULES_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIVE_ROOT="$(cd "$MODULES_DIR/../.." && pwd)"
export DIVE_ROOT

# Prevent re-entry from sourced modules
# shellcheck disable=SC2317
[ -n "${_PHASE1_TEST_RUNNING:-}" ] && { return 0 2>/dev/null || exit 0; }
export _PHASE1_TEST_RUNNING=1

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

# Helper: count grep matches safely (grep -c exits 1 on 0 matches)
count_matches() {
    local pattern="$1" file="$2"
    local result
    result=$(grep -c "$pattern" "$file" 2>/dev/null) || true
    echo "${result:-0}"
}

# =============================================================================
# SETUP
# =============================================================================

# Stub Docker (not available in test env)
docker() { echo "stub"; return 0; }
export -f docker

# Do NOT source common.sh at top level — it triggers auto-loading that causes re-entry.
# Individual tests source common.sh inside isolated bash -c subshells.
export DIVE_COMMON_LOADED=1
export ORCH_DB_ENABLED=false
export DEPLOYMENT_MODE=remote
export ENVIRONMENT=local

echo ""
echo "========================================"
echo " Phase 1: Critical Fix Tests"
echo "========================================"
echo ""

# =============================================================================
# TEST 1: State input validation (SQL injection prevention)
# =============================================================================
echo -e "${YELLOW}Test Suite 1: SQL Injection Prevention${NC}"

# Test: Valid instance code accepted
assert_success "Valid instance code 'gbr' accepted" \
    bash -c "source '$MODULES_DIR/common.sh' 2>/dev/null; export DIVE_COMMON_LOADED=1; export ORCH_DB_ENABLED=false; export DEPLOYMENT_MODE=remote; export DIVE_ROOT='$DIVE_ROOT'; source '$MODULES_DIR/orchestration/state.sh' 2>/dev/null; orch_db_set_state 'gbr' 'FAILED' 'test' 2>/dev/null"

# Test: SQL injection via instance code rejected
assert_fail "SQL injection via instance code rejected" \
    bash -c "source '$MODULES_DIR/common.sh' 2>/dev/null; export DIVE_COMMON_LOADED=1; export ORCH_DB_ENABLED=false; export DEPLOYMENT_MODE=remote; export DIVE_ROOT='$DIVE_ROOT'; source '$MODULES_DIR/orchestration/state.sh' 2>/dev/null; orch_db_set_state \"x'; DROP TABLE--\" 'FAILED' 2>&1"

# Test: Numeric instance code rejected
assert_fail "Numeric instance code '123' rejected" \
    bash -c "source '$MODULES_DIR/common.sh' 2>/dev/null; export DIVE_COMMON_LOADED=1; export ORCH_DB_ENABLED=false; export DEPLOYMENT_MODE=remote; export DIVE_ROOT='$DIVE_ROOT'; source '$MODULES_DIR/orchestration/state.sh' 2>/dev/null; orch_db_set_state '123' 'FAILED' 2>&1"

# Test: Empty instance code rejected
assert_fail "Empty instance code rejected" \
    bash -c "source '$MODULES_DIR/common.sh' 2>/dev/null; export DIVE_COMMON_LOADED=1; export ORCH_DB_ENABLED=false; export DEPLOYMENT_MODE=remote; export DIVE_ROOT='$DIVE_ROOT'; source '$MODULES_DIR/orchestration/state.sh' 2>/dev/null; orch_db_set_state '' 'FAILED' 2>&1"

# Test: Invalid state rejected
assert_fail "Invalid state 'HACKED' rejected" \
    bash -c "source '$MODULES_DIR/common.sh' 2>/dev/null; export DIVE_COMMON_LOADED=1; export ORCH_DB_ENABLED=false; export DEPLOYMENT_MODE=remote; export DIVE_ROOT='$DIVE_ROOT'; source '$MODULES_DIR/orchestration/state.sh' 2>/dev/null; orch_db_set_state 'gbr' 'HACKED' 2>&1"

echo ""

# =============================================================================
# TEST 2: State machine validation in remote mode
# =============================================================================
echo -e "${YELLOW}Test Suite 2: State Machine Validation (Remote Mode)${NC}"

TEST_STATE_DIR=$(mktemp -d)
trap 'rm -rf '"$TEST_STATE_DIR" EXIT

# Test: Valid transition accepted (tail -1 filters log_error stdout noise)
RESULT=$(bash -c "
    export DIVE_ROOT='$TEST_STATE_DIR' ORCH_DB_ENABLED=false DEPLOYMENT_MODE=remote
    source '$MODULES_DIR/common.sh' 2>/dev/null
    export DIVE_COMMON_LOADED=1
    source '$MODULES_DIR/orchestration/state.sh' 2>/dev/null
    mkdir -p '$TEST_STATE_DIR/.dive-state'
    orch_db_set_state 'gbr' 'INITIALIZING' 'test' >/dev/null 2>&1
    if orch_db_set_state 'gbr' 'DEPLOYING' 'test' >/dev/null 2>&1; then
        echo 'VALID_OK'
    else
        echo 'VALID_FAIL'
    fi
" 2>/dev/null | tail -1)
assert_eq "VALID_OK" "$RESULT" "Valid transition INITIALIZING->DEPLOYING accepted in remote mode"

# Test: Invalid transition blocked (tail -1 filters log_error stdout noise)
RESULT=$(bash -c "
    export DIVE_ROOT='$TEST_STATE_DIR' ORCH_DB_ENABLED=false DEPLOYMENT_MODE=remote
    source '$MODULES_DIR/common.sh' 2>/dev/null
    export DIVE_COMMON_LOADED=1
    source '$MODULES_DIR/orchestration/state.sh' 2>/dev/null
    mkdir -p '$TEST_STATE_DIR/.dive-state'
    echo 'COMPLETE|2026-02-20T00:00:00Z|' > '$TEST_STATE_DIR/.dive-state/fra.state'
    if orch_db_set_state 'fra' 'DEPLOYING' 'test' >/dev/null 2>&1; then
        echo 'BLOCKED_FAIL'
    else
        echo 'BLOCKED_OK'
    fi
" 2>/dev/null | tail -1)
assert_eq "BLOCKED_OK" "$RESULT" "Invalid transition COMPLETE->DEPLOYING blocked in remote mode"

echo ""

# =============================================================================
# TEST 3: set_deployment_state_enhanced removed from framework.sh
# =============================================================================
echo -e "${YELLOW}Test Suite 3: Function Name Fixes (framework.sh)${NC}"

STALE_REFS=$(count_matches "set_deployment_state_enhanced" "$MODULES_DIR/orchestration/framework.sh")
assert_eq "0" "$STALE_REFS" "No set_deployment_state_enhanced calls in framework.sh"

DB_REFS=$(count_matches "orch_db_set_state" "$MODULES_DIR/orchestration/framework.sh")
TOTAL=$((TOTAL + 1))
if [ "$DB_REFS" -ge 3 ]; then
    echo -e "  ${GREEN}PASS${NC} framework.sh uses orch_db_set_state ($DB_REFS references)"
    PASS=$((PASS + 1))
else
    echo -e "  ${RED}FAIL${NC} framework.sh should have 3+ orch_db_set_state refs (got $DB_REFS)"
    FAIL=$((FAIL + 1))
fi

echo ""

# =============================================================================
# TEST 4: Debug statements removed from dependency.sh
# =============================================================================
echo -e "${YELLOW}Test Suite 4: Debug Statement Cleanup${NC}"

DEBUG_ECHO=$(count_matches 'echo "DEBUG:' "$MODULES_DIR/orchestration/dependency.sh")
assert_eq "0" "$DEBUG_ECHO" "No 'echo DEBUG:' statements in dependency.sh"

DEBUG_VERBOSE=$(count_matches 'log_verbose "DEBUG:' "$MODULES_DIR/orchestration/dependency.sh")
assert_eq "0" "$DEBUG_VERBOSE" "No 'log_verbose DEBUG:' statements in dependency.sh"

echo ""

# =============================================================================
# TEST 5: Trap handler race fix
# =============================================================================
echo -e "${YELLOW}Test Suite 5: Trap Handler Race Fix${NC}"

TRAP_LINE=$(grep -n "trap - EXIT ERR INT TERM" "$MODULES_DIR/orchestration/framework.sh" | head -1 | cut -d: -f1)
RELEASE_LINE=$(grep -n "orch_release_deployment_lock" "$MODULES_DIR/orchestration/framework.sh" | grep -v "trap\|#\|export\|acquire\|GAP" | head -1 | cut -d: -f1)
TOTAL=$((TOTAL + 1))
if [ -n "$TRAP_LINE" ] && [ -n "$RELEASE_LINE" ] && [ "$TRAP_LINE" -lt "$RELEASE_LINE" ]; then
    echo -e "  ${GREEN}PASS${NC} Trap cleared (line $TRAP_LINE) before lock release (line $RELEASE_LINE)"
    PASS=$((PASS + 1))
else
    echo -e "  ${RED}FAIL${NC} Trap should be cleared before lock release (trap=$TRAP_LINE, release=$RELEASE_LINE)"
    FAIL=$((FAIL + 1))
fi

echo ""

# =============================================================================
# TEST 6: Nuke safety (requires --confirm in non-interactive)
# =============================================================================
echo -e "${YELLOW}Test Suite 6: Nuke Safety${NC}"

NUKE_AUTO=$(grep -A5 "! is_interactive" "$MODULES_DIR/deploy-nuke.sh" | head -6)
assert_contains "$NUKE_AUTO" "return 1" "Non-interactive nuke returns failure without --confirm"
assert_not_contains "$NUKE_AUTO" "auto-confirming" "No auto-confirm in non-interactive mode"

echo ""

# =============================================================================
# TEST 7: Flag exports in dive entry point
# =============================================================================
echo -e "${YELLOW}Test Suite 7: Flag Exports${NC}"

DRY_RUN_EXPORT=$(count_matches "export DRY_RUN=true" "$DIVE_ROOT/dive")
assert_eq "1" "$DRY_RUN_EXPORT" "DRY_RUN is exported in dive entry point"

VERBOSE_EXPORT=$(count_matches "export VERBOSE=true" "$DIVE_ROOT/dive")
assert_eq "1" "$VERBOSE_EXPORT" "VERBOSE is exported in dive entry point"

QUIET_EXPORT=$(count_matches "export QUIET=true" "$DIVE_ROOT/dive")
assert_eq "1" "$QUIET_EXPORT" "QUIET is exported in dive entry point"

echo ""

# =============================================================================
# TEST 8: exit 1 removed from deploy.sh functions
# =============================================================================
echo -e "${YELLOW}Test Suite 8: exit->return Fix in deploy.sh${NC}"

EXIT_IN_FUNCS=$(count_matches "exit 1" "$MODULES_DIR/deploy.sh")
assert_eq "0" "$EXIT_IN_FUNCS" "No 'exit 1' in deploy.sh function bodies"

echo ""

# =============================================================================
# TEST 9: File-based lock cleanup in remote mode
# =============================================================================
echo -e "${YELLOW}Test Suite 9: File Lock Cleanup${NC}"

FILE_LOCK_CLEANUP=$(grep -A5 'lock_type.*=.*"file"' "$MODULES_DIR/orchestration/dependency.sh" | count_matches "rm -f" /dev/stdin)
TOTAL=$((TOTAL + 1))
if [ "$FILE_LOCK_CLEANUP" -ge 1 ]; then
    echo -e "  ${GREEN}PASS${NC} File-based lock cleanup implemented in release function"
    PASS=$((PASS + 1))
else
    echo -e "  ${RED}FAIL${NC} File-based lock cleanup missing in release function"
    FAIL=$((FAIL + 1))
fi

echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo "========================================"
echo -e " Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${TOTAL} total"
echo "========================================"

[ "$FAIL" -eq 0 ]
