#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Add GBR IdP to Realm Template (Make it Persistent)
# =============================================================================
# This updates the realm JSON template so gbr-idp configuration persists
# across container restarts.
# =============================================================================

set -e

REALM_TEMPLATE="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/keycloak/realms/dive-v3-broker.json"
BACKUP_FILE="${REALM_TEMPLATE}.backup-$(date +%s)"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║      DIVE V3 - Add GBR IdP to Realm Template                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Backup original template
echo "[1/3] Creating backup: ${BACKUP_FILE##*/}"
cp "$REALM_TEMPLATE" "$BACKUP_FILE"

# Check if gbr-idp already exists in template
HAS_GBR=$(jq '.identityProviders[]? | select(.alias=="gbr-idp") | .alias' "$REALM_TEMPLATE" 2>/dev/null || echo "")

if [ -n "$HAS_GBR" ]; then
  echo "[2/3] gbr-idp already exists in template - updating..."
  ACTION="update"
else
  echo "[2/3] gbr-idp not in template - adding..."
  ACTION="add"
fi

# Create the gbr-idp configuration
cat > /tmp/gbr-idp-full.json << 'EOF'
{
  "alias": "gbr-idp",
  "displayName": "United Kingdom",
  "providerId": "oidc",
  "enabled": true,
  "updateProfileFirstLoginMode": "off",
  "trustEmail": true,
  "storeToken": true,
  "addReadTokenRoleOnCreate": false,
  "authenticateByDefault": false,
  "linkOnly": false,
  "firstBrokerLoginFlowAlias": "first broker login",
  "config": {
    "clientId": "dive-v3-cross-border-client",
    "clientSecret": "dive-v3-federation-secret-2025",
    "defaultScope": "openid profile email",
    "authorizationUrl": "https://localhost:8446/realms/dive-v3-broker-gbr/protocol/openid-connect/auth",
    "tokenUrl": "https://gbr-keycloak-gbr-1:8443/realms/dive-v3-broker-gbr/protocol/openid-connect/token",
    "logoutUrl": "https://localhost:8446/realms/dive-v3-broker-gbr/protocol/openid-connect/logout",
    "userInfoUrl": "https://gbr-keycloak-gbr-1:8443/realms/dive-v3-broker-gbr/protocol/openid-connect/userinfo",
    "issuer": "https://localhost:8446/realms/dive-v3-broker-gbr",
    "jwksUrl": "https://gbr-keycloak-gbr-1:8443/realms/dive-v3-broker-gbr/protocol/openid-connect/certs",
    "validateSignature": "false",
    "useJwksUrl": "true",
    "syncMode": "FORCE",
    "disable-trust-manager": "true",
    "pkceEnabled": "true"
  }
}
EOF

# Create the mappers array
cat > /tmp/gbr-idp-mappers.json << 'EOF'
[
  {
    "name": "username-mapper",
    "identityProviderAlias": "gbr-idp",
    "identityProviderMapper": "oidc-username-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "template": "${CLAIM.preferred_username}"
    }
  },
  {
    "name": "email-mapper",
    "identityProviderAlias": "gbr-idp",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "claim": "email",
      "user.attribute": "email"
    }
  },
  {
    "name": "firstName-mapper",
    "identityProviderAlias": "gbr-idp",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "claim": "given_name",
      "user.attribute": "firstName"
    }
  },
  {
    "name": "lastName-mapper",
    "identityProviderAlias": "gbr-idp",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "claim": "family_name",
      "user.attribute": "lastName"
    }
  },
  {
    "name": "clearance-mapper",
    "identityProviderAlias": "gbr-idp",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "claim": "clearance",
      "user.attribute": "clearance"
    }
  },
  {
    "name": "countryOfAffiliation-mapper",
    "identityProviderAlias": "gbr-idp",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "claim": "countryOfAffiliation",
      "user.attribute": "countryOfAffiliation"
    }
  },
  {
    "name": "uniqueID-mapper",
    "identityProviderAlias": "gbr-idp",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "claim": "uniqueID",
      "user.attribute": "uniqueID"
    }
  },
  {
    "name": "acpCOI-mapper",
    "identityProviderAlias": "gbr-idp",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "claim": "acpCOI",
      "user.attribute": "acpCOI"
    }
  }
]
EOF

# Update the realm template
echo "[3/3] Updating realm template..."

if [ "$ACTION" == "add" ]; then
  # Add gbr-idp to identityProviders array
  jq '.identityProviders += [input]' "$REALM_TEMPLATE" /tmp/gbr-idp-full.json > /tmp/realm-updated.json
  
  # Add mappers to identityProviderMappers array
  jq '.identityProviderMappers += input' /tmp/realm-updated.json /tmp/gbr-idp-mappers.json > /tmp/realm-final.json
else
  # Update existing gbr-idp
  jq '(.identityProviders[] | select(.alias=="gbr-idp")) |= input' "$REALM_TEMPLATE" /tmp/gbr-idp-full.json > /tmp/realm-updated.json
  
  # Remove old mappers and add new ones
  jq 'del(.identityProviderMappers[] | select(.identityProviderAlias=="gbr-idp")) | .identityProviderMappers += input' /tmp/realm-updated.json /tmp/gbr-idp-mappers.json > /tmp/realm-final.json
fi

# Replace original with updated
mv /tmp/realm-final.json "$REALM_TEMPLATE"

echo ""
echo "✅ SUCCESS"
echo "═══════════════════════════════════════════════════════════════"
echo "  Realm template updated: dive-v3-broker.json"
echo "  Backup saved: ${BACKUP_FILE##*/}"
echo ""
echo "  Configuration now includes:"
echo "    • gbr-idp identity provider"
echo "    • 8 attribute mappers (profile + DIVE)"
echo ""
echo "  This configuration will persist across container restarts!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Restart Keycloak: docker-compose restart keycloak"
echo "  2. Verify IdP appears: curl -sk https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp"

# Cleanup
rm -f /tmp/gbr-idp-full.json /tmp/gbr-idp-mappers.json /tmp/realm-updated.json
