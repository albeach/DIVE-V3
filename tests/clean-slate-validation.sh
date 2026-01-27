#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Clean Slate Validation Script
# =============================================================================
# Comprehensive clean slate deployment test with enhanced logging
# Tests all fixes from previous session with full traceability
# =============================================================================

set -e

# Project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export DIVE_ROOT

# Load modules - must be in correct order
if [ ! -f "${DIVE_ROOT}/scripts/dive-modules/common.sh" ]; then
    echo "ERROR: common.sh not found at ${DIVE_ROOT}/scripts/dive-modules/common.sh"
    exit 1
fi

source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

# Check if functions loaded
if ! type log_header &>/dev/null; then
    echo "ERROR: log_header function not loaded from common.sh"
    exit 1
fi

source "${DIVE_ROOT}/scripts/dive-modules/utilities/secret-trace.sh"
source "${DIVE_ROOT}/scripts/dive-modules/utilities/enhanced-cleanup.sh"

# Test results
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

# Enable verbose logging
export VERBOSE=true

##
# Test assertion helper
##
assert_success() {
    local test_name="$1"
    local command="$2"

    ((TESTS_RUN++))
    log_step "Test: $test_name"

    if eval "$command"; then
        log_success "✓ PASS: $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "✗ FAIL: $test_name"
        ((TESTS_FAILED++))
        FAILED_TESTS+=("$test_name")
        return 1
    fi
}

##
# Pre-flight system check
##
preflight_checks() {
    log_header "Phase 0: Pre-Flight System Checks"
    echo ""

    # Check Docker daemon
    assert_success "Docker daemon running" "docker info >/dev/null 2>&1"

    # Check disk space (need at least 10GB)
    local available_gb=$(df -BG "$DIVE_ROOT" | awk 'NR==2 {print $4}' | sed 's/G//')
    assert_success "Sufficient disk space (${available_gb}GB available)" "[ $available_gb -gt 10 ]"

    # Check required tools
    assert_success "docker-compose available" "command -v docker >/dev/null 2>&1"
    assert_success "jq available" "command -v jq >/dev/null 2>&1"
    assert_success "curl available" "command -v curl >/dev/null 2>&1"

    # Check gcloud (optional but recommended)
    if command -v gcloud &>/dev/null; then
        log_success "✓ gcloud CLI available"
    else
        log_warn "⚠ gcloud CLI not available - will use .env files only"
    fi

    echo ""
}

##
# Phase 1: Enhanced Cleanup
##
phase1_cleanup() {
    log_header "Phase 1: Enhanced Cleanup"
    echo ""

    log_step "Stopping all DIVE containers..."
    docker ps -q --filter "name=dive" | xargs -r docker stop 2>/dev/null || true

    log_step "Removing all DIVE containers..."
    docker ps -aq --filter "name=dive" | xargs -r docker rm -f 2>/dev/null || true

    log_step "Removing all DIVE volumes..."
    local volumes=$(docker volume ls --filter "name=dive" -q)
    if [ -n "$volumes" ]; then
        echo "$volumes" | xargs -r docker volume rm 2>/dev/null || true
        log_success "✓ Removed volumes: $(echo "$volumes" | wc -l | tr -d ' ')"
    else
        log_verbose "✓ No volumes to remove"
    fi

    log_step "Pruning orphaned volumes..."
    docker volume prune -f >/dev/null 2>&1

    log_step "Removing DIVE networks..."
    docker network ls --filter "name=dive" -q | xargs -r docker network rm 2>/dev/null || true

    log_step "Cleaning up Terraform state..."
    find "$DIVE_ROOT/terraform" -name ".terraform" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$DIVE_ROOT/terraform" -name "terraform.tfstate*" -type f -delete 2>/dev/null || true

    log_step "Cleaning up checkpoint files..."
    find "$DIVE_ROOT/instances" -name ".phases" -type d -exec rm -rf {} + 2>/dev/null || true

    log_step "Removing old instance configs..."
    rm -rf "$DIVE_ROOT/instances/est" 2>/dev/null || true

    log_step "Verifying clean state..."
    local remaining_containers=$(docker ps -aq --filter "name=dive" | wc -l | tr -d ' ')
    local remaining_volumes=$(docker volume ls --filter "name=dive" -q | wc -l | tr -d ' ')
    local remaining_networks=$(docker network ls --filter "name=dive" -q | wc -l | tr -d ' ')

    log_verbose "Final state:"
    log_verbose "  Containers: $remaining_containers"
    log_verbose "  Volumes: $remaining_volumes"
    log_verbose "  Networks: $remaining_networks"

    assert_success "All containers removed" "[ $remaining_containers -eq 0 ]"
    assert_success "All volumes removed" "[ $remaining_volumes -eq 0 ]"

    echo ""
}

