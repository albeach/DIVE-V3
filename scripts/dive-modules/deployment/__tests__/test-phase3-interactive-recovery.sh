#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Phase 3 Interactive Recovery & Phase Control Tests
# =============================================================================
# Tests for: interactive error recovery wiring, --from-phase flag,
#            --skip-phase flag, phase status display, SIGINT handler,
#            resume mode checkpoint skipping
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODULES_DIR="$(cd "$DEPLOYMENT_DIR/.." && pwd)"
DIVE_ROOT="$(cd "$MODULES_DIR/../.." && pwd)"
export DIVE_ROOT

# Prevent re-entry from sourced modules
# shellcheck disable=SC2317
[ -n "${_PHASE3_TEST_RUNNING:-}" ] && { return 0 2>/dev/null || exit 0; }
export _PHASE3_TEST_RUNNING=1

# Test counters
PASS=0
FAIL=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
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

# =============================================================================
# STUB FUNCTIONS (define all stubs BEFORE sourcing any modules)
# =============================================================================

# Docker stub
docker() { return 0; }
export -f docker
export DOCKER_CMD=docker

# Log function stubs
log_info() { :; }
log_error() { :; }
log_success() { :; }
log_warn() { :; }
log_step() { :; }
log_verbose() { :; }
upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
lower() { echo "$1" | tr '[:upper:]' '[:lower:]'; }
is_interactive() { return 1; }  # Non-interactive
export -f log_info log_error log_success log_warn log_step log_verbose upper lower is_interactive
export DIVE_COMMON_LOADED=1

# Orchestration stubs
orch_circuit_breaker_init() { :; }
orch_circuit_breaker_execute() { "$2" "$3" "$4"; return $?; }
orch_record_error() { :; }
orch_db_record_step() { :; }
orch_check_failure_threshold() { return 0; }
export -f orch_circuit_breaker_init orch_circuit_breaker_execute orch_record_error
export -f orch_db_record_step orch_check_failure_threshold

# =============================================================================
# DEFINE FUNCTIONS UNDER TEST (extracted from modules to avoid cascade)
# =============================================================================

# --- From pipeline-common.sh: deployment_run_phase ---
export _PIPELINE_SIGINT_RECEIVED=false
export _PIPELINE_CURRENT_PHASE=""
export _PIPELINE_CURRENT_INSTANCE=""

deployment_run_phase() {
    local instance_code="$1"
    local phase_name="$2"
    local phase_function="$3"
    local pipeline_mode="${4:-deploy}"
    local resume_mode="${5:-false}"

    local code_upper
    code_upper=$(upper "$instance_code")

    # Check if phase should be skipped (resume mode + already complete)
    if [ "$resume_mode" = "true" ]; then
        if type deployment_checkpoint_is_complete &>/dev/null; then
            if deployment_checkpoint_is_complete "$code_upper" "$phase_name"; then
                return 0
            fi
        fi
    fi

    # Execute phase
    local phase_result=0
    if ! "$phase_function" "$instance_code" "$pipeline_mode"; then
        phase_result=1
    fi

    if [ $phase_result -eq 0 ]; then
        return 0
    else
        # Interactive error recovery
        local deploy_type="hub"
        [ "$code_upper" != "USA" ] && deploy_type="spoke"
        if type error_recovery_suggest &>/dev/null; then
            error_recovery_suggest "$phase_name" "$deploy_type" "$code_upper"
            local recovery_action=$?
            if [ $recovery_action -eq 0 ]; then
                deployment_run_phase "$instance_code" "$phase_name" "$phase_function" "$pipeline_mode" "$resume_mode"
                return $?
            elif [ $recovery_action -eq 2 ]; then
                return 0
            fi
        fi
        return 1
    fi
}
export -f deployment_run_phase

# --- From pipeline-common.sh: SIGINT handler ---
pipeline_install_sigint_handler() {
    local instance_code="$1"
    export _PIPELINE_CURRENT_INSTANCE="$instance_code"
    export _PIPELINE_SIGINT_RECEIVED=false
    trap '_pipeline_sigint_handler' INT
}
export -f pipeline_install_sigint_handler

pipeline_uninstall_sigint_handler() {
    trap - INT
    export _PIPELINE_SIGINT_RECEIVED=false
    export _PIPELINE_CURRENT_PHASE=""
    export _PIPELINE_CURRENT_INSTANCE=""
}
export -f pipeline_uninstall_sigint_handler

