#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Federation Link/Verify/Fix Module
# =============================================================================
# Extracted from federation.sh during refactoring for modularity
# Commands: federation link|unlink|verify|fix|list-idps
# =============================================================================
# Version: 1.0.0
# Date: 2025-12-23
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load federation-setup for admin token helpers
if [ -z "$DIVE_FEDERATION_SETUP_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/federation-setup.sh"
    export DIVE_FEDERATION_SETUP_LOADED=1
fi

# Mark this module as loaded
export DIVE_FEDERATION_LINK_LOADED=1

# =============================================================================
# GCP SSOT - FEDERATION SECRETS
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
            # Log to stderr to avoid contaminating return value
            log_info "Using existing federation secret from GCP: $secret_name" >&2
            echo "$existing_secret"
            return 0
        fi

        # Generate new secret and store in GCP
        local new_secret=$(openssl rand -base64 24 | tr -d '/+=')

        # Create secret in GCP
        if echo -n "$new_secret" | gcloud secrets create "$secret_name" \
            --data-file=- \
            --project="$project" \
            --replication-policy="automatic" &>/dev/null; then
            log_success "✓ Created federation secret in GCP (SSOT): $secret_name" >&2
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
# This module now uses common.sh:get_instance_ports() for ALL port calculations
# See: scripts/dive-modules/common.sh for authoritative implementation
# =============================================================================

##
# Get backend port for an instance - DELEGATED TO COMMON.SH (SSOT)
##
_get_instance_port() {
    local code="${1^^}"

    # Use SSOT function from common.sh
    eval "$(get_instance_ports "$code")"
    echo "$SPOKE_BACKEND_PORT"
}

##
# Get Keycloak port for an instance - DELEGATED TO COMMON.SH (SSOT)
##
_get_keycloak_port() {
    local code="${1^^}"

    # Use SSOT function from common.sh
    eval "$(get_instance_ports "$code")"
    echo "$SPOKE_KEYCLOAK_HTTPS_PORT"
}

# =============================================================================
# FEDERATION LINK - Auto-configure IdP Trust (Phase 3)
# =============================================================================

##
# Helper function for retrying API calls with exponential backoff
##
_federation_link_with_retry() {
    local url="$1"
    local payload="$2"
    local token="$3"
    local description="$4"
    local max_retries="${5:-3}"
    local attempt=1
    local delay=2
    local response=""
    local success=false

    while [ $attempt -le $max_retries ]; do
        if [ $attempt -gt 1 ]; then
            echo -e "    ${YELLOW}Retry $attempt/$max_retries after ${delay}s...${NC}"
            sleep $delay
            delay=$((delay * 2))  # Exponential backoff
        fi

        response=$(curl -sk --max-time 30 -X POST "${url}" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${token}" \
            -d "$payload" 2>&1)

        local curl_exit=$?

        if [ $curl_exit -eq 0 ]; then
            if echo "$response" | grep -q '"success":true' || echo "$response" | grep -q 'already exists'; then
                success=true
                break
            fi
        fi

        # Check for specific recoverable errors
        if echo "$response" | grep -q -E '(Connection refused|timed out|ECONNREFUSED|ETIMEDOUT)'; then
            log_warn "Network error on attempt $attempt: connection failed"
        elif [ $curl_exit -ne 0 ]; then
            log_warn "Curl error on attempt $attempt: exit code $curl_exit"
        fi

        ((attempt++))
    done

    echo "$response"
    if [ "$success" = true ]; then
        return 0
    else
        return 1
    fi
}

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

    local token=$(docker exec "$target_kc_container" curl -sf --max-time 10 \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" -d "username=admin" -d "password=${target_pass}" \
        -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    if [ -z "$token" ]; then
        log_error "Failed to authenticate with $target_upper Keycloak"
        log_error "Admin credentials invalid or Keycloak not ready"
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

    log_info "Using source Keycloak password from GCP Secret Manager (SSOT)"

    local source_token=$(docker exec "$source_kc_container" curl -sf --max-time 10 \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" -d "username=admin" -d "password=${source_pass}" \
        -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    if [ -z "$source_token" ]; then
        log_error "Failed to authenticate with source $source_upper Keycloak"
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

        # If secret retrieval failed or timed out, try GCP fallback
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

        # Get federation secret from GCP SSOT (or generate if GCP unavailable)
        client_secret=$(_get_federation_secret "$source_lower" "$target_lower")

        # Build JSON payload using printf for proper escaping
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

        # Create federation client using stdin to avoid quote escaping issues
        log_info "POSTing client configuration to Keycloak..."
        log_info "Token length: ${#source_token}, Realm: $source_realm, Container: $source_kc_container"

        local create_output
        create_output=$(echo "$new_client_config" | docker exec -i "$source_kc_container" \
            curl -s --max-time 15 -w "\nHTTP_CODE:%{http_code}" \
            -X POST "http://localhost:8080/admin/realms/${source_realm}/clients" \
            -H "Authorization: Bearer $source_token" \
            -H "Content-Type: application/json" \
            -d @- 2>&1)

        local create_exit=$?

        if [ $create_exit -eq 0 ]; then
            # Check HTTP code
            local http_code=$(echo "$create_output" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
            if [ "$http_code" = "201" ] || [ "$http_code" = "204" ] || [ -z "$http_code" ]; then
                log_success "Created federation client: ${federation_client_id}"
            else
                log_warn "Unexpected HTTP code: $http_code"
                log_warn "Response: $create_output"
            fi
        elif [ $create_exit -eq 28 ]; then
            log_error "Timeout creating federation client (check Keycloak health)"
            return 1
        else
            log_error "Failed to create federation client (exit code: $create_exit)"
            if [ -n "$create_output" ]; then
                log_error "Response: $create_output"
            fi
            return 1
        fi
    fi

    # Generate fallback secret if needed (should not happen with GCP SSOT)
    if [ -z "$client_secret" ]; then
        client_secret=$(_get_federation_secret "$source_lower" "$target_lower")
        log_warn "Using GCP/generated secret - verifying sync..."
    fi

    # URL Strategy: Dual URLs for browser vs server-to-server
    # Browser URLs: localhost:{port} (user's browser)
    # Internal URLs: host.docker.internal:{port} (server-to-server from containers)
    # CRITICAL: Container names like dive-spoke-fra-keycloak are NOT in SSL certificate SANs!
    #           host.docker.internal IS in the certificate SANs
    local source_public_url source_internal_url
    if [ "$source_upper" = "USA" ]; then
        source_public_url="https://localhost:8443"
        source_internal_url="https://host.docker.internal:8443"
    else
        local _kc_port=$(_get_keycloak_port "$source_upper")
        source_public_url="https://localhost:${_kc_port}"
        source_internal_url="https://host.docker.internal:${_kc_port}"
    fi

    # Create IdP configuration
    # Note: firstBrokerLoginFlowAlias is empty to enable seamless SSO
    # trustEmail=true + empty flow = automatic account creation/linking
    local idp_config="{
        \"alias\": \"${idp_alias}\",
        \"displayName\": \"${source_upper} Federation\",
        \"providerId\": \"oidc\",
        \"enabled\": true,
        \"trustEmail\": true,
        \"storeToken\": true,
        \"linkOnly\": false,
        \"firstBrokerLoginFlowAlias\": \"\",
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

    # Create the IdP
    local create_result
    create_result=$(docker exec "$target_kc_container" curl -sf \
        -X POST "http://localhost:8080/admin/realms/${target_realm}/identity-provider/instances" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "$idp_config" 2>&1)

    local create_exit=$?

    if [ $create_exit -eq 0 ]; then
        log_info "Created ${idp_alias} in ${target_upper} (direct)"

        # CRITICAL: Configure IdP mappers to import claims from federated tokens
        # Without these mappers, user attributes like clearance, countryOfAffiliation, etc.
        # will NOT be imported from the remote IdP's tokens, causing "Invalid JWT" errors
        log_info "Configuring IdP claim mappers for ${idp_alias}..."
        _configure_idp_mappers "$target_kc_container" "$token" "$target_realm" "$idp_alias"

        return 0
    else
        log_warn "Failed to create IdP: $create_result"
        return 1
    fi
}

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

    # Check if client exists
    local existing=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $token" \
        "http://localhost:8080/admin/realms/${realm}/clients?clientId=${client_id}" 2>/dev/null | \
        grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

    if [ -n "$existing" ]; then
        echo -e "${GREEN}exists${NC}"
    else
        echo -n "creating... "

        # Get federation secret from GCP SSOT (or generate if GCP unavailable)
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

    # After ensuring client exists, add protocol mappers for attribute passthrough
    _ensure_federation_client_mappers "$kc_container" "$token" "$realm" "$client_id"
}

##
# Add protocol mappers to a federation client to expose user attributes in tokens
# This is critical for federation to work - without these mappers, the source
# instance never includes user attributes in the JWT token.
##
_ensure_federation_client_mappers() {
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
        echo -e "  ${YELLOW}⚠${NC} Could not find client UUID for ${client_id}"
        return 1
    fi

    echo -n "  Adding protocol mappers to ${client_id}... "

    # Define all attribute mappings (source_attr -> claim_name)
    # Standard normalized attributes
    local standard_attrs=("clearance" "countryOfAffiliation" "acpCOI" "uniqueID")

    # Country-specific attribute mappings (for localized attributes)
    # Format: "source_attribute:claim_name"
    local localized_attrs=()

    # Detect realm locale from realm name (e.g., dive-v3-broker-fra -> fra)
    local realm_code="${realm##*-}"
    case "$realm_code" in
        fra)
            localized_attrs=(
                "pays_affiliation:countryOfAffiliation"
                "niveau_habilitation:clearance"
                "communaute_interet:acpCOI"
                "identifiant_unique:uniqueID"
            )
            ;;
        deu)
            localized_attrs=(
                "land_zugehoerigkeit:countryOfAffiliation"
                "sicherheitsstufe:clearance"
                "interessengemeinschaft:acpCOI"
                "eindeutige_id:uniqueID"
            )
            ;;
        # Add more country mappings as needed
    esac

    local mapper_count=0

    # Create mappers for standard attributes
    for attr in "${standard_attrs[@]}"; do
        _create_protocol_mapper "$kc_container" "$token" "$realm" "$client_uuid" "$attr" "$attr" "federation-std-${attr}"
        ((mapper_count++))
    done

    # Create mappers for localized attributes
    for mapping in "${localized_attrs[@]}"; do
        local source_attr="${mapping%%:*}"
        local claim_name="${mapping##*:}"
        _create_protocol_mapper "$kc_container" "$token" "$realm" "$client_uuid" "$source_attr" "$claim_name" "federation-${source_attr}"
        ((mapper_count++))
    done

    echo -e "${GREEN}${mapper_count} mappers${NC}"
}

##
# Create a single protocol mapper on a client
##
_create_protocol_mapper() {
    local kc_container="$1"
    local token="$2"
    local realm="$3"
    local client_uuid="$4"
    local user_attr="$5"
    local claim_name="$6"
    local mapper_name="$7"

    # Check if mapper already exists
    local existing=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $token" \
        "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" 2>/dev/null | \
        jq -r --arg name "$mapper_name" '.[] | select(.name==$name) | .id // empty' 2>/dev/null)

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
            \"multivalued\": \"false\"
        }
    }"

    if [ -n "$existing" ]; then
        # Update existing mapper
        docker exec "$kc_container" curl -sf \
            -X PUT "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models/${existing}" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$mapper_config" >/dev/null 2>&1
    else
        # Create new mapper
        docker exec "$kc_container" curl -sf \
            -X POST "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$mapper_config" >/dev/null 2>&1
    fi
}

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

    # Standard claim names that should be imported
    local claims=("clearance" "countryOfAffiliation" "uniqueID" "acpCOI")

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

    # Check if mapper already exists (use HTTP internally)
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
        # Update existing mapper
        docker exec "$kc_container" curl -sf \
            -X PUT "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/${idp_alias}/mappers/${existing}" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$mapper_config" >/dev/null 2>&1 || true
    else
        # Create new mapper
        docker exec "$kc_container" curl -sf \
            -X POST "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/${idp_alias}/mappers" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$mapper_config" >/dev/null 2>&1 || true
    fi
}

