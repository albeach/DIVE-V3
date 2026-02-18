#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Vault Partner Management
# =============================================================================
# Sourced by vault/module.sh — do not execute directly.
#
# Manages pre-approved federation partners in Vault KV v2.
# Partners stored at: dive-v3/federation/partners/{CODE}
#
# Functions:
#   vault_partner_put      - Add or update a partner
#   vault_partner_get      - Get partner details (JSON)
#   vault_partner_list     - List all partners (table)
#   vault_partner_delete   - Remove a partner
#   module_vault_partner   - CLI dispatcher
# =============================================================================

# KV mount path for partner data
readonly VAULT_PARTNER_PREFIX="dive-v3/federation/partners"

# =============================================================================
# HELPERS
# =============================================================================

##
# Ensure Vault is reachable and authenticated.
# Returns 0 on success, 1 on failure (logs error).
##
_vault_partner_ensure_auth() {
    if ! vault_is_running; then
        return 1
    fi

    if [ -f "$VAULT_TOKEN_FILE" ]; then
        VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
        export VAULT_TOKEN
    else
        log_error "Vault token not found — run: ./dive vault init"
        return 1
    fi

    if ! _vault_check_unsealed; then
        return 1
    fi
    return 0
}

##
# Derive spoke domains from DIVE_DOMAIN_SUFFIX and instance code.
# Usage: _vault_partner_derive_domains GBR
# Sets: _derived_app _derived_api _derived_idp
##
_vault_partner_derive_domains() {
    local code_lower
    code_lower=$(echo "$1" | tr '[:upper:]' '[:lower:]')
    local env_prefix="${DIVE_ENV:-dev}"
    local suffix="${DIVE_DOMAIN_SUFFIX:-dive25.com}"

    _derived_app="${env_prefix}-${code_lower}-app.${suffix}"
    _derived_api="${env_prefix}-${code_lower}-api.${suffix}"
    _derived_idp="${env_prefix}-${code_lower}-idp.${suffix}"
}

# =============================================================================
# CRUD FUNCTIONS
# =============================================================================

##
# Add or update a federation partner in Vault KV.
#
# Usage:
#   vault_partner_put GBR                              # auto-derive domains
#   vault_partner_put GBR --domain gbr.mod.uk          # custom domain
#   vault_partner_put GBR --trust bilateral --max-classification SECRET
#
# Options:
#   --domain <base>           Custom base domain (e.g. gbr.mod.uk)
#   --trust <level>           Trust level: bilateral (default), multilateral
#   --max-classification <c>  Max classification: SECRET (default), TOP_SECRET
#   --pre-approved false      Mark as NOT pre-approved (default: true)
##
vault_partner_put() {
    local code_upper="${1:-}"
    shift || true

    if [ -z "$code_upper" ]; then
        log_error "Usage: ./dive vault partner add <CODE> [--domain <base>] [--trust <level>]"
        return 1
    fi

    code_upper=$(echo "$code_upper" | tr '[:lower:]' '[:upper:]')

    # Parse options
    local custom_domain=""
    local trust_level="bilateral"
    local max_classification="SECRET"
    local pre_approved="true"
    local name=""

    while [ $# -gt 0 ]; do
        case "$1" in
            --domain)     custom_domain="${2:-}"; shift 2 ;;
            --trust)      trust_level="${2:-bilateral}"; shift 2 ;;
            --max-classification) max_classification="${2:-SECRET}"; shift 2 ;;
            --pre-approved)       pre_approved="${2:-true}"; shift 2 ;;
            --name)       name="${2:-}"; shift 2 ;;
            *)            log_warn "Unknown option: $1"; shift ;;
        esac
    done

    # Derive domains
    local domain_app domain_api domain_idp

    if [ -n "$custom_domain" ]; then
        # Custom domain: app.<domain>, api.<domain>, idp.<domain>
        domain_app="app.${custom_domain}"
        domain_api="api.${custom_domain}"
        domain_idp="idp.${custom_domain}"
    else
        # Auto-derive from DIVE_DOMAIN_SUFFIX
        _vault_partner_derive_domains "$code_upper"
        domain_app="$_derived_app"
        domain_api="$_derived_api"
        domain_idp="$_derived_idp"
    fi

    # Auto-detect country name from nato-countries.sh if available
    if [ -z "$name" ]; then
        local nato_file="${DIVE_ROOT}/scripts/dive-modules/nato-countries.sh"
        if [ -f "$nato_file" ]; then
            name=$(grep -i "\"${code_upper}\"" "$nato_file" 2>/dev/null | head -1 | sed 's/.*name="\([^"]*\)".*/\1/' || true)
        fi
        [ -z "$name" ] && name="$code_upper"
    fi

    if ! _vault_partner_ensure_auth; then
        return 1
    fi

    local created_at
    created_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Check if partner already exists (preserve createdAt)
    local existing_created
    existing_created=$(vault kv get -field=createdAt "${VAULT_PARTNER_PREFIX}/${code_upper}" 2>/dev/null || true)
    [ -n "$existing_created" ] && created_at="$existing_created"

    log_info "Registering federation partner: ${code_upper}"
    log_verbose "  Domain (app): ${domain_app}"
    log_verbose "  Domain (api): ${domain_api}"
    log_verbose "  Domain (idp): ${domain_idp}"
    log_verbose "  Trust level:  ${trust_level}"
    log_verbose "  Max class:    ${max_classification}"
    log_verbose "  Pre-approved: ${pre_approved}"

    if vault kv put "${VAULT_PARTNER_PREFIX}/${code_upper}" \
        instanceCode="$code_upper" \
        name="$name" \
        domainApp="$domain_app" \
        domainApi="$domain_api" \
        domainIdp="$domain_idp" \
        trustLevel="$trust_level" \
        maxClassification="$max_classification" \
        preApproved="$pre_approved" \
        createdAt="$created_at" \
        >/dev/null 2>&1; then
        log_success "Partner ${code_upper} registered (${domain_app})"
    else
        log_error "Failed to store partner ${code_upper} in Vault"
        return 1
    fi
}