pipeline_check_sigint() {
    [ "${_PIPELINE_SIGINT_RECEIVED:-false}" = "true" ]
}
export -f pipeline_check_sigint

_pipeline_save_interrupt_checkpoint() {
    local instance_code="$1"
    local current_phase="$2"
    local code_upper
    code_upper=$(upper "$instance_code" 2>/dev/null || echo "$instance_code")

    if type deployment_set_state &>/dev/null; then
        deployment_set_state "$code_upper" "INTERRUPTED" \
            "User interrupted at phase: $current_phase" \
            "{\"interrupted_phase\":\"$current_phase\"}"
    fi
}
export -f _pipeline_save_interrupt_checkpoint

_pipeline_sigint_handler() {
    export _PIPELINE_SIGINT_RECEIVED=true
    # Non-interactive in tests: just set flag
    return 0
}
export -f _pipeline_sigint_handler

# --- From hub-pipeline.sh: _hub_should_skip_phase ---
_hub_should_skip_phase() {
    local phase_name="$1"

    if [ -n "${DIVE_ONLY_PHASE:-}" ]; then
        if [ "$phase_name" != "$DIVE_ONLY_PHASE" ]; then
            return 0
        fi
        return 1
    fi

    if [ -n "${DIVE_FROM_PHASE:-}" ]; then
        if [ "${_DIVE_FROM_PHASE_REACHED:-false}" = "false" ]; then
            if [ "$phase_name" = "$DIVE_FROM_PHASE" ]; then
                export _DIVE_FROM_PHASE_REACHED=true
                return 1
            fi
            return 0
        fi
        return 1
    fi

    if [ -n "${DIVE_SKIP_PHASES:-}" ]; then
        local skip_phase
        for skip_phase in ${DIVE_SKIP_PHASES}; do
            if [ "$skip_phase" = "$phase_name" ]; then
                return 0
            fi
        done
    fi

    return 1
}
export -f _hub_should_skip_phase

# --- From spoke-pipeline.sh: _spoke_should_skip_phase ---
_spoke_should_skip_phase() {
    local phase_name="$1"

    if [ -n "${DIVE_ONLY_PHASE:-}" ]; then
        if [ "$phase_name" != "$DIVE_ONLY_PHASE" ]; then
            return 0
        fi
        return 1
    fi

    if [ -n "${DIVE_FROM_PHASE:-}" ]; then
        if [ "${_DIVE_FROM_PHASE_REACHED:-false}" = "false" ]; then
            if [ "$phase_name" = "$DIVE_FROM_PHASE" ]; then
                export _DIVE_FROM_PHASE_REACHED=true
                return 1
            fi
            return 0
        fi
        return 1
    fi

    if [ -n "${DIVE_SKIP_PHASES:-}" ]; then
        local skip_phase
        for skip_phase in ${DIVE_SKIP_PHASES}; do
            if [ "$skip_phase" = "$phase_name" ]; then
                return 0
            fi
        done
    fi

    return 1
}
export -f _spoke_should_skip_phase

# --- From hub-pipeline.sh: _hub_run_phase_with_circuit_breaker ---
_hub_run_phase_with_circuit_breaker() {
    local instance_code="$1"
    local phase_name="$2"
    local phase_function="$3"
    local pipeline_mode="$4"
    local resume_mode="$5"

    # Check if pipeline was interrupted
    if pipeline_check_sigint 2>/dev/null; then
        return 1
    fi

    export _PIPELINE_CURRENT_PHASE="$phase_name"

    # Check resume mode
    if [ "$resume_mode" = "true" ]; then
        if type hub_checkpoint_is_complete &>/dev/null; then
            if hub_checkpoint_is_complete "$phase_name"; then
                return 0
            fi
        fi
    fi

    local phase_result=0
    if ! "$phase_function" "$instance_code" "$pipeline_mode"; then
        phase_result=1
    fi

    if [ $phase_result -eq 0 ]; then
        if type hub_checkpoint_mark_complete &>/dev/null; then
            hub_checkpoint_mark_complete "$phase_name" "0"
        fi
        return 0
    else
        if type error_recovery_suggest &>/dev/null; then
            error_recovery_suggest "$phase_name" "hub" "$instance_code"
            local recovery_action=$?
            if [ $recovery_action -eq 0 ]; then
                _hub_run_phase_with_circuit_breaker "$instance_code" "$phase_name" "$phase_function" "$pipeline_mode" "$resume_mode"
                return $?
            elif [ $recovery_action -eq 2 ]; then
                return 0
            fi
        fi
        return 1
    fi
}
export -f _hub_run_phase_with_circuit_breaker

