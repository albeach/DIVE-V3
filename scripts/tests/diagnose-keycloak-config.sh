#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Keycloak Configuration Diagnostic Script
# =============================================================================
# Checks Keycloak client configuration and protocol mappers for all instances
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Instance configurations
declare -A INSTANCE_CONFIGS
INSTANCE_CONFIGS[usa_idp]="https://usa-idp.dive25.com"
INSTANCE_CONFIGS[fra_idp]="https://fra-idp.dive25.com"
INSTANCE_CONFIGS[gbr_idp]="https://gbr-idp.dive25.com"
INSTANCE_CONFIGS[deu_idp]="https://deu-idp.prosecurity.biz"

REALM="dive-v3-broker"
CLIENT_ID="dive-v3-client-broker"

# Load admin passwords
load_admin_password() {
    local instance="$1"
    local secret_name="dive-v3-keycloak-${instance}"
    gcloud secrets versions access latest --secret="$secret_name" --project=dive25 2>/dev/null || echo ""
}

get_admin_token() {
    local idp_url="$1"
    local admin_password="$2"
    
    curl -sk -X POST "${idp_url}/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${admin_password}" \
        2>/dev/null | jq -r '.access_token // empty'
}

check_client_config() {
    local instance="$1"
    local idp_url="${INSTANCE_CONFIGS[${instance}_idp]}"
    local admin_password=$(load_admin_password "$instance")
    
    if [[ -z "$admin_password" ]]; then
        echo -e "${RED}❌ Cannot load admin password for ${instance^^}${NC}"
        return 1
    fi
    
    local token=$(get_admin_token "$idp_url" "$admin_password")
    if [[ -z "$token" ]]; then
        echo -e "${RED}❌ Cannot get admin token for ${instance^^}${NC}"
        return 1
    fi
    
    echo -e "\n${CYAN}━━━ ${instance^^} Instance Configuration ━━━${NC}\n"
    
    # Get client configuration
    local client_json=$(curl -sk -X GET \
        "${idp_url}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
        -H "Authorization: Bearer ${token}" \
        2>/dev/null)
    
    local client_id=$(echo "$client_json" | jq -r '.[0].id // empty')
    if [[ -z "$client_id" ]]; then
        echo -e "${RED}❌ Client ${CLIENT_ID} not found${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ Client found: ${CLIENT_ID}${NC}"
    
    # Check client settings
    local access_type=$(echo "$client_json" | jq -r '.[0].publicClient // false')
    local direct_grant=$(echo "$client_json" | jq -r '.[0].directAccessGrantsEnabled // false')
    local client_secret=$(echo "$client_json" | jq -r '.[0].secret // empty')
    
    echo "  Access Type: $([ "$access_type" == "false" ] && echo "CONFIDENTIAL" || echo "PUBLIC")"
    echo "  Direct Access Grants: $([ "$direct_grant" == "true" ] && echo -e "${GREEN}Enabled${NC}" || echo -e "${RED}Disabled${NC}")"
    echo "  Client Secret: ${client_secret:0:20}..."
    
    # Get protocol mappers
    local mappers_json=$(curl -sk -X GET \
        "${idp_url}/admin/realms/${REALM}/clients/${client_id}/protocol-mappers/models" \
        -H "Authorization: Bearer ${token}" \
        2>/dev/null)
    
    echo -e "\n  Protocol Mappers:"
    local mapper_count=$(echo "$mappers_json" | jq 'length')
    echo "    Total: $mapper_count"
    
    # Check for specific mappers
    local clearance_mapper=$(echo "$mappers_json" | jq -r '.[] | select(.name | contains("clearance")) | .name' | head -1)
    local country_mapper=$(echo "$mappers_json" | jq -r '.[] | select(.name | contains("country")) | .name' | head -1)
    local uniqueid_mapper=$(echo "$mappers_json" | jq -r '.[] | select(.name | contains("uniqueID") or contains("uniqueid")) | .name' | head -1)
    
    if [[ -n "$clearance_mapper" ]]; then
        echo -e "    ${GREEN}✅ Clearance mapper: ${clearance_mapper}${NC}"
    else
        echo -e "    ${RED}❌ Clearance mapper missing${NC}"
    fi
    
    if [[ -n "$country_mapper" ]]; then
        echo -e "    ${GREEN}✅ Country mapper: ${country_mapper}${NC}"
    else
        echo -e "    ${RED}❌ Country mapper missing${NC}"
    fi
    
    if [[ -n "$uniqueid_mapper" ]]; then
        echo -e "    ${GREEN}✅ uniqueID mapper: ${uniqueid_mapper}${NC}"
    else
        echo -e "    ${RED}❌ uniqueID mapper missing${NC}"
    fi
    
    # Check user attributes
    echo -e "\n  Test User Attributes:"
    for level in 1 2 3 4; do
        local username="testuser-${instance}-${level}"
        local user_json=$(curl -sk -X GET \
            "${idp_url}/admin/realms/${REALM}/users?username=${username}&exact=true" \
            -H "Authorization: Bearer ${token}" \
            2>/dev/null)
        
        local user_id=$(echo "$user_json" | jq -r '.[0].id // empty')
        if [[ -n "$user_id" ]]; then
            local attributes=$(echo "$user_json" | jq -r '.[0].attributes // {}')
            local clearance=$(echo "$attributes" | jq -r '.clearance[0] // empty')
            local country=$(echo "$attributes" | jq -r '.countryOfAffiliation[0] // empty')
            local uniqueid=$(echo "$attributes" | jq -r '.uniqueID[0] // empty')
            
            echo "    ${username}:"
            echo "      Clearance: ${clearance:-${RED}MISSING${NC}}"
            echo "      Country: ${country:-${RED}MISSING${NC}}"
            echo "      uniqueID: ${uniqueid:-${RED}MISSING${NC}}"
        else
            echo -e "    ${RED}❌ User ${username} not found${NC}"
        fi
    done
}

# Check all instances
for instance in usa fra gbr deu; do
    check_client_config "$instance"
done

echo ""

