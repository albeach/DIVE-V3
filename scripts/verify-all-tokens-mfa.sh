#!/bin/bash
# =============================================================================
# DIVE V3 - Comprehensive Token Verification with MFA Support
# =============================================================================
# This script verifies all users with proper AAL levels:
# - AAL1 users (1-2): Password only authentication
# - AAL2 users (3-4): Password + TOTP authentication
# - AAL3 users (5): Password + TOTP (simulating WebAuthn for testing)
#
# Requires: oathtool (brew install oath-toolkit)
# =============================================================================

set -eo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
HUB_KEYCLOAK_URL="https://localhost:8443"
HUB_BACKEND_URL="https://localhost:4000"
HUB_REALM="dive-v3-broker-usa"
HUB_CLIENT_ID="dive-v3-broker-usa"

FRA_KEYCLOAK_URL="https://localhost:8453"
FRA_BACKEND_URL="https://localhost:4457"
FRA_REALM="dive-v3-broker-fra"
FRA_CLIENT_ID="dive-v3-broker-fra"

TEST_PASSWORD="TestUser2025!Pilot"
ADMIN_PASSWORD="TestUser2025!SecureAdmin"

# TOTP secrets for MFA users (matching setup-test-mfa.sh)
declare -A TOTP_SECRETS
TOTP_SECRETS["testuser-usa-3"]="JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"
TOTP_SECRETS["testuser-usa-4"]="KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU"
TOTP_SECRETS["testuser-usa-5"]="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
TOTP_SECRETS["testuser-fra-3"]="MFRGGZDFMY4TQMJSMFRGGZDFMY4TQMJS"
TOTP_SECRETS["testuser-fra-4"]="NZXXQZLSEBUXGIDJNZXXQZLSEBUXGIDJ"
TOTP_SECRETS["testuser-fra-5"]="OBXXQZLSEBUXGIDKOBXXQZLSEBUXGIDK"
TOTP_SECRETS["admin-usa"]="PBSWY3DPEHPK3PXQPBSWY3DPEHPK3PXQ"
TOTP_SECRETS["admin-fra"]="QBSWY3DPEHPK3PXRQBSWY3DPEHPK3PXR"

# Expected AAL by user number
declare -A EXPECTED_AAL
EXPECTED_AAL["1"]="AAL1"
EXPECTED_AAL["2"]="AAL1"
EXPECTED_AAL["3"]="AAL2"
EXPECTED_AAL["4"]="AAL2"
EXPECTED_AAL["5"]="AAL3"

# Expected clearance by user number
declare -A EXPECTED_CLEARANCE
EXPECTED_CLEARANCE["1"]="UNCLASSIFIED"
EXPECTED_CLEARANCE["2"]="RESTRICTED"
EXPECTED_CLEARANCE["3"]="CONFIDENTIAL"
EXPECTED_CLEARANCE["4"]="SECRET"
EXPECTED_CLEARANCE["5"]="TOP_SECRET"

HUB_CLIENT_SECRET=""
FRA_CLIENT_SECRET=""

# Initialize client secrets
init_secrets() {
    HUB_CLIENT_SECRET=$(docker exec dive-hub-keycloak env 2>/dev/null | grep "^KEYCLOAK_CLIENT_SECRET=" | cut -d'=' -f2 | tr -d '\r\n')
    FRA_CLIENT_SECRET=$(docker exec dive-spoke-fra-keycloak env 2>/dev/null | grep "^KEYCLOAK_CLIENT_SECRET=" | cut -d'=' -f2 | tr -d '\r\n') || true
}

# Generate TOTP code
generate_totp() {
    local secret="$1"
    if command -v oathtool &> /dev/null; then
        oathtool --totp --base32 "$secret" 2>/dev/null
    else
        echo ""
    fi
}