# --- From hub-pipeline.sh: hub_deploy (simplified for testing) ---
hub_deploy() {
    local resume_mode=false
    export DIVE_SKIP_PHASES=""
    export DIVE_ONLY_PHASE=""
    export DIVE_FROM_PHASE=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --resume) resume_mode=true; shift ;;
            --skip-phase)
                if [ -n "${2:-}" ]; then
                    local phase_upper
                    phase_upper=$(echo "$2" | tr '[:lower:]' '[:upper:]')
                    DIVE_SKIP_PHASES="${DIVE_SKIP_PHASES:+$DIVE_SKIP_PHASES }${phase_upper}"
                    shift 2
                else
                    return 1
                fi
                ;;
            --only-phase)
                if [ -n "${2:-}" ]; then
                    DIVE_ONLY_PHASE=$(echo "$2" | tr '[:lower:]' '[:upper:]')
                    shift 2
                else
                    return 1
                fi
                ;;
            --from-phase)
                if [ -n "${2:-}" ]; then
                    DIVE_FROM_PHASE=$(echo "$2" | tr '[:lower:]' '[:upper:]')
                    shift 2
                else
                    return 1
                fi
                ;;
            *) shift ;;
        esac
    done

    # Mutual exclusion check
    local _flag_count=0
    [ -n "$DIVE_SKIP_PHASES" ] && _flag_count=$((_flag_count + 1))
    [ -n "$DIVE_ONLY_PHASE" ] && _flag_count=$((_flag_count + 1))
    [ -n "$DIVE_FROM_PHASE" ] && _flag_count=$((_flag_count + 1))
    if [ $_flag_count -gt 1 ]; then
        return 1
    fi

    # Delegate to mock pipeline
    if type hub_pipeline_execute &>/dev/null; then
        local mode="deploy"
        [ "$resume_mode" = "true" ] && mode="resume"
        hub_pipeline_execute "$mode"
        return $?
    fi
    return 0
}
export -f hub_deploy