##
# Get partner details as JSON.
# Usage: vault_partner_get GBR
##
vault_partner_get() {
    local code_upper="${1:-}"
    if [ -z "$code_upper" ]; then
        log_error "Usage: ./dive vault partner get <CODE>"
        return 1
    fi

    code_upper=$(echo "$code_upper" | tr '[:lower:]' '[:upper:]')

    if ! _vault_partner_ensure_auth; then
        return 1
    fi

    local data
    data=$(vault kv get -format=json "${VAULT_PARTNER_PREFIX}/${code_upper}" 2>/dev/null)

    if [ -z "$data" ]; then
        log_error "Partner not found: ${code_upper}"
        return 1
    fi

    # Extract just the data.data fields (strip Vault metadata)
    echo "$data" | jq '.data.data'
}

##
# List all partners in a formatted table.
# Usage: vault_partner_list [--json]
##
vault_partner_list() {
    local json_output=false
    [ "${1:-}" = "--json" ] && json_output=true

    if ! _vault_partner_ensure_auth; then
        return 1
    fi

    local keys
    keys=$(vault kv list -format=json "${VAULT_PARTNER_PREFIX}" 2>/dev/null || echo "[]")

    local count
    count=$(echo "$keys" | jq -r 'length')

    if [ "$count" = "0" ] || [ "$count" = "null" ]; then
        log_info "No federation partners registered."
        log_info "Add one: ./dive vault partner add GBR"
        return 0
    fi

    if [ "$json_output" = true ]; then
        # Collect all partner data as JSON array
        echo "["
        local first=true
        for key in $(echo "$keys" | jq -r '.[]' | sed 's|/$||'); do
            local pdata
            pdata=$(vault kv get -format=json "${VAULT_PARTNER_PREFIX}/${key}" 2>/dev/null | jq '.data.data' 2>/dev/null || true)
            if [ -n "$pdata" ] && [ "$pdata" != "null" ]; then
                if [ "$first" = true ]; then
                    first=false
                else
                    echo ","
                fi
                echo "$pdata"
            fi
        done
        echo "]"
        return 0
    fi

    # Table output
    echo ""
    printf "  %-6s  %-20s  %-30s  %-12s  %-10s  %-12s\n" \
        "CODE" "NAME" "DOMAIN (APP)" "TRUST" "MAX CLASS" "PRE-APPROVED"
    printf "  %-6s  %-20s  %-30s  %-12s  %-10s  %-12s\n" \
        "------" "--------------------" "------------------------------" "------------" "----------" "------------"

    for key in $(echo "$keys" | jq -r '.[]' | sed 's|/$||'); do
        local pdata
        pdata=$(vault kv get -format=json "${VAULT_PARTNER_PREFIX}/${key}" 2>/dev/null | jq -r '.data.data' 2>/dev/null || true)

        if [ -n "$pdata" ] && [ "$pdata" != "null" ]; then
            local p_code p_name p_domain p_trust p_class p_approved
            p_code=$(echo "$pdata" | jq -r '.instanceCode // "?"')
            p_name=$(echo "$pdata" | jq -r '.name // "?"')
            p_domain=$(echo "$pdata" | jq -r '.domainApp // "?"')
            p_trust=$(echo "$pdata" | jq -r '.trustLevel // "?"')
            p_class=$(echo "$pdata" | jq -r '.maxClassification // "?"')
            p_approved=$(echo "$pdata" | jq -r '.preApproved // "?"')

            printf "  %-6s  %-20s  %-30s  %-12s  %-10s  %-12s\n" \
                "$p_code" "$p_name" "$p_domain" "$p_trust" "$p_class" "$p_approved"
        fi
    done
    echo ""
    log_info "${count} partner(s) registered"
}

