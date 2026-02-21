#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Authorization Module
# =============================================================================
# Manages spoke admission to the federation via Vault-based authorization.
#
# Workflow:
#   1. Hub admin runs:  ./dive spoke authorize GBR "United Kingdom"
#   2. Vault stores authorization record with metadata + TTL
#   3. Vault provisions AppRole, PKI role, secrets (idempotent)
#   4. spoke deploy checks authorization exists before proceeding
#
# Authorization record stored at: dive-v3/auth/spoke-auth/{code}
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_SPOKE_AUTHORIZE_LOADED:-}" ] && return 0
export DIVE_SPOKE_AUTHORIZE_LOADED=1

# Load common
MODULES_DIR="$(dirname "$(dirname "${BASH_SOURCE[0]}")")"
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load guided framework
if [ -f "${MODULES_DIR}/guided/framework.sh" ]; then
    source "${MODULES_DIR}/guided/framework.sh"
fi

# =============================================================================
# AUTHORIZATION FUNCTIONS
# =============================================================================

##
# Authorize a spoke for federation admission.
# Creates a Vault authorization record and provisions all required resources.
#
# Usage: spoke_authorize CODE [NAME] [--ttl HOURS]
#
# Arguments:
#   $1 - Instance code (e.g., GBR, FRA, DEU)
#   $2 - Instance name (optional, auto-resolved from NATO database)
#   --ttl HOURS - Authorization validity in hours (default: 72)
#
# Creates:
#   - Vault KV: dive-v3/auth/spoke-auth/{code} (authorization record)
#   - Vault AppRole: spoke-{code}
#   - Vault PKI role: spoke-{code}-services
#   - Vault KV: dive-v3/core/{code}/* (instance secrets)
#   - Vault KV: dive-v3/federation/{pair} (federation pair secrets)
##
spoke_authorize() {
    local code="${1:-}"
    local name="${2:-}"
    local ttl_hours=72

    # Parse flags
    shift 2 2>/dev/null || true
    while [ $# -gt 0 ]; do
        case "$1" in
            --ttl) ttl_hours="${2:-72}"; shift 2 ;;
            *) shift ;;
        esac
    done

    if [ -z "$code" ]; then
        log_error "Instance code required"
        echo ""
        echo "Usage: ./dive spoke authorize CODE [NAME] [--ttl HOURS]"
        echo ""
        echo "Examples:"
        echo "  ./dive spoke authorize GBR \"United Kingdom\""
        echo "  ./dive spoke authorize FRA \"France\" --ttl 48"
        echo ""
        echo "This command:"
        echo "  1. Creates a time-limited authorization record in Vault"
        echo "  2. Provisions Vault AppRole, PKI role, and instance secrets"
        echo "  3. Generates an authorization code for deployment"
        echo ""
        return 1
    fi

    local code_upper
    code_upper=$(upper "$code")
    local code_lower
    code_lower=$(lower "$code")

    # GUARDRAIL: Prevent USA from being authorized as a spoke
    if [ "$code_upper" = "USA" ]; then
        log_error "Cannot authorize USA as a spoke — USA is the Hub"
        return 1
    fi

    # Resolve name from NATO database if not provided
    if [ -z "$name" ]; then
        if type -t get_country_name &>/dev/null; then
            name=$(get_country_name "$code_upper" 2>/dev/null)
        fi
        if [ -z "$name" ]; then
            name="$code_upper Instance"
        fi
    fi

    guided_explain "Authorizing a Spoke" \
        "You are creating an invitation for ${code_upper} (${name}) to join your federation.