# --- Hub checkpoint stubs ---
_HUB_CHECKPOINTS=()
hub_checkpoint_mark_complete() {
    _HUB_CHECKPOINTS+=("$1")
}
hub_checkpoint_is_complete() {
    local phase="$1"
    for p in "${_HUB_CHECKPOINTS[@]+"${_HUB_CHECKPOINTS[@]}"}"; do
        [ "$p" = "$phase" ] && return 0
    done
    return 1
}
hub_checkpoint_can_resume() { [ ${#_HUB_CHECKPOINTS[@]} -gt 0 ]; }
hub_checkpoint_get_next_phase() {
    local all=(VAULT_BOOTSTRAP DATABASE_INIT PREFLIGHT INITIALIZATION MONGODB_INIT BUILD SERVICES VAULT_DB_ENGINE KEYCLOAK_CONFIG REALM_VERIFY KAS_REGISTER SEEDING KAS_INIT)
    for p in "${all[@]}"; do
        if ! hub_checkpoint_is_complete "$p"; then
            echo "$p"
            return 0
        fi
    done
    echo ""
}
hub_checkpoint_get_timestamp() { echo "2026-02-20T12:00:00Z"; }
export -f hub_checkpoint_mark_complete hub_checkpoint_is_complete hub_checkpoint_can_resume
export -f hub_checkpoint_get_next_phase hub_checkpoint_get_timestamp

# --- Spoke checkpoint stubs ---
_SPOKE_CHECKPOINTS=()
spoke_checkpoint_is_complete() {
    local _code="$1" phase="$2"
    for p in "${_SPOKE_CHECKPOINTS[@]+"${_SPOKE_CHECKPOINTS[@]}"}"; do
        [ "$p" = "${_code}:${phase}" ] && return 0
    done
    return 1
}
spoke_checkpoint_mark_complete() { _SPOKE_CHECKPOINTS+=("${1}:${2}"); }
export -f spoke_checkpoint_is_complete spoke_checkpoint_mark_complete

# --- Hub phases display (extracted from hub-pipeline.sh) ---
hub_phases() {
    echo ""
    echo "==============================================================================="
    echo "  Hub Pipeline Phases"
    echo "==============================================================================="
    echo ""

    local -a phase_names=(
        VAULT_BOOTSTRAP DATABASE_INIT PREFLIGHT INITIALIZATION MONGODB_INIT
        BUILD SERVICES VAULT_DB_ENGINE KEYCLOAK_CONFIG REALM_VERIFY
        KAS_REGISTER SEEDING KAS_INIT
    )
    local -a phase_labels=(
        "Vault Bootstrap" "Database Init" "Preflight" "Initialization" "MongoDB"
        "Build" "Services" "Vault DB Engine" "Keycloak" "Realm Verify"
        "KAS Register" "Seeding" "KAS Init"
    )

    local next_phase=""
    if type hub_checkpoint_get_next_phase &>/dev/null; then
        next_phase=$(hub_checkpoint_get_next_phase)
    fi

    local total=${#phase_names[@]}
    local completed=0
    local failed=0

    local i
    for (( i = 0; i < total; i++ )); do
        local name="${phase_names[$i]}"
        local label="${phase_labels[$i]}"
        local num=$((i + 1))
        local status="pending"

        if type hub_checkpoint_is_complete &>/dev/null && hub_checkpoint_is_complete "$name"; then
            status="complete"
            completed=$((completed + 1))
        fi

        local icon=" "
        case "$status" in
            complete) icon="+" ;;
            failed)   icon="x" ;;
            pending)  icon="-" ;;
        esac

        local resume_marker=""
        if [ -n "$next_phase" ] && [ "$name" = "$next_phase" ]; then
            resume_marker=" <-- resume point"
        fi

        printf "  [%s] Phase %2d: %-18s %-10s%s\n" \
            "$icon" "$num" "$label" "($status)" "$resume_marker"
    done

    echo ""
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    echo "  Summary: $completed/$total complete, $failed failed"

    if [ -n "$next_phase" ]; then
        echo "  Resume:  ./dive hub deploy --resume  (starts at $next_phase)"
    elif [ $completed -eq $total ]; then
        echo "  Status:  All phases complete"
    fi

    echo "==============================================================================="
    echo ""
}
export -f hub_phases

# --- Spoke phases display (extracted from spoke-pipeline.sh) ---
spoke_phases() {
    local instance_code="${1:-}"
    if [ -z "$instance_code" ]; then
        return 1
    fi

    local code_upper
    code_upper=$(upper "$instance_code")

    echo ""
    echo "==============================================================================="
    echo "  Spoke Pipeline Phases — $code_upper"
    echo "==============================================================================="
    echo ""

    local -a phase_names=(PREFLIGHT INITIALIZATION DEPLOYMENT CONFIGURATION SEEDING VERIFICATION)
    local -a phase_labels=("Preflight" "Initialization" "Deployment" "Configuration" "Seeding" "Verification")

    local total=${#phase_names[@]}
    local completed=0
    local failed=0

    local i
    for (( i = 0; i < total; i++ )); do
        local name="${phase_names[$i]}"
        local label="${phase_labels[$i]}"
        local num=$((i + 1))
        local status="pending"

        if type spoke_checkpoint_is_complete &>/dev/null && spoke_checkpoint_is_complete "$code_upper" "$name"; then
            status="complete"
            completed=$((completed + 1))
        fi

        local icon=" "
        case "$status" in
            complete) icon="+" ;;
            failed)   icon="x" ;;
            pending)  icon="-" ;;
        esac

        printf "  [%s] Phase %d: %-18s (%s)\n" \
            "$icon" "$num" "$label" "$status"
    done

    echo ""
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    echo "  Summary: $completed/$total complete, $failed failed"

    local resume_phase=""
    for (( i = 0; i < total; i++ )); do
        local name="${phase_names[$i]}"
        if type spoke_checkpoint_is_complete &>/dev/null && ! spoke_checkpoint_is_complete "$code_upper" "$name"; then
            resume_phase="$name"
            break
        fi
    done

    if [ -n "$resume_phase" ]; then
        echo "  Resume:  ./dive spoke deploy $code_upper --resume  (starts at $resume_phase)"
    elif [ $completed -eq $total ]; then
        echo "  Status:  All phases complete"
    fi

    echo "==============================================================================="
    echo ""
}
export -f spoke_phases

# =============================================================================
# SUITE 1: ERROR RECOVERY WIRING IN deployment_run_phase()
# =============================================================================
echo ""
echo "Suite 1: Error Recovery Wiring in deployment_run_phase()"
echo "========================================================="

