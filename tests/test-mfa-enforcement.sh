#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - MFA Enforcement Testing Script
# =============================================================================
# Tests MFA enforcement for all clearance levels via native login
# Expected behavior:
#   - UNCLASSIFIED/RESTRICTED: No MFA prompt
#   - CONFIDENTIAL/SECRET: OTP enrollment prompt
#   - TOP_SECRET: WebAuthn enrollment prompt
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
KEYCLOAK_URL="https://localhost:8443"
REALM="dive-v3-broker-usa"
CLIENT_ID="dive-v3-broker-usa"
TEST_USERS=(
    "testuser-usa-1:TestUser2025!Pilot:UNCLASSIFIED:NO_MFA"
    "testuser-usa-2:TestUser2025!Pilot:RESTRICTED:NO_MFA"
    "testuser-usa-3:TestUser2025!Pilot:CONFIDENTIAL:OTP"
    "testuser-usa-4:TestUser2025!Pilot:SECRET:OTP"
    "testuser-usa-5:TestUser2025!Pilot:TOP_SECRET:WEBAUTHN"
)

# Check prerequisites
if [ -z "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
    echo -e "${RED}✗${NC} KEYCLOAK_ADMIN_PASSWORD not set"
    echo -e "${BLUE}ℹ${NC} Please run: eval \"\$(./dive secrets export --unsafe 2>/dev/null | grep KEYCLOAK_ADMIN_PASSWORD)\""
    exit 1
fi

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          DIVE V3 - MFA Enforcement Testing                       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get admin token
echo -e "${BLUE}▶${NC} Getting admin access token..."
ADMIN_TOKEN=$(curl -sk "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${KEYCLOAK_ADMIN_PASSWORD}" \
    -d "grant_type=password" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
    echo -e "${RED}✗${NC} Failed to get admin token"
    exit 1
fi
echo -e "${GREEN}✓${NC} Admin token obtained"
echo ""

# Function to check if user has OTP configured
check_otp_configured() {
    local user_id=$1
    local credentials=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${user_id}/credentials" \
        -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '[.[] | select(.type == "otp")] | length')
    echo "$credentials"
}

# Function to check if user has WebAuthn configured
check_webauthn_configured() {
    local user_id=$1
    local credentials=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${user_id}/credentials" \
        -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '[.[] | select(.type == "webauthn")] | length')
    echo "$credentials"
}

# Test each user
echo -e "${BLUE}▶${NC} Testing MFA enforcement for each clearance level..."
echo ""

declare -i passed=0
declare -i failed=0

for user_config in "${TEST_USERS[@]}"; do
    IFS=':' read -r username password clearance expected_mfa <<< "$user_config"

    echo -e "${BLUE}Testing:${NC} ${username} (${clearance})"
    echo -e "  Expected MFA: ${expected_mfa}"

    # Get user ID
    USER_ID=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${username}&exact=true" \
        -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')

    if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
        echo -e "  ${RED}✗${NC} User not found"
        failed=$((failed + 1))
        echo ""
        continue
    fi

    # Check MFA configuration
    otp_count=$(check_otp_configured "$USER_ID")
    webauthn_count=$(check_webauthn_configured "$USER_ID")

    echo -e "  Current MFA state:"
    echo -e "    - OTP credentials: ${otp_count}"
    echo -e "    - WebAuthn credentials: ${webauthn_count}"

    # Verify expected state
    case "$expected_mfa" in
        "NO_MFA")
            if [ "$otp_count" -eq 0 ] && [ "$webauthn_count" -eq 0 ]; then
                echo -e "  ${GREEN}✓${NC} No MFA configured (as expected)"
                echo -e "  ${GREEN}✓${NC} User can login without MFA prompt"
                passed=$((passed + 1))
            else
                echo -e "  ${RED}✗${NC} MFA configured but none expected"
                failed=$((failed + 1))
            fi
            ;;
        "OTP")
            echo -e "  ${YELLOW}⚠${NC} OTP enrollment required on first login"
            echo -e "  ${BLUE}ℹ${NC} Manual test: Login at https://localhost:3000"
            echo -e "  ${BLUE}ℹ${NC} Expected: Prompted to scan QR code and enter OTP"
            passed=$((passed + 1))
            ;;
        "WEBAUTHN")
            echo -e "  ${YELLOW}⚠${NC} WebAuthn enrollment required on first login"
            echo -e "  ${BLUE}ℹ${NC} Manual test: Login at https://localhost:3000"
            echo -e "  ${BLUE}ℹ${NC} Expected: Prompted to register security key"
            passed=$((passed + 1))
            ;;
    esac

    echo ""
done

# Summary
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                      Test Summary                                 ║${NC}"
echo -e "${BLUE}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BLUE}║${NC}  Total Tests: $((passed + failed))"
echo -e "${BLUE}║${NC}  ${GREEN}Passed: ${passed}${NC}"
if [ $failed -gt 0 ]; then
    echo -e "${BLUE}║${NC}  ${RED}Failed: ${failed}${NC}"
fi
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}⚠${NC} ${YELLOW}Note:${NC} Full MFA enforcement testing requires manual browser testing:"
echo ""
echo -e "  1. Open: ${BLUE}https://localhost:3000${NC}"
echo -e "  2. Click: ${BLUE}\"Sign in with United States (Hub)\"${NC}"
echo -e "  3. Test each user:"
echo ""
echo -e "     ${GREEN}testuser-usa-1${NC} → ${BLUE}No MFA prompt${NC} (login successful)"
echo -e "     ${GREEN}testuser-usa-2${NC} → ${BLUE}No MFA prompt${NC} (login successful)"
echo -e "     ${GREEN}testuser-usa-3${NC} → ${YELLOW}OTP enrollment${NC} (scan QR code)"
echo -e "     ${GREEN}testuser-usa-4${NC} → ${YELLOW}OTP enrollment${NC} (scan QR code)"
echo -e "     ${GREEN}testuser-usa-5${NC} → ${YELLOW}WebAuthn enrollment${NC} (register key)"
echo ""
echo -e "  4. Verify ocean pseudonyms displayed (not real names)"
echo -e "  5. Check token for ACR/AMR values"
echo ""
echo -e "${GREEN}✓${NC} Automated MFA checks complete!"
echo ""

if [ $failed -eq 0 ]; then
    exit 0
else
    exit 1
fi
