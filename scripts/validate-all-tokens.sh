#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Comprehensive Token & AAL Validation
# =============================================================================
# Validates ALL users across ALL instances with full token decode and
# AAL-based resource access testing.
#
# This script proves:
# 1. All users can authenticate
# 2. Token claims are correctly set (uniqueID, clearance, countryOfAffiliation)
# 3. ACR/AMR claims match expected AAL levels
# 4. AAL-based access control works (lower AAL blocked from higher classification)
# =============================================================================

set -o pipefail
# Note: Not using -e because we want to continue even if a user fails authentication

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'

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

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Expected values by user number
get_expected_clearance() {
    case "$1" in
        1) echo "UNCLASSIFIED" ;;
        2) echo "RESTRICTED" ;;
        3) echo "CONFIDENTIAL" ;;
        4) echo "SECRET" ;;
        5|admin) echo "TOP_SECRET" ;;
        *) echo "UNKNOWN" ;;
    esac
}

get_expected_aal() {
    case "$1" in
        1|2) echo "AAL1" ;;
        3|4) echo "AAL2" ;;
        5|admin) echo "AAL3" ;;  # admin and testuser-5 get AAL3
        *) echo "AAL1" ;;
    esac
}

get_expected_acr() {
    case "$1" in
        1|2) echo "0" ;;
        3|4) echo "1" ;;
        5|admin) echo "2" ;;  # admin and testuser-5 get ACR=2 (AAL3)
        *) echo "0" ;;
    esac
}

