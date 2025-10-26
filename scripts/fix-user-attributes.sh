#!/bin/bash
# ============================================
# Fix User Attributes - Terraform Provider Bug Workaround
# ============================================
# 
# Workaround for mrparkers/keycloak v4.4.0 bug where user attributes
# don't persist via Terraform. This script sets attributes via REST API.
#
# Usage: ./scripts/fix-user-attributes.sh
#
# Reference: ADMIN-DIVE-MFA-ISSUE.md

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
ADMIN_USER="${KEYCLOAK_ADMIN_USER:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASS:-admin}"

echo "=================================================="
echo "Fixing User Attributes (Terraform Provider Bug)"
echo "=================================================="
echo ""

# Get admin token
echo "[1/3] Getting admin access token..."
TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo "❌ Failed to get admin token"
  exit 1
fi

echo "✅ Admin token obtained"
echo ""

# Get admin-dive user ID
echo "[2/3] Looking up admin-dive user..."
USER_ID=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/dive-v3-broker/users?username=admin-dive" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

if [ -z "$USER_ID" ] || [ "$USER_ID" == "null" ]; then
  echo "❌ User 'admin-dive' not found in dive-v3-broker realm"
  exit 1
fi

echo "✅ Found user: $USER_ID"
echo ""

# Set attributes
echo "[3/3] Setting user attributes..."
curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/dive-v3-broker/users/${USER_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "uniqueID": ["admin@dive-v3.pilot"],
      "clearance": ["TOP_SECRET"],
      "countryOfAffiliation": ["USA"],
      "acpCOI": ["NATO-COSMIC,FVEY,CAN-US"],
      "dutyOrg": ["DIVE_ADMIN"],
      "orgUnit": ["SYSTEM_ADMINISTRATION"]
    }
  }' > /dev/null

if [ $? -eq 0 ]; then
  echo "✅ Attributes set successfully"
else
  echo "❌ Failed to set attributes"
  exit 1
fi

echo ""

# Verify
echo "Verifying attributes..."
CLEARANCE=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/dive-v3-broker/users/${USER_ID}" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.attributes.clearance[0]')

if [ "$CLEARANCE" == "TOP_SECRET" ]; then
  echo "✅ Verification successful: clearance = TOP_SECRET"
  echo ""
  echo "=================================================="
  echo "✅ MFA WILL NOW BE ENFORCED"
  echo "=================================================="
  echo ""
  echo "Next steps:"
  echo "1. Logout: http://localhost:3000/api/auth/signout"
  echo "2. Clear browser cookies"
  echo "3. Login: http://localhost:3000/login/dive-v3-broker"
  echo "4. Expected: QR code setup prompt"
  echo ""
else
  echo "❌ Verification failed: clearance = $CLEARANCE"
  exit 1
fi

