#!/usr/local/bin/bash
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
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Mark this module as loaded
export DIVE_SPOKE_INIT_LOADED=1

# =============================================================================
# KAS AUTO-REGISTRATION HELPER
# =============================================================================
# Automatically registers a spoke's KAS server in config/kas-registry.json
# This ensures ZTDF encryption works without manual configuration edits
# =============================================================================

_auto_register_kas() {
    local code_upper="$1"
    local code_lower="$2"
    local kas_port="$3"

    local kas_registry="${DIVE_ROOT}/config/kas-registry.json"

    if [ ! -f "$kas_registry" ]; then
        log_warn "KAS registry not found: $kas_registry"
        return 0  # Non-fatal
    fi

    # Check if KAS entry already exists
    if jq -e ".kasServers[] | select(.countryCode == \"$code_upper\")" "$kas_registry" >/dev/null 2>&1; then
        log_info "KAS entry for $code_upper already exists (skipping registration)"
        return 0
    fi

    log_info "Auto-registering $code_upper in KAS registry..."

    # Get country name from NATO database
    local country_name="$code_upper"
    if declare -F get_country_name >/dev/null 2>&1; then
        country_name=$(get_country_name "$code_upper" 2>/dev/null || echo "$code_upper")
    fi

    # Create KAS entry JSON
    local kas_entry=$(cat <<EOF
{
  "kasId": "${code_lower}-kas",
  "organization": "$country_name",
  "countryCode": "$code_upper",
  "kasUrl": "https://localhost:${kas_port}/api/kas",
  "internalKasUrl": "http://kas-${code_lower}:8080",
  "authMethod": "jwt",
  "authConfig": {
    "jwtIssuer": "https://${code_lower}-idp.dive25.com/realms/dive-v3-broker-${code_lower}",
    "jwtAudience": "dive-v3-broker"
  },
  "trustLevel": "high",
  "supportedCountries": ["$code_upper"],
  "supportedCOIs": ["NATO", "NATO-COSMIC", "EU-RESTRICTED"],
  "policyTranslation": {
    "clearanceMapping": {
      "UNCLASSIFIED": "UNCLASSIFIED",
      "RESTRICTED": "RESTRICTED",
      "CONFIDENTIAL": "CONFIDENTIAL",
      "SECRET": "SECRET",
      "TOP_SECRET": "TOP_SECRET"
    }
  },
  "metadata": {
    "version": "1.0.0",
    "capabilities": ["key-release", "policy-evaluation", "audit-logging", "ztdf-support"],
    "contact": "kas-admin@${code_lower}.dive25.com",
    "lastVerified": "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date +%Y-%m-%dT%H:%M:%SZ)",
    "healthEndpoint": "/health",
    "requestKeyEndpoint": "/request-key"
  }
}
EOF
)

    # Add KAS server to registry
    local temp_file=$(mktemp)
    if jq ".kasServers += [$kas_entry]" "$kas_registry" > "$temp_file" 2>/dev/null; then
        mv "$temp_file" "$kas_registry"
    else
        log_error "Failed to add KAS entry (jq error)"
        rm -f "$temp_file"
        return 1
    fi

    # Update trust matrix - add bidirectional trust with USA and other major partners
    local default_partners=("usa" "fra" "gbr" "deu")

    # Add this spoke to all partners' trust lists
    for partner in "${default_partners[@]}"; do
        local temp_file2=$(mktemp)
        if jq ".federationTrust.trustMatrix[\"${partner}-kas\"] += [\"${code_lower}-kas\"] | .federationTrust.trustMatrix[\"${partner}-kas\"] |= unique" "$kas_registry" > "$temp_file2" 2>/dev/null; then
            mv "$temp_file2" "$kas_registry"
        else
            rm -f "$temp_file2"
        fi
    done

    # Add partners to this spoke's trust list
    local partners_json='["usa-kas","fra-kas","gbr-kas","deu-kas"]'

    local temp_file3=$(mktemp)
    if jq ".federationTrust.trustMatrix[\"${code_lower}-kas\"] = $partners_json" "$kas_registry" > "$temp_file3" 2>/dev/null; then
        mv "$temp_file3" "$kas_registry"
        log_success "KAS entry registered for $code_upper (trusted by: USA, FRA, GBR, DEU)"
    else
        log_warn "Failed to update trust matrix"
        rm -f "$temp_file3"
    fi

    return 0
}

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

    # Generate unique IDs
    local spoke_id="spoke-${code_lower}-$(openssl rand -hex 4)"

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

    # Create .env file with instance-suffixed variables (spoke-in-a-box pattern)
    log_step "Creating environment configuration"

    # Generate additional secrets
    local jwt_secret=$(openssl rand -base64 32)
    local nextauth_secret=$(openssl rand -base64 32)
    local redis_pass=$(openssl rand -base64 12 | tr -d '/+=')

    # Generate federation client secret (shared between hub and spoke for IdP trust)
    local fed_client_secret=$(openssl rand -base64 24 | tr -d '/+=')

    cat > "$spoke_dir/.env" << EOF