##
# Phase 2: Secret Loading with Tracing
##
phase2_secrets() {
    log_header "Phase 2: Secret Loading & Tracing"
    echo ""

    # Initialize secret tracing
    secret_trace_init

    log_step "Loading Hub secrets with tracing..."

    # Test loading critical Hub secrets
    local hub_secrets=(
        "FEDERATION_ADMIN_KEY"
        "KEYCLOAK_ADMIN_PASSWORD"
        "MONGODB_ROOT_PASSWORD"
        "POSTGRES_PASSWORD"
    )

    for secret in "${hub_secrets[@]}"; do
        log_verbose "Loading $secret..."
        if value=$(secret_trace_unified "$secret" "" "${DIVE_ROOT}/.env.hub"); then
            export "$secret=$value"
            log_success "  ✓ $secret loaded (length=${#value})"
        else
            log_error "  ✗ Failed to load $secret"
        fi
    done

    echo ""

    # Validate all critical secrets loaded
    assert_success "All critical Hub secrets loaded" \
        "secret_trace_validate FEDERATION_ADMIN_KEY KEYCLOAK_ADMIN_PASSWORD MONGODB_ROOT_PASSWORD POSTGRES_PASSWORD"

    # Show secret trace summary
    secret_trace_summary

    echo ""
}

##
# Phase 3: Hub Deployment
##
phase3_hub() {
    log_header "Phase 3: Hub Deployment"
    echo ""

    log_step "Deploying Hub..."
    cd "$DIVE_ROOT"

    if ./dive hub up --verbose 2>&1 | tee /tmp/hub-deploy.log; then
        log_success "✓ Hub deployment initiated"
    else
        log_error "✗ Hub deployment failed"
        echo "Last 20 lines of output:"
        tail -20 /tmp/hub-deploy.log
        return 1
    fi

    log_step "Waiting for Hub containers to start (60s)..."
    sleep 60

    log_step "Checking Hub container health..."
    local hub_containers=$(docker ps --filter "name=dive-hub" --format "{{.Names}}")
    log_verbose "Hub containers running:"
    echo "$hub_containers" | while read -r container; do
        local status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-healthcheck")
        log_verbose "  - $container: $status"
    done

    local healthy_count=$(docker ps --filter "name=dive-hub" --filter "health=healthy" | grep -c dive-hub || echo "0")
    local total_count=$(docker ps --filter "name=dive-hub" | grep -c dive-hub || echo "0")

    log_verbose "Health: $healthy_count/$total_count containers healthy"

    # Check Hub API
    log_step "Checking Hub API..."
    sleep 10
    if curl -sf https://localhost:4000/health >/dev/null 2>&1; then
        log_success "✓ Hub API responding"
    else
        log_warn "⚠ Hub API not responding yet (may need more time)"
    fi

    # Check Hub Keycloak
    log_step "Checking Hub Keycloak..."
    if curl -sf http://localhost:8081/health >/dev/null 2>&1; then
        log_success "✓ Hub Keycloak responding"
    else
        log_warn "⚠ Hub Keycloak not responding yet"
    fi

    echo ""
}

##
# Phase 4: EST Spoke Deployment
##
phase4_est() {
    log_header "Phase 4: EST Spoke Deployment"
    echo ""

    log_step "Deploying EST spoke..."
    cd "$DIVE_ROOT"

    # Deploy with verbose logging
    if ./dive spoke deploy EST --verbose 2>&1 | tee /tmp/est-deploy.log; then
        log_success "✓ EST deployment completed"
    else
        log_error "✗ EST deployment failed"
        echo ""
        echo "Last 50 lines of output:"
        tail -50 /tmp/est-deploy.log
        echo ""
        echo "Checking for common errors:"
        grep -i "error\|fail\|timeout" /tmp/est-deploy.log | tail -20 || echo "No errors found in log"
        return 1
    fi

    echo ""
}

