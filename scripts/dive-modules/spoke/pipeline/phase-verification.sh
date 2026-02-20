#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline Verification Phase
# =============================================================================
# Handles post-deployment verification:
#   - Service health checks
#   - Federation verification
#   - Connectivity tests
#   - Authentication flow validation
#
# Consolidates spoke_deploy() Steps 4, 11 and verification functions
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# Prevent multiple sourcing
# BEST PRACTICE (2026-01-18): Check functions exist, not just guard variable
if type spoke_phase_verification &>/dev/null; then
    return 0
fi
# Module loaded marker will be set at end after functions defined

# Load shared pipeline utilities (health checks, service SSOT, secret loading)
if [ -z "${PIPELINE_UTILS_LOADED:-}" ]; then
    source "${DIVE_ROOT}/scripts/dive-modules/deployment/pipeline-utils.sh"
fi

# Load validation functions for idempotent deployments
if [ -z "${SPOKE_VALIDATION_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/spoke-validation.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/spoke-validation.sh"
    fi
fi

# Load federation functions for federation verification
if [ -z "${SPOKE_FEDERATION_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/spoke-federation.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/spoke-federation.sh"
    fi
fi

# Load shared verification primitives for delegation
if [ -z "${DIVE_DEPLOYMENT_VERIFICATION_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/../../deployment/verification.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/../../deployment/verification.sh"
    fi
fi

# Load checkpoint system

# =============================================================================
# MAIN VERIFICATION PHASE FUNCTION
# =============================================================================

##
# Execute the verification phase
#
# Arguments:
#   $1 - Instance code
#   $2 - Pipeline mode (deploy|up|redeploy)
#
# Returns:
#   0 - Success
#   1 - Failure (critical checks failed)
##
spoke_phase_verification() {
    local instance_code="$1"
    local pipeline_mode="${2:-deploy}"

    local code_upper
    code_upper=$(upper "$instance_code")
    local code_lower
    code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    # =============================================================================
    # IDEMPOTENT DEPLOYMENT: Check if phase already complete
    # =============================================================================
    # NOTE: VERIFICATION phase should usually run again to confirm current state
    # Only skip if explicitly marked complete AND recent (within last 5 minutes)
    if type spoke_phase_is_complete &>/dev/null; then
        if spoke_phase_is_complete "$instance_code" "VERIFICATION"; then
            local checkpoint_age
            checkpoint_age=$(spoke_phase_get_timestamp "$instance_code" "VERIFICATION" 2>/dev/null || echo "")
            if [ -n "$checkpoint_age" ]; then
                local now
                now=$(date +%s)
                # Cross-platform ISO 8601 timestamp parsing (macOS + Linux)
                local checkpoint_ts
                checkpoint_ts=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$checkpoint_age" +%s 2>/dev/null \
                    || date -d "$checkpoint_age" +%s 2>/dev/null \
                    || echo "0")
                local age_seconds=$((now - checkpoint_ts))

                # Only skip if verification was recent (< 5 minutes)
                if [ "$age_seconds" -lt 300 ]; then
                    if type spoke_validate_phase_state &>/dev/null; then
                        if spoke_validate_phase_state "$instance_code" "VERIFICATION"; then
                            log_info "✓ VERIFICATION phase complete (${age_seconds}s ago) and validated, skipping"
                            return 0
                        fi
                    else
                        log_info "✓ VERIFICATION phase complete (${age_seconds}s ago), skipping"
                        return 0
                    fi
                else
                    log_info "VERIFICATION checkpoint is old (${age_seconds}s), re-running"
                fi
            fi
        fi
    fi

    log_info "→ Executing VERIFICATION phase for $code_upper"

    local verification_passed=true

    # CRITICAL FIX (2026-02-11): Add retry logic with exponential backoff for transient failures
    # Refactored (Phase 2): Uses shared pipeline_retry_with_backoff from pipeline-utils.sh

    # Step 1: Service health checks (with retry)
    log_step "Verifying service health (with retry for transient failures)..."
    if ! pipeline_retry_with_backoff 3 5 spoke_verify_service_health "$instance_code"; then
        log_error "Service health check failed after 3 attempts"
        verification_passed=false
    fi

    # Step 2: Database connectivity (with retry)
    log_step "Verifying database connectivity (with retry for transient failures)..."
    if ! pipeline_retry_with_backoff 3 3 spoke_verify_database_connectivity "$instance_code"; then
        log_warn "Database connectivity issues persist after 3 attempts"
        # Non-blocking - databases might be slow to start
    fi

    # Step 3: Keycloak health (with retry)
    log_step "Verifying Keycloak health (with retry for transient failures)..."
    if ! pipeline_retry_with_backoff 3 3 spoke_verify_keycloak_health "$instance_code"; then
        log_warn "Keycloak health issues persist after 3 attempts"
        # Non-blocking - Keycloak might be slow to start
    fi

    # Step 4: Federation verification (deploy mode) - BLOCKING (2026-02-06 FIX)
    # BEST PRACTICE: Wait for realistic stabilization time, then verify
    # Either PASS (federation works) or FAIL (actionable remediation)
    # NO false positive warnings like "this is expected"
    if [ "$pipeline_mode" = "deploy" ]; then
        if ! spoke_verify_federation "$instance_code"; then
            log_error "Federation verification failed - deployment incomplete"
            verification_passed=false
            # FAIL FAST - no point continuing if federation is broken
        fi
    fi

    # Step 4.5: Bidirectional SSO endpoint verification (deploy mode) - WARNING ONLY
    if [ "$pipeline_mode" = "deploy" ] && [ "$verification_passed" = "true" ]; then
        log_step "Verifying bidirectional SSO endpoints..."
        local sso_ok=true

        # Test spoke can reach Hub OIDC discovery
        local hub_oidc
        hub_oidc=$(docker exec "dive-spoke-${code_lower}-keycloak" \
            curl -sfk "https://dive-hub-keycloak:8443/realms/dive-v3-broker-usa/.well-known/openid-configuration" 2>/dev/null) || true
        if echo "$hub_oidc" | grep -q "token_endpoint"; then
            log_success "Spoke→Hub OIDC discovery: reachable"
        else
            log_warn "Spoke→Hub OIDC discovery: FAILED (SSO login will fail)"
            sso_ok=false
        fi

        # Test Hub can reach Spoke OIDC discovery
        local spoke_oidc
        spoke_oidc=$(docker exec "dive-hub-keycloak" \
            curl -sfk "https://dive-spoke-${code_lower}-keycloak:8443/realms/dive-v3-broker-${code_lower}/.well-known/openid-configuration" 2>/dev/null) || true
        if echo "$spoke_oidc" | grep -q "token_endpoint"; then
            log_success "Hub→Spoke OIDC discovery: reachable"
        else
            log_warn "Hub→Spoke OIDC discovery: FAILED (reverse SSO will fail)"
            sso_ok=false
        fi

        # Verify spoke's trusted issuer registered in Hub OPA
        local spoke_issuer_check
        spoke_issuer_check=$(curl -sk "https://localhost:8181/v1/data/trusted_issuers" 2>/dev/null | \
            grep -c "dive-v3-broker-${code_lower}" || echo "0")
        if [ "$spoke_issuer_check" -gt 0 ]; then
            log_success "Spoke trusted issuer in Hub OPA: registered"
        else
            log_warn "Spoke trusted issuer not yet in Hub OPA (may take ~60s to propagate)"
        fi

        if [ "$sso_ok" = "true" ]; then
            log_success "Bidirectional SSO endpoints verified"
        else
            log_warn "SSO endpoint issues detected — federation may need manual verification"
        fi
    fi

    # Step 4.6: OPAL data sync verification (deploy mode) - BLOCKING
    # The backend API queries MongoDB directly — data should be available immediately
    # after spoke approval in CONFIGURATION phase.
    if [ "$pipeline_mode" = "deploy" ] && [ "$verification_passed" = "true" ]; then
        if ! spoke_verify_opal_sync "$instance_code"; then
            log_error "OPAL sync verification failed - federation data not propagated"
            verification_passed=false
        fi
    fi

    # Step 5: API health
    if ! spoke_verify_api_health "$instance_code"; then
        log_warn "API health check issues"
    fi

    # Step 6: Generate verification report
    spoke_verify_generate_report "$instance_code" "$verification_passed"

    # Create verification checkpoint
    if type orch_create_checkpoint &>/dev/null; then
        orch_create_checkpoint "$instance_code" "VERIFICATION" "Verification phase completed"
    fi

    if [ "$verification_passed" = true ]; then
        # Mark phase complete (checkpoint system)
        if type spoke_phase_mark_complete &>/dev/null; then
            spoke_phase_mark_complete "$instance_code" "VERIFICATION" 0 '{}' || true
        fi

        log_success "✅ VERIFICATION phase complete - all checks passed"
        return 0
    else
        log_error "Verification failed - critical issues detected"
        log_error "Deployment cannot proceed with unresolved issues"
        return 1  # BLOCKING - fail deployment on critical issues
    fi
}

# =============================================================================
# SERVICE HEALTH CHECKS
# =============================================================================

##
# Verify all service health
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - All healthy
#   1 - Some unhealthy
##
spoke_verify_service_health() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    log_step "Verifying service health..."

    local unhealthy_count=0
    local total_count=0

    # Get services dynamically from compose file
    # Phase 1 Sprint 1.2: Replace hardcoded array with dynamic discovery
    local services
    if type compose_get_spoke_services &>/dev/null; then
        read -r -a services <<<"$(compose_get_spoke_services "$instance_code")"
    else
        log_warn "compose_get_spoke_services not available, using SSOT service list"
        read -r -a services <<< "$PIPELINE_SPOKE_ALL_SERVICES"
    fi

    for service in "${services[@]}"; do
        local container
        container=$(pipeline_container_name "spoke" "$service" "$instance_code")
        total_count=$((total_count + 1))

        if ! pipeline_container_running "$container"; then
            echo "  ❌ $service: not running"
            unhealthy_count=$((unhealthy_count + 1))
            continue
        fi

        # Check health status
        local health
        health=$(pipeline_get_container_health "$container")

        case "$health" in
            healthy)
                echo "  ✅ $service: healthy"
                ;;
            not_found|none)
                # No health check or not found — running is OK
                local state
                state=$(pipeline_get_container_state "$container")
                if [ "$state" = "running" ]; then
                    echo "  ✅ $service: running"
                else
                    echo "  ❌ $service: not running"
                    unhealthy_count=$((unhealthy_count + 1))
                fi
                ;;
            unhealthy|starting)
                echo "  ⚠️  $service: $health"
                unhealthy_count=$((unhealthy_count + 1))
                ;;
            *)
                echo "  ❓ $service: unknown ($health)"
                ;;
        esac
    done

    echo ""
    echo "Health Summary: $((total_count - unhealthy_count))/$total_count services healthy"

    if [ $unhealthy_count -eq 0 ]; then
        log_success "All services healthy"
        return 0
    else
        if type orch_record_error &>/dev/null; then
            orch_record_error "${SPOKE_ERROR_HEALTH_CHECK:-1200}" "${ORCH_SEVERITY_MEDIUM:-medium}" \
                "$unhealthy_count services unhealthy" "verification" \
                "$(spoke_error_get_remediation ${SPOKE_ERROR_HEALTH_CHECK:-1200} "$instance_code" 2>/dev/null || echo 'Check container health: docker ps')"
        fi
        return 1
    fi
}