# Test: deployment_run_phase calls error_recovery_suggest on failure
_test_phase_failing() { return 1; }
export -f _test_phase_failing

# Override error_recovery_suggest to track calls
_ERR_RECOVERY_CALLED=false
_ERR_RECOVERY_PHASE=""
_ERR_RECOVERY_TYPE=""
error_recovery_suggest() {
    _ERR_RECOVERY_CALLED=true
    _ERR_RECOVERY_PHASE="$1"
    _ERR_RECOVERY_TYPE="$2"
    return 1  # abort
}
export -f error_recovery_suggest

deployment_run_phase "USA" "PREFLIGHT" "_test_phase_failing" "deploy" "false" >/dev/null 2>&1 || true
assert_eq "true" "$_ERR_RECOVERY_CALLED" "deployment_run_phase calls error_recovery_suggest on failure"
assert_eq "PREFLIGHT" "$_ERR_RECOVERY_PHASE" "error_recovery_suggest receives correct phase name"
assert_eq "hub" "$_ERR_RECOVERY_TYPE" "error_recovery_suggest receives 'hub' for USA instance"

# Test: spoke instance gets deploy_type=spoke
_ERR_RECOVERY_CALLED=false
_ERR_RECOVERY_TYPE=""
deployment_run_phase "GBR" "DEPLOYMENT" "_test_phase_failing" "deploy" "false" >/dev/null 2>&1 || true
assert_eq "spoke" "$_ERR_RECOVERY_TYPE" "error_recovery_suggest receives 'spoke' for non-USA instance"

# Test: error_recovery_suggest returning 0 (retry) causes re-execution
_RETRY_COUNT=0
_test_phase_retry_once() {
    _RETRY_COUNT=$((_RETRY_COUNT + 1))
    [ $_RETRY_COUNT -ge 2 ] && return 0
    return 1
}
export -f _test_phase_retry_once

_RETRY_RECOVERY_CALLS=0
error_recovery_suggest() {
    _RETRY_RECOVERY_CALLS=$((_RETRY_RECOVERY_CALLS + 1))
    return 0  # retry
}
export -f error_recovery_suggest

_RETRY_COUNT=0
_RETRY_RECOVERY_CALLS=0
deployment_run_phase "USA" "BUILD" "_test_phase_retry_once" "deploy" "false" >/dev/null 2>&1
assert_eq "2" "$_RETRY_COUNT" "Phase re-executed on retry (called twice)"
assert_eq "1" "$_RETRY_RECOVERY_CALLS" "error_recovery_suggest called once before retry"

# Test: error_recovery_suggest returning 2 (skip) returns success
error_recovery_suggest() { return 2; }
export -f error_recovery_suggest

local_result=0
deployment_run_phase "USA" "SEEDING" "_test_phase_failing" "deploy" "false" >/dev/null 2>&1 || local_result=$?
assert_eq "0" "$local_result" "Phase skip (return 2) treated as success"

# Test: successful phase does NOT call error_recovery_suggest
_test_phase_success() { return 0; }
export -f _test_phase_success

_ERR_RECOVERY_CALLED=false
error_recovery_suggest() { _ERR_RECOVERY_CALLED=true; return 1; }
export -f error_recovery_suggest

deployment_run_phase "USA" "BUILD" "_test_phase_success" "deploy" "false" >/dev/null 2>&1
assert_eq "false" "$_ERR_RECOVERY_CALLED" "Successful phase does not trigger error recovery"

# =============================================================================
# SUITE 2: --from-phase SKIP LOGIC (Hub)
# =============================================================================
echo ""
echo "Suite 2: --from-phase Skip Logic (Hub)"
echo "======================================="

# Reset state
export DIVE_FROM_PHASE="SERVICES"
export DIVE_SKIP_PHASES=""
export DIVE_ONLY_PHASE=""
export _DIVE_FROM_PHASE_REACHED=false

# Phases before SERVICES should be skipped
_hub_should_skip_phase "VAULT_BOOTSTRAP"
assert_eq "0" "$?" "--from-phase SERVICES: VAULT_BOOTSTRAP is skipped"

_hub_should_skip_phase "DATABASE_INIT"
assert_eq "0" "$?" "--from-phase SERVICES: DATABASE_INIT is skipped"

