#!/usr/bin/env bash
set -euo pipefail

# ============================================
# Clear Keycloak User Sessions
# ============================================
# Clears all user sessions in the broker realm so new tokens will have the updated AMR/ACR mappers

KEYCLOAK_URL="${KEYCLOAK_URL:-https://keycloak.dive-v3.mil}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

echo "[INFO] Authenticating to Keycloak..."

TOKEN_RESPONSE=$(curl -sk -X POST \
  "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" 2>/dev/null)

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

if [ "$ACCESS_TOKEN" == "null" ] || [ -z "$ACCESS_TOKEN" ]; then
    echo "[ERROR] Failed to get access token"
    exit 1
fi

echo "[SUCCESS] Authenticated to Keycloak"

# Delete sessions in broker realm
echo "[INFO] Deleting user sessions in dive-v3-broker realm..."

curl -sk -X DELETE \
  "${KEYCLOAK_URL}/admin/realms/dive-v3-broker/sessions" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json"

echo ""
echo "[SUCCESS] Cleared all user sessions in dive-v3-broker realm"
echo "[INFO] Users will need to log in again to get new tokens with updated AMR/ACR mappers"



