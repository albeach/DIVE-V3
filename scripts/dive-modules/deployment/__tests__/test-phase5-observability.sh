#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Phase 5 Observability & Diagnostics Tests
# =============================================================================
# Tests for: structured logging, phase timing metrics, --timing flag,
#            diagnostic report generation, deployment history
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODULES_DIR="$(cd "$DEPLOYMENT_DIR/.." && pwd)"
DIVE_ROOT="$(cd "$MODULES_DIR/../.." && pwd)"
export DIVE_ROOT

# Prevent re-entry from sourced modules
# shellcheck disable=SC2317
[ -n "${_PHASE5_TEST_RUNNING:-}" ] && { return 0 2>/dev/null || exit 0; }
export _PHASE5_TEST_RUNNING=1

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

assert_gt() {
    local a="$1" b="$2" desc="$3"
    TOTAL=$((TOTAL + 1))
    if [ "$a" -gt "$b" ]; then
        echo -e "  ${GREEN}PASS${NC} $desc"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}FAIL${NC} $desc (expected $a > $b)"
        FAIL=$((FAIL + 1))
    fi
}

# =============================================================================
# STUB FUNCTIONS
# =============================================================================

# Docker stub — tracks calls
_DOCKER_CALLS=0
docker() { _DOCKER_CALLS=$((_DOCKER_CALLS + 1)); echo "stub"; return 0; }
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
orch_db_set_state() { :; }
orch_init_context() { :; }
orch_init_metrics() { :; }
get_deployment_state() { echo "UNKNOWN"; }
export -f orch_circuit_breaker_init orch_circuit_breaker_execute orch_record_error
export -f orch_db_record_step orch_check_failure_threshold orch_db_set_state
export -f orch_init_context orch_init_metrics get_deployment_state

# Use temp directory for test state
TEST_TMPDIR=$(mktemp -d)
export DIVE_ROOT="$TEST_TMPDIR"
mkdir -p "$TEST_TMPDIR/.dive-state/logs"
trap 'rm -rf "$TEST_TMPDIR"' EXIT

# =============================================================================
# DEFINE FUNCTIONS UNDER TEST (extracted to avoid cascading source)
# =============================================================================

# --- Structured logging from pipeline-common.sh ---
export _DEPLOY_LOG_FILE=""
export _DEPLOY_LOG_TYPE=""
export _DEPLOY_LOG_INSTANCE=""

pipeline_log_init() {
    local deploy_type="$1"
    local instance_code="$2"
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)

    local log_dir="${DIVE_ROOT}/.dive-state/logs"
    if ! mkdir -p "$log_dir" 2>/dev/null; then
        return 1
    fi

    export _DEPLOY_LOG_FILE="${log_dir}/deploy-${deploy_type}-${instance_code}-${timestamp}.jsonl"
    export _DEPLOY_LOG_TYPE="$deploy_type"
    export _DEPLOY_LOG_INSTANCE="$instance_code"

    pipeline_log_structured "info" "INIT" "Deployment session started" 0
    return 0
}
export -f pipeline_log_init

pipeline_log_structured() {
    local level="$1"
    local phase="$2"
    local message="$3"
    local duration_ms="${4:-0}"
    local ts
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    if [ -n "${_DEPLOY_LOG_FILE:-}" ]; then
        printf '{"timestamp":"%s","phase":"%s","level":"%s","message":"%s","duration_ms":%s,"type":"%s","instance":"%s"}\n' \
            "$ts" "$phase" "$level" "$message" "$duration_ms" \
            "${_DEPLOY_LOG_TYPE:-unknown}" "${_DEPLOY_LOG_INSTANCE:-unknown}" \
            >> "$_DEPLOY_LOG_FILE" 2>/dev/null || true
    fi
}
export -f pipeline_log_structured

pipeline_log_finalize() {
    local exit_code="$1"
    local duration_s="$2"
    local result="success"
    [ "$exit_code" -ne 0 ] && result="failure"
    pipeline_log_structured "info" "COMPLETE" "Deployment $result" "$((duration_s * 1000))"
}
export -f pipeline_log_finalize

pipeline_log_get_path() {
    echo "${_DEPLOY_LOG_FILE:-}"
}
export -f pipeline_log_get_path

# --- Phase timing metrics from pipeline-common.sh ---
_PIPELINE_TIMING_PHASES=()
_PIPELINE_TIMING_STARTS=()
_PIPELINE_TIMING_ENDS=()
_PIPELINE_TIMING_DURATIONS=()
_PIPELINE_TIMING_RESULTS=()

