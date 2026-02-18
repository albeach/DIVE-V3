#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Initialization Module
# =============================================================================
# Extracted from spoke.sh during refactoring for modularity
# Commands: spoke init, spoke setup-wizard
# =============================================================================
# Version: 1.0.0
# Date: 2025-12-23
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Mark this module as loaded
export DIVE_SPOKE_INIT_LOADED=1

# =============================================================================
# KAS AUTO-REGISTRATION HELPER (MongoDB-backed since Phase 3)
# =============================================================================
# ARCHITECTURE NOTE:
# As of Phase 3 (MongoDB KAS Registry Migration), KAS registration uses MongoDB
# instead of file-based kas-registry.json. This function is kept as a no-op
# for backward compatibility during the initialization phase.
#
# Actual MongoDB KAS registration occurs in:
#   scripts/dive-modules/spoke/pipeline/phase-configuration.sh
#   -> spoke_config_register_in_registries()
#   -> spoke_kas_register_mongodb()
#
# The MongoDB kas_registry collection is the SSOT for spoke KAS instances.
# Hub continues to use file-based registry (no changes to Hub deployment).
# =============================================================================


# =============================================================================
# AUTO-REGISTER TRUSTED ISSUER
# =============================================================================
# Automatically registers a spoke's Keycloak issuer in trusted_issuers.json
# This ensures JWT tokens from the spoke are trusted during authorization
# =============================================================================

_auto_register_trusted_issuer() {
    local code_upper="$1"
    local code_lower="$2"
    local keycloak_https_port="$3"

    local realm="dive-v3-broker-${code_lower}"
    local issuer_url="https://localhost:${keycloak_https_port}/realms/${realm}"
    local internal_url="https://keycloak-${code_lower}:8443/realms/${realm}"

    log_info "Auto-registering ${code_upper} trusted issuer..."

    # Update backend/data/opal/trusted_issuers.json
    # IMPORTANT: Issuers must be added inside the .trusted_issuers object, not at root level
    local trusted_issuers_file="${DIVE_ROOT}/backend/data/opal/trusted_issuers.json"
    if [ -f "$trusted_issuers_file" ]; then
        local tmp_file="${trusted_issuers_file}.tmp"
        if jq --arg url "$issuer_url" \
              --arg internal_url "$internal_url" \
              --arg tenant "$code_upper" \
              --arg name "${code_upper} Keycloak (Local Dev)" \
              --arg country "$code_upper" \
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
             "name": ($tenant + " Keycloak (Internal Docker)"),
             "country": $country,
             "trust_level": "DEVELOPMENT",
             "enabled": true,
             "protocol": "oidc",
             "federation_class": "LOCAL"
           }' "$trusted_issuers_file" > "$tmp_file" 2>/dev/null; then
            mv "$tmp_file" "$trusted_issuers_file"
            log_verbose "Updated trusted_issuers.json with ${code_upper} issuer"
        else
            rm -f "$tmp_file"
            log_warn "Failed to update trusted_issuers.json"
        fi
    fi

    # Update opal-data-source/trusted_issuers.json
    # IMPORTANT: Issuers must be added inside the .trusted_issuers object, not at root level
    local opal_issuers_file="${DIVE_ROOT}/opal-data-source/trusted_issuers.json"
    if [ -f "$opal_issuers_file" ]; then
        local tmp_file="${opal_issuers_file}.tmp"
        if jq --arg url "$issuer_url" \
              --arg internal_url "$internal_url" \
              --arg tenant "$code_upper" \
              --arg name "${code_upper} Keycloak (Local Dev)" \
              --arg country "$code_upper" \
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
             "name": ($tenant + " Keycloak (Internal Docker)"),
             "country": $country,
             "trust_level": "DEVELOPMENT",
             "enabled": true,
             "protocol": "oidc",
             "federation_class": "LOCAL"
           }' "$opal_issuers_file" > "$tmp_file" 2>/dev/null; then
            mv "$tmp_file" "$opal_issuers_file"
            log_verbose "Updated opal-data-source/trusted_issuers.json"
        else
            rm -f "$tmp_file"
        fi
    fi

    # Update policies/policy_data.json
    local policy_data_file="${DIVE_ROOT}/policies/policy_data.json"
    if [ -f "$policy_data_file" ]; then
        local tmp_file="${policy_data_file}.tmp"
        if jq --arg url "$issuer_url" \
              --arg internal_url "$internal_url" \
              --arg tenant "$code_upper" \
              --arg name "${code_upper} Keycloak" \
              --arg country "$code_upper" \
           '.trusted_issuers[$url] = {
             "tenant": $tenant,
             "name": $name,
             "country": $country,
             "trust_level": "DEVELOPMENT"
           } | .trusted_issuers[$internal_url] = {
             "tenant": $tenant,
             "name": ($tenant + " Keycloak (Internal)"),
             "country": $country,
             "trust_level": "DEVELOPMENT"
           } | .federation_matrix.USA += [$tenant] | .federation_matrix.USA |= unique' \
           "$policy_data_file" > "$tmp_file" 2>/dev/null; then
            mv "$tmp_file" "$policy_data_file"
            log_verbose "Updated policy_data.json with ${code_upper} issuer"
        else
            rm -f "$tmp_file"
        fi
    fi

    log_success "Trusted issuer registered for ${code_upper}"
    return 0
}

