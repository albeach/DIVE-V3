#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Configuration Phase (Secondary Functions)
# =============================================================================
# Extracted from phase-configuration.sh (Phase 13d)
# Contains: NextAuth DB, Terraform, realm verify, localization, federation,
#   secrets sync, OPAL, AMR, redirect URIs, checkpoint validation
# =============================================================================

[ -n "${SPOKE_PHASE_CONFIGURATION_SECONDARY_LOADED:-}" ] && return 0

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

    # Use test user passwords following Hub pattern:
    # 1. Try TEST_USER_PASSWORD/ADMIN_PASSWORD env vars first
    # 2. Fall back to Keycloak admin password (same as Hub approach)
    export TF_VAR_test_user_password="${TEST_USER_PASSWORD:-${!keycloak_password_var}}"
    export TF_VAR_admin_user_password="${ADMIN_PASSWORD:-${!keycloak_password_var}}"

    # Set Keycloak credentials for provider
    export KEYCLOAK_USER="admin"
    export KEYCLOAK_PASSWORD="${!keycloak_password_var}"

    # Load terraform module if available
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/configuration/terraform.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/configuration/terraform.sh"

        # Check if terraform_spoke function exists
        if type terraform_spoke &>/dev/null; then
            log_verbose "Initializing Terraform workspace"
            if ! terraform_spoke init "$code_upper"; then
                log_error "Terraform initialization failed"
                log_error "Impact: Keycloak realm cannot be created/configured"
                log_error "        Spoke will be non-functional without Keycloak realm"
                log_error "Fix: Check Terraform installation: terraform --version"
                log_error "     Check Terraform module availability"
                log_error "     Check Terraform logs for specific error"
                return 1
            fi

            log_verbose "Applying Terraform configuration"

            # Wrap Terraform apply with retry + circuit breaker for resilience
            local terraform_success=false
            if type orch_retry_with_backoff &>/dev/null && type orch_circuit_breaker_execute &>/dev/null; then
                log_verbose "Using resilient Terraform apply (retry + circuit breaker)"
                if orch_retry_with_backoff "Terraform apply $code_upper" \
                    orch_circuit_breaker_execute "Terraform Keycloak API" \
                        terraform_spoke apply "$code_upper"; then
                    terraform_success=true
                fi
            else
                # Fallback to direct execution
                if terraform_spoke apply "$code_upper"; then
                    terraform_success=true
                fi
            fi

            if [ "$terraform_success" = false ]; then
                log_error "Terraform apply failed after retries"
                log_error "Check Keycloak logs: docker logs dive-spoke-${code_lower}-keycloak"
                return 1
            fi

            log_success "Terraform configuration applied"
            echo "  ✓ Keycloak realm 'dive-v3-broker-${code_lower}' created (Terraform)"
            echo "  ✓ Client 'dive-v3-broker-${code_lower}' configured (Terraform)"

            # CRITICAL: Verify realm actually exists and is accessible
            log_step "Verifying Terraform created realm successfully..."
            if ! spoke_config_verify_realm "$instance_code"; then
                log_error "CRITICAL: Realm verification FAILED"
                log_error "Terraform apply succeeded but realm is not accessible"
                log_error "This indicates Terraform state/Keycloak inconsistency"
                return 1
            fi

            return 0
        fi
    fi

    # If legacy function exists
    if type _spoke_apply_terraform &>/dev/null; then
        _spoke_apply_terraform "$code_upper" "$code_lower"
        return $?
    fi

    # Terraform module not available - this is a critical failure
    log_error "Terraform module not available - Keycloak configuration incomplete"
    log_error "Impact: Keycloak realm cannot be created"
    log_error "        Spoke will be non-functional without Keycloak realm"
    log_error "Fix: Ensure Terraform modules are properly installed"
    log_error "     Check: ${DIVE_ROOT}/scripts/dive-modules/configuration/terraform.sh"
    log_error "     Check: ${DIVE_ROOT}/terraform/spoke/ directory exists"
    return 1
}

# =============================================================================
# REALM VERIFICATION
# =============================================================================

