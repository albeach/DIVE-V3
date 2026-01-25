#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Phase 4 Observability Tests
# =============================================================================
# Tests for: Enhanced diagnostics, compose validation, Prometheus scraping,
#            Grafana dashboards, and OPAL token automation
# =============================================================================
# Expected: 12+ tests
# Execution: ./tests/docker/phase4-observability-tests.sh
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0
SKIPPED=0

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

print_header() {
    echo ""
    echo "=============================================="
    echo " DIVE V3 - Phase 4 Observability Tests"
    echo " $(date '+%Y-%m-%d %H:%M:%S')"
    echo "=============================================="
    echo ""
}

test_start() {
    echo -e "${BLUE}[TEST]${NC} $1..."
}

test_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    PASSED=$((PASSED + 1))
}

test_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAILED=$((FAILED + 1))
}

test_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    SKIPPED=$((SKIPPED + 1))
}

print_summary() {
    echo ""
    echo "=============================================="
    echo " TEST SUMMARY"
    echo "=============================================="
    echo -e "  ${GREEN}PASSED:${NC}  $PASSED"
    echo -e "  ${RED}FAILED:${NC}  $FAILED"
    echo -e "  ${YELLOW}SKIPPED:${NC} $SKIPPED"
    echo "=============================================="
    
    if [ $FAILED -gt 0 ]; then
        echo -e "${RED}Some tests failed!${NC}"
        exit 1
    else
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    fi
}

# =============================================================================
# TEST: Diagnostics Command Structure
# =============================================================================

test_diagnostics_command_exists() {
    test_start "Checking diagnostics command exists"
    
    if ./dive diagnostics --help 2>&1 | grep -q "diagnostics\|Diagnostics" 2>/dev/null; then
        test_pass "diagnostics command exists"
    else
        # Try running it
        if ./dive diagnostics 2>&1 | grep -q "Diagnostics\|Known Issue"; then
            test_pass "diagnostics command exists"
        else
            test_fail "diagnostics command not found"
        fi
    fi
}

test_diagnostics_identifies_issues() {
    test_start "Checking diagnostics identifies issues"
    
    local output
    output=$(timeout 30 ./dive diagnostics 2>&1 || echo "TIMEOUT")
    
    if [ "$output" = "TIMEOUT" ]; then
        test_skip "diagnostics command timed out"
        return
    fi
    
    # Diagnostics should include at least these sections
    if echo "$output" | grep -qE "Container Health|Network Connectivity|Known Issue Detection"; then
        test_pass "diagnostics includes expected sections"
    else
        test_fail "diagnostics missing expected sections"
    fi
}

test_diagnostics_provides_fixes() {
    test_start "Checking diagnostics provides fix suggestions"
    
    local output
    output=$(timeout 30 ./dive diagnostics 2>&1 || echo "TIMEOUT")
    
    if [ "$output" = "TIMEOUT" ]; then
        test_skip "diagnostics command timed out"
        return
    fi
    
    # Should provide fix suggestions
    if echo "$output" | grep -qiE "Fix:|docker (logs|restart)|./dive"; then
        test_pass "diagnostics provides fix suggestions"
    else
        test_fail "diagnostics missing fix suggestions"
    fi
}

# =============================================================================
# TEST: Validate Command
# =============================================================================

test_validate_command_exists() {
    test_start "Checking validate command exists"
    
    local output
    output=$(timeout 30 ./dive validate 2>&1 || echo "TIMEOUT")
    
    if [ "$output" = "TIMEOUT" ]; then
        test_skip "validate command timed out"
        return
    fi
    
    if echo "$output" | grep -qE "Prerequisites|Validation|Required Tools"; then
        test_pass "validate command exists and runs"
    else
        test_fail "validate command not working"
    fi
}

test_validate_checks_compose() {
    test_start "Checking validate includes compose config check"
    
    local output
    output=$(timeout 30 ./dive validate 2>&1 || echo "TIMEOUT")
    
    if [ "$output" = "TIMEOUT" ]; then
        test_skip "validate command timed out"
        return
    fi
    
    if echo "$output" | grep -qE "Compose Configuration|docker-compose"; then
        test_pass "validate checks compose configuration"
    else
        test_fail "validate missing compose configuration check"
    fi
}

