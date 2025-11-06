#!/bin/bash

###############################################################################
# Enable Federation CORS Mode
###############################################################################
# This script enables permissive CORS for federated deployments where
# external IdP clients need to access the backend from various origins.
# Security is enforced via JWT authentication, not CORS allowlist.
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║           DIVE V3 - Enable Federation CORS Mode                ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in the project root
if [ ! -f docker-compose.yml ]; then
    echo -e "${RED}Error: docker-compose.yml not found${NC}"
    echo "Please run this script from the DIVE V3 project root"
    exit 1
fi

echo -e "${CYAN}What is Federation CORS Mode?${NC}"
echo ""
echo "In a federated identity environment, external IdP clients access your"
echo "application from various origins/domains. Traditional CORS allowlists"
echo "become impractical when you have many partners."
echo ""
echo -e "${YELLOW}Federation Mode:${NC}"
echo "  - Allows CORS requests from ANY origin"
echo "  - Security enforced via JWT authentication (not CORS)"
echo "  - All API endpoints still require valid JWT tokens"
echo "  - Public endpoints (/api/idps/public) accessible from anywhere"
echo ""
echo -e "${YELLOW}Standard Mode (current):${NC}"
echo "  - Only allows CORS from specific allowlist"
echo "  - Must manually add each external origin"
echo "  - More restrictive but requires maintenance"
echo ""

# Check current mode
CURRENT_MODE=$(grep "ENABLE_FEDERATION_CORS:" docker-compose.yml | head -1 | awk -F'"' '{print $2}')

if [ -z "$CURRENT_MODE" ]; then
    CURRENT_MODE="false"
fi

echo -e "${CYAN}Current mode: ${NC}"
if [ "$CURRENT_MODE" == "true" ]; then
    echo -e "  ${GREEN}Federation Mode ENABLED${NC}"
    echo "  → CORS allowed from any origin"
else
    echo -e "  ${YELLOW}Standard Mode (allowlist only)${NC}"
    echo "  → CORS only from configured origins"
fi
echo ""

# Ask what to do
echo -e "${YELLOW}What would you like to do?${NC}"
echo "  1) Enable Federation Mode (allow all origins)"
echo "  2) Disable Federation Mode (use allowlist)"
echo "  3) Cancel"
echo ""
read -p "Selection [1-3]: " CHOICE

case $CHOICE in
    1)
        if [ "$CURRENT_MODE" == "true" ]; then
            echo ""
            echo -e "${YELLOW}Federation Mode is already enabled!${NC}"
            exit 0
        fi
        
        echo ""
        echo -e "${YELLOW}Enabling Federation Mode...${NC}"
        
        # Backup
        cp docker-compose.yml docker-compose.yml.bak.$(date +%Y%m%d_%H%M%S)
        
        # Update ENABLE_FEDERATION_CORS to true
        sed -i.tmp 's/ENABLE_FEDERATION_CORS: "false"/ENABLE_FEDERATION_CORS: "true"/' docker-compose.yml
        rm -f docker-compose.yml.tmp
        
        # Also update hostname override if it exists
        if [ -f docker-compose.hostname.yml ]; then
            cp docker-compose.hostname.yml docker-compose.hostname.yml.bak.$(date +%Y%m%d_%H%M%S)
            
            # Add ENABLE_FEDERATION_CORS if not present
            if ! grep -q "ENABLE_FEDERATION_CORS" docker-compose.hostname.yml; then
                # Add after CORS_ALLOWED_ORIGINS line
                sed -i.tmp '/CORS_ALLOWED_ORIGINS:/a\      ENABLE_FEDERATION_CORS: "true"' docker-compose.hostname.yml
                rm -f docker-compose.hostname.yml.tmp
            else
                sed -i.tmp 's/ENABLE_FEDERATION_CORS: "false"/ENABLE_FEDERATION_CORS: "true"/' docker-compose.hostname.yml
                rm -f docker-compose.hostname.yml.tmp
            fi
        fi
        
        echo -e "${GREEN}✓${NC} Configuration updated"
        ;;
        
    2)
        if [ "$CURRENT_MODE" == "false" ]; then
            echo ""
            echo -e "${YELLOW}Federation Mode is already disabled!${NC}"
            exit 0
        fi
        
        echo ""
        echo -e "${YELLOW}Disabling Federation Mode...${NC}"
        
        # Backup
        cp docker-compose.yml docker-compose.yml.bak.$(date +%Y%m%d_%H%M%S)
        
        # Update ENABLE_FEDERATION_CORS to false
        sed -i.tmp 's/ENABLE_FEDERATION_CORS: "true"/ENABLE_FEDERATION_CORS: "false"/' docker-compose.yml
        rm -f docker-compose.yml.tmp
        
        # Also update hostname override if it exists
        if [ -f docker-compose.hostname.yml ]; then
            cp docker-compose.hostname.yml docker-compose.hostname.yml.bak.$(date +%Y%m%d_%H%M%S)
            sed -i.tmp 's/ENABLE_FEDERATION_CORS: "true"/ENABLE_FEDERATION_CORS: "false"/' docker-compose.hostname.yml
            rm -f docker-compose.hostname.yml.tmp
        fi
        
        echo -e "${GREEN}✓${NC} Configuration updated"
        ;;
        
    *)
        echo "Cancelled."
        exit 0
        ;;
esac

echo ""
echo -e "${YELLOW}Restarting backend to apply changes...${NC}"

# Restart backend with appropriate compose files
if [ -f docker-compose.hostname.yml ]; then
    docker compose -f docker-compose.yml -f docker-compose.mkcert.yml -f docker-compose.hostname.yml restart backend
else
    docker compose restart backend
fi

echo ""
echo -n "Waiting for backend to be ready..."
for i in {1..15}; do
    if curl -k -s https://localhost:4000/health > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 2
done

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║              Configuration Updated! ✓                          ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$CHOICE" == "1" ]; then
    echo -e "${CYAN}Federation Mode is now ENABLED${NC}"
    echo ""
    echo "CORS is now allowed from ANY origin."
    echo "Security is enforced via JWT authentication."
    echo ""
    echo -e "${YELLOW}What this means:${NC}"
    echo "  ✅ External IdP clients can access your backend"
    echo "  ✅ No need to manually add each origin to allowlist"
    echo "  ✅ Public endpoints accessible from anywhere"
    echo "  ✅ Protected endpoints still require valid JWT"
    echo ""
    echo -e "${YELLOW}Security note:${NC}"
    echo "  CORS is a browser security feature, not server security."
    echo "  Your API is protected by JWT authentication, which is"
    echo "  enforced for all protected endpoints regardless of origin."
else
    echo -e "${CYAN}Federation Mode is now DISABLED${NC}"
    echo ""
    echo "CORS is now restricted to configured allowlist only."
    echo ""
    echo -e "${YELLOW}To add external origins, run:${NC}"
    if [ -f docker-compose.hostname.yml ]; then
        echo "  ${BLUE}./scripts/add-external-origin.sh${NC}"
    else
        echo "  ${BLUE}./scripts/add-cors-origin.sh${NC}"
    fi
fi

echo ""
echo -e "${CYAN}To check backend logs:${NC}"
echo "  ${BLUE}docker compose logs backend -f | grep CORS${NC}"
echo ""

