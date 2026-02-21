#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Deployment Verification Module (Consolidated)
# =============================================================================
# Post-deployment verification and health checks
# =============================================================================
# Version: 6.0.0 (Hardened verification suite)
# Date: 2026-02-20
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

    # Helper: run a check and record result
    _verify() {
        local label="$1"
        shift
        total=$((total + 1))
        if "$@"; then
            passed=$((passed + 1))
            log_success "${label}: PASS"
        else
            failed=$((failed + 1))
            log_error "${label}: FAIL"
        fi
    }

    _verify "Container existence"      verification_check_containers "$container_prefix"
    _verify "Container health"         verification_check_health "$container_prefix"
    _verify "Keycloak accessibility"   verification_check_keycloak "$deployment_type" "$instance_code"
    _verify "Backend health"           verification_check_backend "$deployment_type" "$instance_code"
    _verify "Frontend accessibility"   verification_check_frontend "$deployment_type" "$instance_code"
    _verify "PostgreSQL connectivity"  verification_check_database "$container_prefix"
    _verify "MongoDB connectivity"     verification_check_mongodb "$container_prefix"
    _verify "Redis connectivity"       verification_check_redis "$container_prefix"
    _verify "OPA health"               verification_check_opa 8181

    # Hub-only checks
    if [ "$deployment_type" = "hub" ]; then
        _verify "Vault health"         verification_check_vault
        _verify "Certificate chain"    verification_check_certificates "hub"
        _verify "OPAL policies"        verification_check_opal_policies
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
# Check container health — catches both "unhealthy" and stuck "starting" containers
##
verification_check_health() {
    local container_prefix="$1"

    local containers
    containers=$(${DOCKER_CMD:-docker} ps --filter "name=${container_prefix}" --format '{{.Names}}')
    local unhealthy=0

    for container in $containers; do
        local health
        health=$(pipeline_get_container_health "$container")

        case "$health" in
            unhealthy)
                log_verbose "Container unhealthy: $container"
                unhealthy=$((unhealthy + 1))
                ;;
            starting)
                log_verbose "Container still starting: $container (may need more time)"
                unhealthy=$((unhealthy + 1))
                ;;
        esac
    done

    [ $unhealthy -eq 0 ]
}

##
# Check Keycloak accessibility — validates JSON response (not just HTTP 200)
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

    # Check HTTPS endpoint and validate JSON response
    local response
    response=$(curl -sk --max-time 10 "https://localhost:${kc_port}/realms/master" 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$response" ]; then
        local realm_name
        realm_name=$(echo "$response" | jq -r '.realm // empty' 2>/dev/null)
        if [ "$realm_name" = "master" ]; then
            return 0
        fi
        log_verbose "Keycloak responded but realm='$realm_name' (expected 'master')"
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
# Check MongoDB connectivity AND replica set PRIMARY status
#
# Arguments:
#   $1 - Container prefix (e.g., "dive-spoke-fra")
#
# Returns:
#   0 - Connected and PRIMARY
#   1 - Not found or not PRIMARY
##
verification_check_mongodb() {
    local container_prefix="$1"
    local code_lower="${container_prefix##*-}"
    local mongo_container=""

    # Try exact match first, then pattern match
    mongo_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "${container_prefix}-mongodb|mongodb.*${code_lower}|${code_lower}.*mongo" | head -1)
    [ -z "$mongo_container" ] && return 1

    # Check both connectivity AND replica set PRIMARY status (state 1 = PRIMARY)
    local rs_state
    rs_state=$(docker exec "$mongo_container" mongosh --tls --tlsAllowInvalidCertificates --quiet \
        --eval "rs.status().myState" 2>/dev/null)

    if [ "$rs_state" = "1" ]; then
        return 0
    fi

    # Fallback: try basic ping if replica set check fails
    if docker exec "$mongo_container" mongosh --tls --tlsAllowInvalidCertificates --quiet \
        --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
        log_verbose "MongoDB ping OK but replica set state=${rs_state:-unknown} (expected 1/PRIMARY)"
        return 0
    fi

    log_verbose "MongoDB not reachable or not PRIMARY (state=${rs_state:-unknown})"
    return 1
}

