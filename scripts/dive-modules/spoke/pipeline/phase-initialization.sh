#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline Initialization Phase
# =============================================================================
# Handles instance initialization:
#   - Instance directory setup
#   - Environment configuration generation (.env)
#   - Certificate generation
#   - Terraform initialization and apply
#   - Docker compose generation
#
# Consolidates logic from spoke_deploy() lines 620-828 and spoke-init.sh
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# Prevent multiple sourcing
# BEST PRACTICE (2026-01-18): Check functions exist, not just guard variable
if type spoke_phase_initialization &>/dev/null; then
    return 0
fi
# Module loaded marker will be set at end after functions defined

# Load validation functions for idempotent deployments
if [ -z "${SPOKE_VALIDATION_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/spoke-validation.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/spoke-validation.sh"
    fi
fi

# Load compose generator (CRITICAL - needed for docker-compose.yml generation)
if [ -z "${SPOKE_COMPOSE_GENERATOR_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/spoke-compose-generator.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/spoke-compose-generator.sh"
    fi
fi

# Load error codes (needed for error reporting)
if [ -z "${SPOKE_ERROR_CODES_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/spoke-error-codes.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/spoke-error-codes.sh"
    fi
fi

# Load checkpoint system

# =============================================================================
# MAIN INITIALIZATION PHASE FUNCTION
# =============================================================================

##
# Execute the initialization phase
#
# Arguments:
#   $1 - Instance code
#   $2 - Pipeline mode (deploy|redeploy)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_phase_initialization() {
    local instance_code="$1"
    local pipeline_mode="${2:-deploy}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    # =============================================================================
    # IDEMPOTENT DEPLOYMENT: Check if phase already complete
    # =============================================================================
    if type spoke_phase_is_complete &>/dev/null; then
        if spoke_phase_is_complete "$instance_code" "INITIALIZATION"; then
            # Validate state is actually good
            if type spoke_validate_phase_state &>/dev/null; then
                if spoke_validate_phase_state "$instance_code" "INITIALIZATION"; then
                    log_info "✓ INITIALIZATION phase complete and validated, skipping"
                    return 0
                else
                    log_warn "INITIALIZATION checkpoint exists but validation failed, re-running"
                    if ! spoke_phase_clear "$instance_code" "INITIALIZATION"; then
                        log_warn "Failed to clear INITIALIZATION checkpoint (stale state may persist)"
                    fi
                fi
            else
                log_info "✓ INITIALIZATION phase complete (validation not available)"
                return 0
            fi
        fi
    fi

    # =============================================================================
    # PERFORMANCE TRACKING: Phase timing metrics
    # =============================================================================
    local PHASE_START=$(date +%s)

    log_info "→ Executing INITIALIZATION phase for $code_upper"

    # Step 1: Check if already initialized (redeploy mode skips some steps)
    local init_marker="${spoke_dir}/.initialized"
    local needs_full_init=true

    if [ -f "$spoke_dir/docker-compose.yml" ]; then
        needs_full_init=false
        log_info "Instance already initialized at: $spoke_dir"

        # BEST PRACTICE: Always regenerate docker-compose.yml from template (SSOT)
        # This eliminates drift entirely - template is always authoritative
        log_step "Regenerating docker-compose.yml from template (SSOT)"

        if ! spoke_init_generate_compose "$instance_code"; then
            log_warn "Failed to regenerate docker-compose.yml (continuing with existing)"
        else
            log_success "✓ docker-compose.yml regenerated from template"
        fi
    fi

    # Step 2: Full initialization if needed
    if [ "$needs_full_init" = true ]; then
        if ! spoke_init_setup_directories "$instance_code"; then
            return 1
        fi

        if ! spoke_init_generate_config "$instance_code"; then
            return 1
        fi

        if ! spoke_init_generate_compose "$instance_code"; then
            return 1
        fi
    fi

    # Step 3: Ensure MongoDB keyfile exists (even on redeployment)
    # CRITICAL FIX (2026-01-27): Keyfile must exist for replica set authentication
    # Previously only generated during full init, causing failures on redeploy
    if ! spoke_init_ensure_mongo_keyfile "$instance_code"; then
        log_error "Failed to ensure MongoDB keyfile exists"
        return 1
    fi

    # Step 3b: Check AppRole SecretID freshness (auto-refresh if near expiry)
    if type _vault_secret_id_ttl_remaining &>/dev/null; then
        local secret_id_ttl
        secret_id_ttl=$(_vault_secret_id_ttl_remaining "$code_lower")
        if [ "$secret_id_ttl" -gt 0 ] && [ "$secret_id_ttl" -lt 86400 ]; then
            # Within 24h of expiry — auto-refresh
            log_warn "SecretID for ${code_upper} expires in $((secret_id_ttl / 3600))h — refreshing"
            if type _vault_refresh_secret_id &>/dev/null; then
                if _vault_refresh_secret_id "$code_lower"; then
                    log_success "SecretID refreshed for ${code_upper}"
                else
                    log_warn "SecretID refresh failed (continuing with current credentials)"
                fi
            else
                log_verbose "SecretID refresh not available (vault/module.sh not loaded)"
            fi
        elif [ "$secret_id_ttl" -eq 0 ]; then
            log_warn "SecretID for ${code_upper} may be expired or missing"
        else
            log_verbose "SecretID for ${code_upper}: ${secret_id_ttl}s remaining (healthy)"
        fi
    fi

    # Step 4: Certificate generation/validation
    if ! spoke_init_prepare_certificates "$instance_code"; then
        log_warn "Certificate preparation had issues (continuing)"
    fi

    # NOTE: Terraform application moved to CONFIGURATION phase (after containers are running)

    # Validate initialization phase completed successfully
    if ! spoke_checkpoint_initialization "$instance_code"; then
        log_error "Initialization checkpoint failed - state invalid"
        if type orch_record_error &>/dev/null; then
            orch_record_error "${SPOKE_ERROR_CHECKPOINT_FAILED:-1150}" "$ORCH_SEVERITY_CRITICAL" \
                "Initialization checkpoint validation failed" "initialization" \
                "Review logs and ensure all required files exist. Check keyfile is a file not directory."
        fi
        return 1
    fi

    # Create initialization checkpoint
    if type orch_create_checkpoint &>/dev/null; then
        orch_create_checkpoint "$instance_code" "INITIALIZATION" "Initialization phase completed"
    fi

    # Calculate and log phase duration
    local PHASE_END=$(date +%s)
    local PHASE_DURATION=$((PHASE_END - PHASE_START))

    # Mark phase complete (checkpoint system)
    if type spoke_phase_mark_complete &>/dev/null; then
        spoke_phase_mark_complete "$instance_code" "INITIALIZATION" "$PHASE_DURATION" '{}' || true
    fi

    log_success "✅ INITIALIZATION phase complete in ${PHASE_DURATION}s"
    return 0
}

# =============================================================================
# DIRECTORY SETUP
# =============================================================================

##
# Set up instance directory structure
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_init_setup_directories() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Creating instance directory structure"

    mkdir -p "$spoke_dir"
    mkdir -p "$spoke_dir/certs"
    mkdir -p "$spoke_dir/certs/crl"
    mkdir -p "$spoke_dir/truststores"
    mkdir -p "$spoke_dir/cache/policies"
    mkdir -p "$spoke_dir/cache/audit"
    mkdir -p "$spoke_dir/cloudflared"
    mkdir -p "$spoke_dir/logs"

    if [ -d "$spoke_dir" ]; then
        log_success "Directory structure created: $spoke_dir"
    else
        if type orch_record_error &>/dev/null; then
            orch_record_error "$SPOKE_ERROR_DIRECTORY_SETUP" "$ORCH_SEVERITY_CRITICAL" \
                "Failed to create instance directories" "initialization" \
                "$(spoke_error_get_remediation $SPOKE_ERROR_DIRECTORY_SETUP $instance_code)"
        fi
        return 1
    fi

    # ==========================================================================
    # CRITICAL FIX: Generate MongoDB keyfile for replica set authentication
    # ==========================================================================
    # MongoDB requires a keyfile (not directory) for replica set internal auth.
    # This was missing from the pipeline, causing "cp: -r not specified" errors.
    # ==========================================================================
    local keyfile_path="$spoke_dir/mongo-keyfile"

    # Generate keyfile if it doesn't exist
    if [ ! -f "$keyfile_path" ]; then
        log_verbose "Generating MongoDB replica set keyfile"
        if bash "${DIVE_ROOT}/scripts/generate-mongo-keyfile.sh" "$keyfile_path"; then
            log_success "✓ MongoDB keyfile generated: $keyfile_path"
        else
            if type orch_record_error &>/dev/null; then
                orch_record_error "${SPOKE_ERROR_KEYFILE_GENERATE:-1102}" "$ORCH_SEVERITY_CRITICAL" \
                    "Failed to generate MongoDB keyfile" "initialization" \
                    "Check permissions and ensure openssl is available"
            fi
            return 1
        fi
    else
        log_verbose "MongoDB keyfile already exists: $keyfile_path"
    fi

    # Validate keyfile exists and is a file (not directory)
    if [ ! -f "$keyfile_path" ] || [ -d "$keyfile_path" ]; then
        log_error "MongoDB keyfile missing or is a directory (must be file)"
        if type orch_record_error &>/dev/null; then
            orch_record_error "${SPOKE_ERROR_KEYFILE_INVALID:-1103}" "$ORCH_SEVERITY_CRITICAL" \
                "MongoDB keyfile is not a valid file" "initialization" \
                "Remove directory and regenerate: rm -rf $keyfile_path && ./dive spoke deploy $instance_code"
        fi
        return 1
    fi

    # Validate keyfile size (MongoDB requires 6-1024 bytes)
    local keyfile_size=$(wc -c < "$keyfile_path" | tr -d ' ')
    if [ "$keyfile_size" -lt 6 ] || [ "$keyfile_size" -gt 1024 ]; then
        log_error "MongoDB keyfile size invalid: $keyfile_size bytes (must be 6-1024)"
        if type orch_record_error &>/dev/null; then
            orch_record_error "${SPOKE_ERROR_KEYFILE_SIZE:-1104}" "$ORCH_SEVERITY_CRITICAL" \
                "MongoDB keyfile size out of valid range" "initialization" \
                "Regenerate keyfile: rm $keyfile_path && ./dive spoke deploy $instance_code"
        fi
        return 1
    fi

    log_verbose "MongoDB keyfile validated: ${keyfile_size} bytes"
    return 0
}

##
# Ensure MongoDB keyfile exists (standalone function for redeploy scenarios)
#
# CRITICAL FIX (2026-01-27): Keyfile must exist even during redeployment
# Previously only generated during full init (spoke_init_setup_directories),
# causing checkpoint failures when deploying over existing instance.
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Keyfile exists or was generated successfully
#   1 - Failed to generate or validate keyfile
##
spoke_init_ensure_mongo_keyfile() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local keyfile_path="$spoke_dir/mongo-keyfile"

    # Generate keyfile if it doesn't exist
    if [ ! -f "$keyfile_path" ]; then
        log_verbose "Generating MongoDB replica set keyfile"
        if bash "${DIVE_ROOT}/scripts/generate-mongo-keyfile.sh" "$keyfile_path"; then
            log_success "✓ MongoDB keyfile generated: $keyfile_path"
        else
            if type orch_record_error &>/dev/null; then
                orch_record_error "${SPOKE_ERROR_KEYFILE_GENERATE:-1102}" "$ORCH_SEVERITY_CRITICAL" \
                    "Failed to generate MongoDB keyfile" "initialization" \
                    "Check permissions and ensure openssl is available"
            fi
            return 1
        fi
    else
        log_verbose "MongoDB keyfile already exists: $keyfile_path"
    fi

    # Validate keyfile exists and is a file (not directory)
    if [ ! -f "$keyfile_path" ] || [ -d "$keyfile_path" ]; then
        log_error "MongoDB keyfile missing or is a directory (must be file)"
        if type orch_record_error &>/dev/null; then
            orch_record_error "${SPOKE_ERROR_KEYFILE_INVALID:-1103}" "$ORCH_SEVERITY_CRITICAL" \
                "MongoDB keyfile is not a valid file" "initialization" \
                "Remove directory and regenerate: rm -rf $keyfile_path && ./dive spoke deploy $instance_code"
        fi
        return 1
    fi

    # Validate keyfile size (MongoDB requires 6-1024 bytes)
    local keyfile_size=$(wc -c < "$keyfile_path" | tr -d ' ')
    if [ "$keyfile_size" -lt 6 ] || [ "$keyfile_size" -gt 1024 ]; then
        log_error "MongoDB keyfile size invalid: $keyfile_size bytes (must be 6-1024)"
        if type orch_record_error &>/dev/null; then
            orch_record_error "${SPOKE_ERROR_KEYFILE_SIZE:-1104}" "$ORCH_SEVERITY_CRITICAL" \
                "MongoDB keyfile size invalid" "initialization" \
                "Regenerate keyfile: rm $keyfile_path && ./dive spoke deploy $instance_code"
        fi
        return 1
    fi

    # Set correct permissions (MongoDB requires 400 or 600)
    chmod 400 "$keyfile_path" 2>/dev/null || chmod 600 "$keyfile_path"
    log_verbose "MongoDB keyfile validated: $keyfile_path ($keyfile_size bytes)"

    return 0
}

