#!/bin/bash
# Enable User Profile and declare custom attributes for all realms
# Keycloak 26 requires User Profile to be enabled for custom attributes to work

set -e

# Get admin token
TOKEN=$(docker exec dive-v3-keycloak curl -s -X POST \
  http://localhost:8080/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

echo "Got admin token"

REALMS="dive-v3-usa dive-v3-esp dive-v3-fra dive-v3-gbr dive-v3-deu dive-v3-ita dive-v3-nld dive-v3-pol dive-v3-can dive-v3-industry"

for realm in $REALMS; do
  echo "Enabling User Profile for $realm..."
  
  # Enable User Profile
  docker exec dive-v3-keycloak curl -s -X PUT \
    "http://localhost:8080/admin/realms/$realm" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"attributes\": {\"userProfileEnabled\": \"true\"}}"
  
  echo "  ✅ Enabled for $realm"
  
  # Get current user profile config
  PROFILE=$(docker exec dive-v3-keycloak curl -s -X GET \
    "http://localhost:8080/admin/realms/$realm/users/profile" \
    -H "Authorization: Bearer $TOKEN")
  
  # Add our custom attributes to the profile
  UPDATED_PROFILE=$(echo "$PROFILE" | jq '.attributes += [
    {
      "name": "clearance",
      "displayName": "Security Clearance",
      "validations": {},
      "permissions": {"view": ["admin", "user"], "edit": ["admin"]},
      "multivalued": false
    },
    {
      "name": "clearanceOriginal",
      "displayName": "Original Clearance",
      "validations": {},
      "permissions": {"view": ["admin"], "edit": ["admin"]},
      "multivalued": false
    },
    {
      "name": "countryOfAffiliation",
      "displayName": "Country of Affiliation",
      "validations": {},
      "permissions": {"view": ["admin", "user"], "edit": ["admin"]},
      "multivalued": false
    },
    {
      "name": "uniqueID",
      "displayName": "Unique ID",
      "validations": {},
      "permissions": {"view": ["admin"], "edit": ["admin"]},
      "multivalued": false
    },
    {
      "name": "acpCOI",
      "displayName": "Community of Interest",
      "validations": {},
      "permissions": {"view": ["admin", "user"], "edit": ["admin", "user"]},
      "multivalued": true
    }
  ] | .attributes |= unique_by(.name)')
  
  # Update user profile
  docker exec dive-v3-keycloak curl -s -X PUT \
    "http://localhost:8080/admin/realms/$realm/users/profile" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$UPDATED_PROFILE" > /dev/null
  
  echo "  ✅ Declared custom attributes in User Profile"
done

echo ""
echo "✅ User Profile enabled and configured for all 10 realms"
echo "✅ Custom attributes declared: clearance, clearanceOriginal, countryOfAffiliation, uniqueID, acpCOI"
echo ""
echo "Next: Re-run populate-all-user-attributes script"

