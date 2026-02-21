#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Federation Mappers & Client Management
# =============================================================================
# Extracted from federation/setup.sh (Phase 13d)
# Updated (Phase 1 External Federation): All docker exec calls replaced with
# keycloak_admin_api() for cross-network support.
#
# API change: $1 is now instance_code (e.g., "USA", "GBR") instead of
# container name. The keycloak_admin_api() layer handles local vs remote routing.
#
# Contains: _ensure_federation_client, _ensure_federation_client_mappers,
#   _create_amr_acr_mappers, _create_protocol_mapper, _configure_idp_mappers,
#   _create_idp_mapper
# =============================================================================

[ -n "${FEDERATION_MAPPERS_LOADED:-}" ] && return 0

# =============================================================================
# FEDERATION CLIENT MANAGEMENT
# =============================================================================

##
# Ensure a federation client exists in a realm
#
# Arguments:
#   $1 - Instance code (e.g., USA, GBR) — target where client is created
#   $2 - Admin token
#   $3 - Realm name
#   $4 - Partner code (lowercase)
#   $5 - Partner code (uppercase)
##
_ensure_federation_client() {
    local instance_code="$1"
    local token="$2"
    local realm="$3"
    local partner_lower="$4"
    local partner_upper="$5"

    local client_id="dive-v3-broker-${partner_lower}"

    echo -n "  Checking ${client_id} in ${realm}... "

    local existing
    existing=$(keycloak_admin_api "$instance_code" "GET" \
        "realms/${realm}/clients?clientId=${client_id}" 2>/dev/null | \
        grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

    if [ -n "$existing" ]; then
        echo -e "${GREEN}exists${NC}"
    else
        echo -n "creating... "

        local client_secret
        client_secret=$(_get_federation_secret "$realm" "$partner_lower")

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

        keycloak_admin_api "$instance_code" "POST" \
            "realms/${realm}/clients" "$client_config" 2>/dev/null

        echo -e "${GREEN}created${NC}"
    fi

    _ensure_federation_client_mappers "$instance_code" "$token" "$realm" "$client_id"
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
#
# Arguments:
#   $1 - Instance code (e.g., USA, GBR)
#   $2 - Admin token (unused — keycloak_admin_api manages tokens)
#   $3 - Realm name
#   $4 - Client ID
##
_ensure_federation_client_mappers() {
    # Skip if Terraform is SSOT
    if [ "${USE_TERRAFORM_SSOT:-false}" = "true" ]; then
        log_verbose "Skipping protocol mappers (Terraform SSOT enabled)"
        return 0
    fi

    local instance_code="$1"
    local token="$2"
    local realm="$3"
    local client_id="$4"

    # Get client UUID
    local client_uuid
    client_uuid=$(keycloak_admin_api "$instance_code" "GET" \
        "realms/${realm}/clients?clientId=${client_id}" 2>/dev/null | \
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
    local realm_code
    realm_code=$(upper "${realm##*-}")
    local locale_config="${DIVE_ROOT}/config/locale-mappings.conf"
    if [ -f "$locale_config" ]; then
        local mapping_line
        mapping_line=$(grep "^${realm_code}|" "$locale_config" 2>/dev/null || true)
        if [ -n "$mapping_line" ]; then
            # Parse pipe-delimited fields: CODE|src:claim|src:claim|...
            IFS='|' read -ra fields <<< "$mapping_line"
            local i
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
        _create_protocol_mapper "$instance_code" "$token" "$realm" "$client_uuid" "$attr" "$attr" "federation-std-${attr}" "$multivalued"
        ((mapper_count++))
    done

    # Create mappers for localized attributes
    for mapping in "${localized_attrs[@]}"; do
        local source_attr="${mapping%%:*}"
        local claim_name="${mapping##*:}"
        local multivalued="false"
        [ "$claim_name" = "acpCOI" ] && multivalued="true"
        _create_protocol_mapper "$instance_code" "$token" "$realm" "$client_uuid" "$source_attr" "$claim_name" "federation-${source_attr}" "$multivalued"
        ((mapper_count++))
    done

    # Add AMR/ACR protocol mappers for MFA state propagation
    _create_amr_acr_mappers "$instance_code" "$token" "$realm" "$client_uuid"
    ((mapper_count += 2))

    echo -e "${GREEN}${mapper_count} mappers${NC}"
}

##
# Create AMR/ACR protocol mappers on a client
# These read from the authentication session (not user attributes)
#
# Arguments:
#   $1 - Instance code (e.g., USA, GBR)
#   $2 - Admin token (unused)
#   $3 - Realm name
#   $4 - Client UUID
##
_create_amr_acr_mappers() {
    local instance_code="$1"
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

    local existing_amr
    existing_amr=$(keycloak_admin_api "$instance_code" "GET" \
        "realms/${realm}/clients/${client_uuid}/protocol-mappers/models" 2>/dev/null | \
        jq -r --arg name "$amr_mapper_name" '.[] | select(.name==$name) | .id // empty' 2>/dev/null)

    if [ -n "$existing_amr" ]; then
        keycloak_admin_api "$instance_code" "PUT" \
            "realms/${realm}/clients/${client_uuid}/protocol-mappers/models/${existing_amr}" \
            "$amr_mapper_config" >/dev/null 2>&1
    else
        keycloak_admin_api "$instance_code" "POST" \
            "realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
            "$amr_mapper_config" >/dev/null 2>&1
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

    local existing_acr
    existing_acr=$(keycloak_admin_api "$instance_code" "GET" \
        "realms/${realm}/clients/${client_uuid}/protocol-mappers/models" 2>/dev/null | \
        jq -r --arg name "$acr_mapper_name" '.[] | select(.name==$name) | .id // empty' 2>/dev/null)

    if [ -n "$existing_acr" ]; then
        keycloak_admin_api "$instance_code" "PUT" \
            "realms/${realm}/clients/${client_uuid}/protocol-mappers/models/${existing_acr}" \
            "$acr_mapper_config" >/dev/null 2>&1
    else
        keycloak_admin_api "$instance_code" "POST" \
            "realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
            "$acr_mapper_config" >/dev/null 2>&1
    fi
}

##
# Create a single protocol mapper on a client
#
# Arguments:
#   $1 - Instance code (e.g., USA, GBR)
#   $2 - Admin token (unused)
#   $3 - Realm name
#   $4 - Client UUID
#   $5 - User attribute name
#   $6 - Claim name
#   $7 - Mapper name
#   $8 - Multivalued (true/false, default: false)
##
_create_protocol_mapper() {
    local instance_code="$1"
    local token="$2"
    local realm="$3"
    local client_uuid="$4"
    local user_attr="$5"
    local claim_name="$6"
    local mapper_name="$7"
    local multivalued="${8:-false}"

    local existing
    existing=$(keycloak_admin_api "$instance_code" "GET" \
        "realms/${realm}/clients/${client_uuid}/protocol-mappers/models" 2>/dev/null | \
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
        keycloak_admin_api "$instance_code" "PUT" \
            "realms/${realm}/clients/${client_uuid}/protocol-mappers/models/${existing}" \
            "$mapper_config" >/dev/null 2>&1
    else
        keycloak_admin_api "$instance_code" "POST" \
            "realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
            "$mapper_config" >/dev/null 2>&1
    fi
}

# =============================================================================
# IDP MAPPER MANAGEMENT
# =============================================================================

##
# Configure IdP claim mappers for importing claims from federated tokens
# These mappers tell Keycloak how to import claims from the remote IdP's
# tokens into local user attributes.
#
# Arguments:
#   $1 - Instance code (e.g., USA, GBR)
#   $2 - Admin token (unused)
#   $3 - Realm name
#   $4 - IdP alias
##
_configure_idp_mappers() {
    local instance_code="$1"
    local token="$2"
    local realm="$3"
    local idp_alias="$4"

    # Standard claim names including AMR/ACR for MFA state propagation
    local claims=("clearance" "countryOfAffiliation" "uniqueID" "acpCOI" "amr" "acr")

    for claim in "${claims[@]}"; do
        _create_idp_mapper "$instance_code" "$token" "$realm" "$idp_alias" "$claim" "$claim" "import-${claim}"
    done
}

##
# Create a single IdP mapper
#
# Arguments:
#   $1 - Instance code (e.g., USA, GBR)
#   $2 - Admin token (unused)
#   $3 - Realm name
#   $4 - IdP alias
#   $5 - Claim name
#   $6 - User attribute name
#   $7 - Mapper name
##
_create_idp_mapper() {
    local instance_code="$1"
    local token="$2"
    local realm="$3"
    local idp_alias="$4"
    local claim_name="$5"
    local user_attr="$6"
    local mapper_name="$7"

    local existing
    existing=$(keycloak_admin_api "$instance_code" "GET" \
        "realms/${realm}/identity-provider/instances/${idp_alias}/mappers" 2>/dev/null | \
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
        keycloak_admin_api "$instance_code" "PUT" \
            "realms/${realm}/identity-provider/instances/${idp_alias}/mappers/${existing}" \
            "$mapper_config" >/dev/null 2>&1 || true
    else
        keycloak_admin_api "$instance_code" "POST" \
            "realms/${realm}/identity-provider/instances/${idp_alias}/mappers" \
            "$mapper_config" >/dev/null 2>&1 || true
    fi
}


export FEDERATION_MAPPERS_LOADED=1
