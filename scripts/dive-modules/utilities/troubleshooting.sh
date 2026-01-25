#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Troubleshooting Utilities (Consolidated)
# =============================================================================
# Diagnostic tools and troubleshooting helpers
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - hub/fix.sh
#   - federation-diagnose.sh
#   - spoke/spoke-fix-hostname.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_UTILITIES_TROUBLESHOOTING_LOADED" ] && return 0
export DIVE_UTILITIES_TROUBLESHOOTING_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

UTILITIES_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$UTILITIES_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# DIAGNOSTIC FUNCTIONS
# =============================================================================

##
# Run comprehensive diagnostics
#
# Arguments:
#   $1 - Target: "hub", "spoke", or instance code
##
diagnose() {
    local target="${1:-all}"

    echo "═══════════════════════════════════════════════════════════════"
    echo "DIVE V3 Diagnostics"
    echo "Target: $target"
    echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    # System diagnostics
    echo "=== System ==="
    echo "Docker version: $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo 'N/A')"
    echo "Docker Compose: $(docker compose version --short 2>/dev/null || echo 'N/A')"
    echo "Available memory: $(free -h 2>/dev/null | awk '/^Mem:/ {print $7}' || echo 'N/A')"
    echo "Available disk: $(df -h "${DIVE_ROOT}" | awk 'NR==2 {print $4}')"
    echo ""

    # Network diagnostics
    echo "=== Networks ==="
    docker network ls --filter "name=dive" --format "table {{.Name}}\t{{.Driver}}\t{{.Scope}}"
    echo ""

    # Container diagnostics
    echo "=== Containers ==="
    if [ "$target" = "hub" ] || [ "$target" = "all" ]; then
        echo "Hub containers:"
        docker ps -a --filter "name=dive-hub" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo ""
    fi

    if [ "$target" = "spoke" ] || [ "$target" = "all" ]; then
        echo "Spoke containers:"
        docker ps -a --filter "name=dive-spoke" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo ""
    elif [ "$target" != "hub" ] && [ "$target" != "all" ]; then
        local code_lower=$(lower "$target")
        echo "Spoke $target containers:"
        docker ps -a --filter "name=dive-spoke-${code_lower}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo ""
    fi

    # Health check
    echo "=== Health Status ==="
    for container in $(docker ps --filter "name=dive" --format '{{.Names}}'); do
        local health=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no_healthcheck")
        printf "  %-40s %s\n" "$container" "$health"
    done
    echo ""

    # Resource usage
    echo "=== Resource Usage ==="
    docker stats --no-stream --filter "name=dive" --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
    echo ""
}

##
# Diagnose federation issues
#
# Arguments:
#   $1 - Instance code
##
diagnose_federation() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    echo "═══════════════════════════════════════════════════════════════"
    echo "Federation Diagnostics: $code_upper"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    # Get configuration
    local ports=$(get_instance_ports "$instance_code" 2>/dev/null)
    local kc_port=$(echo "$ports" | jq -r '.keycloak // 8443')
    local spoke_url="https://localhost:${kc_port}"
    local spoke_realm="dive-v3-broker-${code_lower}"

    echo "Configuration:"
    echo "  Spoke URL:   $spoke_url"
    echo "  Spoke Realm: $spoke_realm"
    echo "  Hub URL:     ${HUB_KC_URL:-https://localhost:8443}"
    echo ""

    # Connectivity tests
    echo "=== Connectivity Tests ==="

    echo -n "  Hub Keycloak:     "
    if curl -sf "${HUB_KC_URL:-https://localhost:8443}/realms/master" --insecure >/dev/null 2>&1; then
        echo "✓ Reachable"
    else
        echo "✗ Not reachable"
    fi

    echo -n "  Spoke Keycloak:   "
    if curl -sf "${spoke_url}/realms/master" --insecure >/dev/null 2>&1; then
        echo "✓ Reachable"
    else
        echo "✗ Not reachable"
    fi

    echo -n "  OIDC Discovery:   "
    if curl -sf "${spoke_url}/realms/${spoke_realm}/.well-known/openid-configuration" --insecure >/dev/null 2>&1; then
        echo "✓ Available"
    else
        echo "✗ Not available"
    fi

    echo -n "  JWKS Endpoint:    "
    if curl -sf "${spoke_url}/realms/${spoke_realm}/protocol/openid-connect/certs" --insecure >/dev/null 2>&1; then
        echo "✓ Available"
    else
        echo "✗ Not available"
    fi

    echo ""

    # Certificate check
    echo "=== Certificate Check ==="
    local cert_file="${DIVE_ROOT}/instances/${code_lower}/certs/certificate.pem"
    if [ -f "$cert_file" ]; then
        local expiry=$(openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null | cut -d= -f2)
        echo "  Certificate: $cert_file"
        echo "  Expires:     $expiry"
    else
        echo "  Certificate: Not found at $cert_file"
    fi

    echo ""
}

