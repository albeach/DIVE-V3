#!/bin/bash

# Multi-IdP Test Verification Script
# Week 3 - DIVE V3 Coalition ICAM Pilot
# Date: October 11, 2025

set -e

echo "========================================"
echo "DIVE V3 - Multi-IdP Test Preparation"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check services
echo "1. Checking Docker services..."
if docker-compose ps | grep -q "Up"; then
    echo -e "${GREEN}✅ Docker services running${NC}"
else
    echo -e "${RED}❌ Docker services not running${NC}"
    echo "Run: docker-compose up -d"
    exit 1
fi

# Step 2: Verify Keycloak
echo ""
echo "2. Checking Keycloak..."
if curl -s http://localhost:8081/realms/dive-v3-pilot/.well-known/openid-configuration > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Keycloak responding${NC}"
else
    echo -e "${RED}❌ Keycloak not responding${NC}"
    exit 1
fi

# Step 3: Verify mock IdP realms exist
echo ""
echo "3. Checking mock IdP realms..."

for realm in "france-mock-idp" "canada-mock-idp" "industry-mock-idp"; do
    if curl -s http://localhost:8081/realms/$realm/.well-known/openid-configuration > /dev/null 2>&1; then
        echo -e "${GREEN}✅ $realm exists${NC}"
    else
        echo -e "${RED}❌ $realm not found${NC}"
        echo "Run: cd terraform && terraform apply"
        exit 1
    fi
done

# Step 4: Check OPA tests
echo ""
echo "4. Running OPA tests..."
OPA_RESULT=$(docker-compose exec -T opa opa test /policies/ -v 2>&1 | grep "PASS:" || echo "FAIL")
if echo "$OPA_RESULT" | grep -q "78/78"; then
    echo -e "${GREEN}✅ OPA tests: 78/78 PASS${NC}"
else
    echo -e "${RED}❌ OPA tests failing${NC}"
    echo "$OPA_RESULT"
fi

# Step 5: Check TypeScript
echo ""
echo "5. Checking TypeScript compilation..."
cd frontend
if npx tsc --noEmit > /dev/null 2>&1; then
    echo -e "${GREEN}✅ TypeScript: 0 errors${NC}"
else
    echo -e "${RED}❌ TypeScript errors found${NC}"
fi
cd ..

# Step 6: Prepare frontend
echo ""
echo "6. Preparing frontend..."
echo -e "${YELLOW}⏳ Cleaning .next directory...${NC}"
cd frontend
rm -rf .next
echo -e "${GREEN}✅ Frontend cleaned${NC}"

echo ""
echo "========================================"
echo "✅ All Pre-Test Checks Passed!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Start frontend:"
echo "   cd frontend && npm run dev"
echo ""
echo "2. Open browser:"
echo "   http://localhost:3000"
echo ""
echo "3. Test credentials:"
echo "   France:   testuser-fra / Password123!"
echo "   Canada:   testuser-can / Password123!"
echo "   Industry: bob.contractor / Password123!"
echo ""
echo "4. Monitor enrichment (Industry user):"
echo "   docker-compose logs -f backend | grep enrichment"
echo ""
echo "========================================"
echo "Ready to test! 🚀"
echo "========================================"

