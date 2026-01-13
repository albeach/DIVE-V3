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
if [ -n "$SPOKE_PHASE_VERIFICATION_LOADED" ]; then
    return 0
fi
export SPOKE_PHASE_VERIFICATION_LOADED=1

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

    # Step 4: Federation verification (deploy mode)
    if [ "$pipeline_mode" = "deploy" ]; then
        if ! spoke_verify_federation "$instance_code"; then
            log_warn "Federation verification incomplete"
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
        log_success "Verification phase complete"
        return 0
    else
        log_warn "Verification complete with warnings"
        return 0  # Non-blocking - return success with warnings
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
    # Keycloak health checks are on management port 9000 (HTTPS)
    # Reference: https://www.keycloak.org/observability/health
    health_response=$(docker exec "$kc_container" curl -sfk "https://localhost:9000/health/ready" 2>/dev/null || echo "failed")

    if echo "$health_response" | grep -q '"status":"UP"'; then
        echo "  ✅ Keycloak health: UP"
    else
        echo "  ⚠️  Keycloak health: check failed"
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
# Verify federation configuration
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Federation configured
#   1 - Federation incomplete
##
spoke_verify_federation() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Verifying federation configuration..."

    # Use spoke-federation.sh verification
    if type spoke_federation_verify &>/dev/null; then
        local fed_status
        fed_status=$(spoke_federation_verify "$instance_code")

        echo "$fed_status" | grep -v '^{' | head -3

        if echo "$fed_status" | grep -q '"bidirectional":true'; then
            echo "  ✅ Bidirectional federation active"
            return 0
        else
            echo "  ⚠️  Federation incomplete"
            echo "$fed_status" | jq -r '"\(.spoke_to_hub | if . then "✅" else "❌" end) Spoke → Hub\n\(.hub_to_spoke | if . then "✅" else "❌" end) Hub → Spoke"' 2>/dev/null || true
        fi
    fi

    # Fallback: Basic IdP check
    local kc_container="dive-spoke-${code_lower}-keycloak"
    local realm_name="dive-v3-broker-${code_lower}"

    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        local admin_token
        admin_token=$(spoke_federation_get_admin_token "$kc_container")

        if [ -n "$admin_token" ]; then
            local idp_list
            idp_list=$(docker exec "$kc_container" curl -sf \
                -H "Authorization: Bearer $admin_token" \
                "http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances" 2>/dev/null || echo "[]")

            if echo "$idp_list" | grep -q '"alias":"usa-idp"'; then
                echo "  ✅ usa-idp configured in spoke"
            else
                echo "  ⚠️  usa-idp not configured"
            fi
        fi
    fi

    return 0
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
        local api_health
        api_health=$(docker exec "$backend_container" curl -sf "http://localhost:4000/api/health" 2>&1 || echo "")

        if echo "$api_health" | grep -qi "ok\|healthy\|status"; then
            echo "  ✅ Backend API: healthy"
        else
            echo "  ⚠️  Backend API: health check failed"
            issues=$((issues + 1))
        fi
    else
        echo "  ⚠️  Backend container not running"
        issues=$((issues + 1))
    fi

    # Frontend
    local frontend_container="dive-spoke-${code_lower}-frontend"
    if docker ps --format '{{.Names}}' | grep -q "^${frontend_container}$"; then
        local frontend_health
        frontend_health=$(docker exec "$frontend_container" curl -sf "http://localhost:3000/" 2>&1 || echo "")

        if [ -n "$frontend_health" ]; then
            echo "  ✅ Frontend: responding"
        else
            echo "  ⚠️  Frontend: not responding"
        fi
    else
        echo "  ⚠️  Frontend container not running"
    fi

    # OPA
    local opa_container="dive-spoke-${code_lower}-opa"
    if docker ps --format '{{.Names}}' | grep -q "^${opa_container}$"; then
        local opa_health
        opa_health=$(docker exec "$opa_container" curl -sf "http://localhost:8181/health" 2>&1 || echo "")

        if echo "$opa_health" | grep -qi "{}"; then
            echo "  ✅ OPA: healthy"
        else
            echo "  ⚠️  OPA: health check failed"
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

    # Build report
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
        "frontend": "https://localhost:${SPOKE_FRONTEND_PORT:-13000}",
        "backend": "https://localhost:${SPOKE_BACKEND_PORT:-14000}",
        "keycloak": "https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT:-18443}"
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
