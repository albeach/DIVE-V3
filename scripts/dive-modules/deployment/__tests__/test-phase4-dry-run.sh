#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Phase 4 Dry-Run Mode Tests
# =============================================================================
# Tests for: --dry-run flag parsing, dry-run phase simulation, validation
#            phase execution, dry-run summary, state DB not modified,
#            Docker not touched, interaction with --from-phase/--skip-phase
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODULES_DIR="$(cd "$DEPLOYMENT_DIR/.." && pwd)"
DIVE_ROOT="$(cd "$MODULES_DIR/../.." && pwd)"
export DIVE_ROOT

# Prevent re-entry from sourced modules
# shellcheck disable=SC2317
[ -n "${_PHASE4_TEST_RUNNING:-}" ] && { return 0 2>/dev/null || exit 0; }
export _PHASE4_TEST_RUNNING=1

# Test counters
PASS=0
FAIL=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
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
# STUB FUNCTIONS
# =============================================================================

# Docker stub — tracks calls to verify dry-run doesn't touch Docker
_DOCKER_CALLS=0
docker() { _DOCKER_CALLS=$((_DOCKER_CALLS + 1)); return 0; }
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

# Orchestration stubs — track state DB writes
_STATE_DB_WRITES=0
_LAST_STATE=""
orch_circuit_breaker_init() { :; }
orch_circuit_breaker_execute() { "$2" "$3" "$4"; return $?; }
orch_record_error() { :; }
orch_db_record_step() { :; }
orch_check_failure_threshold() { return 0; }
orch_db_set_state() { _STATE_DB_WRITES=$((_STATE_DB_WRITES + 1)); _LAST_STATE="$2"; }
orch_init_context() { :; }
orch_init_metrics() { :; }
get_deployment_state() { echo "UNKNOWN"; }
export -f orch_circuit_breaker_init orch_circuit_breaker_execute orch_record_error
export -f orch_db_record_step orch_check_failure_threshold orch_db_set_state
export -f orch_init_context orch_init_metrics get_deployment_state

# =============================================================================
# DEFINE FUNCTIONS UNDER TEST (extracted from modules to avoid cascade)
# =============================================================================

# --- Dry-run constants and functions from pipeline-common.sh ---
export DIVE_DRY_RUN="false"
readonly PIPELINE_DRY_RUN_VALIDATION_PHASES="PREFLIGHT"

pipeline_is_dry_run() {
    [ "${DIVE_DRY_RUN:-false}" = "true" ]
}
export -f pipeline_is_dry_run

pipeline_is_validation_phase() {
    local phase_name="$1"
    local vp
    for vp in $PIPELINE_DRY_RUN_VALIDATION_PHASES; do
        [ "$vp" = "$phase_name" ] && return 0
    done
    return 1
}
export -f pipeline_is_validation_phase

pipeline_dry_run_phase() {
    local phase_num="$1"
    local phase_name="$2"
    local phase_label="$3"
    local phase_function="$4"
    local phase_mode="$5"
    local phase_state="${6:-}"

    echo ""
    echo "  [DRY-RUN] Phase ${phase_num}: ${phase_label} (${phase_name})"
    echo "    Function:  ${phase_function}()"
    echo "    Mode:      ${phase_mode}"
    if [ -n "$phase_state" ]; then
        echo "    State:     would transition to ${phase_state}"
    fi
}
export -f pipeline_dry_run_phase

# Dry-run tracking
_DRY_RUN_WOULD_EXECUTE=()
_DRY_RUN_WOULD_SKIP=()
_DRY_RUN_VALIDATED=()
_DRY_RUN_WARNINGS=()

pipeline_dry_run_reset() {
    _DRY_RUN_WOULD_EXECUTE=()
    _DRY_RUN_WOULD_SKIP=()
    _DRY_RUN_VALIDATED=()
    _DRY_RUN_WARNINGS=()
}
export -f pipeline_dry_run_reset

