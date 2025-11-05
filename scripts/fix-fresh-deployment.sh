#!/bin/bash

###############################################################################
# DIVE V3 - Complete Fix for Fresh Deployment Issues
# Fixes AMR NULL and Resources Empty in one script
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
echo -e "${BLUE}║       DIVE V3 - Complete Fresh Deployment Fix                ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get custom hostname from docker-compose if exists
CUSTOM_HOSTNAME="localhost"
if [ -f docker-compose.hostname.yml ]; then
    CUSTOM_HOSTNAME=$(grep "KC_HOSTNAME:" docker-compose.hostname.yml | head -1 | awk '{print $2}' || echo "localhost")
    echo -e "${CYAN}Detected custom hostname: ${CUSTOM_HOSTNAME}${NC}"
elif [ -n "${DIVE_HOSTNAME:-}" ]; then
    CUSTOM_HOSTNAME="$DIVE_HOSTNAME"
    echo -e "${CYAN}Using DIVE_HOSTNAME: ${CUSTOM_HOSTNAME}${NC}"
fi

echo ""

###############################################################################
# Fix #1: Re-seed MongoDB (Resources Empty)
###############################################################################

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Fix #1: Seeding MongoDB with Resources${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check if MongoDB is running
if ! docker compose ps mongo | grep -q "Up"; then
    echo -e "${RED}✗${NC} MongoDB not running!"
    echo "Starting MongoDB..."
    docker compose up -d mongo
    sleep 5
fi

# Check current resource count
echo "Checking current resource count..."
RESOURCE_COUNT=$(docker compose exec -T mongo mongosh dive-v3 --quiet --eval "db.resources.countDocuments({})" 2>/dev/null | tail -1 || echo "0")
echo "Current resources in MongoDB: $RESOURCE_COUNT"
echo ""

if [ "$RESOURCE_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} MongoDB already has resources"
    echo "Do you want to re-seed anyway? (y/N)"
    read -p "> " RESEED
    if [[ ! $RESEED =~ ^[Yy]$ ]]; then
        echo "Skipping MongoDB seed..."
        echo ""
    else
        RESEED="y"
    fi
else
    RESEED="y"
fi

if [ "$RESEED" = "y" ]; then
    echo "Seeding MongoDB..."
    
    # Check if backend container is running
    if ! docker compose ps backend | grep -q "Up"; then
        echo "Backend container not running, starting it..."
        docker compose up -d backend
        sleep 10
    fi
    
    # Run seed script INSIDE the backend container (has all dependencies)
    echo "Running: docker compose exec backend npm run seed-database"
    docker compose exec -T backend npm run seed-database
    
    # Verify seeding worked
    NEW_COUNT=$(docker compose exec -T mongo mongosh dive-v3 --quiet --eval "db.resources.countDocuments({})" 2>/dev/null | tail -1 || echo "0")
    if [ "$NEW_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓${NC} MongoDB seeded successfully: $NEW_COUNT resources"
    else
        echo -e "${RED}✗${NC} Seeding failed! Still 0 resources in MongoDB"
        echo "Check backend logs: docker compose logs backend"
        exit 1
    fi
fi

###############################################################################
# Fix #2: Force Re-login (AMR NULL)
###############################################################################

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Fix #2: Clearing Keycloak Sessions (Force Re-login for AMR)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}The Issue:${NC}"
echo "AMR appears NULL because you logged in BEFORE Terraform applied"
echo "the AMR JSON fix. Your old session doesn't have AMR."
echo ""
echo "Solution: Force logout all users so they re-authenticate with"
echo "the new AMR mappers."
echo ""

echo -e "${YELLOW}Options:${NC}"
echo "  1) Restart Keycloak (clears ALL sessions - RECOMMENDED)"
echo "  2) Manual logout (you logout from browser)"
echo "  3) Skip (if you want to keep testing)"
echo ""

read -p "Select option [1-3] (default: 1): " LOGOUT_CHOICE
LOGOUT_CHOICE=${LOGOUT_CHOICE:-1}

case $LOGOUT_CHOICE in
    1)
        echo ""
        echo "Restarting Keycloak to clear all sessions..."
        docker compose restart keycloak
        
        echo "Waiting for Keycloak to restart (30 seconds)..."
        sleep 30
        
        echo -e "${GREEN}✓${NC} Keycloak restarted - all sessions cleared"
        echo "Next login will have AMR!"
        ;;
    2)
        echo ""
        echo -e "${YELLOW}Please logout from the browser:${NC}"
        echo "  1. Go to https://$CUSTOM_HOSTNAME:3000"
        echo "  2. Click logout button"
        echo "  3. Close all browser tabs"
        echo "  4. Clear browser cookies for $CUSTOM_HOSTNAME"
        echo ""
        read -p "Press Enter when done..."
        ;;
    3)
        echo ""
        echo -e "${YELLOW}Skipping session clear${NC}"
        echo "Note: AMR will still be NULL until you logout and re-login"
        ;;
