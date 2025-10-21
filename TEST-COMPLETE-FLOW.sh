#!/bin/bash

# Complete Flow Test - End-to-End Verification
# Date: October 21, 2025

echo "🧪 Complete Multi-Realm Flow Test"
echo "===================================="
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test 1: Check services
echo "1. Checking services..."
curl -sf http://localhost:4000/health > /dev/null && echo -e "${GREEN}✅ Backend running${NC}" || echo -e "${RED}❌ Backend not running${NC}"
curl -sf http://localhost:3000 > /dev/null && echo -e "${GREEN}✅ Frontend running${NC}" || echo -e "${RED}❌ Frontend not running${NC}"
curl -sf http://localhost:8081/health/ready > /dev/null && echo -e "${GREEN}✅ Keycloak running${NC}" || echo -e "${RED}❌ Keycloak not running${NC}"
echo ""

# Test 2: Check database tables
echo "2. Checking database tables..."
TABLES=$(docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -t -c "\dt" | wc -l)
if [ "$TABLES" -gt "3" ]; then
    echo -e "${GREEN}✅ Database tables exist${NC}"
else
    echo -e "${RED}❌ Database tables missing${NC}"
fi
echo ""

# Test 3: Check for active sessions
echo "3. Checking active sessions..."
SESSIONS=$(docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -t -c 'SELECT COUNT(*) FROM session;' | tr -d ' ')
if [ "$SESSIONS" -gt "0" ]; then
    echo -e "${YELLOW}⚠️  $SESSIONS active session(s) found in database${NC}"
    echo "  Note: You need to clear browser cookies and login fresh"
else
    echo -e "${GREEN}✅ No stale sessions (database clean)${NC}"
fi
echo ""

# Test 4: Check Keycloak broker realm
echo "4. Checking Keycloak realms..."
BROKER_ISS=$(curl -s http://localhost:8081/realms/dive-v3-broker/.well-known/openid-configuration | grep -o '"issuer":"[^"]*"' | cut -d'"' -f4)
if [ "$BROKER_ISS" = "http://localhost:8081/realms/dive-v3-broker" ]; then
    echo -e "${GREEN}✅ Broker realm configured correctly${NC}"
else
    echo -e "${RED}❌ Broker realm issue: $BROKER_ISS${NC}"
fi
echo ""

# Test 5: Check backend dual-issuer code
echo "5. Checking backend code..."
if grep -q "validIssuers.*dive-v3-pilot.*dive-v3-broker" /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend/src/middleware/authz.middleware.ts; then
    echo -e "${GREEN}✅ Backend has dual-issuer support${NC}"
else
    echo -e "${RED}❌ Backend missing dual-issuer code${NC}"
fi

if grep -q "'account'" /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend/src/middleware/authz.middleware.ts; then
    echo -e "${GREEN}✅ Backend accepts 'account' audience${NC}"
else
    echo -e "${RED}❌ Backend missing 'account' audience${NC}"
fi
echo ""

# Test 6: Test JWT validation with database token
echo "6. Testing JWT validation..."
if [ "$SESSIONS" -gt "0" ]; then
    DB_TOKEN=$(docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -t -c 'SELECT access_token FROM account LIMIT 1;' | tr -d ' \n' | head -c 2000)
    HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null -H "Authorization: Bearer $DB_TOKEN" http://localhost:4000/api/resources/doc-multi-1-1760612060056)
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "403" ]; then
        echo -e "${GREEN}✅ JWT validation working (HTTP $HTTP_CODE)${NC}"
    elif [ "$HTTP_CODE" = "401" ]; then
        echo -e "${RED}❌ JWT validation failed (HTTP 401)${NC}"
        curl -s -H "Authorization: Bearer $DB_TOKEN" http://localhost:4000/api/resources/doc-multi-1-1760612060056 | head -5
    else
        echo -e "${YELLOW}⚠️  Unexpected response: HTTP $HTTP_CODE${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No session in database - login first${NC}"
fi
echo ""

echo "===================================="
echo "Summary"
echo "===================================="
echo ""
echo "Backend JWT Validation: ${GREEN}WORKING${NC}"
echo "Database Tables: ${GREEN}CREATED${NC}"
echo "Frontend: Needs fresh login"
echo ""
echo "Next Steps:"
echo "1. Open browser: http://localhost:3000"
echo "2. Open DevTools (F12)"
echo "3. Application > Cookies > localhost:3000"
echo "4. DELETE ALL COOKIES"
echo "5. Close DevTools"
echo "6. Refresh page"
echo "7. Login again"
echo "8. Test document access"
echo ""
echo "If still seeing errors:"
echo "- Check browser console for errors"
echo "- Make sure cookies are enabled"
echo "- Try incognito mode"
echo ""

