#!/usr/bin/env bash
# Create cross-border federation client in GBR Keycloak
#
# This client is used by OTHER instances' Keycloak brokers when federating TO GBR.
# Example: USA Hub's gbr-idp uses this client to connect to GBR Keycloak.

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="dive-v3-broker-gbr"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-Eao30nMhapCE4BmA0W9a}"

echo "🔧 Creating cross-border federation client in GBR Keycloak..."

# Get federation secret (should match what hub uses)
FEDERATION_SECRET="${FEDERATION_SECRET:-dive-federation-gbr-usa-dev-1765595752290}"

# Create the client
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh create clients \
  -r "$REALM" \
  --server "$KEYCLOAK_URL" \
  --realm master \
  --user "$ADMIN_USER" \
  --password "$ADMIN_PASS" \
  -s clientId=dive-v3-cross-border-client \
  -s enabled=true \
  -s clientAuthenticatorType=client-secret \
  -s secret="$FEDERATION_SECRET" \
  -s protocol=openid-connect \
  -s publicClient=false \
  -s standardFlowEnabled=true \
  -s directAccessGrantsEnabled=false \
  -s serviceAccountsEnabled=false \
  -s 'redirectUris=["https://localhost:8081/realms/dive-v3-broker/broker/gbr-idp/endpoint","https://*/realms/*/broker/*/endpoint"]' \
  -s 'webOrigins=["https://localhost:8081","https://localhost:8446"]' \
  -s 'attributes.pkce.code.challenge.method=S256' \
  2>&1 || echo "⚠️ Client may already exist"

echo "✅ Cross-border client created in GBR Keycloak"
echo ""
echo "Client ID: dive-v3-cross-border-client"
echo "Client Secret: $FEDERATION_SECRET"
echo "Redirect URIs: https://localhost:8081/realms/dive-v3-broker/broker/gbr-idp/endpoint"


