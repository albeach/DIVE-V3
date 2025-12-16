#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Federation Setup Module
# =============================================================================
# Commands: setup-spoke, sync-secrets, configure-idp
# 
# Handles post-deployment federation configuration:
# - Creates spoke client in Hub Keycloak
# - Retrieves client secrets from Hub
# - Configures usa-idp in spoke Keycloak with correct secret
# - Updates spoke .env with correct frontend secrets
# 
# This module eliminates the need for post-deployment fix scripts.
# =============================================================================
# Version: 1.0.0
# Date: 2025-12-15
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load NATO countries database for port offsets
if [ -z "$NATO_COUNTRIES_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../nato-countries.sh" 2>/dev/null || true
    export NATO_COUNTRIES_LOADED=1
fi

# =============================================================================
# CONSTANTS
# =============================================================================

HUB_KEYCLOAK_CONTAINER="dive-hub-keycloak"
HUB_BACKEND_CONTAINER="dive-hub-backend"
HUB_REALM="dive-v3-broker"

# =============================================================================
# KEYCLOAK ADMIN API HELPERS
# =============================================================================

##
# Get Keycloak admin token for Hub
# 
# Arguments:
#   $1 - Admin password (optional, reads from .env if not provided)
# 
# Outputs:
#   Access token on success
# 
# Returns:
#   0 - Success
#   1 - Failed to authenticate
##
get_hub_admin_token() {
    ensure_dive_root
    local admin_pass="${1:-}"
    
    # Get password from .env if not provided
    if [ -z "$admin_pass" ]; then
        # Try multiple locations for Hub secrets:
        # 1. .env.hub (main Hub secrets file)
        # 2. instances/usa/.env
        # 3. instances/hub/.env
        # 4. .env.local
        local hub_files=(
            "${DIVE_ROOT}/.env.hub"
            "${DIVE_ROOT}/instances/usa/.env"
            "${DIVE_ROOT}/instances/hub/.env"
            "${DIVE_ROOT}/.env.local"
        )
        
        for hub_env in "${hub_files[@]}"; do
            if [ -f "$hub_env" ]; then
                # Try KEYCLOAK_ADMIN_PASSWORD first, then KEYCLOAK_ADMIN_PASSWORD_USA
                admin_pass=$(grep -E '^KEYCLOAK_ADMIN_PASSWORD=' "$hub_env" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
                if [ -z "$admin_pass" ]; then
                    admin_pass=$(grep -E '^KEYCLOAK_ADMIN_PASSWORD_USA=' "$hub_env" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
                fi
                if [ -n "$admin_pass" ]; then
                    break
                fi
            fi
        done
    fi
    
    if [ -z "$admin_pass" ]; then
        log_error "Could not find Hub Keycloak admin password"
        return 1
    fi
    
    # Try to get token via backend container (Docker network access)
    local token
    token=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s -X POST \
        'http://dive-hub-keycloak:8080/realms/master/protocol/openid-connect/token' \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "grant_type=password" 2>/dev/null | jq -r '.access_token')
    
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        # Fallback: Try direct connection
        token=$(curl -s -k -X POST \
            'https://localhost:8443/realms/master/protocol/openid-connect/token' \
            -d "client_id=admin-cli" \
            -d "username=admin" \
            -d "password=${admin_pass}" \
            -d "grant_type=password" 2>/dev/null | jq -r '.access_token')
    fi
    
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_error "Failed to authenticate with Hub Keycloak"
        return 1
    fi
    
    echo "$token"
}

##
# Get Keycloak admin token for a spoke
# 
# Arguments:
#   $1 - Spoke code (e.g., alb, bel)
#   $2 - Admin password (optional, reads from .env if not provided)
# 
# Outputs:
#   Access token on success
# 
# Returns:
#   0 - Success
#   1 - Failed to authenticate
##
get_spoke_admin_token() {
    local spoke_code="${1:?Spoke code required}"
    local admin_pass="${2:-}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")
    
    ensure_dive_root
    
    # Get password from .env if not provided
    if [ -z "$admin_pass" ]; then
        local spoke_env="${DIVE_ROOT}/instances/${code_lower}/.env"
        if [ -f "$spoke_env" ]; then
            admin_pass=$(grep -E "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$spoke_env" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        fi
    fi
    
    if [ -z "$admin_pass" ]; then
        log_error "Could not find spoke Keycloak admin password for $code_upper"
        return 1
    fi
    
    # Get token via spoke backend container
    local backend_container="${code_lower}-backend-${code_lower}-1"
    local keycloak_host="keycloak-${code_lower}"
    
    local token
    token=$(docker exec "$backend_container" curl -s -X POST \
        "http://${keycloak_host}:8080/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "grant_type=password" 2>/dev/null | jq -r '.access_token')
    
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_error "Failed to authenticate with spoke Keycloak for $code_upper"
        return 1
    fi
    
    echo "$token"
}

# =============================================================================
# CLIENT MANAGEMENT
# =============================================================================

##
# Get client secret from Hub Keycloak for a spoke client
# 
# Arguments:
#   $1 - Spoke code (e.g., alb, bel)
# 
# Outputs:
#   Client secret on success
# 
# Returns:
#   0 - Success
#   1 - Failed
##
get_hub_client_secret() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    
    local client_id="dive-v3-client-${code_lower}"
    
    # Get admin token
    local token
    token=$(get_hub_admin_token) || return 1
    
    # Get client UUID
    local client_uuid
    client_uuid=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s \
        "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/clients?clientId=${client_id}" \
        -H "Authorization: Bearer ${token}" 2>/dev/null | jq -r '.[0].id')
    
    if [ -z "$client_uuid" ] || [ "$client_uuid" = "null" ]; then
        log_error "Client not found in Hub: $client_id"
        return 1
    fi
    
    # Get client secret
    local secret
    secret=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s \
        "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/clients/${client_uuid}/client-secret" \
        -H "Authorization: Bearer ${token}" 2>/dev/null | jq -r '.value')
    
    if [ -z "$secret" ] || [ "$secret" = "null" ]; then
        log_error "Failed to get client secret from Hub"
        return 1
    fi
    
    echo "$secret"
}

##
# Get local client secret from spoke Keycloak
# 
# Arguments:
#   $1 - Spoke code (e.g., alb, bel)
# 
# Outputs:
#   Client secret on success
# 
# Returns:
#   0 - Success
#   1 - Failed
##
get_spoke_local_client_secret() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")
    
    local client_id="dive-v3-client-${code_lower}"
    local realm="dive-v3-broker-${code_lower}"
    
    # Get admin token
    local token
    token=$(get_spoke_admin_token "$spoke_code") || return 1
    
    local backend_container="${code_lower}-backend-${code_lower}-1"
    local keycloak_host="keycloak-${code_lower}"
    
    # Get client UUID
    local client_uuid
    client_uuid=$(docker exec "$backend_container" curl -s \
        "http://${keycloak_host}:8080/admin/realms/${realm}/clients?clientId=${client_id}" \
        -H "Authorization: Bearer ${token}" 2>/dev/null | jq -r '.[0].id')
    
    if [ -z "$client_uuid" ] || [ "$client_uuid" = "null" ]; then
        log_error "Client not found in spoke: $client_id"
        return 1
    fi
    
    # Get client secret
    local secret
    secret=$(docker exec "$backend_container" curl -s \
        "http://${keycloak_host}:8080/admin/realms/${realm}/clients/${client_uuid}/client-secret" \
        -H "Authorization: Bearer ${token}" 2>/dev/null | jq -r '.value')
    
    if [ -z "$secret" ] || [ "$secret" = "null" ]; then
        log_error "Failed to get local client secret from spoke"
        return 1
    fi
    
    echo "$secret"
}

# =============================================================================
# IDP CONFIGURATION
# =============================================================================

##
# Configure usa-idp in spoke Keycloak with correct Hub client secret
# 
# This is the critical step that fixes federation!
# The usa-idp needs the secret of dive-v3-client-{spoke} from the Hub.
# 
# Arguments:
#   $1 - Spoke code (e.g., alb, bel)
# 
# Returns:
#   0 - Success
#   1 - Failed
##
configure_usa_idp_in_spoke() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")
    
    log_step "Configuring usa-idp in spoke ${code_upper}..."
    
    # Step 1: Get Hub client secret for this spoke
    log_verbose "Getting client secret from Hub for dive-v3-client-${code_lower}..."
    local hub_client_secret
    hub_client_secret=$(get_hub_client_secret "$spoke_code") || return 1
    log_verbose "Retrieved Hub client secret: ${hub_client_secret:0:8}..."
    
    # Step 2: Get spoke admin token
    local token
    token=$(get_spoke_admin_token "$spoke_code") || return 1
    
    local backend_container="${code_lower}-backend-${code_lower}-1"
    local keycloak_host="keycloak-${code_lower}"
    local realm="dive-v3-broker-${code_lower}"
    local client_id="dive-v3-client-${code_lower}"
    
    # Step 3: Update usa-idp configuration
    log_verbose "Updating usa-idp configuration in spoke Keycloak..."
    
    local idp_config
    idp_config=$(cat <<EOF
{
    "alias": "usa-idp",
    "providerId": "oidc",
    "enabled": true,
    "displayName": "United States",
    "config": {
        "clientId": "${client_id}",
        "clientSecret": "${hub_client_secret}",
        "tokenUrl": "https://dive-hub-keycloak:8443/realms/${HUB_REALM}/protocol/openid-connect/token",
        "authorizationUrl": "https://localhost:8443/realms/${HUB_REALM}/protocol/openid-connect/auth?kc_idp_hint=",
        "logoutUrl": "https://dive-hub-keycloak:8443/realms/${HUB_REALM}/protocol/openid-connect/logout",
        "backchannelSupported": "true",
        "useJwksUrl": "true",
        "jwksUrl": "https://dive-hub-keycloak:8443/realms/${HUB_REALM}/protocol/openid-connect/certs",
        "validateSignature": "true",
        "pkceEnabled": "true",
        "pkceMethod": "S256"
    }
}
EOF
)
    
    local result
    result=$(docker exec "$backend_container" curl -s -X PUT \
        "http://${keycloak_host}:8080/admin/realms/${realm}/identity-provider/instances/usa-idp" \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d "$idp_config" 2>&1)
    
    # Check for success (empty response on success, error message on failure)
    if [ -z "$result" ] || echo "$result" | grep -q '"alias":"usa-idp"'; then
        log_success "usa-idp configured with Hub client secret"
        return 0
    else
        log_error "Failed to update usa-idp: $result"
        return 1
    fi
}

