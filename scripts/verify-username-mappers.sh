#!/bin/bash
# Verification script for username mappers deployment

set -e

KEYCLOAK_URL="http://localhost:8081"
ADMIN_USER="admin"
ADMIN_PASS="admin"

echo "==================================="
echo "Username Mapper Deployment Verification"
echo "==================================="
echo

# Get admin token
echo "🔐 Getting admin token..."
TOKEN_RESPONSE=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d 'grant_type=password' \
  -d 'client_id=admin-cli')

ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.access_token')

if [ "$ACCESS_TOKEN" == "null" ] || [ -z "$ACCESS_TOKEN" ]; then
    echo "❌ Failed to get access token"
    exit 1
fi

echo "✅ Access token obtained"
echo

# List of IdP brokers to check
IDPS=(
    "usa-realm-broker:United States"
    "fra-realm-broker:France"
    "can-realm-broker:Canada"
    "deu-realm-broker:Germany"
    "gbr-realm-broker:United Kingdom"
    "ita-realm-broker:Italy"
    "esp-realm-broker:Spain"
    "pol-realm-broker:Poland"
    "nld-realm-broker:Netherlands"
    "industry-realm-broker:Industry"
)

echo "📋 Checking username mappers for all IdP brokers..."
echo

SUCCESS_COUNT=0
FAIL_COUNT=0

for idp_info in "${IDPS[@]}"; do
    IFS=':' read -r idp_alias idp_name <<< "$idp_info"
    
    # Get mappers for this IdP
    MAPPERS=$(curl -s -X GET \
        "${KEYCLOAK_URL}/admin/realms/dive-v3-broker/identity-provider/instances/${idp_alias}/mappers" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -H "Content-Type: application/json")
    
    # Check if username mapper exists
    USERNAME_MAPPER=$(echo "$MAPPERS" | jq -r '.[] | select(.name | contains("username-from-uniqueID"))')
    
    if [ -n "$USERNAME_MAPPER" ]; then
        MAPPER_NAME=$(echo "$USERNAME_MAPPER" | jq -r '.name')
        MAPPER_TYPE=$(echo "$USERNAME_MAPPER" | jq -r '.identityProviderMapper')
        TEMPLATE=$(echo "$USERNAME_MAPPER" | jq -r '.config.template // "N/A"')
        
        echo "✅ ${idp_name} (${idp_alias})"
        echo "   Mapper: ${MAPPER_NAME}"
        echo "   Type: ${MAPPER_TYPE}"
        echo "   Template: ${TEMPLATE}"
        echo
        
        ((SUCCESS_COUNT++))
    else
        echo "❌ ${idp_name} (${idp_alias})"
        echo "   Username mapper NOT FOUND"
        echo
        
        ((FAIL_COUNT++))
    fi
done

echo "==================================="
echo "Summary:"
echo "  ✅ Success: ${SUCCESS_COUNT}/10"
echo "  ❌ Failed:  ${FAIL_COUNT}/10"
echo "==================================="
echo

# Check authentication flow
echo "🔄 Checking Post Broker MFA flow..."
FLOWS=$(curl -s -X GET \
    "${KEYCLOAK_URL}/admin/realms/dive-v3-broker/authentication/flows" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}")

BROKER_FLOW=$(echo "$FLOWS" | jq -r '.[] | select(.alias | contains("Post Broker MFA"))')

if [ -n "$BROKER_FLOW" ]; then
    FLOW_ID=$(echo "$BROKER_FLOW" | jq -r '.id')
    FLOW_ALIAS=$(echo "$BROKER_FLOW" | jq -r '.alias')
    
    echo "✅ Found: ${FLOW_ALIAS}"
    echo "   Flow ID: ${FLOW_ID}"
    
    # Get executions
    EXECUTIONS=$(curl -s -X GET \
        "${KEYCLOAK_URL}/admin/realms/dive-v3-broker/authentication/flows/${FLOW_ID}/executions" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}")
    
    echo "   Executions:"
    echo "$EXECUTIONS" | jq -r '.[] | "     - \(.displayName // .providerId) [\(.requirement)]"'
    echo
else
    echo "❌ Post Broker MFA flow not found"
    echo
fi

# Check a sample test user
echo "👤 Checking sample test user (USA UNCLASS)..."
USERS=$(curl -s -X GET \
    "${KEYCLOAK_URL}/admin/realms/dive-v3-usa/users?username=testuser-usa-unclass@example.mil&exact=true" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}")

USER_COUNT=$(echo "$USERS" | jq '. | length')

if [ "$USER_COUNT" -gt 0 ]; then
    USERNAME=$(echo "$USERS" | jq -r '.[0].username')
    UNIQUE_ID=$(echo "$USERS" | jq -r '.[0].attributes.uniqueID[0] // "N/A"')
    
    echo "✅ User found in dive-v3-usa realm"
    echo "   Username: ${USERNAME}"
    echo "   UniqueID: ${UNIQUE_ID}"
    
    if [ "$USERNAME" == "$UNIQUE_ID" ]; then
        echo "   ✅ Username matches uniqueID"
    else
        echo "   ⚠️  Username does NOT match uniqueID"
    fi
else
    echo "❌ Test user not found"
fi

echo
echo "==================================="
echo "Deployment verification complete!"
echo "==================================="

if [ $FAIL_COUNT -eq 0 ]; then
    echo "✅ All checks passed! Ready to test login."
    exit 0
else
    echo "⚠️  Some checks failed. Review the output above."
    exit 1
fi





