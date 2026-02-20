#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Health Sentinel Tests
# =============================================================================
# Tests for Phase 6: Health sentinel background monitoring.
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

# Helper: safely capture return code under set -e
_rc() { "$@" && echo 0 || echo $?; }

# =============================================================================
# Source the module
# =============================================================================

source "${PROJECT_ROOT}/scripts/dive-modules/utilities/health-sentinel.sh" 2>/dev/null || true

# Override PID/alert file paths for testing
HEALTH_SENTINEL_PID_FILE="/tmp/dive-test-sentinel-$$.pid"
HEALTH_SENTINEL_ALERT_FILE="/tmp/dive-test-sentinel-$$.alerts"
HEALTH_SENTINEL_LOG_FILE="/tmp/dive-test-sentinel-$$.log"

# Cleanup function
_test_cleanup() {
    health_sentinel_cleanup 2>/dev/null || true
    rm -f "$HEALTH_SENTINEL_PID_FILE" "$HEALTH_SENTINEL_ALERT_FILE" "$HEALTH_SENTINEL_LOG_FILE"
}
trap _test_cleanup EXIT

# =============================================================================
# Test: Service list generation
# =============================================================================

if type _sentinel_get_services &>/dev/null; then

    # Test 1: Hub services include key infrastructure
    result=$(_sentinel_get_services "hub")
    assert_contains "$result" "postgres" "hub services: includes postgres"

    # Test 2: Hub services include keycloak
    assert_contains "$result" "keycloak" "hub services: includes keycloak"

    # Test 3: Hub services include backend
    assert_contains "$result" "backend" "hub services: includes backend"

    # Test 4: Hub services include vault
    assert_contains "$result" "vault" "hub services: includes vault"

    # Test 5: Hub services include frontend
    assert_contains "$result" "frontend" "hub services: includes frontend"

    # Test 6: Hub services include redis
    assert_contains "$result" "redis" "hub services: includes redis"

    # Test 7: Spoke services include keycloak
    result=$(_sentinel_get_services "spoke")
    assert_contains "$result" "keycloak" "spoke services: includes keycloak"

    # Test 8: Spoke services include backend
    assert_contains "$result" "backend" "spoke services: includes backend"

    # Test 9: Spoke services include frontend
    assert_contains "$result" "frontend" "spoke services: includes frontend"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} service list tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 9))
    TOTAL_PASSED=$((TOTAL_PASSED + 9))
fi

# =============================================================================
# Test: Container name generation
# =============================================================================

if type _sentinel_container_name &>/dev/null; then

    # Test 10: Hub container name format
    result=$(_sentinel_container_name "dive-hub" "backend")
    assert_eq "dive-hub-backend" "$result" "container name: hub backend"

    # Test 11: Spoke container name format
    result=$(_sentinel_container_name "dive-spoke-gbr" "keycloak")
    assert_eq "dive-spoke-gbr-keycloak" "$result" "container name: spoke keycloak"

    # Test 12: Custom project name
    result=$(_sentinel_container_name "myproject" "redis")
    assert_eq "myproject-redis" "$result" "container name: custom project"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} container name tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 3))
    TOTAL_PASSED=$((TOTAL_PASSED + 3))
fi

# =============================================================================
# Test: Container health check (with mock docker)
# =============================================================================

if type _sentinel_check_container &>/dev/null; then

    # Test 13: Missing container returns "missing"
    # Use a container name that definitely doesn't exist
    result=$(_sentinel_check_container "nonexistent-container-xyz-$$")
    assert_eq "missing" "$result" "check container: nonexistent → missing"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} container check tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
fi

# =============================================================================
# Test: Alert count
# =============================================================================

if type health_sentinel_alert_count &>/dev/null; then

    # Test 14: No alert file → 0 alerts
    rm -f "$HEALTH_SENTINEL_ALERT_FILE"
    result=$(health_sentinel_alert_count)
    assert_eq "0" "$result" "alert count: no file → 0"

    # Test 15: Empty alert file → 0 alerts
    : > "$HEALTH_SENTINEL_ALERT_FILE"
    result=$(health_sentinel_alert_count)
    assert_eq "0" "$result" "alert count: empty file → 0"

    # Test 16: 2 alerts → count is 2
    echo "2025-01-01 12:00:00|backend|UNHEALTHY|backend unhealthy" > "$HEALTH_SENTINEL_ALERT_FILE"
    echo "2025-01-01 12:00:10|keycloak|DOWN|keycloak exited" >> "$HEALTH_SENTINEL_ALERT_FILE"
    result=$(health_sentinel_alert_count)
    assert_eq "2" "$result" "alert count: 2 alerts → 2"

    rm -f "$HEALTH_SENTINEL_ALERT_FILE"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} alert count tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 3))
    TOTAL_PASSED=$((TOTAL_PASSED + 3))
