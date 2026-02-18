#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline Preflight Phase
# =============================================================================
# Handles pre-deployment checks:
#   - Hub infrastructure detection
#   - Secret loading
#   - Network setup
#   - Instance conflict detection
#
# Consolidates logic from spoke_deploy() lines 467-618 and spoke_up() lines 62-211
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# Prevent multiple sourcing
# BEST PRACTICE (2026-01-18): Check functions exist, not just guard variable
if type spoke_phase_preflight &>/dev/null; then
    return 0
fi
# Module loaded marker will be set at end after functions defined

# Load orchestration framework (includes dependency validation)
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../../orchestration/framework.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../../orchestration/framework.sh"
fi

# Load secret management functions (needed for secret loading in preflight)
if [ -z "${SPOKE_SECRETS_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/spoke-secrets.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/spoke-secrets.sh"
    fi
fi

# Load spoke-preflight module (contains preflight_check_secrets_available)
if [ -z "${DIVE_SPOKE_PREFLIGHT_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/spoke-preflight.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/spoke-preflight.sh"
    fi
fi

# Load validation functions for idempotent deployments
if [ -z "${SPOKE_VALIDATION_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/spoke-validation.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/spoke-validation.sh"
    fi
fi

# =============================================================================
# MAIN PREFLIGHT PHASE FUNCTION
# =============================================================================

##
# Execute the preflight phase
#
# Arguments:
#   $1 - Instance code
#   $2 - Pipeline mode (deploy|up|redeploy)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_phase_preflight() {
    local instance_code="$1"
    local pipeline_mode="${2:-deploy}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    # =============================================================================
    # IDEMPOTENT DEPLOYMENT: Check overall deployment state first
    # =============================================================================
    # Check if this is a retry of a completed deployment
    local current_state
    if type orch_db_get_state &>/dev/null; then
        current_state=$(orch_db_get_state "$code_upper" 2>/dev/null || echo "UNKNOWN")
        log_verbose "Current deployment state for $code_upper: $current_state"
        
        # If deployment is COMPLETE, validate ALL phases thoroughly
        if [ "$current_state" = "COMPLETE" ]; then
            log_info "Deployment marked COMPLETE - validating all phases"
            local all_phases_valid=true
            local failed_phase=""
            
            # Check all phases for completion AND validation
            if type spoke_validate_phase_state &>/dev/null && type spoke_phase_is_complete &>/dev/null; then
                for phase in PREFLIGHT INITIALIZATION DEPLOYMENT CONFIGURATION SEEDING VERIFICATION; do
                    if ! spoke_phase_is_complete "$instance_code" "$phase" 2>/dev/null; then
                        log_verbose "Phase $phase not marked complete in DB"
                        all_phases_valid=false
                        failed_phase="$phase"
                        break
                    fi
                    if ! spoke_validate_phase_state "$instance_code" "$phase" 2>/dev/null; then
                        log_verbose "Phase $phase validation failed"
                        all_phases_valid=false
                        failed_phase="$phase"
                        break
                    fi
                done
            else
                log_warn "Validation functions not available - cannot verify deployment"
                all_phases_valid=false
            fi
            
            if [ "$all_phases_valid" = "true" ]; then
                log_success "✅ Deployment complete and all phases validated"
                log_info "All infrastructure verified, nothing to do"
                return 0
            else
                log_info "Phase validation failed at: $failed_phase"
                log_info "Will re-run from failed phase"
            fi
        fi
    fi
    
    # =============================================================================
    # IDEMPOTENT DEPLOYMENT: Check if THIS phase is complete
    # =============================================================================
    if type spoke_phase_is_complete &>/dev/null; then
        if spoke_phase_is_complete "$instance_code" "PREFLIGHT"; then
            # Validate state is actually good
            if type spoke_validate_phase_state &>/dev/null; then
                if spoke_validate_phase_state "$instance_code" "PREFLIGHT"; then
                    log_info "✓ PREFLIGHT phase complete and validated, skipping"
                    return 0
                else
                    log_warn "PREFLIGHT step complete but validation failed, re-running"
                    if ! spoke_phase_clear "$instance_code" "PREFLIGHT"; then
                        log_warn "Failed to clear PREFLIGHT checkpoint (stale state may persist)"
                    fi
                fi
            else
                log_info "✓ PREFLIGHT phase complete (validation not available)"
                return 0
            fi
        fi
    fi

    log_info "→ Executing PREFLIGHT phase for $code_upper (mode: $pipeline_mode)"

    # Step 1: Hub auto-discovery (MUST run first — discovers Vault, Keycloak, backend health)
    # All downstream steps depend on Hub being healthy and configured
    if [ "$pipeline_mode" = "deploy" ]; then
        if ! spoke_preflight_check_hub "$instance_code"; then
            return 1
        fi
    else
        spoke_preflight_check_hub "$instance_code" || \
            log_warn "Hub not detected (federation features may be limited)"
    fi

    # Step 2: Validate deployment dependencies
    if type orch_validate_dependencies &>/dev/null; then
        log_step "Validating deployment dependencies..."
        if ! orch_validate_dependencies "$instance_code"; then
            log_error "Dependency validation failed - cannot proceed"
            return 1
        fi
    fi

    # Step 3: Check for deployment conflicts
    if ! spoke_preflight_check_conflicts "$instance_code"; then
        return 1
    fi

    # Step 4: Run comprehensive preflight validation (secrets, ports, Docker, Terraform)
    # Hub is already verified healthy at this point, so Vault provisioning in Check 0 won't hang
    if type spoke_preflight_validation &>/dev/null; then
        log_step "Running comprehensive preflight validation..."
        if ! spoke_preflight_validation "$instance_code"; then
            log_error "Comprehensive preflight validation failed"
            return 1
        fi
    else
        log_verbose "spoke_preflight_validation not available, using legacy checks"
    fi

    # Step 5: Load secrets
    local secrets_changed=false
    if [ "$pipeline_mode" = "deploy" ]; then
        # Full deployment: load or generate secrets
        if ! spoke_secrets_load "$instance_code" "load"; then
            # Try generating new secrets
            if ! spoke_secrets_load "$instance_code" "generate"; then
                return 1
            fi
            secrets_changed=true
        else
            # Check if secrets have changed (password rotation scenario)
            secrets_changed=$(spoke_preflight_check_secret_changes "$instance_code")
        fi
    else
        # Quick start: just load existing secrets
        if ! spoke_secrets_load "$instance_code" "load"; then
            log_error "Cannot start spoke without secrets. Run deployment first."
            return 1
        fi
    fi

    # Step 6: Validate secrets
    if ! spoke_secrets_validate "$instance_code"; then
        if [ "$pipeline_mode" = "deploy" ]; then
            log_warn "Secret validation failed, but continuing deployment"
        else
            return 1
        fi
    fi

    # Step 7: Ensure shared network exists
    if ! spoke_preflight_ensure_network; then
        return 1
    fi

    # Step 8: Configure Hub hostname resolution
    spoke_preflight_configure_hub_connectivity "$instance_code"

    # Step 9: Check for stale containers (cleanup)
    if [ "$pipeline_mode" != "up" ]; then
        spoke_preflight_cleanup_stale_containers "$instance_code"
    fi

    # Step 10: Clean volumes if secrets changed (prevents password mismatch)
    if [ "$secrets_changed" = "true" ]; then
        log_warn "Secrets changed - cleaning database volumes to prevent password mismatch"
        spoke_preflight_clean_database_volumes "$instance_code"
    fi

    # Mark phase complete (orchestration DB)
    if type spoke_phase_mark_complete &>/dev/null; then
        spoke_phase_mark_complete "$instance_code" "PREFLIGHT" 0 || true
    fi

    # Legacy checkpoint system (backward compatibility)
    if type orch_create_checkpoint &>/dev/null; then
        orch_create_checkpoint "$instance_code" "PREFLIGHT" "Preflight phase completed"
    fi

    log_success "✅ PREFLIGHT phase complete"
    return 0
}

# =============================================================================
# CONFLICT DETECTION
# =============================================================================

##
# Check for deployment conflicts (another deployment in progress)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - No conflicts
#   1 - Conflict detected
##
spoke_preflight_check_conflicts() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")

    # Check orchestration database availability first
    if ! orch_db_check_connection; then
        log_error "Orchestration database is not available - required for deployment"
        echo ""
        echo "  SOLUTION: Ensure Hub infrastructure is running:"
        echo "    ./dive hub up"
        echo ""
        if type orch_record_error &>/dev/null; then
            orch_record_error "$SPOKE_ERROR_INSTANCE_CONFLICT" "$ORCH_SEVERITY_CRITICAL" \
                "Orchestration database unavailable" "preflight" \
                "Start Hub infrastructure: ./dive hub up"
        fi
        return 1
    fi

    # Check current state in database
    local current_state
    current_state=$(orch_db_get_state "$code_upper" 2>/dev/null || echo "UNKNOWN")
    log_verbose "DEBUG: current_state for $code_upper = '$current_state'"

    case "$current_state" in
        INITIALIZING|DEPLOYING|CONFIGURING|VERIFYING)
            # RESILIENCE FIX (2026-02-07): Check if this is a stale/stuck state
            # If no deployment lock exists, the state is stale and should be cleaned up
            local has_lock=false
            if type orch_has_deployment_lock &>/dev/null; then
                if orch_has_deployment_lock "$code_upper" 2>/dev/null; then
                    has_lock=true
                fi
            fi
            
            if [ "$has_lock" = "true" ]; then
                # Active deployment lock exists - truly in progress
                log_error "Deployment already in progress for $code_upper (state: $current_state)"
                echo ""
                echo "  To force restart, clean the state first:"
                echo "  ./dive orch-db rollback $code_upper"
                echo ""

                if type orch_record_error &>/dev/null; then
                    orch_record_error "$SPOKE_ERROR_INSTANCE_CONFLICT" "$ORCH_SEVERITY_CRITICAL" \
                        "Instance $code_upper deployment already in progress" "preflight" \
                        "$(spoke_error_get_remediation $SPOKE_ERROR_INSTANCE_CONFLICT $instance_code)"
                fi
                return 1
            else
                # No lock but state shows in-progress = stale/crashed deployment
                log_warn "Detected stale deployment state '$current_state' (no active lock)"
                log_info "Auto-recovering: cleaning up stale state before retry"
                spoke_preflight_cleanup_failed_state "$instance_code"
            fi
            ;;
        FAILED)
            log_info "Previous deployment failed, cleaning up before retry"
            spoke_preflight_cleanup_failed_state "$instance_code"
            ;;
        COMPLETE)
            # This is OK - idempotent deployment will skip completed phases
            # Containers are expected to be running
            log_verbose "Previous deployment completed - will skip completed phases"
            ;;
        *)
            log_verbose "No prior deployment state for $code_upper (starting fresh)"
            
            # Only check for orphaned containers if no known state
            # (COMPLETE and FAILED states handle their containers appropriately)
            local running_containers
            running_containers=$(docker ps -q --filter "name=dive-spoke-${code_lower}" 2>/dev/null | wc -l | tr -d ' ')
            if [ "$running_containers" -gt 0 ]; then
                log_warn "Found $running_containers orphaned containers for $code_upper (no active deployment state)"
                log_info "Cleaning up orphaned containers before proceeding..."

                # Stop and remove orphaned containers
                if docker ps -q --filter "name=dive-spoke-${code_lower}" | xargs docker stop 2>/dev/null; then
                    log_verbose "Stopped orphaned containers"
                fi

                if docker ps -aq --filter "name=dive-spoke-${code_lower}" | xargs docker rm 2>/dev/null; then
                    log_verbose "Removed orphaned containers"
                fi

                # Clean up orphaned networks and volumes
                if docker network ls --filter "name=dive-spoke-${code_lower}" -q | xargs docker network rm 2>/dev/null; then
                    log_verbose "Removed orphaned networks"
                fi

                log_success "Cleaned up orphaned containers for $code_upper"
            fi
            ;;
    esac

    return 0
}

