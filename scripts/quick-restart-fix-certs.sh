#!/bin/bash
# Quick fix: Restart services with corrected certificate configuration

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}║     Quick Restart: Fix Certificate Path Issue                 ║${NC}"
echo -e "${CYAN}║                                                                ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}This will:${NC}"
echo "  1. Pull latest fixes from GitHub"
echo "  2. Stop running services"
echo "  3. Regenerate docker-compose.mkcert.yml with correct paths"
echo "  4. Restart services"
echo ""
read -p "Continue? (y/N): " CONFIRM

if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${CYAN}Step 1: Pull latest fixes...${NC}"
git pull origin main
echo -e "${GREEN}✓${NC} Latest code pulled"
echo ""

echo -e "${CYAN}Step 2: Stop running services...${NC}"
docker compose down
echo -e "${GREEN}✓${NC} Services stopped"
echo ""

echo -e "${CYAN}Step 3: Regenerate certificate configuration...${NC}"
if [ -f scripts/setup-mkcert-for-all-services.sh ]; then
    DIVE_HOSTNAME=${DIVE_HOSTNAME:-localhost} ./scripts/setup-mkcert-for-all-services.sh
    echo -e "${GREEN}✓${NC} Certificate configuration regenerated"
else
    echo -e "${YELLOW}⚠️  setup-mkcert-for-all-services.sh not found, using existing config${NC}"
fi
echo ""

echo -e "${CYAN}Step 4: Restart services...${NC}"
if [ -f docker-compose.mkcert.yml ]; then
    docker compose -f docker-compose.yml -f docker-compose.mkcert.yml up -d
else
    docker compose up -d
fi
echo -e "${GREEN}✓${NC} Services started"
echo ""

echo -e "${CYAN}Step 5: Check service status...${NC}"
sleep 5
docker compose ps
echo ""

echo -e "${CYAN}Step 6: Check logs for errors...${NC}"
echo ""
echo -e "${YELLOW}Frontend logs:${NC}"
docker compose logs nextjs --tail 10
echo ""
echo -e "${YELLOW}Backend logs:${NC}"
docker compose logs backend --tail 10
echo ""
echo -e "${YELLOW}KAS logs:${NC}"
docker compose logs kas --tail 10
echo ""

echo -e "${GREEN}✓${NC} Restart complete!"
echo ""
echo "If services are healthy, access at:"
echo "  Frontend: https://localhost:3000"
echo "  Backend:  https://localhost:4000"
echo "  Keycloak: https://localhost:8443/admin"
echo ""

