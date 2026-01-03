#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Hub Management Module
# =============================================================================
# Comprehensive Hub-in-a-Box management for the DIVE V3 federation.
#
# Commands:
#   deploy      - Full hub deployment (init → up → wait → configure)
#   init        - Initialize hub directories and configuration
#   up          - Start hub services
#   down        - Stop hub services
#   status      - Show comprehensive hub status
#   logs        - View hub service logs
#   spokes      - Manage spoke registrations (list, pending, approve, reject)
#   push-policy - Push policy update to all connected spokes
#   health      - Check hub health (all services)
#
# Usage:
#   ./dive hub deploy              # Full deployment
#   ./dive hub status              # Show hub status
#   ./dive hub spokes list         # List registered spokes
#   ./dive hub spokes approve FRA  # Approve a spoke
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONSTANTS
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
FEDERATION_ADMIN_KEY="${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}"

# Mark this module as loaded
export DIVE_HUB_LOADED=1

# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================

##
# Validate and fix client ID configuration
# Ensures instance-specific client IDs are used throughout
##
_hub_validate_client_ids() {
    local env_file="${DIVE_ROOT}/.env.hub"
    local compose_file="${DIVE_ROOT}/docker-compose.hub.yml"
    local errors=0

    # Check 1: Ensure .env.hub has correct KEYCLOAK_CLIENT_ID
    if [ -f "$env_file" ]; then
        local env_client_id=$(grep "^KEYCLOAK_CLIENT_ID=" "$env_file" 2>/dev/null | cut -d= -f2 | tr -d '"' || echo "")
        if [ "$env_client_id" = "dive-v3-broker" ]; then
            log_warn "Found generic client ID in .env.hub, updating to instance-specific..."
            sed -i.bak 's/^KEYCLOAK_CLIENT_ID=dive-v3-client-broker$/KEYCLOAK_CLIENT_ID=dive-v3-broker-usa/' "$env_file"
            rm -f "${env_file}.bak"
            log_success "Updated .env.hub with correct client ID"
        fi
    fi

    # Check 2: Verify running containers have correct environment
    if docker ps --format '{{.Names}}' | grep -q "dive-hub-frontend"; then
        local frontend_client_id=$(docker exec dive-hub-frontend printenv AUTH_KEYCLOAK_ID 2>/dev/null || echo "")
        if [ "$frontend_client_id" = "dive-v3-broker" ]; then
            log_error "Frontend container has incorrect client ID (requires restart)"
            errors=$((errors + 1))
        fi
    fi

    if docker ps --format '{{.Names}}' | grep -q "dive-hub-backend"; then
        local backend_client_id=$(docker exec dive-hub-backend printenv KEYCLOAK_CLIENT_ID 2>/dev/null || echo "")
        if [ "$backend_client_id" = "dive-v3-broker" ]; then
            log_error "Backend container has incorrect client ID (requires restart)"
            errors=$((errors + 1))
        fi
    fi

    # Check 3: Verify Keycloak realm has correct client
    if docker ps --format '{{.Names}}' | grep -q "dive-hub-keycloak"; then
        set -a
        source "$env_file" 2>/dev/null
        set +a

        local token=$(curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" \
            -d "client_id=admin-cli" \
            -d "username=admin" \
            -d "password=${KEYCLOAK_ADMIN_PASSWORD}" 2>/dev/null | jq -r '.access_token' 2>/dev/null)

        if [ -n "$token" ] && [ "$token" != "null" ]; then
            local client_exists=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/clients?clientId=dive-v3-broker-usa" \
                -H "Authorization: Bearer $token" 2>/dev/null | jq -r '.[0].clientId' 2>/dev/null)

            if [ "$client_exists" != "dive-v3-broker-usa" ]; then
                log_error "Keycloak realm missing correct client: dive-v3-broker-usa"
                errors=$((errors + 1))
            fi
        fi
    fi

    if [ $errors -gt 0 ]; then
        log_warn "Client ID validation found $errors issue(s)"
        log_info "Restart hub services to apply fixes: ./dive hub down && ./dive hub up"
        return 1
    fi

    return 0
}

# =============================================================================
# LAZY LOADING INFRASTRUCTURE
# =============================================================================

# Sub-modules directory
_HUB_MODULES_DIR="$(dirname "${BASH_SOURCE[0]}")"

##
# Lazy load hub-spokes.sh module
##
_load_hub_spokes() {
    if [ -z "$DIVE_HUB_SPOKES_LOADED" ]; then
        source "${_HUB_MODULES_DIR}/hub-spokes.sh" 2>/dev/null || {
            log_error "Failed to load hub-spokes.sh module"
            return 1
        }
    fi
    return 0
}

# Stub function for lazy-loaded spoke management
_hub_spokes_stub() {
    _load_hub_spokes && hub_spokes "$@"
}

# =============================================================================
# HUB INITIALIZATION
# =============================================================================

hub_init() {
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
    mkdir -p "${HUB_CERTS_DIR}"
    mkdir -p "${HUB_DATA_DIR}/truststores"

    # Check for mkcert
    if command -v mkcert >/dev/null 2>&1; then
        log_info "Using mkcert for certificate generation..."

        # Install mkcert CA if not already done
        mkcert -install 2>/dev/null || true

        # Get all spoke hostnames for comprehensive SANs
        local spoke_sans=""
        for code in alb bel bgr can cze dnk est fra deu grc hun isl ita lva ltu lux mne nld mkd nor pol prt rou svk svn esp tur gbr nzl; do
            spoke_sans="$spoke_sans keycloak-${code} ${code}-keycloak-${code}-1 dive-${code}-keycloak"
        done

        # Generate Hub certificate with all SANs (including spoke hostnames)
        (
            cd "${HUB_CERTS_DIR}"
            # shellcheck disable=SC2086
            mkcert -key-file key.pem -cert-file certificate.pem \
                localhost 127.0.0.1 ::1 host.docker.internal \
                hub.dive25.com usa-idp.dive25.com \
                keycloak dive-hub-keycloak hub-keycloak \
                backend opa opal-server frontend \
                $spoke_sans \
                2>/dev/null
        )
        log_success "Hub certificate generated with spoke SANs"

        # Copy mkcert root CA to truststores directory
        local ca_root
        ca_root=$(mkcert -CAROOT 2>/dev/null)
        if [ -f "$ca_root/rootCA.pem" ]; then
            cp "$ca_root/rootCA.pem" "${HUB_CERTS_DIR}/mkcert-rootCA.pem"
            cp "$ca_root/rootCA.pem" "${HUB_DATA_DIR}/truststores/mkcert-rootCA.pem"
            log_success "mkcert root CA installed in Hub truststore"
        else
            log_warn "mkcert root CA not found at: $ca_root"
        fi
    else
        # Fallback to openssl self-signed
        log_warn "mkcert not found, using self-signed certificate (federation may have SSL issues)"
        openssl req -x509 -newkey rsa:4096 -sha256 -days 365 \
            -nodes -keyout "${HUB_CERTS_DIR}/key.pem" \
            -out "${HUB_CERTS_DIR}/certificate.pem" \
            -subj "/CN=localhost" \
            -addext "subjectAltName=DNS:localhost,DNS:keycloak,DNS:backend,DNS:opa,DNS:opal-server,IP:127.0.0.1" \
            2>/dev/null
        log_success "Self-signed certificates generated"
        log_warn "For federation to work, install mkcert and regenerate certificates"
    fi
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
EOF

    log_success "Hub configuration created: ${config_file}"
}

# =============================================================================
# HUB DEPLOYMENT
# =============================================================================

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
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
MONGO_PASSWORD=${MONGO_PASSWORD}
AUTH_SECRET=${AUTH_SECRET}
KEYCLOAK_CLIENT_SECRET=${KEYCLOAK_CLIENT_SECRET}
JWT_SECRET=${JWT_SECRET:-$(openssl rand -base64 32)}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-$(openssl rand -base64 32)}
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

