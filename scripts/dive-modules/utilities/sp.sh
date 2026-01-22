#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 SP Client Module (Consolidated)
# =============================================================================
# Service Provider (SP) client registration and management
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - sp.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_UTILITIES_SP_LOADED" ] && return 0
export DIVE_UTILITIES_SP_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

UTILITIES_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$UTILITIES_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

HUB_KC_URL="${HUB_KC_URL:-https://localhost:8443}"
HUB_REALM="${HUB_REALM:-dive-v3-broker}"

# =============================================================================
# SP CLIENT FUNCTIONS
# =============================================================================

##
# Register a new SP client
#
# Arguments:
#   $1 - Client ID (optional, generated if not provided)
#   $2 - Client name (optional)
##
sp_register() {
    local client_id="${1:-sp-client-$(date +%s)}"
    local client_name="${2:-$client_id}"

    log_info "Registering SP client: $client_id..."

    # Get admin token
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"

    if [ -z "$admin_pass" ]; then
        admin_pass=$(docker exec dive-hub-keycloak printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null)
    fi

    if [ -z "$admin_pass" ]; then
        log_error "Cannot get Keycloak admin password"
        return 1
    fi

    local token
    token=$(curl -sf -X POST "${HUB_KC_URL}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "client_id=admin-cli" \
        --insecure 2>/dev/null | jq -r '.access_token // empty')

    if [ -z "$token" ]; then
        log_error "Failed to get admin token"
        return 1
    fi

    # Generate client secret
    local client_secret=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)

    # Create client configuration
    local client_config=$(cat << EOF
{
  "clientId": "$client_id",
  "name": "$client_name",
  "enabled": true,
  "publicClient": false,
  "protocol": "openid-connect",
  "directAccessGrantsEnabled": true,
  "standardFlowEnabled": true,
  "implicitFlowEnabled": false,
  "serviceAccountsEnabled": true,
  "authorizationServicesEnabled": false,
  "redirectUris": ["*"],
  "webOrigins": ["*"],
  "secret": "$client_secret",
  "attributes": {
    "sp.client.type": "partner",
    "sp.created": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  }
}
EOF
)

    # Create client
    local response
    response=$(curl -sf -X POST "${HUB_KC_URL}/admin/realms/${HUB_REALM}/clients" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "$client_config" \
        --insecure 2>&1)

    if [ $? -eq 0 ]; then
        log_success "SP client registered: $client_id"
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "SP Client Credentials"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  Client ID:     $client_id"
        echo "  Client Secret: $client_secret"
        echo "  Token URL:     ${HUB_KC_URL}/realms/${HUB_REALM}/protocol/openid-connect/token"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "Save these credentials securely!"
        return 0
    else
        log_error "Failed to register SP client: $response"
        return 1
    fi
}