# =============================================================================
# ENVIRONMENT FILE MANAGEMENT
# =============================================================================

##
# Update spoke .env file with correct client secrets
# 
# Arguments:
#   $1 - Spoke code (e.g., alb, bel)
# 
# Returns:
#   0 - Success
#   1 - Failed
##
sync_spoke_env_secrets() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")
    
    ensure_dive_root
    local spoke_env="${DIVE_ROOT}/instances/${code_lower}/.env"
    
    log_step "Syncing secrets to spoke .env file..."
    
    if [ ! -f "$spoke_env" ]; then
        log_error "Spoke .env file not found: $spoke_env"
        return 1
    fi
    
    # Get local client secret from spoke Keycloak
    # (This is what the frontend needs to authenticate)
    local local_secret
    local_secret=$(get_spoke_local_client_secret "$spoke_code") || return 1
    log_verbose "Retrieved local client secret: ${local_secret:0:8}..."
    
    # Backup .env file
    cp "$spoke_env" "${spoke_env}.bak.$(date +%Y%m%d-%H%M%S)"
    
    # Update KEYCLOAK_CLIENT_SECRET_{CODE} in .env
    local secret_var="KEYCLOAK_CLIENT_SECRET_${code_upper}"
    
    if grep -q "^${secret_var}=" "$spoke_env"; then
        # Update existing variable
        sed -i.tmp "s/^${secret_var}=.*/${secret_var}=${local_secret}/" "$spoke_env"
        rm -f "${spoke_env}.tmp"
        log_success "Updated $secret_var in .env"
    else
        # Add variable
        echo "${secret_var}=${local_secret}" >> "$spoke_env"
        log_success "Added $secret_var to .env"
    fi
    
    return 0
}

##
# Recreate spoke frontend to load updated .env secrets
# 
# IMPORTANT: docker restart does NOT reload .env files!
# Must use docker-compose up --force-recreate to apply new secrets.
# 
# Arguments:
#   $1 - Spoke code (e.g., alb, bel)
# 
# Returns:
#   0 - Success
#   1 - Failed
##
recreate_spoke_frontend() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    
    ensure_dive_root
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    
    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke directory not found: $spoke_dir"
        return 1
    fi
    
    log_verbose "Recreating frontend for ${code_lower} to load new secrets..."
    
    # Use docker-compose up --force-recreate to reload .env
    # This is required because docker restart doesn't reload environment variables
    if (cd "$spoke_dir" && docker compose up -d --force-recreate "frontend-${code_lower}" 2>&1 | grep -v "Running\|Waiting\|Healthy" | head -5); then
        # Wait for frontend to be ready
        sleep 5
        
        # Verify the secret was loaded correctly
        local container_secret
        container_secret=$(docker exec "${code_lower}-frontend-${code_lower}-1" printenv KEYCLOAK_CLIENT_SECRET 2>/dev/null || echo "")
        
        if [ -n "$container_secret" ]; then
            log_verbose "Frontend now has secret: ${container_secret:0:8}..."
            return 0
        else
            log_warn "Could not verify frontend secret"
            return 0  # Still return success - frontend was recreated
        fi
    else
        log_error "Failed to recreate frontend container"
        return 1
    fi
}

# =============================================================================
# REDIRECT URI MANAGEMENT
# =============================================================================

##
# Get spoke ports using centralized NATO port mapping
# 
# Uses the NATO_PORT_OFFSETS array loaded at module init
# Port convention:
#   Frontend:  3000 + offset
#   Backend:   4000 + offset
#   Keycloak:  8443 + offset
# 
# Arguments:
#   $1 - Spoke code (e.g., alb, bel)
# 
# Outputs:
#   Sets SPOKE_FRONTEND_PORT, SPOKE_KEYCLOAK_HTTPS_PORT, etc.
##
_get_spoke_ports_fed() {
    local code="${1^^}"
    local code_lower="${code,,}"
    
    # First, try to read actual ports from docker-compose.yml (source of truth)
    local compose_file="${DIVE_ROOT}/instances/${code_lower}/docker-compose.yml"
    
    if [ -f "$compose_file" ]; then
        # Extract actual ports from docker-compose.yml
        local frontend_port
        local backend_port
        local kc_https_port
        local kc_http_port
        
        frontend_port=$(grep -E "^\s+-\s+\"[0-9]+:3000\"" "$compose_file" | head -1 | sed 's/.*"\([0-9]*\):3000".*/\1/')
        backend_port=$(grep -E "^\s+-\s+\"[0-9]+:4000\"" "$compose_file" | head -1 | sed 's/.*"\([0-9]*\):4000".*/\1/')
        kc_https_port=$(grep -E "^\s+-\s+\"[0-9]+:8443\"" "$compose_file" | head -1 | sed 's/.*"\([0-9]*\):8443".*/\1/')
        kc_http_port=$(grep -E "^\s+-\s+\"[0-9]+:8080\"" "$compose_file" | head -1 | sed 's/.*"\([0-9]*\):8080".*/\1/')
        
        if [ -n "$frontend_port" ] && [ -n "$kc_https_port" ]; then
            # Calculate offset from frontend port
            local port_offset=$((frontend_port - 3000))
            echo "SPOKE_PORT_OFFSET=$port_offset"
            echo "SPOKE_FRONTEND_PORT=${frontend_port}"
            echo "SPOKE_BACKEND_PORT=${backend_port:-$((4000 + port_offset))}"
            echo "SPOKE_KEYCLOAK_HTTPS_PORT=${kc_https_port}"
            echo "SPOKE_KEYCLOAK_HTTP_PORT=${kc_http_port:-$((8080 + port_offset))}"
            return 0
        fi
    fi
    
    # Fallback: calculate from NATO offsets for new/uninitialized spokes
    local port_offset=0
    if [[ -v NATO_PORT_OFFSETS[$code] ]]; then
        port_offset="${NATO_PORT_OFFSETS[$code]}"
    elif type -t get_country_offset &>/dev/null; then
        port_offset=$(get_country_offset "$code" 2>/dev/null || echo "0")
    fi
    
    echo "SPOKE_PORT_OFFSET=$port_offset"
    echo "SPOKE_FRONTEND_PORT=$((3000 + port_offset))"
    echo "SPOKE_BACKEND_PORT=$((4000 + port_offset))"
    echo "SPOKE_KEYCLOAK_HTTPS_PORT=$((8443 + port_offset))"
    echo "SPOKE_KEYCLOAK_HTTP_PORT=$((8080 + port_offset))"
}

##
# Update redirect URIs for spoke Keycloak client (add external frontend port)
# 
# The spoke's Keycloak client needs redirect URIs for:
# - Internal container port (3000)
# - External host port (3000 + offset)
# - Production domain
# 
# Arguments:
#   $1 - Spoke code (e.g., alb, bel)
# 
# Returns:
#   0 - Success
#   1 - Failed
##
update_spoke_client_redirect_uris() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")
    
    log_verbose "Updating spoke Keycloak client redirect URIs for ${code_upper}..."
    
    # Get spoke ports
    eval "$(_get_spoke_ports_fed "$code_upper")"
    local frontend_port=$SPOKE_FRONTEND_PORT
    
    # Get spoke admin token
    local token
    token=$(get_spoke_admin_token "$spoke_code") || return 1
    
    local backend_container="${code_lower}-backend-${code_lower}-1"
    local keycloak_host="keycloak-${code_lower}"
    local realm="dive-v3-broker-${code_lower}"
    local client_id="dive-v3-client-${code_lower}"
    
    # Get client UUID
    local client_uuid
    client_uuid=$(docker exec "$backend_container" curl -s \
        "http://${keycloak_host}:8080/admin/realms/${realm}/clients?clientId=${client_id}" \
        -H "Authorization: Bearer ${token}" 2>/dev/null | jq -r '.[0].id')
    
    if [ -z "$client_uuid" ] || [ "$client_uuid" = "null" ]; then
        log_warn "Spoke client not found: $client_id"
        return 1
    fi
    
    # Build redirect URIs array
    local redirect_uris="[
        \"https://${code_lower}-app.dive25.com/*\",
        \"https://localhost:3000/*\",
        \"https://localhost:3000\",
        \"https://localhost:3000/api/auth/callback/keycloak\",
        \"https://localhost:${frontend_port}/*\",
        \"https://localhost:${frontend_port}\",
        \"https://localhost:${frontend_port}/api/auth/callback/keycloak\"
    ]"
    
    # Update client
    local result
    result=$(docker exec "$backend_container" curl -s -o /dev/null -w "%{http_code}" -X PUT \
        "http://${keycloak_host}:8080/admin/realms/${realm}/clients/${client_uuid}" \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d "{\"redirectUris\": $redirect_uris}" 2>/dev/null)
    
    if [ "$result" = "204" ]; then
        log_success "Spoke client redirect URIs updated (frontend port: $frontend_port)"
        return 0
    else
        log_warn "Failed to update spoke client (HTTP $result)"
        return 1
    fi
}

