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
# LOAD SPOKE FEDERATION MODULE
# =============================================================================
# Load spoke-federation.sh for spoke_federation_setup() function
if [ -z "$SPOKE_FEDERATION_LOADED" ]; then
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
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_info "Configuration phase for $code_upper"

    # CRITICAL: Set USE_TERRAFORM_SSOT to skip manual protocol mapper creation
    # Terraform manages all Keycloak resources (clients, mappers, IdPs)
    export USE_TERRAFORM_SSOT=true

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
    # This ensures KEYCLOAK_ADMIN_PASSWORD_* is available for admin token retrieval
    if type spoke_secrets_load &>/dev/null; then
        spoke_secrets_load "$code_upper" "load" 2>/dev/null || true
        # Also source .env directly as fallback
        if [ -f "$spoke_dir/.env" ]; then
            set -a  # Export all variables
            source "$spoke_dir/.env" 2>/dev/null || true
            set +a
        fi
    fi

    # Step 2: Federation setup (CRITICAL - required for SSO)
    if ! spoke_config_setup_federation "$instance_code" "$pipeline_mode"; then
        log_error "CRITICAL: Federation setup failed - SSO will not work"
        log_error "To retry: ./dive federation link $code_upper"
        return 1
    fi

    # Step 2.5: Register in Federation and KAS registries (CRITICAL - required for heartbeat)
    if [ "$pipeline_mode" = "deploy" ]; then
        if ! spoke_config_register_in_registries "$instance_code"; then
            log_error "CRITICAL: Registry registration failed - spoke heartbeat will not work"
            log_error "To retry: ./dive spoke register $code_upper"
            return 1
        fi
    fi

    # ==========================================================================
    # NON-CRITICAL STEPS - Pipeline continues on failure
    # ==========================================================================

    # Step 3: Synchronize secrets (soft failure - can sync later)
    spoke_config_sync_secrets "$instance_code" || log_warn "Secret sync had issues (continuing)"

    # Step 4: OPAL token provisioning (soft failure)
    spoke_config_provision_opal "$instance_code" || log_warn "OPAL provisioning had issues (continuing)"

    # Step 5: AMR attribute synchronization (soft failure - non-essential)
    spoke_config_sync_amr_attributes "$instance_code" || true

    # Step 6: Configure Keycloak client redirect URIs (soft failure)
    spoke_config_update_redirect_uris "$instance_code" || log_warn "Redirect URI update had issues (continuing)"

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

    log_verbose "Registering spoke in Hub MongoDB spoke registry..."

    # Get spoke configuration
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local config_file="$spoke_dir/config.json"

    if [ ! -f "$config_file" ]; then
        log_error "Spoke config not found: $config_file"
        return 1
    fi

    local spoke_id=$(jq -r '.identity.spokeId // empty' "$config_file" 2>/dev/null)
    local instance_name=$(jq -r '.identity.name // empty' "$config_file" 2>/dev/null)
    local base_url=$(jq -r '.endpoints.baseUrl // empty' "$config_file" 2>/dev/null)
    local api_url=$(jq -r '.endpoints.apiUrl // empty' "$config_file" 2>/dev/null)
    local idp_url=$(jq -r '.endpoints.idpUrl // empty' "$config_file" 2>/dev/null)
    local idp_public_url=$(jq -r '.endpoints.idpPublicUrl // empty' "$config_file" 2>/dev/null)
    local contact_email=$(jq -r '.identity.contactEmail // empty' "$config_file" 2>/dev/null)

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
        contact_email="admin@${code_lower}.dive25.com"
    fi

    # Get Keycloak admin password (CRITICAL for bidirectional federation)
    local keycloak_password_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
    local keycloak_password="${!keycloak_password_var}"

    # Validate password exists
    if [ -z "$keycloak_password" ]; then
        log_error "Keycloak admin password not found: $keycloak_password_var"
        log_error "CRITICAL: Bidirectional federation requires spoke Keycloak password"
        log_error "Set $keycloak_password_var in environment or spoke .env file"
        return 1
    fi

    log_verbose "Using Keycloak password for bidirectional federation (${#keycloak_password} chars)"

    # Build registration payload matching API schema exactly
    # Reference: backend/src/routes/federation.routes.ts line 180-198
    # CRITICAL: Include keycloakAdminPassword for bidirectional federation
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
  "skipValidation": true
}
EOF
)

    # Call Hub registration endpoint
    local hub_api="https://localhost:4000/api/federation/register"
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

            if [ -n "$spoke_token" ]; then
                log_success "✓ Token received from auto-approval"

                # Update .env with SPOKE_TOKEN
                if grep -q "^SPOKE_TOKEN=" "$spoke_dir/.env" 2>/dev/null; then
                    sed -i.bak "s|^SPOKE_TOKEN=.*|SPOKE_TOKEN=$spoke_token|" "$spoke_dir/.env"
                else
                    echo "SPOKE_TOKEN=$spoke_token" >> "$spoke_dir/.env"
                fi
                rm -f "$spoke_dir/.env.bak"

                log_success "✓ SPOKE_TOKEN configured in .env"
                return 0
            else
                log_warn "Token not found in auto-approval response - may need manual approval"
            fi
        elif [ "$spoke_status" = "pending" ]; then
            log_warn "Spoke status: pending (manual approval required)"
            log_warn "Auto-approval disabled or bidirectional federation failed"
        elif [ "$spoke_status" = "suspended" ]; then
            log_warn "Spoke suspended during registration (federation verification failed)"
            local error_msg=$(echo "$response" | jq -r '.spoke.message // empty' 2>/dev/null)
            log_warn "Reason: $error_msg"
            
            # Try to unsuspend and re-register after a delay
            # Federation resources were just created - they may need time to propagate
            if [ -n "$registered_spoke_id" ]; then
                log_info "Attempting to unsuspend and retry registration..."
                sleep 5  # Wait for Keycloak to propagate changes
                
                # Call Hub backend to unsuspend
                local unsuspend_response
                unsuspend_response=$(curl -sk -X POST \
                    "https://localhost:4000/api/federation/spokes/${registered_spoke_id}/unsuspend" \
                    -H "Content-Type: application/json" \
                    -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY:-admin-dev-key}" \
                    -d '{"retryFederation": true}' 2>&1)
                
                if echo "$unsuspend_response" | jq -e '.success' &>/dev/null; then
                    log_success "Spoke unsuspended and federation retried"
                    
                    # Check new status
                    local check_response
                    check_response=$(curl -sk \
                        "https://localhost:4000/api/federation/spokes/${registered_spoke_id}" \
                        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY:-admin-dev-key}" 2>/dev/null)
                    
                    local new_status=$(echo "$check_response" | jq -r '.spoke.status // empty' 2>/dev/null)
                    if [ "$new_status" = "approved" ]; then
                        log_success "Spoke now approved after unsuspend"
                    else
                        log_warn "Spoke status after unsuspend: $new_status"
                    fi
                else
                    log_warn "Unsuspend failed - manual intervention may be required"
                    log_warn "Run: ./dive hub spoke unsuspend ${registered_spoke_id}"
                fi
            fi
            
            # Don't fail - registration succeeded, suspension can be resolved later
            log_warn "Continuing despite suspension - federation can be fixed later"
        fi

        # Fallback: Try manual approval (legacy path - may fail due to auth)
        if [ -n "$registered_spoke_id" ]; then
            if spoke_config_approve_and_get_token "$registered_spoke_id" "$code_lower"; then
                log_success "✓ Manual approval succeeded"
                return 0
            else
                log_warn "Manual approval failed - authentication required"
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
    local hub_approve_api="https://localhost:4000/api/federation/spokes/$spoke_id/approve"

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

    log_warn "Auto-approval failed - manual approval required"
    return 1
}

