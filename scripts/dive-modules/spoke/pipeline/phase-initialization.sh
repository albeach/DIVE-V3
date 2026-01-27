#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline Initialization Phase
# =============================================================================
# Handles instance initialization:
#   - Instance directory setup
#   - Configuration file generation
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
    # PERFORMANCE TRACKING: Phase timing metrics
    # =============================================================================
    local PHASE_START=$(date +%s)

    log_info "Initialization phase for $code_upper"

    # Step 1: Check if already initialized (redeploy mode skips some steps)
    local init_marker="${spoke_dir}/.initialized"
    local needs_full_init=true

    if [ -f "$spoke_dir/docker-compose.yml" ] && [ -f "$spoke_dir/config.json" ]; then
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
    log_success "Initialization phase complete in ${PHASE_DURATION}s"
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
        orch_record_error "$SPOKE_ERROR_DIRECTORY_SETUP" "$ORCH_SEVERITY_CRITICAL" \
            "Failed to create instance directories" "initialization" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_DIRECTORY_SETUP $instance_code)"
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
            orch_record_error "${SPOKE_ERROR_KEYFILE_GENERATE:-1102}" "$ORCH_SEVERITY_CRITICAL" \
                "Failed to generate MongoDB keyfile" "initialization" \
                "Check permissions and ensure openssl is available"
            return 1
        fi
    else
        log_verbose "MongoDB keyfile already exists: $keyfile_path"
    fi

    # Validate keyfile exists and is a file (not directory)
    if [ ! -f "$keyfile_path" ] || [ -d "$keyfile_path" ]; then
        log_error "MongoDB keyfile missing or is a directory (must be file)"
        orch_record_error "${SPOKE_ERROR_KEYFILE_INVALID:-1103}" "$ORCH_SEVERITY_CRITICAL" \
            "MongoDB keyfile is not a valid file" "initialization" \
            "Remove directory and regenerate: rm -rf $keyfile_path && ./dive spoke deploy $instance_code"
        return 1
    fi

    # Validate keyfile size (MongoDB requires 6-1024 bytes)
    local keyfile_size=$(wc -c < "$keyfile_path" | tr -d ' ')
    if [ "$keyfile_size" -lt 6 ] || [ "$keyfile_size" -gt 1024 ]; then
        log_error "MongoDB keyfile size invalid: $keyfile_size bytes (must be 6-1024)"
        orch_record_error "${SPOKE_ERROR_KEYFILE_SIZE:-1104}" "$ORCH_SEVERITY_CRITICAL" \
            "MongoDB keyfile size out of valid range" "initialization" \
            "Regenerate keyfile: rm $keyfile_path && ./dive spoke deploy $instance_code"
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
            orch_record_error "${SPOKE_ERROR_KEYFILE_GENERATE:-1102}" "$ORCH_SEVERITY_CRITICAL" \
                "Failed to generate MongoDB keyfile" "initialization" \
                "Check permissions and ensure openssl is available"
            return 1
        fi
    else
        log_verbose "MongoDB keyfile already exists: $keyfile_path"
    fi

    # Validate keyfile exists and is a file (not directory)
    if [ ! -f "$keyfile_path" ] || [ -d "$keyfile_path" ]; then
        log_error "MongoDB keyfile missing or is a directory (must be file)"
        orch_record_error "${SPOKE_ERROR_KEYFILE_INVALID:-1103}" "$ORCH_SEVERITY_CRITICAL" \
            "MongoDB keyfile is not a valid file" "initialization" \
            "Remove directory and regenerate: rm -rf $keyfile_path && ./dive spoke deploy $instance_code"
        return 1
    fi

    # Validate keyfile size (MongoDB requires 6-1024 bytes)
    local keyfile_size=$(wc -c < "$keyfile_path" | tr -d ' ')
    if [ "$keyfile_size" -lt 6 ] || [ "$keyfile_size" -gt 1024 ]; then
        log_error "MongoDB keyfile size invalid: $keyfile_size bytes (must be 6-1024)"
        orch_record_error "${SPOKE_ERROR_KEYFILE_SIZE:-1104}" "$ORCH_SEVERITY_CRITICAL" \
            "MongoDB keyfile size invalid" "initialization" \
            "Regenerate keyfile: rm $keyfile_path && ./dive spoke deploy $instance_code"
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
# Generate instance configuration (config.json)
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
    if type _get_spoke_ports &>/dev/null; then
        eval "$(_get_spoke_ports "$code_upper")"
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
    # - No complex sync between .env, config.json, docker-compose
    # - Single source of truth in Hub MongoDB
    # - Automatic offline resilience via local cache
    # ==========================================================================

    # Get contact email from env or generate default
    local contact_email="${CONTACT_EMAIL:-admin@${code_lower}.dive25.com}"

    # Hub URL for containers (Docker internal network)
    local hub_url_internal="https://dive-hub-backend:4000"

    # Build URLs
    local base_url="https://localhost:${SPOKE_FRONTEND_PORT}"
    local api_url="https://localhost:${SPOKE_BACKEND_PORT}"
    local idp_url="https://dive-spoke-${code_lower}-keycloak:8443"
    local idp_public_url="https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT}"
    local kas_url="https://localhost:${SPOKE_KAS_PORT}"

    # Create config.json
    # NOTE: spokeId is NOT included - backend queries Hub for this at startup (SSOT)
    cat > "$spoke_dir/config.json" << EOF
{
  "identity": {
    "instanceCode": "$code_upper",
    "name": "$code_upper Instance",
    "description": "DIVE V3 Spoke Instance for $code_upper",
    "country": "$code_upper",
    "organizationType": "government",
    "contactEmail": "$contact_email"
  },
  "endpoints": {
    "hubUrl": "$hub_url_internal",
    "hubApiUrl": "${hub_url_internal}/api",
    "hubOpalUrl": "https://dive-hub-opal-server:7002",
    "baseUrl": "$base_url",
    "apiUrl": "$api_url",
    "idpUrl": "$idp_url",
    "idpPublicUrl": "$idp_public_url",
    "kasUrl": "$kas_url"
  },
  "certificates": {
    "certificatePath": "$spoke_dir/certs/spoke.crt",
    "privateKeyPath": "$spoke_dir/certs/spoke.key",
    "csrPath": "$spoke_dir/certs/spoke.csr",
    "caBundlePath": "$spoke_dir/certs/hub-ca.crt"
  },
  "authentication": {},
  "federation": {
    "status": "unregistered",
    "requestedScopes": [
      "policy:base",
      "policy:${code_lower}",
      "data:federation_matrix",
      "data:trusted_issuers"
    ]
  },
  "operational": {
    "heartbeatIntervalMs": 30000,
    "tokenRefreshBufferMs": 300000,
    "offlineGracePeriodMs": 3600000,
    "policyCachePath": "$spoke_dir/cache/policies",
    "auditQueuePath": "$spoke_dir/cache/audit",
    "maxAuditQueueSize": 10000,
    "auditFlushIntervalMs": 60000
  },
  "metadata": {
    "version": "1.0.0",
    "createdAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "lastModified": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "configHash": ""
  }
}
EOF

    if [ -f "$spoke_dir/config.json" ]; then
        log_success "Configuration generated: $spoke_dir/config.json"

        # Create .env file with config variables
        # NOTE: No SPOKE_ID - backend queries Hub at startup (SSOT architecture)
        spoke_init_generate_env "$instance_code" "$base_url" "$api_url" "$idp_url" "$idp_public_url" "$kas_url" "$hub_url_internal"

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
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-opal-server"; then
            log_verbose "Hub OPAL server detected - provisioning token"
            local hub_env_file="${DIVE_ROOT}/.env.hub"
            local master_token=""

            if [ -f "$hub_env_file" ]; then
                master_token=$(grep "^OPAL_AUTH_MASTER_TOKEN=" "$hub_env_file" 2>/dev/null | cut -d= -f2)
            fi

            if [ -n "$master_token" ]; then
                # Request JWT from OPAL server
                local token_response
                token_response=$(curl -sk --max-time 10 \
                    -X POST "https://localhost:7002/token" \
                    -H "Authorization: Bearer ${master_token}" \
                    -H "Content-Type: application/json" \
                    -d '{"type": "client"}' 2>/dev/null || echo "")

                local opal_token=""
                if [ -n "$token_response" ]; then
                    opal_token=$(echo "$token_response" | jq -r '.token // empty' 2>/dev/null)
                fi

                if [ -n "$opal_token" ] && [[ "$opal_token" =~ ^eyJ ]]; then
                    # Update .env file with the token
                    local env_file="$spoke_dir/.env"
                    if [ -f "$env_file" ]; then
                        sed -i.bak "s|^SPOKE_OPAL_TOKEN=.*|SPOKE_OPAL_TOKEN=$opal_token|" "$env_file"
                        rm -f "$env_file.bak"
                        log_success "✓ OPAL token provisioned during initialization"
                    fi
                else
                    log_warn "Could not get OPAL token from Hub (will retry after container start)"
                    # Set placeholder token to prevent OPAL client from failing during deployment
                    # Real token will be provisioned in configuration phase after federation
                    local env_file="$spoke_dir/.env"
                    # Set placeholder token to prevent OPAL client from failing during deployment
                    # Real token will be provisioned in configuration phase after federation
                    local env_file="$spoke_dir/.env"
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
    else
        orch_record_error "$SPOKE_ERROR_CONFIG_GENERATE" "$ORCH_SEVERITY_CRITICAL" \
            "Failed to generate config.json" "initialization" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_CONFIG_GENERATE $instance_code)"
        return 1
    fi
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
    # Try to fetch from running Hub OPAL server
    if docker ps --format '{{.Names}}' | grep -q "dive-hub-opal-server"; then
        # Check if public key is in Hub OPAL environment
        local public_key=$(docker exec dive-hub-opal-server printenv OPAL_AUTH_PUBLIC_KEY 2>/dev/null | tr -d '\n\r' || echo "")

        if [ -n "$public_key" ] && [ "$public_key" != "# NOT_CONFIGURED" ]; then
            echo "$public_key"
            return 0
        fi
    fi

    # Fallback: Use user's SSH public key (same as NZL does)
    # This is acceptable for local development (not production)
    if [ -f "$HOME/.ssh/id_rsa.pub" ]; then
        local ssh_key=$(cat "$HOME/.ssh/id_rsa.pub" 2>/dev/null | tr -d '\n\r')
        if [ -n "$ssh_key" ]; then
            log_verbose "Using user SSH public key for OPAL authentication (local dev)"
            echo "$ssh_key"
            return 0
        fi
    fi

    # No public key available
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

    # Backup existing file if present
    if [ -f "$env_file" ]; then
        if cp "$env_file" "${env_file}.bak.$(date +%Y%m%d-%H%M%S)" 2>/dev/null; then
            log_verbose "Backed up existing .env, regenerating complete template"
        fi
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
HUB_OPAL_URL=https://dive-hub-opal-server:7002
SPOKE_OPAL_TOKEN=
OPAL_LOG_LEVEL=INFO

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

    log_verbose "Generated .env file: $env_file"
}