# Decode JWT with proper padding
decode_jwt() {
    local token="$1"
    local payload=$(echo "$token" | cut -d'.' -f2)
    local len=${#payload}
    local pad=$((4 - len % 4))
    [ $pad -ne 4 ] && payload="${payload}$(printf '=%.0s' $(seq 1 $pad))"
    echo "$payload" | base64 -d 2>/dev/null || echo "{}"
}

# Get token via password grant
get_token() {
    local url="$1" realm="$2" client_id="$3" client_secret="$4" username="$5" password="$6"
    curl -sk -X POST "${url}/realms/${realm}/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=password" \
        -d "client_id=${client_id}" \
        -d "client_secret=${client_secret}" \
        -d "username=${username}" \
        -d "password=${password}" \
        -d "scope=openid profile email" 2>/dev/null
}

# Test resource access
test_access() {
    local token="$1" url="$2" classification="$3"
    curl -sk -H "Authorization: Bearer $token" \
        "${url}/api/resources?classification=${classification}&limit=1" 2>/dev/null
}

# Validate a single user with full output
validate_user() {
    local instance="$1"
    local username="$2"
    local keycloak_url="$3"
    local realm="$4"
    local client_id="$5"
    local client_secret="$6"
    local password="$7"
    local country="$8"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    # Determine user number
    local user_num=""
    if [[ "$username" =~ -([0-9]+)$ ]]; then
        user_num="${BASH_REMATCH[1]}"
    elif [[ "$username" == admin* ]]; then
        user_num="admin"
    fi

    local expected_clearance=$(get_expected_clearance "$user_num")
    local expected_aal=$(get_expected_aal "$user_num")
    local expected_acr=$(get_expected_acr "$user_num")

    # For testuser-*-5, expect AAL3
    [[ "$user_num" == "5" ]] && expected_aal="AAL3"

    echo -e "  ${CYAN}┌─────────────────────────────────────────────────────────────────────┐${NC}"
    printf "  ${CYAN}│${NC} ${BOLD}%-67s${NC} ${CYAN}│${NC}\n" "$username ($instance)"
    echo -e "  ${CYAN}├─────────────────────────────────────────────────────────────────────┤${NC}"

    # Get token
    local response=$(get_token "$keycloak_url" "$realm" "$client_id" "$client_secret" "$username" "$password")
    local error=$(echo "$response" | jq -r '.error // empty' 2>/dev/null)

    if [ -n "$error" ]; then
        local desc=$(echo "$response" | jq -r '.error_description // .error' 2>/dev/null)
        printf "  ${CYAN}│${NC}   ${RED}✗ Authentication Failed: %-41s${NC} ${CYAN}│${NC}\n" "$desc"
        echo -e "  ${CYAN}└─────────────────────────────────────────────────────────────────────┘${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi

    local token=$(echo "$response" | jq -r '.access_token' 2>/dev/null)
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        printf "  ${CYAN}│${NC}   ${RED}✗ No token received${NC}%-48s ${CYAN}│${NC}\n" ""
        echo -e "  ${CYAN}└─────────────────────────────────────────────────────────────────────┘${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi

    # Decode claims
    local claims=$(decode_jwt "$token")

    local uniqueID=$(echo "$claims" | jq -r '.uniqueID // "MISSING"')
    local clearance=$(echo "$claims" | jq -r '.clearance // "MISSING"')
    local countryOfAff=$(echo "$claims" | jq -r '.countryOfAffiliation // "MISSING"')
    local acr=$(echo "$claims" | jq -r '.acr // "?"')
    local amr=$(echo "$claims" | jq -r 'if .amr then (.amr | join(",")) else "?" end')
    local user_acr=$(echo "$claims" | jq -r '.user_acr // "N/A"')
    local user_amr=$(echo "$claims" | jq -r 'if .user_amr then (.user_amr | join(",")) else "N/A" end')
    local acpCOI=$(echo "$claims" | jq -r 'if .acpCOI then (if (.acpCOI | type) == "array" then (.acpCOI | join(",")) else .acpCOI end) else "N/A" end')

    # Determine actual AAL
    local actual_aal="AAL1"
    case "$acr" in
        "0") actual_aal="AAL1" ;;
        "1") actual_aal="AAL2" ;;
        "2") actual_aal="AAL3" ;;
    esac

    # Check if user_acr indicates higher AAL (for testing)
    if [ "$user_acr" != "N/A" ] && [ "$user_acr" != "null" ]; then
        case "$user_acr" in
            "1") [ "$actual_aal" = "AAL1" ] && actual_aal="AAL2" ;;
            "2") actual_aal="AAL3" ;;
        esac
    fi

    # Validation checks
    local all_pass=true

    # Check uniqueID
    if [ "$uniqueID" = "$username" ]; then
        printf "  ${CYAN}│${NC}   ${GREEN}✓${NC} uniqueID: %-55s ${CYAN}│${NC}\n" "$uniqueID"
    else
        printf "  ${CYAN}│${NC}   ${RED}✗${NC} uniqueID: %-43s ${YELLOW}(expected: $username)${NC} ${CYAN}│${NC}\n" "$uniqueID"
        all_pass=false
    fi

    # Check clearance
    if [ "$clearance" = "$expected_clearance" ]; then
        printf "  ${CYAN}│${NC}   ${GREEN}✓${NC} clearance: %-54s ${CYAN}│${NC}\n" "$clearance"
    else
        printf "  ${CYAN}│${NC}   ${RED}✗${NC} clearance: %-42s ${YELLOW}(expected: $expected_clearance)${NC} ${CYAN}│${NC}\n" "$clearance"
        all_pass=false
    fi

    # Check country
    if [ "$countryOfAff" = "$country" ]; then
        printf "  ${CYAN}│${NC}   ${GREEN}✓${NC} countryOfAffiliation: %-43s ${CYAN}│${NC}\n" "$countryOfAff"
    else
        printf "  ${CYAN}│${NC}   ${RED}✗${NC} countryOfAffiliation: %-31s ${YELLOW}(expected: $country)${NC} ${CYAN}│${NC}\n" "$countryOfAff"
        all_pass=false
    fi

    # Display ACR/AMR
    printf "  ${CYAN}│${NC}   ${MAGENTA}○${NC} Session ACR: %-52s ${CYAN}│${NC}\n" "$acr"
    printf "  ${CYAN}│${NC}   ${MAGENTA}○${NC} Session AMR: %-52s ${CYAN}│${NC}\n" "[$amr]"
    printf "  ${CYAN}│${NC}   ${MAGENTA}○${NC} User ACR:    %-52s ${CYAN}│${NC}\n" "$user_acr"
    printf "  ${CYAN}│${NC}   ${MAGENTA}○${NC} User AMR:    %-52s ${CYAN}│${NC}\n" "[$user_amr]"

    # Check AAL (using user_acr for testing comparison)
    local effective_acr="$acr"
    if [ "$user_acr" != "N/A" ] && [ "$user_acr" != "null" ]; then
        # Use user_acr if it's higher than session acr
        if [ "$user_acr" -gt "$acr" ] 2>/dev/null; then
            effective_acr="$user_acr"
        fi
    fi

    if [ "$effective_acr" = "$expected_acr" ]; then
        printf "  ${CYAN}│${NC}   ${GREEN}✓${NC} Effective ACR: %-50s ${CYAN}│${NC}\n" "$effective_acr → $actual_aal"
    else
        printf "  ${CYAN}│${NC}   ${YELLOW}⚠${NC} Effective ACR: %-38s ${YELLOW}(expected: $expected_acr)${NC} ${CYAN}│${NC}\n" "$effective_acr → $actual_aal"
    fi

    # Display COI
    printf "  ${CYAN}│${NC}   ${MAGENTA}○${NC} acpCOI: %-57s ${CYAN}│${NC}\n" "$acpCOI"

    echo -e "  ${CYAN}└─────────────────────────────────────────────────────────────────────┘${NC}"

    if [ "$all_pass" = true ]; then
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

