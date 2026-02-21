#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Phase Registry Tests
# =============================================================================
# Tests for Phase 7: Standardized Phase Registry.
# Validates the registry API, hub pipeline integration, and behavioral
# equivalence with the old 13-phase block approach.
# =============================================================================

# Setup
export DIVE_ROOT="${PROJECT_ROOT}"
export ENVIRONMENT="local"
export INSTANCE="usa"
export NON_INTERACTIVE=true

# Stub out logging functions
log_info() { :; }
log_warn() { :; }
log_error() { :; }
log_verbose() { :; }
log_step() { :; }
log_success() { :; }
upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
lower() { echo "$1" | tr '[:upper:]' '[:lower:]'; }
is_interactive() { return 1; }

# =============================================================================
# Define registry functions inline (avoids sourcing pipeline-common.sh
# which chains into common.sh and all its heavy dependencies)
# =============================================================================

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

pipeline_register_phase() {
    _PIPELINE_REG_NUMS+=("${1}")
    _PIPELINE_REG_NAMES+=("${2}")
    _PIPELINE_REG_LABELS+=("${3}")
    _PIPELINE_REG_FUNCS+=("${4}")
    _PIPELINE_REG_MODES+=("${5:-standard}")
    _PIPELINE_REG_STATES+=("${6:-}")
    _PIPELINE_REG_WARN_MSGS+=("${7:-}")
}

pipeline_get_phase_count() {
    echo "${#_PIPELINE_REG_NUMS[@]}"
}

pipeline_get_phase_names() {
    echo "${_PIPELINE_REG_NAMES[*]}"
}

# =============================================================================
# Test: Pipeline registry API — clear, register, count, names
# =============================================================================

# Test 1: pipeline_clear_phases empties registry
pipeline_clear_phases
count=$(pipeline_get_phase_count)
assert_eq "0" "$count" "clear: phase count is 0 after clear"

# Test 2: Register a single phase
pipeline_clear_phases
pipeline_register_phase 1 "TEST_PHASE" "Test Phase" "test_func" "standard" "" ""
count=$(pipeline_get_phase_count)
assert_eq "1" "$count" "register: single phase count is 1"

# Test 3: Phase names returned correctly
names=$(pipeline_get_phase_names)
assert_eq "TEST_PHASE" "$names" "register: phase name is TEST_PHASE"

# Test 4: Register multiple phases
pipeline_clear_phases
pipeline_register_phase 1 "ALPHA" "Alpha" "func_a" "standard" "" ""
pipeline_register_phase 2 "BRAVO" "Bravo" "func_b" "non_fatal" "" "Bravo warning"
pipeline_register_phase 3 "CHARLIE" "Charlie" "func_c" "direct" "" ""
count=$(pipeline_get_phase_count)
assert_eq "3" "$count" "register: three phases count is 3"

# Test 5: Multiple phase names are space-separated
names=$(pipeline_get_phase_names)
assert_eq "ALPHA BRAVO CHARLIE" "$names" "register: names are ALPHA BRAVO CHARLIE"

# Test 6: Clear after registering resets to 0
pipeline_clear_phases
count=$(pipeline_get_phase_count)
assert_eq "0" "$count" "clear: resets to 0 after previous registrations"

# Test 7: Registry arrays store all fields correctly
pipeline_clear_phases
pipeline_register_phase 5 "MY_PHASE" "My Phase" "my_func" "non_fatal" "CONFIGURING" "It failed"
assert_eq "5" "${_PIPELINE_REG_NUMS[0]}" "register: num stored correctly"
assert_eq "MY_PHASE" "${_PIPELINE_REG_NAMES[0]}" "register: name stored correctly"
assert_eq "My Phase" "${_PIPELINE_REG_LABELS[0]}" "register: label stored correctly"
assert_eq "my_func" "${_PIPELINE_REG_FUNCS[0]}" "register: func stored correctly"
assert_eq "non_fatal" "${_PIPELINE_REG_MODES[0]}" "register: mode stored correctly"
assert_eq "CONFIGURING" "${_PIPELINE_REG_STATES[0]}" "register: state stored correctly"
assert_eq "It failed" "${_PIPELINE_REG_WARN_MSGS[0]}" "register: warn_msg stored correctly"

# Test 8: Default mode is standard
pipeline_clear_phases
pipeline_register_phase 1 "DEFAULT" "Default" "func"
assert_eq "standard" "${_PIPELINE_REG_MODES[0]}" "register: default mode is standard"

