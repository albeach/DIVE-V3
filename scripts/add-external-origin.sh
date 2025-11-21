#!/bin/bash

###############################################################################
# Add External Origin to CORS Allowlist (Custom Hostname Deployment)
###############################################################################
# This script adds an external IdP or client origin to the backend's CORS
# configuration when using a custom hostname deployment.
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
echo -e "${BLUE}║  DIVE V3 - Add External Origin (Custom Hostname Deployment)    ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in the project root
if [ ! -f docker-compose.yml ]; then
    echo -e "${RED}Error: docker-compose.yml not found${NC}"
    echo "Please run this script from the DIVE V3 project root"
    exit 1
fi

# Check if custom hostname deployment exists
if [ ! -f docker-compose.hostname.yml ]; then
    echo -e "${RED}Error: docker-compose.hostname.yml not found${NC}"
    echo ""
    echo "This script is for custom hostname deployments."
    echo "If you're using localhost, use: ./scripts/add-cors-origin.sh instead"
    echo ""
    echo "To create a custom hostname deployment, run:"
    echo "  ./scripts/deploy-ubuntu.sh"
    exit 1
fi

echo "This script will add an external origin to your CORS allowlist."
echo ""
echo -e "${YELLOW}Why you need this:${NC}"
echo "  When external IdP clients or partners try to access your API,"
echo "  they'll get CORS errors unless their origin is allowlisted."
echo ""

# Extract current hostname
CUSTOM_HOSTNAME=$(grep "KC_HOSTNAME:" docker-compose.hostname.yml | head -1 | awk '{print $2}')
echo -e "${CYAN}Your deployment hostname: ${GREEN}$CUSTOM_HOSTNAME${NC}"
echo ""

# Extract current CORS origins
CURRENT_CORS=$(grep "CORS_ALLOWED_ORIGINS:" docker-compose.hostname.yml | head -1 | sed 's/.*CORS_ALLOWED_ORIGINS: //')

echo -e "${CYAN}Current CORS allowed origins:${NC}"
echo "$CURRENT_CORS" | tr ',' '\n' | sed 's/^/  - /'
echo ""

echo -e "${YELLOW}Enter the external origin you want to add:${NC}"
echo "  Format: https://hostname:port or https://hostname"
echo "  Examples:"
echo "    - https://external-partner.mil"
echo "    - https://10.50.100.200:3000"
echo "    - https://idp.example.com:8443"
echo ""
read -p "> " NEW_ORIGIN

if [ -z "$NEW_ORIGIN" ]; then
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
if echo "$CURRENT_CORS" | grep -q "$NEW_ORIGIN"; then
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
echo "$NEW_CORS_LIST" | tr ',' '\n' | sed 's/^/  - /'
echo ""
read -p "Apply this change? (y/N): " CONFIRM

if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo -e "${YELLOW}Updating docker-compose.hostname.yml...${NC}"

# Backup
cp docker-compose.hostname.yml docker-compose.hostname.yml.bak.$(date +%Y%m%d_%H%M%S)

# Update CORS_ALLOWED_ORIGINS
sed -i.tmp "s|CORS_ALLOWED_ORIGINS:.*|CORS_ALLOWED_ORIGINS: ${NEW_CORS_LIST}|" docker-compose.hostname.yml
rm -f docker-compose.hostname.yml.tmp

echo -e "${GREEN}✓${NC} docker-compose.hostname.yml updated"
echo ""

echo -e "${YELLOW}Restarting backend service to apply changes...${NC}"
docker compose -f docker-compose.yml -f docker-compose.mkcert.yml -f docker-compose.hostname.yml restart backend

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
echo "  2. If CORS errors persist, check backend logs:"
echo "     ${BLUE}docker compose logs backend -f | grep CORS${NC}"
echo ""
echo "  3. Verify the external origin can now access:"
echo "     ${BLUE}https://${CUSTOM_HOSTNAME}:4000${NC}"
echo ""
echo -e "${CYAN}To add more origins, run this script again.${NC}"
echo ""
echo -e "${YELLOW}Current CORS allowlist:${NC}"
echo "$NEW_CORS_LIST" | tr ',' '\n' | sed 's/^/  - /'
echo ""



