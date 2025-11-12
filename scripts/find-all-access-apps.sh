#!/bin/bash
# Find ALL Cloudflare Access configurations
# Check: Self-hosted apps, Policies, Groups, Service tokens

set -e

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    read -p "Enter your Cloudflare API Token: " CLOUDFLARE_API_TOKEN
fi

# Get account ID
echo "Getting Account ID..."
ACCOUNTS=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json")

ACCOUNT_ID=$(echo "$ACCOUNTS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Account ID: $ACCOUNT_ID"
echo ""

# Check for self-hosted applications
echo "=== Self-Hosted Applications ==="
curl -s -X GET \
    "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/access/apps?type=self_hosted" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" | python3 -m json.tool
echo ""

# Check for bookmark applications
echo "=== Bookmark Applications ==="
curl -s -X GET \
    "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/access/apps?type=bookmark" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" | python3 -m json.tool
echo ""

# Check for all applications (no filter)
echo "=== ALL Access Applications ==="
APPS=$(curl -s -X GET \
    "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/access/apps" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json")

echo "$APPS" | python3 -m json.tool

# Extract application IDs and domains
echo ""
echo "=== Found Applications ===" 
echo "$APPS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'result' in data and data['result']:
        for app in data['result']:
            print(f\"ID: {app.get('id')} | Domain: {app.get('domain', 'N/A')} | Name: {app.get('name', 'N/A')}\")
    else:
        print('No applications found')
except:
    print('Error parsing JSON')
"
echo ""

# Check Access Policies
echo "=== Access Policies (Global) ==="
curl -s -X GET \
    "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/access/policies" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" | python3 -m json.tool
echo ""

# Save app IDs for deletion
echo "$APPS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'result' in data and data['result']:
        for app in data['result']:
            domain = app.get('domain', '')
            if 'dev-api.dive25.com' in domain or 'dev-auth.dive25.com' in domain:
                print(f\"export DEL_APP_ID={app.get('id')}\")
                print(f\"export DEL_APP_DOMAIN={domain}\")
except:
    pass
" > /tmp/cf_app_ids.sh

if [ -f /tmp/cf_app_ids.sh ] && [ -s /tmp/cf_app_ids.sh ]; then
    source /tmp/cf_app_ids.sh
    echo "Found app to delete: $DEL_APP_DOMAIN (ID: $DEL_APP_ID)"
    echo ""
    read -p "Delete this application? (y/N): " CONFIRM
    if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
        echo "Deleting application..."
        curl -s -X DELETE \
            "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/access/apps/$DEL_APP_ID" \
            -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
            -H "Content-Type: application/json" | python3 -m json.tool
    fi
else
    echo "No matching applications found to delete"
fi