##
# Clean up after failed deployment
##
spoke_preflight_cleanup_failed_state() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_verbose "Cleaning up failed deployment state for $code_upper"

    # Reset state to allow new deployment
    orch_db_set_state "$code_upper" "CLEANUP" "Cleaning up after failed deployment"

    # Clean up orphaned containers
    spoke_preflight_cleanup_stale_containers "$instance_code"
}

# =============================================================================
# HUB DETECTION
# =============================================================================

##
# Check if Hub infrastructure is running and healthy (auto-discovery)
#
# Does three things:
#   1. Discovers Hub containers and reads .env.hub for config
#   2. Verifies each critical service is actually healthy (not just running)
#   3. Exports discovered config for downstream phases (Vault token, URLs, etc.)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Hub detected and healthy
#   1 - Hub not detected or unhealthy
##
spoke_preflight_check_hub() {
    local instance_code="$1"

    log_step "Auto-discovering Hub infrastructure..."

    # =========================================================================
    # Step 1: Detect Hub — local containers OR remote via HUB_EXTERNAL_ADDRESS
    # =========================================================================
    local hub_containers
    hub_containers=$(docker ps -q --filter "name=dive-hub" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$hub_containers" -eq 0 ]; then
        # No local hub — check if we have a remote hub address
        if [ -n "${HUB_EXTERNAL_ADDRESS:-}" ] && [ "$HUB_EXTERNAL_ADDRESS" != "localhost" ]; then
            log_info "No local Hub containers — using remote Hub at ${HUB_EXTERNAL_ADDRESS}"
            export DEPLOYMENT_MODE="remote"

            # Derive hub URLs for remote mode
            if [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
                local _ep _bd
                _ep="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f1)"
                _bd="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f2-)"
                export HUB_API_URL="${HUB_API_URL:-https://${_ep}-usa-api.${_bd}}"
                export HUB_KC_URL="${HUB_KC_URL:-https://${_ep}-usa-idp.${_bd}}"
                export HUB_OPAL_URL="${HUB_OPAL_URL:-https://${_ep}-usa-opal.${_bd}}"
                export HUB_VAULT_URL="${HUB_VAULT_URL:-https://${_ep}-usa-vault.${_bd}}"
            else
                export HUB_API_URL="${HUB_API_URL:-https://${HUB_EXTERNAL_ADDRESS}:4000}"
                export HUB_KC_URL="${HUB_KC_URL:-https://${HUB_EXTERNAL_ADDRESS}:8443}"
                export HUB_OPAL_URL="${HUB_OPAL_URL:-https://${HUB_EXTERNAL_ADDRESS}:7002}"
                export HUB_VAULT_URL="${HUB_VAULT_URL:-https://${HUB_EXTERNAL_ADDRESS}:8200}"
            fi
        else
            log_error "No Hub infrastructure detected (local or remote)"
            echo ""
            echo "  SOLUTION:"
            echo "    1. Deploy the Hub first: ./dive hub deploy"
            echo "    2. Wait for Hub to be healthy: ./dive hub status"
            echo "    3. Then deploy spokes: ./dive spoke deploy $instance_code"
            echo "    OR: Set HUB_EXTERNAL_ADDRESS=<hub-ip> for remote Hub"
            echo ""

            if type orch_record_error &>/dev/null; then
                orch_record_error "$SPOKE_ERROR_HUB_NOT_FOUND" "$ORCH_SEVERITY_CRITICAL" \
                    "Hub infrastructure not detected" "preflight" \
                    "$(spoke_error_get_remediation $SPOKE_ERROR_HUB_NOT_FOUND $instance_code)"
            fi
            return 1
        fi
    else
        export DEPLOYMENT_MODE="${DEPLOYMENT_MODE:-local}"
        log_success "Hub infrastructure detected ($hub_containers containers)"
    fi

    # =========================================================================
    # Step 2: Load Hub configuration
    # =========================================================================
    if [ "${DEPLOYMENT_MODE}" = "remote" ]; then
        # Remote mode: Hub config comes from env vars injected by remote-exec
        log_verbose "Remote mode — Hub config from environment (HUB_API_URL=${HUB_API_URL:-unset})"
    else
        # Local mode: Load from .env.hub on same machine
        local env_hub="${DIVE_ROOT}/.env.hub"
        if [ -f "$env_hub" ]; then
            log_verbose "Loading Hub configuration from .env.hub"
            local _val
            for _key in KEYCLOAK_ADMIN_PASSWORD VAULT_ROLE_ID VAULT_SECRET_ID CERT_PROVIDER SECRETS_PROVIDER DIVE_DOMAIN_SUFFIX OPAL_AUTH_MASTER_TOKEN; do
                _val=$(grep "^${_key}=" "$env_hub" 2>/dev/null | cut -d= -f2- || true)
                if [ -n "$_val" ] && [ -z "${!_key:-}" ]; then
                    export "$_key=$_val"
                    log_verbose "  Auto-discovered $_key from .env.hub"
                fi
            done
        else
            log_warn "No .env.hub found — Hub configuration may be incomplete"
        fi
    fi

    # =========================================================================
    # Step 3: Verify Vault health (critical for certs + secrets)
    # =========================================================================
    log_verbose "Checking Vault health..."

    if [ "${DEPLOYMENT_MODE}" = "remote" ]; then
        # Remote mode: check Vault via public URL
        local vault_url="${HUB_VAULT_URL:-}"
        if [ -n "$vault_url" ]; then
            if curl -skf --max-time 5 "${vault_url}/v1/sys/health" >/dev/null 2>&1; then
                log_success "Hub Vault healthy (via ${vault_url})"
            else
                log_warn "Hub Vault at ${vault_url} not responding (certs may use alternative source)"
            fi
        else
            log_warn "No HUB_VAULT_URL set — skipping remote Vault check"
        fi
    else
        # Local mode: use vault CLI
        if [ -z "${VAULT_ADDR:-}" ]; then
            if [ -f "${DIVE_ROOT}/scripts/dive-modules/vault/module.sh" ]; then
                source "${DIVE_ROOT}/scripts/dive-modules/vault/module.sh" 2>/dev/null || true
            fi
        fi

        local vault_token_file="${DIVE_ROOT}/.vault-token"
        if [ -f "$vault_token_file" ]; then
            VAULT_TOKEN=$(cat "$vault_token_file")
            export VAULT_TOKEN
            log_verbose "  Loaded Vault token from .vault-token"
        fi

        local vault_healthy=false
        if type _vault_check_unsealed &>/dev/null; then
            if _vault_check_unsealed; then
                vault_healthy=true
            fi
        else
            if command -v vault &>/dev/null; then
                for _try in 1 2; do
                    if vault status 2>/dev/null | grep -q "Sealed.*false"; then
                        vault_healthy=true
                        break
                    fi
                    if [ "$_try" -eq 1 ] && [ -n "${VAULT_CACERT:-}" ]; then
                        unset VAULT_CACERT
                        export VAULT_SKIP_VERIFY=1
                    fi
                done
            fi
        fi

        if [ "$vault_healthy" = "true" ]; then
            log_success "Hub Vault unsealed and healthy"
        else
            log_error "Hub Vault is sealed or unreachable"
            echo ""
            echo "  SOLUTION:"
            echo "    1. Check Vault status: ./dive vault status"
            echo "    2. Unseal if needed:   ./dive vault unseal"
            echo "    3. Then retry:         ./dive spoke deploy $instance_code"
            echo ""
            return 1
        fi
    fi

    # =========================================================================
    # Step 4: Verify Keycloak health
    # =========================================================================
    if [ "${DEPLOYMENT_MODE}" = "remote" ]; then
        local kc_url="${HUB_KC_URL:-}"
        if [ -n "$kc_url" ] && curl -skf --max-time 5 "${kc_url}/health/ready" >/dev/null 2>&1; then
            log_success "Hub Keycloak healthy (via ${kc_url})"
        else
            log_warn "Hub Keycloak at ${kc_url} not responding (may still be starting)"
        fi
    else
        local hub_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${hub_kc_container}$"; then
            if curl -skf --max-time 5 "https://localhost:8443/health/ready" >/dev/null 2>&1; then
                log_success "Hub Keycloak healthy"
            else
                log_warn "Hub Keycloak container running but health check failed (may still be starting)"
            fi
        else
            log_warn "Hub Keycloak not detected - federation setup may fail"
        fi
    fi

    # =========================================================================
    # Step 5: Verify Backend API health
    # =========================================================================
    if [ "${DEPLOYMENT_MODE}" = "remote" ]; then
        local api_url="${HUB_API_URL:-}"
        if [ -n "$api_url" ] && curl -skf --max-time 5 "${api_url}/api/health" >/dev/null 2>&1; then
            log_success "Hub Backend API healthy (via ${api_url})"
        else
            log_warn "Hub Backend API at ${api_url} not responding (may still be starting)"
        fi
    else
        if curl -skf --max-time 5 "https://localhost:4000/api/health" >/dev/null 2>&1; then
            log_success "Hub Backend API healthy"
        else
            log_warn "Hub Backend API not responding (may still be starting)"
        fi
    fi

    # =========================================================================
    # Step 6: Verify OPAL server
    # =========================================================================
    if [ "${DEPLOYMENT_MODE}" = "remote" ]; then
        local opal_url="${HUB_OPAL_URL:-}"
        if [ -n "$opal_url" ]; then
            log_success "Hub OPAL server configured (${opal_url})"
        else
            log_warn "HUB_OPAL_URL not set — OPAL sync may not work"
        fi
    else
        if ! docker ps -q --filter "name=dive-hub-opal-server" 2>/dev/null | grep -q .; then
            log_error "Hub OPAL server not running - required for spoke federation"

            if type orch_record_error &>/dev/null; then
                orch_record_error "$SPOKE_ERROR_HUB_UNHEALTHY" "$ORCH_SEVERITY_CRITICAL" \
                    "Hub OPAL server not running" "preflight" \
                    "$(spoke_error_get_remediation $SPOKE_ERROR_HUB_UNHEALTHY $instance_code)"
            fi
            return 1
        fi
        log_success "Hub OPAL server available"
    fi

    log_success "Hub auto-discovery complete (mode: ${DEPLOYMENT_MODE}) — all critical services healthy"
    return 0
}

# =============================================================================
# NETWORK SETUP
# =============================================================================

##
# Ensure the shared federation network exists
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_preflight_ensure_network() {
    log_step "Ensuring federation network exists..."

    # Remote mode: no dive-shared network needed (all traffic via HTTPS)
    if [ "${DEPLOYMENT_MODE:-local}" = "remote" ]; then
        log_info "Remote deployment — skipping dive-shared network (cross-instance via HTTPS)"
        return 0
    fi

    local network_name="dive-shared"

    if docker network ls --format '{{.Name}}' | grep -q "^${network_name}$"; then
        log_success "Federation network exists: $network_name"
        return 0
    fi

    log_info "Creating federation network: $network_name"

    if docker network create "$network_name" 2>/dev/null; then
        log_success "Federation network created: $network_name"
        return 0
    else
        log_error "Failed to create federation network"

        if type orch_record_error &>/dev/null; then
            orch_record_error "$SPOKE_ERROR_NETWORK_SETUP" "$ORCH_SEVERITY_CRITICAL" \
                "Failed to create Docker network $network_name" "preflight" \
                "$(spoke_error_get_remediation $SPOKE_ERROR_NETWORK_SETUP)"
        fi
        return 1
    fi
}

##
# Configure Hub hostname resolution for the spoke
#
# Arguments:
#   $1 - Instance code
##
spoke_preflight_configure_hub_connectivity() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local env_file="${DIVE_ROOT}/instances/${code_lower}/.env"

    # Hub connectivity is handled through Docker networks (dive-shared)
    # Containers communicate using container names

    if [ -f "$env_file" ]; then
        # Ensure HUB_IDP_URL is set
        if ! grep -q "^HUB_IDP_URL=" "$env_file"; then
            echo "HUB_IDP_URL=https://hub.dive25.com:8443" >> "$env_file"
            log_verbose "Added HUB_IDP_URL to .env"
        fi

        # Ensure HUB_OPAL_URL is set
        if ! grep -q "^HUB_OPAL_URL=" "$env_file"; then
            echo "HUB_OPAL_URL=https://hub.dive25.com:8080" >> "$env_file"
            log_verbose "Added HUB_OPAL_URL to .env"
        fi
    fi

    log_verbose "Hub connectivity configured via dive-shared network"
}

# =============================================================================
# CONTAINER CLEANUP
# =============================================================================

##
# Clean up stale/orphaned containers before deployment
#
# Arguments:
#   $1 - Instance code
##
spoke_preflight_cleanup_stale_containers() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_verbose "Cleaning up stale containers for $code_lower..."

    # Get all containers matching this spoke (running or stopped)
    local all_containers
    all_containers=$(docker ps -a --format '{{.Names}}' | grep "dive-spoke-${code_lower}-" 2>/dev/null || true)

    if [ -n "$all_containers" ]; then
        for container in $all_containers; do
            local container_status
            container_status=$(docker inspect "$container" --format '{{.State.Status}}' 2>/dev/null)

            # Remove if exited, dead, or orphaned
            if [[ "$container_status" == "exited" ]] || [[ "$container_status" == "dead" ]]; then
                log_verbose "Removing stopped container: $container"
                if ! docker rm -f "$container" 2>/dev/null; then
                    log_verbose "Could not remove $container (may not exist or be in use)"
                fi
            else
                # Check if container's network still exists
                local expected_network="${code_lower}_dive-${code_lower}-network"
                if ! docker network inspect "$expected_network" >/dev/null 2>&1; then
                    # Check if on dive-shared network
                    local on_shared
                    on_shared=$(docker inspect "$container" --format '{{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}' 2>/dev/null)

                    if [ -z "$on_shared" ]; then
                        log_verbose "Removing orphaned container (no network): $container"
                        if ! docker rm -f "$container" 2>/dev/null; then
                            log_verbose "Could not remove $container (may be in use)"
                        fi
                    fi
                fi
            fi
        done
    fi

    # Clean up containers stuck in "Created" state
    # Phase 1 Sprint 1.2: Use dynamic service discovery
    local services=($(spoke_get_service_order "$instance_code" 2>/dev/null || echo "frontend backend redis keycloak postgres mongodb opa kas opal-client"))
    for service in ${services[@]}; do
        local container="dive-spoke-${code_lower}-${service}"
        if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
            local status
            status=$(docker inspect "$container" --format '{{.State.Status}}' 2>/dev/null)
            if [[ "$status" != "running" ]]; then
                log_verbose "Removing non-running container: $container ($status)"
                if ! docker rm -f "$container" 2>/dev/null; then
                    log_verbose "Could not remove $container (may be in use)"
                fi
            fi
        fi
    done

    log_verbose "Stale container cleanup complete"
}

