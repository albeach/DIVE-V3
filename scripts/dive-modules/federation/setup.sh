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
[ -n "${DIVE_FEDERATION_SETUP_LOADED:-}" ] && return 0
export DIVE_FEDERATION_SETUP_LOADED=1
# Backward compatibility: spoke-federation.sh checks this guard
export DIVE_FEDERATION_LINK_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

FEDERATION_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$FEDERATION_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
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

    # Get port information using eval pattern
    eval "$(get_instance_ports "$instance_code" 2>/dev/null)"
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
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

    # Get port information using eval pattern
    eval "$(get_instance_ports "$instance_code" 2>/dev/null)"
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
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
    "clientId": "dive-v3-broker-usa",
    "clientSecret": "${HUB_REALM}",
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

    # Step 4: Register in database (database-driven, not JSON)
    log_info "Step 4: Recording federation in database..."
    if type fed_db_upsert_link &>/dev/null; then
        if fed_db_upsert_link "${code_lower}" "usa" "SPOKE_TO_HUB" "${idp_alias}" "ACTIVE" \
            "dive-v3-broker-${code_lower}"; then
            log_verbose "✓ Federation link recorded in database: ${code_lower} → usa"
        else
            log_warn "Database recording failed (federation will still work, but state tracking limited)"
        fi
    elif type orch_db_exec &>/dev/null; then
        # Fallback to direct SQL if fed_db_upsert_link not available
        orch_db_exec "
            INSERT INTO federation_links (source_code, target_code, direction, idp_alias, status, created_at)
            VALUES ('${code_lower}', 'usa', 'SPOKE_TO_HUB', '${idp_alias}', 'ACTIVE', NOW())
            ON CONFLICT (source_code, target_code, direction) DO UPDATE SET status='ACTIVE', updated_at=NOW()
        " >/dev/null 2>&1 || log_warn "Database recording failed (orch_db_exec not available)"
    else
        log_warn "Database functions not available - federation state not tracked"
    fi

    log_success "Federation link created for $code_upper"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Federation Link Complete: $code_upper"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Hub IdP Alias:   ${idp_alias}"
    echo "  Spoke Realm:     ${spoke_realm}"
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

    # Get port information using eval pattern
    eval "$(get_instance_ports "$instance_code" 2>/dev/null)"
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
    local spoke_url="https://localhost:${kc_port}"
    local spoke_realm="dive-v3-broker-${code_lower}"

    # Get client ID
    # The spoke should have an incoming federation client named dive-v3-broker-usa
    # This is the client the Hub uses to authenticate to the spoke
    local client_id=$(curl -sf "${spoke_url}/admin/realms/${spoke_realm}/clients" \
        -H "Authorization: Bearer $token" \
        --insecure 2>/dev/null | jq -r '.[] | select(.clientId=="dive-v3-broker-usa") | .id')

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
# GCP SSOT - FEDERATION SECRETS (ported from federation-link.sh)
# =============================================================================

##
# Get or create federation secret from GCP Secret Manager (SSOT)
# Federation secrets are bidirectional and stored with sorted country codes
# Example: dive-v3-federation-fra-usa (alphabetical order)
##
_get_federation_secret() {
    local source_code="${1,,}"  # lowercase
    local target_code="${2,,}"  # lowercase
    local project="${GCP_PROJECT:-dive25}"

    # Sort codes alphabetically for consistent naming
    local codes=("$source_code" "$target_code")
    IFS=$'\n' sorted_codes=($(sort <<<"${codes[*]}"))
    unset IFS
    local secret_name="dive-v3-federation-${sorted_codes[0]}-${sorted_codes[1]}"

    # Try to fetch from GCP if authenticated
    if check_gcloud; then
        local existing_secret
        existing_secret=$(gcloud secrets versions access latest \
            --secret="$secret_name" \
            --project="$project" 2>/dev/null)

        if [ -n "$existing_secret" ]; then
            log_info "Using existing federation secret from GCP: $secret_name" >&2
            echo "$existing_secret"
            return 0
        fi

        # Generate new secret and store in GCP
        local new_secret=$(openssl rand -base64 24 | tr -d '/+=')

        if echo -n "$new_secret" | gcloud secrets create "$secret_name" \
            --data-file=- \
            --project="$project" \
            --replication-policy="automatic" &>/dev/null; then
            log_success "Created federation secret in GCP (SSOT): $secret_name" >&2
            echo "$new_secret"
            return 0
        else
            log_warn "Failed to create GCP secret, using ephemeral secret" >&2
            echo "$new_secret"
            return 0
        fi
    else
        # No GCP available - generate ephemeral (will break on redeploy)
        log_warn "gcloud not authenticated - using ephemeral federation secret" >&2
        log_warn "This secret will not persist after nuke - authenticate for SSOT" >&2
        openssl rand -base64 24 | tr -d '/+='
        return 0
    fi
}

