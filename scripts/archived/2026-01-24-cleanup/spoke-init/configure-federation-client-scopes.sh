#!/usr/bin/env bash
# =============================================================================
# Configure Federation Client Scopes
# =============================================================================
# Adds DIVE attribute client scopes to federation clients (dive-v3-broker-usa)
# so that tokens include uniqueID, countryOfAffiliation, clearance, acpCOI claims
#
# CRITICAL: Without these scopes, IdP mappers in Hub have no claims to import!
#
# Usage: ./configure-federation-client-scopes.sh <INSTANCE_CODE>
# =============================================================================

set -eo pipefail

INSTANCE_CODE="${1:-}"

if [ -z "$INSTANCE_CODE" ]; then
    echo "Usage: $0 <INSTANCE_CODE>"
    echo "Example: $0 FRA"
    exit 1
fi

CODE_LOWER=$(echo "$INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')
CODE_UPPER=$(echo "$INSTANCE_CODE" | tr '[:lower:]' '[:upper:]')

KEYCLOAK_CONTAINER="dive-spoke-${CODE_LOWER}-keycloak"
REALM_NAME="dive-v3-broker-${CODE_LOWER}"
FEDERATION_CLIENT="dive-v3-broker-usa"  # Client that Hub uses

echo "Configuring federation client scopes for $CODE_UPPER"
echo "════════════════════════════════════════════════════════"

# Get admin password
ADMIN_PASSWORD=$(docker exec "$KEYCLOAK_CONTAINER" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null)

if [ -z "$ADMIN_PASSWORD" ]; then
    echo "❌ Cannot get admin password for $KEYCLOAK_CONTAINER"
    exit 1
fi

# Authenticate
docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password "$ADMIN_PASSWORD" >/dev/null 2>&1

# Get client UUID
CLIENT_UUID=$(docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get clients \
  -r "$REALM_NAME" -q clientId="$FEDERATION_CLIENT" 2>/dev/null | jq -r '.[0].id')

if [ -z "$CLIENT_UUID" ] || [ "$CLIENT_UUID" = "null" ]; then
    echo "❌ Federation client not found: $FEDERATION_CLIENT"
    exit 1
fi

echo "Client: $FEDERATION_CLIENT ($CLIENT_UUID)"
echo ""

# DIVE attribute scopes that MUST be in tokens for federation
REQUIRED_SCOPES=("uniqueID" "countryOfAffiliation" "clearance" "acpCOI")

for scope in "${REQUIRED_SCOPES[@]}"; do
    # Get scope ID
    SCOPE_ID=$(docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get client-scopes \
      -r "$REALM_NAME" 2>/dev/null | jq -r ".[] | select(.name == \"$scope\") | .id")

    if [ -z "$SCOPE_ID" ] || [ "$SCOPE_ID" = "null" ]; then
        echo "⚠ Client scope '$scope' not found in realm (skipping)"
        continue
    fi

    # Add as default client scope
    if docker exec "$KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh update \
        clients/$CLIENT_UUID/default-client-scopes/$SCOPE_ID -r "$REALM_NAME" 2>/dev/null; then
        echo "✓ Added '$scope' as default scope"
    else
        echo "⚠ Failed to add '$scope' (may already be added)"
    fi
done

echo ""
echo "✅ Federation client scopes configured for $CODE_UPPER"
echo ""
echo "Tokens from $CODE_UPPER will now include:"
echo "  - uniqueID (username, not UUID)"
echo "  - countryOfAffiliation ($CODE_UPPER)"
echo "  - clearance (user's clearance level)"
echo "  - acpCOI (Communities of Interest)"
echo ""
echo "Hub's IdP mappers can now import these attributes during federation."
