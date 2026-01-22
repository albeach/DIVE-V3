#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Chaos Test: Secret Unavailability
# =============================================================================
# Tests system behavior when GCP secrets are unavailable
# =============================================================================

set -e

CHAOS_DIR="$(dirname "${BASH_SOURCE[0]}")"
source "${CHAOS_DIR}/chaos-framework.sh"

# =============================================================================
# SECRET UNAVAILABILITY TESTS
# =============================================================================

# Mock GCP unavailability by setting invalid project
mock_gcp_unavailable() {
    export ORIGINAL_GCP_PROJECT="${GCP_PROJECT_ID:-dive25}"
    export GCP_PROJECT_ID="invalid-project-xyz"
}

# Restore GCP settings
restore_gcp_settings() {
    export GCP_PROJECT_ID="${ORIGINAL_GCP_PROJECT:-dive25}"
    unset ORIGINAL_GCP_PROJECT
}

run_secret_unavailable_tests() {
    chaos_suite_start "Secret Unavailability Tests"

    # Test 1: Verify fail-fast on missing secrets
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "CHAOS TEST: Fail-Fast on Missing Secrets"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    ((CHAOS_TESTS_RUN++))

    # Mock unavailability
    mock_gcp_unavailable

    # Try to load secrets - should fail fast
    local result=0
    source "${DIVE_ROOT}/scripts/dive-modules/configuration/secrets.sh"

    if ! secrets_verify "TEST" 2>/dev/null; then
        echo "  ✓ System correctly fails fast when secrets unavailable"
        ((CHAOS_TESTS_PASSED++))
        ((CHAOS_RECOVERY_SUCCESS++))
    else
        echo "  ✗ System did not fail fast (security risk!)"
        ((CHAOS_TESTS_FAILED++))
        ((CHAOS_RECOVERY_FAILED++))
    fi

    # Restore
    restore_gcp_settings

    # Test 2: Verify no hardcoded fallbacks
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "CHAOS TEST: No Hardcoded Fallbacks"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    ((CHAOS_TESTS_RUN++))

    # Check for hardcoded passwords in source
    local hardcoded=$(grep -r "DivePilot2025\|admin123\|password123" \
        "${DIVE_ROOT}/scripts/dive-modules" 2>/dev/null | wc -l)

    if [ "$hardcoded" -eq 0 ]; then
        echo "  ✓ No hardcoded fallback passwords found"
        ((CHAOS_TESTS_PASSED++))
        ((CHAOS_RECOVERY_SUCCESS++))
    else
        echo "  ✗ Found $hardcoded hardcoded password(s) - security violation!"
        ((CHAOS_TESTS_FAILED++))
        ((CHAOS_RECOVERY_FAILED++))
    fi

    # Test 3: Verify clear error messages
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "CHAOS TEST: Clear Error Messages"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    ((CHAOS_TESTS_RUN++))

    mock_gcp_unavailable

    local error_output=$(secrets_verify "TEST" 2>&1 || true)

    restore_gcp_settings

    if echo "$error_output" | grep -qi "not authenticated\|not available\|failed"; then
        echo "  ✓ Clear error message provided"
        ((CHAOS_TESTS_PASSED++))
        ((CHAOS_RECOVERY_SUCCESS++))
    else
        echo "  ✗ Error message not clear or missing"
        ((CHAOS_TESTS_FAILED++))
        ((CHAOS_RECOVERY_FAILED++))
    fi

    chaos_suite_end
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    run_secret_unavailable_tests "$@"
fi