# =============================================================================
# DOCKER COMPOSE GENERATION
# =============================================================================

##
# Generate docker-compose.yml from template
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_init_generate_compose() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Generating docker-compose.yml"

    # Use the compose generator module if available
    if type spoke_compose_generate &>/dev/null; then
        spoke_compose_generate "$instance_code" "$spoke_dir"
        return $?
    fi

    # Fallback: Use legacy function if available
    if type _create_spoke_docker_compose &>/dev/null; then
        # Get required parameters
        if type _get_spoke_ports &>/dev/null; then
            eval "$(_get_spoke_ports "$code_upper")"
        fi

        local instance_name="$code_upper Instance"
        local spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$spoke_dir/config.json" 2>/dev/null | head -1 | cut -d'"' -f4 || echo "spoke-${code_lower}")
        local idp_hostname="dive-spoke-${code_lower}-keycloak"
        local api_url="https://localhost:${SPOKE_BACKEND_PORT:-4000}"
        local base_url="https://localhost:${SPOKE_FRONTEND_PORT:-3000}"
        local idp_url="https://${idp_hostname}:8443"

        _create_spoke_docker_compose "$spoke_dir" "$code_upper" "$code_lower" "$instance_name" \
            "$spoke_id" "$idp_hostname" "$api_url" "$base_url" "$idp_url" ""

        return $?
    fi

    # No generator available
    orch_record_error "$SPOKE_ERROR_COMPOSE_GENERATE" "$ORCH_SEVERITY_CRITICAL" \
        "Docker compose generator not available" "initialization" \
        "$(spoke_error_get_remediation $SPOKE_ERROR_COMPOSE_GENERATE $instance_code)"
    return 1
}

