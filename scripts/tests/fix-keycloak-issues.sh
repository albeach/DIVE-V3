#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Fix Keycloak Configuration Issues
# =============================================================================
# Fixes:
# 1. Client secret mismatches (sync from GCP)
# 2. Missing user attributes (set via Admin API)
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
GCP_PROJECT="dive25"

# Load admin password from GCP
load_admin_password() {
    local instance="$1"
    local secret_name="dive-v3-keycloak-${instance}"
    gcloud secrets versions access latest --secret="$secret_name" --project="$GCP_PROJECT" 2>/dev/null || echo ""
}

# Get admin token
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

# Fix client secret
fix_client_secret() {
    local instance="$1"
    local idp_url="${INSTANCE_CONFIGS[${instance}_idp]}"
    local admin_password=$(load_admin_password "$instance")
    
    if [[ -z "$admin_password" ]]; then
        echo -e "${RED}❌ Cannot load admin password for ${instance^^}${NC}"
        return 1
    fi
    
    echo -e "\n${CYAN}━━━ Fixing ${instance^^} Client Secret ━━━${NC}\n"
    
    local token=$(get_admin_token "$idp_url" "$admin_password")
    if [[ -z "$token" ]]; then
        echo -e "${RED}❌ Cannot get admin token${NC}"
        return 1
    fi
    
    # Get client UUID
    local client_json=$(curl -sk -X GET \
        "${idp_url}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
        -H "Authorization: Bearer ${token}" \
        2>/dev/null)
    
    local client_uuid=$(echo "$client_json" | jq -r '.[0].id // empty')
    if [[ -z "$client_uuid" ]]; then
        echo -e "${RED}❌ Client not found${NC}"
        return 1
    fi
    
    # Get current secret
    local current_secret=$(echo "$client_json" | jq -r '.[0].secret // empty')
    
    # Get secret from GCP
    local gcp_secret_name="dive-v3-keycloak-client-secret-${instance}"
    local gcp_secret=$(gcloud secrets versions access latest --secret="$gcp_secret_name" --project="$GCP_PROJECT" 2>/dev/null || echo "")
    
    if [[ -z "$gcp_secret" ]]; then
        echo -e "${YELLOW}⚠️  GCP secret not found, skipping${NC}"
        return 0
    fi
    
    if [[ "$current_secret" == "$gcp_secret" ]]; then
        echo -e "${GREEN}✅ Client secret already matches GCP${NC}"
        return 0
    fi
    
    echo "  Current: ${current_secret:0:20}..."
    echo "  GCP:     ${gcp_secret:0:20}..."
    echo "  Updating..."
    
    # Get full client config
    local full_client=$(curl -sk -X GET \
        "${idp_url}/admin/realms/${REALM}/clients/${client_uuid}" \
        -H "Authorization: Bearer ${token}" \
        2>/dev/null)
    
    # Update secret
    local updated_client=$(echo "$full_client" | jq --arg secret "$gcp_secret" '.secret = $secret')
    
    # Apply update
    local result=$(curl -sk -X PUT \
        "${idp_url}/admin/realms/${REALM}/clients/${client_uuid}" \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d "$updated_client" \
        2>/dev/null)
    
    # Verify
    local verify_json=$(curl -sk -X GET \
        "${idp_url}/admin/realms/${REALM}/clients/${client_uuid}" \
        -H "Authorization: Bearer ${token}" \
        2>/dev/null)
    
    local verify_secret=$(echo "$verify_json" | jq -r '.secret // empty')
    
    if [[ "$verify_secret" == "$gcp_secret" ]]; then
        echo -e "${GREEN}✅ Client secret updated successfully${NC}"
        return 0
    else
        echo -e "${RED}❌ Failed to update client secret${NC}"
        return 1
    fi
}