pipeline_dry_run_record_execute() { _DRY_RUN_WOULD_EXECUTE+=("$1"); }
pipeline_dry_run_record_skip() { _DRY_RUN_WOULD_SKIP+=("$1 ($2)"); }
pipeline_dry_run_record_validation() { _DRY_RUN_VALIDATED+=("$1"); }
pipeline_dry_run_record_warning() { _DRY_RUN_WARNINGS+=("$1"); }
export -f pipeline_dry_run_record_execute pipeline_dry_run_record_skip
export -f pipeline_dry_run_record_validation pipeline_dry_run_record_warning

pipeline_dry_run_summary() {
    local deploy_type="$1"
    local instance_code="$2"
    echo ""
    echo "==============================================================================="
    echo "  DRY-RUN SUMMARY — ${deploy_type^^} ${instance_code}"
    echo "==============================================================================="
    echo ""
    echo "  Phases that would execute: ${#_DRY_RUN_WOULD_EXECUTE[@]}"
    local phase
    for phase in "${_DRY_RUN_WOULD_EXECUTE[@]+"${_DRY_RUN_WOULD_EXECUTE[@]}"}"; do
        echo "    [+] $phase"
    done
    if [ ${#_DRY_RUN_WOULD_SKIP[@]} -gt 0 ]; then
        echo ""
        echo "  Phases that would be skipped: ${#_DRY_RUN_WOULD_SKIP[@]}"
        for phase in "${_DRY_RUN_WOULD_SKIP[@]+"${_DRY_RUN_WOULD_SKIP[@]}"}"; do
            echo "    [-] $phase"
        done
    fi
    if [ ${#_DRY_RUN_VALIDATED[@]} -gt 0 ]; then
        echo ""
        echo "  Validations performed:"
        local validation
        for validation in "${_DRY_RUN_VALIDATED[@]+"${_DRY_RUN_VALIDATED[@]}"}"; do
            echo "    [v] $validation"
        done
    fi
    if [ ${#_DRY_RUN_WARNINGS[@]} -gt 0 ]; then
        echo ""
        echo "  Warnings:"
        local warning
        for warning in "${_DRY_RUN_WARNINGS[@]+"${_DRY_RUN_WARNINGS[@]}"}"; do
            echo "    [!] $warning"
        done
    fi
    echo ""
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    echo "  No changes were made. Run without --dry-run to execute."
    echo "==============================================================================="
    echo ""
}
export -f pipeline_dry_run_summary

# --- Pipeline registry from pipeline-common.sh ---
_PIPELINE_REG_NUMS=()
_PIPELINE_REG_NAMES=()
_PIPELINE_REG_LABELS=()
_PIPELINE_REG_FUNCS=()
_PIPELINE_REG_MODES=()
_PIPELINE_REG_STATES=()
_PIPELINE_REG_WARN_MSGS=()

pipeline_clear_phases() {
    _PIPELINE_REG_NUMS=()
    _PIPELINE_REG_NAMES=()
    _PIPELINE_REG_LABELS=()
    _PIPELINE_REG_FUNCS=()
    _PIPELINE_REG_MODES=()
    _PIPELINE_REG_STATES=()
    _PIPELINE_REG_WARN_MSGS=()
}
export -f pipeline_clear_phases

pipeline_register_phase() {
    _PIPELINE_REG_NUMS+=("${1}")
    _PIPELINE_REG_NAMES+=("${2}")
    _PIPELINE_REG_LABELS+=("${3}")
    _PIPELINE_REG_FUNCS+=("${4}")
    _PIPELINE_REG_MODES+=("${5:-standard}")
    _PIPELINE_REG_STATES+=("${6:-}")
    _PIPELINE_REG_WARN_MSGS+=("${7:-}")
}
export -f pipeline_register_phase

pipeline_get_phase_count() { echo "${#_PIPELINE_REG_NUMS[@]}"; }
pipeline_get_phase_names() { echo "${_PIPELINE_REG_NAMES[*]}"; }
export -f pipeline_get_phase_count pipeline_get_phase_names

# --- Phase skip logic ---
export DIVE_SKIP_PHASES=""
export DIVE_ONLY_PHASE=""
export DIVE_FROM_PHASE=""
export _DIVE_FROM_PHASE_REACHED=false

_hub_should_skip_phase() {
    local phase_name="$1"
    if [ -n "${DIVE_ONLY_PHASE:-}" ]; then
        [ "$phase_name" != "$DIVE_ONLY_PHASE" ] && return 0
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
            [ "$skip_phase" = "$phase_name" ] && return 0
        done
    fi
    return 1
}
export -f _hub_should_skip_phase

# --- Hub phase stubs ---
_PHASE_EXECUTIONS=()
_hub_phase_stub_success() { _PHASE_EXECUTIONS+=("$1"); return 0; }
_hub_phase_stub_fail() { _PHASE_EXECUTIONS+=("$1"); return 1; }
export -f _hub_phase_stub_success _hub_phase_stub_fail

# Preflight stub that simulates validation
hub_phase_preflight() { _PHASE_EXECUTIONS+=("PREFLIGHT"); return 0; }
hub_phase_vault_bootstrap() { _PHASE_EXECUTIONS+=("VAULT_BOOTSTRAP"); return 0; }
hub_phase_build() { _PHASE_EXECUTIONS+=("BUILD"); return 0; }
hub_phase_services() { _PHASE_EXECUTIONS+=("SERVICES"); return 0; }
hub_phase_keycloak_config() { _PHASE_EXECUTIONS+=("KEYCLOAK_CONFIG"); return 0; }
hub_phase_seeding() { _PHASE_EXECUTIONS+=("SEEDING"); return 0; }
export -f hub_phase_preflight hub_phase_vault_bootstrap hub_phase_build
export -f hub_phase_services hub_phase_keycloak_config hub_phase_seeding

# --- _hub_execute_registered_phases (extracted from hub-pipeline.sh with dry-run support) ---
_hub_check_threshold() { return 0; }
export -f _hub_check_threshold

_hub_run_phase_with_circuit_breaker() {
    local instance_code="$1"
    local phase_name="$2"
    local phase_function="$3"
    local pipeline_mode="$4"
    local resume_mode="$5"
    export _PIPELINE_CURRENT_PHASE="$phase_name"
    "$phase_function" "$instance_code" "$pipeline_mode"
    return $?
}
export -f _hub_run_phase_with_circuit_breaker

_hub_install_ca_trust() { :; }
export -f _hub_install_ca_trust

_hub_execute_registered_phases() {
    local instance_code="$1"
    local pipeline_mode="$2"
    local resume_mode="$3"
    local _result_var="$4"
    local _times_var="$5"

    local _phase_count
    _phase_count=$(pipeline_get_phase_count)

    local _is_dry_run=false
    if pipeline_is_dry_run 2>/dev/null; then
        _is_dry_run=true
        pipeline_dry_run_reset 2>/dev/null || true
        echo ""
        echo "==============================================================================="
        echo "  DRY-RUN: Hub Deployment Plan — ${instance_code}"
        echo "==============================================================================="
    fi

    export _DIVE_FROM_PHASE_REACHED=false

    local i
    for (( i = 0; i < _phase_count; i++ )); do
        local _num="${_PIPELINE_REG_NUMS[$i]}"
        local _name="${_PIPELINE_REG_NAMES[$i]}"
        local _label="${_PIPELINE_REG_LABELS[$i]}"
        local _func="${_PIPELINE_REG_FUNCS[$i]}"
        local _mode="${_PIPELINE_REG_MODES[$i]}"
        local _state="${_PIPELINE_REG_STATES[$i]}"
        local _warn="${_PIPELINE_REG_WARN_MSGS[$i]}"

        local _current_result
        eval "_current_result=\${$_result_var}"
        if [ "$_current_result" -ne 0 ]; then
            break
        fi

        # Skip check
        if _hub_should_skip_phase "$_name"; then
            eval "${_times_var}+=(\"Phase $_num ($_label): skipped\")"
            if [ "$_is_dry_run" = "true" ]; then
                pipeline_dry_run_record_skip "$_label" "phase control flag" 2>/dev/null || true
            fi
            continue
        fi

        # DRY-RUN MODE
        if [ "$_is_dry_run" = "true" ]; then
            if pipeline_is_validation_phase "$_name" 2>/dev/null; then
                echo ""
                echo "  [DRY-RUN VALIDATION] Phase ${_num}: ${_label} (${_name})"
                echo "    Executing validation checks..."
                local _phase_rc=0
                "$_func" "$instance_code" "$pipeline_mode" || _phase_rc=$?
                if [ $_phase_rc -eq 0 ]; then
                    echo "    Result: PASSED"
                    pipeline_dry_run_record_validation "$_label: passed" 2>/dev/null || true
                else
                    echo "    Result: FAILED"
                    pipeline_dry_run_record_warning "$_label validation failed" 2>/dev/null || true
                fi
            else
                pipeline_dry_run_phase "$_num" "$_name" "$_label" "$_func" "$_mode" "$_state" 2>/dev/null || true
                pipeline_dry_run_record_execute "$_label" 2>/dev/null || true
            fi
            eval "${_times_var}+=(\"Phase $_num ($_label): dry-run\")"
            continue
        fi

        # Normal execution: state transition before phase
        if [ -n "$_state" ] && type orch_db_set_state &>/dev/null; then
            orch_db_set_state "$instance_code" "$_state" "" "{\"phase\":\"$_name\"}"
        fi

        local _phase_start
        _phase_start=$(date +%s)

        local _phase_rc=0
        case "$_mode" in
            direct)
                if ! "$_func" "$instance_code" "$pipeline_mode"; then
                    _phase_rc=1
                fi
                ;;
            non_fatal)
                _hub_run_phase_with_circuit_breaker "$instance_code" "$_name" "$_func" "$pipeline_mode" "$resume_mode" || {
                    if [ -n "$_warn" ]; then
                        log_warn "$_warn"
                    fi
                }
                ;;
            standard|*)
                if ! _hub_run_phase_with_circuit_breaker "$instance_code" "$_name" "$_func" "$pipeline_mode" "$resume_mode"; then
                    _phase_rc=1
                fi
                ;;
        esac

        local _phase_end
        _phase_end=$(date +%s)
        eval "${_times_var}+=(\"Phase $_num ($_label): $((_phase_end - _phase_start))s\")"

        if [ "$_mode" = "standard" ] || [ "$_mode" = "direct" ]; then
            if [ $_phase_rc -ne 0 ]; then
                eval "${_result_var}=1"
            fi
        fi
    done

    if [ "$_is_dry_run" = "true" ]; then
        pipeline_dry_run_summary "hub" "$instance_code" 2>/dev/null || true
    fi
}
export -f _hub_execute_registered_phases

# --- hub_deploy (simplified for testing, with --dry-run support) ---
hub_deploy() {
    local resume_mode=false
    export DIVE_SKIP_PHASES=""
    export DIVE_ONLY_PHASE=""
    export DIVE_FROM_PHASE=""
    export DIVE_DRY_RUN="false"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --resume) resume_mode=true; shift ;;
            --dry-run) DIVE_DRY_RUN="true"; shift ;;
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

    if type hub_pipeline_execute &>/dev/null; then
        local mode="deploy"
        [ "$resume_mode" = "true" ] && mode="resume"
        hub_pipeline_execute "$mode"
        return $?
    fi
    return 0
}
export -f hub_deploy

# --- hub_pipeline_execute (simplified for testing) ---
hub_pipeline_execute() {
    local pipeline_mode="${1:-deploy}"
    local instance_code="USA"

    # Register test phases
    pipeline_clear_phases
    pipeline_register_phase 1 "PREFLIGHT"       "Preflight"   "hub_phase_preflight"       "standard"  ""           ""
    pipeline_register_phase 2 "VAULT_BOOTSTRAP"  "Vault Boot"  "hub_phase_vault_bootstrap"  "standard"  ""          ""
    pipeline_register_phase 3 "BUILD"            "Build"       "hub_phase_build"            "direct"    ""           ""
    pipeline_register_phase 4 "SERVICES"         "Services"    "hub_phase_services"         "standard"  "DEPLOYING"  ""
    pipeline_register_phase 5 "KEYCLOAK_CONFIG"  "Keycloak"    "hub_phase_keycloak_config"  "standard"  "CONFIGURING" ""
    pipeline_register_phase 6 "SEEDING"          "Seeding"     "hub_phase_seeding"          "non_fatal" ""           "Seeding failed"

    local phase_result=0
    local _phase_times=()

    _hub_execute_registered_phases "$instance_code" "$pipeline_mode" "false" phase_result _phase_times
    return $phase_result
}
export -f hub_pipeline_execute

# --- Spoke deploy stubs ---
_spoke_should_skip_phase() {
    local phase_name="$1"
    if [ -n "${DIVE_ONLY_PHASE:-}" ]; then
        [ "$phase_name" != "$DIVE_ONLY_PHASE" ] && return 0
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
            [ "$skip_phase" = "$phase_name" ] && return 0
        done
    fi
    return 1
}
export -f _spoke_should_skip_phase

# Spoke phase stubs
spoke_phase_preflight() { _PHASE_EXECUTIONS+=("SPOKE_PREFLIGHT"); return 0; }
spoke_phase_initialization() { _PHASE_EXECUTIONS+=("SPOKE_INITIALIZATION"); return 0; }
spoke_phase_deployment() { _PHASE_EXECUTIONS+=("SPOKE_DEPLOYMENT"); return 0; }
spoke_phase_configuration() { _PHASE_EXECUTIONS+=("SPOKE_CONFIGURATION"); return 0; }
spoke_phase_seeding() { _PHASE_EXECUTIONS+=("SPOKE_SEEDING"); return 0; }
spoke_phase_verification() { _PHASE_EXECUTIONS+=("SPOKE_VERIFICATION"); return 0; }
export -f spoke_phase_preflight spoke_phase_initialization spoke_phase_deployment
export -f spoke_phase_configuration spoke_phase_seeding spoke_phase_verification

# Spoke checkpoint stubs
spoke_checkpoint_is_complete() { return 1; }
spoke_checkpoint_mark_complete() { :; }
export -f spoke_checkpoint_is_complete spoke_checkpoint_mark_complete

# Simplified spoke_pipeline_run_phase with dry-run support
spoke_pipeline_run_phase() {
    local instance_code="$1"
    local phase_name="$2"
    local pipeline_mode="$3"
    local resume_mode="${4:-false}"

    # DRY-RUN MODE
    if pipeline_is_dry_run 2>/dev/null; then
        local phase_function="spoke_phase_${phase_name,,}"

        if pipeline_is_validation_phase "$phase_name" 2>/dev/null; then
            echo ""
            echo "  [DRY-RUN VALIDATION] Phase: ${phase_name}"
            echo "    Executing validation checks..."
            local _dry_rc=0
            if type "$phase_function" &>/dev/null; then
                "$phase_function" "$instance_code" "$pipeline_mode" || _dry_rc=$?
            fi
            if [ $_dry_rc -eq 0 ]; then
                echo "    Result: PASSED"
                pipeline_dry_run_record_validation "$phase_name: passed" 2>/dev/null || true
            else
                echo "    Result: FAILED"
                pipeline_dry_run_record_warning "$phase_name validation failed" 2>/dev/null || true
            fi
        else
            echo ""
            echo "  [DRY-RUN] Phase: ${phase_name}"
            echo "    Function:  ${phase_function}()"
            pipeline_dry_run_record_execute "$phase_name" 2>/dev/null || true
        fi
        return 0
    fi

    # Normal execution
    local phase_function="spoke_phase_${phase_name,,}"
    if type "$phase_function" &>/dev/null; then
        "$phase_function" "$instance_code" "$pipeline_mode"
        return $?
    fi
    return 0
}
export -f spoke_pipeline_run_phase

# =============================================================================
# SUITE 1: DRY-RUN FLAG PARSING
# =============================================================================
echo ""
echo "Suite 1: Dry-Run Flag Parsing"
echo "=============================="

# Test: hub_deploy --dry-run sets DIVE_DRY_RUN
export DIVE_DRY_RUN="false"
hub_deploy --dry-run >/dev/null 2>&1
assert_eq "true" "$DIVE_DRY_RUN" "hub_deploy --dry-run sets DIVE_DRY_RUN=true"

# Test: hub_deploy without --dry-run leaves DIVE_DRY_RUN=false
export DIVE_DRY_RUN="false"
hub_deploy >/dev/null 2>&1
assert_eq "false" "$DIVE_DRY_RUN" "hub_deploy without --dry-run keeps DIVE_DRY_RUN=false"

# Test: pipeline_is_dry_run returns correctly
export DIVE_DRY_RUN="true"
pipeline_is_dry_run
assert_eq "0" "$?" "pipeline_is_dry_run returns 0 when DIVE_DRY_RUN=true"

export DIVE_DRY_RUN="false"
pipeline_is_dry_run
assert_eq "1" "$?" "pipeline_is_dry_run returns 1 when DIVE_DRY_RUN=false"

# =============================================================================
# SUITE 2: DRY-RUN SHOWS PHASE PLAN
# =============================================================================
echo ""
echo "Suite 2: Dry-Run Phase Plan Display"
echo "====================================="

export DIVE_DRY_RUN="true"
export DIVE_SKIP_PHASES=""
export DIVE_ONLY_PHASE=""
export DIVE_FROM_PHASE=""
_PHASE_EXECUTIONS=()

output=$(hub_deploy --dry-run 2>&1)
assert_contains "$output" "DRY-RUN" "Dry-run output contains DRY-RUN label"
assert_contains "$output" "Hub Deployment Plan" "Dry-run shows hub deployment plan"
assert_contains "$output" "DRY-RUN SUMMARY" "Dry-run shows summary section"
assert_contains "$output" "No changes were made" "Dry-run summary states no changes"

# =============================================================================
# SUITE 3: DRY-RUN RUNS PREFLIGHT VALIDATION
# =============================================================================
echo ""
echo "Suite 3: Dry-Run Runs Preflight Validation"
echo "============================================"

export DIVE_DRY_RUN="true"
_PHASE_EXECUTIONS=()

output=$(hub_deploy --dry-run 2>&1)

# PREFLIGHT is a validation phase — it should actually execute
assert_contains "$output" "DRY-RUN VALIDATION" "Preflight runs as DRY-RUN VALIDATION"
assert_contains "$output" "PASSED" "Preflight validation shows PASSED"

# Run again without command substitution (no subshell) to verify _PHASE_EXECUTIONS
_PHASE_EXECUTIONS=()
hub_deploy --dry-run >/dev/null 2>&1
found_preflight=false
for p in "${_PHASE_EXECUTIONS[@]+"${_PHASE_EXECUTIONS[@]}"}"; do
    [ "$p" = "PREFLIGHT" ] && found_preflight=true
done
assert_eq "true" "$found_preflight" "Preflight phase function was actually called"

# =============================================================================
# SUITE 4: DRY-RUN DOES NOT EXECUTE NON-VALIDATION PHASES
# =============================================================================
echo ""
echo "Suite 4: Dry-Run Does Not Execute Non-Validation Phases"
echo "========================================================"

export DIVE_DRY_RUN="true"
_PHASE_EXECUTIONS=()

hub_deploy --dry-run >/dev/null 2>&1

# Non-validation phases should NOT be in _PHASE_EXECUTIONS
found_build=false
found_services=false
found_keycloak=false
for p in "${_PHASE_EXECUTIONS[@]+"${_PHASE_EXECUTIONS[@]}"}"; do
    [ "$p" = "BUILD" ] && found_build=true
    [ "$p" = "SERVICES" ] && found_services=true
    [ "$p" = "KEYCLOAK_CONFIG" ] && found_keycloak=true
done
assert_eq "false" "$found_build" "BUILD phase not executed in dry-run"
assert_eq "false" "$found_services" "SERVICES phase not executed in dry-run"
assert_eq "false" "$found_keycloak" "KEYCLOAK_CONFIG phase not executed in dry-run"

# But they should appear in the plan output
output=$(hub_deploy --dry-run 2>&1)
assert_contains "$output" "Build" "Build phase listed in dry-run plan"
assert_contains "$output" "Services" "Services phase listed in dry-run plan"
assert_contains "$output" "Keycloak" "Keycloak phase listed in dry-run plan"

# =============================================================================
# SUITE 5: DRY-RUN DOES NOT MODIFY STATE DB
# =============================================================================
echo ""
echo "Suite 5: Dry-Run Does Not Modify State DB"
echo "============================================"

export DIVE_DRY_RUN="true"
_STATE_DB_WRITES=0
_LAST_STATE=""

hub_deploy --dry-run >/dev/null 2>&1

assert_eq "0" "$_STATE_DB_WRITES" "No state DB writes in dry-run mode"

# Compare with normal mode
export DIVE_DRY_RUN="false"
_STATE_DB_WRITES=0
_PHASE_EXECUTIONS=()
hub_deploy >/dev/null 2>&1

TOTAL=$((TOTAL + 1))
if [ "$_STATE_DB_WRITES" -gt 0 ]; then
    echo -e "  ${GREEN}PASS${NC} Normal mode writes to state DB ($_STATE_DB_WRITES writes)"
    PASS=$((PASS + 1))
else
    echo -e "  ${RED}FAIL${NC} Normal mode should write to state DB"
    FAIL=$((FAIL + 1))
fi

# =============================================================================
# SUITE 6: DRY-RUN DOES NOT TOUCH DOCKER
# =============================================================================
echo ""
echo "Suite 6: Dry-Run Does Not Touch Docker"
echo "========================================"

export DIVE_DRY_RUN="true"
_DOCKER_CALLS=0

hub_deploy --dry-run >/dev/null 2>&1

assert_eq "0" "$_DOCKER_CALLS" "No Docker calls in dry-run mode"

# =============================================================================
# SUITE 7: DRY-RUN RESPECTS --from-phase
# =============================================================================
echo ""
echo "Suite 7: Dry-Run Respects --from-phase"
echo "========================================"

export DIVE_DRY_RUN="true"
export DIVE_SKIP_PHASES=""
export DIVE_ONLY_PHASE=""
export DIVE_FROM_PHASE=""
_PHASE_EXECUTIONS=()

output=$(hub_deploy --dry-run --from-phase SERVICES 2>&1)
assert_contains "$output" "DRY-RUN SUMMARY" "Dry-run summary printed with --from-phase"

# Phases before SERVICES should be skipped
assert_contains "$output" "skipped" "Skipped phases listed in dry-run output"

# =============================================================================
# SUITE 8: DRY-RUN RESPECTS --skip-phase
# =============================================================================
echo ""
echo "Suite 8: Dry-Run Respects --skip-phase"
echo "========================================"

export DIVE_DRY_RUN="true"
export DIVE_SKIP_PHASES=""
export DIVE_ONLY_PHASE=""
export DIVE_FROM_PHASE=""
_PHASE_EXECUTIONS=()

output=$(hub_deploy --dry-run --skip-phase SEEDING 2>&1)
assert_contains "$output" "DRY-RUN SUMMARY" "Dry-run summary printed with --skip-phase"

# SEEDING should not be in would-execute list
assert_not_contains "$output" "[+] Seeding" "--skip-phase SEEDING not in would-execute list"

# =============================================================================
# SUITE 9: DRY-RUN SUMMARY CONTENT
# =============================================================================
echo ""
echo "Suite 9: Dry-Run Summary Content"
echo "=================================="

export DIVE_DRY_RUN="true"
export DIVE_SKIP_PHASES=""
export DIVE_ONLY_PHASE=""
export DIVE_FROM_PHASE=""

output=$(hub_deploy --dry-run 2>&1)

# Check summary contains phase count
assert_contains "$output" "Phases that would execute" "Summary shows phases that would execute"
assert_contains "$output" "Validations performed" "Summary shows validations performed"
assert_contains "$output" "No changes were made" "Summary reminds no changes made"

# =============================================================================
# SUITE 10: DRY-RUN WITH VALIDATION PHASE
# =============================================================================
echo ""
echo "Suite 10: Validation Phase Detection"
echo "======================================"

# PREFLIGHT is a validation phase
pipeline_is_validation_phase "PREFLIGHT"
assert_eq "0" "$?" "PREFLIGHT is detected as validation phase"

# BUILD is NOT a validation phase
pipeline_is_validation_phase "BUILD"
assert_eq "1" "$?" "BUILD is NOT detected as validation phase"

# SERVICES is NOT a validation phase
pipeline_is_validation_phase "SERVICES"
assert_eq "1" "$?" "SERVICES is NOT detected as validation phase"

# DEPLOYMENT is NOT a validation phase
pipeline_is_validation_phase "DEPLOYMENT"
assert_eq "1" "$?" "DEPLOYMENT is NOT detected as validation phase"

# =============================================================================
# SUITE 11: SPOKE DRY-RUN
# =============================================================================
echo ""
echo "Suite 11: Spoke Dry-Run Mode"
echo "=============================="

export DIVE_DRY_RUN="true"
export DIVE_SKIP_PHASES=""
export DIVE_ONLY_PHASE=""
export DIVE_FROM_PHASE=""
export _DIVE_FROM_PHASE_REACHED=false
_PHASE_EXECUTIONS=()
pipeline_dry_run_reset

# Simulate spoke pipeline phases in dry-run
spoke_pipeline_run_phase "GBR" "PREFLIGHT" "deploy" "false" >/dev/null 2>&1
spoke_pipeline_run_phase "GBR" "INITIALIZATION" "deploy" "false" >/dev/null 2>&1
spoke_pipeline_run_phase "GBR" "DEPLOYMENT" "deploy" "false" >/dev/null 2>&1
spoke_pipeline_run_phase "GBR" "CONFIGURATION" "deploy" "false" >/dev/null 2>&1
spoke_pipeline_run_phase "GBR" "SEEDING" "deploy" "false" >/dev/null 2>&1
spoke_pipeline_run_phase "GBR" "VERIFICATION" "deploy" "false" >/dev/null 2>&1

# PREFLIGHT should have been executed (validation phase)
found_spoke_preflight=false
for p in "${_PHASE_EXECUTIONS[@]+"${_PHASE_EXECUTIONS[@]}"}"; do
    [ "$p" = "SPOKE_PREFLIGHT" ] && found_spoke_preflight=true
done
assert_eq "true" "$found_spoke_preflight" "Spoke PREFLIGHT runs even in dry-run"

# Non-validation phases should NOT have been executed
found_spoke_deployment=false
for p in "${_PHASE_EXECUTIONS[@]+"${_PHASE_EXECUTIONS[@]}"}"; do
    [ "$p" = "SPOKE_DEPLOYMENT" ] && found_spoke_deployment=true
done
assert_eq "false" "$found_spoke_deployment" "Spoke DEPLOYMENT not executed in dry-run"

# Check dry-run tracking
assert_eq "5" "${#_DRY_RUN_WOULD_EXECUTE[@]}" "5 spoke phases recorded as would-execute"
assert_eq "1" "${#_DRY_RUN_VALIDATED[@]}" "1 spoke validation recorded"

# Spoke dry-run summary output
output=$(pipeline_dry_run_summary "spoke" "GBR" 2>&1)
assert_contains "$output" "DRY-RUN SUMMARY" "Spoke dry-run summary printed"
assert_contains "$output" "SPOKE GBR" "Spoke summary contains instance code"
assert_contains "$output" "No changes were made" "Spoke summary reminds no changes"

# =============================================================================
# SUITE 12: DRY-RUN RETURN CODE
# =============================================================================
echo ""
echo "Suite 12: Dry-Run Return Code"
echo "==============================="

export DIVE_DRY_RUN="true"
result=0
hub_deploy --dry-run >/dev/null 2>&1 || result=$?
assert_eq "0" "$result" "Dry-run always returns 0 (success)"

# =============================================================================
# RESULTS
# =============================================================================
echo ""
echo "==============================================================================="
echo -e "  Phase 4 Tests: ${PASS}/${TOTAL} passed, ${FAIL} failed"
echo "==============================================================================="
echo ""

if [ $FAIL -gt 0 ]; then
    echo -e "  ${RED}SOME TESTS FAILED${NC}"
    exit 1
else
    echo -e "  ${GREEN}ALL TESTS PASSED${NC}"
    exit 0
fi