# =============================================================================
# SECRET CHANGE DETECTION AND VOLUME CLEANUP
# =============================================================================

##
# Check if secrets have changed since last deployment
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   "true" if secrets changed, "false" otherwise
##
spoke_preflight_check_secret_changes() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    # Check if secret hash file exists
    local secret_hash_file="$spoke_dir/.secret-hash"

    if [ ! -f "$secret_hash_file" ]; then
        # No previous hash - assume changed
        spoke_preflight_save_secret_hash "$instance_code"
        echo "true"
        return 0
    fi

    # Calculate current secret hash
    local current_hash
    current_hash=$(spoke_preflight_calculate_secret_hash "$instance_code")

    # Compare with saved hash
    local saved_hash
    saved_hash=$(cat "$secret_hash_file" 2>/dev/null || echo "")

    if [ "$current_hash" != "$saved_hash" ]; then
        log_info "Secrets have changed (hash mismatch)"
        spoke_preflight_save_secret_hash "$instance_code"
        echo "true"
    else
        log_verbose "Secrets unchanged"
        echo "false"
    fi
}

##
# Calculate hash of current secrets
##
spoke_preflight_calculate_secret_hash() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")

    # Concatenate all secret values and hash
    local secrets_concat=""
    for secret in "POSTGRES_PASSWORD" "MONGO_PASSWORD" "REDIS_PASSWORD" "KEYCLOAK_ADMIN_PASSWORD"; do
        local var_name="${secret}_${code_upper}"
        local value="${!var_name}"
        secrets_concat="${secrets_concat}${value}"
    done

    if command -v md5sum &>/dev/null; then
        echo -n "$secrets_concat" | md5sum | cut -d' ' -f1
    elif command -v md5 &>/dev/null; then
        echo -n "$secrets_concat" | md5 -q
    else
        # Last resort: use cksum (available on all POSIX systems)
        echo -n "$secrets_concat" | cksum | cut -d' ' -f1
    fi
}

