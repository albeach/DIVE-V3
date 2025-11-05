#!/bin/bash

###############################################################################
# DIVE V3 - Debug Script for AMR and Resources Issues
###############################################################################

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║       DIVE V3 - Debug AMR & Resources Issues                ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f docker-compose.yml ]; then
    echo -e "${RED}Error: Run this from the DIVE V3 project root${NC}"
    exit 1
fi

###############################################################################
# Issue 1: AMR Appears Blank
###############################################################################

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Issue 1: AMR (Authentication Methods Reference) is Blank${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Diagnosis:${NC}"
echo "AMR mappers in national realms use jsonType.label = 'String'"
echo "BUT Keycloak 26 expects AMR to be an array: [\"pwd\"], [\"pwd\",\"otp\"]"
echo ""
echo "The mapper should use jsonType.label = 'JSON' to preserve array format"
echo ""

echo -e "${YELLOW}Check Current Configuration:${NC}"
echo ""
echo "Run this in Keycloak Admin Console:"
echo "  1. Go to dive-v3-usa realm → Clients → dive-v3-broker-client"
echo "  2. Click 'Client scopes' tab → Click 'dive-v3-usa-dedicated'"
echo "  3. Click 'Mappers' tab → Find 'amr-from-session'"
echo "  4. Check 'Token Claim JSON Type' - should be 'JSON' not 'String'"
echo ""

###############################################################################
# Issue 2: Resources Page is Blank
###############################################################################

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Issue 2: Resources Page is Blank${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Checking backend connectivity...${NC}"
echo ""

# Check if backend container is running
if docker compose ps backend | grep -q "Up"; then
    echo -e "${GREEN}✓${NC} Backend container is running"
else
    echo -e "${RED}✗${NC} Backend container is NOT running!"
    echo ""
    echo "Start backend with: docker compose up -d backend"
    exit 1
fi

# Check if MongoDB container is running
if docker compose ps mongo | grep -q "Up"; then
    echo -e "${GREEN}✓${NC} MongoDB container is running"
else
    echo -e "${RED}✗${NC} MongoDB container is NOT running!"
    echo ""
    echo "Start MongoDB with: docker compose up -d mongo"
    exit 1
fi

# Check MongoDB connection from backend
echo ""
echo -e "${YELLOW}Checking MongoDB connection...${NC}"
if docker compose exec -T mongo mongosh --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} MongoDB is responsive"
else
    echo -e "${RED}✗${NC} MongoDB is not responding"
fi

# Check if resources exist in MongoDB
echo ""
echo -e "${YELLOW}Checking MongoDB resources collection...${NC}"
RESOURCE_COUNT=$(docker compose exec -T mongo mongosh dive-v3 --quiet --eval "db.resources.countDocuments({})" 2>/dev/null | tail -1)
if [ -n "$RESOURCE_COUNT" ] && [ "$RESOURCE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Found $RESOURCE_COUNT resources in MongoDB"
    
    # Show sample resource
    echo ""
    echo -e "${CYAN}Sample resource:${NC}"
    docker compose exec -T mongo mongosh dive-v3 --quiet --eval "db.resources.findOne({}, {resourceId:1, title:1, classification:1, _id:0})" 2>/dev/null | tail -5
else
    echo -e "${RED}✗${NC} No resources found in MongoDB!"
    echo ""
    echo "Seed the database with:"
    echo "  cd backend && npm run seed-database"
fi

# Check backend API endpoint
echo ""
echo -e "${YELLOW}Checking backend API endpoint...${NC}"
if curl -k -sf https://localhost:4000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend /health endpoint is accessible"
else
    echo -e "${RED}✗${NC} Backend /health endpoint not accessible"
fi

if curl -k -sf https://localhost:4000/api/resources > /dev/null 2>&1; then
    RESPONSE=$(curl -k -s https://localhost:4000/api/resources | head -c 100)
    echo -e "${GREEN}✓${NC} Backend /api/resources endpoint is accessible"
    echo "   Response preview: ${RESPONSE:0:80}..."
else
    echo -e "${RED}✗${NC} Backend /api/resources endpoint NOT accessible"
    echo ""
    echo "This is the likely cause of blank resources page!"
fi

# Check backend logs for errors
echo ""
echo -e "${YELLOW}Checking backend logs for errors...${NC}"
ERROR_COUNT=$(docker compose logs backend --tail 50 | grep -i "error" | wc -l | tr -d ' ')
if [ "$ERROR_COUNT" -gt 0 ]; then
    echo -e "${RED}✗${NC} Found $ERROR_COUNT errors in backend logs"
    echo ""
    echo "Recent errors:"
    docker compose logs backend --tail 50 | grep -i "error" | head -5
else
    echo -e "${GREEN}✓${NC} No errors in recent backend logs"
fi

# Check frontend environment variables
echo ""
echo -e "${YELLOW}Checking frontend environment variables...${NC}"
BACKEND_URL=$(docker compose exec -T nextjs printenv NEXT_PUBLIC_BACKEND_URL 2>/dev/null || echo "NOT SET")
echo "NEXT_PUBLIC_BACKEND_URL = $BACKEND_URL"

if [ "$BACKEND_URL" = "NOT SET" ] || [ -z "$BACKEND_URL" ]; then
    echo -e "${RED}✗${NC} NEXT_PUBLIC_BACKEND_URL is not set!"
    echo ""
    echo "The frontend doesn't know where to find the backend!"
    echo ""
    echo "Fix: Check docker-compose.hostname.yml or docker-compose.yml"
    echo "Should have: NEXT_PUBLIC_BACKEND_URL: https://your-hostname:4000"
else
    echo -e "${GREEN}✓${NC} NEXT_PUBLIC_BACKEND_URL is configured"
fi

###############################################################################
# Summary and Recommendations
###############################################################################

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                       Summary                             ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${CYAN}AMR Issue Fix:${NC}"
echo "  1. The Terraform configuration needs jsonType = 'JSON' for AMR"
echo "  2. This is FIXED in the next commit"
echo "  3. Apply with: cd terraform && terraform apply"
echo ""

echo -e "${CYAN}Resources Issue Checklist:${NC}"
echo "  1. ✓ Backend container running?"
echo "  2. ✓ MongoDB container running?"
echo "  3. ✓ Resources seeded in MongoDB?"
echo "  4. ✓ Backend API /api/resources accessible?"
echo "  5. ✓ NEXT_PUBLIC_BACKEND_URL environment variable set?"
echo ""

echo -e "${CYAN}Quick Test:${NC}"
echo "  # Test backend API directly:"
echo "  curl -k https://localhost:4000/api/resources"
echo ""
echo "  # If that returns resources but frontend is blank,"
echo "  # check browser DevTools → Console for errors"
echo ""

echo -e "${CYAN}Most Likely Causes:${NC}"
echo "  1. NEXT_PUBLIC_BACKEND_URL points to wrong hostname"
echo "  2. MongoDB hasn't been seeded (run: cd backend && npm run seed)"
echo "  3. Backend can't connect to MongoDB (check MONGODB_URI)"
echo "  4. CORS issue (check backend CORS_ALLOWED_ORIGINS)"
echo ""