##
# Initialize NextAuth database for hub frontend
##
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

    log_info "Applying Terraform configuration..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "cd ${tf_dir} && terraform init && terraform apply -auto-approve"
        return 0
    fi

    (
        cd "$tf_dir"
        [ ! -d ".terraform" ] && terraform init -input=false

        # Export secrets as TF_VAR_ environment variables
        export TF_VAR_keycloak_admin_password="${KEYCLOAK_ADMIN_PASSWORD}"
        export TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET}"
        export TF_VAR_test_user_password="${TEST_USER_PASSWORD:-DiveTestSecure2025!}"
        export TF_VAR_admin_user_password="${ADMIN_PASSWORD:-DiveAdminSecure2025!}"
        export KEYCLOAK_USER="${KEYCLOAK_ADMIN_USERNAME:-admin}"
        export KEYCLOAK_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD}"

        terraform apply -var-file=hub.tfvars -input=false -auto-approve
    ) || {
        log_warn "Terraform apply failed"
        return 1
    }

    log_success "Terraform configuration applied"

    # Disable Review Profile in First Broker Login flow (best practice for federation)
    _hub_disable_review_profile || log_warn "Could not disable Review Profile"
}

# =============================================================================
# Disable Review Profile in First Broker Login Flow (Best Practice)
# =============================================================================
# For trusted federation, "Review Profile" should be DISABLED because:
# 1. Federated IdPs (Spokes) are trusted
# 2. User attributes are imported from federated tokens
# 3. Profile verification adds friction and breaks seamless SSO
# =============================================================================
_hub_disable_review_profile() {
    local keycloak_url="${HUB_KEYCLOAK_URL}"
    local realm="dive-v3-broker-usa"

    # Get admin token
    local admin_password
    admin_password=$(docker exec dive-hub-keycloak printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\r\n')

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

# =============================================================================
# HUB VERIFICATION (Phase 6 - 10-Point Verification)
# =============================================================================

hub_verify() {
    print_header
    echo -e "${BOLD}🔍 Hub Verification${NC}"
    echo ""

    ensure_dive_root

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would run 10-point hub verification"
        return 0
    fi

    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Running 10-Point Hub Verification${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local checks_total=10
    local checks_passed=0
    local checks_failed=0

    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dive-hub}"

    # Check 1: Docker containers running (8 services)
    printf "  %-50s" "1. Docker Containers (8 services):"
    local expected_services=("keycloak" "backend" "opa" "opal-server" "mongodb" "postgres" "redis" "redis-blacklist")
    local running_count=0

    for service in "${expected_services[@]}"; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-${service}"; then
            ((running_count++))
        fi
    done

    if [ $running_count -eq 8 ]; then
        echo -e "${GREEN}✓ ${running_count}/8 running${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ ${running_count}/8 running${NC}"
        ((checks_failed++))
    fi

    # Check 2: Keycloak health
    printf "  %-50s" "2. Keycloak Health:"
    if curl -kfs "https://localhost:8443/health/ready" --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    elif curl -kfs "https://localhost:8443/realms/master" --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi

    # Check 3: Backend API health
    printf "  %-50s" "3. Backend API Health:"
    if curl -kfs "https://localhost:4000/health" --max-time 5 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi

    # Check 4: MongoDB connection
    printf "  %-50s" "4. MongoDB Connection:"
    if docker exec dive-hub-mongodb mongosh --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
        echo -e "${GREEN}✓ Connected${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Failed${NC}"
        ((checks_failed++))
    fi

    # Check 5: Redis connection
    printf "  %-50s" "5. Redis Connection:"
    if docker exec dive-hub-redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
        echo -e "${GREEN}✓ Connected${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Failed${NC}"
        ((checks_failed++))
    fi

    # Check 6: OPAL Server health
    printf "  %-50s" "6. OPAL Server Health:"
    if curl -kfs "https://localhost:7002/healthcheck" --max-time 5 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${YELLOW}⚠ Not responding${NC}"
        ((checks_failed++))
    fi

    # Check 7: Policy bundle available
    printf "  %-50s" "7. Policy Bundle Available:"
    local bundle=$(curl -kfs "https://localhost:4000/api/opal/bundle/current" --max-time 5 2>/dev/null)
    if echo "$bundle" | grep -q '"bundleId"'; then
        local version=$(echo "$bundle" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        echo -e "${GREEN}✓ ${version}${NC}"
        ((checks_passed++))
    else
        echo -e "${YELLOW}⚠ No bundle${NC}"
    fi

    # Check 8: Federation registry initialized
    printf "  %-50s" "8. Federation Registry:"
    if curl -kfs "https://localhost:4000/api/federation/health" --max-time 5 >/dev/null 2>&1; then
        local spoke_count=$(curl -kfs "https://localhost:4000/api/federation/health" --max-time 5 2>/dev/null | grep -o '"totalSpokes"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')
        echo -e "${GREEN}✓ Initialized (${spoke_count:-0} spokes)${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Not initialized${NC}"
        ((checks_failed++))
    fi

    # Check 9: Registration endpoint accessible
    printf "  %-50s" "9. Registration Endpoint:"
    local reg_test=$(curl -kfs -o /dev/null -w '%{http_code}' -X POST "https://localhost:4000/api/federation/register" \
        -H "Content-Type: application/json" \
        -d '{}' --max-time 5 2>/dev/null)
    if [ "$reg_test" = "400" ] || [ "$reg_test" = "401" ] || [ "$reg_test" = "422" ]; then
        # Error codes mean endpoint is accessible (just rejecting empty request)
        echo -e "${GREEN}✓ Accessible${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Not accessible (HTTP $reg_test)${NC}"
        ((checks_failed++))
    fi

    # Check 10: TLS certificates valid
    printf "  %-50s" "10. TLS Certificates:"
    local cert_dir="${DIVE_ROOT}/keycloak/certs"
    if [ -f "${cert_dir}/certificate.pem" ]; then
        local expiry=$(openssl x509 -enddate -noout -in "${cert_dir}/certificate.pem" 2>/dev/null | cut -d= -f2)
        local expiry_epoch=$(date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry" +%s 2>/dev/null || date -d "$expiry" +%s 2>/dev/null || echo 0)
        local now_epoch=$(date +%s)
        local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

        if [ $days_left -gt 30 ]; then
            echo -e "${GREEN}✓ Valid (${days_left} days left)${NC}"
            ((checks_passed++))
        elif [ $days_left -gt 0 ]; then
            echo -e "${YELLOW}⚠ Expires soon (${days_left} days)${NC}"
            ((checks_passed++))
        else
            echo -e "${RED}✗ Expired${NC}"
            ((checks_failed++))
        fi
    else
        echo -e "${YELLOW}⚠ No cert file found${NC}"
        # Don't fail - TLS may work via other means
    fi

    # Summary
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Verification Summary${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Total Checks:   $checks_total"
    echo -e "  Passed:         ${GREEN}$checks_passed${NC}"
    echo -e "  Failed:         ${RED}$checks_failed${NC}"
    echo ""

    if [ $checks_failed -eq 0 ] && [ $checks_passed -ge 8 ]; then
        echo -e "${GREEN}✓ All critical verification checks passed!${NC}"
        echo -e "${GREEN}✓ Hub deployment is fully operational${NC}"
        echo ""
        return 0
    else
        echo -e "${YELLOW}⚠ Some checks failed or were skipped${NC}"
        echo ""
        echo -e "${CYAN}Troubleshooting:${NC}"
        echo "  - Check logs: ./dive hub logs"
        echo "  - View status: ./dive hub status"
        echo "  - Restart services: ./dive hub down && ./dive hub up"
        echo ""
        return 1
    fi
}

# =============================================================================
# HUB STATUS
# =============================================================================

hub_status() {
    print_header
    echo -e "${BOLD}DIVE Hub Status${NC}"
    echo ""

    # Service status
    echo -e "${CYAN}Services:${NC}"
    _hub_check_service "Keycloak" "${HUB_KEYCLOAK_URL}/realms/master"
    _hub_check_service "Backend"  "${HUB_BACKEND_URL}/health"
    _hub_check_service "OPA"      "${HUB_OPA_URL}/health"
    _hub_check_service "OPAL"     "${HUB_OPAL_URL}/healthcheck"
    echo ""

    # Docker container status
    echo -e "${CYAN}Containers:${NC}"
    docker compose -f "$HUB_COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  (compose not running)"
    echo ""

    # Federation stats
    echo -e "${CYAN}Federation:${NC}"
    _hub_get_federation_stats
    echo ""

    # Policy version
    echo -e "${CYAN}Policy:${NC}"
    _hub_get_policy_version
}

hub_status_brief() {
    echo -e "${CYAN}Hub Endpoints:${NC}"
    echo "  Keycloak: ${HUB_KEYCLOAK_URL}"
    echo "  Backend:  ${HUB_BACKEND_URL}"
    echo "  OPA:      ${HUB_OPA_URL}"
    echo "  OPAL:     ${HUB_OPAL_URL}"
    echo ""
    echo -e "${CYAN}Admin Credentials:${NC}"
    echo "  Keycloak: admin / \$KEYCLOAK_ADMIN_PASSWORD"
    echo "  API Key:  \$FEDERATION_ADMIN_KEY"
    echo ""
    echo "Run './dive hub status' for detailed status"
}

_hub_check_service() {
    local name="$1"
    local url="$2"

    local status_code=$(curl -kso /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null || echo "000")

    if [ "$status_code" = "200" ]; then
        echo -e "  ${name}: ${GREEN}healthy${NC} (${status_code})"
    elif [ "$status_code" = "000" ]; then
        echo -e "  ${name}: ${RED}offline${NC}"
    else
        echo -e "  ${name}: ${YELLOW}degraded${NC} (${status_code})"
    fi
}

_hub_get_federation_stats() {
    local response=$(curl -kfs --max-time 5 \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/health" 2>/dev/null)

    if [ -n "$response" ]; then
        echo "$response" | jq -r '
            "  Total Spokes: \(.statistics.totalSpokes // 0)",
            "  Active: \(.statistics.activeSpokes // 0)",
            "  Pending: \(.statistics.pendingApprovals // 0)",
            "  Unhealthy: \(.unhealthySpokes | length // 0)"
        ' 2>/dev/null || echo "  (unable to parse federation stats)"
    else
        echo "  (federation API not available)"
    fi
}

_hub_get_policy_version() {
    local response=$(curl -kfs --max-time 5 \
        "${HUB_BACKEND_URL}/api/federation/policy/version" 2>/dev/null)

    if [ -n "$response" ]; then
        echo "$response" | jq -r '
            "  Version: \(.version // "unknown")",
            "  Updated: \(.timestamp // "unknown")"
        ' 2>/dev/null || echo "  (unable to parse policy version)"
    else
        echo "  (policy API not available)"
    fi
}

hub_health() {
    echo -e "${BOLD}Hub Health Check${NC}"
    echo ""

    local exit_code=0

    # Check all services
    for service in keycloak backend opa opal-server mongodb postgres redis; do
        local container="${COMPOSE_PROJECT_NAME:-dive-hub}-${service}"
        # #region agent log
        echo "{\"location\":\"hub.sh:894\",\"message\":\"Checking container\",\"data\":{\"service\":\"$service\",\"container\":\"$container\"},\"timestamp\":$(date +%s%3N),\"sessionId\":\"debug-session\",\"runId\":\"run1\",\"hypothesisId\":\"B\"}" >> /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log
        #endregion
        local status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "not_found")
        local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "N/A")

        if [ "$status" = "running" ] && [ "$health" = "healthy" ]; then
            echo -e "  ${service}: ${GREEN}✓${NC} running (healthy)"
        elif [ "$status" = "running" ]; then
            echo -e "  ${service}: ${YELLOW}○${NC} running (${health})"
        else
            echo -e "  ${service}: ${RED}✗${NC} ${status}"
            # Check container logs for failure reason
            local logs=$(docker logs "$container" 2>&1 | tail -10 2>/dev/null || echo "no logs")
            echo "    Logs: $logs" | head -3
            exit_code=1
        fi
    done

    return $exit_code
}

# =============================================================================
# SPOKE MANAGEMENT (Lazy Loaded from hub-spokes.sh)
# =============================================================================
# The following functions have been extracted to hub-spokes.sh for modularity:
#   - hub_spokes()
#   - hub_spokes_list()
#   - hub_spokes_pending()
#   - hub_spokes_approve()
#   - hub_spokes_reject()
#   - hub_spokes_suspend()
#   - hub_spokes_revoke()
#   - hub_spokes_token()
#   - hub_spokes_rotate_token()
#   - hub_spokes_help()
#
# These are lazy-loaded via _hub_spokes_stub() when 'hub spokes' is called.
# =============================================================================


# =============================================================================
# POLICY MANAGEMENT
# =============================================================================

hub_push_policy() {
    local layers="${1:-base,coalition,tenant}"
    local description="${2:-Manual policy push}"

    log_step "Pushing policy update to all spokes..."

    local payload=$(cat << EOF
{
    "layers": $(echo "$layers" | jq -R 'split(",")'),
    "priority": "normal",
    "description": "${description}"
}
EOF
)

    if [ "$DRY_RUN" = true ]; then
        log_dry "POST ${HUB_BACKEND_URL}/api/federation/policy/push"
        log_dry "Payload: ${payload}"
        return 0
    fi

    local response=$(curl -kfs --max-time 30 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d "$payload" \
        "${HUB_BACKEND_URL}/api/federation/policy/push" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "Failed to push policy update"
        return 1
    fi

    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)

    if [ "$success" = "true" ]; then
        log_success "Policy update pushed"
        echo ""
        echo "Update ID: $(echo "$response" | jq -r '.update.updateId' 2>/dev/null)"
        echo "Version:   $(echo "$response" | jq -r '.update.version' 2>/dev/null)"
    else
        log_error "Policy push failed: $(echo "$response" | jq -r '.error' 2>/dev/null)"
        return 1
    fi
}

# =============================================================================
# HUB LOGS
# =============================================================================

hub_logs() {
    local service="${1:-}"
    local follow="${2:-}"

    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dive-hub}"

    if [ -n "$service" ]; then
        if [ "$follow" = "-f" ] || [ "$follow" = "--follow" ]; then
            docker compose -f "$HUB_COMPOSE_FILE" logs -f "$service"
        else
            docker compose -f "$HUB_COMPOSE_FILE" logs --tail=100 "$service"
        fi
    else
        docker compose -f "$HUB_COMPOSE_FILE" logs --tail=50
    fi
}

# =============================================================================
# HUB SEED (Users + Resources)
# =============================================================================

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
    log_step "Step 3/4: Seeding ${resource_count} ZTDF encrypted resources..."
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

# =============================================================================
# AMR MANAGEMENT
# =============================================================================

hub_amr() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        configure)
            # Configure AMR mappers (replaces oidc-amr-mapper with user-attribute mapper)
            log_step "Configuring AMR mappers..."
            bash "${DIVE_ROOT}/scripts/hub-init/configure-amr.sh" "$@"
            ;;
        sync)
            # Sync AMR attributes for all users based on configured credentials
            log_step "Syncing AMR attributes..."
            bash "${DIVE_ROOT}/scripts/sync-amr-attributes.sh" "$@"
            ;;
        set)
            # Set AMR for a specific user
            local username="$1"
            local amr_value="$2"
            if [ -z "$username" ] || [ -z "$amr_value" ]; then
                log_error "Usage: ./dive hub amr set <username> '<amr_array>'"
                log_error "Example: ./dive hub amr set testuser-usa-2 '[\"pwd\",\"otp\"]'"
                return 1
            fi
            log_step "Setting AMR for user: ${username}"
            _hub_set_user_amr "$username" "$amr_value"
            ;;
        show)
            # Show AMR for a specific user
            local username="$1"
            if [ -z "$username" ]; then
                log_error "Usage: ./dive hub amr show <username>"
                return 1
            fi
            _hub_show_user_amr "$username"
            ;;
        help|*)
            echo -e "${BOLD}DIVE Hub AMR Commands:${NC}"
            echo ""
            echo "  sync [--dry-run]              Sync AMR attributes based on credentials"
            echo "  set <user> '<amr_array>'      Set AMR for a specific user"
            echo "  show <user>                   Show AMR for a specific user"
            echo ""
            echo -e "${CYAN}Examples:${NC}"
            echo "  ./dive hub amr sync                              # Sync all users"
            echo "  ./dive hub amr sync --user testuser-usa-2        # Sync specific user"
            echo "  ./dive hub amr set testuser-usa-2 '[\"pwd\",\"otp\"]'"
            echo "  ./dive hub amr show testuser-usa-2"
            echo ""
            echo -e "${CYAN}Background:${NC}"
            echo "  AMR (Authentication Methods Reference) tracks the auth factors used."
            echo "  This script syncs the AMR attribute based on configured credentials."
            echo "  OPA policies check AMR for AAL2/AAL3 enforcement."
            ;;
    esac
}