##
# Update redirect URIs for Hub client (add spoke Keycloak broker endpoint)
# 
# The Hub's client for the spoke needs redirect URIs for:
# - Spoke's broker endpoint at external HTTPS port
# - Production domain
# 
# Arguments:
#   $1 - Spoke code (e.g., alb, bel)
# 
# Returns:
#   0 - Success
#   1 - Failed
##
update_hub_client_redirect_uris() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")
    
    log_verbose "Updating Hub client redirect URIs for ${code_upper}..."
    
    # Get spoke ports
    eval "$(_get_spoke_ports_fed "$code_upper")"
    local kc_https_port=$SPOKE_KEYCLOAK_HTTPS_PORT
    
    # Get Hub admin token
    local token
    token=$(get_hub_admin_token) || return 1
    
    local client_id="dive-v3-client-${code_lower}"
    
    # Get client UUID from Hub
    local client_uuid
    client_uuid=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s \
        "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/clients?clientId=${client_id}" \
        -H "Authorization: Bearer ${token}" 2>/dev/null | jq -r '.[0].id')
    
    if [ -z "$client_uuid" ] || [ "$client_uuid" = "null" ]; then
        log_warn "Hub client not found: $client_id"
        return 1
    fi
    
    # Build redirect URIs array for federation broker
    local redirect_uris="[
        \"https://localhost:${kc_https_port}/realms/dive-v3-broker-${code_lower}/broker/usa-idp/endpoint\",
        \"https://localhost:${kc_https_port}/*\",
        \"https://${code_lower}-idp.dive25.com/*\",
        \"https://${code_lower}-idp.dive25.com/realms/dive-v3-broker-${code_lower}/broker/usa-idp/endpoint\"
    ]"
    
    # Update client
    local result
    result=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s -o /dev/null -w "%{http_code}" -X PUT \
        "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/clients/${client_uuid}" \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d "{\"redirectUris\": $redirect_uris}" 2>/dev/null)
    
    if [ "$result" = "204" ]; then
        log_success "Hub client redirect URIs updated (spoke Keycloak port: $kc_https_port)"
        return 0
    else
        log_warn "Failed to update Hub client (HTTP $result)"
        return 1
    fi
}

# =============================================================================
# COMPLETE FEDERATION SETUP
# =============================================================================

##
# Complete federation setup for a spoke
# 
# This is the main entry point called after Keycloak is healthy.
# It handles all Keycloak-related federation configuration:
# 1. Configure usa-idp with correct Hub client secret
# 2. Sync frontend .env with correct local client secret
# 
# Arguments:
#   $1 - Spoke code (e.g., alb, bel)
# 
# Returns:
#   0 - All steps successful
#   1 - One or more steps failed
##
configure_spoke_federation() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")
    
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  FEDERATION CONFIGURATION: ${code_upper}${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    local failed=0
    
    # Step 1: Configure usa-idp with Hub client secret
    log_step "Step 1/4: Configuring usa-idp with Hub client secret..."
    if configure_usa_idp_in_spoke "$spoke_code"; then
        log_success "usa-idp configured"
    else
        log_error "Failed to configure usa-idp"
        failed=$((failed + 1))
    fi
    
    # Step 2: Update spoke client redirect URIs (add external frontend port)
    log_step "Step 2/4: Updating spoke client redirect URIs..."
    if update_spoke_client_redirect_uris "$spoke_code"; then
        log_success "Spoke client URIs updated"
    else
        log_warn "Failed to update spoke client URIs"
        failed=$((failed + 1))
    fi
    
    # Step 3: Update Hub client redirect URIs (add spoke Keycloak broker port)
    log_step "Step 3/4: Updating Hub client redirect URIs..."
    if update_hub_client_redirect_uris "$spoke_code"; then
        log_success "Hub client URIs updated"
    else
        log_warn "Failed to update Hub client URIs"
        failed=$((failed + 1))
    fi
    
    # Step 4: Sync frontend .env secrets
    log_step "Step 4/5: Syncing frontend .env secrets..."
    if sync_spoke_env_secrets "$spoke_code"; then
        log_success "Frontend secrets synced"
    else
        log_warn "Failed to sync frontend secrets"
        failed=$((failed + 1))
    fi
    
    # Step 5: Recreate frontend to load new secrets
    # Note: docker restart doesn't reload .env - must use docker-compose up --force-recreate
    log_step "Step 5/5: Recreating frontend to load new secrets..."
    if recreate_spoke_frontend "$spoke_code"; then
        log_success "Frontend recreated with new secrets"
    else
        log_warn "Failed to recreate frontend"
        failed=$((failed + 1))
    fi
    
    # Summary
    echo ""
    if [ $failed -eq 0 ]; then
        log_success "Federation configured successfully!"
        echo ""
        echo "  ✓ usa-idp has correct Hub client secret"
        echo "  ✓ Spoke client has correct redirect URIs (frontend port)"
        echo "  ✓ Hub client has correct redirect URIs (broker endpoint)"
        echo "  ✓ Frontend .env has correct local client secret"
        echo "  ✓ Frontend recreated with new secrets"
        echo ""
        return 0
    else
        log_warn "Federation setup completed with $failed warning(s)"
        echo ""
        echo "  Some steps had issues. Check logs and verify manually."
        echo ""
        return 1
    fi
}