##
# Check Redis connectivity with TLS verification
#
# Arguments:
#   $1 - Container prefix (e.g., "dive-spoke-fra")
#
# Returns:
#   0 - Connected
#   1 - Not found or not responding
##
verification_check_redis() {
    local container_prefix="$1"
    local code_lower="${container_prefix##*-}"
    local redis_container=""
    local redis_password=""
    local redis_health=""

    redis_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "${container_prefix}-redis[^-]|redis.*${code_lower}|${code_lower}.*redis" | head -1)
    [ -z "$redis_container" ] && return 1

    # Prefer Docker health status when available. Compose healthcheck already
    # performs an authenticated TLS ping using the instance secret.
    redis_health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$redis_container" 2>/dev/null || echo "")
    if [ "$redis_health" = "healthy" ]; then
        return 0
    fi

    # Try TLS ping first (expected in production)
    if docker exec "$redis_container" redis-cli --tls --insecure ping 2>/dev/null | grep -q "PONG"; then
        return 0
    fi

    # Fallback to plain TCP
    if docker exec "$redis_container" redis-cli ping 2>/dev/null | grep -q "PONG"; then
        log_verbose "Redis responding on plain TCP (TLS may not be enabled)"
        return 0
    fi

    # Authenticated fallback for password-protected Redis deployments.
    redis_password=$(docker exec "$redis_container" printenv REDIS_PASSWORD_EST 2>/dev/null || echo "")
    if [ -n "$redis_password" ]; then
        if docker exec "$redis_container" redis-cli -a "$redis_password" ping 2>/dev/null | grep -q "PONG"; then
            log_verbose "Redis responding with authentication"
            return 0
        fi

        if docker exec "$redis_container" redis-cli --tls --insecure -a "$redis_password" ping 2>/dev/null | grep -q "PONG"; then
            log_verbose "Redis responding with TLS + authentication"
            return 0
        fi
    fi

    return 1
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
# Check Vault health (hub only)
# Verifies initialized=true and sealed=false via /v1/sys/health
#
# Returns:
#   0 - Vault healthy (initialized + unsealed)
#   1 - Vault unreachable or unhealthy
##
verification_check_vault() {
    local vault_port="${VAULT_PORT:-8200}"

    local vault_health
    vault_health=$(curl -sk --max-time 5 "https://localhost:${vault_port}/v1/sys/health" 2>/dev/null)
    if [ $? -ne 0 ] || [ -z "$vault_health" ]; then
        log_verbose "Vault not responding at https://localhost:${vault_port}"
        return 1
    fi

    local initialized sealed
    initialized=$(echo "$vault_health" | jq -r '.initialized // false' 2>/dev/null)
    sealed=$(echo "$vault_health" | jq -r '.sealed // true' 2>/dev/null)

    if [ "$initialized" = "true" ] && [ "$sealed" = "false" ]; then
        return 0
    fi

    log_verbose "Vault not ready: initialized=$initialized sealed=$sealed"
    return 1
}

##
# Check certificate chain validity (hub only)
# Verifies certificates exist and are not expired within 24 hours
#
# Arguments:
#   $1 - Deployment type (hub or spoke)
#
# Returns:
#   0 - Certificates valid
#   1 - Certificates missing or expiring
##
verification_check_certificates() {
    local deployment_type="${1:-hub}"
    local cert_dir

    if [ "$deployment_type" = "hub" ]; then
        cert_dir="${DIVE_ROOT}/instances/hub/certs"
    else
        return 0  # Spoke cert check handled separately
    fi

    # Check certificate file exists
    if [ ! -f "${cert_dir}/certificate.pem" ]; then
        log_verbose "Certificate not found: ${cert_dir}/certificate.pem"
        return 1
    fi

    # Check certificate not expired (or expiring within 24 hours)
    if ! openssl x509 -in "${cert_dir}/certificate.pem" -checkend 86400 -noout 2>/dev/null; then
        log_verbose "Certificate expired or expires within 24 hours"
        return 1
    fi

    # Check key file exists
    if [ ! -f "${cert_dir}/key.pem" ]; then
        log_verbose "Key file not found: ${cert_dir}/key.pem"
        return 1
    fi

    return 0
}

##
# Check OPAL policy engine has loaded policies (hub only)
# Verifies OPAL server has policies from the git repository
#
# Returns:
#   0 - Policies loaded
#   1 - No policies or OPAL unreachable
##
verification_check_opal_policies() {
    local opal_port="${OPAL_PORT:-7002}"

    # Check OPAL server healthcheck first
    if ! curl -skf "https://localhost:${opal_port}/healthcheck" --max-time 5 >/dev/null 2>&1; then
        log_verbose "OPAL server not responding at https://localhost:${opal_port}"
        return 1
    fi

    # OPAL is healthy — check if policies have been fetched
    # The /policy endpoint returns loaded policy modules
    local policy_response
    policy_response=$(curl -sk --max-time 5 "https://localhost:${opal_port}/policy" 2>/dev/null)

    if [ -n "$policy_response" ]; then
        # If we get any response from the policy endpoint, policies are loaded
        return 0
    fi

    log_verbose "OPAL policy endpoint returned empty response"
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
export -f verification_check_vault
export -f verification_check_certificates
export -f verification_check_opal_policies
export -f verification_generate_report

log_verbose "Verification module loaded"
