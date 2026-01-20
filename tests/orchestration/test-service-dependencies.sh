#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Service Dependencies Tests
# =============================================================================
# Phase 4: Service Dependencies & Health Checks - Test Suite
#
# Tests:
#   1. Circular dependency detection (GAP-SD-001)
#   2. Dependency level calculation
#   3. Dynamic timeout calculation (GAP-SD-002)
#   4. Parallel startup ordering
#   5. Health check cascade awareness
# =============================================================================

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${DIVE_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# =============================================================================
# TEST HELPERS
# =============================================================================

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

run_test() {
    local test_name="$1"
    local test_func="$2"

    ((TESTS_RUN++))
    log_test "$test_name"

    if $test_func; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name"
        return 1
    fi
}

setup_test_env() {
    # Source dependencies
    source "$DIVE_ROOT/scripts/dive-modules/common.sh" 2>/dev/null || {
        echo "ERROR: Cannot load common.sh"
        exit 1
    }

    source "$DIVE_ROOT/scripts/dive-modules/orchestration-state-db.sh" 2>/dev/null || {
        echo "ERROR: Cannot load orchestration-state-db.sh"
        exit 1
    }

    source "$DIVE_ROOT/scripts/dive-modules/orchestration-framework.sh" 2>/dev/null || {
        echo "ERROR: Cannot load orchestration-framework.sh"
        exit 1
    }
}

# =============================================================================
# CIRCULAR DEPENDENCY TESTS
# =============================================================================

test_no_circular_deps_default() {
    # Test: Default SERVICE_DEPENDENCIES has no circular dependencies
    orch_detect_circular_dependencies >/dev/null 2>&1
}

test_circular_dep_detection() {
    # Test: Circular dependency detection catches cycles
    # Save original dependencies
    local orig_backend="${SERVICE_DEPENDENCIES["backend"]}"
    local orig_frontend="${SERVICE_DEPENDENCIES["frontend"]}"

    # Create a cycle: backend -> frontend -> backend
    SERVICE_DEPENDENCIES["backend"]="frontend"
    SERVICE_DEPENDENCIES["frontend"]="backend"

    # Should detect the cycle
    local result
    result=$(orch_detect_circular_dependencies 2>&1)
    local exit_code=$?

    # Restore
    SERVICE_DEPENDENCIES["backend"]="$orig_backend"
    SERVICE_DEPENDENCIES["frontend"]="$orig_frontend"

    # Should return 1 (cycle detected)
    [ $exit_code -eq 1 ]
}

test_deep_cycle_detection() {
    # Test: Detection works for deeper cycles (A -> B -> C -> A)
    local orig_backend="${SERVICE_DEPENDENCIES["backend"]}"
    local orig_frontend="${SERVICE_DEPENDENCIES["frontend"]}"
    local orig_kas="${SERVICE_DEPENDENCIES["kas"]}"

    # Create cycle: backend -> frontend -> kas -> backend
    SERVICE_DEPENDENCIES["backend"]="frontend"
    SERVICE_DEPENDENCIES["frontend"]="kas"
    SERVICE_DEPENDENCIES["kas"]="backend"

    local result
    result=$(orch_detect_circular_dependencies 2>&1)
    local exit_code=$?

    # Restore
    SERVICE_DEPENDENCIES["backend"]="$orig_backend"
    SERVICE_DEPENDENCIES["frontend"]="$orig_frontend"
    SERVICE_DEPENDENCIES["kas"]="$orig_kas"

    [ $exit_code -eq 1 ]
}

# =============================================================================
# DEPENDENCY LEVEL TESTS
# =============================================================================

test_level_0_no_deps() {
    # Test: Services with no dependencies are level 0
    local level=$(orch_calculate_dependency_level "postgres")
    [ "$level" -eq 0 ]
}

test_level_1_single_dep() {
    # Test: Services depending on level 0 are level 1
    local level=$(orch_calculate_dependency_level "keycloak")
    [ "$level" -eq 1 ]
}

test_level_calculation_chain() {
    # Test: Level calculation works for chains
    # backend depends on keycloak (level 1) which depends on postgres (level 0)
    # So backend should be level 2
    local level=$(orch_calculate_dependency_level "backend")
    [ "$level" -eq 2 ]
}

test_get_services_at_level_0() {
    # Test: Can retrieve all level 0 services
    local services=$(orch_get_services_at_level 0)

    # Should include postgres, mongodb, redis, opa (no deps)
    echo "$services" | grep -q "postgres"
}

test_max_dependency_level() {
    # Test: Max dependency level calculation
    local max=$(orch_get_max_dependency_level)

    # Should be at least 2 (postgres -> keycloak -> backend)
    [ "$max" -ge 2 ]
}

# =============================================================================
# DYNAMIC TIMEOUT TESTS
# =============================================================================

test_static_timeout_fallback() {
    # Test: Falls back to static timeout when no historical data
    local timeout=$(orch_calculate_dynamic_timeout "keycloak" "xxx")

    # Should return the static timeout (240 for keycloak)
    [ "$timeout" -eq 240 ]
}

test_timeout_has_value() {
    # Test: Timeout calculation returns a positive value
    local timeout=$(orch_calculate_dynamic_timeout "backend")

    [ "$timeout" -gt 0 ]
}

test_timeout_within_bounds() {
    # Test: Timeout is within min/max bounds
    local timeout=$(orch_calculate_dynamic_timeout "keycloak")

    local min=${SERVICE_MIN_TIMEOUTS["keycloak"]:-180}
    local max=${SERVICE_MAX_TIMEOUTS["keycloak"]:-300}

    [ "$timeout" -ge "$min" ] && [ "$timeout" -le "$max" ]
}

# =============================================================================
# DEPENDENCY GRAPH TESTS
# =============================================================================

test_print_dependency_graph_text() {
    # Test: Dependency graph prints without error
    local output
    output=$(orch_print_dependency_graph "text" 2>&1)

    echo "$output" | grep -q "Service Dependency Graph"
}

test_print_dependency_graph_mermaid() {
    # Test: Mermaid format dependency graph
    local output
    output=$(orch_print_dependency_graph "mermaid" 2>&1)

    echo "$output" | grep -q "graph TD"
}

# =============================================================================
# HEALTH CHECK CASCADE TESTS
# =============================================================================

test_health_deps_keycloak() {
    # Test: Keycloak's health check dependencies
    local deps=$(orch_get_health_check_dependencies "keycloak")

    echo "$deps" | grep -q "postgres"
}

test_health_deps_backend() {
    # Test: Backend's health check dependencies
    local deps=$(orch_get_health_check_dependencies "backend")

    # Backend depends on keycloak and postgres
    echo "$deps" | grep -q "keycloak" && echo "$deps" | grep -q "postgres"
}

test_health_deps_none() {
    # Test: Services with no deps return empty
    local deps=$(orch_get_health_check_dependencies "postgres")

    [ -z "$deps" ]
}

# =============================================================================
# PARALLEL STARTUP ORDER TESTS
# =============================================================================

test_parallel_startup_order_level0_first() {
    # Test: Level 0 services are started before level 1
    local level0=$(orch_get_services_at_level 0)
    local level1=$(orch_get_services_at_level 1)

    # Level 0 should have postgres, level 1 should have keycloak
    echo "$level0" | grep -q "postgres" && echo "$level1" | grep -q "keycloak"
}

test_service_dependencies_defined() {
    # Test: All expected services have dependencies defined
    local required_services="postgres mongodb redis keycloak backend frontend opa"

    for svc in $required_services; do
        if [ -z "${SERVICE_DEPENDENCIES[$svc]+x}" ]; then
            echo "Missing dependency definition for: $svc"
            return 1
        fi
    done
    return 0
}

# =============================================================================
# INTEGRATION TESTS
# =============================================================================

test_dependency_chain_valid() {
    # Test: Validate a realistic dependency chain
    # frontend -> backend -> keycloak -> postgres

    local fe_level=$(orch_calculate_dependency_level "frontend")
    local be_level=$(orch_calculate_dependency_level "backend")
    local kc_level=$(orch_calculate_dependency_level "keycloak")
    local pg_level=$(orch_calculate_dependency_level "postgres")

    # Each should be higher than its dependency
    [ $fe_level -gt $be_level ] && [ $be_level -gt $kc_level ] && [ $kc_level -gt $pg_level ]
}

test_kas_dependencies() {
    # Test: KAS has correct dependencies
    local deps="${SERVICE_DEPENDENCIES["kas"]}"

    # KAS depends on mongodb and backend
    echo "$deps" | grep -q "mongodb" && echo "$deps" | grep -q "backend"
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo "=============================================="
    echo "DIVE V3 Service Dependencies Test Suite"
    echo "Phase 4: Service Dependencies & Health Checks"
    echo "=============================================="
    echo ""

    # Setup
    setup_test_env

    echo ""

    # Circular Dependency Tests
    echo "--- Circular Dependency Detection (GAP-SD-001) ---"
    run_test "No circular deps in default config" test_no_circular_deps_default || true
    run_test "Circular dependency detection" test_circular_dep_detection || true
    run_test "Deep cycle detection (A->B->C->A)" test_deep_cycle_detection || true
    echo ""

    # Dependency Level Tests
    echo "--- Dependency Level Calculation ---"
    run_test "Level 0 for no dependencies" test_level_0_no_deps || true
    run_test "Level 1 for single dependency" test_level_1_single_dep || true
    run_test "Level calculation for chains" test_level_calculation_chain || true
    run_test "Get services at level 0" test_get_services_at_level_0 || true
    run_test "Max dependency level" test_max_dependency_level || true
    echo ""

    # Dynamic Timeout Tests
    echo "--- Dynamic Timeout Calculation (GAP-SD-002) ---"
    run_test "Static timeout fallback" test_static_timeout_fallback || true
    run_test "Timeout returns positive value" test_timeout_has_value || true
    run_test "Timeout within bounds" test_timeout_within_bounds || true
    echo ""

    # Dependency Graph Tests
    echo "--- Dependency Graph Visualization ---"
    run_test "Print text dependency graph" test_print_dependency_graph_text || true
    run_test "Print mermaid dependency graph" test_print_dependency_graph_mermaid || true
    echo ""

    # Health Check Cascade Tests
    echo "--- Health Check Cascade Awareness ---"
    run_test "Keycloak health deps include postgres" test_health_deps_keycloak || true
    run_test "Backend health deps include keycloak" test_health_deps_backend || true
    run_test "Postgres has no health deps" test_health_deps_none || true
    echo ""

    # Parallel Startup Tests
    echo "--- Parallel Startup Order ---"
    run_test "Level 0 before level 1" test_parallel_startup_order_level0_first || true
    run_test "All services have deps defined" test_service_dependencies_defined || true
    echo ""

    # Integration Tests
    echo "--- Integration Tests ---"
    run_test "Valid dependency chain" test_dependency_chain_valid || true
    run_test "KAS dependencies correct" test_kas_dependencies || true
    echo ""

    # Summary
    echo "=============================================="
    echo "Test Results"
    echo "=============================================="
    echo "Total:  $TESTS_RUN"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    echo ""

    if [ "$TESTS_FAILED" -gt 0 ]; then
        echo -e "${RED}SOME TESTS FAILED${NC}"
        exit 1
    else
        echo -e "${GREEN}ALL TESTS PASSED${NC}"
        exit 0
    fi
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
