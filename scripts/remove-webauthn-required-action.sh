#!/bin/bash
# Remove webauthn-register required action from testuser-usa-ts
# The user has already successfully registered WebAuthn!

REALM="dive-v3-usa"
USERNAME="testuser-usa-ts"

echo "🔧 Removing webauthn-register required action from $USERNAME"
echo "============================================================="

# Get access token
TOKEN=$(curl -k -s -X POST "https://dev-auth.dive25.com/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo "❌ Failed to get admin token"
  exit 1
fi

echo "✅ Got admin token"

# Get user ID
USER_ID=$(curl -k -s -X GET "https://dev-auth.dive25.com/admin/realms/$REALM/users?username=$USERNAME&exact=true" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

if [ -z "$USER_ID" ] || [ "$USER_ID" == "null" ]; then
  echo "❌ User not found"
  exit 1
fi

echo "✅ Found user: $USER_ID"

# Remove required action
curl -k -s -X DELETE "https://dev-auth.dive25.com/admin/realms/$REALM/users/$USER_ID/execute-actions-email" \
  -H "Authorization: Bearer $TOKEN"

# Update user to remove requiredActions
curl -k -s -X PUT "https://dev-auth.dive25.com/admin/realms/$REALM/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "requiredActions": []
  }'

echo ""
echo "✅ Removed webauthn-register required action"
echo ""
echo "Verification - User Details:"
curl -k -s -X GET "https://dev-auth.dive25.com/admin/realms/$REALM/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    username,
    requiredActions
  }'

echo ""
echo "✅ Done! Try logging in again now."