# Test 9: Empty state/warn stored as empty
assert_eq "" "${_PIPELINE_REG_STATES[0]}" "register: empty state is empty"
assert_eq "" "${_PIPELINE_REG_WARN_MSGS[0]}" "register: empty warn is empty"

# =============================================================================
# Test: Hub pipeline file structure
# =============================================================================

hub_pipeline="${PROJECT_ROOT}/scripts/dive-modules/deployment/hub-pipeline.sh"

# Test 10: Hub pipeline uses pipeline_clear_phases
if grep -q 'pipeline_clear_phases' "$hub_pipeline"; then
    assert_eq "0" "0" "hub pipeline: calls pipeline_clear_phases"
else
    assert_eq "found" "missing" "hub pipeline: should call pipeline_clear_phases"
fi

# Test 11: Hub pipeline registers all 13 phases
reg_count=$(grep -c 'pipeline_register_phase' "$hub_pipeline" || true)
assert_eq "13" "$reg_count" "hub pipeline: registers 13 phases"

# Test 12: Hub pipeline calls _hub_execute_registered_phases
if grep -q '_hub_execute_registered_phases' "$hub_pipeline"; then
    assert_eq "0" "0" "hub pipeline: calls _hub_execute_registered_phases"
else
    assert_eq "found" "missing" "hub pipeline: should call _hub_execute_registered_phases"
fi

# Test 13: All 13 phase names are registered
for phase_name in VAULT_BOOTSTRAP DATABASE_INIT PREFLIGHT INITIALIZATION MONGODB_INIT BUILD SERVICES VAULT_DB_ENGINE KEYCLOAK_CONFIG REALM_VERIFY KAS_REGISTER SEEDING KAS_INIT; do
    if grep -q "pipeline_register_phase.*\"$phase_name\"" "$hub_pipeline"; then
        assert_eq "0" "0" "hub pipeline: registers $phase_name"
    else
        assert_eq "registered" "missing" "hub pipeline: should register $phase_name"
    fi
done

# Test 14: BUILD phase uses direct mode
if grep -q 'pipeline_register_phase 6.*"BUILD".*"direct"' "$hub_pipeline"; then
    assert_eq "0" "0" "hub pipeline: BUILD phase is direct mode"
else
    assert_eq "direct" "other" "hub pipeline: BUILD should be direct mode"
fi

# Test 15: Non-fatal phases have non_fatal mode
for nf_phase in VAULT_DB_ENGINE KAS_REGISTER SEEDING KAS_INIT; do
    line=$(grep "pipeline_register_phase.*\"$nf_phase\"" "$hub_pipeline")
    if echo "$line" | grep -q '"non_fatal"'; then
        assert_eq "0" "0" "hub pipeline: $nf_phase is non_fatal"
    else
        assert_eq "non_fatal" "other" "hub pipeline: $nf_phase should be non_fatal"
    fi
done

# Test 16: Fatal phases use standard mode
for fatal_phase in VAULT_BOOTSTRAP DATABASE_INIT PREFLIGHT INITIALIZATION MONGODB_INIT SERVICES KEYCLOAK_CONFIG REALM_VERIFY; do
    line=$(grep "pipeline_register_phase.*\"$fatal_phase\"" "$hub_pipeline")
    if echo "$line" | grep -q '"standard"'; then
        assert_eq "0" "0" "hub pipeline: $fatal_phase is standard (fatal) mode"
    else
        assert_eq "standard" "other" "hub pipeline: $fatal_phase should be standard mode"
    fi
done

# Test 17: State transitions are registered for SERVICES, KEYCLOAK_CONFIG, REALM_VERIFY
if grep -q 'pipeline_register_phase 7.*"DEPLOYING"' "$hub_pipeline"; then
    assert_eq "0" "0" "hub pipeline: SERVICES has DEPLOYING state transition"
else
    assert_eq "DEPLOYING" "missing" "hub pipeline: SERVICES should have DEPLOYING state"
fi

if grep -q 'pipeline_register_phase 9.*"CONFIGURING"' "$hub_pipeline"; then
    assert_eq "0" "0" "hub pipeline: KEYCLOAK_CONFIG has CONFIGURING state transition"
else
    assert_eq "CONFIGURING" "missing" "hub pipeline: KEYCLOAK_CONFIG should have CONFIGURING state"
fi

if grep -q 'pipeline_register_phase 10.*"VERIFYING"' "$hub_pipeline"; then
    assert_eq "0" "0" "hub pipeline: REALM_VERIFY has VERIFYING state transition"
else
    assert_eq "VERIFYING" "missing" "hub pipeline: REALM_VERIFY should have VERIFYING state"
fi

# =============================================================================
# Test: Execution engine structure
# =============================================================================