##
# Save current secret hash
##
spoke_preflight_save_secret_hash() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    mkdir -p "$spoke_dir"
    spoke_preflight_calculate_secret_hash "$instance_code" > "$spoke_dir/.secret-hash"
}

##
# Clean database volumes when secrets change
#
# Arguments:
#   $1 - Instance code
##
spoke_preflight_clean_database_volumes() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_step "Cleaning database volumes due to secret change..."

    # Stop containers first
    local containers=("dive-spoke-${code_lower}-postgres" "dive-spoke-${code_lower}-mongodb" "dive-spoke-${code_lower}-redis")

    for container in "${containers[@]}"; do
        if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
            log_verbose "Stopping $container"
            docker stop "$container" 2>/dev/null || log_verbose "Could not stop $container"
            docker rm "$container" 2>/dev/null || log_verbose "Could not remove $container"
        fi
    done

    # Remove database volumes
    local project_name="dive-spoke-${code_lower}"
    local volumes=(
        "${project_name}_postgres_data"
        "${project_name}_mongodb_data"
        "${project_name}_mongodb_config"
        "${project_name}_redis_data"
    )

    for volume in "${volumes[@]}"; do
        if docker volume ls --format '{{.Name}}' | grep -q "^${volume}$"; then
            log_verbose "Removing volume: $volume"
            if ! docker volume rm "$volume" 2>/dev/null; then
                log_verbose "Could not remove volume $volume (may be in use by running container)"
            fi
        fi
    done

    log_success "Database volumes cleaned - containers will initialize with new passwords"
}

export SPOKE_PHASE_PREFLIGHT_LOADED=1
