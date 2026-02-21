#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Spoke Preflight Validation
# =============================================================================
# Validates all prerequisites before spoke deployment begins
# Fail-fast strategy: catch all issues before expensive operations
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load secret management functions (needed for GCP secret loading)
if [ -z "${SPOKE_SECRETS_LOADED:-}" ]; then
    if source "$(dirname "${BASH_SOURCE[0]}")/spoke-secrets.sh" 2>/dev/null; then
        log_verbose "spoke-secrets.sh loaded successfully" >/dev/null
    else
        log_verbose "spoke-secrets.sh not available (secret functions may not work)" >/dev/null
    fi
fi

# =============================================================================
# MAIN PREFLIGHT VALIDATION
# =============================================================================

##
# Run comprehensive preflight validation
#
# Arguments:
#   $1 - Instance code (e.g., EST, FRA)
#
# Returns:
#   0 - All checks passed
#   1 - One or more checks failed
##
spoke_preflight_validation() {
    local instance_code="${1:?Instance code required}"
    local code_upper
    code_upper=$(upper "$instance_code")
    local code_lower
    code_lower=$(lower "$instance_code")

    log_step "Running preflight validation for $code_upper spoke..."

    local failed_checks=0
    local warning_checks=0

    # Check 0: Vault Provisioning — auto-provision if needed
    # Skip for remote/standalone: Vault lives on the Hub, not the spoke
    if [ "${SECRETS_PROVIDER:-}" = "vault" ] && [ "${DEPLOYMENT_MODE:-local}" != "remote" ] && [ "${DEPLOYMENT_MODE:-local}" != "standalone" ]; then
        log_verbose "Check 0: Vault provisioning..."
        if ! type vault_spoke_is_provisioned &>/dev/null; then
            source "$(dirname "${BASH_SOURCE[0]}")/../../vault/module.sh" 2>/dev/null || true
        fi
        if type vault_spoke_is_provisioned &>/dev/null; then
            if ! vault_spoke_is_provisioned "$code_lower"; then
                # Auto-provision was already done in spoke_deploy(), but handle edge case
                log_info "Spoke $code_upper not provisioned in Vault — auto-provisioning..."
                if type module_vault_provision &>/dev/null; then
                    if ! module_vault_provision "$code_upper"; then
                        log_error "✗ Vault auto-provisioning failed for $code_upper"
                        return 1
                    fi
                    log_success "✓ Vault auto-provisioned for $code_upper"
                else
                    log_error "✗ Vault provision function not available"
                    return 1
                fi
            else
                log_success "✓ Vault provisioning verified (policy + AppRole + secrets)"
            fi
        fi
    fi

    # Check 1: Hub Reachability
    log_verbose "Check 1/6: Hub reachability..."
    if ! preflight_check_hub_reachable; then
        if [ "${SKIP_FEDERATION:-false}" = "false" ]; then
            log_error "✗ Hub unreachable"
            ((failed_checks++))
        else
            log_warn "⚠ Hub unreachable (skipped due to --skip-federation)"
            ((warning_checks++))
        fi
    else
        log_success "✓ Hub accessible"
    fi

    # Check 2: Required Secrets Available
    log_verbose "Check 2/6: Required secrets..."
    if ! preflight_check_secrets_available "$code_upper"; then
        log_error "✗ Required secrets missing"
        ((failed_checks++))
    else
        log_success "✓ All required secrets available"
    fi

    # Check 3: Ports Available
    log_verbose "Check 3/6: Port availability..."
    if ! preflight_check_ports_available "$code_upper"; then
        log_error "✗ Port conflicts detected"
        ((failed_checks++))
    else
        log_success "✓ All required ports available"
    fi

    # Check 4: Docker Resources
    log_verbose "Check 4/6: Docker resources..."
    if ! preflight_check_docker_resources; then
        log_error "✗ Insufficient Docker resources"
        ((failed_checks++))
    else
        log_success "✓ Docker resources sufficient"
    fi

    # Check 5: Network Connectivity
    log_verbose "Check 5/6: Network connectivity..."
    if ! preflight_check_network_connectivity; then
        log_error "✗ Network connectivity issues"
        ((failed_checks++))
    else
        log_success "✓ Network connectivity OK"
    fi

    # Check 6: Terraform State Clean
    log_verbose "Check 6/6: Terraform state..."
    if ! preflight_check_terraform_clean "$code_upper"; then
        log_warn "⚠ Orphaned Terraform state detected - will attempt cleanup"
        ((warning_checks++))
        # Don't fail - cleanup can happen automatically
    else
        log_success "✓ Terraform state clean"
    fi

    # Summary
    echo ""
    log_info "Preflight Summary:"
    log_info "  Failed checks:  $failed_checks"
    log_info "  Warning checks: $warning_checks"
    echo ""

    if [ $failed_checks -eq 0 ]; then
        log_success "✓ Preflight validation passed - proceeding with deployment"
        return 0
    else
        log_error "✗ Preflight validation failed: $failed_checks check(s) failed"
        log_error "Fix the above issues before deploying"
        return 1
    fi
}

