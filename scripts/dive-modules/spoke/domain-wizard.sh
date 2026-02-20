#!/usr/bin/env bash
# =============================================================================
# DIVE V3 — Interactive Domain Setup Wizard
# =============================================================================
# Guides operators through custom domain configuration for spoke deployments.
# Validates DNS, TLS, and hub connectivity before deployment begins.
#
# Functions:
#   spoke_domain_wizard(CODE)         - Interactive guided setup
#   spoke_domain_validate(DOMAIN)     - Validate domain format
#   spoke_domain_check_dns(DOMAIN)    - Check DNS resolution for subdomains
#   spoke_domain_check_hub(URL)       - Check hub OIDC connectivity
# =============================================================================

[ -n "${SPOKE_DOMAIN_WIZARD_LOADED:-}" ] && return 0
export SPOKE_DOMAIN_WIZARD_LOADED=1

##
# Validate domain format (basic regex check)
#
# Arguments:
#   $1 - Domain string
#
# Returns:
#   0 if valid, 1 if invalid
##
spoke_domain_validate() {
    local domain="$1"

    # Reject empty
    [ -z "$domain" ] && return 1

    # Reject protocols
    [[ "$domain" == http://* ]] && return 1
    [[ "$domain" == https://* ]] && return 1

    # Reject IP addresses (we want real domains)
    if echo "$domain" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
        return 1
    fi

    # Must have at least one dot and contain only valid chars
    if echo "$domain" | grep -qE '^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$'; then
        return 0
    fi

    return 1
}

##
# Check DNS resolution for spoke subdomains
#
# Arguments:
#   $1 - Base domain (e.g., gbr.mod.uk)
#
# Returns:
#   0 if all resolve, 1 if any fail. Prints status per subdomain.
##
spoke_domain_check_dns() {
    local domain="$1"
    local subdomains=("app" "api" "idp")
    local all_ok=true

    for sub in "${subdomains[@]}"; do
        local fqdn="${sub}.${domain}"
        local resolved=""

        # Try dig first, fall back to nslookup, then host
        if command -v dig &>/dev/null; then
            resolved=$(dig +short "$fqdn" A 2>/dev/null | head -1)
        elif command -v nslookup &>/dev/null; then
            resolved=$(nslookup "$fqdn" 2>/dev/null | grep -A1 "Name:" | grep "Address:" | awk '{print $2}' | head -1)
        elif command -v host &>/dev/null; then
            resolved=$(host "$fqdn" 2>/dev/null | grep "has address" | awk '{print $NF}' | head -1)
        fi

        if [ -n "$resolved" ]; then
            echo "    ${fqdn} → ${resolved}"
        else
            echo "    ${fqdn} → NOT RESOLVED"
            all_ok=false
        fi
    done

    $all_ok && return 0 || return 1
}

##
# Check hub OIDC connectivity
#
# Arguments:
#   $1 - Hub IdP URL (e.g., https://dev-usa-idp.dive25.com)
#
# Returns:
#   0 if reachable, 1 if not
##
spoke_domain_check_hub() {
    local hub_url="$1"
    local hub_realm="${HUB_REALM:-dive-v3-broker-usa}"
    local discovery_url="${hub_url}/realms/${hub_realm}/.well-known/openid-configuration"

    local response
    response=$(curl -sf --max-time 10 --insecure "$discovery_url" 2>/dev/null)

    if [ -z "$response" ]; then
        return 1
    fi

    # Validate it's a real OIDC discovery doc
    if echo "$response" | jq -e '.issuer' >/dev/null 2>&1; then
        return 0
    fi

    return 1
}

##
# Interactive domain setup wizard
#
# Guides the operator through domain configuration with validation.
# Writes validated config to instances/{code}/.domain.conf
#
# Arguments:
#   $1 - Spoke instance code (e.g., GBR)
##
spoke_domain_wizard() {
    local code="$1"
    local code_upper code_lower
    code_upper=$(echo "$code" | tr '[:lower:]' '[:upper:]')
    code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')

    echo ""
    echo "============================================"
    echo "  DIVE Custom Domain Setup — ${code_upper}"
    echo "============================================"
    echo ""

    # Step 1: Domain input
    echo "Step 1: Base Domain"
    echo "  Enter the base domain for this spoke."
    echo "  Example: gbr.mod.uk, fra.defense.gouv.fr"
    echo ""
    echo -n "  Domain: "

    local domain=""
    read -r domain

    if [ -z "$domain" ]; then
        log_warn "No domain entered — aborting wizard"
        return 1
    fi

    # Strip protocol if accidentally included
    domain="${domain#https://}"
    domain="${domain#http://}"
    domain="${domain%%/*}"

    if ! spoke_domain_validate "$domain"; then
        log_error "Invalid domain format: $domain"
        log_info "Expected format: example.com, sub.example.co.uk"
        return 1
    fi

    echo ""
    log_success "Domain format valid: $domain"

    # Step 2: DNS validation
    echo ""
    echo "Step 2: DNS Resolution"
    echo "  Checking DNS records for spoke subdomains..."
    echo ""

    local dns_ok=true
    spoke_domain_check_dns "$domain" || dns_ok=false

    echo ""
    if [ "$dns_ok" = true ]; then
        log_success "All DNS records resolve"
    else
        log_warn "Some DNS records are missing"
        echo "  You can continue, but ensure DNS is configured before deployment completes."
        echo -n "  Continue anyway? [y/N] "
        local answer=""
        read -r answer
        if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
            log_info "Aborted — configure DNS and re-run."
            return 1
        fi
    fi

    # Step 3: TLS certificate source
    echo ""
    echo "Step 3: TLS Certificate Source"
    echo "  1) Vault PKI (auto-generated) — recommended for DIVE deployments"
    echo "  2) Let's Encrypt via Caddy — recommended for public-facing"
    echo "  3) Bring your own certificate files"
    echo ""
    echo -n "  Choice [1]: "

    local tls_choice=""
    read -r tls_choice
    tls_choice="${tls_choice:-1}"

    local cert_source=""
    case "$tls_choice" in
        1) cert_source="vault" ;;
        2) cert_source="caddy" ;;
        3)
            cert_source="custom"
            echo -n "  Certificate file path: "
            local cert_path=""
            read -r cert_path
            echo -n "  Key file path: "
            local key_path=""
            read -r key_path
            if [ ! -f "${cert_path:-/nonexistent}" ] || [ ! -f "${key_path:-/nonexistent}" ]; then
                log_warn "Certificate files not found — you can provide them later"
            fi
            ;;
        *)
            log_warn "Invalid choice, defaulting to Vault PKI"
            cert_source="vault"
            ;;
    esac

    log_success "TLS source: $cert_source"

    # Step 4: Hub connectivity
    echo ""
    echo "Step 4: Hub Connectivity"

    local hub_idp_url=""
    if [ -n "${HUB_KC_URL:-}" ]; then
        hub_idp_url="$HUB_KC_URL"
        echo "  Using configured Hub IdP: $hub_idp_url"
    elif [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
        local _env_prefix _base_domain
        _env_prefix="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f1)"
        _base_domain="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f2-)"
        hub_idp_url="https://${_env_prefix}-usa-idp.${_base_domain}"
        echo "  Derived Hub IdP from DIVE_DOMAIN_SUFFIX: $hub_idp_url"
    else
        echo "  Enter the Hub's Keycloak URL (e.g., https://dev-usa-idp.dive25.com):"
        echo -n "  Hub IdP URL: "
        read -r hub_idp_url
    fi

    if [ -n "$hub_idp_url" ]; then
        echo "  Checking OIDC discovery..."
        if spoke_domain_check_hub "$hub_idp_url"; then
            log_success "Hub OIDC reachable at $hub_idp_url"
        else
            log_warn "Hub OIDC unreachable — federation may fail"
            echo "  The spoke can still deploy in standalone mode."
        fi
    else
        log_warn "No Hub URL — spoke will deploy in standalone mode"
    fi

    # Step 5: Confirmation summary
    echo ""
    echo "============================================"
    echo "  Configuration Summary — ${code_upper}"
    echo "============================================"
    echo ""
    echo "  Base domain:    ${domain}"
    echo "  App URL:        https://app.${domain}"
    echo "  API URL:        https://api.${domain}"
    echo "  IdP URL:        https://idp.${domain}"
    echo "  TLS source:     ${cert_source}"
    [ -n "$hub_idp_url" ] && echo "  Hub IdP:        ${hub_idp_url}"
    echo ""
    echo -n "  Proceed with this configuration? [Y/n] "

    local confirm=""
    read -r confirm
    if [ "$confirm" = "n" ] || [ "$confirm" = "N" ]; then
        log_info "Aborted."
        return 1
    fi

    # Write config file
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    mkdir -p "$spoke_dir"
    local config_file="${spoke_dir}/.domain.conf"

    cat > "$config_file" << DOMAIN_CONF
# DIVE spoke domain configuration
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
SPOKE_CUSTOM_DOMAIN="${domain}"
SPOKE_CERT_SOURCE="${cert_source}"
${cert_path:+SPOKE_CERT_PATH="${cert_path}"}
${key_path:+SPOKE_KEY_PATH="${key_path}"}
${hub_idp_url:+HUB_KC_URL="${hub_idp_url}"}
DOMAIN_CONF

    # Export for immediate use
    export SPOKE_CUSTOM_DOMAIN="$domain"
    local _domain_var="SPOKE_${code_upper}_DOMAIN"
    export "${_domain_var}=${domain}"

    log_success "Domain configuration saved: ${config_file}"
    echo ""

    return 0
}

export -f spoke_domain_validate
export -f spoke_domain_check_dns
export -f spoke_domain_check_hub
export -f spoke_domain_wizard
