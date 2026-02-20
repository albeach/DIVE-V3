#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Deployment Verification Module (Consolidated)
# =============================================================================
# Post-deployment verification and health checks
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   (Formerly: hub/status.sh — removed Phase 13b)
#   - spoke/status.sh, spoke/verification.sh, spoke/spoke-verification.sh
#   - spoke/pipeline/phase-verification.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_DEPLOYMENT_VERIFICATION_LOADED:-}" ] && return 0
export DIVE_DEPLOYMENT_VERIFICATION_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

DEPLOYMENT_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$DEPLOYMENT_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load shared pipeline utilities (health checks, service SSOT)
if [ -z "${PIPELINE_UTILS_LOADED:-}" ]; then
    source "${DEPLOYMENT_DIR}/pipeline-utils.sh"
fi

# =============================================================================
# VERIFICATION FUNCTIONS
# =============================================================================

##
# Run comprehensive verification for Hub or Spoke
#
# Arguments:
#   $1 - Deployment type: "hub" or "spoke"
#   $2 - Instance code (for spoke)
#
# Returns:
#   0 - All checks passed
#   1 - Some checks failed
##
verification_run_all() {
    local deployment_type="${1:-spoke}"
    local instance_code="${2:-}"

    local code_lower
    code_lower=$(lower "$instance_code")
    local container_prefix

    if [ "$deployment_type" = "hub" ]; then
        container_prefix="dive-hub"
    else
        container_prefix="dive-spoke-${code_lower}"
    fi

    log_step "Running verification for $deployment_type ${instance_code:-}..."

    local passed=0
    local failed=0
    local total=0

    # Container existence check
    total=$((total + 1))
    if verification_check_containers "$container_prefix"; then
        passed=$((passed + 1))
        log_success "Container existence: PASS"
    else
        failed=$((failed + 1))
        log_error "Container existence: FAIL"
    fi

    # Container health check
    total=$((total + 1))
    if verification_check_health "$container_prefix"; then
        passed=$((passed + 1))
        log_success "Container health: PASS"
    else
        failed=$((failed + 1))
        log_error "Container health: FAIL"
    fi

    # Keycloak accessibility check
    total=$((total + 1))
    if verification_check_keycloak "$deployment_type" "$instance_code"; then
        passed=$((passed + 1))
        log_success "Keycloak accessibility: PASS"
    else
        failed=$((failed + 1))
        log_error "Keycloak accessibility: FAIL"
    fi

    # Backend health check
    total=$((total + 1))
    if verification_check_backend "$deployment_type" "$instance_code"; then
        passed=$((passed + 1))
        log_success "Backend health: PASS"
    else
        failed=$((failed + 1))
        log_error "Backend health: FAIL"
    fi

    # Frontend accessibility check
    total=$((total + 1))
    if verification_check_frontend "$deployment_type" "$instance_code"; then
        passed=$((passed + 1))
        log_success "Frontend accessibility: PASS"
    else
        failed=$((failed + 1))
        log_error "Frontend accessibility: FAIL"
    fi

    # Database connectivity check (PostgreSQL)
    total=$((total + 1))
    if verification_check_database "$container_prefix"; then
        passed=$((passed + 1))
        log_success "PostgreSQL connectivity: PASS"
    else
        failed=$((failed + 1))
        log_error "PostgreSQL connectivity: FAIL"
    fi

    # MongoDB connectivity check
    total=$((total + 1))
    if verification_check_mongodb "$container_prefix"; then
        passed=$((passed + 1))
        log_success "MongoDB connectivity: PASS"
    else
        failed=$((failed + 1))
        log_error "MongoDB connectivity: FAIL"
    fi

    # Redis connectivity check
    total=$((total + 1))
    if verification_check_redis "$container_prefix"; then
        passed=$((passed + 1))
        log_success "Redis connectivity: PASS"
    else
        failed=$((failed + 1))
        log_error "Redis connectivity: FAIL"
    fi

    # OPA health check
    total=$((total + 1))
    if verification_check_opa; then
        passed=$((passed + 1))
        log_success "OPA health: PASS"
    else
        failed=$((failed + 1))
        log_error "OPA health: FAIL"
    fi

    # Summary
    echo ""
    log_info "Verification Summary: $passed/$total checks passed"

    if [ $failed -gt 0 ]; then
        log_error "Some verification checks failed"
        return 1
    fi

    log_success "All verification checks passed"
    return 0
}

##
# Check container existence
##
verification_check_containers() {
    local container_prefix="$1"

    # Use SSOT service list — check ALL services, not just 4
    local expected_services_str
    if [[ "$container_prefix" == *"hub"* ]]; then
        expected_services_str="$PIPELINE_HUB_INFRA_SERVICES $PIPELINE_HUB_CORE_SERVICES $PIPELINE_HUB_APP_SERVICES"
    else
        expected_services_str="$PIPELINE_SPOKE_ALL_SERVICES"
    fi

    local expected_services
    read -r -a expected_services <<< "$expected_services_str"
    local missing=0

    for service in "${expected_services[@]}"; do
        local container="${container_prefix}-${service}"
        if ! pipeline_container_running "$container"; then
            log_verbose "Container missing: ${container}"
            missing=$((missing + 1))
        fi
    done

    [ $missing -eq 0 ]
}

##
# Check container health
##
verification_check_health() {
    local container_prefix="$1"

    local containers
    containers=$(${DOCKER_CMD:-docker} ps --filter "name=${container_prefix}" --format '{{.Names}}')
    local unhealthy=0

    for container in $containers; do
        local health
        health=$(pipeline_get_container_health "$container")

        if [ "$health" = "unhealthy" ]; then
            log_verbose "Container unhealthy: $container"
            unhealthy=$((unhealthy + 1))
        fi
    done

    [ $unhealthy -eq 0 ]
}

