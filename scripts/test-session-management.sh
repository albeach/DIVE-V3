#!/bin/bash

###############################################################################
# Session Management Testing Script
# 
# Tests the enhanced session management features in DIVE V3
# Week 3.4 - Session Management Improvements
###############################################################################

set -e

echo "🧪 DIVE V3 - Session Management Testing"
echo "======================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if services are running
echo "📋 Checking prerequisites..."

if ! docker ps | grep -q keycloak; then
    echo -e "${RED}❌ Keycloak is not running${NC}"
    echo "   Start with: docker-compose up -d keycloak"
    exit 1
fi

if ! docker ps | grep -q postgres; then
    echo -e "${RED}❌ PostgreSQL is not running${NC}"
    echo "   Start with: docker-compose up -d postgres"
    exit 1
fi

echo -e "${GREEN}✅ All services running${NC}"
echo ""

# Test 1: Session Refresh API
echo "🧪 Test 1: Session Refresh API"
echo "------------------------------"

RESPONSE=$(curl -s http://localhost:3000/api/session/refresh)
if [[ $RESPONSE == *"authenticated"* ]]; then
    echo -e "${GREEN}✅ API responding${NC}"
else
    echo -e "${RED}❌ API not responding correctly${NC}"
    echo "   Response: $RESPONSE"
fi
echo ""

# Test 2: Check component files exist
echo "🧪 Test 2: Component Files"
echo "-------------------------"

FILES=(
    "frontend/src/components/auth/session-status-indicator.tsx"
    "frontend/src/components/auth/session-expiry-modal.tsx"
    "frontend/src/components/auth/token-expiry-checker.tsx"
    "frontend/src/components/auth/session-error-boundary.tsx"
    "frontend/src/app/api/session/refresh/route.ts"
)

for file in "${FILES[@]}"; do
    if [[ -f "$file" ]]; then
        echo -e "${GREEN}✅ $file${NC}"
    else
        echo -e "${RED}❌ Missing: $file${NC}"
    fi
done
echo ""

# Test 3: Check dependencies
echo "🧪 Test 3: Dependencies"
echo "----------------------"

cd frontend
if grep -q "@headlessui/react" package.json; then
    echo -e "${GREEN}✅ @headlessui/react installed${NC}"
else
    echo -e "${YELLOW}⚠️  @headlessui/react not found in package.json${NC}"
    echo "   Install with: npm install @headlessui/react --legacy-peer-deps"
fi
cd ..
echo ""

# Test 4: TypeScript compilation
echo "🧪 Test 4: TypeScript Compilation"
echo "---------------------------------"

cd frontend
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✅ TypeScript compiles successfully${NC}"
else
    echo -e "${RED}❌ TypeScript compilation failed${NC}"
    echo "   Run: npm run build"
fi
cd ..
echo ""

# Manual testing instructions
echo "📖 Manual Testing Instructions"
echo "==============================="
echo ""
echo "1. Login to DIVE V3"
echo "   → Should see green session indicator in nav bar"
echo ""
echo "2. Wait 10-12 minutes (or modify REFRESH_THRESHOLD to 60s for faster testing)"
echo "   → Auto-refresh should occur (check console logs)"
echo ""
echo "3. Wait until 2 minutes remaining"
echo "   → Warning modal should appear with countdown"
echo ""
echo "4. Click 'Extend Session'"
echo "   → Modal should close and session extend"
echo ""
echo "5. Let session expire (wait 15+ minutes)"
echo "   → Expired modal should appear (non-dismissible)"
echo ""
echo "6. Test mobile view"
echo "   → Session indicator should be visible"
echo ""
echo "7. Test error boundary"
echo "   → Disconnect database and reload page"
echo "   → Should show error screen instead of white page"
echo ""

echo "🔍 Check Console Logs For:"
echo "-------------------------"
echo "  [TokenExpiry] Token status: ..."
echo "  [DIVE] Proactive token refresh"
echo "  [SessionRefresh] Manual refresh requested"
echo ""

echo "✅ Testing guide complete!"
echo ""
echo "📚 Full documentation: docs/SESSION-MANAGEMENT-IMPROVEMENTS.md"

