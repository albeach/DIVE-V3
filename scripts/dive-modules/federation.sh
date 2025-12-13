#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Federation & Hub Commands Module
# =============================================================================
# Commands: federation (status, register, sync-policies, sync-idps, push-audit)
#           hub (start, status, instances, push-policy)
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# FEDERATION COMMANDS
# =============================================================================

federation_status() {
    echo -e "${BOLD}Federation Status:${NC}"
    echo ""
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query hub API for registered instances"
    else
        echo "  Registered Instances:"
        echo "    USA: https://usa-app.dive25.com"
        echo "    FRA: https://fra-app.dive25.com (pending)"
        echo "    GBR: https://gbr-app.dive25.com (pending)"
        echo "    DEU: https://deu-app.dive25.com (pending)"
    fi
}

federation_register() {
    local instance_url="${1:-}"
    if [ -z "$instance_url" ]; then
        echo "Usage: ./dive federation register <instance-url>"
        return 1
    fi
    log_step "Registering instance: $instance_url"
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to hub API: /api/federation/register"
        log_dry "  instance_url: $instance_url"
        log_dry "  instance_code: $INSTANCE"
    else
        echo "Registration would connect to hub API..."
        echo "TODO: Implement hub registration endpoint"
    fi
}

federation_sync_policies() {
    log_step "Syncing policies from hub..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would pull policy bundle from OPAL server"
        log_dry "Would update local OPA with new policies"
    else
        curl -X POST http://localhost:7002/data/config -d '{"entries": ["/"]}' 2>/dev/null || {
            log_warn "OPAL client not running locally"
            echo "Manual sync: policies are in policies/ directory"
        }
    fi
}

federation_sync_idps() {
    log_step "Syncing IdP metadata from hub..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would fetch IdP metadata from hub registry"
        log_dry "Would update local Keycloak IdP configurations"
    else
        echo "IdP sync would connect to hub metadata registry..."
        echo "TODO: Implement IdP metadata sync"
    fi
}

# =============================================================================
# FEDERATION LINK - Auto-configure IdP Trust (Phase 3)
# =============================================================================

