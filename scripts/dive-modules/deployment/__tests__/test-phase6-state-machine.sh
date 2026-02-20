#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Phase 6 State Machine Hardening Tests
# =============================================================================
# Tests for: state transition validation, stuck deployment detection,
#            heartbeat tracking, state audit/repair, nuke state cleanup
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODULES_DIR="$(cd "$DEPLOYMENT_DIR/.." && pwd)"
DIVE_ROOT="$(cd "$MODULES_DIR/../.." && pwd)"
export DIVE_ROOT

# Prevent re-entry from sourced modules
# shellcheck disable=SC2317
[ -n "${_PHASE6_TEST_RUNNING:-}" ] && { return 0 2>/dev/null || exit 0; }
export _PHASE6_TEST_RUNNING=1

# Test counters
PASS=0
FAIL=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
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

assert_file_exists() {
    local path="$1" desc="$2"
    TOTAL=$((TOTAL + 1))
    if [ -f "$path" ]; then
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $desc (file not found: $path)"
        FAIL=$((FAIL + 1))
    fi
}

assert_file_not_exists() {
    local path="$1" desc="$2"
    TOTAL=$((TOTAL + 1))
    if [ ! -f "$path" ]; then
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $desc (file exists but should not: $path)"
        FAIL=$((FAIL + 1))
    fi
}

assert_dir_not_exists() {
    local path="$1" desc="$2"
    TOTAL=$((TOTAL + 1))
    if [ ! -d "$path" ]; then
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $desc (dir exists but should not: $path)"
        FAIL=$((FAIL + 1))
    fi
}

assert_true() {
    local result="$1" desc="$2"
    TOTAL=$((TOTAL + 1))
    if [ "$result" -eq 0 ]; then
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $desc (expected success, got exit code $result)"
        FAIL=$((FAIL + 1))
    fi
}

assert_false() {
    local result="$1" desc="$2"
    TOTAL=$((TOTAL + 1))
    if [ "$result" -ne 0 ]; then
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $desc (expected failure, got success)"
        FAIL=$((FAIL + 1))
    fi
}

# =============================================================================
# STUB FUNCTIONS
# =============================================================================

# Docker stub
docker() { echo "stub"; return 0; }
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
is_interactive() { return 1; }
export -f log_info log_error log_success log_warn log_step log_verbose upper lower is_interactive
export DIVE_COMMON_LOADED=1

# Orchestration stubs
orch_circuit_breaker_init() { :; }
orch_circuit_breaker_execute() { "$2" "$3" "$4"; return $?; }
orch_record_error() { :; }
orch_db_record_step() { :; }
orch_check_failure_threshold() { return 0; }
_MOCK_STATE_DB=""
orch_db_set_state() { _MOCK_STATE_DB="$1:$2"; return 0; }
orch_db_get_state() {
    if [ -n "$_MOCK_STATE_DB" ]; then
        local code="$1"
        if [[ "$_MOCK_STATE_DB" == "$code:"* ]]; then
            echo "${_MOCK_STATE_DB#*:}"
            return 0
        fi
    fi
    echo "UNKNOWN"
    return 0
}
orch_init_context() { :; }
orch_init_metrics() { :; }
get_deployment_state() { orch_db_get_state "$1"; }
export -f orch_circuit_breaker_init orch_circuit_breaker_execute orch_record_error
export -f orch_db_record_step orch_check_failure_threshold orch_db_set_state orch_db_get_state
export -f orch_init_context orch_init_metrics get_deployment_state
export _MOCK_STATE_DB

# Use temp directory for test state
TEST_TMPDIR=$(mktemp -d)
export DIVE_ROOT="$TEST_TMPDIR"
mkdir -p "$TEST_TMPDIR/.dive-state/logs"
mkdir -p "$TEST_TMPDIR/.dive-state/heartbeat"
mkdir -p "$TEST_TMPDIR/.dive-state/hub/.phases"
trap 'rm -rf "$TEST_TMPDIR"' EXIT

# =============================================================================
# DEFINE FUNCTIONS UNDER TEST (extracted to avoid cascading source)
# =============================================================================

# --- State transition matrix ---
_PIPELINE_VALID_TRANSITIONS=(
    "UNKNOWN:INITIALIZING,FAILED"
    "INITIALIZING:DEPLOYING,FAILED,INTERRUPTED"
    "DEPLOYING:CONFIGURING,FAILED,INTERRUPTED"
    "CONFIGURING:VERIFYING,FAILED,INTERRUPTED"
    "VERIFYING:COMPLETE,FAILED,INTERRUPTED"
    "COMPLETE:INITIALIZING,FAILED"
    "FAILED:INITIALIZING,UNKNOWN"
    "INTERRUPTED:INITIALIZING,FAILED,UNKNOWN"
)

readonly PIPELINE_ACTIVE_STATES="INITIALIZING DEPLOYING CONFIGURING VERIFYING"

