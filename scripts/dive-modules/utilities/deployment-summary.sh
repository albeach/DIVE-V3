#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Pre/Post Deployment Summaries
# =============================================================================
# Displays configuration summary before deployment (with confirmation) and
# service URLs + next steps after successful deployment.
# =============================================================================

# Prevent multiple sourcing
if [ -n "${DEPLOYMENT_SUMMARY_LOADED:-}" ]; then
    return 0
fi
export DEPLOYMENT_SUMMARY_LOADED=1

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# PRE-DEPLOYMENT SUMMARY
# =============================================================================

##
# Display configuration summary before hub deployment
#
# Shows: environment, domain, secrets provider, cloud provider, key settings.
# In interactive mode, prompts for confirmation before proceeding.
# In non-interactive mode, displays summary and continues.
#
# Returns:
#   0 - Proceed with deployment
#   1 - User cancelled
##
deployment_pre_summary_hub() {
    local env="${ENVIRONMENT:-local}"
    local domain="${DIVE_DEFAULT_DOMAIN:-dive25.com}"
    local secrets="${SECRETS_PROVIDER:-vault}"
    local cloud="${DIVE_CLOUD_PROVIDER:-local}"
    local realm="${HUB_REALM:-dive-v3-broker-usa}"

    echo ""
    echo "==============================================================================="
    echo "  DIVE V3 — Hub Deployment Summary"
    echo "==============================================================================="
    echo ""
    printf "  %-22s %s\n" "Environment:" "$env"
    printf "  %-22s %s\n" "Domain:" "$domain"
    printf "  %-22s %s\n" "Secrets Provider:" "$secrets"
    printf "  %-22s %s\n" "Cloud Provider:" "$cloud"
    printf "  %-22s %s\n" "Keycloak Realm:" "$realm"

    # Show domain-derived URLs if not local
    if [ "$env" != "local" ] && [ -n "${CADDY_DOMAIN_APP:-}" ]; then
        echo ""
        echo "  Service URLs (Caddy):"
        printf "    %-10s https://%s\n" "App:" "${CADDY_DOMAIN_APP}"
        printf "    %-10s https://%s\n" "API:" "${CADDY_DOMAIN_API:-}"
        printf "    %-10s https://%s\n" "IdP:" "${CADDY_DOMAIN_IDP:-}"
        if [ -n "${CADDY_DOMAIN_VAULT:-}" ]; then
            printf "    %-10s https://%s\n" "Vault:" "${CADDY_DOMAIN_VAULT}"
        fi
    elif [ "$env" = "local" ]; then
        echo ""
        echo "  Local Ports:"
        printf "    %-12s https://localhost:%s\n" "Frontend:" "${FRONTEND_PORT:-3000}"
        printf "    %-12s https://localhost:%s\n" "Backend:" "${BACKEND_PORT:-4000}"
        printf "    %-12s https://localhost:%s\n" "Keycloak:" "${KEYCLOAK_HTTPS_PORT:-8443}"
        printf "    %-12s %s://localhost:%s\n" "Vault:" "${VAULT_SCHEME:-https}" "${VAULT_PORT:-8200}"
    fi

    echo ""
    echo "  Pipeline: 13 phases (Vault → Database → Services → Keycloak → KAS → Seed)"
    echo ""
    echo "==============================================================================="
    echo ""

    # Confirmation in interactive mode
    if is_interactive; then
        local answer
        read -r -p "  Proceed with hub deployment? [Y/n]: " answer
        case "$answer" in
            [Nn]|[Nn][Oo])
                log_info "Hub deployment cancelled"
                return 1
                ;;
        esac
    else
        log_verbose "Non-interactive mode: proceeding with deployment"
    fi

    return 0
}