##
# List all SP clients
##
sp_list() {
    log_info "Listing SP clients..."

    # Get admin token
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"

    if [ -z "$admin_pass" ]; then
        admin_pass=$(docker exec dive-hub-keycloak printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null)
    fi

    local token
    token=$(curl -sf -X POST "${HUB_KC_URL}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "client_id=admin-cli" \
        --insecure 2>/dev/null | jq -r '.access_token // empty')

    if [ -z "$token" ]; then
        log_error "Failed to get admin token"
        return 1
    fi

    echo "=== SP Clients ==="
    echo ""

    curl -sf "${HUB_KC_URL}/admin/realms/${HUB_REALM}/clients" \
        -H "Authorization: Bearer $token" \
        --insecure 2>/dev/null | \
        jq -r '.[] | select(.attributes["sp.client.type"] == "partner") | "\(.clientId)\t\(.name // "N/A")\t\(.enabled)"' | \
        column -t -s $'\t'
}

##
# Show SP client status
#
# Arguments:
#   $1 - Client ID
##
sp_status() {
    local client_id="$1"

    if [ -z "$client_id" ]; then
        sp_list
        return
    fi

    log_info "Getting status for SP client: $client_id..."

    # Get admin token
    local admin_pass=$(docker exec dive-hub-keycloak printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null)

    local token
    token=$(curl -sf -X POST "${HUB_KC_URL}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "client_id=admin-cli" \
        --insecure 2>/dev/null | jq -r '.access_token // empty')

    if [ -z "$token" ]; then
        log_error "Failed to get admin token"
        return 1
    fi

    local client_info
    client_info=$(curl -sf "${HUB_KC_URL}/admin/realms/${HUB_REALM}/clients" \
        -H "Authorization: Bearer $token" \
        --insecure 2>/dev/null | jq ".[] | select(.clientId==\"$client_id\")")

    if [ -z "$client_info" ]; then
        log_error "Client not found: $client_id"
        return 1
    fi

    echo "=== SP Client: $client_id ==="
    echo "$client_info" | jq '.'
}

##
# Show SP client credentials
#
# Arguments:
#   $1 - Client ID
##
sp_credentials() {
    local client_id="$1"

    if [ -z "$client_id" ]; then
        log_error "Client ID required"
        return 1
    fi

    log_info "Getting credentials for SP client: $client_id..."

    # Get admin token
    local admin_pass=$(docker exec dive-hub-keycloak printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null)

    local token
    token=$(curl -sf -X POST "${HUB_KC_URL}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "client_id=admin-cli" \
        --insecure 2>/dev/null | jq -r '.access_token // empty')

    if [ -z "$token" ]; then
        log_error "Failed to get admin token"
        return 1
    fi

    # Get client internal ID
    local internal_id
    internal_id=$(curl -sf "${HUB_KC_URL}/admin/realms/${HUB_REALM}/clients" \
        -H "Authorization: Bearer $token" \
        --insecure 2>/dev/null | jq -r ".[] | select(.clientId==\"$client_id\") | .id")

    if [ -z "$internal_id" ]; then
        log_error "Client not found: $client_id"
        return 1
    fi

    # Get client secret
    local secret
    secret=$(curl -sf "${HUB_KC_URL}/admin/realms/${HUB_REALM}/clients/${internal_id}/client-secret" \
        -H "Authorization: Bearer $token" \
        --insecure 2>/dev/null | jq -r '.value // empty')

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "SP Client Credentials"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Client ID:     $client_id"
    echo "  Client Secret: ${secret:-[regenerate required]}"
    echo "  Token URL:     ${HUB_KC_URL}/realms/${HUB_REALM}/protocol/openid-connect/token"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

##
# Delete SP client
#
# Arguments:
#   $1 - Client ID
##
sp_delete() {
    local client_id="$1"

    if [ -z "$client_id" ]; then
        log_error "Client ID required"
        return 1
    fi

    log_warn "Deleting SP client: $client_id..."

    # Get admin token
    local admin_pass=$(docker exec dive-hub-keycloak printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null)

    local token
    token=$(curl -sf -X POST "${HUB_KC_URL}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "client_id=admin-cli" \
        --insecure 2>/dev/null | jq -r '.access_token // empty')

    if [ -z "$token" ]; then
        log_error "Failed to get admin token"
        return 1
    fi

    # Get client internal ID
    local internal_id
    internal_id=$(curl -sf "${HUB_KC_URL}/admin/realms/${HUB_REALM}/clients" \
        -H "Authorization: Bearer $token" \
        --insecure 2>/dev/null | jq -r ".[] | select(.clientId==\"$client_id\") | .id")

    if [ -z "$internal_id" ]; then
        log_error "Client not found: $client_id"
        return 1
    fi

    # Delete client
    curl -sf -X DELETE "${HUB_KC_URL}/admin/realms/${HUB_REALM}/clients/${internal_id}" \
        -H "Authorization: Bearer $token" \
        --insecure 2>/dev/null

    log_success "SP client deleted: $client_id"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

##
# SP module command dispatcher
##
module_sp() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        register)     sp_register "$@" ;;
        list)         sp_list "$@" ;;
        status)       sp_status "$@" ;;
        credentials)  sp_credentials "$@" ;;
        delete)       sp_delete "$@" ;;
        help|*)
            echo "Usage: ./dive sp <command> [args]"
            echo ""
            echo "Commands:"
            echo "  register [id] [name]   Register new SP client"
            echo "  list                   List all SP clients"
            echo "  status [id]            Show SP client status"
            echo "  credentials <id>       Show SP client credentials"
            echo "  delete <id>            Delete SP client"
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f sp_register
export -f sp_list
export -f sp_status
export -f sp_credentials
export -f sp_delete
export -f module_sp

log_verbose "SP client module loaded"