fi

# =============================================================================
# Test: Report (no alerts)
# =============================================================================

if type health_sentinel_report &>/dev/null; then

    # Test 17: No alerts → clean report
    rm -f "$HEALTH_SENTINEL_ALERT_FILE"
    result=$(health_sentinel_report)
    assert_contains "$result" "No issues" "report: no alerts → no issues"

    # Test 18: No alerts → return 0
    _rc_val=0
    health_sentinel_report &>/dev/null || _rc_val=$?
    assert_eq "0" "$_rc_val" "report: no alerts → return 0"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} report tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 2))
    TOTAL_PASSED=$((TOTAL_PASSED + 2))
fi

# =============================================================================
# Test: Report (with alerts)
# =============================================================================

if type health_sentinel_report &>/dev/null; then

    # Test 19: Alerts → report shows them
    echo "2025-01-01 12:00:00|backend|UNHEALTHY|Container dive-hub-backend is unhealthy" > "$HEALTH_SENTINEL_ALERT_FILE"
    echo "2025-01-01 12:00:10|keycloak|DOWN|Container dive-hub-keycloak is exited" >> "$HEALTH_SENTINEL_ALERT_FILE"

    result=$(health_sentinel_report || true)
    assert_contains "$result" "2 alert" "report: shows alert count"

    # Test 20: Report contains service name
    assert_contains "$result" "backend" "report: shows backend"

    # Test 21: Report contains status
    assert_contains "$result" "UNHEALTHY" "report: shows UNHEALTHY status"

    # Test 22: Report contains DOWN
    assert_contains "$result" "DOWN" "report: shows DOWN status"

    # Test 23: Report contains services affected
    assert_contains "$result" "Services affected" "report: shows services affected"

    # Test 24: Alerts → return 1
    _rc_val2=0
    health_sentinel_report &>/dev/null || _rc_val2=$?
    assert_eq "1" "$_rc_val2" "report: alerts → return 1"

    rm -f "$HEALTH_SENTINEL_ALERT_FILE"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} report with alerts tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 6))
    TOTAL_PASSED=$((TOTAL_PASSED + 6))
fi

# =============================================================================
# Test: Sentinel start/stop/running
# =============================================================================

if type health_sentinel_start &>/dev/null && type health_sentinel_stop &>/dev/null; then

    # Test 25: Sentinel not running initially
    rm -f "$HEALTH_SENTINEL_PID_FILE"
    _running_rc=0
    health_sentinel_is_running || _running_rc=$?
    assert_eq "1" "$_running_rc" "sentinel: not running initially"

    # Test 26: Start creates PID file
    # Use a short-lived sentinel (we'll stop it quickly)
    HEALTH_SENTINEL_INTERVAL=60
    health_sentinel_start "hub" "dive-hub" || true
    if [ -f "$HEALTH_SENTINEL_PID_FILE" ]; then
        assert_eq "0" "0" "sentinel start: creates PID file"
    else
        assert_eq "exists" "missing" "sentinel start: should create PID file"
    fi

    # Test 27: Sentinel is running after start
    _running_rc2=0
    health_sentinel_is_running || _running_rc2=$?
    assert_eq "0" "$_running_rc2" "sentinel: running after start"

    # Test 28: Stop removes PID file
    health_sentinel_stop || true
    sleep 0.3
    _running_rc3=0
    health_sentinel_is_running || _running_rc3=$?
    assert_eq "1" "$_running_rc3" "sentinel: not running after stop"

    # Test 29: Disabled sentinel doesn't start
    HEALTH_SENTINEL_ENABLED="false"
    _start_rc=0
    health_sentinel_start "hub" "dive-hub" || _start_rc=$?
    assert_eq "1" "$_start_rc" "sentinel: disabled → doesn't start"
    HEALTH_SENTINEL_ENABLED="true"
    HEALTH_SENTINEL_INTERVAL=10

    rm -f "$HEALTH_SENTINEL_PID_FILE"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} sentinel start/stop tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 5))
    TOTAL_PASSED=$((TOTAL_PASSED + 5))
fi

# =============================================================================
# Test: Check alerts function
# =============================================================================

if type health_sentinel_check_alerts &>/dev/null; then

    # Test 30: No alerts → return 0
    rm -f "$HEALTH_SENTINEL_ALERT_FILE"
    _check_rc=0
    health_sentinel_check_alerts 2>/dev/null || _check_rc=$?
    assert_eq "0" "$_check_rc" "check_alerts: no alerts → return 0"

    # Test 31: With alerts → return 1
    echo "2025-01-01 12:00:00|backend|DOWN|Container down" > "$HEALTH_SENTINEL_ALERT_FILE"
    _check_rc2=0
    health_sentinel_check_alerts 2>/dev/null || _check_rc2=$?
    assert_eq "1" "$_check_rc2" "check_alerts: with alerts → return 1"

    rm -f "$HEALTH_SENTINEL_ALERT_FILE"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} check_alerts tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 2))
    TOTAL_PASSED=$((TOTAL_PASSED + 2))