##
# Collect logs for troubleshooting
#
# Arguments:
#   $1 - Target: "hub" or instance code
#   $2 - Lines (default: 100)
##
collect_logs() {
    local target="$1"
    local lines="${2:-100}"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local output_dir="${DIVE_ROOT}/logs/diagnostics/${timestamp}"

    mkdir -p "$output_dir"

    log_info "Collecting logs to $output_dir..."

    if [ "$target" = "hub" ]; then
        for container in $(docker ps -a --filter "name=dive-hub" --format '{{.Names}}'); do
            docker logs --tail "$lines" "$container" > "${output_dir}/${container}.log" 2>&1
        done
    else
        local code_lower=$(lower "$target")
        for container in $(docker ps -a --filter "name=dive-spoke-${code_lower}" --format '{{.Names}}'); do
            docker logs --tail "$lines" "$container" > "${output_dir}/${container}.log" 2>&1
        done
    fi

    # Include system info
    diagnose "$target" > "${output_dir}/diagnostics.txt" 2>&1

    # Create archive
    local archive="${DIVE_ROOT}/logs/diagnostics-${timestamp}.tar.gz"
    tar -czf "$archive" -C "${DIVE_ROOT}/logs/diagnostics" "$timestamp"
    rm -rf "$output_dir"

    log_success "Logs collected: $archive"
    echo "$archive"
}

# =============================================================================
# FIX FUNCTIONS
# =============================================================================

##
# Fix common Hub issues
##
fix_hub() {
    log_info "Running Hub fixes..."

    # Fix 1: Restart unhealthy containers
    log_info "Checking for unhealthy containers..."
    for container in $(docker ps --filter "name=dive-hub" --filter "health=unhealthy" --format '{{.Names}}'); do
        log_warn "Restarting unhealthy: $container"
        docker restart "$container"
    done

    # Fix 2: Recreate network if missing
    if ! docker network inspect dive-shared >/dev/null 2>&1; then
        log_warn "Recreating dive-shared network..."
        docker network create dive-shared
    fi

    # Fix 3: Clean orphaned volumes
    log_info "Cleaning orphaned volumes..."
    docker volume prune -f --filter "label=com.docker.compose.project=dive-hub" >/dev/null 2>&1 || true

    log_success "Hub fixes complete"
}

##
# Fix common Spoke issues
#
# Arguments:
#   $1 - Instance code
##
fix_spoke() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    log_info "Running fixes for Spoke $code_upper..."

    # Fix 1: Restart unhealthy containers
    log_info "Checking for unhealthy containers..."
    for container in $(docker ps --filter "name=dive-spoke-${code_lower}" --filter "health=unhealthy" --format '{{.Names}}'); do
        log_warn "Restarting unhealthy: $container"
        docker restart "$container"
    done

    # Fix 2: Regenerate certificates if expired
    local cert_file="${DIVE_ROOT}/instances/${code_lower}/certs/certificate.pem"
    if [ -f "$cert_file" ]; then
        # Portable date parsing (macOS + Linux)
        local expiry_date=$(openssl x509 -in "$cert_file" -noout -enddate 2>/dev/null | cut -d= -f2)
        local expiry_epoch=0
        if [ -n "$expiry_date" ]; then
            expiry_epoch=$(date -j -f "%b %d %T %Y %Z" "$expiry_date" +%s 2>/dev/null || date -d "$expiry_date" +%s 2>/dev/null || echo 0)
        fi
        local now_epoch=$(date +%s)

        if [ "${expiry_epoch:-0}" -lt "$now_epoch" ]; then
            log_warn "Certificate expired, regenerating..."
            if type generate_spoke_certificate &>/dev/null; then
                generate_spoke_certificate "$instance_code"
            fi
        fi
    fi

    # Fix 3: Fix hostname issues
    fix_hostname "$instance_code"

    log_success "Spoke $code_upper fixes complete"
}

##
# Fix hostname configuration issues
#
# Arguments:
#   $1 - Instance code
##
fix_hostname() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    local kc_container="dive-spoke-${code_lower}-keycloak"

    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_info "Checking Keycloak hostname configuration..."

        # Get current hostname
        local hostname=$(docker exec "$kc_container" printenv KC_HOSTNAME 2>/dev/null)

        if [ "$hostname" != "localhost" ]; then
            log_warn "Hostname mismatch detected, may cause redirect issues"
            log_info "Expected: localhost, Actual: $hostname"
        fi
    fi
}

##
# Fix database connection issues
#
# Arguments:
#   $1 - Instance code (or "hub")
##
fix_database() {
    local instance_code="$1"

    local container_prefix
    if [ "$instance_code" = "hub" ]; then
        container_prefix="dive-hub"
    else
        container_prefix="dive-spoke-$(lower "$instance_code")"
    fi

    local pg_container="${container_prefix}-postgres"

    if ! docker ps --format '{{.Names}}' | grep -q "^${pg_container}$"; then
        log_error "PostgreSQL container not running: $pg_container"
        return 1
    fi

    log_info "Checking PostgreSQL connection..."

    # Test connection
    if docker exec "$pg_container" pg_isready -U postgres >/dev/null 2>&1; then
        log_success "PostgreSQL is accepting connections"
    else
        log_warn "PostgreSQL not ready, restarting..."
        docker restart "$pg_container"
        sleep 10

        if docker exec "$pg_container" pg_isready -U postgres >/dev/null 2>&1; then
            log_success "PostgreSQL recovered"
        else
            log_error "PostgreSQL still not ready"
            return 1
        fi
    fi
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f diagnose
export -f diagnose_federation
export -f collect_logs
export -f fix_hub
export -f fix_spoke
export -f fix_hostname
export -f fix_database

log_verbose "Troubleshooting utilities module loaded"
