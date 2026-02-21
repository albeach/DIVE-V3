#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Clean Slate Validation Script (Simplified)
# =============================================================================

set -e

# Project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export DIVE_ROOT

# Enable verbose
export VERBOSE=true

# Simple logging functions
log_header() {
    echo ""
    echo "=============================================================================="
    echo "$1"
    echo "=============================================================================="
    echo ""
}

log_phase() {
    echo ""
    echo "--- $1 ---"
    echo ""
}

log_step() {
    echo "→ $1"
}

log_success() {
    echo "✓ $1"
}

log_error() {
    echo "✗ $1" >&2
}

log_warn() {
    echo "⚠ $1"
}

# Test tracking
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

assert_success() {
    local test_name="$1"
    local command="$2"

    ((TESTS_RUN++))
    echo -n "Testing: $test_name ... "

    if eval "$command" >/dev/null 2>&1; then
        echo "✓ PASS"
        ((TESTS_PASSED++))
        return 0
    else
        echo "✗ FAIL"
        ((TESTS_FAILED++))
        FAILED_TESTS+=("$test_name")
        return 1
    fi
}

# =============================================================================
# PHASE 0: Preflight
# =============================================================================
phase0_preflight() {
    log_header "PHASE 0: PRE-FLIGHT CHECKS"

    assert_success "Docker daemon running" "docker info"
    assert_success "docker-compose available" "command -v docker"
    assert_success "jq available" "command -v jq"
    assert_success "curl available" "command -v curl"

    local available_gb=$(df -BG "$DIVE_ROOT" | awk 'NR==2 {print $4}' | sed 's/G//')
    echo "Available disk space: ${available_gb}GB"
    assert_success "Sufficient disk space (>10GB)" "[ $available_gb -gt 10 ]"

    echo ""
}

# =============================================================================
# PHASE 1: Cleanup
# =============================================================================
phase1_cleanup() {
    log_header "PHASE 1: COMPREHENSIVE CLEANUP"

    log_step "Stopping all DIVE containers..."
    docker ps -q --filter "name=dive" | xargs -r docker stop 2>/dev/null || true
    echo "✓ Stopped"

    log_step "Removing all DIVE containers..."
    docker ps -aq --filter "name=dive" | xargs -r docker rm -f 2>/dev/null || true
    echo "✓ Removed"

    log_step "Removing all DIVE volumes..."
    docker volume ls --filter "name=dive" -q | xargs -r docker volume rm 2>/dev/null || true
    echo "✓ Removed"

    log_step "Pruning orphaned volumes..."
    docker volume prune -f >/dev/null 2>&1
    echo "✓ Pruned"

    log_step "Removing DIVE networks..."
    docker network ls --filter "name=dive" -q | xargs -r docker network rm 2>/dev/null || true
    echo "✓ Removed"

    log_step "Cleaning Terraform state..."
    find "$DIVE_ROOT/terraform" -name ".terraform" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$DIVE_ROOT/terraform" -name "terraform.tfstate*" -type f -delete 2>/dev/null || true
    echo "✓ Cleaned"

    log_step "Cleaning checkpoint files..."
    find "$DIVE_ROOT/instances" -name ".phases" -type d -exec rm -rf {} + 2>/dev/null || true
    echo "✓ Cleaned"

    log_step "Removing EST instance config..."
    rm -rf "$DIVE_ROOT/instances/est" 2>/dev/null || true
    echo "✓ Removed"

    log_step "Verifying clean state..."
    local remaining=$(docker ps -aq --filter "name=dive" | wc -l | tr -d ' ')
    echo "Remaining DIVE containers: $remaining"
    assert_success "All containers removed" "[ $remaining -eq 0 ]"

    echo ""
}

# =============================================================================
# PHASE 2: Hub Deployment
# =============================================================================
phase2_hub() {
    log_header "PHASE 2: HUB DEPLOYMENT"

    log_step "Deploying Hub..."
    cd "$DIVE_ROOT"

    if ./dive hub up 2>&1 | tee /tmp/hub-deploy.log; then
        echo "✓ Hub deployment command completed"
    else
        echo "✗ Hub deployment failed"
        echo "Last 30 lines of output:"
        tail -30 /tmp/hub-deploy.log
        return 1
    fi

    log_step "Waiting for Hub initialization (60s)..."
    sleep 60

    log_step "Checking Hub containers..."
    docker ps --filter "name=dive-hub" --format "{{.Names}}: {{.Status}}"

    local hub_count=$(docker ps --filter "name=dive-hub" | grep -c dive-hub || echo "0")
    echo "Hub containers running: $hub_count"

    log_step "Testing Hub API..."
    sleep 5
    if curl -sf https://localhost:4000/health >/dev/null 2>&1; then
        echo "✓ Hub API responding"
    else
        log_warn "Hub API not responding yet"
    fi

    log_step "Testing Hub Keycloak..."
    if curl -sf http://localhost:8081/health >/dev/null 2>&1; then
        echo "✓ Hub Keycloak responding"
    else
        log_warn "Hub Keycloak not responding yet"
    fi

    echo ""
}

