#!/bin/bash
# =============================================================================
# DIVE V3 - Configure DNS Records in Cloudflare
# =============================================================================
# Creates A records for app.dive25.com, api.dive25.com, idp.dive25.com
# Points to GKE Ingress static IP
# =============================================================================

set -euo pipefail

ZONE_ID="53200276d1d66a21b6c881ecd1c05414"
STATIC_IP="${1:-$(gcloud compute addresses describe dive-v3-ingress-ip --global --format='value(address)' 2>/dev/null)}"

if [ -z "$STATIC_IP" ]; then
    echo "Error: Static IP not found. Please provide IP as argument or ensure dive-v3-ingress-ip exists."
    exit 1
fi

# Get API token from environment or .env.cloudflare
if [ -f .env.cloudflare ]; then
    API_TOKEN=$(grep CLOUDFLARE_API_TOKEN .env.cloudflare | cut -d'=' -f2 | tr -d '"' | tr -d "'")
else
    API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
fi

if [ -z "$API_TOKEN" ]; then
    echo "Error: CLOUDFLARE_API_TOKEN not found. Set it in .env.cloudflare or environment."
    exit 1
fi

echo "=============================================================================="
echo "Configuring DNS Records for DIVE V3"
echo "=============================================================================="
echo "Zone ID: $ZONE_ID"
echo "Static IP: $STATIC_IP"
echo ""

# Function to create or update DNS record
create_or_update_record() {
    local name=$1
    local ip=$2
    
    echo "Configuring $name.dive25.com -> $ip"
    
    # Check if record exists
    EXISTING=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=$name.dive25.com&type=A" \
        -H "Authorization: Bearer $API_TOKEN" \
        -H "Content-Type: application/json" | jq -r '.result[0].id' 2>/dev/null || echo "")
    
    if [ -n "$EXISTING" ] && [ "$EXISTING" != "null" ]; then
        # Update existing record
        echo "  Updating existing record..."
        curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$EXISTING" \
            -H "Authorization: Bearer $API_TOKEN" \
            -H "Content-Type: application/json" \
            --data "{\"type\":\"A\",\"name\":\"$name\",\"content\":\"$ip\",\"ttl\":300,\"proxied\":false}" \
            | jq -r '.success, .errors[]?.message // empty' 2>/dev/null || echo "  Update request sent"
    else
        # Create new record
        echo "  Creating new record..."
        curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
            -H "Authorization: Bearer $API_TOKEN" \
            -H "Content-Type: application/json" \
            --data "{\"type\":\"A\",\"name\":\"$name\",\"content\":\"$ip\",\"ttl\":300,\"proxied\":false}" \
            | jq -r '.success, .errors[]?.message // empty' 2>/dev/null || echo "  Create request sent"
    fi
    echo ""
}

# Create DNS records
create_or_update_record "app" "$STATIC_IP"
create_or_update_record "api" "$STATIC_IP"
create_or_update_record "idp" "$STATIC_IP"

echo "=============================================================================="
echo "DNS Configuration Complete"
echo "=============================================================================="
echo ""
echo "Records created:"
echo "  app.dive25.com -> $STATIC_IP"
echo "  api.dive25.com -> $STATIC_IP"
echo "  idp.dive25.com -> $STATIC_IP"
echo ""
echo "Note: DNS propagation may take a few minutes."
echo "SSL certificate provisioning will begin once DNS is propagated."




