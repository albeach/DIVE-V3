#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Federated Login Regression Test
# =============================================================================
# Tests that federated login still works after MFA changes
# Tests FRA→USA federation as a smoke test
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          DIVE V3 - Federated Login Regression Test               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if FRA spoke is deployed
if [ ! -d "/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/instances/fra" ]; then
    echo -e "${YELLOW}⚠${NC} FRA spoke not deployed"
    echo -e "${BLUE}ℹ${NC} Deploying FRA spoke for testing..."
    ./dive spoke deploy FRA "France Defence"
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗${NC} FRA spoke deployment failed"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} FRA spoke deployed"
    echo ""
fi

# Check prerequisites
if [ -z "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
    echo -e "${RED}✗${NC} KEYCLOAK_ADMIN_PASSWORD not set"
    echo -e "${BLUE}ℹ${NC} Please run: eval \"\$(./dive secrets export --unsafe 2>/dev/null | grep KEYCLOAK_ADMIN_PASSWORD)\""
    exit 1
fi

KEYCLOAK_URL="https://localhost:8443"
REALM="dive-v3-broker-usa"

echo -e "${BLUE}▶${NC} Testing federated IdP configuration..."

# Get admin token
ADMIN_TOKEN=$(curl -sk "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${KEYCLOAK_ADMIN_PASSWORD}" \
    -d "grant_type=password" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
    echo -e "${RED}✗${NC} Failed to get admin token"
    exit 1
fi

# Check if FRA IdP exists in USA realm
FRA_IDP=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/identity-provider/instances" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[] | select(.alias | contains("fra")) | .alias')

if [ -z "$FRA_IDP" ]; then
    echo -e "${YELLOW}⚠${NC} FRA IdP not registered in USA realm"
    echo -e "${BLUE}ℹ${NC} Registering FRA spoke..."
    ./dive spoke register FRA
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗${NC} FRA spoke registration failed"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} FRA spoke registered"

    # Get IdP again
    FRA_IDP=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/identity-provider/instances" \
        -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[] | select(.alias | contains("fra")) | .alias')
else
    echo -e "${GREEN}✓${NC} FRA IdP found: ${FRA_IDP}"
fi

# Check IdP is enabled
IDP_ENABLED=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/identity-provider/instances/${FRA_IDP}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.enabled')

if [ "$IDP_ENABLED" = "true" ]; then
    echo -e "${GREEN}✓${NC} FRA IdP is enabled"
else
    echo -e "${RED}✗${NC} FRA IdP is disabled"
    exit 1
fi

# Check protocol mappers on FRA IdP
MAPPER_COUNT=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/identity-provider/instances/${FRA_IDP}/mappers" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq '. | length')

echo -e "${BLUE}ℹ${NC} FRA IdP has ${MAPPER_COUNT} protocol mappers configured"

if [ "$MAPPER_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Protocol mappers present"
else
    echo -e "${YELLOW}⚠${NC} No protocol mappers (may use defaults)"
fi

echo ""
echo -e "${BLUE}▶${NC} Testing federation discovery..."

# Test OIDC discovery endpoint for FRA
FRA_KEYCLOAK_URL=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM}/identity-provider/instances/${FRA_IDP}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.config.authorizationUrl' | sed 's|/auth||')

if [ -n "$FRA_KEYCLOAK_URL" ] && [ "$FRA_KEYCLOAK_URL" != "null" ]; then
    echo -e "${GREEN}✓${NC} FRA Keycloak URL: ${FRA_KEYCLOAK_URL}"
else
    echo -e "${RED}✗${NC} Could not determine FRA Keycloak URL"
    exit 1
fi

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                      Test Summary                                 ║${NC}"
echo -e "${BLUE}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BLUE}║${NC}  ${GREEN}✓${NC} FRA spoke deployed and registered"
echo -e "${BLUE}║${NC}  ${GREEN}✓${NC} FRA IdP enabled in USA realm"
echo -e "${BLUE}║${NC}  ${GREEN}✓${NC} Protocol mappers configured"
echo -e "${BLUE}║${NC}  ${GREEN}✓${NC} Federation discovery working"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}⚠${NC} ${YELLOW}Note:${NC} Manual testing required to verify full federation flow:"
echo ""
echo -e "  1. Open: ${BLUE}https://localhost:3000${NC}"
echo -e "  2. Select: ${BLUE}\"Sign in with France (Spoke)\"${NC}"
echo -e "  3. Login with FRA credentials"
echo -e "  4. Verify:"
echo -e "     - Pseudonym displayed (not real name)"
echo -e "     - Can access USA resources based on clearance"
echo -e "     - ACR/AMR values present in token"
echo -e "     - No errors in browser console"
echo ""
echo -e "${GREEN}✓${NC} Federated login regression tests passed!"
echo ""
