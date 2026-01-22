#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Chaos Test: Database Failure
# =============================================================================
# Tests system resilience to database unavailability
# =============================================================================

set -e

CHAOS_DIR="$(dirname "${BASH_SOURCE[0]}")"
source "${CHAOS_DIR}/chaos-framework.sh"

# =============================================================================
# DATABASE FAILURE TESTS
# =============================================================================

run_database_failure_tests() {
    local target="${1:-hub}"

    chaos_suite_start "Database Failure Tests ($target)"

    local pg_container="dive-${target}-postgres"

    # Test 1: PostgreSQL stop and restart
    chaos_test \
        "PostgreSQL Stop/Restart Recovery" \
        "inject_container_stop $pg_container" \
        "recovery_container_healthy $pg_container" \
        "cleanup_container_start $pg_container"

    # Test 2: PostgreSQL kill and recovery
    chaos_test \
        "PostgreSQL Kill Recovery" \
        "inject_container_kill $pg_container" \
        "recovery_container_running $pg_container" \
        "cleanup_container_start $pg_container"

    # Test 3: PostgreSQL connection test
    chaos_test \
        "PostgreSQL Connection Recovery" \
        "inject_container_stop $pg_container" \
        "recovery_db_connection $pg_container" \
        "cleanup_container_start $pg_container"

    # Test 4: Dependent services recovery (Keycloak)
    local kc_container="dive-${target}-keycloak"

    chaos_test \
        "Keycloak Recovery After DB Failure" \
        "inject_container_stop $pg_container; sleep 10; docker start $pg_container" \
        "recovery_container_healthy $kc_container" \
        ""

    chaos_suite_end
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    run_database_failure_tests "$@"
fi
