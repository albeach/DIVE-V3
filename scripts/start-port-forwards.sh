#!/bin/bash
# =============================================================================
# DIVE V3 - Start Port Forwards for Browser Access
# =============================================================================
# Starts port forwarding for all instances so you can access them in browser
# =============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     DIVE V3 - Starting Port Forwards                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Kill existing port forwards
echo -e "${YELLOW}Cleaning up existing port forwards...${NC}"
pkill -f "kubectl port-forward" || true
sleep 2

# USA Instance
echo -e "${GREEN}Starting USA instance port forwards...${NC}"
kubectl port-forward -n dive-v3 svc/frontend 3000:80 > /dev/null 2>&1 &
kubectl port-forward -n dive-v3 svc/backend 4000:80 > /dev/null 2>&1 &
kubectl port-forward -n dive-v3 svc/keycloak 8081:8080 > /dev/null 2>&1 &

# FRA Instance
echo -e "${GREEN}Starting FRA instance port forwards...${NC}"
kubectl port-forward -n dive-v3-fra svc/frontend 3001:80 > /dev/null 2>&1 &
kubectl port-forward -n dive-v3-fra svc/backend 4001:80 > /dev/null 2>&1 &
kubectl port-forward -n dive-v3-fra svc/keycloak 8444:8443 > /dev/null 2>&1 &

# GBR Instance
echo -e "${GREEN}Starting GBR instance port forwards...${NC}"
kubectl port-forward -n dive-v3-gbr svc/frontend 3002:80 > /dev/null 2>&1 &
kubectl port-forward -n dive-v3-gbr svc/backend 4002:80 > /dev/null 2>&1 &
kubectl port-forward -n dive-v3-gbr svc/keycloak 8445:8443 > /dev/null 2>&1 &

# DEU Instance
echo -e "${GREEN}Starting DEU instance port forwards...${NC}"
kubectl port-forward -n dive-v3-deu svc/frontend 3003:80 > /dev/null 2>&1 &
kubectl port-forward -n dive-v3-deu svc/backend 4003:80 > /dev/null 2>&1 &
kubectl port-forward -n dive-v3-deu svc/keycloak 8446:8443 > /dev/null 2>&1 &

sleep 3

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✅ Port Forwards Started!                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}🌐 Access URLs:${NC}"
echo ""
echo -e "${YELLOW}USA Instance (United States):${NC}"
echo "  Frontend:    http://localhost:3000"
echo "  Backend API: http://localhost:4000/health"
echo "  Keycloak:    http://localhost:8081/admin"
echo ""
echo -e "${YELLOW}FRA Instance (France):${NC}"
echo "  Frontend:    http://localhost:3001"
echo "  Backend API: http://localhost:4001/health"
echo "  Keycloak:    https://localhost:8444/admin (accept self-signed cert)"
echo ""
echo -e "${YELLOW}GBR Instance (United Kingdom):${NC}"
echo "  Frontend:    http://localhost:3002"
echo "  Backend API: http://localhost:4002/health"
echo "  Keycloak:    https://localhost:8445/admin (accept self-signed cert)"
echo ""
echo -e "${YELLOW}DEU Instance (Germany):${NC}"
echo "  Frontend:    http://localhost:3003"
echo "  Backend API: http://localhost:4003/health"
echo "  Keycloak:    https://localhost:8446/admin (accept self-signed cert)"
echo ""
echo -e "${BLUE}💡 Tip: Keep this terminal open. Port forwards stop when you close it.${NC}"
echo -e "${BLUE}💡 To stop: Run './scripts/stop-port-forwards.sh' or press Ctrl+C${NC}"
echo ""