##
# Verify spoke Keycloak realm exists and is accessible
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_config_verify_realm() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local realm="dive-v3-broker-${code_lower}"
    local kc_container="dive-spoke-${code_lower}-keycloak"

    log_verbose "Verifying realm '$realm' exists and is accessible..."

    # PHASE 2 FIX: Remove retry logic - use proper readiness check instead
    # If wait_for_keycloak_admin_api_ready() was called before this function,
    # Keycloak is ready and realm should be accessible immediately after Terraform.
    # If not ready, it's a real error, not a timing issue.

    # Check if realm is accessible via internal endpoint
    local realm_check
    realm_check=$(docker exec "$kc_container" curl -sf --max-time 5 \
        "http://localhost:8080/realms/${realm}" 2>/dev/null | \
        jq -r '.realm // empty' 2>/dev/null)

    if [ "$realm_check" = "$realm" ]; then
        log_success "✓ Realm '$realm' verified and accessible"
        return 0
    fi

    # Realm not accessible - this is a real error, not a timing issue
    log_error "Realm '$realm' not accessible"
    log_error ""
    log_error "This usually means:"
    log_error "  1. Terraform did not create the realm (check Terraform state)"
    log_error "  2. Keycloak is not fully initialized (should not happen if readiness check passed)"
    log_error "  3. Realm name mismatch (check Terraform configuration)"
    log_error ""
    log_error "Debug steps:"
    log_error "  1. Check realm exists: docker exec $kc_container curl -sf http://localhost:8080/realms/$realm | jq .realm"
    log_error "  2. Check Keycloak logs: docker logs $kc_container | tail -50"
    log_error "  3. Verify Terraform state: cd terraform/spoke && terraform show"
    log_error "  4. Verify Keycloak readiness: wait_for_keycloak_admin_api_ready() should be called before this"

    return 1
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

    # Configure basic localization
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
    # Ensure NATO countries database is loaded
    if [ -z "${NATO_COUNTRIES_LOADED:-}" ] || [ "${#NATO_COUNTRIES[@]}" -eq 0 ] 2>/dev/null; then
        local nato_db_path="${DIVE_ROOT}/scripts/nato-countries.sh"
        if [ -f "$nato_db_path" ]; then
            source "$nato_db_path" 2>/dev/null || true
        fi
    fi

    local display_name
    # Check if NATO_COUNTRIES array has our country (without re-declaring which resets it)
    if [ -n "${NATO_COUNTRIES[$code_upper]+_}" ] && [ -n "${NATO_COUNTRIES[$code_upper]:-}" ]; then
        # Extract country name (first field before |)
        local country_name=$(echo "${NATO_COUNTRIES[$code_upper]}" | cut -d'|' -f1)
        display_name="${country_name} DIVE Portal"
    else
        display_name="$code_upper DIVE Portal"
    fi

    # Update realm
    docker exec "$kc_container" curl -sf \
        -X PUT \
        -H "Authorization: Bearer $admin_token" \
        -H "Content-Type: application/json" \
        -d "{\"displayName\":\"$display_name\"}" \
        "http://localhost:8080/admin/realms/${realm_name}" 2>/dev/null || log_verbose "Could not update realm display name (non-critical)"

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

    # Fallback: Use consolidated federation module
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/federation/setup.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/federation/setup.sh"

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
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/configuration/env-sync.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/configuration/env-sync.sh"

        if type sync_hub_to_spoke_secrets &>/dev/null; then
            if ! sync_hub_to_spoke_secrets "$(upper "$instance_code")" 2>/dev/null; then
                log_verbose "Hub-to-spoke secret sync failed (may not be needed)"
            fi
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
            if ! sync_amr_attributes "$code_upper" 2>/dev/null; then
                log_verbose "AMR attribute sync failed (non-critical - optional MFA feature)"
            fi
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
        log_error "Keycloak container not running - cannot update redirect URIs"
        return 1
    fi

    local admin_token
    admin_token=$(spoke_federation_get_admin_token "$kc_container")

    if [ -z "$admin_token" ]; then
        log_error "Cannot get admin token for Keycloak - redirect URI update failed"
        return 1
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
        log_error "Client not found in Keycloak: $client_id"
        return 1
    fi

    # Get actual port from SSOT (nato-countries.sh via get_instance_ports)
    eval "$(get_instance_ports "$instance_code")"
    local frontend_port="${SPOKE_FRONTEND_PORT:-3000}"

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
# DEPRECATED (2026-01-18): Keycloak admin token function moved to spoke-federation.sh
# Use: spoke_federation_get_admin_token "container-name" "debug-mode"
##
# Use the enhanced version from spoke-federation.sh instead

# =============================================================================
# CHECKPOINT VALIDATION
# =============================================================================

##
# Validate configuration phase completed successfully
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Validation passed
#   1 - Validation failed
##
spoke_checkpoint_configuration() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_verbose "Validating configuration checkpoint for $instance_code"

    # Get port assignment from SSOT (get_instance_ports)
    local spoke_keycloak_port
    if type get_instance_ports &>/dev/null; then
        eval "$(get_instance_ports "$instance_code")"
        if [ -z "${SPOKE_KEYCLOAK_HTTPS_PORT:-}" ]; then
            log_error "get_instance_ports did not export SPOKE_KEYCLOAK_HTTPS_PORT"
            return 1
        fi
        spoke_keycloak_port="${SPOKE_KEYCLOAK_HTTPS_PORT}"
    else
        log_error "get_instance_ports function not available - cannot determine Keycloak port"
        log_error "Ensure common.sh is sourced properly"
        return 1
    fi

    # Verify realm exists
    local realm="dive-v3-broker-${code_lower}"
    local keycloak_url="https://localhost:${spoke_keycloak_port}"

    local realm_response
    realm_response=$(curl -sk --max-time 10 "${keycloak_url}/realms/${realm}" 2>/dev/null)
    local realm_name
    realm_name=$(echo "$realm_response" | jq -r '.realm // empty' 2>/dev/null)

    if [ "$realm_name" != "$realm" ]; then
        log_error "Checkpoint FAILED: Realm '$realm' not accessible"
        log_error "URL tested: ${keycloak_url}/realms/${realm}"
        return 1
    fi

    log_verbose "✓ Configuration checkpoint passed"
    return 0
}


export SPOKE_PHASE_CONFIGURATION_SECONDARY_LOADED=1
