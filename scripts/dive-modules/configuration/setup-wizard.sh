#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - First-Time Setup Wizard
# =============================================================================
# Interactive guided configuration that generates config/dive-local.env.
# Prompts for environment, domain, secrets provider, Cloudflare, hub config.
#
# Usage:
#   ./dive setup              # Run the setup wizard
#   ./dive setup --reset      # Overwrite existing config/dive-local.env
# =============================================================================

# Prevent multiple sourcing
if [ -n "${SETUP_WIZARD_LOADED:-}" ]; then
    return 0
fi
export SETUP_WIZARD_LOADED=1

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# WIZARD STEPS
# =============================================================================

_SETUP_CONFIG=()

_setup_add() {
    _SETUP_CONFIG+=("$1=$2")
}

##
# Step 1: Environment selection
##
_setup_step_environment() {
    echo ""
    echo "  Step 1/6: Environment"
    echo "  ---------------------"
    echo "  1) local    — Docker on this machine (default)"
    echo "  2) dev      — AWS/GCP development environment"
    echo "  3) staging  — AWS/GCP staging environment"
    echo "  4) production — Full production deployment"
    echo ""

    local choice
    read -r -p "  Select environment [1]: " choice
    case "$choice" in
        2) _setup_add "ENVIRONMENT" "dev" ;;
        3) _setup_add "ENVIRONMENT" "staging" ;;
        4) _setup_add "ENVIRONMENT" "production" ;;
        *) _setup_add "ENVIRONMENT" "local" ;;
    esac
}

##
# Step 2: Domain configuration
##
_setup_step_domain() {
    echo ""
    echo "  Step 2/6: Domain"
    echo "  ----------------"
    echo "  The base domain for all DIVE services (e.g., dive25.com)."
    echo "  Services will be at: usa-app.<domain>, usa-api.<domain>, etc."
    echo ""

    local domain
    read -r -p "  Base domain [dive25.com]: " domain
    domain="${domain:-dive25.com}"
    _setup_add "DIVE_DEFAULT_DOMAIN" "$domain"
}

##
# Step 3: Secrets provider
##
_setup_step_secrets() {
    echo ""
    echo "  Step 3/6: Secrets Provider"
    echo "  --------------------------"
    echo "  Where to store and retrieve secrets (passwords, tokens, keys)."
    echo ""
    echo "  1) vault — HashiCorp Vault (default, self-hosted)"
    echo "  2) gcp   — Google Cloud Secret Manager"
    echo "  3) aws   — AWS Secrets Manager"
    echo "  4) local — Local .env files only (not recommended for production)"
    echo ""

    local choice
    read -r -p "  Select secrets provider [1]: " choice
    case "$choice" in
        2) _setup_add "SECRETS_PROVIDER" "gcp" ;;
        3) _setup_add "SECRETS_PROVIDER" "aws" ;;
        4) _setup_add "SECRETS_PROVIDER" "local" ;;
        *) _setup_add "SECRETS_PROVIDER" "vault" ;;
    esac
}

##
# Step 4: Cloud provider
##
_setup_step_cloud() {
    local env_val=""
    for pair in "${_SETUP_CONFIG[@]}"; do
        case "$pair" in ENVIRONMENT=*) env_val="${pair#ENVIRONMENT=}" ;; esac
    done

    if [ "$env_val" = "local" ]; then
        _setup_add "DIVE_CLOUD_PROVIDER" "local"
        return 0
    fi

    echo ""
    echo "  Step 4/6: Cloud Provider"
    echo "  ------------------------"
    echo "  Where to deploy infrastructure (for non-local environments)."
    echo ""
    echo "  1) aws — Amazon Web Services (default for dev/staging)"
    echo "  2) gcp — Google Cloud Platform"
    echo ""

    local choice
    read -r -p "  Select cloud provider [1]: " choice
    case "$choice" in
        2)
            _setup_add "DIVE_CLOUD_PROVIDER" "gcp"
            echo ""
            local project
            read -r -p "  GCP Project ID [dive25]: " project
            _setup_add "GCP_PROJECT" "${project:-dive25}"
            ;;
        *)
            _setup_add "DIVE_CLOUD_PROVIDER" "aws"
            echo ""
            local region
            read -r -p "  AWS Region [us-gov-east-1]: " region
            _setup_add "AWS_REGION" "${region:-us-gov-east-1}"
            ;;
    esac
}

