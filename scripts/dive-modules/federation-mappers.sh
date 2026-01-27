#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Federation Mappers Module
# =============================================================================
# Extracted from federation.sh during refactoring for modularity
# Commands: federation mappers list|show|apply|verify
# =============================================================================
# Version: 1.0.0
# Date: 2025-12-23
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Mark this module as loaded
export DIVE_FEDERATION_MAPPERS_LOADED=1

# =============================================================================
# FEDERATION MAPPERS - NATO Nations Protocol Mapper Management
# =============================================================================

federation_mappers_list() {
    ensure_dive_root
    local template_dir="${DIVE_ROOT}/keycloak/mapper-templates/reference/nato-nations"

    echo -e "${RED}${BOLD}⚠️  PII MINIMIZATION WARNING ⚠️${NC}"
    echo -e "${YELLOW}These templates are for REFERENCE ONLY and contain PII.${NC}"
    echo -e "${YELLOW}DO NOT use in production. Use './dive federation mappers apply' instead.${NC}"
    echo ""

    echo -e "${BOLD}NATO Nation Reference Templates (Documentation Only):${NC}"
    echo ""

    if [ ! -d "$template_dir" ]; then
        log_error "Reference templates directory not found: $template_dir"
        return 1
    fi

    echo -e "${CYAN}Nation${NC}                 ${CYAN}ISO${NC}  ${CYAN}Convention${NC}              ${CYAN}Attributes (PII)${NC}"
    echo "─────────────────────  ───  ─────────────────────  ──────────────────────"

    for template in "$template_dir"/*.json; do
        [ "$template" = "$template_dir/_template.json" ] && continue
        [ ! -f "$template" ] && continue

        local nation=$(jq -r '.nation.name' "$template" 2>/dev/null)
        local iso=$(jq -r '.nation.iso3166' "$template" 2>/dev/null)
        local conv=$(jq -r '.nation.attributeConvention' "$template" 2>/dev/null)
        local surname=$(jq -r '.attributes.profile.surname' "$template" 2>/dev/null)
        local givenname=$(jq -r '.attributes.profile.givenName' "$template" 2>/dev/null)

        printf "%-22s %-4s %-23s %s/%s\n" "$nation" "$iso" "$conv" "$surname" "$givenname"
    done

    echo ""
    echo -e "${CYAN}Usage:${NC}"
    echo "  ./dive federation mappers show <nation>   # View nation details (reference)"
    echo "  ./dive federation mappers apply           # Apply PII-minimized DIVE mappers"
    echo "  ./dive federation mappers verify          # Check mapper configuration"
    echo ""
}

federation_mappers_show() {
    local nation="${1:-}"
    if [ -z "$nation" ]; then
        log_error "Usage: ./dive federation mappers show <nation>"
        echo ""
        echo "Examples:"
        echo "  ./dive federation mappers show france"
        echo "  ./dive federation mappers show usa"
        echo ""
        return 1
    fi

    ensure_dive_root
    local template_dir="${DIVE_ROOT}/keycloak/mapper-templates/reference/nato-nations"
    local template_file="$template_dir/${nation,,}.json"

    if [ ! -f "$template_file" ]; then
        log_error "Template not found: ${nation}"
        echo ""
        echo "Available nations:"
        ls -1 "$template_dir"/*.json 2>/dev/null | xargs -I{} basename {} .json | grep -v _template | sed 's/^/  /'
        return 1
    fi

    echo -e "${RED}${BOLD}⚠️  PII WARNING: This template contains PII for documentation purposes only${NC}"
    echo ""

    echo -e "${BOLD}Nation: $(jq -r '.nation.name' "$template_file")${NC}"
    echo ""

    echo -e "${CYAN}Nation Details:${NC}"
    jq '.nation' "$template_file"
    echo ""

    echo -e "${CYAN}Standard DIVE Attributes (Required):${NC}"
    jq '.attributes.dive' "$template_file"
    echo ""

    echo -e "${CYAN}Profile Attributes (PII - Reference Only):${NC}"
    jq '.attributes.profile' "$template_file"
    echo ""

    echo -e "${CYAN}Notes:${NC}"
    jq -r '.notes[]' "$template_file" 2>/dev/null | sed 's/^/  - /'
    echo ""
}

federation_mappers_apply() {
    ensure_dive_root
    local instance_lower=$(lower "$INSTANCE")
    local instance_upper=$(upper "$INSTANCE")

    log_step "Applying PII-minimized DIVE mappers to $instance_upper Keycloak"
    echo ""
    echo -e "${GREEN}Using production template with 4 core claims only:${NC}"
    echo "  • uniqueID (required)"
    echo "  • clearance (required)"
    echo "  • countryOfAffiliation (required)"
    echo "  • acpCOI (optional)"
    echo ""

    # Production template location
    local template_file="${DIVE_ROOT}/keycloak/mapper-templates/production/dive-pii-minimized-mappers.json"

    if [ ! -f "$template_file" ]; then
        log_error "Production mapper template not found: $template_file"
        return 1
    fi

    # Determine Keycloak URL based on instance
    local keycloak_url="localhost:8443"
    case "$instance_lower" in
        fra) keycloak_url="localhost:8447" ;;
        gbr) keycloak_url="localhost:8446" ;;
        deu) keycloak_url="localhost:8448" ;;
    esac

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would apply mappers from: $template_file"
        log_dry "Would update client: dive-v3-broker-${instance_lower}"
        log_dry "Would configure 4 PII-minimized claims"
        return 0
    fi

    # Get admin password
    local env_file="${DIVE_ROOT}/instances/${instance_lower}/.env"
    if [ ! -f "$env_file" ]; then
        log_error "Instance environment file not found: $env_file"
        return 1
    fi

    source "$env_file"
    local password_var="KEYCLOAK_ADMIN_PASSWORD_${instance_upper}"
    local admin_pass="${!password_var:-$KEYCLOAK_ADMIN_PASSWORD}"

    if [ -z "$admin_pass" ]; then
        log_error "KEYCLOAK_ADMIN_PASSWORD or KEYCLOAK_ADMIN_PASSWORD_${instance_upper} not found in $env_file"
        return 1
    fi

    # Authenticate
    local token=$(curl -sk -X POST "https://${keycloak_url}/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

    if [ "$token" = "null" ] || [ -z "$token" ]; then
        log_error "Failed to authenticate with Keycloak"
        return 1
    fi

    local realm="dive-v3-broker-usa"
    [ "$instance_lower" != "usa" ] && realm="dive-v3-broker-${instance_lower}"

    # Use the instance-specific broker client (not the deprecated cross-border-client)
    local client_id="dive-v3-broker-${instance_lower}"

    # Get client UUID
    local client_uuid=$(curl -sk -H "Authorization: Bearer $token" \
        "https://${keycloak_url}/admin/realms/${realm}/clients?clientId=$client_id" 2>/dev/null \
        | jq -r '.[0].id')

    if [ "$client_uuid" = "null" ] || [ -z "$client_uuid" ]; then
        log_error "Client not found: $client_id"
        return 1
    fi

    # Apply mappers from production template
    local mappers=$(jq '.protocolMappers' "$template_file")
    local mapper_count=$(echo "$mappers" | jq 'length')

    log_info "Applying $mapper_count PII-minimized mappers..."

    local success_count=0
    for i in $(seq 0 $((mapper_count - 1))); do
        local mapper=$(echo "$mappers" | jq ".[$i]")
        local mapper_name=$(echo "$mapper" | jq -r '.name')

        # Check if mapper exists
        local existing=$(curl -sk -H "Authorization: Bearer $token" \
            "https://${keycloak_url}/admin/realms/${realm}/clients/$client_uuid/protocol-mappers/models" 2>/dev/null | \
            jq -r --arg name "$mapper_name" '.[] | select(.name==$name) | .id')

        if [ -n "$existing" ] && [ "$existing" != "null" ]; then
            # Update existing
            curl -sk -X PUT \
                -H "Authorization: Bearer $token" \
                -H "Content-Type: application/json" \
                "https://${keycloak_url}/admin/realms/${realm}/clients/$client_uuid/protocol-mappers/models/$existing" \
                -d "$mapper" >/dev/null 2>&1
            echo -e "  ${GREEN}✓${NC} Updated: $mapper_name"
        else
            # Create new
            curl -sk -X POST \
                -H "Authorization: Bearer $token" \
                -H "Content-Type: application/json" \
                "https://${keycloak_url}/admin/realms/${realm}/clients/$client_uuid/protocol-mappers/models" \
                -d "$mapper" >/dev/null 2>&1
            echo -e "  ${GREEN}✓${NC} Created: $mapper_name"
        fi
        ((success_count++))
    done

    echo ""
    log_success "Applied $success_count PII-minimized mappers successfully!"
    echo ""
    echo "Next: Verify with './dive federation mappers verify'"
}

federation_mappers_verify() {
    ensure_dive_root
    local instance_lower=$(lower "$INSTANCE")
    local instance_upper=$(upper "$INSTANCE")

    log_step "Verifying PII-minimized DIVE mappers on $instance_upper Keycloak"

    # Determine Keycloak URL based on instance
    local keycloak_url="localhost:8443"
    case "$instance_lower" in
        fra) keycloak_url="localhost:8447" ;;
        gbr) keycloak_url="localhost:8446" ;;
        deu) keycloak_url="localhost:8448" ;;
    esac

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would check mappers on client: dive-v3-broker-${instance_lower}"
        log_dry "Would verify 4 required DIVE claims are present"
        log_dry "Would check optional pseudonym fields if present"
        return 0
    fi

    # Get admin password
    local env_file="${DIVE_ROOT}/instances/${instance_lower}/.env"
    if [ ! -f "$env_file" ]; then
        log_error "Instance environment file not found: $env_file"
        return 1
    fi

    source "$env_file"
    local password_var="KEYCLOAK_ADMIN_PASSWORD_${instance_upper}"
    local admin_pass="${!password_var:-$KEYCLOAK_ADMIN_PASSWORD}"

    if [ -z "$admin_pass" ]; then
        log_error "KEYCLOAK_ADMIN_PASSWORD or KEYCLOAK_ADMIN_PASSWORD_${instance_upper} not found in $env_file"
        return 1
    fi

    # Authenticate and get client mappers
    local token=$(curl -sk -X POST "https://${keycloak_url}/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

    if [ "$token" = "null" ] || [ -z "$token" ]; then
        log_error "Failed to authenticate with Keycloak"
        return 1
    fi

    local realm="dive-v3-broker-usa"
    [ "$instance_lower" != "usa" ] && realm="dive-v3-broker-${instance_lower}"

    # Use instance-specific broker client
    local client_id="dive-v3-broker-${instance_lower}"

    # Get client ID
    local client_uuid=$(curl -sk -H "Authorization: Bearer $token" \
        "https://${keycloak_url}/admin/realms/${realm}/clients?clientId=${client_id}" 2>/dev/null \
        | jq -r '.[0].id')

    if [ "$client_uuid" = "null" ] || [ -z "$client_uuid" ]; then
        log_error "Client not found: ${client_id}"
        return 1
    fi

    # Get mappers
    local mappers=$(curl -sk -H "Authorization: Bearer $token" \
        "https://${keycloak_url}/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" 2>/dev/null)

    echo ""
    echo -e "${CYAN}Required DIVE Claims (PII-Minimized):${NC}"

    local required=("uniqueID" "clearance" "countryOfAffiliation" "acpCOI")
    local found=0

    for mapper in "${required[@]}"; do
        if echo "$mappers" | jq -e ".[] | select(.name==\"$mapper\")" >/dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $mapper"
            ((found++))
        else
            echo -e "  ${RED}✗${NC} $mapper (missing)"
        fi
    done

    echo ""
    echo -e "${CYAN}Optional Claims (if backend generates):${NC}"

    local optional=("pseudonym" "pseudonymousIdentifier")
    for mapper in "${optional[@]}"; do
        if echo "$mappers" | jq -e ".[] | select(.name==\"$mapper\")" >/dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $mapper (optional)"
        else
            echo -e "  ${GRAY}−${NC} $mapper (not present - OK)"
        fi
    done

    echo ""
    echo -e "${CYAN}PII Minimization Check:${NC}"

    local pii_fields=("family_name" "given_name" "email" "nationalId" "name" "phone_number")
    local pii_found=false

    for field in "${pii_fields[@]}"; do
        if echo "$mappers" | jq -e ".[] | select(.name==\"$field\")" >/dev/null 2>&1; then
            echo -e "  ${RED}✗${NC} $field (PII VIOLATION!)"
            pii_found=true
        fi
    done

    if [ "$pii_found" = false ]; then
        echo -e "  ${GREEN}✓${NC} No PII fields detected"
    fi

    echo ""
    if [ $found -eq 4 ] && [ "$pii_found" = false ]; then
        log_success "All required mappers verified! PII minimization enforced."
    elif [ $found -eq 4 ]; then
        log_warn "Required mappers present but PII fields detected. Remove PII mappers!"
    else
        log_warn "Found $found/4 required mappers. Run './dive federation mappers apply' to fix."
    fi
}

federation_mappers_help() {
    echo -e "${BOLD}Federation Mapper Commands:${NC}"
    echo ""
    echo "Manage DIVE protocol mappers with PII minimization enforcement."
    echo ""
    echo -e "${GREEN}Production Commands (PII-Minimized):${NC}"
    echo "  ${CYAN}apply${NC}                Apply 4 core DIVE claims (uniqueID, clearance,"
    echo "                       countryOfAffiliation, acpCOI) - NO PII"
    echo "  ${CYAN}verify${NC}               Verify required mappers + check for PII violations"
    echo ""
    echo -e "${YELLOW}Reference Commands (Documentation Only - Contains PII):${NC}"
    echo "  ${CYAN}list${NC}                 List NATO nation reference templates (PII warning)"
    echo "  ${CYAN}show${NC} <nation>        Show nation mapper details (PII warning)"
    echo ""
    echo "Examples:"
    echo "  ${GRAY}# Apply PII-minimized mappers to current instance${NC}"
    echo "  ./dive federation mappers apply"
    echo ""
    echo "  ${GRAY}# Apply to FRA instance${NC}"
    echo "  ./dive --instance fra federation mappers apply"
    echo ""
    echo "  ${GRAY}# Verify mappers and check for PII violations${NC}"
    echo "  ./dive federation mappers verify"
    echo ""
    echo "  ${GRAY}# View reference templates (educational only)${NC}"
    echo "  ./dive federation mappers list"
    echo "  ./dive federation mappers show france"
    echo ""
    echo -e "${BOLD}⚠️  PII MINIMIZATION POLICY:${NC}"
    echo ""
    echo "  Production systems use ONLY 4 core claims:"
    echo "    • uniqueID (required)"
    echo "    • clearance (required)"
    echo "    • countryOfAffiliation (required)"
    echo "    • acpCOI (optional)"
    echo ""
    echo "  NO real names, emails, or national IDs in JWT tokens!"
    echo "  Display names are auto-generated pseudonyms by backend."
    echo ""
    echo "Documentation:"
    echo "  PII_MINIMIZATION_POLICY.md           - Complete policy"
    echo "  keycloak/mapper-templates/production/README.md"
    echo ""
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

federation_mappers_dispatch() {
    local subcommand="${1:-help}"
    shift || true

    case "$subcommand" in
        list)    federation_mappers_list ;;
        show)    federation_mappers_show "$@" ;;
        apply)   federation_mappers_apply "$@" ;;
        verify)  federation_mappers_verify "$@" ;;
        help|*)  federation_mappers_help ;;
    esac
}