# Configurable timeouts for tests (short)
readonly PIPELINE_STUCK_TIMEOUT_INITIALIZING="${DIVE_STUCK_TIMEOUT_INITIALIZING:-1800}"
readonly PIPELINE_STUCK_TIMEOUT_DEPLOYING="${DIVE_STUCK_TIMEOUT_DEPLOYING:-1800}"
readonly PIPELINE_STUCK_TIMEOUT_CONFIGURING="${DIVE_STUCK_TIMEOUT_CONFIGURING:-1200}"
readonly PIPELINE_STUCK_TIMEOUT_VERIFYING="${DIVE_STUCK_TIMEOUT_VERIFYING:-600}"

export _PIPELINE_HEARTBEAT_FILE=""

# --- pipeline_validate_state_transition ---
pipeline_validate_state_transition() {
    local current_state="${1:-UNKNOWN}"
    local new_state="$2"
    local force="${3:-}"

    if [ "$current_state" = "$new_state" ]; then
        return 0
    fi

    local entry
    for entry in "${_PIPELINE_VALID_TRANSITIONS[@]}"; do
        local from_state="${entry%%:*}"
        local valid_targets="${entry#*:}"

        if [ "$from_state" = "$current_state" ]; then
            local target
            local IFS_OLD="$IFS"
            IFS=","
            for target in $valid_targets; do
                if [ "$target" = "$new_state" ]; then
                    IFS="$IFS_OLD"
                    return 0
                fi
            done
            IFS="$IFS_OLD"

            if [ "$force" = "force" ]; then
                return 0
            fi

            return 1
        fi
    done

    return 0
}

# --- deployment_get_state / deployment_set_state ---
deployment_get_state() {
    orch_db_get_state "$1"
}

deployment_set_state() {
    orch_db_set_state "$1" "$2"
}

# --- pipeline_validated_set_state ---
pipeline_validated_set_state() {
    local instance_code="$1"
    local new_state="$2"
    local reason="${3:-}"
    local metadata="${4:-}"
    local force="${5:-}"
    local code_upper
    code_upper=$(upper "$instance_code")

    local current_state
    current_state=$(deployment_get_state "$code_upper" 2>/dev/null || echo "UNKNOWN")

    if ! pipeline_validate_state_transition "$current_state" "$new_state" "$force"; then
        return 1
    fi

    deployment_set_state "$code_upper" "$new_state" "$reason" "$metadata"
    return $?
}

# --- Heartbeat functions ---
pipeline_heartbeat_init() {
    local instance_code="$1"
    local deploy_type="${2:-spoke}"
    local code_upper
    code_upper=$(upper "$instance_code")

    local heartbeat_dir="${DIVE_ROOT}/.dive-state/heartbeat"
    mkdir -p "$heartbeat_dir" 2>/dev/null || true

    export _PIPELINE_HEARTBEAT_FILE="${heartbeat_dir}/${deploy_type}-${code_upper}.heartbeat"
    pipeline_heartbeat_update "$code_upper" "INITIALIZING"
}

pipeline_heartbeat_update() {
    local instance_code="$1"
    local current_state="$2"

    if [ -n "${_PIPELINE_HEARTBEAT_FILE:-}" ]; then
        local ts
        ts=$(date +%s)
        printf '%s %s %s\n' "$ts" "$instance_code" "$current_state" > "$_PIPELINE_HEARTBEAT_FILE" 2>/dev/null || true
    fi
}

pipeline_heartbeat_stop() {
    if [ -n "${_PIPELINE_HEARTBEAT_FILE:-}" ] && [ -f "${_PIPELINE_HEARTBEAT_FILE}" ]; then
        rm -f "$_PIPELINE_HEARTBEAT_FILE" 2>/dev/null || true
    fi
    export _PIPELINE_HEARTBEAT_FILE=""
}

# --- Stuck detection ---
pipeline_detect_stuck() {
    local instance_code="$1"
    local deploy_type="${2:-spoke}"
    local code_upper
    code_upper=$(upper "$instance_code")

    local heartbeat_file="${DIVE_ROOT}/.dive-state/heartbeat/${deploy_type}-${code_upper}.heartbeat"
    if [ ! -f "$heartbeat_file" ]; then
        return 1
    fi

    local hb_timestamp hb_instance hb_state
    read -r hb_timestamp hb_instance hb_state < "$heartbeat_file" 2>/dev/null || return 1

    local is_active=false
    local s
    for s in $PIPELINE_ACTIVE_STATES; do
        if [ "$s" = "$hb_state" ]; then
            is_active=true
            break
        fi
    done

    if [ "$is_active" = "false" ]; then
        return 1
    fi

    local timeout_var="PIPELINE_STUCK_TIMEOUT_${hb_state}"
    local timeout="${!timeout_var:-1800}"

    local now
    now=$(date +%s)
    local elapsed=$((now - hb_timestamp))

    if [ "$elapsed" -gt "$timeout" ]; then
        echo "$hb_state $elapsed $timeout"
        return 0
    fi

    return 1
}