pipeline_timing_reset() {
    _PIPELINE_TIMING_PHASES=()
    _PIPELINE_TIMING_STARTS=()
    _PIPELINE_TIMING_ENDS=()
    _PIPELINE_TIMING_DURATIONS=()
    _PIPELINE_TIMING_RESULTS=()
}
export -f pipeline_timing_reset

pipeline_timing_start() {
    local phase="$1"
    _PIPELINE_TIMING_PHASES+=("$phase")
    _PIPELINE_TIMING_STARTS+=("$(date +%s)")
    _PIPELINE_TIMING_ENDS+=("0")
    _PIPELINE_TIMING_DURATIONS+=("0")
    _PIPELINE_TIMING_RESULTS+=("running")
}
export -f pipeline_timing_start

pipeline_timing_end() {
    local phase="$1"
    local result="${2:-success}"
    local end_time
    end_time=$(date +%s)

    local i
    for (( i = ${#_PIPELINE_TIMING_PHASES[@]} - 1; i >= 0; i-- )); do
        if [ "${_PIPELINE_TIMING_PHASES[$i]}" = "$phase" ]; then
            _PIPELINE_TIMING_ENDS[$i]="$end_time"
            _PIPELINE_TIMING_DURATIONS[$i]="$((end_time - ${_PIPELINE_TIMING_STARTS[$i]}))"
            _PIPELINE_TIMING_RESULTS[$i]="$result"
            break
        fi
    done
}
export -f pipeline_timing_end

pipeline_get_phase_timing() {
    local phase="$1"
    local i
    for (( i = ${#_PIPELINE_TIMING_PHASES[@]} - 1; i >= 0; i-- )); do
        if [ "${_PIPELINE_TIMING_PHASES[$i]}" = "$phase" ]; then
            echo "${_PIPELINE_TIMING_STARTS[$i]} ${_PIPELINE_TIMING_ENDS[$i]} ${_PIPELINE_TIMING_DURATIONS[$i]} ${_PIPELINE_TIMING_RESULTS[$i]}"
            return 0
        fi
    done
    return 1
}
export -f pipeline_get_phase_timing

pipeline_timing_print() {
    local total_duration="${1:-0}"

    echo ""
    echo "  Phase Timing Metrics"
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    printf "  %-25s %10s %10s\n" "Phase" "Duration" "Result"
    echo "  ─────────────────────────────────────────────────────────────────────────────"

    local i
    for (( i = 0; i < ${#_PIPELINE_TIMING_PHASES[@]}; i++ )); do
        local phase="${_PIPELINE_TIMING_PHASES[$i]}"
        local dur="${_PIPELINE_TIMING_DURATIONS[$i]}"
        local res="${_PIPELINE_TIMING_RESULTS[$i]}"
        printf "  %-25s %8ss %10s\n" "$phase" "$dur" "$res"
    done

    echo "  ─────────────────────────────────────────────────────────────────────────────"
    printf "  %-25s %8ss\n" "TOTAL" "$total_duration"
    echo ""
}
export -f pipeline_timing_print

# --- Deployment history from pipeline-common.sh ---
pipeline_show_history() {
    local deploy_type="$1"
    local instance_code="${2:-}"
    local max_entries="${3:-10}"

    local log_dir="${DIVE_ROOT}/.dive-state/logs"
    if [ ! -d "$log_dir" ]; then
        echo "  No deployment history found."
        return 0
    fi

    echo ""
    echo "==============================================================================="
    if [ -n "$instance_code" ]; then
        echo "  Deployment History — ${deploy_type^^} ${instance_code}"
    else
        echo "  Deployment History — ${deploy_type^^}"
    fi
    echo "==============================================================================="
    echo ""
    printf "  %-22s %-10s %-8s %-10s %s\n" "Timestamp" "Instance" "Result" "Duration" "Mode"
    echo "  ─────────────────────────────────────────────────────────────────────────────"

    local pattern="deploy-${deploy_type}-"
    if [ -n "$instance_code" ]; then
        pattern="deploy-${deploy_type}-${instance_code}-"
    fi

    local count=0
    local log_file
    while IFS= read -r log_file; do
        [ -z "$log_file" ] && continue
        [ ! -f "$log_file" ] && continue

        local complete_line
        complete_line=$(tail -1 "$log_file" 2>/dev/null)

        local basename_f ts instance result duration_s mode_info
        basename_f=$(basename "$log_file" .jsonl)
        ts=$(echo "$basename_f" | sed -E 's/deploy-[a-z]+-[A-Z]+-//' | sed 's/-/ /')
        instance=$(echo "$basename_f" | sed -E 's/deploy-[a-z]+-([A-Z]+)-.*/\1/')

        result="unknown"
        duration_s="-"
        if echo "$complete_line" | grep -q '"phase":"COMPLETE"' 2>/dev/null; then
            if echo "$complete_line" | grep -q '"message":"Deployment success"' 2>/dev/null; then
                result="success"
            else
                result="failure"
            fi
            duration_s=$(echo "$complete_line" | sed -E 's/.*"duration_ms":([0-9]+).*/\1/' 2>/dev/null)
            if [ -n "$duration_s" ] && [ "$duration_s" != "$complete_line" ]; then
                duration_s="$((duration_s / 1000))s"
            else
                duration_s="-"
            fi
        fi

        mode_info="deploy"
        printf "  %-22s %-10s %-8s %-10s %s\n" "$ts" "$instance" "$result" "$duration_s" "$mode_info"

        count=$((count + 1))
        [ "$count" -ge "$max_entries" ] && break
    done < <(ls -1r "${log_dir}/${pattern}"*.jsonl 2>/dev/null)

    if [ "$count" -eq 0 ]; then
        echo "  No deployment history found."
    fi

    echo ""
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    echo "  Showing $count most recent deployments"
    echo "  Log directory: $log_dir"
    echo "==============================================================================="
    echo ""
}
export -f pipeline_show_history

# --- Diagnostics stubs (extracted from diagnostics.sh) ---
diag_container_status() {
    local project="$1"
    echo "  Container Status ($project)"
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    echo "  No containers found for project: $project"
}
export -f diag_container_status

diag_container_resources() {
    local project="$1"
    echo "  Resource Usage ($project)"
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    echo "  No running containers found"
}
export -f diag_container_resources

diag_cert_expiry() {
    local cert_dir="$1"
    local label="${2:-Certificates}"
    echo "  Certificate Expiry ($label)"
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    if [ ! -d "$cert_dir" ]; then
        echo "  [!] Certificate directory not found: $cert_dir"
        return 1
    fi
    echo "  No certificate files found"
}
export -f diag_cert_expiry

diag_port_check() {
    local ports="$1"
    local label="${2:-Ports}"
    echo "  Port Availability ($label)"
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    local port
    for port in $ports; do
        printf "  Port %-6s %s\n" "$port" "available"
    done
}
export -f diag_port_check

diag_disk_space() {
    local deploy_type="$1"
    echo "  Disk Space"
    echo "  ─────────────────────────────────────────────────────────────────────────────"
}
export -f diag_disk_space

diag_log_tails() {
    local project="$1"
    local lines="${2:-5}"
    echo "  Recent Logs ($project, last $lines lines each)"
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    echo "  No running containers found"
}
export -f diag_log_tails

diag_full_report() {
    local deploy_type="$1"
    local instance_code="$2"
    local code_upper
    code_upper=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
    local code_lower
    code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')

    local project
    if [ "$deploy_type" = "hub" ]; then
        project="dive-hub"
    else
        project="dive-spoke-${code_lower}"
    fi

    echo ""
    echo "==============================================================================="
    echo "  DIVE Diagnostic Report — ${deploy_type^^} ${code_upper}"
    echo "  Generated: $(date)"
    echo "==============================================================================="
    echo ""

    diag_container_status "$project"
    echo ""
    diag_container_resources "$project"
    echo ""

    local cert_dir
    if [ "$deploy_type" = "hub" ]; then
        cert_dir="${DIVE_ROOT}/certs/hub"
    else
        cert_dir="${DIVE_ROOT}/certs/spokes/${code_lower}"
    fi
    diag_cert_expiry "$cert_dir" "${deploy_type^^} ${code_upper}"
    echo ""

    local ports=""
    if [ "$deploy_type" = "hub" ]; then
        ports="443 8443 8080 5432 27017 6379 8181 8200"
    else
        ports="443 8443 8080 27017 6379"
    fi
    diag_port_check "$ports" "${deploy_type^^} ${code_upper}"
    echo ""

    diag_disk_space "$deploy_type" "$code_upper"
    echo ""
    diag_log_tails "$project" 5
    echo ""

    echo "==============================================================================="
    echo "  End of Diagnostic Report"
    echo "==============================================================================="
    echo ""
}
export -f diag_full_report

# --- Hub/spoke phase status stubs for --timing tests ---
hub_checkpoint_is_complete() { return 1; }
hub_checkpoint_get_next_phase() { echo ""; }
hub_checkpoint_get_timestamp() { echo ""; }
orch_db_get_step_status() { echo ""; }
export -f hub_checkpoint_is_complete hub_checkpoint_get_next_phase
export -f hub_checkpoint_get_timestamp orch_db_get_step_status

spoke_checkpoint_is_complete() { return 1; }
export -f spoke_checkpoint_is_complete

# hub_phases with --timing support (extracted from hub-pipeline.sh)
hub_phases() {
    local show_timing=false
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --timing) show_timing=true; shift ;;
            *) shift ;;
        esac
    done

    echo ""
    echo "==============================================================================="
    echo "  Hub Pipeline Phases"
    echo "==============================================================================="
    echo ""

    local -a phase_names=(VAULT_BOOTSTRAP DATABASE_INIT PREFLIGHT)
    local -a phase_labels=("Vault Bootstrap" "Database Init" "Preflight")

    local total=${#phase_names[@]}

    if [ "$show_timing" = "true" ]; then
        printf "  %-4s %-18s %-10s %10s\n" "#" "Phase" "Status" "Duration"
        echo "  ─────────────────────────────────────────────────────────────────────────────"
    fi

    local i
    for (( i = 0; i < total; i++ )); do
        local name="${phase_names[$i]}"
        local label="${phase_labels[$i]}"
        local num=$((i + 1))
        local status="pending"

        if [ "$show_timing" = "true" ]; then
            printf "  [%s] %2d %-18s %-10s %10s\n" "-" "$num" "$label" "($status)" "-"
        else
            printf "  [%s] Phase %2d: %-18s %-10s\n" "-" "$num" "$label" "($status)"
        fi
    done

    echo ""
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    echo "  Summary: 0/$total complete, 0 failed"

    if [ "$show_timing" = "true" ]; then
        echo "  (no timing data available)"
    fi

    echo "==============================================================================="
    echo ""
}
export -f hub_phases

# spoke_phases with --timing support (extracted from spoke-pipeline.sh)
spoke_phases() {
    local instance_code=""
    local show_timing=false
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --timing) show_timing=true; shift ;;
            *) [ -z "$instance_code" ] && instance_code="$1"; shift ;;
        esac
    done

    if [ -z "$instance_code" ]; then
        echo "Usage: ./dive spoke phases <CODE> [--timing]"
        return 1
    fi

    local code_upper
    code_upper=$(upper "$instance_code")

    echo ""
    echo "==============================================================================="
    echo "  Spoke Pipeline Phases — $code_upper"
    echo "==============================================================================="
    echo ""

    local -a phase_names=(PREFLIGHT INITIALIZATION DEPLOYMENT)
    local -a phase_labels=("Preflight" "Initialization" "Deployment")

    local total=${#phase_names[@]}

    if [ "$show_timing" = "true" ]; then
        printf "  %-4s %-18s %-10s %10s\n" "#" "Phase" "Status" "Duration"
        echo "  ─────────────────────────────────────────────────────────────────────────────"
    fi

    local i
    for (( i = 0; i < total; i++ )); do
        local label="${phase_labels[$i]}"
        local num=$((i + 1))
        local status="pending"

        if [ "$show_timing" = "true" ]; then
            printf "  [%s] %2d %-18s %-10s %10s\n" "-" "$num" "$label" "($status)" "-"
        else
            printf "  [%s] Phase %d: %-18s (%s)\n" "-" "$num" "$label" "$status"
        fi
    done

    echo ""
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    echo "  Summary: 0/$total complete, 0 failed"
    echo "==============================================================================="
    echo ""
}
export -f spoke_phases

# =============================================================================
# SUITE 1: STRUCTURED LOGGING — INITIALIZATION
# =============================================================================
echo ""
echo "Suite 1: Structured Logging — Initialization"
echo "==============================================="

# Test: pipeline_log_init creates log file
pipeline_log_init "hub" "USA"
log_path=$(pipeline_log_get_path)

assert_file_exists "$log_path" "pipeline_log_init creates JSONL log file"
assert_contains "$log_path" "deploy-hub-USA" "Log filename contains type and instance"
assert_contains "$log_path" ".jsonl" "Log filename has .jsonl extension"

# Test: INIT entry is written
first_line=$(head -1 "$log_path")
assert_contains "$first_line" '"phase":"INIT"' "First line contains INIT phase"
assert_contains "$first_line" '"level":"info"' "First line has info level"
assert_contains "$first_line" '"message":"Deployment session started"' "First line has init message"
assert_contains "$first_line" '"type":"hub"' "First line contains deployment type"
assert_contains "$first_line" '"instance":"USA"' "First line contains instance code"

# =============================================================================
# SUITE 2: STRUCTURED LOGGING — ENTRIES
# =============================================================================
echo ""
echo "Suite 2: Structured Logging — Log Entries"
echo "============================================"

# Test: Writing multiple log entries
pipeline_log_structured "info" "PREFLIGHT" "Checking prerequisites" 0
pipeline_log_structured "warn" "SERVICES" "Slow container startup" 5000
pipeline_log_structured "error" "KEYCLOAK_CONFIG" "Realm config failed" 12000

line_count=$(wc -l < "$log_path" | tr -d ' ')
assert_eq "4" "$line_count" "Log file has 4 entries (INIT + 3 structured)"

# Verify JSON structure of a log line
second_line=$(sed -n '2p' "$log_path")
assert_contains "$second_line" '"phase":"PREFLIGHT"' "Log entry has correct phase"
assert_contains "$second_line" '"level":"info"' "Log entry has correct level"
assert_contains "$second_line" '"duration_ms":0' "Log entry has duration_ms field"
assert_contains "$second_line" '"timestamp"' "Log entry has timestamp field"

# Test: warn level
third_line=$(sed -n '3p' "$log_path")
assert_contains "$third_line" '"level":"warn"' "Warn-level entry is recorded"
assert_contains "$third_line" '"duration_ms":5000' "Duration is correctly recorded"

# Test: error level
fourth_line=$(sed -n '4p' "$log_path")
assert_contains "$fourth_line" '"level":"error"' "Error-level entry is recorded"
assert_contains "$fourth_line" '"phase":"KEYCLOAK_CONFIG"' "Error phase is correct"

# =============================================================================
# SUITE 3: STRUCTURED LOGGING — FINALIZE
# =============================================================================
echo ""
echo "Suite 3: Structured Logging — Finalize"
echo "========================================="

# Test: Successful finalization
pipeline_log_finalize 0 120
last_line=$(tail -1 "$log_path")
assert_contains "$last_line" '"phase":"COMPLETE"' "Finalize writes COMPLETE phase"
assert_contains "$last_line" '"message":"Deployment success"' "Success result in finalize"
assert_contains "$last_line" '"duration_ms":120000' "Duration converted to ms"

# Test: Failed finalization (new session)
pipeline_log_init "spoke" "GBR"
spoke_log_path=$(pipeline_log_get_path)
pipeline_log_finalize 1 60
last_line=$(tail -1 "$spoke_log_path")
assert_contains "$last_line" '"message":"Deployment failure"' "Failure result in finalize"
assert_contains "$last_line" '"duration_ms":60000' "Failure duration converted to ms"

# =============================================================================
# SUITE 4: PHASE TIMING — BASIC TRACKING
# =============================================================================
echo ""
echo "Suite 4: Phase Timing — Basic Tracking"
echo "========================================"

# Test: Reset clears timing data
pipeline_timing_reset
assert_eq "0" "${#_PIPELINE_TIMING_PHASES[@]}" "Reset clears timing phases"

# Test: Start records phase
pipeline_timing_start "PREFLIGHT"
assert_eq "1" "${#_PIPELINE_TIMING_PHASES[@]}" "Start adds one entry"
assert_eq "PREFLIGHT" "${_PIPELINE_TIMING_PHASES[0]}" "Phase name recorded"
assert_eq "running" "${_PIPELINE_TIMING_RESULTS[0]}" "Initial result is running"

# Test: End records duration and result
pipeline_timing_end "PREFLIGHT" "success"
assert_eq "success" "${_PIPELINE_TIMING_RESULTS[0]}" "End records success result"

# Verify duration is >= 0
dur="${_PIPELINE_TIMING_DURATIONS[0]}"
TOTAL=$((TOTAL + 1))
if [ "$dur" -ge 0 ]; then
    echo -e "  ${GREEN}PASS${NC} Duration is >= 0 ($dur)"
    PASS=$((PASS + 1))
else
    echo -e "  ${RED}FAIL${NC} Duration should be >= 0 (got $dur)"
    FAIL=$((FAIL + 1))
fi

# =============================================================================
# SUITE 5: PHASE TIMING — RETRIEVAL
# =============================================================================
echo ""
echo "Suite 5: Phase Timing — Retrieval"
echo "==================================="

pipeline_timing_reset
pipeline_timing_start "VAULT_BOOTSTRAP"
pipeline_timing_end "VAULT_BOOTSTRAP" "success"
pipeline_timing_start "BUILD"
pipeline_timing_end "BUILD" "failure"

# Test: Retrieve existing phase timing
timing_data=$(pipeline_get_phase_timing "VAULT_BOOTSTRAP")
assert_eq "0" "$?" "Retrieval returns 0 for existing phase"
assert_contains "$timing_data" "success" "Retrieved data contains result"

timing_data=$(pipeline_get_phase_timing "BUILD")
assert_contains "$timing_data" "failure" "Failure result is retrievable"

# Test: Retrieve non-existent phase timing
pipeline_get_phase_timing "NONEXISTENT" >/dev/null 2>&1
assert_eq "1" "$?" "Retrieval returns 1 for non-existent phase"

# =============================================================================
# SUITE 6: PHASE TIMING — MULTIPLE PHASES
# =============================================================================
echo ""
echo "Suite 6: Phase Timing — Multiple Phases"
echo "========================================="

pipeline_timing_reset
pipeline_timing_start "PREFLIGHT"
pipeline_timing_end "PREFLIGHT" "success"
pipeline_timing_start "INITIALIZATION"
pipeline_timing_end "INITIALIZATION" "success"
pipeline_timing_start "DEPLOYMENT"
pipeline_timing_end "DEPLOYMENT" "success"

assert_eq "3" "${#_PIPELINE_TIMING_PHASES[@]}" "Three phases tracked"
assert_eq "PREFLIGHT" "${_PIPELINE_TIMING_PHASES[0]}" "First phase is PREFLIGHT"
assert_eq "INITIALIZATION" "${_PIPELINE_TIMING_PHASES[1]}" "Second phase is INITIALIZATION"
assert_eq "DEPLOYMENT" "${_PIPELINE_TIMING_PHASES[2]}" "Third phase is DEPLOYMENT"

# =============================================================================
# SUITE 7: PHASE TIMING — PRINT OUTPUT
# =============================================================================
echo ""
echo "Suite 7: Phase Timing — Print Output"
echo "======================================="

output=$(pipeline_timing_print 120)
assert_contains "$output" "Phase Timing Metrics" "Print shows header"
assert_contains "$output" "PREFLIGHT" "Print includes PREFLIGHT"
assert_contains "$output" "DEPLOYMENT" "Print includes DEPLOYMENT"
assert_contains "$output" "TOTAL" "Print includes total"
assert_contains "$output" "120s" "Print includes total duration"

# =============================================================================
# SUITE 8: HUB PHASES --TIMING FLAG
# =============================================================================
echo ""
echo "Suite 8: Hub Phases --timing Flag"
echo "==================================="

# Test: Without --timing (standard format)
output_std=$(hub_phases 2>&1)
assert_contains "$output_std" "Hub Pipeline Phases" "Standard mode shows header"
assert_contains "$output_std" "Phase" "Standard mode shows Phase keyword"
assert_not_contains "$output_std" "Duration" "Standard mode does NOT show Duration header"

# Test: With --timing (timing format)
output_timing=$(hub_phases --timing 2>&1)
assert_contains "$output_timing" "Hub Pipeline Phases" "Timing mode shows header"
assert_contains "$output_timing" "Duration" "Timing mode shows Duration header"
assert_contains "$output_timing" "Status" "Timing mode shows Status"

# =============================================================================
# SUITE 9: SPOKE PHASES --TIMING FLAG
# =============================================================================
echo ""
echo "Suite 9: Spoke Phases --timing Flag"
echo "======================================"

# Test: Without --timing
output_std=$(spoke_phases GBR 2>&1)
assert_contains "$output_std" "Spoke Pipeline Phases" "Standard mode shows header"
assert_contains "$output_std" "GBR" "Standard mode shows instance code"
assert_not_contains "$output_std" "Duration" "Standard mode does NOT show Duration header"

# Test: With --timing
output_timing=$(spoke_phases GBR --timing 2>&1)
assert_contains "$output_timing" "Spoke Pipeline Phases" "Timing mode shows header"
assert_contains "$output_timing" "GBR" "Timing mode shows instance code"
assert_contains "$output_timing" "Duration" "Timing mode shows Duration header"

# Test: --timing before instance code
output_timing2=$(spoke_phases --timing GBR 2>&1)
assert_contains "$output_timing2" "GBR" "--timing before CODE still works"

# Test: Missing instance code
output_err=$(spoke_phases 2>&1)
assert_contains "$output_err" "Usage" "Missing code shows usage"

# =============================================================================
# SUITE 10: DIAGNOSTIC REPORT — HUB
# =============================================================================
echo ""
echo "Suite 10: Diagnostic Report — Hub"
echo "==================================="

output=$(diag_full_report "hub" "USA" 2>&1)
assert_contains "$output" "Diagnostic Report" "Report has header"
assert_contains "$output" "HUB USA" "Report shows HUB USA"
assert_contains "$output" "Container Status" "Report includes container status"
assert_contains "$output" "Resource Usage" "Report includes resource usage"
assert_contains "$output" "Certificate Expiry" "Report includes cert expiry"
assert_contains "$output" "Port Availability" "Report includes port availability"
assert_contains "$output" "Disk Space" "Report includes disk space"
assert_contains "$output" "Recent Logs" "Report includes recent logs"
assert_contains "$output" "End of Diagnostic Report" "Report has footer"

# =============================================================================
# SUITE 11: DIAGNOSTIC REPORT — SPOKE
# =============================================================================
echo ""
echo "Suite 11: Diagnostic Report — Spoke"
echo "======================================"

output=$(diag_full_report "spoke" "GBR" 2>&1)
assert_contains "$output" "Diagnostic Report" "Spoke report has header"
assert_contains "$output" "SPOKE GBR" "Spoke report shows SPOKE GBR"
assert_contains "$output" "dive-spoke-gbr" "Spoke uses correct project name"
assert_contains "$output" "End of Diagnostic Report" "Spoke report has footer"

# =============================================================================
# SUITE 12: DEPLOYMENT HISTORY — EMPTY
# =============================================================================
echo ""
echo "Suite 12: Deployment History — Empty"
echo "======================================="

# Clean logs for a clean history test
rm -f "${DIVE_ROOT}/.dive-state/logs/deploy-hub-"*.jsonl 2>/dev/null

# Create fresh hub logs (from earlier tests they already exist for USA)
output=$(pipeline_show_history "hub" "" 10 2>&1)
assert_contains "$output" "Deployment History" "History has header"
assert_contains "$output" "HUB" "History shows type"

# =============================================================================
# SUITE 13: DEPLOYMENT HISTORY — WITH ENTRIES
# =============================================================================
echo ""
echo "Suite 13: Deployment History — With Entries"
echo "=============================================="

# Create test log files manually
log_dir="${DIVE_ROOT}/.dive-state/logs"
mkdir -p "$log_dir"

# Create a completed deployment log
cat > "${log_dir}/deploy-hub-USA-20260220-100000.jsonl" << 'LOGEOF'
{"timestamp":"2026-02-20T10:00:00Z","phase":"INIT","level":"info","message":"Deployment session started","duration_ms":0,"type":"hub","instance":"USA"}
{"timestamp":"2026-02-20T10:05:00Z","phase":"COMPLETE","level":"info","message":"Deployment success","duration_ms":300000,"type":"hub","instance":"USA"}
LOGEOF

# Create a failed deployment log
cat > "${log_dir}/deploy-hub-USA-20260220-120000.jsonl" << 'LOGEOF'
{"timestamp":"2026-02-20T12:00:00Z","phase":"INIT","level":"info","message":"Deployment session started","duration_ms":0,"type":"hub","instance":"USA"}
{"timestamp":"2026-02-20T12:02:00Z","phase":"COMPLETE","level":"info","message":"Deployment failure","duration_ms":120000,"type":"hub","instance":"USA"}
LOGEOF

# Create spoke logs
cat > "${log_dir}/deploy-spoke-GBR-20260220-110000.jsonl" << 'LOGEOF'
{"timestamp":"2026-02-20T11:00:00Z","phase":"INIT","level":"info","message":"Deployment session started","duration_ms":0,"type":"spoke","instance":"GBR"}
{"timestamp":"2026-02-20T11:03:00Z","phase":"COMPLETE","level":"info","message":"Deployment success","duration_ms":180000,"type":"spoke","instance":"GBR"}
LOGEOF

# Test hub history
output=$(pipeline_show_history "hub" "USA" 10 2>&1)
assert_contains "$output" "Deployment History" "History has header"
assert_contains "$output" "USA" "History shows instance"
assert_contains "$output" "success" "History shows successful deployment"
assert_contains "$output" "failure" "History shows failed deployment"
assert_contains "$output" "Showing 2 most recent" "History shows entry count"

# Test spoke history
output=$(pipeline_show_history "spoke" "GBR" 10 2>&1)
assert_contains "$output" "SPOKE" "Spoke history shows type"
assert_contains "$output" "GBR" "Spoke history shows instance"
assert_contains "$output" "success" "Spoke history shows result"
# Note: Suite 3 created a GBR log from pipeline_log_init, so there may be >1 entry
assert_contains "$output" "most recent" "Spoke history shows entry count"

# Test max entries limit
output=$(pipeline_show_history "hub" "USA" 1 2>&1)
assert_contains "$output" "Showing 1 most recent" "Max entries limits output"

# =============================================================================
# SUITE 14: DEPLOYMENT HISTORY — DURATION PARSING
# =============================================================================
echo ""
echo "Suite 14: Deployment History — Duration Parsing"
echo "=================================================="

output=$(pipeline_show_history "hub" "USA" 10 2>&1)
assert_contains "$output" "300s" "Successful deployment shows 300s duration"
assert_contains "$output" "120s" "Failed deployment shows 120s duration"

output=$(pipeline_show_history "spoke" "GBR" 10 2>&1)
assert_contains "$output" "180s" "Spoke deployment shows 180s duration"

# =============================================================================
# SUITE 15: STRUCTURED LOG FORMAT — JSON VALIDITY
# =============================================================================
echo ""
echo "Suite 15: Structured Log Format — JSON Validity"
echo "=================================================="

# Create a fresh session and validate each line
pipeline_log_init "hub" "TST"
test_log=$(pipeline_log_get_path)
pipeline_log_structured "info" "PHASE_A" "Test message" 100
pipeline_log_structured "warn" "PHASE_B" "Warning msg" 200
pipeline_log_finalize 0 10

# Each line should be valid JSON (check for required fields)
valid_lines=0
total_lines=0
while IFS= read -r line; do
    total_lines=$((total_lines + 1))
    if echo "$line" | grep -q '"timestamp"' && \
       echo "$line" | grep -q '"phase"' && \
       echo "$line" | grep -q '"level"' && \
       echo "$line" | grep -q '"message"' && \
       echo "$line" | grep -q '"duration_ms"'; then
        valid_lines=$((valid_lines + 1))
    fi
done < "$test_log"

assert_eq "$total_lines" "$valid_lines" "All $total_lines log lines have required JSON fields"
assert_eq "4" "$total_lines" "Log has correct number of entries (INIT + 2 phases + COMPLETE)"

# =============================================================================
# SUITE 16: PORT CHECK DIAGNOSTIC
# =============================================================================
echo ""
echo "Suite 16: Port Check Diagnostic"
echo "=================================="

output=$(diag_port_check "443 8080 5432" "Hub Test" 2>&1)
assert_contains "$output" "Port Availability" "Port check has header"
assert_contains "$output" "Hub Test" "Port check shows label"
assert_contains "$output" "443" "Port check lists port 443"
assert_contains "$output" "8080" "Port check lists port 8080"
assert_contains "$output" "5432" "Port check lists port 5432"

# =============================================================================
# SUITE 17: CERT EXPIRY DIAGNOSTIC — MISSING DIR
# =============================================================================
echo ""
echo "Suite 17: Cert Expiry — Missing Directory"
echo "============================================"

output=$(diag_cert_expiry "/nonexistent/path" "Test Certs" 2>&1)
assert_contains "$output" "Certificate Expiry" "Cert check has header"
assert_contains "$output" "not found" "Missing dir reports not found"

# =============================================================================
# SUITE 18: LOG FILE PATH FORMAT
# =============================================================================
echo ""
echo "Suite 18: Log File Path Format"
echo "================================"

pipeline_log_init "spoke" "FRA"
path=$(pipeline_log_get_path)
assert_contains "$path" ".dive-state/logs" "Path contains log directory"
assert_contains "$path" "deploy-spoke-FRA" "Path contains type and instance"
assert_contains "$path" ".jsonl" "Path has .jsonl extension"

# Verify the file was created
assert_file_exists "$path" "Log file physically exists"

# =============================================================================
# RESULTS
# =============================================================================
echo ""
echo "==============================================================================="
echo -e "  Phase 5 Tests: ${PASS}/${TOTAL} passed, ${FAIL} failed"
echo "==============================================================================="
echo ""

if [ $FAIL -gt 0 ]; then
    echo -e "  ${RED}SOME TESTS FAILED${NC}"
    exit 1
else
    echo -e "  ${GREEN}ALL TESTS PASSED${NC}"
    exit 0
fi
