#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Chaos Testing Framework
# =============================================================================
# Framework for resilience testing with fault injection and recovery validation
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-22
# =============================================================================

set -e

# Project root
DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHAOS_DIR="$(dirname "${BASH_SOURCE[0]}")"

# Load common functions
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

# Load testing utilities
source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"

# =============================================================================
# CHAOS CONFIGURATION
# =============================================================================

# Recovery thresholds
CHAOS_RECOVERY_TIMEOUT="${CHAOS_RECOVERY_TIMEOUT:-120}"  # seconds
CHAOS_RECOVERY_TARGET="${CHAOS_RECOVERY_TARGET:-95}"     # percent success rate

# Fault injection timing
CHAOS_FAULT_DURATION="${CHAOS_FAULT_DURATION:-30}"       # seconds

# =============================================================================
# CHAOS TEST COUNTERS
# =============================================================================

CHAOS_TESTS_RUN=0
CHAOS_TESTS_PASSED=0
CHAOS_TESTS_FAILED=0
CHAOS_RECOVERY_SUCCESS=0
CHAOS_RECOVERY_FAILED=0

# =============================================================================
# CHAOS TEST FRAMEWORK FUNCTIONS
# =============================================================================

##
# Start a chaos test suite
#
# Arguments:
#   $1 - Suite name
##
chaos_suite_start() {
    local suite_name="$1"

    CHAOS_TESTS_RUN=0
    CHAOS_TESTS_PASSED=0
    CHAOS_TESTS_FAILED=0
    CHAOS_RECOVERY_SUCCESS=0
    CHAOS_RECOVERY_FAILED=0

    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  CHAOS TEST SUITE: $suite_name"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Recovery Timeout: ${CHAOS_RECOVERY_TIMEOUT}s"
    echo "║  Recovery Target:  ${CHAOS_RECOVERY_TARGET}%"
    echo "║  Fault Duration:   ${CHAOS_FAULT_DURATION}s"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

##
# End a chaos test suite and report results
##
chaos_suite_end() {
    local recovery_rate=0

    if [ $((CHAOS_RECOVERY_SUCCESS + CHAOS_RECOVERY_FAILED)) -gt 0 ]; then
        recovery_rate=$((CHAOS_RECOVERY_SUCCESS * 100 / (CHAOS_RECOVERY_SUCCESS + CHAOS_RECOVERY_FAILED)))
    fi

    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  CHAOS TEST RESULTS"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Tests Run:         $CHAOS_TESTS_RUN"
    echo "║  Tests Passed:      $CHAOS_TESTS_PASSED"
    echo "║  Tests Failed:      $CHAOS_TESTS_FAILED"
    echo "║  Recovery Success:  $CHAOS_RECOVERY_SUCCESS"
    echo "║  Recovery Failed:   $CHAOS_RECOVERY_FAILED"
    echo "║  Recovery Rate:     ${recovery_rate}%"
    echo "║  Target Rate:       ${CHAOS_RECOVERY_TARGET}%"
    echo "╠══════════════════════════════════════════════════════════════╣"

    if [ $recovery_rate -ge $CHAOS_RECOVERY_TARGET ]; then
        echo "║  STATUS: ✓ PASSED (${recovery_rate}% >= ${CHAOS_RECOVERY_TARGET}%)"
    else
        echo "║  STATUS: ✗ FAILED (${recovery_rate}% < ${CHAOS_RECOVERY_TARGET}%)"
    fi

    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""

    [ $recovery_rate -ge $CHAOS_RECOVERY_TARGET ]
}

##
# Run a single chaos test with fault injection and recovery validation
#
# Arguments:
#   $1 - Test name
#   $2 - Fault injection command
#   $3 - Recovery validation command
#   $4 - Cleanup command (optional)
##
chaos_test() {
    local test_name="$1"
    local fault_cmd="$2"
    local recovery_cmd="$3"
    local cleanup_cmd="${4:-}"

    ((CHAOS_TESTS_RUN++))

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "CHAOS TEST: $test_name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local start_time=$(date +%s)
    local test_passed=false

    # Phase 1: Inject fault
    echo ""
    echo "Phase 1: Injecting fault..."
    if eval "$fault_cmd" 2>&1; then
        echo "  ✓ Fault injected"
    else
        echo "  ✗ Fault injection failed"
        ((CHAOS_TESTS_FAILED++))
        return 1
    fi

    # Phase 2: Wait for fault duration
    echo ""
    echo "Phase 2: Fault active for ${CHAOS_FAULT_DURATION}s..."
    sleep "$CHAOS_FAULT_DURATION"

    # Phase 3: Validate recovery
    echo ""
    echo "Phase 3: Validating recovery (timeout: ${CHAOS_RECOVERY_TIMEOUT}s)..."

    local elapsed=0
    while [ $elapsed -lt $CHAOS_RECOVERY_TIMEOUT ]; do
        if eval "$recovery_cmd" >/dev/null 2>&1; then
            local recovery_time=$(($(date +%s) - start_time - CHAOS_FAULT_DURATION))
            echo "  ✓ Recovery successful in ${recovery_time}s"
            test_passed=true
            ((CHAOS_RECOVERY_SUCCESS++))
            break
        fi

        sleep 5
        ((elapsed += 5))
        echo "  ... waiting (${elapsed}/${CHAOS_RECOVERY_TIMEOUT}s)"
    done

    if [ "$test_passed" = false ]; then
        echo "  ✗ Recovery failed (timeout)"
        ((CHAOS_RECOVERY_FAILED++))
    fi

    # Phase 4: Cleanup (optional)
    if [ -n "$cleanup_cmd" ]; then
        echo ""
        echo "Phase 4: Cleanup..."
        eval "$cleanup_cmd" 2>&1 || true
        echo "  ✓ Cleanup complete"
    fi

    # Result
    echo ""
    if [ "$test_passed" = true ]; then
        echo "RESULT: ✓ PASSED"
        ((CHAOS_TESTS_PASSED++))
    else
        echo "RESULT: ✗ FAILED"
        ((CHAOS_TESTS_FAILED++))
    fi

    echo ""
    return 0
}

##
# Inject fault: Stop a container
#
# Arguments:
#   $1 - Container name
##
inject_container_stop() {
    local container="$1"
    docker stop "$container" >/dev/null 2>&1
}

##
# Inject fault: Kill a container
#
# Arguments:
#   $1 - Container name
##
inject_container_kill() {
    local container="$1"
    docker kill "$container" >/dev/null 2>&1
}

##
# Inject fault: Network disconnect
#
# Arguments:
#   $1 - Container name
#   $2 - Network name
##
inject_network_disconnect() {
    local container="$1"
    local network="${2:-dive-shared}"
    docker network disconnect "$network" "$container" >/dev/null 2>&1
}

##
# Inject fault: CPU stress
#
# Arguments:
#   $1 - Container name
#   $2 - Load percentage (0-100)
##
inject_cpu_stress() {
    local container="$1"
    local load="${2:-80}"
    docker exec "$container" sh -c "stress-ng --cpu 2 --cpu-load $load --timeout ${CHAOS_FAULT_DURATION}s" >/dev/null 2>&1 &
}

##
# Inject fault: Memory pressure
#
# Arguments:
#   $1 - Container name
#   $2 - Memory in MB
##
inject_memory_pressure() {
    local container="$1"
    local memory="${2:-256}"
    docker exec "$container" sh -c "stress-ng --vm 1 --vm-bytes ${memory}M --timeout ${CHAOS_FAULT_DURATION}s" >/dev/null 2>&1 &
}

##
# Recovery check: Container is healthy
#
# Arguments:
#   $1 - Container name
##
recovery_container_healthy() {
    local container="$1"
    local health=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")
    [ "$health" = "healthy" ]
}

##
# Recovery check: Container is running
#
# Arguments:
#   $1 - Container name
##
recovery_container_running() {
    local container="$1"
    docker ps --format '{{.Names}}' | grep -q "^${container}$"
}

##
# Recovery check: HTTP endpoint responds
#
# Arguments:
#   $1 - URL
##
recovery_http_ok() {
    local url="$1"
    curl -sf -o /dev/null "$url" --insecure 2>/dev/null
}

##
# Recovery check: Database connection
#
# Arguments:
#   $1 - Container name
##
recovery_db_connection() {
    local container="$1"
    docker exec "$container" pg_isready -U postgres >/dev/null 2>&1
}

##
# Cleanup: Start a stopped container
#
# Arguments:
#   $1 - Container name
##
cleanup_container_start() {
    local container="$1"
    docker start "$container" >/dev/null 2>&1
}

##
# Cleanup: Reconnect container to network
#
# Arguments:
#   $1 - Container name
#   $2 - Network name
##
cleanup_network_reconnect() {
    local container="$1"
    local network="${2:-dive-shared}"
    docker network connect "$network" "$container" >/dev/null 2>&1
}

# =============================================================================
# EXPORTS
# =============================================================================

export -f chaos_suite_start
export -f chaos_suite_end
export -f chaos_test
export -f inject_container_stop
export -f inject_container_kill
export -f inject_network_disconnect
export -f inject_cpu_stress
export -f inject_memory_pressure
export -f recovery_container_healthy
export -f recovery_container_running
export -f recovery_http_ok
export -f recovery_db_connection
export -f cleanup_container_start
export -f cleanup_network_reconnect

echo "Chaos testing framework loaded"
