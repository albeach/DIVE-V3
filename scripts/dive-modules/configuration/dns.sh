#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - DNS Management Module (Cloudflare)
# =============================================================================
# Guided Cloudflare DNS setup, record management, and propagation verification.
#
# Commands:
#   setup               Guided Cloudflare DNS setup (token, zone, records)
#   status              Show DNS record status for all instances
#   records             List all DIVE DNS records in zone
#   add <CODE> [--ip]   Add DNS records for a spoke instance
#   remove <CODE>       Remove DNS records for a spoke instance
#
# Usage:
#   ./dive dns setup
#   ./dive dns status
#   ./dive dns add FRA --ip 1.2.3.4
#   ./dive --non-interactive dns setup
# =============================================================================

# Prevent multiple sourcing
if [ -n "${DNS_MODULE_LOADED:-}" ]; then
    return 0
fi
export DNS_MODULE_LOADED=1

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONSTANTS
# =============================================================================

_CF_API="https://api.cloudflare.com/client/v4"

# Services per instance (code-{svc}.domain pattern)
_DNS_SERVICES=(app api idp kas opal)

# =============================================================================
# CORE API HELPERS (reusable by spoke-caddy.sh)
# =============================================================================

##
# Resolve Cloudflare API token from multiple sources
# Priority: env → .env.hub → .env.cloudflare → Vault
# Returns: token on stdout, non-zero on failure
##
_dns_get_token() {
    # 1. Environment variable
    if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
        echo "$CLOUDFLARE_API_TOKEN"
        return 0
    fi

    # 2. .env.hub
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        local val
        val=$(grep "^CLOUDFLARE_API_TOKEN=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | head -1 | cut -d= -f2-)
        if [ -n "$val" ]; then
            echo "$val"
            return 0
        fi
    fi

    # 3. .env.cloudflare
    if [ -f "${DIVE_ROOT}/.env.cloudflare" ]; then
        local val
        val=$(grep "^CLOUDFLARE_API_TOKEN=" "${DIVE_ROOT}/.env.cloudflare" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'")
        if [ -n "$val" ]; then
            echo "$val"
            return 0
        fi
    fi

    # 4. Vault (if available)
    if type vault_get_secret &>/dev/null && vault_is_authenticated 2>/dev/null; then
        local val
        val=$(vault_get_secret "cloudflare" "api-token" "token" 2>/dev/null)
        if [ -n "$val" ]; then
            echo "$val"
            return 0
        fi
    fi

    return 1
}

##
# Validate a Cloudflare API token via the verify endpoint
# Arguments: $1 - token
# Returns: 0 on success, prints status info
##
_dns_validate_token() {
    local token="$1"

    local response
    response=$(curl -s --max-time 10 \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        "${_CF_API}/user/tokens/verify" 2>/dev/null)

    local success
    success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)

    if [ "$success" = "true" ]; then
        local status
        status=$(echo "$response" | jq -r '.result.status // "unknown"' 2>/dev/null)
        echo "$status"
        return 0
    else
        local error_msg
        error_msg=$(echo "$response" | jq -r '.errors[0].message // "Unknown error"' 2>/dev/null)
        echo "$error_msg"
        return 1
    fi
}

##
# List available Cloudflare zones for the authenticated token
# Arguments: $1 - token
# Outputs: "zone_id zone_name" per line
##
_dns_list_zones() {
    local token="$1"

    local response
    response=$(curl -s --max-time 15 \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        "${_CF_API}/zones?per_page=50&status=active" 2>/dev/null)

    local success
    success=$(echo "$response" | jq -r '.success // false' 2>/dev/null)

    if [ "$success" = "true" ]; then
        echo "$response" | jq -r '.result[] | "\(.id) \(.name)"' 2>/dev/null
        return 0
    fi
    return 1
}

##
# Get zone ID for a specific domain
# Arguments: $1 - token, $2 - domain name
# Returns: zone_id on stdout
##
_dns_get_zone_id() {
    local token="$1" domain="$2"

    local response
    response=$(curl -s --max-time 10 \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        "${_CF_API}/zones?name=${domain}" 2>/dev/null)

    echo "$response" | jq -r '.result[0].id // empty' 2>/dev/null
}

##
# List DNS records in a zone (optionally filtered)
# Arguments: $1 - token, $2 - zone_id, $3 - name filter (optional)
# Outputs: "record_id fqdn content ttl" per line
##
_dns_list_records() {
    local token="$1" zone_id="$2" filter="${3:-}"

    local url="${_CF_API}/zones/${zone_id}/dns_records?type=A&per_page=100"
    if [ -n "$filter" ]; then
        url="${url}&name=${filter}"
    fi

    local response
    response=$(curl -s --max-time 15 \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        "$url" 2>/dev/null)

    echo "$response" | jq -r '.result[] | "\(.id) \(.name) \(.content) \(.ttl)"' 2>/dev/null
}

##
# Create or update a DNS A record (idempotent upsert)
# Arguments: $1 - token, $2 - zone_id, $3 - fqdn, $4 - ip
# Returns: 0 on success
##
_dns_create_or_update() {
    local token="$1" zone_id="$2" fqdn="$3" ip="$4"
    local ttl="${5:-300}"
    local proxied="${6:-false}"

    # Check if record exists
    local existing
    existing=$(curl -s --max-time 10 \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        "${_CF_API}/zones/${zone_id}/dns_records?name=${fqdn}&type=A" 2>/dev/null)

    local record_id
    record_id=$(echo "$existing" | jq -r '.result[0].id // empty' 2>/dev/null)

    local data="{\"type\":\"A\",\"name\":\"${fqdn}\",\"content\":\"${ip}\",\"ttl\":${ttl},\"proxied\":${proxied}}"

    if [ -n "$record_id" ]; then
        # Update existing
        local result
        result=$(curl -s --max-time 10 -X PUT \
            -H "Authorization: Bearer ${token}" \
            -H "Content-Type: application/json" \
            "${_CF_API}/zones/${zone_id}/dns_records/${record_id}" \
            -d "$data" 2>/dev/null)
        local ok
        ok=$(echo "$result" | jq -r '.success // false' 2>/dev/null)
        [ "$ok" = "true" ]
    else
        # Create new
        local result
        result=$(curl -s --max-time 10 -X POST \
            -H "Authorization: Bearer ${token}" \
            -H "Content-Type: application/json" \
            "${_CF_API}/zones/${zone_id}/dns_records" \
            -d "$data" 2>/dev/null)
        local ok
        ok=$(echo "$result" | jq -r '.success // false' 2>/dev/null)
        [ "$ok" = "true" ]
    fi
}

##
# Delete a DNS record
# Arguments: $1 - token, $2 - zone_id, $3 - record_id
##
_dns_delete_record() {
    local token="$1" zone_id="$2" record_id="$3"

    curl -s --max-time 10 -X DELETE \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        "${_CF_API}/zones/${zone_id}/dns_records/${record_id}" \
        >/dev/null 2>&1
}

##
# Verify DNS propagation for a hostname
# Arguments: $1 - fqdn, $2 - expected_ip, $3 - timeout (default 60)
# Returns: 0 if resolved to expected IP
##
_dns_verify_propagation() {
    local fqdn="$1" expected_ip="$2" timeout="${3:-60}"

    local elapsed=0
    local interval=5

    while [ $elapsed -lt "$timeout" ]; do
        local resolved=""

        # Try dig first, fall back to nslookup
        if command -v dig &>/dev/null; then
            resolved=$(dig +short "$fqdn" A 2>/dev/null | head -1)
        elif command -v nslookup &>/dev/null; then
            resolved=$(nslookup "$fqdn" 2>/dev/null | grep "Address:" | tail -1 | awk '{print $2}')
        fi

        if [ "$resolved" = "$expected_ip" ]; then
            return 0
        fi

        sleep $interval
        elapsed=$((elapsed + interval))
    done

    return 1
}

##
# Get subdomain list for an instance
# Arguments: $1 - code_lower, $2 - domain
# Outputs: space-separated FQDNs
##
_dns_instance_subdomains() {
    local code_lower="$1" domain="$2"
    local result=""

    for svc in "${_DNS_SERVICES[@]}"; do
        result="${result} ${code_lower}-${svc}.${domain}"
    done

    echo "$result" | xargs
}

##
# Store token securely (Vault first, then dive-local.env)
##
_dns_store_token() {
    local token="$1"

    # Try Vault first
    if type vault_set_secret &>/dev/null && vault_is_authenticated 2>/dev/null; then
        if vault_set_secret "cloudflare" "api-token" "{\"token\":\"${token}\"}"; then
            log_success "Token stored in Vault: dive-v3/cloudflare/api-token"
            return 0
        fi
    fi

    # Fallback: dive-local.env
    local config_file="${DIVE_ROOT}/config/dive-local.env"
    if [ -f "$config_file" ]; then
        if grep -q "^CLOUDFLARE_API_TOKEN=" "$config_file" 2>/dev/null; then
            sed -i.bak "s|^CLOUDFLARE_API_TOKEN=.*|CLOUDFLARE_API_TOKEN=${token}|" "$config_file"
            rm -f "${config_file}.bak"
        else
            echo "CLOUDFLARE_API_TOKEN=${token}" >> "$config_file"
        fi
    else
        {
            echo "# DIVE V3 — Local Configuration Overrides"
            echo "# Generated by: ./dive dns setup"
            echo "CLOUDFLARE_API_TOKEN=${token}"
        } > "$config_file"
    fi
    log_success "Token saved to config/dive-local.env"
}

##
# Store zone ID in config
##
_dns_store_zone_id() {
    local zone_id="$1"

    local config_file="${DIVE_ROOT}/config/dive-local.env"
    if [ -f "$config_file" ]; then
        if grep -q "^CLOUDFLARE_ZONE_ID=" "$config_file" 2>/dev/null; then
            sed -i.bak "s|^CLOUDFLARE_ZONE_ID=.*|CLOUDFLARE_ZONE_ID=${zone_id}|" "$config_file"
            rm -f "${config_file}.bak"
        else
            echo "CLOUDFLARE_ZONE_ID=${zone_id}" >> "$config_file"
        fi
    else
        {
            echo "# DIVE V3 — Local Configuration Overrides"
            echo "# Generated by: ./dive dns setup"
            echo "CLOUDFLARE_ZONE_ID=${zone_id}"
        } > "$config_file"
    fi
}

# =============================================================================
# SUBCOMMAND HANDLERS
# =============================================================================

##
# Guided Cloudflare DNS setup wizard (4 steps)
##
dns_setup() {
    echo ""
    echo -e "${BOLD}${CYAN}DIVE V3 — DNS Setup (Cloudflare)${NC}"
    echo ""

    # ── Step 1: Token ────────────────────────────────────────────────────
    echo -e "${CYAN}Step 1: Cloudflare Authentication${NC}"
    echo ""

    local token
    token=$(_dns_get_token 2>/dev/null) || token=""

    if [ -n "$token" ]; then
        log_info "Found existing CLOUDFLARE_API_TOKEN"
        local status
        if status=$(_dns_validate_token "$token"); then
            log_success "Token valid (status: ${status})"
        else
            log_warn "Existing token is invalid: ${status}"
            token=""
        fi
    fi

    if [ -z "$token" ]; then
        if is_interactive; then
            echo "  Create a scoped API token at:"
            echo "  ${BOLD}https://dash.cloudflare.com/profile/api-tokens${NC}"
            echo ""
            echo "  Required permissions:"
            echo "    Zone > DNS > Edit"
            echo "    Zone > Zone > Read"
            echo ""
            read -r -s -p "  Paste your API token: " token
            echo ""
            echo ""
        else
            log_error "No CLOUDFLARE_API_TOKEN found. Set it in environment for non-interactive mode."
            return 1
        fi

        if [ -z "$token" ]; then
            log_error "No token provided"
            return 1
        fi

        log_info "Validating token..."
        local status
        if status=$(_dns_validate_token "$token"); then
            log_success "Token valid (status: ${status})"
        else
            log_error "Token validation failed: ${status}"
            return 1
        fi
    fi

    export CLOUDFLARE_API_TOKEN="$token"
    echo ""

    # ── Step 2: Zone Selection ───────────────────────────────────────────
    echo -e "${CYAN}Step 2: Select Domain${NC}"
    echo ""

    local zone_id="${CLOUDFLARE_ZONE_ID:-}"
    local zone_name=""

    # If zone ID already configured, validate it
    if [ -n "$zone_id" ]; then
        zone_name=$(_dns_list_zones "$token" | grep "^${zone_id} " | awk '{print $2}')
        if [ -n "$zone_name" ]; then
            log_info "Using configured zone: ${zone_name} (${zone_id})"
        else
            log_warn "Configured zone ID not found, selecting new zone..."
            zone_id=""
        fi
    fi

    if [ -z "$zone_id" ]; then
        local zones
        zones=$(_dns_list_zones "$token")

        if [ -z "$zones" ]; then
            log_error "No zones found. Ensure your API token has Zone:Read permission."
            return 1
        fi

        local zone_count
        zone_count=$(echo "$zones" | wc -l | tr -d ' ')

        if [ "$zone_count" -eq 1 ]; then
            zone_id=$(echo "$zones" | awk '{print $1}')
            zone_name=$(echo "$zones" | awk '{print $2}')
            log_info "Auto-selected zone: ${zone_name}"
        elif is_interactive; then
            echo "  Available zones:"
            local i=1
            while IFS=' ' read -r _zid zname; do
                echo "    ${i}) ${zname}"
                i=$((i + 1))
            done <<< "$zones"
            echo ""

            local choice
            read -r -p "  Select zone [1]: " choice
            choice="${choice:-1}"

            zone_id=$(echo "$zones" | sed -n "${choice}p" | awk '{print $1}')
            zone_name=$(echo "$zones" | sed -n "${choice}p" | awk '{print $2}')

            if [ -z "$zone_id" ]; then
                log_error "Invalid selection"
                return 1
            fi
        else
            # Non-interactive: use first zone
            zone_id=$(echo "$zones" | head -1 | awk '{print $1}')
            zone_name=$(echo "$zones" | head -1 | awk '{print $2}')
            log_info "Auto-selected first zone: ${zone_name}"
        fi
    fi

    log_success "Zone: ${zone_name} (${zone_id})"
    export CLOUDFLARE_ZONE_ID="$zone_id"
    echo ""

    # ── Step 3: DNS Records ──────────────────────────────────────────────
    echo -e "${CYAN}Step 3: Configure DNS Records${NC}"
    echo ""

    # Determine public IP
    local public_ip="${DIVE_PUBLIC_IP:-}"
    if [ -z "$public_ip" ]; then
        # Try EC2 metadata
        local imds_token
        imds_token=$(curl -s --max-time 2 -X PUT "http://169.254.169.254/latest/api/token" \
            -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || echo "")
        if [ -n "$imds_token" ]; then
            public_ip=$(curl -s --max-time 2 -H "X-aws-ec2-metadata-token: ${imds_token}" \
                "http://169.254.169.254/latest/meta-data/public-ipv4" 2>/dev/null || echo "")
        fi
    fi
    if [ -z "$public_ip" ]; then
        # Try external IP detection
        public_ip=$(curl -s --max-time 5 "https://ifconfig.me" 2>/dev/null || echo "")
    fi

    if [ -z "$public_ip" ]; then
        if is_interactive; then
            read -r -p "  Enter your server's public IP: " public_ip
        fi
        if [ -z "$public_ip" ]; then
            log_error "Cannot determine public IP. Set DIVE_PUBLIC_IP or provide it interactively."
            return 1
        fi
    fi

    log_info "Public IP: ${public_ip}"

    # Determine which instances to configure
    local instance_code="${INSTANCE:-usa}"
    local code_lower
    code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')

    local subdomains
    subdomains=$(_dns_instance_subdomains "$code_lower" "$zone_name")

    echo ""
    echo "  Records to create/update:"
    for fqdn in $subdomains; do
        printf "    %-35s  →  %s\n" "$fqdn" "$public_ip"
    done
    echo ""

    if is_interactive; then
        local confirm
        read -r -p "  Proceed? [Y/n]: " confirm
        if [[ "$confirm" =~ ^[Nn] ]]; then
            log_info "Cancelled"
            return 0
        fi
    fi

    echo ""
    local failed=0
    for fqdn in $subdomains; do
        printf "  Creating %-35s " "${fqdn}..."
        if _dns_create_or_update "$token" "$zone_id" "$fqdn" "$public_ip"; then
            echo -e "${GREEN}done${NC}"
        else
            echo -e "${RED}FAILED${NC}"
            failed=$((failed + 1))
        fi
    done
    echo ""

    if [ $failed -gt 0 ]; then
        log_warn "${failed} record(s) failed. Check token permissions (Zone > DNS > Edit)."
    fi

    # ── Step 4: Verification ─────────────────────────────────────────────
    echo -e "${CYAN}Step 4: Verification${NC}"
    echo ""
    echo "  Checking DNS propagation (timeout: 60s)..."
    echo ""

    local verified=0
    local total=0
    for fqdn in $subdomains; do
        total=$((total + 1))
        printf "    %-35s " "$fqdn"
        if _dns_verify_propagation "$fqdn" "$public_ip" 60; then
            echo -e "${GREEN}resolved${NC}"
            verified=$((verified + 1))
        else
            echo -e "${YELLOW}pending${NC}"
        fi
    done

    echo ""
    if [ $verified -eq $total ]; then
        log_success "All ${total} DNS records verified!"
    else
        log_info "${verified}/${total} records resolved. Remaining may take a few minutes to propagate."
    fi

    # Store credentials
    echo ""
    _dns_store_token "$token"
    _dns_store_zone_id "$zone_id"

    echo ""
    log_success "DNS setup complete!"
    return 0
}

##
# Show DNS status for all DIVE instances
##
dns_status() {
    local token
    token=$(_dns_get_token 2>/dev/null) || {
        log_error "No Cloudflare API token found. Run: ./dive dns setup"
        return 1
    }

    local zone_id="${CLOUDFLARE_ZONE_ID:-}"
    local zone_name=""

    if [ -z "$zone_id" ]; then
        log_error "No CLOUDFLARE_ZONE_ID configured. Run: ./dive dns setup"
        return 1
    fi

    zone_name=$(_dns_list_zones "$token" | grep "^${zone_id} " | awk '{print $2}')

    echo ""
    echo -e "${BOLD}${CYAN}DIVE V3 — DNS Status${NC}"
    echo ""
    echo -e "  Domain:  ${BOLD}${zone_name:-unknown}${NC}"
    echo -e "  Zone ID: ${zone_id}"
    echo ""

    # Fetch all A records in zone
    local records
    records=$(_dns_list_records "$token" "$zone_id")

    if [ -z "$records" ]; then
        log_info "No A records found in zone"
        return 0
    fi

    # Group by instance prefix
    local current_prefix=""
    echo "$records" | sort -k2 | while IFS=' ' read -r _rid fqdn content ttl; do
        # Only show DIVE-related records (matching {code}-{svc}.{domain} pattern)
        local prefix
        prefix=$(echo "$fqdn" | sed "s/\.\(.*\)$//" | sed 's/-[^-]*$//')

        if [ "$prefix" != "$current_prefix" ]; then
            current_prefix="$prefix"
            echo -e "  ${BOLD}${prefix}${NC}:"
        fi

        # Live DNS check
        local resolved=""
        if command -v dig &>/dev/null; then
            resolved=$(dig +short "$fqdn" A 2>/dev/null | head -1)
        fi

        if [ "$resolved" = "$content" ]; then
            printf "    ${GREEN}%-40s${NC} → %s\n" "$fqdn" "$content"
        elif [ -n "$resolved" ]; then
            printf "    ${YELLOW}%-40s${NC} → %s (DNS: %s)\n" "$fqdn" "$content" "$resolved"
        else
            printf "    ${RED}%-40s${NC} → %s (not resolving)\n" "$fqdn" "$content"
        fi
    done

    echo ""
}

##
# List all DIVE DNS records in zone
##
dns_records() {
    local token
    token=$(_dns_get_token 2>/dev/null) || {
        log_error "No Cloudflare API token found. Run: ./dive dns setup"
        return 1
    }

    local zone_id="${CLOUDFLARE_ZONE_ID:-}"
    if [ -z "$zone_id" ]; then
        log_error "No CLOUDFLARE_ZONE_ID configured. Run: ./dive dns setup"
        return 1
    fi

    echo ""
    echo -e "${BOLD}${CYAN}DIVE V3 — DNS Records${NC}"
    echo ""

    local records
    records=$(_dns_list_records "$token" "$zone_id")

    if [ -z "$records" ]; then
        log_info "No A records found in zone"
        return 0
    fi

    printf "  ${BOLD}%-42s %-16s %s${NC}\n" "FQDN" "IP" "TTL"
    echo "  $(printf '─%.0s' {1..70})"

    echo "$records" | sort -k2 | while IFS=' ' read -r _rid fqdn content ttl; do
        printf "  %-42s %-16s %s\n" "$fqdn" "$content" "${ttl}s"
    done

    echo ""
}

##
# Add DNS records for a specific spoke instance
# Arguments: CODE [--ip IP]
##
dns_add() {
    local code=""
    local ip=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --ip) ip="$2"; shift 2 ;;
            *)    code="$1"; shift ;;
        esac
    done

    if [ -z "$code" ]; then
        log_error "Usage: ./dive dns add <CODE> [--ip <IP>]"
        return 1
    fi

    local token
    token=$(_dns_get_token 2>/dev/null) || {
        log_error "No Cloudflare API token found. Run: ./dive dns setup"
        return 1
    }

    local zone_id="${CLOUDFLARE_ZONE_ID:-}"
    if [ -z "$zone_id" ]; then
        log_error "No CLOUDFLARE_ZONE_ID configured. Run: ./dive dns setup"
        return 1
    fi

    local zone_name
    zone_name=$(_dns_list_zones "$token" | grep "^${zone_id} " | awk '{print $2}')

    if [ -z "$ip" ]; then
        if is_interactive; then
            read -r -p "  Enter IP address for ${code}: " ip
        fi
        if [ -z "$ip" ]; then
            log_error "IP address required. Use: ./dive dns add ${code} --ip <IP>"
            return 1
        fi
    fi

    local code_lower
    code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')
    local subdomains
    subdomains=$(_dns_instance_subdomains "$code_lower" "$zone_name")

    echo ""
    log_info "Adding DNS records for ${code} → ${ip}"
    echo ""

    for fqdn in $subdomains; do
        printf "  Creating %-35s " "${fqdn}..."
        if _dns_create_or_update "$token" "$zone_id" "$fqdn" "$ip"; then
            echo -e "${GREEN}done${NC}"
        else
            echo -e "${RED}FAILED${NC}"
        fi
    done

    echo ""
    log_success "DNS records added for ${code}"
}

