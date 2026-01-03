#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Investigate Actual Attribute Flow (Locale vs Standard)
# =============================================================================
# Question: Are we using locale-specific GBR attributes (surname, givenName)
# or standard Keycloak attributes (firstName, lastName)?
# =============================================================================

set -e

LOG_FILE="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log"

log_debug() {
  local step="$1"
  local message="$2"
  local data="$3"
  echo "{\"runId\":\"attribute-flow\",\"step\":\"$step\",\"message\":\"$message\",\"data\":$data,\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        Attribute Flow Investigation                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Question: Are we using locale-specific attributes or standard?"
echo ""

GBR_PASS="JvbyzBXVHVdf3ViAcieTMdpO"
GBR_TOKEN=$(docker exec gbr-keycloak-gbr-1 curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${GBR_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

# =============================================================================
# Step 1: Check GBR User Profile configuration
# =============================================================================
echo "[Step 1] GBR User Profile Configuration"
echo "═══════════════════════════════════════════════════════════════"

USER_PROFILE=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/users/profile" 2>/dev/null)

echo "Standard Keycloak Attributes:"
echo "$USER_PROFILE" | jq -r '.attributes[] | select(.name | IN("firstName", "lastName", "email", "username")) | "  • " + .name + " (multivalued: " + (.multivalued|tostring) + ")"'

echo ""
echo "UK/Locale-Specific Attributes:"
UK_ATTRS=$(echo "$USER_PROFILE" | jq -r '.attributes[] | select(.name | IN("surname", "givenName", "familyName", "organisationUnit", "ukPersonnelNumber")) | .name' || echo "")

if [ -n "$UK_ATTRS" ]; then
  echo "$UK_ATTRS" | while read attr; do
    echo "  • $attr"
  done
  log_debug "1" "UK attributes exist" "{\"attributes\":\"$UK_ATTRS\"}"
else
  echo "  (None found)"
  log_debug "1" "No UK-specific attributes" "{}"
fi

echo ""
echo "DIVE Attributes:"
echo "$USER_PROFILE" | jq -r '.attributes[] | select(.name | IN("clearance", "countryOfAffiliation", "uniqueID", "acpCOI")) | "  • " + .name'

# =============================================================================
# Step 2: Check actual user data
# =============================================================================
echo ""
echo "[Step 2] Actual User Data in GBR Database"
echo "═══════════════════════════════════════════════════════════════"

USER_DATA=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/users?username=testuser-gbr-1&exact=true" 2>/dev/null)

echo "Standard Properties (built-in Keycloak fields):"
echo "$USER_DATA" | jq -r '.[0] | {
  username,
  email,
  firstName,
  lastName,
  emailVerified
}'

echo ""
echo "Custom Attributes (key-value pairs):"
echo "$USER_DATA" | jq -r '.[0].attributes // {} | to_entries[] | "  • " + .key + " = " + (.value | tostring)'

USER_HAS_SURNAME=$(echo "$USER_DATA" | jq -r '.[0].attributes.surname // "null"')
USER_HAS_GIVENNAME=$(echo "$USER_DATA" | jq -r '.[0].attributes.givenName // "null"')

if [ "$USER_HAS_SURNAME" != "null" ] && [ "$USER_HAS_SURNAME" != "null" ]; then
  echo ""
  echo "  ✓ User HAS UK-specific attributes (surname, givenName)"
  log_debug "2" "UK attributes present on user" "{\"surname\":\"$USER_HAS_SURNAME\",\"givenName\":\"$USER_HAS_GIVENNAME\"}"
else
  echo ""
  echo "  ✗ User does NOT have UK-specific attributes"
  echo "  ✓ Using standard Keycloak firstName/lastName"
  log_debug "2" "Using standard attributes" "{\"firstName\":\"$(echo "$USER_DATA" | jq -r '.[0].firstName')\",\"lastName\":\"$(echo "$USER_DATA" | jq -r '.[0].lastName')\"}"
fi

# =============================================================================
# Step 3: Check protocol mappers - what do they actually map?
# =============================================================================
echo ""
echo "[Step 3] Protocol Mappers - What They Map"
echo "═══════════════════════════════════════════════════════════════"

GBR_CLIENT=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients?clientId=dive-v3-cross-border-client" 2>/dev/null)
CLIENT_UUID=$(echo "$GBR_CLIENT" | jq -r '.[0].id')

PROTOCOL_MAPPERS=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}/protocol-mappers/models" 2>/dev/null)

echo "Profile Mappers:"
echo "$PROTOCOL_MAPPERS" | jq -r '.[] | select(.name | IN("given_name", "family_name", "email", "surname", "givenName")) | 
  .name + " (" + .protocolMapper + "):\n" +
  "    " + (.config."user.attribute" // .config.property // "computed") + " → " + .config."claim.name"
'

MAPS_SURNAME=$(echo "$PROTOCOL_MAPPERS" | jq -r '[.[] | select(.config."user.attribute" == "surname")] | length')
MAPS_FIRSTNAME=$(echo "$PROTOCOL_MAPPERS" | jq -r '[.[] | select(.config."user.attribute" == "firstName" or .config.property == "firstName")] | length')

echo ""
if [ "$MAPS_SURNAME" -gt 0 ]; then
  echo "  ✓ Mappers USE UK-specific attributes (surname → family_name)"
  log_debug "3" "UK-specific mappers" "{\"maps_surname\":true}"
else
  echo "  ✓ Mappers USE standard attributes (lastName/firstName → family_name/given_name)"
  log_debug "3" "Standard mappers" "{\"maps_surname\":false,\"maps_firstName\":true}"
fi

# =============================================================================
# Step 4: Show the complete mapping chain
# =============================================================================
echo ""
echo "[Step 4] Complete Attribute Flow"
echo "═══════════════════════════════════════════════════════════════"

echo ""
echo "Current Configuration:"
if [ "$USER_HAS_SURNAME" != "null" ]; then
  echo "  GBR User → Protocol Mapper → JWT → Import Mapper → USA User"
  echo "  surname  →  family_name   → JWT → lastName      → lastName"
  echo "  givenName→  given_name    → JWT → firstName     → firstName"
else
  echo "  GBR User  → Protocol Mapper → JWT → Import Mapper → USA User"
  echo "  firstName →  given_name    → JWT → firstName     → firstName"
  echo "  lastName  →  family_name   → JWT → lastName      → lastName"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

# Get the actual mapper configurations for clarity
echo "Detailed Protocol Mapper Analysis:"
echo ""
echo "$PROTOCOL_MAPPERS" | jq -r '.[] | select(.name | contains("name")) | 
  "Mapper: " + .name + "\n" +
  "  Type: " + .protocolMapper + "\n" +
  "  Source: " + (.config."user.attribute" // .config.property // "N/A") + "\n" +
  "  Target Claim: " + (.config."claim.name" // "N/A") + "\n"
' | head -40

log_debug "4" "Complete flow documented" "{}"
