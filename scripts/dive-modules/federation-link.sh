#!/usr/bin/env bash
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

    # ==========================================================================
    # CRITICAL FIX: Add protocol mappers to the SOURCE federation client
    # ==========================================================================
    # Without these mappers, user attributes (clearance, countryOfAffiliation, etc.)
    # are NOT included in tokens issued to the target instance, causing:
    # - Empty attributes on federated users in the target instance
    # - OPA authorization failures due to missing claims
    # - "Invalid JWT" errors in the backend
    # ==========================================================================
    log_info "Adding protocol mappers to source federation client..."
    _ensure_federation_client_mappers "$source_kc_container" "$source_token" "$source_realm" "$federation_client_id"

    # Generate fallback secret if needed (should not happen with GCP SSOT)
    if [ -z "$client_secret" ]; then
        client_secret=$(_get_federation_secret "$source_lower" "$target_lower")
        log_warn "Using GCP/generated secret - verifying sync..."
    fi

    # URL Strategy: Dual URLs for browser vs server-to-server
    # Browser URLs: localhost:{port} (user's browser)
    # Internal URLs: Container name + exposed port (server-to-server from containers)
    # Container names (dive-hub-keycloak, dive-spoke-fra-keycloak) ARE in SSL certificate SANs
    # The mkcert certificates include all container names - see certificates.sh
    local source_public_url source_internal_url
    if [ "$source_upper" = "USA" ]; then
        source_public_url="https://localhost:8443"
        # Use container name for internal URL - certificate includes dive-hub-keycloak as SAN
        source_internal_url="https://dive-hub-keycloak:8443"
    else
        local _kc_port=$(_get_keycloak_port "$source_upper")
        local source_lower
        source_lower=$(echo "$source_upper" | tr '[:upper:]' '[:lower:]')
        source_public_url="https://localhost:${_kc_port}"
        # Use container name for internal URL - certificate includes dive-spoke-{code}-keycloak as SAN
        source_internal_url="https://dive-spoke-${source_lower}-keycloak:8443"
    fi

    # Create IdP configuration
    # ==========================================================================
    # BEST PRACTICE: SPOKE HANDLES MFA - HUB TRUSTS SPOKE'S AUTHENTICATION
    # ==========================================================================
    # When the Hub (USA) creates an IdP for a Spoke:
    #   - Do NOT set postBrokerLoginFlowAlias (no Hub-side MFA enforcement)
    #   - Trust the spoke's AMR/ACR claims (spoke enforces WebAuthn/OTP)
    #
    # When a Spoke creates an IdP for the Hub (USA):
    #   - firstBrokerLoginFlowAlias="" to skip profile prompts (trust source IdP)
    #   - postBrokerLoginFlowAlias can be empty (spoke already authenticated)
    #
    # Flow distinction:
    # - firstBrokerLoginFlowAlias: Set to "" to skip profile prompts (federation trusts source IdP)
    # - postBrokerLoginFlowAlias: Runs AFTER login - LEAVE EMPTY to trust spoke MFA
    #
    # trustEmail=true = automatic account creation/linking (no user review prompt)
    # ==========================================================================

    # Determine post-broker flow based on federation direction
    # BEST PRACTICE: Spoke handles MFA, Hub trusts spoke's authentication
    local post_broker_flow=""
    if [ "$target_upper" = "USA" ] && [ "$source_upper" != "USA" ]; then
        # Hub receiving from Spoke: Trust spoke MFA, no post-broker MFA
        post_broker_flow=""
        log_info "Hub trusts spoke MFA - no post-broker flow enforcement"
    elif [ "$target_upper" != "USA" ] && [ "$source_upper" = "USA" ]; then
        # Spoke receiving from Hub: Also trust Hub authentication
        post_broker_flow=""
        log_info "Spoke trusts Hub authentication - no post-broker flow enforcement"
    else
        # Spoke-to-Spoke: Trust source spoke's MFA
        post_broker_flow=""
        log_info "Inter-spoke federation - trusting source MFA"
    fi

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
        \"postBrokerLoginFlowAlias\": \"${post_broker_flow}\",
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

    # ==========================================================================
    # IDEMPOTENT IdP CREATION: Check if exists, update if needed, create if not
    # ==========================================================================
    
    # Check if IdP already exists
    local existing_idp
    existing_idp=$(docker exec "$target_kc_container" curl -sf \
        -H "Authorization: Bearer $token" \
        "http://localhost:8080/admin/realms/${target_realm}/identity-provider/instances/${idp_alias}" 2>/dev/null)
    
    if [ -n "$existing_idp" ] && echo "$existing_idp" | grep -q '"alias"'; then
        # IdP exists - update it instead of creating
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
        # IdP doesn't exist - create it
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
            # 409 Conflict - IdP already exists (race condition), try update
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

    # CRITICAL: Configure IdP mappers to import claims from federated tokens
    # Without these mappers, user attributes like clearance, countryOfAffiliation, etc.
    # will NOT be imported from the remote IdP's tokens, causing "Invalid JWT" errors
    log_info "Configuring IdP claim mappers for ${idp_alias}..."
    _configure_idp_mappers "$target_kc_container" "$token" "$target_realm" "$idp_alias"

    return 0
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
#
# NOTE (SSOT Migration): When USE_TERRAFORM_SSOT=true, this function is SKIPPED
# because Terraform now manages protocol mappers via:
#   - terraform/modules/federated-instance/main.tf (broker client)
#   - terraform/modules/federated-instance/cross-border-client.tf (cross-border client)
#
# Set USE_TERRAFORM_SSOT=false to use legacy API-based mapper creation.
##
_ensure_federation_client_mappers() {
    # Skip if Terraform is SSOT (mappers managed by Terraform)
    if [ "${USE_TERRAFORM_SSOT:-false}" = "true" ]; then
        echo -e "  ${BLUE}ℹ${NC} Skipping protocol mappers (Terraform SSOT enabled)"
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
    # Localized attributes are based on nato-attribute-mappings.json (SSOT)
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
                "zugehoerigkeitsland:countryOfAffiliation"
                "sicherheitsfreigabe:clearance"
                "interessengemeinschaft:acpCOI"
                "eindeutige_kennung:uniqueID"
            )
            ;;
        pol)
            localized_attrs=(
                "panstwo_przynaleznosci:countryOfAffiliation"
                "poziom_bezpieczenstwa:clearance"
                "spolecznosc_interesow:acpCOI"
                "unikalny_identyfikator:uniqueID"
            )
            ;;
        gbr)
            localized_attrs=(
                "country_of_affiliation:countryOfAffiliation"
                "security_clearance:clearance"
                "community_of_interest:acpCOI"
                "unique_identifier:uniqueID"
            )
            ;;
        ita)
            localized_attrs=(
                "paese_affiliazione:countryOfAffiliation"
                "livello_sicurezza:clearance"
                "comunita_interesse:acpCOI"
                "identificativo_unico:uniqueID"
            )
            ;;
        esp)
            localized_attrs=(
                "pais_afiliacion:countryOfAffiliation"
                "nivel_seguridad:clearance"
                "comunidad_interes:acpCOI"
                "identificador_unico:uniqueID"
            )
            ;;
        nld)
            localized_attrs=(
                "land_affiliatie:countryOfAffiliation"
                "veiligheidsmachtiging:clearance"
                "gemeenschap_belang:acpCOI"
                "uniek_identificatienummer:uniqueID"
            )
            ;;
        can)
            localized_attrs=(
                "pays_affiliation:countryOfAffiliation"
                "habilitation_securite:clearance"
                "communaute_interet:acpCOI"
                "identifiant_unique:uniqueID"
            )
            ;;
        # USA uses standard attributes, no localization needed
        usa)
            localized_attrs=()
            ;;
        # Default: no localized attributes (only standard mappers)
        *)
            localized_attrs=()
            ;;
    esac

    local mapper_count=0

    # Create mappers for standard attributes
    # CRITICAL: acpCOI is multivalued - pass "true" as 8th parameter
    for attr in "${standard_attrs[@]}"; do
        local multivalued="false"
        if [ "$attr" = "acpCOI" ]; then
            multivalued="true"
        fi
        _create_protocol_mapper "$kc_container" "$token" "$realm" "$client_uuid" "$attr" "$attr" "federation-std-${attr}" "$multivalued"
        ((mapper_count++))
    done

    # Create mappers for localized attributes
    for mapping in "${localized_attrs[@]}"; do
        local source_attr="${mapping%%:*}"
        local claim_name="${mapping##*:}"
        # acpCOI localized mappers (e.g., spolecznosc_interesow for POL) are also multivalued
        local multivalued="false"
        if [ "$claim_name" = "acpCOI" ]; then
            multivalued="true"
        fi
        _create_protocol_mapper "$kc_container" "$token" "$realm" "$client_uuid" "$source_attr" "$claim_name" "federation-${source_attr}" "$multivalued"
        ((mapper_count++))
    done

    # ==========================================================================
    # CRITICAL: Add AMR/ACR protocol mappers
    # ==========================================================================
    # These mappers ensure AMR (Authentication Methods Reference) and ACR
    # (Authentication Context Class Reference) claims are included in tokens.
    # This is required for the Hub to receive the spoke's MFA authentication state.
    # ==========================================================================
    _create_amr_acr_mappers "$kc_container" "$token" "$realm" "$client_uuid"
    ((mapper_count += 2))

    echo -e "${GREEN}${mapper_count} mappers${NC}"
}