##
# Verify federation configuration for a spoke
# 
# Arguments:
#   $1 - Spoke code (e.g., alb, bel)
# 
# Returns:
#   0 - All checks pass
#   1 - One or more checks failed
##
verify_spoke_federation() {
    local spoke_code="${1:-}"
    
    if [ -z "$spoke_code" ]; then
        log_error "Usage: ./dive federation-setup verify <spoke-code>"
        return 1
    fi
    
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")
    
    echo ""
    echo -e "${BOLD}Federation Verification: ${code_upper}${NC}"
    echo ""
    
    local passed=0
    local failed=0
    
    # Check 1: Hub Keycloak running
    echo -n "  Hub Keycloak running:       "
    if docker ps --format '{{.Names}}' | grep -q "^${HUB_KEYCLOAK_CONTAINER}$"; then
        echo -e "${GREEN}✓${NC}"
        passed=$((passed + 1))
    else
        echo -e "${RED}✗${NC}"
        failed=$((failed + 1))
    fi
    
    # Check 2: Spoke Keycloak running
    echo -n "  Spoke Keycloak running:     "
    local spoke_kc="${code_lower}-keycloak-${code_lower}-1"
    if docker ps --format '{{.Names}}' | grep -q "^${spoke_kc}$"; then
        echo -e "${GREEN}✓${NC}"
        passed=$((passed + 1))
    else
        echo -e "${RED}✗${NC}"
        failed=$((failed + 1))
    fi
    
    # Check 3: Can get Hub admin token
    echo -n "  Hub Keycloak auth:          "
    if get_hub_admin_token >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        passed=$((passed + 1))
    else
        echo -e "${RED}✗${NC}"
        failed=$((failed + 1))
    fi
    
    # Check 4: Can get spoke admin token
    echo -n "  Spoke Keycloak auth:        "
    if get_spoke_admin_token "$spoke_code" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        passed=$((passed + 1))
    else
        echo -e "${RED}✗${NC}"
        failed=$((failed + 1))
    fi
    
    # Check 5: Hub client exists for spoke
    echo -n "  Hub client exists:          "
    if get_hub_client_secret "$spoke_code" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        passed=$((passed + 1))
    else
        echo -e "${RED}✗${NC}"
        failed=$((failed + 1))
    fi
    
    # Check 6: Spoke local client exists
    echo -n "  Spoke local client:         "
    if get_spoke_local_client_secret "$spoke_code" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        passed=$((passed + 1))
    else
        echo -e "${RED}✗${NC}"
        failed=$((failed + 1))
    fi
    
    echo ""
    echo "  Result: $passed passed, $failed failed"
    echo ""
    
    if [ $failed -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

##
# Verify federation for all spokes
# 
# Arguments:
#   None (operates on all known spokes)
# 
# Returns:
#   0 - All spokes pass
#   1 - At least one spoke failed
##
verify_all_federation() {
    ensure_dive_root
    
    echo ""
    echo -e "${BOLD}Federation Verification: All Spokes${NC}"
    echo ""
    
    local spokes_ok=0
    local spokes_fail=0
    
    # Check Hub Keycloak first
    echo -n "  Hub Keycloak running: "
    if docker ps --format '{{.Names}}' | grep -q "^${HUB_KEYCLOAK_CONTAINER}$"; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        echo ""
        log_error "Hub Keycloak not running - cannot verify federation"
        return 1
    fi
    
    echo ""
    printf "  %-10s  %-8s  %-8s  %-10s  %-10s\n" "SPOKE" "KEYCLOAK" "AUTH" "HUB-CLI" "STATUS"
    echo "  ──────────────────────────────────────────────────────────────"
    
    # Get all spoke directories
    for dir in "${DIVE_ROOT}"/instances/*/; do
        local spoke
        spoke=$(basename "$dir")
        # Skip hub and usa
        if [[ "$spoke" != "hub" && "$spoke" != "usa" && "$spoke" != "shared" && -d "$dir" ]]; then
            local kc_ok="✗"
            local auth_ok="✗"
            local client_ok="✗"
            local status="${RED}FAIL${NC}"
            
            # Check spoke Keycloak running
            local spoke_kc="${spoke}-keycloak-${spoke}-1"
            if docker ps --format '{{.Names}}' | grep -q "^${spoke_kc}$"; then
                kc_ok="${GREEN}✓${NC}"
            fi
            
            # Check spoke auth
            if get_spoke_admin_token "$spoke" >/dev/null 2>&1; then
                auth_ok="${GREEN}✓${NC}"
            fi
            
            # Check Hub client exists
            if get_hub_client_secret "$spoke" >/dev/null 2>&1; then
                client_ok="${GREEN}✓${NC}"
            fi
            
            # Overall status
            if docker ps --format '{{.Names}}' | grep -q "^${spoke_kc}$" && \
               get_spoke_admin_token "$spoke" >/dev/null 2>&1 && \
               get_hub_client_secret "$spoke" >/dev/null 2>&1; then
                status="${GREEN}OK${NC}"
                spokes_ok=$((spokes_ok + 1))
            else
                spokes_fail=$((spokes_fail + 1))
            fi
            
            printf "  %-10s  %b  %b  %b  %b\n" "$(upper "$spoke")" "$kc_ok" "$auth_ok" "$client_ok" "$status"
        fi
    done
    
    local total=$((spokes_ok + spokes_fail))
    echo ""
    echo "  Summary: $spokes_ok OK, $spokes_fail failed ($total total)"
    echo ""
    
    [ $spokes_fail -eq 0 ]
}

##
# Configure federation for all spokes in batch
# 
# Arguments:
#   None (operates on all known spokes)
# 
# Returns:
#   0 - All spokes succeeded
#   1 - At least one spoke failed
##
configure_all_federation() {
    ensure_dive_root
    
    echo ""
    echo -e "${BOLD}Configuring Federation for All Spokes${NC}"
    echo ""
    
    # Check Hub first
    if ! docker ps --format '{{.Names}}' | grep -q "^${HUB_KEYCLOAK_CONTAINER}$"; then
        log_error "Hub Keycloak not running - cannot configure federation"
        return 1
    fi
    
    local success=0
    local fail=0
    
    # Get all spoke directories
    for dir in "${DIVE_ROOT}"/instances/*/; do
        local spoke
        spoke=$(basename "$dir")
        # Skip hub and usa
        if [[ "$spoke" != "hub" && "$spoke" != "usa" && "$spoke" != "shared" && -d "$dir" ]]; then
            # Check if spoke Keycloak is running
            local spoke_kc="${spoke}-keycloak-${spoke}-1"
            if docker ps --format '{{.Names}}' | grep -q "^${spoke_kc}$"; then
                echo -e "${CYAN}>>> Processing: $(upper "$spoke")${NC}"
                if configure_spoke_federation "$spoke" 2>&1 | sed 's/^/  /'; then
                    success=$((success + 1))
                else
                    fail=$((fail + 1))
                fi
                echo ""
            else
                echo -e "${YELLOW}>>> Skipping $(upper "$spoke"): Keycloak not running${NC}"
            fi
        fi
    done
    
    echo -e "${BOLD}Batch Complete: $success succeeded, $fail failed${NC}"
    echo ""
    
    [ $fail -eq 0 ]
}

# =============================================================================
# REALM ISSUER CONFIGURATION
# =============================================================================

##
# Fix realm issuer URL to match actual port mapping
#
# This is needed when:
# - A spoke was initialized with wrong port offset
# - The docker-compose port mapping doesn't match Keycloak's frontendUrl
#
# Arguments:
#   $1 - Spoke code (e.g., "alb", "bel", "gbr")
#
# Returns:
#   0 on success, 1 on failure
##
fix_realm_issuer() {
    local spoke="${1:?Spoke code required}"
    spoke=$(lower "$spoke")
    local spoke_upper
    spoke_upper=$(upper "$spoke")
    
    echo -e "${BOLD}Fixing Realm Issuer for ${spoke_upper}${NC}"
    echo ""
    
    # Get ports from docker-compose (actual port mapping)
    local spoke_dir="${DIVE_ROOT}/instances/${spoke}"
    if [ ! -f "${spoke_dir}/docker-compose.yml" ]; then
        log_error "Spoke docker-compose.yml not found: ${spoke_dir}"
        return 1
    fi
    
    # Extract the actual external HTTPS port from docker-compose
    local actual_port
    actual_port=$(grep -E "^\s+-\s+\"[0-9]+:8443\"" "${spoke_dir}/docker-compose.yml" | head -1 | sed 's/.*"\([0-9]*\):8443".*/\1/')
    
    if [ -z "$actual_port" ]; then
        log_error "Could not determine Keycloak HTTPS port from docker-compose"
        return 1
    fi
    
    local correct_issuer="https://localhost:${actual_port}"
    local realm_name="dive-v3-broker-${spoke}"
    
    echo "  Spoke:           ${spoke_upper}"
    echo "  Realm:           ${realm_name}"
    echo "  Correct Issuer:  ${correct_issuer}"
    echo ""
    
    # Get spoke admin password
    local admin_pass
    admin_pass=$(grep -E '^KEYCLOAK_ADMIN_PASSWORD' "${spoke_dir}/.env" 2>/dev/null | head -1 | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    
    if [ -z "$admin_pass" ]; then
        log_error "Could not get spoke admin password"
        return 1
    fi
    
    # Get admin token
    local spoke_kc="keycloak-${spoke}"
    local token
    token=$(docker exec "${spoke}-${spoke_kc}-1" curl -ksf \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "grant_type=password" 2>/dev/null | jq -r '.access_token')
    
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_error "Failed to get admin token for ${spoke_upper}"
        return 1
    fi
    log_success "Admin token obtained"
    
    # Get current realm config
    local realm_json
    realm_json=$(docker exec "${spoke}-${spoke_kc}-1" curl -ksf \
        -H "Authorization: Bearer ${token}" \
        "http://localhost:8080/admin/realms/${realm_name}" 2>/dev/null)
    
    if [ -z "$realm_json" ]; then
        log_error "Failed to get realm configuration"
        return 1
    fi
    
    local current_frontend_url
    current_frontend_url=$(echo "$realm_json" | jq -r '.attributes.frontendUrl // "not set"')
    echo "  Current frontendUrl: ${current_frontend_url}"
    
    # Update frontendUrl
    local updated_realm
    updated_realm=$(echo "$realm_json" | jq --arg url "$correct_issuer" '.attributes.frontendUrl = $url')
    
    # Apply update
    local update_result
    update_result=$(docker exec "${spoke}-${spoke_kc}-1" curl -ksf -w "%{http_code}" -o /dev/null \
        -X PUT \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        "http://localhost:8080/admin/realms/${realm_name}" \
        -d "$updated_realm" 2>/dev/null)
    
    if [ "$update_result" = "204" ]; then
        log_success "Realm frontendUrl updated to ${correct_issuer}"
    else
        log_error "Failed to update realm (HTTP ${update_result})"
        return 1
    fi
    
    # Verify the change
    local verify_issuer
    verify_issuer=$(docker exec "${spoke}-${spoke_kc}-1" curl -ksf \
        "http://localhost:8080/realms/${realm_name}/.well-known/openid-configuration" 2>/dev/null | jq -r '.issuer')
    
    echo ""
    echo "  Verified issuer: ${verify_issuer}"
    
    if [ "$verify_issuer" = "${correct_issuer}/realms/${realm_name}" ]; then
        log_success "Realm issuer verified!"
        return 0
    else
        log_warning "Issuer mismatch - may need Keycloak restart"
        echo "  Expected: ${correct_issuer}/realms/${realm_name}"
        echo "  Got:      ${verify_issuer}"
        return 1
    fi
}

##
# Fix realm issuer for all running spokes
##
fix_all_realm_issuers() {
    log_info "Fixing Realm Issuers for All Running Spokes"
    echo ""
    
    local success=0
    local fail=0
    
    # Get all spoke directories
    for dir in "${DIVE_ROOT}"/instances/*/; do
        local spoke
        spoke=$(basename "$dir")
        # Skip hub and usa
        if [[ "$spoke" != "hub" && "$spoke" != "usa" && "$spoke" != "shared" && -d "$dir" ]]; then
            # Check if spoke Keycloak is running
            local spoke_kc="${spoke}-keycloak-${spoke}-1"
            if docker ps --format '{{.Names}}' | grep -q "^${spoke_kc}$"; then
                echo -e "${CYAN}>>> Processing: $(upper "$spoke")${NC}"
                if fix_realm_issuer "$spoke" 2>&1 | sed 's/^/  /'; then
                    success=$((success + 1))
                else
                    fail=$((fail + 1))
                fi
                echo ""
            else
                echo -e "${YELLOW}>>> Skipping $(upper "$spoke"): Keycloak not running${NC}"
            fi
        fi
    done
    
    echo -e "${BOLD}Batch Complete: $success fixed, $fail failed${NC}"
    echo ""
    
    [ $fail -eq 0 ]
}

# =============================================================================
# OPA TRUSTED ISSUERS SYNC
# =============================================================================

##
# Sync a spoke's Keycloak to OPA trusted_issuers
#
# This updates:
# - backend/data/opal/trusted_issuers.json
# - policies/policy_data.json
# - policies/tenant/base.rego (default_trusted_issuers)
#
# Arguments:
#   $1 - Spoke code (e.g., "alb", "bel", "dnk")
#
# Returns:
#   0 on success, 1 on failure
##
sync_opa_trusted_issuers() {
    local spoke="${1:?Spoke code required}"
    spoke=$(lower "$spoke")
    local spoke_upper
    spoke_upper=$(upper "$spoke")
    
    echo -e "${BOLD}Syncing OPA Trusted Issuers for ${spoke_upper}${NC}"
    echo ""
    
    # Get ports using NATO convention
    eval "$(_get_spoke_ports_fed "$spoke_upper")"
    local keycloak_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
    
    local realm="dive-v3-broker-${spoke}"
    local issuer_url="https://localhost:${keycloak_port}/realms/${realm}"
    
    echo "  Spoke:        ${spoke_upper}"
    echo "  Realm:        ${realm}"
    echo "  Issuer URL:   ${issuer_url}"
    echo ""
    
    # 1. Update backend/data/opal/trusted_issuers.json
    local trusted_issuers_file="${DIVE_ROOT}/backend/data/opal/trusted_issuers.json"
    if [ -f "$trusted_issuers_file" ]; then
        echo "  [1/3] Updating trusted_issuers.json..."
        
        # Use jq to add/update the issuer
        local tmp_file="${trusted_issuers_file}.tmp"
        jq --arg url "$issuer_url" \
           --arg tenant "$spoke_upper" \
           --arg name "${spoke_upper} Keycloak (Local Dev)" \
           --arg country "$spoke_upper" \
           '.[$url] = {
              "tenant": $tenant,
              "name": $name,
              "country": $country,
              "trust_level": "DEVELOPMENT",
              "enabled": true,
              "protocol": "oidc",
              "federation_class": "LOCAL"
            }' "$trusted_issuers_file" > "$tmp_file" && mv "$tmp_file" "$trusted_issuers_file"
        
        echo -e "        ${GREEN}✓${NC} Updated trusted_issuers.json"
    else
        echo -e "        ${YELLOW}⚠${NC} trusted_issuers.json not found"
    fi
    
    # 2. Update policies/policy_data.json
    local policy_data_file="${DIVE_ROOT}/policies/policy_data.json"
    if [ -f "$policy_data_file" ]; then
        echo "  [2/3] Updating policy_data.json..."
        
        # Use jq to add to trusted_issuers and federation_matrix
        local tmp_file="${policy_data_file}.tmp"
        jq --arg url "$issuer_url" \
           --arg tenant "$spoke_upper" \
           --arg name "${spoke_upper} Keycloak (Local Dev)" \
           --arg country "$spoke_upper" \
           '.trusted_issuers[$url] = {
              "tenant": $tenant,
              "name": $name,
              "country": $country,
              "trust_level": "DEVELOPMENT"
            }
            | .federation_matrix.USA += [$tenant] | .federation_matrix.USA |= unique
            | .federation_matrix[$tenant] = (if .federation_matrix[$tenant] then .federation_matrix[$tenant] else ["USA", "FRA", "GBR", "DEU"] end) | .federation_matrix[$tenant] |= unique
            | .tenant_configs[$tenant] = {
                "code": $tenant,
                "name": $tenant,
                "locale": "en-US",
                "mfa_required_above": "UNCLASSIFIED",
                "max_session_hours": 8,
                "default_coi": ["NATO"],
                "allow_industry_access": true,
                "industry_max_classification": "CONFIDENTIAL"
              }' "$policy_data_file" > "$tmp_file" && mv "$tmp_file" "$policy_data_file"
        
        echo -e "        ${GREEN}✓${NC} Updated policy_data.json"
    else
        echo -e "        ${YELLOW}⚠${NC} policy_data.json not found"
    fi
    
    # 3. Restart OPA containers to pick up changes
    echo "  [3/3] Restarting OPA containers..."
    
    # Restart spoke OPA
    local spoke_opa="${spoke}-opa-${spoke}-1"
    if docker ps --format '{{.Names}}' | grep -q "^${spoke_opa}$"; then
        docker restart "$spoke_opa" >/dev/null 2>&1 && \
            echo -e "        ${GREEN}✓${NC} Restarted ${spoke_opa}"
    fi
    
    # Also restart Hub OPA if running
    local hub_opa="dive-hub-opa"
    if docker ps --format '{{.Names}}' | grep -q "^${hub_opa}$"; then
        docker restart "$hub_opa" >/dev/null 2>&1 && \
            echo -e "        ${GREEN}✓${NC} Restarted ${hub_opa}"
    fi
    
    echo ""
    echo -e "${GREEN}✓${NC} OPA trusted issuers synced for ${spoke_upper}"
    return 0
}

##
# Sync all running spokes to OPA trusted_issuers
#
# Iterates through all spoke instances and syncs each to OPA.
##
sync_all_opa_trusted_issuers() {
    echo -e "${BOLD}Syncing All Spokes to OPA Trusted Issuers${NC}"
    echo ""
    
    local success=0
    local fail=0
    
    # Get all spoke directories
    for dir in "${DIVE_ROOT}"/instances/*/; do
        local spoke
        spoke=$(basename "$dir")
        # Skip hub and usa
        if [[ "$spoke" != "hub" && "$spoke" != "usa" && "$spoke" != "shared" && -d "$dir" ]]; then
            # Check if spoke Keycloak is running
            local spoke_kc="${spoke}-keycloak-${spoke}-1"
            if docker ps --format '{{.Names}}' | grep -q "^${spoke_kc}$"; then
                echo -e "${CYAN}>>> Processing: $(upper "$spoke")${NC}"
                if sync_opa_trusted_issuers "$spoke" 2>&1 | sed 's/^/  /'; then
                    success=$((success + 1))
                else
                    fail=$((fail + 1))
                fi
                echo ""
            else
                echo -e "${YELLOW}>>> Skipping $(upper "$spoke"): Keycloak not running${NC}"
            fi
        fi
    done
    
    echo -e "${BOLD}Batch Complete: $success synced, $fail failed${NC}"
    echo ""
    
    [ $fail -eq 0 ]
}

# =============================================================================
# DIVE SCOPES & IDP MAPPERS
# =============================================================================

##
# Assign DIVE client scopes to a Hub client for a spoke
# This ensures the Hub includes clearance, country, etc. in tokens
#
# Arguments:
#   $1 - Spoke code (e.g., ROU)
##
assign_hub_dive_scopes() {
    local spoke="${1:-}"
    if [ -z "$spoke" ]; then
        log_error "Usage: assign_hub_dive_scopes <spoke>"
        return 1
    fi
    
    local spoke_upper=$(upper "$spoke")
    local spoke_lower=$(lower "$spoke")
    local client_id="dive-v3-client-${spoke_lower}"
    
    echo -e "${BOLD}Assigning DIVE scopes to Hub client: ${client_id}${NC}"
    echo ""
    
    # Get Hub admin token
    local hub_token
    hub_token=$(get_hub_admin_token)
    if [ -z "$hub_token" ] || [ "$hub_token" = "null" ]; then
        log_error "Failed to get Hub admin token"
        return 1
    fi
    log_success "Admin token obtained"
    
    # Get client UUID
    local client_uuid
    client_uuid=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s \
        "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/clients?clientId=${client_id}" \
        -H "Authorization: Bearer ${hub_token}" 2>/dev/null | jq -r '.[0].id')
    
    if [ -z "$client_uuid" ] || [ "$client_uuid" = "null" ]; then
        log_error "Client not found: ${client_id}"
        return 1
    fi
    log_info "Client UUID: ${client_uuid}"
    
    # Find DIVE scopes
    local scopes=("clearance" "countryOfAffiliation" "acpCOI" "uniqueID")
    for scope_name in "${scopes[@]}"; do
        local scope_id
        scope_id=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s \
            "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/client-scopes?first=0&max=100" \
            -H "Authorization: Bearer ${hub_token}" 2>/dev/null | \
            jq -r ".[] | select(.name==\"${scope_name}\") | .id")
        
        if [ -n "$scope_id" ] && [ "$scope_id" != "null" ]; then
            # Assign scope to client
            local result
            result=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s -o /dev/null -w "%{http_code}" \
                -X PUT "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/clients/${client_uuid}/default-client-scopes/${scope_id}" \
                -H "Authorization: Bearer ${hub_token}" 2>/dev/null)
            
            if [ "$result" = "204" ] || [ "$result" = "200" ]; then
                log_success "Assigned scope: ${scope_name}"
            else
                log_warn "Scope ${scope_name} may already be assigned (HTTP ${result})"
            fi
        else
            log_warn "Scope not found: ${scope_name}"
        fi
    done
    
    log_success "DIVE scopes assigned to ${client_id}"
    return 0
}

