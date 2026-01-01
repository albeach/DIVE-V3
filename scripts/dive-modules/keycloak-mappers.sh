#!/usr/local/bin/bash
# =============================================================================
# Keycloak Mapper Utilities - Resilient Mapper Management
# =============================================================================
# Provides idempotent mapper creation/update functions for DIVE CLI
# Handles both IdP mappers and protocol mappers with proper error handling
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1" >&2; }
log_success() { echo -e "${GREEN}✓${NC} $1" >&2; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1" >&2; }
log_error() { echo -e "${RED}✗${NC} $1" >&2; }

##
# Create or update an IdP mapper (idempotent)
# Properly checks existence before attempting update
##
upsert_idp_mapper() {
    local kc_container="$1"
    local token="$2"
    local realm="$3"
    local idp_alias="$4"
    local mapper_name="$5"
    local claim_name="$6"
    local user_attr="$7"
    local sync_mode="${8:-FORCE}"

    if [ -z "$kc_container" ] || [ -z "$token" ] || [ -z "$realm" ] || [ -z "$idp_alias" ] || [ -z "$mapper_name" ]; then
        log_error "Missing required parameters for upsert_idp_mapper"
        return 1
    fi

    # Check if mapper exists
    local existing_id
    existing_id=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $token" \
        "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/${idp_alias}/mappers" 2>/dev/null | \
        jq -r --arg name "$mapper_name" '.[] | select(.name==$name) | .id // empty' 2>/dev/null)

    local mapper_config
    mapper_config=$(cat <<EOF
{
    "name": "${mapper_name}",
    "identityProviderAlias": "${idp_alias}",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
        "claim": "${claim_name}",
        "user.attribute": "${user_attr}",
        "syncMode": "${sync_mode}"
    }
}
EOF
)

    if [ -n "$existing_id" ]; then
        # Update existing mapper
        local result
        result=$(docker exec "$kc_container" curl -sf -o /dev/null -w "%{http_code}" \
            -X PUT "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/${idp_alias}/mappers/${existing_id}" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$mapper_config" 2>/dev/null)

        if [ "$result" = "204" ] || [ "$result" = "200" ]; then
            log_success "Updated IdP mapper: ${mapper_name}"
            return 0
        else
            log_warn "IdP mapper update returned ${result}: ${mapper_name}"
            return 0  # Non-blocking
        fi
    else
        # Create new mapper
        local result
        result=$(docker exec "$kc_container" curl -sf -o /dev/null -w "%{http_code}" \
            -X POST "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/${idp_alias}/mappers" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$mapper_config" 2>/dev/null)

        if [ "$result" = "201" ]; then
            log_success "Created IdP mapper: ${mapper_name}"
            return 0
        else
            log_warn "IdP mapper creation returned ${result}: ${mapper_name}"
            return 0  # Non-blocking
        fi
    fi
}

##
# Create or update a protocol mapper (idempotent)
# Properly checks existence before attempting update
##
upsert_protocol_mapper() {
    local kc_container="$1"
    local token="$2"
    local realm="$3"
    local client_id="$4"
    local mapper_name="$5"
    local claim_name="$6"
    local user_attr="$7"
    local claim_type="${8:-String}"

    if [ -z "$kc_container" ] || [ -z "$token" ] || [ -z "$realm" ] || [ -z "$client_id" ] || [ -z "$mapper_name" ]; then
        log_error "Missing required parameters for upsert_protocol_mapper"
        return 1
    fi

    # Get client's internal UUID
    local client_uuid
    client_uuid=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $token" \
        "http://localhost:8080/admin/realms/${realm}/clients?clientId=${client_id}" 2>/dev/null | \
        jq -r '.[0].id // empty' 2>/dev/null)

    if [ -z "$client_uuid" ]; then
        log_error "Client not found: ${client_id}"
        return 1
    fi

    # Check if mapper exists
    local existing_id
    existing_id=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $token" \
        "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" 2>/dev/null | \
        jq -r --arg name "$mapper_name" '.[] | select(.name==$name) | .id // empty' 2>/dev/null)

    local mapper_config
    mapper_config=$(cat <<EOF
{
    "name": "${mapper_name}",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-attribute-mapper",
    "config": {
        "user.attribute": "${user_attr}",
        "claim.name": "${claim_name}",
        "jsonType.label": "${claim_type}",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true"
    }
}
EOF
)

    if [ -n "$existing_id" ]; then
        # Update existing mapper
        local result
        result=$(docker exec "$kc_container" curl -sf -o /dev/null -w "%{http_code}" \
            -X PUT "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models/${existing_id}" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$mapper_config" 2>/dev/null)

        if [ "$result" = "204" ] || [ "$result" = "200" ]; then
            log_success "Updated protocol mapper: ${mapper_name}"
            return 0
        else
            log_warn "Protocol mapper update returned ${result}: ${mapper_name}"
            return 0  # Non-blocking
        fi
    else
        # Create new mapper
        local result
        result=$(docker exec "$kc_container" curl -sf -o /dev/null -w "%{http_code}" \
            -X POST "http://localhost:8080/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
            -H "Authorization: Bearer $token" \
            -H "Content-Type: application/json" \
            -d "$mapper_config" 2>/dev/null)

        if [ "$result" = "201" ]; then
            log_success "Created protocol mapper: ${mapper_name}"
            return 0
        else
            log_warn "Protocol mapper creation returned ${result}: ${mapper_name}"
            return 0  # Non-blocking
        fi
    fi
}

##
# Batch create/update IdP mappers
##
upsert_idp_mappers_batch() {
    local kc_container="$1"
    local token="$2"
    local realm="$3"
    local idp_alias="$4"
    shift 4
    local mappers=("$@")  # Array of mapper definitions: "name:claim:attr"

    local success=0
    local failed=0

    for mapper_def in "${mappers[@]}"; do
        IFS=':' read -r mapper_name claim_name user_attr <<< "$mapper_def"
        if upsert_idp_mapper "$kc_container" "$token" "$realm" "$idp_alias" "$mapper_name" "$claim_name" "$user_attr"; then
            success=$((success + 1))
        else
            failed=$((failed + 1))
        fi
    done

    log_info "IdP mappers: ${success} successful, ${failed} failed"
    return 0
}

##
# Batch create/update protocol mappers
##
upsert_protocol_mappers_batch() {
    local kc_container="$1"
    local token="$2"
    local realm="$3"
    local client_id="$4"
    shift 4
    local mappers=("$@")  # Array of mapper definitions: "name:claim:attr:type"

    local success=0
    local failed=0

    for mapper_def in "${mappers[@]}"; do
        IFS=':' read -r mapper_name claim_name user_attr claim_type <<< "$mapper_def"
        claim_type="${claim_type:-String}"
        if upsert_protocol_mapper "$kc_container" "$token" "$realm" "$client_id" "$mapper_name" "$claim_name" "$user_attr" "$claim_type"; then
            success=$((success + 1))
        else
            failed=$((failed + 1))
        fi
    done

    log_info "Protocol mappers: ${success} successful, ${failed} failed"
    return 0
}

# Export functions for use in other scripts
export -f upsert_idp_mapper
export -f upsert_protocol_mapper
export -f upsert_idp_mappers_batch
export -f upsert_protocol_mappers_batch
