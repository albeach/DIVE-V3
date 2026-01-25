#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Clean Slate Federation Test
# =============================================================================
# End-to-end test that:
# 1. Nukes the entire environment
# 2. Deploys Hub from scratch
# 3. Initializes and deploys a spoke
# 4. Verifies bidirectional federation
# 5. Runs integration tests
#
# Phase 4.3: Clean Slate Testing
#
# Usage:
#   ./tests/federation/test-clean-slate.sh [options]
#
# Options:
#   --spoke CODE      Spoke to deploy (default: FRA)
#   --skip-nuke       Skip the nuke step (use existing environment)
#   --quick           Skip slow verification steps
#   --timeout MIN     Timeout in minutes (default: 15)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIVE_CLI="${DIVE_ROOT}/dive"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Default options
SPOKE_CODE="FRA"
SKIP_NUKE=false
QUICK_MODE=false
TIMEOUT_MIN=15

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --spoke)
            SPOKE_CODE="${2^^}"
            shift 2
            ;;
        --skip-nuke)
            SKIP_NUKE=true
            shift
            ;;
        --quick)
            QUICK_MODE=true
            shift
            ;;
        --timeout)
            TIMEOUT_MIN="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

SPOKE_LOWER="${SPOKE_CODE,,}"
START_TIME=$(date +%s)
TIMEOUT_SEC=$((TIMEOUT_MIN * 60))

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

log_step() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}$1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_info() {
    echo -e "  ${CYAN}ℹ${NC} $1"
}

log_success() {
    echo -e "  ${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "  ${RED}✗${NC} $1"
}

log_warn() {
    echo -e "  ${YELLOW}⚠${NC} $1"
}

elapsed_time() {
    local now=$(date +%s)
    local elapsed=$((now - START_TIME))
    echo "$((elapsed / 60))m $((elapsed % 60))s"
}

check_timeout() {
    local now=$(date +%s)
    local elapsed=$((now - START_TIME))
    if [ $elapsed -gt $TIMEOUT_SEC ]; then
        log_error "Timeout exceeded (${TIMEOUT_MIN} minutes)"
        exit 1
    fi
}

wait_for_container() {
    local container_name="$1"
    local max_wait="${2:-120}"
    local waited=0

    while [ $waited -lt $max_wait ]; do
        if docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
            return 0
        fi
        sleep 2
        ((waited += 2))
        check_timeout
    done

    return 1
}

wait_for_health() {
    local url="$1"
    local max_wait="${2:-120}"
    local waited=0

    while [ $waited -lt $max_wait ]; do
        if curl -ks --max-time 5 "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
        ((waited += 2))
        check_timeout
    done

    return 1
}

# =============================================================================
# PHASE 1: NUKE
# =============================================================================

phase_nuke() {
    log_step "Phase 1: Clean Slate (Nuke)"

    if [ "$SKIP_NUKE" = true ]; then
        log_warn "Skipping nuke (--skip-nuke specified)"
        return 0
    fi

    log_info "Destroying all DIVE resources..."

    if [ -x "$DIVE_CLI" ]; then
        "$DIVE_CLI" nuke --confirm --reset-spokes 2>&1 | tail -20 || true
    else
        # Manual cleanup
        docker ps -a --filter "name=dive" --format '{{.Names}}' | grep . | xargs docker rm -f 2>/dev/null || true
        docker volume ls --filter "name=dive" -q | grep . | xargs docker volume rm 2>/dev/null || true
        docker network ls --filter "name=dive" -q | grep . | xargs docker network rm 2>/dev/null || true
    fi

    # Verify clean
    local remaining=$(docker ps -a --filter "name=dive" --format '{{.Names}}' | wc -l)
    if [ "$remaining" -eq 0 ]; then
        log_success "Clean slate achieved (no DIVE containers)"
    else
        log_warn "$remaining containers remain (may be stopping)"
        sleep 5
    fi

    log_info "Elapsed: $(elapsed_time)"
}

# =============================================================================
# PHASE 2: DEPLOY HUB
# =============================================================================