##
# Delete a partner from Vault KV.
# Usage: vault_partner_delete GBR [--confirm]
##
vault_partner_delete() {
    local code_upper="${1:-}"
    local confirmed=false
    [ "${2:-}" = "--confirm" ] && confirmed=true

    if [ -z "$code_upper" ]; then
        log_error "Usage: ./dive vault partner remove <CODE> [--confirm]"
        return 1
    fi

    code_upper=$(echo "$code_upper" | tr '[:lower:]' '[:upper:]')

    if ! _vault_partner_ensure_auth; then
        return 1
    fi

    # Check exists
    if ! vault kv get "${VAULT_PARTNER_PREFIX}/${code_upper}" >/dev/null 2>&1; then
        log_error "Partner not found: ${code_upper}"
        return 1
    fi

    if [ "$confirmed" = false ]; then
        log_warn "This will remove partner ${code_upper} from Vault KV."
        log_warn "It does NOT revoke existing federation or certificates."
        read -rp "  Type 'yes' to confirm: " answer
        if [ "$answer" != "yes" ]; then
            log_info "Cancelled."
            return 0
        fi
    fi

    if vault kv delete "${VAULT_PARTNER_PREFIX}/${code_upper}" >/dev/null 2>&1; then
        log_success "Partner ${code_upper} removed from Vault"
    else
        log_error "Failed to delete partner ${code_upper}"
        return 1
    fi
}

# =============================================================================
# CLI DISPATCHER
# =============================================================================

##
# CLI entry point for `./dive vault partner <subcommand>`.
##
module_vault_partner() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        add|put)
            vault_partner_put "$@"
            ;;
        get|show)
            vault_partner_get "$@"
            ;;
        list|ls)
            vault_partner_list "$@"
            ;;
        remove|delete|rm)
            vault_partner_delete "$@"
            ;;
        help|--help|-h)
            echo "Usage: ./dive vault partner <command>"
            echo ""
            echo "Commands:"
            echo "  add <CODE>              Register a federation partner"
            echo "    --domain <base>       Custom base domain (default: auto from DIVE_DOMAIN_SUFFIX)"
            echo "    --trust <level>       Trust level: bilateral (default), multilateral"
            echo "    --max-classification  Max classification: SECRET (default), TOP_SECRET"
            echo "    --pre-approved false  Mark as not pre-approved (default: true)"
            echo "    --name <name>         Display name (default: auto from nato-countries.sh)"
            echo ""
            echo "  get <CODE>              Show partner details (JSON)"
            echo "  list [--json]           List all partners (table or JSON)"
            echo "  remove <CODE>           Remove a partner from Vault"
            echo ""
            echo "Examples:"
            echo "  ./dive vault partner add GBR                            # auto-derives dev-gbr-*.dive25.com"
            echo "  ./dive vault partner add GBR --domain gbr.mod.uk        # custom domain"
            echo "  ./dive vault partner add FRA --trust multilateral"
            echo "  ./dive vault partner list"
            echo "  ./dive vault partner get GBR"
            echo "  ./dive vault partner remove GBR"
            echo ""
            echo "Partner data stored in Vault KV at: ${VAULT_PARTNER_PREFIX}/<CODE>"
            ;;
        *)
            log_error "Unknown partner command: $action"
            log_info "Run './dive vault partner help' for usage"
            return 1
            ;;
    esac
}