# =============================================================================
# SPOKE INITIALIZATION FUNCTIONS
# =============================================================================

spoke_setup_wizard() {
    local instance_code="${1:-}"
    local instance_name="${2:-}"

    print_header
    echo -e "${BOLD}🚀 DIVE V3 Spoke Setup Wizard${NC}"
        echo ""
    echo "This wizard will guide you through setting up a new DIVE V3 spoke."
        echo ""

    # Step 1: Basic Information
    if [ -z "$instance_code" ]; then
        echo -e "${CYAN}Step 1: Instance Information${NC}"
        echo ""
        read -p "  Enter 3-letter instance code (e.g., NZL, HOM): " instance_code
        if [ -z "$instance_code" ]; then
            log_error "Instance code is required"
        return 1
        fi
    fi

    if [ -z "$instance_name" ]; then
        local default_name="${instance_code} Instance"
        read -p "  Enter instance name [$default_name]: " instance_name
        instance_name="${instance_name:-$default_name}"
    fi

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    echo ""
    echo -e "  Instance Code: ${GREEN}$code_upper${NC}"
    echo -e "  Instance Name: ${GREEN}$instance_name${NC}"
    echo ""

    # Step 2: Hostname Configuration
    echo -e "${CYAN}Step 2: Hostname Configuration${NC}"
    echo ""
    echo "  How will your spoke be accessed?"
    echo ""
    echo "  1) Use dive25.com subdomains (${code_lower}-app.dive25.com, etc.)"
    echo "  2) Use custom domain names"
    echo "  3) Use IP address (local/development only)"
    echo ""
    read -p "  Select option [1-3]: " hostname_option

    local base_url=""
    local api_url=""
    local idp_url=""
    local idp_public_url=""
    local kas_url=""
    local needs_tunnel=false

    case "$hostname_option" in
        1)
            base_url="https://${code_lower}-app.dive25.com"
            api_url="https://${code_lower}-api.dive25.com"
            # For production: both URLs are the public domain
            idp_url="https://${code_lower}-idp.dive25.com"
            idp_public_url="https://${code_lower}-idp.dive25.com"
            kas_url="https://${code_lower}-kas.dive25.com"
            needs_tunnel=true
            ;;
        2)
            echo ""
            read -p "  Enter base domain (e.g., myorg.com): " custom_domain
            if [ -z "$custom_domain" ]; then
                log_error "Domain is required"
                return 1
            fi
            base_url="https://${code_lower}-app.${custom_domain}"
            api_url="https://${code_lower}-api.${custom_domain}"
            # For custom domain: both URLs are the public domain
            idp_url="https://${code_lower}-idp.${custom_domain}"
            idp_public_url="https://${code_lower}-idp.${custom_domain}"
            kas_url="https://${code_lower}-kas.${custom_domain}"
            ;;
        3)
            echo ""
            read -p "  Enter IP address or hostname: " ip_or_host
            if [ -z "$ip_or_host" ]; then
                ip_or_host="localhost"
            fi
            # Prefer instance-specific ports from instances/<code>/instance.json when available
            instance_file="instances/${code_lower}/instance.json"
            if [ -f "$instance_file" ] && command -v jq >/dev/null 2>&1; then
                frontend_port=$(jq -r '.ports.frontend // empty' "$instance_file")
                backend_port=$(jq -r '.ports.backend // empty' "$instance_file")
                keycloak_https_port=$(jq -r '.ports.keycloak_https // empty' "$instance_file")
                kas_port=$(jq -r '.ports.kas // empty' "$instance_file")
            fi
            frontend_port="${frontend_port:-3000}"
            backend_port="${backend_port:-4000}"
            keycloak_https_port="${keycloak_https_port:-8443}"
            kas_port="${kas_port:-8080}"
            base_url="https://${ip_or_host}:${frontend_port}"
            api_url="https://${ip_or_host}:${backend_port}"
            # For localhost: idpUrl is Docker container, idpPublicUrl is browser-accessible
            idp_url="https://dive-spoke-${code_lower}-keycloak:8443"
            idp_public_url="https://${ip_or_host}:${keycloak_https_port}"
            kas_url="https://${ip_or_host}:${kas_port}"
            ;;
        *)
            log_error "Invalid option"
            return 1
            ;;
    esac

    echo ""
    echo -e "  ${CYAN}Configured Endpoints:${NC}"
    echo "    Frontend:  $base_url"
    echo "    Backend:   $api_url"
    echo "    IdP:       $idp_url"
    echo "    KAS:       $kas_url"
    echo ""

    # Step 3: Cloudflare Tunnel (if using dive25.com)
    local tunnel_token=""
    local setup_tunnel=false
    local tunnel_id=""

    if [ "$needs_tunnel" = true ]; then
        echo -e "${CYAN}Step 3: Cloudflare Tunnel Setup${NC}"
        echo ""
        echo "  To make your spoke accessible at ${code_lower}-*.dive25.com,"
        echo "  you need a Cloudflare tunnel."
        echo ""
        echo "  Options:"
        echo "  1) 🚀 Auto-create tunnel (recommended - uses cloudflared CLI)"
        echo "  2) I have a Cloudflare tunnel token (paste it now)"
        echo "  3) Help me create a tunnel manually (opens dashboard)"
        echo "  4) Skip tunnel setup (configure manually later)"
        echo ""
        read -p "  Select option [1-4]: " tunnel_option

        case "$tunnel_option" in
            1)
                # Auto-create tunnel using cloudflared CLI
                _spoke_auto_create_tunnel "$code_lower" "$base_url" "$api_url" "$idp_url"
                local tunnel_result=$?
                if [ $tunnel_result -eq 0 ]; then
                    # Read the generated tunnel info
                    if [ -f "/tmp/dive-tunnel-${code_lower}.token" ]; then
                        tunnel_token=$(cat "/tmp/dive-tunnel-${code_lower}.token")
                        tunnel_id=$(cat "/tmp/dive-tunnel-${code_lower}.id" 2>/dev/null || echo "")
                        setup_tunnel=true
                        rm -f "/tmp/dive-tunnel-${code_lower}.token" "/tmp/dive-tunnel-${code_lower}.id"
                    fi
                fi
                ;;
            2)
                echo ""
                read -p "  Paste your Cloudflare tunnel token: " tunnel_token
                if [ -n "$tunnel_token" ]; then
                    setup_tunnel=true
                    echo -e "  ${GREEN}✓ Tunnel token saved${NC}"
                fi
                ;;
            3)
                echo ""
                echo -e "  ${YELLOW}Opening Cloudflare Zero Trust dashboard...${NC}"
                echo ""
                echo "  Steps to create a tunnel:"
                echo "    1. Go to: https://one.dash.cloudflare.com"
                echo "    2. Select 'Networks' > 'Tunnels'"
                echo "    3. Click 'Create a tunnel'"
                echo "    4. Name it: dive-spoke-${code_lower}"
                echo "    5. Copy the tunnel token"
                echo ""
                echo "  Add these public hostnames to your tunnel:"
                echo "    ${code_lower}-app.dive25.com → http://frontend-${code_lower}:3000"
                echo "    ${code_lower}-api.dive25.com → https://backend-${code_lower}:4000"
                echo "    ${code_lower}-idp.dive25.com → http://keycloak-${code_lower}:8080"
                echo ""
                # Try to open browser
                if command -v xdg-open &> /dev/null; then
                    xdg-open "https://one.dash.cloudflare.com" 2>/dev/null &
                elif command -v open &> /dev/null; then
                    open "https://one.dash.cloudflare.com" 2>/dev/null &
                fi
                read -p "  Press Enter after creating the tunnel, then paste token: " tunnel_token
                if [ -n "$tunnel_token" ]; then
                    setup_tunnel=true
                fi
                ;;
            4)
                echo ""
                echo -e "  ${YELLOW}Skipping tunnel setup. You'll need to configure it later.${NC}"
                ;;
        esac
    fi

    # Step 4: Contact Information
    echo ""
    echo -e "${CYAN}Step 4: Contact Information${NC}"
    echo ""
    read -p "  Contact email (for Hub notifications): " contact_email
    if [ -z "$contact_email" ]; then
        contact_email="admin@${code_lower}.local"
    fi

    # Step 5: Hub Configuration
    echo ""
    echo -e "${CYAN}Step 5: Hub Connection${NC}"
    echo ""
    # Environment-aware default
    local default_hub="https://localhost:4000"
    if [ "$ENVIRONMENT" != "local" ] && [ "$ENVIRONMENT" != "dev" ]; then
        default_hub="https://usa-api.dive25.com"
    fi
    read -p "  Hub URL [$default_hub]: " hub_url
    hub_url="${hub_url:-$default_hub}"

    # Step 6: Generate Secure Passwords
    echo ""
    echo -e "${CYAN}Step 6: Security Configuration${NC}"
    echo ""
    echo "  Generating secure passwords..."
    local postgres_pass=$(openssl rand -base64 16 | tr -d '/+=')
    local mongo_pass=$(openssl rand -base64 16 | tr -d '/+=')
    local keycloak_pass=$(openssl rand -base64 16 | tr -d '/+=')
    local auth_secret=$(openssl rand -base64 32)
    local client_secret=$(openssl rand -base64 24 | tr -d '/+=')
    echo -e "  ${GREEN}✓ Secure passwords generated${NC}"

    # Confirmation
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}Configuration Summary:${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Instance:     $code_upper - $instance_name"
    echo "  Frontend:     $base_url"
    echo "  Backend:      $api_url"
    echo "  IdP:          $idp_url"
    echo "  Hub:          $hub_url"
    echo "  Contact:      $contact_email"
    echo "  Tunnel:       $([ "$setup_tunnel" = true ] && echo "Configured" || echo "Not configured")"
    echo ""
    read -p "  Proceed with setup? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Cancelled"
            return 1
    fi

    # Now call spoke_init with all the collected information
    _spoke_init_internal "$code_upper" "$instance_name" "$base_url" "$api_url" "$idp_url" "$idp_public_url" "$kas_url" \
        "$hub_url" "$contact_email" "$tunnel_token" "$postgres_pass" "$mongo_pass" \
        "$keycloak_pass" "$auth_secret" "$client_secret" "$setup_tunnel"
}