##
# Phase 5: Federation Validation
##
phase5_federation() {
    log_header "Phase 5: Federation Validation"
    echo ""

    # Ensure FEDERATION_ADMIN_KEY loaded
    if [ -z "${FEDERATION_ADMIN_KEY:-}" ]; then
        FEDERATION_ADMIN_KEY=$(grep "^FEDERATION_ADMIN_KEY=" "${DIVE_ROOT}/.env.hub" | cut -d'=' -f2-)
        export FEDERATION_ADMIN_KEY
    fi

    log_step "Checking federation registration..."
    local fed_response=$(curl -sk https://localhost:4000/api/federation/spokes \
        -H "X-Admin-Key: $FEDERATION_ADMIN_KEY" 2>/dev/null || echo "{}")

    log_verbose "Federation API response:"
    echo "$fed_response" | jq '.' 2>/dev/null || echo "$fed_response"
    echo ""

    local est_status=$(echo "$fed_response" | jq -r '.spokes[] | select(.spokeId=="est") | .status' 2>/dev/null || echo "not-found")
    log_verbose "EST federation status: $est_status"

    assert_success "EST registered in Hub" "[ \"$est_status\" != \"not-found\" ]"

    echo ""
}

##
# Phase 6: OPAL Sync Validation
##
phase6_opal() {
    log_header "Phase 6: OPAL Policy Sync Validation"
    echo ""

    log_step "Checking OPAL client logs..."
    local opal_logs=$(docker logs dive-spoke-est-opal-client --since 2m 2>&1 || echo "")

    if echo "$opal_logs" | grep -q "Connected to server"; then
        log_success "✓ OPAL client connected to Hub server"
    else
        log_warn "⚠ OPAL connection status unclear"
    fi

    if echo "$opal_logs" | grep -q "policy"; then
        log_verbose "OPAL policy sync activity detected"
    fi

    echo ""
}

##
# Phase 7: Health Checks
##
phase7_health() {
    log_header "Phase 7: Comprehensive Health Checks"
    echo ""

    log_step "Hub Health Checks..."
    assert_success "Hub backend healthy" "curl -sf https://localhost:4000/health >/dev/null 2>&1"
    assert_success "Hub Keycloak healthy" "curl -sf http://localhost:8081/health >/dev/null 2>&1"
    assert_success "Hub MongoDB responding" "docker exec dive-hub-mongodb mongosh --eval 'db.adminCommand(\"ping\")' >/dev/null 2>&1"

    echo ""

    log_step "EST Health Checks..."
    assert_success "EST backend healthy" "curl -sf https://localhost:4008/health >/dev/null 2>&1"
    assert_success "EST Keycloak healthy" "docker exec dive-spoke-est-keycloak curl -sf http://localhost:8080/health >/dev/null 2>&1"
    assert_success "EST MongoDB responding" "docker exec dive-spoke-est-mongodb mongosh --eval 'db.adminCommand(\"ping\")' >/dev/null 2>&1"

    echo ""
}

##
# Final Report
##
final_report() {
    log_header "Clean Slate Validation Results"
    echo ""

    echo "Tests Run: $TESTS_RUN"
    echo "Tests Passed: $TESTS_PASSED"
    echo "Tests Failed: $TESTS_FAILED"
    echo ""

    if [ $TESTS_FAILED -gt 0 ]; then
        echo "Failed Tests:"
        for test in "${FAILED_TESTS[@]}"; do
            echo "  ✗ $test"
        done
        echo ""
    fi

    local success_rate=$((TESTS_PASSED * 100 / TESTS_RUN))
    echo "Success Rate: $success_rate%"
    echo ""

    # Show secret trace summary
    echo "=== Secret Loading Summary ==="
    cat "${DIVE_ROOT}/.secret-trace.log"
    echo ""

    # Container summary
    echo "=== Final Container State ==="
    docker ps --filter "name=dive" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | head -20
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        log_success "🎉 ALL TESTS PASSED - Clean slate validation successful!"
        return 0
    else
        log_error "❌ SOME TESTS FAILED - Review output above for details"
        return 1
    fi
}

##
# Main execution
##
main() {
    log_header "DIVE V3 Clean Slate Validation Test"
    echo "Started: $(date)"
    echo ""

    # Run all phases
    preflight_checks || { log_error "Pre-flight checks failed"; exit 1; }
    phase1_cleanup || { log_error "Cleanup failed"; exit 1; }
    phase2_secrets || { log_error "Secret loading failed"; exit 1; }
    phase3_hub || { log_error "Hub deployment failed"; exit 1; }
    phase4_est || { log_error "EST deployment failed"; exit 1; }
    phase5_federation || log_warn "Federation validation had issues"
    phase6_opal || log_warn "OPAL validation had issues"
    phase7_health || log_warn "Some health checks failed"

    # Final report
    final_report
}

# Run main
main "$@"
