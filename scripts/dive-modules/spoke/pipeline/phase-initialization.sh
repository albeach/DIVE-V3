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
if [ -n "$SPOKE_PHASE_INITIALIZATION_LOADED" ]; then
    return 0
fi
export SPOKE_PHASE_INITIALIZATION_LOADED=1

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

    log_info "Initialization phase for $code_upper"

    # Step 1: Check if already initialized (redeploy mode skips some steps)
    local init_marker="${spoke_dir}/.initialized"
    local needs_full_init=true

    if [ -f "$spoke_dir/docker-compose.yml" ] && [ -f "$spoke_dir/config.json" ]; then
        needs_full_init=false
        log_info "Instance already initialized at: $spoke_dir"

        # Step 1b: Check for template drift
        spoke_init_check_drift "$instance_code"
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

    # Step 3: Certificate generation/validation
    if ! spoke_init_prepare_certificates "$instance_code"; then
        log_warn "Certificate preparation had issues (continuing)"
    fi

    # NOTE: Terraform application moved to CONFIGURATION phase (after containers are running)

    # Create initialization checkpoint
    if type orch_create_checkpoint &>/dev/null; then
        orch_create_checkpoint "$instance_code" "INITIALIZATION" "Initialization phase completed"
    fi

    log_success "Initialization phase complete"
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
        return 0
    else
        orch_record_error "$SPOKE_ERROR_DIRECTORY_SETUP" "$ORCH_SEVERITY_CRITICAL" \
            "Failed to create instance directories" "initialization" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_DIRECTORY_SETUP $instance_code)"
        return 1
    fi
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

    # Generate unique spoke ID
    local spoke_id="spoke-${code_lower}-$(openssl rand -hex 4)"

    # Get contact email from env or generate default
    local contact_email="${CONTACT_EMAIL:-admin@${code_lower}.dive25.com}"

    # Get Hub URL from env or use default
    local hub_url="${HUB_URL:-https://localhost:4000}"

    # Build URLs
    local base_url="https://localhost:${SPOKE_FRONTEND_PORT}"
    local api_url="https://localhost:${SPOKE_BACKEND_PORT}"
    local idp_url="https://dive-spoke-${code_lower}-keycloak:8443"
    local idp_public_url="https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT}"
    local kas_url="https://localhost:${SPOKE_KAS_PORT}"

    # Create config.json
    cat > "$spoke_dir/config.json" << EOF
{
  "identity": {
    "spokeId": "$spoke_id",
    "instanceCode": "$code_upper",
    "name": "$code_upper Instance",
    "description": "DIVE V3 Spoke Instance for $code_upper",
    "country": "$code_upper",
    "organizationType": "government",
    "contactEmail": "$contact_email"
  },
  "endpoints": {
    "hubUrl": "$hub_url",
    "hubApiUrl": "${hub_url}/api",
    "hubOpalUrl": "${hub_url//:4000/:7002}",
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

        # Also create .env file with GCP secret references
        spoke_init_generate_env "$instance_code" "$spoke_id" "$base_url" "$api_url" "$idp_url" "$idp_public_url" "$kas_url" "$hub_url"

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
    local instance_code="$1"
    local spoke_id="$2"
    local base_url="$3"
    local api_url="$4"
    local idp_url="$5"
    local idp_public_url="$6"
    local kas_url="$7"
    local hub_url="$8"

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
        # Leave empty - docker-compose will use unset variable, OPAL client handles gracefully
        opal_public_key=""
    fi

    # CRITICAL: Always ensure OPAL_AUTH_PUBLIC_KEY is set (even in existing .env)
    # This fixes the OPAL client crash issue for all spokes
    if [ -f "$env_file" ]; then
        log_verbose ".env file already exists, ensuring OPAL key is set"

        # Check if OPAL_AUTH_PUBLIC_KEY exists
        if grep -q "^OPAL_AUTH_PUBLIC_KEY=" "$env_file"; then
            local existing_key=$(grep "^OPAL_AUTH_PUBLIC_KEY=" "$env_file" | cut -d'=' -f2- | tr -d '"')

            # If existing key is empty, invalid placeholder, or missing, update it
            if [ -z "$existing_key" ] || [ "$existing_key" = "# NOT_CONFIGURED" ] || [ "$existing_key" = '${OPAL_AUTH_PUBLIC_KEY}' ]; then
                if [ -n "$opal_public_key" ]; then
                    sed -i.bak "s|^OPAL_AUTH_PUBLIC_KEY=.*|OPAL_AUTH_PUBLIC_KEY=\"$opal_public_key\"|" "$env_file"
                    rm -f "${env_file}.bak"
                    log_success "Updated OPAL_AUTH_PUBLIC_KEY in existing .env (was invalid)"
                fi
            else
                log_verbose "OPAL_AUTH_PUBLIC_KEY already set in .env (preserving)"
            fi
        else
            # OPAL_AUTH_PUBLIC_KEY doesn't exist - add it
            if [ -n "$opal_public_key" ]; then
                echo "" >> "$env_file"
                echo "# OPAL Authentication (auto-added by Phase 2 fix)" >> "$env_file"
                echo "OPAL_AUTH_PUBLIC_KEY=\"$opal_public_key\"" >> "$env_file"
                log_success "Added OPAL_AUTH_PUBLIC_KEY to existing .env"
            else
                log_warn "OPAL public key not available, OPAL client will use no-auth mode"
            fi
        fi

        return 0
    fi

    cat > "$env_file" << EOF
# ${code_upper} Spoke Configuration (GCP Secret Manager references)
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Secrets loaded from GCP Secret Manager at runtime

# GCP Project for secrets
GCP_PROJECT=${GCP_PROJECT:-dive25}

# Instance identification
SPOKE_ID=$spoke_id
INSTANCE_CODE=$code_upper

# URLs and endpoints (public configuration)
APP_URL=$base_url
API_URL=$api_url
IDP_URL=$idp_url
IDP_PUBLIC_URL=$idp_public_url
KAS_URL=$kas_url
HUB_URL=$hub_url

# Federation configuration
# CRITICAL FIX (2026-01-14): Use internal Docker network URL for Hub OPAL server
# External domain (hub.dive25.com) not reachable from local containers
# OPAL client needs WebSocket connection to Hub OPAL server on dive-shared network
# CRITICAL FIX (2026-01-15): Hub OPAL server uses TLS - must use https:// not http://
HUB_OPAL_URL=https://dive-hub-opal-server:7002
SPOKE_OPAL_TOKEN=
OPAL_LOG_LEVEL=INFO

# OPAL Authentication (public key from Hub OPAL server)
# CRITICAL FIX: OPAL client requires valid public key for authentication
# Fetched from Hub OPAL server at deployment time
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
#
# Use './dive secrets create ${code_upper}' to generate missing secrets
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

    # Check if certificates already exist
    if [ -f "$spoke_dir/certs/certificate.pem" ] && [ -f "$spoke_dir/certs/key.pem" ]; then
        log_info "TLS certificates already exist - skipping generation"
        return 0
    fi

    # Load certificates module if available
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"

        if type prepare_federation_certificates &>/dev/null; then
            if prepare_federation_certificates "$code_lower"; then
                log_success "Federation certificates prepared"
                return 0
            fi
        fi
    fi

    # Fallback: Generate self-signed certificates
    log_info "Generating self-signed TLS certificates"

    # Generate using mkcert if available (better for local dev)
    if command -v mkcert &>/dev/null; then
        log_verbose "Using mkcert for locally-trusted certificates"
        mkcert -key-file "$spoke_dir/certs/key.pem" \
               -cert-file "$spoke_dir/certs/certificate.pem" \
               localhost 127.0.0.1 ::1 host.docker.internal \
               "dive-spoke-${code_lower}-keycloak" \
               "dive-spoke-${code_lower}-backend" \
               "dive-spoke-${code_lower}-frontend" \
               "keycloak-${code_lower}" \
               "${code_lower}-idp.dive25.com" \
               "${code_lower}-api.dive25.com" \
               "backend-${code_lower}" \
               "frontend-${code_lower}" 2>/dev/null

        # CRITICAL: Always sync mkcert root CA from current mkcert installation
        # This prevents CA mismatch when:
        # - Switching development machines
        # - Regenerating certificates after CA rotation
        # - Adding spokes on different machines
        # FIX (2026-01-14): Ensures CA matches service certificate issuer
        local mkcert_ca="$(mkcert -CAROOT)/rootCA.pem"
        if [ -f "$mkcert_ca" ]; then
            # Sync to all CA locations
            cp "$mkcert_ca" "$spoke_dir/certs/rootCA.pem"
            mkdir -p "$spoke_dir/certs/ca"
            cp "$mkcert_ca" "$spoke_dir/certs/ca/rootCA.pem"
            cp "$mkcert_ca" "$spoke_dir/truststores/mkcert-rootCA.pem"
            chmod 644 "$spoke_dir/certs/rootCA.pem"
            chmod 644 "$spoke_dir/certs/ca/rootCA.pem"

            log_success "Synced current mkcert CA (prevents certificate chain mismatch)"
        else
            log_warn "mkcert CA not found at: $(mkcert -CAROOT)"
        fi
    else
        # Fallback to OpenSSL self-signed
        log_warn "mkcert not found, using self-signed certificate (browser warnings expected)"
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$spoke_dir/certs/key.pem" \
            -out "$spoke_dir/certs/certificate.pem" \
            -subj "/CN=localhost/O=DIVE-V3/C=US" \
            -addext "subjectAltName=DNS:localhost,DNS:dive-spoke-${code_lower}-keycloak,DNS:keycloak-${code_lower},IP:127.0.0.1" 2>/dev/null
    fi

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
