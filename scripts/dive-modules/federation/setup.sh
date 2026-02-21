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

# Load Keycloak admin API abstraction (cross-network support)
if [ -z "${KEYCLOAK_API_LOADED:-}" ]; then
    source "${FEDERATION_DIR}/keycloak-api.sh"
fi

# =============================================================================
# FEDERATION CONFIGURATION
# =============================================================================

# Hub Keycloak configuration — resolved via SSOT helper
HUB_KC_URL="${HUB_KC_URL:-$(resolve_hub_public_url "idp")}"
HUB_REALM="${HUB_REALM:-dive-v3-broker-usa}"

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
    # Delegate to unified Keycloak API abstraction (keycloak-api.sh)
    # which handles local docker exec and remote HTTPS paths, plus token caching
    if type keycloak_get_admin_token &>/dev/null; then
        keycloak_get_admin_token "USA"
        return $?
    fi

    # Fallback: legacy inline path (if keycloak-api.sh not loaded)
    local max_retries=15
    local retry_delay=5

    local i
    for ((i=1; i<=max_retries; i++)); do
        local admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"

        if [ -z "$admin_pass" ] && type get_keycloak_admin_password &>/dev/null; then
            admin_pass=$(get_keycloak_admin_password "HUB" 2>/dev/null || get_keycloak_admin_password "USA" 2>/dev/null)
        fi

        if [ -z "$admin_pass" ]; then
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

    # Delegate to unified Keycloak API abstraction (keycloak-api.sh)
    if type keycloak_get_admin_token &>/dev/null; then
        keycloak_get_admin_token "$instance_code"
        return $?
    fi

    # Fallback: legacy inline path (if keycloak-api.sh not loaded)
    local code_lower
    code_lower=$(lower "$instance_code")

    eval "$(get_instance_ports "$instance_code" 2>/dev/null)"
    local spoke_url
    spoke_url=$(resolve_spoke_public_url "$instance_code" "idp")

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
    local code_upper
    code_upper=$(upper "$instance_code")
    local code_lower
    code_lower=$(lower "$instance_code")

    log_step "Linking $code_upper to Hub federation..."

    # Step 1: Get tokens
    log_info "Step 1: Getting admin tokens..."

    local hub_token
    hub_token=$(get_hub_admin_token)
    if [ -z "$hub_token" ]; then
        log_error "Failed to get Hub admin token"
        return 1
    fi

    local spoke_token
    spoke_token=$(get_spoke_admin_token "$instance_code")
    if [ -z "$spoke_token" ]; then
        log_error "Failed to get Spoke admin token"
        return 1
    fi

    # Step 2: Get spoke realm info
    log_info "Step 2: Getting Spoke realm information..."

    # Get port information using eval pattern
    eval "$(get_instance_ports "$instance_code" 2>/dev/null)"
    local spoke_url
    spoke_url=$(resolve_spoke_public_url "$instance_code" "idp")
    local spoke_realm="dive-v3-broker-${code_lower}"

    # Step 3: Create IdP on Hub for this Spoke
    log_info "Step 3: Creating IdP on Hub for $code_upper..."

    local idp_alias="${code_lower}-idp"

    # Detect Simple Post-Broker OTP flow in Hub realm (created by Terraform realm-mfa module)
    local _hub_otp_flow=""
    local _hub_fed_flows
    _hub_fed_flows=$(keycloak_admin_api "USA" "GET" \
        "realms/dive-v3-broker-usa/authentication/flows" 2>/dev/null || echo "[]")
    _hub_otp_flow=$(echo "$_hub_fed_flows" | python3 -c "
import json,sys
try:
    flows = json.load(sys.stdin)
    for f in flows:
        if f.get('alias','') == 'Simple Post-Broker OTP' and not f.get('builtIn',False):
            print(f['alias']); break
except: pass
" 2>/dev/null)
    [ -n "$_hub_otp_flow" ] && log_verbose "Using Hub post-broker OTP flow: ${_hub_otp_flow}"

    local idp_config
    idp_config=$(cat << EOF
{
  "alias": "${idp_alias}",
  "displayName": "${code_upper} Identity Provider",
  "providerId": "oidc",
  "enabled": true,
  "trustEmail": true,
  "storeToken": true,
  "linkOnly": false,
  "firstBrokerLoginFlowAlias": "first broker login",
  "postBrokerLoginFlowAlias": "${_hub_otp_flow}",
  "config": {
    "issuer": "${spoke_url}/realms/${spoke_realm}",
    "authorizationUrl": "${spoke_url}/realms/${spoke_realm}/protocol/openid-connect/auth",
    "tokenUrl": "${spoke_url}/realms/${spoke_realm}/protocol/openid-connect/token",
    "userInfoUrl": "${spoke_url}/realms/${spoke_realm}/protocol/openid-connect/userinfo",
    "logoutUrl": "${spoke_url}/realms/${spoke_realm}/protocol/openid-connect/logout",
    "clientId": "dive-v3-broker-usa",
    "clientSecret": "${HUB_REALM}",
    "defaultScope": "openid profile email clearance countryOfAffiliation uniqueID acpCOI user_acr user_amr",
    "syncMode": "FORCE",
    "validateSignature": "true",
    "useJwksUrl": "true",
    "jwksUrl": "${spoke_url}/realms/${spoke_realm}/protocol/openid-connect/certs"
  }
}
EOF
)

    # Idempotent IdP creation via keycloak_admin_api (supports local + remote)
    local existing_idp
    existing_idp=$(keycloak_admin_api "USA" "GET" \
        "realms/${HUB_REALM}/identity-provider/instances/${idp_alias}" 2>/dev/null)

    if [ -n "$existing_idp" ] && echo "$existing_idp" | grep -q '"alias"'; then
        log_info "IdP ${idp_alias} already exists on Hub, updating..."
        _federation_retry_with_backoff 3 2 \
            keycloak_admin_api "USA" "PUT" \
            "realms/${HUB_REALM}/identity-provider/instances/${idp_alias}" "$idp_config" >/dev/null 2>&1
        log_success "Updated IdP on Hub for $code_upper"
    else
        local create_rc=0
        _federation_retry_with_backoff 3 2 \
            keycloak_admin_api "USA" "POST" \
            "realms/${HUB_REALM}/identity-provider/instances" "$idp_config" >/dev/null 2>&1 || create_rc=$?
        if [ "$create_rc" -eq 0 ]; then
            log_success "IdP created on Hub for $code_upper"
        else
            log_warn "IdP creation may have failed after retries (exit $create_rc)"
        fi
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
    local code_upper
    code_upper=$(upper "$instance_code")
    local code_lower
    code_lower=$(lower "$instance_code")

    log_warn "Unlinking $code_upper from Hub federation..."

    local hub_token
    hub_token=$(get_hub_admin_token)
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
    local code_lower
    code_lower=$(lower "$instance_code")

    # Get port information using eval pattern
    eval "$(get_instance_ports "$instance_code" 2>/dev/null)"
    local spoke_url
    spoke_url=$(resolve_spoke_public_url "$instance_code" "idp")
    local spoke_realm="dive-v3-broker-${code_lower}"

    # Get client ID
    # The spoke should have an incoming federation client named dive-v3-broker-usa
    # This is the client the Hub uses to authenticate to the spoke
    local client_id
    client_id=$(curl -sf "${spoke_url}/admin/realms/${spoke_realm}/clients" \
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
    local sorted_codes
    mapfile -t sorted_codes < <(printf '%s\n' "${codes[@]}" | sort)
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
        local new_secret
        new_secret=$(openssl rand -base64 24 | tr -d '/+=')

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

    # Priority 1: Running container environment (SSOT for current deployment)
    # The container was started with the password from .env — this is the ground truth
    local container_password
    container_password=$(docker exec "$container_name" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    if [ -n "$container_password" ]; then
        echo "$container_password"
        return 0
    fi

    container_password=$(docker exec "$container_name" printenv KC_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    if [ -n "$container_password" ]; then
        echo "$container_password"
        return 0
    fi

    container_password=$(docker exec "$container_name" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    if [ -n "$container_password" ]; then
        echo "$container_password"
        return 0
    fi

    # Priority 2: Local .env file (deployment config for this instance)
    local env_file
    if [ "$instance_code" = "usa" ]; then
        env_file="${DIVE_ROOT}/.env.hub"
    else
        env_file="${DIVE_ROOT}/instances/${instance_code}/.env"
    fi

    if [ -f "$env_file" ]; then
        local env_password
        local instance_upper="${instance_code^^}"

        # Try KC_ADMIN_PASSWORD_INSTANCE first (docker-compose convention)
        env_password=$(grep "^KC_ADMIN_PASSWORD_${instance_upper}=" "$env_file" | cut -d'=' -f2- | tr -d '\n\r"' | sed 's/#.*//')

        # Try KEYCLOAK_ADMIN_PASSWORD_INSTANCE (legacy convention)
        [ -z "$env_password" ] && env_password=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${instance_upper}=" "$env_file" | cut -d'=' -f2- | tr -d '\n\r"' | sed 's/#.*//')

        # Try generic KEYCLOAK_ADMIN_PASSWORD
        [ -z "$env_password" ] && env_password=$(grep "^KEYCLOAK_ADMIN_PASSWORD=" "$env_file" | cut -d'=' -f2- | tr -d '\n\r"' | sed 's/#.*//')

        if [ -n "$env_password" ]; then
            echo "$env_password"
            return 0
        fi
    fi

    # Priority 3: GCP Secret Manager (external, may be stale after nuke+redeploy)
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

        # Fallback: Try legacy naming
        gcp_secret_name="dive-v3-keycloak-${instance_code}"
        gcp_password=$(gcloud secrets versions access latest \
            --secret="$gcp_secret_name" \
            --project="${GCP_PROJECT:-dive25}" 2>/dev/null | tr -d '\n\r')

        if [ -n "$gcp_password" ]; then
            echo "$gcp_password"
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
    log_info "Resolving $target_upper Keycloak admin password..."
    local target_pass
    target_pass=$(_get_keycloak_admin_password_ssot "$target_kc_container" "$target_lower")

    if [ -z "$target_pass" ]; then
        log_error "Cannot get Keycloak password for $target_upper"
        return 1
    fi

    log_info "✓ $target_upper password resolved (${#target_pass} chars)"

    # Quick readiness check (uses abstraction layer — works local or remote)
    log_info "Verifying $target_upper Keycloak admin API..."
    if ! keycloak_admin_api_available "$target_code"; then
        # Fallback: try legacy wait_for_keycloak_admin_api_ready for local containers
        if is_spoke_local "$target_code" && type wait_for_keycloak_admin_api_ready &>/dev/null; then
            if ! wait_for_keycloak_admin_api_ready "$target_kc_container" 30 "$target_pass"; then
                log_error "Keycloak admin API not ready: $target_upper"
                return 1
            fi
        else
            log_error "Keycloak admin API not reachable: $target_upper"
            return 1
        fi
    fi

    # Authenticate with target Keycloak (via unified API)
    log_info "Authenticating with $target_upper Keycloak..."
    local token
    token=$(keycloak_get_admin_token "$target_code")

    if [ -z "$token" ]; then
        log_error "Failed to authenticate with $target_upper Keycloak"
        return 1
    fi
    log_info "✓ Authenticated with $target_upper Keycloak"

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
    log_info "Resolving $source_upper Keycloak admin password..."
    local source_pass
    source_pass=$(_get_keycloak_admin_password_ssot "$source_kc_container" "$source_lower")

    if [ -z "$source_pass" ]; then
        log_error "Cannot get source Keycloak password for $source_upper"
        return 1
    fi

    log_info "✓ $source_upper password resolved (${#source_pass} chars)"

    # Quick readiness check (uses abstraction layer — works local or remote)
    log_info "Verifying $source_upper Keycloak admin API..."
    if ! keycloak_admin_api_available "$source_code"; then
        if is_spoke_local "$source_code" && type wait_for_keycloak_admin_api_ready &>/dev/null; then
            if ! wait_for_keycloak_admin_api_ready "$source_kc_container" 30 "$source_pass"; then
                log_error "Source Keycloak admin API not ready: $source_upper"
                return 1
            fi
        else
            log_error "Source Keycloak admin API not reachable: $source_upper"
            return 1
        fi
    fi
    log_info "✓ $source_upper Keycloak admin API ready"

    # Authenticate with source Keycloak (via unified API)
    log_info "Authenticating with source $source_upper Keycloak..."
    local source_token
    source_token=$(keycloak_get_admin_token "$source_code")

    if [ -z "$source_token" ]; then
        log_error "Failed to authenticate with source $source_upper Keycloak"
        return 1
    fi

    log_info "Successfully authenticated with source $source_upper Keycloak"

    # Get client secret
    log_info "Querying for existing federation client: $federation_client_id"
    local client_uuid
    client_uuid=$(keycloak_admin_api "$source_code" "GET" \
        "realms/${source_realm}/clients?clientId=${federation_client_id}" 2>/dev/null | \
        grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

    local client_secret=""
    if [ -n "$client_uuid" ]; then
        log_info "Found existing client, retrieving secret..."
        client_secret=$(keycloak_admin_api "$source_code" "GET" \
            "realms/${source_realm}/clients/${client_uuid}/client-secret" 2>/dev/null | \
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
        create_output=$(keycloak_admin_api_with_status "$source_code" "POST" \
            "realms/${source_realm}/clients" "$new_client_config")
        local create_exit=$?

        if [ $create_exit -eq 0 ]; then
            local http_code
            http_code=$(echo "$create_output" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
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
    _ensure_federation_client_mappers "$source_code" "$source_token" "$source_realm" "$federation_client_id"

    if [ -z "$client_secret" ]; then
        client_secret=$(_get_federation_secret "$source_lower" "$target_lower")
    fi

    # URL Strategy: Dual URLs for browser vs server-to-server
    # Internal URLs are resolved dynamically — works for both co-located and
    # external (separate-network) deployments.
    local source_public_url source_internal_url
    if [ "$source_upper" = "USA" ]; then
        source_public_url=$(resolve_hub_public_url "idp")
        source_internal_url=$(resolve_hub_internal_url "idp")
    else
        source_public_url=$(resolve_spoke_public_url "$source_upper" "idp")
        source_internal_url=$(resolve_spoke_internal_url "$source_upper" "idp")
    fi

    # Detect Simple Post-Broker OTP flow in target realm (created by Terraform realm-mfa module)
    local _target_otp_flow=""
    local _target_all_flows
    _target_all_flows=$(keycloak_admin_api "$target_code" "GET" \
        "realms/${target_realm}/authentication/flows" 2>/dev/null || echo "[]")
    _target_otp_flow=$(echo "$_target_all_flows" | python3 -c "
import json,sys
try:
    flows = json.load(sys.stdin)
    for f in flows:
        if f.get('alias','') == 'Simple Post-Broker OTP' and not f.get('builtIn',False):
            print(f['alias']); break
except: pass
" 2>/dev/null)
    [ -n "$_target_otp_flow" ] && log_verbose "Using target post-broker OTP flow: ${_target_otp_flow}"

    # IdP configuration
    local idp_config="{
        \"alias\": \"${idp_alias}\",
        \"displayName\": \"${source_upper} Federation\",
        \"providerId\": \"oidc\",
        \"enabled\": true,
        \"trustEmail\": true,
        \"storeToken\": true,
        \"linkOnly\": false,
        \"firstBrokerLoginFlowAlias\": \"first broker login\",
        \"updateProfileFirstLoginMode\": \"off\",
        \"postBrokerLoginFlowAlias\": \"${_target_otp_flow}\",
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
            \"defaultScope\": \"openid profile email clearance countryOfAffiliation uniqueID acpCOI user_acr user_amr\",
            \"syncMode\": \"FORCE\",
            \"clientAuthMethod\": \"client_secret_post\"
        }
    }"

    # Idempotent IdP creation: check if exists, update if needed, create if not
    local existing_idp
    existing_idp=$(keycloak_admin_api "$target_code" "GET" \
        "realms/${target_realm}/identity-provider/instances/${idp_alias}" 2>/dev/null)

    if [ -n "$existing_idp" ] && echo "$existing_idp" | grep -q '"alias"'; then
        log_info "IdP ${idp_alias} already exists in ${target_upper}, updating..."

        local update_result
        update_result=$(keycloak_admin_api_with_status "$target_code" "PUT" \
            "realms/${target_realm}/identity-provider/instances/${idp_alias}" "$idp_config")

        local http_code
        http_code=$(echo "$update_result" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
        if [ "$http_code" = "204" ] || [ "$http_code" = "200" ] || [ -z "$http_code" ]; then
            log_success "Updated ${idp_alias} in ${target_upper}"
        else
            log_warn "IdP update returned HTTP $http_code (may still be OK)"
        fi
    else
        log_info "Creating ${idp_alias} in ${target_upper}..."

        local create_result
        create_result=$(keycloak_admin_api_with_status "$target_code" "POST" \
            "realms/${target_realm}/identity-provider/instances" "$idp_config")

        local http_code
        http_code=$(echo "$create_result" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)

        if [ "$http_code" = "201" ] || [ "$http_code" = "204" ]; then
            log_success "Created ${idp_alias} in ${target_upper}"
        elif [ "$http_code" = "409" ]; then
            log_warn "IdP already exists (409), updating instead..."
            keycloak_admin_api "$target_code" "PUT" \
                "realms/${target_realm}/identity-provider/instances/${idp_alias}" "$idp_config" 2>/dev/null || true
            log_success "Updated ${idp_alias} in ${target_upper}"
        else
            log_error "Failed to create IdP: HTTP $http_code"
            log_error "Response: $create_result"
            return 1
        fi
    fi

    # Configure IdP mappers to import claims from federated tokens
    log_info "Configuring IdP claim mappers for ${idp_alias}..."
    _configure_idp_mappers "$target_code" "$token" "$target_realm" "$idp_alias"

    return 0
}


# Load federation mapper management functions
source "$(dirname "${BASH_SOURCE[0]}")/mappers.sh"

# =============================================================================
# RESILIENCE UTILITIES (Phase 8)
# =============================================================================

# OIDC discovery cache directory (5-minute TTL)
_OIDC_CACHE_DIR="${TMPDIR:-/tmp}/dive-oidc-cache"
_OIDC_CACHE_TTL="${OIDC_CACHE_TTL:-300}"  # 5 minutes

##
# Retry a command with exponential backoff
#
# Arguments:
#   $1 - Max attempts (default: 3)
#   $2 - Initial delay in seconds (default: 2)
#   $@ - Command to execute (remaining args)
#
# Returns:
#   Exit code of the last attempt
##
_federation_retry_with_backoff() {
    local max_attempts="${1:-3}"
    local delay="${2:-2}"
    shift 2

    local attempt=1
    local rc=0
    while [ "$attempt" -le "$max_attempts" ]; do
        rc=0
        "$@" && return 0 || rc=$?

        if [ "$attempt" -lt "$max_attempts" ]; then
            log_verbose "Attempt $attempt/$max_attempts failed (exit $rc), retrying in ${delay}s..."
            sleep "$delay"
            delay=$((delay * 2))
        fi
        attempt=$((attempt + 1))
    done

    log_warn "All $max_attempts attempts failed for: $1"
    return "$rc"
}

##
# Clear the OIDC discovery cache (all entries or specific realm)
#
# Arguments:
#   $1 - (optional) Realm URL to clear; if empty, clears all
##
_federation_oidc_cache_clear() {
    local realm_url="${1:-}"
    if [ -z "$realm_url" ]; then
        rm -rf "$_OIDC_CACHE_DIR" 2>/dev/null || true
        log_verbose "OIDC discovery cache cleared (all)"
    else
        local cache_key
        cache_key=$(echo "$realm_url" | md5sum 2>/dev/null | cut -d' ' -f1 || echo "$realm_url" | shasum | cut -d' ' -f1)
        rm -f "${_OIDC_CACHE_DIR}/${cache_key}" 2>/dev/null || true
        log_verbose "OIDC discovery cache cleared for: $realm_url"
    fi
}

# =============================================================================
# OIDC DISCOVERY & EXTERNAL FEDERATION
# =============================================================================

##
# Fetch OIDC discovery document from a Keycloak realm (with caching)
#
# Arguments:
#   $1 - Full realm URL (e.g., https://idp.gbr.mod.uk/realms/dive-v3-broker-gbr)
#   $2 - (optional) "no-cache" to bypass cache
#
# Returns:
#   JSON discovery document on stdout, or empty string on failure
##
_federation_oidc_discover() {
    local realm_url="$1"
    local no_cache="${2:-}"
    local discovery_url="${realm_url}/.well-known/openid-configuration"

    # Check cache first (unless bypassed)
    if [ "$no_cache" != "no-cache" ] && [ -d "$_OIDC_CACHE_DIR" ]; then
        local cache_key
        cache_key=$(echo "$realm_url" | md5sum 2>/dev/null | cut -d' ' -f1 || echo "$realm_url" | shasum | cut -d' ' -f1)
        local cache_file="${_OIDC_CACHE_DIR}/${cache_key}"
        if [ -f "$cache_file" ]; then
            local cache_age
            local now
            now=$(date +%s)
            local file_mtime
            file_mtime=$(stat -f %m "$cache_file" 2>/dev/null || stat -c %Y "$cache_file" 2>/dev/null || echo 0)
            cache_age=$((now - file_mtime))
            if [ "$cache_age" -lt "$_OIDC_CACHE_TTL" ]; then
                log_verbose "OIDC discovery cache hit for: $realm_url (age: ${cache_age}s)"
                cat "$cache_file"
                return 0
            fi
        fi
    fi

    local response
    response=$(curl -sf --max-time 15 --insecure "$discovery_url" 2>/dev/null)

    if [ -z "$response" ]; then
        log_warn "OIDC discovery failed for: $discovery_url"
        echo ""
        return 1
    fi

    # Validate it's a real OIDC discovery doc
    if ! echo "$response" | jq -e '.issuer' >/dev/null 2>&1; then
        log_warn "Invalid OIDC discovery document from: $discovery_url"
        echo ""
        return 1
    fi

    # Store in cache
    mkdir -p "$_OIDC_CACHE_DIR" 2>/dev/null || true
    local cache_key
    cache_key=$(echo "$realm_url" | md5sum 2>/dev/null | cut -d' ' -f1 || echo "$realm_url" | shasum | cut -d' ' -f1)
    echo "$response" > "${_OIDC_CACHE_DIR}/${cache_key}" 2>/dev/null || true

    echo "$response"
}

##
# Update TRUSTED_ISSUERS in an .env file (deduplicating)
#
# Arguments:
#   $1 - Path to .env file
#   $2 - New issuer URL to add
##
_federation_update_trusted_issuers() {
    local env_file="$1"
    local new_issuer="$2"

    if [ ! -f "$env_file" ]; then
        log_warn "Env file not found: $env_file"
        return 1
    fi

    # Read current TRUSTED_ISSUERS
    local current_issuers=""
    current_issuers=$(grep "^TRUSTED_ISSUERS=" "$env_file" 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "")

    # Check if already present
    if echo "$current_issuers" | tr ',' '\n' | grep -qF "$new_issuer"; then
        log_verbose "Issuer already in TRUSTED_ISSUERS: $new_issuer"
        return 0
    fi

    # Append new issuer
    local updated_issuers
    if [ -n "$current_issuers" ]; then
        updated_issuers="${current_issuers},${new_issuer}"
    else
        updated_issuers="$new_issuer"
    fi

    # Update file (sed -i with backup for macOS compat)
    if grep -q "^TRUSTED_ISSUERS=" "$env_file"; then
        sed -i.bak "s|^TRUSTED_ISSUERS=.*|TRUSTED_ISSUERS=\"${updated_issuers}\"|" "$env_file"
        rm -f "${env_file}.bak"
    else
        echo "TRUSTED_ISSUERS=\"${updated_issuers}\"" >> "$env_file"
    fi

    log_success "Updated TRUSTED_ISSUERS in ${env_file}"
}

##
# Register an external spoke on the hub using OIDC discovery
#
# For hub operators: registers a spoke that lives on a separate network.
# Does NOT require docker access to the spoke — only HTTPS reachability.
#
# Arguments:
#   $1 - Spoke instance code (e.g., GBR)
#   $2 - Spoke IdP URL (e.g., https://idp.gbr.mod.uk)
#   $3 - Client secret for federation
#   $4 - (optional) Spoke API URL (e.g., https://api.gbr.mod.uk)
##
federation_register_external_spoke() {
    local code="$1"
    local spoke_idp_url="$2"
    local client_secret="$3"
    local spoke_api_url="${4:-}"
    local code_upper code_lower
    code_upper=$(upper "$code")
    code_lower=$(lower "$code")

    if [ -z "$code" ] || [ -z "$spoke_idp_url" ] || [ -z "$client_secret" ]; then
        log_error "Usage: federation_register_external_spoke CODE SPOKE_IDP_URL CLIENT_SECRET [SPOKE_API_URL]"
        return 1
    fi

    local spoke_realm="dive-v3-broker-${code_lower}"
    local idp_alias="${code_lower}-idp"
    local realm_url="${spoke_idp_url}/realms/${spoke_realm}"

    log_step "Registering external spoke ${code_upper} on Hub..."
    log_info "  Spoke IdP: ${spoke_idp_url}"
    log_info "  Spoke Realm: ${spoke_realm}"

    # Step 1: OIDC discovery — get endpoints from the spoke
    log_info "Step 1: Fetching OIDC discovery from spoke..."
    local discovery
    discovery=$(_federation_oidc_discover "$realm_url")
    if [ -z "$discovery" ]; then
        log_error "Cannot reach spoke OIDC discovery at: ${realm_url}"
        log_info "Ensure the spoke's Keycloak is reachable at: ${spoke_idp_url}"
        return 1
    fi

    # Extract endpoints from discovery document
    local auth_url token_url userinfo_url logout_url jwks_url issuer
    issuer=$(echo "$discovery" | jq -r '.issuer')
    auth_url=$(echo "$discovery" | jq -r '.authorization_endpoint')
    token_url=$(echo "$discovery" | jq -r '.token_endpoint')
    userinfo_url=$(echo "$discovery" | jq -r '.userinfo_endpoint')
    logout_url=$(echo "$discovery" | jq -r '.end_session_endpoint // empty')
    jwks_url=$(echo "$discovery" | jq -r '.jwks_uri')

    log_success "OIDC discovery succeeded: issuer=${issuer}"

    # Step 2: Detect post-broker OTP flow on hub
    local _hub_otp_flow=""
    local _hub_fed_flows
    _hub_fed_flows=$(keycloak_admin_api "USA" "GET" \
        "realms/${HUB_REALM}/authentication/flows" 2>/dev/null || echo "[]")
    _hub_otp_flow=$(echo "$_hub_fed_flows" | python3 -c "
import json,sys
try:
    flows = json.load(sys.stdin)
    for f in flows:
        if f.get('alias','') == 'Simple Post-Broker OTP' and not f.get('builtIn',False):
            print(f['alias']); break
except: pass
" 2>/dev/null)

    # Step 3: Create IdP on Hub with discovered endpoints
    log_info "Step 2: Creating IdP on Hub for ${code_upper}..."

    local federation_client_id="dive-v3-broker-usa"
    local idp_config
    idp_config=$(printf '{
  "alias": "%s",
  "displayName": "%s Federation (External)",
  "providerId": "oidc",
  "enabled": true,
  "trustEmail": true,
  "storeToken": true,
  "linkOnly": false,
  "firstBrokerLoginFlowAlias": "first broker login",
  "postBrokerLoginFlowAlias": "%s",
  "config": {
    "clientId": "%s",
    "clientSecret": "%s",
    "authorizationUrl": "%s",
    "tokenUrl": "%s",
    "userInfoUrl": "%s",
    "logoutUrl": "%s",
    "issuer": "%s",
    "validateSignature": "true",
    "useJwksUrl": "true",
    "jwksUrl": "%s",
    "defaultScope": "openid profile email clearance countryOfAffiliation uniqueID acpCOI user_acr user_amr",
    "syncMode": "FORCE",
    "clientAuthMethod": "client_secret_post"
  }
}' "$idp_alias" "$code_upper" "${_hub_otp_flow}" \
   "$federation_client_id" "$client_secret" \
   "$auth_url" "$token_url" "$userinfo_url" "${logout_url:-$auth_url}" \
   "$issuer" "$jwks_url")

    # Idempotent: check if exists, update or create
    local existing_idp
    existing_idp=$(keycloak_admin_api "USA" "GET" \
        "realms/${HUB_REALM}/identity-provider/instances/${idp_alias}" 2>/dev/null)

    if [ -n "$existing_idp" ] && echo "$existing_idp" | grep -q '"alias"'; then
        log_info "IdP ${idp_alias} already exists on Hub, updating..."
        keycloak_admin_api "USA" "PUT" \
            "realms/${HUB_REALM}/identity-provider/instances/${idp_alias}" "$idp_config" >/dev/null 2>&1
        log_success "Updated external IdP on Hub for ${code_upper}"
    else
        local create_result
        create_result=$(keycloak_admin_api "USA" "POST" \
            "realms/${HUB_REALM}/identity-provider/instances" "$idp_config" 2>/dev/null)
        if [ $? -eq 0 ]; then
            log_success "Created external IdP on Hub for ${code_upper}"
        else
            log_error "Failed to create IdP on Hub: $create_result"
            return 1
        fi
    fi

    # Step 4: Configure IdP mappers
    log_info "Step 3: Configuring IdP claim mappers..."
    local hub_token
    hub_token=$(get_hub_admin_token)
    _configure_idp_mappers "USA" "$hub_token" "$HUB_REALM" "$idp_alias"

    # Step 5: Update Hub TRUSTED_ISSUERS
    log_info "Step 4: Updating Hub trusted issuers..."
    local hub_env="${DIVE_ROOT}/.env.hub"
    _federation_update_trusted_issuers "$hub_env" "$issuer"

    # Step 6: Store federation secret in Vault if available
    if type vault_kv_put &>/dev/null; then
        vault_kv_put "dive-v3/federation/${code_lower}/client-secret" \
            "secret=${client_secret}" 2>/dev/null || true
        log_verbose "Federation secret stored in Vault for ${code_lower}"
    fi

    # Step 7: Register in database if backend is available
    local hub_api_url
    hub_api_url=$(resolve_hub_public_url "api" 2>/dev/null)
    if [ -n "$hub_api_url" ] && [ -n "${FEDERATION_ADMIN_KEY:-}" ]; then
        local reg_data
        reg_data=$(printf '{
  "instanceCode": "%s",
  "spokeIdpUrl": "%s",
  "spokeApiUrl": "%s",
  "deploymentMode": "external",
  "status": "approved"
}' "$code_upper" "$spoke_idp_url" "${spoke_api_url:-$spoke_idp_url}")

        curl -sf --max-time 10 -X POST "${hub_api_url}/api/federation/spokes/register" \
            -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
            -H "Content-Type: application/json" \
            -d "$reg_data" >/dev/null 2>&1 || \
            log_verbose "Database registration skipped (backend may not be running)"
    fi

    log_success "External spoke ${code_upper} registered on Hub federation"
    echo ""
    echo "  IdP alias:  ${idp_alias}"
    echo "  Issuer:     ${issuer}"
    echo "  Auth URL:   ${auth_url}"
    echo "  JWKS URL:   ${jwks_url}"
    echo ""
    echo "Next steps:"
    echo "  1. On the spoke, register the Hub: ./dive federation register-hub --hub-url ${HUB_KC_URL} --secret ${client_secret}"
    echo "  2. Restart Hub backend to pick up new TRUSTED_ISSUERS"
    echo "  3. Verify: ./dive federation verify ${code_upper}"
}

##
# Register the hub as IdP on a spoke (spoke-side operation)
#
# For spoke operators: registers the hub's Keycloak as an IdP on the spoke realm.
# Can be run from the spoke's network — only needs HTTPS access to the hub.
#
# Arguments:
#   $1 - Spoke instance code (e.g., GBR)
#   $2 - Hub IdP URL (e.g., https://idp.hub.defense.gov or https://dev-usa-idp.dive25.com)
#   $3 - Client secret for federation
##
federation_register_hub_on_spoke() {
    local code="$1"
    local hub_idp_url="$2"
    local client_secret="$3"
    local code_upper code_lower
    code_upper=$(upper "$code")
    code_lower=$(lower "$code")

    if [ -z "$code" ] || [ -z "$hub_idp_url" ] || [ -z "$client_secret" ]; then
        log_error "Usage: federation_register_hub_on_spoke CODE HUB_IDP_URL CLIENT_SECRET"
        return 1
    fi

    local hub_realm="${HUB_REALM:-dive-v3-broker-usa}"
    local spoke_realm="dive-v3-broker-${code_lower}"
    local idp_alias="usa-idp"
    local hub_realm_url="${hub_idp_url}/realms/${hub_realm}"

    log_step "Registering Hub as IdP on spoke ${code_upper}..."
    log_info "  Hub IdP: ${hub_idp_url}"
    log_info "  Hub Realm: ${hub_realm}"

    # Step 1: OIDC discovery from hub
    log_info "Step 1: Fetching OIDC discovery from Hub..."
    local discovery
    discovery=$(_federation_oidc_discover "$hub_realm_url")
    if [ -z "$discovery" ]; then
        log_error "Cannot reach Hub OIDC discovery at: ${hub_realm_url}"
        log_info "Ensure the Hub's Keycloak is reachable at: ${hub_idp_url}"
        return 1
    fi

    local auth_url token_url userinfo_url logout_url jwks_url issuer
    issuer=$(echo "$discovery" | jq -r '.issuer')
    auth_url=$(echo "$discovery" | jq -r '.authorization_endpoint')
    token_url=$(echo "$discovery" | jq -r '.token_endpoint')
    userinfo_url=$(echo "$discovery" | jq -r '.userinfo_endpoint')
    logout_url=$(echo "$discovery" | jq -r '.end_session_endpoint // empty')
    jwks_url=$(echo "$discovery" | jq -r '.jwks_uri')

    log_success "Hub OIDC discovery succeeded: issuer=${issuer}"

    # Step 2: Detect post-broker OTP flow on spoke
    local _spoke_otp_flow=""
    local _spoke_flows
    _spoke_flows=$(keycloak_admin_api "$code_upper" "GET" \
        "realms/${spoke_realm}/authentication/flows" 2>/dev/null || echo "[]")
    _spoke_otp_flow=$(echo "$_spoke_flows" | python3 -c "
import json,sys
try:
    flows = json.load(sys.stdin)
    for f in flows:
        if f.get('alias','') == 'Simple Post-Broker OTP' and not f.get('builtIn',False):
            print(f['alias']); break
except: pass
" 2>/dev/null)

    # Step 3: Create federation client on spoke (for hub to use)
    log_info "Step 2: Ensuring federation client on spoke..."
    local federation_client_id="dive-v3-broker-${code_lower}"
    local spoke_token
    spoke_token=$(keycloak_get_admin_token "$code_upper")

    if [ -n "$spoke_token" ]; then
        _ensure_federation_client "$code_upper" "$spoke_token" "$spoke_realm" "$federation_client_id" "$client_secret"
    fi

    # Step 4: Create IdP on spoke realm
    log_info "Step 3: Creating Hub IdP on spoke ${code_upper}..."

    local idp_config
    idp_config=$(printf '{
  "alias": "%s",
  "displayName": "USA Hub Federation",
  "providerId": "oidc",
  "enabled": true,
  "trustEmail": true,
  "storeToken": true,
  "linkOnly": false,
  "firstBrokerLoginFlowAlias": "first broker login",
  "postBrokerLoginFlowAlias": "%s",
  "config": {
    "clientId": "%s",
    "clientSecret": "%s",
    "authorizationUrl": "%s",
    "tokenUrl": "%s",
    "userInfoUrl": "%s",
    "logoutUrl": "%s",
    "issuer": "%s",
    "validateSignature": "true",
    "useJwksUrl": "true",
    "jwksUrl": "%s",
    "defaultScope": "openid profile email clearance countryOfAffiliation uniqueID acpCOI user_acr user_amr",
    "syncMode": "FORCE",
    "clientAuthMethod": "client_secret_post"
  }
}' "$idp_alias" "${_spoke_otp_flow}" \
   "$federation_client_id" "$client_secret" \
   "$auth_url" "$token_url" "$userinfo_url" "${logout_url:-$auth_url}" \
   "$issuer" "$jwks_url")

    # Idempotent: check if exists, update or create
    local existing_idp
    existing_idp=$(keycloak_admin_api "$code_upper" "GET" \
        "realms/${spoke_realm}/identity-provider/instances/${idp_alias}" 2>/dev/null)

    if [ -n "$existing_idp" ] && echo "$existing_idp" | grep -q '"alias"'; then
        log_info "IdP ${idp_alias} already exists on spoke, updating..."
        keycloak_admin_api "$code_upper" "PUT" \
            "realms/${spoke_realm}/identity-provider/instances/${idp_alias}" "$idp_config" >/dev/null 2>&1
        log_success "Updated Hub IdP on spoke ${code_upper}"
    else
        local create_result
        create_result=$(keycloak_admin_api "$code_upper" "POST" \
            "realms/${spoke_realm}/identity-provider/instances" "$idp_config" 2>/dev/null)
        if [ $? -eq 0 ]; then
            log_success "Created Hub IdP on spoke ${code_upper}"
        else
            log_error "Failed to create Hub IdP on spoke: $create_result"
            return 1
        fi
    fi

    # Step 5: Configure IdP mappers on spoke
    log_info "Step 4: Configuring IdP claim mappers on spoke..."
    if [ -n "$spoke_token" ]; then
        _configure_idp_mappers "$code_upper" "$spoke_token" "$spoke_realm" "$idp_alias"
    fi

    # Step 6: Update spoke TRUSTED_ISSUERS
    log_info "Step 5: Updating spoke trusted issuers..."
    local spoke_env="${DIVE_ROOT}/instances/${code_lower}/.env"
    if [ -f "$spoke_env" ]; then
        _federation_update_trusted_issuers "$spoke_env" "$issuer"
    else
        log_verbose "Spoke .env not found at ${spoke_env} — trusted issuers must be updated manually"
    fi

    log_success "Hub registered as IdP on spoke ${code_upper}"
    echo ""
    echo "  IdP alias:  ${idp_alias}"
    echo "  Hub issuer: ${issuer}"
    echo ""
    echo "Next steps:"
    echo "  1. On the Hub, register this spoke: ./dive federation register-spoke ${code_upper} --idp-url <SPOKE_IDP_URL> --secret ${client_secret}"
    echo "  2. Restart spoke backend to pick up new TRUSTED_ISSUERS"
    echo "  3. Verify: ./dive federation verify ${code_upper}"
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
    if type keycloak_admin_api_available &>/dev/null && keycloak_admin_api_available "USA"; then
        echo "  Status: Healthy"

        local idps
        idps=$(keycloak_admin_api "USA" "GET" \
            "realms/${HUB_REALM}/identity-provider/instances" 2>/dev/null | \
            jq -r '.[].alias' 2>/dev/null)

        if [ -n "$idps" ]; then
            echo "  Linked IdPs:"
            local idp
            for idp in $idps; do
                echo "    - $idp"
            done
        else
            echo "  Linked IdPs: None"
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
# CLI SPOKE MANAGEMENT (Hub API)
# =============================================================================

# Resolve Hub API URL for CLI management operations
_fed_hub_api_url() {
    resolve_hub_public_url "api"
}

# Get admin key for CLI API calls
_fed_admin_key() {
    local key="${FEDERATION_ADMIN_KEY:-}"
    if [ -z "$key" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
        key=$(grep "^FEDERATION_ADMIN_KEY=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d= -f2-)
    fi
    echo "$key"
}

# CLI curl helper with admin key authentication
_fed_api_call() {
    local method="$1"
    local path="$2"
    shift 2
    local hub_api
    hub_api=$(_fed_hub_api_url)
    local admin_key
    admin_key=$(_fed_admin_key)

    local auth_headers=()
    if [ -n "$admin_key" ]; then
        auth_headers=(-H "X-Admin-Key: ${admin_key}")
    else
        # Dev fallback: CLI bypass
        auth_headers=(-H "X-CLI-Bypass: dive-cli-local-dev")
    fi

    curl -sk --max-time 15 -X "$method" \
        "${hub_api}${path}" \
        -H "Content-Type: application/json" \
        "${auth_headers[@]}" \
        "$@" 2>/dev/null
}

##
# List all registered spokes or filter by status
# Usage: ./dive federation list [--pending|--approved|--suspended]
##
cmd_federation_list() {
    local filter="${1:-}"
    local path="/api/federation/spokes"

    case "$filter" in
        --pending)  path="/api/federation/spokes/pending" ;;
        --approved) ;;  # will filter client-side
        --suspended) ;;
    esac

    local response
    response=$(_fed_api_call GET "$path")

    if [ -z "$response" ]; then
        log_error "Hub API unreachable at $(_fed_hub_api_url)"
        return 1
    fi

    # Check for error response
    if echo "$response" | jq -e '.error' >/dev/null 2>&1; then
        log_error "API error: $(echo "$response" | jq -r '.error // .message')"
        return 1
    fi

    # Extract spokes array (handle both /spokes and /spokes/pending response shapes)
    local spokes
    spokes=$(echo "$response" | jq -r '.spokes // .pending // []' 2>/dev/null)

    # Client-side filter if needed
    if [ "$filter" = "--approved" ]; then
        spokes=$(echo "$spokes" | jq '[.[] | select(.status == "approved")]')
    elif [ "$filter" = "--suspended" ]; then
        spokes=$(echo "$spokes" | jq '[.[] | select(.status == "suspended")]')
    fi

    local count
    count=$(echo "$spokes" | jq 'length')

    if [ "$count" = "0" ] || [ "$count" = "null" ]; then
        log_info "No spokes found${filter:+ ($filter)}"
        return 0
    fi

    echo ""
    printf "  %-8s  %-20s  %-12s  %-12s  %-10s  %-30s\n" \
        "CODE" "NAME" "STATUS" "TRUST" "MAX CLASS" "DOMAIN"
    printf "  %-8s  %-20s  %-12s  %-12s  %-10s  %-30s\n" \
        "--------" "--------------------" "------------" "------------" "----------" "------------------------------"

    echo "$spokes" | jq -r '.[] | [.instanceCode, .name, .status, .trustLevel, .maxClassification, .baseUrl] | @tsv' 2>/dev/null | \
    while IFS=$'\t' read -r code name status trust maxclass url; do
        printf "  %-8s  %-20s  %-12s  %-12s  %-10s  %-30s\n" \
            "${code:-?}" "${name:-?}" "${status:-?}" "${trust:-?}" "${maxclass:-?}" "${url:-?}"
    done

    echo ""
    log_info "${count} spoke(s) found"
}

##
# Approve a pending spoke
# Usage: ./dive federation approve <CODE> [--trust bilateral] [--max-classification SECRET]
##
cmd_federation_approve() {
    local code="${1:-}"
    shift || true

    if [ -z "$code" ]; then
        log_error "Usage: ./dive federation approve <CODE> [--trust <level>] [--max-classification <class>]"
        return 1
    fi

    code=$(echo "$code" | tr '[:lower:]' '[:upper:]')

    # Parse options
    local trust_level="bilateral"
    local max_classification="SECRET"

    while [ $# -gt 0 ]; do
        case "$1" in
            --trust)              trust_level="${2:-bilateral}"; shift 2 ;;
            --max-classification) max_classification="${2:-SECRET}"; shift 2 ;;
            *)                    shift ;;
        esac
    done

    # Resolve spokeId from instanceCode
    local spoke_data
    spoke_data=$(_fed_api_call GET "/api/federation/spokes")
    local spoke_id
    spoke_id=$(echo "$spoke_data" | jq -r --arg code "$code" '.spokes[] | select(.instanceCode == $code) | .spokeId' 2>/dev/null)

    if [ -z "$spoke_id" ] || [ "$spoke_id" = "null" ]; then
        log_error "Spoke not found: ${code}"
        return 1
    fi

    log_info "Approving spoke ${code} (${spoke_id})..."
    log_verbose "  Trust level: ${trust_level}"
    log_verbose "  Max classification: ${max_classification}"

    local payload
    payload=$(cat <<EOF
{
  "allowedScopes": ["policy:base", "policy:org", "policy:tenant"],
  "trustLevel": "$trust_level",
  "maxClassification": "$max_classification",
  "dataIsolationLevel": "filtered"
}
EOF
)

    local response
    response=$(_fed_api_call POST "/api/federation/spokes/${spoke_id}/approve" -d "$payload")

    if echo "$response" | jq -e '.spoke.status == "approved"' >/dev/null 2>&1; then
        log_success "Spoke ${code} approved (trust=${trust_level}, class=${max_classification})"
    else
        local err
        err=$(echo "$response" | jq -r '.error // .message // "Unknown error"' 2>/dev/null)
        log_error "Approval failed: ${err}"
        return 1
    fi
}

##
# Suspend a spoke
# Usage: ./dive federation suspend <CODE> [--reason "text"]
##
cmd_federation_suspend() {
    local code="${1:-}"
    shift || true

    if [ -z "$code" ]; then
        log_error "Usage: ./dive federation suspend <CODE> [--reason <text>]"
        return 1
    fi

    code=$(echo "$code" | tr '[:lower:]' '[:upper:]')

    local reason="Suspended via CLI"
    while [ $# -gt 0 ]; do
        case "$1" in
            --reason) reason="${2:-Suspended via CLI}"; shift 2 ;;
            *)        shift ;;
        esac
    done

    # Resolve spokeId
    local spoke_data
    spoke_data=$(_fed_api_call GET "/api/federation/spokes")
    local spoke_id
    spoke_id=$(echo "$spoke_data" | jq -r --arg code "$code" '.spokes[] | select(.instanceCode == $code) | .spokeId' 2>/dev/null)

    if [ -z "$spoke_id" ] || [ "$spoke_id" = "null" ]; then
        log_error "Spoke not found: ${code}"
        return 1
    fi

    log_warn "Suspending spoke ${code} (${spoke_id})..."

    local response
    response=$(_fed_api_call POST "/api/federation/spokes/${spoke_id}/suspend" -d "{\"reason\": \"$reason\"}")

    if echo "$response" | jq -e '.spoke.status == "suspended"' >/dev/null 2>&1; then
        log_success "Spoke ${code} suspended"
    else
        local err
        err=$(echo "$response" | jq -r '.error // .message // "Unknown error"' 2>/dev/null)
        log_error "Suspension failed: ${err}"
        return 1
    fi
}

##
# Revoke a spoke (permanent removal from federation)
# Usage: ./dive federation revoke <CODE> [--confirm]
##
cmd_federation_revoke() {
    local code="${1:-}"
    local confirmed=false
    [ "${2:-}" = "--confirm" ] && confirmed=true

    if [ -z "$code" ]; then
        log_error "Usage: ./dive federation revoke <CODE> [--confirm]"
        return 1
    fi

    code=$(echo "$code" | tr '[:lower:]' '[:upper:]')

    # Resolve spokeId
    local spoke_data
    spoke_data=$(_fed_api_call GET "/api/federation/spokes")
    local spoke_id
    spoke_id=$(echo "$spoke_data" | jq -r --arg code "$code" '.spokes[] | select(.instanceCode == $code) | .spokeId' 2>/dev/null)

    if [ -z "$spoke_id" ] || [ "$spoke_id" = "null" ]; then
        log_error "Spoke not found: ${code}"
        return 1
    fi

    if [ "$confirmed" = false ] && is_interactive; then
        log_warn "This will PERMANENTLY revoke ${code} from the federation."
        log_warn "The spoke's certificates and tokens will be invalidated."
        read -rp "  Type 'yes' to confirm: " answer
        if [ "$answer" != "yes" ]; then
            log_info "Cancelled."
            return 0
        fi
    elif [ "$confirmed" = false ]; then
        log_warn "Non-interactive mode: auto-confirming spoke revocation"
    fi

    log_warn "Revoking spoke ${code} (${spoke_id})..."

    local response
    response=$(_fed_api_call POST "/api/federation/spokes/${spoke_id}/revoke" -d "{\"reason\": \"Revoked via CLI\"}")

    if echo "$response" | jq -e '.spoke.status == "revoked"' >/dev/null 2>&1; then
        log_success "Spoke ${code} revoked from federation"
    else
        local err
        err=$(echo "$response" | jq -r '.error // .message // "Unknown error"' 2>/dev/null)
        log_error "Revocation failed: ${err}"
        return 1
    fi
}

# =============================================================================
# FEDERATION REPAIR & RECOVERY (Phase 8)
# =============================================================================

##
# Attempt to repair a degraded or failed federation link
#
# Checks and fixes:
#   1. Re-validates OIDC discovery (with cache bypass)
#   2. Re-syncs client secrets if mismatched
#   3. Re-creates missing IdP mappers
#   4. Updates issuer URLs if domains changed
#   5. Transitions link state back to ACTIVE on success
#
# Arguments:
#   $1 - Spoke instance code
##
federation_repair() {
    local instance_code="$1"
    if [ -z "$instance_code" ]; then
        log_error "Usage: federation_repair <CODE>"
        return 1
    fi

    local code_upper
    code_upper=$(upper "$instance_code")
    local code_lower
    code_lower=$(lower "$instance_code")

    echo ""
    echo "=== Federation Repair: ${code_upper} ==="
    echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""

    local repairs=0
    local failures=0

    # Check current link state
    local current_state="UNKNOWN"
    if type federation_get_link_state &>/dev/null; then
        current_state=$(federation_get_link_state "$code_upper" 2>/dev/null || echo "UNKNOWN")
    fi
    echo "  Current state: ${current_state}"

    # Determine spoke mode
    local _domain_var="SPOKE_${code_upper}_DOMAIN"
    local _custom_domain="${!_domain_var:-}"
    local is_external=false
    [ -n "$_custom_domain" ] && is_external=true

    echo "  Mode: $([ "$is_external" = true ] && echo "external (${_custom_domain})" || echo "local")"
    echo ""

    # Check 1: OIDC discovery (bypass cache)
    echo "  [1/5] OIDC Discovery..."
    local spoke_url
    spoke_url=$(resolve_spoke_public_url "$code_upper" "idp" 2>/dev/null || echo "")
    local spoke_realm="dive-v3-broker-${code_lower}"

    if [ -n "$spoke_url" ]; then
        local realm_url="${spoke_url}/realms/${spoke_realm}"
        local discovery
        discovery=$(_federation_oidc_discover "$realm_url" "no-cache" 2>/dev/null)
        if [ -n "$discovery" ]; then
            echo "        PASS  OIDC discovery valid"
            repairs=$((repairs + 1))

            # Check if issuer URL has changed
            local current_issuer
            current_issuer=$(echo "$discovery" | jq -r '.issuer' 2>/dev/null)
            if [ -n "$current_issuer" ]; then
                # Update hub .env trusted issuers if needed
                local hub_env="${DIVE_ROOT}/.env.hub"
                if [ -f "$hub_env" ]; then
                    _federation_update_trusted_issuers "$hub_env" "$current_issuer" 2>/dev/null || true
                fi
            fi
        else
            echo "        FAIL  OIDC discovery unreachable"
            failures=$((failures + 1))
        fi
    else
        echo "        SKIP  Cannot resolve spoke URL"
        failures=$((failures + 1))
    fi

    # Check 2: Hub admin API availability
    echo "  [2/5] Hub Admin API..."
    if type keycloak_admin_api_available &>/dev/null && keycloak_admin_api_available "USA" 2>/dev/null; then
        echo "        PASS  Hub Keycloak reachable"
        repairs=$((repairs + 1))
    else
        echo "        FAIL  Hub Keycloak unreachable"
        echo "        Fix:  Ensure Hub Keycloak is running: ./dive hub up"
        failures=$((failures + 1))
    fi

    # Check 3: Spoke IdP on Hub
    echo "  [3/5] Spoke IdP on Hub..."
    local idp_alias="${code_lower}-idp"
    local spoke_idp_on_hub
    spoke_idp_on_hub=$(keycloak_admin_api "USA" "GET" \
        "realms/${HUB_REALM:-dive-v3-broker-usa}/identity-provider/instances/${idp_alias}" 2>/dev/null || echo "")

    if [ -n "$spoke_idp_on_hub" ] && echo "$spoke_idp_on_hub" | grep -q '"alias"'; then
        local idp_enabled
        idp_enabled=$(echo "$spoke_idp_on_hub" | jq -r '.enabled' 2>/dev/null)
        if [ "$idp_enabled" = "true" ]; then
            echo "        PASS  ${idp_alias} exists and enabled"
            repairs=$((repairs + 1))
        else
            echo "        WARN  ${idp_alias} exists but disabled — re-enabling..."
            local re_enabled
            re_enabled=$(echo "$spoke_idp_on_hub" | jq '.enabled = true')
            keycloak_admin_api "USA" "PUT" \
                "realms/${HUB_REALM:-dive-v3-broker-usa}/identity-provider/instances/${idp_alias}" \
                "$re_enabled" >/dev/null 2>&1
            echo "        FIXED Re-enabled ${idp_alias}"
            repairs=$((repairs + 1))
        fi
    else
        echo "        FAIL  ${idp_alias} not found on Hub"
        echo "        Fix:  Re-link: ./dive federation link ${code_upper}"
        failures=$((failures + 1))
    fi

    # Check 4: IdP mappers on Hub
    echo "  [4/5] IdP Mappers on Hub..."
    local mappers
    mappers=$(keycloak_admin_api "USA" "GET" \
        "realms/${HUB_REALM:-dive-v3-broker-usa}/identity-provider/instances/${idp_alias}/mappers" 2>/dev/null || echo "[]")
    local mapper_count
    mapper_count=$(echo "$mappers" | jq 'length' 2>/dev/null || echo 0)

    if [ "$mapper_count" -gt 0 ]; then
        echo "        PASS  ${mapper_count} mappers configured"
        repairs=$((repairs + 1))
    else
        echo "        WARN  No mappers found — re-configuring..."
        local hub_token
        hub_token=$(get_hub_admin_token 2>/dev/null)
        if [ -n "$hub_token" ]; then
            _configure_idp_mappers "USA" "$hub_token" "${HUB_REALM:-dive-v3-broker-usa}" "$idp_alias" 2>/dev/null
            echo "        FIXED Mappers re-configured"
            repairs=$((repairs + 1))
        else
            echo "        FAIL  Cannot get Hub admin token to fix mappers"
            failures=$((failures + 1))
        fi
    fi

    # Check 5: Hub IdP on Spoke (for bidirectional federation)
    echo "  [5/5] Hub IdP on Spoke..."
    local hub_idp_on_spoke
    hub_idp_on_spoke=$(keycloak_admin_api "$code_upper" "GET" \
        "realms/${spoke_realm}/identity-provider/instances/usa-idp" 2>/dev/null || echo "")

    if [ -n "$hub_idp_on_spoke" ] && echo "$hub_idp_on_spoke" | grep -q '"alias"'; then
        echo "        PASS  usa-idp exists on spoke"
        repairs=$((repairs + 1))
    else
        echo "        WARN  usa-idp not found on spoke (unidirectional federation)"
        # Not a failure — unidirectional is valid
        repairs=$((repairs + 1))
    fi

    echo ""

    # Update federation state based on results
    if [ "$failures" -eq 0 ]; then
        echo "  Results: ${repairs}/${repairs} checks passed"
        echo "  Status: REPAIRED → ACTIVE"
        if type federation_set_link_state &>/dev/null; then
            federation_set_link_state "$code_upper" "ACTIVE" "Repaired via federation repair" 2>/dev/null || true
        fi
        # Record operation
        if type fed_db_record_operation &>/dev/null; then
            fed_db_record_operation "$code_lower" "REPAIR" "SUCCESS" "system" \
                "{\"repairs\": $repairs, \"failures\": 0}" 2>/dev/null || true
        fi
        return 0
    else
        local total=$((repairs + failures))
        echo "  Results: ${repairs}/${total} checks passed, ${failures} failed"
        echo "  Status: REPAIR INCOMPLETE"
        echo ""
        echo "  Remaining issues need manual intervention."
        echo "  Try: ./dive federation link ${code_upper}"
        if type fed_db_record_operation &>/dev/null; then
            fed_db_record_operation "$code_lower" "REPAIR" "PARTIAL" "system" \
                "{\"repairs\": $repairs, \"failures\": $failures}" 2>/dev/null || true
        fi
        return 1
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

##
# Federation module command dispatcher
##
# =============================================================================
# V2 ZERO TRUST ENROLLMENT CLI COMMANDS
# =============================================================================

##
# Discover federation metadata from a remote instance
# Usage: ./dive federation discover <URL>
# Example: ./dive federation discover https://api.usa.dive25.com
##
cmd_federation_discover() {
    local remote_url="${1:-}"

    if [ -z "$remote_url" ]; then
        log_error "Usage: ./dive federation discover <URL>"
        log_info "Example: ./dive federation discover https://api.usa.dive25.com"
        return 1
    fi

    # Strip trailing slash
    remote_url="${remote_url%/}"

    log_info "Fetching federation metadata from ${remote_url}..."

    local metadata
    metadata=$(curl -sS --max-time 10 -k "${remote_url}/.well-known/dive-federation" 2>&1)
    local curl_rc=$?

    if [ $curl_rc -ne 0 ]; then
        log_error "Failed to reach ${remote_url}/.well-known/dive-federation"
        log_error "curl exit code: ${curl_rc}"
        log_info "Is the remote instance running? Check the URL and try again."
        return 1
    fi

    # Validate it's JSON
    if ! echo "$metadata" | jq '.' &>/dev/null; then
        log_error "Invalid response from ${remote_url} (not JSON)"
        log_debug "Response: ${metadata:0:200}"
        return 1
    fi

    # Display federation metadata
    local inst_code inst_name fingerprint enrollment_url
    inst_code=$(echo "$metadata" | jq -r '.instanceCode // "unknown"')
    inst_name=$(echo "$metadata" | jq -r '.instanceName // "unknown"')
    fingerprint=$(echo "$metadata" | jq -r '.identity.instanceCertFingerprint // "not available"')
    enrollment_url=$(echo "$metadata" | jq -r '.federation.enrollmentEndpoint // "not available"')

    echo ""
    echo "============================================"
    echo "  Federation Discovery: ${inst_code}"
    echo "============================================"
    echo ""
    echo "  Instance:     ${inst_name} (${inst_code})"
    echo "  Fingerprint:  ${fingerprint}"
    echo "  OIDC Issuer:  $(echo "$metadata" | jq -r '.identity.oidcIssuer // "N/A"')"
    echo "  Enroll URL:   ${enrollment_url}"
    echo "  Capabilities: $(echo "$metadata" | jq -r '.capabilities | join(", ")')"
    echo "  Contact:      $(echo "$metadata" | jq -r '.contact // "N/A"')"
    echo ""
    echo "  To enroll with this instance:"
    echo "    ./dive federation enroll ${remote_url}"
    echo ""

    return 0
}

##
# Show this instance's identity fingerprint for OOB verification
# Usage: ./dive federation show-fingerprint
##
cmd_federation_show_fingerprint() {
    local instance_code="${INSTANCE_CODE:-${COUNTRY_CODE:-USA}}"
    instance_code="${instance_code^^}"

    local cert_dir="${CERT_DIR:-/app/certs}"
    local fingerprint_file="${cert_dir}/identity/fingerprint.txt"

    if [ -f "$fingerprint_file" ]; then
        local fingerprint
        fingerprint=$(cat "$fingerprint_file" | tr -d '\n')
        echo ""
        echo "============================================"
        echo "  Instance Identity: ${instance_code}"
        echo "============================================"
        echo ""
        echo "  Fingerprint: ${fingerprint}"
        echo ""
        echo "  Share this fingerprint with your federation"
        echo "  partner via a secure out-of-band channel"
        echo "  (phone call, Signal, JWICS, etc.)"
        echo ""
        return 0
    fi

    # Try to get fingerprint from running backend container
    local container_name="dive-hub-backend"
    if [ "${SPOKE_MODE:-}" = "true" ] || [ -n "${COUNTRY_CODE:-}" ]; then
        local code_lower="${instance_code,,}"
        container_name="dive-spoke-${code_lower}-backend-${code_lower}"
    fi

    local fp
    fp=$(docker exec "$container_name" cat /app/certs/identity/fingerprint.txt 2>/dev/null | tr -d '\n')

    if [ -n "$fp" ]; then
        echo ""
        echo "============================================"
        echo "  Instance Identity: ${instance_code}"
        echo "============================================"
        echo ""
        echo "  Fingerprint: ${fp}"
        echo ""
        echo "  Share this fingerprint with your federation"
        echo "  partner via a secure out-of-band channel."
        echo ""
        return 0
    fi

    log_warn "Identity fingerprint not yet generated."
    log_info "The fingerprint is created on first backend startup."
    log_info "Deploy the instance first: ./dive hub deploy  OR  ./dive spoke deploy ${instance_code}"
    return 1
}

##
# Enroll with a remote instance (initiate federation handshake)
# Usage: ./dive federation enroll <URL>
# Example: ./dive federation enroll https://api.usa.dive25.com
##
cmd_federation_enroll() {
    local remote_url="${1:-}"

    if [ -z "$remote_url" ]; then
        log_error "Usage: ./dive federation enroll <URL>"
        log_info "Step 1: Discover first: ./dive federation discover <URL>"
        log_info "Step 2: Then enroll:    ./dive federation enroll <URL>"
        return 1
    fi

    remote_url="${remote_url%/}"

    # Get enrollment endpoint from discovery
    log_info "Discovering remote instance..."
    local metadata
    metadata=$(curl -sS --max-time 10 -k "${remote_url}/.well-known/dive-federation" 2>&1)
    if [ $? -ne 0 ] || ! echo "$metadata" | jq '.' &>/dev/null; then
        log_error "Cannot reach ${remote_url}/.well-known/dive-federation"
        return 1
    fi

    local enrollment_endpoint
    enrollment_endpoint=$(echo "$metadata" | jq -r '.federation.enrollmentEndpoint // ""')
    if [ -z "$enrollment_endpoint" ]; then
        log_error "Remote instance does not support V2 enrollment"
        return 1
    fi

    local remote_code remote_fingerprint
    remote_code=$(echo "$metadata" | jq -r '.instanceCode')
    remote_fingerprint=$(echo "$metadata" | jq -r '.identity.instanceCertFingerprint // "unknown"')

    log_info "Remote instance: ${remote_code} (fingerprint: ${remote_fingerprint})"

    # Get local identity
    local instance_code="${INSTANCE_CODE:-${COUNTRY_CODE:-}}"
    if [ -z "$instance_code" ]; then
        log_error "INSTANCE_CODE or COUNTRY_CODE must be set"
        return 1
    fi
    instance_code="${instance_code^^}"

    local cert_dir="${CERT_DIR:-/app/certs}"
    local cert_file="${cert_dir}/identity/instance.crt"

    if [ ! -f "$cert_file" ]; then
        log_error "Instance identity certificate not found at ${cert_file}"
        log_info "Deploy the instance first to generate identity."
        return 1
    fi

    local cert_pem
    cert_pem=$(cat "$cert_file")

    # Generate signature
    local timestamp nonce
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    nonce=$(openssl rand -hex 16)

    local local_api_url="${API_URL:-${PUBLIC_API_URL:-https://localhost:4000}}"

    # Sign the enrollment payload
    local sign_payload="{\"instanceCode\":\"${instance_code}\",\"nonce\":\"${nonce}\",\"targetUrl\":\"${local_api_url}\",\"timestamp\":\"${timestamp}\"}"
    local signature
    signature=$(echo -n "$sign_payload" | openssl dgst -sha256 -sign "${cert_dir}/identity/instance.key" | base64 | tr -d '\n')

    # Determine OIDC discovery URL
    local idp_url="${PUBLIC_IDP_URL:-${IDP_URL:-https://localhost:8443}}"
    local realm="${KEYCLOAK_REALM:-dive-v3-broker-${instance_code,,}}"
    local oidc_discovery="${idp_url}/realms/${realm}/.well-known/openid-configuration"

    log_info "Submitting enrollment request to ${remote_code}..."

    local response
    response=$(curl -sS --max-time 30 -k \
        -X POST "${enrollment_endpoint}" \
        -H "Content-Type: application/json" \
        -d "{
            \"instanceCode\": \"${instance_code}\",
            \"instanceName\": \"$(hostname -f 2>/dev/null || echo "DIVE Instance ${instance_code}")\",
            \"instanceCertPEM\": $(echo "$cert_pem" | jq -Rs .),
            \"oidcDiscoveryUrl\": \"${oidc_discovery}\",
            \"apiUrl\": \"${local_api_url}\",
            \"idpUrl\": \"${idp_url}\",
            \"requestedCapabilities\": [\"oidc-federation\", \"kas\", \"opal-policy-sync\"],
            \"requestedTrustLevel\": \"partner\",
            \"contactEmail\": \"${FEDERATION_CONTACT_EMAIL:-admin@${instance_code,,}.dive25.com}\",
            \"enrollmentSignature\": \"${signature}\",
            \"signatureTimestamp\": \"${timestamp}\",
            \"signatureNonce\": \"${nonce}\"
        }" 2>&1)

    local http_code=$?
    if [ $http_code -ne 0 ]; then
        log_error "Enrollment request failed"
        log_debug "Response: ${response:0:500}"
        return 1
    fi

    # Check for error response
    if echo "$response" | jq -e '.error' &>/dev/null; then
        log_error "Enrollment rejected: $(echo "$response" | jq -r '.message // .error')"
        return 1
    fi

    local enrollment_id status verifier_fp
    enrollment_id=$(echo "$response" | jq -r '.enrollmentId // ""')
    status=$(echo "$response" | jq -r '.status // "unknown"')
    verifier_fp=$(echo "$response" | jq -r '.verifierFingerprint // "unknown"')

    echo ""
    echo "============================================"
    echo "  Enrollment Submitted"
    echo "============================================"
    echo ""
    echo "  Enrollment ID:  ${enrollment_id}"
    echo "  Status:         ${status}"
    echo "  Remote:         ${remote_code}"
    echo "  Remote FP:      ${verifier_fp}"
    echo ""
    echo "  NEXT STEPS:"
    echo "  1. Contact the ${remote_code} admin via secure channel"
    echo "  2. Share your fingerprint: ./dive federation show-fingerprint"
    echo "  3. Verify their fingerprint: ${verifier_fp}"
    echo "  4. Wait for approval (check: curl ${remote_url}/api/federation/enrollment/${enrollment_id}/status)"
    echo ""

    return 0
}

##
# List pending enrollments (admin)
# Usage: ./dive federation enrollments
##
cmd_federation_enrollments() {
    local api_url
    api_url="$(_fed_hub_api_url)"
    local admin_key
    admin_key="$(_fed_admin_key)"

    log_info "Fetching pending enrollments..."

    local response
    response=$(_fed_api_call "GET" "${api_url}/api/federation/enrollments/pending" "" "$admin_key")

    if [ $? -ne 0 ]; then
        log_error "Failed to fetch enrollments"
        return 1
    fi

    local count
    count=$(echo "$response" | jq -r '.count // 0')

    if [ "$count" = "0" ]; then
        log_info "No pending enrollments"
        return 0
    fi

    echo ""
    echo "Pending Federation Enrollments (${count}):"
    echo "--------------------------------------------"
    echo "$response" | jq -r '.enrollments[] | "  \(.enrollmentId)  \(.requesterInstanceCode) (\(.requesterInstanceName))  status=\(.status)  fingerprint=\(.requesterFingerprint)"'
    echo ""
}

##
# Verify enrollment fingerprint (admin)
# Usage: ./dive federation verify-fingerprint <ENROLLMENT_ID>
##
cmd_federation_verify_fingerprint() {
    local enrollment_id="${1:-}"

    if [ -z "$enrollment_id" ]; then
        log_error "Usage: ./dive federation verify-fingerprint <ENROLLMENT_ID>"
        return 1
    fi

    local api_url
    api_url="$(_fed_hub_api_url)"
    local admin_key
    admin_key="$(_fed_admin_key)"

    log_info "Marking fingerprint as verified for ${enrollment_id}..."

    local response
    response=$(_fed_api_call "POST" "${api_url}/api/federation/enrollment/${enrollment_id}/verify-fingerprint" "{}" "$admin_key")

    if [ $? -ne 0 ]; then
        log_error "Failed to verify fingerprint"
        log_debug "Response: ${response:0:300}"
        return 1
    fi

    local new_status
    new_status=$(echo "$response" | jq -r '.status // "unknown"')
    log_success "Fingerprint verified! Status: ${new_status}"
    log_info "Next: ./dive federation approve ${enrollment_id}"
}

##
# Approve enrollment (admin)
# Usage: ./dive federation approve-enrollment <ENROLLMENT_ID>
##
cmd_federation_approve_enrollment() {
    local enrollment_id="${1:-}"

    if [ -z "$enrollment_id" ]; then
        log_error "Usage: ./dive federation approve-enrollment <ENROLLMENT_ID>"
        return 1
    fi

    local api_url
    api_url="$(_fed_hub_api_url)"
    local admin_key
    admin_key="$(_fed_admin_key)"

    log_info "Approving enrollment ${enrollment_id}..."

    local response
    response=$(curl -sS --max-time 30 -k \
        -X POST "${api_url}/api/federation/enrollment/${enrollment_id}/approve" \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${admin_key}" 2>&1)

    if [ $? -ne 0 ] || echo "$response" | jq -e '.error' &>/dev/null; then
        log_error "Approval failed: $(echo "$response" | jq -r '.message // .error // "unknown"')"
        return 1
    fi

    local status
    status=$(echo "$response" | jq -r '.status // "unknown"')
    local requester
    requester=$(echo "$response" | jq -r '.requesterInstanceCode // "unknown"')

    log_success "Enrollment ${enrollment_id} approved (${requester})"
    log_info "Credential generation started. Spoke can now run:"
    log_info "  ./dive federation exchange ${enrollment_id} ${api_url}"
}

##
# Exchange credentials (spoke side)
# Polls Hub for approver credentials, creates local OIDC client, pushes credentials back
# Usage: ./dive federation exchange <ENROLLMENT_ID> <HUB_URL>
##
cmd_federation_exchange() {
    local enrollment_id="${1:-}"
    local hub_url="${2:-}"

    if [ -z "$enrollment_id" ] || [ -z "$hub_url" ]; then
        log_error "Usage: ./dive federation exchange <ENROLLMENT_ID> <HUB_URL>"
        log_info "  ENROLLMENT_ID: From the enrollment submission"
        log_info "  HUB_URL:       Hub API URL (e.g., https://hub.dive25.com)"
        return 1
    fi

    hub_url="${hub_url%/}"

    # Step 1: Poll Hub for approver credentials
    log_info "Step 1/4: Fetching Hub credentials..."
    local max_attempts=20
    local attempt=0
    local credentials=""

    while [ $attempt -lt $max_attempts ]; do
        attempt=$((attempt + 1))
        local response
        response=$(curl -sS --max-time 15 -k \
            "${hub_url}/api/federation/enrollment/${enrollment_id}/credentials" 2>&1)

        if [ $? -ne 0 ]; then
            log_error "Cannot reach Hub at ${hub_url}"
            return 1
        fi

        local status
        status=$(echo "$response" | jq -r '.status // ""')

        if echo "$response" | jq -e '.credentials' &>/dev/null; then
            credentials=$(echo "$response" | jq '.credentials')
            log_success "Hub credentials received"
            break
        fi

        if echo "$response" | jq -e '.error' &>/dev/null; then
            local err_msg
            err_msg=$(echo "$response" | jq -r '.message // .error')
            log_error "Error: ${err_msg}"
            return 1
        fi

        # 202 — still generating
        if [ $attempt -lt $max_attempts ]; then
            log_info "  Credentials generating... retrying in 3s (${attempt}/${max_attempts})"
            sleep 3
        fi
    done

    if [ -z "$credentials" ]; then
        log_error "Timed out waiting for Hub credentials"
        return 1
    fi

    # Extract Hub metadata for creating local client
    local hub_idp_url hub_realm hub_instance_code
    hub_idp_url=$(echo "$credentials" | jq -r '.oidcIssuerUrl // ""' | sed 's|/realms/.*||')
    hub_realm=$(echo "$credentials" | jq -r '.oidcIssuerUrl // ""' | grep -oP 'realms/\K[^/]+')
    hub_instance_code=$(echo "$hub_realm" | sed 's/dive-v3-broker-//' | tr '[:lower:]' '[:upper:]')

    if [ -z "$hub_idp_url" ] || [ -z "$hub_realm" ]; then
        log_error "Invalid Hub credential metadata"
        log_debug "Credentials: ${credentials}"
        return 1
    fi

    log_info "Hub: ${hub_instance_code} (${hub_idp_url}, realm: ${hub_realm})"

    # Step 2: Create reciprocal OIDC client on local Keycloak
    log_info "Step 2/4: Creating local OIDC client for ${hub_instance_code}..."

    local local_api_url="${API_URL:-https://localhost:4000}"
    local admin_key
    admin_key="$(_fed_admin_key)"

    local local_response
    local_response=$(curl -sS --max-time 30 -k \
        -X POST "${local_api_url}/api/federation/create-local-client" \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${admin_key}" \
        -d "{
            \"partnerInstanceCode\": \"${hub_instance_code}\",
            \"partnerIdpUrl\": \"${hub_idp_url}\",
            \"partnerRealm\": \"${hub_realm}\"
        }" 2>&1)

    if [ $? -ne 0 ] || echo "$local_response" | jq -e '.error' &>/dev/null; then
        log_error "Failed to create local OIDC client"
        log_debug "Response: ${local_response:0:300}"
        return 1
    fi

    local local_creds
    local_creds=$(echo "$local_response" | jq '.credentials')
    if [ "$local_creds" = "null" ] || [ -z "$local_creds" ]; then
        log_error "No credentials returned from local backend"
        return 1
    fi

    log_success "Local OIDC client created"

    # Step 3: Push spoke credentials back to Hub
    log_info "Step 3/4: Pushing credentials to Hub..."

    local push_response
    push_response=$(curl -sS --max-time 15 -k \
        -X POST "${hub_url}/api/federation/enrollment/${enrollment_id}/credentials" \
        -H "Content-Type: application/json" \
        -d "$local_creds" 2>&1)

    if [ $? -ne 0 ] || echo "$push_response" | jq -e '.error' &>/dev/null; then
        log_error "Failed to push credentials to Hub"
        log_debug "Response: ${push_response:0:300}"
        return 1
    fi

    local final_status
    final_status=$(echo "$push_response" | jq -r '.status // "unknown"')

    # Step 4: Activate spoke-side federation (create local IdP + trust cascade)
    if [ "$final_status" = "credentials_exchanged" ] || [ "$final_status" = "active" ]; then
        log_info "Step 4/4: Creating local IdP and trust cascade..."

        local activate_response
        activate_response=$(curl -sS --max-time 60 -k \
            -X POST "${local_api_url}/api/federation/activate-local" \
            -H "Content-Type: application/json" \
            -H "X-Admin-Key: ${admin_key}" \
            -d "{
                \"partnerInstanceCode\": \"${hub_instance_code}\",
                \"partnerCredentials\": ${credentials}
            }" 2>&1)

        if echo "$activate_response" | jq -e '.success' &>/dev/null; then
            local idp_alias
            idp_alias=$(echo "$activate_response" | jq -r '.idpAlias // "unknown"')
            log_success "Spoke-side federation activated (IdP: ${idp_alias})"
            final_status="active"
        else
            local act_err
            act_err=$(echo "$activate_response" | jq -r '.message // "unknown error"' 2>/dev/null)
            log_warn "Spoke-side activation failed: ${act_err}"
            log_info "  Retry with: ./dive federation activate ${enrollment_id} ${hub_url}"
        fi
    fi

    echo ""
    echo "============================================"
    if [ "$final_status" = "active" ]; then
        echo "  Federation Active"
    else
        echo "  Credential Exchange Complete"
    fi
    echo "============================================"
    echo ""
    echo "  Enrollment:  ${enrollment_id}"
    echo "  Status:      ${final_status}"
    echo "  Hub:         ${hub_instance_code}"
    echo ""
    echo "  Both sides now have OIDC client metadata."
    echo "  No admin passwords were exchanged."
    echo ""
    if [ "$final_status" = "credentials_exchanged" ]; then
        echo "  Spoke-side activation pending. Run:"
        echo "    ./dive federation activate ${enrollment_id} ${hub_url}"
    elif [ "$final_status" = "active" ]; then
        echo "  Federation is fully active."
        echo "  Cross-instance tokens will now be accepted."
    fi
    echo ""

    return 0
}

# =============================================
# cmd_federation_activate
# Manual activation fallback / retry
# =============================================

cmd_federation_activate() {
    local enrollment_id="${1:-}"
    local hub_url="${2:-}"

    if [ -z "$enrollment_id" ]; then
        log_error "Usage: ./dive federation activate <ENROLLMENT_ID> [HUB_URL]"
        log_info ""
        log_info "  Hub admin (no HUB_URL):"
        log_info "    Triggers Hub-side activation for an enrollment in credentials_exchanged state."
        log_info ""
        log_info "  Spoke (with HUB_URL):"
        log_info "    Fetches Hub credentials, creates local IdP, and runs local trust cascade."
        return 1
    fi

    local admin_key
    admin_key="$(_fed_admin_key)"

    if [ -z "$hub_url" ]; then
        # Hub admin mode: activate on Hub
        local api_url
        api_url=$(_fed_hub_api_url)

        log_info "Activating Hub-side federation for enrollment ${enrollment_id}..."

        local response
        response=$(curl -sS --max-time 60 -k \
            -X POST "${api_url}/api/federation/enrollment/${enrollment_id}/activate" \
            -H "Content-Type: application/json" \
            -H "X-Admin-Key: ${admin_key}" 2>&1)

        if echo "$response" | jq -e '.success' &>/dev/null; then
            local status
            status=$(echo "$response" | jq -r '.status // "unknown"')
            log_success "Hub-side federation activated (status: ${status})"
        else
            local err_msg
            err_msg=$(echo "$response" | jq -r '.message // .error // "unknown error"' 2>/dev/null)
            log_error "Hub-side activation failed: ${err_msg}"
            return 1
        fi
    else
        # Spoke mode: fetch credentials from Hub and activate locally
        hub_url="${hub_url%/}"
        local local_api_url="${API_URL:-https://localhost:4000}"

        log_info "Fetching Hub credentials for enrollment ${enrollment_id}..."

        local cred_response
        cred_response=$(curl -sS --max-time 15 -k \
            "${hub_url}/api/federation/enrollment/${enrollment_id}/credentials" 2>&1)

        if [ $? -ne 0 ] || ! echo "$cred_response" | jq -e '.credentials' &>/dev/null; then
            log_error "Cannot fetch Hub credentials"
            log_debug "Response: ${cred_response:0:300}"
            return 1
        fi

        local credentials hub_instance_code
        credentials=$(echo "$cred_response" | jq '.credentials')
        hub_instance_code=$(echo "$credentials" | jq -r '.oidcIssuerUrl // ""' | grep -oP 'realms/dive-v3-broker-\K[^/]+' | tr '[:lower:]' '[:upper:]')

        if [ -z "$hub_instance_code" ]; then
            log_error "Cannot determine Hub instance code from credentials"
            return 1
        fi

        log_info "Activating spoke-side federation with ${hub_instance_code}..."

        local activate_response
        activate_response=$(curl -sS --max-time 60 -k \
            -X POST "${local_api_url}/api/federation/activate-local" \
            -H "Content-Type: application/json" \
            -H "X-Admin-Key: ${admin_key}" \
            -d "{
                \"partnerInstanceCode\": \"${hub_instance_code}\",
                \"partnerCredentials\": ${credentials}
            }" 2>&1)

        if echo "$activate_response" | jq -e '.success' &>/dev/null; then
            local idp_alias
            idp_alias=$(echo "$activate_response" | jq -r '.idpAlias // "unknown"')
            log_success "Spoke-side federation activated (IdP: ${idp_alias})"
        else
            local err_msg
            err_msg=$(echo "$activate_response" | jq -r '.message // "unknown error"' 2>/dev/null)
            log_error "Spoke-side activation failed: ${err_msg}"
            return 1
        fi
    fi

    return 0
}

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
        list)           cmd_federation_list "$@" ;;
        approve)        cmd_federation_approve "$@" ;;
        suspend)        cmd_federation_suspend "$@" ;;
        revoke)         cmd_federation_revoke "$@" ;;
        test|integration-test)
            # Load verification module for test functions
            if [ -f "${FEDERATION_DIR}/verification.sh" ]; then
                source "${FEDERATION_DIR}/verification.sh"
            fi
            federation_integration_test "$@"
            ;;
        token-revocation|revocation-test)
            if [ -f "${FEDERATION_DIR}/verification.sh" ]; then
                source "${FEDERATION_DIR}/verification.sh"
            fi
            federation_test_token_revocation "$@"
            ;;
        list-idps)
            keycloak_admin_api "USA" "GET" \
                "realms/${HUB_REALM}/identity-provider/instances" 2>/dev/null | jq '.' 2>/dev/null || \
                log_error "Cannot list IdPs (Hub Keycloak unreachable)"
            ;;
        register-spoke)
            # Parse: register-spoke CODE --idp-url URL --secret SECRET [--api-url URL]
            local _rs_code="" _rs_idp_url="" _rs_secret="" _rs_api_url=""
            while [ $# -gt 0 ]; do
                case "$1" in
                    --idp-url)  _rs_idp_url="${2:-}"; shift 2 ;;
                    --api-url)  _rs_api_url="${2:-}"; shift 2 ;;
                    --secret)   _rs_secret="${2:-}"; shift 2 ;;
                    --*)        log_error "Unknown option: $1"; return 1 ;;
                    *)          _rs_code="$1"; shift ;;
                esac
            done
            if [ -z "$_rs_code" ] || [ -z "$_rs_idp_url" ] || [ -z "$_rs_secret" ]; then
                log_error "Usage: ./dive federation register-spoke CODE --idp-url URL --secret SECRET [--api-url URL]"
                return 1
            fi
            federation_register_external_spoke "$_rs_code" "$_rs_idp_url" "$_rs_secret" "$_rs_api_url"
            ;;
        register-hub)
            # Parse: register-hub --hub-url URL --secret SECRET (uses local spoke code)
            local _rh_code="" _rh_hub_url="" _rh_secret=""
            while [ $# -gt 0 ]; do
                case "$1" in
                    --hub-url)  _rh_hub_url="${2:-}"; shift 2 ;;
                    --secret)   _rh_secret="${2:-}"; shift 2 ;;
                    --*)        log_error "Unknown option: $1"; return 1 ;;
                    *)          _rh_code="$1"; shift ;;
                esac
            done
            if [ -z "$_rh_code" ] || [ -z "$_rh_hub_url" ] || [ -z "$_rh_secret" ]; then
                log_error "Usage: ./dive federation register-hub CODE --hub-url URL --secret SECRET"
                return 1
            fi
            federation_register_hub_on_spoke "$_rh_code" "$_rh_hub_url" "$_rh_secret"
            ;;
        dashboard)
            # Load health module
            if [ -f "${FEDERATION_DIR}/health.sh" ]; then
                source "${FEDERATION_DIR}/health.sh"
            fi
            federation_health_dashboard "$@"
            ;;
        diagnose)
            if [ -z "${1:-}" ]; then
                log_error "Usage: ./dive federation diagnose <CODE>"
                return 1
            fi
            if [ -f "${FEDERATION_DIR}/health.sh" ]; then
                source "${FEDERATION_DIR}/health.sh"
            fi
            federation_diagnose "$@"
            ;;
        repair)
            if [ -z "${1:-}" ]; then
                log_error "Usage: ./dive federation repair <CODE>"
                return 1
            fi
            if [ -f "${FEDERATION_DIR}/health.sh" ]; then
                source "${FEDERATION_DIR}/health.sh"
            fi
            federation_repair "$@"
            ;;
        # =============================================
        # V2 Zero Trust Enrollment Protocol
        # =============================================
        discover)
            cmd_federation_discover "$@"
            ;;
        show-fingerprint)
            cmd_federation_show_fingerprint "$@"
            ;;
        enrollments)
            cmd_federation_enrollments "$@"
            ;;
        enroll)
            cmd_federation_enroll "$@"
            ;;
        verify-fingerprint)
            cmd_federation_verify_fingerprint "$@"
            ;;
        approve-enrollment)
            cmd_federation_approve_enrollment "$@"
            ;;
        exchange)
            cmd_federation_exchange "$@"
            ;;
        activate)
            cmd_federation_activate "$@"
            ;;

        help|--help|-h)
            echo "Usage: ./dive federation <command> [args]"
            echo ""
            echo "Commands:"
            echo "  link <CODE>       Link Spoke to Hub federation (co-located)"
            echo "  unlink <CODE>     Remove federation link"
            echo "  verify <CODE>     Verify federation health"
            echo "  diagnose <CODE>   Deep diagnostic for a federation link"
            echo "  repair <CODE>     Auto-repair a degraded/failed federation link"
            echo "  dashboard         Federation health dashboard (all spokes)"
            echo "  test              Run federation integration tests"
            echo "  token-revocation  Test cross-instance token revocation"
            echo "  status            Show overall federation status"
            echo "  list-idps         List configured IdPs on Hub"
            echo ""
            echo "V2 Zero Trust Enrollment:"
            echo "  discover <URL>         Fetch federation metadata from a remote instance"
            echo "  show-fingerprint       Display this instance's identity fingerprint"
            echo "  enroll <URL>           Request federation enrollment with a remote instance"
            echo "  enrollments            List pending enrollment requests (admin)"
            echo "  verify-fingerprint <ID>  Mark enrollment fingerprint as verified (admin)"
            echo "  approve-enrollment <ID>  Approve an enrollment request (admin)"
            echo "  exchange <ID> <HUB_URL>  Exchange credentials + activate (spoke)"
            echo "  activate <ID> [HUB_URL]  Manual activation retry (hub or spoke)"
            echo "  approve <CODE|ID>      Approve a pending spoke or enrollment"
            echo "  reject <ID> --reason TEXT  Reject an enrollment request"
            echo ""
            echo "External Federation (cross-network):"
            echo "  register-spoke CODE --idp-url URL --secret SECRET [--api-url URL]"
            echo "                    Register external spoke on Hub via OIDC discovery"
            echo "  register-hub CODE --hub-url URL --secret SECRET"
            echo "                    Register Hub as IdP on spoke via OIDC discovery"
            echo ""
            echo "Spoke Management (via Hub API):"
            echo "  list [--pending|--approved|--suspended]"
            echo "                    List registered spokes (filtered by status)"
            echo "  approve <CODE>    Approve a pending spoke"
            echo "    --trust <level>           bilateral (default), national, partner"
            echo "    --max-classification <c>  SECRET (default), TOP_SECRET"
            echo "  suspend <CODE>    Suspend a spoke (reversible)"
            echo "    --reason <text>           Suspension reason"
            echo "  revoke <CODE>     Permanently revoke a spoke from federation"
            echo ""
            echo "Environment:"
            echo "  FEDERATION_ADMIN_KEY  API key for CLI management (from .env.hub)"
            echo "  HUB_API_URL           Hub backend URL (auto-derived from DIVE_DOMAIN_SUFFIX)"
            ;;
        *)
            log_error "Unknown federation command: $action"
            log_info "Run './dive federation help' for usage"
            return 1
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
export -f cmd_federation_list
export -f cmd_federation_approve
export -f cmd_federation_suspend
export -f cmd_federation_revoke
# External federation (Phase 4)
export -f _federation_oidc_discover
# V2 Zero Trust Enrollment
export -f cmd_federation_discover
export -f cmd_federation_show_fingerprint
export -f cmd_federation_enroll
export -f cmd_federation_enrollments
export -f cmd_federation_verify_fingerprint
export -f cmd_federation_approve_enrollment
export -f cmd_federation_exchange
export -f cmd_federation_activate
export -f _federation_update_trusted_issuers
export -f federation_register_external_spoke
export -f federation_register_hub_on_spoke
# Resilience (Phase 8)
export -f _federation_retry_with_backoff
export -f _federation_oidc_cache_clear
export -f federation_repair
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
