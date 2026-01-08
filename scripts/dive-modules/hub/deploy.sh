#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub Deployment Sub-Module
# =============================================================================
# Hub deployment orchestration functions
# Loaded on-demand via lazy loading
# =============================================================================

# Mark deploy module as loaded
export DIVE_HUB_DEPLOY_LOADED=1

# =============================================================================
# DEPLOYMENT CONSTANTS (from deployment.sh)
# =============================================================================

# Hub API endpoints
HUB_BACKEND_URL="https://localhost:${BACKEND_PORT:-4000}"
HUB_OPAL_URL="https://localhost:${OPAL_PORT:-7002}"
HUB_KEYCLOAK_URL="https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}"
HUB_OPA_URL="https://localhost:${OPA_PORT:-8181}"

# =============================================================================
# DEPLOYMENT FUNCTIONS
# =============================================================================

hub_deploy() {
    print_header
    echo -e "${BOLD}DIVE Hub Deployment${NC}"
    echo ""

    ensure_dive_root
    check_docker || return 1

    # Step 1: Initialize
    log_step "Step 1/7: Initializing hub..."
    _load_hub_init && hub_init || return 1

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
        _load_hub_init && _hub_generate_secrets

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
    _load_hub_services && hub_up || return 1

    # Step 4: Wait for services
    log_step "Step 4/7: Waiting for services to be healthy..."
    _hub_wait_all_healthy || return 1

    # Step 5: Clean up conflicting resources before Terraform
    log_step "Step 5/9: Preparing for Terraform deployment..."
    _hub_cleanup_conflicting_resources || log_warn "Resource cleanup had issues"

    # Step 6: Apply Terraform (if available)
    log_step "Step 6/9: Applying Keycloak configuration..."
    if [ -d "${DIVE_ROOT}/terraform/hub" ]; then
        _hub_apply_terraform || log_warn "Terraform apply skipped or failed"
    else
        log_info "No Terraform config found, skipping"
    fi

    # Step 7: Initialize database schema (NextAuth/Drizzle tables)
    log_step "Step 7/10: Initializing database schema..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would initialize NextAuth/Drizzle database tables"
    else
        _hub_init_database_schema || log_warn "Database schema initialization failed"
    fi

    # Step 8: Configure client logout URIs (AFTER Terraform creates client)
    log_step "Step 8/10: Configuring client logout URIs..."
    local client_script="${DIVE_ROOT}/scripts/hub-init/configure-hub-client.sh"
    if [ -x "$client_script" ]; then
        if [ "$DRY_RUN" = true ]; then
            log_dry "Would run: configure-hub-client.sh"
        else
            "$client_script" || log_warn "Client configuration had issues (non-blocking)"
        fi
    else
        log_warn "configure-hub-client.sh not found - logout may not work"
    fi

    # Step 9: Seed test users and resources
    log_step "Step 9/10: Seeding test users and 5000 ZTDF resources..."
    if [ -d "${DIVE_ROOT}/scripts/hub-init" ]; then
        _load_hub_seed && hub_seed 5000 || log_warn "Seeding failed - you can run './dive hub seed' later"
    else
        log_info "Hub seed scripts not found, skipping"
    fi

    # Step 10: Sync AMR attributes (CRITICAL for MFA)
    log_step "Step 10/10: Syncing AMR attributes for MFA users..."
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

    # Step 10: Verify deployment
    log_step "Step 10/10: Verifying deployment..."
    _hub_verify_deployment || log_warn "Some verification checks failed"

    echo ""
    log_success "Hub deployment complete!"
    echo ""
    _load_hub_status && hub_status_brief
}