# =============================================================================
# FEDERATION LINK COMMAND
# =============================================================================

federation_link() {
    local remote_instance="${1:-}"
    local max_retries="${2:-3}"
    local retry_mode=false

    if [ "$remote_instance" = "--retry" ]; then
        log_error "Usage: ./dive federation link <INSTANCE_CODE> [--retry]"
        return 1
    fi

    if [ -z "$remote_instance" ]; then
        log_error "Usage: ./dive federation link <INSTANCE_CODE> [--retry]"
        echo ""
        echo "Examples:"
        echo "  ./dive federation link GBR           # Link GBR spoke to this instance"
        echo "  ./dive federation link USA           # Link USA hub to this instance"
        echo "  ./dive federation link EST --retry   # Retry with exponential backoff"
        echo ""
        return 1
    fi

    # Handle --retry flag
    if [ "${2:-}" = "--retry" ] || [ "${2:-}" = "-r" ]; then
        retry_mode=true
        max_retries=5
    fi

    local remote_code="${remote_instance^^}"
    local remote_lower="${remote_instance,,}"
    local local_instance="${INSTANCE:-USA}"
    local local_code="${local_instance^^}"
    local local_lower="${local_instance,,}"

    # SELF-LINK VALIDATION: Prevent linking instance to itself
    if [ "$remote_code" = "$local_code" ]; then
        log_error "Cannot link instance to itself"
        echo ""
        echo "  Local instance:  $local_code"
        echo "  Remote instance: $remote_code"
        echo ""
        echo "To set up federation, link from different instances:"
        echo "  From USA: ./dive federation link GBR"
        echo "  From GBR: ./dive --instance gbr federation link USA"
        echo ""
        return 1
    fi

    log_step "Linking Identity Provider: ${remote_code} ↔ ${local_code}"
    if [ "$retry_mode" = true ]; then
        echo -e "  ${CYAN}Retry mode enabled (max ${max_retries} attempts with exponential backoff)${NC}"
    fi
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would call backend API: POST /api/federation/link-idp"
        log_dry "  localInstance: ${local_code}"
        log_dry "  remoteInstance: ${remote_code}"
        log_dry "Would create ${remote_code}-idp in local Keycloak"
        return 0
    fi

    # Determine local instance API URL
    local local_api_port=$(_get_instance_port "$local_code")
    local local_api_url="https://localhost:${local_api_port}"

    log_info "Creating ${remote_lower}-idp in ${local_code}..."

    # Try backend API first
    local payload="{\"localInstance\": \"${local_code}\", \"remoteInstance\": \"${remote_code}\"}"
    local response

    if [ "$retry_mode" = true ]; then
        response=$(_federation_link_with_retry \
            "${local_api_url}/api/federation/link-idp" \
            "$payload" \
            "$(get_instance_admin_token "$local_code" 2>/dev/null || echo '')" \
            "Link ${remote_code}" \
            "$max_retries")
    else
        local admin_token
        admin_token=$(get_instance_admin_token "$local_code" 2>/dev/null || echo '')

        response=$(curl -sk --max-time 30 -X POST "${local_api_url}/api/federation/link-idp" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${admin_token}" \
            -d "$payload" 2>&1)
    fi

    if echo "$response" | grep -q '"success":true'; then
        log_success "Created ${remote_lower}-idp in ${local_code} via backend API"
    else
        log_warn "Backend API failed, trying direct Keycloak method..."
        _federation_link_direct "$local_code" "$remote_code"
    fi

    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "  1. Verify: ./dive federation verify ${remote_code}"
    echo "  2. Test: Open https://localhost:$(_get_keycloak_port "$local_code")/realms/${local_code,,}/account"
}

# =============================================================================
# FEDERATION UNLINK COMMAND
# =============================================================================

federation_unlink() {
    local remote_instance="${1:-}"

    if [ -z "$remote_instance" ]; then
        log_error "Usage: ./dive federation unlink <INSTANCE_CODE>"
        return 1
    fi

    local remote_code="${remote_instance^^}"
    local idp_alias="${remote_code,,}-idp"

    log_step "Unlinking Identity Provider: ${remote_code}"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would delete IdP: ${idp_alias}"
        return 0
    fi

    local backend_url="${BACKEND_URL:-https://localhost:4000}"
    local api_endpoint="${backend_url}/api/federation/unlink-idp/${idp_alias}"

    local admin_token
    if ! admin_token=$(get_hub_admin_token); then
        log_error "Failed to get admin token for hub"
        return 1
    fi

    response=$(curl -sk -X DELETE "${api_endpoint}" \
        -H "Authorization: Bearer ${admin_token}" 2>&1)

    if echo "$response" | grep -q '"success":true'; then
        log_success "IdP unlinked successfully"
    else
        log_error "IdP unlinking failed: $response"
        return 1
    fi
}

# =============================================================================
# FEDERATION VERIFY COMMAND
# =============================================================================

##
# Helper function to retrieve Keycloak admin password from multiple sources (SSOT-aware)
# Tries: 1) GCP Secret Manager, 2) Container env (KC_BOOTSTRAP_ADMIN_PASSWORD),
#        3) Container env (KEYCLOAK_ADMIN_PASSWORD legacy), 4) Local .env file
##
_get_keycloak_admin_password_ssot() {
    local container_name="$1"
    local instance_code="${2,,}"  # lowercase

    # Try GCP Secret Manager first (SSOT)
    if check_gcloud; then
        local gcp_secret_name="dive-v3-keycloak-${instance_code}"
        local gcp_password
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
        env_password=$(grep "^KEYCLOAK_ADMIN_PASSWORD" "$env_file" | cut -d'=' -f2- | tr -d '\n\r"' | sed 's/#.*//')

        if [ -n "$env_password" ]; then
            echo "$env_password"
            return 0
        fi
    fi

    # No password found
    return 1
}

federation_verify() {
    local remote_instance="${1:-}"

    if [ -z "$remote_instance" ]; then
        log_error "Usage: ./dive federation verify <INSTANCE_CODE>"
        echo ""
        echo "Verifies bidirectional federation between local instance and remote instance."
        echo ""
        echo "Examples:"
        echo "  ./dive federation verify EST     # Verify EST ↔ USA bidirectional federation"
        echo "  ./dive --instance fra federation verify USA  # Verify FRA ↔ USA"
        echo ""
        return 1
    fi

    # Disable exit on error for this function
    local old_errexit=""
    if [[ $- == *e* ]]; then
        old_errexit=true
        set +e
    fi

    local remote_code="${remote_instance^^}"
    local remote_lower="${remote_instance,,}"
    local local_instance="${INSTANCE:-USA}"
    local local_code="${local_instance^^}"
    local local_lower="${local_instance,,}"

    echo ""
    echo -e "${BOLD}Federation Verification: ${local_code} ↔ ${remote_code}${NC}"
    echo ""

    local checks_passed=0
    local checks_total=0

    # ==========================================================================
    # Check 1: ${remote_code}-idp exists in ${local_code} Keycloak
    # ==========================================================================
    ((checks_total++))
    echo -n "1. ${remote_code}-idp in ${local_code} Keycloak: "

    local local_kc_container
    if [ "$local_code" = "USA" ]; then
        local_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
    else
        local_kc_container="dive-spoke-${local_lower}-keycloak"
    fi

    local remote_idp_alias="${remote_lower}-idp"
    local local_realm
    if [ "$local_code" = "USA" ]; then
        local_realm="dive-v3-broker-usa"
    else
        local_realm="dive-v3-broker-${local_lower}"
    fi

    # Get admin password and token
    local local_kc_pass
    local_kc_pass=$(_get_keycloak_admin_password_ssot "$local_kc_container" "$local_lower")

    if [ -z "$local_kc_pass" ]; then
        echo -e "${RED}✗ FAIL${NC} (Cannot retrieve admin password)"
    else
        local local_token
        local_token=$(docker exec "$local_kc_container" curl -sf --max-time 10 \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" \
            -d "username=admin" \
            -d "password=${local_kc_pass}" \
            -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

        if [ -n "$local_token" ]; then
            local idp_check
            idp_check=$(docker exec "$local_kc_container" curl -sf --max-time 10 \
                -H "Authorization: Bearer $local_token" \
                "http://localhost:8080/admin/realms/${local_realm}/identity-provider/instances/${remote_idp_alias}" 2>/dev/null)

            if echo "$idp_check" | grep -q '"alias"'; then
                local idp_enabled
                idp_enabled=$(echo "$idp_check" | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | sed 's/.*://' | tr -d ' ')
                if [ "$idp_enabled" = "true" ]; then
                    echo -e "${GREEN}✓ PASS${NC} (exists and enabled)"
                    ((checks_passed++))
                else
                    echo -e "${YELLOW}⚠ WARN${NC} (exists but disabled)"
                fi
            else
                echo -e "${RED}✗ FAIL${NC} (not found)"
            fi
        else
            echo -e "${RED}✗ FAIL${NC} (auth failed)"
        fi
    fi

    # ==========================================================================
    # Check 2: ${local_code}-idp exists in ${remote_code} Keycloak
    # ==========================================================================
    ((checks_total++))
    echo -n "2. ${local_code}-idp in ${remote_code} Keycloak: "

    local remote_kc_container
    if [ "$remote_code" = "USA" ]; then
        remote_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
    else
        remote_kc_container="dive-spoke-${remote_lower}-keycloak"
    fi

    local local_idp_alias="${local_lower}-idp"
    local remote_realm
    if [ "$remote_code" = "USA" ]; then
        remote_realm="dive-v3-broker-usa"
    else
        remote_realm="dive-v3-broker-${remote_lower}"
    fi

    local remote_kc_pass
    remote_kc_pass=$(_get_keycloak_admin_password_ssot "$remote_kc_container" "$remote_lower")

    if [ -z "$remote_kc_pass" ]; then
        echo -e "${RED}✗ FAIL${NC} (Cannot retrieve admin password)"
    else
        local remote_token
        remote_token=$(docker exec "$remote_kc_container" curl -sf --max-time 10 \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" \
            -d "username=admin" \
            -d "password=${remote_kc_pass}" \
            -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

        if [ -n "$remote_token" ]; then
            local idp_check
            idp_check=$(docker exec "$remote_kc_container" curl -sf --max-time 10 \
                -H "Authorization: Bearer $remote_token" \
                "http://localhost:8080/admin/realms/${remote_realm}/identity-provider/instances/${local_idp_alias}" 2>/dev/null)

            if echo "$idp_check" | grep -q '"alias"'; then
                local idp_enabled
                idp_enabled=$(echo "$idp_check" | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | sed 's/.*://' | tr -d ' ')
                if [ "$idp_enabled" = "true" ]; then
                    echo -e "${GREEN}✓ PASS${NC} (exists and enabled)"
                    ((checks_passed++))
                else
                    echo -e "${YELLOW}⚠ WARN${NC} (exists but disabled)"
                fi
            else
                echo -e "${RED}✗ FAIL${NC} (not found)"
            fi
        else
            echo -e "${RED}✗ FAIL${NC} (auth failed)"
        fi
    fi

    # ==========================================================================
    # Check 3: Federation clients exist
    # ==========================================================================
    ((checks_total++))
    echo -n "3. Federation client in ${local_code}: "
    local expected_client="dive-v3-broker-${remote_lower}"
    if [ -n "$local_token" ]; then
        local client_check
        client_check=$(docker exec "$local_kc_container" curl -sf \
            -H "Authorization: Bearer $local_token" \
            "http://localhost:8080/admin/realms/${local_realm}/clients?clientId=${expected_client}" 2>/dev/null)
        if echo "$client_check" | grep -q '"id"'; then
            echo -e "${GREEN}✓ PASS${NC}"
            ((checks_passed++))
        else
            echo -e "${RED}✗ FAIL${NC} (client not found)"
        fi
    else
        echo -e "${YELLOW}⚠ SKIP${NC} (no token)"
    fi

    ((checks_total++))
    echo -n "4. Federation client in ${remote_code}: "
    expected_client="dive-v3-broker-${local_lower}"
    if [ -n "$remote_token" ]; then
        local client_check
        client_check=$(docker exec "$remote_kc_container" curl -sf \
            -H "Authorization: Bearer $remote_token" \
            "http://localhost:8080/admin/realms/${remote_realm}/clients?clientId=${expected_client}" 2>/dev/null)
        if echo "$client_check" | grep -q '"id"'; then
            echo -e "${GREEN}✓ PASS${NC}"
            ((checks_passed++))
        else
            echo -e "${RED}✗ FAIL${NC} (client not found)"
        fi
    else
        echo -e "${YELLOW}⚠ SKIP${NC} (no token)"
    fi

    # Summary
    echo ""
    echo "================================"
    echo "Verification: $checks_passed/$checks_total checks passed"

    if [ $checks_passed -eq $checks_total ]; then
        echo -e "${GREEN}🎉 Bidirectional federation is properly configured!${NC}"
    elif [ $checks_passed -ge 2 ]; then
        echo -e "${YELLOW}⚠️  Partial federation - some checks failed${NC}"
        echo "Run './dive federation fix ${remote_code}' to repair"
    else
        echo -e "${RED}❌ Federation not configured${NC}"
        echo "Run './dive federation link ${remote_code}' to set up"
    fi

    # Restore errexit
    if [ "$old_errexit" = true ]; then
        set -e
    fi

    [ $checks_passed -eq $checks_total ]
}

# =============================================================================
# FEDERATION FIX COMMAND
# =============================================================================

federation_fix() {
    local remote_instance="${1:-}"

    if [ -z "$remote_instance" ]; then
        log_error "Usage: ./dive federation fix <INSTANCE_CODE>"
        echo ""
        echo "Fixes misconfigured bidirectional federation by:"
        echo "  1. Deleting existing IdPs with wrong client IDs"
        echo "  2. Creating/verifying federation clients in both realms"
        echo "  3. Recreating IdPs with correct configuration"
        echo ""
        echo "Examples:"
        echo "  ./dive federation fix EST     # Fix EST ↔ USA federation"
        echo ""
        return 1
    fi

    local remote_code="${remote_instance^^}"
    local remote_lower="${remote_instance,,}"
    local local_instance="${INSTANCE:-USA}"
    local local_code="${local_instance^^}"
    local local_lower="${local_instance,,}"

    echo ""
    echo -e "${BOLD}Fixing Federation: ${local_code} ↔ ${remote_code}${NC}"
    echo ""

    # Disable exit on error
    local old_errexit=""
    if [[ $- == *e* ]]; then
        old_errexit=true
        set +e
    fi

    # ==========================================================================
    # Step 1: Delete existing IdPs
    # ==========================================================================
    echo -e "${CYAN}Step 1: Removing misconfigured IdPs${NC}"

    local local_kc_container local_realm
    if [ "$local_code" = "USA" ]; then
        local_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
        local_realm="dive-v3-broker-usa"
    else
        local_kc_container="dive-spoke-${local_lower}-keycloak"
        local_realm="dive-v3-broker-${local_lower}"
    fi

    local local_pass=$(docker exec "$local_kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    local local_token=$(docker exec "$local_kc_container" curl -sf \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" -d "username=admin" -d "password=${local_pass}" \
        -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    if [ -n "$local_token" ]; then
        echo -n "  Deleting ${remote_lower}-idp from ${local_code}... "
        docker exec "$local_kc_container" curl -sf -X DELETE \
            "http://localhost:8080/admin/realms/${local_realm}/identity-provider/instances/${remote_lower}-idp" \
            -H "Authorization: Bearer $local_token" 2>/dev/null
        echo -e "${GREEN}done${NC}"
    fi

    local remote_kc_container remote_realm
    if [ "$remote_code" = "USA" ]; then
        remote_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
        remote_realm="dive-v3-broker-usa"
    else
        remote_kc_container="dive-spoke-${remote_lower}-keycloak"
        remote_realm="dive-v3-broker-${remote_lower}"
    fi

    local remote_pass=$(docker exec "$remote_kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    local remote_token=$(docker exec "$remote_kc_container" curl -sf \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" -d "username=admin" -d "password=${remote_pass}" \
        -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    if [ -n "$remote_token" ]; then
        echo -n "  Deleting ${local_lower}-idp from ${remote_code}... "
        docker exec "$remote_kc_container" curl -sf -X DELETE \
            "http://localhost:8080/admin/realms/${remote_realm}/identity-provider/instances/${local_lower}-idp" \
            -H "Authorization: Bearer $remote_token" 2>/dev/null
        echo -e "${GREEN}done${NC}"
    fi

    echo ""

    # ==========================================================================
    # Step 2: Ensure federation clients exist
    # ==========================================================================
    echo -e "${CYAN}Step 2: Ensuring federation clients exist${NC}"

    _ensure_federation_client "$local_kc_container" "$local_token" "$local_realm" "$remote_lower" "$remote_code"
    _ensure_federation_client "$remote_kc_container" "$remote_token" "$remote_realm" "$local_lower" "$local_code"

    echo ""

    # ==========================================================================
    # Step 3: Recreate IdPs
    # ==========================================================================
    echo -e "${CYAN}Step 3: Recreating IdPs with correct configuration${NC}"

    _federation_link_direct "$local_code" "$remote_code"
    _federation_link_direct "$remote_code" "$local_code"

    echo ""

    # ==========================================================================
    # Step 4: Configure IdP Claim Mappers
    # ==========================================================================
    echo -e "${CYAN}Step 4: Configuring IdP claim mappers${NC}"

    # Create IdP mappers for claim passthrough (import claims from tokens into user attributes)
    _configure_idp_mappers "$local_kc_container" "$local_token" "$local_realm" "${remote_lower}-idp"
    echo -e "  ${GREEN}✓${NC} IdP mappers configured for ${remote_lower}-idp in ${local_code}"

    _configure_idp_mappers "$remote_kc_container" "$remote_token" "$remote_realm" "${local_lower}-idp"
    echo -e "  ${GREEN}✓${NC} IdP mappers configured for ${local_lower}-idp in ${remote_code}"

    echo ""

    # ==========================================================================
    # Step 5: Verify
    # ==========================================================================
    echo -e "${CYAN}Step 5: Verifying configuration${NC}"
    federation_verify "$remote_code"

    # Restore errexit
    if [ "$old_errexit" = true ]; then
        set -e
    fi
}

# =============================================================================
# FEDERATION LIST-IDPS COMMAND
# =============================================================================

federation_list_idps() {
    log_step "Listing configured Identity Providers..."
    echo ""

    local backend_port=4000
    local inst_lc=$(echo "${INSTANCE:-usa}" | tr '[:upper:]' '[:lower:]')

    # Calculate port offset for non-USA instances
    if [[ "$inst_lc" != "usa" ]]; then
        backend_port=$(_get_instance_port "${inst_lc^^}")
    fi

    local backend_url="${BACKEND_URL:-https://localhost:${backend_port}}"
    local api_endpoint="${backend_url}/api/idps/public"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would call: GET ${api_endpoint}"
        return 0
    fi

    response=$(curl -sk "${api_endpoint}" 2>&1)

    if echo "$response" | grep -q '"success":true'; then
        echo "$response" | jq -r '.idps[] | "  [\(.enabled | if . then "✓" else " " end)] \(.displayName) (\(.alias))"'
    else
        log_error "Failed to list IdPs"
        echo "$response"
    fi
    echo ""
}