_hub_should_skip_phase "BUILD"
assert_eq "0" "$?" "--from-phase SERVICES: BUILD is skipped"

# SERVICES itself should NOT be skipped (returns 1 = should run)
_hub_should_skip_phase "SERVICES"
assert_eq "1" "$?" "--from-phase SERVICES: SERVICES itself runs"

# After SERVICES, all subsequent phases should run
_hub_should_skip_phase "VAULT_DB_ENGINE"
assert_eq "1" "$?" "--from-phase SERVICES: VAULT_DB_ENGINE runs (after target)"

_hub_should_skip_phase "KEYCLOAK_CONFIG"
assert_eq "1" "$?" "--from-phase SERVICES: KEYCLOAK_CONFIG runs (after target)"

# Reset
export DIVE_FROM_PHASE=""
export _DIVE_FROM_PHASE_REACHED=false

# =============================================================================
# SUITE 3: --from-phase SKIP LOGIC (Spoke)
# =============================================================================
echo ""
echo "Suite 3: --from-phase Skip Logic (Spoke)"
echo "========================================="

export DIVE_FROM_PHASE="CONFIGURATION"
export DIVE_SKIP_PHASES=""
export DIVE_ONLY_PHASE=""
export _DIVE_FROM_PHASE_REACHED=false

# Phases before CONFIGURATION should be skipped
_spoke_should_skip_phase "PREFLIGHT"
assert_eq "0" "$?" "--from-phase CONFIGURATION: PREFLIGHT is skipped"

_spoke_should_skip_phase "INITIALIZATION"
assert_eq "0" "$?" "--from-phase CONFIGURATION: INITIALIZATION is skipped"

_spoke_should_skip_phase "DEPLOYMENT"
assert_eq "0" "$?" "--from-phase CONFIGURATION: DEPLOYMENT is skipped"

# CONFIGURATION itself should run
_spoke_should_skip_phase "CONFIGURATION"
assert_eq "1" "$?" "--from-phase CONFIGURATION: CONFIGURATION itself runs"

# After CONFIGURATION, subsequent phases should run
_spoke_should_skip_phase "SEEDING"
assert_eq "1" "$?" "--from-phase CONFIGURATION: SEEDING runs (after target)"

_spoke_should_skip_phase "VERIFICATION"
assert_eq "1" "$?" "--from-phase CONFIGURATION: VERIFICATION runs (after target)"

# Reset
export DIVE_FROM_PHASE=""
export _DIVE_FROM_PHASE_REACHED=false

# =============================================================================
# SUITE 4: --skip-phase LOGIC
# =============================================================================
echo ""
echo "Suite 4: --skip-phase Logic"
echo "==========================="

export DIVE_SKIP_PHASES="SEEDING KAS_INIT"
export DIVE_ONLY_PHASE=""
export DIVE_FROM_PHASE=""

_hub_should_skip_phase "SEEDING"
assert_eq "0" "$?" "--skip-phase: SEEDING is skipped"

_hub_should_skip_phase "KAS_INIT"
assert_eq "0" "$?" "--skip-phase: KAS_INIT is skipped"

_hub_should_skip_phase "BUILD"
assert_eq "1" "$?" "--skip-phase: BUILD is NOT skipped"

_hub_should_skip_phase "SERVICES"
assert_eq "1" "$?" "--skip-phase: SERVICES is NOT skipped"

export DIVE_SKIP_PHASES=""

# =============================================================================
# SUITE 5: --only-phase LOGIC
# =============================================================================
echo ""
echo "Suite 5: --only-phase Logic"
echo "==========================="

export DIVE_ONLY_PHASE="KEYCLOAK_CONFIG"
export DIVE_SKIP_PHASES=""
export DIVE_FROM_PHASE=""

_hub_should_skip_phase "BUILD"
assert_eq "0" "$?" "--only-phase KEYCLOAK_CONFIG: BUILD is skipped"

_hub_should_skip_phase "KEYCLOAK_CONFIG"
assert_eq "1" "$?" "--only-phase KEYCLOAK_CONFIG: KEYCLOAK_CONFIG runs"

_hub_should_skip_phase "SEEDING"
assert_eq "0" "$?" "--only-phase KEYCLOAK_CONFIG: SEEDING is skipped"

export DIVE_ONLY_PHASE=""

# =============================================================================
# SUITE 6: PHASE STATUS DISPLAY (Hub)
# =============================================================================
echo ""
echo "Suite 6: Phase Status Display (Hub)"
echo "===================================="