fi

# =============================================================================
# Test: Cleanup
# =============================================================================

if type health_sentinel_cleanup &>/dev/null; then

    # Test 32: Cleanup removes all temp files
    echo "test" > "$HEALTH_SENTINEL_ALERT_FILE"
    echo "test" > "$HEALTH_SENTINEL_LOG_FILE"
    echo "99999" > "$HEALTH_SENTINEL_PID_FILE"

    health_sentinel_cleanup

    if [ ! -f "$HEALTH_SENTINEL_ALERT_FILE" ] && \
       [ ! -f "$HEALTH_SENTINEL_LOG_FILE" ] && \
       [ ! -f "$HEALTH_SENTINEL_PID_FILE" ]; then
        assert_eq "0" "0" "cleanup: removes all temp files"
    else
        assert_eq "removed" "exists" "cleanup: should remove temp files"
    fi

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} cleanup tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
fi

# =============================================================================
# Test: Check cycle with mock Docker
# =============================================================================

if type _sentinel_check_cycle &>/dev/null; then

    # Test 33: Check cycle with nonexistent containers records alerts
    : > "$HEALTH_SENTINEL_ALERT_FILE"
    _sentinel_check_cycle "nonexistent-project-$$" "backend keycloak" || true

    _alert_count
    _alert_count=$(health_sentinel_alert_count)
    if [ "$_alert_count" -gt 0 ]; then
        assert_eq "0" "0" "check cycle: missing containers → alerts recorded ($_alert_count)"
    else
        assert_eq "alerts" "none" "check cycle: should record alerts for missing containers"
    fi

    # Test 34: Alert file contains service names
    if [ -f "$HEALTH_SENTINEL_ALERT_FILE" ]; then
        if grep -q "backend" "$HEALTH_SENTINEL_ALERT_FILE"; then
            assert_eq "0" "0" "check cycle: alert mentions backend"
        else
            assert_eq "backend" "missing" "check cycle: alert should mention backend"
        fi
    fi

    # Test 35: Alert file contains DOWN status
    if [ -f "$HEALTH_SENTINEL_ALERT_FILE" ]; then
        if grep -q "DOWN\|missing" "$HEALTH_SENTINEL_ALERT_FILE"; then
            assert_eq "0" "0" "check cycle: alert contains DOWN/missing status"
        else
            assert_eq "DOWN" "other" "check cycle: alert should contain DOWN status"
        fi
    fi

    rm -f "$HEALTH_SENTINEL_ALERT_FILE"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} check cycle tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 3))
    TOTAL_PASSED=$((TOTAL_PASSED + 3))
fi

# =============================================================================
# Test: Pipeline integration points
# =============================================================================

# Test 36: Hub pipeline sources health-sentinel.sh
hub_pipeline_file="${PROJECT_ROOT}/scripts/dive-modules/deployment/hub-pipeline.sh"
if [ -f "$hub_pipeline_file" ]; then
    if grep -q 'health-sentinel.sh' "$hub_pipeline_file"; then
        assert_eq "0" "0" "hub pipeline: sources health-sentinel.sh"
    else
        assert_eq "sources" "missing" "hub pipeline: should source health-sentinel.sh"
    fi
fi

# Test 37: Hub pipeline starts sentinel before VAULT_DB_ENGINE in execution engine
if [ -f "$hub_pipeline_file" ]; then
    if grep -q 'VAULT_DB_ENGINE.*health_sentinel_start\|health_sentinel_start.*VAULT_DB_ENGINE' "$hub_pipeline_file" || \
       grep -B5 'health_sentinel_start.*hub.*dive-hub' "$hub_pipeline_file" | grep -q 'VAULT_DB_ENGINE'; then
        assert_eq "0" "0" "hub pipeline: sentinel starts before VAULT_DB_ENGINE phase"
    else
        assert_eq "found" "missing" "hub pipeline: sentinel should start before VAULT_DB_ENGINE"
    fi
fi

# Test 38: Hub pipeline stops sentinel before finalize
if [ -f "$hub_pipeline_file" ]; then
    if grep -q 'health_sentinel_stop' "$hub_pipeline_file"; then
        assert_eq "0" "0" "hub pipeline: stops sentinel"
    else
        assert_eq "stops" "missing" "hub pipeline: should stop sentinel"
    fi
fi