# Fix user attributes
fix_user_attributes() {
    local instance="$1"
    local idp_url="${INSTANCE_CONFIGS[${instance}_idp]}"
    local admin_password=$(load_admin_password "$instance")
    
    if [[ -z "$admin_password" ]]; then
        echo -e "${RED}❌ Cannot load admin password for ${instance^^}${NC}"
        return 1
    fi
    
    echo -e "\n${CYAN}━━━ Fixing ${instance^^} User Attributes ━━━${NC}\n"
    
    local token=$(get_admin_token "$idp_url" "$admin_password")
    if [[ -z "$token" ]]; then
        echo -e "${RED}❌ Cannot get admin token${NC}"
        return 1
    fi
    
    local instance_upper=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
    
    # Define expected attributes for each user level
    declare -A clearance_levels
    clearance_levels[1]="UNCLASSIFIED"
    clearance_levels[2]="CONFIDENTIAL"
    clearance_levels[3]="SECRET"
    clearance_levels[4]="TOP_SECRET"
    
    for level in 1 2 3 4; do
        local username="testuser-${instance}-${level}"
        local expected_clearance="${clearance_levels[$level]}"
        
        echo "  Fixing ${username}..."
        
        # Get user
        local user_json=$(curl -sk -X GET \
            "${idp_url}/admin/realms/${REALM}/users?username=${username}&exact=true" \
            -H "Authorization: Bearer ${token}" \
            2>/dev/null)
        
        local user_id=$(echo "$user_json" | jq -r '.[0].id // empty')
        if [[ -z "$user_id" ]]; then
            echo -e "    ${RED}❌ User not found${NC}"
            continue
        fi
        
        # Get current attributes
        local current_attrs=$(echo "$user_json" | jq -r '.[0].attributes // {}')
        local current_clearance=$(echo "$current_attrs" | jq -r '.clearance[0] // empty')
        local current_country=$(echo "$current_attrs" | jq -r '.countryOfAffiliation[0] // empty')
        local current_uniqueid=$(echo "$current_attrs" | jq -r '.uniqueID[0] // empty')
        
        # Check if update needed
        local needs_update=false
        if [[ "$current_clearance" != "$expected_clearance" ]] || \
           [[ "$current_country" != "$instance_upper" ]] || \
           [[ "$current_uniqueid" != "$username" ]]; then
            needs_update=true
        fi
        
        if [[ "$needs_update" == "false" ]]; then
            echo -e "    ${GREEN}✅ Attributes already correct${NC}"
            continue
        fi
        
        # Build updated attributes
        local updated_attrs=$(echo "$current_attrs" | jq \
            --arg clearance "$expected_clearance" \
            --arg country "$instance_upper" \
            --arg uniqueid "$username" \
            '.clearance = [$clearance] | .countryOfAffiliation = [$country] | .uniqueID = [$uniqueid]')
        
        # Update user
        local user_update=$(echo "$user_json" | jq --argjson attrs "$updated_attrs" '.[0].attributes = $attrs | .[0]')
        
        local result=$(curl -sk -X PUT \
            "${idp_url}/admin/realms/${REALM}/users/${user_id}" \
            -H "Authorization: Bearer ${token}" \
            -H "Content-Type: application/json" \
            -d "$user_update" \
            2>/dev/null)
        
        # Verify
        local verify_json=$(curl -sk -X GET \
            "${idp_url}/admin/realms/${REALM}/users/${user_id}" \
            -H "Authorization: Bearer ${token}" \
            2>/dev/null)
        
        local verify_attrs=$(echo "$verify_json" | jq -r '.attributes // {}')
        local verify_clearance=$(echo "$verify_attrs" | jq -r '.clearance[0] // empty')
        local verify_country=$(echo "$verify_attrs" | jq -r '.countryOfAffiliation[0] // empty')
        local verify_uniqueid=$(echo "$verify_attrs" | jq -r '.uniqueID[0] // empty')
        
        if [[ "$verify_clearance" == "$expected_clearance" ]] && \
           [[ "$verify_country" == "$instance_upper" ]] && \
           [[ "$verify_uniqueid" == "$username" ]]; then
            echo -e "    ${GREEN}✅ Attributes updated successfully${NC}"
        else
            echo -e "    ${RED}❌ Failed to update attributes${NC}"
            echo "      Expected: clearance=${expected_clearance}, country=${instance_upper}, uniqueID=${username}"
            echo "      Got: clearance=${verify_clearance}, country=${verify_country}, uniqueID=${verify_uniqueid}"
        fi
    done
}

# Main
main() {
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║   DIVE V3 - Keycloak Configuration Fix Script              ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Fix FRA client secret
    fix_client_secret "fra"
    
    # Fix user attributes for all instances
    for instance in usa fra deu; do
        fix_user_attributes "$instance"
    done
    
    echo ""
    echo -e "${GREEN}✅ Fix script completed${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Run E2E test: ./scripts/tests/e2e-verify-terraform-logins.sh"
    echo "  2. Verify all tests pass"
}

main