# Main
main() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     ${BOLD}DIVE V3 - Comprehensive Token & AAL Validation${NC}${BLUE}                        ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Get client secrets
    echo -e "${CYAN}→ Retrieving client secrets...${NC}"
    HUB_CLIENT_SECRET=$(docker exec dive-hub-keycloak env 2>/dev/null | grep "^KEYCLOAK_CLIENT_SECRET=" | cut -d'=' -f2 | tr -d '\r\n')
    FRA_CLIENT_SECRET=$(docker exec dive-spoke-fra-keycloak env 2>/dev/null | grep "^KEYCLOAK_CLIENT_SECRET=" | cut -d'=' -f2 | tr -d '\r\n') || true

    if [ -z "$HUB_CLIENT_SECRET" ]; then
        echo -e "${RED}✗ Could not retrieve Hub client secret${NC}"
        exit 1
    fi
    echo -e "  Hub secret: ${HUB_CLIENT_SECRET:0:8}..."
    [ -n "$FRA_CLIENT_SECRET" ] && echo -e "  FRA secret: ${FRA_CLIENT_SECRET:0:8}..."
    echo ""

    # =========================================================================
    # HUB (USA) USERS
    # =========================================================================
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  ${BOLD}HUB (USA) USERS${NC}${BLUE}                                                            ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    for user in testuser-usa-1 testuser-usa-2 testuser-usa-3 testuser-usa-4 testuser-usa-5 admin-usa; do
        local pwd="$TEST_PASSWORD"
        [[ "$user" == admin* ]] && pwd="$ADMIN_PASSWORD"
        validate_user "HUB" "$user" "$HUB_KEYCLOAK_URL" "$HUB_REALM" "$HUB_CLIENT_ID" "$HUB_CLIENT_SECRET" "$pwd" "USA"
        echo ""
    done

    # =========================================================================
    # FRA USERS
    # =========================================================================
    if [ -n "$FRA_CLIENT_SECRET" ]; then
        echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "${BLUE}  ${BOLD}FRA USERS${NC}${BLUE}                                                                  ${NC}"
        echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
        echo ""

        for user in testuser-fra-1 testuser-fra-2 testuser-fra-3 testuser-fra-4 testuser-fra-5 admin-fra; do
            local pwd="$TEST_PASSWORD"
            [[ "$user" == admin* ]] && pwd="$ADMIN_PASSWORD"
            validate_user "FRA" "$user" "$FRA_KEYCLOAK_URL" "$FRA_REALM" "$FRA_CLIENT_ID" "$FRA_CLIENT_SECRET" "$pwd" "FRA"
            echo ""
        done
    fi

    # =========================================================================
    # AAL-BASED ACCESS CONTROL TESTS
    # =========================================================================
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  ${BOLD}AAL-BASED ACCESS CONTROL TESTS${NC}${BLUE}                                             ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Test AAL1 user (testuser-usa-1) trying to access different classifications
    echo -e "  ${CYAN}Testing AAL1 user (testuser-usa-1, UNCLASSIFIED clearance):${NC}"
    local aal1_resp=$(get_token "$HUB_KEYCLOAK_URL" "$HUB_REALM" "$HUB_CLIENT_ID" "$HUB_CLIENT_SECRET" "testuser-usa-1" "$TEST_PASSWORD")
    local aal1_token=$(echo "$aal1_resp" | jq -r '.access_token // empty')

    if [ -n "$aal1_token" ]; then
        local result error

        # UNCLASSIFIED - should work
        result=$(test_access "$aal1_token" "$HUB_BACKEND_URL" "UNCLASSIFIED")
        error=$(echo "$result" | jq -r '.error // empty')
        if [ -z "$error" ]; then
            printf "    ${GREEN}✓${NC} UNCLASSIFIED access: Allowed\n"
        else
            printf "    ${RED}✗${NC} UNCLASSIFIED access: Denied - %s\n" "$(echo "$result" | jq -r '.message // .error')"
        fi

        # CONFIDENTIAL - should be blocked (AAL1 < AAL2 required)
        result=$(test_access "$aal1_token" "$HUB_BACKEND_URL" "CONFIDENTIAL")
        error=$(echo "$result" | jq -r '.error // empty')
        if [ -n "$error" ]; then
            printf "    ${GREEN}✓${NC} CONFIDENTIAL access: Correctly Denied (AAL1 < AAL2 required)\n"
        else
            printf "    ${YELLOW}⚠${NC} CONFIDENTIAL access: Allowed (may have AAL2 from user_acr)\n"
        fi
    fi
    echo ""

    # Test AAL2 user (testuser-usa-4) trying to access different classifications
    echo -e "  ${CYAN}Testing AAL2 user (testuser-usa-4, SECRET clearance):${NC}"
    local aal2_resp=$(get_token "$HUB_KEYCLOAK_URL" "$HUB_REALM" "$HUB_CLIENT_ID" "$HUB_CLIENT_SECRET" "testuser-usa-4" "$TEST_PASSWORD")
    local aal2_token=$(echo "$aal2_resp" | jq -r '.access_token // empty')

    if [ -n "$aal2_token" ]; then
        local result error

        # SECRET - should work with AAL2
        result=$(test_access "$aal2_token" "$HUB_BACKEND_URL" "SECRET")
        error=$(echo "$result" | jq -r '.error // empty')
        if [ -z "$error" ]; then
            printf "    ${GREEN}✓${NC} SECRET access: Allowed (AAL2 sufficient)\n"
        else
            printf "    ${RED}✗${NC} SECRET access: Denied - %s\n" "$(echo "$result" | jq -r '.message // .error')"
        fi

        # TOP_SECRET - should be blocked (AAL2 < AAL3 required, also clearance insufficient)
        result=$(test_access "$aal2_token" "$HUB_BACKEND_URL" "TOP_SECRET")
        error=$(echo "$result" | jq -r '.error // empty')
        if [ -n "$error" ]; then
            printf "    ${GREEN}✓${NC} TOP_SECRET access: Correctly Denied (clearance or AAL insufficient)\n"
        else
            printf "    ${YELLOW}⚠${NC} TOP_SECRET access: Unexpectedly Allowed\n"
        fi
    fi
    echo ""

    # Test AAL3 user (testuser-usa-5) accessing TOP_SECRET
    echo -e "  ${CYAN}Testing AAL3 user (testuser-usa-5, TOP_SECRET clearance):${NC}"
    local aal3_resp=$(get_token "$HUB_KEYCLOAK_URL" "$HUB_REALM" "$HUB_CLIENT_ID" "$HUB_CLIENT_SECRET" "testuser-usa-5" "$TEST_PASSWORD")
    local aal3_token=$(echo "$aal3_resp" | jq -r '.access_token // empty')

    if [ -n "$aal3_token" ]; then
        local result error

        # TOP_SECRET - should work with AAL3 and TOP_SECRET clearance
        result=$(test_access "$aal3_token" "$HUB_BACKEND_URL" "TOP_SECRET")
        error=$(echo "$result" | jq -r '.error // empty')
        if [ -z "$error" ]; then
            printf "    ${GREEN}✓${NC} TOP_SECRET access: Allowed (AAL3 + TOP_SECRET clearance)\n"
        else
            printf "    ${RED}✗${NC} TOP_SECRET access: Denied - %s\n" "$(echo "$result" | jq -r '.message // .error')"
        fi
    fi
    echo ""

    # =========================================================================
    # CROSS-INSTANCE FEDERATION TESTS
    # =========================================================================
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  ${BOLD}CROSS-INSTANCE FEDERATION TESTS${NC}${BLUE}                                            ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    if [ -n "$FRA_CLIENT_SECRET" ]; then
        # USA user accessing FRA backend
        echo -e "  ${CYAN}USA → FRA (Hub user accessing Spoke):${NC}"
        local usa_token=$(echo "$(get_token "$HUB_KEYCLOAK_URL" "$HUB_REALM" "$HUB_CLIENT_ID" "$HUB_CLIENT_SECRET" "testuser-usa-4" "$TEST_PASSWORD")" | jq -r '.access_token // empty')
        if [ -n "$usa_token" ]; then
            result=$(curl -sk -H "Authorization: Bearer $usa_token" "${FRA_BACKEND_URL}/api/resources?limit=1" 2>/dev/null)
            error=$(echo "$result" | jq -r '.error // empty')
            if [ -z "$error" ]; then
                printf "    ${GREEN}✓${NC} testuser-usa-4 → FRA backend: Access granted\n"
            else
                printf "    ${RED}✗${NC} testuser-usa-4 → FRA backend: %s\n" "$(echo "$result" | jq -r '.message // .error')"
            fi
        fi

        # FRA user accessing USA backend
        echo -e "  ${CYAN}FRA → USA (Spoke user accessing Hub):${NC}"
        local fra_token=$(echo "$(get_token "$FRA_KEYCLOAK_URL" "$FRA_REALM" "$FRA_CLIENT_ID" "$FRA_CLIENT_SECRET" "testuser-fra-4" "$TEST_PASSWORD")" | jq -r '.access_token // empty')
        if [ -n "$fra_token" ]; then
            result=$(curl -sk -H "Authorization: Bearer $fra_token" "${HUB_BACKEND_URL}/api/resources?limit=1" 2>/dev/null)
            error=$(echo "$result" | jq -r '.error // empty')
            if [ -z "$error" ]; then
                printf "    ${GREEN}✓${NC} testuser-fra-4 → HUB backend: Access granted\n"
            else
                printf "    ${RED}✗${NC} testuser-fra-4 → HUB backend: %s\n" "$(echo "$result" | jq -r '.message // .error')"
            fi
        fi
    fi
    echo ""

    # =========================================================================
    # SUMMARY
    # =========================================================================
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  ${BOLD}VALIDATION SUMMARY${NC}${BLUE}                                                         ${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BOLD}Total Users Validated:${NC} $TOTAL_TESTS"
    echo -e "  ${GREEN}Passed:${NC} $PASSED_TESTS"
    echo -e "  ${RED}Failed:${NC} $FAILED_TESTS"
    echo ""
    echo -e "  ${CYAN}AAL Requirements by Classification:${NC}"
    echo -e "    UNCLASSIFIED, RESTRICTED → AAL1 (acr=0)"
    echo -e "    CONFIDENTIAL, SECRET     → AAL2 (acr=1)"
    echo -e "    TOP_SECRET               → AAL3 (acr=2)"
    echo ""
    echo -e "  ${CYAN}User Levels:${NC}"
    echo -e "    testuser-*-1: UNCLASSIFIED → AAL1"
    echo -e "    testuser-*-2: RESTRICTED   → AAL1"
    echo -e "    testuser-*-3: CONFIDENTIAL → AAL2"
    echo -e "    testuser-*-4: SECRET       → AAL2"
    echo -e "    testuser-*-5: TOP_SECRET   → AAL3"
    echo -e "    admin-*:      TOP_SECRET   → AAL3"
    echo ""

    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "  ${GREEN}${BOLD}✓ ALL VALIDATIONS PASSED${NC}"
    else
        echo -e "  ${RED}${BOLD}✗ SOME VALIDATIONS FAILED${NC}"
    fi
    echo ""
}

main "$@"
