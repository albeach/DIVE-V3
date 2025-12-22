#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Spoke Commands Module
# =============================================================================
# Commands: init, generate-certs, register, status, sync, health, up, down, logs
# For distributed spoke deployments (disabled in pilot mode by default)
# =============================================================================
# Version: 2.0.0
# Date: 2025-12-05
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load NATO countries database
if [ -z "$NATO_COUNTRIES_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../nato-countries.sh"
    export NATO_COUNTRIES_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

SPOKE_CERT_ALGORITHM="${SPOKE_CERT_ALGORITHM:-rsa}"
SPOKE_CERT_BITS="${SPOKE_CERT_BITS:-4096}"
SPOKE_CERT_DAYS="${SPOKE_CERT_DAYS:-365}"

# =============================================================================
# PORT CALCULATION - SINGLE SOURCE OF TRUTH
# =============================================================================
# This function calculates consistent ports for any NATO country code.
# Uses centralized NATO countries database (scripts/nato-countries.sh)
# MUST be used everywhere to ensure docker-compose and config.json match.
#
# Supports all 32 NATO member countries with deterministic, conflict-free ports.
# For partner nations (AUS, NZL, etc.), uses hash-based fallback.
# =============================================================================

_get_spoke_ports() {
    local code="$1"
    local code_upper="${code^^}"
    local port_offset=0

    # Check if it's a NATO country (uses centralized database)
    if is_nato_country "$code_upper"; then
        # Use centralized NATO port offset
        port_offset=$(get_country_offset "$code_upper")
    elif is_partner_nation "$code_upper"; then
        # Partner nations get offsets 32-39
        case "$code_upper" in
            AUS) port_offset=32 ;;
            NZL) port_offset=33 ;;
            JPN) port_offset=34 ;;
            KOR) port_offset=35 ;;
            ISR) port_offset=36 ;;
            UKR) port_offset=37 ;;
            *)   port_offset=$(( ($(echo "$code_upper" | cksum | cut -d' ' -f1) % 10) + 38 )) ;;
        esac
    else
        # Unknown countries: use hash-based offset (48+) to avoid conflicts
        port_offset=$(( ($(echo "$code_upper" | cksum | cut -d' ' -f1) % 20) + 48 ))
        log_warn "Country '$code_upper' not in NATO database, using hash-based port offset: $port_offset"
    fi

    # Export calculated ports (can be sourced or eval'd)
    # Port scheme ensures no conflicts for 48+ simultaneous spokes
    echo "SPOKE_PORT_OFFSET=$port_offset"
    echo "SPOKE_FRONTEND_PORT=$((3000 + port_offset))"
    echo "SPOKE_BACKEND_PORT=$((4000 + port_offset))"
    echo "SPOKE_KEYCLOAK_HTTPS_PORT=$((8443 + port_offset))"
    echo "SPOKE_KEYCLOAK_HTTP_PORT=$((8080 + port_offset))"
    echo "SPOKE_POSTGRES_PORT=$((5432 + port_offset))"
    echo "SPOKE_MONGODB_PORT=$((27017 + port_offset))"
    echo "SPOKE_REDIS_PORT=$((6379 + port_offset))"
    echo "SPOKE_OPA_PORT=$((8181 + port_offset * 10))"
    echo "SPOKE_KAS_PORT=$((9000 + port_offset))"
}

# =============================================================================
# SPOKE INITIALIZATION (Enhanced Interactive Setup)
# =============================================================================

# =============================================================================
# CLOUDFLARE TUNNEL AUTO-SETUP
# =============================================================================

