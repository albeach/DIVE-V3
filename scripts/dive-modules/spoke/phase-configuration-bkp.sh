#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline Configuration Phase
# =============================================================================
# Handles post-deployment configuration:
#   - Federation setup (usa-idp, Hub registration)
#   - Secret synchronization
#   - NATO localization
#   - OPAL token provisioning
#   - AMR attribute synchronization
#
# Consolidates spoke_deploy() Steps 6-10 (lines 920-1155)
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# Prevent multiple sourcing
if [ -n "$SPOKE_PHASE_CONFIGURATION_LOADED" ]; then
    return 0
fi
export SPOKE_PHASE_CONFIGURATION_LOADED=1

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
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_info "Configuration phase for $code_upper"

    # Step 1: NATO Localization (deploy mode only)
    if [ "$pipeline_mode" = "deploy" ]; then
        spoke_config_nato_localization "$instance_code"
    fi

    # Step 2: Federation setup
    if ! spoke_config_setup_federation "$instance_code" "$pipeline_mode"; then
        log_warn "Federation setup incomplete (continuing)"
    fi

    # Step 3: Synchronize secrets
    spoke_config_sync_secrets "$instance_code"

    # Step 4: OPAL token provisioning
    spoke_config_provision_opal "$instance_code"

    # Step 5: AMR attribute synchronization
    spoke_config_sync_amr_attributes "$instance_code"

    # Step 6: Configure Keycloak client redirect URIs
    spoke_config_update_redirect_uris "$instance_code"

    # Create configuration checkpoint
    if type orch_create_checkpoint &>/dev/null; then
        orch_create_checkpoint "$instance_code" "CONFIGURATION" "Configuration phase completed"
    fi

    log_success "Configuration phase complete"
    return 0
}

# =============================================================================
# NATO LOCALIZATION
# =============================================================================

##
# Configure NATO-specific localization
#
# Arguments:
#   $1 - Instance code
##
spoke_config_nato_localization() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Configuring NATO localization for $code_upper..."

    # Load localization module if available
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/spoke/localization.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/spoke/localization.sh"

        if type configure_nato_localization &>/dev/null; then
            if configure_nato_localization "$code_upper"; then
                log_success "NATO localization configured"
                return 0
            fi
        fi
    fi

    # Fallback: Configure basic localization
    log_verbose "Configuring basic localization..."

    local kc_container="dive-spoke-${code_lower}-keycloak"

    # Check if Keycloak is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_verbose "Keycloak not running - skipping localization"
        return 0
    fi

    # Get admin token
    local admin_token
    admin_token=$(spoke_federation_get_admin_token "$kc_container")

    if [ -z "$admin_token" ]; then
        log_verbose "Cannot get admin token - skipping localization"
        return 0
    fi

    local realm_name="dive-v3-broker-${code_lower}"

    # Update realm display name with localized name
    local display_name
    if [ -n "${NATO_COUNTRIES[$code_upper]}" ]; then
        display_name="${NATO_COUNTRIES[$code_upper]} DIVE Portal"
    else
        display_name="$code_upper DIVE Portal"
    fi

    # Update realm
    docker exec "$kc_container" curl -sf \
        -X PUT \
        -H "Authorization: Bearer $admin_token" \
        -H "Content-Type: application/json" \
        -d "{\"displayName\":\"$display_name\"}" \
        "http://localhost:8080/admin/realms/${realm_name}" 2>/dev/null || true

    log_verbose "Basic localization configured"
}

# =============================================================================
# FEDERATION SETUP
# =============================================================================

##
# Setup federation configuration
#
# Arguments:
#   $1 - Instance code
#   $2 - Pipeline mode
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_config_setup_federation() {
    local instance_code="$1"
    local pipeline_mode="$2"

    local code_upper=$(upper "$instance_code")

    log_step "Configuring federation for $code_upper..."

    # Use spoke-federation.sh for complete federation setup
    if type spoke_federation_setup &>/dev/null; then
        spoke_federation_setup "$instance_code"
        return $?
    fi

    # Fallback: Use legacy federation functions
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/federation-setup.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/federation-setup.sh"

        if type configure_spoke_federation &>/dev/null; then
            configure_spoke_federation "$code_upper"
            return $?
        fi
    fi

    log_warn "Federation module not available"
    return 1
}

# =============================================================================
# SECRET SYNCHRONIZATION
# =============================================================================

##
# Synchronize all secrets between components
#
# Arguments:
#   $1 - Instance code
##
spoke_config_sync_secrets() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Synchronizing secrets for $code_upper..."

    # Use spoke-secrets.sh sync function
    if type spoke_secrets_sync &>/dev/null; then
        spoke_secrets_sync "$instance_code"
        return $?
    fi

    # Fallback: Manual sync steps

    # 1. Sync Keycloak client secret
    spoke_config_sync_keycloak_secret "$instance_code"

    # 2. Sync federation secrets with Hub
    spoke_config_sync_federation_secrets "$instance_code"

    log_verbose "Secret synchronization complete"
}