# =============================================================================
# CHECK 1: HUB REACHABILITY
# =============================================================================

##
# Check if Hub is reachable
#
# Returns:
#   0 - Hub accessible
#   1 - Hub not accessible
##
preflight_check_hub_reachable() {
    # Standalone mode: no Hub needed
    if [ "${DEPLOYMENT_MODE:-local}" = "standalone" ]; then
        log_verbose "Standalone mode — skipping Hub reachability check"
        return 0
    fi

    # Remote mode: use the Hub API URL discovered from domain prompt
    local hub_url="${HUB_API_URL:-${HUB_URL:-https://localhost:4000}}"

    # Try health endpoint with 5s timeout (HTTPS only - Zero Trust)
    if curl -skf --max-time 5 "$hub_url/api/health" >/dev/null 2>&1; then
        return 0
    fi

    # Remote mode: also try the external address directly
    if [ "${DEPLOYMENT_MODE:-local}" = "remote" ] && [ -n "${HUB_EXTERNAL_ADDRESS:-}" ]; then
        if curl -skf --max-time 5 "https://${HUB_EXTERNAL_ADDRESS}/api/health" >/dev/null 2>&1; then
            return 0
        fi
    fi

    log_error "Hub not accessible at $hub_url/api/health (HTTPS)"
    log_error "Start Hub first: ./dive hub up"
    log_error "Check Hub status: ./dive hub status"
    return 1
}

# =============================================================================
# CHECK 2: REQUIRED SECRETS AVAILABLE
# =============================================================================