This generates a one-time authorization code that the spoke operator will use
during deployment. The code expires in ${ttl_hours} hours." 2>/dev/null

    log_info "Authorizing spoke: $code_upper ($name)"
    log_info "Authorization TTL: ${ttl_hours}h"

    # Generate authorization code (UUID-based)
    local auth_code
    auth_code=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || openssl rand -hex 16)
    local authorized_at
    authorized_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local authorized_by="${USER:-$(whoami)}"
    local expires_at
    if date --version >/dev/null 2>&1; then
        # GNU date
        expires_at=$(date -u -d "+${ttl_hours} hours" +%Y-%m-%dT%H:%M:%SZ)
    else
        # macOS date
        expires_at=$(date -u -v+${ttl_hours}H +%Y-%m-%dT%H:%M:%SZ)
    fi

    # Step 1: Check Vault is available
    local vault_addr="${VAULT_ADDR:-https://127.0.0.1:8200}"
    local vault_token="${VAULT_TOKEN:-}"

    if [ -z "$vault_token" ]; then
        # Try .vault-token file first (primary SSOT)
        if [ -f "${DIVE_ROOT}/.vault-token" ]; then
            vault_token=$(cat "${DIVE_ROOT}/.vault-token")
        fi
    fi

    if [ -z "$vault_token" ]; then
        # Fallback to .env.hub
        if [ -f "${DIVE_ROOT}/.env.hub" ]; then
            vault_token=$(grep '^VAULT_TOKEN=' "${DIVE_ROOT}/.env.hub" | cut -d= -f2-)
        fi
    fi

    if [ -z "$vault_token" ]; then
        log_error "VAULT_TOKEN not set. Initialize Vault first: ./dive vault init"
        return 1
    fi

    export VAULT_ADDR="$vault_addr"
    export VAULT_TOKEN="$vault_token"

    # TLS: try CACERT first, fall back to VAULT_SKIP_VERIFY if it fails
    if [ -z "${VAULT_CACERT:-}" ] && [[ "$vault_addr" == https://* ]]; then
        local _ca_cert="${DIVE_ROOT}/certs/vault/node1/ca.pem"
        if [ -f "$_ca_cert" ]; then
            export VAULT_CACERT="$_ca_cert"
        else
            export VAULT_SKIP_VERIFY=1
        fi
    fi

    if ! vault status >/dev/null 2>&1; then
        # CACERT-based TLS may fail — fall back to skip verification
        unset VAULT_CACERT
        export VAULT_SKIP_VERIFY=1
        if ! vault status >/dev/null 2>&1; then
            log_error "Vault is not accessible at $vault_addr"
            return 1
        fi
    fi

    # Step 2: Write authorization record to Vault
    log_info "Step 1/3: Writing authorization record to Vault..."
    if ! vault kv put "dive-v3/auth/spoke-auth/${code_lower}" \
        code="$code_upper" \
        name="$name" \
        auth_code="$auth_code" \
        authorized_at="$authorized_at" \
        authorized_by="$authorized_by" \
        expires_at="$expires_at" \
        ttl_hours="$ttl_hours" \
        status="authorized" 2>/dev/null; then
        log_error "Failed to write authorization record"
        return 1
    fi
    log_success "Authorization record stored in Vault"

    # Step 3: Provision Vault resources (AppRole, PKI, secrets)
    log_info "Step 2/3: Provisioning Vault resources..."
    if type -t module_vault_provision &>/dev/null; then
        if ! module_vault_provision "$code_upper"; then
            log_error "Vault provisioning failed for $code_upper"
            return 1
        fi
    else
        # Load vault modules (module.sh defines vault_is_running, pki.sh defines module_vault_provision)
        if [ -f "${MODULES_DIR}/vault/module.sh" ]; then
            source "${MODULES_DIR}/vault/module.sh"
        fi
        if [ -f "${MODULES_DIR}/vault/pki.sh" ]; then
            source "${MODULES_DIR}/vault/pki.sh"
            if type -t module_vault_provision &>/dev/null; then
                if ! module_vault_provision "$code_upper"; then
                    log_error "Vault provisioning failed for $code_upper"
                    return 1
                fi
            else
                log_warn "module_vault_provision not available — run: ./dive vault provision $code_upper"
            fi
        fi
    fi

    # Step 4: Output authorization summary
    log_info "Step 3/3: Authorization complete"
    echo ""
    echo "============================================"
    echo "  SPOKE AUTHORIZATION COMPLETE"
    echo "============================================"
    echo "  Instance:      $code_upper ($name)"
    echo "  Auth Code:     $auth_code"
    echo "  Authorized By: $authorized_by"
    echo "  Authorized At: $authorized_at"
    echo "  Expires At:    $expires_at"
    echo "  Vault Path:    dive-v3/auth/spoke-auth/${code_lower}"
    echo "============================================"
    echo ""
    echo "Next steps (on the spoke machine):"
    echo "  ./dive spoke deploy $code_upper \"$name\" --auth-code $auth_code"
    echo ""
    echo "  The spoke operator will be prompted for this Hub's domain."
    echo "  Auth code is validated by Hub API → auto-federated bidirectional SSO."
    echo ""

    guided_success "Authorization complete!

Send the following to the spoke operator:
  Authorization Code: $auth_code
  Hub Domain:         $(hostname -f 2>/dev/null || echo 'your-hub-domain')

They will run:
  ./dive spoke deploy $code_upper --auth-code $auth_code" 2>/dev/null

    return 0
}

##
# Verify that a spoke is authorized for deployment.
# Called automatically by spoke_deploy before proceeding.
#
# Arguments:
#   $1 - Instance code (e.g., GBR, FRA)
#
# Returns:
#   0 - Authorized and not expired
#   1 - Not authorized or expired
##
spoke_verify_authorization() {
    local code="${1:?Instance code required}"
    local code_lower
    code_lower=$(lower "$code")

    local vault_addr="${VAULT_ADDR:-https://127.0.0.1:8200}"
    local vault_token="${VAULT_TOKEN:-}"

    if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
        vault_token=$(cat "${DIVE_ROOT}/.vault-token")
    fi
    if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
        vault_token=$(grep '^VAULT_TOKEN=' "${DIVE_ROOT}/.env.hub" | cut -d= -f2-)
    fi

    if [ -z "$vault_token" ]; then
        log_warn "VAULT_TOKEN not set — skipping authorization check"
        return 0
    fi

    export VAULT_ADDR="$vault_addr"
    export VAULT_TOKEN="$vault_token"

    # TLS: try CACERT, fall back to VAULT_SKIP_VERIFY
    if [ -z "${VAULT_CACERT:-}" ] && [[ "$vault_addr" == https://* ]]; then
        local _ca_cert="${DIVE_ROOT}/certs/vault/node1/ca.pem"
        if [ -f "$_ca_cert" ]; then
            export VAULT_CACERT="$_ca_cert"
        else
            export VAULT_SKIP_VERIFY=1
        fi
    fi
    # Ensure Vault is reachable (fallback to skip TLS verify)
    if ! vault status >/dev/null 2>&1; then
        unset VAULT_CACERT
        export VAULT_SKIP_VERIFY=1
    fi

    # Read authorization record
    local auth_data
    auth_data=$(vault kv get -format=json "dive-v3/auth/spoke-auth/${code_lower}" 2>/dev/null)
    if [ $? -ne 0 ] || [ -z "$auth_data" ]; then
        log_error "No authorization record found for $code"
        log_error "Run first: ./dive spoke authorize $code"
        return 1
    fi

    local status
    status=$(echo "$auth_data" | jq -r '.data.data.status // "unknown"')
    if [ "$status" != "authorized" ]; then
        log_error "Spoke $code authorization status: $status (expected: authorized)"
        return 1
    fi

    local expires_at
    expires_at=$(echo "$auth_data" | jq -r '.data.data.expires_at // ""')
    if [ -n "$expires_at" ]; then
        local now_epoch expires_epoch
        now_epoch=$(date -u +%s)
        if date --version >/dev/null 2>&1; then
            expires_epoch=$(date -u -d "$expires_at" +%s 2>/dev/null || echo 0)
        else
            expires_epoch=$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$expires_at" +%s 2>/dev/null || echo 0)
        fi
        if [ "$expires_epoch" -gt 0 ] && [ "$now_epoch" -gt "$expires_epoch" ]; then
            log_error "Authorization for $code has expired (expired at: $expires_at)"
            log_error "Re-authorize: ./dive spoke authorize $code"
            return 1
        fi
    fi

    local authorized_by
    authorized_by=$(echo "$auth_data" | jq -r '.data.data.authorized_by // "unknown"')
    log_success "Spoke $code authorized by $authorized_by (expires: $expires_at)"
    return 0
}

##
# Revoke a spoke's authorization.
#
# Arguments:
#   $1 - Instance code (e.g., GBR, FRA)
##
spoke_revoke_authorization() {
    local code="${1:?Instance code required}"
    local code_lower
    code_lower=$(lower "$code")

    local vault_addr="${VAULT_ADDR:-https://127.0.0.1:8200}"
    local vault_token="${VAULT_TOKEN:-}"

    if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.vault-token" ]; then
        vault_token=$(cat "${DIVE_ROOT}/.vault-token")
    fi
    if [ -z "$vault_token" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
        vault_token=$(grep '^VAULT_TOKEN=' "${DIVE_ROOT}/.env.hub" | cut -d= -f2-)
    fi

    export VAULT_ADDR="$vault_addr"
    export VAULT_TOKEN="$vault_token"

    # TLS: use CA cert if available, otherwise skip verification
    if [ -z "${VAULT_CACERT:-}" ] && [[ "$vault_addr" == https://* ]]; then
        local _ca_cert="${DIVE_ROOT}/certs/vault/node1/ca.pem"
        if [ -f "$_ca_cert" ]; then
            export VAULT_CACERT="$_ca_cert"
        else
            export VAULT_SKIP_VERIFY=1
        fi
    fi

    vault kv put "dive-v3/auth/spoke-auth/${code_lower}" \
        status="revoked" \
        revoked_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        revoked_by="${USER:-$(whoami)}" 2>/dev/null

    log_success "Authorization revoked for spoke $code"
}

# Export functions
export -f spoke_authorize spoke_verify_authorization spoke_revoke_authorization 2>/dev/null || true

log_verbose "Spoke authorization module loaded"
