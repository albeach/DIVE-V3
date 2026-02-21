#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Chaos Test: Network Partition
# =============================================================================
# Tests system resilience to network partitioning between services
# =============================================================================

set -e

CHAOS_DIR="$(dirname "${BASH_SOURCE[0]}")"
source "${CHAOS_DIR}/chaos-framework.sh"

# =============================================================================
# NETWORK PARTITION TESTS
# =============================================================================

run_network_partition_tests() {
    local target="${1:-hub}"

    chaos_suite_start "Network Partition Tests ($target)"

    local kc_container="dive-${target}-keycloak"
    local backend_container="dive-${target}-backend"

    # Test 1: Keycloak network disconnect
    chaos_test \
        "Keycloak Network Partition Recovery" \
        "inject_network_disconnect $kc_container dive-shared" \
        "recovery_container_healthy $kc_container" \
        "cleanup_network_reconnect $kc_container dive-shared"

    # Test 2: Backend network disconnect
    chaos_test \
        "Backend Network Partition Recovery" \
        "inject_network_disconnect $backend_container dive-shared" \
        "recovery_http_ok http://localhost:4000/health" \
        "cleanup_network_reconnect $backend_container dive-shared"

    # Test 3: Hub-Spoke network partition (if spoke)
    if [ "$target" != "hub" ]; then
        local spoke_kc="dive-spoke-${target}-keycloak"

        chaos_test \
            "Hub-Spoke Network Partition Recovery" \
            "inject_network_disconnect $spoke_kc dive-shared" \
            "recovery_container_healthy $spoke_kc" \
            "cleanup_network_reconnect $spoke_kc dive-shared"
    fi

    chaos_suite_end
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    run_network_partition_tests "$@"
fi
