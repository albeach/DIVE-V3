#!/usr/bin/env bash
# ============================================
# DIVE V3 - Generate Partner Test Token
# Creates JWT tokens for external partner testing
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-https://localhost:8443}"
REALM="${REALM:-dive-v3-broker}"
CLIENT_ID="${CLIENT_ID:-dive-v3-broker-client}"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  DIVE V3 - Partner Test Token Gen     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo

# ============================================
# Check if Keycloak is accessible
# ============================================
echo -e "${YELLOW}→${NC} Checking Keycloak availability..."

if ! curl -sk "${KEYCLOAK_URL}/health" > /dev/null 2>&1; then
    if ! curl -sk "${KEYCLOAK_URL}/realms/${REALM}" > /dev/null 2>&1; then
        echo -e "${RED}✗${NC} Keycloak is not accessible at ${KEYCLOAK_URL}"
        echo
        echo "Start Keycloak with: docker-compose up -d keycloak"
        exit 1
    fi
fi

echo -e "${GREEN}✓${NC} Keycloak is accessible"
echo

# ============================================
# Parse arguments or use defaults
# ============================================
USERNAME="${1:-testuser-us}"
PASSWORD="${2:-password123}"

echo -e "${YELLOW}→${NC} Generating token for user: ${BLUE}${USERNAME}${NC}"
echo

# ============================================
# Request token from Keycloak
# ============================================
echo -e "${YELLOW}→${NC} Requesting token from Keycloak..."

RESPONSE=$(curl -sk -X POST "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=${CLIENT_ID}" \
  -d "username=${USERNAME}" \
  -d "password=${PASSWORD}" \
  -d "scope=openid profile" 2>&1)

# Check if request was successful
if echo "$RESPONSE" | jq -e '.access_token' > /dev/null 2>&1; then
    ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token')
    REFRESH_TOKEN=$(echo "$RESPONSE" | jq -r '.refresh_token')
    EXPIRES_IN=$(echo "$RESPONSE" | jq -r '.expires_in')
    
    echo -e "${GREEN}✓${NC} Token generated successfully"
    echo
    
    # Decode token to show claims
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Token Information${NC}"
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo
    
    # Decode JWT (extract payload)
    TOKEN_PAYLOAD=$(echo "$ACCESS_TOKEN" | cut -d. -f2)
    # Add padding if needed
    TOKEN_PAYLOAD_PADDED="${TOKEN_PAYLOAD}$(printf '%*s' $((4 - ${#TOKEN_PAYLOAD} % 4)) | tr ' ' '=')"
    DECODED=$(echo "$TOKEN_PAYLOAD_PADDED" | base64 -d 2>/dev/null || echo "{}")
    
    if echo "$DECODED" | jq . > /dev/null 2>&1; then
        echo -e "${GREEN}User Claims:${NC}"
        echo "$DECODED" | jq '{
            sub,
            uniqueID,
            preferred_username,
            clearance,
            countryOfAffiliation,
            acpCOI,
            dutyOrg,
            iss,
            exp,
            iat
        }' 2>/dev/null || echo "$DECODED" | jq .
        echo
        
        # Show expiration time
        EXP_TIMESTAMP=$(echo "$DECODED" | jq -r '.exp // empty')
        if [ -n "$EXP_TIMESTAMP" ]; then
            EXP_DATE=$(date -r "$EXP_TIMESTAMP" 2>/dev/null || date -d "@$EXP_TIMESTAMP" 2>/dev/null || echo "Unknown")
            echo -e "${YELLOW}Expires:${NC} ${EXP_DATE} (in ${EXPIRES_IN} seconds)"
            echo
        fi
    fi
    
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Access Token (for KAS requests)${NC}"
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo
    echo "$ACCESS_TOKEN"
    echo
    
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Example cURL Command${NC}"
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo
    echo "curl -X POST https://your-kas-url.ngrok.io/request-key \\"
    echo "  -H 'Content-Type: application/json' \\"
    echo "  -d '{"
    echo "    \"resourceId\": \"doc-fuel-inventory-2024\","
    echo "    \"kaoId\": \"kao-test-001\","
    echo "    \"bearerToken\": \"${ACCESS_TOKEN:0:50}...\","
    echo "    \"wrappedKey\": \"dGVzdGtleQ==\""
    echo "  }'"
    echo
    
    # Save to file
    TOKEN_FILE="${PROJECT_ROOT}/tmp/partner-token-${USERNAME}.txt"
    mkdir -p "${PROJECT_ROOT}/tmp"
    cat > "$TOKEN_FILE" <<EOF
# DIVE V3 - Partner Test Token
# Generated: $(date)
# User: ${USERNAME}
# Expires: ${EXP_DATE:-Unknown}

ACCESS_TOKEN="${ACCESS_TOKEN}"

# Example usage:
# export TOKEN="${ACCESS_TOKEN}"
# curl -X POST https://your-kas-url.ngrok.io/request-key \\
#   -H "Content-Type: application/json" \\
#   -d "{\\"resourceId\\": \\"doc-fuel-inventory-2024\\", \\"kaoId\\": \\"kao-001\\", \\"bearerToken\\": \\"\$TOKEN\\", \\"wrappedKey\\": \\"dGVzdGtleQ==\\"}"
EOF
    
    echo -e "${GREEN}✓${NC} Token saved to: ${BLUE}${TOKEN_FILE}${NC}"
    echo
    
    echo -e "${YELLOW}To use in shell:${NC}"
    echo "  export TOKEN=\"${ACCESS_TOKEN:0:50}...\""
    echo
    
else
    echo -e "${RED}✗${NC} Failed to generate token"
    echo
    echo -e "${YELLOW}Response:${NC}"
    echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    echo
    
    # Common error messages
    if echo "$RESPONSE" | grep -q "Invalid user credentials" 2>/dev/null; then
        echo -e "${RED}Error:${NC} Invalid username or password"
        echo
        echo "Available test users:"
        echo "  testuser-us      (SECRET, USA, FVEY)"
        echo "  testuser-fra     (SECRET, FRA, NATO-COSMIC)"
        echo "  testuser-can     (CONFIDENTIAL, CAN, CAN-US)"
        echo "  bob.contractor   (CONFIDENTIAL, USA, US-ONLY)"
        echo
        echo "Default password: password123"
    elif echo "$RESPONSE" | grep -q "Client not found" 2>/dev/null; then
        echo -e "${RED}Error:${NC} Client '${CLIENT_ID}' not found in realm '${REALM}'"
    fi
    
    exit 1
fi

echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Token ready for partner testing!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"

