#!/bin/bash
# DIVE V3 - Diagnose Landing Page Issues
# 
# Two reported issues:
# 1. "Network failed to fetch resource" - backend unreachable
# 2. Country flags not showing - emoji rendering issue
#
# Usage: ./scripts/diagnose-landing-page-issues.sh

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
echo -e "${BLUE}║         DIVE V3 - Landing Page Diagnostic Tool                ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Section 1: Backend Connectivity
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}SECTION 1: BACKEND API CONNECTIVITY${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Testing backend /api/idps/public endpoint...${NC}"
echo ""

# Get backend URL from env or use default
BACKEND_URL="${BACKEND_URL:-https://localhost:4000}"
echo "Backend URL: $BACKEND_URL"
echo ""

# Test 1: Is backend container running?
echo -n "1. Backend container status: "
if docker compose ps backend 2>/dev/null | grep -q "Up"; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
    echo ""
    echo "FIX: Start backend container:"
    echo "  docker compose up -d backend"
    exit 1
fi

# Test 2: Is backend port accessible internally?
echo -n "2. Backend port 4000 (internal): "
if docker compose exec -T backend nc -z localhost 4000 2>/dev/null; then
    echo -e "${GREEN}✓ Listening${NC}"
else
    echo -e "${RED}✗ Not listening${NC}"
    echo ""
    echo "Backend logs (last 20 lines):"
    docker compose logs backend --tail 20
    exit 1
fi

# Test 3: Test IdP endpoint from backend container (internal network)
echo -n "3. /api/idps/public (internal): "
INTERNAL_TEST=$(docker compose exec -T backend wget -q -O- --timeout=3 --no-check-certificate https://localhost:4000/api/idps/public 2>&1 || echo "FAILED")
if [[ "$INTERNAL_TEST" == *"FAILED"* ]] || [[ -z "$INTERNAL_TEST" ]]; then
    echo -e "${RED}✗ Failed${NC}"
    echo "   Error: $INTERNAL_TEST"
    echo ""
    echo "Backend may not have started properly. Check logs:"
    echo "  docker compose logs backend --tail 50"
else
    echo -e "${GREEN}✓ Responding${NC}"
    echo "   Sample: $(echo "$INTERNAL_TEST" | jq -r '.idps[0].displayName' 2>/dev/null || echo 'Valid response')"
fi

# Test 4: Test from host machine (external access)
echo -n "4. /api/idps/public (external): "
EXTERNAL_TEST=$(curl -sk --connect-timeout 3 --max-time 5 "$BACKEND_URL/api/idps/public" 2>&1 || echo "FAILED")
if [[ "$EXTERNAL_TEST" == *"FAILED"* ]] || [[ -z "$EXTERNAL_TEST" ]] || [[ "$EXTERNAL_TEST" == *"Connection refused"* ]]; then
    echo -e "${RED}✗ Failed${NC}"
    echo "   Error: Cannot reach backend from host machine"
    echo ""
    echo -e "${YELLOW}POSSIBLE CAUSES:${NC}"
    echo "   1. Firewall blocking port 4000"
    echo "   2. Docker port mapping incorrect"
    echo "   3. SSL/TLS certificate issue"
    echo ""
    echo "Check Docker port mapping:"
    docker compose ps backend | grep -E "PORTS|backend"
else
    echo -e "${GREEN}✓ Responding${NC}"
    IDP_COUNT=$(echo "$EXTERNAL_TEST" | jq -r '.idps | length' 2>/dev/null || echo "0")
    echo "   Found $IDP_COUNT IdPs"
fi
echo ""

# Test 5: CORS headers
echo -n "5. CORS headers: "
CORS_TEST=$(curl -sk -X OPTIONS \
    -H "Origin: https://localhost:3000" \
    -H "Access-Control-Request-Method: GET" \
    "$BACKEND_URL/api/idps/public" \
    -I 2>&1 | grep -i "access-control-allow-origin" || echo "MISSING")

if [[ "$CORS_TEST" == "MISSING" ]]; then
    echo -e "${RED}✗ Missing${NC}"
    echo "   Backend may not be allowing CORS from frontend"
    echo ""
    echo "FIX: Enable Federation CORS mode:"
    echo "  ./scripts/enable-federation-cors.sh"
else
    echo -e "${GREEN}✓ Present${NC}"
    echo "   $CORS_TEST"
fi
echo ""

# Section 2: Frontend Connectivity
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}SECTION 2: FRONTEND CONNECTIVITY${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Test 1: Is frontend container running?
echo -n "1. Frontend container status: "
if docker compose ps frontend 2>/dev/null | grep -q "Up"; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
    echo ""
    echo "FIX: Start frontend container:"
    echo "  docker compose up -d frontend"
    exit 1
fi

# Test 2: Check NEXT_PUBLIC_BACKEND_URL env var
echo -n "2. NEXT_PUBLIC_BACKEND_URL: "
FRONTEND_BACKEND_URL=$(docker compose exec -T frontend env | grep NEXT_PUBLIC_BACKEND_URL | cut -d= -f2 || echo "NOT_SET")
if [[ "$FRONTEND_BACKEND_URL" == "NOT_SET" ]] || [[ -z "$FRONTEND_BACKEND_URL" ]]; then
    echo -e "${YELLOW}⚠ Not set (using default)${NC}"
    echo "   Frontend will use: https://localhost:4000"
else
    echo -e "${GREEN}✓ Set${NC}"
    echo "   $FRONTEND_BACKEND_URL"
fi

# Test 3: Can frontend reach backend internally?
echo -n "3. Frontend → Backend (internal): "
FRONTEND_TO_BACKEND=$(docker compose exec -T frontend wget -q -O- --timeout=3 --no-check-certificate https://backend:4000/api/idps/public 2>&1 || echo "FAILED")
if [[ "$FRONTEND_TO_BACKEND" == *"FAILED"* ]] || [[ -z "$FRONTEND_TO_BACKEND" ]]; then
    echo -e "${RED}✗ Failed${NC}"
    echo "   Frontend container cannot reach backend container"
    echo ""
    echo "This indicates a Docker network issue."
    echo "Check if both are on same network:"
    echo "  docker network inspect dive-v3_default | grep -E 'frontend|backend'"
else
    echo -e "${GREEN}✓ Success${NC}"
fi
echo ""

# Section 3: Remote User Access
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}SECTION 3: REMOTE USER ACCESS${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Detect server IP
SERVER_IP=$(ip route get 1 2>/dev/null | awk '{print $7}' | head -1 || echo "127.0.0.1")
echo "Server IP: ${GREEN}${SERVER_IP}${NC}"
echo ""

# Check if custom hostname is configured
CUSTOM_HOSTNAME=$(grep "KC_HOSTNAME=" docker-compose.yml 2>/dev/null | head -1 | cut -d= -f2 || echo "NOT_SET")
if [[ "$CUSTOM_HOSTNAME" != "NOT_SET" ]] && [[ -n "$CUSTOM_HOSTNAME" ]]; then
    echo "Custom Hostname: ${GREEN}${CUSTOM_HOSTNAME}${NC}"
    
    # Check if hostname is in /etc/hosts
    echo -n "Hostname in /etc/hosts: "
    if grep -q "$CUSTOM_HOSTNAME" /etc/hosts 2>/dev/null; then
        HOSTS_IP=$(grep "$CUSTOM_HOSTNAME" /etc/hosts | awk '{print $1}' | head -1)
        if [[ "$HOSTS_IP" == "$SERVER_IP" ]]; then
            echo -e "${GREEN}✓ Correct IP ($SERVER_IP)${NC}"
        else
            echo -e "${YELLOW}⚠ Stale IP ($HOSTS_IP)${NC}"
            echo "   Should be: $SERVER_IP"
            echo ""
            echo "FIX: Update /etc/hosts entry:"
            echo "  ./scripts/update-hostname-ip.sh"
        fi
    else
        echo -e "${RED}✗ Not found${NC}"
        echo ""
        echo "FIX: Add to /etc/hosts:"
        echo "  echo \"$SERVER_IP $CUSTOM_HOSTNAME\" | sudo tee -a /etc/hosts"
    fi
else
    echo "Custom Hostname: ${YELLOW}Not configured${NC}"
fi
echo ""

echo -e "${YELLOW}FOR REMOTE USERS:${NC}"
echo "Remote users must access the application via:"
echo "  Frontend: https://${CUSTOM_HOSTNAME:-${SERVER_IP}}:3000"
echo "  Backend:  https://${CUSTOM_HOSTNAME:-${SERVER_IP}}:4000"
echo ""
echo "Each remote user must add to THEIR machine's /etc/hosts:"
echo "  ${GREEN}$SERVER_IP ${CUSTOM_HOSTNAME:-dive.local}${NC}"
echo ""
echo "If remote user sees 'Network failed to fetch', check:"
echo "  1. Firewall allows ports 3000, 4000, 8443"
echo "  2. /etc/hosts entry exists on their machine"
echo "  3. Backend is reachable: curl -k https://${CUSTOM_HOSTNAME:-${SERVER_IP}}:4000/api/idps/public"
echo ""

# Section 4: Country Flag Emoji Rendering
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}SECTION 4: COUNTRY FLAG EMOJI RENDERING${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Flag Emoji Test:${NC}"
echo ""
echo "Expected flags:"
echo "  🇺🇸 United States (USA)"
echo "  🇫🇷 France (FRA)"
echo "  🇨🇦 Canada (CAN)"
echo "  🇬🇧 United Kingdom (GBR)"
echo "  🇩🇪 Germany (DEU)"
echo "  🏢 Industry"
echo ""

echo "If flags appear as boxes (□□) or ?? instead of flags:"
echo ""
echo -e "${YELLOW}CAUSE: Missing emoji fonts${NC}"
echo ""
echo "FIX for macOS:"
echo "  Flags should render natively (no fix needed)"
echo ""
echo "FIX for Linux:"
echo "  sudo apt install fonts-noto-color-emoji"
echo "  sudo fc-cache -fv"
echo "  # Restart browser"
echo ""
echo "FIX for Windows:"
echo "  1. Windows 10+: Flags render natively"
echo "  2. Older Windows: Install 'Segoe UI Emoji' font"
echo ""
echo "BROWSER-SPECIFIC:"
echo "  - Chrome/Edge: Good emoji support"
echo "  - Firefox: May need font config"
echo "  - Safari: Best emoji rendering"
echo ""

# Section 5: Recommendations
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}SECTION 5: RECOMMENDATIONS${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}For 'Network failed to fetch' issue:${NC}"
echo ""
echo "1. Check backend logs for errors:"
echo "   docker compose logs backend --tail 100 | grep -E 'ERROR|WARN|idps'"
echo ""
echo "2. Enable Federation CORS mode if external clients:"
echo "   ./scripts/enable-federation-cors.sh"
echo ""
echo "3. Test backend directly from remote machine:"
echo "   curl -k https://${CUSTOM_HOSTNAME:-${SERVER_IP}}:4000/api/idps/public"
echo ""
echo "4. Check firewall rules on server:"
echo "   sudo ufw status | grep -E '3000|4000|8443'"
echo ""

echo -e "${YELLOW}For missing flag emojis issue:${NC}"
echo ""
echo "1. Install emoji fonts on remote user's machine (Linux):"
echo "   sudo apt install fonts-noto-color-emoji"
echo ""
echo "2. Test emoji rendering in browser console:"
echo "   console.log('🇺🇸 🇫🇷 🇨🇦 🇬🇧 🇩🇪 🏢');"
echo ""
echo "3. If still broken, add fallback to frontend CSS:"
echo "   font-family: system-ui, 'Segoe UI Emoji', 'Noto Color Emoji';"
echo ""

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║                 Diagnostic Complete! ✓                         ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""