# =============================================================================
# CERTIFICATE GENERATION
# =============================================================================

##
# Prepare federation certificates
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_init_prepare_certificates() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Preparing federation certificates"

    # CRITICAL FIX (2026-01-27): Ensure certs/ca directory exists even if certs exist
    # Keycloak requires rootCA.pem in certs/ca/ for truststore initialization
    # Without this, Keycloak crashes on startup with "No such file or directory"
    mkdir -p "$spoke_dir/certs/ca" "$spoke_dir/truststores"

    # Check if certificates already exist
    if [ -f "$spoke_dir/certs/certificate.pem" ] && [ -f "$spoke_dir/certs/key.pem" ]; then
        # CRITICAL: Validate certificate has required SANs for federation
        # Federation requires container name (dive-spoke-{code}-keycloak) in SANs
        # Without this, Hub→Spoke token endpoint calls fail with SSLPeerUnverifiedException
        local required_san="dive-spoke-${code_lower}-keycloak"
        if openssl x509 -in "$spoke_dir/certs/certificate.pem" -text -noout 2>/dev/null | grep -q "$required_san"; then
            log_info "TLS certificates exist and have required SANs - skipping generation"

            # CRITICAL FIX (2026-01-27): Ensure mkcert rootCA.pem is synced even when skipping cert generation
            # This fixes Keycloak crash: "Failed to initialize truststore, could not merge: /opt/keycloak/certs/ca/rootCA.pem"
            if command -v mkcert &>/dev/null; then
                local mkcert_ca="$(mkcert -CAROOT)/rootCA.pem"
                if [ -f "$mkcert_ca" ]; then
                    cp "$mkcert_ca" "$spoke_dir/certs/rootCA.pem" 2>/dev/null || true
                    cp "$mkcert_ca" "$spoke_dir/certs/ca/rootCA.pem" 2>/dev/null || true
                    cp "$mkcert_ca" "$spoke_dir/truststores/mkcert-rootCA.pem" 2>/dev/null || true
                    chmod 644 "$spoke_dir/certs/rootCA.pem" "$spoke_dir/certs/ca/rootCA.pem" 2>/dev/null || true
                    log_verbose "mkcert rootCA.pem synced"
                fi
            fi

            return 0
        else
            log_warn "Existing certificate missing required SAN: $required_san"
            log_warn "Regenerating certificate with federation-compatible SANs..."
            # Backup old certificate
            mv "$spoke_dir/certs/certificate.pem" "$spoke_dir/certs/certificate.pem.backup-$(date +%Y%m%d)" 2>/dev/null || \
                log_verbose "Could not backup old certificate"
            mv "$spoke_dir/certs/key.pem" "$spoke_dir/certs/key.pem.backup-$(date +%Y%m%d)" 2>/dev/null || \
                log_verbose "Could not backup old key"
        fi
    fi

    # ==========================================================================
    # SSOT: Use certificates.sh module for ALL certificate generation
    # ==========================================================================
    # This ensures consistent SANs across all deployment paths
    # FIX (2026-01-15): Consolidated duplicate certificate generation code
    # ==========================================================================

    # Load certificates module (SSOT for all certificate operations)
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"

        # Use SSOT function with comprehensive SANs
        if type generate_spoke_certificate &>/dev/null; then
            if generate_spoke_certificate "$code_lower"; then
                log_success "Federation certificates prepared via SSOT"

                # Sync mkcert root CA (required for TLS trust)
                if type install_mkcert_ca_in_spoke &>/dev/null; then
                    install_mkcert_ca_in_spoke "$code_lower" 2>/dev/null || {
                        # Manual fallback if function unavailable
                        if command -v mkcert &>/dev/null; then
                            local mkcert_ca="$(mkcert -CAROOT)/rootCA.pem"
                            if [ -f "$mkcert_ca" ]; then
                                mkdir -p "$spoke_dir/certs/ca" "$spoke_dir/truststores"
                                cp "$mkcert_ca" "$spoke_dir/certs/rootCA.pem"
                                cp "$mkcert_ca" "$spoke_dir/certs/ca/rootCA.pem"
                                cp "$mkcert_ca" "$spoke_dir/truststores/mkcert-rootCA.pem"
                                chmod 644 "$spoke_dir/certs/rootCA.pem" "$spoke_dir/certs/ca/rootCA.pem"
                                log_success "Synced mkcert CA"
                            fi
                        fi
                    }
                fi

                # ==========================================================================
                # CRITICAL: Generate Java truststore for Keycloak federation
                # ==========================================================================
                # Without this truststore, Keycloak cannot verify TLS certificates for
                # server-to-server calls (tokenUrl, userInfoUrl, jwksUrl) during federation.
                # Error: "PKIX path building failed: unable to find valid certification path"
                # ==========================================================================
                if type generate_spoke_truststore &>/dev/null; then
                    generate_spoke_truststore "$code_lower" || {
                        log_warn "Java truststore generation failed - federation may not work"
                    }
                else
                    # Inline fallback for truststore generation
                    log_verbose "Generating Java truststore (inline fallback)"
                    if command -v keytool &>/dev/null && [ -f "$spoke_dir/certs/ca/rootCA.pem" ]; then
                        rm -f "$spoke_dir/certs/truststore.p12"
                        keytool -importcert -noprompt -trustcacerts \
                            -alias mkcert-ca \
                            -file "$spoke_dir/certs/ca/rootCA.pem" \
                            -keystore "$spoke_dir/certs/truststore.p12" \
                            -storepass changeit \
                            -storetype PKCS12 2>/dev/null && {
                            chmod 644 "$spoke_dir/certs/truststore.p12"
                            log_success "Generated Java truststore for Keycloak federation"
                        } || log_warn "Failed to generate Java truststore"
                    else
                        log_warn "Cannot generate Java truststore (keytool or rootCA.pem missing)"
                    fi
                fi

                return 0
            else
                log_warn "SSOT certificate generation failed, trying fallback..."
            fi
        fi
    fi

    # ==========================================================================
    # FALLBACK ONLY: If SSOT unavailable (should never happen in production)
    # ==========================================================================
    log_warn "certificates.sh module not found - using minimal fallback"
    log_warn "This is NOT recommended - ensure certificates.sh is available"

    if ! command -v mkcert &>/dev/null; then
        log_error "mkcert required but not installed"
        log_error "Install: brew install mkcert && mkcert -install"
        return 1
    fi

    # Minimal certificate generation (missing Hub SANs - federation may fail!)
    log_warn "Generating certificate with INCOMPLETE SANs (Hub SANs missing)"
    mkcert -key-file "$spoke_dir/certs/key.pem" \
           -cert-file "$spoke_dir/certs/certificate.pem" \
           localhost 127.0.0.1 ::1 host.docker.internal \
           "dive-spoke-${code_lower}-keycloak" \
           "keycloak-${code_lower}" 2>/dev/null || return 1

    chmod 600 "$spoke_dir/certs/key.pem"
    chmod 644 "$spoke_dir/certs/certificate.pem"

    # Generate spoke mTLS certificates
    spoke_init_generate_mtls_certs "$instance_code"

    log_success "Certificates prepared"
    return 0
}

