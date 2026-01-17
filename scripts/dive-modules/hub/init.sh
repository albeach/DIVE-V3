#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub Initialization Sub-Module
# =============================================================================
# Hub initialization functions and helpers
# Loaded on-demand via lazy loading
# =============================================================================

# Mark init module as loaded
export DIVE_HUB_INIT_LOADED=1

# =============================================================================
# CONSTANTS
# =============================================================================

HUB_COMPOSE_FILE="${DIVE_ROOT}/docker-compose.hub.yml"
HUB_DATA_DIR="${DIVE_ROOT}/data/hub"
# SSOT: Hub certificates are in instances/hub/certs
HUB_CERTS_DIR="${DIVE_ROOT}/instances/hub/certs"
HUB_LOGS_DIR="${DIVE_ROOT}/logs/hub"

# =============================================================================
# INITIALIZATION FUNCTIONS
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
            log_dry "Running certificate generation"
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

    # 5. Register USA trusted issuer (like spokes do)
    log_step "Registering USA trusted issuer..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would register USA issuer in trusted_issuers.json"
    else
        _hub_register_usa_issuer
    fi

    # 6. Verify compose file
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

    # Save to .env.hub for reference (do not commit)
    cat > "${DIVE_ROOT}/.env.hub" << EOF
# Hub Secrets (auto-generated, do not commit)
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
MONGO_PASSWORD=${MONGO_PASSWORD}
AUTH_SECRET=${AUTH_SECRET}
KEYCLOAK_CLIENT_SECRET=${KEYCLOAK_CLIENT_SECRET}
FEDERATION_ADMIN_KEY=${FEDERATION_ADMIN_KEY}
EOF
    chmod 600 "${DIVE_ROOT}/.env.hub"
    log_info "Secrets saved to .env.hub (gitignored)"
}

_hub_generate_certs() {
    mkdir -p "${HUB_CERTS_DIR}"
    mkdir -p "${HUB_DATA_DIR}/truststores"

    # Generate comprehensive certificates with all container names
    log_info "Generating certificates with dive-hub-* container names..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would run certificate generation script"
    else
        # Use the comprehensive certificate generation script
        # Set COMPOSE_PROJECT_NAME to ensure dive-hub-* container names are included
        cd "${DIVE_ROOT}"
        COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dive-hub}" \
        CERT_HOST_SCOPE="${CERT_HOST_SCOPE:-full}" \
        SKIP_CERT_REGEN_IF_PRESENT=false \
        bash "${DIVE_ROOT}/scripts/generate-dev-certs.sh" 2>/dev/null || {
            log_warn "Certificate generation failed, falling back to self-signed cert"
            # Fallback to self-signed certificate
            openssl req -x509 -newkey rsa:4096 -sha256 -days 365 -nodes \
                -keyout "${HUB_CERTS_DIR}/key.pem" \
                -out "${HUB_CERTS_DIR}/certificate.pem" \
                -subj "/CN=dive-hub-keycloak" 2>/dev/null
        }
    fi

    log_success "TLS certificates generated"
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
  }
}
EOF

    log_success "Hub configuration created: ${config_file}"
}

_hub_register_usa_issuer() {
    # Register USA hub issuer in trusted_issuers.json (like spokes do)
    # This ensures JWT tokens from the USA hub are trusted during authorization

    local realm="dive-v3-broker-usa"
    local issuer_url="https://localhost:8443/realms/${realm}"
    local internal_url="https://keycloak:8443/realms/${realm}"

    log_info "Auto-registering USA hub trusted issuer..."

    # Update backend/data/opal/trusted_issuers.json
    # IMPORTANT: Issuers must be added inside the .trusted_issuers object, not at root level
    local trusted_issuers_file="${DIVE_ROOT}/backend/data/opal/trusted_issuers.json"
    if [ -f "$trusted_issuers_file" ]; then
        local tmp_file="${trusted_issuers_file}.tmp"
        if jq --arg url "$issuer_url" \
              --arg internal_url "$internal_url" \
              --arg tenant "USA" \
              --arg name "USA Hub Keycloak (Local Dev)" \
              --arg country "USA" \
           '.trusted_issuers[$url] = {
             "tenant": $tenant,
             "name": $name,
             "country": $country,
             "trust_level": "DEVELOPMENT",
             "enabled": true,
             "protocol": "oidc",
             "federation_class": "LOCAL"
           } | .trusted_issuers[$internal_url] = {
             "tenant": $tenant,
             "name": ($tenant + " Hub Keycloak (Internal Docker)"),
             "country": $country,
             "trust_level": "DEVELOPMENT",
             "enabled": true,
             "protocol": "oidc",
             "federation_class": "LOCAL"
           }' "$trusted_issuers_file" > "$tmp_file" 2>/dev/null; then
            mv "$tmp_file" "$trusted_issuers_file"
            log_verbose "Updated trusted_issuers.json with USA hub issuer"
        else
            rm -f "$tmp_file"
            log_warn "Failed to update trusted_issuers.json"
        fi
    else
        log_warn "trusted_issuers.json not found - will be created during first spoke registration"
    fi

    # Also register in policies/policy_data.json for OPA fallback
    local policy_data_file="${DIVE_ROOT}/policies/policy_data.json"
    if [ -f "$policy_data_file" ]; then
        local tmp_file="${policy_data_file}.tmp"
        if jq --arg url "$issuer_url" \
              --arg tenant "USA" \
              --arg name "USA Hub Keycloak (Local Dev)" \
              --arg country "USA" \
           '.trusted_issuers[$url] = {
             "tenant": $tenant,
             "name": $name,
             "country": $country,
             "trust_level": "DEVELOPMENT"
           }' "$policy_data_file" > "$tmp_file" 2>/dev/null; then
            mv "$tmp_file" "$policy_data_file"
            log_verbose "Updated policy_data.json with USA hub issuer"
        else
            rm -f "$tmp_file"
            log_warn "Failed to update policy_data.json"
        fi
    fi

    log_success "USA hub issuer registered"
}