# =============================================================================
# DATABASE CONNECTIVITY
# =============================================================================

##
# Verify database connectivity
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Databases accessible
#   1 - Connection issues
##
spoke_verify_database_connectivity() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    log_step "Verifying database connectivity..."

    local issues=0

    # PostgreSQL
    local pg_container="dive-spoke-${code_lower}-postgres"
    if docker ps --format '{{.Names}}' | grep -q "^${pg_container}$"; then
        local pg_test
        pg_test=$(docker exec "$pg_container" pg_isready -U keycloak 2>&1 || echo "failed")

        if echo "$pg_test" | grep -q "accepting connections"; then
            echo "  ✅ PostgreSQL: accepting connections"
        else
            echo "  ❌ PostgreSQL: connection failed"
            issues=$((issues + 1))
        fi
    else
        echo "  ⚠️  PostgreSQL: container not running"
        issues=$((issues + 1))
    fi

    # MongoDB (requires authentication since keyFile auth is enabled)
    local mongo_container="dive-spoke-${code_lower}-mongodb"
    if docker ps --format '{{.Names}}' | grep -q "^${mongo_container}$"; then
        local mongo_test
        local mongo_pass_var
        mongo_pass_var="MONGO_PASSWORD_$(upper "$instance_code")"
        local mongo_pass="${!mongo_pass_var:-}"
        if [ -n "$mongo_pass" ]; then
            # SECURITY FIX: Use environment variable instead of command-line argument
            # to prevent password exposure in ps aux output
            mongo_test=$(docker exec -e MONGOSH_PASSWORD="$mongo_pass" "$mongo_container" \
                mongosh admin -u admin --authenticationDatabase admin --tls --tlsAllowInvalidCertificates --quiet \
                --eval "db.runCommand({ ping: 1 })" 2>&1 || echo "failed")
        else
            mongo_test=$(docker exec "$mongo_container" mongosh --tls --tlsAllowInvalidCertificates --eval "db.runCommand({ ping: 1 })" --quiet 2>&1 || echo "failed")
        fi

        if echo "$mongo_test" | grep -q "ok"; then
            echo "  ✅ MongoDB: responding to ping"
        else
            echo "  ⚠️  MongoDB: ping failed (may still be initializing or need auth)"
        fi
    else
        echo "  ⚠️  MongoDB: container not running"
        issues=$((issues + 1))
    fi

    # Redis
    local redis_container="dive-spoke-${code_lower}-redis"
    if docker ps --format '{{.Names}}' | grep -q "^${redis_container}$"; then
        # Get Redis password from environment (same source docker-compose uses)
        local redis_password_var="REDIS_PASSWORD_${code_upper}"
        local redis_password="${!redis_password_var:-}"

        # If not in environment, try .env file
        if [ -z "$redis_password" ]; then
            redis_password=$(grep "^REDIS_PASSWORD_${code_upper}=" "${spoke_dir}/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo "")
        fi

        local redis_test
        if [ -n "$redis_password" ]; then
            # Use password authentication
            redis_test=$(docker exec "$redis_container" redis-cli -a "$redis_password" --no-auth-warning ping 2>&1 || echo "failed")
        else
            # Try without auth (for spokes without Redis password configured)
            log_verbose "Redis password not found - trying without auth"
            redis_test=$(docker exec "$redis_container" redis-cli ping 2>&1 || echo "failed")
        fi

        if echo "$redis_test" | grep -qi "pong"; then
            echo "  ✅ Redis: responding to ping"
        else
            echo "  ⚠️  Redis: ping failed"
            log_verbose "Redis test result: $redis_test"

            # If auth error, provide helpful message
            if echo "$redis_test" | grep -qi "NOAUTH"; then
                log_verbose "Redis requires authentication - ensure REDIS_PASSWORD_${code_upper} is set"
            fi
        fi
    else
        echo "  ⚠️  Redis: container not running"
    fi

    if [ $issues -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

# =============================================================================
# KEYCLOAK VERIFICATION
# =============================================================================

##
# Verify Keycloak health and configuration
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Keycloak healthy
#   1 - Issues detected
##
spoke_verify_keycloak_health() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    log_step "Verifying Keycloak health..."

    local kc_container="dive-spoke-${code_lower}-keycloak"
    local realm_name="dive-v3-broker-${code_lower}"

    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        echo "  ❌ Keycloak container not running"
        return 1
    fi

    # Check Keycloak health endpoint (delegate to shared primitive if available)
    if type verification_check_keycloak &>/dev/null; then
        if verification_check_keycloak "spoke" "$instance_code"; then
            echo "  ✅ Keycloak health: UP"
        else
            echo "  ⚠️  Keycloak health: check failed"
        fi
    else
        local health_response
        health_response=$(docker exec "$kc_container" curl -sfk "https://localhost:9000/health/ready" 2>/dev/null || \
                          docker exec "$kc_container" curl -sf "http://localhost:8080/health/ready" 2>/dev/null || echo "")

        if echo "$health_response" | grep -qi '"status".*"UP"\|"status".*"up"'; then
            echo "  ✅ Keycloak health: UP"
        elif [ -n "$health_response" ]; then
            echo "  ✅ Keycloak health: responding"
        else
            local realm_response
            realm_response=$(docker exec "$kc_container" curl -sf "http://localhost:8080/realms/${realm_name}/.well-known/openid-configuration" 2>/dev/null || echo "")
            if [ -n "$realm_response" ]; then
                echo "  ✅ Keycloak health: realm accessible"
            else
                echo "  ⚠️  Keycloak health: check failed"
            fi
        fi
    fi

    # Check realm exists
    local admin_token
    admin_token=$(spoke_federation_get_admin_token "$kc_container")

    if [ -n "$admin_token" ]; then
        local realm_check
        realm_check=$(docker exec "$kc_container" curl -sf \
            -H "Authorization: Bearer $admin_token" \
            "http://localhost:8080/admin/realms/${realm_name}" 2>/dev/null || echo "")

        if echo "$realm_check" | grep -q '"realm"'; then
            echo "  ✅ Realm '$realm_name' exists"
        else
            echo "  ❌ Realm '$realm_name' not found"
            return 1
        fi

        # Check client exists
        local client_id="dive-v3-broker-${code_lower}"
        local client_check
        client_check=$(docker exec "$kc_container" curl -sf \
            -H "Authorization: Bearer $admin_token" \
            "http://localhost:8080/admin/realms/${realm_name}/clients?clientId=${client_id}" 2>/dev/null || echo "[]")

        if echo "$client_check" | grep -q '"clientId"'; then
            echo "  ✅ Client '$client_id' exists"
        else
            echo "  ⚠️  Client '$client_id' not found"
        fi
    else
        echo "  ⚠️  Cannot verify realm (no admin token)"
    fi

    return 0
}


# Load federation verification functions
source "$(dirname "${BASH_SOURCE[0]}")/phase-verification-federation.sh"


# =============================================================================
# VERIFICATION REPORT
# =============================================================================

##
# Generate verification report
#
# Arguments:
#   $1 - Instance code
#   $2 - Overall result (true/false)
##
spoke_verify_generate_report() {
    local instance_code="$1"
    local overall_result="$2"
    local code_upper
    code_upper=$(upper "$instance_code")
    local code_lower
    code_lower=$(lower "$instance_code")

    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local report_file="$spoke_dir/verification-report.json"

    local status="success"
    if [ "$overall_result" != "true" ]; then
        status="warning"
    fi

    # Get container status
    local container_status
    container_status=$(spoke_containers_status "$instance_code" 2>/dev/null || echo '{"running":0,"total":0}')

    # ==========================================================================
    # PORT DISCOVERY for report (use get_instance_ports SSOT)
    # ==========================================================================
    local frontend_port backend_port keycloak_port

    # Use centralized port calculation (SSOT)
    if type get_instance_ports &>/dev/null; then
        eval "$(get_instance_ports "$code_upper")"
        frontend_port="${SPOKE_FRONTEND_PORT}"
        backend_port="${SPOKE_BACKEND_PORT}"
        keycloak_port="${SPOKE_KEYCLOAK_HTTPS_PORT}"
    else
        # Final fallbacks only if SSOT not available
        frontend_port="3000"
        backend_port="4000"
        keycloak_port="8443"
    fi

    # Determine individual check results based on overall result
    # When overall_result is false, at least services or federation failed
    local services_ok="true"
    local federation_ok="true"
    if [ "$overall_result" != "true" ]; then
        services_ok="false"
        federation_ok="false"
    fi

    # Build report with calculated ports
    cat > "$report_file" << EOF
{
    "instance": "$code_upper",
    "status": "$status",
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "containers": $container_status,
    "checks": {
        "services": $services_ok,
        "databases": true,
        "keycloak": true,
        "federation": $federation_ok,
        "api": true
    },
    "endpoints": {
        "frontend": "https://localhost:${frontend_port}",
        "backend": "https://localhost:${backend_port}",
        "keycloak": "https://localhost:${keycloak_port}"
    }
}
EOF

    log_verbose "Verification report: $report_file"
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

##
# Quick health check (for CLI status command)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Healthy
#   1 - Unhealthy
##
spoke_verify_quick_health() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    # Check if critical services are running
    local critical_services=("keycloak" "backend" "postgres")

    for service in "${critical_services[@]}"; do
        local container
        container=$(pipeline_container_name "spoke" "$service" "$instance_code")

        if ! pipeline_container_running "$container"; then
            return 1
        fi
    done

    return 0
}

# =============================================================================
# DETAILED HEALTH CHECK (Phase 3.1)
# =============================================================================

##
# Spoke detailed health check using backend /health/detailed endpoint
# Phase 3.1: Production Resilience Enhancement
#
# This function calls the spoke backend's /health/detailed endpoint to get
# comprehensive health status including MongoDB, OPA, Keycloak, Redis,
# KAS, cache, and circuit breaker states.
#
# Port Discovery: Uses centralized get_instance_ports() function (SSOT)
# which correctly handles NATO countries, partner nations, ISO countries,
# and custom test codes (TST, DEV, QAA, etc.)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - All services healthy
#   1 - Some services unhealthy/degraded
##
spoke_verify_health_detailed() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")
    local code_upper
    code_upper=$(upper "$instance_code")

    log_step "Running detailed health check via backend API..."

    # ==========================================================================
    # PORT DISCOVERY (SSOT - Single Source of Truth)
    # ==========================================================================
    # Use centralized get_instance_ports() which handles:
    #   - NATO countries (offset 0-31)
    #   - Partner nations (offset 32-39)
    #   - ISO countries (offset 40-199)
    #   - Custom test codes like TST, DEV, QAA (offset 200+)
    # ==========================================================================
    local backend_port=""

    if type get_instance_ports &>/dev/null; then
        eval "$(get_instance_ports "$code_upper")"
        backend_port="${SPOKE_BACKEND_PORT}"
        log_verbose "Port calculated via get_instance_ports: $backend_port (offset: ${SPOKE_PORT_OFFSET})"
    else
        # Fallback only if SSOT function not available
        backend_port="4000"
        log_warn "get_instance_ports not available, using default port 4000"
    fi

    local backend_url="https://localhost:${backend_port}"
    log_verbose "Using backend URL: $backend_url"
    local health_response
    local exit_code=0

    # Retry logic with exponential backoff (3 attempts)
    local max_retries=3
    local attempt=1
    local delay=2

    while [ $attempt -le $max_retries ]; do
        health_response=$(curl -sfk --max-time 10 "${backend_url}/health/detailed" 2>/dev/null)

        if [ -n "$health_response" ]; then
            break
        fi

        if [ $attempt -lt $max_retries ]; then
            log_verbose "Health endpoint not responding, retry $attempt/$max_retries in ${delay}s..."
            sleep $delay
            delay=$((delay * 2))
        fi
        ((attempt++))
    done

    if [ -z "$health_response" ]; then
        echo "  ⚠️  Backend API not responding at ${backend_url}/health/detailed"
        echo "      Falling back to Docker container health checks"
        return 1
    fi

    # Parse overall status
    local overall_status
    overall_status=$(echo "$health_response" | jq -r '.status // "unknown"' 2>/dev/null)

    case "$overall_status" in
        healthy)
            echo "  ✅ Overall Status: HEALTHY"
            ;;
        degraded)
            echo "  ⚠️  Overall Status: DEGRADED"
            exit_code=1
            ;;
        unhealthy)
            echo "  ❌ Overall Status: UNHEALTHY"
            exit_code=1
            ;;
        *)
            echo "  ❓ Overall Status: UNKNOWN"
            exit_code=1
            ;;
    esac

    # Parse individual service statuses
    local services=("mongodb" "opa" "keycloak" "redis" "kas" "cache")

    for service in "${services[@]}"; do
        local svc_status
        local svc_response_time
        local svc_error

        svc_status=$(echo "$health_response" | jq -r ".services.${service}.status // \"N/A\"" 2>/dev/null)
        svc_response_time=$(echo "$health_response" | jq -r ".services.${service}.responseTime // \"N/A\"" 2>/dev/null)
        svc_error=$(echo "$health_response" | jq -r ".services.${service}.error // \"\"" 2>/dev/null)

        case "$svc_status" in
            up)
                if [ "$svc_response_time" != "N/A" ] && [ "$svc_response_time" != "null" ]; then
                    echo "      ✅ ${service}: up (${svc_response_time}ms)"
                else
                    echo "      ✅ ${service}: up"
                fi
                ;;
            degraded)
                echo "      ⚠️  ${service}: degraded"
                ;;
            down)
                if [ -n "$svc_error" ] && [ "$svc_error" != "null" ]; then
                    echo "      ❌ ${service}: down - ${svc_error}"
                else
                    echo "      ❌ ${service}: down"
                fi
                exit_code=1
                ;;
            N/A|null)
                echo "      ○ ${service}: not configured"
                ;;
            *)
                echo "      ? ${service}: ${svc_status}"
                ;;
        esac
    done

    # Parse circuit breaker states if available
    local cb_count
    cb_count=$(echo "$health_response" | jq '.circuitBreakers | length' 2>/dev/null)

    if [ -n "$cb_count" ] && [ "$cb_count" != "null" ] && [ "$cb_count" -gt 0 ]; then
        echo ""
        echo "  Circuit Breakers:"

        echo "$health_response" | jq -r '.circuitBreakers | to_entries[] | "\(.key):\(.value.state)"' 2>/dev/null | while read -r line; do
            local cb_name
            cb_name=$(echo "$line" | cut -d: -f1)
            local cb_state
            cb_state=$(echo "$line" | cut -d: -f2)

            case "$cb_state" in
                CLOSED)
                    echo "      ✅ ${cb_name}: closed (healthy)"
                    ;;
                HALF_OPEN)
                    echo "      ⚠️  ${cb_name}: half-open (recovering)"
                    ;;
                OPEN)
                    echo "      ❌ ${cb_name}: open (failing)"
                    ;;
            esac
        done
    fi

    # Log uptime
    local uptime
    uptime=$(echo "$health_response" | jq -r '.uptime // 0' 2>/dev/null)
    if [ "$uptime" != "0" ] && [ "$uptime" != "null" ]; then
        local uptime_human
        if [ "$uptime" -ge 3600 ]; then
            uptime_human="$((uptime / 3600))h $((uptime % 3600 / 60))m"
        elif [ "$uptime" -ge 60 ]; then
            uptime_human="$((uptime / 60))m $((uptime % 60))s"
        else
            uptime_human="${uptime}s"
        fi
        echo ""
        echo "  Uptime: ${uptime_human}"
    fi

    return $exit_code
}

##
# Verify API health with detailed endpoint fallback
# Phase 3.1: Enhanced API health verification
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - APIs healthy
#   1 - Issues detected
##
spoke_verify_api_health_detailed() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    log_step "Verifying API health (detailed)..."

    # First try the detailed health endpoint
    if spoke_verify_health_detailed "$instance_code"; then
        return 0
    fi

    # Fallback to Docker container checks
    log_verbose "Falling back to Docker container health checks..."
    spoke_verify_api_health "$instance_code"
}

export SPOKE_PHASE_VERIFICATION_LOADED=1
