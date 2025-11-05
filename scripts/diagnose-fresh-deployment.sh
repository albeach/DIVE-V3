#!/bin/bash

###############################################################################
# DIVE V3 - Diagnose Fresh Deployment Issues
# For when deploy-ubuntu.sh completes but AMR/Resources still broken
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
echo -e "${BLUE}║       DIVE V3 - Fresh Deployment Diagnostics                 ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# Issue 1: AMR is NULL - Deep Diagnosis
###############################################################################

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Issue 1: AMR is NULL - Checking Identity Brokering Chain${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}The Problem:${NC}"
echo "When using identity brokering, AMR must flow through 3 stages:"
echo "  1. National Realm (dive-v3-usa) sets AMR in session"
echo "  2. IdP Broker copies AMR from national realm token"
echo "  3. Broker Realm (dive-v3-broker) includes AMR in app token"
echo ""

echo -e "${YELLOW}Checking Stage 1: National Realm AMR Mapper${NC}"
echo ""
echo "The national realm client (dive-v3-broker-client in dive-v3-usa)"
echo "needs an AMR mapper with jsonType = JSON"
echo ""

# Check if Terraform files have the fix
if grep -q '"jsonType.label".*=.*"JSON"' terraform/usa-realm.tf 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Terraform config has AMR JSON fix"
else
    echo -e "${RED}✗${NC} Terraform config MISSING AMR JSON fix!"
fi

echo ""
echo -e "${YELLOW}Checking Stage 2: IdP Broker AMR Mapper (THE MISSING PIECE!)${NC}"
echo ""
echo "THE REAL ISSUE: The IdP broker configuration needs to COPY AMR"
echo "from the upstream IdP token into the broker realm session!"
echo ""

# Check if IdP brokers have AMR mappers
if grep -q "usa_broker_amr" terraform/usa-broker.tf 2>/dev/null; then
    echo -e "${GREEN}✓${NC} USA IdP broker has AMR mapper"
else
    echo -e "${RED}✗${NC} USA IdP broker MISSING AMR mapper!"
    echo -e "${RED}   THIS IS WHY AMR IS NULL!${NC}"
fi

echo ""
echo -e "${YELLOW}Checking Stage 3: Broker Realm AMR Mapper${NC}"
echo ""
if grep -q '"jsonType.label".*=.*"JSON"' terraform/broker-realm.tf 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Broker realm has AMR JSON mapper"
else
    echo -e "${RED}✗${NC} Broker realm MISSING AMR JSON mapper!"
fi

###############################################################################
# Issue 2: Resources Empty - Backend/MongoDB Chain
###############################################################################

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Issue 2: Resources Empty - Checking Backend/MongoDB Chain${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Checking MongoDB...${NC}"
if docker compose ps mongo | grep -q "Up"; then
    echo -e "${GREEN}✓${NC} MongoDB container running"
    
    # Check if MongoDB has resources
    RESOURCE_COUNT=$(docker compose exec -T mongo mongosh dive-v3 --quiet --eval "db.resources.countDocuments({})" 2>/dev/null | tail -1 || echo "0")
    
    if [ "$RESOURCE_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓${NC} MongoDB has $RESOURCE_COUNT resources"
    else
        echo -e "${RED}✗${NC} MongoDB has ZERO resources!"
        echo -e "${RED}   The seed script didn't run or failed!${NC}"
    fi
else
    echo -e "${RED}✗${NC} MongoDB container NOT running!"
fi

echo ""
echo -e "${YELLOW}Checking Backend...${NC}"
if docker compose ps backend | grep -q "Up"; then
    echo -e "${GREEN}✓${NC} Backend container running"
    
    # Check backend health
    if curl -k -sf https://localhost:4000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Backend /health endpoint responding"
    else
        echo -e "${RED}✗${NC} Backend /health NOT responding"
    fi
    
    # Check backend resources API
    BACKEND_RESPONSE=$(curl -k -s https://localhost:4000/api/resources 2>&1 | head -c 200)
    if echo "$BACKEND_RESPONSE" | grep -q "resources"; then
        echo -e "${GREEN}✓${NC} Backend /api/resources returning data"
    else
        echo -e "${RED}✗${NC} Backend /api/resources NOT returning resources"
        echo "   Response: ${BACKEND_RESPONSE:0:100}"
    fi
else
    echo -e "${RED}✗${NC} Backend container NOT running!"
fi

echo ""
echo -e "${YELLOW}Checking Frontend Environment...${NC}"
BACKEND_URL=$(docker compose exec -T nextjs printenv NEXT_PUBLIC_BACKEND_URL 2>/dev/null | tr -d '\r' || echo "NOT SET")
echo "NEXT_PUBLIC_BACKEND_URL = ${BACKEND_URL}"

if [ "$BACKEND_URL" = "NOT SET" ] || [ -z "$BACKEND_URL" ]; then
    echo -e "${RED}✗${NC} Frontend doesn't know where backend is!"
else
    echo -e "${GREEN}✓${NC} Frontend has backend URL configured"
fi

###############################################################################
# Summary and Fixes
###############################################################################

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    ROOT CAUSES IDENTIFIED                  ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${RED}ROOT CAUSE #1: AMR NULL${NC}"
echo "  IdP broker mappers are MISSING!"
echo "  The IdP broker (usa-realm-broker in broker realm) needs to"
echo "  COPY the AMR claim from the upstream IdP token."
echo ""
echo "  Without this mapper, AMR never makes it to the broker realm!"
echo ""

echo -e "${RED}ROOT CAUSE #2: Resources Empty${NC}"
if [ "$RESOURCE_COUNT" -eq 0 ]; then
    echo "  MongoDB was NOT seeded!"
    echo "  The deploy-ubuntu.sh seed step failed or was skipped."
else
    echo "  Backend can't reach MongoDB OR"
    echo "  Frontend can't reach backend OR"
    echo "  CORS is blocking requests"
fi

echo ""
echo -e "${CYAN}FIXES:${NC}"
echo ""
echo "${GREEN}1. Fix AMR - Add IdP Broker Mappers:${NC}"
echo "   I'll create the Terraform fix and push it"
echo "   Then you run: cd terraform && terraform apply"
echo ""
echo "${GREEN}2. Fix Resources - Re-seed MongoDB:${NC}"
echo "   cd backend"
echo "   npm run seed-database"
echo "   docker compose restart backend nextjs"
echo ""

echo -e "${YELLOW}After fixes, test:${NC}"
echo "  - Login and check browser DevTools console for 'amr' in token"
echo "  - Navigate to /resources page"
echo ""

