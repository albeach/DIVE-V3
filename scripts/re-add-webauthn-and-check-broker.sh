#!/bin/bash
# Re-add webauthn-register required action and check broker flow

REALM="dive-v3-usa"
USERNAME="testuser-usa-ts"

echo "🔧 Re-adding webauthn-register required action to $USERNAME"
echo "============================================================"

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

# Re-add webauthn-register required action
curl -k -s -X PUT "https://dev-auth.dive25.com/admin/realms/$REALM/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "requiredActions": ["webauthn-register"]
  }'

echo ""
echo "✅ Re-added webauthn-register required action"
echo ""

# Now let's check and disable the post-broker conditional OTP flow
echo "🔧 Checking broker realm post-broker flow configuration..."
echo "============================================================"

# Get all authentication flows in broker realm
BROKER_REALM="dive-v3-broker"
echo ""
echo "Authentication flows in $BROKER_REALM:"
curl -k -s -X GET "https://dev-auth.dive25.com/admin/realms/$BROKER_REALM/authentication/flows" \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | select(.alias | contains("Post Broker")) | {alias, id, description}'

echo ""
echo "✅ Done! Now I'll create a script to disable the post-broker OTP check..."




