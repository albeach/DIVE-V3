#!/bin/bash
# =============================================================================
# DIVE V3 - Comprehensive Token & Federation Verification Script
# =============================================================================
# This script bypasses MFA/WebAuthn for programmatic testing and validates:
# - All user logins (Hub and Spoke)
# - Token claims (uniqueID, clearance, countryOfAffiliation, ACR, AMR)
# - Cross-instance federation (Hub→Spoke, Spoke→Hub)
# =============================================================================

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

# Get client secrets from containers
HUB_CLIENT_SECRET=""
FRA_CLIENT_SECRET=""

init_secrets() {
    HUB_CLIENT_SECRET=$(docker exec dive-hub-keycloak env 2>/dev/null | grep "^KEYCLOAK_CLIENT_SECRET=" | cut -d'=' -f2 | tr -d '\r\n')
    FRA_CLIENT_SECRET=$(docker exec dive-spoke-fra-keycloak env 2>/dev/null | grep "^KEYCLOAK_CLIENT_SECRET=" | cut -d'=' -f2 | tr -d '\r\n')
}

# Decode JWT payload (handles macOS and Linux)
decode_jwt() {
    local token="$1"
    local payload=$(echo "$token" | cut -d'.' -f2)
    # Add padding if needed
    local padding=$((4 - ${#payload} % 4))
    if [ $padding -ne 4 ]; then
        payload="${payload}$(printf '=%.0s' $(seq 1 $padding))"
    fi
    echo "$payload" | base64 -d 2>/dev/null || echo "{}"
}

# Get token for a user
get_user_token() {
    local keycloak_url="$1"
    local realm="$2"
    local client_id="$3"
    local client_secret="$4"
    local username="$5"
    local password="$6"

    local response
    response=$(curl -sk -X POST "${keycloak_url}/realms/${realm}/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=password" \
        -d "client_id=${client_id}" \
        -d "client_secret=${client_secret}" \
        -d "username=${username}" \
        -d "password=${password}" \
        -d "scope=openid profile email" 2>/dev/null)

    echo "$response"
}

# Display a single user's verification
verify_user() {
    local instance="$1"
    local username="$2"
    local keycloak_url="$3"
    local realm="$4"
    local client_id="$5"
    local client_secret="$6"
    local password="$7"

    local response
    response=$(get_user_token "$keycloak_url" "$realm" "$client_id" "$client_secret" "$username" "$password")

    local error
    error=$(echo "$response" | jq -r '.error // empty' 2>/dev/null)

    if [ -n "$error" ]; then
        local error_desc
        error_desc=$(echo "$response" | jq -r '.error_description // .error' 2>/dev/null)
        echo -e "    ${RED}✗${NC} ${username} - ${error_desc}"
        return 1
    fi

    local token
    token=$(echo "$response" | jq -r '.access_token' 2>/dev/null)

    if [ -z "$token" ] || [ "$token" = "null" ]; then
        echo -e "    ${RED}✗${NC} ${username} - No token received"
        return 1
    fi

    # Decode and extract claims
    local claims
    claims=$(decode_jwt "$token")

    local uniqueID clearance country acr amr user_acr user_amr acpCOI iss
    uniqueID=$(echo "$claims" | jq -r '.uniqueID // "MISSING"' 2>/dev/null)
    clearance=$(echo "$claims" | jq -r '.clearance // "MISSING"' 2>/dev/null)
    country=$(echo "$claims" | jq -r '.countryOfAffiliation // "MISSING"' 2>/dev/null)
    acr=$(echo "$claims" | jq -r '.acr // "MISSING"' 2>/dev/null)
    amr=$(echo "$claims" | jq -r 'if .amr then (.amr | join(",")) else "MISSING" end' 2>/dev/null)
    user_acr=$(echo "$claims" | jq -r '.user_acr // "N/A"' 2>/dev/null)
    user_amr=$(echo "$claims" | jq -r 'if .user_amr then (if (.user_amr | type) == "array" then (.user_amr | join(",")) else .user_amr end) else "N/A" end' 2>/dev/null)
    acpCOI=$(echo "$claims" | jq -r 'if .acpCOI then (if (.acpCOI | type) == "array" then (.acpCOI | join(",")) else .acpCOI end) else "N/A" end' 2>/dev/null)
    iss=$(echo "$claims" | jq -r '.iss // "MISSING"' 2>/dev/null)

    # Determine AAL
    local aal="?"
    case "$acr" in
        "0") aal="AAL1" ;;
        "1") aal="AAL2" ;;
        "2") aal="AAL3" ;;
    esac

    # Check status
    local status="${GREEN}✓${NC}"
    if [ "$uniqueID" = "MISSING" ] || [ "$clearance" = "MISSING" ] || [ "$country" = "MISSING" ]; then
        status="${RED}✗${NC}"
    fi

    # Display
    printf "    %b %-20s │ %-14s │ %-4s │ ACR=%-1s (%s) │ AMR=[%s]\n" \
        "$status" "$username" "$clearance" "$country" "$acr" "$aal" "$amr"

    return 0
}