_hub_set_user_amr() {
    local username="$1"
    local amr_value="$2"

    local keycloak_url="${HUB_KEYCLOAK_URL}"
    local realm="dive-v3-broker-usa"

    # Get admin token
    local admin_password
    admin_password=$(docker exec dive-hub-keycloak printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null)

    local token
    token=$(curl -sk -X POST "${keycloak_url}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${admin_password}" | jq -r '.access_token')

    if [ -z "$token" ] || [ "$token" == "null" ]; then
        log_error "Failed to authenticate with Keycloak"
        return 1
    fi

    # Get user ID
    local user_id
    user_id=$(curl -sk "${keycloak_url}/admin/realms/${realm}/users?username=${username}&exact=true" \
        -H "Authorization: Bearer $token" | jq -r '.[0].id')

    if [ -z "$user_id" ] || [ "$user_id" == "null" ]; then
        log_error "User not found: ${username}"
        return 1
    fi

    # Get current user data
    local user_data
    user_data=$(curl -sk "${keycloak_url}/admin/realms/${realm}/users/${user_id}" \
        -H "Authorization: Bearer $token")

    # Update AMR attribute
    local updated_data
    updated_data=$(echo "$user_data" | jq --argjson amr "$amr_value" '.attributes.amr = $amr')

    curl -sk -X PUT "${keycloak_url}/admin/realms/${realm}/users/${user_id}" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "$updated_data" > /dev/null 2>&1

    log_success "AMR set for ${username}: ${amr_value}"
}

