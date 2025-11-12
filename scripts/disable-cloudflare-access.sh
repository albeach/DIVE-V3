#!/bin/bash
#
# Disable Cloudflare Access for Development Applications
# This script uses the Cloudflare API to disable Access policies on dev-api and dev-auth
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "Cloudflare Access Management"
echo "======================================"
echo ""

# Check if API token is set
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo -e "${YELLOW}CLOUDFLARE_API_TOKEN not set${NC}"
    echo ""
    echo "To get your API token:"
    echo "1. Go to: https://dash.cloudflare.com/profile/api-tokens"
    echo "2. Create Token → Use Template: 'Edit Cloudflare Zero Trust'"
    echo "3. Or create custom token with permissions:"
    echo "   - Account > Access: Applications and Policies > Edit"
    echo "   - Account > Account Settings > Read"
    echo ""
    read -p "Enter your Cloudflare API Token: " CLOUDFLARE_API_TOKEN
    echo ""
fi

# Check if Account ID is set
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo -e "${YELLOW}CLOUDFLARE_ACCOUNT_ID not set${NC}"
    echo ""
    echo "Finding your Account ID..."
    
    # Try to get account ID from API
    ACCOUNTS=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json")
    
    ACCOUNT_ID=$(echo "$ACCOUNTS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -n "$ACCOUNT_ID" ]; then
        echo -e "${GREEN}✅ Found Account ID: $ACCOUNT_ID${NC}"
        CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
    else
        echo -e "${RED}❌ Could not auto-detect Account ID${NC}"
        echo ""
        echo "To find your Account ID:"
        echo "1. Go to: https://dash.cloudflare.com/"
        echo "2. Select your account"
        echo "3. Look at the URL: https://dash.cloudflare.com/{ACCOUNT_ID}"
        echo ""
        read -p "Enter your Cloudflare Account ID: " CLOUDFLARE_ACCOUNT_ID
    fi
    echo ""
fi

echo "Account ID: $CLOUDFLARE_ACCOUNT_ID"
echo ""

# List all Access applications
echo "Fetching Access applications..."
APPS=$(curl -s -X GET \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json")

echo "$APPS" | python3 -m json.tool 2>/dev/null || echo "$APPS"
echo ""

# Find and disable dev-api.dive25.com
echo "Looking for dev-api.dive25.com..."
DEV_API_ID=$(echo "$APPS" | grep -B 5 "dev-api.dive25.com" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$DEV_API_ID" ]; then
    echo -e "${YELLOW}Found dev-api.dive25.com (ID: $DEV_API_ID)${NC}"
    echo "Deleting Access application..."
    
    DELETE_RESULT=$(curl -s -X DELETE \
        "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps/$DEV_API_ID" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json")
    
    if echo "$DELETE_RESULT" | grep -q '"success":true'; then
        echo -e "${GREEN}✅ Removed Access from dev-api.dive25.com${NC}"
    else
        echo -e "${RED}❌ Failed to remove Access from dev-api.dive25.com${NC}"
        echo "$DELETE_RESULT"
    fi
else
    echo -e "${GREEN}✅ dev-api.dive25.com has no Access protection${NC}"
fi
echo ""

# Find and disable dev-auth.dive25.com
echo "Looking for dev-auth.dive25.com..."
DEV_AUTH_ID=$(echo "$APPS" | grep -B 5 "dev-auth.dive25.com" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$DEV_AUTH_ID" ]; then
    echo -e "${YELLOW}Found dev-auth.dive25.com (ID: $DEV_AUTH_ID)${NC}"
    echo "Deleting Access application..."
    
    DELETE_RESULT=$(curl -s -X DELETE \
        "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps/$DEV_AUTH_ID" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json")
    
    if echo "$DELETE_RESULT" | grep -q '"success":true'; then
        echo -e "${GREEN}✅ Removed Access from dev-auth.dive25.com${NC}"
    else
        echo -e "${RED}❌ Failed to remove Access from dev-auth.dive25.com${NC}"
        echo "$DELETE_RESULT"
    fi
else
    echo -e "${GREEN}✅ dev-auth.dive25.com has no Access protection${NC}"
fi
echo ""

echo "======================================"
echo "Testing endpoints..."
echo "======================================"
echo ""

echo "Testing dev-api.dive25.com/api/idps/public..."
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://dev-api.dive25.com/api/idps/public)
if [ "$API_STATUS" = "200" ] || [ "$API_STATUS" = "404" ]; then
    echo -e "${GREEN}✅ API accessible (HTTP $API_STATUS)${NC}"
else
    echo -e "${YELLOW}⚠️  API returned HTTP $API_STATUS (might still have Access)${NC}"
fi
echo ""

echo "Testing dev-auth.dive25.com..."
AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://dev-auth.dive25.com)
if [ "$AUTH_STATUS" = "200" ] || [ "$AUTH_STATUS" = "404" ]; then
    echo -e "${GREEN}✅ Auth accessible (HTTP $AUTH_STATUS)${NC}"
else
    echo -e "${YELLOW}⚠️  Auth returned HTTP $AUTH_STATUS (might still have Access)${NC}"
fi
echo ""

echo "======================================"
echo "Done!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Reload your browser: https://dev-app.dive25.com"
echo "2. The IdP selector should now work"
echo "3. If still seeing issues, wait 30-60s for DNS propagation"
echo ""