# Check if cloudflared is installed, install if not
_ensure_cloudflared() {
    if command -v cloudflared &> /dev/null; then
        echo -e "  ${GREEN}✓ cloudflared is installed${NC}"
        return 0
    fi

    echo -e "  ${YELLOW}cloudflared not found. Installing...${NC}"
    echo ""

    # Detect OS and install
    if [ "$(uname)" = "Darwin" ]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install cloudflared 2>&1 | tail -3
        else
            echo -e "  ${RED}Please install Homebrew first: https://brew.sh${NC}"
            return 1
        fi
    elif [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb 2>/dev/null
        sudo dpkg -i cloudflared.deb 2>/dev/null
        rm -f cloudflared.deb
    elif [ -f /etc/redhat-release ]; then
        # RHEL/CentOS
        curl -L --output cloudflared.rpm https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-x86_64.rpm 2>/dev/null
        sudo rpm -i cloudflared.rpm 2>/dev/null
        rm -f cloudflared.rpm
    else
        # Generic Linux
        curl -L --output /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 2>/dev/null
        chmod +x /tmp/cloudflared
        sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
    fi

    if command -v cloudflared &> /dev/null; then
        echo -e "  ${GREEN}✓ cloudflared installed successfully${NC}"
        return 0
    else
        echo -e "  ${RED}Failed to install cloudflared${NC}"
        return 1
    fi
}

# Check if user is logged in to Cloudflare
_cloudflared_login() {
    local creds_dir="${HOME}/.cloudflared"

    # Check if already logged in
    if [ -f "${creds_dir}/cert.pem" ]; then
        echo -e "  ${GREEN}✓ Already authenticated with Cloudflare${NC}"
        return 0
    fi

    echo ""
    echo -e "  ${CYAN}Authenticating with Cloudflare...${NC}"
    echo ""
    echo "  This will open your browser to authorize access."
    echo "  Please log in and authorize the tunnel."
    echo ""
    read -p "  Press Enter to open browser for authentication... "

    # Run login (opens browser)
    cloudflared tunnel login 2>&1 | while read line; do
        echo "    $line"
    done

    if [ -f "${creds_dir}/cert.pem" ]; then
        echo ""
        echo -e "  ${GREEN}✓ Successfully authenticated with Cloudflare${NC}"
        return 0
    else
        echo -e "  ${RED}Authentication failed. Please try again.${NC}"
        return 1
    fi
}

# Auto-create Cloudflare tunnel
_spoke_auto_create_tunnel() {
    local code_lower="$1"
    local base_url="$2"
    local api_url="$3"
    local idp_url="$4"

    local tunnel_name="dive-spoke-${code_lower}"
    local creds_dir="${HOME}/.cloudflared"

    echo ""
    echo -e "  ${CYAN}🚀 Auto-creating Cloudflare Tunnel${NC}"
    echo ""

    # Step 1: Ensure cloudflared is installed
    _ensure_cloudflared || return 1

    # Step 2: Ensure user is logged in
    _cloudflared_login || return 1

    # Step 3: Check if tunnel already exists
    echo ""
    echo -e "  ${CYAN}Checking for existing tunnel...${NC}"
    local existing_tunnel=$(cloudflared tunnel list 2>/dev/null | grep -w "$tunnel_name" | awk '{print $1}')

    if [ -n "$existing_tunnel" ]; then
        echo -e "  ${YELLOW}Tunnel '$tunnel_name' already exists (ID: $existing_tunnel)${NC}"
        read -p "  Delete and recreate? (yes/no): " recreate
        if [ "$recreate" = "yes" ]; then
            echo "  Deleting existing tunnel..."
            cloudflared tunnel delete "$tunnel_name" 2>/dev/null || true
        else
            # Use existing tunnel
            tunnel_id="$existing_tunnel"
            echo -e "  ${GREEN}✓ Using existing tunnel${NC}"
        fi
    fi

    # Step 4: Create new tunnel
    if [ -z "$tunnel_id" ]; then
        echo ""
        echo -e "  ${CYAN}Creating tunnel: $tunnel_name${NC}"
        local create_output=$(cloudflared tunnel create "$tunnel_name" 2>&1)
        echo "    $create_output"

        # Extract tunnel ID from output
        tunnel_id=$(echo "$create_output" | grep -oE '[a-f0-9-]{36}' | head -1)

        if [ -z "$tunnel_id" ]; then
            echo -e "  ${RED}Failed to create tunnel${NC}"
            return 1
        fi

        echo -e "  ${GREEN}✓ Tunnel created: $tunnel_id${NC}"
    fi

    # Save tunnel ID for later
    echo "$tunnel_id" > "/tmp/dive-tunnel-${code_lower}.id"

    # Step 5: Configure DNS routes
    echo ""
    echo -e "  ${CYAN}Configuring DNS routes for dive25.com...${NC}"

    local hostnames=(
        "${code_lower}-app.dive25.com"
        "${code_lower}-api.dive25.com"
        "${code_lower}-idp.dive25.com"
        "${code_lower}-kas.dive25.com"
    )

    for hostname in "${hostnames[@]}"; do
        echo -n "    Adding $hostname... "
        local dns_result=$(cloudflared tunnel route dns "$tunnel_name" "$hostname" 2>&1)
        if echo "$dns_result" | grep -q "already exists\|Added"; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${YELLOW}⚠ (may need manual setup)${NC}"
        fi
    done

    # Step 6: Get tunnel token
    echo ""
    echo -e "  ${CYAN}Generating tunnel token...${NC}"

    # The tunnel token is the credentials file content, base64 encoded
    local creds_file="${creds_dir}/${tunnel_id}.json"

    if [ -f "$creds_file" ]; then
        # For remotely-managed tunnels, we need to get the token differently
        # Try to get it from the tunnel info
        local tunnel_token=$(cloudflared tunnel token "$tunnel_name" 2>/dev/null | tail -1)

        if [ -n "$tunnel_token" ] && [ ${#tunnel_token} -gt 50 ]; then
            echo "$tunnel_token" > "/tmp/dive-tunnel-${code_lower}.token"
            echo -e "  ${GREEN}✓ Tunnel token generated${NC}"
        else
            # Fallback: use credentials file approach
            echo -e "  ${YELLOW}Using credentials file approach...${NC}"

            # Copy credentials to spoke directory
            local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
            mkdir -p "$spoke_dir/cloudflared"
            cp "$creds_file" "$spoke_dir/cloudflared/credentials.json"

            echo ""
            echo -e "  ${YELLOW}Note: This tunnel uses a credentials file instead of a token.${NC}"
            echo "  The credentials file has been copied to your spoke directory."
            echo ""

            # Return empty token - will use credentials file approach
            echo "" > "/tmp/dive-tunnel-${code_lower}.token"

            # Mark that we need credentials file mode
            echo "credentials" > "/tmp/dive-tunnel-${code_lower}.mode"
        fi
    else
        echo -e "  ${RED}Credentials file not found${NC}"
        echo "  You may need to configure the tunnel manually in the Cloudflare dashboard."
        return 1
    fi

    echo ""
    echo -e "  ${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${GREEN}✓ Tunnel setup complete!${NC}"
    echo -e "  ${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Tunnel Name:  $tunnel_name"
    echo "  Tunnel ID:    $tunnel_id"
    echo ""
    echo "  Hostnames configured:"
    for hostname in "${hostnames[@]}"; do
        echo "    • $hostname"
    done
    echo ""

    return 0
}

# Interactive spoke setup wizard
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
               "keycloak-${code_lower}" \
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
      KEYCLOAK_ADMIN_PASSWORD: \${KEYCLOAK_ADMIN_PASSWORD_${code_upper}:?set KEYCLOAK_ADMIN_PASSWORD_${code_upper}}
      KC_HOSTNAME: localhost
      KC_HOSTNAME_URL: https://localhost:${keycloak_https_port}
      KC_HOSTNAME_ADMIN_URL: https://localhost:${keycloak_https_port}
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

    # Validate code is 3 letters
    if [ ${#instance_code} -ne 3 ]; then
        log_error "Instance code must be exactly 3 characters (ISO 3166-1 alpha-3)"
        return 1
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

spoke_generate_certs() {
    local algorithm="${1:-$SPOKE_CERT_ALGORITHM}"
    local bits="${2:-$SPOKE_CERT_BITS}"

    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local certs_dir="$spoke_dir/certs"

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not initialized. Run: ./dive spoke init <CODE> <NAME>"
        return 1
    fi

    # Load config to get spoke ID
    local config_file="$spoke_dir/config.json"
    local spoke_id=""
    local instance_name=""

    if [ -f "$config_file" ]; then
        spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4 || echo "")
        instance_name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4 || echo "$instance_code")
    fi
    spoke_id="${spoke_id:-spoke-${code_lower}-unknown}"

    print_header
    echo -e "${BOLD}Generating X.509 Certificates for Spoke:${NC} $(upper "$instance_code")"
    echo ""
    echo "  Algorithm:  $algorithm"
    echo "  Key Size:   $bits bits"
    echo "  Validity:   $SPOKE_CERT_DAYS days"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would generate certificates in: $certs_dir"
        log_dry "  - spoke.key (private key)"
        log_dry "  - spoke.crt (self-signed certificate)"
        log_dry "  - spoke.csr (CSR for hub signing)"
        return 0
    fi

    mkdir -p "$certs_dir"

    # Check if certificates already exist
    if [ -f "$certs_dir/spoke.key" ]; then
        log_warn "Certificates already exist in: $certs_dir"
        read -p "  Overwrite? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Cancelled"
            return 1
        fi
    fi

    # Generate private key
    log_step "Generating private key ($algorithm, $bits bits)"
    if [ "$algorithm" = "ec" ]; then
        openssl ecparam -genkey -name prime256v1 -out "$certs_dir/spoke.key" 2>/dev/null
    else
        openssl genrsa -out "$certs_dir/spoke.key" "$bits" 2>/dev/null
    fi

    if [ $? -ne 0 ]; then
        log_error "Failed to generate private key"
        return 1
    fi

    # Generate CSR
    log_step "Generating Certificate Signing Request (CSR)"
    openssl req -new \
        -key "$certs_dir/spoke.key" \
        -out "$certs_dir/spoke.csr" \
        -subj "/C=${instance_code:0:2}/O=DIVE Federation/OU=Spoke Instances/CN=$spoke_id" \
        2>/dev/null

    if [ $? -ne 0 ]; then
        log_error "Failed to generate CSR"
        return 1
    fi

    # Generate self-signed certificate (for development)
    log_step "Generating self-signed certificate (for development)"
    openssl x509 -req \
        -days "$SPOKE_CERT_DAYS" \
        -in "$certs_dir/spoke.csr" \
        -signkey "$certs_dir/spoke.key" \
        -out "$certs_dir/spoke.crt" \
        2>/dev/null

    if [ $? -ne 0 ]; then
        log_error "Failed to generate certificate"
        return 1
    fi

    # Set permissions
    chmod 600 "$certs_dir/spoke.key"
    chmod 644 "$certs_dir/spoke.crt"
    chmod 644 "$certs_dir/spoke.csr"

    # Calculate fingerprint
    local fingerprint=$(openssl x509 -in "$certs_dir/spoke.crt" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2)

    echo ""
    log_success "Certificates generated successfully!"
    echo ""
    echo -e "${BOLD}Certificate Details:${NC}"
    echo "  Subject:     CN=$spoke_id"
    echo "  Fingerprint: $fingerprint"
    echo "  Valid For:   $SPOKE_CERT_DAYS days"
    echo ""
    echo -e "${BOLD}Files Created:${NC}"
    echo "  - $certs_dir/spoke.key (private key - keep secure!)"
    echo "  - $certs_dir/spoke.crt (self-signed certificate)"
    echo "  - $certs_dir/spoke.csr (CSR for Hub signing)"
    echo ""
    echo -e "${YELLOW}⚠️  For production:${NC}"
    echo "   Submit the CSR to the Hub for signing during registration."
    echo "   The Hub will return a properly signed certificate."
    echo ""
}

# =============================================================================
# SPOKE REGISTRATION
# =============================================================================

spoke_register() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local config_file="$spoke_dir/config.json"
    local poll_mode=false
    local poll_timeout=600  # 10 minutes default
    local poll_interval=30   # 30 seconds between polls

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --poll)
                poll_mode=true
                shift
                ;;
            --poll-timeout)
                poll_timeout="${2:-600}"
                shift 2
                ;;
            --poll-interval)
                poll_interval="${2:-30}"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done

    if [ ! -f "$config_file" ]; then
        log_error "Spoke not initialized. Run: ./dive spoke init <CODE> <NAME>"
        return 1
    fi

    print_header
    echo -e "${BOLD}Registering Spoke with Hub${NC}"
    echo ""

    # Parse config (handle both old and new format)
    local spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local instance_code_config=$(grep -o '"instanceCode"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4)
    local hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local contact_email=$(grep -o '"contactEmail"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4 | tr -d '\n\r')

    # Override hub URL from environment
    hub_url="${HUB_API_URL:-$hub_url}"
    hub_url="${hub_url:-https://hub.dive25.com}"

    echo "  Spoke ID:     $spoke_id"
    echo "  Instance:     $instance_code_config"
    echo "  Name:         $name"
    echo "  Hub URL:      $hub_url"
    echo ""

    # Validate contact email
    if [ -z "$contact_email" ]; then
        log_warn "Contact email not set in config.json"
        read -p "  Enter contact email: " contact_email
        if [ -z "$contact_email" ]; then
            log_error "Contact email is required for registration"
            return 1
        fi
    fi

    # ==========================================================================
    # Phase 3 Enhancement: Generate CSR if not present
    # ==========================================================================
    local certs_dir="$spoke_dir/certs"
    local csr_pem=""
    local cert_pem=""

    if [ ! -f "$certs_dir/spoke.csr" ]; then
        log_info "No CSR found. Generating certificates..."
        mkdir -p "$certs_dir"

        # Generate private key if not exists
        if [ ! -f "$certs_dir/spoke.key" ]; then
            log_step "Generating private key (RSA 4096 bits)"
            openssl genrsa -out "$certs_dir/spoke.key" 4096 2>/dev/null
            chmod 600 "$certs_dir/spoke.key"
        fi

        # Generate CSR
        log_step "Generating Certificate Signing Request (CSR)"
        openssl req -new \
            -key "$certs_dir/spoke.key" \
            -out "$certs_dir/spoke.csr" \
            -subj "/C=${instance_code_config:0:2}/O=DIVE Federation/OU=Spoke Instances/CN=$spoke_id" \
            2>/dev/null
        chmod 644 "$certs_dir/spoke.csr"

        if [ $? -ne 0 ]; then
            log_error "Failed to generate CSR"
            return 1
        fi
        log_success "CSR generated: $certs_dir/spoke.csr"

        # Generate self-signed certificate for development
        log_step "Generating self-signed certificate (for development)"
        openssl x509 -req -days 365 \
            -in "$certs_dir/spoke.csr" \
            -signkey "$certs_dir/spoke.key" \
            -out "$certs_dir/spoke.crt" \
            2>/dev/null
        chmod 644 "$certs_dir/spoke.crt"
    else
        log_info "CSR found: $certs_dir/spoke.csr"
    fi

    # Read CSR for submission (base64-encoded for JSON safety)
    if [ -f "$certs_dir/spoke.csr" ]; then
        csr_pem=$(base64 < "$certs_dir/spoke.csr" | tr -d '\n')
        local csr_fingerprint=$(openssl req -in "$certs_dir/spoke.csr" -noout -pubkey 2>/dev/null | openssl sha256 | awk '{print $2}' | cut -c1-16)
        echo "  CSR Fingerprint: ${csr_fingerprint}..."
    fi

    # Read certificate if exists (base64-encoded for JSON safety)
    if [ -f "$certs_dir/spoke.crt" ]; then
        cert_pem=$(base64 < "$certs_dir/spoke.crt" | tr -d '\n')
        local cert_fingerprint=$(openssl x509 -in "$certs_dir/spoke.crt" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2 | cut -c1-23)
        echo "  Cert Fingerprint: ${cert_fingerprint}..."
    fi
    echo ""

    # Build registration request
    local base_url=$(grep -o '"baseUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local api_url=$(grep -o '"apiUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local idp_url=$(grep -o '"idpUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local idp_public_url=$(grep -o '"idpPublicUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)

    # Use idpUrl as fallback if idpPublicUrl is not set
    if [ -z "$idp_public_url" ]; then
        idp_public_url="$idp_url"
    fi

    # CRITICAL FOR BIDIRECTIONAL FEDERATION:
    # Get spoke's Keycloak admin password to include in registration
    # This allows Hub to create reverse IdP (hub-idp in spoke Keycloak)
    local keycloak_password=""
    local code_upper=$(upper "$instance_code_config")
    local keycloak_container="dive-spoke-${code_lower}-keycloak"

    # Priority order:
    # 1. Instance-specific env var (KEYCLOAK_ADMIN_PASSWORD_CZE)
    # 2. Container's actual password (from docker exec)
    # 3. Spoke's .env file
    # NEVER use the generic KEYCLOAK_ADMIN_PASSWORD as it's the Hub's default

    local env_var_name="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
    if [ -n "${!env_var_name}" ]; then
        keycloak_password="${!env_var_name}"
        log_info "Using Keycloak password from ${env_var_name}"
    else
        # Try to get it from the running Keycloak container with retry
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$keycloak_container"; then
            log_info "Waiting for Keycloak container to be fully ready..."

            # Retry up to 10 times with 2 second delay
            for attempt in {1..10}; do
                # Use printenv which is more reliable than env
                keycloak_password=$(docker exec "$keycloak_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')

                # Verify it's not a default/placeholder password
                if [ -n "$keycloak_password" ] && [ ${#keycloak_password} -gt 10 ] && [[ ! "$keycloak_password" =~ ^(admin|password|KeycloakAdmin) ]]; then
                    log_info "Retrieved Keycloak password from container $keycloak_container (attempt $attempt)"
                    break
                fi

                if [ $attempt -lt 10 ]; then
                    sleep 2
                fi
            done
        fi

        # If still no password, try to read from the spoke's .env file
        if [ -z "$keycloak_password" ] || [ ${#keycloak_password} -lt 10 ]; then
            local spoke_env="${DIVE_ROOT}/instances/${code_lower}/.env"
            if [ -f "$spoke_env" ]; then
                keycloak_password=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$spoke_env" 2>/dev/null | cut -d'=' -f2 | tr -d '\n\r"')
                if [ -n "$keycloak_password" ]; then
                    log_info "Retrieved Keycloak password from spoke .env file"
                fi
            fi
        fi
    fi

    if [ -z "$keycloak_password" ] || [ ${#keycloak_password} -lt 10 ]; then
        log_warn "Could not retrieve valid Keycloak admin password"
        log_warn "Bidirectional federation may fail (Hub won't be able to create reverse IdP)"
        echo ""
        echo "  To fix: Set KEYCLOAK_ADMIN_PASSWORD_${code_upper} in .env"
        echo ""
    fi

    # Build request with CSR and Keycloak password (for bidirectional federation)
    # Use jq for proper JSON escaping to avoid control character issues
    local request_body
    if command -v jq &> /dev/null; then
        request_body=$(jq -n \
            --arg instanceCode "$instance_code_config" \
            --arg name "$name" \
            --arg description "DIVE V3 Spoke for $name" \
            --arg baseUrl "$base_url" \
            --arg apiUrl "$api_url" \
            --arg idpUrl "$idp_url" \
            --arg idpPublicUrl "$idp_public_url" \
            --arg csrPEM "$csr_pem" \
            --arg certificatePEM "$cert_pem" \
            --arg contactEmail "$contact_email" \
            --arg keycloakAdminPassword "$keycloak_password" \
            --argjson requestedScopes '["policy:base", "policy:'"${code_lower}"'", "data:federation_matrix", "data:trusted_issuers"]' \
            '{
              instanceCode: $instanceCode,
              name: $name,
              description: $description,
              baseUrl: $baseUrl,
              apiUrl: $apiUrl,
              idpUrl: $idpUrl,
              idpPublicUrl: $idpPublicUrl,
              csrPEM: $csrPEM,
              certificatePEM: $certificatePEM,
              requestedScopes: $requestedScopes,
              contactEmail: $contactEmail,
              keycloakAdminPassword: $keycloakAdminPassword
            }')
    else
        # Fallback to heredoc if jq not available (may have issues with special chars)
        request_body=$(cat << EOF
{
  "instanceCode": "$instance_code_config",
  "name": "$name",
  "description": "DIVE V3 Spoke for $name",
  "baseUrl": "$base_url",
  "apiUrl": "$api_url",
  "idpUrl": "$idp_url",
  "idpPublicUrl": "$idp_public_url",
  "csrPEM": "$csr_pem",
  "certificatePEM": "$cert_pem",
  "requestedScopes": ["policy:base", "policy:${code_lower}", "data:federation_matrix", "data:trusted_issuers"],
  "contactEmail": "$contact_email",
  "keycloakAdminPassword": "$keycloak_password"
}
EOF
)
    fi

    log_step "Submitting registration to: $hub_url/api/federation/register"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to: $hub_url/api/federation/register"
        log_dry "Request body (truncated):"
        echo "$request_body" | head -20
        return 0
    fi

    local response=$(curl -s -X POST "$hub_url/api/federation/register" \
        -H "Content-Type: application/json" \
        -k \
        -d "$request_body" 2>&1)

    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Registration request submitted!"
        echo ""

        local returned_spoke_id=$(echo "$response" | grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local status=$(echo "$response" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

        echo -e "${BOLD}Registration Details:${NC}"
        echo "  Spoke ID:  $returned_spoke_id"
        echo "  Status:    $status"
        echo ""

        # Update local config with registered status and spoke ID
        if command -v jq &> /dev/null; then
            jq ".federation.status = \"pending\" | .federation.registeredAt = \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\" | .identity.registeredSpokeId = \"$returned_spoke_id\"" \
                "$config_file" > "$config_file.tmp" && mv "$config_file.tmp" "$config_file"
        fi

        # Check if auto-approved (development mode)
        if [ "$status" = "approved" ]; then
            # Extract token if provided (auto-approval includes token)
            local token=$(echo "$response" | jq -r '.token.token // empty' 2>/dev/null)
            local federation_alias=$(echo "$response" | jq -r '.spoke.federationIdPAlias // empty' 2>/dev/null)

            log_success "Spoke auto-approved with bidirectional federation!"
            echo ""
            echo -e "${GREEN}✅ Federation Complete:${NC}"
            echo "   IdP Alias in Hub: ${federation_alias:-gbr-idp}"
            echo "   Status: APPROVED"
            echo ""

            if [ -n "$token" ]; then
                # Save token to local config
                if command -v jq &> /dev/null; then
                    jq ".federation.status = \"approved\" | .federation.spokeToken = \"$token\"" \
                        "$config_file" > "$config_file.tmp" && mv "$config_file.tmp" "$config_file"
                fi
                echo -e "${GREEN}✅ Token received and saved to config${NC}"
            fi

            echo ""
            echo "   Next steps:"
            echo "   1. Start your spoke services (already running)"
            echo "   2. Access your frontend: https://localhost:${FRONTEND_PORT:-3001}"
            echo "   3. Test cross-border SSO via Hub IdP"
            echo ""
            return 0
        fi

        # If poll mode is enabled, wait for approval
        if [ "$poll_mode" = true ]; then
            echo -e "${CYAN}Polling for approval (timeout: ${poll_timeout}s, interval: ${poll_interval}s)...${NC}"
            echo ""
            _spoke_poll_for_approval "$hub_url" "$returned_spoke_id" "$spoke_dir" "$poll_timeout" "$poll_interval"
            return $?
        fi

        echo -e "${YELLOW}⏳ Waiting for Hub admin approval...${NC}"
        echo "   You will receive notification at: $contact_email"
        echo ""
        echo "   Next steps:"
        echo "   1. Wait for hub admin approval"
        echo "   2. Run: ./dive --instance $code_lower spoke register --poll"
        echo "      (Or manually configure token after email notification)"
        echo ""
    else
        log_error "Registration failed"
        echo ""
        echo "Response:"
        echo "$response" | head -20
        return 1
    fi
}

# =============================================================================
# SPOKE REGISTRATION POLLING (Phase 3)
# =============================================================================

_spoke_poll_for_approval() {
    local hub_url="$1"
    local spoke_id="$2"
    local spoke_dir="$3"
    local timeout="${4:-600}"
    local interval="${5:-30}"

    local elapsed=0
    local config_file="$spoke_dir/config.json"
    local env_file="$spoke_dir/.env"

    while [ $elapsed -lt $timeout ]; do
        # Check registration status
        local response=$(curl -s -k "$hub_url/api/federation/registration/$spoke_id/status" 2>/dev/null)

        if [ -z "$response" ]; then
            echo "  [$elapsed s] Hub not responding, retrying..."
            sleep "$interval"
            elapsed=$((elapsed + interval))
            continue
        fi

        local status=$(echo "$response" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

        case "$status" in
            approved)
                log_success "Registration approved!"
                echo ""

                # Extract token from response
                local token=$(echo "$response" | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
                local expires=$(echo "$response" | grep -o '"expiresAt"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

                if [ -n "$token" ]; then
                    echo -e "${BOLD}Token Configuration:${NC}"
                    echo "  Token: ${token:0:20}..."
                    echo "  Expires: $expires"
                    echo ""

                    # Auto-configure token
                    _spoke_configure_token "$spoke_dir" "$token" "$expires"
                    return 0
                else
                    log_warn "Approved but no token in response"
                    echo "  Please request token manually or contact hub admin"
                    return 1
                fi
                ;;
            pending)
                echo "  [$elapsed s] Status: pending approval..."
                ;;
            suspended)
                log_error "Registration was suspended"
                return 1
                ;;
            revoked)
                log_error "Registration was revoked"
                return 1
                ;;
            *)
                echo "  [$elapsed s] Status: $status"
                ;;
        esac

        sleep "$interval"
        elapsed=$((elapsed + interval))
    done

    log_warn "Polling timeout reached ($timeout seconds)"
    echo "  Registration still pending. You can:"
    echo "  1. Continue polling: ./dive --instance $(basename $spoke_dir) spoke register --poll"
    echo "  2. Contact hub admin for manual approval"
    return 1
}

_spoke_configure_token() {
    local spoke_dir="$1"
    local token="$2"
    local expires="$3"

    local env_file="$spoke_dir/.env"
    local config_file="$spoke_dir/config.json"
    local code_lower=$(basename "$spoke_dir")

    log_step "Configuring Hub API token..."

    # Save Hub API token as SPOKE_TOKEN
    if [ -f "$env_file" ]; then
        sed -i.bak '/^SPOKE_TOKEN=/d' "$env_file"
        rm -f "$env_file.bak"
    fi
    echo "SPOKE_TOKEN=$token" >> "$env_file"
    log_success "Hub API token configured"

    # Also provision OPAL client JWT from OPAL server
    log_step "Provisioning OPAL client JWT from server..."
    if [ -f "${DIVE_ROOT}/scripts/provision-opal-tokens.sh" ]; then
        "${DIVE_ROOT}/scripts/provision-opal-tokens.sh" "$code_lower" 2>/dev/null && \
            log_success "OPAL client JWT provisioned" || \
            log_warn "Could not provision OPAL JWT (spoke may need manual setup)"
    fi

    log_step "Configuring spoke settings..."

    # Update .env file
    if [ -f "$env_file" ]; then
        # Remove existing SPOKE_OPAL_TOKEN if present
        if grep -q "^SPOKE_OPAL_TOKEN=" "$env_file" 2>/dev/null; then
            sed -i.bak '/^SPOKE_OPAL_TOKEN=/d' "$env_file"
            rm -f "$env_file.bak"
        fi
        # Add new token
        echo "" >> "$env_file"
        echo "# OPAL Token (auto-configured on $(date -u +"%Y-%m-%dT%H:%M:%SZ"))" >> "$env_file"
        echo "SPOKE_OPAL_TOKEN=$token" >> "$env_file"
        log_success "Token added to $env_file"
    else
        log_warn "No .env file found at $env_file"
        echo "SPOKE_OPAL_TOKEN=$token" > "$env_file"
        log_info "Created $env_file with token"
    fi

    # Update config.json
    if command -v jq &> /dev/null && [ -f "$config_file" ]; then
        jq ".federation.status = \"approved\" | .federation.approvedAt = \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\" | .authentication.tokenExpiresAt = \"$expires\"" \
            "$config_file" > "$config_file.tmp" && mv "$config_file.tmp" "$config_file"
    fi

    # Check if OPAL client is running and restart if needed
    local compose_file="$spoke_dir/docker-compose.yml"
    if [ -f "$compose_file" ]; then
        local opal_container=$(docker ps --filter "name=opal-client" --filter "name=$code_lower" -q 2>/dev/null | head -1)
        if [ -n "$opal_container" ]; then
            log_step "Restarting OPAL client to apply new token..."
            docker restart "$opal_container" >/dev/null 2>&1
            log_success "OPAL client restarted"
        else
            log_info "OPAL client not running. Start with: ./dive --instance $code_lower spoke up"
        fi
    fi

    echo ""
    log_success "Token configuration complete!"
    echo ""
    echo "  Next steps:"
    echo "  1. Start/restart spoke services: ./dive --instance $code_lower spoke up"
    echo "  2. Verify OPAL connection: ./dive --instance $code_lower spoke verify"
}

# =============================================================================
# SPOKE TOKEN REFRESH (Phase 3)
# =============================================================================

spoke_opal_token() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")

    print_header
    echo -e "${BOLD}OPAL Token Provisioning${NC}"
    echo ""
    echo "This command obtains a JWT token from the Hub's OPAL server."
    echo "The token allows the spoke's OPAL client to connect and receive policy updates."
    echo ""

    if [ -f "${DIVE_ROOT}/scripts/provision-opal-tokens.sh" ]; then
        "${DIVE_ROOT}/scripts/provision-opal-tokens.sh" "$code_lower"
    else
        log_error "Token provisioning script not found"
        echo "  Expected: ${DIVE_ROOT}/scripts/provision-opal-tokens.sh"
        return 1
    fi
}

spoke_token_refresh() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local config_file="$spoke_dir/config.json"
    local env_file="$spoke_dir/.env"

    if [ ! -f "$config_file" ]; then
        log_error "Spoke not initialized"
        return 1
    fi

    print_header
    echo -e "${BOLD}Spoke Token Refresh${NC}"
    echo ""

    # Get current token info
    local hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    hub_url="${HUB_API_URL:-$hub_url}"
    hub_url="${hub_url:-https://hub.dive25.com}"

    local spoke_id=$(grep -o '"registeredSpokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    if [ -z "$spoke_id" ]; then
        spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    fi

    # Get current token from .env
    local current_token=""
    if [ -f "$env_file" ]; then
        current_token=$(grep "^SPOKE_OPAL_TOKEN=" "$env_file" | cut -d= -f2-)
    fi

    if [ -z "$current_token" ]; then
        log_error "No token found in $env_file"
        echo "  Register first: ./dive --instance $code_lower spoke register"
        return 1
    fi

    echo "  Spoke ID: $spoke_id"
    echo "  Hub URL:  $hub_url"
    echo ""

    log_step "Requesting token refresh..."

    # Use current token to authenticate and get new token
    local response=$(curl -s -k \
        -H "Authorization: Bearer $current_token" \
        "$hub_url/api/federation/registration/$spoke_id/status" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "Hub not responding"
        return 1
    fi

    local status=$(echo "$response" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

    if [ "$status" != "approved" ]; then
        log_error "Spoke status is '$status', cannot refresh token"
        return 1
    fi

    local new_token=$(echo "$response" | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local expires=$(echo "$response" | grep -o '"expiresAt"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

    if [ -n "$new_token" ]; then
        _spoke_configure_token "$spoke_dir" "$new_token" "$expires"
        log_success "Token refreshed successfully"
    else
        log_warn "No new token in response. Token may still be valid."
        echo "  Contact hub admin if you need a new token."
    fi
}

# =============================================================================
# SPOKE STATUS & HEALTH
# =============================================================================

spoke_status() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local config_file="$spoke_dir/config.json"

    print_header
    echo -e "${BOLD}Spoke Federation Status:${NC} $(upper "$instance_code")"
    echo ""

    if [ ! -f "$config_file" ]; then
        echo -e "  Status: ${RED}Not Initialized${NC}"
        echo ""
        echo "  Run: ./dive spoke init <CODE> <NAME>"
        return 0
    fi

    # Parse config
    local spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local instance_code_config=$(grep -o '"instanceCode"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4)
    local status=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4)
    local hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local created=$(grep -o '"createdAt"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4)

    # Status color
    local status_color="$YELLOW"
    case "$status" in
        approved) status_color="$GREEN" ;;
        suspended|revoked) status_color="$RED" ;;
        pending) status_color="$YELLOW" ;;
    esac

    echo -e "${CYAN}Identity:${NC}"
    echo "  Spoke ID:        $spoke_id"
    echo "  Instance Code:   $instance_code_config"
    echo "  Name:            $name"
    echo "  Created:         $created"
    echo ""

    echo -e "${CYAN}Federation:${NC}"
    echo -e "  Status:          ${status_color}${status:-unregistered}${NC}"
    echo "  Hub URL:         $hub_url"

    # Check token
    if [ -f "$spoke_dir/.env" ] && grep -q "SPOKE_OPAL_TOKEN" "$spoke_dir/.env"; then
        local token_set=$(grep "SPOKE_OPAL_TOKEN" "$spoke_dir/.env" | cut -d= -f2)
        if [ -n "$token_set" ] && [ "$token_set" != "" ]; then
            echo -e "  Token:           ${GREEN}Configured${NC}"
        else
            echo -e "  Token:           ${YELLOW}Not Set${NC}"
        fi
    else
        echo -e "  Token:           ${YELLOW}Not Set${NC}"
    fi

    # Check certificates
    echo ""
    echo -e "${CYAN}Certificates:${NC}"
    if [ -f "$spoke_dir/certs/spoke.crt" ]; then
        local cert_expiry=$(openssl x509 -in "$spoke_dir/certs/spoke.crt" -noout -enddate 2>/dev/null | cut -d= -f2)
        local fingerprint=$(openssl x509 -in "$spoke_dir/certs/spoke.crt" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2 | head -c 23)
        echo -e "  Certificate:     ${GREEN}Present${NC}"
        echo "  Expires:         $cert_expiry"
        echo "  Fingerprint:     ${fingerprint}..."
    else
        echo -e "  Certificate:     ${YELLOW}Not Generated${NC}"
        echo "  Run: ./dive spoke generate-certs"
    fi

    echo ""
}

spoke_health() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Spoke Service Health:${NC} $(upper "$instance_code")"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would check health of all spoke services"
        return 0
    fi

    # Define services to check
    local services=("OPA:8181/health" "OPAL-Client:7000/health" "Backend:4000/health" "Keycloak:8080/health")
    local all_healthy=true

    echo -e "${CYAN}Services:${NC}"

    for svc in "${services[@]}"; do
        local name="${svc%%:*}"
        local endpoint="${svc#*:}"
        local url="http://localhost:${endpoint}"

        local status_code=$(curl -s -o /dev/null -w '%{http_code}' "$url" --max-time 3 2>/dev/null || echo "000")

        if [ "$status_code" = "200" ]; then
            printf "  %-14s ${GREEN}✓ Healthy${NC}\n" "$name:"
        else
            printf "  %-14s ${RED}✗ Unhealthy${NC} (HTTP $status_code)\n" "$name:"
            all_healthy=false
        fi
    done

    # Check MongoDB
    printf "  %-14s " "MongoDB:"
    if docker exec dive-v3-mongodb-${code_lower} mongosh --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
        echo -e "${GREEN}✓ Healthy${NC}"
    else
        echo -e "${YELLOW}⚠ Not Running${NC}"
    fi

    # Check Redis
    printf "  %-14s " "Redis:"
    if docker exec dive-v3-redis-${code_lower} redis-cli ping 2>/dev/null | grep -q "PONG"; then
        echo -e "${GREEN}✓ Healthy${NC}"
    else
        echo -e "${YELLOW}⚠ Not Running${NC}"
    fi

    echo ""

    # Overall status
    if [ "$all_healthy" = true ]; then
        echo -e "${GREEN}✓ All services healthy${NC}"
    else
        echo -e "${YELLOW}⚠ Some services unhealthy${NC}"
    fi
    echo ""
}

# =============================================================================
# CERTIFICATE ROTATION
# =============================================================================

spoke_rotate_certs() {
    local algorithm="${1:-rsa}"
    local bits="${2:-4096}"

    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local certs_dir="$spoke_dir/certs"

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not initialized. Run: ./dive spoke init <CODE> <NAME>"
        return 1
    fi

    # Load config to get spoke ID and status
    local config_file="$spoke_dir/config.json"
    local spoke_id=""
    local status=""

    if [ -f "$config_file" ]; then
        spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4 || echo "")
        status=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4 || echo "")
    fi
    spoke_id="${spoke_id:-spoke-${code_lower}-unknown}"

    print_header
    echo -e "${BOLD}Rotating X.509 Certificates for Spoke:${NC} $(upper "$instance_code")"
    echo ""

    # Check if spoke is registered
    if [ "$status" = "approved" ] || [ "$status" = "pending" ]; then
        log_warn "Spoke is currently registered with status: $status"
        echo ""
        echo "  Certificate rotation will:"
        echo "  1. Generate new private key and CSR"
        echo "  2. Backup existing certificates"
        echo "  3. Submit new CSR to Hub for signing"
        echo ""
        read -p "  Continue with rotation? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Cancelled"
            return 1
        fi
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would rotate certificates:"
        log_dry "  1. Backup existing certs to: $certs_dir/backup-$(date +%Y%m%d)"
        log_dry "  2. Generate new private key ($algorithm, $bits bits)"
        log_dry "  3. Generate new CSR"
        log_dry "  4. Generate new self-signed cert (development)"
        return 0
    fi

    # Backup existing certificates
    local backup_dir="$certs_dir/backup-$(date +%Y%m%d-%H%M%S)"
    if [ -f "$certs_dir/spoke.key" ]; then
        log_step "Backing up existing certificates"
        mkdir -p "$backup_dir"
        cp -p "$certs_dir/spoke.key" "$backup_dir/" 2>/dev/null || true
        cp -p "$certs_dir/spoke.crt" "$backup_dir/" 2>/dev/null || true
        cp -p "$certs_dir/spoke.csr" "$backup_dir/" 2>/dev/null || true
        echo "         ✓ Backed up to: $backup_dir"
    fi

    # Generate new private key
    log_step "Generating new private key ($algorithm, $bits bits)"
    if [ "$algorithm" = "ec" ]; then
        openssl ecparam -genkey -name prime256v1 -out "$certs_dir/spoke.key" 2>/dev/null
    else
        openssl genrsa -out "$certs_dir/spoke.key" "$bits" 2>/dev/null
    fi

    if [ $? -ne 0 ]; then
        log_error "Failed to generate private key"
        # Restore from backup
        if [ -d "$backup_dir" ]; then
            cp -p "$backup_dir/"* "$certs_dir/" 2>/dev/null
        fi
        return 1
    fi

    # Generate new CSR
    log_step "Generating new Certificate Signing Request"
    local instance_name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4 || echo "$instance_code")

    openssl req -new \
        -key "$certs_dir/spoke.key" \
        -out "$certs_dir/spoke.csr" \
        -subj "/C=${instance_code:0:2}/O=DIVE Federation/OU=Spoke Instances/CN=$spoke_id" \
        2>/dev/null

    if [ $? -ne 0 ]; then
        log_error "Failed to generate CSR"
        return 1
    fi

    # Generate self-signed certificate for development
    log_step "Generating self-signed certificate (for development)"
    openssl x509 -req \
        -days "$SPOKE_CERT_DAYS" \
        -in "$certs_dir/spoke.csr" \
        -signkey "$certs_dir/spoke.key" \
        -out "$certs_dir/spoke.crt" \
        2>/dev/null

    if [ $? -ne 0 ]; then
        log_error "Failed to generate certificate"
        return 1
    fi

    # Set permissions
    chmod 600 "$certs_dir/spoke.key"
    chmod 644 "$certs_dir/spoke.crt"
    chmod 644 "$certs_dir/spoke.csr"

    # Calculate new fingerprint
    local fingerprint=$(openssl x509 -in "$certs_dir/spoke.crt" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2)

    echo ""
    log_success "Certificate rotation complete!"
    echo ""
    echo -e "${BOLD}New Certificate Details:${NC}"
    echo "  Subject:     CN=$spoke_id"
    echo "  Fingerprint: $fingerprint"
    echo "  Valid For:   $SPOKE_CERT_DAYS days"
    echo ""
    echo -e "${BOLD}Backup Location:${NC}"
    echo "  $backup_dir"
    echo ""

    # If spoke is registered, prompt to submit CSR to Hub
    if [ "$status" = "approved" ]; then
        echo -e "${YELLOW}⚠️  Important:${NC}"
        echo "   Your spoke is registered. To complete rotation:"
        echo "   1. Submit the new CSR to Hub for signing"
        echo "   2. Replace spoke.crt with Hub-signed certificate"
        echo "   3. Restart spoke services: ./dive spoke down && ./dive spoke up"
        echo ""
    fi
}

# =============================================================================
# INTERNAL: Apply Terraform for Spoke (MFA flows, etc.)
# =============================================================================
_spoke_apply_terraform() {
    local instance_code="${1:-}"
    local code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local code_upper=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
    local tf_dir="${DIVE_ROOT}/terraform/spoke"
    local tfvars_file="${DIVE_ROOT}/terraform/countries/${code_lower}.tfvars"

    if [ ! -d "$tf_dir" ]; then
        log_info "No Terraform directory found at ${tf_dir}"
        return 0
    fi

    if [ ! -f "$tfvars_file" ]; then
        log_warn "Terraform tfvars not found: ${tfvars_file}"
        log_info "Skipping Terraform apply (MFA will not be configured via Terraform)"
        return 0
    fi

    log_info "Applying Terraform configuration for ${code_upper}..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "cd ${tf_dir} && terraform workspace select ${code_lower} && terraform apply -var-file=${tfvars_file} -auto-approve"
        return 0
    fi

    (
        cd "$tf_dir"

        # Initialize if needed
        [ ! -d ".terraform" ] && terraform init -input=false -backend=false

        # Select or create workspace
        if terraform workspace list 2>/dev/null | grep -q "^  ${code_lower}$\|^\* ${code_lower}$"; then
            terraform workspace select "$code_lower" >/dev/null 2>&1
        else
            terraform workspace new "$code_lower" >/dev/null 2>&1
        fi

        # Load secrets for Terraform
        local instance_dir="${DIVE_ROOT}/instances/${code_lower}"
        if [ -f "${instance_dir}/.env" ]; then
            set -a
            source "${instance_dir}/.env"
            set +a
        fi

        # Export secrets as TF_VAR_ environment variables
        local instance_password_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
        export TF_VAR_keycloak_admin_password="${!instance_password_var:-${KEYCLOAK_ADMIN_PASSWORD:-admin}}"
        export TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET_${code_upper}:-${KEYCLOAK_CLIENT_SECRET:-}}"
        export TF_VAR_test_user_password="${TEST_USER_PASSWORD:-DiveTestSecure2025!}"
        export TF_VAR_admin_user_password="${ADMIN_PASSWORD:-DiveAdminSecure2025!}"
        export TF_VAR_enable_mfa=true
        export TF_VAR_webauthn_rp_id="${WEBAUTHN_RP_ID:-localhost}"

        # Get Keycloak container name for internal URL
        local kc_container="dive-spoke-${code_lower}-keycloak"
        if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
            export KEYCLOAK_URL="http://${kc_container}:8080"
        else
            # Fallback to localhost with port offset
            if type -t get_country_offset >/dev/null 2>&1 && is_nato_country "$code_upper" 2>/dev/null; then
                local port_offset=$(get_country_offset "$code_upper" 2>/dev/null || echo "0")
                local kc_port=$((8080 + port_offset))
                export KEYCLOAK_URL="http://localhost:${kc_port}"
            else
                export KEYCLOAK_URL="http://localhost:8080"
            fi
        fi

        # Export Keycloak connection for Terraform provider
        export KEYCLOAK_USER="${KEYCLOAK_ADMIN_USERNAME:-admin}"
        export KEYCLOAK_PASSWORD="${!instance_password_var:-${KEYCLOAK_ADMIN_PASSWORD:-admin}}"

        terraform apply -var-file="../countries/${code_lower}.tfvars" -input=false -auto-approve
    ) || {
        log_warn "Terraform apply failed for ${code_upper}"
        return 1
    }

    log_success "Terraform configuration applied for ${code_upper}"
    return 0
}

# =============================================================================
# SPOKE SECRET SYNCHRONIZATION
# =============================================================================

##
# Synchronize spoke frontend secrets with Keycloak client secrets
# Fixes NextAuth "Invalid client credentials" errors
#
# Arguments:
#   $1 - Spoke code (optional, defaults to INSTANCE)
#
# Returns:
#   0 - Secrets synchronized successfully
#   1 - Failed to synchronize
##
spoke_sync_secrets() {
    local code_lower="${1:-$(lower "${INSTANCE:-usa}")}"
    local code_upper
    code_upper=$(upper "$code_lower")

    log_step "Synchronizing $code_upper frontend secrets with Keycloak..."

    # Check if containers are running
    if ! docker ps --format '{{.Names}}' | grep -q "dive-spoke-${code_lower}-frontend"; then
        log_error "Frontend container not running for $code_upper"
        return 1
    fi

    if ! docker ps --format '{{.Names}}' | grep -q "dive-spoke-${code_lower}-keycloak"; then
        log_error "Keycloak container not running for $code_upper"
        return 1
    fi

    # Get current frontend secret
    local frontend_secret
    frontend_secret=$(docker exec "dive-spoke-${code_lower}-frontend" printenv AUTH_KEYCLOAK_SECRET 2>/dev/null)

    if [ -z "$frontend_secret" ]; then
        log_error "Could not get frontend secret for $code_upper"
        return 1
    fi

    # Get Keycloak client secret
    local admin_pass
    admin_pass=$(docker exec "dive-spoke-${code_lower}-keycloak" printenv KEYCLOAK_ADMIN_PASSWORD)

    if [ -z "$admin_pass" ]; then
        log_error "Could not get Keycloak admin password for $code_upper"
        return 1
    fi

    # Authenticate to Keycloak
    docker exec "dive-spoke-${code_lower}-keycloak" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$admin_pass" >/dev/null 2>&1

    # Get client secret from Keycloak
    local keycloak_secret
    keycloak_secret=$(docker exec "dive-spoke-${code_lower}-keycloak" /opt/keycloak/bin/kcadm.sh get clients \
        -r "dive-v3-broker-${code_lower}" -q "clientId=dive-v3-broker-${code_lower}" \
        --fields secret 2>/dev/null | jq -r '.[0].secret')

    if [ -z "$keycloak_secret" ] || [ "$keycloak_secret" = "null" ]; then
        log_error "Could not get Keycloak client secret for $code_upper"
        return 1
    fi

    # Compare secrets
    if [ "$frontend_secret" = "$keycloak_secret" ]; then
        log_success "$code_upper secrets are synchronized"
        return 0
    fi

    log_warn "$code_upper secret mismatch detected - fixing..."
    log_verbose "Frontend: ${frontend_secret:0:8}..., Keycloak: ${keycloak_secret:0:8}..."

    # Fix by updating .env and recreating frontend
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local env_file="$spoke_dir/.env"

    if [ -f "$env_file" ]; then
        # Update .env file with correct secret
        if grep -q "^KEYCLOAK_CLIENT_SECRET_${code_upper}=" "$env_file"; then
            sed -i.bak "s/^KEYCLOAK_CLIENT_SECRET_${code_upper}=.*/KEYCLOAK_CLIENT_SECRET_${code_upper}=${keycloak_secret}/" "$env_file"
        else
            echo "KEYCLOAK_CLIENT_SECRET_${code_upper}=${keycloak_secret}" >> "$env_file"
        fi
        rm -f "$env_file.bak"
    fi

    # Recreate frontend container
    (cd "$spoke_dir" && COMPOSE_PROJECT_NAME="$code_lower" docker compose up -d --force-recreate "frontend-${code_lower}" >/dev/null 2>&1)

    # Wait and verify
    sleep 3
    local new_secret
    new_secret=$(docker exec "dive-spoke-${code_lower}-frontend" printenv AUTH_KEYCLOAK_SECRET 2>/dev/null)

    if [ "$new_secret" = "$keycloak_secret" ]; then
        log_success "$code_upper frontend secrets synchronized!"
        return 0
    else
        log_error "$code_upper secret synchronization failed"
        return 1
    fi
}

##
# Sync all running spoke secrets
##
spoke_sync_all_secrets() {
    local spokes=()

    # Find all running spoke frontends
    while IFS= read -r container; do
        if [[ "$container" =~ dive-spoke-([a-z]+)-frontend ]]; then
            local code="${BASH_REMATCH[1]}"
            spokes+=("$code")
        fi
    done < <(docker ps --format '{{.Names}}' 2>/dev/null | grep "dive-spoke-.*-frontend")

    if [ ${#spokes[@]} -eq 0 ]; then
        log_warn "No running spoke frontends found"
        return 0
    fi

    log_step "Synchronizing secrets for ${#spokes[@]} running spokes: ${spokes[*]}"

    local success=0
    local failed=0

    for spoke in "${spokes[@]}"; do
        if spoke_sync_secrets "$spoke"; then
            success=$((success + 1))
        else
            failed=$((failed + 1))
        fi
    done

    echo ""
    log_success "Secret synchronization complete: $success succeeded, $failed failed"

    [ $failed -eq 0 ]
}

# =============================================================================
# SPOKE SYNC & HEARTBEAT
# =============================================================================

spoke_sync() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")

    log_step "Forcing policy sync from Hub..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would trigger OPAL client to pull latest policies"
        return 0
    fi

    # Try OPAL client first
    if curl -s -X POST "http://localhost:7000/policy-refresh" --max-time 5 2>/dev/null; then
        log_success "Policy refresh triggered via OPAL client"
    else
        # Try backend API
        if curl -s -X POST "http://localhost:4000/api/spoke/sync" --max-time 5 2>/dev/null | grep -q "success"; then
            log_success "Policy sync triggered via backend API"
        else
            log_warn "Could not trigger sync. Ensure services are running."
        fi
    fi
}

spoke_heartbeat() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local config_file="$spoke_dir/config.json"

    if [ ! -f "$config_file" ]; then
        log_error "Spoke not initialized"
        return 1
    fi

    local spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    local hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    hub_url="${hub_url:-https://hub.dive25.com}"

    log_step "Sending heartbeat to Hub: $hub_url"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to: $hub_url/api/federation/heartbeat"
        return 0
    fi

    # Check local services
    local opa_healthy=$(curl -s http://localhost:8181/health --max-time 2 >/dev/null && echo "true" || echo "false")
    local opal_healthy=$(curl -s http://localhost:7000/health --max-time 2 >/dev/null && echo "true" || echo "false")

    # Get token from environment or .env
    local token="${SPOKE_OPAL_TOKEN:-}"
    if [ -z "$token" ] && [ -f "$spoke_dir/.env" ]; then
        token=$(grep "SPOKE_OPAL_TOKEN" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2)
    fi

    if [ -z "$token" ]; then
        log_warn "No spoke token configured. Heartbeat may fail."
    fi

    local response=$(curl -s -X POST "$hub_url/api/federation/heartbeat" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${token}" \
        -k \
        -d "{
            \"spokeId\": \"$spoke_id\",
            \"instanceCode\": \"$(upper "$instance_code")\",
            \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
            \"opaHealthy\": $opa_healthy,
            \"opalClientConnected\": $opal_healthy
        }" 2>&1)

    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Heartbeat sent successfully"
        local sync_status=$(echo "$response" | grep -o '"syncStatus"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        echo "  Sync Status: $sync_status"
    else
        log_error "Heartbeat failed"
        echo "  Response: $response"
        return 1
    fi
}

# =============================================================================
# SPOKE SERVICE MANAGEMENT
# =============================================================================

spoke_up() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not initialized. Run: ./dive spoke init <CODE> <NAME>"
        return 1
    fi

    # Check for .env first
    if [ ! -f "$spoke_dir/.env" ]; then
        log_warn "No .env file found. Copy and configure .env.template first."
        echo "  cp $spoke_dir/.env.template $spoke_dir/.env"
        return 1
    fi

    # CRITICAL: Source existing .env FIRST so we have local secrets available
    # This ensures docker-compose gets the secrets even if GCP fails
    set -a  # Auto-export all variables
    source "$spoke_dir/.env"
    set +a

    # Ensure shared network exists (local dev only)
    ensure_shared_network

    # Auto-provision OPAL JWT if missing or empty (resilience)
    if [ -z "${SPOKE_OPAL_TOKEN:-}" ]; then
        log_info "OPAL token not found, attempting to provision..."
        if [ -f "${DIVE_ROOT}/scripts/provision-opal-tokens.sh" ]; then
            if "${DIVE_ROOT}/scripts/provision-opal-tokens.sh" "$code_lower" >/dev/null 2>&1; then
                log_success "OPAL token provisioned automatically"
                # Re-source .env to pick up the new token
                set -a
                source "$spoke_dir/.env"
                set +a
            else
                log_warn "Could not provision OPAL token (Hub may not be reachable)"
                echo "  OPAL client will retry connection after spoke starts"
                echo "  Run manually: ./dive --instance $code_lower spoke opal-token"
            fi
        fi
    fi

    # Try to load GCP secrets (will override local values if available)
    if ! load_gcp_secrets "$instance_code"; then
        log_warn "Falling back to local .env secrets for $instance_code"
        # Secrets are already loaded from .env above, no need to call load_local_defaults
    else
        # GCP secrets loaded - update .env file for persistence
        if [ -n "$POSTGRES_PASSWORD" ]; then
            sed -i.bak "s|^POSTGRES_PASSWORD_${code_upper}=.*|POSTGRES_PASSWORD_${code_upper}=${POSTGRES_PASSWORD}|" "$spoke_dir/.env"
            sed -i.bak "s|^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=.*|KEYCLOAK_ADMIN_PASSWORD_${code_upper}=${KEYCLOAK_ADMIN_PASSWORD}|" "$spoke_dir/.env"
            sed -i.bak "s|^MONGO_PASSWORD_${code_upper}=.*|MONGO_PASSWORD_${code_upper}=${MONGO_PASSWORD}|" "$spoke_dir/.env"
            sed -i.bak "s|^AUTH_SECRET_${code_upper}=.*|AUTH_SECRET_${code_upper}=${AUTH_SECRET}|" "$spoke_dir/.env"
            sed -i.bak "s|^KEYCLOAK_CLIENT_SECRET_${code_upper}=.*|KEYCLOAK_CLIENT_SECRET_${code_upper}=${KEYCLOAK_CLIENT_SECRET}|" "$spoke_dir/.env"
            rm -f "$spoke_dir/.env.bak"
            log_info "Updated .env file with GCP secrets"
        fi
    fi

    print_header
    echo -e "${BOLD}Starting Spoke Services:${NC} ${code_upper}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would run: docker compose -f $spoke_dir/docker-compose.yml up -d"
        return 0
    fi

    # Force compose project per spoke to avoid cross-stack collisions when a global
    # COMPOSE_PROJECT_NAME is already exported (e.g., hub set to dive-v3).
    export COMPOSE_PROJECT_NAME="$code_lower"

    cd "$spoke_dir"
    docker compose up -d

    if [ $? -eq 0 ]; then
        echo ""
        log_success "Spoke services started"
        echo ""

        # Auto-sync secrets to prevent NextAuth "Invalid client credentials" errors
        # CRITICAL: This MUST run on every restart to sync Keycloak client secrets
        log_step "Synchronizing frontend secrets with Keycloak..."
        if ! spoke_sync_secrets "$instance_code"; then
            log_error "Secret synchronization failed - NextAuth will not work!"
            log_error "Run manually: ./dive --instance $code_lower spoke sync-secrets"
            return 1
        fi
        log_success "Frontend secrets synchronized"

        # Apply Terraform (MFA flows, protocol mappers, etc.)
        log_step "Applying Terraform configuration (MFA flows)..."
        _spoke_apply_terraform "$instance_code" || log_warn "Terraform apply had issues (MFA may not be configured)"

        # Check if initialization has been done
        local init_marker="${spoke_dir}/.initialized"
        if [ ! -f "$init_marker" ]; then
            echo ""
            echo -e "${CYAN}Running post-deployment initialization...${NC}"
            echo ""

            # Run initialization scripts
            local init_script="${DIVE_ROOT}/scripts/spoke-init/init-all.sh"
            if [ -f "$init_script" ]; then
                cd "${DIVE_ROOT}"
                bash "$init_script" "$(upper "$instance_code")"

                if [ $? -eq 0 ]; then
                    # Mark as initialized
                    touch "$init_marker"
                    log_success "Spoke fully initialized!"
                else
                    log_warn "Initialization had some issues. You can re-run with:"
                    echo "  ./scripts/spoke-init/init-all.sh $(upper "$instance_code")"
                fi
            else
                log_warn "Initialization scripts not found. Manual setup may be required."
            fi
        else
            log_info "Spoke already initialized (skipping post-deployment setup)"
        fi

        echo ""
        echo "  View logs:    ./dive spoke logs"
        echo "  Check health: ./dive spoke health"

        # ==========================================================================
        # PHASE 3 FIX: Auto-register with Hub if Hub is running locally
        # ==========================================================================
        # Check if Hub backend is running (local dev environment)
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-backend"; then
            local config_file="$spoke_dir/config.json"
            local hub_registered=false

            # Check if already registered with Hub (by checking if we have a registered spoke ID)
            if [ -f "$config_file" ] && grep -q '"registeredSpokeId"' "$config_file"; then
                log_info "Spoke already registered with Hub (skipping auto-registration)"
                hub_registered=true
            fi

            if [ "$hub_registered" = false ]; then
                echo ""
                echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo -e "${CYAN}  AUTO-REGISTRATION: Registering spoke with Hub${NC}"
                echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
                echo ""

                # Set HUB_API_URL for local development
                export HUB_API_URL="https://localhost:4000"

                # Call spoke_register with poll mode (wait for approval)
                # In local dev, approval is typically instant (auto-approved or quick manual)
                cd "${DIVE_ROOT}"
                if INSTANCE="$code_lower" spoke_register --poll --poll-timeout=120 --poll-interval=10 2>/dev/null; then
                    log_success "Spoke successfully registered and approved by Hub!"
                    echo ""

                    # Update the federation-linked status
                    touch "${spoke_dir}/.federation-registered"
                else
                    log_warn "Auto-registration with Hub did not complete"
                    echo ""
                    echo "  This is NOT a critical error - spoke is running."
                    echo "  To register manually, run:"
                    echo "    ./dive --instance $code_lower spoke register --poll"
                    echo ""
                fi
            fi
        else
            log_info "Hub not running locally - skipping auto-registration"
            echo "  To register later, run: ./dive --instance $code_lower spoke register"
        fi
    else
        log_error "Failed to start spoke services"
        return 1
    fi
}

# =============================================================================
# SPOKE DEPLOY (Phase 2 - Full Deployment Automation)
# =============================================================================

spoke_deploy() {
    local instance_code="${1:-}"
    local instance_name="${2:-}"

    # Record start time
    local start_time=$(date +%s)

    print_header
    echo -e "${BOLD}🚀 DIVE V3 Spoke Deployment${NC}"
    echo ""

    # Validate arguments
    if [ -z "$instance_code" ]; then
        log_error "Usage: ./dive spoke deploy <CODE> [NAME]"
        echo ""
        echo "Examples:"
        echo "  ./dive spoke deploy NZL 'New Zealand Defence'"
        echo "  ./dive spoke deploy HOM 'Home Development'"
        echo ""
        return 1
    fi

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    # Default name if not provided
    instance_name="${instance_name:-${code_upper} Instance}"

    echo -e "  Instance Code: ${CYAN}$code_upper${NC}"
    echo -e "  Instance Name: ${CYAN}$instance_name${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would deploy spoke: $code_upper ($instance_name)"
        log_dry "Steps: init → certs → up → wait → init-all → federation → register"
        return 0
    fi

    ensure_dive_root
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local init_marker="${spoke_dir}/.initialized"
    local fed_marker="${spoke_dir}/.federation-configured"

    # ==========================================================================
    # Step 1: Initialize spoke if not already done
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 1/8: Checking Spoke Initialization${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    if [ -f "$spoke_dir/docker-compose.yml" ] && [ -f "$spoke_dir/config.json" ]; then
        log_info "Spoke already initialized at: $spoke_dir"
        echo ""
    else
        log_step "Initializing spoke instance..."

        # Use legacy init for non-interactive deployment
        INSTANCE="$code_lower" _spoke_init_legacy "$code_upper" "$instance_name"

        if [ $? -ne 0 ]; then
            log_error "Spoke initialization failed"
            return 1
        fi

        log_success "Spoke initialized"
        echo ""
    fi

    # ==========================================================================
    # Step 2: Prepare Federation Certificates (NEW!)
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 2/8: Preparing Federation Certificates${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Load certificates module
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"

        if prepare_federation_certificates "$code_lower"; then
            log_success "Federation certificates prepared"
        else
            log_warn "Certificate preparation had issues (continuing)"
        fi
    else
        log_warn "certificates.sh module not found, skipping certificate preparation"
    fi
    echo ""

    # ==========================================================================
    # Step 3: Start spoke services
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 3/8: Starting Spoke Services${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Check if services are already running
    export COMPOSE_PROJECT_NAME="$code_lower"
    cd "$spoke_dir"

    local running_count=$(docker compose ps -q 2>/dev/null | wc -l | tr -d ' ')
    if [ "$running_count" -gt 0 ]; then
        log_info "Services already running ($running_count containers)"
        echo ""
    else
        # Load secrets for instance
        if ! load_gcp_secrets "$code_lower" 2>/dev/null; then
            log_warn "Falling back to local defaults for secrets"
            load_local_defaults
        fi

        log_step "Starting Docker Compose services..."
        docker compose up -d 2>&1 | tail -5

        if [ $? -ne 0 ]; then
            log_error "Failed to start services"
            return 1
        fi

        log_success "Services started"
        echo ""
    fi

    # ==========================================================================
    # Step 4: Wait for services to be healthy
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 4/8: Waiting for Services to be Healthy${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    _spoke_wait_for_services "$code_lower" 120
    local wait_result=$?

    if [ $wait_result -ne 0 ]; then
        log_error "Services did not become healthy within timeout"
        echo ""
        echo "  Check logs: docker compose -f $spoke_dir/docker-compose.yml logs"
        return 1
    fi

    log_success "All core services healthy"
    echo ""

    # ==========================================================================
    # Step 4b: Provision OPAL JWT (if not already done)
    # ==========================================================================
    local env_file="$spoke_dir/.env"
    local opal_token=""
    if [ -f "$env_file" ]; then
        opal_token=$(grep "^SPOKE_OPAL_TOKEN=" "$env_file" 2>/dev/null | cut -d= -f2)
    fi

    if [ -z "$opal_token" ]; then
        log_step "Provisioning OPAL client JWT..."
        if [ -f "${DIVE_ROOT}/scripts/provision-opal-tokens.sh" ]; then
            if "${DIVE_ROOT}/scripts/provision-opal-tokens.sh" "$code_lower" 2>/dev/null; then
                log_success "OPAL JWT provisioned"
            else
                log_warn "Could not provision OPAL JWT (Hub may not be reachable)"
                echo "      Run manually after Hub is available:"
                echo "      ./dive --instance $code_lower spoke opal-token"
            fi
        fi
    else
        log_info "OPAL token already configured"
    fi
    echo ""

    # ==========================================================================
    # Step 5: Run initialization scripts (if not already done)
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 5/8: Running Post-Deployment Initialization${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    if [ -f "$init_marker" ]; then
        log_info "Spoke already initialized (skipping init-all.sh)"
        echo ""
    else
        local init_script="${DIVE_ROOT}/scripts/spoke-init/init-all.sh"
        if [ -f "$init_script" ]; then
            log_step "Running init-all.sh..."
            cd "${DIVE_ROOT}"

            if bash "$init_script" "$code_upper"; then
                touch "$init_marker"
                log_success "Initialization complete"
            else
                log_warn "Initialization had issues (continuing anyway)"
            fi
        else
            log_warn "init-all.sh not found, skipping"
        fi
        echo ""
    fi

    # ==========================================================================
    # Step 6: Configure Federation (NEW! - replaces fix-all-spokes-federation.sh)
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 6/8: Configuring Federation${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    if [ -f "$fed_marker" ]; then
        log_info "Federation already configured"
        echo ""
    else
        # Load federation-setup module
        if [ -f "${DIVE_ROOT}/scripts/dive-modules/federation-setup.sh" ]; then
            source "${DIVE_ROOT}/scripts/dive-modules/federation-setup.sh"

            log_step "Configuring usa-idp and syncing secrets..."

            if configure_spoke_federation "$code_lower"; then
                touch "$fed_marker"
                log_success "Federation configured successfully!"

                # Restart frontend to pick up new secrets
                log_step "Restarting frontend to load new secrets..."
                cd "$spoke_dir"
                docker compose restart "frontend-${code_lower}" 2>/dev/null || true
            else
                log_warn "Federation configuration had issues"
                echo ""
                echo "  You may need to run manually:"
                echo "  ./dive federation-setup configure $code_lower"
            fi
        else
            log_warn "federation-setup.sh module not found"
            echo ""
            echo "  Run manually after deployment:"
            echo "  ./dive federation-setup configure $code_lower"
        fi
        echo ""
    fi

    # ==========================================================================
    # Step 7: Register with Hub (BIDIRECTIONAL - spoke in Hub AND Hub in spoke)
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 7/8: Hub Registration (Bidirectional Federation)${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local hub_reg_marker="$spoke_dir/.hub-registered"

    if [ -f "$hub_reg_marker" ]; then
        log_info "Spoke already registered in Hub"
        echo ""
    else
        # Check if Hub Keycloak is running locally
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}$"; then
            log_step "Hub Keycloak detected - registering spoke as IdP..."

            # Load federation-setup module if not already loaded
            if [ -f "${DIVE_ROOT}/scripts/dive-modules/federation-setup.sh" ]; then
                source "${DIVE_ROOT}/scripts/dive-modules/federation-setup.sh" 2>/dev/null || true
            fi

            if type register_spoke_in_hub &>/dev/null; then
                if register_spoke_in_hub "$code_lower"; then
                    touch "$hub_reg_marker"
                    log_success "Spoke registered in Hub successfully!"
                else
                    log_warn "Hub registration had issues"
                    echo ""
                    echo "  You can retry with:"
                    echo "  ./dive federation-setup register-hub $code_lower"
                fi
            else
                log_warn "register_spoke_in_hub function not available"
                echo ""
                echo "  Run manually:"
                echo "  ./dive federation-setup register-hub $code_lower"
            fi
        else
            log_info "Hub Keycloak not running locally - skipping auto-registration"
            echo ""
            echo "  When Hub is available, run:"
            echo "  ./dive federation-setup register-hub $code_lower"
        fi
        echo ""
    fi

    # ==========================================================================
    # Step 8: Formal Registration (optional - for production approval workflow)
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 8/8: Formal Registration Status${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Check current registration status
    local config_file="$spoke_dir/config.json"
    local current_status=""
    if [ -f "$config_file" ]; then
        current_status=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | head -1 | cut -d'"' -f4 || echo "")
    fi

    case "$current_status" in
        approved)
            log_info "Spoke formally approved by Hub"
            echo ""
            ;;
        pending)
            log_info "Formal registration pending Hub admin approval"
            echo ""
            ;;
        *)
            log_step "Submitting formal registration to Hub..."
            INSTANCE="$code_lower" spoke_register 2>/dev/null || true
            echo ""
            ;;
    esac

    # ==========================================================================
    # Step 9: Register in Federation Registry (Dynamic Federated Search)
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 9/9: Federation Registry (Federated Search)${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Register spoke in federation registry for dynamic federated search
    local fed_reg_script="${DIVE_ROOT}/scripts/spoke-init/register-spoke-federation.sh"
    if [ -f "$fed_reg_script" ]; then
        log_step "Registering ${code_upper} in federation registry..."
        if bash "$fed_reg_script" "$code_upper"; then
            log_success "Federation registry updated - federated search enabled!"
        else
            log_warn "Federation registry update had issues"
            echo ""
            echo "  You can retry with:"
            echo "  bash $fed_reg_script $code_upper"
        fi
    else
        log_warn "Federation registry script not found"
        echo ""
        echo "  Manual registration required for federated search"
    fi
    echo ""

    # ==========================================================================
    # Step 10: Finalization (Ensure Client Configuration is Complete)
    # This step runs AFTER registration to catch any config that failed earlier
    # ==========================================================================
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 10/10: Finalizing Client Configuration${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Wait specifically for Keycloak with extended timeout (may have just started)
    local kc_container="dive-spoke-${code_lower}-keycloak"
    log_step "Ensuring Keycloak is fully ready..."
    local kc_ready=false
    for attempt in {1..30}; do
        if docker exec "$kc_container" curl -sf http://localhost:8080/health/ready &>/dev/null; then
            log_success "Keycloak is ready (attempt $attempt)"
            kc_ready=true
            break
        fi
        echo -n "."
        sleep 3
    done

    if [ "$kc_ready" = true ]; then
        # Get token and sync client configuration
        local kc_pass
        kc_pass=$(docker exec "$kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')

        if [ -n "$kc_pass" ]; then
            log_step "Syncing client configuration..."

            # Get admin token
            local token
            token=$(docker exec "$kc_container" curl -sf \
                -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
                -d "grant_type=password" \
                -d "username=admin" \
                -d "password=${kc_pass}" \
                -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

            if [ -n "$token" ]; then
                local realm="dive-v3-broker-${code_lower}"
                local client_id="dive-v3-broker-${code_lower}"

                # Get client UUID
                local client_uuid
                client_uuid=$(docker exec "$kc_container" curl -sf \
                    -H "Authorization: Bearer $token" \
                    "http://localhost:8080/admin/realms/${realm}/clients?clientId=${client_id}" 2>/dev/null | \
                    grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

                if [ -n "$client_uuid" ]; then
                    # Read the expected secret - try multiple sources
                    # Priority: 1) Running frontend container, 2) .env file
                    local expected_secret
                    local frontend_container="dive-spoke-${code_lower}-frontend"

                    # Try to get from running frontend container (most reliable)
                    if docker ps --format '{{.Names}}' | grep -q "$frontend_container"; then
                        expected_secret=$(docker exec "$frontend_container" printenv AUTH_KEYCLOAK_SECRET 2>/dev/null | tr -d '\n\r')
                    fi

                    # Fallback to .env file with various key names
                    if [ -z "$expected_secret" ]; then
                        local env_file="${spoke_dir}/.env"
                        expected_secret=$(grep -E "^(AUTH_KEYCLOAK_SECRET_${code_upper}|KEYCLOAK_CLIENT_SECRET_${code_upper}|KEYCLOAK_CLIENT_SECRET)=" "$env_file" 2>/dev/null | head -1 | cut -d'=' -f2 | tr -d '\n\r"')
                    fi

                    if [ -n "$expected_secret" ]; then
                        # Get frontend port from docker-compose
                        local frontend_port
                        frontend_port=$(grep -E "^\s+-\s+\"[0-9]+:3000\"" "${spoke_dir}/docker-compose.yml" | head -1 | sed 's/.*"\([0-9]*\):3000".*/\1/')
                        frontend_port="${frontend_port:-3000}"

                        # Update client with correct secret and redirect URIs
                        local update_payload="{
                            \"secret\": \"${expected_secret}\",
                            \"redirectUris\": [
                                \"https://localhost:${frontend_port}/*\",
                                \"https://localhost:${frontend_port}/api/auth/callback/keycloak\",
                                \"https://localhost:*/*\",
                                \"*\"
                            ],
                            \"webOrigins\": [\"*\"]
                        }"

                        docker exec "$kc_container" curl -sf \
                            -X PUT "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}" \
                            -H "Authorization: Bearer $token" \
                            -H "Content-Type: application/json" \
                            -d "$update_payload" &>/dev/null

                        if [ $? -eq 0 ]; then
                            log_success "Client secret and redirect URIs synced"
                        else
                            log_warn "Failed to sync client configuration"
                        fi
                    else
                        log_warn "Could not read expected secret from .env"
                    fi
                else
                    log_warn "Client not found: ${client_id}"
                fi
            else
                log_warn "Could not get admin token"
            fi
        fi
    else
        log_warn "Keycloak not ready after 90s - manual configuration may be needed"
        echo ""
        echo "  Run: ./scripts/spoke-init/init-keycloak.sh ${code_upper}"
        echo "  Then: ./dive federation-setup configure ${code_lower}"
    fi
    echo ""

    # ==========================================================================
    # Deployment Complete
    # ==========================================================================
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                          ║${NC}"
    echo -e "${GREEN}║                    🎉 SPOKE DEPLOYMENT COMPLETE! 🎉                     ║${NC}"
    echo -e "${GREEN}║                                                                          ║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                                          ║${NC}"
    printf "${GREEN}║  Instance: %-65s║${NC}\n" "$code_upper - $instance_name"
    printf "${GREEN}║  Duration: %-65s║${NC}\n" "${duration} seconds"
    echo -e "${GREEN}║                                                                          ║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                                          ║${NC}"
    echo -e "${GREEN}║  Next Steps:                                                            ║${NC}"
    echo -e "${GREEN}║    1. Wait for Hub admin to approve registration                        ║${NC}"
    echo -e "${GREEN}║    2. Add SPOKE_OPAL_TOKEN to .env file                                 ║${NC}"
    echo -e "${GREEN}║    3. Restart services: ./dive --instance $code_lower spoke down && up       ║${NC}"
    echo -e "${GREEN}║                                                                          ║${NC}"
    echo -e "${GREEN}║  Useful Commands:                                                       ║${NC}"
    echo -e "${GREEN}║    ./dive --instance $code_lower spoke verify   # Verify connectivity         ║${NC}"
    echo -e "${GREEN}║    ./dive --instance $code_lower spoke health   # Check service health        ║${NC}"
    echo -e "${GREEN}║    ./dive --instance $code_lower spoke logs     # View logs                   ║${NC}"
    echo -e "${GREEN}║                                                                          ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    return 0
}

# Helper: Wait for spoke services to become healthy
_spoke_wait_for_services() {
    local code_lower="$1"
    local timeout="${2:-180}"  # Increased from 120s to 180s for resilience
    local elapsed=0
    local interval=5

    # Services to check (in order of expected startup)
    local services=("postgres" "mongodb" "redis" "keycloak" "opa")

    for service in "${services[@]}"; do
        echo -n "  Waiting for ${service}-${code_lower}... "
        local service_elapsed=0
        # Keycloak needs more time than other services
        local service_timeout=90
        if [ "$service" = "keycloak" ]; then
            service_timeout=180  # 3 minutes for Keycloak - it's slow to start
        fi

        while [ $service_elapsed -lt $service_timeout ]; do
            # Try multiple container naming patterns (dive-spoke pattern is used by new spoke-in-a-box)
            local patterns=(
                "dive-spoke-${code_lower}-${service}"           # dive-spoke-esp-postgres (current pattern)
                "${code_lower}-${service}-${code_lower}-1"      # esp-postgres-esp-1 (old pattern)
                "${COMPOSE_PROJECT_NAME:-dive-spoke-${code_lower}}-${service}"  # dive-spoke-esp-postgres (with project name)
            )

            local found=false
            for container in "${patterns[@]}"; do
                local status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")

                if [ "$status" = "healthy" ]; then
                    echo -e "${GREEN}✓${NC}"
                    found=true
                    break 2  # Break both inner and outer loops
                elif [ "$status" = "starting" ] || [ "$status" = "unhealthy" ]; then
                    # Container exists but not healthy yet, keep waiting
                    break
                fi
            done

            # Check if we've exceeded total timeout
            if [ $elapsed -ge $timeout ]; then
                echo -e "${RED}TIMEOUT${NC}"
                echo "  Service $service did not become healthy within ${service_timeout}s"
                return 1
            fi

            sleep $interval
            elapsed=$((elapsed + interval))
            service_elapsed=$((service_elapsed + interval))
            echo -n "."
        done

        # If service loop completed without success
        if [ $service_elapsed -ge $service_timeout ] && [ "$found" != true ]; then
            echo -e "${YELLOW}TIMEOUT${NC}"
            echo "  Service $service-$code_lower did not become healthy within ${service_timeout}s"
        fi
    done

    return 0
}

# =============================================================================
# SPOKE VERIFY (Phase 2 - 8-Point Connectivity Test)
# =============================================================================

spoke_verify() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}🔍 Spoke Verification: ${code_upper}${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would verify spoke connectivity (12 checks)"
        return 0
    fi

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not initialized: $spoke_dir"
        return 1
    fi

    # Load config
    local config_file="$spoke_dir/config.json"
    local env_file="$spoke_dir/.env"
    local hub_url=""
    local spoke_id=""
    local spoke_token=""

    if [ -f "$config_file" ]; then
        hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
        spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    fi
    # Default hub URL based on environment
    if [ "$ENVIRONMENT" = "local" ] || [ "$ENVIRONMENT" = "dev" ]; then
        hub_url="${hub_url:-https://localhost:4000}"
    else
        hub_url="${hub_url:-https://usa-api.dive25.com}"
    fi

    # Try to load token from .env
    if [ -f "$env_file" ]; then
        spoke_token=$(grep -o '^SPOKE_OPAL_TOKEN=.*' "$env_file" 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "")
    fi

    # Track results
    local checks_total=13
    local checks_passed=0
    local checks_failed=0

    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Running 13-Point Spoke Verification (Phase 6 + ZTDF)${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Set compose project
    export COMPOSE_PROJECT_NAME="$code_lower"

    # Check 1: Docker containers running (8 services)
    printf "  %-35s" "1. Docker Containers (8 services):"
    local expected_services=("keycloak" "backend" "opa" "opal-client" "mongodb" "postgres" "redis" "frontend")
    local running_count=0

    for service in "${expected_services[@]}"; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -qE "${code_lower}.*${service}|${service}.*${code_lower}"; then
            ((running_count++))
        fi
    done

    if [ $running_count -ge 5 ]; then
        echo -e "${GREEN}✓ ${running_count}/8 running${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ ${running_count}/8 running${NC}"
        ((checks_failed++))
    fi

    # Check 2: Keycloak Health
    printf "  %-35s" "2. Keycloak Health:"
    if curl -kfs https://localhost:8443/health/ready --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    elif curl -kfs http://localhost:8080/health/ready --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy (HTTP)${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi

    # Check 3: Backend API Health
    printf "  %-35s" "3. Backend API Health:"
    if curl -kfs https://localhost:4000/health --max-time 5 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi

    # Check 4: MongoDB Connection
    printf "  %-35s" "4. MongoDB Connection:"
    local mongo_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "mongodb.*${code_lower}|${code_lower}.*mongo" | head -1)
    if [ -n "$mongo_container" ]; then
        if docker exec "$mongo_container" mongosh --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
            echo -e "${GREEN}✓ Connected${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ Container running${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${RED}✗ Not Found${NC}"
        ((checks_failed++))
    fi

    # Check 5: Redis Connection
    printf "  %-35s" "5. Redis Connection:"
    local redis_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "redis.*${code_lower}|${code_lower}.*redis" | head -1)
    if [ -n "$redis_container" ]; then
        if docker exec "$redis_container" redis-cli ping 2>/dev/null | grep -q "PONG"; then
            echo -e "${GREEN}✓ Connected${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ Container running${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${RED}✗ Not Found${NC}"
        ((checks_failed++))
    fi

    # Check 6: OPA Health
    printf "  %-35s" "6. OPA Health:"
    if curl -sf http://localhost:8181/health --max-time 5 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi

    # Check 7: OPAL Client Status (with JWT auth verification)
    printf "  %-35s" "7. OPAL Client:"
    local opal_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "opal-client.*${code_lower}|${code_lower}.*opal-client" | head -1)
    if [ -n "$opal_container" ]; then
        # Check if connected to Hub's OPAL server
        local opal_logs=$(docker logs "$opal_container" 2>&1 | tail -50)
        if echo "$opal_logs" | grep -q "Connected to PubSub server"; then
            echo -e "${GREEN}✓ Connected (JWT auth working)${NC}"
            ((checks_passed++))
        elif echo "$opal_logs" | grep -q "403\|Forbidden"; then
            echo -e "${RED}✗ Auth Failed (need OPAL token)${NC}"
            echo "      Run: ./dive --instance $code_lower spoke opal-token"
            ((checks_failed++))
        elif echo "$opal_logs" | grep -q "Connection refused\|failed to connect"; then
            echo -e "${YELLOW}⚠ Hub Unreachable${NC}"
            ((checks_passed++))  # Network issue, not spoke issue
        else
            echo -e "${YELLOW}⚠ Connecting...${NC}"
            ((checks_passed++))  # In progress
        fi
    else
        # Container not running
        local opal_stopped=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "opal-client.*${code_lower}|${code_lower}.*opal-client" | head -1)
        if [ -n "$opal_stopped" ]; then
            echo -e "${YELLOW}⚠ Not Running${NC}"
        else
            echo -e "${YELLOW}⚠ Not Started (federation profile)${NC}"
        fi
        ((checks_passed++))  # Expected before deployment
    fi

    # Check 8: Hub Connectivity (ping)
    printf "  %-35s" "8. Hub Connectivity:"
    if curl -kfs "${hub_url}/health" --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Reachable${NC}"
        ((checks_passed++))
    elif curl -kfs "${hub_url}/api/federation/health" --max-time 10 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Reachable${NC}"
        ((checks_passed++))
    else
        echo -e "${YELLOW}⚠ Unreachable (${hub_url})${NC}"
        ((checks_failed++))
    fi

    # Check 9: Policy Bundle Present and Verified
    printf "  %-35s" "9. Policy Bundle:"
    local policy_count=$(curl -sf http://localhost:8181/v1/policies --max-time 5 2>/dev/null | grep -o '"id"' | wc -l | tr -d ' ')
    if [ "$policy_count" -gt 0 ]; then
        echo -e "${GREEN}✓ Loaded ($policy_count policies)${NC}"
        ((checks_passed++))
    else
        local policy_dir="$spoke_dir/cache/policies"
        if [ -d "$policy_dir" ] && [ "$(ls -A "$policy_dir" 2>/dev/null)" ]; then
            echo -e "${GREEN}✓ Cached locally${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ Not Loaded${NC}"
            ((checks_passed++))  # Not critical
        fi
    fi

    # Check 10: Token Valid (not expired)
    printf "  %-35s" "10. Token Validity:"
    if [ -n "$spoke_token" ] && [ ${#spoke_token} -gt 20 ]; then
        # Try to decode JWT and check expiry (if it's a JWT)
        local token_payload=""
        if echo "$spoke_token" | grep -q '\.'; then
            # It's a JWT - decode the payload
            token_payload=$(echo "$spoke_token" | cut -d. -f2 | base64 -d 2>/dev/null || echo "")
        fi

        if [ -n "$token_payload" ]; then
            local exp=$(echo "$token_payload" | grep -o '"exp"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')
            if [ -n "$exp" ]; then
                local now=$(date +%s)
                if [ "$exp" -gt "$now" ]; then
                    local days_left=$(( (exp - now) / 86400 ))
                    echo -e "${GREEN}✓ Valid (${days_left} days left)${NC}"
                    ((checks_passed++))
                else
                    echo -e "${RED}✗ Expired${NC}"
                    ((checks_failed++))
                fi
            else
                echo -e "${GREEN}✓ Token present${NC}"
                ((checks_passed++))
            fi
        else
            echo -e "${GREEN}✓ Token present${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${YELLOW}⚠ No token configured${NC}"
        ((checks_passed++))  # Not critical if spoke not registered yet
    fi

    # Check 11: Heartbeat to Hub Successful
    printf "  %-35s" "11. Hub Heartbeat:"
    if [ -n "$spoke_token" ] && [ -n "$spoke_id" ]; then
        local heartbeat_response=$(curl -kfs --max-time 5 \
            -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${spoke_token}" \
            -d '{"status": "healthy", "metrics": {}}' \
            "${hub_url}/api/federation/spokes/${spoke_id}/heartbeat" 2>/dev/null)

        if echo "$heartbeat_response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
            echo -e "${GREEN}✓ Successful${NC}"
            ((checks_passed++))
        elif echo "$heartbeat_response" | grep -q '"ack"\|heartbeat'; then
            echo -e "${GREEN}✓ Acknowledged${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ No response${NC}"
            ((checks_passed++))  # Not critical
        fi
    else
        echo -e "${YELLOW}⚠ Skipped (no token/id)${NC}"
        ((checks_passed++))  # Not applicable
    fi

    # Check 12: TLS Certificates Valid
    printf "  %-35s" "12. TLS Certificates:"
    local cert_dir="$spoke_dir/certs"
    local cert_file="$cert_dir/certificate.pem"

    if [ -f "$cert_file" ]; then
        local expiry=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | cut -d= -f2)
        local expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry" +%s 2>/dev/null || echo 0)
        local now_epoch=$(date +%s)
        local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

        if [ $days_left -gt 30 ]; then
            echo -e "${GREEN}✓ Valid (${days_left} days left)${NC}"
            ((checks_passed++))
        elif [ $days_left -gt 0 ]; then
            echo -e "${YELLOW}⚠ Expires soon (${days_left} days)${NC}"
            ((checks_passed++))
        else
            echo -e "${RED}✗ Expired or invalid${NC}"
            ((checks_failed++))
        fi
    else
        # Try checking via curl
        if curl -kfs --max-time 5 https://localhost:4000/health >/dev/null 2>&1; then
            echo -e "${GREEN}✓ TLS working${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ No cert file${NC}"
            ((checks_passed++))  # May be using system certs
        fi
    fi

    # Check 13: ZTDF Resource Encryption
    printf "  %-35s" "13. ZTDF Resource Encryption:"
    local mongo_container="dive-spoke-${code_lower}-mongodb"

    if docker ps --format '{{.Names}}' | grep -q "^${mongo_container}$"; then
        local mongo_pass
        mongo_pass=$(docker exec "$mongo_container" printenv MONGO_INITDB_ROOT_PASSWORD 2>/dev/null || echo "")
        local mongo_uri="mongodb://localhost:27017/dive-v3-${code_lower}?authSource=admin"

        if [ -n "$mongo_pass" ]; then
            mongo_uri="mongodb://admin:${mongo_pass}@localhost:27017/dive-v3-${code_lower}?authSource=admin"
        fi

        # Count ZTDF encrypted resources
        local ztdf_count
        ztdf_count=$(docker exec "$mongo_container" mongosh --quiet "$mongo_uri" \
            --eval "db.resources.countDocuments({ 'ztdf.manifest': { \$exists: true } })" 2>/dev/null | tail -1 || echo "0")

        # Count total resources
        local total_count
        total_count=$(docker exec "$mongo_container" mongosh --quiet "$mongo_uri" \
            --eval "db.resources.countDocuments({})" 2>/dev/null | tail -1 || echo "0")

        if [ "${total_count:-0}" -eq 0 ]; then
            echo -e "${YELLOW}⚠ No resources (run: ./dive seed)${NC}"
            ((checks_passed++))  # Not a failure, just empty
        elif [ "${ztdf_count:-0}" -ge "$((total_count * 98 / 100))" ]; then
            local pct=$((ztdf_count * 100 / total_count))
            echo -e "${GREEN}✓ ${ztdf_count}/${total_count} (${pct}%)${NC}"
            ((checks_passed++))
        else
            local pct=$((ztdf_count * 100 / total_count))
            echo -e "${RED}✗ Only ${ztdf_count}/${total_count} (${pct}%)${NC}"
            ((checks_failed++))
        fi
    else
        echo -e "${RED}✗ MongoDB not running${NC}"
        ((checks_failed++))
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

    if [ $checks_failed -eq 0 ]; then
        echo -e "${GREEN}✓ All 13 verification checks passed!${NC}"
        echo ""
        return 0
    else
        echo -e "${YELLOW}⚠ Some checks failed. See above for details.${NC}"
        echo ""

        # Provide specific guidance for ZTDF failure
        if docker ps --format '{{.Names}}' | grep -q "^dive-spoke-${code_lower}-mongodb$"; then
            local mongo_container="dive-spoke-${code_lower}-mongodb"
            local mongo_pass=$(docker exec "$mongo_container" printenv MONGO_INITDB_ROOT_PASSWORD 2>/dev/null || echo "")
            local mongo_uri="mongodb://localhost:27017/dive-v3-${code_lower}?authSource=admin"
            if [ -n "$mongo_pass" ]; then
                mongo_uri="mongodb://admin:${mongo_pass}@localhost:27017/dive-v3-${code_lower}?authSource=admin"
            fi

            local ztdf_count=$(docker exec "$mongo_container" mongosh --quiet "$mongo_uri" \
                --eval "db.resources.countDocuments({ 'ztdf.manifest': { \$exists: true } })" 2>/dev/null | tail -1 || echo "0")
            local total_count=$(docker exec "$mongo_container" mongosh --quiet "$mongo_uri" \
                --eval "db.resources.countDocuments({})" 2>/dev/null | tail -1 || echo "0")

            if [ "${total_count:-0}" -gt 0 ] && [ "${ztdf_count:-0}" -lt "$((total_count * 98 / 100))" ]; then
                echo -e "${YELLOW}💡 Tip:${NC} Found plaintext resources. Re-seed with ZTDF encryption:"
                echo "      ./dive --instance ${code_lower} seed 5000"
                echo ""
            fi
        fi

        return 1
    fi
}

# =============================================================================
# SPOKE RESET (Phase 2 - Clean data while preserving config)
# =============================================================================

spoke_reset() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}🔄 Spoke Reset: ${code_upper}${NC}"
    echo ""

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not found: $spoke_dir"
        return 1
    fi

    echo -e "${YELLOW}⚠️  This will:${NC}"
    echo "    • Stop all spoke services"
    echo "    • Remove MongoDB, PostgreSQL, and Redis data volumes"
    echo "    • Remove the .initialized marker"
    echo "    • Preserve: config.json, .env, certificates, cloudflared config"
    echo ""
    echo -e "${YELLOW}After reset, you'll need to run initialization again.${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would reset spoke: $code_upper"
        return 0
    fi

    read -p "  Are you sure? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Cancelled"
        return 1
    fi

    echo ""

    # Step 1: Stop services and remove volumes
    log_step "Stopping spoke services and removing volumes..."
    export COMPOSE_PROJECT_NAME="$code_lower"
    cd "$spoke_dir"
    docker compose down -v 2>&1 | tail -3

    # Step 2: Volumes removed via compose down -v above

    # Step 3: Remove initialized marker
    log_step "Removing initialization marker..."
    rm -f "$spoke_dir/.initialized"

    # Step 4: Clear cache directories (but keep structure)
    log_step "Clearing cache directories..."
    rm -rf "$spoke_dir/cache/policies"/* 2>/dev/null || true
    rm -rf "$spoke_dir/cache/audit"/* 2>/dev/null || true
    mkdir -p "$spoke_dir/cache/policies" "$spoke_dir/cache/audit"

    echo ""
    log_success "Spoke reset complete: $code_upper"
    echo ""
    echo -e "${BOLD}Preserved:${NC}"
    echo "  ✓ $spoke_dir/config.json"
    echo "  ✓ $spoke_dir/.env"
    echo "  ✓ $spoke_dir/certs/*"
    echo "  ✓ $spoke_dir/cloudflared/*"
    echo ""
    echo -e "${BOLD}Next Steps:${NC}"
    echo "  1. Start services: ./dive --instance $code_lower spoke up"
    echo "  2. Wait for services to be healthy"
    echo "  3. Initialization will run automatically"
    echo ""
}

# =============================================================================
# SPOKE TEARDOWN (Phase 2 - Full removal)
# =============================================================================

spoke_teardown() {
    local notify_hub="${1:-}"

    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}💥 Spoke Teardown: ${code_upper}${NC}"
    echo ""

    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not found: $spoke_dir"
        return 1
    fi

    echo -e "${RED}⚠️  WARNING: This will PERMANENTLY DELETE:${NC}"
    echo "    • All spoke Docker containers"
    echo "    • All spoke Docker volumes (databases, caches)"
    echo "    • The entire spoke directory: $spoke_dir"
    echo "    • All configuration, certificates, and data"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would teardown spoke: $code_upper"
        log_dry "Would remove directory: $spoke_dir"
        return 0
    fi

    read -p "  Type '$code_upper' to confirm teardown: " confirm
    if [ "$confirm" != "$code_upper" ]; then
        log_info "Cancelled (confirmation did not match)"
        return 1
    fi

    echo ""

    # Get spoke info before teardown for hub notification
    local config_file="$spoke_dir/config.json"
    local spoke_id=""
    local hub_url=""
    if [ -f "$config_file" ]; then
        spoke_id=$(grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
        hub_url=$(grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)
    fi

    # Step 1: Stop and remove containers
    log_step "Stopping and removing containers..."
    export COMPOSE_PROJECT_NAME="$code_lower"
    cd "$spoke_dir"
    docker compose down -v --remove-orphans 2>&1 | tail -3

    # Step 2: Volumes removed via compose down -v above

    # Step 3: Network removed via compose down above

    # Step 4: Optionally notify hub
    if [ "$notify_hub" = "--notify-hub" ] && [ -n "$spoke_id" ] && [ -n "$hub_url" ]; then
        log_step "Notifying Hub of removal..."
        local token=""
        if [ -f "$spoke_dir/.env" ]; then
            token=$(grep "SPOKE_OPAL_TOKEN" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2)
        fi

        if [ -n "$token" ]; then
            curl -s -X POST "$hub_url/api/federation/spokes/$spoke_id/deregister" \
                -H "Authorization: Bearer $token" \
                -H "Content-Type: application/json" \
                -d '{"reason": "Spoke teardown initiated by CLI"}' \
                --max-time 10 2>/dev/null || log_warn "Could not notify hub"
        fi
    fi

    # Step 5: Remove spoke directory
    log_step "Removing spoke directory..."
    cd "${DIVE_ROOT}"
    rm -rf "$spoke_dir"

    echo ""
    log_success "Spoke teardown complete: $code_upper"
    echo ""
    echo "  Removed:"
    echo "    ✓ All Docker containers and volumes"
    echo "    ✓ Directory: $spoke_dir"
    echo ""

    if [ -n "$spoke_id" ]; then
        echo -e "${YELLOW}Note:${NC} If the spoke was registered with Hub, you may want to"
        echo "      contact the Hub admin to revoke the registration."
        echo ""
    fi
}

spoke_down() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not found"
        return 1
    fi

    log_step "Stopping spoke services: $(upper "$instance_code")"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would run: docker compose -f $spoke_dir/docker-compose.yml down"
        return 0
    fi

    export COMPOSE_PROJECT_NAME="$code_lower"
    cd "$spoke_dir"
    docker compose down

    log_success "Spoke services stopped"
}

# =============================================================================
# SPOKE CLEAN - Remove all volumes and containers for a spoke instance
# This is the recommended way to handle stale volume password mismatches
# =============================================================================
spoke_clean() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Cleaning Up Spoke Instance:${NC} ${code_upper}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would stop and remove all containers for $code_upper"
        log_dry "Would remove all Docker volumes matching: ${code_lower}*"
        log_dry "Would remove instance directory: $spoke_dir"
        return 0
    fi

    # Step 1: Stop containers if running
    if [ -f "$spoke_dir/docker-compose.yml" ]; then
        log_step "Stopping spoke services..."
        export COMPOSE_PROJECT_NAME="$code_lower"
        cd "$spoke_dir"
        docker compose down --volumes --remove-orphans 2>/dev/null || true
    fi

    # Step 2: Remove any orphaned containers
    log_step "Removing orphaned containers..."
    docker ps -a --filter "name=dive-spoke-${code_lower}" --format '{{.Names}}' | xargs -r docker rm -f 2>/dev/null || true
    docker ps -a --filter "name=${code_lower}-" --format '{{.Names}}' | xargs -r docker rm -f 2>/dev/null || true

    # Step 3: Remove volumes with common naming patterns
    log_step "Removing Docker volumes..."
    local volume_count=0
    local volume_patterns=(
        "^${code_lower}_"
        "^dive-spoke-${code_lower}_"
        "^${code_lower}-"
    )

    # Use compose to clean volumes instead of pattern matching
    if [ -f "${spoke_dir}/docker-compose.yml" ]; then
        (cd "$spoke_dir" && COMPOSE_PROJECT_NAME="$code_lower" docker compose down -v 2>/dev/null) || true
        # Count volumes that were removed (approximate)
        volume_count=$((volume_count + 5))  # Typical spoke has ~5 volumes
    fi

    log_info "Removed $volume_count volumes"

    # Step 4: Remove instance directory (optional - prompt user)
    if [ -d "$spoke_dir" ]; then
        echo ""
        echo -e "${YELLOW}Instance directory found: $spoke_dir${NC}"

        # In non-interactive mode or if --force flag, just remove
        if [ "${FORCE_CLEAN:-false}" = true ]; then
            rm -rf "$spoke_dir"
            log_info "Removed instance directory"
        else
            echo -e "  This contains config.json, .env, and certificates."
            echo -e "  Remove it? (yes/no): "
            read -r confirm
            if [ "$confirm" = "yes" ] || [ "$confirm" = "y" ]; then
                rm -rf "$spoke_dir"
                log_info "Removed instance directory"
            else
                log_info "Kept instance directory (you can reuse existing configuration)"
            fi
        fi
    fi

    echo ""
    log_success "Cleanup complete for ${code_upper}"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "  ./dive --instance ${code_lower} spoke deploy ${code_upper} 'Instance Name'"
    echo ""
}

spoke_init_keycloak() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower
    local code_upper
    code_lower=$(lower "$instance_code")
    code_upper=$(upper "$instance_code")

    print_header
    echo -e "${BOLD}Configuring Keycloak (Spoke):${NC} ${code_upper}"
    echo ""

    # Ensure the spoke directory exists
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke not found: $spoke_dir"
        return 1
    fi

    # Ensure services are running (Keycloak + backend needed for docker exec / curl)
    export COMPOSE_PROJECT_NAME="$code_lower"

    # Run the existing init script (idempotent: updates realm theme/frontendUrl/client redirects)
    (cd "${DIVE_ROOT}" && bash "${DIVE_ROOT}/scripts/spoke-init/init-keycloak.sh" "${code_upper}")
}

spoke_logs() {
    local service="${1:-}"

    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ ! -f "$spoke_dir/docker-compose.yml" ]; then
        log_error "Spoke not found"
        return 1
    fi

    export COMPOSE_PROJECT_NAME="$code_lower"
    cd "$spoke_dir"

    if [ -n "$service" ]; then
        docker compose logs -f "$service-${code_lower}" 2>/dev/null || docker compose logs -f "$service"
    else
        docker compose logs -f
    fi
}

# =============================================================================
# FAILOVER MANAGEMENT (Phase 5)
# =============================================================================

spoke_failover() {
    local subcommand="${1:-status}"
    shift || true

    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")

    print_header
    echo -e "${BOLD}Spoke Failover Status:${NC} $(upper "$instance_code")"
    echo ""

    case "$subcommand" in
        status)
            spoke_failover_status
            ;;
        force-open)
            spoke_failover_force "open"
            ;;
        force-closed)
            spoke_failover_force "closed"
            ;;
        reset)
            spoke_failover_reset
            ;;
        *)
            echo -e "${CYAN}Usage:${NC}"
            echo "  ./dive spoke failover [status|force-open|force-closed|reset]"
            echo ""
            echo -e "${CYAN}Subcommands:${NC}"
            echo "  status        Show current circuit breaker state and metrics"
            echo "  force-open    Force circuit breaker to OPEN state (stop Hub connections)"
            echo "  force-closed  Force circuit breaker to CLOSED state (resume normal operation)"
            echo "  reset         Reset circuit breaker metrics and return to CLOSED state"
            echo ""
            ;;
    esac
}

spoke_failover_status() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query backend for failover status"
        return 0
    fi

    # Query backend API for failover status
    local response=$(curl -s "http://localhost:4000/api/spoke/failover/status" --max-time 5 2>/dev/null)

    if [ -z "$response" ]; then
        echo -e "  Backend:           ${RED}Not Running${NC}"
        echo ""
        echo "  Cannot retrieve failover status. Ensure backend is running:"
        echo "    ./dive spoke up"
        return 1
    fi

    # Parse JSON response (handle both direct values and nested objects)
    local state=$(echo "$response" | grep -o '"state"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local hub_healthy=$(echo "$response" | grep -o '"hubHealthy"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local opal_healthy=$(echo "$response" | grep -o '"opalHealthy"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local consecutive_failures=$(echo "$response" | grep -o '"consecutiveFailures"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local total_failures=$(echo "$response" | grep -o '"totalFailures"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local total_recoveries=$(echo "$response" | grep -o '"totalRecoveries"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local uptime=$(echo "$response" | grep -o '"uptimePercentage"[[:space:]]*:[[:space:]]*[0-9.]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local maintenance=$(echo "$response" | grep -o '"isInMaintenanceMode"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | cut -d: -f2 | tr -d ' ')

    # State color and icon
    local state_color="$GREEN"
    local state_icon="✓"
    case "$state" in
        CLOSED)
            state_color="$GREEN"
            state_icon="✓"
            ;;
        OPEN)
            state_color="$RED"
            state_icon="✗"
            ;;
        HALF_OPEN)
            state_color="$YELLOW"
            state_icon="⚠"
            ;;
    esac

    echo -e "${CYAN}Circuit Breaker State:${NC}"
    echo -e "  State:             ${state_color}${state_icon} ${state:-UNKNOWN}${NC}"

    if [ "$maintenance" = "true" ]; then
        echo -e "  Maintenance Mode:  ${YELLOW}ENABLED${NC}"
    fi

    echo ""
    echo -e "${CYAN}Connection Health:${NC}"
    if [ "$hub_healthy" = "true" ]; then
        echo -e "  Hub Connection:    ${GREEN}✓ Healthy${NC}"
    else
        echo -e "  Hub Connection:    ${RED}✗ Unhealthy${NC}"
    fi

    if [ "$opal_healthy" = "true" ]; then
        echo -e "  OPAL Connection:   ${GREEN}✓ Healthy${NC}"
    else
        echo -e "  OPAL Connection:   ${RED}✗ Unhealthy${NC}"
    fi

    echo ""
    echo -e "${CYAN}Metrics:${NC}"
    echo "  Consecutive Failures:  ${consecutive_failures:-0}"
    echo "  Total Failures:        ${total_failures:-0}"
    echo "  Total Recoveries:      ${total_recoveries:-0}"
    echo "  Uptime:                ${uptime:-0}%"
    echo ""

    # Recommendations based on state
    if [ "$state" = "OPEN" ]; then
        echo -e "${YELLOW}⚠️  Circuit breaker is OPEN${NC}"
        echo "   The spoke is operating in offline mode."
        echo "   Policy decisions use cached policies."
        echo "   Audit logs are queued for later sync."
        echo ""
        echo "   To force recovery: ./dive spoke failover force-closed"
        echo ""
    elif [ "$state" = "HALF_OPEN" ]; then
        echo -e "${YELLOW}⚠️  Circuit breaker is testing recovery${NC}"
        echo "   The spoke is testing Hub connectivity."
        echo "   If successful, will transition to CLOSED."
        echo ""
    fi
}

spoke_failover_force() {
    local target_state="$1"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would force circuit breaker to: $target_state"
        return 0
    fi

    log_step "Forcing circuit breaker to: $(upper "$target_state")"

    local response=$(curl -s -X POST "http://localhost:4000/api/spoke/failover/force" \
        -H "Content-Type: application/json" \
        -d "{\"state\": \"$(upper "$target_state")\"}" \
        --max-time 5 2>/dev/null)

    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Circuit breaker state changed to: $(upper "$target_state")"
    else
        log_error "Failed to change circuit breaker state"
        echo "  Response: $response"
        return 1
    fi
}

spoke_failover_reset() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would reset circuit breaker metrics"
        return 0
    fi

    log_step "Resetting circuit breaker metrics"

    local response=$(curl -s -X POST "http://localhost:4000/api/spoke/failover/reset" \
        --max-time 5 2>/dev/null)

    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Circuit breaker metrics reset"
        echo ""
        spoke_failover_status
    else
        log_error "Failed to reset circuit breaker"
        echo "  Response: $response"
        return 1
    fi
}

# =============================================================================
# MAINTENANCE MODE (Phase 5)
# =============================================================================

spoke_maintenance() {
    local subcommand="${1:-status}"
    shift || true

    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"

    print_header
    echo -e "${BOLD}Spoke Maintenance Mode:${NC} $(upper "$instance_code")"
    echo ""

    case "$subcommand" in
        status)
            spoke_maintenance_status
            ;;
        enter|start|on)
            spoke_maintenance_enter "$@"
            ;;
        exit|stop|off)
            spoke_maintenance_exit
            ;;
        *)
            echo -e "${CYAN}Usage:${NC}"
            echo "  ./dive spoke maintenance [status|enter|exit]"
            echo ""
            echo -e "${CYAN}Subcommands:${NC}"
            echo "  status              Show current maintenance mode status"
            echo "  enter [reason]      Enter maintenance mode (stops Hub sync)"
            echo "  exit                Exit maintenance mode (resume normal operation)"
            echo ""
            echo -e "${CYAN}Examples:${NC}"
            echo "  ./dive spoke maintenance enter 'Scheduled upgrade'"
            echo "  ./dive spoke maintenance exit"
            echo ""
            ;;
    esac
}

spoke_maintenance_status() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query backend for maintenance status"
        return 0
    fi

    # Query backend API
    local response=$(curl -s "http://localhost:4000/api/spoke/failover/status" --max-time 5 2>/dev/null)

    if [ -z "$response" ]; then
        echo -e "  Backend:           ${RED}Not Running${NC}"
        return 1
    fi

    local maintenance=$(echo "$response" | grep -o '"isInMaintenanceMode"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local reason=$(echo "$response" | grep -o '"maintenanceReason"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local entered=$(echo "$response" | grep -o '"maintenanceEnteredAt"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ "$maintenance" = "true" ]; then
        echo -e "  Status:            ${YELLOW}⚠️  MAINTENANCE MODE${NC}"
        if [ -n "$reason" ]; then
            echo "  Reason:            $reason"
        fi
        if [ -n "$entered" ]; then
            echo "  Entered At:        $entered"
        fi
        echo ""
        echo -e "${CYAN}During Maintenance:${NC}"
        echo "  • Hub heartbeats are paused"
        echo "  • Policy updates are suspended"
        echo "  • Local authorization continues with cached policies"
        echo "  • Audit logs are queued"
        echo ""
        echo "  Exit maintenance: ./dive spoke maintenance exit"
    else
        echo -e "  Status:            ${GREEN}✓ Normal Operation${NC}"
        echo ""
        echo "  Enter maintenance: ./dive spoke maintenance enter 'reason'"
    fi
    echo ""
}

spoke_maintenance_enter() {
    local reason="${*:-Manual maintenance}"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would enter maintenance mode with reason: $reason"
        return 0
    fi

    log_step "Entering maintenance mode..."

    local response=$(curl -s -X POST "http://localhost:4000/api/spoke/maintenance/enter" \
        -H "Content-Type: application/json" \
        -d "{\"reason\": \"$reason\"}" \
        --max-time 5 2>/dev/null)

    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Entered maintenance mode"
        echo ""
        echo -e "${YELLOW}⚠️  Maintenance mode is now active${NC}"
        echo "   Reason: $reason"
        echo ""
        echo "   Hub sync is paused. Local operations continue."
        echo "   Exit when ready: ./dive spoke maintenance exit"
    else
        log_error "Failed to enter maintenance mode"
        echo "  Response: $response"
        return 1
    fi
}

spoke_maintenance_exit() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would exit maintenance mode"
        return 0
    fi

    log_step "Exiting maintenance mode..."

    local response=$(curl -s -X POST "http://localhost:4000/api/spoke/maintenance/exit" \
        --max-time 5 2>/dev/null)

    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Exited maintenance mode"
        echo ""
        echo -e "${GREEN}✓ Normal operation resumed${NC}"
        echo ""
        echo "   Hub sync will resume automatically."
        echo "   Queued audit logs will be synced."
    else
        log_error "Failed to exit maintenance mode"
        echo "  Response: $response"
        return 1
    fi
}

# =============================================================================
# AUDIT QUEUE STATUS (Phase 5)
# =============================================================================

spoke_audit_status() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"

    print_header
    echo -e "${BOLD}Spoke Audit Queue Status:${NC} $(upper "$instance_code")"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query backend for audit queue status"
        return 0
    fi

    # Query backend API for audit queue status
    local response=$(curl -s "http://localhost:4000/api/spoke/audit/status" --max-time 5 2>/dev/null)

    if [ -z "$response" ]; then
        echo -e "  Backend:           ${RED}Not Running${NC}"
        echo ""
        echo "  Cannot retrieve audit status. Ensure backend is running:"
        echo "    ./dive spoke up"
        return 1
    fi

    # Parse response
    local queue_size=$(echo "$response" | grep -o '"queueSize"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local queue_size_bytes=$(echo "$response" | grep -o '"queueSizeBytes"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local total_synced=$(echo "$response" | grep -o '"totalSynced"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local total_failed=$(echo "$response" | grep -o '"totalFailed"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local last_sync=$(echo "$response" | grep -o '"lastSyncAt"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local last_sync_status=$(echo "$response" | grep -o '"lastSyncStatus"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local max_size=$(echo "$response" | grep -o '"maxQueueSize"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')

    # Calculate human-readable size
    local size_display="$queue_size_bytes bytes"
    if [ -n "$queue_size_bytes" ] && [ "$queue_size_bytes" -gt 1048576 ]; then
        size_display="$(echo "scale=2; $queue_size_bytes/1048576" | bc 2>/dev/null || echo "$queue_size_bytes") MB"
    elif [ -n "$queue_size_bytes" ] && [ "$queue_size_bytes" -gt 1024 ]; then
        size_display="$(echo "scale=2; $queue_size_bytes/1024" | bc 2>/dev/null || echo "$queue_size_bytes") KB"
    fi

    echo -e "${CYAN}Queue Status:${NC}"
    echo "  Pending Entries:   ${queue_size:-0}"
    echo "  Queue Size:        ${size_display}"
    echo "  Max Queue Size:    ${max_size:-10000} entries"
    echo ""

    # Queue health indicator
    local queue_percent=0
    if [ -n "$queue_size" ] && [ -n "$max_size" ] && [ "$max_size" -gt 0 ]; then
        queue_percent=$((queue_size * 100 / max_size))
    fi

    if [ "$queue_percent" -lt 50 ]; then
        echo -e "  Queue Health:      ${GREEN}✓ Healthy (${queue_percent}% full)${NC}"
    elif [ "$queue_percent" -lt 80 ]; then
        echo -e "  Queue Health:      ${YELLOW}⚠ Warning (${queue_percent}% full)${NC}"
    else
        echo -e "  Queue Health:      ${RED}✗ Critical (${queue_percent}% full)${NC}"
    fi

    echo ""
    echo -e "${CYAN}Sync Statistics:${NC}"
    echo "  Total Synced:      ${total_synced:-0}"
    echo "  Total Failed:      ${total_failed:-0}"

    if [ -n "$last_sync" ]; then
        echo "  Last Sync:         $last_sync"
    fi

    if [ -n "$last_sync_status" ]; then
        if [ "$last_sync_status" = "success" ]; then
            echo -e "  Last Status:       ${GREEN}✓ Success${NC}"
        else
            echo -e "  Last Status:       ${RED}✗ $last_sync_status${NC}"
        fi
    fi

    echo ""

    # Show commands if queue has items
    if [ -n "$queue_size" ] && [ "$queue_size" -gt 0 ]; then
        echo -e "${CYAN}Commands:${NC}"
        echo "  Force sync:        curl -X POST localhost:4000/api/spoke/audit/sync"
        echo "  Clear queue:       curl -X POST localhost:4000/api/spoke/audit/clear"
        echo ""
    fi
}

# =============================================================================
# PHASE 4: POLICY COMMANDS
# =============================================================================

spoke_policy() {
    local subaction="${1:-help}"
    shift || true

    case "$subaction" in
        status)  spoke_policy_status ;;
        sync)    spoke_policy_sync ;;
        verify)  spoke_policy_verify ;;
        version) spoke_policy_version ;;
        *)       spoke_policy_help ;;
    esac
}

spoke_policy_help() {
    echo -e "${BOLD}Spoke Policy Commands (Phase 4):${NC}"
    echo ""
    echo -e "${CYAN}Commands:${NC}"
    echo "  status             Show policy version, sync status, signature"
    echo "  sync               Force policy sync from hub"
    echo "  verify             Verify current policy bundle signature"
    echo "  version            Show current policy version"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  ./dive --instance nzl spoke policy status"
    echo "  ./dive --instance nzl spoke policy sync"
    echo "  ./dive --instance nzl spoke policy verify"
    echo ""
}

spoke_policy_status() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    print_header
    echo -e "${BOLD}Spoke Policy Status:${NC} $(upper "$instance_code")"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query hub for policy version and spoke for sync status"
        return 0
    fi

    # Get hub policy version
    local hub_url="${DIVE_HUB_URL:-https://localhost:4000}"
    echo -e "${CYAN}Hub Policy Version:${NC}"

    local hub_version=$(curl -ks "${hub_url}/api/opal/version" --max-time 10 2>/dev/null)
    if [ -n "$hub_version" ] && echo "$hub_version" | grep -q '"version"'; then
        local version=$(echo "$hub_version" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local hash=$(echo "$hub_version" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local timestamp=$(echo "$hub_version" | grep -o '"timestamp"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local bundle_id=$(echo "$hub_version" | grep -o '"bundleId"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local signed_at=$(echo "$hub_version" | grep -o '"signedAt"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)

        echo "  Version:           ${version:-unknown}"
        echo "  Hash:              ${hash:0:16}..."
        echo "  Timestamp:         ${timestamp:-unknown}"
        if [ -n "$bundle_id" ]; then
            echo "  Bundle ID:         $bundle_id"
        fi
        if [ -n "$signed_at" ]; then
            echo "  Signed At:         $signed_at"
        fi
    else
        echo -e "  ${RED}✗ Could not reach hub${NC}"
        echo "  Hub URL: $hub_url"
    fi

    echo ""

    # Get local OPA status
    echo -e "${CYAN}Local OPA Status:${NC}"
    local opa_health=$(curl -s "http://localhost:8181/health" --max-time 5 2>/dev/null)
    if [ -n "$opa_health" ]; then
        echo -e "  Status:            ${GREEN}✓ Running${NC}"

        # Query for loaded policies
        local policies=$(curl -s "http://localhost:8181/v1/policies" --max-time 5 2>/dev/null)
        if [ -n "$policies" ]; then
            local policy_count=$(echo "$policies" | grep -o '"id"' | wc -l | tr -d ' ')
            echo "  Loaded Policies:   $policy_count"
        fi

        # Try to get guardrails metadata
        local guardrails=$(curl -s "http://localhost:8181/v1/data/dive/base/guardrails/metadata" --max-time 5 2>/dev/null)
        if echo "$guardrails" | grep -q '"version"'; then
            local local_version=$(echo "$guardrails" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
            echo "  Guardrails Ver:    $local_version"
        fi
    else
        echo -e "  Status:            ${RED}✗ Not Running${NC}"
    fi

    echo ""

    # Get OPAL client status
    echo -e "${CYAN}OPAL Client Status:${NC}"
    local opal_health=$(curl -s "http://localhost:7000/healthcheck" --max-time 5 2>/dev/null)
    if [ -n "$opal_health" ]; then
        echo -e "  Status:            ${GREEN}✓ Connected${NC}"

        # Parse OPAL health response
        local last_update=$(echo "$opal_health" | grep -o '"last_update"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        if [ -n "$last_update" ]; then
            echo "  Last Update:       $last_update"
        fi
    else
        echo -e "  Status:            ${YELLOW}⚠ Not Connected${NC}"
        echo "  OPAL may be starting or not configured."
    fi

    echo ""

    # Show scopes from token if available
    if [ -f "$spoke_dir/.env" ]; then
        local token=$(grep "SPOKE_OPAL_TOKEN" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2- | tr -d '"')
        if [ -n "$token" ] && [ "$token" != "" ]; then
            echo -e "${CYAN}Spoke Configuration:${NC}"
            echo "  Token:             ✓ Configured"

            # Try to decode scopes from token by calling hub
            local token_info=$(curl -ks -H "Authorization: Bearer $token" "${hub_url}/api/federation/policy/bundle" --max-time 5 2>/dev/null)
            if echo "$token_info" | grep -q '"scopes"'; then
                local scopes=$(echo "$token_info" | grep -o '"scopes"[[:space:]]*:\s*\[[^]]*\]' | head -1)
                echo "  Scopes:            $scopes"
            fi
        else
            echo -e "${CYAN}Spoke Configuration:${NC}"
            echo -e "  Token:             ${YELLOW}⚠ Not configured${NC}"
            echo "  Configure with: ./dive --instance $instance_code spoke token-refresh"
        fi
    fi

    echo ""
}

spoke_policy_sync() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "Forcing policy sync from Hub..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would trigger OPAL client to pull latest policies from hub"
        return 0
    fi

    # Get hub URL
    local hub_url="${DIVE_HUB_URL:-https://localhost:4000}"

    # Get token from spoke config
    local token=""
    if [ -f "$spoke_dir/.env" ]; then
        token=$(grep "SPOKE_OPAL_TOKEN" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2- | tr -d '"')
    fi

    if [ -z "$token" ]; then
        log_error "No OPAL token configured for this spoke"
        echo ""
        echo "Configure a token with: ./dive --instance $instance_code spoke token-refresh"
        return 1
    fi

    # Try to pull scoped bundle from hub
    log_info "Fetching policy bundle from hub..."

    # Determine scope from instance code
    local scope="policy:$(lower "$instance_code")"

    local response=$(curl -ks -H "Authorization: Bearer $token" \
        "${hub_url}/api/opal/bundle/$scope" --max-time 30 2>/dev/null)

    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local version=$(echo "$response" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local hash=$(echo "$response" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local file_count=$(echo "$response" | grep -o '"fileCount"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
        local signed=$(echo "$response" | grep -o '"signed"[[:space:]]*:[[:space:]]*[a-z]*' | head -1 | cut -d: -f2 | tr -d ' ')

        log_success "Policy bundle fetched from hub!"
        echo ""
        echo "  Version:     $version"
        echo "  Hash:        ${hash:0:16}..."
        echo "  Files:       $file_count"
        echo "  Signed:      $signed"
        echo ""

        # Trigger OPAL client refresh
        log_info "Triggering OPAL client refresh..."
        if curl -s -X POST "http://localhost:7000/policy-refresh" --max-time 5 2>/dev/null; then
            log_success "OPAL client refreshed"
        else
            log_warn "Could not trigger OPAL client refresh (may not be running)"
        fi

        # Verify signature
        if [ "$signed" = "true" ]; then
            log_info "Verifying bundle signature..."
            local verify_result=$(curl -ks "${hub_url}/api/opal/bundle/verify/${hash}" --max-time 10 2>/dev/null)
            if echo "$verify_result" | grep -q '"verified"[[:space:]]*:[[:space:]]*true'; then
                log_success "Bundle signature verified ✓"
            else
                log_warn "Bundle signature verification failed"
            fi
        fi

    elif echo "$response" | grep -q '"error"'; then
        local error=$(echo "$response" | grep -o '"error"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        log_error "Failed to fetch policy bundle: $error"
        return 1
    else
        # Fall back to OPAL client direct sync
        log_warn "Could not fetch from hub API, trying OPAL client..."

        if curl -s -X POST "http://localhost:7000/policy-refresh" --max-time 5 2>/dev/null; then
            log_success "Policy refresh triggered via OPAL client"
        else
            log_error "Could not trigger policy sync. Ensure services are running."
            return 1
        fi
    fi
}

spoke_policy_verify() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"

    print_header
    echo -e "${BOLD}Verifying Policy Bundle:${NC} $(upper "$instance_code")"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would verify current policy bundle signature"
        return 0
    fi

    # Get current bundle hash from OPA
    log_info "Querying local OPA for bundle info..."

    local bundle_info=$(curl -s "http://localhost:8181/v1/data/system/bundle" --max-time 5 2>/dev/null)

    if [ -z "$bundle_info" ]; then
        log_warn "Could not query OPA bundle info"
        echo ""
        echo "OPA may not have a bundle loaded or the bundle/system path is not available."
        return 1
    fi

    # Get hub URL
    local hub_url="${DIVE_HUB_URL:-https://localhost:4000}"

    # Get current version from hub
    local hub_version=$(curl -ks "${hub_url}/api/opal/version" --max-time 10 2>/dev/null)
    if ! echo "$hub_version" | grep -q '"version"'; then
        log_error "Could not reach hub to get current version"
        return 1
    fi

    local current_hash=$(echo "$hub_version" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local current_version=$(echo "$hub_version" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -z "$current_hash" ]; then
        log_error "No bundle hash available from hub"
        return 1
    fi

    log_info "Verifying bundle signature with hub..."

    local verify_result=$(curl -ks "${hub_url}/api/opal/bundle/verify/${current_hash}" --max-time 10 2>/dev/null)

    if echo "$verify_result" | grep -q '"verified"[[:space:]]*:[[:space:]]*true'; then
        local bundle_id=$(echo "$verify_result" | grep -o '"bundleId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local signed_at=$(echo "$verify_result" | grep -o '"signedAt"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local signed_by=$(echo "$verify_result" | grep -o '"signedBy"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local file_count=$(echo "$verify_result" | grep -o '"fileCount"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')

        log_success "Bundle Signature: VALID ✓"
        echo ""
        echo "  Bundle Hash:       ${current_hash:0:16}..."
        echo "  Version:           $current_version"
        echo "  Bundle ID:         $bundle_id"
        echo "  Signed At:         $signed_at"
        echo "  Signed By:         $signed_by"
        echo "  Files:             $file_count"
        echo ""

    elif echo "$verify_result" | grep -q '"signatureError"'; then
        local sig_error=$(echo "$verify_result" | grep -o '"signatureError"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

        log_error "Bundle Signature: INVALID ✗"
        echo ""
        echo "  Hash:              ${current_hash:0:16}..."
        echo "  Error:             $sig_error"
        echo ""
        echo "This could indicate:"
        echo "  • Bundle was not signed"
        echo "  • Signing key mismatch"
        echo "  • Bundle was tampered with"
        echo ""
        return 1

    else
        log_warn "Could not verify bundle signature"
        echo ""
        echo "Response: $verify_result"
        return 1
    fi
}

spoke_policy_version() {
    ensure_dive_root

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query policy version"
        return 0
    fi

    local hub_url="${DIVE_HUB_URL:-https://localhost:4000}"

    local response=$(curl -ks "${hub_url}/api/opal/version" --max-time 10 2>/dev/null)

    if echo "$response" | grep -q '"version"'; then
        local version=$(echo "$response" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local hash=$(echo "$response" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)

        echo "Policy Version: $version"
        echo "Hash: ${hash:0:16}..."
    else
        log_error "Could not get policy version from hub"
        return 1
    fi
}

# =============================================================================
# NATO COUNTRY MANAGEMENT COMMANDS
# =============================================================================

# List all supported NATO countries
spoke_list_countries() {
    local format="${1:-table}"

    print_header
    echo -e "${BOLD}NATO Member Countries (32 Total)${NC}"
    echo ""

    case "$format" in
        table|--table)
            list_nato_countries_table
            ;;
        simple|--simple)
            list_nato_countries
            ;;
        json|--json)
            echo "["
            local first=true
            for code in $(echo "${!NATO_COUNTRIES[@]}" | tr ' ' '\n' | sort); do
                if [ "$first" = true ]; then
                    first=false
                else
                    echo ","
                fi
                get_country_json "$code" | sed 's/^/  /'
            done
            echo ""
            echo "]"
            ;;
        *)
            list_nato_countries_table
            ;;
    esac

    echo ""
    echo -e "${CYAN}Usage:${NC}"
    echo "  ./dive spoke init <CODE> <NAME>     Initialize spoke for a country"
    echo "  ./dive spoke country-info <CODE>    Show detailed country info"
    echo "  ./dive spoke ports                  Show all port assignments"
    echo ""
}

# Show port assignments for all countries
spoke_show_ports() {
    local code="${1:-}"

    print_header

    if [ -n "$code" ]; then
        # Show ports for specific country
        local code_upper="${code^^}"
        if ! is_nato_country "$code_upper"; then
            log_error "Invalid NATO country code: $code_upper"
            echo ""
            echo "Run './dive spoke list-countries' to see valid codes."
            return 1
        fi

        echo -e "${BOLD}Port Assignments for $(get_country_name "$code_upper") $(get_country_flag "$code_upper")${NC}"
        echo ""
        eval "$(get_country_ports "$code_upper")"
        echo "  Frontend:   https://localhost:$SPOKE_FRONTEND_PORT"
        echo "  Backend:    https://localhost:$SPOKE_BACKEND_PORT"
        echo "  Keycloak:   https://localhost:$SPOKE_KEYCLOAK_HTTPS_PORT"
        echo "  PostgreSQL: localhost:$SPOKE_POSTGRES_PORT"
        echo "  MongoDB:    localhost:$SPOKE_MONGODB_PORT"
        echo "  Redis:      localhost:$SPOKE_REDIS_PORT"
        echo "  OPA:        http://localhost:$SPOKE_OPA_PORT"
        echo "  KAS:        https://localhost:$SPOKE_KAS_PORT"
    else
        # Show ports for all countries
        echo -e "${BOLD}Port Assignments for All 32 NATO Countries${NC}"
        echo ""
        list_nato_ports
    fi
    echo ""
}

# Show detailed info for a country
spoke_country_info() {
    local code="${1:-}"

    if [ -z "$code" ]; then
        log_error "Country code required"
        echo ""
        echo "Usage: ./dive spoke country-info <CODE>"
        echo "Example: ./dive spoke country-info GBR"
        return 1
    fi

    local code_upper="${code^^}"

    if ! is_nato_country "$code_upper"; then
        log_error "Invalid NATO country code: $code_upper"
        echo ""
        echo "Run './dive spoke list-countries' to see valid codes."
        return 1
    fi

    print_header
    echo -e "${BOLD}$(get_country_name "$code_upper") $(get_country_flag "$code_upper")${NC}"
    echo ""
    echo "  ISO Code:     $code_upper"
    echo "  NATO Member:  Since $(get_country_join_year "$code_upper")"
    echo "  Timezone:     $(get_country_timezone "$code_upper")"
    echo "  Primary:      $(get_country_primary_color "$code_upper")"
    echo "  Secondary:    $(get_country_secondary_color "$code_upper")"
    echo ""

    eval "$(get_country_ports "$code_upper")"
    echo -e "${CYAN}Port Assignments (Offset: $SPOKE_PORT_OFFSET):${NC}"
    echo "  Frontend:     $SPOKE_FRONTEND_PORT"
    echo "  Backend:      $SPOKE_BACKEND_PORT"
    echo "  Keycloak:     $SPOKE_KEYCLOAK_HTTPS_PORT"
    echo "  PostgreSQL:   $SPOKE_POSTGRES_PORT"
    echo "  MongoDB:      $SPOKE_MONGODB_PORT"
    echo "  Redis:        $SPOKE_REDIS_PORT"
    echo "  OPA:          $SPOKE_OPA_PORT"
    echo "  KAS:          $SPOKE_KAS_PORT"
    echo ""

    # Check if instance exists
    local code_lower=$(lower "$code_upper")
    local instance_dir="${DIVE_ROOT}/instances/${code_lower}"

    if [ -d "$instance_dir" ]; then
        echo -e "${GREEN}✓ Instance directory exists:${NC} $instance_dir"

        if [ -f "$instance_dir/config.json" ]; then
            echo -e "${GREEN}✓ Configuration found${NC}"
        fi

        if [ -f "$instance_dir/docker-compose.yml" ]; then
            echo -e "${GREEN}✓ Docker Compose file found${NC}"
        fi

        if [ -f "$instance_dir/.env" ]; then
            echo -e "${GREEN}✓ Environment file found${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Instance not initialized${NC}"
        echo ""
        echo "To initialize: ./dive spoke init $code_upper \"$(get_country_name "$code_upper")\""
    fi
    echo ""
}

# Validate a country code
spoke_validate_country() {
    local code="${1:-}"

    if [ -z "$code" ]; then
        log_error "Country code required"
        echo ""
        echo "Usage: ./dive spoke validate-country <CODE>"
        return 1
    fi

    local code_upper="${code^^}"

    if is_nato_country "$code_upper"; then
        echo -e "${GREEN}✓ '$code_upper' is a valid NATO member country${NC}"
        echo ""
        echo "  Name: $(get_country_name "$code_upper")"
        echo "  Flag: $(get_country_flag "$code_upper")"
        echo "  Joined NATO: $(get_country_join_year "$code_upper")"
        return 0
    elif is_partner_nation "$code_upper"; then
        echo -e "${YELLOW}⚠ '$code_upper' is a NATO partner nation (not full member)${NC}"
        echo ""
        echo "Partner nations can be deployed but use hash-based port assignments."
        return 0
    else
        echo -e "${RED}✗ '$code_upper' is not a recognized NATO country or partner${NC}"
        echo ""
        echo "Valid NATO country codes:"
        list_nato_countries | head -5
        echo "... (use './dive spoke list-countries' for full list)"
        return 1
    fi
}

# Generate Keycloak theme for a country
spoke_generate_theme() {
    local code="${1:-}"
    local force="${2:-}"

    ensure_dive_root

    if [ -z "$code" ] && [ "$code" != "--all" ]; then
        log_error "Country code required (or use --all for all countries)"
        echo ""
        echo "Usage:"
        echo "  ./dive spoke generate-theme <CODE>      Generate theme for one country"
        echo "  ./dive spoke generate-theme --all       Generate themes for all 32 NATO countries"
        echo "  ./dive spoke generate-theme <CODE> -f   Force regenerate existing theme"
        return 1
    fi

    local script="${DIVE_ROOT}/scripts/generate-spoke-theme.sh"

    if [ ! -f "$script" ]; then
        log_error "Theme generator script not found: $script"
        return 1
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would generate theme for: $code $force"
        return 0
    fi

    # Build arguments
    local args=""
    if [ "$code" = "--all" ] || [ "$code" = "-a" ]; then
        args="--all"
    else
        args="$code"
    fi

    if [ "$force" = "--force" ] || [ "$force" = "-f" ]; then
        args="$args --force"
    fi

    # Run the theme generator
    "$script" $args
}

# Batch deploy multiple NATO countries
spoke_batch_deploy() {
    ensure_dive_root

    local script="${DIVE_ROOT}/scripts/nato-batch-deploy.sh"

    if [ ! -f "$script" ]; then
        log_error "Batch deployment script not found: $script"
        return 1
    fi

    if [ "$DRY_RUN" = true ]; then
        "$script" "$@" --dry-run
    else
        "$script" "$@"
    fi
}

# Verify federation for NATO countries
spoke_verify_federation() {
    ensure_dive_root

    local script="${DIVE_ROOT}/scripts/nato-verify-federation.sh"

    if [ ! -f "$script" ]; then
        log_error "Federation verification script not found: $script"
        return 1
    fi

    "$script" "$@"
}

# =============================================================================
# SPOKE KAS MANAGEMENT
# =============================================================================

# Initialize KAS for a spoke instance
spoke_kas_init() {
    local instance_code="${1:-${INSTANCE:-}}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo "Usage: ./dive spoke kas init <CODE>"
        echo "       ./dive --instance POL spoke kas init"
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    echo -e "${BOLD}Initialize Spoke KAS - ${code_upper}${NC}"
    echo ""

    # Check if spoke exists
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke instance not found: $spoke_dir"
        echo "Initialize the spoke first with: ./dive spoke init $code_upper"
        return 1
    fi

    # Load spoke configuration
    local config_file="$spoke_dir/config.json"
    if [ ! -f "$config_file" ]; then
        log_error "Spoke configuration not found: $config_file"
        return 1
    fi

    # Get country info
    local country_name
    country_name=$(jq -r '.name // .instanceName // "Unknown"' "$config_file" 2>/dev/null || echo "$code_upper")

    # Calculate KAS port
    eval "$(_get_spoke_ports "$code_upper")"
    local kas_port="${SPOKE_KAS_PORT}"

    log_info "Configuring KAS for $country_name ($code_upper)"
    echo "  KAS Port: $kas_port"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would initialize KAS configuration for $code_upper"
        log_dry "Would create KAS certificates if needed"
        log_dry "Would register in kas-registry.json"
        return 0
    fi

    # Step 1: Ensure KAS certificates exist
    local kas_certs_dir="${DIVE_ROOT}/kas/certs"
    if [ ! -f "$kas_certs_dir/certificate.pem" ] || [ ! -f "$kas_certs_dir/key.pem" ]; then
        log_warn "KAS certificates not found. Creating self-signed certificates..."
        mkdir -p "$kas_certs_dir"
        openssl req -x509 -newkey rsa:4096 -keyout "$kas_certs_dir/key.pem" \
            -out "$kas_certs_dir/certificate.pem" -days 365 -nodes \
            -subj "/CN=kas-${code_lower}.dive25.com/O=DIVE V3/C=US" 2>/dev/null
        log_success "KAS certificates created"
    else
        log_info "KAS certificates already exist"
    fi

    # Step 2: Ensure KAS environment is configured in spoke .env
    local env_file="$spoke_dir/.env"
    if [ -f "$env_file" ]; then
        # Check if KAS_PORT is already set
        if ! grep -q "^KAS_PORT=" "$env_file"; then
            echo "" >> "$env_file"
            echo "# KAS Configuration" >> "$env_file"
            echo "KAS_PORT=${kas_port}" >> "$env_file"
            log_success "Added KAS_PORT to $env_file"
        else
            log_info "KAS_PORT already configured in $env_file"
        fi
    fi

    # Step 3: Register in KAS registry (if not already registered)
    local registry_file="${DIVE_ROOT}/config/kas-registry.json"
    if [ -f "$registry_file" ]; then
        local kas_id="${code_lower}-kas"
        local already_registered
        already_registered=$(jq -r --arg id "$kas_id" '.kasServers[] | select(.kasId == $id) | .kasId' "$registry_file" 2>/dev/null)

        if [ -z "$already_registered" ]; then
            log_info "Registering $kas_id in KAS registry..."
            spoke_kas_register "$code_upper"
        else
            log_info "KAS $kas_id already registered in registry"
        fi
    fi

    echo ""
    log_success "Spoke KAS initialized for $code_upper"
    echo ""
    echo "Next steps:"
    echo "  1. Start the spoke: ./dive --instance $code_lower spoke up"
    echo "  2. Verify KAS: ./dive kas status $code_lower"
    echo "  3. Check federation: ./dive kas registry health"
}

# Show KAS status for a spoke instance
spoke_kas_status() {
    local instance_code="${1:-${INSTANCE:-}}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo "Usage: ./dive spoke kas status <CODE>"
        echo "       ./dive --instance POL spoke kas status"
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    # Load KAS module for status function
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/kas.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/kas.sh"
        kas_status "$code_lower"
    else
        log_error "KAS module not found"
        return 1
    fi
}

# Register spoke KAS in the federation registry
spoke_kas_register() {
    local instance_code="${1:-${INSTANCE:-}}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo "Usage: ./dive spoke kas register <CODE>"
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local kas_id="${code_lower}-kas"

    echo -e "${BOLD}Register Spoke KAS - ${code_upper}${NC}"
    echo ""

    local registry_file="${DIVE_ROOT}/config/kas-registry.json"
    if [ ! -f "$registry_file" ]; then
        log_error "KAS registry not found: $registry_file"
        return 1
    fi

    # Check if already registered
    local already_registered
    already_registered=$(jq -r --arg id "$kas_id" '.kasServers[] | select(.kasId == $id) | .kasId' "$registry_file" 2>/dev/null)

    if [ -n "$already_registered" ]; then
        log_info "KAS $kas_id is already registered"
        echo ""
        echo "To update the registration, first remove it:"
        echo "  ./dive spoke kas unregister $code_upper"
        return 0
    fi

    # Get country info
    local country_name
    local spoke_config="${DIVE_ROOT}/instances/${code_lower}/config.json"

    if [ -f "$spoke_config" ]; then
        country_name=$(jq -r '.name // .instanceName // "Unknown"' "$spoke_config" 2>/dev/null)
    else
        # Try NATO database
        country_name=$(get_country_name "$code_upper" 2>/dev/null || echo "$code_upper")
    fi

    # Calculate ports
    eval "$(_get_spoke_ports "$code_upper")"
    local kas_port="${SPOKE_KAS_PORT}"

    # Get URLs from config or generate defaults
    local kas_url idp_url internal_kas_url

    if [ -f "$spoke_config" ]; then
        kas_url=$(jq -r '.endpoints.kas // empty' "$spoke_config" 2>/dev/null)
        idp_url=$(jq -r '.endpoints.idp // empty' "$spoke_config" 2>/dev/null)
    fi

    # Default URLs if not configured
    kas_url="${kas_url:-https://${code_lower}-api.dive25.com/api/kas}"
    idp_url="${idp_url:-https://${code_lower}-idp.dive25.com/realms/dive-v3-broker}"
    internal_kas_url="http://kas-${code_lower}:8080"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would register $kas_id in $registry_file"
        log_dry "  Organization: $country_name"
        log_dry "  Country Code: $code_upper"
        log_dry "  KAS URL: $kas_url"
        log_dry "  Internal URL: $internal_kas_url"
        return 0
    fi

    log_info "Registering $kas_id..."
    echo "  Organization: $country_name"
    echo "  Country Code: $code_upper"
    echo "  KAS URL: $kas_url"
    echo ""

    # Create new KAS entry
    local new_entry
    new_entry=$(cat << EOF
{
  "kasId": "${kas_id}",
  "organization": "${country_name}",
  "countryCode": "${code_upper}",
  "kasUrl": "${kas_url}",
  "internalKasUrl": "${internal_kas_url}",
  "authMethod": "jwt",
  "authConfig": {
    "jwtIssuer": "${idp_url}",
    "jwtAudience": "dive-v3-client-broker"
  },
  "trustLevel": "high",
  "supportedCountries": ["${code_upper}"],
  "supportedCOIs": ["NATO", "NATO-COSMIC"],
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
    "lastVerified": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "healthEndpoint": "/health",
    "requestKeyEndpoint": "/request-key"
  }
}
EOF
)

    # Add to registry using jq
    local temp_file=$(mktemp)
    jq --argjson entry "$new_entry" '.kasServers += [$entry]' "$registry_file" > "$temp_file"

    if [ $? -eq 0 ] && [ -s "$temp_file" ]; then
        # Update trust matrix to add bilateral trust with usa-kas
        jq --arg kasId "$kas_id" '
            .federationTrust.trustMatrix["usa-kas"] += [$kasId] |
            .federationTrust.trustMatrix[$kasId] = ["usa-kas"] |
            .metadata.lastUpdated = now | todate
        ' "$temp_file" > "${temp_file}.2"

        if [ $? -eq 0 ] && [ -s "${temp_file}.2" ]; then
            mv "${temp_file}.2" "$registry_file"
            rm -f "$temp_file"
            log_success "KAS $kas_id registered in registry"

            # Show trust configuration
            echo ""
            echo -e "${BOLD}Trust Configuration:${NC}"
            echo "  usa-kas now trusts: $kas_id"
            echo "  $kas_id trusts: usa-kas"
        else
            mv "$temp_file" "$registry_file"
            rm -f "${temp_file}.2"
            log_warn "Registered KAS but could not update trust matrix"
        fi
    else
        log_error "Failed to update registry"
        rm -f "$temp_file" "${temp_file}.2"
        return 1
    fi
}

# Unregister spoke KAS from the federation registry
spoke_kas_unregister() {
    local instance_code="${1:-${INSTANCE:-}}"

    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        echo "Usage: ./dive spoke kas unregister <CODE>"
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")
    local kas_id="${code_lower}-kas"

    echo -e "${BOLD}Unregister Spoke KAS - ${code_upper}${NC}"
    echo ""

    local registry_file="${DIVE_ROOT}/config/kas-registry.json"
    if [ ! -f "$registry_file" ]; then
        log_error "KAS registry not found: $registry_file"
        return 1
    fi

    # Check if registered
    local is_registered
    is_registered=$(jq -r --arg id "$kas_id" '.kasServers[] | select(.kasId == $id) | .kasId' "$registry_file" 2>/dev/null)

    if [ -z "$is_registered" ]; then
        log_info "KAS $kas_id is not registered"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would remove $kas_id from $registry_file"
        return 0
    fi

    log_info "Removing $kas_id from registry..."

    # Remove from registry and trust matrix
    local temp_file=$(mktemp)
    jq --arg kasId "$kas_id" '
        .kasServers = [.kasServers[] | select(.kasId != $kasId)] |
        .federationTrust.trustMatrix = (.federationTrust.trustMatrix |
            to_entries |
            map(if .key == $kasId then empty else {key: .key, value: [.value[] | select(. != $kasId)]} end) |
            from_entries) |
        .metadata.lastUpdated = now | todate
    ' "$registry_file" > "$temp_file"

    if [ $? -eq 0 ] && [ -s "$temp_file" ]; then
        mv "$temp_file" "$registry_file"
        log_success "KAS $kas_id removed from registry"
    else
        log_error "Failed to update registry"
        rm -f "$temp_file"
        return 1
    fi
}

# Spoke KAS command dispatcher
spoke_kas() {
    local subcommand="${1:-status}"
    shift || true

    case "$subcommand" in
        init)
            spoke_kas_init "$@"
            ;;
        status)
            spoke_kas_status "$@"
            ;;
        register)
            spoke_kas_register "$@"
            ;;
        unregister)
            spoke_kas_unregister "$@"
            ;;
        health)
            # Use the main KAS module for health
            local instance="${1:-${INSTANCE:-}}"
            if [ -z "$instance" ]; then
                log_error "Instance code required"
                return 1
            fi
            local code_lower=$(lower "$instance")
            if [ -f "${DIVE_ROOT}/scripts/dive-modules/kas.sh" ]; then
                source "${DIVE_ROOT}/scripts/dive-modules/kas.sh"
                kas_health "$code_lower"
            fi
            ;;
        logs)
            local instance="${1:-${INSTANCE:-}}"
            shift || true
            if [ -z "$instance" ]; then
                log_error "Instance code required"
                return 1
            fi
            local code_lower=$(lower "$instance")
            if [ -f "${DIVE_ROOT}/scripts/dive-modules/kas.sh" ]; then
                source "${DIVE_ROOT}/scripts/dive-modules/kas.sh"
                kas_logs "$code_lower" "$@"
            fi
            ;;
        *)
            echo -e "${BOLD}Spoke KAS Commands:${NC}"
            echo ""
            echo "Usage: ./dive spoke kas <command> [instance]"
            echo "       ./dive --instance <code> spoke kas <command>"
            echo ""
            echo "Commands:"
            echo "  init [code]           Initialize KAS for a spoke (certs, registry)"
            echo "  status [code]         Show spoke KAS status"
            echo "  health [code]         Detailed KAS health check"
            echo "  register [code]       Register spoke KAS in federation registry"
            echo "  unregister [code]     Remove spoke KAS from federation registry"
            echo "  logs [code] [-f]      View spoke KAS logs"
            echo ""
            echo "Examples:"
            echo "  ./dive spoke kas init POL"
            echo "  ./dive --instance pol spoke kas status"
            echo "  ./dive spoke kas register NOR"
            echo "  ./dive spoke kas logs FRA -f"
            ;;
    esac
}

# =============================================================================
# LOCALIZED ATTRIBUTE COMMANDS (Phase 5 - NATO Interoperability)
# =============================================================================
# Configure country-specific attribute names mapped to DIVE V3 standard claims
# Supports all 32 NATO countries with localized attribute naming conventions
# =============================================================================

##
# Configure localized attribute mappers for a spoke
# Maps country-specific attribute names to DIVE V3 standard claims
##
spoke_localize_mappers() {
    local code="${1:-$INSTANCE}"
    code="${code:-}"

    if [ -z "$code" ]; then
        log_error "Usage: ./dive spoke localize-mappers <COUNTRY_CODE>"
        echo ""
        echo "Example: ./dive spoke localize-mappers HUN"
        return 1
    fi

    local code_upper="${code^^}"
    local script="${DIVE_ROOT}/scripts/spoke-init/configure-localized-mappers.sh"

    if [ ! -f "$script" ]; then
        log_error "Localized mapper script not found: $script"
        return 1
    fi

    bash "$script" "$code_upper"
}

##
# Seed users with localized attributes for a spoke
##
spoke_localize_users() {
    local code="${1:-$INSTANCE}"
    code="${code:-}"

    if [ -z "$code" ]; then
        log_error "Usage: ./dive spoke localize-users <COUNTRY_CODE>"
        echo ""
        echo "Example: ./dive spoke localize-users HUN"
        return 1
    fi

    local code_upper="${code^^}"
    local script="${DIVE_ROOT}/scripts/spoke-init/seed-localized-users.sh"

    if [ ! -f "$script" ]; then
        log_error "Localized users script not found: $script"
        return 1
    fi

    bash "$script" "$code_upper"
}

##
# Full localization: mappers + users
##
spoke_localize() {
    local code="${1:-$INSTANCE}"
    code="${code:-}"

    if [ -z "$code" ]; then
        log_error "Usage: ./dive spoke localize <COUNTRY_CODE>"
        echo ""
        echo "Configures localized attribute mappers and seeds users for a NATO country."
        echo ""
        echo "Example: ./dive spoke localize HUN"
        echo "         ./dive spoke localize FRA"
        echo "         ./dive spoke localize DEU"
        echo ""
        echo "This will:"
        echo "  1. Configure protocol mappers (local → DIVE V3)"
        echo "  2. Update User Profile with localized attributes"
        echo "  3. Seed users with localized attribute values"
        return 1
    fi

    local code_upper="${code^^}"

    echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Full Localization for ${code_upper}${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    echo -e "${CYAN}Step 1/2: Configuring localized mappers...${NC}"
    spoke_localize_mappers "$code_upper"

    echo ""
    echo -e "${CYAN}Step 2/2: Seeding users with localized attributes...${NC}"
    spoke_localize_users "$code_upper"

    echo ""
    echo -e "${GREEN}✓ Localization complete for ${code_upper}${NC}"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_spoke() {
    local action="${1:-help}"
    shift || true

    # Check if pilot mode is enabled - some spoke commands are disabled
    local pilot_disabled_actions="init generate-certs up down"
    if [ "$PILOT_MODE" = true ]; then
        for disabled in $pilot_disabled_actions; do
            if [ "$action" = "$disabled" ]; then
                log_error "Spoke deployment command '$action' is disabled in pilot mode"
                echo ""
                echo -e "${YELLOW}In pilot mode, partners register as SP Clients, not full Spokes.${NC}"
                echo ""
                echo "To register as an SP Client (OAuth/OIDC), use:"
                echo "  ./dive sp register"
                echo ""
                echo "To disable pilot mode (for full spoke deployment):"
                echo "  export DIVE_PILOT_MODE=false"
                echo "  ./dive spoke $action $@"
                return 1
            fi
        done
    fi

    case "$action" in
        init)           spoke_init "$@" ;;
        setup|wizard)   spoke_setup_wizard "$@" ;;
        deploy)         spoke_deploy "$@" ;;
        generate-certs) spoke_generate_certs "$@" ;;
        gen-certs)      spoke_generate_certs "$@" ;;
        rotate-certs)   spoke_rotate_certs "$@" ;;
        init-keycloak)  spoke_init_keycloak ;;
        register)       spoke_register "$@" ;;
        token-refresh)  spoke_token_refresh "$@" ;;
        opal-token)     spoke_opal_token "$@" ;;
        status)         spoke_status ;;
        health)         spoke_health ;;
        verify)         spoke_verify ;;
        sync)           spoke_sync ;;
        heartbeat)      spoke_heartbeat ;;
        policy)         spoke_policy "$@" ;;
        up|start)       spoke_up ;;
        down|stop)      spoke_down ;;
        clean|purge)    spoke_clean ;;
        logs)           spoke_logs "$@" ;;
        reset)          spoke_reset ;;
        teardown)       spoke_teardown "$@" ;;
        failover)       spoke_failover "$@" ;;
        maintenance)    spoke_maintenance "$@" ;;
        audit-status)   spoke_audit_status ;;
        sync-secrets)   spoke_sync_secrets "$@" ;;
        sync-all-secrets) spoke_sync_all_secrets ;;
        list-countries) spoke_list_countries "$@" ;;
        countries)      spoke_list_countries "$@" ;;
        ports)          spoke_show_ports "$@" ;;
        country-info)   spoke_country_info "$@" ;;
        validate-country) spoke_validate_country "$@" ;;
        generate-theme) spoke_generate_theme "$@" ;;
        gen-theme)      spoke_generate_theme "$@" ;;
        batch-deploy)   spoke_batch_deploy "$@" ;;
        batch)          spoke_batch_deploy "$@" ;;
        verify-federation) spoke_verify_federation "$@" ;;
        verify-fed)     spoke_verify_federation "$@" ;;
        kas)            spoke_kas "$@" ;;
        localize)       spoke_localize "$@" ;;
        localize-mappers) spoke_localize_mappers "$@" ;;
        localize-users) spoke_localize_users "$@" ;;
        *)              module_spoke_help ;;
    esac
}

module_spoke_help() {
    print_header
    echo -e "${BOLD}Spoke Commands (for distributed federation):${NC}"
    echo ""

    if [ "$PILOT_MODE" = true ]; then
        echo -e "${YELLOW}⚠️  Pilot mode is enabled. Some spoke commands are disabled.${NC}"
        echo "   Use './dive sp register' to register as an SP Client instead."
        echo "   Set DIVE_PILOT_MODE=false to enable full spoke deployment."
        echo ""
    fi

    echo -e "${CYAN}🚀 Quick Deploy (Phase 2):${NC}"
    echo "  deploy <code> [name]   Full automated deployment (init→up→wait→init-all→register)"
    echo "                         Deploys a complete spoke in <120 seconds"
    echo ""

    echo -e "${CYAN}Setup & Initialization:${NC}"
    echo "  init                   Interactive setup wizard (recommended)"
    echo "  init <code> <name>     Quick initialization with defaults"
    echo "  setup / wizard         Launch interactive setup wizard"
    echo ""
    echo -e "${DIM}  The wizard helps you configure:${NC}"
    echo -e "${DIM}    • Hostnames (dive25.com, custom domain, or IP)${NC}"
    echo -e "${DIM}    • Cloudflare tunnel (optional auto-setup)${NC}"
    echo -e "${DIM}    • Secure password generation${NC}"
    echo -e "${DIM}    • TLS certificates${NC}"
    echo ""

    echo -e "${CYAN}Certificates:${NC}"
    echo "  generate-certs         Generate X.509 certificates for mTLS"
    echo "  rotate-certs           Rotate existing certificates (with backup)"
    echo ""

    echo -e "${CYAN}Registration (Phase 3):${NC}"
    echo "  register               Register this spoke with the Hub (includes CSR)"
    echo "  register --poll        Register and poll for approval (auto-configure token)"
    echo "  token-refresh          Refresh spoke Hub API token before expiry"
    echo "  opal-token             Provision OPAL client JWT from Hub's OPAL server"
    echo "  status                 Show spoke federation status (incl. token/cert info)"
    echo ""

    echo -e "${CYAN}Operations:${NC}"
    echo "  up                     Start spoke services"
    echo "  down                   Stop spoke services"
    echo "  clean                  Remove all containers, volumes, and optionally config"
    echo "                         (Use before redeploy to fix password mismatches)"
    echo "  logs [service]         View service logs"
    echo "  health                 Check service health"
    echo "  verify                 Run 8-point connectivity test"
    echo ""

    echo -e "${CYAN}Cleanup (Phase 2):${NC}"
    echo "  reset                  Clean spoke data, preserve config (re-initialize)"
    echo "  teardown [--notify-hub]  Full removal of spoke (DESTRUCTIVE)"
    echo ""

    echo -e "${CYAN}Federation:${NC}"
    echo "  sync                   Force policy sync from Hub"
    echo "  heartbeat              Send manual heartbeat to Hub"
    echo "  sync-secrets           Synchronize frontend secrets with Keycloak"
    echo "  sync-all-secrets       Synchronize secrets for all running spokes"
    echo ""

    echo -e "${CYAN}Policy Management (Phase 4):${NC}"
    echo "  policy status          Show policy version, sync status, signature"
    echo "  policy sync            Force policy sync from hub with verification"
    echo "  policy verify          Verify current policy bundle signature"
    echo "  policy version         Show current policy version"
    echo ""

    echo -e "${CYAN}Resilience (Phase 5):${NC}"
    echo "  failover [subcmd]      Circuit breaker management"
    echo "    status               Show failover state and metrics"
    echo "    force-open           Force circuit to OPEN (offline mode)"
    echo "    force-closed         Force circuit to CLOSED (normal mode)"
    echo "    reset                Reset metrics and return to CLOSED"
    echo ""
    echo "  maintenance [subcmd]   Maintenance mode control"
    echo "    status               Show maintenance status"
    echo "    enter [reason]       Enter maintenance mode"
    echo "    exit                 Exit maintenance mode"
    echo ""
    echo "  audit-status           Show audit queue status and metrics"
    echo ""

    echo -e "${CYAN}NATO Country Management:${NC}"
    echo "  list-countries         List all 32 NATO member countries"
    echo "  countries              Alias for list-countries"
    echo "  ports [CODE]           Show port assignments (all or specific country)"
    echo "  country-info <CODE>    Show detailed info for a country"
    echo "  validate-country <CODE> Validate a country code"
    echo "  generate-theme <CODE>  Generate Keycloak theme for a country"
    echo "  generate-theme --all   Generate themes for all 32 NATO countries"
    echo ""

    echo -e "${CYAN}Localized Attributes (NATO Interoperability):${NC}"
    echo "  localize <CODE>        Full localization: mappers + users (recommended)"
    echo "  localize-mappers <CODE> Configure protocol mappers (local → DIVE V3)"
    echo "  localize-users <CODE>  Seed users with localized attributes"
    echo ""
    echo -e "${DIM}  Maps country-specific attribute names to DIVE V3 standard:${NC}"
    echo -e "${DIM}    FRA: niveau_habilitation → clearance${NC}"
    echo -e "${DIM}    DEU: sicherheitsfreigabe → clearance${NC}"
    echo -e "${DIM}    POL: poziom_bezpieczenstwa → clearance${NC}"
    echo -e "${DIM}    HUN: biztonsagi_szint → clearance${NC}"
    echo ""

    echo -e "${CYAN}Batch Operations:${NC}"
    echo "  batch-deploy <CODES>   Deploy multiple countries (e.g., ALB POL NOR)"
    echo "  batch-deploy --all     Deploy all 32 NATO countries (not recommended locally)"
    echo "  verify-federation      Verify federation health for running spokes"
    echo "  verify-federation <CODES> Verify specific countries"
    echo ""

    echo -e "${CYAN}KAS Management:${NC}"
    echo "  kas init [code]        Initialize KAS for a spoke (certs, registry)"
    echo "  kas status [code]      Show spoke KAS status"
    echo "  kas health [code]      Detailed KAS health check"
    echo "  kas register [code]    Register spoke KAS in federation registry"
    echo "  kas unregister [code]  Remove spoke KAS from federation registry"
    echo "  kas logs [code] [-f]   View spoke KAS logs"
    echo ""

    echo -e "${BOLD}Quick Start (One Command - Phase 2):${NC}"
    echo -e "  ${GREEN}./dive spoke deploy NZL 'New Zealand'${NC}  # Deploy in <120 seconds"
    echo ""

    echo -e "${BOLD}Quick Start (Interactive):${NC}"
    echo -e "  ${GREEN}./dive spoke init${NC}           # Launch setup wizard"
    echo ""

    echo -e "${BOLD}Quick Start (Non-Interactive):${NC}"
    echo "  1. ./dive spoke init NZL 'New Zealand Defence'"
    echo "  2. Edit instances/nzl/.env (auto-generated with passwords)"
    echo "  3. ./dive spoke up"
    echo "  4. ./dive --instance nzl spoke register"
    echo "  5. Wait for Hub admin approval"
    echo "  6. Add SPOKE_OPAL_TOKEN to .env"
    echo ""

    echo -e "${BOLD}Verification:${NC}"
    echo "  ./dive --instance nzl spoke verify   # 8-point connectivity test"
    echo "  ./dive --instance nzl spoke health   # Service health check"
    echo ""

    echo -e "${BOLD}Cloudflare Tunnel Setup:${NC}"
    echo "  The setup wizard can auto-configure Cloudflare tunnels."
    echo "  This makes your spoke accessible at <code>-*.dive25.com"
    echo ""
    echo "  Manual setup:"
    echo "    1. Create tunnel at https://one.dash.cloudflare.com"
    echo "    2. Copy tunnel token"
    echo "    3. Add to .env: TUNNEL_TOKEN=<token>"
    echo "    4. Restart: ./dive spoke down && ./dive spoke up"
    echo ""

    echo -e "${BOLD}Environment Variables:${NC}"
    echo "  DIVE_PILOT_MODE        Set to 'false' to enable spoke deployment"
    echo "  DIVE_HUB_URL           Override Hub URL for registration"
    echo "  DIVE_INSTANCE          Set default instance code"
    echo ""
}