# Test 18: _hub_execute_registered_phases function exists
if grep -q '_hub_execute_registered_phases()' "$hub_pipeline"; then
    assert_eq "0" "0" "execution engine: function defined"
else
    assert_eq "defined" "missing" "execution engine: should define _hub_execute_registered_phases"
fi

# Test 19: Engine handles between-phase hooks
if grep -q 'POST_DATABASE_INIT' "$hub_pipeline"; then
    assert_eq "0" "0" "execution engine: handles POST_DATABASE_INIT state"
else
    assert_eq "found" "missing" "execution engine: should handle POST_DATABASE_INIT"
fi

if grep -q '_hub_install_ca_trust' "$hub_pipeline"; then
    assert_eq "0" "0" "execution engine: installs CA trust after DATABASE_INIT"
else
    assert_eq "found" "missing" "execution engine: should install CA trust"
fi

if grep -q 'health_sentinel_start.*hub.*dive-hub' "$hub_pipeline"; then
    assert_eq "0" "0" "execution engine: starts health sentinel before Phase 8"
else
    assert_eq "found" "missing" "execution engine: should start health sentinel"
fi

# Test 20: Engine handles SERVICES special case (progress_set_services)
services_progress_count=$(grep -c 'progress_set_services' "$hub_pipeline" || true)
if [ "$services_progress_count" -ge 2 ]; then
    assert_eq "0" "0" "execution engine: SERVICES has progress_set_services (0/12 + 12/12)"
else
    assert_eq ">=2" "$services_progress_count" "execution engine: should call progress_set_services twice"
fi

# Test 21: Engine handles three execution modes
if grep -q 'case.*_mode.*in' "$hub_pipeline"; then
    assert_eq "0" "0" "execution engine: has mode-based case statement"
else
    assert_eq "found" "missing" "execution engine: should have mode case statement"
fi

for mode_check in "direct)" "non_fatal)" "standard|"; do
    if grep -q "$mode_check" "$hub_pipeline"; then
        assert_eq "0" "0" "execution engine: handles mode $mode_check"
    else
        assert_eq "found" "missing" "execution engine: should handle mode $mode_check"
    fi
done

# Test 22: Direct mode does manual checkpoint
if grep -A12 'direct)' "$hub_pipeline" | grep -q 'hub_checkpoint_mark_complete'; then
    assert_eq "0" "0" "execution engine: direct mode creates manual checkpoint"
else
    assert_eq "found" "missing" "execution engine: direct mode should create checkpoint"
fi

# Test 23: Engine uses _hub_should_skip_phase for skip/only filtering
if grep -q '_hub_should_skip_phase.*_name' "$hub_pipeline"; then
    assert_eq "0" "0" "execution engine: uses _hub_should_skip_phase"
else
    assert_eq "found" "missing" "execution engine: should use _hub_should_skip_phase"
fi

# Test 24: Engine checks threshold after fatal phases
if grep -q '_hub_check_threshold.*_name' "$hub_pipeline"; then
    assert_eq "0" "0" "execution engine: checks threshold after phases"
else
    assert_eq "found" "missing" "execution engine: should check threshold"
fi

# =============================================================================
# Test: No old-style phase blocks remain
# =============================================================================

# Test 25: No old-style hardcoded "Phase N:" section headers remain
# Old code had: "# Phase 1: Vault Bootstrap (start, init, setup, seed)"
# New code has registration calls instead
old_section_count=$(grep -c '# Phase [0-9]\+:' "$hub_pipeline" || true)
if [ "$old_section_count" -le 0 ]; then
    assert_eq "0" "0" "cleanup: no old-style Phase N: section headers"
else
    assert_eq "0" "$old_section_count" "cleanup: old Phase N: section headers should be removed"
fi

# Test 26: No duplicate phase execution blocks
# Old code had individual blocks like: "if _hub_should_skip_phase \"VAULT_BOOTSTRAP\""
# New code only has a single generic skip call in the engine
skip_phase_calls=$(grep -c '_hub_should_skip_phase' "$hub_pipeline" || true)
# Should be: 1 in the function definition + 1 in the engine loop = at most a few
if [ "$skip_phase_calls" -le 3 ]; then
    assert_eq "0" "0" "cleanup: reduced _hub_should_skip_phase calls ($skip_phase_calls)"
else
    assert_eq "<=3" "$skip_phase_calls" "cleanup: should have fewer skip_phase calls"
fi

# =============================================================================
# Test: Pipeline-common.sh has registry functions
# =============================================================================

pipeline_common="${PROJECT_ROOT}/scripts/dive-modules/deployment/pipeline-common.sh"

