#!/usr/bin/env bash
# Create DIVE custom client scopes in GBR Keycloak

set -e

REALM="dive-v3-broker-gbr"
KEYCLOAK_ADMIN="admin"
KEYCLOAK_ADMIN_PASSWORD="Eao30nMhapCE4BmA0W9a"

echo "🔧 Creating DIVE custom client scopes in GBR Keycloak..."

# Configure credentials
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "$KEYCLOAK_ADMIN" \
  --password "$KEYCLOAK_ADMIN_PASSWORD"

# Create clearance scope
echo "Creating 'clearance' scope..."
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh create client-scopes \
  -r "$REALM" \
  -s name=clearance \
  -s protocol=openid-connect \
  -s 'attributes."display.on.consent.screen"=false' \
  -s 'attributes."include.in.token.scope"=true' 2>&1 || echo "clearance scope may already exist"

# Create countryOfAffiliation scope
echo "Creating 'countryOfAffiliation' scope..."
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh create client-scopes \
  -r "$REALM" \
  -s name=countryOfAffiliation \
  -s protocol=openid-connect \
  -s 'attributes."display.on.consent.screen"=false' \
  -s 'attributes."include.in.token.scope"=true' 2>&1 || echo "countryOfAffiliation scope may already exist"

# Create acpCOI scope
echo "Creating 'acpCOI' scope..."
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh create client-scopes \
  -r "$REALM" \
  -s name=acpCOI \
  -s protocol=openid-connect \
  -s 'attributes."display.on.consent.screen"=false' \
  -s 'attributes."include.in.token.scope"=true' 2>&1 || echo "acpCOI scope may already exist"

# Create uniqueID scope
echo "Creating 'uniqueID' scope..."
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh create client-scopes \
  -r "$REALM" \
  -s name=uniqueID \
  -s protocol=openid-connect \
  -s 'attributes."display.on.consent.screen"=false' \
  -s 'attributes."include.in.token.scope"=true' 2>&1 || echo "uniqueID scope may already exist"

echo ""
echo "✅ DIVE custom scopes created in GBR Keycloak"
echo ""
echo "Next: Assign these scopes to dive-v3-cross-border-client as optional scopes"
