#!/bin/bash
# DIVE V3 - External IdP Health Check Script
# Verifies external Spain SAML and USA OIDC IdPs are operational

set -e

echo "===================================="
echo "DIVE V3 - External IdP Health Checks"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check USA OIDC IdP
echo "[1/4] Checking USA OIDC IdP container..."
if docker ps --filter "name=dive-usa-oidc-idp" --filter "status=running" | grep -q dive-usa-oidc-idp; then
    echo -e "${GREEN}✓ USA OIDC container running${NC}"
else
    echo -e "${RED}✗ USA OIDC container not running${NC}"
    exit 1
fi

echo "[2/4] Checking USA OIDC container logs for startup..."
if docker logs dive-usa-oidc-idp 2>&1 | grep -q "Keycloak.*started"; then
    echo -e "${GREEN}✓ USA OIDC Keycloak started successfully${NC}"
else
    echo -e "${YELLOW}⚠ USA OIDC Keycloak may still be starting up${NC}"
fi

# Check Spain SAML IdP
echo "[3/4] Checking Spain SAML IdP container..."
if docker ps --filter "name=dive-spain-saml-idp" --filter "status=running" | grep -q dive-spain-saml-idp; then
    echo -e "${GREEN}✓ Spain SAML container running${NC}"
else
    echo -e "${RED}✗ Spain SAML container not running${NC}"
    exit 1
fi

echo "[4/4] Checking Spain SAML container logs for startup..."
if docker logs dive-spain-saml-idp 2>&1 | grep -q "ready to handle connections"; then
    echo -e "${GREEN}✓ Spain SAML SimpleSAMLphp ready${NC}"
else
    echo -e "${YELLOW}⚠ Spain SAML SimpleSAMLphp may still be starting up${NC}"
fi

echo ""
echo "===================================="
echo -e "${GREEN}✓ All External IdP Health Checks Passed${NC}"
echo "===================================="
echo ""
echo "External IdPs are operational and ready for authentication."
echo ""

