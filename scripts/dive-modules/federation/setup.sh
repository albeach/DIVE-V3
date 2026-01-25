#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Federation Setup Module (Consolidated)
# =============================================================================
# Federation configuration between Hub and Spokes
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - federation.sh, federation-link.sh, federation-setup.sh
#   - federation-mappers.sh
#   - spoke/federation.sh, spoke/pipeline/spoke-federation.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_FEDERATION_SETUP_LOADED" ] && return 0
export DIVE_FEDERATION_SETUP_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

FEDERATION_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$FEDERATION_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# FEDERATION CONFIGURATION
# =============================================================================

# Hub Keycloak configuration
HUB_KC_URL="${HUB_KC_URL:-https://localhost:8443}"
HUB_REALM="${HUB_REALM:-dive-v3-broker}"

# =============================================================================
# ADMIN TOKEN RETRIEVAL
# =============================================================================

##
# Get admin token from Hub Keycloak
#
# Returns:
#   Access token on stdout
##
get_hub_admin_token() {
    local max_retries=15
    local retry_delay=5

    for ((i=1; i<=max_retries; i++)); do
        # Get admin password from GCP or environment
        local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"

        if [ -z "$admin_pass" ] && type get_keycloak_admin_password &>/dev/null; then
            admin_pass=$(get_keycloak_admin_password "HUB" 2>/dev/null || get_keycloak_admin_password "USA" 2>/dev/null)
        fi

        if [ -z "$admin_pass" ]; then
            # Try to get from container environment
            admin_pass=$(docker exec dive-hub-keycloak printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null || \
                        docker exec dive-hub-keycloak printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null)
        fi

        if [ -z "$admin_pass" ]; then
            log_verbose "Attempt $i: Cannot get admin password"
            sleep $retry_delay
            continue
        fi

        local token
        token=$(curl -sf -X POST "${HUB_KC_URL}/realms/master/protocol/openid-connect/token" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "grant_type=password" \
            -d "username=admin" \
            -d "password=${admin_pass}" \
            -d "client_id=admin-cli" \
            --insecure 2>/dev/null | jq -r '.access_token // empty')

        if [ -n "$token" ]; then
            echo "$token"
            return 0
        fi

        log_verbose "Attempt $i: Token retrieval failed, retrying..."
        sleep $retry_delay
    done

    log_error "Failed to get Hub admin token after $max_retries attempts"
    return 1
}

##
# Get admin token from Spoke Keycloak
#
# Arguments:
#   $1 - Instance code
##
get_spoke_admin_token() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    local ports=$(get_instance_ports "$instance_code" 2>/dev/null)
    local kc_port=$(echo "$ports" | jq -r '.keycloak // 8443')
    local spoke_url="https://localhost:${kc_port}"

    # Get admin password
    local admin_pass=""

    if type get_keycloak_admin_password &>/dev/null; then
        admin_pass=$(get_keycloak_admin_password "$instance_code" 2>/dev/null)
    fi

    if [ -z "$admin_pass" ]; then
        admin_pass=$(docker exec "dive-spoke-${code_lower}-keycloak" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null)
    fi

    if [ -z "$admin_pass" ]; then
        log_error "Cannot get Spoke admin password for $instance_code"
        return 1
    fi

    local token
    token=$(curl -sf -X POST "${spoke_url}/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "client_id=admin-cli" \
        --insecure 2>/dev/null | jq -r '.access_token // empty')

    if [ -n "$token" ]; then
        echo "$token"
        return 0
    fi

    log_error "Failed to get Spoke admin token for $instance_code"
    return 1
}

# =============================================================================
# FEDERATION LINK OPERATIONS
# =============================================================================