##
# Step 5: Cloudflare (optional)
##
_setup_step_cloudflare() {
    local env_val=""
    for pair in "${_SETUP_CONFIG[@]}"; do
        case "$pair" in ENVIRONMENT=*) env_val="${pair#ENVIRONMENT=}" ;; esac
    done

    if [ "$env_val" = "local" ]; then
        return 0
    fi

    echo ""
    echo "  Step 5/6: Cloudflare DNS (optional)"
    echo "  ------------------------------------"
    echo "  Auto-manage DNS records via Cloudflare API."
    echo "  Leave empty to skip — you can run ./dive dns setup later."
    echo ""
    echo "  To create a scoped token:"
    echo "    1. Go to https://dash.cloudflare.com/profile/api-tokens"
    echo "    2. Create Token → Edit zone DNS template"
    echo "    3. Zone Resources: Include → Specific zone → your domain"
    echo ""

    local token
    read -r -p "  Cloudflare API Token (or press Enter to skip): " token
    if [ -z "$token" ]; then
        return 0
    fi

    # Validate token via Cloudflare API
    # Source DNS module for validation helpers
    local _dns_module="${DIVE_ROOT}/scripts/dive-modules/configuration/dns.sh"
    if [ -f "$_dns_module" ]; then
        # shellcheck source=./dns.sh
        source "$_dns_module"
    fi

    if type _dns_validate_token &>/dev/null; then
        echo ""
        echo "  Validating token..."
        if _dns_validate_token "$token" >/dev/null 2>&1; then
            echo "  Token is valid."
        else
            echo "  Warning: Token validation failed. Saving anyway — you can re-run ./dive dns setup."
        fi
    fi

    _setup_add "CLOUDFLARE_API_TOKEN" "$token"

    # Try to auto-discover zone
    if type _dns_list_zones &>/dev/null; then
        echo ""
        echo "  Discovering Cloudflare zones..."
        local zones_output
        zones_output=$(_dns_list_zones "$token" 2>/dev/null) || true

        if [ -n "$zones_output" ]; then
            local zone_count
            zone_count=$(echo "$zones_output" | wc -l | tr -d ' ')
            echo "  Found ${zone_count} zone(s):"
            echo ""

            local i=1
            while IFS=' ' read -r zid zname; do
                echo "    ${i}) ${zname} (${zid})"
                i=$((i + 1))
            done <<< "$zones_output"
            echo ""

            if [ "$zone_count" -eq 1 ]; then
                local auto_zone_id
                auto_zone_id=$(echo "$zones_output" | head -1 | cut -d' ' -f1)
                local auto_zone_name
                auto_zone_name=$(echo "$zones_output" | head -1 | cut -d' ' -f2-)
                echo "  Auto-selecting: ${auto_zone_name}"
                _setup_add "CLOUDFLARE_ZONE_ID" "$auto_zone_id"
            else
                local choice
                read -r -p "  Select zone number [1]: " choice
                choice="${choice:-1}"
                local selected_line
                selected_line=$(echo "$zones_output" | sed -n "${choice}p")
                if [ -n "$selected_line" ]; then
                    local sel_id
                    sel_id=$(echo "$selected_line" | cut -d' ' -f1)
                    local sel_name
                    sel_name=$(echo "$selected_line" | cut -d' ' -f2-)
                    echo "  Selected: ${sel_name}"
                    _setup_add "CLOUDFLARE_ZONE_ID" "$sel_id"
                fi
            fi
        else
            echo "  Could not discover zones — you can set CLOUDFLARE_ZONE_ID later via ./dive dns setup"
        fi
    fi
}