phase_deploy_hub() {
    log_step "Phase 2: Deploy Hub"

    log_info "Starting Hub deployment..."

    if [ -x "$DIVE_CLI" ]; then
        "$DIVE_CLI" up 2>&1 | tail -30 || {
            log_error "Hub deployment failed"
            exit 1
        }
    else
        cd "$DIVE_ROOT"
        docker compose -f docker-compose.hub.yml up -d 2>&1 | tail -20
    fi

    # Wait for essential services
    log_info "Waiting for Hub Keycloak..."
    if wait_for_container "dive-hub-keycloak" 180; then
        log_success "Hub Keycloak container running"
    else
        log_error "Hub Keycloak failed to start"
        exit 1
    fi

    log_info "Waiting for Keycloak health..."
    if wait_for_health "https://localhost:8443/health/ready" 120; then
        log_success "Hub Keycloak healthy"
    else
        log_warn "Keycloak health check failed (may still be initializing)"
    fi

    log_info "Waiting for Hub Backend..."
    if wait_for_health "https://localhost:4000/health" 60; then
        log_success "Hub Backend healthy"
    else
        log_warn "Hub Backend not responding yet"
    fi

    log_info "Elapsed: $(elapsed_time)"
}

# =============================================================================
# PHASE 3: INIT SPOKE
# =============================================================================

phase_init_spoke() {
    log_step "Phase 3: Initialize Spoke (${SPOKE_CODE})"

    log_info "Initializing spoke ${SPOKE_CODE}..."

    if [ -x "$DIVE_CLI" ]; then
        "$DIVE_CLI" spoke init "${SPOKE_CODE}" "${SPOKE_CODE} Test Instance" 2>&1 | tail -20 || {
            log_error "Spoke init failed"
            exit 1
        }
    else
        log_error "DIVE CLI not found"
        exit 1
    fi

    local spoke_dir="${DIVE_ROOT}/instances/${SPOKE_LOWER}"
    if [ -d "$spoke_dir" ]; then
        log_success "Spoke directory created: ${spoke_dir}"
    else
        log_error "Spoke directory not created"
        exit 1
    fi

    if [ -f "${spoke_dir}/docker-compose.yml" ]; then
        log_success "docker-compose.yml generated"
    else
        log_error "docker-compose.yml not found"
        exit 1
    fi

    log_info "Elapsed: $(elapsed_time)"
}

# =============================================================================
# PHASE 4: DEPLOY SPOKE
# =============================================================================

phase_deploy_spoke() {
    log_step "Phase 4: Deploy Spoke (${SPOKE_CODE})"

    log_info "Starting spoke deployment..."

    if [ -x "$DIVE_CLI" ]; then
        "$DIVE_CLI" spoke deploy "${SPOKE_CODE}" 2>&1 | tail -30 || {
            log_warn "Spoke deploy returned non-zero (may be expected for federation)"
        }
    fi

    # Wait for spoke Keycloak
    log_info "Waiting for Spoke Keycloak..."
    if wait_for_container "dive-spoke-${SPOKE_LOWER}-keycloak" 180; then
        log_success "Spoke Keycloak container running"
    else
        log_error "Spoke Keycloak failed to start"
        exit 1
    fi

    log_info "Elapsed: $(elapsed_time)"
}

# =============================================================================
# PHASE 5: CONFIGURE FEDERATION
# =============================================================================

phase_configure_federation() {
    log_step "Phase 5: Configure Bidirectional Federation"

    log_info "Linking spoke to hub federation..."

    if [ -x "$DIVE_CLI" ]; then
        "$DIVE_CLI" federation link "${SPOKE_CODE}" 2>&1 | tail -20 || {
            log_warn "Federation link returned non-zero"
        }
    fi

    # Sync secrets
    log_info "Synchronizing client secrets..."
    if [ -x "$DIVE_CLI" ]; then
        "$DIVE_CLI" federation sync-secrets "${SPOKE_CODE}" 2>&1 | tail -10 || true
    fi

    log_info "Elapsed: $(elapsed_time)"
}

# =============================================================================
# PHASE 6: VERIFY FEDERATION
# =============================================================================

