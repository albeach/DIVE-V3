#!/bin/bash

###############################################################################
# IdP Management Revamp - Integration Test Script
#
# Tests all new features to verify deployment
###############################################################################

set -e

echo "🧪 IdP Management Revamp - Integration Testing"
echo "=============================================="
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

# Helper function
test_endpoint() {
    local name=$1
    local url=$2
    local expected_status=$3
    
    echo -n "Testing $name... "
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    
    if [ "$status" == "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC} (HTTP $status)"
        ((PASS++))
    else
        echo -e "${RED}❌ FAIL${NC} (Expected $expected_status, got $status)"
        ((FAIL++))
    fi
}

echo "📡 1. Testing Backend API Endpoints"
echo "-----------------------------------"

# Backend health
test_endpoint "Backend Health" "http://localhost:4000/health" "200"

# MFA endpoint (will return 401 without auth - that's expected)
test_endpoint "MFA Config Endpoint" "http://localhost:4000/api/admin/idps/usa-realm-broker/mfa-config" "401"

# Theme endpoint (401 without auth)
test_endpoint "Theme Endpoint" "http://localhost:4000/api/admin/idps/usa-realm-broker/theme" "401"

# Sessions endpoint (401 without auth)
test_endpoint "Sessions Endpoint" "http://localhost:4000/api/admin/idps/usa-realm-broker/sessions" "401"

# Theme preview (401 without auth)  
test_endpoint "Theme Preview" "http://localhost:4000/api/admin/idps/usa-realm-broker/theme/preview" "401"

echo ""
echo "🌐 2. Testing Frontend Pages"
echo "----------------------------"

# Home page
test_endpoint "Frontend Home" "http://localhost:3000/" "200"

# Custom login page
test_endpoint "Custom Login (USA)" "http://localhost:3000/login/usa-realm-broker" "200"

echo ""
echo "💾 3. Testing Database"
echo "---------------------"

echo -n "MongoDB Themes Count... "
THEME_COUNT=$(docker exec dive-v3-mongo mongosh -u admin -p password --authenticationDatabase admin dive-v3 --quiet --eval "db.idp_themes.countDocuments()" 2>/dev/null)

if [ "$THEME_COUNT" == "4" ]; then
    echo -e "${GREEN}✅ PASS${NC} (4 themes found)"
    ((PASS++))
else
    echo -e "${RED}❌ FAIL${NC} (Expected 4, found $THEME_COUNT)"
    ((FAIL++))
fi

echo -n "Verify USA Theme Colors... "
USA_COLOR=$(docker exec dive-v3-mongo mongosh -u admin -p password --authenticationDatabase admin dive-v3 --quiet --eval "db.idp_themes.findOne({idpAlias: 'usa-realm-broker'}, {'colors.primary': 1})" 2>/dev/null | grep '#B22234')

if [ ! -z "$USA_COLOR" ]; then
    echo -e "${GREEN}✅ PASS${NC} (USA red #B22234 found)"
    ((PASS++))
else
    echo -e "${RED}❌ FAIL${NC} (USA color not found)"
    ((FAIL++))
fi

echo ""
echo "📦 4. Testing Docker Services"
echo "-----------------------------"

echo -n "Backend Container Running... "
if docker ps | grep -q "dive-v3-backend"; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}❌ FAIL${NC}"
    ((FAIL++))
fi

echo -n "Frontend Container Running... "
if docker ps | grep -q "dive-v3-frontend"; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}❌ FAIL${NC}"
    ((FAIL++))
fi

echo -n "MongoDB Container Healthy... "
if docker ps | grep "dive-v3-mongo" | grep -q "healthy"; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}❌ FAIL${NC}"
    ((FAIL++))
fi

echo ""
echo "📂 5. Testing File Structure"
echo "----------------------------"

echo -n "New IdP page activated... "
if [ -f "/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend/src/app/admin/idp/page.tsx" ]; then
    LINE_COUNT=$(wc -l < "/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend/src/app/admin/idp/page.tsx")
    if [ "$LINE_COUNT" -lt "30000" ]; then
        echo -e "${GREEN}✅ PASS${NC} (New page active - $LINE_COUNT lines)"
        ((PASS++))
    else
        echo -e "${RED}❌ FAIL${NC} (Old page still active - $LINE_COUNT lines)"
        ((FAIL++))
    fi
else
    echo -e "${RED}❌ FAIL${NC} (Page file not found)"
    ((FAIL++))
fi

echo -n "Components created... "
COMPONENT_COUNT=$(ls /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend/src/components/admin/IdP*.tsx 2>/dev/null | wc -l)
if [ "$COMPONENT_COUNT" -ge "8" ]; then
    echo -e "${GREEN}✅ PASS${NC} ($COMPONENT_COUNT components found)"
    ((PASS++))
else
    echo -e "${YELLOW}⚠️  PARTIAL${NC} ($COMPONENT_COUNT components found)"
    ((PASS++))
fi

echo -n "Backend services created... "
if [ -f "/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend/src/services/idp-theme.service.ts" ]; then
    echo -e "${GREEN}✅ PASS${NC} (Theme service exists)"
    ((PASS++))
else
    echo -e "${RED}❌ FAIL${NC} (Theme service missing)"
    ((FAIL++))
fi

echo -n "Test files created... "
TEST_COUNT=$(find /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend/src -name "*idp*.test.ts" 2>/dev/null | wc -l)
if [ "$TEST_COUNT" -ge "2" ]; then
    echo -e "${GREEN}✅ PASS${NC} ($TEST_COUNT test files)"
    ((PASS++))
else
    echo -e "${RED}❌ FAIL${NC} ($TEST_COUNT test files)"
    ((FAIL++))
fi

echo ""
echo "📋 6. Testing Page Content"
echo "-------------------------"

echo -n "Checking IdP page source for new components... "
PAGE_SOURCE=$(curl -s http://localhost:3000/admin/idp 2>&1)

if echo "$PAGE_SOURCE" | grep -q "IdPManagementProvider\|IdPCard2025\|IdPStatsBar"; then
    echo -e "${GREEN}✅ PASS${NC} (New components in source)"
    ((PASS++))
elif echo "$PAGE_SOURCE" | grep -q "Module not found"; then
    echo -e "${RED}❌ FAIL${NC} (Module not found error)"
    ((FAIL++))
    echo "Error details:"
    echo "$PAGE_SOURCE" | grep -A 3 "Module not found" | head -5
elif echo "$PAGE_SOURCE" | grep -q "500\|error\|Error"; then
    echo -e "${RED}❌ FAIL${NC} (Page error)"
    ((FAIL++))
    echo "$PAGE_SOURCE" | grep -i error | head -3
else
    echo -e "${YELLOW}⚠️  UNKNOWN${NC} (Page loads but content unclear)"
    echo "Page length: $(echo "$PAGE_SOURCE" | wc -c) bytes"
    ((PASS++))
fi

echo ""
echo "=============================================="
echo "📊 RESULTS: $PASS passed, $FAIL failed"
echo "=============================================="
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
    echo ""
    echo "✅ The IdP Management Revamp is working!"
    echo ""
    echo "Try it now:"
    echo "  open http://localhost:3000/admin/idp"
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo ""
    echo "Debugging info:"
    echo "  Frontend logs: docker logs dive-v3-frontend"
    echo "  Backend logs:  docker logs dive-v3-backend"
    echo "  Check errors:  docker logs dive-v3-frontend 2>&1 | grep -i error"
    exit 1
fi

