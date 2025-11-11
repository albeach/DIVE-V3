#!/bin/bash
# Cleanup existing DNS records and recreate for Cloudflare Tunnel

set -e

echo "======================================"
echo "DNS Records Cleanup & Recreation"
echo "======================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo "Please run as root (sudo)"
   exit 1
fi

# Get tunnel name
TUNNEL_NAME="dive-v3-tunnel"
echo "Tunnel name: $TUNNEL_NAME"

# Check if tunnel exists
if ! cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
    echo "❌ Tunnel '$TUNNEL_NAME' not found"
    echo ""
    echo "Available tunnels:"
    cloudflared tunnel list
    echo ""
    read -p "Enter your tunnel name: " TUNNEL_NAME
fi

# Domains to manage
DOMAINS=("dev-app.dive25.com" "dev-api.dive25.com" "dev-auth.dive25.com")

echo ""
echo "======================================"
echo "Step 1: Delete Existing Routes"
echo "======================================"
echo ""

for DOMAIN in "${DOMAINS[@]}"; do
    echo "Checking for existing route: $DOMAIN"
    
    # Try to delete the route (will fail if it doesn't exist, but that's ok)
    if cloudflared tunnel route dns --overwrite-dns $TUNNEL_NAME $DOMAIN 2>/dev/null; then
        echo "✅ Overwritten existing route for $DOMAIN"
    else
        echo "⚠️  Could not overwrite route for $DOMAIN (may not exist or need manual deletion)"
    fi
done

echo ""
echo "======================================"
echo "Step 2: Using Cloudflare API Method"
echo "======================================"
echo ""
echo "The --overwrite-dns flag didn't work. We need to use the Cloudflare API."
echo ""
echo "Please provide your Cloudflare credentials:"
echo ""

# Get Cloudflare API credentials
read -p "Cloudflare API Token (or leave empty to use Global API Key): " CF_API_TOKEN

if [ -z "$CF_API_TOKEN" ]; then
    read -p "Cloudflare Email: " CF_EMAIL
    read -p "Cloudflare Global API Key: " CF_API_KEY
    AUTH_HEADER="X-Auth-Email: $CF_EMAIL"
    AUTH_KEY_HEADER="X-Auth-Key: $CF_API_KEY"
else
    AUTH_HEADER="Authorization: Bearer $CF_API_TOKEN"
    AUTH_KEY_HEADER=""
fi

# Get Zone ID for dive25.com
echo ""
echo "Fetching Zone ID for dive25.com..."

if [ -z "$CF_API_TOKEN" ]; then
    ZONE_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=dive25.com" \
        -H "$AUTH_HEADER" \
        -H "$AUTH_KEY_HEADER" \
        -H "Content-Type: application/json")
else
    ZONE_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=dive25.com" \
        -H "$AUTH_HEADER" \
        -H "Content-Type: application/json")
fi

ZONE_ID=$(echo "$ZONE_RESPONSE" | jq -r '.result[0].id')

if [ -z "$ZONE_ID" ] || [ "$ZONE_ID" == "null" ]; then
    echo "❌ Failed to get Zone ID for dive25.com"
    echo ""
    echo "Response:"
    echo "$ZONE_RESPONSE" | jq .
    exit 1
fi

echo "✅ Zone ID: $ZONE_ID"
echo ""

# Delete existing DNS records
echo "======================================"
echo "Step 3: Delete Existing DNS Records"
echo "======================================"
echo ""

for DOMAIN in "${DOMAINS[@]}"; do
    echo "Checking for existing DNS record: $DOMAIN"
    
    # Get record ID
    if [ -z "$CF_API_TOKEN" ]; then
        RECORD_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=$DOMAIN" \
            -H "$AUTH_HEADER" \
            -H "$AUTH_KEY_HEADER" \
            -H "Content-Type: application/json")
    else
        RECORD_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=$DOMAIN" \
            -H "$AUTH_HEADER" \
            -H "Content-Type: application/json")
    fi
    
    RECORD_ID=$(echo "$RECORD_RESPONSE" | jq -r '.result[0].id')
    
    if [ -z "$RECORD_ID" ] || [ "$RECORD_ID" == "null" ]; then
        echo "  No existing record found for $DOMAIN"
    else
        echo "  Found existing record: $RECORD_ID"
        echo "  Deleting..."
        
        if [ -z "$CF_API_TOKEN" ]; then
            DELETE_RESPONSE=$(curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
                -H "$AUTH_HEADER" \
                -H "$AUTH_KEY_HEADER" \
                -H "Content-Type: application/json")
        else
            DELETE_RESPONSE=$(curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
                -H "$AUTH_HEADER" \
                -H "Content-Type: application/json")
        fi
        
        if echo "$DELETE_RESPONSE" | jq -e '.success' > /dev/null; then
            echo "  ✅ Deleted $DOMAIN"
        else
            echo "  ❌ Failed to delete $DOMAIN"
            echo "$DELETE_RESPONSE" | jq .
        fi
    fi
    echo ""
done

# Create new tunnel routes
echo "======================================"
echo "Step 4: Create Tunnel Routes"
echo "======================================"
echo ""

for DOMAIN in "${DOMAINS[@]}"; do
    echo "Creating tunnel route for $DOMAIN..."
    
    if cloudflared tunnel route dns $TUNNEL_NAME $DOMAIN; then
        echo "✅ Created route for $DOMAIN"
    else
        echo "❌ Failed to create route for $DOMAIN"
    fi
    echo ""
done

echo ""
echo "======================================"
echo "✅ DNS Records Updated!"
echo "======================================"
echo ""
echo "Your tunnel is now routing:"
echo "  - dev-app.dive25.com  → Frontend"
echo "  - dev-api.dive25.com  → Backend API"
echo "  - dev-auth.dive25.com → Keycloak"
echo ""
echo "DNS propagation may take a few minutes."
echo ""
echo "Test your tunnel:"
echo "  cloudflared tunnel info $TUNNEL_NAME"
echo ""