##
# Check if all required secrets are available (and attempt to load them)
#
# Arguments:
#   $1 - Instance code (uppercase)
#
# Returns:
#   0 - All secrets available (or successfully loaded)
#   1 - Missing secrets (and cannot be loaded)
##
preflight_check_secrets_available() {
    local instance_code="$1"

    # Required secrets for spoke
    local required_secrets=(
        "POSTGRES_PASSWORD"
        "KEYCLOAK_ADMIN_PASSWORD"
        "MONGO_PASSWORD"
        "AUTH_SECRET"
        "KEYCLOAK_CLIENT_SECRET"
        "REDIS_PASSWORD"
    )

    local missing_secrets=()

    log_verbose "Checking secret availability (GCP → Environment → .env)..."

    # First, try to load secrets from GCP if gcloud is available
    if command -v gcloud &>/dev/null && type spoke_secrets_load_from_gcp &>/dev/null; then
        log_verbose "Attempting to load secrets from GCP..."
        if spoke_secrets_load_from_gcp "$instance_code" 2>/dev/null; then
            log_verbose "Successfully loaded secrets from GCP"
            # Secrets are now in environment, continue to validation below
        else
            log_verbose "GCP secret loading failed, will check other sources"
        fi
    fi

    # Check each secret
    for secret_base in "${required_secrets[@]}"; do
        local has_secret=false
        local secret_var="${secret_base}_${instance_code}"

        # Check if already loaded in environment (from GCP or elsewhere)
        if [ -n "${!secret_var:-}" ]; then
            has_secret=true
            log_verbose "  ✓ $secret_var loaded in environment"
        fi

        # If not in environment, check .env file (dev mode fallback)
        if [ "$has_secret" = "false" ]; then
            local env_file="${DIVE_ROOT}/instances/${instance_code,,}/.env"
            if [ -f "$env_file" ] && grep -q "^${secret_var}=" "$env_file"; then
                # Load from .env
                local value
                value=$(grep "^${secret_var}=" "$env_file" | cut -d'=' -f2-)
                if [ -n "$value" ]; then
                    export "${secret_var}=${value}"
                    has_secret=true
                    log_verbose "  ✓ $secret_var loaded from .env"
                fi
            fi
        fi

        if [ "$has_secret" = "false" ]; then
            missing_secrets+=("$secret_var")
        fi
    done

    if [ ${#missing_secrets[@]} -gt 0 ]; then
        log_error "Missing required secrets: ${missing_secrets[*]}"

        # Try to generate new secrets as a last resort
        if type spoke_secrets_generate &>/dev/null; then
            log_info "Attempting to generate missing secrets..."
            if spoke_secrets_generate "$instance_code" 2>/dev/null; then
                log_success "Generated missing secrets"

                # Upload to GCP if available
                if command -v gcloud &>/dev/null && type spoke_secrets_upload_to_gcp &>/dev/null; then
                    spoke_secrets_upload_to_gcp "$instance_code" 2>/dev/null || log_verbose "Could not upload to GCP"
                fi

                # Save to .env
                if type spoke_secrets_sync_to_env &>/dev/null; then
                    spoke_secrets_sync_to_env "$instance_code" 2>/dev/null || log_verbose "Could not sync to .env"
                fi

                return 0
            else
                log_error "Failed to generate secrets"
            fi
        fi

        if is_production_mode; then
            log_error "Production mode requires GCP Secret Manager"
            log_error "Create secrets: ./dive secrets create $instance_code"
            return 1
        else
            log_error "Could not load or generate secrets"
            log_error "Sync secrets: ./dive secrets sync $instance_code"
            return 1
        fi
    fi

    return 0
}

# =============================================================================
# CHECK 3: PORT AVAILABILITY
# =============================================================================

##
# Check if all required ports are available
#
# Arguments:
#   $1 - Instance code (uppercase)
#
# Returns:
#   0 - All ports available
#   1 - Port conflicts
##
preflight_check_ports_available() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    # Get port allocation for this spoke (outputs shell exports, not JSON)
    eval "$(get_instance_ports "$instance_code" 2>/dev/null)" || {
        log_error "Failed to get port allocation for $instance_code"
        return 1
    }

    # Use exported SPOKE_* variables
    # Only check ports ACTUALLY EXPOSED to the host in the spoke docker-compose template
    # Redis, PostgreSQL, MongoDB are internal-only (no host port mapping in template)
    local frontend_port="${SPOKE_FRONTEND_PORT:-}"
    local backend_port="${SPOKE_BACKEND_PORT:-}"
    local keycloak_https="${SPOKE_KEYCLOAK_HTTPS_PORT:-}"
    local keycloak_http="${SPOKE_KEYCLOAK_HTTP_PORT:-}"
    local opa_port="${SPOKE_OPA_PORT:-}"
    local kas_port="${SPOKE_KAS_PORT:-}"

    local ports=(
        "$frontend_port"
        "$backend_port"
        "$keycloak_https"
        "$keycloak_http"
        "$opa_port"
        "$kas_port"
    )

    local conflicts=()

    for port in "${ports[@]}"; do
        if [ -n "$port" ] && [ "$port" != "null" ]; then
            if lsof -Pi ":$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
                # Port is in use - check if it's our spoke instance (idempotent deployment support)
                # Use docker inspect + jq for proper JSON parsing (best practice)
                local owner_container=""
                
                # Check all containers for this spoke instance
                for container in $(docker ps --filter "name=dive-spoke-${code_lower}" --format '{{.Names}}' 2>/dev/null); do
                    # Use docker inspect + jq to get host ports (proper JSON parsing)
                    local container_ports
                    container_ports=$(docker inspect "$container" --format '{{json .NetworkSettings.Ports}}' 2>/dev/null | \
                        jq -r 'to_entries[] | .value[]? | .HostPort' 2>/dev/null || echo "")
                    
                    # Check if this container uses the port
                    if echo "$container_ports" | grep -q "^${port}$"; then
                        owner_container="$container"
                        break
                    fi
                done
                
                if [ -z "$owner_container" ]; then
                    # Port in use by something else - this is a conflict
                    conflicts+=("$port")
                else
                    # Port in use by our own container - OK for idempotent deployments
                    log_verbose "Port $port in use by $owner_container (OK for retry)"
                fi
            fi
        fi
    done

    if [ ${#conflicts[@]} -gt 0 ]; then
        log_error "Port conflicts detected: ${conflicts[*]}"
        log_error "Ports already in use - cannot start spoke services"
        log_error "Check what's using ports: lsof -Pi :PORT -sTCP:LISTEN"
        log_error "Stop conflicting services or choose different instance"
        return 1
    fi

    return 0
}

# =============================================================================
# CHECK 4: DOCKER RESOURCES
# =============================================================================

##
# Check if Docker has sufficient resources
#
# Returns:
#   0 - Resources sufficient
#   1 - Insufficient resources
##
preflight_check_docker_resources() {
    # Check Docker is running
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running"
        log_error "Start Docker Desktop or Docker daemon"
        return 1
    fi

    # Check disk space (need at least 10GB free)
    local disk_available
    if [ -d "/var/lib/docker" ]; then
        disk_available=$(df -h /var/lib/docker 2>/dev/null | awk 'NR==2 {print $4}' | sed 's/[^0-9.]//g')
    else
        # macOS Docker Desktop uses different location
        disk_available=$(df -h / 2>/dev/null | awk 'NR==2 {print $4}' | sed 's/[^0-9.]//g')
    fi

    if [ -n "$disk_available" ]; then
        # Convert to integer for comparison (remove decimal)
        local disk_gb=${disk_available%.*}
        if [ -n "$disk_gb" ] && [ "$disk_gb" -lt 10 ]; then
            log_error "Insufficient disk space: ${disk_available}GB available"
            log_error "Need at least 10GB free for Docker volumes"
            log_error "Clean up: docker system prune -af --volumes"
            return 1
        fi
    fi

    # Check memory (need at least 4GB allocated to Docker)
    local memory_total
    memory_total=$(docker info 2>/dev/null | grep "Total Memory" | awk '{print $3}')
    if [ -n "$memory_total" ]; then
        local memory_gb
        memory_gb=$(echo "$memory_total" | sed 's/[^0-9.]//g')
        local memory_int=${memory_gb%.*}
        if [ -n "$memory_int" ] && [ "$memory_int" -lt 4 ]; then
            log_warn "Low Docker memory: ${memory_total}"
            log_warn "Recommended: At least 4GB for spoke deployment"
            log_warn "Adjust in Docker Desktop preferences"
            # Don't fail - just warn
        fi
    fi

    return 0
}

# =============================================================================
# CHECK 5: NETWORK CONNECTIVITY
# =============================================================================

##
# Check network connectivity
#
# Returns:
#   0 - Network OK
#   1 - Network issues
##
preflight_check_network_connectivity() {
    # Check can reach Docker Hub (to pull images)
    if ! curl -sf --max-time 5 https://hub.docker.com >/dev/null 2>&1; then
        log_error "Cannot reach Docker Hub"
        log_error "Network connectivity required to pull container images"
        log_error "Check internet connection and proxy settings"
        return 1
    fi

    # Check DNS resolution
    if ! nslookup hub.docker.com >/dev/null 2>&1; then
        log_error "DNS resolution failed"
        log_error "Cannot resolve hub.docker.com"
        return 1
    fi

    return 0
}

# =============================================================================
# CHECK 6: TERRAFORM STATE CLEAN
# =============================================================================

##
# Check Terraform state for orphaned resources
#
# Arguments:
#   $1 - Instance code (uppercase)
#
# Returns:
#   0 - State clean
#   1 - Orphaned state exists
##
preflight_check_terraform_clean() {
    local instance_code="$1"
    local code_lower="${instance_code,,}"

    # Check if Terraform directory exists
    local tf_dir="${DIVE_ROOT}/terraform/spoke"
    if [ ! -d "$tf_dir" ]; then
        log_verbose "Terraform directory not found (OK - first deployment)"
        return 0
    fi

    # Check if Terraform workspace exists
    cd "$tf_dir" || return 0

    local workspace_exists=false
    if terraform workspace list 2>/dev/null | grep -q " ${code_lower}$"; then
        workspace_exists=true
    fi

    if [ "$workspace_exists" = "true" ]; then
        terraform workspace select "$code_lower" >/dev/null 2>&1

        local state_count
        state_count=$(terraform state list 2>/dev/null | wc -l | tr -d ' ')

        if [ "$state_count" != "0" ]; then
            log_verbose "Existing Terraform state found: $state_count resources"
            log_verbose "This is OK if redeploying existing spoke"
            # Not an error - might be redeploying
        fi
    fi

    cd - >/dev/null || true
    return 0
}

# Export main function
export -f spoke_preflight_validation

# Mark module as loaded
export DIVE_SPOKE_PREFLIGHT_LOADED=1