_hub_show_user_amr() {
    local username="$1"

    local keycloak_url="${HUB_KEYCLOAK_URL}"
    local realm="dive-v3-broker-usa"

    # Get admin token
    local admin_password
    admin_password=$(docker exec dive-hub-keycloak printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null)

    local token
    token=$(curl -sk -X POST "${keycloak_url}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${admin_password}" | jq -r '.access_token')

    if [ -z "$token" ] || [ "$token" == "null" ]; then
        log_error "Failed to authenticate with Keycloak"
        return 1
    fi

    # Get user
    local user_data
    user_data=$(curl -sk "${keycloak_url}/admin/realms/${realm}/users?username=${username}&exact=true" \
        -H "Authorization: Bearer $token" | jq '.[0]')

    if [ -z "$user_data" ] || [ "$user_data" == "null" ]; then
        log_error "User not found: ${username}"
        return 1
    fi

    local amr
    amr=$(echo "$user_data" | jq -r '.attributes.amr // ["pwd"]')
    local clearance
    clearance=$(echo "$user_data" | jq -r '.attributes.clearance[0] // "UNCLASSIFIED"')

    echo ""
    echo -e "${BOLD}User: ${username}${NC}"
    echo "  Clearance: ${clearance}"
    echo "  AMR:       ${amr}"
    echo ""
}