##
# Generate mTLS certificates for spoke federation
##
spoke_init_generate_mtls_certs() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    # Generate unique spoke ID
    local spoke_id
    spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$spoke_dir/config.json" 2>/dev/null | head -1 | cut -d'"' -f4 || echo "spoke-${code_lower}")

    log_verbose "Generating mTLS certificates"

    openssl genrsa -out "$spoke_dir/certs/spoke.key" 4096 2>/dev/null
    openssl req -new \
        -key "$spoke_dir/certs/spoke.key" \
        -out "$spoke_dir/certs/spoke.csr" \
        -subj "/C=${code_upper:0:2}/O=DIVE Federation/OU=Spoke Instances/CN=$spoke_id" 2>/dev/null
    openssl x509 -req -days 365 \
        -in "$spoke_dir/certs/spoke.csr" \
        -signkey "$spoke_dir/certs/spoke.key" \
        -out "$spoke_dir/certs/spoke.crt" 2>/dev/null

    chmod 600 "$spoke_dir/certs/spoke.key"
    chmod 644 "$spoke_dir/certs/spoke.crt"
    chmod 644 "$spoke_dir/certs/spoke.csr"
}

# =============================================================================
# TERRAFORM CONFIGURATION
# =============================================================================

##
# Apply Terraform configuration for Keycloak realm/client
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_init_apply_terraform() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Applying Terraform configuration"

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
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/terraform.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/configuration/terraform.sh"

        # Check if terraform_spoke function exists
        if type terraform_spoke &>/dev/null; then
            log_verbose "Initializing Terraform workspace"
            if ! terraform_spoke init "$code_upper"; then
                log_warn "Terraform init failed"
                orch_record_error "$SPOKE_ERROR_TERRAFORM_INIT" "$ORCH_SEVERITY_MEDIUM" \
                    "Terraform init failed" "initialization" \
                    "$(spoke_error_get_remediation $SPOKE_ERROR_TERRAFORM_INIT $instance_code)"
                return 1
            fi

            log_verbose "Applying Terraform configuration"
            if ! terraform_spoke apply "$code_upper"; then
                log_warn "Terraform apply failed"
                orch_record_error "$SPOKE_ERROR_TERRAFORM_APPLY" "$ORCH_SEVERITY_MEDIUM" \
                    "Terraform apply failed" "initialization" \
                    "$(spoke_error_get_remediation $SPOKE_ERROR_TERRAFORM_APPLY $instance_code)"
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
# DRIFT DETECTION
# =============================================================================