##
# Display configuration summary before spoke deployment
#
# Arguments:
#   $1 - Instance code (e.g., FRA, GBR)
#
# Returns:
#   0 - Proceed with deployment
#   1 - User cancelled
##
deployment_pre_summary_spoke() {
    local instance_code="${1:?Instance code required}"
    local code_lower
    code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local code_upper
    code_upper=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')

    local env="${ENVIRONMENT:-local}"
    local domain="${DIVE_DEFAULT_DOMAIN:-dive25.com}"
    local secrets="${SECRETS_PROVIDER:-vault}"
    local hub_url="${DIVE_HUB_URL:-${HUB_FALLBACK_URL:-https://usa-api.${domain}}}"

    # Get instance name if available
    local instance_name="$code_upper"
    if type spoke_config_get &>/dev/null; then
        local name
        name=$(spoke_config_get "$code_upper" "identity.name" "")
        [ -n "$name" ] && instance_name="$name ($code_upper)"
    fi

    echo ""
    echo "==============================================================================="
    echo "  DIVE V3 — Spoke Deployment Summary: $instance_name"
    echo "==============================================================================="
    echo ""
    printf "  %-22s %s\n" "Instance:" "$instance_name"
    printf "  %-22s %s\n" "Environment:" "$env"
    printf "  %-22s %s\n" "Domain:" "$domain"
    printf "  %-22s %s\n" "Secrets Provider:" "$secrets"
    printf "  %-22s %s\n" "Hub URL:" "$hub_url"

    # Show derived URLs
    if [ "$env" != "local" ] && [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
        echo ""
        echo "  Service URLs:"
        printf "    %-10s https://%s-app.%s\n" "App:" "$code_lower" "${DIVE_DOMAIN_SUFFIX}"
        printf "    %-10s https://%s-api.%s\n" "API:" "$code_lower" "${DIVE_DOMAIN_SUFFIX}"
        printf "    %-10s https://%s-idp.%s\n" "IdP:" "$code_lower" "${DIVE_DOMAIN_SUFFIX}"
    elif [ "$env" = "local" ]; then
        # Get ports from SSOT
        local frontend_port backend_port kc_port
        if type get_instance_ports &>/dev/null; then
            eval "$(get_instance_ports "$code_upper")"
            frontend_port="${SPOKE_FRONTEND_PORT:-3000}"
            backend_port="${SPOKE_BACKEND_PORT:-4000}"
            kc_port="${SPOKE_KEYCLOAK_PORT:-8443}"
        fi
        echo ""
        echo "  Local Ports:"
        printf "    %-12s https://localhost:%s\n" "Frontend:" "${frontend_port:-?}"
        printf "    %-12s https://localhost:%s\n" "Backend:" "${backend_port:-?}"
        printf "    %-12s https://localhost:%s\n" "Keycloak:" "${kc_port:-?}"
    fi

    echo ""
    echo "  Pipeline: 6 phases (Preflight → Init → Deploy → Config → Seed → Verify)"
    echo ""
    echo "==============================================================================="
    echo ""

    # Confirmation in interactive mode
    if is_interactive; then
        local answer
        read -r -p "  Proceed with spoke deployment? [Y/n]: " answer
        case "$answer" in
            [Nn]|[Nn][Oo])
                log_info "Spoke deployment cancelled"
                return 1
                ;;
        esac
    else
        log_verbose "Non-interactive mode: proceeding with deployment"
    fi

    return 0
}

# =============================================================================
# POST-DEPLOYMENT SUMMARY
# =============================================================================

##
# Display post-deployment summary with service URLs and next steps
#
# Arguments:
#   $1 - Deployment type: "hub" or "spoke"
#   $2 - Instance code
#   $3 - Duration in seconds
##
deployment_post_summary() {
    local deploy_type="${1:?Deployment type required}"
    local instance_code="${2:-USA}"
    local duration="${3:-0}"
    local code_lower
    code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')

    local env="${ENVIRONMENT:-local}"
    local domain="${DIVE_DEFAULT_DOMAIN:-dive25.com}"

    echo ""
    echo "==============================================================================="
    echo "  Service Access"
    echo "==============================================================================="
    echo ""

    if [ "$deploy_type" = "hub" ]; then
        _post_summary_hub_urls "$env" "$domain"
        echo ""
        echo "  Credentials:"
        echo "    Keycloak admin:  admin / \$KEYCLOAK_ADMIN_PASSWORD (from Vault)"
        echo "    Vault:           root token in .dive-state/hub/vault-init.json"
        echo ""
        echo "  Next Steps:"
        echo "    1. ./dive spoke deploy GBR           # Deploy first spoke"
        echo "    2. ./dive hub health                 # Verify hub health"
        echo "    3. ./dive hub status                 # View running services"
    else
        _post_summary_spoke_urls "$env" "$domain" "$code_lower"
        echo ""
        echo "  Next Steps:"
        echo "    1. ./dive spoke verify $instance_code            # Run 12-point verification"
        echo "    2. ./dive federation verify $instance_code       # Check federation"
        echo "    3. ./dive spoke deploy <NEXT>        # Deploy another spoke"
    fi

    echo ""
    echo "==============================================================================="
    echo ""
}

