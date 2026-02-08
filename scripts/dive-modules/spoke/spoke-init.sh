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

    # Create config.json
    log_step "Creating spoke configuration"
    cat > "$spoke_dir/config.json" << EOF
{
  "identity": {
    "spokeId": "$spoke_id",
    "instanceCode": "$code_upper",
    "name": "$instance_name",
    "description": "DIVE V3 Spoke Instance for $instance_name",
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

        # Install mkcert CA in spoke truststore (SSOT function)
        if type install_mkcert_ca_in_spoke &>/dev/null; then
            install_mkcert_ca_in_spoke "$code_lower" || {
                log_warn "CA installation had issues (non-critical)"
            }
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
    echo "  ✓ $spoke_dir/config.json"
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

# Helper function to create docker-compose.yml from template
# Uses standardized template with version tracking for drift detection
_create_spoke_docker_compose() {
    local spoke_dir="$1"
    local code_upper="$2"
    local code_lower="$3"
    local instance_name="$4"
    local spoke_id="$5"
    local idp_hostname="$6"
    local api_url="$7"
    local base_url="$8"
    local idp_url="$9"
    local tunnel_token="${10}"

    # ==========================================================================
    # Port allocation based on instance code (spoke-in-a-box pattern)
    # Uses centralized get_instance_ports function for consistency
    # ==========================================================================
    eval "$(get_instance_ports "$code_upper")"

    local frontend_host_port=$SPOKE_FRONTEND_PORT
    local backend_host_port=$SPOKE_BACKEND_PORT
    local keycloak_https_port=$SPOKE_KEYCLOAK_HTTPS_PORT
    local keycloak_http_port=$SPOKE_KEYCLOAK_HTTP_PORT
    local postgres_host_port=$SPOKE_POSTGRES_PORT
    local mongodb_host_port=$SPOKE_MONGODB_PORT
    local redis_host_port=$SPOKE_REDIS_PORT
    local opa_host_port=$SPOKE_OPA_PORT
    local kas_host_port=$SPOKE_KAS_PORT

    # ==========================================================================
    # Country-specific theming from NATO countries database
    # ==========================================================================
    local theme_primary=$(get_country_primary_color "$code_upper")
    local theme_secondary=$(get_country_secondary_color "$code_upper")
    local country_timezone=$(get_country_timezone "$code_upper")
    local country_name=$(get_country_name "$code_upper")

    # Fallback to default colors if country not in database
    if [ -z "$theme_primary" ]; then
        theme_primary="#1a365d"
        theme_secondary="#2b6cb0"
        log_verbose "Using default theme colors for $code_upper (no custom colors defined)"
    fi

    log_info "Using theme colors for $code_upper: primary=$theme_primary, secondary=$theme_secondary"

    # Build base URLs for local development
    local app_base_url="https://localhost:${frontend_host_port}"
    local api_base_url="https://localhost:${backend_host_port}"
    local idp_base_url="https://localhost:${keycloak_https_port}"

    # ==========================================================================
    # Use template file (SSOT for docker-compose structure)
    # ==========================================================================
    local template_file="${DIVE_ROOT}/templates/spoke/docker-compose.template.yml"

    if [ ! -f "$template_file" ]; then
        log_error "Template file not found: $template_file"
        return 1
    fi

    # Calculate template hash for drift detection
    local template_hash=$(md5sum "$template_file" | awk '{print $1}')
    local timestamp=$(date -Iseconds)

    log_info "Generating docker-compose.yml from template (hash: ${template_hash:0:12})"

    # Copy template and replace placeholders
    cp "$template_file" "$spoke_dir/docker-compose.yml"

    # Portable sed for cross-platform compatibility (macOS + Linux)
    local tmpfile=$(mktemp)
    local opal_opa_offset=$(echo -n "${code_lower}" | cksum | cut -d' ' -f1)
    local opal_opa_port=$((9181 + (opal_opa_offset % 100)))
    
    # Replace all placeholders in one go
    sed "s|{{TEMPLATE_HASH}}|${template_hash}|g; \
         s|{{TIMESTAMP}}|${timestamp}|g; \
         s|{{INSTANCE_CODE_UPPER}}|${code_upper}|g; \
         s|{{INSTANCE_CODE_LOWER}}|${code_lower}|g; \
         s|{{INSTANCE_NAME}}|${instance_name}|g; \
         s|{{SPOKE_ID}}|${spoke_id}|g; \
         s|{{IDP_HOSTNAME}}|${idp_hostname}|g; \
         s|{{API_URL}}|${api_base_url}|g; \
         s|{{BASE_URL}}|${app_base_url}|g; \
         s|{{IDP_URL}}|${idp_url}|g; \
         s|{{IDP_BASE_URL}}|${idp_base_url}|g; \
         s|{{KEYCLOAK_HOST_PORT}}|${keycloak_https_port}|g; \
         s|{{KEYCLOAK_HTTP_PORT}}|${keycloak_http_port}|g; \
         s|{{SPOKE_KEYCLOAK_HTTPS_PORT}}|${keycloak_https_port}|g; \
         s|{{BACKEND_HOST_PORT}}|${backend_host_port}|g; \
         s|{{FRONTEND_HOST_PORT}}|${frontend_host_port}|g; \
         s|{{OPA_HOST_PORT}}|${opa_host_port}|g; \
         s|{{OPAL_OPA_PORT}}|${opal_opa_port}|g; \
         s|{{KAS_HOST_PORT}}|${kas_host_port}|g" "$spoke_dir/docker-compose.yml" > "$tmpfile" && mv "$tmpfile" "$spoke_dir/docker-compose.yml"

    log_success "Generated docker-compose.yml from template (always regenerated from SSOT)"
}
# Original spoke_init (backward compatible, calls wizard or direct)
spoke_init() {
    local instance_code="${1:-}"
    local instance_name="${2:-}"

    # If both arguments provided, use direct (non-interactive) mode
    if [ -n "$instance_code" ] && [ -n "$instance_name" ]; then
        # Check for --wizard flag
        if [ "${3:-}" = "--wizard" ] || [ "${3:-}" = "-w" ]; then
            spoke_setup_wizard "$instance_code" "$instance_name"
            return $?
        fi

        # Direct initialization (legacy mode)
        _spoke_init_legacy "$instance_code" "$instance_name"
        return $?
    fi

    # No arguments or partial - launch wizard
    spoke_setup_wizard "$instance_code" "$instance_name"
}

# Legacy spoke_init for backward compatibility
_spoke_init_legacy() {
    local instance_code="${1:-}"
    local instance_name="${2:-}"

    if [ -z "$instance_code" ] || [ -z "$instance_name" ]; then
        log_error "Usage: ./dive spoke init <CODE> <NAME>"
    echo ""
        echo "Example: ./dive spoke init NZL 'New Zealand Defence Force'"
    echo ""
        echo "Arguments:"
        echo "  CODE    3-letter country code (ISO 3166-1 alpha-3)"
        echo "  NAME    Human-readable instance name"
    echo ""
        echo "For interactive setup wizard, run: ./dive spoke init"
        return 1
    fi

    # CODE FORMAT VALIDATION
    # 1. Length must be exactly 3 characters (ISO 3166-1 alpha-3)
    if [ ${#instance_code} -ne 3 ]; then
        log_error "Instance code must be exactly 3 characters (ISO 3166-1 alpha-3)"
        echo "  Examples: USA, FRA, POL, GBR, EST"
        return 1
    fi

    # 2. Must be alphabetic only (no numbers or special characters)
    if ! [[ "$instance_code" =~ ^[A-Za-z]{3}$ ]]; then
        log_error "Instance code must contain only letters (A-Z)"
        echo "  Invalid: $instance_code"
        echo "  Valid examples: USA, FRA, POL"
        return 1
    fi

    # 3. Normalize to uppercase
    instance_code="${instance_code^^}"

    # 4. NATO country validation (warning, not blocking)
    if type -t is_nato_country &>/dev/null && ! is_nato_country "$instance_code" 2>/dev/null; then
        if type -t is_partner_nation &>/dev/null && ! is_partner_nation "$instance_code" 2>/dev/null; then
            log_warn "Warning: '$instance_code' is not a recognized NATO country or partner nation"
            log_warn "Port allocation will use hash-based fallback (offsets 48+)"
            echo ""
            echo "  Valid NATO countries (32):"
            if type -t list_nato_countries &>/dev/null; then
                list_nato_countries 2>/dev/null | head -5
                echo "  ... (see './dive spoke list-countries' for full list)"
            fi
            echo ""
            echo "  This may cause port conflicts if multiple non-NATO codes are used."
            echo ""
            read -p "  Continue anyway? (yes/no): " confirm
            if [ "$confirm" != "yes" ]; then
                log_info "Cancelled"
                return 1
            fi
        else
            log_info "Partner nation detected: $instance_code (will use offsets 32-39)"
        fi
    else
        log_info "NATO country detected: $instance_code"
    fi

    # Use default values and call internal init
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local hub_url="${DIVE_HUB_URL:-https://localhost:4000}"

    # Calculate ports using centralized function (ensures consistency with docker-compose)
    eval "$(get_instance_ports "$code_upper")"

    local frontend_port=$SPOKE_FRONTEND_PORT
    local backend_port=$SPOKE_BACKEND_PORT
    local keycloak_port=$SPOKE_KEYCLOAK_HTTPS_PORT
    local kas_port=$SPOKE_KAS_PORT

    # Generate localhost URLs for local development (default)
    # For production, use the interactive init with Cloudflare tunnel
    local base_url="https://localhost:${frontend_port}"
    local api_url="https://localhost:${backend_port}"
    # idpUrl uses Docker container name for internal communication
    # idpPublicUrl uses localhost for browser access
    local idp_url="https://dive-spoke-${code_lower}-keycloak:8443"
    local idp_public_url="https://localhost:${keycloak_port}"
    local kas_url="https://localhost:${kas_port}"

    # ==========================================================================
    # BEST PRACTICE: Check for stale volumes and reuse passwords if they exist
    # This prevents database authentication failures on redeployment
    # ==========================================================================
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local env_file="$spoke_dir/.env"
    local has_stale_volumes=false

    # Check for existing volumes (common naming patterns)
    local volume_patterns=(
        "${code_lower}_${code_lower}-postgres-data"
        "${code_lower}_${code_lower}_postgres_data"
        "dive-spoke-${code_lower}_${code_lower}-postgres-data"
    )

    for pattern in "${volume_patterns[@]}"; do
        if docker volume ls -q 2>/dev/null | grep -q "^${pattern}$"; then
            has_stale_volumes=true
            break
        fi
    done

    # Password generation strategy:
    # 1. If .env exists, reuse passwords (ensures consistency with existing volumes)
    # 2. If stale volumes exist but no .env, warn and clean volumes
    # 3. Otherwise, generate fresh passwords

    local postgres_pass=""
    local mongo_pass=""
    local keycloak_pass=""
    local auth_secret=""
    local client_secret=""

    if [ -f "$env_file" ]; then
        # Reuse existing passwords from .env file
        log_info "Found existing .env file - reusing passwords for volume consistency"
        postgres_pass=$(grep "^POSTGRES_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"')
        mongo_pass=$(grep "^MONGO_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"')
        keycloak_pass=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"')
        auth_secret=$(grep "^AUTH_SECRET=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"')
        client_secret=$(grep "^AUTH_KEYCLOAK_SECRET=" "$env_file" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"')
    elif [ "$has_stale_volumes" = true ]; then
        # Stale volumes exist but no .env - this will cause password mismatch!
        log_warn "Stale Docker volumes detected for ${code_upper} but no .env file found"
        log_warn "This will cause database authentication failures"
        echo ""
        echo -e "${YELLOW}  Recommended: Clean up stale volumes first:${NC}"
        echo -e "    ./dive --instance ${code_lower} spoke clean"
        echo ""

        # Auto-clean stale volumes for better UX
        log_info "Auto-cleaning stale volumes for fresh deployment..."
        # Use compose to clean volumes instead of pattern matching
        if [ -f "${spoke_dir}/docker-compose.yml" ]; then
            (cd "$spoke_dir" && COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}" docker compose down -v 2>/dev/null) || true
        fi
    fi

    # Generate fresh passwords for any missing values
    [ -z "$postgres_pass" ] && postgres_pass=$(openssl rand -base64 16 | tr -d '/+=')
    [ -z "$mongo_pass" ] && mongo_pass=$(openssl rand -base64 16 | tr -d '/+=')
    [ -z "$keycloak_pass" ] && keycloak_pass=$(openssl rand -base64 16 | tr -d '/+=')
    [ -z "$auth_secret" ] && auth_secret=$(openssl rand -base64 32)
    [ -z "$client_secret" ] && client_secret=$(openssl rand -base64 24 | tr -d '/+=')

    # Generate default contact email based on instance code
    local contact_email="admin@${code_lower}.dive25.com"

    print_header
    echo -e "${BOLD}Initializing DIVE V3 Spoke Instance:${NC} $code_upper"
    echo ""
    echo -e "${YELLOW}Tip: For interactive setup with hostname and tunnel configuration,${NC}"
    echo -e "${YELLOW}     run: ./dive spoke init (without arguments)${NC}"
    echo ""

    # Call internal init with default contact email
    _spoke_init_internal "$code_upper" "$instance_name" "$base_url" "$api_url" "$idp_url" "$idp_public_url" "$kas_url" \
        "$hub_url" "$contact_email" "" "$postgres_pass" "$mongo_pass" "$keycloak_pass" "$auth_secret" "$client_secret" "false"
}

# =============================================================================
# KEYCLOAK INITIALIZATION
# =============================================================================

spoke_init_keycloak() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Initializing Keycloak for Spoke:${NC} ${code_upper}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would initialize Keycloak realm and client for $code_upper"
        return 0
    fi

    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not deployed: $instance_code"
        echo ""
        echo "Deploy first: ./dive spoke deploy $instance_code <name>"
        return 1
    fi

    # Get port configuration
    eval "$(get_instance_ports "$code_upper")"
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"

    # Get admin password
    local kc_pass=""
    kc_pass=$(get_keycloak_password "dive-spoke-${code_lower}-keycloak" 2>/dev/null || true)

    if [ -z "$kc_pass" ]; then
        # Try from .env
        if [ -f "$spoke_dir/.env" ]; then
            kc_pass=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2 | tr -d '\n\r"')
        fi
    fi

    if [ -z "$kc_pass" ]; then
        log_error "Cannot find Keycloak admin password for $code_upper"
        echo ""
        echo "Ensure the spoke is properly deployed and .env file exists."
        return 1
    fi

    # Wait for Keycloak to be ready
    echo -e "${CYAN}Waiting for Keycloak to be ready...${NC}"
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -kfs "https://localhost:${kc_port}/health/ready" >/dev/null 2>&1; then
            log_success "Keycloak is ready"
            echo ""
            break
        fi

        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done

    if [ $attempt -gt $max_attempts ]; then
        log_error "Keycloak failed to become ready after $max_attempts attempts"
        return 1
    fi

    # Get admin token
    echo -e "${CYAN}Getting admin token...${NC}"
    local admin_token
    admin_token=$(curl -sk -X POST "https://localhost:${kc_port}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${kc_pass}" | jq -r '.access_token // empty')

    if [ -z "$admin_token" ]; then
        log_error "Failed to get Keycloak admin token"
        return 1
    fi
    log_success "Admin token obtained"
    echo ""

    # Create realm if it doesn't exist
    local realm_name="dive-v3-broker-${code_lower}"
    echo -e "${CYAN}Checking realm: ${realm_name}...${NC}"

    local realm_exists
    realm_exists=$(curl -sk -H "Authorization: Bearer ${admin_token}" \
        "https://localhost:${kc_port}/admin/realms/${realm_name}" 2>/dev/null | jq -r '.realm // empty')

    if [ -z "$realm_exists" ]; then
        echo -e "${CYAN}Creating realm...${NC}"
        local realm_data=$(cat <<EOF
{
    "realm": "${realm_name}",
    "displayName": "DIVE V3 Broker - ${code_upper}",
    "enabled": true,
    "sslRequired": "external",
    "registrationAllowed": false,
    "loginWithEmailAllowed": true,
    "duplicateEmailsAllowed": false,
    "resetPasswordAllowed": true,
    "editUsernameAllowed": false,
    "bruteForceProtected": true
}
EOF
)

        curl -sk -X POST "https://localhost:${kc_port}/admin/realms" \
            -H "Authorization: Bearer ${admin_token}" \
            -H "Content-Type: application/json" \
            -d "$realm_data"

        if [ $? -eq 0 ]; then
            log_success "Realm created: ${realm_name}"
        else
            log_error "Failed to create realm"
            return 1
        fi
    else
        log_info "Realm already exists: ${realm_name}"
    fi
    echo ""

    # Create client
    local client_id="dive-v3-broker-${code_lower}"
    echo -e "${CYAN}Checking client: ${client_id}...${NC}"

    local client_exists
    client_exists=$(curl -sk -H "Authorization: Bearer ${admin_token}" \
        "https://localhost:${kc_port}/admin/realms/${realm_name}/clients?clientId=${client_id}" 2>/dev/null | jq -r '.[0].id // empty')

    if [ -z "$client_exists" ]; then
        echo -e "${CYAN}Creating client...${NC}"

        # Build redirect URIs
        local redirect_uris=$(cat <<EOF
[
    "https://localhost:3000",
    "https://localhost:3000/*",
    "https://localhost:3000/api/auth/callback/keycloak",
    "https://${code_lower}-app.dive25.com",
    "https://${code_lower}-app.dive25.com/*",
    "https://${code_lower}-app.dive25.com/api/auth/callback/keycloak",
    "*"
]
EOF
)

        local client_data=$(cat <<EOF
{
    "clientId": "${client_id}",
    "name": "DIVE V3 Frontend - ${code_upper}",
    "description": "Frontend application for DIVE V3 spoke ${code_upper}",
    "enabled": true,
    "protocol": "openid-connect",
    "clientAuthenticatorType": "client-secret",
    "secret": "CHANGE_THIS_SECRET",
    "directAccessGrantsEnabled": true,
    "serviceAccountsEnabled": false,
    "implicitFlowEnabled": false,
    "standardFlowEnabled": true,
    "publicClient": false,
    "redirectUris": ${redirect_uris},
    "webOrigins": ["*"],
    "attributes": {
        "saml.assertion.signature": "false",
        "saml.multivalued.roles": "false",
        "saml.force.post.binding": "false",
        "saml.encrypt": "false",
        "saml.server.signature": "false",
        "saml.server.signature.keyinfo.ext": "false",
        "exclude.session.state.from.auth.response": "false",
        "saml_force_name_id_format": "false",
        "saml.client.signature": "false",
        "tls.client.certificate.bound.access.tokens": "false",
        "saml.authnstatement": "false",
        "display.on.consent.screen": "false",
        "saml.onetimeuse.condition": "false"
    }
}
EOF
)

        curl -sk -X POST "https://localhost:${kc_port}/admin/realms/${realm_name}/clients" \
            -H "Authorization: Bearer ${admin_token}" \
            -H "Content-Type: application/json" \
            -d "$client_data"

        if [ $? -eq 0 ]; then
            log_success "Client created: ${client_id}"
        else
            log_error "Failed to create client"
            return 1
        fi
    else
        log_info "Client already exists: ${client_id}"
    fi

    # Retrieve actual client secret from Keycloak and update .env file
    log_step "Retrieving client secret and updating configuration..."
    _update_spoke_client_secret "$code_upper" "$env_file" "$admin_token" "$realm_name" "$client_id"

    echo ""
    log_success "Keycloak initialization complete for ${code_upper}!"
    echo ""
    echo "Realm: ${realm_name}"
    echo "Client: ${client_id}"
    echo "Client Secret: Configured ✓"
    echo ""
    echo "Next steps:"
    echo "  1. Configure protocol mappers: ./dive spoke fix-mappers"
    echo "  2. Start frontend: ./dive spoke up"
    echo ""
}

# =============================================================================
# CLIENT SECRET RETRIEVAL AND CONFIGURATION
# =============================================================================

_update_spoke_client_secret() {
    local code_upper="$1"
    local env_file="$2"
    local admin_token="$3"
    local realm_name="$4"
    local client_id="$5"

    # Get client UUID from clientId
    local client_uuid
    client_uuid=$(curl -sk "https://localhost:${kc_port}/admin/realms/${realm_name}/clients?clientId=${client_id}" \
        -H "Authorization: Bearer ${admin_token}" 2>/dev/null | jq -r '.[0].id')

    if [ -z "$client_uuid" ] || [ "$client_uuid" = "null" ]; then
        log_error "Failed to get client UUID for ${client_id}"
        return 1
    fi

    # Get actual client secret from Keycloak
    local actual_secret
    actual_secret=$(curl -sk "https://localhost:${kc_port}/admin/realms/${realm_name}/clients/${client_uuid}/client-secret" \
        -H "Authorization: Bearer ${admin_token}" 2>/dev/null | jq -r '.value')

    if [ -z "$actual_secret" ] || [ "$actual_secret" = "null" ]; then
        log_error "Failed to retrieve client secret for ${client_id}"
        return 1
    fi

    # Update .env file with actual secret
    if [ -f "$env_file" ]; then
        # Update the instance-specific client secret variable
        sed -i.tmp "s|^KEYCLOAK_CLIENT_SECRET_${code_upper}=.*|KEYCLOAK_CLIENT_SECRET_${code_upper}=${actual_secret}|" "$env_file"
        rm -f "${env_file}.tmp"

        log_success "Client secret updated in ${env_file}"
        log_verbose "Client ID: ${client_id}"
        log_verbose "Secret: ${actual_secret:0:8}..."
    else
        log_error ".env file not found: ${env_file}"
        return 1
    fi
}

# =============================================================================
# CERTIFICATE GENERATION
# =============================================================================