##
# Remove DNS records for a specific instance
# Arguments: CODE
##
dns_remove() {
    local code="$1"

    if [ -z "$code" ]; then
        log_error "Usage: ./dive dns remove <CODE>"
        return 1
    fi

    local token
    token=$(_dns_get_token 2>/dev/null) || {
        log_error "No Cloudflare API token found. Run: ./dive dns setup"
        return 1
    }

    local zone_id="${CLOUDFLARE_ZONE_ID:-}"
    if [ -z "$zone_id" ]; then
        log_error "No CLOUDFLARE_ZONE_ID configured. Run: ./dive dns setup"
        return 1
    fi

    local zone_name
    zone_name=$(_dns_list_zones "$token" | grep "^${zone_id} " | awk '{print $2}')

    local code_lower
    code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')
    local subdomains
    subdomains=$(_dns_instance_subdomains "$code_lower" "$zone_name")

    echo ""
    log_warn "This will delete DNS records for ${code}:"
    for fqdn in $subdomains; do
        echo "    ${fqdn}"
    done
    echo ""

    if is_interactive; then
        local confirm
        read -r -p "  Type 'yes' to confirm: " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Cancelled"
            return 0
        fi
    fi

    echo ""
    for fqdn in $subdomains; do
        # Find record ID
        local record_id
        record_id=$(_dns_list_records "$token" "$zone_id" "$fqdn" | awk '{print $1}' | head -1)

        if [ -n "$record_id" ]; then
            printf "  Deleting %-35s " "${fqdn}..."
            _dns_delete_record "$token" "$zone_id" "$record_id"
            echo -e "${GREEN}done${NC}"
        else
            printf "  %-35s " "${fqdn}"
            echo -e "${YELLOW}not found${NC}"
        fi
    done

    echo ""
    log_success "DNS records removed for ${code}"
}

