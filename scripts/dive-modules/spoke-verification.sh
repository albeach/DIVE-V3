#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Spoke Deployment Verification Module
# =============================================================================
# Provides comprehensive pre-flight checks and post-deployment verification
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# PRE-FLIGHT VALIDATION
# =============================================================================

##
# Run comprehensive pre-flight checks before spoke deployment
#
# Arguments:
#   $1 - Spoke code
#
# Returns:
#   0 - All checks passed
#   1 - One or more checks failed
##
spoke_preflight_check() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")
    local failures=0

    log_step "Running pre-flight checks for $code_upper..."
    echo ""

    # 1. Check Hub Keycloak is accessible
    if docker ps --filter "name=dive-hub-keycloak" --format "{{.Names}}" | grep -q "dive-hub-keycloak"; then
        if docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh help &>/dev/null; then
            echo "  ✅ Hub Keycloak accessible"
        else
            echo "  ❌ Hub Keycloak not responding"
            ((failures++))
        fi
    else
        echo "  ❌ Hub Keycloak container not running"
        ((failures++))
    fi

    # 2. Check Hub backend is running
    if docker ps --filter "name=dive-hub-backend" --format "{{.Names}}" | grep -q "dive-hub-backend"; then
        echo "  ✅ Hub backend running"
    else
        echo "  ❌ Hub backend not running"
        ((failures++))
    fi

    # 3. Check instance directory exists
    if [ -d "${DIVE_ROOT}/instances/$code_lower" ]; then
        echo "  ✅ Instance directory exists"
    else
        echo "  ❌ Instance directory missing: ${DIVE_ROOT}/instances/$code_lower"
        ((failures++))
    fi

    # 4. Check docker-compose.yml exists and is valid
    if [ -f "${DIVE_ROOT}/instances/$code_lower/docker-compose.yml" ]; then
        if docker compose -f "${DIVE_ROOT}/instances/$code_lower/docker-compose.yml" config &>/dev/null; then
            echo "  ✅ docker-compose.yml valid"
        else
            echo "  ❌ docker-compose.yml invalid or has errors"
            ((failures++))
        fi
    else
        echo "  ❌ docker-compose.yml missing"
        ((failures++))
    fi

    # 5. Check .env file exists
    if [ -f "${DIVE_ROOT}/instances/$code_lower/.env" ]; then
        echo "  ✅ .env file exists"

        # Check critical variables
        source "${DIVE_ROOT}/instances/$code_lower/.env"
        if [ -z "$KEYCLOAK_ADMIN_PASSWORD" ]; then
            echo "  ⚠️  KEYCLOAK_ADMIN_PASSWORD not set"
        fi
    else
        echo "  ❌ .env file missing"
        ((failures++))
    fi

    # 6. Check shared network exists
    if docker network ls | grep -q "dive-shared"; then
        echo "  ✅ Shared network exists"
    else
        echo "  ⚠️  Shared network missing (will be created)"
    fi

    # 7. Check Docker is responsive
    if docker ps &>/dev/null; then
        echo "  ✅ Docker daemon responsive"
    else
        echo "  ❌ Docker daemon not responding"
        ((failures++))
    fi

    # 8. Check available disk space
    local available_space=$(df -h "${DIVE_ROOT}" | tail -1 | awk '{print $4}')
    echo "  ℹ️  Available disk space: $available_space"

    echo ""
    if [ $failures -eq 0 ]; then
        log_success "All pre-flight checks passed"
        return 0
    else
        log_error "Pre-flight checks failed: $failures error(s)"
        return 1
    fi
}

# =============================================================================
# POST-DEPLOYMENT VERIFICATION
# =============================================================================