esac

###############################################################################
# Fix #3: Restart Services
###############################################################################

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Fix #3: Restarting Services${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo "Restarting backend and frontend..."
docker compose restart backend nextjs

echo "Waiting for services to start..."
sleep 10

echo -e "${GREEN}✓${NC} Services restarted"

###############################################################################
# Verification
###############################################################################

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Verification${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check backend API
echo -n "Checking backend API..."
if curl -k -sf https://localhost:4000/api/resources >/dev/null 2>&1; then
    RESOURCE_API_COUNT=$(curl -k -s https://localhost:4000/api/resources | grep -o "resourceId" | wc -l | tr -d ' ')
    echo -e " ${GREEN}✓${NC} ($RESOURCE_API_COUNT resources)"
else
    echo -e " ${RED}✗${NC} Not responding"
fi

# Check frontend
echo -n "Checking frontend..."
if curl -k -sf https://localhost:3000 >/dev/null 2>&1; then
    echo -e " ${GREEN}✓${NC}"
else
    echo -e " ${RED}✗${NC}"
fi

###############################################################################
# Summary
###############################################################################

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                       Complete!                            ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${GREEN}✓${NC} MongoDB seeded with resources"
echo -e "${GREEN}✓${NC} Keycloak sessions cleared (or manual logout required)"
echo -e "${GREEN}✓${NC} Services restarted"
echo ""

echo -e "${CYAN}Testing Steps:${NC}"
echo ""
echo "1. Open browser to: ${BLUE}https://$CUSTOM_HOSTNAME:3000${NC}"
echo ""
echo "2. Clear browser cache/cookies (important!)"
echo "   Chrome: Ctrl+Shift+Delete → Cookies and site data"
echo ""
echo "3. Login to any realm (e.g., United States)"
echo "   Username: testuser-usa-unclass"
echo "   Password: Password123!"
echo ""
echo "4. Check AMR:"
echo "   - Open DevTools (F12) → Console"
echo "   - Look for session object with: amr: [\"pwd\"]"
echo "   - UI should show: \"Methods: pwd\""
echo ""
echo "5. Check Resources:"
echo "   - Navigate to: https://$CUSTOM_HOSTNAME:3000/resources"
echo "   - Should see list of classified documents"
echo ""

echo -e "${YELLOW}If AMR is STILL null:${NC}"
echo "  - Make sure you cleared browser cookies/cache"
echo "  - Try incognito/private window"
echo "  - Check Terraform applied: cd terraform && terraform state list | grep amr"
echo ""

echo -e "${YELLOW}If Resources are STILL empty:${NC}"
echo "  - Check browser console for errors (F12)"
echo "  - Verify backend URL: docker compose exec nextjs printenv | grep BACKEND"
echo "  - Test backend directly: curl -k https://localhost:4000/api/resources"
echo ""