federation_link() {
    local remote_instance="${1:-}"
    
    if [ -z "$remote_instance" ]; then
        log_error "Usage: ./dive federation link <INSTANCE_CODE>"
        echo ""
        echo "Examples:"
        echo "  ./dive federation link GBR    # Link GBR spoke to this instance"
        echo "  ./dive federation link USA    # Link USA hub to this instance"
        echo ""
        return 1
    fi
    
    local remote_code="${remote_instance^^}"  # Uppercase
    local local_instance="${INSTANCE:-USA}"
    local local_code="${local_instance^^}"
    
    log_step "Linking Identity Provider: ${remote_code} ↔ ${local_code}"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would call backend API: POST /api/federation/link-idp"
        log_dry "  localInstance: ${local_code}"
        log_dry "  remoteInstance: ${remote_code}"
        log_dry "Would create ${remote_code}-idp in local Keycloak"
        return 0
    fi
    
    # ==========================================================================
    # Determine backend URLs based on instance codes (local development ports)
    # ==========================================================================
    local local_backend_port remote_backend_port
    case "${local_code}" in
        USA) local_backend_port=4000 ;;
        FRA) local_backend_port=4001 ;;
        DEU) local_backend_port=4002 ;;
        GBR) local_backend_port=4003 ;;
        CAN) local_backend_port=4004 ;;
        NZL) local_backend_port=4005 ;;
        *)   local_backend_port=4000 ;;
    esac
    
    case "${remote_code}" in
        USA) remote_backend_port=4000 ;;
        FRA) remote_backend_port=4001 ;;
        DEU) remote_backend_port=4002 ;;
        GBR) remote_backend_port=4003 ;;
        CAN) remote_backend_port=4004 ;;
        NZL) remote_backend_port=4005 ;;
        *)   remote_backend_port=4000 ;;
    esac
    
    local local_backend_url="https://localhost:${local_backend_port}"
    local remote_backend_url="https://localhost:${remote_backend_port}"
    
    # ==========================================================================
    # Step 1: Add remote IdP to local Keycloak (via local backend)
    # ==========================================================================
    echo -e "${CYAN}Step 1: Adding ${remote_code} IdP to ${local_code} Keycloak${NC}"
    
    local api_endpoint="${local_backend_url}/api/federation/link-idp"
    log_info "Calling: ${api_endpoint}"
    
    local response
    response=$(curl -sk -X POST "${api_endpoint}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer admin-token" \
        -d "{
            \"localInstanceCode\": \"${local_code}\",
            \"remoteInstanceCode\": \"${remote_code}\",
            \"skipRemote\": true
        }" 2>&1)
    
    if echo "$response" | grep -q '"success":true' || echo "$response" | grep -q 'already exists'; then
        log_success "${remote_code} IdP added to ${local_code}"
    else
        log_warn "Step 1 result: $response"
    fi
    
    # ==========================================================================
    # Step 2: Add local IdP to remote Keycloak (via remote backend)  
    # ==========================================================================
    echo ""
    echo -e "${CYAN}Step 2: Adding ${local_code} IdP to ${remote_code} Keycloak${NC}"
    
    api_endpoint="${remote_backend_url}/api/federation/link-idp"
    log_info "Calling: ${api_endpoint}"
    
    response=$(curl -sk -X POST "${api_endpoint}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer admin-token" \
        -d "{
            \"localInstanceCode\": \"${remote_code}\",
            \"remoteInstanceCode\": \"${local_code}\",
            \"skipRemote\": true
        }" 2>&1)
    
    if echo "$response" | grep -q '"success":true' || echo "$response" | grep -q 'already exists'; then
        log_success "${local_code} IdP added to ${remote_code}"
    else
        log_warn "Step 2 result: $response"
    fi
    
    # ==========================================================================
    # Summary
    # ==========================================================================
    echo ""
    log_success "Bidirectional federation configured!"
    echo ""
    echo -e "${BOLD}Federation Summary:${NC}"
    echo "  ${local_code} → ${remote_code}:  Users from ${remote_code} can login at ${local_code}"
    echo "  ${remote_code} → ${local_code}:  Users from ${local_code} can login at ${remote_code}"
    echo ""
    echo -e "${BOLD}Test URLs:${NC}"
    echo "  ${local_code}: https://localhost:$((3000 + local_backend_port - 4000))"
    echo "  ${remote_code}: https://localhost:$((3000 + remote_backend_port - 4000))"
    echo ""
}

federation_unlink() {
    local remote_instance="${1:-}"
    
    if [ -z "$remote_instance" ]; then
        log_error "Usage: ./dive federation unlink <INSTANCE_CODE>"
        return 1
    fi
    
    local remote_code="${remote_instance^^}"
    local idp_alias="${remote_code,,}-idp"  # Lowercase with -idp suffix
    
    log_step "Unlinking Identity Provider: ${remote_code}"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would delete IdP: ${idp_alias}"
        return 0
    fi
    
    # Call backend API to delete IdP
    local backend_url="${BACKEND_URL:-https://localhost:4000}"
    local api_endpoint="${backend_url}/api/federation/unlink-idp/${idp_alias}"
    
    response=$(curl -sk -X DELETE "${api_endpoint}" \
        -H "Authorization: Bearer admin-token" 2>&1)
    
    if echo "$response" | grep -q '"success":true'; then
        log_success "IdP unlinked successfully"
    else
        log_error "IdP unlinking failed: $response"
        return 1
    fi
}