# =============================================================================
# PORT CALCULATION - DELEGATED TO COMMON.SH (SSOT)
# =============================================================================

##
# Get backend port for an instance - delegates to common.sh
##
_get_instance_port() {
    local code="${1^^}"
    eval "$(get_instance_ports "$code")"
    echo "$SPOKE_BACKEND_PORT"
}

##
# Get Keycloak port for an instance - delegates to common.sh
##
_get_keycloak_port() {
    local code="${1^^}"
    eval "$(get_instance_ports "$code")"
    echo "$SPOKE_KEYCLOAK_HTTPS_PORT"
}

# =============================================================================
# KEYCLOAK ADMIN PASSWORD RETRIEVAL (SSOT-aware)
# =============================================================================

##
# Retrieve Keycloak admin password from multiple sources
# Tries: 1) GCP Secret Manager, 2) Container env (KC_BOOTSTRAP_ADMIN_PASSWORD),
#        3) Container env (KEYCLOAK_ADMIN_PASSWORD legacy), 4) Local .env file
##
_get_keycloak_admin_password_ssot() {
    local container_name="$1"
    local instance_code="${2,,}"  # lowercase

    # Try GCP Secret Manager first (SSOT)
    if check_gcloud; then
        local gcp_secret_name="dive-v3-keycloak-admin-password-${instance_code}"
        local gcp_password
        gcp_password=$(gcloud secrets versions access latest \
            --secret="$gcp_secret_name" \
            --project="${GCP_PROJECT:-dive25}" 2>/dev/null | tr -d '\n\r')

        if [ -n "$gcp_password" ]; then
            echo "$gcp_password"
            return 0
        fi

        # Fallback: Try legacy naming for backwards compatibility
        gcp_secret_name="dive-v3-keycloak-${instance_code}"
        gcp_password=$(gcloud secrets versions access latest \
            --secret="$gcp_secret_name" \
            --project="${GCP_PROJECT:-dive25}" 2>/dev/null | tr -d '\n\r')

        if [ -n "$gcp_password" ]; then
            echo "$gcp_password"
            return 0
        fi
    fi

    # Try container environment (KC_BOOTSTRAP_ADMIN_PASSWORD for Keycloak 26.4.2+)
    local container_password
    container_password=$(docker exec "$container_name" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')

    if [ -n "$container_password" ]; then
        echo "$container_password"
        return 0
    fi

    # Try container environment (KEYCLOAK_ADMIN_PASSWORD for older versions)
    container_password=$(docker exec "$container_name" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')

    if [ -n "$container_password" ]; then
        echo "$container_password"
        return 0
    fi

    # Try local .env file as last resort
    local env_file
    if [ "$instance_code" = "usa" ]; then
        env_file="${DIVE_ROOT}/.env.hub"
    else
        env_file="${DIVE_ROOT}/instances/${instance_code}/.env"
    fi

    if [ -f "$env_file" ]; then
        local env_password
        local instance_upper="${instance_code^^}"

        # Try instance-suffixed variable first (new pipeline convention)
        env_password=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${instance_upper}=" "$env_file" | cut -d'=' -f2- | tr -d '\n\r"' | sed 's/#.*//')

        # Fallback to generic variable for backward compatibility
        if [ -z "$env_password" ]; then
            env_password=$(grep "^KEYCLOAK_ADMIN_PASSWORD=" "$env_file" | cut -d'=' -f2- | tr -d '\n\r"' | sed 's/#.*//')
        fi

        if [ -n "$env_password" ]; then
            echo "$env_password"
            return 0
        fi
    fi

    # No password found
    return 1
}

# =============================================================================
# DIRECT IDP CREATION (Keycloak Admin API)
# =============================================================================

##
# Direct IdP creation using Keycloak Admin API (bypasses backend)
#
# Arguments:
#   $1 - Target instance code (where IdP will be created)
#   $2 - Source instance code (IdP source for federation)
##
_federation_link_direct() {
    local target_code="${1:?Target instance required}"
    local source_code="${2:?Source instance required}"

    local target_upper="${target_code^^}"
    local target_lower="${target_code,,}"
    local source_upper="${source_code^^}"
    local source_lower="${source_code,,}"

    # Determine containers and realms
    local target_kc_container target_realm
    if [ "$target_upper" = "USA" ]; then
        target_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
        target_realm="dive-v3-broker-usa"
    else
        target_kc_container="dive-spoke-${target_lower}-keycloak"
        target_realm="dive-v3-broker-${target_lower}"
    fi

    local source_realm
    if [ "$source_upper" = "USA" ]; then
        source_realm="dive-v3-broker-usa"
    else
        source_realm="dive-v3-broker-${source_lower}"
    fi

    # Get admin token for target
    local target_pass
    target_pass=$(_get_keycloak_admin_password_ssot "$target_kc_container" "$target_lower")

    if [ -z "$target_pass" ]; then
        log_error "Cannot get Keycloak password for $target_upper"
        return 1
    fi

    log_info "Using Keycloak password from GCP Secret Manager (SSOT)"

    # Wait for Keycloak admin API readiness before authentication
    log_verbose "Ensuring $target_upper Keycloak admin API is ready..."
    if ! wait_for_keycloak_admin_api_ready "$target_kc_container" 180 "$target_pass"; then
        log_error "Keycloak admin API not ready: $target_kc_container"
        return 1
    fi

    # Authenticate with target Keycloak
    local token=$(docker exec "$target_kc_container" curl -sf --max-time 10 \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" -d "username=admin" -d "password=${target_pass}" \
        -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    if [ -z "$token" ]; then
        log_error "Failed to authenticate with $target_upper Keycloak"
        return 1
    fi

    # Federation client ID format
    local federation_client_id="dive-v3-broker-${target_lower}"
    local idp_alias="${source_lower}-idp"

    # Get client secret from source instance
    local source_kc_container
    if [ "$source_upper" = "USA" ]; then
        source_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
    else
        source_kc_container="dive-spoke-${source_lower}-keycloak"
    fi

    # Get source Keycloak password using SSOT helper
    local source_pass
    source_pass=$(_get_keycloak_admin_password_ssot "$source_kc_container" "$source_lower")

    if [ -z "$source_pass" ]; then
        log_error "Cannot get source Keycloak password for $source_upper"
        return 1
    fi

    log_verbose "Retrieved password for $source_upper Keycloak (${#source_pass} chars)"

    # Wait for SOURCE Keycloak readiness too
    log_verbose "Ensuring $source_upper Keycloak admin API is ready..."
    if ! wait_for_keycloak_admin_api_ready "$source_kc_container" 180 "$source_pass"; then
        log_error "Source Keycloak admin API not ready: $source_kc_container"
        return 1
    fi
    log_verbose "Source $source_upper Keycloak admin API ready"

    # Authenticate with source Keycloak
    local auth_response
    auth_response=$(docker exec "$source_kc_container" curl -s --max-time 10 \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${source_pass}" \
        -d "client_id=admin-cli" 2>&1)

    local source_token
    source_token=$(echo "$auth_response" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    if [ -z "$source_token" ]; then
        log_error "Failed to authenticate with source $source_upper Keycloak"
        if echo "$auth_response" | grep -q "error"; then
            local error_desc=$(echo "$auth_response" | grep -o '"error_description":"[^"]*' | cut -d'"' -f4)
            [ -n "$error_desc" ] && log_error "Keycloak error: $error_desc"
        fi
        return 1
    fi

    log_info "Successfully authenticated with source $source_upper Keycloak"

    # Get client secret
    log_info "Querying for existing federation client: $federation_client_id"
    local client_uuid=$(docker exec "$source_kc_container" curl -sf --max-time 10 \
        -H "Authorization: Bearer $source_token" \
        "http://localhost:8080/admin/realms/${source_realm}/clients?clientId=${federation_client_id}" 2>/dev/null | \
        grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

    local client_secret=""
    if [ -n "$client_uuid" ]; then
        log_info "Found existing client, retrieving secret..."
        client_secret=$(docker exec "$source_kc_container" curl -s --max-time 10 \
            -H "Authorization: Bearer $source_token" \
            "http://localhost:8080/admin/realms/${source_realm}/clients/${client_uuid}/client-secret" 2>/dev/null | \
            grep -o '"value":"[^"]*' | cut -d'"' -f4)

        if [ -z "$client_secret" ]; then
            log_warn "Could not retrieve secret from Keycloak, using GCP SSOT"
            client_secret=$(_get_federation_secret "$source_lower" "$target_lower")
        fi
    else
        log_info "Client does not exist, will create new one"
    fi

    # If client doesn't exist, create it
    if [ -z "$client_uuid" ] || [ -z "$client_secret" ]; then
        log_info "Creating federation client: ${federation_client_id}"
        client_secret=$(_get_federation_secret "$source_lower" "$target_lower")

        local new_client_config
        new_client_config=$(printf '{
  "clientId": "%s",
  "name": "%s Federation Client",
  "enabled": true,
  "clientAuthenticatorType": "client-secret",
  "secret": "%s",
  "redirectUris": ["*"],
  "webOrigins": ["*"],
  "standardFlowEnabled": true,
  "directAccessGrantsEnabled": true,
  "publicClient": false,
  "protocol": "openid-connect"
}' "$federation_client_id" "$target_upper" "$client_secret")

        log_info "POSTing client configuration to Keycloak..."

        local create_output
        create_output=$(echo "$new_client_config" | docker exec -i "$source_kc_container" \
            curl -s --max-time 15 -w "\nHTTP_CODE:%{http_code}" \
            -X POST "http://localhost:8080/admin/realms/${source_realm}/clients" \
            -H "Authorization: Bearer $source_token" \
            -H "Content-Type: application/json" \
            -d @- 2>&1)

        local create_exit=$?

        if [ $create_exit -eq 0 ]; then
            local http_code=$(echo "$create_output" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
            if [ "$http_code" = "201" ] || [ "$http_code" = "204" ] || [ -z "$http_code" ]; then
                log_success "Created federation client: ${federation_client_id}"
            else
                log_warn "Unexpected HTTP code: $http_code"
            fi
        elif [ $create_exit -eq 28 ]; then
            log_error "Timeout creating federation client (check Keycloak health)"
            return 1
        else
            log_error "Failed to create federation client (exit code: $create_exit)"
            return 1
        fi
    fi

    # Add protocol mappers to the SOURCE federation client
    log_info "Adding protocol mappers to source federation client..."
    _ensure_federation_client_mappers "$source_kc_container" "$source_token" "$source_realm" "$federation_client_id"

    if [ -z "$client_secret" ]; then
        client_secret=$(_get_federation_secret "$source_lower" "$target_lower")
    fi

    # URL Strategy: Dual URLs for browser vs server-to-server
    local source_public_url source_internal_url
    if [ "$source_upper" = "USA" ]; then
        source_public_url="https://localhost:8443"
        source_internal_url="https://dive-hub-keycloak:8443"
    else
        local _kc_port=$(_get_keycloak_port "$source_upper")
        source_public_url="https://localhost:${_kc_port}"
        source_internal_url="https://dive-spoke-${source_lower}-keycloak:8443"
    fi

    # IdP configuration
    # Spoke handles MFA - Hub trusts spoke's authentication
    local idp_config="{
        \"alias\": \"${idp_alias}\",
        \"displayName\": \"${source_upper} Federation\",
        \"providerId\": \"oidc\",
        \"enabled\": true,
        \"trustEmail\": true,
        \"storeToken\": true,
        \"linkOnly\": false,
        \"firstBrokerLoginFlowAlias\": \"\",
        \"updateProfileFirstLoginMode\": \"off\",
        \"postBrokerLoginFlowAlias\": \"\",
        \"config\": {
            \"clientId\": \"${federation_client_id}\",
            \"clientSecret\": \"${client_secret}\",
            \"authorizationUrl\": \"${source_public_url}/realms/${source_realm}/protocol/openid-connect/auth\",
            \"tokenUrl\": \"${source_internal_url}/realms/${source_realm}/protocol/openid-connect/token\",
            \"userInfoUrl\": \"${source_internal_url}/realms/${source_realm}/protocol/openid-connect/userinfo\",
            \"logoutUrl\": \"${source_public_url}/realms/${source_realm}/protocol/openid-connect/logout\",
            \"issuer\": \"${source_public_url}/realms/${source_realm}\",
            \"validateSignature\": \"false\",
            \"useJwksUrl\": \"true\",
            \"jwksUrl\": \"${source_internal_url}/realms/${source_realm}/protocol/openid-connect/certs\",
            \"syncMode\": \"FORCE\",
            \"clientAuthMethod\": \"client_secret_post\"
        }
    }"

    # Idempotent IdP creation: check if exists, update if needed, create if not
    local existing_idp
    existing_idp=$(docker exec "$target_kc_container" curl -sf \
        -H "Authorization: Bearer $token" \
        "http://localhost:8080/admin/realms/${target_realm}/identity-provider/instances/${idp_alias}" 2>/dev/null)

    if [ -n "$existing_idp" ] && echo "$existing_idp" | grep -q '"alias"'; then
        log_info "IdP ${idp_alias} already exists in ${target_upper}, updating..."

        local update_result
        update_result=$(docker exec "$target_kc_container" curl -sf -w "\nHTTP_CODE:%{http_code}" \
            -X PUT "http://localhost:8080/admin/realms/${target_realm}/identity-provider/instances/${idp_alias}" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$idp_config" 2>&1)

        local http_code=$(echo "$update_result" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
        if [ "$http_code" = "204" ] || [ "$http_code" = "200" ] || [ -z "$http_code" ]; then
            log_success "Updated ${idp_alias} in ${target_upper}"
        else
            log_warn "IdP update returned HTTP $http_code (may still be OK)"
        fi
    else
        log_info "Creating ${idp_alias} in ${target_upper}..."

        local create_result
        create_result=$(docker exec "$target_kc_container" curl -s -w "\nHTTP_CODE:%{http_code}" \
            -X POST "http://localhost:8080/admin/realms/${target_realm}/identity-provider/instances" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$idp_config" 2>&1)

        local http_code=$(echo "$create_result" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)

        if [ "$http_code" = "201" ] || [ "$http_code" = "204" ]; then
            log_success "Created ${idp_alias} in ${target_upper}"
        elif [ "$http_code" = "409" ]; then
            log_warn "IdP already exists (409), updating instead..."
            docker exec "$target_kc_container" curl -sf \
                -X PUT "http://localhost:8080/admin/realms/${target_realm}/identity-provider/instances/${idp_alias}" \
                -H "Authorization: Bearer $token" \
                -H "Content-Type: application/json" \
                -d "$idp_config" 2>/dev/null || true
            log_success "Updated ${idp_alias} in ${target_upper}"
        else
            log_error "Failed to create IdP: HTTP $http_code"
            log_error "Response: $create_result"
            return 1
        fi
    fi

    # Configure IdP mappers to import claims from federated tokens
    log_info "Configuring IdP claim mappers for ${idp_alias}..."
    _configure_idp_mappers "$target_kc_container" "$token" "$target_realm" "$idp_alias"

    return 0
}

# =============================================================================
# FEDERATION CLIENT MANAGEMENT
# =============================================================================

##
# Ensure a federation client exists in a realm
##
_ensure_federation_client() {
    local kc_container="$1"
    local token="$2"
    local realm="$3"
    local partner_lower="$4"
    local partner_upper="$5"

    local client_id="dive-v3-broker-${partner_lower}"

    echo -n "  Checking ${client_id} in ${realm}... "

    local existing=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $token" \
        "http://localhost:8080/admin/realms/${realm}/clients?clientId=${client_id}" 2>/dev/null | \
        grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

    if [ -n "$existing" ]; then
        echo -e "${GREEN}exists${NC}"
    else
        echo -n "creating... "

        local client_secret=$(_get_federation_secret "$realm" "$partner_lower")

        local client_config="{
            \"clientId\": \"${client_id}\",
            \"name\": \"${partner_upper} Federation Client\",
            \"description\": \"Allows users from ${partner_upper} to authenticate\",
            \"enabled\": true,
            \"clientAuthenticatorType\": \"client-secret\",
            \"secret\": \"${client_secret}\",
            \"redirectUris\": [\"*\"],
            \"webOrigins\": [\"*\"],
            \"standardFlowEnabled\": true,
            \"directAccessGrantsEnabled\": true,
            \"publicClient\": false,
            \"protocol\": \"openid-connect\"
        }"

        docker exec "$kc_container" curl -sf \
            -X POST "http://localhost:8080/admin/realms/${realm}/clients" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$client_config" 2>/dev/null

        echo -e "${GREEN}created${NC}"
    fi

    _ensure_federation_client_mappers "$kc_container" "$token" "$realm" "$client_id"
}

# =============================================================================
# PROTOCOL MAPPER MANAGEMENT (comprehensive, with localization)
# =============================================================================

##
# Add protocol mappers to a federation client to expose user attributes in tokens
# Includes standard attributes, localized country-specific attributes, and AMR/ACR
#
# NOTE: When USE_TERRAFORM_SSOT=true, this function is SKIPPED because
# Terraform manages protocol mappers via terraform/modules/federated-instance/
##
_ensure_federation_client_mappers() {
    # Skip if Terraform is SSOT
    if [ "${USE_TERRAFORM_SSOT:-false}" = "true" ]; then
        log_verbose "Skipping protocol mappers (Terraform SSOT enabled)"
        return 0
    fi

    local kc_container="$1"
    local token="$2"
    local realm="$3"
    local client_id="$4"

    # Get client UUID
    local client_uuid=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $token" \
        "http://localhost:8080/admin/realms/${realm}/clients?clientId=${client_id}" 2>/dev/null | \
        jq -r '.[0].id // empty' 2>/dev/null)

    if [ -z "$client_uuid" ]; then
        log_warn "Could not find client UUID for ${client_id}"
        return 1
    fi

    echo -n "  Adding protocol mappers to ${client_id}... "

    # Standard normalized attributes
    local standard_attrs=("clearance" "countryOfAffiliation" "acpCOI" "uniqueID")

    # Country-specific localized attribute mappings (source_attribute:claim_name)
    # Driven by config/locale-mappings.conf — add new countries there, no code changes needed
    local localized_attrs=()
    local realm_code=$(upper "${realm##*-}")
    local locale_config="${DIVE_ROOT}/config/locale-mappings.conf"
    if [ -f "$locale_config" ]; then
        local mapping_line
        mapping_line=$(grep "^${realm_code}|" "$locale_config" 2>/dev/null || true)
        if [ -n "$mapping_line" ]; then
            # Parse pipe-delimited fields: CODE|src:claim|src:claim|...
            IFS='|' read -ra fields <<< "$mapping_line"
            for ((i=1; i<${#fields[@]}; i++)); do
                [ -n "${fields[$i]}" ] && localized_attrs+=("${fields[$i]}")
            done
        fi
    fi

    local mapper_count=0

    # Create mappers for standard attributes (acpCOI is multivalued)
    for attr in "${standard_attrs[@]}"; do
        local multivalued="false"
        [ "$attr" = "acpCOI" ] && multivalued="true"
        _create_protocol_mapper "$kc_container" "$token" "$realm" "$client_uuid" "$attr" "$attr" "federation-std-${attr}" "$multivalued"
        ((mapper_count++))
    done

    # Create mappers for localized attributes
    for mapping in "${localized_attrs[@]}"; do
        local source_attr="${mapping%%:*}"
        local claim_name="${mapping##*:}"
        local multivalued="false"
        [ "$claim_name" = "acpCOI" ] && multivalued="true"
        _create_protocol_mapper "$kc_container" "$token" "$realm" "$client_uuid" "$source_attr" "$claim_name" "federation-${source_attr}" "$multivalued"
        ((mapper_count++))
    done

    # Add AMR/ACR protocol mappers for MFA state propagation
    _create_amr_acr_mappers "$kc_container" "$token" "$realm" "$client_uuid"
    ((mapper_count += 2))

    echo -e "${GREEN}${mapper_count} mappers${NC}"
}

##
# Create AMR/ACR protocol mappers on a client
# These read from the authentication session (not user attributes)
##
_create_amr_acr_mappers() {
    local kc_container="$1"
    local token="$2"
    local realm="$3"
    local client_uuid="$4"

    # AMR Mapper
    local amr_mapper_name="federation-amr"
    local amr_mapper_config="{
        \"name\": \"${amr_mapper_name}\",
        \"protocol\": \"openid-connect\",
        \"protocolMapper\": \"oidc-amr-mapper\",
        \"consentRequired\": false,
        \"config\": {
            \"id.token.claim\": \"true\",
            \"access.token.claim\": \"true\",
            \"userinfo.token.claim\": \"true\",
            \"claim.name\": \"amr\"
        }
    }"

    local existing_amr=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $token" \
        "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" 2>/dev/null | \
        jq -r --arg name "$amr_mapper_name" '.[] | select(.name==$name) | .id // empty' 2>/dev/null)

    if [ -n "$existing_amr" ]; then
        docker exec "$kc_container" curl -sf \
            -X PUT "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models/${existing_amr}" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$amr_mapper_config" >/dev/null 2>&1
    else
        docker exec "$kc_container" curl -sf \
            -X POST "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$amr_mapper_config" >/dev/null 2>&1
    fi

    # ACR Mapper
    local acr_mapper_name="federation-acr"
    local acr_mapper_config="{
        \"name\": \"${acr_mapper_name}\",
        \"protocol\": \"openid-connect\",
        \"protocolMapper\": \"oidc-acr-mapper\",
        \"consentRequired\": false,
        \"config\": {
            \"id.token.claim\": \"true\",
            \"access.token.claim\": \"true\",
            \"userinfo.token.claim\": \"true\",
            \"claim.name\": \"acr\"
        }
    }"

    local existing_acr=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $token" \
        "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" 2>/dev/null | \
        jq -r --arg name "$acr_mapper_name" '.[] | select(.name==$name) | .id // empty' 2>/dev/null)

    if [ -n "$existing_acr" ]; then
        docker exec "$kc_container" curl -sf \
            -X PUT "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models/${existing_acr}" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$acr_mapper_config" >/dev/null 2>&1
    else
        docker exec "$kc_container" curl -sf \
            -X POST "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$acr_mapper_config" >/dev/null 2>&1
    fi
}

##
# Create a single protocol mapper on a client
# Usage: _create_protocol_mapper container token realm client_uuid user_attr claim_name mapper_name [multivalued]
##
_create_protocol_mapper() {
    local kc_container="$1"
    local token="$2"
    local realm="$3"
    local client_uuid="$4"
    local user_attr="$5"
    local claim_name="$6"
    local mapper_name="$7"
    local multivalued="${8:-false}"

    local existing=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $token" \
        "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" 2>/dev/null | \
        jq -r --arg name "$mapper_name" '.[] | select(.name==$name) | .id // empty' 2>/dev/null)

    # Always use jsonType.label=String for Keycloak v26+
    local mapper_config="{
        \"name\": \"${mapper_name}\",
        \"protocol\": \"openid-connect\",
        \"protocolMapper\": \"oidc-usermodel-attribute-mapper\",
        \"consentRequired\": false,
        \"config\": {
            \"userinfo.token.claim\": \"true\",
            \"id.token.claim\": \"true\",
            \"access.token.claim\": \"true\",
            \"claim.name\": \"${claim_name}\",
            \"user.attribute\": \"${user_attr}\",
            \"jsonType.label\": \"String\",
            \"multivalued\": \"${multivalued}\"
        }
    }"

    if [ -n "$existing" ]; then
        docker exec "$kc_container" curl -sf \
            -X PUT "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models/${existing}" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$mapper_config" >/dev/null 2>&1
    else
        docker exec "$kc_container" curl -sf \
            -X POST "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$mapper_config" >/dev/null 2>&1
    fi
}

# =============================================================================
# IDP MAPPER MANAGEMENT
# =============================================================================

##
# Configure IdP claim mappers for importing claims from federated tokens
# These mappers tell Keycloak how to import claims from the remote IdP's
# tokens into local user attributes.
##
_configure_idp_mappers() {
    local kc_container="$1"
    local token="$2"
    local realm="$3"
    local idp_alias="$4"

    # Standard claim names including AMR/ACR for MFA state propagation
    local claims=("clearance" "countryOfAffiliation" "uniqueID" "acpCOI" "amr" "acr")

    for claim in "${claims[@]}"; do
        _create_idp_mapper "$kc_container" "$token" "$realm" "$idp_alias" "$claim" "$claim" "import-${claim}"
    done
}

##
# Create a single IdP mapper
##
_create_idp_mapper() {
    local kc_container="$1"
    local token="$2"
    local realm="$3"
    local idp_alias="$4"
    local claim_name="$5"
    local user_attr="$6"
    local mapper_name="$7"

    local existing=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $token" \
        "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/${idp_alias}/mappers" 2>/dev/null | \
        jq -r --arg name "$mapper_name" '.[] | select(.name==$name) | .id // empty' 2>/dev/null)

    local mapper_config="{
        \"name\": \"${mapper_name}\",
        \"identityProviderAlias\": \"${idp_alias}\",
        \"identityProviderMapper\": \"oidc-user-attribute-idp-mapper\",
        \"config\": {
            \"claim\": \"${claim_name}\",
            \"user.attribute\": \"${user_attr}\",
            \"syncMode\": \"FORCE\"
        }
    }"

    if [ -n "$existing" ]; then
        docker exec "$kc_container" curl -sf \
            -X PUT "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/${idp_alias}/mappers/${existing}" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$mapper_config" >/dev/null 2>&1 || true
    else
        docker exec "$kc_container" curl -sf \
            -X POST "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/${idp_alias}/mappers" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$mapper_config" >/dev/null 2>&1 || true
    fi
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
        test|integration-test)
            # Load verification module for test functions
            if [ -f "${FEDERATION_DIR}/verification.sh" ]; then
                source "${FEDERATION_DIR}/verification.sh"
            fi
            federation_integration_test "$@"
            ;;
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
            echo "  test              Run federation integration tests"
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
# Ported from federation-link.sh
export -f _get_federation_secret
export -f _get_instance_port
export -f _get_keycloak_port
export -f _get_keycloak_admin_password_ssot
export -f _federation_link_direct
export -f _ensure_federation_client
export -f _ensure_federation_client_mappers
export -f _create_amr_acr_mappers
export -f _create_protocol_mapper
export -f _configure_idp_mappers
export -f _create_idp_mapper

log_verbose "Federation setup module loaded (consolidated)"