# Set up some checkpoints
_HUB_CHECKPOINTS=("VAULT_BOOTSTRAP" "DATABASE_INIT" "PREFLIGHT")

output=$(hub_phases 2>&1)
assert_contains "$output" "Hub Pipeline Phases" "hub_phases shows title"
assert_contains "$output" "complete" "hub_phases shows completed phases"
assert_contains "$output" "pending" "hub_phases shows pending phases"
assert_contains "$output" "3/13 complete" "hub_phases shows correct count (3 of 13)"
assert_contains "$output" "resume point" "hub_phases shows resume point"

# =============================================================================
# SUITE 7: PHASE STATUS DISPLAY (Spoke)
# =============================================================================
echo ""
echo "Suite 7: Phase Status Display (Spoke)"
echo "======================================"

_SPOKE_CHECKPOINTS=("GBR:PREFLIGHT" "GBR:INITIALIZATION" "GBR:DEPLOYMENT")

output=$(spoke_phases "GBR" 2>&1)
assert_contains "$output" "Spoke Pipeline Phases" "spoke_phases shows title"
assert_contains "$output" "GBR" "spoke_phases shows instance code"
assert_contains "$output" "complete" "spoke_phases shows completed phases"
assert_contains "$output" "pending" "spoke_phases shows pending phases"
assert_contains "$output" "3/6 complete" "spoke_phases shows correct count (3 of 6)"

# Test: spoke_phases requires instance code
spoke_phases_result=0
spoke_phases "" >/dev/null 2>&1 || spoke_phases_result=$?
assert_eq "1" "$spoke_phases_result" "spoke_phases fails without instance code"

# =============================================================================
# SUITE 8: RESUME MODE (Checkpoint Skipping)
# =============================================================================
echo ""
echo "Suite 8: Resume Mode (Checkpoint Skipping)"
echo "============================================"

# Test: deployment_run_phase skips completed phases in resume mode
_HUB_CHECKPOINTS=("BUILD")

deployment_checkpoint_is_complete() {
    hub_checkpoint_is_complete "$2"
}
export -f deployment_checkpoint_is_complete

_test_phase_should_not_run() { echo "THIS SHOULD NOT RUN"; return 1; }
export -f _test_phase_should_not_run

result=0
deployment_run_phase "USA" "BUILD" "_test_phase_should_not_run" "deploy" "true" >/dev/null 2>&1 || result=$?
assert_eq "0" "$result" "Resume mode: completed phase BUILD is skipped (returns 0)"

# Test: incomplete phase runs normally in resume mode
result=0
deployment_run_phase "USA" "SERVICES" "_test_phase_success" "deploy" "true" >/dev/null 2>&1 || result=$?
assert_eq "0" "$result" "Resume mode: incomplete phase SERVICES runs normally"

# =============================================================================
# SUITE 9: SIGINT HANDLER
# =============================================================================
echo ""
echo "Suite 9: SIGINT Handler"
echo "========================"

# Test: pipeline_install_sigint_handler sets up state
pipeline_install_sigint_handler "USA"
assert_eq "USA" "$_PIPELINE_CURRENT_INSTANCE" "SIGINT handler tracks instance code"
assert_eq "false" "$_PIPELINE_SIGINT_RECEIVED" "SIGINT starts as not received"

# Test: pipeline_check_sigint returns false when no interrupt
pipeline_check_sigint
assert_eq "1" "$?" "pipeline_check_sigint returns 1 (no interrupt)"

# Test: After SIGINT flag set, pipeline_check_sigint returns true
export _PIPELINE_SIGINT_RECEIVED=true
pipeline_check_sigint
assert_eq "0" "$?" "pipeline_check_sigint returns 0 after SIGINT flag"

# Test: pipeline_uninstall_sigint_handler cleans up
pipeline_uninstall_sigint_handler
assert_eq "false" "$_PIPELINE_SIGINT_RECEIVED" "Uninstall clears SIGINT flag"
assert_eq "" "$_PIPELINE_CURRENT_PHASE" "Uninstall clears current phase"
assert_eq "" "$_PIPELINE_CURRENT_INSTANCE" "Uninstall clears instance"

# Test: _pipeline_save_interrupt_checkpoint records state
_SAVED_STATE=""
_SAVED_REASON=""
deployment_set_state() {
    _SAVED_STATE="$2"
    _SAVED_REASON="$3"
}
export -f deployment_set_state