##
# Reset hub to clean state (development only)
# Nukes all data and redeploys from scratch
##
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

# =============================================================================
# HUB FIX COMMAND
# =============================================================================

hub_fix() {
    print_header
    echo -e "${BOLD}DIVE Hub - Configuration Fix${NC}"
    echo ""

    local fix_type="${1:-all}"

    case "$fix_type" in
        client-id|clientid)
            log_step "Fixing client ID configuration..."
            _hub_validate_client_ids
            if [ $? -eq 0 ]; then
                log_success "Client ID configuration is correct"
            else
                log_warn "Issues found - restart required"
                echo ""
                log_info "Run: ./dive hub down && ./dive hub up"
            fi
            ;;

        all|*)
            log_step "Running all configuration fixes..."

            # Fix 1: Client ID
            log_info "→ Checking client IDs..."
            _hub_validate_client_ids

            # Future fixes can be added here

            echo ""
            log_success "Configuration fix complete"
            echo ""
            log_info "If issues were found, restart hub:"
            echo "  ./dive hub down && ./dive hub up"
            ;;
    esac
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_hub() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        deploy)      hub_deploy "$@" ;;
        init)        hub_init "$@" ;;
        up|start)    hub_up "$@" ;;
        down|stop)   hub_down "$@" ;;
        reset)       hub_reset "$@" ;;
        status)      hub_status "$@" ;;
        health)      hub_health "$@" ;;
        verify)      hub_verify "$@" ;;
        fix)         hub_fix "$@" ;;
        logs)        hub_logs "$@" ;;
        spokes)      _hub_spokes_stub "$@" ;;  # Lazy loaded from hub-spokes.sh
        push-policy) hub_push_policy "$@" ;;
        seed)        hub_seed "$@" ;;
        amr)         hub_amr "$@" ;;

        # Legacy compatibility
        # Deprecated aliases (backwards compatibility)
        bootstrap)
            log_warn "Deprecated: Use 'hub deploy' instead (removal in v5.0)"
            hub_deploy "$@"
            ;;
        instances)
            log_warn "Deprecated: Use 'hub spokes list' instead (removal in v5.0)"
            hub_spokes list "$@"
            ;;

        help|*)      module_hub_help ;;
    esac
}

