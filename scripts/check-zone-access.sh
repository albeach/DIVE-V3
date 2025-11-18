#!/bin/bash
# Check Zone-level Access (for dive25.com domain)

set -e

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    read -p "Enter your Cloudflare API Token: " CLOUDFLARE_API_TOKEN
fi

# Get zones
echo "Getting zones..."
ZONES=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=dive25.com" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json")

ZONE_ID=$(echo "$ZONES" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$ZONE_ID" ]; then
    echo "❌ Could not find zone for dive25.com"
    echo "Response: $ZONES"
    exit 1
fi

echo "Zone ID for dive25.com: $ZONE_ID"
echo ""

# Check Zone Lockdown rules (can block access)
echo "=== Zone Lockdown Rules ==="
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/firewall/lockdowns" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" | python3 -m json.tool
echo ""

# Check Firewall Rules
echo "=== Firewall Rules ==="
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/firewall/rules" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" | python3 -m json.tool
echo ""

# Check Page Rules
echo "=== Page Rules ==="
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/pagerules" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" | python3 -m json.tool
echo ""

# Get Account ID from zone
ACCOUNT_ID=$(echo "$ZONES" | grep -o '"account":{"id":"[^"]*"' | head -1 | cut -d'"' -f6)
echo "Account ID: $ACCOUNT_ID"
echo ""

# Check Zero Trust settings for this zone
echo "=== Zero Trust Seat Configuration ==="
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/access/seats" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" | python3 -m json.tool
echo ""

# Check if there's a default Access policy
echo "=== Default Access Policy ==="
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/access/organizations" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" | python3 -m json.tool