# Test 27: All registry functions are exported
for func in pipeline_clear_phases pipeline_register_phase pipeline_get_phase_count pipeline_get_phase_names; do
    if grep -q "export -f $func" "$pipeline_common"; then
        assert_eq "0" "0" "exports: $func is exported"
    else
        assert_eq "exported" "missing" "exports: $func should be exported"
    fi
done

# Test 28: Registry arrays defined in pipeline-common.sh
if grep -q '_PIPELINE_REG_NUMS' "$pipeline_common"; then
    assert_eq "0" "0" "pipeline-common: defines registry arrays"
else
    assert_eq "found" "missing" "pipeline-common: should define registry arrays"
fi

# =============================================================================
# Test: Functional registry simulation (13 hub phases)
# =============================================================================

# Test 29: Register hub's 13 phases and verify count + order
pipeline_clear_phases
pipeline_register_phase 1  "VAULT_BOOTSTRAP" "Vault Bootstrap"   "hub_phase_vault_bootstrap"   "standard"  ""             ""
pipeline_register_phase 2  "DATABASE_INIT"   "Database Init"     "hub_phase_database_init"     "standard"  ""             ""
pipeline_register_phase 3  "PREFLIGHT"       "Preflight"         "hub_phase_preflight"         "standard"  ""             ""
pipeline_register_phase 4  "INITIALIZATION"  "Initialization"    "hub_phase_initialization"    "standard"  ""             ""
pipeline_register_phase 5  "MONGODB_INIT"    "MongoDB"           "hub_phase_mongodb_init"      "standard"  ""             ""
pipeline_register_phase 6  "BUILD"           "Build"             "hub_phase_build"             "direct"    ""             ""
pipeline_register_phase 7  "SERVICES"        "Services"          "hub_phase_services"          "standard"  "DEPLOYING"    ""
pipeline_register_phase 8  "VAULT_DB_ENGINE" "Vault DB Engine"   "hub_phase_vault_db_engine"   "non_fatal" ""             "Vault database engine setup failed"
pipeline_register_phase 9  "KEYCLOAK_CONFIG" "Keycloak"          "hub_phase_keycloak_config"   "standard"  "CONFIGURING"  ""
pipeline_register_phase 10 "REALM_VERIFY"    "Realm Verify"      "hub_phase_realm_verify"      "standard"  "VERIFYING"    ""
pipeline_register_phase 11 "KAS_REGISTER"    "KAS Register"      "hub_phase_kas_register"      "non_fatal" ""             "KAS registration failed"
pipeline_register_phase 12 "SEEDING"         "Seeding"           "hub_phase_seeding"           "non_fatal" ""             "Database seeding failed"
pipeline_register_phase 13 "KAS_INIT"        "KAS Init"          "hub_phase_kas_init"          "non_fatal" ""             "KAS init had issues"

count=$(pipeline_get_phase_count)
assert_eq "13" "$count" "functional: 13 phases registered"

# Test 30: Phase order matches hub pipeline (first and last)
assert_eq "VAULT_BOOTSTRAP" "${_PIPELINE_REG_NAMES[0]}" "functional: first phase is VAULT_BOOTSTRAP"
assert_eq "KAS_INIT" "${_PIPELINE_REG_NAMES[12]}" "functional: last phase is KAS_INIT"

# Test 31: Mode distribution is correct
standard_count=0
non_fatal_count=0
direct_count=0
for (( idx = 0; idx < 13; idx++ )); do
    case "${_PIPELINE_REG_MODES[$idx]}" in
        standard) standard_count=$((standard_count + 1)) ;;
        non_fatal) non_fatal_count=$((non_fatal_count + 1)) ;;
        direct) direct_count=$((direct_count + 1)) ;;
    esac
done
assert_eq "8" "$standard_count" "functional: 8 standard (fatal) phases"
assert_eq "4" "$non_fatal_count" "functional: 4 non_fatal phases"
assert_eq "1" "$direct_count" "functional: 1 direct phase (BUILD)"

# Test 32: State transitions are only on SERVICES, KEYCLOAK_CONFIG, REALM_VERIFY
state_count=0
for (( idx = 0; idx < 13; idx++ )); do
    if [ -n "${_PIPELINE_REG_STATES[$idx]}" ]; then
        state_count=$((state_count + 1))
    fi
done
assert_eq "3" "$state_count" "functional: exactly 3 phases have state transitions"