##
# Create IdP mappers for usa-idp in a spoke to import DIVE claims
#
# Arguments:
#   $1 - Spoke code (e.g., ROU)
##
create_spoke_idp_mappers() {
    local spoke="${1:-}"
    if [ -z "$spoke" ]; then
        log_error "Usage: create_spoke_idp_mappers <spoke>"
        return 1
    fi
    
    local spoke_upper=$(upper "$spoke")
    local spoke_lower=$(lower "$spoke")
    local realm="dive-v3-broker-${spoke_lower}"
    local idp_alias="usa-idp"
    
    echo -e "${BOLD}Creating IdP mappers for ${idp_alias} in ${spoke_upper}${NC}"
    echo ""
    
    # Get spoke admin token
    local spoke_token
    spoke_token=$(get_spoke_admin_token "$spoke")
    if [ -z "$spoke_token" ] || [ "$spoke_token" = "null" ]; then
        log_error "Failed to get spoke admin token"
        return 1
    fi
    log_success "Admin token obtained"
    
    # Get Keycloak container name
    local keycloak_container="${spoke_lower}-keycloak-${spoke_lower}-1"
    
    # Mappers to create
    local mappers=(
        "clearance:clearance"
        "countryOfAffiliation:countryOfAffiliation"
        "uniqueID:uniqueID"
        "acpCOI:acpCOI"
    )
    
    for mapper_spec in "${mappers[@]}"; do
        local claim="${mapper_spec%%:*}"
        local attr="${mapper_spec##*:}"
        local mapper_name="${claim}-mapper"
        
        # Check if mapper exists
        local existing
        existing=$(docker exec "$keycloak_container" curl -s \
            "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/${idp_alias}/mappers" \
            -H "Authorization: Bearer ${spoke_token}" 2>/dev/null | \
            jq -r ".[] | select(.name==\"${mapper_name}\") | .id")
        
        if [ -n "$existing" ] && [ "$existing" != "null" ]; then
            log_info "Mapper already exists: ${mapper_name}"
            continue
        fi
        
        # Create mapper
        local mapper_json=$(cat <<EOF
{
  "name": "${mapper_name}",
  "identityProviderMapper": "oidc-user-attribute-idp-mapper",
  "identityProviderAlias": "${idp_alias}",
  "config": {
    "claim": "${claim}",
    "user.attribute": "${attr}",
    "syncMode": "FORCE"
  }
}
EOF
)
        
        local result
        result=$(docker exec "$keycloak_container" curl -s -o /dev/null -w "%{http_code}" \
            -X POST "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/${idp_alias}/mappers" \
            -H "Authorization: Bearer ${spoke_token}" \
            -H "Content-Type: application/json" \
            -d "${mapper_json}" 2>/dev/null)
        
        if [ "$result" = "201" ] || [ "$result" = "200" ]; then
            log_success "Created mapper: ${mapper_name}"
        else
            log_error "Failed to create mapper: ${mapper_name} (HTTP ${result})"
        fi
    done
    
    log_success "IdP mappers created for ${idp_alias} in ${spoke_upper}"
    return 0
}