# --- State audit ---
pipeline_state_show() {
    local deploy_type="$1"
    local instance_code="$2"
    local code_upper
    code_upper=$(upper "$instance_code")

    echo "Deployment State — ${deploy_type} ${code_upper}"

    local current_state
    current_state=$(deployment_get_state "$code_upper" 2>/dev/null || echo "UNKNOWN")
    echo "Current State: $current_state"

    local heartbeat_file="${DIVE_ROOT}/.dive-state/heartbeat/${deploy_type}-${code_upper}.heartbeat"
    if [ -f "$heartbeat_file" ]; then
        echo "Heartbeat: present"
    else
        echo "Heartbeat: none"
    fi
}

pipeline_state_audit() {
    local deploy_type="$1"
    local instance_code="$2"
    local repair_mode="${3:-}"
    local code_upper
    code_upper=$(upper "$instance_code")

    local issues=0
    local fixed=0

    local current_state
    current_state=$(deployment_get_state "$code_upper" 2>/dev/null || echo "UNKNOWN")

    if [ "$deploy_type" = "hub" ]; then
        local ckpt_dir="${DIVE_ROOT}/.dive-state/hub/.phases"
        local all_complete=true
        local has_any=false

        if [ -d "$ckpt_dir" ]; then
            local hub_phases=(VAULT_BOOTSTRAP DATABASE_INIT PREFLIGHT INITIALIZATION MONGODB_INIT BUILD SERVICES VAULT_DB_ENGINE KEYCLOAK_CONFIG REALM_VERIFY KAS_REGISTER SEEDING KAS_INIT)
            local hp
            for hp in "${hub_phases[@]}"; do
                if [ -f "$ckpt_dir/${hp}.done" ]; then
                    has_any=true
                else
                    all_complete=false
                fi
            done
        fi

        if [ "$has_any" = "true" ] && [ "$all_complete" = "true" ] && [ "$current_state" != "COMPLETE" ]; then
            issues=$((issues + 1))
            if [ "$repair_mode" = "repair" ]; then
                deployment_set_state "$code_upper" "COMPLETE" "Auto-repaired"
                fixed=$((fixed + 1))
            fi
        fi
    fi

    # Check: Active state with no heartbeat
    local heartbeat_file="${DIVE_ROOT}/.dive-state/heartbeat/${deploy_type}-${code_upper}.heartbeat"
    local is_active=false
    for s in $PIPELINE_ACTIVE_STATES; do
        if [ "$s" = "$current_state" ]; then
            is_active=true
            break
        fi
    done

    if [ "$is_active" = "true" ] && [ ! -f "$heartbeat_file" ]; then
        issues=$((issues + 1))
        if [ "$repair_mode" = "repair" ]; then
            deployment_set_state "$code_upper" "FAILED" "Auto-repaired: no heartbeat"
            fixed=$((fixed + 1))
        fi
    fi

    # Check: Stale heartbeat
    if [ -f "$heartbeat_file" ]; then
        local stuck_info
        stuck_info=$(pipeline_detect_stuck "$code_upper" "$deploy_type") && {
            issues=$((issues + 1))
            if [ "$repair_mode" = "repair" ]; then
                rm -f "$heartbeat_file" 2>/dev/null || true
                deployment_set_state "$code_upper" "FAILED" "Auto-repaired: stuck"
                fixed=$((fixed + 1))
            fi
        }
    fi

    echo "issues=$issues fixed=$fixed"

    [ $issues -eq 0 ] || { [ "$repair_mode" = "repair" ] && [ "$fixed" -eq "$issues" ]; }
}

# --- State cleanup ---
pipeline_state_cleanup() {
    local instance_code="$1"
    local deploy_type="${2:-all}"
    local preserve_logs="${3:-}"

    if [ "$instance_code" = "all" ]; then
        rm -rf "${DIVE_ROOT}/.dive-state/heartbeat" 2>/dev/null || true
        rm -rf "${DIVE_ROOT}/.dive-state/hub/.phases" 2>/dev/null || true
        rm -rf "${DIVE_ROOT}/.dive-state/timing" 2>/dev/null || true

        if [ "$preserve_logs" != "preserve-logs" ]; then
            rm -rf "${DIVE_ROOT}/.dive-state/logs" 2>/dev/null || true
        fi
    else
        local code_upper
        code_upper=$(upper "$instance_code")

        if [ "$deploy_type" = "hub" ] || [ "$deploy_type" = "all" ]; then
            rm -f "${DIVE_ROOT}/.dive-state/heartbeat/hub-${code_upper}.heartbeat" 2>/dev/null || true
        fi
        if [ "$deploy_type" = "spoke" ] || [ "$deploy_type" = "all" ]; then
            rm -f "${DIVE_ROOT}/.dive-state/heartbeat/spoke-${code_upper}.heartbeat" 2>/dev/null || true
        fi

        if [ "$deploy_type" = "hub" ] && [ "$code_upper" = "USA" ]; then
            rm -rf "${DIVE_ROOT}/.dive-state/hub/.phases" 2>/dev/null || true
        fi

        if [ "$preserve_logs" != "preserve-logs" ]; then
            local log_dir="${DIVE_ROOT}/.dive-state/logs"
            if [ -d "$log_dir" ]; then
                rm -f "${log_dir}/deploy-hub-${code_upper}-"*.jsonl 2>/dev/null || true
                rm -f "${log_dir}/deploy-spoke-${code_upper}-"*.jsonl 2>/dev/null || true
            fi
        fi

        orch_db_set_state "$code_upper" "UNKNOWN" "State cleaned" 2>/dev/null || true
    fi
}