##
# Register spoke in federation-registry.json and MongoDB kas_registry collection
# CRITICAL: Required for ZTDF resource seeding and federated search
#
# Architecture (as of Phase 3):
#   - Federation registry: file-based (federation-registry.json) - unchanged
#   - KAS registry: MongoDB-backed (kas_registry collection) - NEW
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

    # Step 1: Register in federation-registry.json (file-based legacy)
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

    # Step 2: Register KAS in MongoDB (replaces file-based kas-registry.json)
    # Load spoke-kas.sh if not already loaded
    if [ -z "$DIVE_SPOKE_KAS_LOADED" ]; then
        if [ -f "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-kas.sh" ]; then
            source "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-kas.sh"
        fi
    fi

    if type spoke_kas_register_mongodb &>/dev/null; then
        log_verbose "Registering KAS in MongoDB"
        
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

        # CRITICAL: Don't hide errors - capture output for proper debugging
        # Retry KAS registration up to 3 times (backend may still be starting up)
        local kas_output
        local kas_exit_code=1
        local kas_retries=3
        
        for ((retry=1; retry<=kas_retries; retry++)); do
            kas_output=$(spoke_kas_register_mongodb "$code_upper" 2>&1) && kas_exit_code=0 && break
            
            if [ $retry -lt $kas_retries ]; then
                log_warn "KAS registration attempt $retry failed, retrying in 5s..."
                sleep 5
            fi
        done

        if [ $kas_exit_code -eq 0 ]; then
            log_verbose "✓ KAS registered in MongoDB"

            # Auto-approve the KAS registration for automated deployments
            local kas_id="${code_lower}-kas"
            if type spoke_kas_approve &>/dev/null; then
                local approve_output
                approve_output=$(spoke_kas_approve "$kas_id" 2>&1) || true
                if echo "$approve_output" | grep -q "approved\|success"; then
                    log_verbose "✓ KAS auto-approved"
                else
                    log_verbose "KAS approval pending (manual approval required)"
                fi
            fi
        else
            log_warn "MongoDB KAS registration failed after $kas_retries attempts"
            log_warn "Error output:"
            echo "$kas_output" | head -20
            log_warn "KAS registration can be retried later: ./dive spoke kas register $code_upper"
            # Don't fail - KAS registration is important but not critical for basic deployment
            # Spoke will still work for authentication, just not ZTDF encryption
        fi
    else
        log_error "MongoDB KAS registration function not available"
        return 1  # Not acceptable - this is required functionality
    fi

    log_success "Registry updates complete"
    echo "  ✓ federation-registry.json updated (enables federated search)"
    echo "  ✓ MongoDB kas_registry updated (enables ZTDF encryption)"
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
                log_warn "Terraform apply failed after retries"
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
