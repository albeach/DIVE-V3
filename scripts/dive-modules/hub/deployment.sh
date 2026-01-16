#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub Deployment Sub-Module
# =============================================================================
# Hub deployment functions: init, up, down, deploy, reset, seed
# Direct-loaded by hub.sh for immediate availability
# =============================================================================

# =============================================================================
# DEPLOYMENT CONSTANTS
# =============================================================================

HUB_COMPOSE_FILE="${DIVE_ROOT}/docker-compose.hub.yml"
HUB_DATA_DIR="${DIVE_ROOT}/data/hub"
HUB_CERTS_DIR="${DIVE_ROOT}/keycloak/certs"
HUB_LOGS_DIR="${DIVE_ROOT}/logs/hub"

# Hub API endpoints
HUB_BACKEND_URL="https://localhost:${BACKEND_PORT:-4000}"
HUB_OPAL_URL="https://localhost:${OPAL_PORT:-7002}"
HUB_KEYCLOAK_URL="https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}"
HUB_OPA_URL="https://localhost:${OPA_PORT:-8181}"

# Federation admin key (for API calls)
FEDERATION_ADMIN_KEY="${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}"hub_init() {
    print_header
    echo -e "${BOLD}Initializing DIVE Hub${NC}"
    echo ""

    ensure_dive_root

    # 1. Create hub data directories
    log_step "Creating hub directories..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "mkdir -p ${HUB_DATA_DIR}/{config,certs,policies,audit}"
        log_dry "mkdir -p ${HUB_LOGS_DIR}"
    else
        mkdir -p "${HUB_DATA_DIR}"/{config,certs,policies,audit}
        mkdir -p "${HUB_LOGS_DIR}"
        log_success "Hub directories created"
    fi

    # 2. Generate secrets if not present
    log_step "Checking secrets..."
    if [ ! -f "${DIVE_ROOT}/.env.hub" ]; then
        log_info "Generating ephemeral secrets for hub..."
        _hub_generate_secrets
    else
        log_success "Secrets already configured (using existing .env.hub)"
    fi

    # 3. Generate certificates if not present
    log_step "Checking certificates..."
    if [ ! -f "${HUB_CERTS_DIR}/certificate.pem" ] || [ ! -f "${HUB_CERTS_DIR}/key.pem" ]; then
        log_info "Generating TLS certificates..."
        if [ "$DRY_RUN" = true ]; then
            log_dry "Running generate-dev-certs.sh"
        else
            _hub_generate_certs
        fi
    else
        log_success "TLS certificates present"
    fi

    # 4. Create hub configuration file
    log_step "Creating hub configuration..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would create ${HUB_DATA_DIR}/config/hub.json"
    else
        _hub_create_config
    fi

    # 5. Verify compose file
    log_step "Verifying docker-compose.hub.yml..."
    if [ ! -f "$HUB_COMPOSE_FILE" ]; then
        log_error "Hub compose file not found at ${HUB_COMPOSE_FILE}"
        return 1
    else
        log_success "Compose file verified"
    fi

    echo ""
    log_success "Hub initialization complete"
    echo ""
    echo "  Config: ${HUB_DATA_DIR}/config/hub.json"
    echo "  Certs:  ${HUB_CERTS_DIR}"
    echo "  Logs:   ${HUB_LOGS_DIR}"
    echo ""
    echo "Next: Run './dive hub up' to start services"
}
_hub_generate_secrets() {
    export KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-$(openssl rand -base64 16 | tr -d '/+=')}"
    export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -base64 12 | tr -d '/+=')}"
    export MONGO_PASSWORD="${MONGO_PASSWORD:-$(openssl rand -base64 12 | tr -d '/+=')}"
    export AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -base64 32)}"
    export KEYCLOAK_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-$(openssl rand -base64 24 | tr -d '/+=')}"
    export FEDERATION_ADMIN_KEY="${FEDERATION_ADMIN_KEY:-$(openssl rand -base64 24 | tr -d '/+=')}"
    export REDIS_PASSWORD_USA="${REDIS_PASSWORD_USA:-$(openssl rand -base64 16 | tr -d '/+=')}"
    export REDIS_PASSWORD_BLACKLIST="${REDIS_PASSWORD_BLACKLIST:-$(openssl rand -base64 16 | tr -d '/+=')}"
    export OPAL_AUTH_MASTER_TOKEN="${OPAL_AUTH_MASTER_TOKEN:-$(openssl rand -base64 32 | tr -d '/+=')}"

    # Save to .env.hub for reference (do not commit)
    cat > "${DIVE_ROOT}/.env.hub" << EOF
