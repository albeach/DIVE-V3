#!/bin/bash
# ============================================
# Configure Pre-configured OTP for testuser-secret
# ============================================
# This script sets up OTP credentials for testuser-secret
# with a known secret so E2E tests can generate valid TOTP codes
#
# Pre-configured Secret: ONSWG4TFOQFA====
# This matches the E2E test expectation in mfa-complete-flow.spec.ts

set -e

KEYCLOAK_URL="http://localhost:8081"
REALM_NAME="dive-v3-broker"
USERNAME="testuser-secret"
OTP_SECRET="ONSWG4TFOQFA===="

echo "🔐 Configuring OTP for ${USERNAME} in ${REALM_NAME}..."

# 1. Get admin access token
echo "1️⃣  Getting admin access token..."
ADMIN_TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" == "null" ]; then
  echo "❌ Failed to get admin token"
  exit 1
fi

echo "✅ Got admin token"

# 2. Get user ID
echo "2️⃣  Looking up user ID for ${USERNAME}..."
USER_ID=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users?username=${USERNAME}&exact=true" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  | jq -r '.[0].id')

if [ -z "$USER_ID" ] || [ "$USER_ID" == "null" ]; then
  echo "❌ User ${USERNAME} not found in realm ${REALM_NAME}"
  exit 1
fi

echo "✅ Found user: ${USER_ID}"

# 3. Check if OTP is already configured
echo "3️⃣  Checking existing OTP configuration..."
EXISTING_OTP=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${USER_ID}/credentials" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  | jq -r '.[] | select(.type=="otp") | .id')

if [ -n "$EXISTING_OTP" ] && [ "$EXISTING_OTP" != "null" ]; then
  echo "⚠️  OTP already configured. Removing old configuration..."
  curl -s -X DELETE "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${USER_ID}/credentials/${EXISTING_OTP}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}"
  echo "✅ Removed old OTP configuration"
fi

# 4. Configure OTP credential
# Note: Keycloak Admin API doesn't directly support setting a specific OTP secret
# We need to use a workaround by setting it as a user attribute and having the
# custom SPI read it during enrollment
echo "4️⃣  Setting OTP secret as user attribute..."

curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"attributes\": {
      \"clearance\": \"SECRET\",
      \"countryOfAffiliation\": \"USA\",
      \"uniqueID\": \"${USERNAME}\",
      \"preConfiguredOtpSecret\": \"${OTP_SECRET}\"
    }
  }"

echo "✅ OTP secret configured as user attribute"

# 5. Verify the configuration
echo "5️⃣  Verifying configuration..."
ATTRIBUTES=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  | jq -r '.attributes')

echo "📋 User attributes:"
echo "$ATTRIBUTES" | jq .

echo ""
echo "✅ OTP pre-configuration complete!"
echo ""
echo "📝 Summary:"
echo "   User: ${USERNAME}"
echo "   Realm: ${REALM_NAME}"
echo "   OTP Secret: ${OTP_SECRET}"
echo "   Status: Ready for E2E testing"
echo ""
echo "💡 Note: The E2E test will use this secret to generate valid TOTP codes"