##
# Comprehensive verification of spoke deployment
#
# Arguments:
#   $1 - Spoke code
#
# Returns:
#   0 - All verifications passed
#   1 - One or more verifications failed
##
spoke_verify_deployment() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")
    local failures=()

    log_step "Verifying deployment for $code_upper..."
    echo ""

    # 1. Verify all containers are running
    local required_services=("postgres" "mongodb" "redis" "keycloak" "opa" "backend" "frontend")
    for service in "${required_services[@]}"; do
        local container="dive-spoke-${code_lower}-$service"
        if docker ps --filter "name=$container" --format "{{.Names}}" | grep -q "$container"; then
            local status=$(docker ps --filter "name=$container" --format "{{.Status}}")
            if echo "$status" | grep -q "healthy"; then
                echo "  ✅ $service: running and healthy"
            else
                echo "  ⚠️  $service: running but not healthy ($status)"
            fi
        else
            echo "  ❌ $service: not running"
            failures+=("Container $service not running")
        fi
    done

    # 2. Verify IdP exists in Hub
    log_verbose "Checking if ${code_lower}-idp exists in Hub..."
    source "${DIVE_ROOT}/.env.hub" 2>/dev/null
    if [ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
        docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
            --server http://localhost:8080 --realm master --user admin --password "$KEYCLOAK_ADMIN_PASSWORD" &>/dev/null

        if docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get \
            identity-provider/instances/${code_lower}-idp -r dive-v3-broker-usa &>/dev/null; then
            echo "  ✅ IdP ${code_lower}-idp exists in Hub"

            # Verify it has correct NATO port
            local auth_url=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get \
                identity-provider/instances/${code_lower}-idp -r dive-v3-broker-usa 2>/dev/null | \
                jq -r '.config.authorizationUrl')

            if echo "$auth_url" | grep -q "localhost:[0-9]"; then
                echo "    ✓ Authorization URL includes port: $auth_url"
            else
                echo "    ⚠️  Authorization URL missing port: $auth_url"
                failures+=("IdP ${code_lower}-idp has malformed authorization URL")
            fi
        else
            echo "  ❌ IdP ${code_lower}-idp NOT found in Hub"
            failures+=("IdP ${code_lower}-idp not in Hub")
        fi
    else
        echo "  ⚠️  Cannot verify Hub IdP (admin password not found)"
    fi

    # 3. Verify usa-idp exists in spoke
    log_verbose "Checking if usa-idp exists in $code_upper spoke..."
    source "${DIVE_ROOT}/instances/$code_lower/.env" 2>/dev/null
    if [ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
        docker exec "dive-spoke-${code_lower}-keycloak" /opt/keycloak/bin/kcadm.sh config credentials \
            --server http://localhost:8080 --realm master --user admin --password "$KEYCLOAK_ADMIN_PASSWORD" &>/dev/null

        if docker exec "dive-spoke-${code_lower}-keycloak" /opt/keycloak/bin/kcadm.sh get \
            identity-provider/instances/usa-idp -r "dive-v3-broker-$code_lower" &>/dev/null; then
            echo "  ✅ IdP usa-idp exists in $code_upper spoke"
        else
            echo "  ❌ IdP usa-idp NOT found in $code_upper spoke"
            failures+=("IdP usa-idp not in spoke")
        fi
    else
        echo "  ⚠️  Cannot verify spoke IdP (admin password not found)"
    fi

    # 4. Verify frontend is accessible
    eval "$(_get_spoke_ports "$spoke_code")" 2>/dev/null || true
    local frontend_port="${SPOKE_FRONTEND_PORT:-3000}"

    if curl -sk -o /dev/null -w "%{http_code}" "https://localhost:$frontend_port" 2>/dev/null | grep -q "200\|301\|302"; then
        echo "  ✅ Frontend accessible on port $frontend_port"
    else
        echo "  ❌ Frontend NOT accessible on port $frontend_port"
        failures+=("Frontend not accessible")
    fi

    # 5. Verify backend is accessible
    local backend_port="${SPOKE_BACKEND_PORT:-4000}"
    if curl -sk -o /dev/null -w "%{http_code}" "https://localhost:$backend_port/api/health" 2>/dev/null | grep -q "200"; then
        echo "  ✅ Backend health check passed on port $backend_port"
    else
        echo "  ⚠️  Backend health check failed (may need time to start)"
    fi

    # 6. Verify Keycloak is accessible
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
    if curl -sk -o /dev/null -w "%{http_code}" "https://localhost:$kc_port" 2>/dev/null | grep -q "200"; then
        echo "  ✅ Keycloak accessible on port $kc_port"
    else
        echo "  ❌ Keycloak NOT accessible on port $kc_port"
        failures+=("Keycloak not accessible")
    fi

    echo ""
    if [ ${#failures[@]} -eq 0 ]; then
        log_success "All deployment verifications passed!"
        return 0
    else
        log_error "Deployment verification failed: ${#failures[@]} issue(s)"
        printf '  ❌ %s\n' "${failures[@]}"
        return 1
    fi
}

##
# Helper to get spoke ports - DELEGATED TO COMMON.SH (SSOT)
#
# See: scripts/dive-modules/common.sh:get_instance_ports()
##
_get_spoke_ports() {
    # Delegate to common.sh (SSOT)
    get_instance_ports "$@"
}

# Mark module as loaded
export DIVE_SPOKE_VERIFICATION_LOADED=1