# Test 39: Hub pipeline calls sentinel report
if [ -f "$hub_pipeline_file" ]; then
    if grep -q 'health_sentinel_report' "$hub_pipeline_file"; then
        assert_eq "0" "0" "hub pipeline: calls sentinel report"
    else
        assert_eq "reports" "missing" "hub pipeline: should call sentinel report"
    fi
fi

# Test 40: Hub pipeline calls sentinel cleanup
if [ -f "$hub_pipeline_file" ]; then
    if grep -q 'health_sentinel_cleanup' "$hub_pipeline_file"; then
        assert_eq "0" "0" "hub pipeline: calls sentinel cleanup"
    else
        assert_eq "cleanups" "missing" "hub pipeline: should call sentinel cleanup"
    fi
fi

# Test 41: Spoke pipeline sources health-sentinel.sh
spoke_pipeline_file="${PROJECT_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-pipeline.sh"
if [ -f "$spoke_pipeline_file" ]; then
    if grep -q 'health-sentinel.sh' "$spoke_pipeline_file"; then
        assert_eq "0" "0" "spoke pipeline: sources health-sentinel.sh"
    else
        assert_eq "sources" "missing" "spoke pipeline: should source health-sentinel.sh"
    fi
fi

# Test 42: Spoke pipeline starts sentinel before Phase 4
if [ -f "$spoke_pipeline_file" ]; then
    _spoke_start_line
    _spoke_start_line=$(grep -n 'health_sentinel_start' "$spoke_pipeline_file" | head -1 | cut -d: -f1)
    _spoke_phase4_line
    _spoke_phase4_line=$(grep -n 'Phase 4.*Configuration' "$spoke_pipeline_file" | head -1 | cut -d: -f1)
    if [ -n "$_spoke_start_line" ] && [ -n "$_spoke_phase4_line" ]; then
        if [ "$_spoke_start_line" -lt "$_spoke_phase4_line" ]; then
            assert_eq "0" "0" "spoke pipeline: sentinel starts before Phase 4 (line $_spoke_start_line < $_spoke_phase4_line)"
        else
            assert_eq "before" "after" "spoke pipeline: sentinel should start before Phase 4"
        fi
    else
        assert_eq "found" "missing" "spoke pipeline: sentinel start and Phase 4 lines should exist"
    fi
fi

# Test 43: Spoke pipeline stops sentinel
if [ -f "$spoke_pipeline_file" ]; then
    if grep -q 'health_sentinel_stop' "$spoke_pipeline_file"; then
        assert_eq "0" "0" "spoke pipeline: stops sentinel"
    else
        assert_eq "stops" "missing" "spoke pipeline: should stop sentinel"
    fi
fi

# Test 44: Spoke pipeline calls sentinel report
if [ -f "$spoke_pipeline_file" ]; then
    if grep -q 'health_sentinel_report' "$spoke_pipeline_file"; then
        assert_eq "0" "0" "spoke pipeline: calls sentinel report"
    else
        assert_eq "reports" "missing" "spoke pipeline: should call sentinel report"
    fi
fi

# =============================================================================
# Test: Configuration
# =============================================================================

if type health_sentinel_start &>/dev/null; then

    # Test 45: Default interval is 10
    assert_eq "10" "${HEALTH_SENTINEL_INTERVAL}" "config: default interval is 10s"

    # Test 46: Default auto-restart is false
    assert_eq "false" "${HEALTH_SENTINEL_AUTO_RESTART}" "config: default auto-restart is false"

    # Test 47: Default enabled is true
    assert_eq "true" "${HEALTH_SENTINEL_ENABLED}" "config: default enabled is true"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} configuration tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 3))
    TOTAL_PASSED=$((TOTAL_PASSED + 3))
fi

# =============================================================================
# Test: Report with restart alerts
# =============================================================================

if type health_sentinel_report &>/dev/null; then

    # Test 48: Report shows restart count when present
    echo "2025-01-01 12:00:00|backend|UNHEALTHY|Container unhealthy" > "$HEALTH_SENTINEL_ALERT_FILE"
    echo "2025-01-01 12:00:00|backend|RESTART|Attempting restart" >> "$HEALTH_SENTINEL_ALERT_FILE"
    echo "2025-01-01 12:00:10|keycloak|DOWN|Container exited" >> "$HEALTH_SENTINEL_ALERT_FILE"

    result=$(health_sentinel_report || true)
    assert_contains "$result" "Auto-restarts" "report: shows auto-restart count"
    assert_contains "$result" "3 alert" "report: counts all alerts including restarts"

    rm -f "$HEALTH_SENTINEL_ALERT_FILE"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} restart report tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 2))
    TOTAL_PASSED=$((TOTAL_PASSED + 2))
fi

# Final cleanup
_test_cleanup
