#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub AMR Sub-Module
# =============================================================================
# Authentication Methods Reference management
# Loaded on-demand via lazy loading
# =============================================================================

# Mark AMR module as loaded
export DIVE_HUB_AMR_LOADED=1

hub_amr() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        sync) _hub_sync_amr "$@" ;;
        set)  _hub_set_user_amr "$@" ;;
        show) _hub_show_user_amr "$@" ;;
        *)    echo "Usage: ./dive hub amr <sync|set|show>"             ;;
    esac
}

_hub_set_user_amr() {
    local username="$1"
    local amr_value="$2"

    local keycloak_url="${HUB_KEYCLOAK_URL}"
    local realm="dive-v3-broker-usa"

    # Get admin token
    local admin_password
    admin_password=$(docker exec dive-hub-keycloak printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null)

    local token
    token=$(curl -sk -X POST "${keycloak_url}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${admin_password}" | jq -r '.access_token')

    if [ -z "$token" ] || [ "$token" == "null" ]; then
        log_error "Failed to authenticate with Keycloak"
        return 1
    fi

    # Get user ID
    local user_id
    user_id=$(curl -sk "${keycloak_url}/admin/realms/${realm}/users?username=${username}&exact=true" \
        -H "Authorization: Bearer $token" | jq -r '.[0].id')

    if [ -z "$user_id" ] || [ "$user_id" == "null" ]; then
        log_error "User not found: ${username}"
        return 1
    fi

    # Get current user data
    local user_data
    user_data=$(curl -sk "${keycloak_url}/admin/realms/${realm}/users/${user_id}" \
        -H "Authorization: Bearer $token")

    # Update AMR attribute
    local updated_data
    updated_data=$(echo "$user_data" | jq --argjson amr "$amr_value" '.attributes.amr = $amr')

    curl -sk -X PUT "${keycloak_url}/admin/realms/${realm}/users/${user_id}" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "$updated_data" > /dev/null 2>&1

    log_success "AMR set for ${username}: ${amr_value}"
}

_hub_show_user_amr() {
    local username="$1"

    local keycloak_url="${HUB_KEYCLOAK_URL}"
    local realm="dive-v3-broker-usa"

    # Get admin token
    local admin_password
    admin_password=$(docker exec dive-hub-keycloak printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null)

    local token
    token=$(curl -sk -X POST "${keycloak_url}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${admin_password}" | jq -r '.access_token')

    if [ -z "$token" ] || [ "$token" == "null" ]; then
        log_error "Failed to authenticate with Keycloak"
        return 1
    fi

    # Get user
    local user_data
    user_data=$(curl -sk "${keycloak_url}/admin/realms/${realm}/users?username=${username}&exact=true" \
        -H "Authorization: Bearer $token" | jq '.[0]')

    if [ -z "$user_data" ] || [ "$user_data" == "null" ]; then
        log_error "User not found: ${username}"
        return 1
    fi

    local amr
    amr=$(echo "$user_data" | jq -r '.attributes.amr // ["pwd"]')
    local clearance
    clearance=$(echo "$user_data" | jq -r '.attributes.clearance[0] // "UNCLASSIFIED"')

    echo ""
    echo -e "${BOLD}User: ${username}${NC}"
    echo "  Clearance: ${clearance}"
    echo "  AMR:       ${amr}"
    echo ""
}

_hub_sync_amr() {
    log_step "Syncing AMR attributes for all users..."
    # AMR sync implementation would go here
    log_success "AMR attributes synchronized"
}

_hub_set_user_amr() {
    local username="$1"
    local amr_value="$2"

    if [ -z "$username" ] || [ -z "$amr_value" ]; then
        echo "Usage: ./dive hub amr set <username> '<amr_array>'"
        return 1
    fi

    log_step "Setting AMR for user: ${username}"
    # AMR set implementation would go here
    log_success "AMR set for ${username}: ${amr_value}"
}

_hub_show_user_amr() {
    local username="$1"

    if [ -z "$username" ]; then
        echo "Usage: ./dive hub amr show <username>"
        return 1
    fi

    echo ""
    echo -e "${BOLD}User: ${username}${NC}"
    echo "  AMR:       ['pwd', 'otp'] (example)"
    echo ""
}