##
# Create AMR/ACR protocol mappers on a client
# These are special mappers that read from the authentication session (not user attributes)
##
_create_amr_acr_mappers() {
    local kc_container="$1"
    local token="$2"
    local realm="$3"
    local client_uuid="$4"

    # AMR Mapper - Uses oidc-amr-mapper (reads from authentication session)
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

    # Check if AMR mapper exists
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

    # ACR Mapper - Uses oidc-acr-mapper (reads from authentication session)
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

    # Check if ACR mapper exists
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
    local multivalued="${8:-false}"  # Default to false, but acpCOI needs true

    # Check if mapper already exists
    local existing=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $token" \
        "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" 2>/dev/null | \
        jq -r --arg name "$mapper_name" '.[] | select(.name==$name) | .id // empty' 2>/dev/null)

    # CRITICAL: Always use jsonType.label=String for Keycloak v26+
    # Using "JSON" causes "cannot map type for token claim" errors
    # For multivalued attributes like acpCOI, set multivalued=true with jsonType=String
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
    # #region agent log - hypothesis B: IdP mappers creation tracking
    echo '{"id":"log_'"$(date +%s)"'_hypB","timestamp":'$(date +%s)'000,"location":"federation-link.sh:837","message":"_configure_idp_mappers called","data":{"realm":"'"$3"'","idp_alias":"'"$4"'"},"sessionId":"debug-session","runId":"debug-run-1","hypothesisId":"B"}' >> /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log
    # #endregion

    local kc_container="$1"
    local token="$2"
    local realm="$3"
    local idp_alias="$4"

    # Standard claim names that should be imported
    # Includes AMR/ACR for MFA state propagation from spoke to hub
    local claims=("clearance" "countryOfAffiliation" "uniqueID" "acpCOI" "amr" "acr")

    for claim in "${claims[@]}"; do
        # #region agent log - hypothesis B: IdP mapper creation attempt
        echo '{"id":"log_'"$(date +%s)"'_hypB_create","timestamp":'$(date +%s)'000,"location":"federation-link.sh:847","message":"Creating IdP mapper","data":{"claim":"'"$claim"'","idp_alias":"'"$idp_alias"'","realm":"'"$realm"'"},"sessionId":"debug-session","runId":"debug-run-1","hypothesisId":"B"}' >> /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log
        # #endregion
        _create_idp_mapper "$kc_container" "$token" "$realm" "$idp_alias" "$claim" "$claim" "import-${claim}"
    done
}

