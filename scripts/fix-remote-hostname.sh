#!/bin/bash

###############################################################################
# Fix Remote Hostname Configuration for JWT Validation
###############################################################################
# This script updates KC_HOSTNAME and related URLs to match your server's
# actual hostname or IP address, fixing "Invalid or expired JWT" errors.
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║       DIVE V3 - Remote Hostname Configuration Fix             ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in the project root
if [ ! -f docker-compose.yml ]; then
    echo -e "${RED}Error: docker-compose.yml not found${NC}"
    echo "Please run this script from the DIVE V3 project root"
    exit 1
fi

echo -e "${CYAN}Current Network Information:${NC}"
echo "  Hostname: $(hostname)"
echo "  Primary IP: $(hostname -I 2>/dev/null | awk '{print $1}' || echo 'N/A')"
echo ""
echo -e "${CYAN}Current KC_HOSTNAME Configuration:${NC}"
grep "KC_HOSTNAME:" docker-compose.yml | head -1 || echo "  Not found"
echo ""

echo -e "${YELLOW}Enter the hostname or IP address that users will use to access this server.${NC}"
echo "This should match the URL in the browser address bar."
echo ""
echo "Examples:"
echo "  - For localhost/local testing: localhost"
echo "  - For remote server with DNS: server.example.com"
echo "  - For remote server without DNS: 192.168.1.100"
echo ""
read -p "Enter hostname or IP for KC_HOSTNAME: " NEW_HOSTNAME

if [ -z "$NEW_HOSTNAME" ]; then
    echo -e "${RED}Error: Hostname cannot be empty${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}You entered: ${NC}${CYAN}$NEW_HOSTNAME${NC}"
echo ""
echo "This will update:"
echo "  - KC_HOSTNAME (Keycloak)"
echo "  - KEYCLOAK_URL (Backend)"
echo "  - KEYCLOAK_JWKS_URI (Backend)"
echo "  - NEXT_PUBLIC_KEYCLOAK_URL (Frontend)"
echo ""
read -p "Proceed with update? (y/N): " CONFIRM

if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${YELLOW}Step 1: Backing up docker-compose.yml${NC}"
cp docker-compose.yml docker-compose.yml.bak
echo -e "${GREEN}✓${NC} Backup created: docker-compose.yml.bak"
echo ""

echo -e "${YELLOW}Step 2: Updating configuration${NC}"

# Update KC_HOSTNAME (line 47)
sed -i.tmp "s/KC_HOSTNAME: .*/KC_HOSTNAME: $NEW_HOSTNAME/" docker-compose.yml

# Update KEYCLOAK_URL in backend (line 168) - keep internal Docker network name
# Backend uses 'keycloak' hostname for internal communication
# But JWKS URI needs to match token issuer
sed -i.tmp "s|KEYCLOAK_JWKS_URI: https://[^:]*:8443|KEYCLOAK_JWKS_URI: https://$NEW_HOSTNAME:8443|" docker-compose.yml

# Update NEXT_PUBLIC_KEYCLOAK_URL for browser-side requests (line 237)
sed -i.tmp "s|NEXT_PUBLIC_KEYCLOAK_URL: https://[^:]*:8443|NEXT_PUBLIC_KEYCLOAK_URL: https://$NEW_HOSTNAME:8443|" docker-compose.yml

# Update AUTH_URL (line 240) if not localhost
if [ "$NEW_HOSTNAME" != "localhost" ]; then
    sed -i.tmp "s|AUTH_URL: https://[^:]*:3000|AUTH_URL: https://$NEW_HOSTNAME:3000|" docker-compose.yml
    sed -i.tmp "s|NEXTAUTH_URL: https://[^:]*:3000|NEXTAUTH_URL: https://$NEW_HOSTNAME:3000|" docker-compose.yml
fi

# Clean up temporary files
rm -f docker-compose.yml.tmp

echo -e "${GREEN}✓${NC} Configuration updated"
echo ""

echo -e "${YELLOW}Step 3: Displaying changes${NC}"
echo "KC_HOSTNAME:"
grep "KC_HOSTNAME:" docker-compose.yml | head -1
echo "KEYCLOAK_JWKS_URI:"
grep "KEYCLOAK_JWKS_URI:" docker-compose.yml | head -1
echo "NEXT_PUBLIC_KEYCLOAK_URL:"
grep "NEXT_PUBLIC_KEYCLOAK_URL:" docker-compose.yml | head -1
echo ""

echo -e "${YELLOW}Step 4: Restarting services${NC}"
echo "This will restart: keycloak, backend, nextjs"
echo ""

docker compose restart keycloak
echo -e "${GREEN}✓${NC} Keycloak restarting..."
echo ""

echo -n "Waiting for Keycloak to initialize (this may take 1-2 minutes)..."
KEYCLOAK_READY=0
for i in {1..60}; do
    if docker compose logs keycloak 2>/dev/null | grep -q "started in"; then
        KEYCLOAK_READY=1
        break
    fi
    echo -n "."
    sleep 2
done
echo ""

if [ $KEYCLOAK_READY -eq 1 ]; then
    echo -e "${GREEN}✓${NC} Keycloak ready"
else
    echo -e "${YELLOW}⚠${NC}  Keycloak startup timeout (check logs: docker compose logs keycloak)"
fi

echo ""
echo "Restarting backend and frontend..."
docker compose restart backend nextjs
sleep 3
echo -e "${GREEN}✓${NC} Services restarted"
echo ""

echo -e "${YELLOW}Step 5: Clearing Keycloak sessions${NC}"
echo "Old tokens with previous hostname are now invalid..."

# Try to clear sessions (may fail if Keycloak not ready, that's OK)
docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080 --realm master --user admin --password admin 2>/dev/null || true

docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh delete sessions/dive-v3-broker 2>/dev/null && \
    echo -e "${GREEN}✓${NC} Sessions cleared" || \
    echo -e "${YELLOW}⚠${NC}  Could not clear sessions (users will need to logout manually)"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║              Configuration Update Complete! ✓                  ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Next Steps:${NC}"
echo ""
echo "  1. Access the application at:"
echo "     ${BLUE}https://$NEW_HOSTNAME:3000${NC}"
echo ""
echo "  2. Clear browser cache and cookies (or use incognito mode)"
echo ""
echo "  3. Login again with test credentials"
echo ""
echo "  4. Verify JWT tokens have correct issuer:"
echo "     - Open browser dev tools → Application → Storage → Session Storage"
echo "     - Copy access token and decode at https://jwt.io"
echo "     - Check 'iss' field: should be ${CYAN}https://$NEW_HOSTNAME:8443/realms/dive-v3-broker${NC}"
echo ""
echo "  5. Test resource access to verify no JWT errors"
echo ""
echo -e "${CYAN}Troubleshooting:${NC}"
echo ""
echo "  • Check Keycloak logs: ${BLUE}docker compose logs keycloak --tail 50${NC}"
echo "  • Check backend logs: ${BLUE}docker compose logs backend --tail 50${NC}"
echo "  • Test OPA health: ${BLUE}docker compose exec backend curl http://opa:8181/health${NC}"
echo "  • Rollback if needed: ${BLUE}mv docker-compose.yml.bak docker-compose.yml${NC}"
echo ""
echo -e "${YELLOW}Note:${NC} OPA is internal-only (HTTP). Do not access OPA directly from browser."
echo ""