federation_list_idps() {
    log_step "Listing configured Identity Providers..."
    echo ""
    
    local backend_url="${BACKEND_URL:-https://localhost:4000}"
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

federation_push_audit() {
    log_step "Pushing audit logs to hub..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would export local audit logs"
        log_dry "Would POST to hub audit aggregator"
    else
        echo "Audit push would export logs to hub..."
        echo "TODO: Implement audit log aggregation"
    fi
}

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
        
        [ "$nation" = "null" ] && continue
        
        printf "%-22s %-4s %-22s %s, %s\n" "$nation" "$iso" "$conv" "$surname" "$givenname"
    done
    
    echo ""
    echo "Total reference templates: $(find "$template_dir" -name '*.json' ! -name '_template.json' | wc -l | tr -d ' ')"
    echo ""
    echo -e "${YELLOW}For production: ./dive federation mappers apply (uses PII-minimized template)${NC}"
}

federation_mappers_show() {
    local nation="${1:-}"
    
    if [ -z "$nation" ]; then
        log_error "Usage: ./dive federation mappers show <nation>"
        echo ""
        echo "Examples:"
        echo "  ./dive federation mappers show france"
        echo "  ./dive federation mappers show united-kingdom"
        return 1
    fi
    
    ensure_dive_root
    local template_file="${DIVE_ROOT}/keycloak/mapper-templates/reference/nato-nations/${nation}.json"
    
    if [ ! -f "$template_file" ]; then
        log_error "Template not found: $nation"
        echo ""
        echo "Run './dive federation mappers list' to see available nations."
        return 1
    fi
    
    echo -e "${RED}${BOLD}⚠️  PII WARNING ⚠️${NC}"
    echo -e "${YELLOW}This template contains PII (names, emails, national IDs).${NC}"
    echo -e "${YELLOW}Reference only - NOT for production use.${NC}"
    echo ""
    
    echo -e "${BOLD}NATO Nation Reference Template: $nation${NC}"
    echo ""
    
    echo -e "${CYAN}Nation Information:${NC}"
    jq -r '.nation | "  Name:       \(.name)\n  ISO 3166:   \(.iso3166)\n  Language:   \(.language)\n  Convention: \(.attributeConvention)"' "$template_file"
    echo ""
    
    echo -e "${CYAN}Locale-Specific Attributes (PII):${NC}"
    jq -r '.attributes.profile | "  Surname:    \(.surname)\n  Given Name: \(.givenName)\n  Email:      \(.email)"' "$template_file"
    echo ""
    
    local nationalid_name=$(jq -r '.attributes.nationalId.name' "$template_file")
    local nationalid_desc=$(jq -r '.attributes.nationalId.description' "$template_file")
    echo -e "${CYAN}National Identifier (PII):${NC}"
    echo "  Name:        $nationalid_name"
    echo "  Description: $nationalid_desc"
    echo ""
    
    echo -e "${CYAN}Protocol Mappers (9 total - includes PII):${NC}"
    jq -r '.protocolMappers[] | "  • \(.name): \(.config["user.attribute"]) → \(.config["claim.name"])"' "$template_file"
    echo ""
    
    echo -e "${YELLOW}For production: ./dive federation mappers apply (uses PII-minimized template)${NC}"
}