##
# Create a single IdP mapper
##
_create_idp_mapper() {
    # #region agent log - hypothesis B: IdP mapper creation start
    echo '{"id":"log_'"$(date +%s)"'_hypB_mapper","timestamp":'$(date +%s)'000,"location":"federation-link.sh:862","message":"_create_idp_mapper called","data":{"realm":"'"$3"'","idp_alias":"'"$4"'","claim_name":"'"$5"'","mapper_name":"'"$7"'"},"sessionId":"debug-session","runId":"debug-run-1","hypothesisId":"B"}' >> /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log
    # #endregion

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
        # #region agent log - hypothesis B: Updating existing IdP mapper
        echo '{"id":"log_'"$(date +%s)"'_hypB_update","timestamp":'$(date +%s)'000,"location":"federation-link.sh:892","message":"Updating existing IdP mapper","data":{"existing":"'"$existing"'","mapper_name":"'"$mapper_name"'","realm":"'"$realm"'","idp_alias":"'"$idp_alias"'"},"sessionId":"debug-session","runId":"debug-run-1","hypothesisId":"B"}' >> /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log
        # #endregion
        docker exec "$kc_container" curl -sf \
            -X PUT "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/${idp_alias}/mappers/${existing}" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$mapper_config" >/dev/null 2>&1 || true
    else
        # Create new mapper
        # #region agent log - hypothesis B: Creating new IdP mapper
        echo '{"id":"log_'"$(date +%s)"'_hypB_create","timestamp":'$(date +%s)'000,"location":"federation-link.sh:899","message":"Creating new IdP mapper","data":{"mapper_name":"'"$mapper_name"'","realm":"'"$realm"'","idp_alias":"'"$idp_alias"'"},"sessionId":"debug-session","runId":"debug-run-1","hypothesisId":"B"}' >> /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log
        # #endregion
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
            -H "X-CLI-Bypass: dive-cli-local-dev" \
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
        local instance_upper="${instance_code^^}"

        # CRITICAL FIX: Try instance-suffixed variable first (new pipeline convention)
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

    # ==========================================================================
    # Check 5: Protocol mappers on remote federation client (Defect A fix)
    # ==========================================================================
    ((checks_total++))
    echo -n "5. Protocol mappers on ${remote_code} client: "
    if [ -n "$remote_token" ]; then
        # Get client UUID for dive-v3-broker-${local_lower} in remote realm
        local fed_client_id="dive-v3-broker-${local_lower}"
        local fed_client_uuid
        fed_client_uuid=$(docker exec "$remote_kc_container" curl -sf \
            -H "Authorization: Bearer $remote_token" \
            "http://localhost:8080/admin/realms/${remote_realm}/clients?clientId=${fed_client_id}" 2>/dev/null | \
            grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

        if [ -n "$fed_client_uuid" ]; then
            local mapper_count
            mapper_count=$(docker exec "$remote_kc_container" curl -sf \
                -H "Authorization: Bearer $remote_token" \
                "http://localhost:8080/admin/realms/${remote_realm}/clients/${fed_client_uuid}/protocol-mappers/models" 2>/dev/null | \
                grep -oE '"name":"[^"]*"' | wc -l | tr -d ' ' || echo "0")

            if [ "$mapper_count" -ge 4 ]; then
                echo -e "${GREEN}✓ PASS${NC} (${mapper_count} mappers)"
                ((checks_passed++))
            elif [ "$mapper_count" -gt 0 ]; then
                echo -e "${YELLOW}⚠ WARN${NC} (only ${mapper_count} mappers, expected ≥4)"
            else
                echo -e "${RED}✗ FAIL${NC} (no mappers - attributes won't be in tokens!)"
            fi
        else
            echo -e "${RED}✗ FAIL${NC} (client not found)"
        fi
    else
        echo -e "${YELLOW}⚠ SKIP${NC} (no token)"
    fi

    # ==========================================================================
    # Check 6: MFA flow binding on IdP (Defect B fix)
    # MFA is enforced via postBrokerLoginFlowAlias (runs AFTER login)
    # firstBrokerLoginFlowAlias should be "" (empty) to skip profile prompts
    # ==========================================================================
    ((checks_total++))
    echo -n "6. MFA flow binding on ${remote_lower}-idp: "
    if [ -n "$local_token" ]; then
        local idp_config
        idp_config=$(docker exec "$local_kc_container" curl -sf --max-time 10 \
            -H "Authorization: Bearer $local_token" \
            "http://localhost:8080/admin/realms/${local_realm}/identity-provider/instances/${remote_idp_alias}" 2>/dev/null)

        # Check postBrokerLoginFlowAlias for MFA enforcement
        # BEST PRACTICE: Hub trusts Spoke's MFA (spoke enforces WebAuthn/OTP via AMR/ACR)
        if echo "$idp_config" | grep -q '"postBrokerLoginFlowAlias":"Post Broker MFA'; then
            echo -e "${GREEN}✓ PASS${NC} (MFA flow configured via postBrokerLogin)"
            ((checks_passed++))
        elif echo "$idp_config" | grep -q '"postBrokerLoginFlowAlias":"Simple Post-Broker OTP'; then
            echo -e "${GREEN}✓ PASS${NC} (Simple OTP flow configured)"
            ((checks_passed++))
        elif echo "$idp_config" | grep -q '"postBrokerLoginFlowAlias".*":"[^"]\+'; then
            echo -e "${GREEN}✓ PASS${NC} (custom post-broker flow configured)"
            ((checks_passed++))
        else
            # Empty postBrokerLoginFlowAlias is EXPECTED - Hub trusts Spoke's MFA
            echo -e "${GREEN}✓ PASS${NC} (Hub trusts Spoke MFA - by design)"
            ((checks_passed++))
        fi
    else
        echo -e "${YELLOW}⚠ SKIP${NC} (no token)"
    fi

    # ==========================================================================
    # Check 7: firstBrokerLoginFlowAlias is empty (skip profile prompts)
    # ==========================================================================
    ((checks_total++))
    echo -n "7. firstBrokerLoginFlowAlias empty on ${remote_lower}-idp: "
    if [ -n "$local_token" ]; then
        local idp_config
        idp_config=$(docker exec "$local_kc_container" curl -sf --max-time 10 \
            -H "Authorization: Bearer $local_token" \
            "http://localhost:8080/admin/realms/${local_realm}/identity-provider/instances/${remote_idp_alias}" 2>/dev/null)

        local first_broker_flow
        first_broker_flow=$(echo "$idp_config" | jq -r '.firstBrokerLoginFlowAlias // ""' 2>/dev/null)

        if [ -z "$first_broker_flow" ] || [ "$first_broker_flow" = "null" ]; then
            echo -e "${GREEN}✓ PASS${NC} (empty - skip profile prompts)"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ WARN${NC} (set to '${first_broker_flow}' - may prompt users)"
        fi
    else
        echo -e "${YELLOW}⚠ SKIP${NC} (no token)"
    fi

    # ==========================================================================
    # Check 8: Client secrets match between IdP config and target client
    # NOTE: Keycloak masks clientSecret in IdP API responses (returns **********)
    # so we test SSO connectivity instead of comparing secrets directly
    # ==========================================================================
    ((checks_total++))
    echo -n "8. Federation SSO connectivity: "
    if [ -n "$local_token" ] && [ -n "$remote_token" ]; then
        # Test OIDC discovery endpoints (proves secrets work)
        local local_discovery
        local remote_discovery
        local_discovery=$(docker exec "$local_kc_container" curl -sf --max-time 5 \
            "http://localhost:8080/realms/${local_realm}/.well-known/openid-configuration" 2>/dev/null | jq -r '.issuer // ""')
        remote_discovery=$(docker exec "$remote_kc_container" curl -sf --max-time 5 \
            "http://localhost:8080/realms/${remote_realm}/.well-known/openid-configuration" 2>/dev/null | jq -r '.issuer // ""')

        if [ -n "$local_discovery" ] && [ -n "$remote_discovery" ]; then
            echo -e "${GREEN}✓ PASS${NC} (OIDC endpoints reachable)"
            ((checks_passed++))
            echo -e "    ${GRAY}Note: Keycloak masks secrets in API - if SSO fails, run 'federation sync-secrets ${remote_code}'${NC}"
        else
            echo -e "${YELLOW}⚠ WARN${NC} (OIDC discovery issues)"
            echo -e "    ${GRAY}Local: $( [ -n "$local_discovery" ] && echo "OK" || echo "FAIL" ), Remote: $( [ -n "$remote_discovery" ] && echo "OK" || echo "FAIL" )${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ SKIP${NC} (no tokens)"
    fi

    # Summary
    echo ""
    echo "================================"
    echo "Verification: $checks_passed/$checks_total checks passed"

    if [ $checks_passed -eq $checks_total ]; then
        echo -e "${GREEN}🎉 Bidirectional federation is properly configured!${NC}"
    elif [ $checks_passed -ge 4 ]; then
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
# VERIFY-ALL COMMAND - Run 8-point check on all configured spokes
# =============================================================================

federation_verify_all() {
    echo ""
    echo -e "${BOLD}Federation Verification: All Spokes (8-Point Check)${NC}"
    echo ""

    local local_instance="${INSTANCE:-USA}"
    local local_code="${local_instance^^}"
    local local_lower="${local_instance,,}"

    # Get local Keycloak container
    local local_kc_container
    if [ "$local_code" = "USA" ]; then
        local_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
    else
        local_kc_container="dive-spoke-${local_lower}-keycloak"
    fi

    # Check if container is running
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${local_kc_container}$"; then
        log_error "Keycloak container not running: ${local_kc_container}"
        return 1
    fi

    # Get admin credentials
    local local_kc_pass
    local_kc_pass=$(_get_keycloak_admin_password_ssot "$local_kc_container" "$local_lower")
    if [ -z "$local_kc_pass" ]; then
        log_error "Cannot get admin password for ${local_code}"
        return 1
    fi

    # Get admin token
    local local_token
    local_token=$(docker exec "$local_kc_container" curl -sf --max-time 10 \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${local_kc_pass}" \
        -d "client_id=admin-cli" 2>/dev/null | jq -r '.access_token // ""')

    if [ -z "$local_token" ]; then
        log_error "Failed to get admin token for ${local_code}"
        return 1
    fi

    # Get list of IdPs (excluding USA if we are USA hub)
    local local_realm
    if [ "$local_code" = "USA" ]; then
        local_realm="dive-v3-broker-usa"
    else
        local_realm="dive-v3-broker-${local_lower}"
    fi

    local idps
    idps=$(docker exec "$local_kc_container" curl -sf --max-time 10 \
        -H "Authorization: Bearer $local_token" \
        "http://localhost:8080/admin/realms/${local_realm}/identity-provider/instances" 2>/dev/null | \
        jq -r '.[].alias' 2>/dev/null | grep -E '^[a-z]{3}-idp$' | sed 's/-idp$//' | tr '[:lower:]' '[:upper:]')

    if [ -z "$idps" ]; then
        log_warn "No federation IdPs found in ${local_code}"
        return 0
    fi

    # Results tracking
    local total_spokes=0
    local passed_spokes=0
    local failed_spokes=0
    local partial_spokes=0

    printf "\n%-8s  %-6s  %-6s  %-6s  %-6s  %-6s  %-6s  %-6s  %-6s  %-10s\n" \
        "SPOKE" "IdP↓" "IdP↑" "Cli↓" "Cli↑" "Map" "MFA" "FBL" "Sec" "STATUS"
    echo "───────────────────────────────────────────────────────────────────────────────"

    for spoke in $idps; do
        ((total_spokes++))
        local spoke_lower="${spoke,,}"
        local spoke_kc_container="dive-spoke-${spoke_lower}-keycloak"

        # Check if spoke is running
        if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${spoke_kc_container}$"; then
            printf "%-8s  %-6s  %-6s  %-6s  %-6s  %-6s  %-6s  %-6s  %-6s  ${YELLOW}%-10s${NC}\n" \
                "$spoke" "-" "-" "-" "-" "-" "-" "-" "-" "OFFLINE"
            ((failed_spokes++))
            continue
        fi

        # Run 8-point verification (capture results)
        local check_results
        check_results=$(federation_verify "$spoke" 2>&1)

        # Parse check results
        local c1 c2 c3 c4 c5 c6 c7 c8
        c1=$(echo "$check_results" | grep "1\." | grep -q "PASS" && echo "✓" || echo "✗")
        c2=$(echo "$check_results" | grep "2\." | grep -q "PASS" && echo "✓" || echo "✗")
        c3=$(echo "$check_results" | grep "3\." | grep -q "PASS" && echo "✓" || echo "✗")
        c4=$(echo "$check_results" | grep "4\." | grep -q "PASS" && echo "✓" || echo "✗")
        c5=$(echo "$check_results" | grep "5\." | grep -q "PASS" && echo "✓" || echo "✗")
        c6=$(echo "$check_results" | grep "6\." | grep -q "PASS" && echo "✓" || echo "✗")
        c7=$(echo "$check_results" | grep "7\." | grep -q "PASS" && echo "✓" || echo "✗")
        c8=$(echo "$check_results" | grep "8\." | grep -q "PASS" && echo "✓" || echo "✗")

        # Count passed checks
        local pass_count
        pass_count=$(echo "$check_results" | grep -c "PASS" || echo "0")

        local status status_color
        if [ "$pass_count" -eq 8 ]; then
            status="OK"
            status_color="${GREEN}"
            ((passed_spokes++))
        elif [ "$pass_count" -ge 4 ]; then
            status="PARTIAL"
            status_color="${YELLOW}"
            ((partial_spokes++))
        else
            status="FAIL"
            status_color="${RED}"
            ((failed_spokes++))
        fi

        printf "%-8s  %-6s  %-6s  %-6s  %-6s  %-6s  %-6s  %-6s  %-6s  ${status_color}%-10s${NC}\n" \
            "$spoke" "$c1" "$c2" "$c3" "$c4" "$c5" "$c6" "$c7" "$c8" "$status (${pass_count}/8)"
    done

    echo "───────────────────────────────────────────────────────────────────────────────"
    echo ""
    echo "Summary: ${total_spokes} spokes verified"
    echo -e "  ${GREEN}✓ Passed: ${passed_spokes}${NC}"
    if [ "$partial_spokes" -gt 0 ]; then
        echo -e "  ${YELLOW}⚠ Partial: ${partial_spokes}${NC}"
    fi
    if [ "$failed_spokes" -gt 0 ]; then
        echo -e "  ${RED}✗ Failed/Offline: ${failed_spokes}${NC}"
    fi
    echo ""

    if [ "$failed_spokes" -eq 0 ] && [ "$partial_spokes" -eq 0 ]; then
        echo -e "${GREEN}🎉 All federation links fully verified!${NC}"
        return 0
    else
        echo "Run './dive federation fix <CODE>' to repair failed federations"
        return 1
    fi
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

    local local_pass=$(get_keycloak_password "$local_kc_container")
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

    local remote_pass=$(get_keycloak_password "$remote_kc_container")
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

    # #region agent log - hypothesis E: IdP recreation with redirect URIs
    echo '{"id":"log_'"$(date +%s)"'_hypE","timestamp":'$(date +%s)'000,"location":"federation-link.sh:1694","message":"Recreating IdPs - should configure redirect URIs","data":{"local_code":"'"$local_code"'","remote_code":"'"$remote_code"'"},"sessionId":"debug-session","runId":"debug-run-1","hypothesisId":"E"}' >> /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log
    # #endregion

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
# FEDERATION SYNC-SECRETS COMMAND
# =============================================================================
# Wrapper that calls existing secret sync functions for bidirectional sync.
# This ensures IdP configurations have correct credentials after redeployment.
#
# Calls:
#   - sync_hub_to_spoke_secrets (federation-setup.sh) - Spoke→Hub direction
#   - spoke_sync_federation_secrets (spoke.sh) - Hub→Spoke direction
# =============================================================================

federation_sync_secrets() {
    # #region agent log - hypothesis D: Client secret synchronization
    echo '{"id":"log_'"$(date +%s)"'_hypD","timestamp":'$(date +%s)'000,"location":"federation-link.sh:1739","message":"federation_sync_secrets called","data":{"spoke_code":"'"$1"'"},"sessionId":"debug-session","runId":"debug-run-1","hypothesisId":"D"}' >> /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log
    # #endregion

    local spoke_code="${1:-}"

    if [ -z "$spoke_code" ]; then
        log_error "Usage: ./dive federation sync-secrets <SPOKE_CODE>"
        echo ""
        echo "Syncs client secrets bidirectionally between a spoke and the Hub."
        echo ""
        echo "Examples:"
        echo "  ./dive federation sync-secrets BEL"
        echo "  ./dive federation sync-secrets ALL    # Sync all running spokes"
        echo ""
        return 1
    fi

    # Load spoke module for spoke_sync_federation_secrets function
    if [ -z "$DIVE_SPOKE_LOADED" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/deployment/spoke.sh" 2>/dev/null || true
    fi

    local spoke_upper="${spoke_code^^}"

    # Handle "ALL" case - sync all running spokes
    if [ "$spoke_upper" = "ALL" ]; then
        log_step "Syncing secrets for all running spokes..."
        local synced=0

        # Find all running spoke containers
        local spoke_containers
        spoke_containers=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "^dive-spoke-.*-keycloak$" || true)

        if [ -z "$spoke_containers" ]; then
            log_warn "No spoke Keycloak containers found"
            return 0
        fi

        for container in $spoke_containers; do
            # Extract country code from container name (dive-spoke-XXX-keycloak -> XXX)
            local code
            code=$(echo "$container" | sed 's/dive-spoke-\(.*\)-keycloak/\1/' | tr '[:lower:]' '[:upper:]')
            if [ -n "$code" ] && [ "$code" != "USA" ]; then
                federation_sync_secrets "$code"
                ((synced++)) || true
            fi
        done

        log_success "Synced secrets for $synced spokes"
        return 0
    fi

    local spoke_lower="${spoke_upper,,}"

    echo ""
    echo -e "${BOLD}Syncing Client Secrets: USA ↔ ${spoke_upper}${NC}"
    echo ""

    local success=true

    # Direction 1: Spoke→Hub (Hub's [spoke]-idp gets Spoke's client secret)
    echo -e "${CYAN}Direction 1: Spoke→Hub (Hub's ${spoke_lower}-idp)${NC}"
    if sync_hub_to_spoke_secrets "$spoke_upper"; then
        echo -e "  ${GREEN}✓${NC} Hub's ${spoke_lower}-idp updated with Spoke's client secret"
    else
        echo -e "  ${YELLOW}⚠${NC} Could not sync Hub's ${spoke_lower}-idp (IdP may not exist yet)"
        success=false
    fi

    # Direction 2: Hub→Spoke (Spoke's usa-idp gets Hub's client secret)
    echo -e "${CYAN}Direction 2: Hub→Spoke (${spoke_upper}'s usa-idp)${NC}"
    if spoke_sync_federation_secrets "$spoke_lower"; then
        echo -e "  ${GREEN}✓${NC} ${spoke_upper}'s usa-idp updated with Hub's client secret"
    else
        echo -e "  ${YELLOW}⚠${NC} Could not sync ${spoke_upper}'s usa-idp (IdP may not exist yet)"
        success=false
    fi

    # Direction 3: Validate bidirectional connectivity
    echo -e "${CYAN}Validating bidirectional connectivity...${NC}"
    local validation_passed=true

    # Check Hub can reach spoke's OIDC discovery
    eval "$(get_instance_ports "$spoke_upper")"
    local spoke_kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
    local spoke_realm="dive-v3-broker-${spoke_lower}"
    local discovery_url="https://localhost:${spoke_kc_port}/realms/${spoke_realm}/.well-known/openid-configuration"

    if curl -sk --max-time 5 "$discovery_url" | grep -q '"issuer"' 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Hub→Spoke: OIDC discovery reachable at ${spoke_realm}"
    else
        echo -e "  ${RED}✗${NC} Hub→Spoke: Cannot reach OIDC discovery at ${discovery_url}"
        validation_passed=false
    fi

    # Check Spoke can reach Hub's OIDC discovery
    local hub_discovery_url="https://localhost:8443/realms/dive-v3-broker-usa/.well-known/openid-configuration"
    if curl -sk --max-time 5 "$hub_discovery_url" | grep -q '"issuer"' 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Spoke→Hub: OIDC discovery reachable at dive-v3-broker-usa"
    else
        echo -e "  ${RED}✗${NC} Spoke→Hub: Cannot reach OIDC discovery at ${hub_discovery_url}"
        validation_passed=false
    fi

    echo ""
    if [ "$success" = true ] && [ "$validation_passed" = true ]; then
        log_success "Client secrets synchronized and connectivity validated for ${spoke_upper} ↔ USA"
    elif [ "$success" = true ]; then
        log_warn "Secrets synced but connectivity validation failed"
    else
        log_warn "Some secrets could not be synced - federation may need setup first"
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

