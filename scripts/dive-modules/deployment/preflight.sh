#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Preflight Checks Module (Consolidated)
# =============================================================================
# Pre-deployment validation for Hub and Spoke deployments
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_DEPLOYMENT_PREFLIGHT_LOADED:-}" ] && return 0
export DIVE_DEPLOYMENT_PREFLIGHT_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

DEPLOYMENT_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$DEPLOYMENT_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# PREFLIGHT CHECK FUNCTIONS
# =============================================================================

##
# Run all preflight checks
#
# Arguments:
#   $1 - Deployment type: "hub" or "spoke"
#   $2 - Instance code (for spoke)
#
# Returns:
#   0 - All checks passed
#   1 - Critical checks failed
##
preflight_run_all() {
    local deployment_type="${1:-spoke}"
    local instance_code="${2:-}"

    local checks_passed=0
    local checks_failed=0
    local warnings=0

    log_step "Running preflight checks for $deployment_type..."

    # Docker check (critical)
    if preflight_check_docker; then
        ((checks_passed++))
    else
        ((checks_failed++))
        log_error "CRITICAL: Docker check failed"
    fi

    # Docker Compose check (critical)
    if preflight_check_compose; then
        ((checks_passed++))
    else
        ((checks_failed++))
        log_error "CRITICAL: Docker Compose check failed"
    fi

    # Required tools check (critical)
    if preflight_check_tools; then
        ((checks_passed++))
    else
        ((checks_failed++))
        log_error "CRITICAL: Required tools missing"
    fi

    # Disk space check (warning)
    if preflight_check_disk_space; then
        ((checks_passed++))
    else
        ((warnings++))
        log_warn "WARNING: Low disk space"
    fi

    # Port availability check (warning)
    if preflight_check_ports "$deployment_type" "$instance_code"; then
        ((checks_passed++))
    else
        ((warnings++))
        log_warn "WARNING: Some ports may be in use"
    fi

    # Hub availability check (for spoke, critical)
    if [ "$deployment_type" = "spoke" ]; then
        if preflight_check_hub; then
            ((checks_passed++))
        else
            ((checks_failed++))
            log_error "CRITICAL: Hub not available"
        fi
    fi

    # Network check (warning)
    if preflight_check_network; then
        ((checks_passed++))
    else
        ((warnings++))
        log_warn "WARNING: Network may need creation"
    fi

    # Summary
    echo ""
    log_info "Preflight Summary:"
    echo "  Passed:   $checks_passed"
    echo "  Failed:   $checks_failed"
    echo "  Warnings: $warnings"
    echo ""

    if [ $checks_failed -gt 0 ]; then
        log_error "Preflight checks failed - cannot proceed"
        return 1
    fi

    if [ $warnings -gt 0 ]; then
        log_warn "Preflight passed with warnings"
    else
        log_success "All preflight checks passed"
    fi

    return 0
}

##
# Check Docker daemon — auto-installs if missing
##
preflight_check_docker() {
    log_verbose "Checking Docker daemon..."

    if docker info >/dev/null 2>&1; then
        log_verbose "Docker daemon is running"
        return 0
    fi

    # Docker not available — try auto-install
    if command -v docker >/dev/null 2>&1; then
        # Docker installed but daemon not running
        log_warn "Docker installed but daemon not running — attempting to start..."
        sudo systemctl start docker 2>/dev/null || true
        sleep 2
        if docker info >/dev/null 2>&1; then
            log_success "Docker daemon started"
            return 0
        fi
        # May be a socket permission issue — try opening for current session
        if [ -S /var/run/docker.sock ]; then
            sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
            if docker info >/dev/null 2>&1; then
                log_success "Docker daemon started (socket opened for current session)"
                return 0
            fi
        fi
        log_error "Docker daemon failed to start"
        return 1
    fi

    # Docker not installed — auto-install
    log_warn "Docker not found — auto-installing..."
    source "${MODULES_DIR}/bootstrap.sh"
    _bootstrap_docker
    _bootstrap_compose
    _bootstrap_docker_storage

    # Verify — may need socket permission fix for current session
    if docker info >/dev/null 2>&1; then
        log_success "Docker auto-installed and running"
        return 0
    fi

    # Docker installed but current user not in docker group yet (needs re-login)
    # Temporarily open socket for current session — group membership applies on next login
    if [ -S /var/run/docker.sock ]; then
        sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
        if docker info >/dev/null 2>&1; then
            log_success "Docker auto-installed (socket opened for current session)"
            return 0
        fi
    fi

    log_error "Docker installed but requires re-login for group membership. Run: newgrp docker"
    return 1
}

##
# Check Docker Compose — auto-installs if missing
##
preflight_check_compose() {
    log_verbose "Checking Docker Compose..."

    if docker compose version >/dev/null 2>&1; then
        log_verbose "Docker Compose is available"
        return 0
    fi

    # Try auto-install
    log_warn "Docker Compose v2 not found — auto-installing..."
    source "${MODULES_DIR}/bootstrap.sh"
    _bootstrap_compose

    if docker compose version >/dev/null 2>&1; then
        log_success "Docker Compose v2 auto-installed"
        return 0
    fi

    log_error "Docker Compose v2 install failed"
    return 1
}