##
# Link a spoke to the hub (create bidirectional federation)
#
# Arguments:
#   $1 - Spoke instance code
##
federation_link() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Linking $code_upper to Hub federation..."

    # Step 1: Get tokens
    log_info "Step 1: Getting admin tokens..."

    local hub_token=$(get_hub_admin_token)
    if [ -z "$hub_token" ]; then
        log_error "Failed to get Hub admin token"
        return 1
    fi

    local spoke_token=$(get_spoke_admin_token "$instance_code")
    if [ -z "$spoke_token" ]; then
        log_error "Failed to get Spoke admin token"
        return 1
    fi

    # Step 2: Get spoke realm info
    log_info "Step 2: Getting Spoke realm information..."

    local ports=$(get_instance_ports "$instance_code" 2>/dev/null)
    local kc_port=$(echo "$ports" | jq -r '.keycloak // 8443')
    local spoke_url="https://localhost:${kc_port}"
    local spoke_realm="dive-v3-broker-${code_lower}"

    # Step 3: Create IdP on Hub for this Spoke
    log_info "Step 3: Creating IdP on Hub for $code_upper..."

    local idp_alias="${code_lower}-idp"

    local idp_config=$(cat << EOF
{
  "alias": "${idp_alias}",
  "displayName": "${code_upper} Identity Provider",
  "providerId": "oidc",
  "enabled": true,
  "trustEmail": true,
  "storeToken": true,
  "linkOnly": false,
  "firstBrokerLoginFlowAlias": "first broker login",
  "config": {
    "issuer": "${spoke_url}/realms/${spoke_realm}",
    "authorizationUrl": "${spoke_url}/realms/${spoke_realm}/protocol/openid-connect/auth",
    "tokenUrl": "${spoke_url}/realms/${spoke_realm}/protocol/openid-connect/token",
    "userInfoUrl": "${spoke_url}/realms/${spoke_realm}/protocol/openid-connect/userinfo",
    "logoutUrl": "${spoke_url}/realms/${spoke_realm}/protocol/openid-connect/logout",
    "clientId": "dive-hub-federation",
    "clientSecret": "federation-secret-${code_lower}",
    "defaultScope": "openid profile email",
    "syncMode": "FORCE",
    "validateSignature": "true",
    "useJwksUrl": "true",
    "jwksUrl": "${spoke_url}/realms/${spoke_realm}/protocol/openid-connect/certs"
  }
}
EOF
)

    local response
    response=$(curl -sf -X POST "${HUB_KC_URL}/admin/realms/${HUB_REALM}/identity-provider/instances" \
        -H "Authorization: Bearer $hub_token" \
        -H "Content-Type: application/json" \
        -d "$idp_config" \
        --insecure 2>&1)

    if [ $? -eq 0 ]; then
        log_success "IdP created on Hub for $code_upper"
    else
        log_warn "IdP may already exist or failed: $response"
    fi

    # Step 4: Create client on Spoke for Hub federation
    log_info "Step 4: Creating federation client on Spoke..."

    local client_config=$(cat << EOF
{
  "clientId": "dive-hub-federation",
  "enabled": true,
  "publicClient": false,
  "directAccessGrantsEnabled": true,
  "standardFlowEnabled": true,
  "protocol": "openid-connect",
  "redirectUris": [
    "${HUB_KC_URL}/realms/${HUB_REALM}/broker/${idp_alias}/endpoint",
    "${HUB_KC_URL}/realms/${HUB_REALM}/broker/${idp_alias}/endpoint/*"
  ],
  "webOrigins": ["${HUB_KC_URL}"],
  "secret": "federation-secret-${code_lower}"
}
EOF
)

    response=$(curl -sf -X POST "${spoke_url}/admin/realms/${spoke_realm}/clients" \
        -H "Authorization: Bearer $spoke_token" \
        -H "Content-Type: application/json" \
        -d "$client_config" \
        --insecure 2>&1)

    if [ $? -eq 0 ]; then
        log_success "Federation client created on Spoke"
    else
        log_warn "Client may already exist or failed: $response"
    fi

    # Step 5: Create protocol mappers
    log_info "Step 5: Configuring protocol mappers..."
    federation_configure_mappers "$instance_code" "$spoke_token"

    # Step 6: Register in database
    log_info "Step 6: Recording federation in database..."
    if type orch_db_exec &>/dev/null; then
        orch_db_exec "
            INSERT INTO federation_links (hub_realm, spoke_code, spoke_realm, status, created_at)
            VALUES ('${HUB_REALM}', '${code_upper}', '${spoke_realm}', 'ACTIVE', NOW())
            ON CONFLICT (hub_realm, spoke_code) DO UPDATE SET status='ACTIVE', updated_at=NOW()
        " >/dev/null 2>&1 || true
    fi

    log_success "Federation link created for $code_upper"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Federation Link Complete: $code_upper"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Hub IdP Alias:   ${idp_alias}"
    echo "  Spoke Realm:     ${spoke_realm}"
    echo "  Spoke Client:    dive-hub-federation"
    echo ""
    echo "Next: ./dive federation verify $code_upper"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    return 0
}

##
# Unlink a spoke from the hub
#
# Arguments:
#   $1 - Spoke instance code
##
federation_unlink() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_warn "Unlinking $code_upper from Hub federation..."

    local hub_token=$(get_hub_admin_token)
    if [ -z "$hub_token" ]; then
        log_error "Failed to get Hub admin token"
        return 1
    fi

    local idp_alias="${code_lower}-idp"

    # Delete IdP from Hub
    curl -sf -X DELETE "${HUB_KC_URL}/admin/realms/${HUB_REALM}/identity-provider/instances/${idp_alias}" \
        -H "Authorization: Bearer $hub_token" \
        --insecure 2>/dev/null

    # Update database
    if type orch_db_exec &>/dev/null; then
        orch_db_exec "
            UPDATE federation_links SET status='INACTIVE', updated_at=NOW()
            WHERE spoke_code='${code_upper}'
        " >/dev/null 2>&1 || true
    fi

    log_success "Federation link removed for $code_upper"
}

# =============================================================================
# PROTOCOL MAPPERS
# =============================================================================

