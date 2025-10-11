#!/bin/bash
# Final fix: Store acpCOI as single JSON string (not array of strings)

set -e

KEYCLOAK_URL="http://localhost:8081"
REALM="dive-v3-pilot"

# Get admin token
ADMIN_TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

echo "Fixing testuser-us..."
USER_ID=$(curl -s "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=testuser-us&exact=true" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq -r '.[0].id')

curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "uniqueID": ["john.doe@mil"],
      "clearance": ["SECRET"],
      "countryOfAffiliation": ["USA"],
      "acpCOI": ["[\"NATO-COSMIC\",\"FVEY\"]"]
    }
  }' && echo "✅ testuser-us fixed"

echo "Fixing testuser-us-confid..."
USER_ID=$(curl -s "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=testuser-us-confid&exact=true" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq -r '.[0].id')

curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "uniqueID": ["jane.smith@mil"],
      "clearance": ["CONFIDENTIAL"],
      "countryOfAffiliation": ["USA"],
      "acpCOI": ["[\"FVEY\"]"]
    }
  }' && echo "✅ testuser-us-confid fixed"

echo "Fixing testuser-us-unclass..."
USER_ID=$(curl -s "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=testuser-us-unclass&exact=true" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq -r '.[0].id')

curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "uniqueID": ["bob.jones@mil"],
      "clearance": ["UNCLASSIFIED"],
      "countryOfAffiliation": ["USA"],
      "acpCOI": ["[]"]
    }
  }' && echo "✅ testuser-us-unclass fixed"

echo ""
echo "=== Users updated ==="
echo "acpCOI now stored as single JSON string value"
echo "Mapper will extract first element and put in token"
echo "Backend will parse JSON string into array"

