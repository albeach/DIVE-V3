#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Spoke Cloudflare Tunnel Module
# =============================================================================
# Extracted from spoke.sh during refactoring for modularity
# Optional module for Cloudflare tunnel auto-setup
# Only loaded when tunnel features are requested
# =============================================================================
# Version: 1.0.0
# Date: 2025-12-23
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

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

    local creds_file="${creds_dir}/${tunnel_id}.json"

    if [ -f "$creds_file" ]; then
        local tunnel_token=$(cloudflared tunnel token "$tunnel_name" 2>/dev/null | tail -1)

        if [ -n "$tunnel_token" ] && [ ${#tunnel_token} -gt 50 ]; then
            echo "$tunnel_token" > "/tmp/dive-tunnel-${code_lower}.token"
            echo -e "  ${GREEN}✓ Tunnel token generated${NC}"
        else
            echo -e "  ${YELLOW}Using credentials file approach...${NC}"

            local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
            mkdir -p "$spoke_dir/cloudflared"
            cp "$creds_file" "$spoke_dir/cloudflared/credentials.json"

            echo ""
            echo -e "  ${YELLOW}Note: This tunnel uses a credentials file instead of a token.${NC}"
            echo "  The credentials file has been copied to your spoke directory."
            echo ""

            echo "" > "/tmp/dive-tunnel-${code_lower}.token"
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

# Mark module as loaded
export DIVE_SPOKE_CLOUDFLARE_LOADED=1