##
# Setup complete claim passthrough for a spoke
# 1. Assign DIVE scopes to Hub client
# 2. Create IdP mappers in spoke
#
# Arguments:
#   $1 - Spoke code (e.g., ROU)
##
setup_spoke_claims() {
    local spoke="${1:-}"
    if [ -z "$spoke" ]; then
        log_error "Usage: setup_spoke_claims <spoke>"
        return 1
    fi
    
    local spoke_upper=$(upper "$spoke")
    
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  CLAIM PASSTHROUGH SETUP: ${spoke_upper}${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    local result=0
    
    # Step 1: Assign DIVE scopes to Hub client
    echo -e "${CYAN}→ Step 1/2: Assigning DIVE scopes to Hub client...${NC}"
    if assign_hub_dive_scopes "$spoke"; then
        log_success "Hub client scopes assigned"
    else
        log_warn "Failed to assign Hub scopes"
        result=1
    fi
    echo ""
    
    # Step 2: Create IdP mappers in spoke
    echo -e "${CYAN}→ Step 2/2: Creating IdP mappers in spoke...${NC}"
    if create_spoke_idp_mappers "$spoke"; then
        log_success "Spoke IdP mappers created"
    else
        log_warn "Failed to create IdP mappers"
        result=1
    fi
    echo ""
    
    if [ $result -eq 0 ]; then
        log_success "Claim passthrough setup complete for ${spoke_upper}"
        echo ""
        echo -e "${YELLOW}NOTE: Users must re-login to pick up the new claims.${NC}"
        echo -e "${YELLOW}      Delete existing federated users if attributes are missing.${NC}"
    else
        log_warn "Claim passthrough setup completed with warnings"
    fi
    
    return $result
}

##
# Delete a federated user from a spoke's realm
# Used to force re-creation with correct attributes
#
# Arguments:
#   $1 - Spoke code (e.g., ROU)
#   $2 - Username (e.g., testuser-usa-1)
##
delete_federated_user() {
    local spoke="${1:-}"
    local username="${2:-}"
    
    if [ -z "$spoke" ] || [ -z "$username" ]; then
        log_error "Usage: delete_federated_user <spoke> <username>"
        return 1
    fi
    
    local spoke_upper=$(upper "$spoke")
    local spoke_lower=$(lower "$spoke")
    local realm="dive-v3-broker-${spoke_lower}"
    local keycloak_container="${spoke_lower}-keycloak-${spoke_lower}-1"
    
    echo -e "${BOLD}Deleting federated user: ${username} from ${spoke_upper}${NC}"
    
    # Get spoke admin token
    local spoke_token
    spoke_token=$(get_spoke_admin_token "$spoke")
    if [ -z "$spoke_token" ] || [ "$spoke_token" = "null" ]; then
        log_error "Failed to get spoke admin token"
        return 1
    fi
    
    # Find user
    local user_id
    user_id=$(docker exec "$keycloak_container" curl -s \
        "http://localhost:8080/admin/realms/${realm}/users?username=${username}&exact=true" \
        -H "Authorization: Bearer ${spoke_token}" 2>/dev/null | jq -r '.[0].id')
    
    if [ -z "$user_id" ] || [ "$user_id" = "null" ]; then
        log_info "User not found: ${username}"
        return 0
    fi
    
    # Delete user
    local result
    result=$(docker exec "$keycloak_container" curl -s -o /dev/null -w "%{http_code}" \
        -X DELETE "http://localhost:8080/admin/realms/${realm}/users/${user_id}" \
        -H "Authorization: Bearer ${spoke_token}" 2>/dev/null)
    
    if [ "$result" = "204" ]; then
        log_success "User deleted: ${username}"
    else
        log_error "Failed to delete user: ${username} (HTTP ${result})"
        return 1
    fi
    
    return 0
}

##
# Delete a federated user from the Hub
# Use this when attributes need to be refreshed after IdP mapper changes
#
# Arguments:
#   $1 - Username (e.g., testuser-rou-1)
##
delete_hub_federated_user() {
    local username="${1:-}"
    
    if [ -z "$username" ]; then
        log_error "Usage: delete_hub_federated_user <username>"
        echo "  Example: delete_hub_federated_user testuser-rou-1"
        return 1
    fi
    
    echo -e "${BOLD}Deleting federated user from Hub: ${username}${NC}"
    
    # Get Hub admin token
    local hub_token
    hub_token=$(get_hub_admin_token)
    if [ -z "$hub_token" ] || [ "$hub_token" = "null" ]; then
        log_error "Failed to get Hub admin token"
        return 1
    fi
    
    # Find user in Hub realm
    local user_id
    user_id=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s \
        "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/users?username=${username}&exact=true" \
        -H "Authorization: Bearer ${hub_token}" 2>/dev/null | jq -r '.[0].id')
    
    if [ -z "$user_id" ] || [ "$user_id" = "null" ]; then
        log_info "User not found in Hub: ${username}"
        return 0
    fi
    
    echo "  User ID: ${user_id}"
    
    # Delete user from Hub
    local result
    result=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s -o /dev/null -w "%{http_code}" \
        -X DELETE "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/users/${user_id}" \
        -H "Authorization: Bearer ${hub_token}" 2>/dev/null)
    
    if [ "$result" = "204" ]; then
        log_success "Federated user deleted from Hub: ${username}"
        echo "  The user will be recreated with fresh attributes on next login."
    else
        log_error "Failed to delete user from Hub: ${username} (HTTP ${result})"
        return 1
    fi
    
    return 0
}

# =============================================================================
# HUB REGISTRATION - Register spoke as IdP in Hub
# =============================================================================