# Test cross-instance access
test_cross_access() {
    local token="$1"
    local target_url="$2"
    local direction="$3"

    local response
    response=$(curl -sk -H "Authorization: Bearer $token" "${target_url}/api/resources?limit=1" 2>/dev/null)

    local error
    error=$(echo "$response" | jq -r '.error // empty' 2>/dev/null)

    if [ -n "$error" ]; then
        local msg
        msg=$(echo "$response" | jq -r '.message // .error' 2>/dev/null)
        echo -e "    ${RED}✗${NC} ${direction}: ${msg}"
        return 1
    else
        local count
        count=$(echo "$response" | jq -r '.data | length // 0' 2>/dev/null)
        echo -e "    ${GREEN}✓${NC} ${direction}: Access granted (${count} resource(s))"
        return 0
    fi
}

# Main
main() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     DIVE V3 - Comprehensive Token & Federation Verification                  ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Initialize secrets
    echo -e "${CYAN}→ Retrieving client secrets...${NC}"
    init_secrets

    if [ -z "$HUB_CLIENT_SECRET" ]; then
        echo -e "${RED}✗ Could not retrieve Hub client secret${NC}"
        exit 1
    fi
    echo -e "  Hub: ${HUB_CLIENT_SECRET:0:8}..."

    local fra_available=false
    if [ -n "$FRA_CLIENT_SECRET" ]; then
        echo -e "  FRA: ${FRA_CLIENT_SECRET:0:8}..."
        fra_available=true
    else
        echo -e "  FRA: ${YELLOW}Not available${NC}"
    fi
    echo ""

    # =========================================================================
    # HUB USERS
    # =========================================================================
    echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  HUB (USA) USERS                                                              ${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "    ${CYAN}User                 │ Clearance      │ Country │ Authentication${NC}"
    echo -e "    ─────────────────────┼────────────────┼─────────┼─────────────────────────"

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
    echo -e "    ${CYAN}Summary: ${hub_success}/${#hub_users[@]} users verified${NC}"
    echo ""

    # =========================================================================
    # FRA USERS
    # =========================================================================
    local fra_success=0
    if [ "$fra_available" = true ]; then
        echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "${BLUE}  FRA (France) USERS                                                          ${NC}"
        echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "    ${CYAN}User                 │ Clearance      │ Country │ Authentication${NC}"
        echo -e "    ─────────────────────┼────────────────┼─────────┼─────────────────────────"

        local fra_users=("testuser-fra-1" "testuser-fra-2" "testuser-fra-3" "testuser-fra-4" "testuser-fra-5" "admin-fra")

        for user in "${fra_users[@]}"; do
            local pwd="$TEST_PASSWORD"
            [[ "$user" == admin* ]] && pwd="$ADMIN_PASSWORD"

            if verify_user "FRA" "$user" "$FRA_KEYCLOAK_URL" "$FRA_REALM" "$FRA_CLIENT_ID" "$FRA_CLIENT_SECRET" "$pwd"; then
                ((fra_success++))
            fi
        done

        echo ""
        echo -e "    ${CYAN}Summary: ${fra_success}/${#fra_users[@]} users verified${NC}"
        echo ""
    fi

    # =========================================================================
    # CROSS-INSTANCE FEDERATION
    # =========================================================================
    echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  CROSS-INSTANCE FEDERATION TESTS                                              ${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Get Hub token for cross-instance test
    local hub_response hub_token
    hub_response=$(get_user_token "$HUB_KEYCLOAK_URL" "$HUB_REALM" "$HUB_CLIENT_ID" "$HUB_CLIENT_SECRET" "testuser-usa-3" "$TEST_PASSWORD")
    hub_token=$(echo "$hub_response" | jq -r '.access_token // empty' 2>/dev/null)

    if [ -n "$hub_token" ] && [ "$hub_token" != "null" ]; then
        echo -e "  ${CYAN}USA → FRA (Hub user accessing Spoke backend)${NC}"
        if [ "$fra_available" = true ]; then
            test_cross_access "$hub_token" "$FRA_BACKEND_URL" "testuser-usa-3 → FRA"
        else
            echo -e "    ${YELLOW}⚠${NC} FRA backend not available"
        fi

        echo ""
        echo -e "  ${CYAN}USA → USA (Hub user accessing Hub backend)${NC}"
        test_cross_access "$hub_token" "$HUB_BACKEND_URL" "testuser-usa-3 → HUB"
    else
        echo -e "  ${RED}✗${NC} Could not get Hub token"
    fi
    echo ""

    # Get FRA token for cross-instance test
    if [ "$fra_available" = true ]; then
        local fra_response fra_token
        fra_response=$(get_user_token "$FRA_KEYCLOAK_URL" "$FRA_REALM" "$FRA_CLIENT_ID" "$FRA_CLIENT_SECRET" "testuser-fra-4" "$TEST_PASSWORD")
        fra_token=$(echo "$fra_response" | jq -r '.access_token // empty' 2>/dev/null)

        if [ -n "$fra_token" ] && [ "$fra_token" != "null" ]; then
            echo -e "  ${CYAN}FRA → HUB (Spoke user accessing Hub backend)${NC}"
            test_cross_access "$fra_token" "$HUB_BACKEND_URL" "testuser-fra-4 → HUB"

            echo ""
            echo -e "  ${CYAN}FRA → FRA (Spoke user accessing Spoke backend)${NC}"
            test_cross_access "$fra_token" "$FRA_BACKEND_URL" "testuser-fra-4 → FRA"
        else
            echo -e "  ${RED}✗${NC} Could not get FRA token"
            local fra_err
            fra_err=$(echo "$fra_response" | jq -r '.error_description // .error // "Unknown"' 2>/dev/null)
            echo -e "      Error: ${fra_err}"
        fi
    fi
    echo ""

    # =========================================================================
    # FEDERATED QUERY
    # =========================================================================
    echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  FEDERATED QUERY TEST                                                         ${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    if [ -n "$hub_token" ] && [ "$hub_token" != "null" ]; then
        local fed_response
        fed_response=$(curl -sk -X POST "${HUB_BACKEND_URL}/api/resources/federated-query" \
            -H "Authorization: Bearer $hub_token" \
            -H "Content-Type: application/json" \
            -d '{"query":"","limit":3}' 2>/dev/null)

        local fed_err
        fed_err=$(echo "$fed_response" | jq -r '.error // empty' 2>/dev/null)

        if [ -n "$fed_err" ]; then
            local fed_msg
            fed_msg=$(echo "$fed_response" | jq -r '.message // .error' 2>/dev/null)
            echo -e "  ${RED}✗${NC} Federated query failed: ${fed_msg}"
        else
            local instances total
            instances=$(echo "$fed_response" | jq -r '.instanceResults | keys | join(", ")' 2>/dev/null)
            total=$(echo "$fed_response" | jq -r '[.instanceResults[].results // [] | length] | add // 0' 2>/dev/null)
            echo -e "  ${GREEN}✓${NC} Federated query successful"
            echo -e "    Instances: ${instances}"
            echo -e "    Total results: ${total}"
        fi
    fi
    echo ""

    # =========================================================================
    # TOKEN DECODE SAMPLE
    # =========================================================================
    echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  SAMPLE TOKEN DECODE (testuser-usa-3)                                         ${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    if [ -n "$hub_token" ] && [ "$hub_token" != "null" ]; then
        local sample_claims
        sample_claims=$(decode_jwt "$hub_token")
        echo "$sample_claims" | jq '{
            uniqueID,
            clearance,
            countryOfAffiliation,
            acr,
            amr,
            user_acr,
            user_amr,
            acpCOI,
            scope,
            iss,
            exp: (.exp | todate),
            iat: (.iat | todate)
        }' 2>/dev/null
    fi
    echo ""

    # =========================================================================
    # SUMMARY
    # =========================================================================
    echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  SUMMARY                                                                      ${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Hub Users:  ${hub_success}/${#hub_users[@]} verified"
    [ "$fra_available" = true ] && echo -e "  FRA Users:  ${fra_success}/${#fra_users[@]} verified"
    echo ""
    echo -e "  ${CYAN}AAL Reference:${NC}"
    echo -e "    ACR=0 → AAL1 (Password only, no MFA)"
    echo -e "    ACR=1 → AAL2 (Password + TOTP/OTP)"
    echo -e "    ACR=2 → AAL3 (Password + WebAuthn/Hardware Key)"
    echo ""
}

main "$@"
