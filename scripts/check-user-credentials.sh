#!/bin/bash
# Script to get user details and clearance to understand why auth is failing

REALM="dive-v3-usa"  # Change to pol if needed
USERNAME="testuser-usa-ts"

echo "🔍 Checking user details for $USERNAME in $REALM"
echo "=================================================="

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
echo ""

# Get user
USER_ID=$(curl -k -s -X GET "https://dev-auth.dive25.com/admin/realms/$REALM/users?username=$USERNAME&exact=true" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

if [ -z "$USER_ID" ] || [ "$USER_ID" == "null" ]; then
  echo "❌ User not found"
  exit 1
fi

echo "User ID: $USER_ID"
echo ""

# Get user details
echo "User Details:"
curl -k -s -X GET "https://dev-auth.dive25.com/admin/realms/$REALM/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '{
    username,
    email,
    enabled,
    requiredActions,
    attributes: .attributes | {clearance, countryOfAffiliation, acpCOI}
  }'

echo ""
echo "Registered Credentials:"
curl -k -s -X GET "https://dev-auth.dive25.com/admin/realms/$REALM/users/$USER_ID/credentials" \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | {
    type,
    userLabel,
    createdDate
  }'