##
# Check required tools — auto-installs if missing
##
preflight_check_tools() {
    log_verbose "Checking required tools..."

    local required=("jq" "curl" "openssl" "rsync" "git" "terraform" "vault" "yq")
    local missing=()

    for tool in "${required[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            missing+=("$tool")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        log_warn "Missing tools: ${missing[*]} — auto-installing..."
        source "${MODULES_DIR}/bootstrap.sh"

        # Install each missing tool via its specific bootstrap function
        local need_sys_packages=false
        for tool in "${missing[@]}"; do
            case "$tool" in
                jq|curl|openssl|rsync|git|wget|unzip) need_sys_packages=true ;;
                terraform)  _bootstrap_terraform ;;
                vault)      _bootstrap_vault ;;
                yq)         _bootstrap_yq ;;
            esac
        done
        $need_sys_packages && _bootstrap_system_packages

        # Re-check
        local still_missing=()
        for tool in "${required[@]}"; do
            command -v "$tool" >/dev/null 2>&1 || still_missing+=("$tool")
        done

        if [ ${#still_missing[@]} -gt 0 ]; then
            log_error "Failed to install: ${still_missing[*]}"
            return 1
        fi
        log_success "Auto-installed: ${missing[*]}"
    fi

    # Check optional tools (warn but don't fail)
    if ! is_cloud_environment 2>/dev/null && ! command -v mkcert >/dev/null 2>&1; then
        log_warn "mkcert not found — auto-installing..."
        source "${MODULES_DIR}/bootstrap.sh"
        _bootstrap_mkcert
    fi

    log_verbose "All required tools available"
    return 0
}

##
# Check disk space
##
preflight_check_disk_space() {
    log_verbose "Checking disk space..."

    local available
    available=$(df -h "${DIVE_ROOT}" | awk 'NR==2 {print $4}' | sed 's/[^0-9.]//g')

    if [ -z "$available" ]; then
        log_warn "Could not determine available disk space"
        return 0
    fi

    # Check if less than 5GB
    if (( $(echo "$available < 5" | bc -l 2>/dev/null || echo 0) )); then
        log_warn "Low disk space: ${available}GB available (recommend 5GB+)"
        return 1
    fi

    log_verbose "Disk space OK: ${available}GB available"
    return 0
}

##
# Check port availability
##
preflight_check_ports() {
    local deployment_type="$1"
    local instance_code="$2"

    log_verbose "Checking port availability..."

    local ports_to_check

    if [ "$deployment_type" = "hub" ]; then
        ports_to_check="8443 4000 3000 5432 27017"
    else
        # Get instance-specific ports
        if eval "$(get_instance_ports "$instance_code" 2>/dev/null)"; then
            local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
            local be_port="${SPOKE_BACKEND_PORT:-4000}"
            local fe_port="${SPOKE_FRONTEND_PORT:-3000}"
            ports_to_check="$kc_port $be_port $fe_port"
        else
            ports_to_check="8443 4000 3000"
        fi
    fi

    local conflicts=0
    for port in $ports_to_check; do
        if lsof -i ":$port" >/dev/null 2>&1; then
            log_warn "Port $port is in use"
            ((conflicts++))
        fi
    done

    if [ $conflicts -gt 0 ]; then
        return 1
    fi

    log_verbose "All required ports are available"
    return 0
}

##
# Check Hub availability (for spoke deployments)
##
preflight_check_hub() {
    log_verbose "Checking Hub availability..."

    # Check if Hub containers are running
    if ! docker ps --filter "name=dive-hub-keycloak" --format '{{.Names}}' | grep -q "dive-hub-keycloak"; then
        log_error "Hub Keycloak container is not running"
        log_error "Deploy Hub first: ./dive hub deploy"
        return 1
    fi

    # Check Hub health
    local hub_health
    hub_health=$(docker inspect dive-hub-keycloak --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

    if [ "$hub_health" != "healthy" ]; then
        log_warn "Hub Keycloak is not healthy (status: $hub_health)"
        log_warn "Spoke deployment may fail"
        # Don't fail - spoke might still work
    fi

    log_verbose "Hub is available"
    return 0
}

##
# Check Docker network
##
preflight_check_network() {
    log_verbose "Checking Docker network..."

    if ! docker network inspect dive-shared >/dev/null 2>&1; then
        log_verbose "dive-shared network does not exist (will be created)"
        return 1
    fi

    log_verbose "dive-shared network exists"
    return 0
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f preflight_run_all
export -f preflight_check_docker
export -f preflight_check_compose
export -f preflight_check_tools
export -f preflight_check_disk_space
export -f preflight_check_ports
export -f preflight_check_hub
export -f preflight_check_network

log_verbose "Preflight module loaded"