# =============================================================================
# CONFIGURATION GENERATION
# =============================================================================

##
# Generate instance configuration (.env file and secrets)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_init_generate_config() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Generating instance configuration"

    # Get port assignments
    if type get_instance_ports &>/dev/null; then
        eval "$(get_instance_ports "$code_upper")"
    else
        # Default ports
        SPOKE_FRONTEND_PORT=3000
        SPOKE_BACKEND_PORT=4000
        SPOKE_KEYCLOAK_HTTPS_PORT=8443
        SPOKE_KAS_PORT=8080
    fi

    # ==========================================================================
    # SSOT ARCHITECTURE (2026-01-22): Hub MongoDB is the SINGLE SOURCE OF TRUTH
    # ==========================================================================
    # NO LOCAL spokeId GENERATION - Backend queries Hub at startup
    #
    # Flow:
    # 1. Shell scripts use INSTANCE_CODE only (static identifier)
    # 2. Containers start with INSTANCE_CODE in environment
    # 3. Backend's spokeIdentityService queries Hub for spokeId
    # 4. Hub MongoDB returns the authoritative spokeId
    # 5. Backend caches in local MongoDB for offline resilience
    #
    # Benefits:
    # - No spokeId mismatch issues
    # - No complex sync between .env, docker-compose
    # - Single source of truth in Hub MongoDB
    # - Automatic offline resilience via local cache
    # ==========================================================================

    # Hub URL: internal Docker name (local) or external Caddy URL (remote)
    local hub_url_internal="https://dive-hub-backend:4000"
    if [ "${DEPLOYMENT_MODE:-local}" = "remote" ]; then
        hub_url_internal="${HUB_API_URL:-https://dive-hub-backend:4000}"
        log_info "Remote mode: Hub URL → ${hub_url_internal}"
    fi

    # Hub OPAL URL: Docker container name (local) or external Caddy URL (remote)
    local hub_opal_url="https://dive-hub-opal-server:7002"
    if [ "${DEPLOYMENT_MODE:-local}" = "remote" ]; then
        hub_opal_url="${HUB_OPAL_URL:-https://dive-hub-opal-server:7002}"
        log_info "Remote mode: Hub OPAL URL → ${hub_opal_url}"
    fi

    # Build URLs — domain-aware when DIVE_DOMAIN_SUFFIX is set (EC2 with Caddy)
    local base_url="https://localhost:${SPOKE_FRONTEND_PORT}"
    local api_url="https://localhost:${SPOKE_BACKEND_PORT}"
    local idp_url="https://dive-spoke-${code_lower}-keycloak:8443"
    local idp_public_url="https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT}"
    local kas_url="https://localhost:${SPOKE_KAS_PORT}"

    if [ -n "${SPOKE_CUSTOM_DOMAIN:-}" ]; then
        # Custom domain: app.<domain>, api.<domain>, idp.<domain>
        base_url="https://app.${SPOKE_CUSTOM_DOMAIN}"
        api_url="https://api.${SPOKE_CUSTOM_DOMAIN}"
        idp_public_url="https://idp.${SPOKE_CUSTOM_DOMAIN}"
        log_info "Custom domain: spoke ${code_upper} URLs → ${SPOKE_CUSTOM_DOMAIN}"
    elif [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
        local _env_prefix _base_domain
        _env_prefix="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f1)"
        _base_domain="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f2-)"
        base_url="https://${_env_prefix}-${code_lower}-app.${_base_domain}"
        api_url="https://${_env_prefix}-${code_lower}-api.${_base_domain}"
        idp_public_url="https://${_env_prefix}-${code_lower}-idp.${_base_domain}"
        # idp_url stays as internal Docker name for container-to-container
        log_info "Caddy mode: spoke ${code_upper} URLs → ${_base_domain}"
    fi

    # Create .env file with config variables
    # NOTE: No SPOKE_ID - backend queries Hub at startup (SSOT architecture)
    spoke_init_generate_env "$instance_code" "$base_url" "$api_url" "$idp_url" "$idp_public_url" "$kas_url" "$hub_url_internal" "$hub_opal_url"

    log_success "Instance configuration generated (.env)"

    # CRITICAL FIX (2026-01-15): Sync secrets to .env BEFORE containers start
    # Root cause: Containers were starting with incomplete .env (missing secrets)
    # Solution: Sync secrets during initialization, not configuration phase
    if type spoke_secrets_sync_to_env &>/dev/null; then
        log_verbose "Syncing secrets to .env before container startup"
        spoke_secrets_sync_to_env "$instance_code" || log_warn "Secret sync had issues (continuing)"
    fi

    # ==========================================================================
    # CRITICAL FIX (2026-01-22): Provision OPAL token BEFORE container startup
    # ==========================================================================
    # ROOT CAUSE: OPAL client was starting with empty token, causing:
    #   - Infinite 403 Forbidden retry loop
    #   - OPAL client never becoming healthy
    #   - KAS failing to start (depends on OPAL client healthy)
    # SOLUTION: Provision token during initialization, before docker compose up
    log_verbose "Attempting to provision OPAL token before container startup..."

    # Determine OPAL server URL based on deployment mode
    local opal_server_url=""
    local master_token="${OPAL_AUTH_MASTER_TOKEN:-}"

    if [ "${DEPLOYMENT_MODE:-local}" = "remote" ]; then
        # Remote mode: use Hub OPAL public URL
        opal_server_url="${HUB_OPAL_URL:-}"
        log_verbose "Remote mode — OPAL server: ${opal_server_url}"
    elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-opal-server"; then
        # Local mode: use localhost
        opal_server_url="https://localhost:${OPAL_PORT:-7002}"
        log_verbose "Local mode — Hub OPAL server detected"
    fi

    # Load master token from .env.hub if not already set
    if [ -z "$master_token" ]; then
        local hub_env_file="${DIVE_ROOT}/.env.hub"
        if [ -f "$hub_env_file" ]; then
            master_token=$(grep "^OPAL_AUTH_MASTER_TOKEN=" "$hub_env_file" 2>/dev/null | cut -d= -f2)
        fi
    fi

    if [ -n "$opal_server_url" ] && [ -n "$master_token" ]; then
        if [ -n "$master_token" ]; then
            # Request JWT from OPAL server
            local token_response
            token_response=$(curl -sk --max-time 10 \
                -X POST "${opal_server_url}/token" \
                -H "Authorization: Bearer ${master_token}" \
                -H "Content-Type: application/json" \
                -d '{"type": "client"}' 2>/dev/null || echo "")

            local opal_token=""
            if [ -n "$token_response" ]; then
                opal_token=$(echo "$token_response" | jq -r '.token // empty' 2>/dev/null)
            fi

            local env_file="$spoke_dir/.env"
            if [ -n "$opal_token" ] && [[ "$opal_token" =~ ^eyJ ]]; then
                # Update .env file with the token
                if [ -f "$env_file" ]; then
                    sed -i.bak "s|^SPOKE_OPAL_TOKEN=.*|SPOKE_OPAL_TOKEN=$opal_token|" "$env_file"
                    rm -f "$env_file.bak"
                    log_success "✓ OPAL token provisioned during initialization"
                fi
            else
                log_warn "Could not get OPAL token from Hub (will retry after container start)"
                # Set placeholder token to prevent OPAL client from failing during deployment
                # Real token will be provisioned in configuration phase after federation
                if [ -f "$env_file" ]; then
                    # Check if SPOKE_OPAL_TOKEN is empty or missing
                    local current_token
                    current_token=$(grep "^SPOKE_OPAL_TOKEN=" "$env_file" 2>/dev/null | cut -d= -f2- | tr -d ' ' || echo "")

                    if [ -z "$current_token" ] || [ "$current_token" = "" ]; then
                        # Token is empty - set placeholder
                        if grep -q "^SPOKE_OPAL_TOKEN=" "$env_file" 2>/dev/null; then
                            # Update existing empty line
                            sed -i.bak "s|^SPOKE_OPAL_TOKEN=.*|SPOKE_OPAL_TOKEN=placeholder-token-awaiting-provision|" "$env_file"
                            rm -f "$env_file.bak" 2>/dev/null
                        else
                            # Add new line
                            echo "SPOKE_OPAL_TOKEN=placeholder-token-awaiting-provision" >> "$env_file"
                        fi
                        log_verbose "✓ Set placeholder OPAL token (will be replaced in configuration phase)"
                    else
                        log_verbose "OPAL token already set (not empty)"
                    fi
                else
                    log_warn ".env file not found - placeholder token will be set when .env is created"
                fi
            fi
        else
            log_verbose "Hub master token not found - OPAL token will be provisioned later"
            # Set placeholder token
            local env_file="$spoke_dir/.env"
            if [ -f "$env_file" ]; then
                local current_token
                current_token=$(grep "^SPOKE_OPAL_TOKEN=" "$env_file" 2>/dev/null | cut -d= -f2- | tr -d ' ' || echo "")

                if [ -z "$current_token" ] || [ "$current_token" = "" ]; then
                    if grep -q "^SPOKE_OPAL_TOKEN=" "$env_file" 2>/dev/null; then
                        sed -i.bak "s|^SPOKE_OPAL_TOKEN=.*|SPOKE_OPAL_TOKEN=placeholder-token-awaiting-provision|" "$env_file"
                        rm -f "$env_file.bak" 2>/dev/null
                    else
                        echo "SPOKE_OPAL_TOKEN=placeholder-token-awaiting-provision" >> "$env_file"
                    fi
                    log_verbose "✓ Set placeholder OPAL token (will be replaced in configuration phase)"
                fi
            fi
        fi
    else
        log_verbose "Hub OPAL server not running - OPAL token will be provisioned later"
        # Set placeholder token
        local env_file="$spoke_dir/.env"
        if [ -f "$env_file" ]; then
            local current_token
            current_token=$(grep "^SPOKE_OPAL_TOKEN=" "$env_file" 2>/dev/null | cut -d= -f2- | tr -d ' ' || echo "")

            if [ -z "$current_token" ] || [ "$current_token" = "" ]; then
                if grep -q "^SPOKE_OPAL_TOKEN=" "$env_file" 2>/dev/null; then
                    sed -i.bak "s|^SPOKE_OPAL_TOKEN=.*|SPOKE_OPAL_TOKEN=placeholder-token-awaiting-provision|" "$env_file"
                    rm -f "$env_file.bak" 2>/dev/null
                else
                    echo "SPOKE_OPAL_TOKEN=placeholder-token-awaiting-provision" >> "$env_file"
                fi
                log_verbose "✓ Set placeholder OPAL token (will be replaced in configuration phase)"
            fi
        fi
    fi

    return 0
}

