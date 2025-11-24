#!/bin/bash

###############################################################################
# Fix Logout Issue - Add Backchannel Logout to All IdP Brokers
###############################################################################
# This script adds backchannel_supported and logout_url to all IdP brokers
# This enables cascading logout from broker realm to national realms
###############################################################################

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}║       DIVE V3 - Fix Logout Issue (Backchannel Logout)       ║${NC}"
echo -e "${BLUE}║                                                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd "$(dirname "$0")/.."

BROKERS=(
    "fra"
    "can"
    "deu"
    "gbr"
    "ita"
    "esp"
    "pol"
    "nld"
    "industry"
)

echo -e "${YELLOW}Adding backchannel logout to all IdP brokers...${NC}"
echo ""

for broker in "${BROKERS[@]}"; do
    FILE="terraform/${broker}-broker.tf"
    
    if [ ! -f "$FILE" ]; then
        echo -e "  ⚠️  $FILE not found, skipping..."
        continue
    fi
    
    # Check if already has backchannel_supported
    if grep -q "backchannel_supported" "$FILE"; then
        echo -e "  ✓ $broker: Already configured"
        continue
    fi
    
    echo -n "  🔧 $broker: Adding backchannel logout..."
    
    # Find the line with gui_order and add backchannel logout config before it
    # Use perl for multi-line replacement
    perl -i -pe 's/(  link_only\s*=\s*false.*\n)\n(  gui_order)/\1\n  # CRITICAL: Enable backchannel logout to cascade logout to national realm\n  # Without this, logging out from broker only logs out of broker session\n  # The national realm SSO session persists → auto-login without password!\n  backchannel_supported = true  # Enable OIDC backchannel logout\n  logout_url            = "\${local.realm_urls.'"$broker"'}\${local.oidc_logout_path}"\n\n\2/g' "$FILE"
    
    # Verify the change was made
    if grep -q "backchannel_supported" "$FILE"; then
        echo -e " ${GREEN}✓${NC}"
    else
        echo -e " Failed (manual fix needed)"
    fi
done

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║                    Updates Complete! ✓                       ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "  1. Review changes:"
echo "     ${BLUE}git diff terraform/*-broker.tf${NC}"
echo ""
echo "  2. Apply to Keycloak:"
echo "     ${BLUE}cd terraform && terraform apply -auto-approve${NC}"
echo ""
echo "  3. Test logout:"
echo "     ${BLUE}https://your-hostname:3000${NC}"
echo "     - Login → Logout → Try to login again"
echo "     - Should prompt for password (not auto-login)"
echo ""