##
# Sync Keycloak client secret to .env
##
spoke_config_sync_keycloak_secret() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    local kc_container="dive-spoke-${code_lower}-keycloak"
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local env_file="$spoke_dir/.env"

    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        return 0
    fi

    # Get admin token
    local admin_token
    admin_token=$(spoke_federation_get_admin_token "$kc_container")

    if [ -z "$admin_token" ]; then
        return 0
    fi

    local realm_name="dive-v3-broker-${code_lower}"
    local client_id="dive-v3-broker-${code_lower}"

    # Get client UUID
    local client_uuid
    client_uuid=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $admin_token" \
        "http://localhost:8080/admin/realms/${realm_name}/clients?clientId=${client_id}" 2>/dev/null | \
        grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

    if [ -z "$client_uuid" ]; then
        return 0
    fi

    # Get client secret
    local client_secret
    client_secret=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $admin_token" \
        "http://localhost:8080/admin/realms/${realm_name}/clients/${client_uuid}/client-secret" 2>/dev/null | \
        grep -o '"value":"[^"]*' | cut -d'"' -f4)

    if [ -n "$client_secret" ]; then
        # Update .env file
        if [ -f "$env_file" ]; then
            sed -i.tmp "s|^KEYCLOAK_CLIENT_SECRET_${code_upper}=.*|KEYCLOAK_CLIENT_SECRET_${code_upper}=${client_secret}|" "$env_file"
            sed -i.tmp "s|^AUTH_KEYCLOAK_SECRET=.*|AUTH_KEYCLOAK_SECRET=${client_secret}|" "$env_file"
            rm -f "${env_file}.tmp"
        fi

        export "KEYCLOAK_CLIENT_SECRET_${code_upper}=${client_secret}"
        export "AUTH_KEYCLOAK_SECRET=${client_secret}"

        log_verbose "Keycloak client secret synchronized"
    fi
}

##
# Sync federation secrets between Hub and Spoke
##
spoke_config_sync_federation_secrets() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    # Check if Hub is running
    if ! docker ps --format '{{.Names}}' | grep -q "^dive-hub-keycloak$"; then
        log_verbose "Hub not running - skipping federation secret sync"
        return 0
    fi

    # Load federation sync module
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/env-sync.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/env-sync.sh"

        if type sync_hub_to_spoke_secrets &>/dev/null; then
            sync_hub_to_spoke_secrets "$(upper "$instance_code")" 2>/dev/null || true
        fi
    fi

    log_verbose "Federation secrets synchronized"
}

# =============================================================================
# OPAL TOKEN PROVISIONING
# =============================================================================

##
# Provision OPAL token for policy access
#
# Arguments:
#   $1 - Instance code
##
spoke_config_provision_opal() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Provisioning OPAL token for $code_upper..."

    # Use deployment module if available
    if type spoke_deployment_provision_opal_token &>/dev/null; then
        spoke_deployment_provision_opal_token "$instance_code"
        return $?
    fi

    # Check if Hub OPAL server is running
    if ! docker ps --format '{{.Names}}' | grep -q "dive-hub-opal-server"; then
        log_verbose "Hub OPAL server not running - skipping token provision"
        return 0
    fi

    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local env_file="$spoke_dir/.env"

    # Check if token already exists
    local existing_token
    existing_token=$(grep "^SPOKE_OPAL_TOKEN=" "$env_file" 2>/dev/null | cut -d= -f2)

    if [ -n "$existing_token" ] && [ "$existing_token" != "" ]; then
        log_verbose "OPAL token already exists"
        return 0
    fi

    log_warn "OPAL token not provisioned - manual provisioning may be required"
    return 0
}

# =============================================================================
# AMR ATTRIBUTE SYNCHRONIZATION
# =============================================================================

##
# Synchronize AMR attributes for MFA users
#
# Arguments:
#   $1 - Instance code
##
spoke_config_sync_amr_attributes() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_verbose "Synchronizing AMR attributes for $code_upper..."

    local kc_container="dive-spoke-${code_lower}-keycloak"

    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        return 0
    fi

    # Load AMR sync module if available
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/amr-sync.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/amr-sync.sh"

        if type sync_amr_attributes &>/dev/null; then
            sync_amr_attributes "$code_upper" 2>/dev/null || true
        fi
    fi

    log_verbose "AMR attributes synchronized"
}

# =============================================================================
# REDIRECT URI CONFIGURATION
# =============================================================================

##
# Update Keycloak client redirect URIs
#
# Arguments:
#   $1 - Instance code
##
spoke_config_update_redirect_uris() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Updating redirect URIs for $code_upper..."

    local kc_container="dive-spoke-${code_lower}-keycloak"

    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        return 0
    fi

    local admin_token
    admin_token=$(spoke_federation_get_admin_token "$kc_container")

    if [ -z "$admin_token" ]; then
        return 0
    fi

    local realm_name="dive-v3-broker-${code_lower}"
    local client_id="dive-v3-broker-${code_lower}"

    # Get client UUID
    local client_uuid
    client_uuid=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $admin_token" \
        "http://localhost:8080/admin/realms/${realm_name}/clients?clientId=${client_id}" 2>/dev/null | \
        grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

    if [ -z "$client_uuid" ]; then
        log_verbose "Client not found: $client_id"
        return 0
    fi

    # Get ports
    local frontend_port="${SPOKE_FRONTEND_PORT:-13000}"

    # Build redirect URIs
    local redirect_uris='["http://localhost:'$frontend_port'/*","https://localhost:'$frontend_port'/*","http://host.docker.internal:'$frontend_port'/*","https://'$code_lower'.dive25.com/*"]'
    local web_origins='["http://localhost:'$frontend_port'","https://localhost:'$frontend_port'","http://host.docker.internal:'$frontend_port'","https://'$code_lower'.dive25.com"]'

    # Update client
    docker exec "$kc_container" curl -sf \
        -X PUT \
        -H "Authorization: Bearer $admin_token" \
        -H "Content-Type: application/json" \
        -d "{\"redirectUris\":${redirect_uris},\"webOrigins\":${web_origins}}" \
        "http://localhost:8080/admin/realms/${realm_name}/clients/${client_uuid}" 2>/dev/null

    log_verbose "Redirect URIs updated"
}
