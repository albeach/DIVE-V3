#!/bin/bash
# Check what's actually in the Canada OIDC token

echo "Fetching token from canada-mock-idp for dive-v3-client..."
echo ""

# Get client secret
CLIENT_SECRET=$(cd terraform && terraform output -raw client_secret 2>/dev/null)
CANADA_CLIENT=$(docker-compose exec -T postgres psql -U postgres -d keycloak_db -t -c "SELECT client_id FROM client WHERE client_id='dive-v3-canada-client';" 2>/dev/null | tr -d ' \n')

echo "Testing direct token fetch from canada-mock-idp..."
curl -s -X POST "http://localhost:8081/realms/canada-mock-idp/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=dive-v3-canada-client" \
  -d "username=testuser-can" \
  -d "password=Password123!" | jq -r '.access_token' | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '.' || echo "Failed to decode token"
