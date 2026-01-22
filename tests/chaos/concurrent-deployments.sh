#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Chaos Test: Concurrent Deployments
# =============================================================================
# Tests advisory lock protection against concurrent deployment attempts
# =============================================================================

set -e

CHAOS_DIR="$(dirname "${BASH_SOURCE[0]}")"
source "${CHAOS_DIR}/chaos-framework.sh"

# Load lock management
source "${DIVE_ROOT}/scripts/dive-modules/orchestration/locks.sh"

# =============================================================================
# CONCURRENT DEPLOYMENT TESTS
# =============================================================================

run_concurrent_deployment_tests() {
    local instance="${1:-ALB}"

    chaos_suite_start "Concurrent Deployment Tests ($instance)"

    # Test 1: Lock acquisition prevents concurrent deployment
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "CHAOS TEST: Lock Prevents Concurrent Deployment"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    ((CHAOS_TESTS_RUN++))

    # Acquire lock
    echo ""
    echo "Phase 1: Acquiring initial lock..."
    if orch_acquire_lock "$instance" 10; then
        echo "  ✓ Initial lock acquired"

        # Attempt second acquisition (should fail)
        echo ""
        echo "Phase 2: Attempting concurrent acquisition..."
        if orch_acquire_lock "$instance" 5 2>/dev/null; then
            echo "  ✗ Second lock acquisition succeeded (BUG!)"
            ((CHAOS_TESTS_FAILED++))
            ((CHAOS_RECOVERY_FAILED++))
        else
            echo "  ✓ Second lock correctly blocked"
            ((CHAOS_TESTS_PASSED++))
            ((CHAOS_RECOVERY_SUCCESS++))
        fi

        # Release lock
        echo ""
        echo "Phase 3: Cleanup..."
        orch_release_lock "$instance"
        echo "  ✓ Lock released"
    else
        echo "  ✗ Initial lock acquisition failed"
        ((CHAOS_TESTS_FAILED++))
        ((CHAOS_RECOVERY_FAILED++))
    fi

    # Test 2: Lock release allows subsequent deployment
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "CHAOS TEST: Lock Release Allows Subsequent Deployment"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    ((CHAOS_TESTS_RUN++))

    # Acquire and release
    echo ""
    echo "Phase 1: Acquire and release lock..."
    orch_acquire_lock "$instance" 10 >/dev/null 2>&1
    orch_release_lock "$instance"
    echo "  ✓ First cycle complete"

    # Acquire again
    echo ""
    echo "Phase 2: Acquire lock after release..."
    if orch_acquire_lock "$instance" 10; then
        echo "  ✓ Lock acquired after release"
        ((CHAOS_TESTS_PASSED++))
        ((CHAOS_RECOVERY_SUCCESS++))
        orch_release_lock "$instance"
    else
        echo "  ✗ Cannot acquire lock after release"
        ((CHAOS_TESTS_FAILED++))
        ((CHAOS_RECOVERY_FAILED++))
    fi

    # Test 3: Stale lock cleanup
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "CHAOS TEST: Stale Lock Cleanup"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    ((CHAOS_TESTS_RUN++))

    # Create a lock and simulate stale state
    echo ""
    echo "Phase 1: Creating lock..."
    orch_acquire_lock "$instance" 10 >/dev/null 2>&1

    # Force unlock (simulating cleanup of stale lock)
    echo ""
    echo "Phase 2: Force unlocking..."
    if orch_force_unlock "$instance"; then
        echo "  ✓ Force unlock successful"

        # Verify can acquire
        echo ""
        echo "Phase 3: Verify acquisition after force unlock..."
        if orch_acquire_lock "$instance" 10; then
            echo "  ✓ Can acquire after force unlock"
            ((CHAOS_TESTS_PASSED++))
            ((CHAOS_RECOVERY_SUCCESS++))
            orch_release_lock "$instance"
        else
            echo "  ✗ Cannot acquire after force unlock"
            ((CHAOS_TESTS_FAILED++))
            ((CHAOS_RECOVERY_FAILED++))
        fi
    else
        echo "  ✗ Force unlock failed"
        ((CHAOS_TESTS_FAILED++))
        ((CHAOS_RECOVERY_FAILED++))
    fi

    # Test 4: Parallel lock contention
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "CHAOS TEST: Parallel Lock Contention"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    ((CHAOS_TESTS_RUN++))

    local temp_results="/tmp/chaos-lock-results-$$"
    mkdir -p "$temp_results"

    echo ""
    echo "Phase 1: Starting 5 parallel lock attempts..."

    # Start 5 parallel lock attempts
    for i in {1..5}; do
        (
            if orch_acquire_lock "$instance" 2 2>/dev/null; then
                echo "acquired" > "${temp_results}/${i}.result"
                sleep 2
                orch_release_lock "$instance"
            else
                echo "blocked" > "${temp_results}/${i}.result"
            fi
        ) &
    done

    # Wait for all
    wait

    # Count results
    local acquired=$(grep -l "acquired" ${temp_results}/*.result 2>/dev/null | wc -l)
    local blocked=$(grep -l "blocked" ${temp_results}/*.result 2>/dev/null | wc -l)

    echo "  Acquired: $acquired"
    echo "  Blocked:  $blocked"

    # Exactly one should succeed
    if [ "$acquired" -eq 1 ]; then
        echo "  ✓ Exactly one acquisition succeeded (correct behavior)"
        ((CHAOS_TESTS_PASSED++))
        ((CHAOS_RECOVERY_SUCCESS++))
    else
        echo "  ✗ $acquired acquisitions succeeded (expected 1)"
        ((CHAOS_TESTS_FAILED++))
        ((CHAOS_RECOVERY_FAILED++))
    fi

    rm -rf "$temp_results"

    chaos_suite_end
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    run_concurrent_deployment_tests "$@"
fi