# Hub Secrets (auto-generated, do not commit)
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
MONGO_PASSWORD=${MONGO_PASSWORD}
AUTH_SECRET=${AUTH_SECRET}
KEYCLOAK_CLIENT_SECRET=${KEYCLOAK_CLIENT_SECRET}
FEDERATION_ADMIN_KEY=${FEDERATION_ADMIN_KEY}
REDIS_PASSWORD_USA=${REDIS_PASSWORD_USA}
REDIS_PASSWORD_BLACKLIST=${REDIS_PASSWORD_BLACKLIST}
OPAL_AUTH_MASTER_TOKEN=${OPAL_AUTH_MASTER_TOKEN}
EOF
    chmod 600 "${DIVE_ROOT}/.env.hub"
    log_info "Secrets saved to .env.hub (gitignored)"
}
_hub_generate_certs() {
    # ==========================================================================
    # SSOT: Use certificates.sh module for Hub certificate generation
    # ==========================================================================
    # FIX (2026-01-15): Consolidated Hub certificate generation to SSOT
    # Ensures consistent wildcard SANs for all spoke federation
    # ==========================================================================

    mkdir -p "${HUB_CERTS_DIR}"
    mkdir -p "${HUB_DATA_DIR}/truststores"

    # Load certificates module (SSOT)
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"

        # Use SSOT function for Hub certificate
        if type update_hub_certificate_sans &>/dev/null; then
            log_info "Generating Hub certificate via SSOT (wildcard SANs)..."
            if update_hub_certificate_sans; then
                log_success "Hub certificate generated via SSOT"

                # Install mkcert CA in Hub truststore (SSOT function)
                if type install_mkcert_ca_in_hub &>/dev/null; then
                    install_mkcert_ca_in_hub || {
                        log_warn "CA installation had issues (non-critical)"
                    }
                fi

                return 0
            else
                log_warn "SSOT Hub certificate generation failed, trying fallback..."
            fi
        fi
    fi

    # ==========================================================================
    # FALLBACK: Use generate-dev-certs.sh if SSOT unavailable
    # ==========================================================================
    log_warn "Using fallback certificate generation (generate-dev-certs.sh)"

    cd "${DIVE_ROOT}"
    COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dive-hub}" \
    CERT_HOST_SCOPE="${CERT_HOST_SCOPE:-full}" \
    SKIP_CERT_REGEN_IF_PRESENT=false \
    bash "${DIVE_ROOT}/scripts/generate-dev-certs.sh" 2>/dev/null || {
        log_error "Certificate generation failed"
        log_error "Install mkcert: brew install mkcert && mkcert -install"
        return 1
    }

    log_success "TLS certificates generated via fallback"
}
_hub_create_config() {
    local config_file="${HUB_DATA_DIR}/config/hub.json"
    local hub_id="hub-$(openssl rand -hex 4)"

    cat > "$config_file" << EOF
{
  "identity": {
    "hubId": "${hub_id}",
    "name": "DIVE V3 Federation Hub",
    "description": "Central policy management and federation hub",
    "version": "1.0.0"
  },
  "endpoints": {
    "baseUrl": "https://hub.dive25.com",
    "apiUrl": "https://hub.dive25.com/api",
    "opalUrl": "https://hub.dive25.com:7002",
    "keycloakUrl": "https://hub.dive25.com:8443"
  },
  "federation": {
    "enabled": true,
    "allowAutoApproval": false,
    "requireCertificate": false,
    "defaultTrustLevel": "development",
    "defaultScopes": ["policy:read", "heartbeat:write"],
    "tokenValidityMs": 86400000
  },
  "policy": {
    "gitRepo": "",
    "branch": "main",
    "syncIntervalMs": 60000,
    "layers": ["base", "coalition", "tenant"]
  },
  "security": {
    "requireMTLS": false,
    "allowedCipherSuites": ["TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256"],
    "minTLSVersion": "1.2"
  },
  "monitoring": {
    "metricsEnabled": true,
    "healthCheckIntervalMs": 30000,
    "alertWebhookUrl": ""
  },
  "metadata": {
    "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "lastModified": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }
}
hub_deploy() {
    print_header
    echo -e "${BOLD}DIVE Hub Deployment${NC}"
    echo ""

    ensure_dive_root
    check_docker || return 1

    # Step 1: Initialize
    log_step "Step 1/7: Initializing hub..."
    hub_init || return 1

    # Step 2: Load secrets (GCP SSOT)
    log_step "Step 2/7: Loading secrets (GCP SSOT)..."

    # Try GCP Secret Manager first (SSOT)
    if check_gcloud && load_gcp_secrets "usa"; then
        log_success "✓ Loaded secrets from GCP Secret Manager (SSOT)"

        # Update .env.hub with GCP values for consistency
        if [ -f "${DIVE_ROOT}/.env.hub" ]; then
            log_info "Syncing GCP secrets → .env.hub"
            cp "${DIVE_ROOT}/.env.hub" "${DIVE_ROOT}/.env.hub.bak.$(date +%Y%m%d-%H%M%S)"
        fi

        # Write GCP secrets to .env.hub
        cat > "${DIVE_ROOT}/.env.hub" << EOF
# Hub Secrets (from GCP Secret Manager SSOT)
# Last synced: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Docker Compose Variables (no suffix - used by services)
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
KC_ADMIN=admin
KC_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
MONGO_PASSWORD=${MONGO_PASSWORD}
AUTH_SECRET=${AUTH_SECRET}
KEYCLOAK_CLIENT_SECRET=${KEYCLOAK_CLIENT_SECRET}
JWT_SECRET=${JWT_SECRET:-$(openssl rand -base64 32)}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-${AUTH_SECRET}}
REDIS_PASSWORD_USA=${REDIS_PASSWORD:-$(openssl rand -base64 16 | tr -d '/+=')}
REDIS_PASSWORD_BLACKLIST=${REDIS_PASSWORD_BLACKLIST:-$(openssl rand -base64 16 | tr -d '/+=')}
OPAL_AUTH_MASTER_TOKEN=${OPAL_AUTH_MASTER_TOKEN:-$(openssl rand -base64 32 | tr -d '/+=')}
FEDERATION_ADMIN_KEY=${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}

# Archive Suffixed Variables (for reference)
POSTGRES_PASSWORD_USA=${POSTGRES_PASSWORD}
KEYCLOAK_ADMIN_PASSWORD_USA=${KEYCLOAK_ADMIN_PASSWORD}
MONGO_PASSWORD_USA=${MONGO_PASSWORD}
AUTH_SECRET_USA=${AUTH_SECRET}
KEYCLOAK_CLIENT_SECRET_USA=${KEYCLOAK_CLIENT_SECRET}
EOF
        chmod 600 "${DIVE_ROOT}/.env.hub"
        log_success "✓ .env.hub synced with GCP secrets"

    elif [ -f "${DIVE_ROOT}/.env.hub" ]; then
        # Fallback to .env.hub if GCP unavailable
        log_warn "GCP unavailable - using local .env.hub (may be stale)"
        log_warn "For SSOT persistence, authenticate: gcloud auth application-default login"
        set -a
        source "${DIVE_ROOT}/.env.hub"
        set +a
        log_info "Secrets loaded from .env.hub"
    else
        # Generate new secrets and push to GCP
        log_info "No secrets found - generating new secrets..."
        _hub_generate_secrets

        # Push to GCP if authenticated
        if check_gcloud; then
            log_step "Pushing new secrets to GCP (establishing SSOT)..."
            source "${DIVE_ROOT}/scripts/dive-modules/secrets.sh"
            secrets_push "usa"
        else
            log_warn "gcloud not authenticated - secrets only in .env.hub"
            log_warn "Run 'gcloud auth application-default login' to enable GCP SSOT"
        fi
    fi

    # Step 3: Start services
    log_step "Step 3/7: Starting hub services..."
    hub_up || return 1

    # Step 4: Wait for services
    log_step "Step 4/7: Waiting for services to be healthy..."
    _hub_wait_all_healthy || return 1

    # Step 5: Apply Terraform (if available)
    log_step "Step 5/7: Applying Keycloak configuration..."
    if [ -d "${DIVE_ROOT}/terraform/hub" ]; then
        _hub_apply_terraform || log_warn "Terraform apply skipped or failed"
    else
        log_info "No Terraform config found, skipping"
    fi

    # Step 6: Seed test users and resources
    log_step "Step 6/8: Seeding test users and 5000 ZTDF resources..."
    if [ -d "${DIVE_ROOT}/scripts/hub-init" ]; then
        hub_seed 5000 || log_warn "Seeding failed - you can run './dive hub seed' later"
    else
        log_info "Hub seed scripts not found, skipping"
    fi

    # Step 7: Sync AMR attributes (CRITICAL for MFA)
    log_step "Step 7/8: Syncing AMR attributes for MFA users..."
    local sync_amr_script="${DIVE_ROOT}/scripts/sync-amr-attributes.sh"
    if [ -f "$sync_amr_script" ]; then
        if bash "$sync_amr_script" --realm "dive-v3-broker-usa" 2>/dev/null; then
            log_success "AMR attributes synchronized"
        else
            log_warn "AMR sync completed with warnings (non-blocking)"
        fi
    else
        log_warn "sync-amr-attributes.sh not found - skipping AMR sync"
    fi

    # Step 8: Verify deployment
    log_step "Step 8/8: Verifying deployment..."
    _hub_verify_deployment || log_warn "Some verification checks failed"

    echo ""
    log_success "Hub deployment complete!"
    echo ""
    hub_status_brief
}
_hub_wait_all_healthy() {
    local timeout=180
    local elapsed=0
    local services=("keycloak" "backend" "opal-server" "opa" "mongodb" "postgres" "redis" "redis-blacklist")

    log_info "Waiting for all services to be healthy (up to ${timeout}s)..."

    while [ $elapsed -lt $timeout ]; do
        local all_healthy=true

        for service in "${services[@]}"; do
            local container="${COMPOSE_PROJECT_NAME:-dive-hub}-${service}"
            local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "not_found")

            if [ "$health" != "healthy" ]; then
                all_healthy=false
                break
            fi
        done

        if [ "$all_healthy" = true ]; then
            log_success "All services healthy"
            return 0
        fi

        sleep 5
        elapsed=$((elapsed + 5))
        echo "  ${elapsed}s elapsed..."
    done

    log_warn "Timeout waiting for services to be healthy"
    return 1
}
_hub_apply_terraform() {
    local tf_dir="${DIVE_ROOT}/terraform/hub"

    if [ ! -d "$tf_dir" ]; then
        log_info "No Terraform directory found at ${tf_dir}"
        return 0
    fi

    log_info "Applying Terraform configuration (MFA + federation clients)..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "cd ${tf_dir} && terraform init && terraform apply -auto-approve"
        return 0
    fi

    # ==========================================================================
    # Generate Dynamic Federation Partners Configuration
    # ==========================================================================
    # Scan instances/ directory for deployed spokes and generate federation_partners
    # for hub.auto.tfvars. This creates incoming federation clients automatically.
    # ==========================================================================

    log_step "Scanning for deployed spokes..."
    local federation_partners_hcl=$'{\n'
    local spokes_found=0

    if [ -d "${DIVE_ROOT}/instances" ]; then
        for spoke_dir in "${DIVE_ROOT}/instances/"*/; do
            [ ! -d "$spoke_dir" ] && continue

            local spoke_code=$(basename "$spoke_dir" | tr '[:lower:]' '[:upper:]')
            local config_file="${spoke_dir}config.json"

            # Skip if no config.json (not a valid spoke)
            [ ! -f "$config_file" ] && continue

            log_verbose "  Found spoke: ${spoke_code}"

            # Extract spoke metadata from config.json
            local spoke_name=$(jq -r '.name // "Unknown"' "$config_file" 2>/dev/null || echo "Unknown")
            local spoke_port=$(jq -r '.keycloak_https_port // 8443' "$config_file" 2>/dev/null || echo "8443")
            local container_name="dive-spoke-${spoke_code,,}-keycloak"

            # Load federation secret from GCP (if available)
            local federation_secret=""
            if check_gcloud; then
                local secret_name="dive-v3-federation-usa-${spoke_code,,}"
                federation_secret=$(gcloud secrets versions access latest \
                    --secret="$secret_name" --project=dive25 2>/dev/null || echo "")

                if [ -n "$federation_secret" ]; then
                    log_verbose "    ✓ Loaded secret from GCP: ${secret_name}"
                else
                    log_verbose "    ⚠ No GCP secret found: ${secret_name}"
                fi
            fi

            # Generate HCL entry for this spoke (using $'...\n...' for proper newlines)
            federation_partners_hcl+=$'  \"'${spoke_code,,}$'\" = {\n'
            federation_partners_hcl+=$'    instance_code         = \"'${spoke_code}$'\"\n'
            federation_partners_hcl+=$'    instance_name         = \"'${spoke_name}$'\"\n'
            federation_partners_hcl+=$'    idp_url               = \"https://localhost:'${spoke_port}$'\"\n'
            federation_partners_hcl+=$'    idp_internal_url      = \"https://'${container_name}$':8443\"\n'
            federation_partners_hcl+=$'    enabled               = true\n'
            federation_partners_hcl+=$'    client_secret         = \"'${federation_secret}$'\"\n'
            federation_partners_hcl+=$'    disable_trust_manager = true\n'
            federation_partners_hcl+=$'  }\n'

            spokes_found=$((spokes_found + 1))
        done
    fi

    federation_partners_hcl+=$'}'

    log_info "Discovered ${spokes_found} spoke(s) for federation"

    # ==========================================================================
    # Generate Incoming Federation Secrets Map
    # ==========================================================================
    # These are the secrets spokes use to authenticate TO the Hub.
    # GCP Secret Name: dive-v3-federation-usa-{spoke}
    # ==========================================================================

    local incoming_secrets_hcl=$'{\n'

    if check_gcloud && [ $spokes_found -gt 0 ]; then
        log_step "Loading incoming federation secrets from GCP..."

        for spoke_dir in "${DIVE_ROOT}/instances/"*/; do
            [ ! -d "$spoke_dir" ] && continue
            local spoke_code=$(basename "$spoke_dir" | tr '[:lower:]' '[:upper:]')
            [ ! -f "${spoke_dir}config.json" ] && continue

            local secret_name="dive-v3-federation-usa-${spoke_code,,}"
            local secret_value=$(gcloud secrets versions access latest \
                --secret="$secret_name" --project=dive25 2>/dev/null || echo "")

            if [ -n "$secret_value" ]; then
                incoming_secrets_hcl+=$'  \"'${spoke_code,,}$'\" = \"'${secret_value}$'\"\n'
                log_verbose "  ✓ ${spoke_code}: ${secret_name}"
            fi
        done

        log_success "Loaded ${spokes_found} federation secret(s)"
    fi

    incoming_secrets_hcl+=$'}'

    # ==========================================================================
    # Write hub.auto.tfvars (Auto-generated Federation Config)
    # ==========================================================================
    cat > "${tf_dir}/hub.auto.tfvars" << EOF
# =============================================================================
# Auto-generated Hub Federation Configuration
# =============================================================================
# Generated by: hub.sh deployment script
# Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Spokes Found: ${spokes_found}
#
# This file is regenerated on every 'dive hub deploy' to reflect current
# spoke registrations from the instances/ directory.
# =============================================================================

# Federation Partners (Spokes)
federation_partners = ${federation_partners_hcl}

# Incoming Federation Secrets (from GCP Secret Manager)
incoming_federation_secrets = ${incoming_secrets_hcl}
EOF

    log_success "Generated hub.auto.tfvars with ${spokes_found} federation partner(s)"

    # ==========================================================================
    # Apply Terraform
    # ==========================================================================
    (
        cd "$tf_dir"

        # Initialize if needed
        if [ ! -d ".terraform" ]; then
            log_verbose "Initializing Terraform..."
            terraform init -input=false -upgrade
        fi

        # Export secrets as TF_VAR_ environment variables
        export TF_VAR_keycloak_admin_password="${KEYCLOAK_ADMIN_PASSWORD}"
        export TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET}"
        export TF_VAR_test_user_password="${TEST_USER_PASSWORD:-DiveTestSecure2025!}"
        export TF_VAR_admin_user_password="${ADMIN_PASSWORD:-DiveAdminSecure2025!}"
        export KEYCLOAK_USER="${KEYCLOAK_ADMIN_USERNAME:-admin}"
        export KEYCLOAK_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD}"

        # Apply with hub.tfvars + hub.auto.tfvars (auto-loaded)
        log_verbose "Running terraform apply..."
        terraform apply -var-file=hub.tfvars -input=false -auto-approve
    ) || {
        log_warn "Terraform apply failed"
        return 1
    }

    log_success "Terraform configuration applied"

    if [ $spokes_found -gt 0 ]; then
        log_success "Created incoming federation clients for ${spokes_found} spoke(s)"
        log_info "Spokes can now federate TO the Hub using dive-v3-broker-{spoke} clients"
    fi

    # Disable Review Profile in First Broker Login flow (best practice for federation)
    _hub_disable_review_profile || log_warn "Could not disable Review Profile"
}
_hub_disable_review_profile() {
    local keycloak_url="${HUB_KEYCLOAK_URL}"
    local realm="dive-v3-broker-usa"

    # Get admin token
    local admin_password
    admin_password=$(docker exec dive-hub-keycloak printenv KC_ADMIN_PASSWORD 2>/dev/null | tr -d '\r\n')

    if [ -z "$admin_password" ]; then
        log_warn "Cannot get Keycloak admin password"
        return 1
    fi

    local token
    token=$(curl -sk -X POST "${keycloak_url}/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${admin_password}" \
        -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_warn "Cannot authenticate to Keycloak"
        return 1
    fi

    log_info "Disabling Review Profile in First Broker Login flow..."

    # Get the Review Profile execution details
    local exec_json
    exec_json=$(curl -sk -H "Authorization: Bearer $token" \
        "${keycloak_url}/admin/realms/${realm}/authentication/flows/first%20broker%20login/executions" 2>/dev/null | \
        jq '.[] | select(.providerId == "idp-review-profile")')

    if [ -z "$exec_json" ]; then
        log_warn "Review Profile execution not found"
        return 1
    fi

    local current_req
    current_req=$(echo "$exec_json" | jq -r '.requirement')

    if [ "$current_req" = "DISABLED" ]; then
        log_info "Review Profile already DISABLED"
        return 0
    fi

    # Update to DISABLED
    local update_payload
    update_payload=$(echo "$exec_json" | jq '.requirement = "DISABLED"')

    local http_status
    http_status=$(curl -sk -X PUT \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        "${keycloak_url}/admin/realms/${realm}/authentication/flows/first%20broker%20login/executions" \
        -d "$update_payload" -w "%{http_code}" -o /dev/null 2>/dev/null)

    if [ "$http_status" = "204" ]; then
        log_success "Review Profile disabled in Hub First Broker Login flow"
        return 0
    else
        log_warn "Failed to disable Review Profile (HTTP $http_status)"
        return 1
    fi
}
hub_up() {
    ensure_dive_root
    check_docker || return 1

    if [ ! -f "$HUB_COMPOSE_FILE" ]; then
        log_error "Hub compose file not found: ${HUB_COMPOSE_FILE}"
        log_info "Run 'hub init' first to set up the hub"
        return 1
    fi

    # Ensure shared network exists (local dev only)
    ensure_shared_network

    # Load secrets
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        set -a
        source "${DIVE_ROOT}/.env.hub"
        set +a
    else
        log_error ".env.hub file not found - run 'hub init' first"
        return 1
    fi

    # Validate client ID configuration
    log_step "Validating client ID configuration..."
    _hub_validate_client_ids || log_warn "Client ID validation completed with warnings"

    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dive-hub}"

    log_step "Starting DIVE Hub services..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f ${HUB_COMPOSE_FILE} --env-file .env.hub up -d"
        return 0
    fi

    # Use --env-file to ensure all environment variables are passed to docker compose
    # Use --build to ensure custom images (like Keycloak with extensions) are rebuilt
    docker compose -f "$HUB_COMPOSE_FILE" --env-file "${DIVE_ROOT}/.env.hub" up -d --build || {
        log_error "Failed to start hub services"
        return 1
    }

    log_success "Hub services started"
    echo ""

    # Initialize NextAuth database if needed
    log_step "Checking NextAuth database..."
    _hub_init_nextauth_db || log_warn "NextAuth database initialization had issues (non-blocking)"

    # Apply Terraform (MFA flows, protocol mappers, etc.)
    log_step "Applying Terraform configuration (MFA flows)..."
    _hub_apply_terraform || log_warn "Terraform apply had issues (MFA may not be configured)"

    # Configure AMR mappers (critical for federated authentication)
    # This ensures the correct user-attribute mappers are in place
    log_step "Configuring AMR mappers..."
    if [ -f "${DIVE_ROOT}/scripts/hub-init/configure-amr.sh" ]; then
        bash "${DIVE_ROOT}/scripts/hub-init/configure-amr.sh" 2>/dev/null || log_warn "AMR configuration had issues (non-blocking)"
    fi

    # Check if hub has been initialized (users and resources seeded)
    local init_marker="${HUB_DATA_DIR}/.initialized"
    if [ ! -f "$init_marker" ]; then
        echo ""
        log_warn "Hub not fully initialized (users/resources not seeded)"
        log_step "Running post-deployment initialization..."

        # Wait for services to be healthy before seeding
        log_info "Waiting for services to be ready..."
        sleep 10

        # Run seeding automatically
        if hub_seed 5000; then
            log_success "Hub fully initialized with users and resources!"
        else
            log_warn "Initialization had some issues. You can re-run with:"
            echo "  ./dive hub seed"
        fi
    else
        log_info "Hub already initialized (skipping seeding)"
    fi

    echo ""
    echo "  Keycloak: ${HUB_KEYCLOAK_URL}"
    echo "  Backend:  ${HUB_BACKEND_URL}"
    echo "  OPA:      ${HUB_OPA_URL}"
    echo "  OPAL:     ${HUB_OPAL_URL}"
}
_hub_init_nextauth_db() {
    local postgres_container="${COMPOSE_PROJECT_NAME:-dive-hub}-postgres"
    local schema_file="${DIVE_ROOT}/scripts/spoke-init/nextauth-schema.sql"

    # Wait for PostgreSQL to be ready
    log_verbose "Waiting for PostgreSQL..."
    local retries=10
    while [ $retries -gt 0 ]; do
        if docker exec "$postgres_container" pg_isready -U postgres >/dev/null 2>&1; then
            break
        fi
        retries=$((retries - 1))
        sleep 2
    done

    if [ $retries -eq 0 ]; then
        log_error "PostgreSQL not ready"
        return 1
    fi

    # Create database if it doesn't exist
    log_verbose "Creating dive_v3_app database if needed..."
    docker exec "$postgres_container" psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'dive_v3_app'" | grep -q 1 || {
        docker exec "$postgres_container" psql -U postgres -c "CREATE DATABASE dive_v3_app;" >/dev/null 2>&1
        log_success "Created dive_v3_app database"
    }

    # Apply NextAuth schema if file exists
    if [ -f "$schema_file" ]; then
        log_verbose "Applying NextAuth schema..."
        if docker exec -i "$postgres_container" psql -U postgres -d dive_v3_app < "$schema_file" >/dev/null 2>&1; then
            log_success "NextAuth schema applied"
        else
            log_warn "NextAuth schema may already exist (this is OK)"
        fi
    else
        log_warn "NextAuth schema file not found: $schema_file"
    fi

    return 0
}
_hub_verify_deployment() {
    local errors=0

    # Check Keycloak
    if curl -kfs --max-time 5 "${HUB_KEYCLOAK_URL}/realms/master" >/dev/null 2>&1; then
        log_success "Keycloak: healthy"
    else
        log_error "Keycloak: not responding"
        ((errors++))
    fi

    # Check Backend
    if curl -kfs --max-time 5 "${HUB_BACKEND_URL}/health" >/dev/null 2>&1; then
        log_success "Backend: healthy"
    else
        log_error "Backend: not responding"
        ((errors++))
    fi

    # Check OPA
    if curl -kfs --max-time 5 "${HUB_OPA_URL}/health" >/dev/null 2>&1; then
        log_success "OPA: healthy"
    else
        log_error "OPA: not responding"
        ((errors++))
    fi

    # Check OPAL
    if curl -kfs --max-time 5 "${HUB_OPAL_URL}/healthcheck" >/dev/null 2>&1; then
        log_success "OPAL Server: healthy"
    else
        log_warn "OPAL Server: not responding (may still be starting)"
    fi

    # Check Federation API
    if curl -kfs --max-time 5 "${HUB_BACKEND_URL}/api/federation/health" >/dev/null 2>&1; then
        log_success "Federation API: healthy"
    else
        log_warn "Federation API: not responding"
    fi

    return $errors
}
hub_down() {
    ensure_dive_root
    check_docker || return 1

    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dive-hub}"

    log_step "Stopping DIVE Hub services..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f ${HUB_COMPOSE_FILE} down"
        return 0
    fi

    docker compose -f "$HUB_COMPOSE_FILE" down
    log_success "Hub services stopped"
}
hub_seed() {
    local resource_count="${1:-5000}"

    # INPUT VALIDATION: Resource count must be a positive integer
    if ! [[ "$resource_count" =~ ^[0-9]+$ ]]; then
        log_error "Resource count must be a positive integer"
        echo ""
        echo "Usage: ./dive hub seed [count]"
        echo ""
        echo "Examples:"
        echo "  ./dive hub seed          # Seed 5000 resources (default)"
        echo "  ./dive hub seed 10000    # Seed 10000 resources"
        echo "  ./dive hub seed 500      # Seed 500 resources (testing)"
        echo ""
        return 1
    fi

    # RANGE VALIDATION: Reasonable limits to prevent resource exhaustion
    if [ "$resource_count" -lt 1 ] || [ "$resource_count" -gt 1000000 ]; then
        log_error "Resource count must be between 1 and 1,000,000"
        echo "  Requested: $resource_count"
        echo "  Valid range: 1 - 1,000,000"
        echo ""
        return 1
    fi

    print_header
    echo -e "${BOLD}Seeding Hub (USA) with Test Data${NC}"
    echo ""
    echo "  Target: ${resource_count} ZTDF encrypted resources"
    echo ""

    # Check for seed scripts
    local SEED_SCRIPTS_DIR="${DIVE_ROOT}/scripts/hub-init"

    if [ ! -d "$SEED_SCRIPTS_DIR" ]; then
        log_error "Hub seed scripts not found at $SEED_SCRIPTS_DIR"
        return 1
    fi

    # Step 0: Configure client logout URIs (CRITICAL - must run before users)
    log_step "Step 0/4: Configuring Keycloak client logout URIs..."
    if [ -x "${SEED_SCRIPTS_DIR}/configure-hub-client.sh" ]; then
        if [ "$DRY_RUN" = true ]; then
            log_dry "Would run: ${SEED_SCRIPTS_DIR}/configure-hub-client.sh"
        else
            "${SEED_SCRIPTS_DIR}/configure-hub-client.sh" || log_warn "Client configuration had issues (non-blocking)"
        fi
    else
        log_warn "configure-hub-client.sh not found - logout may not work"
    fi
    echo ""

    # Step 1: Initialize COI Keys (CRITICAL - must run first)
    log_step "Step 1/4: Initializing COI Keys database..."
    local backend_container="${BACKEND_CONTAINER:-dive-hub-backend}"

    if [ "$DRY_RUN" = true ]; then
        log_dry "docker exec ${backend_container} npx tsx src/scripts/initialize-coi-keys.ts"
    else
        if ! docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
            log_error "Backend container '${backend_container}' is not running"
            return 1
        fi

        log_info "Initializing 35 COI definitions (NATO, FVEY, bilateral agreements, etc.)..."
        docker exec "$backend_container" npx tsx src/scripts/initialize-coi-keys.ts 2>&1 | tail -10

        if [ $? -eq 0 ]; then
            log_success "COI Keys initialized (35 COIs covering 32 NATO + 5 partner nations)"
        else
            log_error "COI Keys initialization failed"
            return 1
        fi
    fi
    echo ""

    # Step 2: Seed users (includes User Profile configuration)
    log_step "Step 2/4: Seeding test users..."
    if [ -x "${SEED_SCRIPTS_DIR}/seed-hub-users.sh" ]; then
        if [ "$DRY_RUN" = true ]; then
            log_dry "Would run: ${SEED_SCRIPTS_DIR}/seed-hub-users.sh"
        else
            "${SEED_SCRIPTS_DIR}/seed-hub-users.sh"
            if [ $? -eq 0 ]; then
                log_success "Test users created: testuser-usa-{1-4}, admin-usa"
            else
                log_error "User seeding failed"
                return 1
            fi
        fi
    else
        log_error "seed-hub-users.sh not found or not executable"
        return 1
    fi

    # Step 3: Seed ZTDF encrypted resources using TypeScript seeder
    log_step "Step 3/5: Seeding ${resource_count} ZTDF encrypted resources..."
    local backend_container="${BACKEND_CONTAINER:-dive-hub-backend}"

    if [ "$DRY_RUN" = true ]; then
        log_dry "docker exec ${backend_container} npx tsx src/scripts/seed-instance-resources.ts --instance=USA --count=${resource_count} --replace"
    else
        # Check if backend container is running
        if ! docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
            log_error "Backend container '${backend_container}' is not running"
            log_error "Cannot seed ZTDF resources without backend container"
            echo ""
            echo "  Start the hub first:"
            echo "  ./dive hub up"
            echo ""
            return 1
        fi

        # Use ZTDF seeder via TypeScript (SSOT - no plaintext fallback)
        # All resources MUST be ZTDF-encrypted per ACP-240 compliance
        if ! docker exec "$backend_container" npx tsx src/scripts/seed-instance-resources.ts \
            --instance=USA \
            --count="${resource_count}" \
            --replace 2>&1; then
            log_error "ZTDF seeding failed"
            log_error "All resources MUST be ZTDF-encrypted per ACP-240 compliance"
            echo ""
            echo "  Retry seeding:"
            echo "  ./dive hub seed ${resource_count}"
            echo ""
            return 1
        fi
    fi

    # Step 4: Initialize clearance equivalency mappings (Phase 2: MongoDB SSOT)
    log_step "Step 4/5: Initializing clearance equivalency mappings (32 NATO countries)..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker exec ${backend_container} npx tsx src/scripts/initialize-clearance-equivalency.ts"
    else
        if ! docker exec "$backend_container" npx tsx src/scripts/initialize-clearance-equivalency.ts 2>&1; then
            log_warn "Clearance equivalency initialization failed (non-critical)"
            log_warn "Backend will fall back to static TypeScript mappings"
        else
            log_success "Clearance equivalency mappings initialized in MongoDB"
        fi
    fi

    # Mark hub as initialized
    mkdir -p "$HUB_DATA_DIR"
    touch "${HUB_DATA_DIR}/.initialized"
    log_success "Hub initialization marker created"

    echo ""
    log_success "Hub seeding complete!"
    echo ""
    echo "  Test users: testuser-usa-{1-4}, admin-usa"
    echo "  Resources:  ${resource_count} ZTDF encrypted documents"
    echo ""
    echo "  Distribution:"
    echo "    - Classifications: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET"
    echo "    - COIs: 28+ templates (NATO, FVEY, bilateral, multi-COI)"
    echo "    - Releasability: Instance-specific and coalition-wide"
    echo "    - All documents have full ZTDF policy structure"
    echo ""
    echo "  ABAC is now functional - users see resources based on clearance level"
}
hub_reset() {
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}              Hub Reset (Development Only)                  ${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    echo -e "${RED}${BOLD}⚠️  WARNING: This will destroy ALL hub data!${NC}"
    echo ""
    echo "This operation will:"
    echo "  • Stop all hub containers"
    echo "  • Remove all hub volumes (PostgreSQL, MongoDB, Redis)"
    echo "  • Delete all spoke registrations"
    echo "  • Delete all users and resources"
    echo "  • Redeploy hub from scratch"
    echo ""

    # Require explicit confirmation
    local confirm
    read -p "Type 'RESET' to confirm: " confirm

    if [ "$confirm" != "RESET" ]; then
        echo ""
        log_warn "Hub reset cancelled"
        return 1
    fi

    echo ""
    log_step "Nuking hub resources..."

    # Stop hub services
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f docker-compose.hub.yml down -v --remove-orphans"
    else
        docker compose -f "${DIVE_ROOT}/docker-compose.hub.yml" down -v --remove-orphans 2>/dev/null
        log_success "Hub containers and volumes removed"
    fi

    # Remove any lingering volumes
    if [ "$DRY_RUN" = false ]; then
        docker volume ls --filter name=dive-hub --format '{{.Name}}' | while read -r vol; do
            docker volume rm "$vol" 2>/dev/null
        done
    fi

    echo ""
    log_step "Redeploying hub..."

    # Redeploy hub
    hub_deploy "$@"

    local result=$?

    echo ""
    if [ $result -eq 0 ]; then
        log_success "Hub reset complete - fresh deployment ready"
        echo ""
        echo "Next steps:"
        echo "  1. Verify hub: ./dive hub verify"
        echo "  2. Redeploy spokes: ./dive spoke deploy <code>"
        echo "  3. Relink federation: ./dive federation link <code>"
    else
        log_error "Hub reset failed during redeployment"
    fi

    return $result
}