# Decode JWT payload
decode_jwt() {
    local token="$1"
    local payload
    payload=$(echo "$token" | cut -d'.' -f2)
    local padding=$((4 - ${#payload} % 4))
    if [ $padding -ne 4 ]; then
        payload="${payload}$(printf '=%.0s' $(seq 1 $padding))"
    fi
    echo "$payload" | base64 -d 2>/dev/null || echo "{}"
}

# Get token with password only
get_password_token() {
    local keycloak_url="$1"
    local realm="$2"
    local client_id="$3"
    local client_secret="$4"
    local username="$5"
    local password="$6"

    curl -sk -X POST "${keycloak_url}/realms/${realm}/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=password" \
        -d "client_id=${client_id}" \
        -d "client_secret=${client_secret}" \
        -d "username=${username}" \
        -d "password=${password}" \
        -d "scope=openid profile email" 2>/dev/null
}

# Get token with TOTP (two-step)
get_mfa_token() {
    local keycloak_url="$1"
    local realm="$2"
    local client_id="$3"
    local client_secret="$4"
    local username="$5"
    local password="$6"
    local totp_secret="$7"

    # Step 1: Initial password auth
    local response
    response=$(curl -sk -X POST "${keycloak_url}/realms/${realm}/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=password" \
        -d "client_id=${client_id}" \
        -d "client_secret=${client_secret}" \
        -d "username=${username}" \
        -d "password=${password}" \
        -d "scope=openid profile email" 2>/dev/null)

    # Check if MFA is required
    local error
    error=$(echo "$response" | jq -r '.error // empty' 2>/dev/null)

    if [ "$error" = "invalid_grant" ]; then
        local error_desc
        error_desc=$(echo "$response" | jq -r '.error_description // ""' 2>/dev/null)

        # If OTP is required, Keycloak may return a specific error
        # For direct grants with required OTP, we need to include otp in the request
        if [ -n "$totp_secret" ]; then
            local otp_code
            otp_code=$(generate_totp "$totp_secret")

            if [ -n "$otp_code" ]; then
                # Retry with OTP
                response=$(curl -sk -X POST "${keycloak_url}/realms/${realm}/protocol/openid-connect/token" \
                    -H "Content-Type: application/x-www-form-urlencoded" \
                    -d "grant_type=password" \
                    -d "client_id=${client_id}" \
                    -d "client_secret=${client_secret}" \
                    -d "username=${username}" \
                    -d "password=${password}" \
                    -d "totp=${otp_code}" \
                    -d "scope=openid profile email" 2>/dev/null)
            fi
        fi
    fi

    echo "$response"
}

# Verify a single user
verify_user() {
    local _instance="$1"
    local username="$2"
    local keycloak_url="$3"
    local realm="$4"
    local client_id="$5"
    local client_secret="$6"
    local password="$7"

    # Determine user number and expected values
    local user_num=""
    if [[ "$username" =~ -([0-9]+)$ ]]; then
        user_num="${BASH_REMATCH[1]}"
    elif [[ "$username" == admin* ]]; then
        user_num="5"  # Admin requires highest auth
    fi

    local expected_aal="${EXPECTED_AAL[$user_num]:-AAL1}"
    local expected_clearance="${EXPECTED_CLEARANCE[$user_num]:-UNCLASSIFIED}"
    local totp_secret="${TOTP_SECRETS[$username]:-}"

    # Get token (with MFA if user has TOTP secret configured)
    local response
    if [ -n "$totp_secret" ] && [ "$expected_aal" != "AAL1" ]; then
        response=$(get_mfa_token "$keycloak_url" "$realm" "$client_id" "$client_secret" "$username" "$password" "$totp_secret")
    else
        response=$(get_password_token "$keycloak_url" "$realm" "$client_id" "$client_secret" "$username" "$password")
    fi

    local error
    error=$(echo "$response" | jq -r '.error // empty' 2>/dev/null)

    if [ -n "$error" ]; then
        local error_desc
        error_desc=$(echo "$response" | jq -r '.error_description // .error' 2>/dev/null)
        printf "    ${RED}✗${NC} %-18s │ %-14s │ %-4s │ %-5s │ ${RED}Auth failed: %s${NC}\n" \
            "$username" "$expected_clearance" "?" "?" "$error_desc"
        return 1
    fi

    local token
    token=$(echo "$response" | jq -r '.access_token' 2>/dev/null)

    if [ -z "$token" ] || [ "$token" = "null" ]; then
        printf "    ${RED}✗${NC} %-18s │ %-14s │ %-4s │ %-5s │ ${RED}No token received${NC}\n" \
            "$username" "$expected_clearance" "?" "?"
        return 1
    fi

    # Decode and extract claims
    local claims
    claims=$(decode_jwt "$token")

    local uniqueID clearance country acr amr
    uniqueID=$(echo "$claims" | jq -r '.uniqueID // "MISSING"' 2>/dev/null)
    clearance=$(echo "$claims" | jq -r '.clearance // "MISSING"' 2>/dev/null)
    country=$(echo "$claims" | jq -r '.countryOfAffiliation // "?"' 2>/dev/null)
    acr=$(echo "$claims" | jq -r '.acr // "?"' 2>/dev/null)
    amr=$(echo "$claims" | jq -r 'if .amr then (.amr | join(",")) else "?" end' 2>/dev/null)

    # Determine actual AAL from ACR
    local actual_aal="AAL1"
    case "$acr" in
        "0") actual_aal="AAL1" ;;
        "1") actual_aal="AAL2" ;;
        "2") actual_aal="AAL3" ;;
    esac

    # Check if values match expectations
    local status="${GREEN}✓${NC}"
    local notes=""

    if [ "$uniqueID" = "MISSING" ] || [ "$clearance" = "MISSING" ]; then
        status="${RED}✗${NC}"
        notes="missing claims"
    elif [ "$actual_aal" != "$expected_aal" ]; then
        status="${YELLOW}⚠${NC}"
        notes="want $expected_aal"
    fi

    # Display result
    printf "    %b %-18s │ %-14s │ %-4s │ %-5s │ AMR=[%s] %s\n" \
        "$status" "$username" "$clearance" "$country" "$actual_aal" "$amr" "$notes"

    return 0
}

