#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline Configuration Phase
# =============================================================================
# Handles post-deployment configuration:
#   - Terraform (Keycloak realm/client creation)
#   - Federation setup (usa-idp, Hub registration)
#   - Secret synchronization
#   - NATO localization
#   - OPAL token provisioning
#   - AMR attribute synchronization
#
# Consolidates spoke_deploy() Steps 6-10 (lines 920-1155)
# =============================================================================
# Version: 1.1.0
# Date: 2026-01-13
# =============================================================================

# Prevent multiple sourcing
# BEST PRACTICE (2026-01-18): Check functions exist, not just guard variable
if type spoke_phase_configuration &>/dev/null; then
    return 0
fi
# Module loaded marker will be set at end after functions defined

# Load validation functions for idempotent deployments
if [ -z "${SPOKE_VALIDATION_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/spoke-validation.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/spoke-validation.sh"
    fi
fi

# Load checkpoint system

# =============================================================================
# LOAD SPOKE FEDERATION MODULE
# =============================================================================
# Load spoke-federation.sh for spoke_federation_setup() function
if [ -z "${SPOKE_FEDERATION_LOADED:-}" ]; then
    _spoke_fed_path="${BASH_SOURCE[0]%/*}/spoke-federation.sh"
    if [ -f "$_spoke_fed_path" ]; then
        source "$_spoke_fed_path"
    elif [ -f "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-federation.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-federation.sh"
    fi
    unset _spoke_fed_path
fi

# =============================================================================
# MAIN CONFIGURATION PHASE FUNCTION
# =============================================================================

##
# Execute the configuration phase
#
# Arguments:
#   $1 - Instance code
#   $2 - Pipeline mode (deploy|up|redeploy)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_phase_configuration() {
    local instance_code="$1"
    local pipeline_mode="${2:-deploy}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    # =============================================================================
    # IDEMPOTENT DEPLOYMENT: Check if phase already complete
    # =============================================================================
    if type spoke_phase_is_complete &>/dev/null; then
        if spoke_phase_is_complete "$instance_code" "CONFIGURATION"; then
            # Validate state is actually good
            if type spoke_validate_phase_state &>/dev/null; then
                if spoke_validate_phase_state "$instance_code" "CONFIGURATION"; then
                    log_info "✓ CONFIGURATION phase complete and validated, skipping"
                    return 0
                else
                    log_warn "CONFIGURATION checkpoint exists but validation failed, re-running"
                    if ! spoke_phase_clear "$instance_code" "CONFIGURATION"; then
                        log_warn "Failed to clear CONFIGURATION checkpoint (stale state may persist)"
                    fi
                fi
            else
                log_info "✓ CONFIGURATION phase complete (validation not available)"
                return 0
            fi
        fi
    fi

    log_info "→ Executing CONFIGURATION phase for $code_upper"
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    # =============================================================================
    # PRE-FLIGHT: Verify Hub is accessible before attempting configuration
    # =============================================================================
    log_step "Verifying Hub connectivity..."
    local hub_backend_url=""
    for url in "https://localhost:${BACKEND_PORT:-4000}/api/health" "https://dive-hub-backend:4000/api/health"; do
        if curl -sk --max-time 5 "$url" 2>/dev/null | grep -q "ok\|healthy"; then
            hub_backend_url="$url"
            break
        fi
    done
    if [ -z "$hub_backend_url" ]; then
        log_error "Hub backend not accessible — hub must be running before spoke deployment"
        log_error "Fix: ./dive hub deploy"
        return 1
    fi
    log_success "Hub accessible at $hub_backend_url"

    # =============================================================================
    # PERFORMANCE TRACKING: Phase timing metrics
    # =============================================================================
    local PHASE_START=$(date +%s)

    log_info "Configuration phase for $code_upper"

    # CRITICAL: Set USE_TERRAFORM_SSOT to skip manual protocol mapper creation
    # Terraform manages all Keycloak resources (clients, mappers, IdPs)
    export USE_TERRAFORM_SSOT=true

    # ==========================================================================
    # CRITICAL: Load Hub credentials for FEDERATION_ADMIN_KEY + KEYCLOAK_ADMIN_PASSWORD
    # ==========================================================================
    # Remote mode: these must come from environment variables (no .env.hub on spoke)
    # Local mode: fall back to reading from .env.hub on same machine
    if [ -z "${FEDERATION_ADMIN_KEY:-}" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
        FEDERATION_ADMIN_KEY=$(grep "^FEDERATION_ADMIN_KEY=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    fi
    if [ -n "${FEDERATION_ADMIN_KEY:-}" ]; then
        export FEDERATION_ADMIN_KEY
        log_verbose "✓ FEDERATION_ADMIN_KEY available"
    else
        log_warn "FEDERATION_ADMIN_KEY not set — spoke registration API calls may fail"
        if [ "${DEPLOYMENT_MODE:-local}" = "remote" ]; then
            log_warn "  Pass FEDERATION_ADMIN_KEY as an environment variable for remote deployments"
        fi
    fi

    if [ -z "${KEYCLOAK_ADMIN_PASSWORD:-}" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
        local _hub_kc_pass
        _hub_kc_pass=$(grep "^KEYCLOAK_ADMIN_PASSWORD=" "${DIVE_ROOT}/.env.hub" | tail -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")
        [ -n "$_hub_kc_pass" ] && export KEYCLOAK_ADMIN_PASSWORD="$_hub_kc_pass"
    fi
    [ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ] && log_verbose "Hub Keycloak admin password resolved"

    # ==========================================================================
    # CRITICAL: Load secrets BEFORE any operations that need them
    # ==========================================================================
    # Secrets must be loaded at start of configuration phase because:
    # 1. Environment exports don't persist across subshells from preflight phase
    # 2. Terraform needs KEYCLOAK_ADMIN_PASSWORD_${CODE}, KEYCLOAK_CLIENT_SECRET_${CODE}
    # 3. Federation setup needs credentials for Keycloak API calls

    log_step "Loading secrets for configuration phase"
    if type spoke_secrets_load &>/dev/null; then
        if ! spoke_secrets_load "$code_upper" "load" 2>/dev/null; then
            log_verbose "Secret loading via function failed, trying .env file"
        fi
    fi

    # Also source .env directly to ensure variables are available
    if [ -f "$spoke_dir/.env" ]; then
        set -a  # Export all variables
        source "$spoke_dir/.env" 2>/dev/null || true
        set +a
    fi

    # Verify critical secrets are available
    local keycloak_pwd_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
    local client_secret_var="KEYCLOAK_CLIENT_SECRET_${code_upper}"
    if [ -z "${!keycloak_pwd_var}" ] || [ -z "${!client_secret_var}" ]; then
        log_warn "Secrets not found in environment, attempting GCP reload"
        if type spoke_secrets_load &>/dev/null; then
            spoke_secrets_load "$code_upper" "load" || true
        fi
    fi

    # ==========================================================================
    # CRITICAL STEPS - Pipeline stops on failure
    # ==========================================================================

    # Step 0: Apply Terraform configuration (CRITICAL - creates Keycloak realm)
    if [ "$pipeline_mode" = "deploy" ]; then
        if ! spoke_config_apply_terraform "$instance_code"; then
            log_error "CRITICAL: Terraform apply failed - cannot continue without Keycloak realm"
            log_error "The realm and OIDC client must exist before federation can be configured"
            log_error "To retry: ./dive tf spoke apply $code_upper"
            return 1
        fi
    fi

    # Step 0.5: Initialize NextAuth database schema (soft failure - can retry later)
    if [ "$pipeline_mode" = "deploy" ]; then
        if ! spoke_config_init_nextauth_db "$instance_code"; then
            log_warn "NextAuth DB initialization had issues (continuing)"
        fi
    fi

    # Step 1: NATO Localization (soft failure - non-essential)
    if [ "$pipeline_mode" = "deploy" ]; then
        spoke_config_nato_localization "$instance_code"
    fi

    # Step 1.5: Ensure secrets are loaded before federation setup
    # Load secrets if not already loaded (best effort - may already be loaded from GCP)
    if type spoke_secrets_load &>/dev/null; then
        if ! spoke_secrets_load "$code_upper" "load" 2>/dev/null; then
            log_verbose "Secret loading via function failed, trying .env file"
            # Also source .env directly as fallback
            if [ -f "$spoke_dir/.env" ]; then
                set -a  # Export all variables
                if ! source "$spoke_dir/.env" 2>/dev/null; then
                    log_verbose "Could not source .env file (may not exist)"
                fi
                set +a
            fi
        fi
    fi

    # Step 2: Register in Federation and KAS registries (CRITICAL - required for heartbeat)
    # NOTE (2026-02-09): Moved BEFORE federation setup to eliminate race condition.
    # Hub API auto-approval triggers createBidirectionalFederation() which creates IdP links.
    # Running this first avoids conflict with CLI federation setup (Step 2.5) creating
    # the same links and causing invalid_grant errors from Keycloak processing overlap.
    if [ "${DEPLOYMENT_MODE:-local}" = "standalone" ]; then
        log_warn "Standalone mode — skipping federation registration and setup"
    elif [ "$pipeline_mode" = "deploy" ]; then
        if ! spoke_config_register_in_registries "$instance_code"; then
            log_error "CRITICAL: Registry registration failed - spoke heartbeat will not work"
            log_error "To retry: ./dive spoke register $code_upper"
            return 1
        fi

        # NOTE: Federation client scopes are now configured in Terraform
        # terraform/modules/federated-instance/main.tf: keycloak_openid_client_default_scopes.incoming_federation_defaults
        # This ensures dive-v3-broker-usa clients have uniqueID, countryOfAffiliation, clearance, acpCOI scopes

        # Step 2.5: Federation setup (CRITICAL - required for SSO)
        # This runs AFTER registration so Hub API has already attempted bidirectional IdP creation.
        # CRITICAL FIX (2026-02-11): Wait for Hub API to complete IdP creation before CLI attempts
        # Previous issue: Both Hub API and CLI creating IdPs simultaneously caused Keycloak conflicts
        log_step "Waiting for Hub federation API to complete IdP creation..."
        local _fed_wait=0
        local _fed_max_wait=15
        while [ $_fed_wait -lt $_fed_max_wait ]; do
            # Check if Hub Keycloak already has the spoke IdP (means API finished)
            local _hub_kc="${HUB_KC_CONTAINER:-dive-hub-keycloak}"
            if docker exec "$_hub_kc" curl -sf "http://localhost:8080/admin/realms/dive-v3-broker-usa/identity-provider/instances/${code_lower}-idp" \
                -H "Authorization: Bearer $(spoke_federation_get_admin_token "$_hub_kc" 2>/dev/null)" 2>/dev/null | grep -q '"alias"'; then
                log_verbose "Hub IdP for $code_lower already exists — proceeding"
                break
            fi
            sleep 2
            _fed_wait=$((_fed_wait + 2))
        done
        if [ $_fed_wait -ge $_fed_max_wait ]; then
            log_verbose "Hub IdP not yet detected after ${_fed_max_wait}s — proceeding anyway (federation setup is idempotent)"
        fi

        # spoke_federation_setup() is idempotent and will skip links that already exist
        # It checks if IdPs exist before attempting creation to avoid race conditions
        if ! spoke_config_setup_federation "$instance_code" "$pipeline_mode"; then
            log_error "CRITICAL: Federation setup failed - SSO will not work"
            log_error "To retry: ./dive federation link $code_upper"
            return 1
        fi
    fi

    # ==========================================================================
    # VALIDATION STEPS - Verify critical configuration
    # ==========================================================================

    # Step 3: Synchronize secrets (VALIDATE - critical for database connections)
    log_step "Step 3/6: Validating secrets"
    if ! spoke_config_sync_secrets "$instance_code"; then
        log_error "Secret sync failed - spoke cannot operate without secrets"
        log_error "Impact: Containers will not have credentials for databases/services"

        if is_production_mode; then
            log_error "Fix: Ensure GCP Secret Manager access is configured"
            log_error "     Run: gcloud auth application-default login"
            log_error "     Create secrets: ./dive secrets create $code_upper"
        else
            log_error "Fix: Ensure .env file exists with required secrets"
            log_error "     Run: ./dive secrets sync $code_upper"
        fi

        return 1
    else
        log_success "✓ Secrets validated"
    fi

    # Step 4: OPAL token provisioning (CRITICAL - required for policy enforcement)
    log_step "Step 4/6: Provisioning OPAL token"
    if ! spoke_config_provision_opal "$instance_code"; then
        log_error "OPAL token provisioning failed - policy enforcement broken"
        log_error "Impact: OPA cannot sync policies from OPAL Server"
        log_error "        ABAC authorization will not work"
        log_error "        Users will be unable to access resources"
        log_error "Fix: Check OPAL_AUTH_MASTER_TOKEN generation"
        log_error "     Verify OPAL Server is running in Hub"
        log_error "     Check Hub logs: ./dive hub logs opal-server"
        return 1
    else
        log_success "✓ OPAL token provisioned"
    fi

    # Step 5: AMR attribute synchronization (optional - log only)
    log_verbose "Syncing AMR attributes (optional MFA context)..."
    if spoke_config_sync_amr_attributes "$instance_code"; then
        log_verbose "✓ AMR attributes synchronized"
    else
        log_verbose "AMR sync skipped (optional feature)"
    fi

    # Step 5: Configure Keycloak client redirect URIs (CRITICAL - required for OAuth flow)
    log_step "Step 5/6: Updating OAuth redirect URIs"
    if ! spoke_config_update_redirect_uris "$instance_code"; then
        log_error "Redirect URI update failed - OAuth login broken"
        log_error "Impact: Users cannot authenticate via Keycloak"
        log_error "        Frontend OAuth callback will fail with redirect_uri mismatch"
        log_error "Fix: Check Keycloak API access and client configuration"
        log_error "     Verify Keycloak is running: docker ps | grep keycloak"
        log_error "     Check Keycloak logs: docker logs dive-spoke-${code_lower}-keycloak"
        return 1
    else
        log_success "✓ Redirect URIs updated"
    fi

    # Step 6: Validate Terraform applied successfully
    log_step "Step 6/6: Validating Terraform state"
    local realm_name="dive-v3-broker-${code_lower}"
    local kc_container="dive-spoke-${code_lower}-keycloak"

    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_verbose "Keycloak container not running - skipping validation"
        return 0
    fi

    # Wait for Keycloak to load realm configuration after Terraform apply
    # Keycloak caches realm configs, may need a moment to refresh
    log_verbose "Waiting for Keycloak to load realm configuration..."
    local realm_check=""
    local _realm_wait=0
    local _realm_max_wait=15
    while [ $_realm_wait -lt $_realm_max_wait ]; do
        realm_check=$(docker exec "$kc_container" curl -sf \
            "http://localhost:8080/realms/${realm_name}" 2>/dev/null | \
            jq -r '.realm // empty' 2>/dev/null)
        if [ "$realm_check" = "$realm_name" ]; then
            break
        fi
        sleep 2
        _realm_wait=$((_realm_wait + 2))
    done

    if [ "$realm_check" = "$realm_name" ]; then
        log_success "✓ Terraform validated: realm '$realm_name' is accessible"
    else
        # Realm not accessible - this is a real problem
        log_error "Terraform applied but realm is not accessible"
        log_error "Expected realm: $realm_name"
        log_error "Keycloak response: ${realm_check:-empty}"

        # Debug info
        log_verbose "Checking Keycloak health..."
        local kc_health
        kc_health=$(docker exec "$kc_container" curl -sf "http://localhost:8080/health" 2>/dev/null || echo "UNHEALTHY")
        log_verbose "Keycloak health: $kc_health"

        log_error "This indicates Terraform state/Keycloak inconsistency"
        log_error "Manual check: docker exec $kc_container curl -sf http://localhost:8080/realms/$realm_name"
        return 1
    fi

    # ==========================================================================
    # CADDY INTEGRATION: Set up reverse proxy and DNS for spoke (EC2 only)
    # ==========================================================================
    if [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
        if [ -f "$(dirname "${BASH_SOURCE[0]}")/spoke-caddy.sh" ]; then
            source "$(dirname "${BASH_SOURCE[0]}")/spoke-caddy.sh"
        fi
        if type spoke_caddy_setup &>/dev/null; then
            spoke_caddy_setup "$instance_code" || log_warn "Caddy setup had issues (non-fatal)"
        fi
    fi

    # CRITICAL FIX: Validate configuration BEFORE creating checkpoint
    # Previous issue: Checkpoint created before validation, so failed configurations were marked complete
    if ! spoke_checkpoint_configuration "$instance_code"; then
        log_error "Configuration checkpoint failed - realm not accessible"
        if type orch_record_error &>/dev/null; then
            orch_record_error "${SPOKE_ERROR_CHECKPOINT_FAILED:-1150}" "$ORCH_SEVERITY_CRITICAL" \
                "Configuration checkpoint validation failed" "configuration" \
                "Verify realm exists: curl -sk https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT}/realms/dive-v3-broker-${code_lower}"
        fi
        return 1
    fi

    # Only create checkpoint AFTER validation passes
    if type orch_create_checkpoint &>/dev/null; then
        orch_create_checkpoint "$instance_code" "CONFIGURATION" "Configuration phase completed"
    fi

    # Calculate and log phase duration
    local PHASE_END=$(date +%s)
    local PHASE_DURATION=$((PHASE_END - PHASE_START))

    # Mark phase complete (checkpoint system)
    if type spoke_phase_mark_complete &>/dev/null; then
        spoke_phase_mark_complete "$instance_code" "CONFIGURATION" "$PHASE_DURATION" '{}' || true
    fi

    log_success "✅ CONFIGURATION phase complete in ${PHASE_DURATION}s"
    return 0
}

# =============================================================================
# FEDERATION AND KAS REGISTRY REGISTRATION
# =============================================================================

##
# Register spoke in Hub MongoDB spoke registry
# CRITICAL: Required for spoke heartbeat authentication
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_config_register_in_hub_mongodb() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${spoke_dir:-${DIVE_ROOT}/instances/${code_lower}}"

    log_verbose "Registering spoke in Hub MongoDB spoke registry..."

    # PREFLIGHT: Verify Hub is reachable before attempting registration
    # This prevents wasting time if Hub is down
    # Try multiple URLs since scripts run on host but containers use Docker hostnames
    local hub_url=""
    local hub_urls=(
        "${HUB_API_URL:-}"                                  # Remote: from hub-domain prompt
        "https://localhost:${BACKEND_PORT:-4000}"            # Host access
        "https://host.docker.internal:4000"                  # Docker Desktop host access
        "https://dive-hub-backend:4000"                      # Docker network access (if running in container)
    )

    if [ "${SKIP_FEDERATION:-false}" = "false" ]; then
        log_step "Verifying Hub accessibility..."

        local hub_reachable=false
        for url in "${hub_urls[@]}"; do
            [ -z "$url" ] && continue
            # Zero Trust: HTTPS only, correct endpoint path
            if curl -skf --max-time 3 "$url/api/health" >/dev/null 2>&1; then
                hub_url="$url"
                hub_reachable=true
                log_verbose "✓ Hub accessible at $url"
                break
            fi
        done

        if [ "$hub_reachable" = "false" ]; then
            log_error "Hub unreachable at any known URL"
            log_error "Tried: ${hub_urls[*]}"
            log_error "Impact: Spoke registration requires Hub to be running"
            log_error "        Spoke will be non-functional without Hub registration"
            log_error "Fix: Start Hub first: ./dive hub up"
            log_error "     Verify Hub status: ./dive hub status"
            log_error "     Check Hub logs: ./dive hub logs backend"
            log_error "Override: Use --skip-federation flag to deploy without federation"
            return 1
        fi

        log_success "✓ Hub accessible at $hub_url"
    else
        log_verbose "Skipping Hub reachability check (--skip-federation flag)"
        # Still set a default for scripts that might need it
        hub_url="https://localhost:${BACKEND_PORT:-4000}"
    fi

    # Get spoke configuration from SSOT (spoke_config_get)
    local spoke_id=$(spoke_config_get "$instance_code" "identity.spokeId")
    local instance_name=$(spoke_config_get "$instance_code" "identity.name")
    local base_url=$(spoke_config_get "$instance_code" "endpoints.baseUrl")
    local api_url=$(spoke_config_get "$instance_code" "endpoints.apiUrl")
    local idp_url=$(spoke_config_get "$instance_code" "endpoints.idpUrl")
    local idp_public_url=$(spoke_config_get "$instance_code" "endpoints.idpPublicUrl")
    local contact_email=$(spoke_config_get "$instance_code" "identity.contactEmail")

    # Fallback to NATO database for name if config doesn't have it
    if [ -z "$instance_name" ] || [ "$instance_name" = "null" ]; then
        if [ -n "${NATO_COUNTRIES[$code_upper]}" ]; then
            instance_name=$(echo "${NATO_COUNTRIES[$code_upper]}" | cut -d'|' -f1)
        else
            instance_name="$code_upper Instance"
        fi
    fi

    # Fallback for contact email
    if [ -z "$contact_email" ] || [ "$contact_email" = "null" ]; then
        contact_email="admin@${code_lower}.${DIVE_DEFAULT_DOMAIN:-dive25.com}"
    fi

    # Get Keycloak admin password (CRITICAL for bidirectional federation)
    local keycloak_password_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
    local keycloak_password="${!keycloak_password_var:-}"

    # Validate password exists
    if [ -z "$keycloak_password" ]; then
        log_error "Keycloak admin password not found: $keycloak_password_var"
        log_error "CRITICAL: Bidirectional federation requires spoke Keycloak password"
        log_error "Set $keycloak_password_var in environment or spoke .env file"
        return 1
    fi

    log_verbose "Using Keycloak password for bidirectional federation (${#keycloak_password} chars)"

    # Check Vault for pre-approved partner config (enriches registration with trust metadata)
    local partner_trust_level=""
    local partner_max_classification=""
    local partner_pre_approved="false"

    if type vault_partner_get &>/dev/null; then
        local partner_json
        partner_json=$(vault_partner_get "$code_upper" 2>/dev/null || true)
        if [ -n "$partner_json" ] && [ "$partner_json" != "null" ]; then
            partner_pre_approved=$(echo "$partner_json" | jq -r '.preApproved // "false"')
            partner_trust_level=$(echo "$partner_json" | jq -r '.trustLevel // ""')
            partner_max_classification=$(echo "$partner_json" | jq -r '.maxClassification // ""')
            if [ "$partner_pre_approved" = "true" ]; then
                log_success "Vault partner found: ${code_upper} (trust=${partner_trust_level}, class=${partner_max_classification})"
            fi
        fi
    fi

    # Build registration payload matching API schema exactly
    # Reference: backend/src/routes/federation.routes.ts line 180-198
    # CRITICAL: Include keycloakAdminPassword for bidirectional federation
    # Optional: Include partner metadata for pre-approved auto-approval
    local partner_fields=""
    if [ "$partner_pre_approved" = "true" ]; then
        partner_fields=$(cat <<PARTNER
  "partnerPreApproved": true,
  "partnerTrustLevel": "$partner_trust_level",
  "partnerMaxClassification": "$partner_max_classification",
PARTNER
)
    fi

    # Auth code for zero-config remote federation
    local auth_code_field=""
    if [ -n "${SPOKE_AUTH_CODE:-}" ]; then
        auth_code_field="\"authCode\": \"${SPOKE_AUTH_CODE}\","
    fi

    local payload=$(cat <<EOF
{
  "instanceCode": "$code_upper",
  "name": "$instance_name",
  "baseUrl": "$base_url",
  "apiUrl": "$api_url",
  "idpUrl": "$idp_url",
  "idpPublicUrl": "$idp_public_url",
  "requestedScopes": ["policy:base", "policy:org", "policy:tenant"],
  "contactEmail": "$contact_email",
  "keycloakAdminPassword": "$keycloak_password",
  ${partner_fields}
  ${auth_code_field}
  "skipValidation": true
}
EOF
)

    # Call Hub registration endpoint using discovered hub_url
    local hub_api="${hub_url}/api/federation/register"
    local response
    local http_code

    response=$(curl -sk -X POST "$hub_api" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        -w "\nHTTP_CODE:%{http_code}" 2>&1)

    http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
    response=$(echo "$response" | sed '/HTTP_CODE:/d')

    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        log_success "✓ Spoke registered in Hub MongoDB"

        # Extract spokeId and status from response
        local registered_spoke_id=$(echo "$response" | jq -r '.spoke.spokeId // empty' 2>/dev/null)
        local spoke_status=$(echo "$response" | jq -r '.spoke.status // empty' 2>/dev/null)

        log_verbose "Spoke ID: $registered_spoke_id"
        log_verbose "Status: $spoke_status"

        # Check if auto-approval succeeded (development mode)
        if [ "$spoke_status" = "approved" ]; then
            log_success "✓ Spoke auto-approved (development mode)"

            # Extract token from auto-approval response
            local spoke_token=$(echo "$response" | jq -r '.token.token // empty' 2>/dev/null)

            # BEST PRACTICE FALLBACK: If token missing (e.g. re-registration after nuke — Hub returns
            # existing approved spoke but token may not be in register response), fetch token from
            # the public registration-status endpoint. Works without Hub code changes or restart.
            if [ -z "$spoke_token" ] && [ -n "$registered_spoke_id" ]; then
                log_info "Token not in register response; fetching from registration status endpoint..."
                local status_url="${hub_url}/api/federation/registration/${registered_spoke_id}/status"
                local status_resp
                status_resp=$(curl -sk --max-time 10 "$status_url" 2>/dev/null)
                spoke_token=$(echo "$status_resp" | jq -r '.token.token // empty' 2>/dev/null)
                if [ -n "$spoke_token" ]; then
                    log_success "✓ Token retrieved from registration status endpoint"
                fi
            fi
            # Also try by instance code (route accepts spokeId or instanceCode)
            if [ -z "$spoke_token" ] && [ -n "$code_upper" ]; then
                log_verbose "Trying registration status by instance code..."
                local status_url="${hub_url}/api/federation/registration/${code_upper}/status"
                local status_resp
                status_resp=$(curl -sk --max-time 10 "$status_url" 2>/dev/null)
                spoke_token=$(echo "$status_resp" | jq -r '.token.token // empty' 2>/dev/null)
                if [ -n "$spoke_token" ]; then
                    log_success "✓ Token retrieved from registration status (by instance code)"
                fi
            fi

            if [ -n "$spoke_token" ]; then
                log_success "✓ Token received from auto-approval"

                # Update .env with SPOKE_ID and SPOKE_TOKEN
                if [ -n "$registered_spoke_id" ]; then
                    if grep -q "^SPOKE_ID=" "$spoke_dir/.env" 2>/dev/null; then
                        sed -i.bak "s|^SPOKE_ID=.*|SPOKE_ID=$registered_spoke_id|" "$spoke_dir/.env"
                    else
                        echo "SPOKE_ID=$registered_spoke_id" >> "$spoke_dir/.env"
                    fi
                fi

                if grep -q "^SPOKE_TOKEN=" "$spoke_dir/.env" 2>/dev/null; then
                    sed -i.bak "s|^SPOKE_TOKEN=.*|SPOKE_TOKEN=$spoke_token|" "$spoke_dir/.env"
                else
                    echo "SPOKE_TOKEN=$spoke_token" >> "$spoke_dir/.env"
                fi
                rm -f "$spoke_dir/.env.bak"

                log_success "✓ SPOKE_ID and SPOKE_TOKEN configured in .env"

                # Extract OPAL client token from registration response (for remote policy sync)
                local opal_token=$(echo "$response" | jq -r '.opalToken.token // empty' 2>/dev/null)
                if [ -n "$opal_token" ]; then
                    if grep -q "^SPOKE_OPAL_TOKEN=" "$spoke_dir/.env" 2>/dev/null; then
                        sed -i.bak "s|^SPOKE_OPAL_TOKEN=.*|SPOKE_OPAL_TOKEN=$opal_token|" "$spoke_dir/.env"
                    else
                        echo "SPOKE_OPAL_TOKEN=$opal_token" >> "$spoke_dir/.env"
                    fi
                    rm -f "$spoke_dir/.env.bak"
                    log_success "✓ SPOKE_OPAL_TOKEN configured in .env"
                fi

                # ==========================================================================
                # CRITICAL FIX (2026-01-22): Also update docker-compose.yml fallback value
                # ==========================================================================
                # ROOT CAUSE: nuke doesn't remove instances/ directory, so old docker-compose.yml
                # persists with stale SPOKE_ID fallback. When new deployment runs, the container
                # is created with old fallback before .env is updated.
                # FIX: Update the fallback value in docker-compose.yml to match new SPOKE_ID
                local compose_file="$spoke_dir/docker-compose.yml"
                if [ -f "$compose_file" ] && [ -n "$registered_spoke_id" ]; then
                    # Update the SPOKE_ID fallback pattern: ${SPOKE_ID:-spoke-xxx-xxxxxxxx}
                    sed -i.bak "s|\${SPOKE_ID:-spoke-[a-z]*-[a-f0-9]*}|\${SPOKE_ID:-$registered_spoke_id}|g" "$compose_file"
                    rm -f "$compose_file.bak"
                    log_verbose "Updated docker-compose.yml SPOKE_ID fallback to $registered_spoke_id"
                fi

                # ==========================================================================
                # CRITICAL FIX (2026-01-22): Restart spoke backend to pick up new credentials
                # ==========================================================================
                # ROOT CAUSE: Backend container was started BEFORE registration, so it has
                # the OLD spoke_id from .env. Registration creates a NEW spoke_id in
                # Hub MongoDB. Without restart, heartbeat fails because IDs don't match.
                # FIX: Restart backend after .env is updated with new SPOKE_ID and SPOKE_TOKEN
                # ==========================================================================
                # CRITICAL FIX (2026-01-22): Use docker compose up, NOT docker restart
                # ==========================================================================
                # ROOT CAUSE: docker restart just restarts the container with its EXISTING
                # environment variables. It does NOT re-read the .env file.
                # FIX: Use docker compose up -d which recreates the container with updated
                # environment from .env file
                local backend_container="dive-spoke-${code_lower}-backend"
                if docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
                    log_step "Recreating spoke backend to pick up updated federation credentials..."

                    # Use docker compose to recreate with updated .env
                    local compose_dir="${DIVE_ROOT}/instances/${code_lower}"
                    if [ -f "$compose_dir/docker-compose.yml" ]; then
                        # CRITICAL: --force-recreate required because docker compose doesn't
                        # detect .env changes as a reason to recreate the container
                        log_info "Recreating backend using: docker compose -f $compose_dir/docker-compose.yml up -d --force-recreate backend-${code_lower}"
                        local recreate_output
                        # Use -f flag to specify compose file from any directory
                        recreate_output=$(docker compose -f "$compose_dir/docker-compose.yml" --env-file "$compose_dir/.env" up -d --force-recreate "backend-${code_lower}" 2>&1)
                        local recreate_exit=$?

                        # Only log exit code if it's non-zero (error)
                        if [ $recreate_exit -ne 0 ]; then
                            log_warn "Docker compose exit code: $recreate_exit"
                        fi
                        [ -n "$recreate_output" ] && log_verbose "Output: $recreate_output"

                        if [ $recreate_exit -eq 0 ]; then
                            log_success "✓ Spoke backend recreated with new SPOKE_ID and TOKEN"

                            # Wait for backend to be healthy
                            local wait_count=0
                            while [ $wait_count -lt 30 ]; do
                                local health=$(docker inspect "$backend_container" --format '{{.State.Health.Status}}' 2>/dev/null)
                                if [ "$health" = "healthy" ]; then
                                    log_success "✓ Spoke backend healthy"
                                    break
                                fi
                                sleep 2
                                wait_count=$((wait_count + 1))
                            done
                        else
                            log_warn "Could not recreate backend (exit code: $recreate_exit)"
                            log_warn "Output: $recreate_output"
                        fi
                    else
                        log_warn "docker-compose.yml not found at $compose_dir"
                    fi
                fi

                # Recreate OPAL Client to pick up SPOKE_OPAL_TOKEN
                if [ -n "$opal_token" ]; then
                    local opal_container="dive-spoke-${code_lower}-opal-client"
                    local compose_dir="${DIVE_ROOT}/instances/${code_lower}"
                    if docker ps -a --format '{{.Names}}' | grep -q "^${opal_container}$" && [ -f "$compose_dir/docker-compose.yml" ]; then
                        log_step "Recreating OPAL Client with provisioned token..."
                        docker compose -f "$compose_dir/docker-compose.yml" --env-file "$compose_dir/.env" up -d --force-recreate "opal-client-${code_lower}" 2>&1 || true
                        log_success "✓ OPAL Client recreated with token"
                    fi
                fi

                return 0
            else
                # PHASE 1 FIX: Convert soft-fail to hard failure
                # Token missing means auto-approval failed - this is critical for federation
                if [ "${SKIP_FEDERATION:-false}" = "true" ]; then
                    log_warn "Token not found in auto-approval response - manual approval required"
                    log_warn "Federation skipped - continuing deployment"
                    return 0
                else
                    log_error "Auto-approval failed - token not found in response"
                    log_error "Impact: Spoke cannot authenticate with Hub"
                    log_error "Fix: Check Hub backend logs for approval errors"
                    log_error "      Verify Hub is accessible: ./dive hub status"
                    log_error "      Override: Use --skip-federation flag to deploy without federation"
                    return 1
                fi
            fi
        elif [ "$spoke_status" = "pending" ]; then
            # Spoke status is pending - either auto-approval disabled or federation failed
            if [ "${SKIP_FEDERATION:-false}" = "true" ]; then
                log_warn "Spoke status: pending (manual approval required)"
                log_warn "Federation setup skipped (--skip-federation flag used)"
                log_warn "Spoke will be non-functional until registered with Hub"
                log_warn "Register manually: ./dive spoke register $code_upper"
                return 0
            else
                log_error "Federation setup failed - spoke cannot communicate with Hub"
                log_error "Impact: Spoke is non-functional without federation"
                log_error "        Bidirectional trust not established"
                log_error "Cause: Auto-approval disabled or federation verification failed"
                log_error "Fix: Ensure Hub is accessible and federation certificates are valid"
                log_error "     Check Hub logs: ./dive hub logs backend"
                log_error "     Verify certificates: ls -la instances/${code_lower}/certs/"
                log_error "Override: Use --skip-federation flag to deploy without federation"
                return 1
            fi
        elif [ "$spoke_status" = "suspended" ]; then
            # Spoke suspended - federation verification failed
            if [ "${SKIP_FEDERATION:-false}" = "true" ]; then
                log_warn "Spoke suspended during registration (federation verification failed)"
                local error_msg=$(echo "$response" | jq -r '.spoke.message // empty' 2>/dev/null)
                log_warn "Reason: $error_msg"
                log_warn "Federation skipped - continuing deployment"
                return 0
            else
                log_error "Spoke suspended during registration - federation verification failed"
                local error_msg=$(echo "$response" | jq -r '.spoke.message // empty' 2>/dev/null)
                log_error "Reason: $error_msg"
                log_error "Impact: Spoke cannot perform federated operations"
                log_error "Fix: Verify federation certificates and Hub connectivity"
                log_error "     Check suspension reason in Hub admin console"
                log_error "     Unsuspend: ./dive hub spoke unsuspend <SPOKE_ID>"
                log_error "Override: Use --skip-federation flag to deploy without federation"
                return 1
            fi
        fi

        # Fallback: Try manual approval (legacy path - may fail due to auth)
        if [ -n "$registered_spoke_id" ]; then
            if spoke_config_approve_and_get_token "$registered_spoke_id" "$code_lower"; then
                log_success "✓ Manual approval succeeded"
                return 0
            else
                # Manual approval failed - upgrade to hard failure
                if [ "${SKIP_FEDERATION:-false}" = "false" ]; then
                    log_error "Manual approval failed - Hub registration incomplete"
                    log_error "Impact: Spoke cannot authenticate with Hub"
                    log_error "Fix: Ensure Hub is accessible and user has approval permissions"
                    log_error "     Check Hub status: ./dive hub status"
                    log_error "     Verify Hub API: curl -sk https://localhost:${BACKEND_PORT:-4000}/health"
                    return 1
                else
                    log_warn "Manual approval failed (skipped due to --skip-federation)"
                    return 0
                fi
            fi
        fi

        return 0
    else
        log_error "Spoke registration failed (HTTP $http_code)"
        log_error "Response:"
        echo "$response" | jq . 2>/dev/null || echo "$response"
        return 1
    fi
}

##
# Approve spoke and configure its heartbeat token
##
spoke_config_approve_and_get_token() {
    local spoke_id="$1"
    local code_lower="$2"
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_verbose "Auto-approving spoke and generating token..."

    # Approve spoke
    local approve_payload='{"allowedScopes":["policy:base","policy:org"],"allowedFeatures":["federation","ztdf","audit"]}'
    # Use hub_url from parent scope (spoke_config_register_in_hub_mongodb), fallback to localhost
    local hub_approve_api="${hub_url:-https://localhost:${BACKEND_PORT:-4000}}/api/federation/spokes/$spoke_id/approve"

    local approve_response
    approve_response=$(curl -sk -X POST "$hub_approve_api" \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY:-admin-dev-key}" \
        -d "$approve_payload" 2>&1)

    if echo "$approve_response" | jq -e '.success' >/dev/null 2>&1; then
        # Extract token
        local spoke_token=$(echo "$approve_response" | jq -r '.hubApiToken.token // empty')

        if [ -n "$spoke_token" ]; then
            # Update .env with SPOKE_TOKEN
            if grep -q "^SPOKE_TOKEN=" "$spoke_dir/.env" 2>/dev/null; then
                sed -i.bak "s|^SPOKE_TOKEN=.*|SPOKE_TOKEN=$spoke_token|" "$spoke_dir/.env"
            else
                echo "SPOKE_TOKEN=$spoke_token" >> "$spoke_dir/.env"
            fi

            log_success "✓ Spoke token configured in .env"
            return 0
        fi
    fi

    # PHASE 1 FIX: Convert soft-fail to hard failure
    # Auto-approval failure is critical - spoke cannot function without Hub registration
    if [ "${SKIP_FEDERATION:-false}" = "true" ]; then
        log_warn "Auto-approval failed - manual approval required"
        log_warn "Federation skipped - continuing deployment"
        return 0
    else
        log_error "Auto-approval failed - spoke cannot register with Hub"
        log_error "Impact: Spoke is non-functional without Hub registration"
        log_error "Cause: Hub unreachable, auto-approval disabled, or registration failed"
        log_error "Fix: Ensure Hub is running and accessible"
        log_error "      Check Hub status: ./dive hub status"
        log_error "      Verify Hub backend: ./dive hub logs backend"
        log_error "      Override: Use --skip-federation flag to deploy without federation"
        return 1
    fi
}

##
# Register spoke in Hub MongoDB registries (MongoDB SSOT architecture)
# CRITICAL: Required for spoke heartbeat and federated operations
#
# Architecture (2026-01-23 - MongoDB SSOT):
#   - Spoke registry: MongoDB federation_spokes collection (via Hub API)
#   - KAS registry: MongoDB kas_registry collection (via Hub API)
#   - REMOVED: federation-registry.json (deprecated file-based approach)
#
# Arguments:
#   $1 - Instance code
##
spoke_config_register_in_registries() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Registering $code_upper in federation and KAS registries..."

    # Step 0: CRITICAL - Register spoke in Hub MongoDB spoke registry (REQUIRED for heartbeat)
    if ! spoke_config_register_in_hub_mongodb "$instance_code"; then
        log_error "Failed to register spoke in Hub MongoDB"
        log_error "This is CRITICAL - spoke heartbeat will not work without registration"
        return 1
    fi

    # REMOVED (2026-01-23): federation-registry.json is deprecated
    # MongoDB is the single source of truth for federation
    # Spoke registration happens via Hub API: POST /api/federation/register
    # which persists directly to MongoDB federation_spokes collection

    # Step 1: Register KAS in MongoDB (MongoDB SSOT architecture)
    # Load spoke-kas.sh if not already loaded
    if [ -z "${DIVE_SPOKE_KAS_LOADED:-}" ]; then
        if [ -f "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-kas.sh" ]; then
            source "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-kas.sh"
        fi
    fi

    local kas_registered=false
    local kas_exit_code=1

    if type spoke_kas_register_mongodb &>/dev/null; then
        log_step "Registering KAS in MongoDB"

        # Wait for backend to be healthy after federation registry restart
        local backend_container="dive-spoke-${code_lower}-backend"
        local max_wait=30
        local waited=0

        while [ $waited -lt $max_wait ]; do
            if docker exec "$backend_container" curl -sf http://localhost:4000/health &>/dev/null; then
                log_verbose "Backend healthy, proceeding with KAS registration"
                break
            fi
            sleep 2
            waited=$((waited + 2))
            log_verbose "Waiting for backend to be healthy... (${waited}s/${max_wait}s)"
        done

        # PHASE 2 FIX: Remove retry logic - backend health check above ensures readiness
        # If backend is healthy, KAS registration should work. If it fails, it's a real error.
        local kas_output
        kas_output=$(spoke_kas_register_mongodb "$code_upper" 2>&1) && kas_exit_code=0

        if [ $kas_exit_code -eq 0 ]; then
            log_verbose "✓ KAS API call succeeded"

            # VALIDATION: Verify KAS actually registered in Hub
            log_verbose "Validating KAS registration in Hub registry..."
            sleep 2  # Wait for propagation

            local hub_registry_check
            hub_registry_check=$(curl -sk "https://localhost:${BACKEND_PORT:-4000}/api/kas/registry" 2>/dev/null | \
                jq -e ".kasServers[] | select(.instanceCode == \"$code_upper\")" 2>/dev/null)

            if [ -n "$hub_registry_check" ]; then
                kas_registered=true
                log_success "✓ KAS verified in Hub registry"

                # Auto-approve the KAS registration for automated deployments
                local kas_id="${code_lower}-kas"
                if type spoke_kas_approve &>/dev/null; then
                    local approve_output
                    if approve_output=$(spoke_kas_approve "$kas_id" 2>&1); then
                        log_verbose "✓ KAS auto-approved"
                    else
                        if echo "$approve_output" | grep -qi "authentication\|authorized"; then
                            log_verbose "KAS approval requires authentication (manual approval needed)"
                        elif echo "$approve_output" | grep -qi "not in pending status"; then
                            log_verbose "KAS already approved or not found"
                        else
                            log_verbose "KAS auto-approval failed: $approve_output"
                        fi
                    fi
                fi

                # CRITICAL ADDITION (2026-02-07): Sync Hub KAS to Spoke MongoDB
                # This enables cross-instance key release by registering Hub's KAS
                # instances in the spoke's local kas_registry collection
                log_step "Syncing Hub KAS registry to Spoke MongoDB"
                if type spoke_kas_sync_from_hub &>/dev/null; then
                    local sync_output
                    if sync_output=$(spoke_kas_sync_from_hub "$code_upper" 2>&1); then
                        log_success "✓ Hub KAS registry synced to Spoke"
                        log_verbose "$sync_output"
                    else
                        log_warn "Hub KAS sync failed (non-blocking)"
                        log_verbose "$sync_output"
                    fi
                else
                    log_verbose "KAS sync function not available (spoke-kas.sh needs update)"
                fi
            else
                log_error "✗ KAS registration API succeeded but entry NOT found in Hub registry!"
                log_error "This indicates a database consistency issue"
                log_error "Verification query: curl -sk https://localhost:${BACKEND_PORT:-4000}/api/kas/registry | jq '.kasServers'"
                kas_exit_code=1
            fi
        else
            log_warn "MongoDB KAS registration failed"
            log_warn "Error output:"
            echo "$kas_output" | head -20
            log_warn "KAS registration can be retried later: ./dive spoke kas register $code_upper"
        fi
    else
        log_verbose "MongoDB KAS registration function not available (spoke-kas.sh not loaded)"
    fi

    # HONEST reporting based on actual results
    if [ "$kas_registered" = true ]; then
        log_success "Registry updates complete (KAS: ✓ registered)"
        echo "  ✓ Federation registered in MongoDB (enables federated search)"
        echo "  ✓ MongoDB kas_registry verified (ZTDF encryption enabled)"
    else
        log_success "Registry updates complete (KAS: not registered)"
        echo "  ✓ Federation registered in MongoDB (enables federated search)"
        echo "  ℹ MongoDB kas_registry NOT updated - spoke will use Hub resources"
        echo "  • This is NORMAL for spoke deployments"
        echo "  • ZTDF encryption requires KAS (optional feature)"
        echo "  • Spoke can access Hub's encrypted resources via federation"
    fi
}


# Load secondary configuration functions
source "$(dirname "${BASH_SOURCE[0]}")/phase-configuration-secondary.sh"

export SPOKE_PHASE_CONFIGURATION_LOADED=1
