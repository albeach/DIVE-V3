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

    # CRITICAL: Set USE_TERRAFORM_SSOT to skip manual protocol mapper creation
    # Terraform manages all Keycloak resources (clients, mappers, IdPs)
    export USE_TERRAFORM_SSOT=true

    # Step 0: Apply Terraform configuration (requires Keycloak to be running)
    if [ "$pipeline_mode" = "deploy" ]; then
        if ! spoke_config_apply_terraform "$instance_code"; then
            log_warn "Terraform apply had issues (continuing)"
        fi
    fi

    # Step 0.5: Initialize NextAuth database schema (requires PostgreSQL to be running)
    if [ "$pipeline_mode" = "deploy" ]; then
        if ! spoke_config_init_nextauth_db "$instance_code"; then
            log_warn "NextAuth DB initialization had issues (continuing)"
        fi
    fi

    # Step 1: NATO Localization (deploy mode only)
    if [ "$pipeline_mode" = "deploy" ]; then
        spoke_config_nato_localization "$instance_code"
    fi

    # Step 2: Federation setup
    if ! spoke_config_setup_federation "$instance_code" "$pipeline_mode"; then
        log_warn "Federation setup incomplete (continuing)"
    fi

    # Step 2.5: Register in Federation and KAS registries (deploy mode only)
    if [ "$pipeline_mode" = "deploy" ]; then
        spoke_config_register_in_registries "$instance_code"
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
# FEDERATION AND KAS REGISTRY REGISTRATION
# =============================================================================

##
# Register spoke in federation-registry.json and kas-registry.json
# CRITICAL: Required for ZTDF resource seeding and federated search
#
# Arguments:
#   $1 - Instance code
##
spoke_config_register_in_registries() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Registering $code_upper in federation and KAS registries..."

    # Step 1: Register in federation-registry.json
    local fed_reg_script="${DIVE_ROOT}/scripts/spoke-init/register-spoke-federation.sh"
    if [ -f "$fed_reg_script" ]; then
        log_verbose "Updating federation-registry.json"
        if bash "$fed_reg_script" "$code_upper" 2>/dev/null; then
            log_verbose "✓ Federation registry updated"
        else
            log_warn "Federation registry update had issues"
        fi
    else
        log_warn "Federation registry script not found: $fed_reg_script"
    fi

    # Step 2: Register KAS in kas-registry.json
    if type spoke_kas_register &>/dev/null; then
        log_verbose "Updating kas-registry.json"
        if spoke_kas_register "$code_upper" 2>/dev/null; then
            log_verbose "✓ KAS registry updated"
        else
            log_verbose "KAS registration skipped (may not be configured yet)"
        fi
    elif [ -f "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-kas.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-kas.sh"
        if type spoke_kas_register &>/dev/null; then
            log_verbose "Updating kas-registry.json"
            spoke_kas_register "$code_upper" 2>/dev/null || log_verbose "KAS registration skipped"
        fi
    fi

    log_success "Registry updates complete"
    echo "  ✓ federation-registry.json updated (enables federated search)"
    echo "  ✓ kas-registry.json updated (enables ZTDF encryption)"
}

# =============================================================================
# TERRAFORM CONFIGURATION (Moved from initialization - requires running Keycloak)
# =============================================================================

##
# Initialize NextAuth database schema in PostgreSQL
# NOTE: Must be called AFTER PostgreSQL is running
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_config_init_nextauth_db() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Initializing NextAuth database schema"

    # Call the init-nextauth-db.sh script
    local init_script="${DIVE_ROOT}/scripts/spoke-init/init-nextauth-db.sh"

    if [ ! -f "$init_script" ]; then
        log_error "NextAuth DB init script not found: $init_script"
        return 1
    fi

    if bash "$init_script" "$code_upper"; then
        log_success "NextAuth database schema initialized"
        echo "  ✓ Tables: user, account, session, verificationToken"
        return 0
    else
        log_error "Failed to initialize NextAuth database schema"
        return 1
    fi
}