##
# Configure protocol mappers for federation
#
# Arguments:
#   $1 - Instance code
#   $2 - Admin token
##
federation_configure_mappers() {
    local instance_code="$1"
    local token="$2"
    local code_lower=$(lower "$instance_code")

    local ports=$(get_instance_ports "$instance_code" 2>/dev/null)
    local kc_port=$(echo "$ports" | jq -r '.keycloak // 8443')
    local spoke_url="https://localhost:${kc_port}"
    local spoke_realm="dive-v3-broker-${code_lower}"

    # Get client ID
    local client_id=$(curl -sf "${spoke_url}/admin/realms/${spoke_realm}/clients" \
        -H "Authorization: Bearer $token" \
        --insecure 2>/dev/null | jq -r '.[] | select(.clientId=="dive-hub-federation") | .id')

    if [ -z "$client_id" ]; then
        log_warn "Federation client not found, skipping mapper configuration"
        return 0
    fi

    # Add standard mappers
    local mappers=(
        '{"name":"uniqueID","protocol":"openid-connect","protocolMapper":"oidc-usermodel-attribute-mapper","config":{"user.attribute":"uniqueID","claim.name":"uniqueID","jsonType.label":"String","id.token.claim":"true","access.token.claim":"true","userinfo.token.claim":"true"}}'
        '{"name":"clearance","protocol":"openid-connect","protocolMapper":"oidc-usermodel-attribute-mapper","config":{"user.attribute":"clearance","claim.name":"clearance","jsonType.label":"String","id.token.claim":"true","access.token.claim":"true","userinfo.token.claim":"true"}}'
        '{"name":"countryOfAffiliation","protocol":"openid-connect","protocolMapper":"oidc-usermodel-attribute-mapper","config":{"user.attribute":"countryOfAffiliation","claim.name":"countryOfAffiliation","jsonType.label":"String","id.token.claim":"true","access.token.claim":"true","userinfo.token.claim":"true"}}'
        '{"name":"acpCOI","protocol":"openid-connect","protocolMapper":"oidc-usermodel-attribute-mapper","config":{"user.attribute":"acpCOI","claim.name":"acpCOI","jsonType.label":"JSON","id.token.claim":"true","access.token.claim":"true","userinfo.token.claim":"true","multivalued":"true"}}'
    )

    for mapper in "${mappers[@]}"; do
        curl -sf -X POST "${spoke_url}/admin/realms/${spoke_realm}/clients/${client_id}/protocol-mappers/models" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$mapper" \
            --insecure 2>/dev/null || true
    done

    log_verbose "Protocol mappers configured"
}

# =============================================================================
# FEDERATION STATUS
# =============================================================================

##
# Show overall federation status
##
federation_status() {
    echo "=== Federation Status ==="
    echo ""

    # Check Hub
    echo "Hub:"
    if docker ps --filter "name=dive-hub-keycloak" --filter "health=healthy" -q | grep -q .; then
        echo "  Status: Healthy"

        local hub_token=$(get_hub_admin_token 2>/dev/null)
        if [ -n "$hub_token" ]; then
            local idps=$(curl -sf "${HUB_KC_URL}/admin/realms/${HUB_REALM}/identity-provider/instances" \
                -H "Authorization: Bearer $hub_token" \
                --insecure 2>/dev/null | jq -r '.[].alias' 2>/dev/null)

            if [ -n "$idps" ]; then
                echo "  Linked IdPs:"
                for idp in $idps; do
                    echo "    - $idp"
                done
            else
                echo "  Linked IdPs: None"
            fi
        fi
    else
        echo "  Status: Not healthy or not running"
    fi

    echo ""

    # Check Spokes from database
    if type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        echo "Federation Links (from database):"
        orch_db_exec "
            SELECT spoke_code, spoke_realm, status,
                   to_char(created_at, 'YYYY-MM-DD HH24:MI') as created
            FROM federation_links
            ORDER BY spoke_code
        " 2>/dev/null || echo "  No federation links recorded"
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

##
# Federation module command dispatcher
##
module_federation() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        link)           federation_link "$@" ;;
        unlink)         federation_unlink "$@" ;;
        verify)
            # Load verification module
            if [ -f "${FEDERATION_DIR}/verification.sh" ]; then
                source "${FEDERATION_DIR}/verification.sh"
            fi
            federation_verify "$@"
            ;;
        status)         federation_status "$@" ;;
        list-idps)
            local hub_token=$(get_hub_admin_token 2>/dev/null)
            if [ -n "$hub_token" ]; then
                curl -sf "${HUB_KC_URL}/admin/realms/${HUB_REALM}/identity-provider/instances" \
                    -H "Authorization: Bearer $hub_token" \
                    --insecure 2>/dev/null | jq '.'
            else
                log_error "Cannot get Hub admin token"
            fi
            ;;
        help|*)
            echo "Usage: ./dive federation <command> [args]"
            echo ""
            echo "Commands:"
            echo "  link <CODE>       Link Spoke to Hub federation"
            echo "  unlink <CODE>     Remove federation link"
            echo "  verify <CODE>     Verify federation health"
            echo "  status            Show overall federation status"
            echo "  list-idps         List configured IdPs on Hub"
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f get_hub_admin_token
export -f get_spoke_admin_token
export -f federation_link
export -f federation_unlink
export -f federation_configure_mappers
export -f federation_status
export -f module_federation

log_verbose "Federation setup module loaded (consolidated)"
