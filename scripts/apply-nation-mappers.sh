#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Apply NATO Nation Protocol Mappers to Keycloak Client
# =============================================================================
# Usage: ./scripts/apply-nation-mappers.sh <nation> <keycloak-url> <realm> <client-id> <admin-password>
# Example: ./scripts/apply-nation-mappers.sh france localhost:8447 dive-v3-broker-fra dive-v3-cross-border-client MyPassword123
# =============================================================================

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
  local color="$1"
  local message="$2"
  echo -e "${color}${message}${NC}"
}

# Check arguments
if [ "$#" -lt 4 ]; then
  echo "Usage: $0 <nation> <keycloak-url> <realm> <client-id> [admin-password]"
  echo ""
  echo "Arguments:"
  echo "  nation           - Nation name (lowercase, e.g., france, germany, united-kingdom)"
  echo "  keycloak-url     - Keycloak URL (e.g., localhost:8447)"
  echo "  realm            - Realm name (e.g., dive-v3-broker-fra)"
  echo "  client-id        - Client ID (e.g., dive-v3-cross-border-client)"
  echo "  admin-password   - Optional: Admin password (will prompt if not provided)"
  echo ""
  echo "Available nations:"
  ls -1 "$(dirname "$0")/../keycloak/mapper-templates/nato-nations/" | grep -E '\.json$' | grep -v '_template' | sed 's/.json$//' | sed 's/^/  - /'
  exit 1
fi

NATION="$1"
KEYCLOAK_URL="$2"
REALM="$3"
CLIENT_ID="$4"
ADMIN_PASSWORD="${5:-}"

# Resolve script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/../keycloak/mapper-templates/reference/nato-nations"
TEMPLATE_FILE="$TEMPLATE_DIR/${NATION}.json"

# Check if template exists
if [ ! -f "$TEMPLATE_FILE" ]; then
  print_status "$RED" "✗ Template not found: $TEMPLATE_FILE"
  echo ""
  echo "Available nations:"
  ls -1 "$TEMPLATE_DIR" | grep -E '\.json$' | grep -v '_template' | sed 's/.json$//' | sed 's/^/  - /'
  exit 1
fi

# Prompt for password if not provided
if [ -z "$ADMIN_PASSWORD" ]; then
  read -sp "Enter Keycloak admin password: " ADMIN_PASSWORD
  echo ""
fi

print_status "$BLUE" "╔══════════════════════════════════════════════════════════════╗"
print_status "$BLUE" "║       Applying NATO Nation Protocol Mappers                 ║"
print_status "$BLUE" "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Read template
TEMPLATE=$(cat "$TEMPLATE_FILE")
NATION_NAME=$(echo "$TEMPLATE" | jq -r '.nation.name')
NATION_ISO=$(echo "$TEMPLATE" | jq -r '.nation.iso3166')
MAPPERS=$(echo "$TEMPLATE" | jq '.protocolMappers')
MAPPER_COUNT=$(echo "$MAPPERS" | jq 'length')

print_status "$GREEN" "Nation: $NATION_NAME ($NATION_ISO)"
print_status "$GREEN" "Mappers to apply: $MAPPER_COUNT"
echo ""

# =============================================================================
# Step 1: Authenticate with Keycloak
# =============================================================================
print_status "$YELLOW" "[Step 1/4] Authenticating with Keycloak..."

TOKEN_RESPONSE=$(curl -sk -X POST "https://$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=$ADMIN_PASSWORD" \
  -d "grant_type=password" 2>/dev/null)

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  print_status "$RED" "✗ Authentication failed"
  echo "Response: $(echo "$TOKEN_RESPONSE" | jq '.')"
  exit 1
fi

print_status "$GREEN" "  ✓ Authenticated successfully"
echo ""

# =============================================================================
# Step 2: Find the client
# =============================================================================
print_status "$YELLOW" "[Step 2/4] Finding client..."

CLIENT_DATA=$(curl -sk -H "Authorization: Bearer $TOKEN" \
  "https://$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=$CLIENT_ID" 2>/dev/null)

CLIENT_UUID=$(echo "$CLIENT_DATA" | jq -r '.[0].id')