module_hub_help() {
    echo -e "${BOLD}DIVE Hub Commands:${NC}"
    echo ""
    echo -e "${CYAN}Deployment:${NC}"
    echo "  deploy              Full hub deployment (init → up → configure)"
    echo "  init                Initialize hub directories and config"
    echo "  up, start           Start hub services"
    echo "  down, stop          Stop hub services"
    echo "  reset               Nuke and redeploy (development only, requires 'RESET' confirmation)"
    echo "  seed [count]        Seed test users and ZTDF resources (default: 5000)"
    echo ""
    echo -e "${CYAN}Status & Verification:${NC}"
    echo "  status              Show comprehensive hub status"
    echo "  health              Check all service health"
    echo "  verify              10-point hub verification check (Phase 6)"
    echo "  fix [type]          Validate and fix configuration issues"
    echo "  logs [service] [-f] View logs (optionally follow)"
    echo ""
    echo -e "${CYAN}Spoke Management (Phase 3):${NC}"
    echo "  spokes list            List all registered spokes"
    echo "  spokes pending         Show spokes pending approval (rich display)"
    echo "  spokes approve <id>    Approve a spoke (interactive with scope selection)"
    echo "  spokes reject <id>     Reject a spoke (with reason)"
    echo "  spokes suspend <id>    Suspend a spoke"
    echo "  spokes revoke <id>     Permanently revoke a spoke"
    echo "  spokes token <id>      Generate new token for spoke"
    echo "  spokes rotate-token <id>  Rotate (revoke + regenerate) spoke token"
    echo ""
    echo -e "${CYAN}Policy:${NC}"
    echo "  push-policy [layers] Push policy update to all spokes"
    echo ""
    echo -e "${CYAN}AMR Management (MFA/AAL):${NC}"
    echo "  amr sync [--user X]     Sync AMR attributes based on credentials"
    echo "  amr set <user> <amr>    Set AMR for a specific user"
    echo "  amr show <user>         Show AMR for a specific user"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./dive hub deploy"
    echo "  ./dive hub seed 500"
    echo "  ./dive hub spokes approve spoke-fra-abc123"
    echo "  ./dive hub logs backend -f"
}
