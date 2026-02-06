#!/bin/bash
# =============================================================================
# Test Cloudflared Tunnel Connectivity for USA, FRA, and GBR
# =============================================================================
# Purpose:
#   Verify that cloudflared tunnels are properly routing traffic to backend services
#
# Usage:
#   ./scripts/test-cloudflared-connectivity.sh
# =============================================================================

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}Testing Cloudflared Tunnel Connectivity - DIVE V3 Federation${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""

# Function to test endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local expected_code=$3

    echo -e "${BLUE}Testing: ${name}${NC}"
    echo -e "  URL: ${url}"

    # Test with curl
    http_code=$(curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 10 "${url}" 2>/dev/null || echo "000")

    if [ "${http_code}" = "${expected_code}" ]; then
        echo -e "  Status: ${GREEN}✅ Success (HTTP ${http_code})${NC}"
        return 0
    elif [ "${http_code}" = "530" ]; then
        echo -e "  Status: ${YELLOW}⚠️  Tunnel connected, backend service not responding (HTTP 530)${NC}"
        return 0
    elif [ "${http_code}" = "000" ]; then
        echo -e "  Status: ${RED}❌ Connection failed (timeout or unreachable)${NC}"
        return 1
    else
        echo -e "  Status: ${YELLOW}⚠️  Unexpected response (HTTP ${http_code})${NC}"
        return 0
    fi
}

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}USA (Hub) Endpoints${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
test_endpoint "Frontend" "https://usa-app.dive25.com" "200"
echo ""
test_endpoint "Backend API" "https://usa-api.dive25.com/api/health" "200"
echo ""
test_endpoint "Keycloak" "https://usa-idp.dive25.com/realms/master" "200"
echo ""
test_endpoint "KAS" "https://usa-kas.dive25.com/health" "200"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}FRA (France) Endpoints${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
test_endpoint "Frontend" "https://fra-app.dive25.com" "200"
echo ""
test_endpoint "Backend API" "https://fra-api.dive25.com/api/health" "200"
echo ""
test_endpoint "Keycloak" "https://fra-idp.dive25.com/realms/master" "200"
echo ""
test_endpoint "KAS" "https://fra-kas.dive25.com/health" "200"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}GBR (United Kingdom) Endpoints${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
test_endpoint "Frontend" "https://gbr-app.dive25.com" "200"
echo ""
test_endpoint "Backend API" "https://gbr-api.dive25.com/api/health" "200"
echo ""
test_endpoint "Keycloak" "https://gbr-idp.dive25.com/realms/master" "200"
echo ""
test_endpoint "KAS" "https://gbr-kas.dive25.com/health" "200"
echo ""

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}Test Complete${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""
echo -e "${YELLOW}Note: HTTP 530 errors indicate tunnel is working but backend service is not running${NC}"
echo -e "${YELLOW}Start backend services with: docker compose up -d${NC}"
echo ""