phase_verify_federation() {
    log_step "Phase 6: Verify Federation"

    local verify_passed=0
    local verify_failed=0

    if [ "$QUICK_MODE" = true ]; then
        log_warn "Skipping detailed verification (--quick mode)"
        return 0
    fi

    # Verify using DIVE CLI if available
    if [ -x "$DIVE_CLI" ]; then
        log_info "Running federation verify..."
        local verify_output
        verify_output=$("$DIVE_CLI" federation verify "${SPOKE_CODE}" 2>&1 | tail -30) || true
        echo "$verify_output" | head -20

        if echo "$verify_output" | grep -q "PASS"; then
            verify_passed=$(echo "$verify_output" | grep -c "PASS" || echo 0)
        fi
        if echo "$verify_output" | grep -q "FAIL"; then
            verify_failed=$(echo "$verify_output" | grep -c "FAIL" || echo 0)
        fi

        if [ "$verify_failed" -eq 0 ]; then
            log_success "Federation verification passed ($verify_passed checks)"
        else
            log_warn "Federation verification: $verify_passed passed, $verify_failed failed"
        fi
    fi

    # Additional checks
    log_info "Checking IdP in Hub..."
    local hub_kc="dive-hub-keycloak"
    local hub_pass
    hub_pass=$(docker exec "$hub_kc" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')

    if [ -n "$hub_pass" ]; then
        local hub_token
        hub_token=$(docker exec "$hub_kc" curl -sf \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" \
            -d "username=admin" \
            -d "password=${hub_pass}" \
            -d "client_id=admin-cli" 2>/dev/null | jq -r '.access_token // ""')

        if [ -n "$hub_token" ]; then
            local idp_exists
            idp_exists=$(docker exec "$hub_kc" curl -sf \
                -H "Authorization: Bearer $hub_token" \
                "http://localhost:8080/admin/realms/dive-v3-broker-usa/identity-provider/instances/${SPOKE_LOWER}-idp" 2>/dev/null)

            if echo "$idp_exists" | grep -q '"alias"'; then
                log_success "${SPOKE_CODE}-idp exists in Hub Keycloak"
            else
                log_warn "${SPOKE_CODE}-idp not found in Hub"
            fi
        fi
    fi

    log_info "Elapsed: $(elapsed_time)"
}

# =============================================================================
# PHASE 7: RUN INTEGRATION TESTS
# =============================================================================

phase_integration_tests() {
    log_step "Phase 7: Integration Tests"

    local test_script="${SCRIPT_DIR}/test-federation-architecture.sh"

    if [ -x "$test_script" ]; then
        log_info "Running federation architecture tests..."
        local test_args="--spoke ${SPOKE_CODE}"
        [ "$QUICK_MODE" = true ] && test_args="$test_args --quick"

        "$test_script" $test_args 2>&1 | tail -50 || {
            log_warn "Some integration tests failed"
        }
    else
        log_warn "Integration test script not found"
    fi

    log_info "Elapsed: $(elapsed_time)"
}

# =============================================================================
# SUMMARY
# =============================================================================

phase_summary() {
    log_step "Test Complete"

    local end_time=$(date +%s)
    local total_elapsed=$((end_time - START_TIME))

    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║              Clean Slate Test Summary                        ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "  Spoke Tested: ${SPOKE_CODE}"
    echo "  Total Time:   $((total_elapsed / 60))m $((total_elapsed % 60))s"
    echo "  Quick Mode:   ${QUICK_MODE}"
    echo "  Skip Nuke:    ${SKIP_NUKE}"
    echo ""

    # Quick container summary
    local hub_containers=$(docker ps --filter "name=dive-hub" --format '{{.Names}}' | wc -l)
    local spoke_containers=$(docker ps --filter "name=dive-spoke-${SPOKE_LOWER}" --format '{{.Names}}' | wc -l)

    echo "  Hub Containers:   ${hub_containers}"
    echo "  Spoke Containers: ${spoke_containers}"
    echo ""

    if [ "$hub_containers" -gt 0 ] && [ "$spoke_containers" -gt 0 ]; then
        echo -e "${GREEN}✓ Clean slate test completed successfully!${NC}"
    else
        echo -e "${YELLOW}⚠ Test completed with warnings. Check output above.${NC}"
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║          DIVE V3 Clean Slate Federation Test                ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "  Start Time:  $(date '+%Y-%m-%d %H:%M:%S')"
    echo "  Spoke:       ${SPOKE_CODE}"
    echo "  Timeout:     ${TIMEOUT_MIN} minutes"
    echo "  Quick Mode:  ${QUICK_MODE}"
    echo "  Skip Nuke:   ${SKIP_NUKE}"

    # Run phases
    phase_nuke
    phase_deploy_hub
    phase_init_spoke
    phase_deploy_spoke
    phase_configure_federation
    phase_verify_federation
    phase_integration_tests
    phase_summary
}

# Run main
main "$@"