# ${code_upper} Spoke Secrets (auto-generated by spoke-in-a-box)
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Database Passwords
POSTGRES_PASSWORD_${code_upper}=$postgres_pass
MONGO_PASSWORD_${code_upper}=$mongo_pass
REDIS_PASSWORD_${code_upper}=$redis_pass

# Keycloak
KEYCLOAK_ADMIN_PASSWORD_${code_upper}=$keycloak_pass
KEYCLOAK_CLIENT_SECRET_${code_upper}=$client_secret

# Auth/JWT
AUTH_SECRET_${code_upper}=$auth_secret
JWT_SECRET_${code_upper}=$jwt_secret
NEXTAUTH_SECRET_${code_upper}=$nextauth_secret

# Shared Blacklist Redis (for cross-instance token revocation)
BLACKLIST_REDIS_URL=redis://:${redis_pass}@dive-hub-redis-blacklist:6379

# OPAL/Federation
# For local Docker networking, use the container name instead of localhost
HUB_OPAL_URL=https://dive-hub-opal-server:7002
SPOKE_ID=$spoke_id
SPOKE_OPAL_TOKEN=
OPAL_LOG_LEVEL=INFO

# Hub Federation (for cross-border SSO with USA hub)
HUB_IDP_URL=https://localhost:8443
USA_IDP_CLIENT_SECRET=$client_secret
KEYCLOAK_CLIENT_SECRET=$client_secret

