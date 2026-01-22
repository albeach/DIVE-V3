#!/bin/bash
# Setup NZL realm and client using Keycloak Admin API

TOKEN=$(curl -k -X POST "https://localhost:8476/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password&username=admin&password=6XpyNq9xpleypOqDUwwm8g&client_id=admin-cli" 2>/dev/null | jq -r .access_token)

echo "Creating dive-v3-broker-nzl realm..."
curl -k -X POST "https://localhost:8476/admin/realms" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "realm": "dive-v3-broker-nzl",
    "displayName": "DIVE V3 Broker - New Zealand Defence Force",
    "enabled": true
  }' 2>/dev/null

echo "Creating dive-v3-broker-nzl client..."
curl -k -X POST "https://localhost:8476/admin/realms/dive-v3-broker-nzl/clients" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "dive-v3-broker-nzl",
    "name": "DIVE V3 Broker Client",
    "enabled": true,
    "protocol": "openid-connect",
    "publicClient": false,
    "secret": "lfOOXQ9TESsrDjgA5ryHgaVHzsw7AV",
    "directAccessGrantsEnabled": true,
    "serviceAccountsEnabled": true
  }' 2>/dev/null

echo "NZL realm setup complete"