##
# Register a spoke as an Identity Provider in the Hub
# This is the CRITICAL step that allows users to login FROM the Hub TO the spoke
#
# Creates (idempotently):
#   1. Hub client for spoke (dive-v3-client-<spoke>)
#   2. IdP in Hub pointing to spoke (<spoke>-idp)
#   3. IdP mappers for DIVE attributes
#   4. Syncs OPA trusted issuers
#
# Arguments:
#   $1 - Spoke code (e.g., ROU, GBR, DNK)
#
# Returns:
#   0 on success, 1 on failure
##
register_spoke_in_hub() {
    local spoke="${1:-}"
    
    if [ -z "$spoke" ]; then
        log_error "Usage: register_spoke_in_hub <spoke>"
        return 1
    fi
    
    local spoke_upper=$(upper "$spoke")
    local spoke_lower=$(lower "$spoke")
    local spoke_realm="dive-v3-broker-${spoke_lower}"
    local spoke_client="dive-v3-client-${spoke_lower}"
    local spoke_idp="${spoke_lower}-idp"
    local spoke_display_name=$(get_country_name "$spoke_upper" 2>/dev/null || echo "$spoke_upper")
    
    echo -e "\n${BOLD}Registering ${spoke_upper} (${spoke_display_name}) in Hub${NC}\n"
    
    # Get spoke ports from docker-compose
    local spoke_dir="${DIVE_ROOT}/instances/${spoke_lower}"
    if [ ! -d "$spoke_dir" ]; then
        log_error "Spoke directory not found: $spoke_dir"
        return 1
    fi
    
    # Parse ports from docker-compose.yml
    eval "$(_get_spoke_ports_fed "$spoke")"
    local kc_port="${SPOKE_KEYCLOAK_PORT:-8443}"
    local frontend_port="${SPOKE_FRONTEND_PORT:-3000}"
    
    echo "  Spoke Ports:"
    echo "    Frontend:  $frontend_port"
    echo "    Keycloak:  $kc_port"
    echo ""
    
    # Step 1: Authenticate to Hub Keycloak
    echo -e "  ${BOLD}[1/7] Authenticating to Hub Keycloak...${NC}"
    
    local hub_pass=""
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        hub_pass=$(grep "^KEYCLOAK_ADMIN_PASSWORD=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2)
    elif [ -f "${DIVE_ROOT}/instances/usa/.env" ]; then
        hub_pass=$(grep "^KEYCLOAK_ADMIN_PASSWORD" "${DIVE_ROOT}/instances/usa/.env" 2>/dev/null | cut -d= -f2)
    fi
    
    if [ -z "$hub_pass" ]; then
        log_error "Cannot find Hub admin password"
        return 1
    fi
    
    # Configure kcadm for Hub
    if ! docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$hub_pass" 2>/dev/null; then
        log_error "Failed to authenticate to Hub Keycloak"
        return 1
    fi
    log_success "Authenticated to Hub Keycloak"
    
    # Step 2: Create or verify Hub client for spoke
    echo -e "  ${BOLD}[2/7] Creating Hub client: ${spoke_client}...${NC}"
    
    local existing_client
    existing_client=$(docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get clients \
        -r "$HUB_REALM" -q "clientId=${spoke_client}" --fields id 2>/dev/null | jq -r '.[0].id // empty')
    
    if [ -n "$existing_client" ]; then
        log_info "Client already exists: ${spoke_client}"
    else
        # Create the client
        if docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh create clients \
            -r "$HUB_REALM" \
            -s "clientId=${spoke_client}" \
            -s enabled=true \
            -s protocol=openid-connect \
            -s publicClient=false \
            -s standardFlowEnabled=true \
            -s directAccessGrantsEnabled=false \
            -s serviceAccountsEnabled=false \
            -s "redirectUris=[\"https://localhost:${kc_port}/realms/${spoke_realm}/broker/usa-idp/endpoint\",\"https://localhost:${frontend_port}/*\",\"https://${spoke_lower}-app.dive25.com/*\"]" \
            -s "webOrigins=[\"https://localhost:${kc_port}\",\"https://localhost:${frontend_port}\",\"https://${spoke_lower}-app.dive25.com\"]" \
            -s "attributes={\"post.logout.redirect.uris\":\"https://localhost:${kc_port}/*##https://localhost:${frontend_port}/*\"}" 2>/dev/null; then
            log_success "Created client: ${spoke_client}"
        else
            log_error "Failed to create client: ${spoke_client}"
            return 1
        fi
    fi
    
    # Get client UUID and secret
    local client_uuid
    client_uuid=$(docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get clients \
        -r "$HUB_REALM" -q "clientId=${spoke_client}" --fields id 2>/dev/null | jq -r '.[0].id')
    
    local client_secret
    client_secret=$(docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get \
        "clients/${client_uuid}/client-secret" -r "$HUB_REALM" 2>/dev/null | jq -r '.value')
    
    echo "        Client UUID: ${client_uuid}"
    echo "        Client Secret: ${client_secret:0:8}..."
    
    # Step 3: Create or verify IdP in Hub
    echo -e "  ${BOLD}[3/7] Creating IdP in Hub: ${spoke_idp}...${NC}"
    
    local existing_idp
    existing_idp=$(docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get \
        "identity-provider/instances/${spoke_idp}" -r "$HUB_REALM" 2>/dev/null | jq -r '.alias // empty')
    
    if [ -n "$existing_idp" ]; then
        log_info "IdP already exists: ${spoke_idp}"
        # Update the client secret in case it changed
        docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh update \
            "identity-provider/instances/${spoke_idp}" -r "$HUB_REALM" \
            -s "config.clientSecret=${client_secret}" 2>/dev/null
        log_success "Updated IdP client secret"
    else
        # Create the IdP
        if docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh create identity-provider/instances \
            -r "$HUB_REALM" \
            -s "alias=${spoke_idp}" \
            -s providerId=oidc \
            -s enabled=true \
            -s "displayName=${spoke_display_name}" \
            -s trustEmail=true \
            -s storeToken=false \
            -s addReadTokenRoleOnCreate=false \
            -s authenticateByDefault=false \
            -s linkOnly=false \
            -s 'firstBrokerLoginFlowAlias=first broker login' \
            -s "config.authorizationUrl=https://localhost:${kc_port}/realms/${spoke_realm}/protocol/openid-connect/auth" \
            -s "config.tokenUrl=https://${spoke_lower}-keycloak-${spoke_lower}-1:8443/realms/${spoke_realm}/protocol/openid-connect/token" \
            -s "config.userInfoUrl=https://${spoke_lower}-keycloak-${spoke_lower}-1:8443/realms/${spoke_realm}/protocol/openid-connect/userinfo" \
            -s "config.logoutUrl=https://localhost:${kc_port}/realms/${spoke_realm}/protocol/openid-connect/logout" \
            -s "config.jwksUrl=https://${spoke_lower}-keycloak-${spoke_lower}-1:8443/realms/${spoke_realm}/protocol/openid-connect/certs" \
            -s "config.issuer=https://localhost:${kc_port}/realms/${spoke_realm}" \
            -s "config.clientId=${spoke_client}" \
            -s "config.clientSecret=${client_secret}" \
            -s "config.defaultScope=openid profile email" \
            -s "config.syncMode=INHERIT" \
            -s "config.validateSignature=true" \
            -s "config.useJwksUrl=true" \
            -s "config.pkceEnabled=true" \
            -s "config.pkceMethod=S256" 2>/dev/null; then
            log_success "Created IdP: ${spoke_idp}"
        else
            log_error "Failed to create IdP: ${spoke_idp}"
            return 1
        fi
    fi
    
    # Step 4: Create IdP mappers for DIVE attributes
    echo -e "  ${BOLD}[4/7] Creating IdP mappers for DIVE attributes...${NC}"
    
    local mappers=("uniqueID" "clearance" "countryOfAffiliation" "acpCOI")
    local mapper_count=0
    
    for mapper in "${mappers[@]}"; do
        # Check if mapper exists
        local existing_mapper
        existing_mapper=$(docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get \
            "identity-provider/instances/${spoke_idp}/mappers" -r "$HUB_REALM" 2>/dev/null | jq -r ".[] | select(.name==\"${mapper}\") | .name // empty")
        
        if [ -n "$existing_mapper" ]; then
            continue
        fi
        
        # Create mapper
        if docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh create \
            "identity-provider/instances/${spoke_idp}/mappers" -r "$HUB_REALM" \
            -s "name=${mapper}" \
            -s "identityProviderMapper=oidc-user-attribute-idp-mapper" \
            -s "identityProviderAlias=${spoke_idp}" \
            -s "config.syncMode=FORCE" \
            -s "config.claim=${mapper}" \
            -s "config.user.attribute=${mapper}" 2>/dev/null; then
            mapper_count=$((mapper_count + 1))
        fi
    done
    
    if [ "$mapper_count" -gt 0 ]; then
        log_success "Created ${mapper_count} IdP mappers"
    else
        log_info "All IdP mappers already exist"
    fi
    
    # Step 5: Update spoke's client for bidirectional federation
    echo -e "  ${BOLD}[5/7] Updating spoke client for bidirectional federation...${NC}"
    
    # Get spoke admin token
    local spoke_keycloak_container="${spoke_lower}-keycloak-${spoke_lower}-1"
    local spoke_pass=""
    if [ -f "${spoke_dir}/.env" ]; then
        spoke_pass=$(grep "^KEYCLOAK_ADMIN_PASSWORD" "${spoke_dir}/.env" 2>/dev/null | cut -d= -f2)
    fi
    
    if [ -n "$spoke_pass" ] && docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${spoke_keycloak_container}$"; then
        # Authenticate to spoke Keycloak
        if docker exec "$spoke_keycloak_container" /opt/keycloak/bin/kcadm.sh config credentials \
            --server http://localhost:8080 --realm master --user admin --password "$spoke_pass" 2>/dev/null; then
            
            # Get spoke client UUID
            local spoke_client_uuid
            spoke_client_uuid=$(docker exec "$spoke_keycloak_container" /opt/keycloak/bin/kcadm.sh get clients \
                -r "${spoke_realm}" -q "clientId=${spoke_client}" --fields id 2>/dev/null | jq -r '.[0].id // empty')
            
            if [ -n "$spoke_client_uuid" ]; then
                # Update redirect URIs to include Hub broker endpoint
                # This allows: Hub → Spoke Keycloak → callback to Hub broker
                docker exec "$spoke_keycloak_container" /opt/keycloak/bin/kcadm.sh update "clients/${spoke_client_uuid}" \
                    -r "${spoke_realm}" \
                    -s "redirectUris=[\"https://localhost:${frontend_port}/*\",\"https://localhost:${frontend_port}\",\"https://localhost:${frontend_port}/api/auth/callback/keycloak\",\"https://localhost:3000/*\",\"https://localhost:3000/api/auth/callback/keycloak\",\"https://localhost:8443/realms/dive-v3-broker/broker/${spoke_idp}/endpoint\",\"https://localhost:8443/*\",\"https://${spoke_lower}-app.dive25.com/*\"]" 2>/dev/null
                log_success "Updated spoke client redirect URIs"
            else
                log_warn "Could not find spoke client: ${spoke_client}"
            fi
        else
            log_warn "Could not authenticate to spoke Keycloak"
        fi
    else
        log_warn "Spoke Keycloak not accessible - manual update may be needed"
        echo "        Run: ./dive federation-setup update-spoke-uris ${spoke_lower}"
    fi
    
    # Step 6: Update spoke client post-logout redirect URIs (for sign-out flow)
    echo -e "  ${BOLD}[6/7] Configuring post-logout redirect URIs...${NC}"
    
    if [ -n "$spoke_pass" ] && docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${spoke_keycloak_container}$"; then
        if [ -n "$spoke_client_uuid" ]; then
            # Post-logout URIs must include Hub URLs for proper sign-out redirect
            # Format: URLs separated by ##
            local post_logout_uris="https://localhost:3000##https://localhost:3000/*##https://localhost:${frontend_port}##https://localhost:${frontend_port}/*##https://localhost:8443##https://localhost:8443/*##https://${spoke_lower}-app.dive25.com##https://${spoke_lower}-app.dive25.com/*##+"
            
            docker exec "$spoke_keycloak_container" /opt/keycloak/bin/kcadm.sh update "clients/${spoke_client_uuid}" \
                -r "${spoke_realm}" \
                -s "attributes.post\.logout\.redirect\.uris=${post_logout_uris}" 2>/dev/null && \
            log_success "Updated post-logout redirect URIs" || \
            log_warn "Could not update post-logout redirect URIs"
        fi
    fi
    
    # Step 7: Sync OPA trusted issuers
    echo -e "  ${BOLD}[7/7] Syncing OPA trusted issuers...${NC}"
    
    sync_opa_trusted_issuers "$spoke" 2>/dev/null || log_warn "OPA sync may require manual review"
    
    echo ""
    echo -e "${GREEN}✓${NC} ${spoke_upper} (${spoke_display_name}) registered in Hub successfully"
    echo ""
    echo "  Hub IdP:        ${spoke_idp}"
    echo "  Hub Client:     ${spoke_client}"
    echo "  Spoke Realm:    ${spoke_realm}"
    echo "  Issuer URL:     https://localhost:${kc_port}/realms/${spoke_realm}"
    echo ""
    
    return 0
}

##
# Register all running spokes in the Hub
# Scans for running spoke containers and registers each one
##
register_all_spokes_in_hub() {
    echo -e "\n${BOLD}Registering all running spokes in Hub${NC}\n"
    
    local spokes=()
    local spoke_dirs=("${DIVE_ROOT}/instances"/*)
    
    for dir in "${spoke_dirs[@]}"; do
        local code=$(basename "$dir")
        # Skip usa (hub) and non-directories
        [ "$code" = "usa" ] && continue
        [ ! -d "$dir" ] && continue
        
        local code_lower=$(lower "$code")
        local kc_container="${code_lower}-keycloak-${code_lower}-1"
        
        # Check if Keycloak container is running
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${kc_container}$"; then
            spokes+=("$code")
        fi
    done
    
    if [ ${#spokes[@]} -eq 0 ]; then
        log_warn "No running spoke Keycloaks found"
        return 0
    fi
    
    echo "Found ${#spokes[@]} running spokes: ${spokes[*]}"
    echo ""
    
    local success=0
    local failed=0
    
    for spoke in "${spokes[@]}"; do
        if register_spoke_in_hub "$spoke"; then
            success=$((success + 1))
        else
            failed=$((failed + 1))
        fi
    done
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo -e "  Registration Complete: ${GREEN}${success} succeeded${NC}, ${RED}${failed} failed${NC}"
    echo "═══════════════════════════════════════════════════════════════════════════"
    
    return $failed
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_federation_setup() {
    local action="${1:-help}"
    shift || true
    
    case "$action" in
        register-hub)
            register_spoke_in_hub "$@"
            ;;
        register-hub-all)
            register_all_spokes_in_hub
            ;;
        configure)
            configure_spoke_federation "$@"
            ;;
        configure-all)
            configure_all_federation
            ;;
        configure-idp)
            configure_usa_idp_in_spoke "$@"
            ;;
        update-spoke-uris)
            update_spoke_client_redirect_uris "$@"
            ;;
        update-hub-uris)
            update_hub_client_redirect_uris "$@"
            ;;
        sync-env)
            sync_spoke_env_secrets "$@"
            ;;
        get-hub-secret)
            get_hub_client_secret "$@"
            ;;
        get-spoke-secret)
            get_spoke_local_client_secret "$@"
            ;;
        recreate-frontend)
            recreate_spoke_frontend "$@"
            ;;
        verify)
            verify_spoke_federation "$@"
            ;;
        verify-all)
            verify_all_federation
            ;;
        sync-opa)
            sync_opa_trusted_issuers "$@"
            ;;
        sync-opa-all)
            sync_all_opa_trusted_issuers
            ;;
        fix-issuer)
            fix_realm_issuer "$@"
            ;;
        fix-issuer-all)
            fix_all_realm_issuers
            ;;
        setup-claims)
            setup_spoke_claims "$@"
            ;;
        assign-scopes)
            assign_hub_dive_scopes "$@"
            ;;
        create-mappers)
            create_spoke_idp_mappers "$@"
            ;;
        delete-user)
            delete_federated_user "$@"
            ;;
        delete-hub-user)
            delete_hub_federated_user "$@"
            ;;
        *)
            module_federation_setup_help
            ;;
    esac
}

module_federation_setup_help() {
    echo -e "${BOLD}Federation Setup Commands:${NC}"
    echo ""
    echo -e "  ${YELLOW}═══ HUB REGISTRATION (Bidirectional Federation) ═══${NC}"
    echo "  ${CYAN}register-hub${NC} <spoke>      Register spoke as IdP in Hub (CRITICAL!)"
    echo "  ${CYAN}register-hub-all${NC}          Register all running spokes in Hub"
    echo ""
    echo -e "  ${YELLOW}═══ SPOKE CONFIGURATION ═══${NC}"
    echo "  ${CYAN}configure${NC} <spoke>         Configure spoke to federate with Hub (5 steps)"
    echo "  ${CYAN}configure-all${NC}             Configure all spokes"
    echo ""
    echo "  ${CYAN}configure-idp${NC} <spoke>     Configure usa-idp with Hub secret"
    echo "  ${CYAN}update-spoke-uris${NC} <spoke> Update spoke client redirect URIs"
    echo "  ${CYAN}update-hub-uris${NC} <spoke>   Update Hub client redirect URIs"
    echo "  ${CYAN}sync-env${NC} <spoke>          Sync .env with correct secrets"
    echo "  ${CYAN}recreate-frontend${NC} <spoke> Recreate frontend to load new secrets"
    echo ""
    echo -e "  ${YELLOW}═══ OPA POLICY SYNC ═══${NC}"
    echo "  ${CYAN}sync-opa${NC} <spoke>          Sync spoke to OPA trusted issuers"
    echo "  ${CYAN}sync-opa-all${NC}              Sync all spokes to OPA"
    echo ""
    echo -e "  ${YELLOW}═══ CLAIM PASSTHROUGH ═══${NC}"
    echo "  ${CYAN}setup-claims${NC} <spoke>      Setup DIVE claim passthrough (scopes + mappers)"
    echo "  ${CYAN}assign-scopes${NC} <spoke>     Assign DIVE scopes to Hub client"
    echo "  ${CYAN}create-mappers${NC} <spoke>    Create IdP mappers in spoke for usa-idp"
    echo ""
    echo -e "  ${YELLOW}═══ TROUBLESHOOTING ═══${NC}"
    echo "  ${CYAN}fix-issuer${NC} <spoke>        Fix realm issuer URL to match port mapping"
    echo "  ${CYAN}fix-issuer-all${NC}            Fix realm issuer for all running spokes"
    echo "  ${CYAN}delete-user${NC} <spoke> <user> Delete user from spoke realm"
    echo "  ${CYAN}delete-hub-user${NC} <user>    Delete federated user from Hub (force attr refresh)"
    echo ""
    echo -e "  ${YELLOW}═══ VERIFICATION ═══${NC}"
    echo "  ${CYAN}verify${NC} <spoke>            Verify federation configuration"
    echo "  ${CYAN}verify-all${NC}                Verify all spokes"
    echo ""
    echo -e "  ${YELLOW}═══ SECRETS ═══${NC}"
    echo "  ${CYAN}get-hub-secret${NC} <spoke>    Get Hub client secret for spoke"
    echo "  ${CYAN}get-spoke-secret${NC} <spoke>  Get local client secret from spoke"
    echo ""
    echo "Examples:"
    echo "  ./dive federation-setup register-hub rou  # Register ROU in Hub (bidirectional)"
    echo "  ./dive federation-setup register-hub-all  # Register ALL spokes in Hub"
    echo "  ./dive federation-setup configure rou     # Configure ROU to federate with Hub"
    echo "  ./dive federation-setup sync-opa-all      # Sync all OPA trusted issuers"
    echo "  ./dive federation-setup verify-all        # Verify all federation"
    echo ""
    echo "Complete New Spoke Setup:"
    echo "  1. ./dive spoke deploy <code>              # Deploy spoke infrastructure"
    echo "  2. ./dive federation-setup register-hub <code>  # Register in Hub"
    echo "  3. ./dive federation-setup configure <code>     # Configure federation"
    echo "  4. ./dive federation-setup verify <code>        # Verify setup"
    echo ""
}