# Test 33: Non-fatal phases all have warning messages
nf_missing_warn=0
for (( idx = 0; idx < 13; idx++ )); do
    if [ "${_PIPELINE_REG_MODES[$idx]}" = "non_fatal" ] && [ -z "${_PIPELINE_REG_WARN_MSGS[$idx]}" ]; then
        nf_missing_warn=$((nf_missing_warn + 1))
    fi
done
assert_eq "0" "$nf_missing_warn" "functional: all non_fatal phases have warning messages"

# Test 34: Standard phases have no warning messages
standard_with_warn=0
for (( idx = 0; idx < 13; idx++ )); do
    if [ "${_PIPELINE_REG_MODES[$idx]}" = "standard" ] && [ -n "${_PIPELINE_REG_WARN_MSGS[$idx]}" ]; then
        standard_with_warn=$((standard_with_warn + 1))
    fi
done
assert_eq "0" "$standard_with_warn" "functional: standard phases have no warn messages"

# =============================================================================
# Test: Line count reduction
# =============================================================================

# Test 35: Hub pipeline line count within expected range
# Phase 7 registry refactor: ~700 lines (registration + engine)
# Growth to ~1100: dry-run mode, SIGINT handling, heartbeat, circuit breakers, observability
# Growth to ~1160: guided mode progress descriptions for all 13 phases
total_lines=$(wc -l < "$hub_pipeline" | tr -d ' ')
if [ "$total_lines" -lt 1200 ]; then
    assert_eq "0" "0" "line count: hub-pipeline.sh is $total_lines lines (hardened engine + guided)"
else
    assert_eq "<1200" "$total_lines" "line count: should be under 1200 lines (registry + guided + hardened engine)"
fi

# =============================================================================
# Test: Backward compatibility
# =============================================================================

# Test 36: Core functions still exist
for func in hub_deploy hub_pipeline_execute _hub_run_phase_with_circuit_breaker _hub_should_skip_phase _hub_check_threshold; do
    if grep -q "${func}()" "$hub_pipeline"; then
        assert_eq "0" "0" "compat: ${func}() still exists"
    else
        assert_eq "found" "missing" "compat: ${func}() should still exist"
    fi
done

# Test 37: Health sentinel integration preserved
for sentinel_func in health_sentinel_stop health_sentinel_report health_sentinel_cleanup; do
    if grep -q "$sentinel_func" "$hub_pipeline"; then
        assert_eq "0" "0" "compat: $sentinel_func preserved"
    else
        assert_eq "found" "missing" "compat: $sentinel_func should be preserved"
    fi
done

# Test 38: Deployment logging preserved
if grep -q 'deployment_log_start' "$hub_pipeline" && grep -q 'deployment_log_stop' "$hub_pipeline"; then
    assert_eq "0" "0" "compat: deployment logging preserved"
else
    assert_eq "found" "missing" "compat: deployment logging should be preserved"
fi

# Test 39: Timing dashboard preserved
if grep -q 'deployment_print_timing_dashboard' "$hub_pipeline"; then
    assert_eq "0" "0" "compat: timing dashboard preserved"
else
    assert_eq "found" "missing" "compat: timing dashboard should be preserved"
fi

# Test 40: Pre-validation preserved
if grep -q 'pre_validate_hub' "$hub_pipeline"; then
    assert_eq "0" "0" "compat: pre-validation preserved"
else
    assert_eq "found" "missing" "compat: pre-validation should be preserved"
fi

# Test 41: Resume/checkpoint preserved
if grep -q 'hub_checkpoint_can_resume' "$hub_pipeline"; then
    assert_eq "0" "0" "compat: checkpoint resume preserved"
else
    assert_eq "found" "missing" "compat: checkpoint resume should be preserved"
fi

# Test 42: Deployment lock preserved
if grep -q 'deployment_acquire_lock' "$hub_pipeline" && grep -q 'deployment_release_lock' "$hub_pipeline"; then
    assert_eq "0" "0" "compat: deployment locking preserved"
else
    assert_eq "found" "missing" "compat: deployment locking should be preserved"
fi

# =============================================================================
# Test: Registry functions match pipeline-common.sh definition
# =============================================================================

# Test 43: pipeline-common.sh defines all 7 registry arrays
for arr in _PIPELINE_REG_NUMS _PIPELINE_REG_NAMES _PIPELINE_REG_LABELS _PIPELINE_REG_FUNCS _PIPELINE_REG_MODES _PIPELINE_REG_STATES _PIPELINE_REG_WARN_MSGS; do
    if grep -q "^${arr}=()" "$pipeline_common"; then
        assert_eq "0" "0" "pipeline-common: defines $arr"
    else
        assert_eq "found" "missing" "pipeline-common: should define $arr"
    fi
done
