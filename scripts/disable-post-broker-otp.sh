#!/bin/bash
# Disable the post-broker conditional OTP flow temporarily for testing

BROKER_REALM="dive-v3-broker"
FLOW_ALIAS="Post Broker MFA - DIVE V3 Broker"

echo "🔧 Disabling post-broker conditional OTP check"
echo "==============================================="

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

# Get flow executions
echo "Current flow executions:"
FLOW_EXECUTIONS=$(curl -k -s -X GET "https://dev-auth.dive25.com/admin/realms/$BROKER_REALM/authentication/flows/${FLOW_ALIAS// /%20}/executions" \
  -H "Authorization: Bearer $TOKEN")

echo "$FLOW_EXECUTIONS" | jq '.[] | {displayName, requirement, id}'
echo ""

# Find the conditional OTP subflow
CONDITIONAL_OTP_ID=$(echo "$FLOW_EXECUTIONS" | jq -r '.[] | select(.displayName | contains("Conditional OTP")) | .id')

if [ -z "$CONDITIONAL_OTP_ID" ] || [ "$CONDITIONAL_OTP_ID" == "null" ]; then
  echo "⚠️  Could not find Conditional OTP subflow by name, trying alternative approach..."
  # Try finding by looking for CONDITIONAL requirement
  CONDITIONAL_OTP_ID=$(echo "$FLOW_EXECUTIONS" | jq -r '.[] | select(.requirement == "CONDITIONAL" and .level > 0) | .id' | head -1)
fi

if [ -z "$CONDITIONAL_OTP_ID" ] || [ "$CONDITIONAL_OTP_ID" == "null" ]; then
  echo "❌ Could not find Conditional OTP subflow"
  echo "Here are all executions:"
  echo "$FLOW_EXECUTIONS" | jq '.'
  exit 1
fi

echo "Found Conditional OTP subflow ID: $CONDITIONAL_OTP_ID"
echo ""

# Disable it by changing requirement to DISABLED
echo "Disabling the conditional OTP check..."
curl -k -s -X PUT "https://dev-auth.dive25.com/admin/realms/$BROKER_REALM/authentication/flows/${FLOW_ALIAS// /%20}/executions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"$CONDITIONAL_OTP_ID\",
    \"requirement\": \"DISABLED\"
  }"

echo ""
echo "✅ Disabled conditional OTP check in post-broker flow"
echo ""
echo "Verification - Updated flow:"
curl -k -s -X GET "https://dev-auth.dive25.com/admin/realms/$BROKER_REALM/authentication/flows/${FLOW_ALIAS// /%20}/executions" \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | {displayName, requirement}'

echo ""
echo "✅ Done! Now try logging in again."
echo ""
echo "To re-enable later, run:"
echo "  # Change requirement back to CONDITIONAL for execution ID: $CONDITIONAL_OTP_ID"



