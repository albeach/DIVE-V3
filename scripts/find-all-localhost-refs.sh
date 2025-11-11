#!/bin/bash
# Comprehensive Localhost Finder - Check ALL Keycloak Realms

TOKEN=$(curl -s -X POST "http://localhost:8081/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

REALMS=(
  "dive-v3-broker"
  "dive-v3-usa"
  "dive-v3-fra"
  "dive-v3-can"
  "dive-v3-gbr"
  "dive-v3-deu"
  "dive-v3-esp"
  "dive-v3-ita"
  "dive-v3-pol"
  "dive-v3-nld"
  "dive-v3-industry"
  "dive-v3-external-sp"
)

echo "============================================="
echo "Comprehensive Localhost Reference Search"
echo "============================================="
echo

for realm in "${REALMS[@]}"; do
  echo "========================================"
  echo "Realm: $realm"
  echo "========================================"
  
  # Check if realm exists
  REALM_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://localhost:8081/admin/realms/$realm" \
    -H "Authorization: Bearer $TOKEN")
  
  if [ "$REALM_CHECK" != "200" ]; then
    echo "  ⚠️  Realm does not exist, skipping..."
    echo
    continue
  fi
  
  # 1. Check clients for localhost redirect URIs
  echo "📋 Checking Clients..."
  CLIENTS=$(curl -s "http://localhost:8081/admin/realms/$realm/clients" \
    -H "Authorization: Bearer $TOKEN")
  
  echo "$CLIENTS" | jq -r '.[] | select(.redirectUris != null and (.redirectUris | tostring | contains("localhost"))) | "  Client: \(.clientId)\n    Redirect URIs: \(.redirectUris | join(", "))"'
  
  # 2. Check clients for localhost web origins
  echo "$CLIENTS" | jq -r '.[] | select(.webOrigins != null and (.webOrigins | tostring | contains("localhost"))) | "  Client: \(.clientId)\n    Web Origins: \(.webOrigins | join(", "))"'
  
  # 3. Check clients for localhost base URLs
  echo "$CLIENTS" | jq -r '.[] | select(.baseUrl != null and (.baseUrl | contains("localhost"))) | "  Client: \(.clientId)\n    Base URL: \(.baseUrl)"'
  
  # 4. Check clients for localhost admin URLs
  echo "$CLIENTS" | jq -r '.[] | select(.adminUrl != null and (.adminUrl | contains("localhost"))) | "  Client: \(.clientId)\n    Admin URL: \(.adminUrl)"'
  
  # 5. Check clients for localhost backchannel logout URLs
  echo "$CLIENTS" | jq -r '.[] | select(.attributes != null and (.attributes.backchannelLogoutUrl // "" | contains("localhost"))) | "  Client: \(.clientId)\n    Backchannel Logout: \(.attributes.backchannelLogoutUrl)"'
  
  # 6. Check IdP brokers
  echo
  echo "🔗 Checking Identity Providers..."
  IDPS=$(curl -s "http://localhost:8081/admin/realms/$realm/identity-provider/instances" \
    -H "Authorization: Bearer $TOKEN")
  
  echo "$IDPS" | jq -r '.[] | select(.config != null and (.config | tostring | contains("localhost"))) | "  IdP: \(.alias)\n    Auth URL: \(.config.authorizationUrl // "N/A")\n    Token URL: \(.config.tokenUrl // "N/A")"'
  
  # 7. Check realm settings
  echo
  echo "⚙️  Checking Realm Settings..."
  REALM_SETTINGS=$(curl -s "http://localhost:8081/admin/realms/$realm" \
    -H "Authorization: Bearer $TOKEN")
  
  echo "$REALM_SETTINGS" | jq -r 'select(.frontendUrl != null and (.frontendUrl | contains("localhost"))) | "  Frontend URL: \(.frontendUrl)"'
  
  echo
done

echo "============================================="
echo "Search Complete"
echo "============================================="





