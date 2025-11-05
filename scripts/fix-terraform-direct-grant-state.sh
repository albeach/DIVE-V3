#!/bin/bash
# ============================================
# Fix Terraform State for direct_grant_mfa Removal
# ============================================
# This script removes old direct_grant authentication resources
# from Terraform state so they won't cause errors

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT/terraform"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║     Fix Terraform State: Remove Direct Grant Resources        ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}This script will remove old direct_grant authentication resources${NC}"
echo -e "${YELLOW}from Terraform state that reference the removed custom SPI.${NC}"
echo ""
echo "Resources to remove:"
echo "  - keycloak_authentication_flow.direct_grant_mfa"
echo "  - keycloak_authentication_execution.direct_grant_*"
echo "  - keycloak_authentication_execution_config.direct_grant_*"
echo "  - keycloak_authentication_subflow.direct_grant_*"
echo ""
echo "For all 11 realms (broker, usa, fra, can, gbr, deu, esp, ita, nld, pol, industry)"
echo ""
read -p "Continue? (y/N): " CONFIRM

if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${CYAN}Step 1: List current direct_grant resources...${NC}"
RESOURCES=$(terraform state list 2>/dev/null | grep -E "direct_grant|direct-grant" || true)

if [ -z "$RESOURCES" ]; then
    echo -e "${GREEN}✓${NC} No direct_grant resources found in state"
    echo "  Your Terraform state is already clean!"
    exit 0
fi

echo "Found resources:"
echo "$RESOURCES" | sed 's/^/  - /'
echo ""

COUNT=$(echo "$RESOURCES" | wc -l | xargs)
echo -e "${YELLOW}Total: ${COUNT} resources${NC}"
echo ""

read -p "Remove these resources from state? (y/N): " CONFIRM_REMOVE

if [[ ! $CONFIRM_REMOVE =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${CYAN}Step 2: Removing resources from state...${NC}"
echo ""

SUCCESS=0
FAILED=0

while IFS= read -r resource; do
    echo -n "Removing: $resource ... "
    if terraform state rm "$resource" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        ((SUCCESS++))
    else
        echo -e "${RED}✗${NC}"
        ((FAILED++))
    fi
done <<< "$RESOURCES"

echo ""
echo -e "${CYAN}Step 3: Summary${NC}"
echo "  Removed: ${GREEN}${SUCCESS}${NC}"
if [ $FAILED -gt 0 ]; then
    echo "  Failed:  ${RED}${FAILED}${NC}"
fi
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Some removals failed. You may need to run:${NC}"
    echo "    terraform destroy -target=<resource>"
    echo "    Or: terraform destroy && terraform apply"
    echo ""
fi

echo -e "${GREEN}✓${NC} Terraform state cleanup complete!"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo "  1. Run: terraform plan"
echo "     Should show NO direct_grant resources being created"
echo ""
echo "  2. Run: terraform apply"
echo "     Should succeed without 'direct-grant-otp-setup' errors"
echo ""
echo "  3. Verify: All 11 realms created successfully"
echo ""