# =============================================================================
# HELP
# =============================================================================

module_dns_help() {
    cat << EOF

${BOLD}DIVE V3 — DNS Management (Cloudflare)${NC}

${BOLD}USAGE:${NC}
  ./dive dns <command> [args...]

${BOLD}COMMANDS:${NC}
  setup               Guided Cloudflare DNS setup (token, zone, records)
  status              Show DNS record status for all instances
  records             List all DIVE DNS records in zone
  add <CODE> [--ip]   Add DNS records for a spoke instance
  remove <CODE>       Remove DNS records for a spoke instance

${BOLD}EXAMPLES:${NC}
  ./dive dns setup                    # Interactive setup wizard
  ./dive dns status                   # Check all DNS records
  ./dive dns add FRA --ip 1.2.3.4    # Add records for France spoke
  ./dive dns remove DEU               # Remove records for Germany spoke

${BOLD}NON-INTERACTIVE:${NC}
  CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ZONE_ID=yyy ./dive --non-interactive dns setup

${BOLD}ENVIRONMENT:${NC}
  CLOUDFLARE_API_TOKEN   Cloudflare API token (Zone:Read + DNS:Edit)
  CLOUDFLARE_ZONE_ID     Cloudflare zone ID for your domain
  DIVE_PUBLIC_IP         Override auto-detected public IP

EOF
}

# =============================================================================
# ENTRY POINT
# =============================================================================

module_dns() {
    local command="${1:-help}"
    shift || true

    case "$command" in
        setup|init)
            dns_setup "$@"
            ;;
        status)
            dns_status "$@"
            ;;
        records|list)
            dns_records "$@"
            ;;
        add|create)
            dns_add "$@"
            ;;
        remove|delete)
            dns_remove "$@"
            ;;
        help|--help|-h)
            module_dns_help
            ;;
        *)
            log_error "Unknown DNS command: ${command}"
            module_dns_help
            return 1
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f module_dns
export -f dns_setup
export -f dns_status
export -f dns_records
export -f dns_add
export -f dns_remove
export -f _dns_get_token
export -f _dns_validate_token
export -f _dns_list_zones
export -f _dns_get_zone_id
export -f _dns_list_records
export -f _dns_create_or_update
export -f _dns_delete_record
export -f _dns_verify_propagation
export -f _dns_instance_subdomains

log_verbose "DNS management module loaded"
