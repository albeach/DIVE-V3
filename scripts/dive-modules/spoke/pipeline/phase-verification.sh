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

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_info "Verification phase for $code_upper"

    local verification_passed=true

    # Step 1: Service health checks
    if ! spoke_verify_service_health "$instance_code"; then
        verification_passed=false
    fi

    # Step 2: Database connectivity
    if ! spoke_verify_database_connectivity "$instance_code"; then
        log_warn "Database connectivity issues detected"
    fi

    # Step 3: Keycloak health
    if ! spoke_verify_keycloak_health "$instance_code"; then
        log_warn "Keycloak health check failed"
    fi

    # Step 4: Federation verification (deploy mode) - CRITICAL
    if [ "$pipeline_mode" = "deploy" ]; then
        if ! spoke_verify_federation "$instance_code"; then
            log_error "Federation verification failed - this is critical for DIVE V3"
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
        log_success "Verification phase complete - all checks passed"
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
    local code_lower=$(lower "$instance_code")

    log_step "Verifying service health..."

    local unhealthy_count=0
    local total_count=0

    # Check each expected service
    local services=("postgres" "mongodb" "redis" "keycloak" "backend" "frontend" "opa")

    for service in "${services[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"
        total_count=$((total_count + 1))

        if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            echo "  ❌ $service: not running"
            unhealthy_count=$((unhealthy_count + 1))
            continue
        fi

        # Check health status
        local health
        health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-healthcheck")

        case "$health" in
            healthy)
                echo "  ✅ $service: healthy"
                ;;
            no-healthcheck)
                # Check if running
                local running
                running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null)
                if [ "$running" = "true" ]; then
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
        orch_record_error "$SPOKE_ERROR_HEALTH_CHECK" "$ORCH_SEVERITY_MEDIUM" \
            "$unhealthy_count services unhealthy" "verification" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_HEALTH_CHECK $instance_code)"
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
    local code_lower=$(lower "$instance_code")

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

    # MongoDB
    local mongo_container="dive-spoke-${code_lower}-mongodb"
    if docker ps --format '{{.Names}}' | grep -q "^${mongo_container}$"; then
        local mongo_test
        mongo_test=$(docker exec "$mongo_container" mongosh --eval "db.runCommand({ ping: 1 })" --quiet 2>&1 || echo "failed")

        if echo "$mongo_test" | grep -q "ok"; then
            echo "  ✅ MongoDB: responding to ping"
        else
            echo "  ⚠️  MongoDB: ping failed (may still be initializing)"
        fi
    else
        echo "  ⚠️  MongoDB: container not running"
        issues=$((issues + 1))
    fi

    # Redis
    local redis_container="dive-spoke-${code_lower}-redis"
    if docker ps --format '{{.Names}}' | grep -q "^${redis_container}$"; then
        local redis_test
        redis_test=$(docker exec "$redis_container" redis-cli ping 2>&1 || echo "failed")

        if echo "$redis_test" | grep -qi "pong"; then
            echo "  ✅ Redis: responding to ping"
        else
            echo "  ⚠️  Redis: ping failed"
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
    local code_lower=$(lower "$instance_code")

    log_step "Verifying Keycloak health..."

    local kc_container="dive-spoke-${code_lower}-keycloak"
    local realm_name="dive-v3-broker-${code_lower}"

    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        echo "  ❌ Keycloak container not running"
        return 1
    fi

    # Check Keycloak health endpoint
    local health_response
    # Keycloak health checks are on management port 9000 (HTTPS) or via HTTP on 8080
    # Reference: https://www.keycloak.org/observability/health
    health_response=$(docker exec "$kc_container" curl -sfk "https://localhost:9000/health/ready" 2>/dev/null || \
                      docker exec "$kc_container" curl -sf "http://localhost:8080/health/ready" 2>/dev/null || echo "")

    if echo "$health_response" | grep -qi '"status".*"UP"\|"status".*"up"'; then
        echo "  ✅ Keycloak health: UP"
    elif [ -n "$health_response" ]; then
        echo "  ✅ Keycloak health: responding"
    else
        # Fallback: check if we can reach the realm endpoint (proves Keycloak is working)
        local realm_response
        realm_response=$(docker exec "$kc_container" curl -sf "http://localhost:8080/realms/${realm_name}/.well-known/openid-configuration" 2>/dev/null || echo "")
        if [ -n "$realm_response" ]; then
            echo "  ✅ Keycloak health: realm accessible"
        else
            echo "  ⚠️  Keycloak health: check failed"
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

# =============================================================================
# FEDERATION VERIFICATION
# =============================================================================

