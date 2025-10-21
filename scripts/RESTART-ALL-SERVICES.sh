#!/bin/bash

# Multi-Realm Migration - Complete System Restart
# Date: October 21, 2025
# Purpose: Restart all services to load new dual-issuer JWT validation code

set -e

echo "🔄 Multi-Realm Migration - System Restart"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Kill all running Node processes
echo "📍 Step 1: Stopping all Node.js processes..."
pkill -f "node.*backend" || echo "  (backend not running)"
pkill -f "node.*frontend" || echo "  (frontend not running)"
pkill -f "next" || echo "  (Next.js not running)"
sleep 2
echo -e "${GREEN}✅ All Node.js processes stopped${NC}"
echo ""

# Step 2: Verify environment variables
echo "📍 Step 2: Verifying environment variables..."
if grep -q "KEYCLOAK_REALM=dive-v3-broker" .env.local; then
    echo -e "${GREEN}✅ Root .env.local: KEYCLOAK_REALM=dive-v3-broker${NC}"
else
    echo -e "${RED}❌ Root .env.local: KEYCLOAK_REALM NOT set to dive-v3-broker${NC}"
    echo "  Fix: Edit .env.local and set KEYCLOAK_REALM=dive-v3-broker"
    exit 1
fi

if grep -q "KEYCLOAK_REALM=dive-v3-broker" frontend/.env.local; then
    echo -e "${GREEN}✅ Frontend .env.local: KEYCLOAK_REALM=dive-v3-broker${NC}"
else
    echo -e "${RED}❌ Frontend .env.local: KEYCLOAK_REALM NOT set to dive-v3-broker${NC}"
    echo "  Fix: Edit frontend/.env.local and set KEYCLOAK_REALM=dive-v3-broker"
    exit 1
fi
echo ""

# Step 3: Verify Keycloak realms exist
echo "📍 Step 3: Verifying Keycloak realms..."
if curl -s http://localhost:8081/realms/dive-v3-broker/.well-known/openid-configuration > /dev/null 2>&1; then
    echo -e "${GREEN}✅ dive-v3-broker realm exists${NC}"
else
    echo -e "${RED}❌ dive-v3-broker realm NOT found${NC}"
    echo "  Fix: Run 'cd terraform && terraform apply -var=\"enable_multi_realm=true\" -auto-approve'"
    exit 1
fi

if curl -s http://localhost:8081/realms/dive-v3-pilot/.well-known/openid-configuration > /dev/null 2>&1; then
    echo -e "${GREEN}✅ dive-v3-pilot realm exists (backward compatibility)${NC}"
else
    echo -e "${YELLOW}⚠️  dive-v3-pilot realm NOT found (legacy realm missing)${NC}"
fi
echo ""

# Step 4: Restart backend
echo "📍 Step 4: Starting backend..."
cd backend
npm run dev > /tmp/dive-backend.log 2>&1 &
BACKEND_PID=$!
echo "  Backend started (PID: $BACKEND_PID)"
echo "  Logs: tail -f /tmp/dive-backend.log"
cd ..
echo -e "${GREEN}✅ Backend starting...${NC}"
echo ""

# Step 5: Wait for backend to be ready
echo "📍 Step 5: Waiting for backend to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:4000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend ready${NC}"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# Step 6: Restart frontend
echo "📍 Step 6: Starting frontend..."
cd frontend
npm run dev > /tmp/dive-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "  Frontend started (PID: $FRONTEND_PID)"
echo "  Logs: tail -f /tmp/dive-frontend.log"
cd ..
echo -e "${GREEN}✅ Frontend starting...${NC}"
echo ""

# Step 7: Wait for frontend to be ready
echo "📍 Step 7: Waiting for frontend to be ready..."
for i in {1..60}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Frontend ready${NC}"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# Step 8: Show service status
echo ""
echo "=========================================="
echo "🎉 All services restarted!"
echo "=========================================="
echo ""
echo "Service Status:"
echo "  Backend:  http://localhost:4000 (PID: $BACKEND_PID)"
echo "  Frontend: http://localhost:3000 (PID: $FRONTEND_PID)"
echo ""
echo "Logs:"
echo "  Backend:  tail -f /tmp/dive-backend.log"
echo "  Frontend: tail -f /tmp/dive-frontend.log"
echo ""
echo "Next Steps:"
echo "  1. Open http://localhost:3000 in browser"
echo "  2. Logout (if logged in)"
echo "  3. Clear browser cookies for localhost:3000"
echo "  4. Login again"
echo "  5. Try accessing a document"
echo ""
echo "Expected Behavior:"
echo "  - Navigation shows ocean pseudonym (e.g., 'Azure Whale')"
echo "  - Sign Out button works"
echo "  - Session Details shows '*** REDACTED (PII) ***' for name/email"
echo "  - Documents accessible (no 'Invalid JWT' errors)"
echo ""
echo "If still seeing 'Invalid JWT' errors:"
echo "  1. Check backend logs: tail -f /tmp/dive-backend.log"
echo "  2. Look for JWT verification errors"
echo "  3. Verify token issuer matches validIssuers array"
echo ""