_hub_wait_all_healthy() {
    local timeout=180
    local elapsed=0
    local services=("keycloak" "backend" "opa" "mongodb" "postgres" "redis")

    log_info "Waiting for all services to be healthy (up to ${timeout}s)..."

    while [ $elapsed -lt $timeout ]; do
        local all_healthy=true

        for service in "${services[@]}"; do
            local container="dive-hub-${service}"
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
        [ ! -d ".terraform" ] && terraform init -input=false -upgrade >/dev/null 2>&1

        # Export secrets as TF_VAR_ environment variables
        export TF_VAR_keycloak_admin_password="${KEYCLOAK_ADMIN_PASSWORD}"
        export TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET}"
        export TF_VAR_test_user_password="${TEST_USER_PASSWORD:-DiveTestSecure2025!}"
        export TF_VAR_admin_user_password="${ADMIN_PASSWORD:-DiveAdminSecure2025!}"
        export KEYCLOAK_USER="${KEYCLOAK_ADMIN_USERNAME:-admin}"
        export KEYCLOAK_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD}"

        terraform apply -var-file=hub.tfvars -input=false -auto-approve >/dev/null 2>&1
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

    # Check OPA (retry logic for startup timing)
    local opa_healthy=false
    for i in {1..5}; do  # Increased retries from 3 to 5
        if curl -kfs --max-time 15 "${HUB_OPA_URL}/health" >/dev/null 2>&1; then  # Increased timeout from 10 to 15
            log_success "OPA: healthy"
            opa_healthy=true
            break
        fi
        log_info "OPA check attempt $i failed, retrying..."
        sleep 3  # Increased sleep from 2 to 3
    done
    if [ "$opa_healthy" = false ]; then
        log_error "OPA: not responding after retries (${HUB_OPA_URL}/health)"
        ((errors++))
    fi

    # Check OPAL (retry logic for startup timing)
    local opal_healthy=false
    for i in {1..5}; do  # Increased retries from 3 to 5
        if curl -kfs --max-time 15 "${HUB_OPAL_URL}/healthcheck" >/dev/null 2>&1; then  # Increased timeout from 10 to 15
            log_success "OPAL Server: healthy"
            opal_healthy=true
            break
        fi
        log_info "OPAL check attempt $i failed, retrying..."
        sleep 3  # Increased sleep from 2 to 3
    done
    if [ "$opal_healthy" = false ]; then
        log_warn "OPAL Server: not responding after retries (${HUB_OPAL_URL}/healthcheck - may still be starting)"
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
# TERRAFORM CONFIGURATION
# =============================================================================

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
# =============================================================================
# DATABASE SCHEMA INITIALIZATION
# =============================================================================
# Create NextAuth/Drizzle database tables required for authentication
# This must run before the frontend starts to avoid Configuration errors
# =============================================================================

_hub_init_database_schema() {
    local postgres_container="dive-hub-postgres"
    local db_name="dive_v3_app"
    local db_user="postgres"

    # Get postgres password from environment
    local db_password
    db_password=$(docker exec "$postgres_container" printenv POSTGRES_PASSWORD 2>/dev/null)

    if [ -z "$db_password" ]; then
        log_error "Cannot get PostgreSQL password from container"
        return 1
    fi

    log_info "Creating NextAuth/Drizzle database tables..."

    # Create tables using psql
    docker exec -i "$postgres_container" psql -U "$db_user" -d "$db_name" << 'EOF' >/dev/null 2>&1
CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    "emailVerified" TIMESTAMP,
    image TEXT
);