export -f pipeline_validate_state_transition pipeline_validated_set_state
export -f pipeline_heartbeat_init pipeline_heartbeat_update pipeline_heartbeat_stop
export -f pipeline_detect_stuck pipeline_state_show pipeline_state_audit pipeline_state_cleanup
export -f deployment_get_state deployment_set_state

# =============================================================================
# TEST SUITE 1: State Transition Validation
# =============================================================================

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Phase 6 State Machine Hardening Tests${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Suite 1: State Transition Validation${NC}"
echo "────────────────────────────────────────────────────────────────"

# 1.1 Valid forward transitions
pipeline_validate_state_transition "UNKNOWN" "INITIALIZING"
assert_eq "0" "$?" "UNKNOWN -> INITIALIZING is valid"

pipeline_validate_state_transition "INITIALIZING" "DEPLOYING"
assert_eq "0" "$?" "INITIALIZING -> DEPLOYING is valid"

pipeline_validate_state_transition "DEPLOYING" "CONFIGURING"
assert_eq "0" "$?" "DEPLOYING -> CONFIGURING is valid"

pipeline_validate_state_transition "CONFIGURING" "VERIFYING"
assert_eq "0" "$?" "CONFIGURING -> VERIFYING is valid"

pipeline_validate_state_transition "VERIFYING" "COMPLETE"
assert_eq "0" "$?" "VERIFYING -> COMPLETE is valid"

# 1.2 FAILED transitions (from any active state)
pipeline_validate_state_transition "INITIALIZING" "FAILED"
assert_eq "0" "$?" "INITIALIZING -> FAILED is valid"

pipeline_validate_state_transition "DEPLOYING" "FAILED"
assert_eq "0" "$?" "DEPLOYING -> FAILED is valid"

pipeline_validate_state_transition "CONFIGURING" "FAILED"
assert_eq "0" "$?" "CONFIGURING -> FAILED is valid"

pipeline_validate_state_transition "VERIFYING" "FAILED"
assert_eq "0" "$?" "VERIFYING -> FAILED is valid"

# 1.3 INTERRUPTED transitions (from any active state)
pipeline_validate_state_transition "INITIALIZING" "INTERRUPTED"
assert_eq "0" "$?" "INITIALIZING -> INTERRUPTED is valid"

pipeline_validate_state_transition "DEPLOYING" "INTERRUPTED"
assert_eq "0" "$?" "DEPLOYING -> INTERRUPTED is valid"

pipeline_validate_state_transition "CONFIGURING" "INTERRUPTED"
assert_eq "0" "$?" "CONFIGURING -> INTERRUPTED is valid"

pipeline_validate_state_transition "VERIFYING" "INTERRUPTED"
assert_eq "0" "$?" "VERIFYING -> INTERRUPTED is valid"

# 1.4 Recovery transitions
pipeline_validate_state_transition "FAILED" "INITIALIZING"
assert_eq "0" "$?" "FAILED -> INITIALIZING is valid (retry)"

pipeline_validate_state_transition "INTERRUPTED" "INITIALIZING"
assert_eq "0" "$?" "INTERRUPTED -> INITIALIZING is valid (resume)"

pipeline_validate_state_transition "COMPLETE" "INITIALIZING"
assert_eq "0" "$?" "COMPLETE -> INITIALIZING is valid (redeploy)"

# 1.5 Invalid transitions
pipeline_validate_state_transition "COMPLETE" "DEPLOYING" 2>/dev/null
assert_false "$?" "COMPLETE -> DEPLOYING is invalid (skips INITIALIZING)"

pipeline_validate_state_transition "UNKNOWN" "COMPLETE" 2>/dev/null
assert_false "$?" "UNKNOWN -> COMPLETE is invalid (skips all phases)"

pipeline_validate_state_transition "INITIALIZING" "VERIFYING" 2>/dev/null
assert_false "$?" "INITIALIZING -> VERIFYING is invalid (skips phases)"

pipeline_validate_state_transition "VERIFYING" "DEPLOYING" 2>/dev/null
assert_false "$?" "VERIFYING -> DEPLOYING is invalid (backward)"

pipeline_validate_state_transition "COMPLETE" "CONFIGURING" 2>/dev/null
assert_false "$?" "COMPLETE -> CONFIGURING is invalid"

# 1.6 Same state is always valid (no-op)
pipeline_validate_state_transition "DEPLOYING" "DEPLOYING"
assert_eq "0" "$?" "DEPLOYING -> DEPLOYING is valid (no-op)"

pipeline_validate_state_transition "COMPLETE" "COMPLETE"
assert_eq "0" "$?" "COMPLETE -> COMPLETE is valid (no-op)"

# 1.7 Force override allows invalid transitions
pipeline_validate_state_transition "COMPLETE" "DEPLOYING" "force" 2>/dev/null
assert_eq "0" "$?" "COMPLETE -> DEPLOYING with force is allowed"

pipeline_validate_state_transition "UNKNOWN" "COMPLETE" "force" 2>/dev/null
assert_eq "0" "$?" "UNKNOWN -> COMPLETE with force is allowed"

echo ""

# =============================================================================
# TEST SUITE 2: Validated State Set
# =============================================================================

echo -e "${YELLOW}Suite 2: Validated State Updates${NC}"
echo "────────────────────────────────────────────────────────────────"

# Reset state
_MOCK_STATE_DB=""

# 2.1 Valid transition succeeds
pipeline_validated_set_state "USA" "INITIALIZING"
assert_eq "0" "$?" "Valid: UNKNOWN -> INITIALIZING succeeds"
assert_eq "USA:INITIALIZING" "$_MOCK_STATE_DB" "State DB updated to INITIALIZING"

# 2.2 Valid forward
pipeline_validated_set_state "USA" "DEPLOYING"
assert_eq "0" "$?" "Valid: INITIALIZING -> DEPLOYING succeeds"
assert_eq "USA:DEPLOYING" "$_MOCK_STATE_DB" "State DB updated to DEPLOYING"

# 2.3 Invalid transition fails
pipeline_validated_set_state "USA" "COMPLETE" 2>/dev/null
assert_false "$?" "Invalid: DEPLOYING -> COMPLETE rejected"
assert_eq "USA:DEPLOYING" "$_MOCK_STATE_DB" "State DB unchanged after rejection"

# 2.4 Force override
pipeline_validated_set_state "USA" "COMPLETE" "" "" "force" 2>/dev/null
assert_eq "0" "$?" "Force: DEPLOYING -> COMPLETE with force succeeds"
assert_eq "USA:COMPLETE" "$_MOCK_STATE_DB" "State DB updated to COMPLETE with force"

echo ""

# =============================================================================
# TEST SUITE 3: Heartbeat Tracking
# =============================================================================

echo -e "${YELLOW}Suite 3: Heartbeat Tracking${NC}"
echo "────────────────────────────────────────────────────────────────"

# 3.1 Heartbeat init creates file
pipeline_heartbeat_init "GBR" "spoke"
assert_file_exists "$_PIPELINE_HEARTBEAT_FILE" "Heartbeat file created for GBR"

# 3.2 Heartbeat file has correct content
hb_content=""
hb_content=$(cat "$_PIPELINE_HEARTBEAT_FILE")
assert_contains "$hb_content" "GBR" "Heartbeat contains instance code"
assert_contains "$hb_content" "INITIALIZING" "Heartbeat contains initial state"

# 3.3 Heartbeat update changes state
pipeline_heartbeat_update "GBR" "DEPLOYING"
hb_content=$(cat "$_PIPELINE_HEARTBEAT_FILE")
assert_contains "$hb_content" "DEPLOYING" "Heartbeat updated to DEPLOYING"

# 3.4 Heartbeat stop removes file
hb_file_path="$_PIPELINE_HEARTBEAT_FILE"
pipeline_heartbeat_stop
assert_file_not_exists "$hb_file_path" "Heartbeat file removed after stop"
assert_eq "" "$_PIPELINE_HEARTBEAT_FILE" "Heartbeat file path cleared"

echo ""

# =============================================================================
# TEST SUITE 4: Stuck Deployment Detection
# =============================================================================

echo -e "${YELLOW}Suite 4: Stuck Deployment Detection${NC}"
echo "────────────────────────────────────────────────────────────────"

# 4.1 No heartbeat = not stuck
pipeline_detect_stuck "GBR" "spoke" 2>/dev/null
assert_false "$?" "No heartbeat file = not stuck"

# 4.2 Fresh heartbeat = not stuck
pipeline_heartbeat_init "FRA" "spoke"
pipeline_heartbeat_update "FRA" "DEPLOYING"
pipeline_detect_stuck "FRA" "spoke" 2>/dev/null
assert_false "$?" "Fresh heartbeat = not stuck"
pipeline_heartbeat_stop

# 4.3 Stale heartbeat = stuck
stale_hb="${DIVE_ROOT}/.dive-state/heartbeat/spoke-DEU.heartbeat"
stale_ts=$(($(date +%s) - 7200))  # 2 hours ago
printf '%s %s %s\n' "$stale_ts" "DEU" "DEPLOYING" > "$stale_hb"

stuck_info=""
stuck_info=$(pipeline_detect_stuck "DEU" "spoke")
assert_eq "0" "$?" "Stale heartbeat (2h) = stuck detected"
assert_contains "$stuck_info" "DEPLOYING" "Stuck info contains state"

# 4.4 Completed state heartbeat = not stuck
complete_hb="${DIVE_ROOT}/.dive-state/heartbeat/spoke-ITA.heartbeat"
old_ts=$(($(date +%s) - 7200))
printf '%s %s %s\n' "$old_ts" "ITA" "COMPLETE" > "$complete_hb"
pipeline_detect_stuck "ITA" "spoke" 2>/dev/null
assert_false "$?" "COMPLETE state = not stuck (not an active state)"

# 4.5 Failed state heartbeat = not stuck
failed_hb="${DIVE_ROOT}/.dive-state/heartbeat/spoke-ESP.heartbeat"
printf '%s %s %s\n' "$old_ts" "ESP" "FAILED" > "$failed_hb"
pipeline_detect_stuck "ESP" "spoke" 2>/dev/null
assert_false "$?" "FAILED state = not stuck (not an active state)"

# 4.6 Different state timeouts
stale_configuring="${DIVE_ROOT}/.dive-state/heartbeat/spoke-BEL.heartbeat"
config_ts=$(($(date +%s) - 1500))  # 25min ago (> 20min CONFIGURING timeout)
printf '%s %s %s\n' "$config_ts" "BEL" "CONFIGURING" > "$stale_configuring"
pipeline_detect_stuck "BEL" "spoke" 2>/dev/null
assert_eq "0" "$?" "CONFIGURING stale for 25min > 20min timeout = stuck"

# 4.7 Not yet timed out
fresh_configuring="${DIVE_ROOT}/.dive-state/heartbeat/spoke-NLD.heartbeat"
config_fresh_ts=$(($(date +%s) - 600))  # 10min ago (< 20min CONFIGURING timeout)
printf '%s %s %s\n' "$config_fresh_ts" "NLD" "CONFIGURING" > "$fresh_configuring"
pipeline_detect_stuck "NLD" "spoke" 2>/dev/null
assert_false "$?" "CONFIGURING for 10min < 20min timeout = not stuck"

echo ""

# =============================================================================
# TEST SUITE 5: State Show
# =============================================================================

echo -e "${YELLOW}Suite 5: State Display${NC}"
echo "────────────────────────────────────────────────────────────────"

# 5.1 Show state with no deployment
_MOCK_STATE_DB=""
show_output=""
show_output=$(pipeline_state_show "hub" "USA" 2>&1)
assert_contains "$show_output" "hub USA" "State show displays hub USA header"
assert_contains "$show_output" "UNKNOWN" "State show displays UNKNOWN when no state"
assert_contains "$show_output" "Heartbeat: none" "State show displays no heartbeat"

# 5.2 Show state with active deployment
_MOCK_STATE_DB="GBR:DEPLOYING"
pipeline_heartbeat_init "GBR" "spoke"
pipeline_heartbeat_update "GBR" "DEPLOYING"
show_output=$(pipeline_state_show "spoke" "GBR" 2>&1)
assert_contains "$show_output" "DEPLOYING" "State show displays DEPLOYING"
assert_contains "$show_output" "Heartbeat: present" "State show displays heartbeat"
pipeline_heartbeat_stop

echo ""

# =============================================================================
# TEST SUITE 6: State Audit
# =============================================================================

echo -e "${YELLOW}Suite 6: State Audit & Repair${NC}"
echo "────────────────────────────────────────────────────────────────"

# 6.1 Consistent state = no issues
_MOCK_STATE_DB="USA:COMPLETE"
# Create all hub checkpoint files
hub_ckpt_phases=(VAULT_BOOTSTRAP DATABASE_INIT PREFLIGHT INITIALIZATION MONGODB_INIT BUILD SERVICES VAULT_DB_ENGINE KEYCLOAK_CONFIG REALM_VERIFY KAS_REGISTER SEEDING KAS_INIT)
mkdir -p "${DIVE_ROOT}/.dive-state/hub/.phases"
for hp in "${hub_ckpt_phases[@]}"; do
    echo '{"phase":"'"$hp"'","duration_seconds":10}' > "${DIVE_ROOT}/.dive-state/hub/.phases/${hp}.done"
done

audit_output=""
audit_output=$(pipeline_state_audit "hub" "USA" 2>&1)
assert_eq "0" "$?" "Consistent state passes audit"
assert_contains "$audit_output" "issues=0" "No issues found"

# 6.2 All checkpoints complete but state is DEPLOYING = inconsistency
_MOCK_STATE_DB="USA:DEPLOYING"
audit_output=$(pipeline_state_audit "hub" "USA" 2>&1)
assert_false "$?" "Inconsistent: all checkpoints done but state DEPLOYING"

# 6.3 Repair fixes the inconsistency
# Note: Run audit NOT in subshell so deployment_set_state modifies _MOCK_STATE_DB
# Create a fresh heartbeat so only the checkpoint inconsistency is detected (not "no heartbeat")
_MOCK_STATE_DB="USA:DEPLOYING"
mkdir -p "${DIVE_ROOT}/.dive-state/heartbeat"
printf '%s %s %s\n' "$(date +%s)" "USA" "DEPLOYING" > "${DIVE_ROOT}/.dive-state/heartbeat/hub-USA.heartbeat"
pipeline_state_audit "hub" "USA" "repair" > /dev/null 2>&1
assert_eq "0" "$?" "Repair succeeds"
assert_eq "USA:COMPLETE" "$_MOCK_STATE_DB" "State repaired to COMPLETE"
rm -f "${DIVE_ROOT}/.dive-state/heartbeat/hub-USA.heartbeat" 2>/dev/null

# 6.4 Active state with no heartbeat = inconsistency
_MOCK_STATE_DB="GBR:DEPLOYING"
rm -f "${DIVE_ROOT}/.dive-state/heartbeat/spoke-GBR.heartbeat" 2>/dev/null
audit_output=$(pipeline_state_audit "spoke" "GBR" 2>&1)
assert_false "$?" "Active state with no heartbeat detected"

# 6.5 Repair sets state to FAILED
_MOCK_STATE_DB="GBR:DEPLOYING"
pipeline_state_audit "spoke" "GBR" "repair" > /dev/null 2>&1
assert_eq "0" "$?" "Repair succeeds for no-heartbeat"
assert_eq "GBR:FAILED" "$_MOCK_STATE_DB" "State repaired to FAILED"

# 6.6 Stale heartbeat = issue
_MOCK_STATE_DB="DEU:DEPLOYING"
stale="${DIVE_ROOT}/.dive-state/heartbeat/spoke-DEU.heartbeat"
printf '%s %s %s\n' "$(($(date +%s) - 7200))" "DEU" "DEPLOYING" > "$stale"
audit_output=$(pipeline_state_audit "spoke" "DEU" 2>&1)
assert_false "$?" "Stale heartbeat detected as issue"

# 6.7 Repair cleans stale heartbeat
_MOCK_STATE_DB="DEU:DEPLOYING"
stale="${DIVE_ROOT}/.dive-state/heartbeat/spoke-DEU.heartbeat"
printf '%s %s %s\n' "$(($(date +%s) - 7200))" "DEU" "DEPLOYING" > "$stale"
pipeline_state_audit "spoke" "DEU" "repair" > /dev/null 2>&1
assert_eq "0" "$?" "Repair succeeds for stale heartbeat"
assert_file_not_exists "$stale" "Stale heartbeat removed during repair"
assert_eq "DEU:FAILED" "$_MOCK_STATE_DB" "State repaired to FAILED"

echo ""

# =============================================================================
# TEST SUITE 7: State Cleanup (Nuke Integration)
# =============================================================================

echo -e "${YELLOW}Suite 7: State Cleanup (Nuke Integration)${NC}"
echo "────────────────────────────────────────────────────────────────"

# Setup test state
mkdir -p "${DIVE_ROOT}/.dive-state/heartbeat"
mkdir -p "${DIVE_ROOT}/.dive-state/hub/.phases"
mkdir -p "${DIVE_ROOT}/.dive-state/logs"
mkdir -p "${DIVE_ROOT}/.dive-state/timing"

echo "heartbeat" > "${DIVE_ROOT}/.dive-state/heartbeat/hub-USA.heartbeat"
echo "heartbeat" > "${DIVE_ROOT}/.dive-state/heartbeat/spoke-GBR.heartbeat"
echo "heartbeat" > "${DIVE_ROOT}/.dive-state/heartbeat/spoke-FRA.heartbeat"
echo "checkpoint" > "${DIVE_ROOT}/.dive-state/hub/.phases/PREFLIGHT.done"
echo "checkpoint" > "${DIVE_ROOT}/.dive-state/hub/.phases/BUILD.done"
echo '{"test":true}' > "${DIVE_ROOT}/.dive-state/logs/deploy-hub-USA-20260220-120000.jsonl"
echo '{"test":true}' > "${DIVE_ROOT}/.dive-state/logs/deploy-spoke-GBR-20260220-120000.jsonl"
echo "timing" > "${DIVE_ROOT}/.dive-state/timing/hub-USA.timing"

# 7.1 Cleanup specific spoke
pipeline_state_cleanup "GBR" "spoke"
assert_file_not_exists "${DIVE_ROOT}/.dive-state/heartbeat/spoke-GBR.heartbeat" "GBR spoke heartbeat removed"
assert_file_exists "${DIVE_ROOT}/.dive-state/heartbeat/spoke-FRA.heartbeat" "FRA spoke heartbeat preserved"
assert_file_exists "${DIVE_ROOT}/.dive-state/heartbeat/hub-USA.heartbeat" "Hub heartbeat preserved"

# 7.2 Cleanup hub
pipeline_state_cleanup "USA" "hub"
assert_file_not_exists "${DIVE_ROOT}/.dive-state/heartbeat/hub-USA.heartbeat" "Hub heartbeat removed"
assert_dir_not_exists "${DIVE_ROOT}/.dive-state/hub/.phases" "Hub checkpoints removed"
assert_file_exists "${DIVE_ROOT}/.dive-state/heartbeat/spoke-FRA.heartbeat" "FRA spoke heartbeat still preserved"

# 7.3 Cleanup all
# Recreate some state
mkdir -p "${DIVE_ROOT}/.dive-state/heartbeat"
mkdir -p "${DIVE_ROOT}/.dive-state/hub/.phases"
mkdir -p "${DIVE_ROOT}/.dive-state/timing"
echo "heartbeat" > "${DIVE_ROOT}/.dive-state/heartbeat/spoke-FRA.heartbeat"
echo "checkpoint" > "${DIVE_ROOT}/.dive-state/hub/.phases/BUILD.done"
echo "timing" > "${DIVE_ROOT}/.dive-state/timing/hub.timing"

pipeline_state_cleanup "all" "all"
assert_dir_not_exists "${DIVE_ROOT}/.dive-state/heartbeat" "All heartbeats removed"
assert_dir_not_exists "${DIVE_ROOT}/.dive-state/hub/.phases" "All checkpoints removed"
assert_dir_not_exists "${DIVE_ROOT}/.dive-state/timing" "All timing removed"
assert_dir_not_exists "${DIVE_ROOT}/.dive-state/logs" "All logs removed (no preserve)"

# 7.4 Cleanup all with --preserve-logs
mkdir -p "${DIVE_ROOT}/.dive-state/heartbeat"
mkdir -p "${DIVE_ROOT}/.dive-state/logs"
echo "heartbeat" > "${DIVE_ROOT}/.dive-state/heartbeat/hub-USA.heartbeat"
echo '{"test":true}' > "${DIVE_ROOT}/.dive-state/logs/deploy-hub-USA-20260220-120000.jsonl"

pipeline_state_cleanup "all" "all" "preserve-logs"
assert_dir_not_exists "${DIVE_ROOT}/.dive-state/heartbeat" "Heartbeats removed even with preserve-logs"
assert_file_exists "${DIVE_ROOT}/.dive-state/logs/deploy-hub-USA-20260220-120000.jsonl" "Logs preserved with preserve-logs"

# 7.5 Cleanup specific instance logs
echo '{"test":true}' > "${DIVE_ROOT}/.dive-state/logs/deploy-spoke-FRA-20260220-120000.jsonl"
echo '{"test":true}' > "${DIVE_ROOT}/.dive-state/logs/deploy-spoke-DEU-20260220-120000.jsonl"

pipeline_state_cleanup "FRA" "spoke"
assert_file_not_exists "${DIVE_ROOT}/.dive-state/logs/deploy-spoke-FRA-20260220-120000.jsonl" "FRA logs removed"
assert_file_exists "${DIVE_ROOT}/.dive-state/logs/deploy-spoke-DEU-20260220-120000.jsonl" "DEU logs preserved"

echo ""

# =============================================================================
# TEST SUITE 8: Edge Cases
# =============================================================================

echo -e "${YELLOW}Suite 8: Edge Cases${NC}"
echo "────────────────────────────────────────────────────────────────"

# 8.1 Unknown source state allows transition (with warning)
pipeline_validate_state_transition "CUSTOM_STATE" "INITIALIZING" 2>/dev/null
assert_eq "0" "$?" "Unknown source state allows transition"

# 8.2 FAILED -> UNKNOWN is valid (full reset)
pipeline_validate_state_transition "FAILED" "UNKNOWN"
assert_eq "0" "$?" "FAILED -> UNKNOWN is valid"

# 8.3 INTERRUPTED -> UNKNOWN is valid (full reset)
pipeline_validate_state_transition "INTERRUPTED" "UNKNOWN"
assert_eq "0" "$?" "INTERRUPTED -> UNKNOWN is valid"

# 8.4 Double heartbeat init overwrites
pipeline_heartbeat_init "TEST" "spoke"
first_file="$_PIPELINE_HEARTBEAT_FILE"
pipeline_heartbeat_update "TEST" "DEPLOYING"
pipeline_heartbeat_init "TEST" "spoke"
second_file="$_PIPELINE_HEARTBEAT_FILE"
assert_eq "$first_file" "$second_file" "Double init uses same file path"
content=""
content=$(cat "$_PIPELINE_HEARTBEAT_FILE")
assert_contains "$content" "INITIALIZING" "Double init resets to INITIALIZING"
pipeline_heartbeat_stop

# 8.5 Heartbeat stop when no heartbeat is safe
export _PIPELINE_HEARTBEAT_FILE=""
pipeline_heartbeat_stop  # Should not error
assert_eq "0" "$?" "Heartbeat stop with no file is safe"

# 8.6 Detect stuck with hub type
hub_stale="${DIVE_ROOT}/.dive-state/heartbeat/hub-USA.heartbeat"
mkdir -p "${DIVE_ROOT}/.dive-state/heartbeat"
printf '%s %s %s\n' "$(($(date +%s) - 7200))" "USA" "INITIALIZING" > "$hub_stale"
pipeline_detect_stuck "USA" "hub" 2>/dev/null
assert_eq "0" "$?" "Stuck detection works for hub type"

echo ""

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════${NC}"
echo -e "  Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${TOTAL} total"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