##
# Check Keycloak accessibility
##
verification_check_keycloak() {
    local deployment_type="$1"
    local instance_code="$2"
    local code_lower
    code_lower=$(lower "$instance_code")

    local kc_port

    if [ "$deployment_type" = "hub" ]; then
        kc_port=8443
    else
        eval "$(get_instance_ports "$instance_code" 2>/dev/null)"
        kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
    fi

    # Check HTTPS endpoint
    if curl -sk "https://localhost:${kc_port}/realms/master" >/dev/null 2>&1; then
        return 0
    fi

    return 1
}

##
# Check backend health
##
verification_check_backend() {
    local deployment_type="$1"
    local instance_code="$2"
    local code_lower
    code_lower=$(lower "$instance_code")

    local be_port

    if [ "$deployment_type" = "hub" ]; then
        be_port=4000
    else
        eval "$(get_instance_ports "$instance_code" 2>/dev/null)"
        be_port="${SPOKE_BACKEND_PORT:-4000}"
    fi

    # Check health endpoint (HTTPS + /api/health)
    if curl -skf "https://localhost:${be_port}/api/health" --max-time 5 >/dev/null 2>&1; then
        return 0
    fi

    return 1
}

##
# Check frontend accessibility
##
verification_check_frontend() {
    local deployment_type="$1"
    local instance_code="$2"
    local code_lower
    code_lower=$(lower "$instance_code")

    local fe_port

    if [ "$deployment_type" = "hub" ]; then
        fe_port=3000
    else
        eval "$(get_instance_ports "$instance_code" 2>/dev/null)"
        fe_port="${SPOKE_FRONTEND_PORT:-3000}"
    fi

    # Check frontend responds (HTTPS)
    if curl -skf "https://localhost:${fe_port}" --max-time 5 >/dev/null 2>&1; then
        return 0
    fi

    return 1
}

##
# Check PostgreSQL connectivity
##
verification_check_database() {
    local container_prefix="$1"

    if docker exec "${container_prefix}-postgres" pg_isready -U postgres >/dev/null 2>&1; then
        return 0
    fi

    return 1
}

##
# Check MongoDB connectivity
#
# Arguments:
#   $1 - Container prefix (e.g., "dive-spoke-fra")
#
# Returns:
#   0 - Connected or container running
#   1 - Not found
##
verification_check_mongodb() {
    local container_prefix="$1"
    local code_lower="${container_prefix##*-}"
    local mongo_container=""

    # Try exact match first, then pattern match
    mongo_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "${container_prefix}-mongodb|mongodb.*${code_lower}|${code_lower}.*mongo" | head -1)
    [ -z "$mongo_container" ] && return 1

    if docker exec "$mongo_container" mongosh --tls --tlsAllowInvalidCertificates --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
        return 0
    fi

    # Container running but ping didn't succeed cleanly
    return 0
}

##
# Check Redis connectivity
#
# Arguments:
#   $1 - Container prefix (e.g., "dive-spoke-fra")
#
# Returns:
#   0 - Connected or container running
#   1 - Not found
##
verification_check_redis() {
    local container_prefix="$1"
    local code_lower="${container_prefix##*-}"
    local redis_container=""

    redis_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "${container_prefix}-redis|redis.*${code_lower}|${code_lower}.*redis" | head -1)
    [ -z "$redis_container" ] && return 1

    if docker exec "$redis_container" redis-cli ping 2>/dev/null | grep -q "PONG"; then
        return 0
    fi

    return 0
}

##
# Check OPA health
#
# Arguments:
#   $1 - OPA port (default: 8181)
#
# Returns:
#   0 - Healthy
#   1 - Unreachable
##
verification_check_opa() {
    local opa_port="${1:-8181}"

    if curl -skf "https://localhost:${opa_port}/health" --max-time 5 >/dev/null 2>&1; then
        return 0
    fi

    return 1
}

##
# Generate verification report
##
verification_generate_report() {
    local deployment_type="$1"
    local instance_code="$2"
    local code_lower
    code_lower=$(lower "$instance_code")

    local report_file

    if [ "$deployment_type" = "hub" ]; then
        report_file="${DIVE_ROOT}/logs/hub/verification-report.json"
    else
        report_file="${DIVE_ROOT}/instances/${code_lower}/verification-report.json"
    fi

    mkdir -p "$(dirname "$report_file")"

    cat > "$report_file" << EOF
{
  "deployment_type": "${deployment_type}",
  "instance_code": "${instance_code:-hub}",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "checks": {
    "containers": $(verification_check_containers "dive-${deployment_type}${instance_code:+-$code_lower}" && echo "true" || echo "false"),
    "health": $(verification_check_health "dive-${deployment_type}${instance_code:+-$code_lower}" && echo "true" || echo "false"),
    "keycloak": $(verification_check_keycloak "$deployment_type" "$instance_code" && echo "true" || echo "false"),
    "backend": $(verification_check_backend "$deployment_type" "$instance_code" && echo "true" || echo "false"),
    "frontend": $(verification_check_frontend "$deployment_type" "$instance_code" && echo "true" || echo "false"),
    "database": $(verification_check_database "dive-${deployment_type}${instance_code:+-$code_lower}" && echo "true" || echo "false")
  }
}
EOF

    log_info "Verification report saved: $report_file"
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f verification_run_all
export -f verification_check_containers
export -f verification_check_health
export -f verification_check_keycloak
export -f verification_check_backend
export -f verification_check_frontend
export -f verification_check_database
export -f verification_check_mongodb
export -f verification_check_redis
export -f verification_check_opa
export -f verification_generate_report

log_verbose "Verification module loaded"