CREATE TABLE IF NOT EXISTS account (
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    PRIMARY KEY (provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS session (
    "sessionToken" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    expires TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS verificationtoken (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires TIMESTAMP NOT NULL,
    PRIMARY KEY (identifier, token)
);
EOF

    if [ $? -eq 0 ]; then
        log_success "Database schema initialized successfully"
        return 0
    else
        log_error "Failed to initialize database schema"
        return 1
    fi
}

# =============================================================================
# CLEANUP CONFLICTING RESOURCES
# =============================================================================
# Remove resources that might conflict with Terraform deployment
# This ensures clean Terraform runs even after partial failures
# =============================================================================

_hub_cleanup_conflicting_resources() {
    local keycloak_url="${HUB_KEYCLOAK_URL}"
    local realm="dive-v3-broker-usa"

    # Get admin token
    local admin_password
    admin_password=$(docker exec dive-hub-keycloak printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\r\n')

    if [ -z "$admin_password" ]; then
        log_warn "Cannot get Keycloak admin password for cleanup"
        return 1
    fi

    local token
    token=$(curl -sk -X POST "${keycloak_url}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${admin_password}" \
        -d "scope=offline_access" 2>/dev/null | jq -r '.access_token')

    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_warn "Cannot authenticate with Keycloak for cleanup"
        return 1
    fi

    log_info "Cleaning up potentially conflicting resources..."

    # ==========================================================================
    # Clean up conflicting client
    # ==========================================================================
    local client_id="dive-v3-broker-usa"
    local client_uuid
    client_uuid=$(curl -sk "${keycloak_url}/admin/realms/${realm}/clients" \
        -H "Authorization: Bearer ${token}" 2>/dev/null | jq -r ".[] | select(.clientId == \"${client_id}\") | .id")

    if [ -n "$client_uuid" ] && [ "$client_uuid" != "null" ]; then
        log_info "Removing existing client: ${client_id}"
        curl -sk -X DELETE "${keycloak_url}/admin/realms/${realm}/clients/${client_uuid}" \
            -H "Authorization: Bearer ${token}" 2>/dev/null
    fi

    # ==========================================================================
    # Clean up conflicting roles
    # ==========================================================================
    local roles_to_clean=("user" "super_admin")

    for role_name in "${roles_to_clean[@]}"; do
        local role_exists
        role_exists=$(curl -sk "${keycloak_url}/admin/realms/${realm}/roles/${role_name}" \
            -H "Authorization: Bearer ${token}" 2>/dev/null | jq -r '.name')

        if [ "$role_exists" = "$role_name" ]; then
            log_info "Removing existing role: ${role_name}"
            curl -sk -X DELETE "${keycloak_url}/admin/realms/${realm}/roles/${role_name}" \
                -H "Authorization: Bearer ${token}" 2>/dev/null
        fi
    done

    # ==========================================================================
    # Clean up conflicting groups
    # ==========================================================================
    local groups_to_clean=("super_admins")

    for group_name in "${groups_to_clean[@]}"; do
        local group_uuid
        group_uuid=$(curl -sk "${keycloak_url}/admin/realms/${realm}/groups" \
            -H "Authorization: Bearer ${token}" 2>/dev/null | jq -r ".[] | select(.name == \"${group_name}\") | .id")

        if [ -n "$group_uuid" ] && [ "$group_uuid" != "null" ]; then
            log_info "Removing existing group: ${group_name}"
            curl -sk -X DELETE "${keycloak_url}/admin/realms/${realm}/groups/${group_uuid}" \
                -H "Authorization: Bearer ${token}" 2>/dev/null
        fi
    done

    # ==========================================================================
    # Clean up conflicting users (only test users that Terraform creates)
    # ==========================================================================
    local test_users=("testuser-usa-1" "testuser-usa-2" "testuser-usa-3" "testuser-usa-4" "testuser-usa-5")

    for username in "${test_users[@]}"; do
        local user_uuid
        user_uuid=$(curl -sk "${keycloak_url}/admin/realms/${realm}/users?username=${username}&exact=true" \
            -H "Authorization: Bearer ${token}" 2>/dev/null | jq -r '.[0].id')

        if [ -n "$user_uuid" ] && [ "$user_uuid" != "null" ]; then
            log_info "Removing existing test user: ${username}"
            curl -sk -X DELETE "${keycloak_url}/admin/realms/${realm}/users/${user_uuid}" \
                -H "Authorization: Bearer ${token}" 2>/dev/null
        fi
    done

    log_success "Resource cleanup completed - Terraform can now run cleanly"
    return 0
}