# Tunnel (if configured)
TUNNEL_TOKEN=$tunnel_token
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

    # Generate TLS certificates (prefer mkcert for local dev, fallback to openssl)
    log_step "Generating TLS certificates"
    if command -v mkcert &>/dev/null; then
        log_info "Using mkcert for locally-trusted certificates"
        mkcert -key-file "$spoke_dir/certs/key.pem" \
               -cert-file "$spoke_dir/certs/certificate.pem" \
               localhost \
               127.0.0.1 \
               ::1 \
               host.docker.internal \
               "dive-spoke-${code_lower}-keycloak" \
               "dive-spoke-${code_lower}-backend" \
               "dive-spoke-${code_lower}-frontend" \
               "dive-spoke-${code_lower}-opa" \
               "keycloak-${code_lower}" \
               "opa-${code_lower}" \
               "${code_lower}-keycloak-${code_lower}-1" \
               "${code_lower}-idp.dive25.com" \
               "${code_lower}-api.dive25.com" \
               "${code_lower}-app.dive25.com" \
               "backend-${code_lower}" \
               "frontend-${code_lower}" 2>/dev/null
    else
        log_warn "mkcert not found, using self-signed certificate (will show browser warnings)"
        # Generate with SANs for localhost including new container naming convention
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$spoke_dir/certs/key.pem" \
            -out "$spoke_dir/certs/certificate.pem" \
            -subj "/CN=localhost/O=DIVE-V3/C=US" \
            -addext "subjectAltName=DNS:localhost,DNS:${idp_hostname},DNS:dive-spoke-${code_lower}-keycloak,DNS:dive-spoke-${code_lower}-backend,DNS:keycloak-${code_lower},DNS:${code_lower}-keycloak-${code_lower}-1,IP:127.0.0.1" 2>/dev/null
    fi
    chmod 600 "$spoke_dir/certs/key.pem"
    chmod 644 "$spoke_dir/certs/certificate.pem"

    # Copy mkcert root CA for Keycloak truststore (required for federation)
    if command -v mkcert &>/dev/null; then
        local mkcert_ca="$(mkcert -CAROOT)/rootCA.pem"
        if [ -f "$mkcert_ca" ]; then
            cp "$mkcert_ca" "$spoke_dir/certs/rootCA.pem"
            cp "$mkcert_ca" "$spoke_dir/truststores/mkcert-rootCA.pem"
            chmod 644 "$spoke_dir/certs/rootCA.pem"
            chmod 644 "$spoke_dir/truststores/mkcert-rootCA.pem"
            # Create symlink for OPAL client SSL verification
            ln -sf rootCA.pem "$spoke_dir/certs/mkcert-rootCA.pem"
            log_info "Copied mkcert root CA for federation truststore"
        else
            log_warn "mkcert root CA not found at $mkcert_ca"
        fi
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
    # AUTO-REGISTER KAS ENTRY (Best Practice: Configuration Automation)
    # ==========================================================================
    _auto_register_kas "$code_upper" "$code_lower" "$kas_port"

    # ==========================================================================
    # AUTO-REGISTER TRUSTED ISSUER (Best Practice: JWT Trust Automation)
    # ==========================================================================
    _auto_register_trusted_issuer "$code_upper" "$code_lower" "$keycloak_https_port"

    # ==========================================================================
    # PUSH SECRETS TO GCP (SSOT: Single Source of Truth)
    # ==========================================================================
    log_step "Uploading secrets to GCP Secret Manager (SSOT)..."
    if check_gcloud; then
        # Source the secrets module for _gcp_secret_upsert function
        if [ -f "${DIVE_ROOT}/scripts/dive-modules/secrets.sh" ]; then
            source "${DIVE_ROOT}/scripts/dive-modules/secrets.sh"

            # Push all secrets to GCP
            _gcp_secret_upsert "dive-v3-postgres-${code_lower}" "$postgres_pass" "${GCP_PROJECT:-dive25}"
            _gcp_secret_upsert "dive-v3-mongodb-${code_lower}" "$mongo_pass" "${GCP_PROJECT:-dive25}"
            _gcp_secret_upsert "dive-v3-redis-${code_lower}" "$redis_pass" "${GCP_PROJECT:-dive25}"
            _gcp_secret_upsert "dive-v3-keycloak-${code_lower}" "$keycloak_pass" "${GCP_PROJECT:-dive25}"
            _gcp_secret_upsert "dive-v3-keycloak-secret-${code_lower}" "$client_secret" "${GCP_PROJECT:-dive25}"
            _gcp_secret_upsert "dive-v3-auth-secret-${code_lower}" "$auth_secret" "${GCP_PROJECT:-dive25}"
            _gcp_secret_upsert "dive-v3-jwt-secret-${code_lower}" "$jwt_secret" "${GCP_PROJECT:-dive25}"
            _gcp_secret_upsert "dive-v3-nextauth-secret-${code_lower}" "$nextauth_secret" "${GCP_PROJECT:-dive25}"

            log_success "✓ Secrets persisted to GCP Secret Manager (SSOT established)"
        else
            log_warn "secrets.sh module not found - secrets only stored locally in .env"
        fi
    else
        log_warn "gcloud not authenticated - secrets only stored locally in .env"
        log_warn "Run 'gcloud auth application-default login' to enable GCP SSOT"
    fi

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
        echo "  2. Register with hub:      ./dive --instance $code_lower spoke register"
        echo "  3. Wait for hub approval"
        echo "  4. Add SPOKE_OPAL_TOKEN to .env (after approval)"
    else
        echo "  1. Configure DNS/tunnel for your hostnames"
        echo "  2. Start services:         cd $spoke_dir && docker compose up -d"
        echo "  3. Register with hub:      ./dive --instance $code_lower spoke register"
    fi
    echo ""
}