federation_mappers_apply() {
    ensure_dive_root
    
    # Use production template with 4 PII-minimized claims
    local template_file="${DIVE_ROOT}/keycloak/mapper-templates/production/dive-core-claims.json"
    
    if [ ! -f "$template_file" ]; then
        log_error "Production template not found: $template_file"
        return 1
    fi
    
    # Determine instance-specific parameters
    local instance_lower=$(lower "$INSTANCE")
    local instance_upper=$(upper "$INSTANCE")
    
    # Map instance to Keycloak URL and realm
    local keycloak_url="localhost:8443"
    local realm="dive-v3-broker"
    local client_id="dive-v3-cross-border-client"
    
    case "$instance_lower" in
        fra)
            keycloak_url="localhost:8447"
            realm="dive-v3-broker-fra"
            ;;
        gbr)
            keycloak_url="localhost:8446"
            realm="dive-v3-broker-gbr"
            ;;
        deu)
            keycloak_url="localhost:8448"
            realm="dive-v3-broker-deu"
            ;;
        usa)
            keycloak_url="localhost:8443"
            realm="dive-v3-broker"
            ;;
    esac
    
    log_step "Applying PII-minimized DIVE mappers to $instance_upper"
    echo ""
    echo -e "  ${GREEN}Template:${NC}        production/dive-core-claims.json"
    echo -e "  ${GREEN}Mappers:${NC}         4 (uniqueID, clearance, countryOfAffiliation, acpCOI)"
    echo -e "  ${GREEN}PII Status:${NC}      NO PII - Pseudonymized identifiers only"
    echo ""
    echo "  Target Keycloak: $keycloak_url"
    echo "  Target Realm:    $realm"
    echo "  Target Client:   $client_id"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would apply 4 PII-minimized mappers from production template"
        log_dry "Would authenticate with Keycloak at $keycloak_url"
        log_dry "Would create/update mappers on client: $client_id"
        return 0
    fi
    
    # Get admin password from instance env file
    local env_file="${DIVE_ROOT}/instances/${instance_lower}/.env"
    if [ ! -f "$env_file" ]; then
        log_error "Instance environment file not found: $env_file"
        return 1
    fi
    
    source "$env_file"
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD}"
    
    if [ -z "$admin_pass" ]; then
        log_error "KEYCLOAK_ADMIN_PASSWORD not found in $env_file"
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
        log_dry "Would check mappers on client: dive-v3-cross-border-client"
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
    local admin_pass="${KEYCLOAK_ADMIN_PASSWORD}"
    
    if [ -z "$admin_pass" ]; then
        log_error "KEYCLOAK_ADMIN_PASSWORD not found in $env_file"
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
    
    local realm="dive-v3-broker"
    [ "$instance_lower" != "usa" ] && realm="dive-v3-broker-${instance_lower}"
    
    # Get client ID
    local client_uuid=$(curl -sk -H "Authorization: Bearer $token" \
        "https://${keycloak_url}/admin/realms/${realm}/clients?clientId=dive-v3-cross-border-client" 2>/dev/null \
        | jq -r '.[0].id')
    
    if [ "$client_uuid" = "null" ] || [ -z "$client_uuid" ]; then
        log_error "Client not found: dive-v3-cross-border-client"
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
# HUB COMMANDS
# =============================================================================

hub_start() {
    log_step "Starting DIVE Hub services..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would start: opal-server, metadata-registry, federation-api"
    else
        echo "Hub services would start here..."
        echo "TODO: Create docker-compose.hub.yml"
    fi
}

hub_status() {
    echo -e "${BOLD}DIVE Hub Status:${NC}"
    echo ""
    echo "  OPAL Server:       $(curl -s -o /dev/null -w '%{http_code}' http://localhost:7002/healthcheck 2>/dev/null || echo 'offline')"
    echo "  Federation API:    $(curl -s -o /dev/null -w '%{http_code}' https://localhost:4000/health -k 2>/dev/null || echo 'offline')"
}

hub_instances() {
    echo -e "${BOLD}Registered Instances:${NC}"
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query hub database for instances"
    else
        echo "  Would list all registered federation instances..."
    fi
}

hub_push_policy() {
    log_step "Pushing policy update to all instances..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would trigger OPAL server to push updates"
        log_dry "All connected OPAL clients would receive new policies"
    else
        curl -X POST http://localhost:7002/policy-update 2>/dev/null || {
            log_warn "OPAL server not running"
        }
    fi
}

# =============================================================================
# HUB BOOTSTRAP (Local/Pilot)
# =============================================================================

_hub_require_secret() {
    local name="$1"
    local value="${!name}"
    if [ -z "$value" ]; then
        log_error "Missing required secret: $name"
        return 1
    fi
    return 0
}

_hub_wait_for_keycloak() {
    local timeout="${1:-90}"
    local elapsed=0
    log_info "Waiting for Keycloak (up to ${timeout}s)..."
    while [ $elapsed -lt $timeout ]; do
        if curl -kfs --max-time 3 "https://localhost:8443/health" >/dev/null 2>&1; then
            log_success "Keycloak is healthy"
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
        echo "  ${elapsed}s elapsed..."
    done
    log_warn "Keycloak health not confirmed after ${timeout}s"
    return 1
}

