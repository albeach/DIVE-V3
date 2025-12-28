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
    local target_pass=$(docker exec "$target_kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    if [ -z "$target_pass" ]; then
        log_error "Cannot get Keycloak password for $target_upper"
        return 1
    fi

    local token=$(docker exec "$target_kc_container" curl -sf \
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

    local source_pass=$(docker exec "$source_kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    local source_token=$(docker exec "$source_kc_container" curl -sf \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" -d "username=admin" -d "password=${source_pass}" \
        -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    # Get client secret
    local client_uuid=$(docker exec "$source_kc_container" curl -sf \
        -H "Authorization: Bearer $source_token" \
        "http://localhost:8080/admin/realms/${source_realm}/clients?clientId=${federation_client_id}" 2>/dev/null | \
        grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

    local client_secret=""
    if [ -n "$client_uuid" ]; then
        client_secret=$(docker exec "$source_kc_container" curl -sf \
            -H "Authorization: Bearer $source_token" \
            "http://localhost:8080/admin/realms/${source_realm}/clients/${client_uuid}/client-secret" 2>/dev/null | \
            grep -o '"value":"[^"]*' | cut -d'"' -f4)
    fi

    # If client doesn't exist, create it
    if [ -z "$client_uuid" ] || [ -z "$client_secret" ]; then
        log_info "Creating federation client: ${federation_client_id}"
        client_secret=$(openssl rand -base64 24 | tr -d '/+=' 2>/dev/null)

        local new_client_config="{
            \"clientId\": \"${federation_client_id}\",
            \"name\": \"${target_upper} Federation Client\",
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

        docker exec "$source_kc_container" curl -sf \
            -X POST "http://localhost:8080/admin/realms/${source_realm}/clients" \
            -H "Authorization: Bearer $source_token" \
            -H "Content-Type: application/json" \
            -d "$new_client_config" 2>&1

        log_success "Created federation client: ${federation_client_id}"
    fi

    # Generate fallback secret if needed
    if [ -z "$client_secret" ]; then
        client_secret=$(openssl rand -base64 24 | tr -d '/+=' 2>/dev/null || echo "federation-secret-$(date +%s)")
        log_warn "Using generated secret - may need manual sync"
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
        local client_secret=$(openssl rand -base64 24 | tr -d '/+=' 2>/dev/null)

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
    local_kc_pass=$(docker exec "$local_kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')

    if [ -z "$local_kc_pass" ]; then
        echo -e "${RED}✗ FAIL${NC} (Cannot access Keycloak)"
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
    remote_kc_pass=$(docker exec "$remote_kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')

    if [ -z "$remote_kc_pass" ]; then
        echo -e "${RED}✗ FAIL${NC} (Cannot access Keycloak)"
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

    # Create IdP mappers for claim passthrough
    local mappers=("clearance" "countryOfAffiliation" "uniqueID" "acpCOI")

    # Configure mappers for remote-idp in local realm
    for mapper in "${mappers[@]}"; do
        local existing
        existing=$(docker exec "$local_kc_container" curl -sk \
            "https://localhost:8443/admin/realms/${local_realm}/identity-provider/instances/${remote_lower}-idp/mappers" \
            -H "Authorization: Bearer ${local_token}" 2>/dev/null | jq -r ".[] | select(.name==\"${mapper}\") | .name // empty" 2>/dev/null)

        if [ -z "$existing" ]; then
            docker exec "$local_kc_container" curl -sk -o /dev/null \
                -X POST "https://localhost:8443/admin/realms/${local_realm}/identity-provider/instances/${remote_lower}-idp/mappers" \
                -H "Authorization: Bearer ${local_token}" \
                -H "Content-Type: application/json" \
                -d "{\"name\": \"${mapper}\", \"identityProviderMapper\": \"oidc-user-attribute-idp-mapper\", \"identityProviderAlias\": \"${remote_lower}-idp\", \"config\": {\"claim\": \"${mapper}\", \"user.attribute\": \"${mapper}\", \"syncMode\": \"FORCE\"}}" 2>/dev/null
        fi
    done
    echo -e "  ${GREEN}✓${NC} IdP mappers configured for ${remote_lower}-idp in ${local_code}"

    # Configure mappers for local-idp in remote realm
    for mapper in "${mappers[@]}"; do
        local existing
        existing=$(docker exec "$remote_kc_container" curl -sk \
            "https://localhost:8443/admin/realms/${remote_realm}/identity-provider/instances/${local_lower}-idp/mappers" \
            -H "Authorization: Bearer ${remote_token}" 2>/dev/null | jq -r ".[] | select(.name==\"${mapper}\") | .name // empty" 2>/dev/null)

        if [ -z "$existing" ]; then
            docker exec "$remote_kc_container" curl -sk -o /dev/null \
                -X POST "https://localhost:8443/admin/realms/${remote_realm}/identity-provider/instances/${local_lower}-idp/mappers" \
                -H "Authorization: Bearer ${remote_token}" \
                -H "Content-Type: application/json" \
                -d "{\"name\": \"${mapper}\", \"identityProviderMapper\": \"oidc-user-attribute-idp-mapper\", \"identityProviderAlias\": \"${local_lower}-idp\", \"config\": {\"claim\": \"${mapper}\", \"user.attribute\": \"${mapper}\", \"syncMode\": \"FORCE\"}}" 2>/dev/null
        fi
    done
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

