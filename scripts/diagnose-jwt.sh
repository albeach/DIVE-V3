#!/bin/bash

echo "=== DIVE V3 JWT Token Diagnostic ==="
echo ""

echo "1. Check Keycloak is running:"
curl -sf http://localhost:8081/health/ready > /dev/null && echo "✅ Keycloak ready" || echo "❌ Keycloak not ready"

echo ""
echo "2. Check JWKS endpoint (signature keys only):"
curl -s http://localhost:8081/realms/dive-v3-pilot/protocol/openid-connect/certs | jq -r '.keys[] | select(.use=="sig") | {kid, alg}'

echo ""
echo "3. Check PostgreSQL is running:"
docker exec dive-v3-postgres psql -U postgres -c "SELECT version();" 2>&1 | grep -q PostgreSQL && echo "✅ PostgreSQL ready" || echo "❌ PostgreSQL not ready"

echo ""
echo "4. Check database tables exist:"
docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -c "\dt" 2>&1 | grep -qE "(user|account|session)" && echo "✅ Tables exist" || echo "❌ Tables missing"

echo ""
echo "5. Check session records:"
echo "Sessions in database:"
docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -c "SELECT COUNT(*) as session_count FROM session;" 2>&1 | grep -A 1 session_count

echo ""
echo "6. Check account records:"
echo "Accounts in database:"
docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -c "SELECT provider, LENGTH(access_token) as token_len, LENGTH(id_token) as id_len FROM account;" 2>&1

echo ""
echo "7. Test direct Keycloak token request:"
CLIENT_SECRET=$(cd terraform && terraform output -raw client_secret 2>/dev/null)
if [ -n "$CLIENT_SECRET" ]; then
  echo "Getting token from Keycloak..."
  TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:8081/realms/dive-v3-pilot/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password" \
    -d "client_id=dive-v3-client" \
    -d "client_secret=$CLIENT_SECRET" \
    -d "username=testuser-us" \
    -d "password=Password123!")
  
  echo "$TOKEN_RESPONSE" | jq '{
    has_access: (.access_token != null),
    has_id: (.id_token != null),
    access_len: (.access_token | length),
    id_len: (.id_token | length),
    expires_in
  }'
  
  # Decode and verify custom claims
  ID_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.id_token')
  if [ -n "$ID_TOKEN" ] && [ "$ID_TOKEN" != "null" ]; then
    echo ""
    echo "8. Custom claims in ID token:"
    echo "$ID_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{
      uniqueID,
      clearance,
      countryOfAffiliation,
      acpCOI
    }'
  fi
else
  echo "❌ Could not get client secret from Terraform"
fi

echo ""
echo "=== End Diagnostic ==="