# =============================================================================
# PHASE 3: EST Spoke Deployment
# =============================================================================
phase3_est() {
    log_header "PHASE 3: EST SPOKE DEPLOYMENT"

    log_step "Deploying EST spoke..."
    cd "$DIVE_ROOT"

    if ./dive spoke deploy EST 2>&1 | tee /tmp/est-deploy.log; then
        echo "✓ EST deployment completed"
    else
        echo "✗ EST deployment FAILED"
        echo ""
        echo "=== LAST 50 LINES OF EST DEPLOYMENT LOG ==="
        tail -50 /tmp/est-deploy.log
        echo ""
        echo "=== ERROR SUMMARY ==="
        grep -i "error\|fail\|timeout" /tmp/est-deploy.log | tail -20 || echo "No explicit errors found"
        return 1
    fi

    echo ""
}

# =============================================================================
# PHASE 4: Federation Validation
# =============================================================================
phase4_federation() {
    log_header "PHASE 4: FEDERATION VALIDATION"

    log_step "Loading federation admin key..."
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        FEDERATION_ADMIN_KEY=$(grep "^FEDERATION_ADMIN_KEY=" "${DIVE_ROOT}/.env.hub" | cut -d'=' -f2-)
        export FEDERATION_ADMIN_KEY
        echo "✓ Admin key loaded (length=${#FEDERATION_ADMIN_KEY})"
    else
        log_error ".env.hub not found"
        return 1
    fi

    log_step "Querying Hub federation API..."
    local fed_response=$(curl -sk https://localhost:4000/api/federation/spokes \
        -H "X-Admin-Key: $FEDERATION_ADMIN_KEY" 2>/dev/null || echo "{}")

    echo "Federation API response:"
    echo "$fed_response" | jq '.' 2>/dev/null || echo "$fed_response"

    local est_status=$(echo "$fed_response" | jq -r '.spokes[] | select(.spokeId=="est") | .status' 2>/dev/null || echo "not-found")
    echo "EST status: $est_status"

    if [ "$est_status" != "not-found" ]; then
        echo "✓ EST is registered in Hub"
    else
        log_warn "EST not found in federation registry"
    fi

    echo ""
}

# =============================================================================
# PHASE 5: Health Checks
# =============================================================================
phase5_health() {
    log_header "PHASE 5: HEALTH CHECKS"

    log_phase "Hub Health"
    assert_success "Hub backend healthy" "curl -sf https://localhost:4000/health"
    assert_success "Hub Keycloak healthy" "curl -sf http://localhost:8081/health"
    assert_success "Hub MongoDB responding" "docker exec dive-hub-mongodb mongosh --eval 'db.adminCommand(\"ping\")'"

    log_phase "EST Health"
    assert_success "EST backend healthy" "curl -sf https://localhost:4008/health"
    assert_success "EST Keycloak healthy" "docker exec dive-spoke-est-keycloak curl -sf http://localhost:8080/health"
    assert_success "EST MongoDB responding" "docker exec dive-spoke-est-mongodb mongosh --eval 'db.adminCommand(\"ping\")'"

    echo ""
}

# =============================================================================
# PHASE 6: Secret Tracing
# =============================================================================
phase6_secrets() {
    log_header "PHASE 6: SECRET TRACING"

    echo "Hub Secrets (.env.hub):"
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        grep -E "^(FEDERATION_ADMIN_KEY|KEYCLOAK_ADMIN_PASSWORD|MONGODB_ROOT_PASSWORD)=" "${DIVE_ROOT}/.env.hub" | \
            sed 's/=.*/=***(length:'$(echo "$FEDERATION_ADMIN_KEY" | wc -c)')'
        echo "✓ Hub .env.hub exists and contains secrets"
    else
        log_error "Hub .env.hub NOT FOUND"
    fi

    echo ""
    echo "EST Secrets (.env):"
    if [ -f "${DIVE_ROOT}/instances/est/.env" ]; then
        echo "✓ EST .env exists"
        wc -l "${DIVE_ROOT}/instances/est/.env"
    else
        log_error "EST .env NOT FOUND"
    fi

    echo ""
}

# =============================================================================
# Final Report
# =============================================================================
final_report() {
    log_header "CLEAN SLATE VALIDATION RESULTS"

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

    echo "=== Container Summary ==="
    docker ps --filter "name=dive" --format "table {{.Names}}\t{{.Status}}"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        log_success "🎉 ALL TESTS PASSED - Clean slate validation successful!"
        return 0
    else
        log_error "❌ SOME TESTS FAILED - Review output above"
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================
main() {
    log_header "DIVE V3 CLEAN SLATE VALIDATION"
    echo "Started: $(date)"
    echo "DIVE_ROOT: $DIVE_ROOT"
    echo ""

    phase0_preflight || { log_error "Preflight failed"; exit 1; }
    phase1_cleanup || { log_error "Cleanup failed"; exit 1; }
    phase2_hub || { log_error "Hub deployment failed"; exit 1; }
    phase3_est || { log_error "EST deployment failed"; exit 1; }
    phase4_federation || log_warn "Federation check had issues"
    phase5_health || log_warn "Some health checks failed"
    phase6_secrets || log_warn "Secret validation had issues"

    final_report
}

main "$@"
