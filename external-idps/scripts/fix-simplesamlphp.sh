#!/bin/bash

# DIVE V3 - SimpleSAMLphp Fix Script
# Uses OFFICIAL SimpleSAMLphp v2.4.3 from GitHub
# https://github.com/simplesamlphp/simplesamlphp/releases/tag/v2.4.3

set -e

echo "============================================"
echo "SimpleSAMLphp Fix & Upgrade Script"
echo "============================================"
echo ""
echo "This script will:"
echo "  ✅ Build SimpleSAMLphp v2.4.3 from OFFICIAL GitHub release"
echo "  ✅ Fix metadata configuration mismatch"
echo "  ✅ Resolve 'Could not find any default metadata entities' error"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

cd "$(dirname "$0")/.."

# Step 1: Stop current container
echo -e "${YELLOW}[1/5]${NC} Stopping Spain SAML IdP container..."
docker-compose down spain-saml 2>/dev/null || true
docker rm -f dive-spain-saml-idp 2>/dev/null || true

# Step 2: Build new image from official source
echo -e "${YELLOW}[2/5]${NC} Building SimpleSAMLphp v2.4.3 from official GitHub release..."
echo "  Source: https://github.com/simplesamlphp/simplesamlphp/releases/tag/v2.4.3"
docker-compose build --no-cache spain-saml

# Step 3: Verify configuration files
echo -e "${YELLOW}[3/5]${NC} Verifying configuration files..."

if [ ! -f "spain-saml/metadata/saml20-idp-hosted.php" ]; then
    echo -e "${RED}❌ Missing saml20-idp-hosted.php${NC}"
    exit 1
fi

if [ ! -f "spain-saml/config/config.php" ]; then
    echo -e "${RED}❌ Missing config.php${NC}"
    exit 1
fi

if [ ! -f "spain-saml/config/authsources.php" ]; then
    echo -e "${RED}❌ Missing authsources.php${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All configuration files present${NC}"

# Step 4: Verify certificates
echo -e "${YELLOW}[4/5]${NC} Checking SAML certificates..."

if [ ! -f "spain-saml/cert/server.crt" ] || [ ! -f "spain-saml/cert/server.pem" ]; then
    echo -e "${YELLOW}⚠️  Certificates missing - generating new ones...${NC}"
    ./scripts/generate-spain-saml-certs.sh
else
    echo -e "${GREEN}✅ Certificates present${NC}"
fi

# Step 5: Start updated container
echo -e "${YELLOW}[5/5]${NC} Starting Spain SAML IdP with v2.4.3..."
docker-compose up -d spain-saml

# Wait for container to be healthy
echo ""
echo "Waiting for SimpleSAMLphp to start..."
sleep 5

# Health check
MAX_RETRIES=12
RETRY_COUNT=0
HEALTHY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf http://localhost:9443/simplesaml/ > /dev/null 2>&1; then
        HEALTHY=true
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT+1))
    echo "  Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 5
done

echo ""
echo "============================================"
if [ "$HEALTHY" = true ]; then
    echo -e "${GREEN}✅ SimpleSAMLphp v2.4.3 is running successfully!${NC}"
    echo ""
    echo "Test URLs:"
    echo "  • Admin UI:      http://localhost:9443/simplesaml/"
    echo "  • IdP Metadata:  http://localhost:9443/simplesaml/saml2/idp/metadata.php"
    echo ""
    echo "Verify the metadata endpoint shows:"
    echo "  EntityID: http://localhost:9443/simplesaml/saml2/idp/metadata.php"
    echo ""
else
    echo -e "${RED}❌ SimpleSAMLphp failed to start${NC}"
    echo ""
    echo "Check logs with:"
    echo "  docker logs dive-spain-saml-idp"
    exit 1
fi

echo "============================================"
echo ""
echo "Next Steps:"
echo "  1. Visit http://localhost:9443/simplesaml/"
echo "  2. Login with admin password: admin123"
echo "  3. Navigate to 'Federation' → 'SAML 2.0 IdP Metadata'"
echo "  4. Verify EntityID matches: http://localhost:9443/simplesaml/saml2/idp/metadata.php"
echo ""
echo "Security Note:"
echo "  ⚠️  Version 2.4.3 includes fixes for CVE-2025-27773 (signature bypass)"
echo "  🔒 Production deployments should use HTTPS and update admin password"
echo ""