##
# Print hub service URLs based on environment
##
_post_summary_hub_urls() {
    local env="$1"
    local domain="$2"

    if [ "$env" != "local" ] && [ -n "${CADDY_DOMAIN_APP:-}" ]; then
        echo "  URLs (via Caddy reverse proxy):"
        printf "    %-12s https://%s\n" "App:" "${CADDY_DOMAIN_APP}"
        printf "    %-12s https://%s\n" "API:" "${CADDY_DOMAIN_API:-}"
        printf "    %-12s https://%s\n" "IdP:" "${CADDY_DOMAIN_IDP:-}"
        printf "    %-12s https://%s\n" "OPAL:" "${CADDY_DOMAIN_OPAL:-}"
        [ -n "${CADDY_DOMAIN_VAULT:-}" ] && printf "    %-12s https://%s\n" "Vault:" "${CADDY_DOMAIN_VAULT}"
    else
        echo "  Local URLs:"
        printf "    %-12s https://localhost:%s\n" "App:" "${FRONTEND_PORT:-3000}"
        printf "    %-12s https://localhost:%s\n" "API:" "${BACKEND_PORT:-4000}"
        printf "    %-12s https://localhost:%s\n" "IdP:" "${KEYCLOAK_HTTPS_PORT:-8443}"
        printf "    %-12s %s://localhost:%s\n" "Vault:" "${VAULT_SCHEME:-https}" "${VAULT_PORT:-8200}"
        printf "    %-12s https://localhost:%s\n" "OPAL:" "${OPAL_SERVER_PORT:-7002}"
    fi
}

##
# Print spoke service URLs based on environment
##
_post_summary_spoke_urls() {
    local env="$1"
    local domain="$2"
    local code_lower="$3"

    if [ "$env" != "local" ] && [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
        echo "  URLs (via Caddy reverse proxy):"
        printf "    %-12s https://%s-app.%s\n" "App:" "$code_lower" "${DIVE_DOMAIN_SUFFIX}"
        printf "    %-12s https://%s-api.%s\n" "API:" "$code_lower" "${DIVE_DOMAIN_SUFFIX}"
        printf "    %-12s https://%s-idp.%s\n" "IdP:" "$code_lower" "${DIVE_DOMAIN_SUFFIX}"
    else
        local frontend_port backend_port kc_port
        if type get_instance_ports &>/dev/null; then
            eval "$(get_instance_ports "$(echo "$code_lower" | tr '[:lower:]' '[:upper:]')")"
            frontend_port="${SPOKE_FRONTEND_PORT:-}"
            backend_port="${SPOKE_BACKEND_PORT:-}"
            kc_port="${SPOKE_KEYCLOAK_PORT:-}"
        fi
        echo "  Local URLs:"
        [ -n "$frontend_port" ] && printf "    %-12s https://localhost:%s\n" "App:" "$frontend_port"
        [ -n "$backend_port" ] && printf "    %-12s https://localhost:%s\n" "API:" "$backend_port"
        [ -n "$kc_port" ] && printf "    %-12s https://localhost:%s\n" "IdP:" "$kc_port"
    fi
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f deployment_pre_summary_hub
export -f deployment_pre_summary_spoke
export -f deployment_post_summary

log_verbose "Deployment summary module loaded"