# Internal initialization function (called by wizard or directly)
_spoke_init_internal() {
    local instance_code="$1"
    local instance_name="$2"
    local base_url="$3"
    local api_url="$4"
    local idp_url="$5"
    local idp_public_url="$6"
    local kas_url="$7"
    local hub_url="$8"
    local contact_email="$9"
    local tunnel_token="${10}"
    local postgres_pass="${11}"
    local mongo_pass="${12}"
    local keycloak_pass="${13}"
    local auth_secret="${14}"
    local client_secret="${15}"
    local setup_tunnel="${16}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    ensure_dive_root
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    # ==========================================================================
    # CRITICAL FIX (2026-01-27): Calculate port offsets FIRST
    # ==========================================================================
    # Port variables are needed for certificate generation and other functions
    # Must be set before any operations that use them
    # ==========================================================================
    eval "$(get_instance_ports "$code_upper")"

    # Extract individual port variables for later use
    local keycloak_https_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
    local keycloak_http_port="${SPOKE_KEYCLOAK_HTTP_PORT:-8080}"
    local kas_port="${SPOKE_KAS_PORT:-8085}"

    # Create directory structure
    log_step "Creating instance directory structure"
    mkdir -p "$spoke_dir"
    mkdir -p "$spoke_dir/certs"
    mkdir -p "$spoke_dir/certs/crl"
    mkdir -p "$spoke_dir/truststores"
    mkdir -p "$spoke_dir/cache/policies"
    mkdir -p "$spoke_dir/cache/audit"
    mkdir -p "$spoke_dir/cloudflared"
    mkdir -p "$spoke_dir/logs"

    # ==========================================================================
    # CRITICAL FIX (2026-01-22): DO NOT generate local spokeId
    # ==========================================================================
    # ROOT CAUSE: Local spokeId generation creates IDs that don't match Hub's
    # Hub MongoDB is SSOT for spokeId - will be assigned during registration
    # Use placeholder until Hub assigns real spokeId
    local spoke_id="PENDING_REGISTRATION"

    # Try to register with Hub NOW to get real spokeId
    local hub_api="${HUB_URL:-https://localhost:4000}"
    if curl -sk --max-time 5 "${hub_api}/api/health" >/dev/null 2>&1; then
        log_verbose "Hub available - requesting spokeId"
        local reg_response
        reg_response=$(curl -sk --max-time 30 -X POST "${hub_api}/api/federation/register" \
            -H "Content-Type: application/json" \
            -d "{\"instanceCode\":\"$code_upper\",\"name\":\"$instance_name\",\"baseUrl\":\"$base_url\",\"apiUrl\":\"$api_url\",\"idpUrl\":\"$idp_url\",\"idpPublicUrl\":\"$idp_public_url\",\"requestedScopes\":[\"policy:base\",\"policy:org\",\"policy:tenant\"],\"contactEmail\":\"$contact_email\",\"skipValidation\":true}" 2>&1)

        local hub_spoke_id=$(echo "$reg_response" | jq -r '.spoke.spokeId // empty' 2>/dev/null)
        if [ -n "$hub_spoke_id" ] && [ "$hub_spoke_id" != "null" ]; then
            spoke_id="$hub_spoke_id"
            log_success "✓ Got spokeId from Hub: $spoke_id"
        fi
    fi

    # If still pending, use temp ID (will be updated during registration)
    if [ "$spoke_id" = "PENDING_REGISTRATION" ]; then
        spoke_id="spoke-${code_lower}-temp-$(openssl rand -hex 4)"
        log_verbose "Using temporary spokeId (will be updated during registration)"
    fi

    # Extract hostname from IdP URL for Keycloak config
    local idp_hostname=$(echo "$idp_url" | sed 's|https://||' | cut -d: -f1)

    # Create .env file with GCP secret references (NO SECRETS STORED LOCALLY)
    log_step "Creating environment configuration (GCP Secret Manager references)"

    cat > "$spoke_dir/.env" << EOF
# ${code_upper} Spoke Configuration (GCP Secret Manager references)
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ⚠️  NO SECRETS STORED HERE - All secrets loaded from GCP Secret Manager at runtime

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
HUB_OPAL_URL=https://dive-hub-opal-server:7002
SPOKE_OPAL_TOKEN=
OPAL_LOG_LEVEL=INFO

# Cloudflare tunnel (if configured)
TUNNEL_TOKEN=$tunnel_token

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

    # Create Cloudflare tunnel config if token provided
    if [ -n "$tunnel_token" ] && [ "$setup_tunnel" = true ]; then
        log_step "Creating Cloudflare tunnel configuration"

        # Get tunnel ID if available
        local tunnel_id_file="/tmp/dive-tunnel-${code_lower}.id"
        local tunnel_id=""
        if [ -f "$tunnel_id_file" ]; then
            tunnel_id=$(cat "$tunnel_id_file")
        fi

        cat > "$spoke_dir/cloudflared/config.yml" << EOF
# Cloudflare Tunnel Configuration for DIVE V3 Spoke: $code_upper
# Auto-generated by spoke setup wizard
# Tunnel ID: ${tunnel_id:-<manually-configure>}

tunnel: ${tunnel_id:-dive-spoke-${code_lower}}
credentials-file: /etc/cloudflared/credentials.json

ingress:
  # Frontend (Next.js)
  - hostname: ${code_lower}-app.dive25.com
    service: http://frontend-${code_lower}:3000

  # Backend API
  - hostname: ${code_lower}-api.dive25.com
    service: https://backend-${code_lower}:4000
    originRequest:
      noTLSVerify: true

  # Keycloak IdP
  - hostname: ${code_lower}-idp.dive25.com
    service: http://keycloak-${code_lower}:8080

  # KAS (Key Access Service)
  - hostname: ${code_lower}-kas.dive25.com
    service: http://kas-${code_lower}:8080

  # Catch-all (required)
  - service: http_status:404
EOF

        # Clean up temp file
        rm -f "$tunnel_id_file" "/tmp/dive-tunnel-${code_lower}.mode"
    fi

    # Create docker-compose.yml
    log_step "Creating Docker Compose configuration"
    _create_spoke_docker_compose "$spoke_dir" "$code_upper" "$code_lower" "$instance_name" \
        "$spoke_id" "$idp_hostname" "$api_url" "$base_url" "$idp_url" "$tunnel_token"

    # ==========================================================================
    # SSOT: Use certificates.sh module for ALL certificate generation
    # ==========================================================================
    # FIX (2026-01-15): Replaced inline certificate generation with SSOT function
    # This ensures comprehensive SANs including Hub containers for federation
    # ==========================================================================

    log_step "Generating TLS certificates"

    # Load certificates module (SSOT)
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"

        # Use SSOT function with comprehensive SANs (includes Hub + Spoke containers)
        if type generate_spoke_certificate &>/dev/null; then
            if generate_spoke_certificate "$code_lower"; then
                log_success "TLS certificates generated via SSOT"
            else
                log_error "Failed to generate certificates via SSOT"
                return 1
            fi
        else
            log_error "generate_spoke_certificate function not available"
            return 1
        fi

        # Install CA in spoke truststore (mkcert for local dev only)
        if ! is_cloud_environment 2>/dev/null && type install_mkcert_ca_in_spoke &>/dev/null; then
            install_mkcert_ca_in_spoke "$code_lower" || {
                log_warn "CA installation had issues (non-critical)"
            }
        elif type _rebuild_spoke_ca_bundle &>/dev/null; then
            _rebuild_spoke_ca_bundle "$code_lower" 2>/dev/null || true
        fi
    else
        log_error "certificates.sh module not found"
        log_error "Cannot generate federation-compatible certificates"
        return 1
    fi

    # Generate spoke mTLS certificates
    log_step "Generating spoke mTLS certificates"
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

    echo ""

    # ==========================================================================
    # AUTO-REGISTER TRUSTED ISSUER (Best Practice: JWT Trust Automation)
    # ==========================================================================
    _auto_register_trusted_issuer "$code_upper" "$code_lower" "$keycloak_https_port"

# ==========================================================================
# GCP SECRET MANAGER INTEGRATION
# ==========================================================================
# Secrets are now managed by GCP Secret Manager automatically
# They will be generated on-demand during deployment if they don't exist
log_info "GCP Secret Manager will manage secrets automatically during deployment"
    log_success "Spoke instance initialized: $code_upper"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}🎉 Setup Complete!${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${BOLD}Instance Details:${NC}"
    echo "  Spoke ID:        $spoke_id"
    echo "  Instance Code:   $code_upper"
    echo "  Name:            $instance_name"
    echo "  Directory:       $spoke_dir"
    echo ""
    echo -e "${BOLD}Endpoints:${NC}"
    echo "  Frontend:        $base_url"
    echo "  Backend API:     $api_url"
    echo "  Keycloak IdP:    $idp_url"
    echo ""
    echo -e "${BOLD}Files Created:${NC}"
    echo "  ✓ $spoke_dir/docker-compose.yml"
    echo "  ✓ $spoke_dir/.env (ready to use!)"
    echo "  ✓ $spoke_dir/certs/* (TLS certificates)"
    if [ -n "$tunnel_token" ]; then
        echo "  ✓ $spoke_dir/cloudflared/config.yml"
    fi
    echo ""
    echo -e "${BOLD}Next Steps:${NC}"
    if [ -n "$tunnel_token" ]; then
        echo "  1. Start services:         cd $spoke_dir && docker compose up -d"
        echo "  2. Register with hub:      ./dive spoke register $code_upper"
        echo "  3. Wait for hub approval"
        echo "  4. Add SPOKE_OPAL_TOKEN to .env (after approval)"
    else
        echo "  1. Configure DNS/tunnel for your hostnames"
        echo "  2. Start services:         cd $spoke_dir && docker compose up -d"
        echo "  3. Register with hub:      ./dive spoke register $code_upper"
    fi
    echo ""
}


# Load legacy init, wizard, and keycloak initialization functions
source "$(dirname "${BASH_SOURCE[0]}")/spoke-init-legacy.sh"
