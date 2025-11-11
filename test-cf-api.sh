#!/bin/bash
# Quick test to see if we can access Cloudflare API

read -p "Enter your Cloudflare API Token: " CF_TOKEN

echo ""
echo "Testing API access..."
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" | python3 -m json.tool || echo "Failed to parse JSON"