# Helper function to create docker-compose.yml
# Uses GBR-style spoke-in-a-box template with proper port allocations
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
    # Uses centralized _get_spoke_ports function for consistency
    # ==========================================================================
    eval "$(_get_spoke_ports "$code_upper")"

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
    # Dynamic colors, locale, and timezone for each NATO member
    # ==========================================================================
    local theme_primary=$(get_country_primary_color "$code_upper")
    local theme_secondary=$(get_country_secondary_color "$code_upper")
    local country_timezone=$(get_country_timezone "$code_upper")
    local country_name=$(get_country_name "$code_upper")

    # Fallback to default colors if country not in database
    if [ -z "$theme_primary" ]; then
        theme_primary="#1a365d"
        theme_secondary="#2b6cb0"
        log_warn "Country $code_upper not in NATO database, using default colors"
    fi

    log_info "Using theme colors for $code_upper: primary=$theme_primary, secondary=$theme_secondary"

    # Derive hostnames (strip proto/port) or default to localhost
    local app_host="localhost"
    local idp_host="localhost"

    # Build base URLs for local development
    local app_base_url="https://localhost:${frontend_host_port}"
    local api_base_url="https://localhost:${backend_host_port}"
    local idp_base_url="https://localhost:${keycloak_https_port}"

    cat > "$spoke_dir/docker-compose.yml" << EOF
# =============================================================================
# DIVE V3 - ${code_upper} Instance ($instance_name)
# =============================================================================
# Spoke instance using extends pattern from base services.
# Regenerate with: ./dive spoke init ${code_upper} "$instance_name"
# Spoke ID: $spoke_id
# =============================================================================

name: dive-spoke-${code_lower}

networks:
  dive-${code_lower}-network:
    driver: bridge
  dive-shared:
    external: true

volumes:
  ${code_lower}_postgres_data:
  ${code_lower}_mongodb_data:
  ${code_lower}_redis_data:
  ${code_lower}_frontend_modules:
  ${code_lower}_frontend_next:
  ${code_lower}_opa_cache:
  ${code_lower}_opal_cache:
  ${code_lower}_backend_node_modules:
  ${code_lower}_backend_logs:

services:
  postgres-${code_lower}:
    extends:
      file: ../../docker/base/services.yml
      service: postgres-base
    container_name: dive-spoke-${code_lower}-postgres
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD_${code_upper}:?set POSTGRES_PASSWORD_${code_upper}}
    ports:
      - "${postgres_host_port}:5432"
    volumes:
      - ${code_lower}_postgres_data:/var/lib/postgresql/data
    networks:
      - dive-${code_lower}-network

  mongodb-${code_lower}:
    extends:
      file: ../../docker/base/services.yml
      service: mongodb-base
    container_name: dive-spoke-${code_lower}-mongodb
    environment:
      MONGO_INITDB_DATABASE: dive-v3-${code_lower}
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: \${MONGO_PASSWORD_${code_upper}:?set MONGO_PASSWORD_${code_upper}}
    ports:
      - "${mongodb_host_port}:27017"
    volumes:
      - ${code_lower}_mongodb_data:/data/db
    networks:
      - dive-${code_lower}-network

  redis-${code_lower}:
    extends:
      file: ../../docker/base/services.yml
      service: redis-base
    container_name: dive-spoke-${code_lower}-redis
    command: >
      redis-server --requirepass \${REDIS_PASSWORD_${code_upper}:?set REDIS_PASSWORD_${code_upper}}
    ports:
      - "${redis_host_port}:6379"
    volumes:
      - ${code_lower}_redis_data:/data
    networks:
      - dive-${code_lower}-network
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "\${REDIS_PASSWORD_${code_upper}}", "ping"]

  keycloak-${code_lower}:
    extends:
      file: ../../docker/base/services.yml
      service: keycloak-base
    container_name: dive-spoke-${code_lower}-keycloak
    environment:
      KC_DB_URL: jdbc:postgresql://postgres-${code_lower}:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: \${POSTGRES_PASSWORD_${code_upper}:?set POSTGRES_PASSWORD_${code_upper}}
      # Use new Keycloak 26+ bootstrap admin password variable
      KC_BOOTSTRAP_ADMIN_PASSWORD: \${KEYCLOAK_ADMIN_PASSWORD_${code_upper}:?set KEYCLOAK_ADMIN_PASSWORD_${code_upper}}
      # Proxy and certificate configuration (start-dev handles hostname automatically)
      KC_PROXY: edge
      KC_HTTP_ENABLED: "true"
      KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/certificate.pem
      KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/key.pem
      KC_TRUSTSTORE_PATHS: /opt/keycloak/conf/truststores/mkcert-rootCA.pem
    ports:
      - "${keycloak_https_port}:8443"
      - "${keycloak_http_port}:8080"
    volumes:
      - ./certs:/opt/keycloak/certs:ro
      - ./truststores:/opt/keycloak/conf/truststores:ro
      - ../../keycloak/themes:/opt/keycloak/themes:ro
    depends_on:
      postgres-${code_lower}:
        condition: service_healthy
    networks:
      - dive-${code_lower}-network
      - dive-shared

  opa-${code_lower}:
    extends:
      file: ../../docker/base/services.yml
      service: opa-base
    container_name: dive-spoke-${code_lower}-opa
    ports:
      - "${opa_host_port}:8181"
    volumes:
      - ../../policies:/policies:ro
      - ./certs:/certs:ro
    networks:
      - dive-${code_lower}-network

  opal-client-${code_lower}:
    extends:
      file: ../../docker/base/services.yml
      service: opal-client-base
    container_name: dive-spoke-${code_lower}-opal-client
    environment:
      OPAL_SERVER_URL: \${HUB_OPAL_URL:-https://dive-hub-opal-server:7002}
      OPAL_CLIENT_TOKEN: \${SPOKE_OPAL_TOKEN:-}
      OPAL_OPA_URL: https://opa-${code_lower}:8181
      OPAL_SUBSCRIPTION_ID: \${SPOKE_ID:-spoke-${code_lower}-default}
      OPAL_POLICY_STORE_URL: https://opa-${code_lower}:8181
      OPAL_DATA_TOPICS: policy:base,policy:${code_lower},data:federation_matrix,data:trusted_issuers
    volumes:
      - ${code_lower}_opal_cache:/var/opal/cache
      - ./certs:/var/opal/certs:ro
    depends_on:
      opa-${code_lower}:
        condition: service_healthy
    networks:
      - dive-${code_lower}-network
      - dive-shared  # Required to reach Hub OPAL server

  kas-${code_lower}:
    extends:
      file: ../../docker/base/services.yml
      service: kas-base
    container_name: dive-spoke-${code_lower}-kas
    environment:
      KEYCLOAK_URL: https://keycloak-${code_lower}:8443
      KEYCLOAK_REALM: dive-v3-broker-${code_lower}
      OPA_URL: https://opa-${code_lower}:8181
      INSTANCE_CODE: ${code_upper}
    ports:
      - "${kas_host_port}:8080"
    volumes:
      - ./certs:/app/certs:ro
    depends_on:
      keycloak-${code_lower}:
        condition: service_healthy
      opa-${code_lower}:
        condition: service_healthy
    networks:
      - dive-${code_lower}-network

  backend-${code_lower}:
    extends:
      file: ../../docker/base/services.yml
      service: backend-base
    container_name: dive-spoke-${code_lower}-backend
    environment:
      INSTANCE_CODE: ${code_upper}
      INSTANCE_NAME: "$instance_name"
      MONGODB_URI: mongodb://admin:\${MONGO_PASSWORD_${code_upper}:?set MONGO_PASSWORD_${code_upper}}@mongodb-${code_lower}:27017/dive-v3-${code_lower}?authSource=admin
      MONGODB_URL: mongodb://admin:\${MONGO_PASSWORD_${code_upper}:?set MONGO_PASSWORD_${code_upper}}@mongodb-${code_lower}:27017/dive-v3-${code_lower}?authSource=admin
      REDIS_URL: redis://:\${REDIS_PASSWORD_${code_upper}:?set REDIS_PASSWORD_${code_upper}}@redis-${code_lower}:6379
      KEYCLOAK_URL: https://keycloak-${code_lower}:8443
      KEYCLOAK_REALM: dive-v3-broker-${code_lower}
      KEYCLOAK_ISSUER: https://localhost:${keycloak_https_port}/realms/dive-v3-broker-${code_lower}
      TRUSTED_ISSUERS: https://localhost:${keycloak_https_port}/realms/dive-v3-broker-${code_lower},https://keycloak-${code_lower}:8443/realms/dive-v3-broker-${code_lower},https://${code_lower}-idp.dive25.com/realms/dive-v3-broker-${code_lower}
      KEYCLOAK_ADMIN_USER: admin
      KEYCLOAK_ADMIN_PASSWORD: \${KEYCLOAK_ADMIN_PASSWORD_${code_upper}:?set KEYCLOAK_ADMIN_PASSWORD_${code_upper}}
      OPA_URL: https://opa-${code_lower}:8181
      FEDERATION_ALLOWED_ORIGINS: https://localhost:${frontend_host_port},https://localhost:${backend_host_port},https://localhost:${keycloak_https_port},https://${code_lower}-app.dive25.com,https://${code_lower}-api.dive25.com,https://${code_lower}-idp.dive25.com
      CORS_ALLOWED_ORIGINS: https://localhost:${frontend_host_port},https://localhost:${backend_host_port},https://localhost:${keycloak_https_port},https://${code_lower}-app.dive25.com,https://${code_lower}-api.dive25.com,https://${code_lower}-idp.dive25.com
      # SECURITY: Trust mkcert CA instead of disabling TLS verification
      NODE_EXTRA_CA_CERTS: /app/certs/rootCA.pem
    ports:
      - "${backend_host_port}:4000"
    volumes:
      - ../../backend:/app
      - ${code_lower}_backend_node_modules:/app/node_modules
      - ./certs:/app/certs:rw
      - ./certs:/opt/keycloak/certs:ro
      - ../../config:/app/config:ro
      - ${code_lower}_backend_logs:/app/logs
    depends_on:
      mongodb-${code_lower}:
        condition: service_healthy
      redis-${code_lower}:
        condition: service_healthy
      keycloak-${code_lower}:
        condition: service_healthy
    networks:
      - dive-${code_lower}-network
      - dive-shared

  frontend-${code_lower}:
    extends:
      file: ../../docker/base/services.yml
      service: frontend-base
    container_name: dive-spoke-${code_lower}-frontend
    environment:
      NEXT_PUBLIC_INSTANCE: ${code_upper}
      NEXT_PUBLIC_INSTANCE_NAME: "${country_name:-$instance_name}"
      NEXT_PUBLIC_API_URL: https://localhost:${backend_host_port}
      NEXT_PUBLIC_BACKEND_URL: https://localhost:${backend_host_port}
      NEXT_PUBLIC_BASE_URL: https://localhost:${frontend_host_port}
      NEXT_PUBLIC_KEYCLOAK_URL: https://localhost:${keycloak_https_port}
      NEXT_PUBLIC_KEYCLOAK_REALM: dive-v3-broker-${code_lower}
      BACKEND_URL: https://backend-${code_lower}:4000
      AUTH_SECRET: \${NEXTAUTH_SECRET_${code_upper}:?set NEXTAUTH_SECRET_${code_upper}}
      AUTH_KEYCLOAK_ID: dive-v3-broker-${code_lower}
      AUTH_KEYCLOAK_SECRET: \${KEYCLOAK_CLIENT_SECRET_${code_upper}:?set KEYCLOAK_CLIENT_SECRET_${code_upper}}
      AUTH_KEYCLOAK_ISSUER: https://localhost:${keycloak_https_port}/realms/dive-v3-broker-${code_lower}
      AUTH_TRUST_HOST: "true"
      # SECURITY: Trust mkcert CA instead of disabling TLS verification
      NODE_EXTRA_CA_CERTS: /app/certs/rootCA.pem
      NEXTAUTH_URL: https://localhost:${frontend_host_port}
      NEXTAUTH_SECRET: \${NEXTAUTH_SECRET_${code_upper}:?set NEXTAUTH_SECRET_${code_upper}}
      DATABASE_URL: postgresql://keycloak:\${POSTGRES_PASSWORD_${code_upper}:?set POSTGRES_PASSWORD_${code_upper}}@postgres-${code_lower}:5432/keycloak
      KEYCLOAK_URL: https://keycloak-${code_lower}:8443
      KEYCLOAK_REALM: dive-v3-broker-${code_lower}
      KEYCLOAK_CLIENT_ID: dive-v3-broker-${code_lower}
      KEYCLOAK_CLIENT_SECRET: \${KEYCLOAK_CLIENT_SECRET_${code_upper}:?set KEYCLOAK_CLIENT_SECRET_${code_upper}}
      AUTH_POST_LOGOUT_REDIRECT: https://${code_lower}-app.dive25.com
      AUTH_REDIRECT_URI: https://${code_lower}-app.dive25.com/api/auth/callback/keycloak
      NEXT_PUBLIC_EXTERNAL_DOMAINS: https://${code_lower}-app.dive25.com,https://${code_lower}-api.dive25.com,https://${code_lower}-idp.dive25.com,https://localhost:${frontend_host_port},https://localhost:${backend_host_port},https://localhost:${keycloak_https_port}
      NEXT_PUBLIC_ALLOW_EXTERNAL_ANALYTICS: "false"
      NEXT_PUBLIC_THEME_PRIMARY: "${theme_primary}"
      NEXT_PUBLIC_THEME_SECONDARY: "${theme_secondary}"
      NEXT_PUBLIC_THEME_ACCENT: "#ffffff"
      TZ: "${country_timezone:-UTC}"
    ports:
      - "${frontend_host_port}:3000"
    volumes:
      - ../../frontend:/app
      - ${code_lower}_frontend_modules:/app/node_modules
      - ${code_lower}_frontend_next:/app/.next
      - ./certs:/app/certs:ro
      - ./certs:/opt/app/certs:ro
    depends_on:
      backend-${code_lower}:
        condition: service_healthy
    networks:
      - dive-${code_lower}-network
EOF

    # Add Cloudflare tunnel service if configured
    local tunnel_mode="${11:-token}"  # Default to token mode

    if [ -n "$tunnel_token" ]; then
    cat >> "$spoke_dir/docker-compose.yml" << EOF

  # ==========================================================================
  # CLOUDFLARE TUNNEL
  # ==========================================================================

  cloudflared-${code_lower}:
    image: cloudflare/cloudflared:latest
EOF

        # Check if we have a credentials file (auto-created tunnel) or token
        if [ -f "$spoke_dir/cloudflared/credentials.json" ]; then
            # Credentials file mode (locally-managed tunnel)
            cat >> "$spoke_dir/docker-compose.yml" << EOF
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - ./cloudflared/config.yml:/etc/cloudflared/config.yml:ro
      - ./cloudflared/credentials.json:/etc/cloudflared/credentials.json:ro
EOF
        else
            # Token mode (remotely-managed tunnel)
            cat >> "$spoke_dir/docker-compose.yml" << EOF
    command: tunnel --no-autoupdate run --token \${TUNNEL_TOKEN}
    environment:
      TUNNEL_TOKEN: \${TUNNEL_TOKEN}
EOF
        fi

        cat >> "$spoke_dir/docker-compose.yml" << EOF
    networks:
      - dive-${code_lower}-network
    restart: unless-stopped
EOF
    fi
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
    eval "$(_get_spoke_ports "$code_upper")"

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
            (cd "$spoke_dir" && COMPOSE_PROJECT_NAME="$code_lower" docker compose down -v 2>/dev/null) || true
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
# CERTIFICATE GENERATION
# =============================================================================