##
# Step 6: Hub configuration
##
_setup_step_hub() {
    echo ""
    echo "  Step 6/6: Hub Configuration"
    echo "  ---------------------------"
    echo "  The hub is the central USA instance that manages federation."
    echo ""

    local realm
    read -r -p "  Keycloak realm name [dive-v3-broker-usa]: " realm
    realm="${realm:-dive-v3-broker-usa}"
    _setup_add "HUB_REALM" "$realm"

    local seed
    read -r -p "  Seed data count [5000]: " seed
    seed="${seed:-5000}"
    _setup_add "SEED_COUNT" "$seed"
}

# =============================================================================
# WIZARD ORCHESTRATION
# =============================================================================

##
# Main setup wizard entry point
#
# Arguments:
#   --reset  Overwrite existing dive-local.env
##
cmd_setup() {
    local reset=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --reset) reset=true; shift ;;
            *) shift ;;
        esac
    done

    # Non-interactive mode is not supported
    if ! is_interactive; then
        log_error "Setup wizard requires interactive mode."
        log_error "Remove --non-interactive flag or configure manually:"
        log_error "  Edit config/dive-local.env or set environment variables."
        return 1
    fi

    local config_file="${DIVE_ROOT}/config/dive-local.env"

    # Check for existing config
    if [ -f "$config_file" ] && [ "$reset" != true ]; then
        echo ""
        log_warn "Configuration already exists: $config_file"
        local answer
        read -r -p "  Overwrite existing configuration? [y/N]: " answer
        case "$answer" in
            [Yy]|[Yy][Ee][Ss]) ;;
            *)
                log_info "Setup cancelled. Edit $config_file manually or use --reset."
                return 0
                ;;
        esac
    fi

    echo ""
    echo "==============================================================================="
    echo "  DIVE V3 — First-Time Setup Wizard"
    echo "==============================================================================="
    echo ""
    echo "  This wizard generates config/dive-local.env with your deployment settings."
    echo "  Press Enter to accept defaults (shown in brackets)."
    echo "  You can re-run this wizard anytime with: ./dive setup --reset"
    echo ""

    # Reset config accumulator
    _SETUP_CONFIG=()

    # Run wizard steps
    _setup_step_environment
    _setup_step_domain
    _setup_step_secrets
    _setup_step_cloud
    _setup_step_cloudflare
    _setup_step_hub

    # Show summary
    echo ""
    echo "  ========================================"
    echo "  Configuration Summary"
    echo "  ========================================"
    for pair in "${_SETUP_CONFIG[@]}"; do
        local key="${pair%%=*}"
        local val="${pair#*=}"
        # Mask sensitive values
        if [[ "$key" == *TOKEN* ]] || [[ "$key" == *SECRET* ]]; then
            val="${val:0:4}****"
        fi
        printf "    %-28s %s\n" "$key:" "$val"
    done
    echo "  ========================================"
    echo ""

    # Confirm
    local confirm
    read -r -p "  Write this configuration? [Y/n]: " confirm
    case "$confirm" in
        [Nn]|[Nn][Oo])
            log_info "Setup cancelled."
            return 0
            ;;
    esac

    # Write config file
    mkdir -p "$(dirname "$config_file")"

    {
        echo "# ============================================================================="
        echo "# DIVE V3 — Local Configuration Overrides"
        echo "# ============================================================================="
        echo "# Generated by: ./dive setup"
        echo "# Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo "# ============================================================================="
        echo "# This file overrides config/dive-defaults.env for your local environment."
        echo "# It is git-ignored and should NOT be committed."
        echo "# ============================================================================="
        echo ""
        for pair in "${_SETUP_CONFIG[@]}"; do
            local key="${pair%%=*}"
            local val="${pair#*=}"
            echo "$key=$val"
        done
        echo ""
        echo "# ============================================================================="
        echo "# Add additional overrides below"
        echo "# ============================================================================="
    } > "$config_file"

    echo ""
    log_success "Configuration written to: $config_file"
    echo ""
    echo "  Next steps:"
    echo "    1. ./dive hub deploy         # Deploy the hub"
    echo "    2. ./dive spoke deploy GBR   # Deploy a spoke"
    echo "    3. ./dive setup --reset      # Re-run this wizard"
    echo ""

    return 0
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f cmd_setup

log_verbose "Setup wizard module loaded"