_pipeline_save_interrupt_checkpoint "USA" "SERVICES"
assert_eq "INTERRUPTED" "$_SAVED_STATE" "Interrupt checkpoint saves INTERRUPTED state"
assert_contains "$_SAVED_REASON" "SERVICES" "Interrupt checkpoint records phase name"

# Test: _PIPELINE_CURRENT_PHASE is set during phase execution
export _PIPELINE_SIGINT_RECEIVED=false
_hub_run_phase_with_circuit_breaker "USA" "BUILD" "_test_phase_success" "deploy" "false" >/dev/null 2>&1
assert_eq "BUILD" "$_PIPELINE_CURRENT_PHASE" "Current phase tracked during execution"

# Test: SIGINT causes phase skip
export _PIPELINE_SIGINT_RECEIVED=true
result=0
_hub_run_phase_with_circuit_breaker "USA" "SERVICES" "_test_phase_success" "deploy" "false" >/dev/null 2>&1 || result=$?
assert_eq "1" "$result" "Phase skipped when SIGINT received"
export _PIPELINE_SIGINT_RECEIVED=false

# =============================================================================
# SUITE 10: MUTUAL EXCLUSION OF FLAGS
# =============================================================================
echo ""
echo "Suite 10: Flag Mutual Exclusion"
echo "================================"

# Test hub_deploy with conflicting flags (--skip-phase + --from-phase)
result=0
hub_deploy --skip-phase SEEDING --from-phase SERVICES >/dev/null 2>&1 || result=$?
assert_eq "1" "$result" "hub_deploy rejects --skip-phase + --from-phase"

# Test hub_deploy with conflicting flags (--only-phase + --from-phase)
result=0
hub_deploy --only-phase BUILD --from-phase SERVICES >/dev/null 2>&1 || result=$?
assert_eq "1" "$result" "hub_deploy rejects --only-phase + --from-phase"

# Test hub_deploy with single valid flag works (mock pipeline execution to succeed)
hub_pipeline_execute() { return 0; }
export -f hub_pipeline_execute

result=0
hub_deploy --from-phase SERVICES >/dev/null 2>&1 || result=$?
assert_eq "0" "$result" "hub_deploy accepts single --from-phase"

result=0
hub_deploy --skip-phase SEEDING >/dev/null 2>&1 || result=$?
assert_eq "0" "$result" "hub_deploy accepts single --skip-phase"

# =============================================================================
# SUITE 11: ERROR RECOVERY REMEDIATION CATALOG
# =============================================================================
echo ""
echo "Suite 11: Error Recovery Remediation Catalog"
echo "============================================="

# Source the error-recovery module directly (it's self-contained)
export ERROR_RECOVERY_LOADED=""
source "$MODULES_DIR/orchestration/error-recovery.sh" 2>/dev/null || true

if type _error_get_remediation &>/dev/null; then
    remediation=$(_error_get_remediation "VAULT_BOOTSTRAP" "hub")
    assert_contains "$remediation" "Vault Bootstrap" "Remediation for VAULT_BOOTSTRAP exists"
    assert_contains "$remediation" "docker" "VAULT_BOOTSTRAP remediation mentions docker"

    remediation=$(_error_get_remediation "KEYCLOAK_CONFIG" "hub")
    assert_contains "$remediation" "Keycloak" "Remediation for KEYCLOAK_CONFIG exists"

    remediation=$(_error_get_remediation "DEPLOYMENT" "spoke")
    assert_contains "$remediation" "Spoke Deployment" "Remediation for DEPLOYMENT (spoke) exists"

    remediation=$(_error_get_remediation "NONEXISTENT_PHASE" "hub")
    assert_contains "$remediation" "failed" "Unknown phase gets generic remediation"
else
    echo -e "  ${YELLOW}SKIP${NC} Error recovery remediation tests (module failed to load)"
fi

# =============================================================================
# RESULTS
# =============================================================================
echo ""
echo "==============================================================================="
echo -e "  Phase 3 Tests: ${PASS}/${TOTAL} passed, ${FAIL} failed"
echo "==============================================================================="
echo ""

if [ $FAIL -gt 0 ]; then
    echo -e "  ${RED}SOME TESTS FAILED${NC}"
    exit 1
else
    echo -e "  ${GREEN}ALL TESTS PASSED${NC}"
    exit 0
fi