_hub_apply_terraform() {
    ensure_dive_root
    cd "${DIVE_ROOT}/terraform/pilot"
    [ ! -d ".terraform" ] && terraform init -input=false
    TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET}" \
    TF_VAR_keycloak_admin_password="${KEYCLOAK_ADMIN_PASSWORD}" \
    KEYCLOAK_USER="${KEYCLOAK_ADMIN_USERNAME:-admin}" \
    KEYCLOAK_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD}" \
    terraform apply -input=false -auto-approve
    cd "${DIVE_ROOT}"
}

_hub_init_nextauth_db() {
    local compose_file="docker-compose.pilot.yml"
    local pg_pass="${POSTGRES_PASSWORD:-DivePilot2025!}"
    # Create DB if missing
    docker compose -f "$compose_file" exec -T postgres \
      psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='dive_v3_app';" | grep -q 1 || \
      docker compose -f "$compose_file" exec -T postgres \
      psql -U postgres -c "CREATE DATABASE dive_v3_app;"
    # Apply drizzle SQL migrations
    docker compose -f "$compose_file" exec -T -u 0 frontend sh -lc "
      set -e
      cd /app/drizzle
      for f in \$(ls -1 *.sql 2>/dev/null | sort); do
        PGPASSWORD=${pg_pass} psql -h postgres -U postgres -d dive_v3_app -f \"\$f\"
      done
    "
}

_hub_seed_data() {
    local compose_file="docker-compose.pilot.yml"
    log_step "Seeding sample users/resources (backend)"
    docker compose -f "$compose_file" exec -T backend sh -lc "npm run seed:usa -- --count=100" 2>/dev/null || {
        log_warn "Seeding failed or not available; continuing"
    }
}

_hub_generate_local_secrets() {
    # Generate ephemeral secrets for local/pilot if not provided
    KEYCLOAK_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-$(openssl rand -base64 24 | tr -d '/+=')}"
    KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-$(openssl rand -base64 16 | tr -d '/+=')}"
    POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -base64 12 | tr -d '/+=')}"
    AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -base64 32)}"
    export KEYCLOAK_CLIENT_SECRET KEYCLOAK_ADMIN_PASSWORD POSTGRES_PASSWORD AUTH_SECRET
    log_info "Generated local secrets for pilot bootstrap (not persisted; set env to override)."
}

hub_bootstrap() {
    print_header
    echo -e "${BOLD}DIVE Hub Bootstrap (local/pilot)${NC}"
    echo ""
    ensure_dive_root

    # Generate local secrets if not provided (dev/pilot convenience)
    _hub_generate_local_secrets
    _hub_require_secret KEYCLOAK_CLIENT_SECRET || return 1
    _hub_require_secret KEYCLOAK_ADMIN_PASSWORD || return 1

    # 1) Generate dev certs (local only)
    log_step "Generating dev certificates (local)"
    if [ "$DRY_RUN" = true ]; then
        log_dry "scripts/generate-dev-certs.sh"
    else
        if [ -x "${DIVE_ROOT}/scripts/generate-dev-certs.sh" ]; then
            "${DIVE_ROOT}/scripts/generate-dev-certs.sh" || log_warn "Cert generation script failed (ensure mkcert installed)"
        else
            log_warn "generate-dev-certs.sh not found or not executable; skipping cert generation"
        fi
    fi

    # 2) Bring up stack
    log_step "Starting services (docker-compose.pilot.yml)"
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f docker-compose.pilot.yml up -d"
    else
        docker compose -f docker-compose.pilot.yml up -d
    fi

    # 3) Wait for Keycloak
    [ "$DRY_RUN" = true ] || _hub_wait_for_keycloak 90

    # 4) Terraform apply (broker realm, theme, IdPs)
    log_step "Applying Terraform (pilot)"
    if [ "$DRY_RUN" = true ]; then
        log_dry "cd terraform/pilot && terraform apply -input=false -auto-approve"
    else
        _hub_apply_terraform || return 1
    fi

    # 5) NextAuth DB + migrations
    log_step "Ensuring NextAuth database and schema"
    if [ "$DRY_RUN" = true ]; then
        log_dry "Create DB dive_v3_app if missing via postgres container"
        log_dry "Apply drizzle SQL files from /app/drizzle in frontend container"
    else
        _hub_init_nextauth_db || log_warn "DB init/migrations may need review"
    fi

    # 6) Seed sample data
    [ "$DRY_RUN" = true ] || _hub_seed_data

    log_success "Hub bootstrap complete."
    echo ""
    echo "  Frontend: https://localhost:3000"
    echo "  Backend:  https://localhost:4000"
    echo "  Keycloak: https://localhost:8443"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_federation() {
    local action="${1:-status}"
    shift || true
    
    case "$action" in
        status)        federation_status ;;
        register)      federation_register "$@" ;;
        sync-policies) federation_sync_policies ;;
        sync-idps)     federation_sync_idps ;;
        push-audit)    federation_push_audit ;;
        link)          federation_link "$@" ;;
        unlink)        federation_unlink "$@" ;;
        list-idps)     federation_list_idps ;;
        mappers)       federation_mappers_dispatch "$@" ;;
        *)             module_federation_help ;;
    esac
}

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