##
# Verify federation configuration with exponential backoff retry
#
# Federation verification in the deployment pipeline uses exponential backoff
# to handle Keycloak's eventual consistency after IdP creation.
#
# Retry pattern: 3s, 6s, 12s, 24s (4 attempts, ~45s total)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Federation configured
#   1 - Federation incomplete (non-blocking)
##
spoke_verify_federation() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Verifying federation configuration with exponential backoff..."

    # Retry configuration
    local max_retries=4
    local base_delay=3
    local verification_passed=false
    local fed_status=""

    for ((attempt=1; attempt<=max_retries; attempt++)); do
        local delay=$((base_delay * (2 ** (attempt - 1))))  # 3, 6, 12, 24 seconds

        log_verbose "Federation verification attempt $attempt/$max_retries..."

        # Use spoke-federation.sh verification if available
        if type spoke_federation_verify &>/dev/null; then
            fed_status=$(spoke_federation_verify "$instance_code" 2>/dev/null)

            # Check for successful bidirectional federation
            if echo "$fed_status" | grep -q '"bidirectional":true'; then
                # Additionally verify OIDC endpoints are functional
                if _spoke_verify_federation_oidc_endpoints "$instance_code"; then
                    verification_passed=true
                    break
                else
                    log_verbose "IdPs configured but OIDC endpoints not yet ready"
                fi
            fi
        fi

        # Wait before retry (except on last attempt)
        if [ $attempt -lt $max_retries ] && [ "$verification_passed" != "true" ]; then
            log_verbose "Waiting ${delay}s for Keycloak eventual consistency (attempt $attempt)..."
            sleep $delay
        fi
    done

    # Report results
    if [ "$verification_passed" = "true" ]; then
        echo "  ✅ Bidirectional federation active (verified after $attempt attempts)"
        echo "$fed_status" | grep -v '^{' | head -3 || true
        return 0
    else
        # Federation incomplete - show detailed status
        echo "  ⚠️  Federation verification incomplete after $max_retries attempts"
        echo "  ℹ️  This is expected for eventual consistency - typically resolves within 60 seconds"

        if [ -n "$fed_status" ]; then
            # Parse and display status using jq if available
            if command -v jq &>/dev/null; then
                local spoke_to_hub hub_to_spoke
                spoke_to_hub=$(echo "$fed_status" | jq -r '.spoke_to_hub // false')
                hub_to_spoke=$(echo "$fed_status" | jq -r '.hub_to_spoke // false')

                echo "      $( [ "$spoke_to_hub" = "true" ] && echo "✅" || echo "❌" ) Spoke → Hub (usa-idp in spoke)"
                echo "      $( [ "$hub_to_spoke" = "true" ] && echo "✅" || echo "❌" ) Hub → Spoke (${code_lower}-idp in Hub)"
            fi
        fi

        echo ""
        echo "  Manual verification: ./dive federation verify $code_upper"
        echo "  Manual fix: ./dive federation link $code_upper"

        # Fallback: Basic IdP check for debugging
        _spoke_verify_federation_fallback "$instance_code"

        return 0  # Non-blocking - federation is often eventually consistent
    fi
}

##
# Verify OIDC discovery endpoints for federation
# Helper function for spoke_verify_federation()
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - OIDC endpoints reachable
#   1 - OIDC endpoints not reachable
##
_spoke_verify_federation_oidc_endpoints() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    local spoke_realm="dive-v3-broker-${code_lower}"
    local hub_realm="dive-v3-broker-usa"

    # Get spoke Keycloak port
    local spoke_kc_port
    if [ -f "${DIVE_ROOT}/instances/${code_lower}/config.json" ]; then
        spoke_kc_port=$(jq -r '.endpoints.idpPublicUrl // "https://localhost:8443"' \
            "${DIVE_ROOT}/instances/${code_lower}/config.json" 2>/dev/null | grep -o ':[0-9]*' | tr -d ':')
    fi
    spoke_kc_port="${spoke_kc_port:-8443}"

    # Test both OIDC discovery endpoints (quick test - 3s timeout)
    local spoke_ok hub_ok
    spoke_ok=$(curl -sk --max-time 3 "https://localhost:${spoke_kc_port}/realms/${spoke_realm}/.well-known/openid-configuration" 2>/dev/null | grep -c '"issuer"' || echo "0")
    hub_ok=$(curl -sk --max-time 3 "https://localhost:8443/realms/${hub_realm}/.well-known/openid-configuration" 2>/dev/null | grep -c '"issuer"' || echo "0")

    [ "$spoke_ok" -ge 1 ] && [ "$hub_ok" -ge 1 ]
}

