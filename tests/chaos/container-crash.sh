#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Chaos Test: Container Crash
# =============================================================================
# Tests system resilience to container crashes
# =============================================================================

set -e

CHAOS_DIR="$(dirname "${BASH_SOURCE[0]}")"
source "${CHAOS_DIR}/chaos-framework.sh"

# =============================================================================
# CONTAINER CRASH TESTS
# =============================================================================

run_container_crash_tests() {
    local target="${1:-hub}"

    chaos_suite_start "Container Crash Tests ($target)"

    local prefix="dive-${target}"
    if [ "$target" != "hub" ]; then
        prefix="dive-spoke-$(lower "$target")"
    fi

    # Test 1: Keycloak crash recovery
    chaos_test \
        "Keycloak Crash Recovery" \
        "inject_container_kill ${prefix}-keycloak" \
        "recovery_container_healthy ${prefix}-keycloak" \
        "cleanup_container_start ${prefix}-keycloak"

    # Test 2: Backend crash recovery
    chaos_test \
        "Backend Crash Recovery" \
        "inject_container_kill ${prefix}-backend" \
        "recovery_http_ok http://localhost:4000/health" \
        "cleanup_container_start ${prefix}-backend"

    # Test 3: MongoDB crash recovery
    chaos_test \
        "MongoDB Crash Recovery" \
        "inject_container_kill ${prefix}-mongodb" \
        "recovery_container_healthy ${prefix}-mongodb" \
        "cleanup_container_start ${prefix}-mongodb"

    # Test 4: Redis crash recovery
    chaos_test \
        "Redis Crash Recovery" \
        "inject_container_kill ${prefix}-redis" \
        "recovery_container_healthy ${prefix}-redis" \
        "cleanup_container_start ${prefix}-redis"

    # Test 5: Cascade crash recovery (multiple services)
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "CHAOS TEST: Cascade Crash Recovery (Multiple Services)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    ((CHAOS_TESTS_RUN++))

    # Kill multiple services
    echo ""
    echo "Phase 1: Injecting cascade fault..."
    docker kill ${prefix}-backend >/dev/null 2>&1 || true
    docker kill ${prefix}-mongodb >/dev/null 2>&1 || true
    echo "  ✓ Multiple services killed"

    # Wait for fault duration
    echo ""
    echo "Phase 2: Fault active for ${CHAOS_FAULT_DURATION}s..."
    sleep "$CHAOS_FAULT_DURATION"

    # Restart services
    echo ""
    echo "Phase 3: Restarting services..."
    docker start ${prefix}-mongodb >/dev/null 2>&1 || true
    sleep 10
    docker start ${prefix}-backend >/dev/null 2>&1 || true

    # Validate recovery
    echo ""
    echo "Phase 4: Validating cascade recovery..."

    local elapsed=0
    local recovered=false

    while [ $elapsed -lt $CHAOS_RECOVERY_TIMEOUT ]; do
        local mongo_health=$(docker inspect ${prefix}-mongodb --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
        local backend_ok=false

        curl -sf http://localhost:4000/health >/dev/null 2>&1 && backend_ok=true

        if [ "$mongo_health" = "healthy" ] && [ "$backend_ok" = "true" ]; then
            echo "  ✓ Cascade recovery successful"
            recovered=true
            ((CHAOS_RECOVERY_SUCCESS++))
            ((CHAOS_TESTS_PASSED++))
            break
        fi

        sleep 5
        ((elapsed += 5))
        echo "  ... waiting (${elapsed}/${CHAOS_RECOVERY_TIMEOUT}s)"
    done

    if [ "$recovered" = false ]; then
        echo "  ✗ Cascade recovery failed"
        ((CHAOS_RECOVERY_FAILED++))
        ((CHAOS_TESTS_FAILED++))
    fi

    chaos_suite_end
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    run_container_crash_tests "$@"
fi