if [ "$CLIENT_UUID" == "null" ] || [ -z "$CLIENT_UUID" ]; then
  print_status "$RED" "✗ Client not found: $CLIENT_ID"
  exit 1
fi

print_status "$GREEN" "  ✓ Found client: $CLIENT_ID"
print_status "$GREEN" "    UUID: $CLIENT_UUID"
echo ""

# =============================================================================
# Step 3: Apply protocol mappers
# =============================================================================
print_status "$YELLOW" "[Step 3/4] Applying protocol mappers..."

SUCCESS_COUNT=0
SKIP_COUNT=0
ERROR_COUNT=0

for i in $(seq 0 $((MAPPER_COUNT - 1))); do
  MAPPER=$(echo "$MAPPERS" | jq ".[$i]")
  MAPPER_NAME=$(echo "$MAPPER" | jq -r '.name')

  # Check if mapper already exists
  EXISTING=$(curl -sk -H "Authorization: Bearer $TOKEN" \
    "https://$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID/protocol-mappers/models" 2>/dev/null | \
    jq -r --arg name "$MAPPER_NAME" '.[] | select(.name==$name) | .id')

  if [ -n "$EXISTING" ] && [ "$EXISTING" != "null" ]; then
    # Update existing mapper
    RESPONSE=$(curl -sk -X PUT \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      "https://$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID/protocol-mappers/models/$EXISTING" \
      -d "$MAPPER" -w "%{http_code}" -o /dev/null 2>/dev/null)

    if [ "$RESPONSE" == "204" ] || [ "$RESPONSE" == "200" ]; then
      print_status "$GREEN" "  ✓ Updated: $MAPPER_NAME"
      ((SUCCESS_COUNT++))
    else
      print_status "$RED" "  ✗ Failed to update: $MAPPER_NAME (HTTP $RESPONSE)"
      ((ERROR_COUNT++))
    fi
  else
    # Create new mapper
    RESPONSE=$(curl -sk -X POST \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      "https://$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID/protocol-mappers/models" \
      -d "$MAPPER" -w "%{http_code}" -o /dev/null 2>/dev/null)

    if [ "$RESPONSE" == "201" ]; then
      print_status "$GREEN" "  ✓ Created: $MAPPER_NAME"
      ((SUCCESS_COUNT++))
    else
      print_status "$RED" "  ✗ Failed to create: $MAPPER_NAME (HTTP $RESPONSE)"
      ((ERROR_COUNT++))
    fi
  fi
done

echo ""

# =============================================================================
# Step 4: Verify mappers
# =============================================================================
print_status "$YELLOW" "[Step 4/4] Verifying mappers..."

FINAL_MAPPERS=$(curl -sk -H "Authorization: Bearer $TOKEN" \
  "https://$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_UUID/protocol-mappers/models" 2>/dev/null)

FINAL_COUNT=$(echo "$FINAL_MAPPERS" | jq 'length')

print_status "$GREEN" "  ✓ Total mappers on client: $FINAL_COUNT"
echo ""

# =============================================================================
# Summary
# =============================================================================
print_status "$BLUE" "╔══════════════════════════════════════════════════════════════╗"
print_status "$BLUE" "║                    Summary                                   ║"
print_status "$BLUE" "╚══════════════════════════════════════════════════════════════╝"
echo ""
print_status "$GREEN" "  Success: $SUCCESS_COUNT mappers"
[ "$SKIP_COUNT" -gt 0 ] && print_status "$YELLOW" "  Skipped: $SKIP_COUNT mappers"
[ "$ERROR_COUNT" -gt 0 ] && print_status "$RED" "  Errors: $ERROR_COUNT mappers"
echo ""
print_status "$GREEN" "  Nation: $NATION_NAME ($NATION_ISO)"
print_status "$GREEN" "  Client: $CLIENT_ID"
print_status "$GREEN" "  Realm: $REALM"
echo ""

if [ "$ERROR_COUNT" -eq 0 ]; then
  print_status "$GREEN" "✓ All mappers applied successfully!"
  exit 0
else
  print_status "$RED" "⚠ Some mappers failed to apply"
  exit 1
fi
