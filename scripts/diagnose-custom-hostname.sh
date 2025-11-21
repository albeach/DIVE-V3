#!/bin/bash

###############################################################################
# DIVE V3 - Custom Hostname Diagnostics
# Diagnoses issues with custom hostname access and provides fixes
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
echo -e "${BLUE}║         DIVE V3 - Custom Hostname Diagnostics                 ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get custom hostname from docker-compose.hostname.yml if it exists
if [ -f docker-compose.hostname.yml ]; then
    CUSTOM_HOSTNAME=$(grep "KC_HOSTNAME:" docker-compose.hostname.yml | head -1 | awk '{print $2}' | tr -d '"' || echo "")
else
    CUSTOM_HOSTNAME=""
fi

if [ -z "$CUSTOM_HOSTNAME" ]; then
    echo -e "${RED}✗${NC} No custom hostname configured"
    echo "   docker-compose.hostname.yml not found"
    echo ""
    echo "This system is configured for localhost access only."
    exit 0
fi

echo -e "${CYAN}Detected Custom Hostname:${NC} ${GREEN}${CUSTOM_HOSTNAME}${NC}"
echo ""

###############################################################################
# Server-Side Checks
###############################################################################

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}SERVER-SIDE CHECKS (This Machine)${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 1. Server IP Address
echo -n "1. Server IP Address: "
SERVER_IP=$(ip route get 1 2>/dev/null | awk '{print $7}' | head -1 || echo "unknown")
if [ "$SERVER_IP" != "unknown" ]; then
    echo -e "${GREEN}${SERVER_IP}${NC}"
else
    echo -e "${YELLOW}Could not auto-detect${NC}"
    echo "   Run: ip addr show"
fi
echo ""

# 2. DNS Resolution (on server)
echo -n "2. DNS Resolution (on server): "
if host "$CUSTOM_HOSTNAME" >/dev/null 2>&1; then
    RESOLVED_IP=$(host "$CUSTOM_HOSTNAME" | awk '/has address/ {print $4}' | head -1)
    echo -e "${GREEN}Resolves to ${RESOLVED_IP}${NC}"
elif grep -q "$CUSTOM_HOSTNAME" /etc/hosts 2>/dev/null; then
    HOSTS_IP=$(grep "$CUSTOM_HOSTNAME" /etc/hosts | grep -v "^#" | awk '{print $1}' | head -1)
    echo -e "${GREEN}Found in /etc/hosts → ${HOSTS_IP}${NC}"
else
    echo -e "${RED}✗ Not configured${NC}"
    echo -e "   ${YELLOW}Server /etc/hosts needs:${NC}"
    echo -e "   ${SERVER_IP} ${CUSTOM_HOSTNAME}"
fi
echo ""

# 3. SSL Certificate Check
echo -n "3. SSL Certificate: "
if [ -f keycloak/certs/certificate.pem ]; then
    if openssl x509 -in keycloak/certs/certificate.pem -text -noout 2>/dev/null | grep -q "$CUSTOM_HOSTNAME"; then
        echo -e "${GREEN}✓ Includes ${CUSTOM_HOSTNAME}${NC}"
    else
        echo -e "${RED}✗ Does not include ${CUSTOM_HOSTNAME}${NC}"
        echo "   Run: ./scripts/setup-mkcert-for-all-services.sh"
    fi
else
    echo -e "${RED}✗ Certificate not found${NC}"
fi
echo ""

# 4. Docker Services
echo "4. Docker Services:"
for service in keycloak backend nextjs; do
    echo -n "   - $service: "
    if docker compose ps | grep -q "$service.*running"; then
        echo -e "${GREEN}✓ Running${NC}"
    else
        echo -e "${RED}✗ Not running${NC}"
    fi
done
echo ""

# 5. Environment Variables
echo "5. Frontend Environment Variables:"
if docker compose ps | grep -q "nextjs.*running"; then
    echo -n "   - NEXT_PUBLIC_API_URL: "
    API_URL=$(docker compose exec -T nextjs env | grep "NEXT_PUBLIC_API_URL=" | cut -d= -f2- | tr -d '\r' || echo "not set")
    if [[ "$API_URL" == *"$CUSTOM_HOSTNAME"* ]]; then
        echo -e "${GREEN}${API_URL}${NC}"
    else
        echo -e "${RED}${API_URL}${NC}"
        echo -e "   ${YELLOW}Should be: https://${CUSTOM_HOSTNAME}:4000${NC}"
    fi
    
    echo -n "   - NEXT_PUBLIC_KEYCLOAK_URL: "
    KC_URL=$(docker compose exec -T nextjs env | grep "NEXT_PUBLIC_KEYCLOAK_URL=" | cut -d= -f2- | tr -d '\r' || echo "not set")
    if [[ "$KC_URL" == *"$CUSTOM_HOSTNAME"* ]]; then
        echo -e "${GREEN}${KC_URL}${NC}"
    else
        echo -e "${RED}${KC_URL}${NC}"
        echo -e "   ${YELLOW}Should be: https://${CUSTOM_HOSTNAME}:8443${NC}"
    fi
else
    echo -e "   ${YELLOW}Frontend not running - cannot check${NC}"
fi
echo ""

###############################################################################
# Client-Side Instructions
###############################################################################

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}CLIENT-SIDE REQUIREMENTS (Your Browser Machine)${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${RED}⚠️  CRITICAL: Your browser machine needs DNS configuration!${NC}"
echo ""
echo "The custom hostname ${CYAN}${CUSTOM_HOSTNAME}${NC} must resolve to ${CYAN}${SERVER_IP}${NC}"
echo "on EVERY machine that will access DIVE V3 via a web browser."
echo ""

echo -e "${YELLOW}Option 1: Corporate DNS (Recommended for Production)${NC}"
echo "  Have your network administrator add a DNS A record:"
echo "  ${CUSTOM_HOSTNAME} → ${SERVER_IP}"
echo ""

echo -e "${YELLOW}Option 2: Local /etc/hosts (Best for Testing)${NC}"
echo ""
echo "  ${CYAN}On Linux/Mac (client machine):${NC}"
echo "  sudo nano /etc/hosts"
echo "  # Add this line:"
echo "  ${SERVER_IP} ${CUSTOM_HOSTNAME}"
echo ""
echo "  ${CYAN}On Windows (client machine):${NC}"
echo "  1. Open Notepad as Administrator"
echo "  2. Open C:\\Windows\\System32\\drivers\\etc\\hosts"
echo "  3. Add this line:"
echo "     ${SERVER_IP} ${CUSTOM_HOSTNAME}"
echo "  4. Save and close"
echo ""

echo -e "${YELLOW}Option 3: Use IP Address Instead (Quick Test)${NC}"
echo "  Access DIVE V3 using the IP address:"
echo "  https://${SERVER_IP}:3000"
echo ""
echo "  ${RED}Warning:${NC} SSL certificate warnings will appear"
echo "  ${RED}Warning:${NC} Keycloak redirects may not work properly"
echo ""

###############################################################################
# Verification Commands
###############################################################################

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}VERIFICATION (Run on CLIENT machine)${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "After configuring DNS or /etc/hosts on your client machine, verify:"
echo ""
echo "  1. ${CYAN}Test DNS resolution:${NC}"
echo "     ping ${CUSTOM_HOSTNAME}"
echo "     nslookup ${CUSTOM_HOSTNAME}"
echo ""
echo "  2. ${CYAN}Test HTTPS connectivity:${NC}"
echo "     curl -k https://${CUSTOM_HOSTNAME}:3000"
echo "     curl -k https://${CUSTOM_HOSTNAME}:4000/api/health"
echo "     curl -k https://${CUSTOM_HOSTNAME}:8443/health"
echo ""
echo "  3. ${CYAN}Open in browser:${NC}"
echo "     https://${CUSTOM_HOSTNAME}:3000"
echo ""

###############################################################################
# SSL Certificate Trust (for Client)
###############################################################################

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}SSL CERTIFICATE TRUST (Optional)${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "To avoid browser SSL warnings, install the mkcert CA on your client:"
echo ""
echo "  1. Copy rootCA.pem from this server:"
echo "     ${HOME}/.local/share/mkcert/rootCA.pem"
echo ""
echo "  2. On client machine, install mkcert:"
echo "     ${CYAN}Linux:${NC}"
echo "     curl -JLO https://dl.filippo.io/mkcert/latest?for=linux/amd64"
echo "     chmod +x mkcert-v*-linux-amd64"
echo "     sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert"
echo ""
echo "     ${CYAN}Mac:${NC}"
echo "     brew install mkcert"
echo ""
echo "     ${CYAN}Windows:${NC}"
echo "     choco install mkcert"
echo ""
echo "  3. Install the CA certificate:"
echo "     CAROOT=/path/to/copied/ca mkcert -install"
echo ""

###############################################################################
# Common Issues
###############################################################################

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}COMMON ISSUES${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${RED}Issue:${NC} ERR_NAME_NOT_RESOLVED"
echo -e "${GREEN}Fix:${NC} Client machine needs /etc/hosts entry or DNS record"
echo ""

echo -e "${RED}Issue:${NC} SSL certificate warnings"
echo -e "${GREEN}Fix:${NC} Install mkcert CA on client machine (see above)"
echo ""

echo -e "${RED}Issue:${NC} 404 Not Found from backend"
echo -e "${GREEN}Fix:${NC} Restart Docker containers:"
echo "     docker compose restart"
echo ""

echo -e "${RED}Issue:${NC} Keycloak redirect errors"
echo -e "${GREEN}Fix:${NC} Re-run Terraform to update redirect URIs:"
echo "     cd terraform && terraform apply"
echo ""

###############################################################################
# Quick Fix Script
###############################################################################

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}QUICK FIX (Run on CLIENT machine)${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "Copy and paste this command on your CLIENT machine:"
echo ""
echo -e "${CYAN}echo \"${SERVER_IP} ${CUSTOM_HOSTNAME}\" | sudo tee -a /etc/hosts${NC}"
echo ""

echo "Then verify:"
echo -e "${CYAN}ping ${CUSTOM_HOSTNAME}${NC}"
echo ""

echo -e "${GREEN}Done! Your client should now be able to access:${NC}"
echo "  https://${CUSTOM_HOSTNAME}:3000"
echo ""