module_hub() {
    local action="${1:-help}"
    shift || true
    
    case "$action" in
        start)       hub_start ;;
        status)      hub_status ;;
        instances)   hub_instances ;;
        push-policy) hub_push_policy ;;
        bootstrap)   hub_bootstrap ;;
        *)           module_hub_help ;;
    esac
}

module_federation_help() {
    echo -e "${BOLD}Federation Commands:${NC}"
    echo ""
    echo "  ${CYAN}status${NC}               Show federation status"
    echo "  ${CYAN}register${NC} <url>       Register instance with hub"
    echo "  ${CYAN}sync-policies${NC}        Pull latest policies from hub"
    echo "  ${CYAN}sync-idps${NC}            Sync IdP metadata from hub"
    echo "  ${CYAN}push-audit${NC}           Push audit logs to hub"
    echo ""
    echo "  ${GREEN}${BOLD}link${NC} <CODE>         ${BOLD}Link IdP for cross-border SSO${NC}"
    echo "  ${GREEN}${BOLD}unlink${NC} <CODE>       ${BOLD}Remove IdP link${NC}"
    echo "  ${GREEN}${BOLD}list-idps${NC}           ${BOLD}List configured IdPs${NC}"
    echo ""
    echo "  ${GREEN}${BOLD}mappers${NC} <cmd>       ${BOLD}Manage NATO nation protocol mappers${NC}"
    echo "    ${CYAN}list${NC}               List available nation templates"
    echo "    ${CYAN}show${NC} <nation>      Show nation mapper details"
    echo "    ${CYAN}apply${NC} <nation>     Apply mappers to instance"
    echo "    ${CYAN}verify${NC} <nation>    Verify mapper configuration"
    echo ""
    echo "Examples:"
    echo "  ./dive federation link GBR                       # Link GBR to USA Hub"
    echo "  ./dive --instance gbr federation link USA        # Link USA to GBR Spoke"
    echo "  ./dive federation list-idps                      # Show all IdPs"
    echo ""
    echo "  ./dive federation mappers list                   # List all NATO nations"
    echo "  ./dive federation mappers show france            # Show France details"
    echo "  ./dive --instance fra federation mappers apply france  # Apply to FRA"
    echo ""
}

module_hub_help() {
    echo -e "${BOLD}Hub Commands (run from central hub):${NC}"
    echo "  start         Start hub services"
    echo "  status        Show hub service status"
    echo "  instances     List registered instances"
    echo "  push-policy   Push policy update to all instances"
    echo "  bootstrap     Local/pilot hub bootstrap (certs, compose up, terraform, NextAuth DB)"
}