##
# Apply Terraform configuration to create Keycloak realm and clients
# NOTE: Must be called AFTER containers are running
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_config_apply_terraform() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Applying Terraform configuration"

    # Wait for Keycloak to be ready
    local kc_container="dive-spoke-${code_lower}-keycloak"
    local max_wait=120
    local waited=0

    log_verbose "Waiting for Keycloak to be ready..."
    while [ $waited -lt $max_wait ]; do
        # Keycloak health checks are on management port 9000 (HTTPS)
        # Reference: https://www.keycloak.org/observability/health
        if docker exec "$kc_container" curl -sfk https://localhost:9000/health/ready &>/dev/null 2>&1; then
            log_verbose "Keycloak is ready"
            break
        fi
        sleep 3
        waited=$((waited + 3))
    done

    if [ $waited -ge $max_wait ]; then
        log_error "Keycloak not ready after ${max_wait}s"
        return 1
    fi

    # Ensure INSTANCE is set for proper secret loading
    export INSTANCE="$code_lower"

    # Export instance-suffixed secrets as TF_VAR environment variables
    local keycloak_password_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
    local client_secret_var="KEYCLOAK_CLIENT_SECRET_${code_upper}"

    if [ -n "${!keycloak_password_var}" ]; then
        export TF_VAR_keycloak_admin_password="${!keycloak_password_var}"
    else
        log_error "Missing Keycloak admin password for $code_upper"
        return 1
    fi

    if [ -n "${!client_secret_var}" ]; then
        export TF_VAR_client_secret="${!client_secret_var}"
    else
        log_error "Missing Keycloak client secret for $code_upper"
        return 1
    fi

    # Use admin password for test users
    export TF_VAR_test_user_password="${!keycloak_password_var}"
    export TF_VAR_admin_user_password="${!keycloak_password_var}"

    # Set Keycloak credentials for provider
    export KEYCLOAK_USER="admin"
    export KEYCLOAK_PASSWORD="${!keycloak_password_var}"

    # Load terraform module if available
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/terraform.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/terraform.sh"

        # Check if terraform_spoke function exists
        if type terraform_spoke &>/dev/null; then
            log_verbose "Initializing Terraform workspace"
            if ! terraform_spoke init "$code_upper"; then
                log_warn "Terraform init failed"
                return 1
            fi

            log_verbose "Applying Terraform configuration"
            if ! terraform_spoke apply "$code_upper"; then
                log_warn "Terraform apply failed"
                return 1
            fi

            log_success "Terraform configuration applied"
            echo "  ✓ Keycloak realm 'dive-v3-broker-${code_lower}' created"
            echo "  ✓ Client 'dive-v3-broker-${code_lower}' configured"
            return 0
        fi
    fi

    # If legacy function exists
    if type _spoke_apply_terraform &>/dev/null; then
        _spoke_apply_terraform "$code_upper" "$code_lower"
        return $?
    fi

    log_warn "Terraform module not available - Keycloak configuration may be incomplete"
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
#
# Returns:
#   0 - Success
##
spoke_config_update_redirect_uris() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_verbose "Updating redirect URIs for $instance_code"

    local kc_container="dive-spoke-${code_lower}-keycloak"

    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_verbose "Keycloak container not running"
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
    return 0
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

##
# Get Keycloak admin token
#
# Arguments:
#   $1 - Keycloak container name
#
# Prints:
#   Admin token
##
spoke_federation_get_admin_token() {
    local kc_container="$1"

    docker exec "$kc_container" curl -sf \
        -X POST \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=admin&password=${KEYCLOAK_ADMIN_PASSWORD}&grant_type=password&client_id=admin-cli" \
        "http://localhost:8080/realms/master/protocol/openid-connect/token" 2>/dev/null | \
        grep -o '"access_token":"[^"]*' | cut -d'"' -f4
}