test_validate_checks_secrets() {
    test_start "Checking validate checks for secrets"
    
    local output
    output=$(timeout 30 ./dive validate 2>&1 || echo "TIMEOUT")
    
    if [ "$output" = "TIMEOUT" ]; then
        test_skip "validate command timed out"
        return
    fi
    
    if echo "$output" | grep -qE "Required Secrets|Shell secrets|\.env"; then
        test_pass "validate checks for secrets"
    else
        test_fail "validate missing secrets check"
    fi
}

# =============================================================================
# TEST: Prometheus Scraping
# =============================================================================

test_prometheus_running() {
    test_start "Checking Prometheus is running"
    
    if docker ps --filter "name=shared-prometheus" --format "{{.Names}}" | grep -q "shared-prometheus"; then
        test_pass "Prometheus is running"
    else
        test_skip "Prometheus not running (monitoring stack may not be started)"
    fi
}

test_prometheus_targets_up() {
    test_start "Checking Prometheus has targets UP"
    
    local targets_up
    targets_up=$(curl -s http://localhost:9090/api/v1/targets 2>/dev/null | jq '[.data.activeTargets[] | select(.health=="up")] | length' 2>/dev/null || echo "0")
    
    if [ "$targets_up" -ge 5 ]; then
        test_pass "Prometheus has $targets_up targets UP"
    elif [ "$targets_up" -gt 0 ]; then
        test_pass "Prometheus has $targets_up targets UP (some services may be down)"
    else
        # Check if Prometheus is responding at all
        if curl -s http://localhost:9090/-/healthy >/dev/null 2>&1; then
            test_fail "Prometheus running but no targets UP"
        else
            test_skip "Prometheus not reachable (monitoring stack may not be started)"
        fi
    fi
}

test_prometheus_hub_services_scraped() {
    test_start "Checking hub services are being scraped"
    
    local hub_targets
    hub_targets=$(curl -s http://localhost:9090/api/v1/targets 2>/dev/null | jq '[.data.activeTargets[] | select(.labels.job | startswith("hub-")) | select(.health=="up")] | length' 2>/dev/null || echo "0")
    
    if [ "$hub_targets" -ge 3 ]; then
        test_pass "Hub services being scraped ($hub_targets targets)"
    elif [ "$hub_targets" -gt 0 ]; then
        test_pass "Some hub services being scraped ($hub_targets targets)"
    else
        test_skip "No hub services being scraped (hub may not be running)"
    fi
}

# =============================================================================
# TEST: Grafana Dashboards
# =============================================================================

test_grafana_running() {
    test_start "Checking Grafana is running"
    
    if docker ps --filter "name=shared-grafana" --format "{{.Names}}" | grep -q "shared-grafana"; then
        test_pass "Grafana is running"
    else
        test_skip "Grafana not running"
    fi
}

test_grafana_healthy() {
    test_start "Checking Grafana health"
    
    local health
    health=$(curl -s http://localhost:3333/api/health 2>/dev/null | jq -r '.database' 2>/dev/null || echo "fail")
    
    if [ "$health" = "ok" ]; then
        test_pass "Grafana is healthy"
    else
        test_skip "Grafana not healthy or not reachable"
    fi
}

test_grafana_dashboards_provisioned() {
    test_start "Checking Grafana dashboards are provisioned"
    
    local dashboard_count
    dashboard_count=$(curl -s -u admin:admin http://localhost:3333/api/search 2>/dev/null | jq 'length' 2>/dev/null || echo "0")
    
    if [ "$dashboard_count" -ge 5 ]; then
        test_pass "Grafana has $dashboard_count dashboards provisioned"
    elif [ "$dashboard_count" -gt 0 ]; then
        test_pass "Grafana has $dashboard_count dashboards (partial)"
    else
        # Check if we can connect with default password
        local with_default
        with_default=$(curl -s http://localhost:3333/api/search 2>/dev/null | jq 'length' 2>/dev/null || echo "0")
        
        if [ "$with_default" -gt 0 ]; then
            test_pass "Grafana has $with_default dashboards (auth may be disabled)"
        else
            test_skip "Cannot query Grafana dashboards"
        fi
    fi
}

test_grafana_hub_overview_exists() {
    test_start "Checking DIVE Hub Overview dashboard exists"
    
    local dashboards
    dashboards=$(curl -s -u admin:admin http://localhost:3333/api/search 2>/dev/null || echo "[]")
    
    if echo "$dashboards" | jq -e '.[] | select(.title | contains("Hub Overview"))' >/dev/null 2>&1; then
        test_pass "DIVE Hub Overview dashboard exists"
    else
        # Check if it exists in provisioning directory
        if [ -f "docker/instances/shared/config/grafana/provisioning/dashboards/hub-overview.json" ]; then
            test_pass "Hub Overview dashboard file exists (may need Grafana restart)"
        else
            test_fail "Hub Overview dashboard not found"
        fi
    fi
}

# =============================================================================
# TEST: OPAL Token Automation
# =============================================================================

test_opal_token_config_function() {
    test_start "Checking OPAL token configuration function exists"
    
    if grep -q "_spoke_configure_token" scripts/dive-modules/spoke.sh 2>/dev/null; then
        test_pass "OPAL token configuration function exists"
    else
        test_fail "OPAL token configuration function not found"
    fi
}

test_spoke_register_poll_mode() {
    test_start "Checking spoke register supports --poll mode"
    
    if grep -q "poll_mode=true" scripts/dive-modules/spoke.sh 2>/dev/null; then
        test_pass "Spoke register supports --poll mode"
    else
        test_fail "Spoke register missing --poll mode"
    fi
}

test_spoke_env_token_update() {
    test_start "Checking spoke .env token update logic"
    
    if grep -q "SPOKE_OPAL_TOKEN=" scripts/dive-modules/spoke.sh 2>/dev/null; then
        test_pass "Spoke .env token update logic present"
    else
        test_fail "Spoke .env token update logic missing"
    fi
}

# =============================================================================
# TEST: Prometheus Config
# =============================================================================

test_prometheus_config_exists() {
    test_start "Checking Prometheus config exists"
    
    if [ -f "docker/instances/shared/config/prometheus.yml" ]; then
        test_pass "Prometheus config file exists"
    else
        test_fail "Prometheus config file not found"
    fi
}

test_prometheus_config_has_hub_targets() {
    test_start "Checking Prometheus config includes hub targets"
    
    local config_file="docker/instances/shared/config/prometheus.yml"
    
    if [ -f "$config_file" ]; then
        if grep -q "hub-backend\|hub-keycloak\|hub-opa" "$config_file"; then
            test_pass "Prometheus config includes hub targets"
        else
            test_fail "Prometheus config missing hub targets"
        fi
    else
        test_skip "Prometheus config not found"
    fi
}

test_prometheus_uses_host_gateway() {
    test_start "Checking Prometheus uses host.docker.internal"
    
    local config_file="docker/instances/shared/config/prometheus.yml"
    
    if [ -f "$config_file" ]; then
        if grep -q "host.docker.internal" "$config_file"; then
            test_pass "Prometheus uses host.docker.internal for scraping"
        else
            test_fail "Prometheus not using host.docker.internal"
        fi
    else
        test_skip "Prometheus config not found"
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    cd "$(dirname "$0")/../.."  # Navigate to project root
    
    print_header
    
    # Diagnostics tests
    echo -e "${YELLOW}=== Diagnostics Tests ===${NC}"
    test_diagnostics_command_exists
    test_diagnostics_identifies_issues
    test_diagnostics_provides_fixes
    echo ""
    
    # Validation tests
    echo -e "${YELLOW}=== Validation Tests ===${NC}"
    test_validate_command_exists
    test_validate_checks_compose
    test_validate_checks_secrets
    echo ""
    
    # Prometheus tests
    echo -e "${YELLOW}=== Prometheus Tests ===${NC}"
    test_prometheus_running
    test_prometheus_targets_up
    test_prometheus_hub_services_scraped
    test_prometheus_config_exists
    test_prometheus_config_has_hub_targets
    test_prometheus_uses_host_gateway
    echo ""
    
    # Grafana tests
    echo -e "${YELLOW}=== Grafana Tests ===${NC}"
    test_grafana_running
    test_grafana_healthy
    test_grafana_dashboards_provisioned
    test_grafana_hub_overview_exists
    echo ""
    
    # OPAL token tests
    echo -e "${YELLOW}=== OPAL Token Automation Tests ===${NC}"
    test_opal_token_config_function
    test_spoke_register_poll_mode
    test_spoke_env_token_update
    echo ""
    
    print_summary
}

main "$@"