##
# Generate .env file with GCP secret references
##
##
# Fetch OPAL public key from Hub OPAL server or local SSH key
#
# OPAL Authentication Strategy:
#   1. Try to get public key from Hub OPAL server environment
#   2. Fall back to user's SSH public key (~/.ssh/id_rsa.pub)
#   3. If neither available, leave unset (OPAL client uses no-auth mode)
#
# Returns:
#   Public key string on stdout, or empty if not available
##
spoke_get_hub_opal_public_key() {
    # Strategy 1: Read from Vault (SSOT)
    if vault_is_authenticated 2>/dev/null; then
        local vault_pub_ssh=""
        vault_pub_ssh=$(vault_get_secret "opal" "jwt-signing" "public_key_ssh" 2>/dev/null || true)
        if [ -n "$vault_pub_ssh" ]; then
            echo "$vault_pub_ssh"
            return 0
        fi
    fi

    # Strategy 2: Read SSH file on disk
    local ssh_file="${DIVE_ROOT}/certs/opal/jwt-signing-key.pub.ssh"
    if [ -f "$ssh_file" ]; then
        cat "$ssh_file"
        return 0
    fi

    # Strategy 3: Read from running OPAL server container
    if docker ps --format '{{.Names}}' | grep -q "dive-hub-opal-server"; then
        local public_key
        public_key=$(docker exec dive-hub-opal-server printenv OPAL_AUTH_PUBLIC_KEY 2>/dev/null | tr -d '\n\r' || echo "")
        if [ -n "$public_key" ] && [ "$public_key" != "# NOT_CONFIGURED" ]; then
            echo "$public_key"
            return 0
        fi
    fi

    log_verbose "OPAL public key not available (OPAL client will use no-auth mode)"
    return 1
}