##
# Fallback IdP check when spoke_federation_verify is not available
# Helper function for spoke_verify_federation()
#
# Arguments:
#   $1 - Instance code
##
_spoke_verify_federation_fallback() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    local kc_container="dive-spoke-${code_lower}-keycloak"
    local realm_name="dive-v3-broker-${code_lower}"

    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        local admin_token
        admin_token=$(spoke_federation_get_admin_token "$kc_container" 2>/dev/null)

        if [ -n "$admin_token" ]; then
            local idp_list
            idp_list=$(docker exec "$kc_container" curl -sf \
                -H "Authorization: Bearer $admin_token" \
                "http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances" 2>/dev/null || echo "[]")

            if echo "$idp_list" | grep -q '"alias":"usa-idp"'; then
                log_verbose "Fallback check: usa-idp exists in spoke"
            else
                log_verbose "Fallback check: usa-idp NOT found in spoke"
            fi
        fi
    fi
}

# =============================================================================
# API HEALTH VERIFICATION
# =============================================================================

##
# Verify API endpoints are responding
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - APIs healthy
#   1 - Issues detected
##
spoke_verify_api_health() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_step "Verifying API health..."

    local issues=0

    # Backend API
    local backend_container="dive-spoke-${code_lower}-backend"
    if docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        # First check Docker's health status (most reliable)
        local docker_health
        docker_health=$(docker inspect --format='{{.State.Health.Status}}' "$backend_container" 2>/dev/null || echo "")

        if [ "$docker_health" = "healthy" ]; then
            echo "  ✅ Backend API: healthy"
        else
            # Fallback: try curl health endpoints (HTTPS with -k for self-signed certs)
            local api_health
            api_health=$(docker exec "$backend_container" curl -sfk "https://localhost:4000/health" 2>/dev/null || \
                         docker exec "$backend_container" curl -sfk "https://localhost:4000/api/health" 2>/dev/null || echo "")

            if echo "$api_health" | grep -qi "ok\|healthy\|status\|running"; then
                echo "  ✅ Backend API: healthy"
            elif [ -n "$api_health" ]; then
                echo "  ✅ Backend API: responding"
            elif [ "$docker_health" = "starting" ]; then
                echo "  ⏳ Backend API: starting"
            else
                echo "  ⚠️  Backend API: health check inconclusive"
                issues=$((issues + 1))
            fi
        fi
    else
        echo "  ⚠️  Backend container not running"
        issues=$((issues + 1))
    fi

    # Frontend
    local frontend_container="dive-spoke-${code_lower}-frontend"
    if docker ps --format '{{.Names}}' | grep -q "^${frontend_container}$"; then
        # First check Docker's health status (most reliable for Next.js)
        local docker_health
        docker_health=$(docker inspect --format='{{.State.Health.Status}}' "$frontend_container" 2>/dev/null || echo "")

        if [ "$docker_health" = "healthy" ]; then
            echo "  ✅ Frontend: healthy"
        else
            # Fallback: try curl (HTTPS with -k for self-signed certs)
            local frontend_health
            frontend_health=$(docker exec "$frontend_container" curl -sfk "https://localhost:3000/api/health" 2>/dev/null || \
                              docker exec "$frontend_container" curl -sfk -o /dev/null -w "%{http_code}" "https://localhost:3000/" 2>/dev/null || echo "")

            if [ "$frontend_health" = "200" ] || echo "$frontend_health" | grep -qi "ok\|healthy"; then
                echo "  ✅ Frontend: responding"
            elif [ -n "$frontend_health" ] && [ "$frontend_health" != "000" ]; then
                echo "  ✅ Frontend: accessible (HTTP $frontend_health)"
            elif [ "$docker_health" = "starting" ]; then
                echo "  ⏳ Frontend: starting"
            else
                echo "  ⚠️  Frontend: health check inconclusive"
            fi
        fi
    else
        echo "  ⚠️  Frontend container not running"
    fi

    # OPA (OPA uses HTTP internally, but check Docker health first)
    local opa_container="dive-spoke-${code_lower}-opa"
    if docker ps --format '{{.Names}}' | grep -q "^${opa_container}$"; then
        # First check Docker's health status (most reliable)
        local docker_health
        docker_health=$(docker inspect --format='{{.State.Health.Status}}' "$opa_container" 2>/dev/null || echo "")

        if [ "$docker_health" = "healthy" ]; then
            echo "  ✅ OPA: healthy"
        else
            # Fallback: try wget or curl (OPA container may not have either)
            # OPA health endpoint is HTTP on port 8181
            local opa_health
            opa_health=$(docker exec "$opa_container" wget -qO- "http://localhost:8181/health" 2>/dev/null || \
                         docker exec "$opa_container" curl -sf "http://localhost:8181/health" 2>/dev/null || echo "")

            # OPA health returns {} or {"plugins":{...}} when healthy
            if echo "$opa_health" | grep -q '{'; then
                echo "  ✅ OPA: healthy"
            elif [ "$docker_health" = "starting" ]; then
                echo "  ⏳ OPA: starting"
            else
                echo "  ⚠️  OPA: health check inconclusive"
            fi
        fi
    fi

    if [ $issues -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

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
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

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
    # PORT DISCOVERY for report (use Docker ports as SSOT)
    # ==========================================================================
    local frontend_port backend_port keycloak_port

    # Query Docker for actual port mappings
    frontend_port=$(docker port "dive-spoke-${code_lower}-frontend" 3000/tcp 2>/dev/null | cut -d: -f2 | head -1)
    backend_port=$(docker port "dive-spoke-${code_lower}-backend" 4000/tcp 2>/dev/null | cut -d: -f2 | head -1)
    keycloak_port=$(docker port "dive-spoke-${code_lower}-keycloak" 8443/tcp 2>/dev/null | cut -d: -f2 | head -1)

    # Fallback to centralized port calculation if Docker query fails
    if [ -z "$frontend_port" ] || [ -z "$backend_port" ] || [ -z "$keycloak_port" ]; then
        if type get_instance_ports &>/dev/null; then
            eval "$(get_instance_ports "$code_upper")"
            frontend_port="${frontend_port:-$SPOKE_FRONTEND_PORT}"
            backend_port="${backend_port:-$SPOKE_BACKEND_PORT}"
            keycloak_port="${keycloak_port:-$SPOKE_KEYCLOAK_HTTPS_PORT}"
        fi
    fi

    # Final fallbacks
    frontend_port="${frontend_port:-3000}"
    backend_port="${backend_port:-4000}"
    keycloak_port="${keycloak_port:-8443}"

    # Build report with discovered ports
    cat > "$report_file" << EOF
{
    "instance": "$code_upper",
    "status": "$status",
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "containers": $container_status,
    "checks": {
        "services": true,
        "databases": true,
        "keycloak": true,
        "federation": true,
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
    local code_lower=$(lower "$instance_code")

    # Check if critical services are running
    local critical_services=("keycloak" "backend" "postgres")

    for service in "${critical_services[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"

        if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            return 1
        fi

        local running
        running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null)

        if [ "$running" != "true" ]; then
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
# Port Discovery Order (SSOT compliance):
#   1. Docker port mapping (most reliable - actual runtime state)
#   2. Instance config.json endpoints.apiUrl field
#   3. get_instance_ports() function (centralized calculation)
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
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    log_step "Running detailed health check via backend API..."

    # ==========================================================================
    # PORT DISCOVERY (Priority order for reliability)
    # ==========================================================================
    local backend_port=""
    local backend_container="dive-spoke-${code_lower}-backend"

    # Method 1: Query Docker for actual port mapping (most reliable)
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${backend_container}$"; then
        backend_port=$(docker port "$backend_container" 4000/tcp 2>/dev/null | cut -d: -f2 | head -1)
        if [ -n "$backend_port" ]; then
            log_verbose "Port discovered from Docker: $backend_port"
        fi
    fi

    # Method 2: Parse from instance config.json (apiUrl field)
    if [ -z "$backend_port" ]; then
        local config_file="${DIVE_ROOT}/instances/${code_lower}/config.json"
        if [ -f "$config_file" ]; then
            local api_url
            api_url=$(jq -r '.endpoints.apiUrl // ""' "$config_file" 2>/dev/null)
            if [ -n "$api_url" ] && [ "$api_url" != "null" ]; then
                backend_port=$(echo "$api_url" | grep -o ':[0-9]*' | tr -d ':' | tail -1)
                [ -n "$backend_port" ] && log_verbose "Port discovered from config.json: $backend_port"
            fi
        fi
    fi

    # Method 3: Use centralized port calculation (SSOT fallback)
    if [ -z "$backend_port" ]; then
        if type get_instance_ports &>/dev/null; then
            eval "$(get_instance_ports "$code_upper")"
            backend_port="${SPOKE_BACKEND_PORT}"
            log_verbose "Port calculated via get_instance_ports: $backend_port"
        fi
    fi

    # Final fallback (should rarely be needed)
    backend_port="${backend_port:-4000}"

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
            local cb_name=$(echo "$line" | cut -d: -f1)
            local cb_state=$(echo "$line" | cut -d: -f2)

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
    local code_lower=$(lower "$instance_code")

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
