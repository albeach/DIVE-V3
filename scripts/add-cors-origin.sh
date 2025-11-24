#!/bin/bash

###############################################################################
# Add External Origin to CORS Allowlist
###############################################################################
# This script adds an external IdP or client origin to the backend's CORS
# configuration, allowing cross-origin requests from that domain.
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
echo -e "${BLUE}║       DIVE V3 - Add External Origin to CORS Allowlist         ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in the project root
if [ ! -f docker-compose.yml ]; then
    echo -e "${RED}Error: docker-compose.yml not found${NC}"
    echo "Please run this script from the DIVE V3 project root"
    exit 1
fi

echo "This script will add an external origin to the backend's CORS allowlist."
echo "This is needed when external IdP clients or partners need to access your API."
echo ""
echo -e "${YELLOW}Examples of origins to add:${NC}"
echo "  - https://partner.example.com"
echo "  - https://10.50.100.200:3000"
echo "  - https://external-idp.mil"
echo ""
echo -e "${CYAN}Current CORS configuration:${NC}"
echo ""

# Extract current CORS_ALLOWED_ORIGINS from docker-compose.yml
CURRENT_CORS=$(grep "CORS_ALLOWED_ORIGINS:" docker-compose.yml | head -1 | sed 's/.*CORS_ALLOWED_ORIGINS: //' | tr -d '"')

if [ -z "$CURRENT_CORS" ]; then
    echo "  (No CORS_ALLOWED_ORIGINS configured - using defaults)"
    CURRENT_CORS="http://localhost:3000,https://localhost:3000,http://localhost:4000,https://localhost:4000"
else
    echo "  $CURRENT_CORS"
fi

echo ""
echo -e "${YELLOW}Enter the origin you want to add (or 'q' to quit):${NC}"
echo "  Format: https://hostname:port or https://hostname"
echo "  Examples: https://partner.mil:3000, https://10.50.100.200"
echo ""
read -p "> " NEW_ORIGIN

if [ "$NEW_ORIGIN" == "q" ] || [ "$NEW_ORIGIN" == "Q" ]; then
    echo "Cancelled."
    exit 0
fi

# Validate origin format (basic check)
if [[ ! "$NEW_ORIGIN" =~ ^https?:// ]]; then
    echo -e "${RED}Error: Origin must start with http:// or https://${NC}"
    echo "You entered: $NEW_ORIGIN"
    exit 1
fi

# Check if origin already exists
if [[ "$CURRENT_CORS" == *"$NEW_ORIGIN"* ]]; then
    echo -e "${YELLOW}⚠️  Origin already exists in CORS allowlist!${NC}"
    echo "  $NEW_ORIGIN"
    echo ""
    echo "No changes needed."
    exit 0
fi

# Add the new origin
NEW_CORS_LIST="${CURRENT_CORS},${NEW_ORIGIN}"

echo ""
echo -e "${CYAN}New CORS configuration will be:${NC}"
echo "  $NEW_CORS_LIST"
echo ""
read -p "Apply this change? (y/N): " CONFIRM

if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo -e "${YELLOW}Updating docker-compose.yml...${NC}"

# Backup docker-compose.yml
cp docker-compose.yml docker-compose.yml.bak.$(date +%Y%m%d_%H%M%S)

# Update CORS_ALLOWED_ORIGINS in docker-compose.yml
# This updates the backend service environment section
sed -i.tmp "s|CORS_ALLOWED_ORIGINS:.*|CORS_ALLOWED_ORIGINS: \"${NEW_CORS_LIST}\"|" docker-compose.yml
rm -f docker-compose.yml.tmp

echo -e "${GREEN}✓${NC} docker-compose.yml updated"
echo ""

echo -e "${YELLOW}Restarting backend service to apply changes...${NC}"
docker compose restart backend

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
echo -e "${GREEN}║              CORS Configuration Updated! ✓                     ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Summary:${NC}"
echo "  Added origin: ${GREEN}$NEW_ORIGIN${NC}"
echo "  Backend restarted: ${GREEN}✓${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Test the external client/IdP connection"
echo "  2. Check backend logs if issues persist:"
echo "     ${BLUE}docker compose logs backend | grep CORS${NC}"
echo ""
echo -e "${CYAN}To add more origins, run this script again.${NC}"
echo ""
echo -e "${YELLOW}To manually edit CORS origins:${NC}"
echo "  1. Edit: docker-compose.yml"
echo "  2. Find: CORS_ALLOWED_ORIGINS"
echo "  3. Add comma-separated origins"
echo "  4. Run: docker compose restart backend"
echo ""