spoke_init_generate_env() {
    # ==========================================================================
    # SSOT ARCHITECTURE (2026-01-22): No SPOKE_ID in .env
    # Backend queries Hub at startup to get spokeId (Hub MongoDB is SSOT)
    # ==========================================================================
    local instance_code="$1"
    local base_url="$2"
    local api_url="$3"
    local idp_url="$4"
    local idp_public_url="$5"
    local kas_url="$6"
    local hub_url="$7"
    local hub_opal_url="${8:-https://dive-hub-opal-server:7002}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local env_file="$spoke_dir/.env"

    # Fetch OPAL public key from Hub (best-effort)
    local opal_public_key=""
    opal_public_key=$(spoke_get_hub_opal_public_key || echo "")

    if [ -n "$opal_public_key" ]; then
        log_success "Retrieved OPAL public key for authentication"
    else
        log_warn "OPAL public key not available (OPAL client will use no-auth mode)"
        opal_public_key=""
    fi

    # Preserve Vault credentials from provisioning (set by: ./dive vault provision)
    local _saved_vault_role_id="" _saved_vault_secret_id=""
    local _saved_secrets_provider="" _saved_vault_addr=""
    if [ -f "$env_file" ]; then
        _saved_vault_role_id=$(grep '^VAULT_ROLE_ID=' "$env_file" 2>/dev/null | cut -d= -f2-)
        _saved_vault_secret_id=$(grep '^VAULT_SECRET_ID=' "$env_file" 2>/dev/null | cut -d= -f2-)
        _saved_secrets_provider=$(grep '^SECRETS_PROVIDER=' "$env_file" 2>/dev/null | cut -d= -f2-)
        _saved_vault_addr=$(grep '^VAULT_ADDR=' "$env_file" 2>/dev/null | cut -d= -f2-)
        if cp "$env_file" "${env_file}.bak.$(date +%Y%m%d-%H%M%S)" 2>/dev/null; then
            log_verbose "Backed up existing .env, regenerating complete template"
        fi
    fi

    # CRITICAL FIX (2026-02-11): Preserve secrets from Vault provision
    # Extract all secret values from existing .env before regenerating
    local _saved_postgres_pw="" _saved_mongo_pw="" _saved_redis_pw=""
    local _saved_keycloak_pw="" _saved_auth_secret="" _saved_client_secret=""
    if [ -f "$env_file" ] && grep -q "^SECRETS_PROVIDER=vault" "$env_file"; then
        log_verbose "Preserving Vault secrets from existing .env"
        _saved_postgres_pw=$(grep "^POSTGRES_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d= -f2-)
        _saved_mongo_pw=$(grep "^MONGO_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d= -f2-)
        _saved_redis_pw=$(grep "^REDIS_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d= -f2-)
        _saved_keycloak_pw=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d= -f2-)
        _saved_auth_secret=$(grep "^AUTH_SECRET_${code_upper}=" "$env_file" 2>/dev/null | cut -d= -f2-)
        _saved_client_secret=$(grep "^KEYCLOAK_CLIENT_SECRET_${code_upper}=" "$env_file" 2>/dev/null | cut -d= -f2-)
    fi

    # Create .env file
    # NOTE: NO SPOKE_ID - backend queries Hub at startup (SSOT architecture)
    cat > "$env_file" << EOF
# ${code_upper} Spoke Configuration
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
#
# SSOT ARCHITECTURE: NO SPOKE_ID HERE
# The backend queries Hub MongoDB at startup to get the authoritative spokeId.
# This eliminates spokeId mismatch issues that caused heartbeat failures.

# GCP Project for secrets
GCP_PROJECT=${GCP_PROJECT:-dive25}

# Instance identification (static - used to query Hub for spokeId)
INSTANCE_CODE=$code_upper

# URLs and endpoints
APP_URL=$base_url
API_URL=$api_url
IDP_URL=$idp_url
IDP_PUBLIC_URL=$idp_public_url
KAS_URL=$kas_url
HUB_URL=$hub_url

# Federation configuration
HUB_OPAL_URL=$hub_opal_url
HUB_API_URL=${HUB_API_URL:-}
SPOKE_OPAL_TOKEN=
OPAL_LOG_LEVEL=INFO

# Token blacklist: empty = API-based revocation via HUB_API_URL (remote mode)
BLACKLIST_REDIS_URL=$([ "${DEPLOYMENT_MODE:-local}" = "remote" ] && echo "" || echo "rediss://:\${REDIS_PASSWORD_BLACKLIST}@dive-hub-redis:6379")

# Deployment mode (local = same Docker host as Hub, remote = separate instance)
DEPLOYMENT_MODE=${DEPLOYMENT_MODE:-local}

# OPAL Authentication
OPAL_AUTH_PUBLIC_KEY="$opal_public_key"

# Cloudflare tunnel (if configured)
TUNNEL_TOKEN=

# =============================================================================
# SECURITY NOTE: Secrets are loaded from GCP Secret Manager at runtime
# Required GCP secrets for ${code_upper}:
# - dive-v3-postgres-${code_lower}      (PostgreSQL password)
# - dive-v3-keycloak-${code_lower}      (Keycloak admin password)
# - dive-v3-mongodb-${code_lower}       (MongoDB password)
# - dive-v3-auth-secret-${code_lower}   (JWT/Auth secret)
# - dive-v3-keycloak-client-secret      (Shared client secret)
# - dive-v3-redis-blacklist             (Redis password)
# =============================================================================
EOF

    # Append Caddy domain config when DIVE_DOMAIN_SUFFIX is set (EC2 with Caddy)
    if [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
        local _env_prefix _base_domain _spoke_app _spoke_api _spoke_idp
        _env_prefix="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f1)"
        _base_domain="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f2-)"
        _spoke_app="${_env_prefix}-${code_lower}-app.${_base_domain}"
        _spoke_api="${_env_prefix}-${code_lower}-api.${_base_domain}"
        _spoke_idp="${_env_prefix}-${code_lower}-idp.${_base_domain}"

        # Hub Caddy domain for TRUSTED_ISSUERS
        local _hub_lower _hub_idp
        _hub_lower="$(echo "${INSTANCE:-usa}" | tr '[:upper:]' '[:lower:]')"
        _hub_idp="${_env_prefix}-${_hub_lower}-idp.${_base_domain}"

        cat >> "$env_file" << DOMAIN_EOF

# Caddy domain configuration (auto-derived from DIVE_DOMAIN_SUFFIX=${DIVE_DOMAIN_SUFFIX})
CADDY_SPOKE_APP=${_spoke_app}
CADDY_SPOKE_API=${_spoke_api}
CADDY_SPOKE_IDP=${_spoke_idp}
KEYCLOAK_HOSTNAME=${_spoke_idp}
NEXT_PUBLIC_API_URL=https://${_spoke_api}
NEXT_PUBLIC_BACKEND_URL=https://${_spoke_api}
NEXT_PUBLIC_BASE_URL=https://${_spoke_app}
NEXT_PUBLIC_KEYCLOAK_URL=https://${_spoke_idp}
NEXTAUTH_URL=https://${_spoke_app}
AUTH_URL=https://${_spoke_app}
KEYCLOAK_ISSUER=https://${_spoke_idp}/realms/dive-v3-broker-${code_lower}
AUTH_KEYCLOAK_ISSUER=https://${_spoke_idp}/realms/dive-v3-broker-${code_lower}
TRUSTED_ISSUERS=https://${_spoke_idp}/realms/dive-v3-broker-${code_lower},https://keycloak-${code_lower}:8443/realms/dive-v3-broker-${code_lower},https://${_hub_idp}/realms/dive-v3-broker-${_hub_lower},https://keycloak:8443/realms/dive-v3-broker-${_hub_lower}
NEXT_PUBLIC_EXTERNAL_DOMAINS=https://${_spoke_app},https://${_spoke_api},https://${_spoke_idp}
CORS_ALLOWED_ORIGINS=https://${_spoke_app},https://${_spoke_api},https://${_spoke_idp},https://${_hub_idp}
NODE_ENV=production
DOMAIN_EOF
        log_success "Caddy domain config written to .env (${_spoke_app})"
    fi

    # Restore Vault credentials if they were preserved from provisioning
    if [ -n "$_saved_secrets_provider" ]; then
        {
            echo ""
            echo "# Vault HA Integration (preserved from: ./dive vault provision)"
            echo "SECRETS_PROVIDER=${_saved_secrets_provider}"
            [ -n "$_saved_vault_addr" ] && echo "VAULT_ADDR=${_saved_vault_addr}"
            [ -n "$_saved_vault_role_id" ] && echo "VAULT_ROLE_ID=${_saved_vault_role_id}"
            [ -n "$_saved_vault_secret_id" ] && echo "VAULT_SECRET_ID=${_saved_vault_secret_id}"
        } >> "$env_file"
        log_verbose "Restored Vault credentials in .env"

        # Restore secret values if they were preserved
        if [ -n "$_saved_postgres_pw" ]; then
            _vault_update_env "$env_file" "POSTGRES_PASSWORD_${code_upper}" "$_saved_postgres_pw"
            _vault_update_env "$env_file" "MONGO_PASSWORD_${code_upper}" "$_saved_mongo_pw"
            _vault_update_env "$env_file" "REDIS_PASSWORD_${code_upper}" "$_saved_redis_pw"
            _vault_update_env "$env_file" "KEYCLOAK_ADMIN_PASSWORD_${code_upper}" "$_saved_keycloak_pw"
            _vault_update_env "$env_file" "AUTH_SECRET_${code_upper}" "$_saved_auth_secret"
            _vault_update_env "$env_file" "KEYCLOAK_CLIENT_SECRET_${code_upper}" "$_saved_client_secret"
            log_verbose "Restored Vault secrets to regenerated .env"
        fi
    fi

    log_verbose "Generated .env file: $env_file"
}


# Load extended initialization functions
source "$(dirname "${BASH_SOURCE[0]}")/phase-initialization-extended.sh"

export SPOKE_PHASE_INITIALIZATION_LOADED=1