##
# Check for template drift and auto-update if needed
#
# Arguments:
#   $1 - Instance code
##
spoke_init_check_drift() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    # Load drift detection module if available
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-drift.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-drift.sh"
    fi

    if type spoke_check_drift &>/dev/null; then
        log_step "Checking template version drift..."

        local drift_result
        spoke_check_drift "$code_upper" 2>&1 | tee /tmp/drift-check.log
        drift_result=${PIPESTATUS[0]}

        if [ $drift_result -eq 1 ] || [ $drift_result -eq 2 ]; then
            log_warn "Template drift detected - auto-updating to latest version"

            if type spoke_update_compose &>/dev/null; then
                if spoke_update_compose "$code_upper"; then
                    log_success "Auto-updated to latest template"
                else
                    log_warn "Auto-update failed - deployment may use outdated template"
                fi
            fi
        else
            log_success "Template up-to-date (no drift)"
        fi
    else
        log_verbose "Drift detection not available"
    fi
}

# =============================================================================
# CHECKPOINT VALIDATION
# =============================================================================

##
# Validate initialization phase completed successfully
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Validation passed
#   1 - Validation failed
##
spoke_checkpoint_initialization() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_verbose "Validating initialization checkpoint for $instance_code"

    # Check directory structure
    if [ ! -d "$spoke_dir" ]; then
        log_error "Checkpoint FAILED: Instance directory missing: $spoke_dir"
        return 1
    fi

    if [ ! -d "$spoke_dir/certs" ]; then
        log_error "Checkpoint FAILED: Certs directory missing"
        return 1
    fi

    # Check keyfile is file (not directory) - CRITICAL
    if [ ! -f "$spoke_dir/mongo-keyfile" ]; then
        log_error "Checkpoint FAILED: MongoDB keyfile missing"
        return 1
    fi

    if [ -d "$spoke_dir/mongo-keyfile" ]; then
        log_error "Checkpoint FAILED: MongoDB keyfile is a directory (must be file)"
        return 1
    fi

    # Check keyfile size
    local keyfile_size=$(wc -c < "$spoke_dir/mongo-keyfile" | tr -d ' ')
    if [ "$keyfile_size" -lt 6 ] || [ "$keyfile_size" -gt 1024 ]; then
        log_error "Checkpoint FAILED: MongoDB keyfile size invalid: ${keyfile_size} bytes"
        return 1
    fi

    # Check config files exist
    if [ ! -f "$spoke_dir/config.json" ]; then
        log_error "Checkpoint FAILED: config.json missing"
        return 1
    fi

    if [ ! -f "$spoke_dir/.env" ]; then
        log_error "Checkpoint FAILED: .env file missing"
        return 1
    fi

    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Checkpoint FAILED: docker-compose.yml missing"
        return 1
    fi

    log_verbose "✓ Initialization checkpoint passed"
    return 0
}

export SPOKE_PHASE_INITIALIZATION_LOADED=1
