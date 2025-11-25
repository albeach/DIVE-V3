#!/bin/bash
# Setup Cloudflare Secrets for DIVE V3
# This script stores Cloudflare credentials in GitHub Secrets and local .env

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     DIVE V3 - Cloudflare Secrets Setup                     ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${CYAN}[1/5] Checking prerequisites...${NC}"

if ! command -v gh &> /dev/null; then
  echo -e "${RED}✗ GitHub CLI not installed. Run: brew install gh${NC}"
  exit 1
fi

if ! gh auth status &> /dev/null; then
  echo -e "${RED}✗ Not logged into GitHub. Run: gh auth login${NC}"
  exit 1
fi

echo -e "${GREEN}✓ GitHub CLI authenticated${NC}"

# Get repository info
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null || echo "")
if [ -z "$REPO" ]; then
  echo -e "${YELLOW}! Could not detect repository. Please enter it:${NC}"
  read -p "Repository (owner/repo): " REPO
fi
echo -e "${GREEN}✓ Repository: ${REPO}${NC}"
echo ""

# Step 2: Get Cloudflare Account ID
echo -e "${CYAN}[2/5] Getting Cloudflare Account ID...${NC}"
WRANGLER_TOKEN=$(grep oauth_token ~/Library/Preferences/.wrangler/config/default.toml 2>/dev/null | cut -d'"' -f2 || echo "")

if [ -n "$WRANGLER_TOKEN" ]; then
  ACCOUNT_ID=$(curl -s "https://api.cloudflare.com/client/v4/accounts" \
    -H "Authorization: Bearer $WRANGLER_TOKEN" | jq -r '.result[0].id // empty')
  
  if [ -n "$ACCOUNT_ID" ]; then
    echo -e "${GREEN}✓ Found Account ID: ${ACCOUNT_ID}${NC}"
  fi
fi

if [ -z "$ACCOUNT_ID" ]; then
  echo -e "${YELLOW}Enter your Cloudflare Account ID (from dashboard URL):${NC}"
  read -p "Account ID: " ACCOUNT_ID
fi
echo ""

# Step 3: Get Zone ID
echo -e "${CYAN}[3/5] Getting Zone ID for dive25.com...${NC}"
if [ -n "$WRANGLER_TOKEN" ]; then
  ZONE_ID=$(curl -s "https://api.cloudflare.com/client/v4/zones?name=dive25.com" \
    -H "Authorization: Bearer $WRANGLER_TOKEN" | jq -r '.result[0].id // empty')
  
  if [ -n "$ZONE_ID" ]; then
    echo -e "${GREEN}✓ Found Zone ID: ${ZONE_ID}${NC}"
  fi
fi

if [ -z "$ZONE_ID" ]; then
  echo -e "${YELLOW}Enter your Zone ID for dive25.com:${NC}"
  read -p "Zone ID: " ZONE_ID
fi
echo ""

# Step 4: Get API Token (manual step)
echo -e "${CYAN}[4/5] Cloudflare API Token Setup${NC}"
echo ""
echo -e "${BOLD}Since Cloudflare requires manual token creation for security,${NC}"
echo -e "${BOLD}please create a token with these settings:${NC}"
echo ""
echo -e "  1. Go to: ${CYAN}https://dash.cloudflare.com/profile/api-tokens${NC}"
echo -e "  2. Click ${BOLD}'Create Token'${NC}"
echo -e "  3. Click ${BOLD}'Create Custom Token' → 'Get started'${NC}"
echo -e "  4. Configure:"
echo -e "     - Name: ${CYAN}DIVE V3 Operations${NC}"
echo -e "     - Permissions:"
echo -e "       • ${GREEN}Zone → Cache Purge → Edit${NC}"
echo -e "       • ${GREEN}Zone → Zone → Read${NC}"
echo -e "       • ${GREEN}Zone → DNS → Edit${NC} (optional, for DNS automation)"
echo -e "     - Zone Resources: ${CYAN}Include → Specific zone → dive25.com${NC}"
echo -e "  5. Click ${BOLD}'Continue to summary' → 'Create Token'${NC}"
echo -e "  6. ${BOLD}Copy the token${NC} (you won't see it again!)"
echo ""

# Open the page
if command -v open &> /dev/null; then
  read -p "Press Enter to open the Cloudflare dashboard..." 
  open "https://dash.cloudflare.com/profile/api-tokens"
fi

echo ""
echo -e "${YELLOW}Paste your API token below (input hidden):${NC}"
read -s CLOUDFLARE_API_TOKEN
echo ""

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo -e "${RED}✗ No token provided. Exiting.${NC}"
  exit 1
fi

# Verify the token works
echo -e "Verifying token..."
VERIFY=$(curl -s "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq -r '.success')

if [ "$VERIFY" != "true" ]; then
  echo -e "${RED}✗ Token verification failed. Please check the token.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Token verified successfully${NC}"
echo ""

# Step 5: Store secrets
echo -e "${CYAN}[5/5] Storing secrets...${NC}"

# Store in GitHub Secrets
echo -e "Storing in GitHub Secrets..."
echo "$CLOUDFLARE_API_TOKEN" | gh secret set CLOUDFLARE_API_TOKEN --repo "$REPO"
echo "$ACCOUNT_ID" | gh secret set CLOUDFLARE_ACCOUNT_ID --repo "$REPO"
echo "$ZONE_ID" | gh secret set CLOUDFLARE_ZONE_ID --repo "$REPO"
echo -e "${GREEN}✓ GitHub Secrets updated${NC}"

# Store in local .env
ENV_FILE=".env.cloudflare"
cat > "$ENV_FILE" << EOF
# Cloudflare Configuration for DIVE V3
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# DO NOT COMMIT THIS FILE

CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN}
CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID}
CLOUDFLARE_ZONE_ID=${ZONE_ID}
CLOUDFLARE_ZONE_NAME=dive25.com
EOF

chmod 600 "$ENV_FILE"
echo -e "${GREEN}✓ Created ${ENV_FILE} (chmod 600)${NC}"

# Add to .gitignore if not already there
if ! grep -q "^\.env\.cloudflare$" .gitignore 2>/dev/null; then
  echo ".env.cloudflare" >> .gitignore
  echo -e "${GREEN}✓ Added to .gitignore${NC}"
fi

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                    Setup Complete! 🎉                      ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Secrets stored in:"
echo -e "  • GitHub: ${CYAN}${REPO}${NC} (Settings → Secrets → Actions)"
echo -e "  • Local:  ${CYAN}${ENV_FILE}${NC}"
echo ""
echo -e "Usage in scripts:"
echo -e "  ${CYAN}source .env.cloudflare${NC}"
echo -e "  ${CYAN}./scripts/cloudflare-utils.sh purge-cache${NC}"
echo ""
echo -e "Usage in GitHub Actions:"
echo -e "  ${CYAN}\${{ secrets.CLOUDFLARE_API_TOKEN }}${NC}"
echo ""

# Test cache purge
read -p "Test cache purge now? (y/n): " TEST_PURGE
if [ "$TEST_PURGE" = "y" ]; then
  echo ""
  echo -e "${CYAN}Testing cache purge...${NC}"
  PURGE_RESULT=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}')
  
  if echo "$PURGE_RESULT" | jq -e '.success' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Cache purge successful!${NC}"
  else
    echo -e "${RED}✗ Cache purge failed:${NC}"
    echo "$PURGE_RESULT" | jq .
  fi
fi