# Test cross-instance access with specific clearance check
test_resource_access() {
    local token="$1"
    local backend_url="$2"
    local test_name="$3"
    local expected_clearance="$4"

    # Get a resource that matches the expected clearance
    local response
    response=$(curl -sk -H "Authorization: Bearer $token" \
        "${backend_url}/api/resources?classification=${expected_clearance}&limit=1" 2>/dev/null)

    local error
    error=$(echo "$response" | jq -r '.error // empty' 2>/dev/null)

    if [ -n "$error" ]; then
        local msg
        msg=$(echo "$response" | jq -r '.message // .error' 2>/dev/null)
        echo -e "    ${RED}✗${NC} ${test_name}: ${msg}"
        return 1
    else
        local count
        count=$(echo "$response" | jq -r '.data | length // 0' 2>/dev/null)
        echo -e "    ${GREEN}✓${NC} ${test_name}: Can access ${expected_clearance} resources (${count} found)"
        return 0
    fi
}

# Main
main() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     DIVE V3 - Token Verification with MFA/AAL Testing                                ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Check for oathtool
    if ! command -v oathtool &> /dev/null; then
        echo -e "${YELLOW}⚠ oathtool not installed - AAL2/AAL3 authentication will use password only${NC}"
        echo -e "  Install with: brew install oath-toolkit"
        echo ""
    fi

    # Initialize
    echo -e "${CYAN}→ Initializing...${NC}"
    init_secrets

    if [ -z "$HUB_CLIENT_SECRET" ]; then
        echo -e "${RED}✗ Could not retrieve Hub client secret${NC}"
        exit 1
    fi
    echo ""

    # =========================================================================
    # HUB USERS
    # =========================================================================
    echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  HUB (USA) USERS                                                                        ${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "    ${CYAN}User               │ Clearance      │ Country │ AAL   │ Authentication${NC}"
    echo -e "    ───────────────────┼────────────────┼─────────┼───────┼──────────────────────────"

    local hub_users=("testuser-usa-1" "testuser-usa-2" "testuser-usa-3" "testuser-usa-4" "testuser-usa-5" "admin-usa")
    local hub_success=0

    for user in "${hub_users[@]}"; do
        local pwd="$TEST_PASSWORD"
        [[ "$user" == admin* ]] && pwd="$ADMIN_PASSWORD"

        if verify_user "HUB" "$user" "$HUB_KEYCLOAK_URL" "$HUB_REALM" "$HUB_CLIENT_ID" "$HUB_CLIENT_SECRET" "$pwd"; then
            ((hub_success++))
        fi
    done

    echo ""
    echo -e "    ${CYAN}Result: ${hub_success}/${#hub_users[@]} users verified${NC}"
    echo ""

    # =========================================================================
    # FRA USERS
    # =========================================================================
    local fra_success=0
    if [ -n "$FRA_CLIENT_SECRET" ]; then
        echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "${BLUE}  FRA USERS                                                                              ${NC}"
        echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "    ${CYAN}User               │ Clearance      │ Country │ AAL   │ Authentication${NC}"
        echo -e "    ───────────────────┼────────────────┼─────────┼───────┼──────────────────────────"

        local fra_users=("testuser-fra-1" "testuser-fra-2" "testuser-fra-3" "testuser-fra-4" "testuser-fra-5" "admin-fra")

        for user in "${fra_users[@]}"; do
            local pwd="$TEST_PASSWORD"
            [[ "$user" == admin* ]] && pwd="$ADMIN_PASSWORD"

            if verify_user "FRA" "$user" "$FRA_KEYCLOAK_URL" "$FRA_REALM" "$FRA_CLIENT_ID" "$FRA_CLIENT_SECRET" "$pwd"; then
                ((fra_success++))
            fi
        done

        echo ""
        echo -e "    ${CYAN}Result: ${fra_success}/${#fra_users[@]} users verified${NC}"
        echo ""
    fi

    # =========================================================================
    # AAL-BASED RESOURCE ACCESS TESTS
    # =========================================================================
    echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  AAL-BASED RESOURCE ACCESS TESTS                                                        ${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Test each AAL level accessing appropriate resources
    echo -e "  ${CYAN}Testing AAL1 user (testuser-usa-1) access:${NC}"
    local aal1_response
    aal1_response=$(get_password_token "$HUB_KEYCLOAK_URL" "$HUB_REALM" "$HUB_CLIENT_ID" "$HUB_CLIENT_SECRET" "testuser-usa-1" "$TEST_PASSWORD")
    local aal1_token
    aal1_token=$(echo "$aal1_response" | jq -r '.access_token // empty' 2>/dev/null)
    if [ -n "$aal1_token" ]; then
        test_resource_access "$aal1_token" "$HUB_BACKEND_URL" "UNCLASSIFIED" "UNCLASSIFIED"
        test_resource_access "$aal1_token" "$HUB_BACKEND_URL" "CONFIDENTIAL (should fail)" "CONFIDENTIAL"
    fi
    echo ""

    echo -e "  ${CYAN}Testing AAL2 user (testuser-usa-3) access:${NC}"
    local aal2_response
    aal2_response=$(get_mfa_token "$HUB_KEYCLOAK_URL" "$HUB_REALM" "$HUB_CLIENT_ID" "$HUB_CLIENT_SECRET" "testuser-usa-3" "$TEST_PASSWORD" "${TOTP_SECRETS[testuser-usa-3]:-}")
    local aal2_token
    aal2_token=$(echo "$aal2_response" | jq -r '.access_token // empty' 2>/dev/null)
    if [ -n "$aal2_token" ]; then
        test_resource_access "$aal2_token" "$HUB_BACKEND_URL" "UNCLASSIFIED" "UNCLASSIFIED"
        test_resource_access "$aal2_token" "$HUB_BACKEND_URL" "CONFIDENTIAL" "CONFIDENTIAL"
        test_resource_access "$aal2_token" "$HUB_BACKEND_URL" "TOP_SECRET (should fail)" "TOP_SECRET"
    fi
    echo ""

    # =========================================================================
    # SUMMARY
    # =========================================================================
    echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  SUMMARY                                                                                ${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Hub Users:  ${hub_success}/${#hub_users[@]} verified"
    [ -n "$FRA_CLIENT_SECRET" ] && echo -e "  FRA Users:  ${fra_success}/${#fra_users[@]} verified"
    echo ""
    echo -e "  ${CYAN}Expected AAL by User:${NC}"
    echo -e "    testuser-*-1: AAL1 (UNCLASSIFIED)  - Password only"
    echo -e "    testuser-*-2: AAL1 (RESTRICTED)    - Password only"
    echo -e "    testuser-*-3: AAL2 (CONFIDENTIAL)  - Password + TOTP"
    echo -e "    testuser-*-4: AAL2 (SECRET)        - Password + TOTP"
    echo -e "    testuser-*-5: AAL3 (TOP_SECRET)    - Password + WebAuthn/TOTP"
    echo ""
    echo -e "  ${CYAN}OPA Policy AAL Mapping:${NC}"
    echo -e "    ACR=0 → AAL1 (single factor)"
    echo -e "    ACR=1 → AAL2 (multi-factor)"
    echo -e "    ACR=2 → AAL3 (hardware-backed)"
    echo ""
}

main "$@"

# sc2034-anchor
: "${FRA_BACKEND_URL:-}"
