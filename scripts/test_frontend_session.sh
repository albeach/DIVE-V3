#!/bin/bash
echo "Testing frontend session endpoints..."

# Get ALB token
alb_client_secret=$(curl -sk -X POST "https://localhost:8444/realms/master/protocol/openid-connect/token" -d "grant_type=password&username=admin&password=MePnSfvk1wKj9Ij6JPunvw&client_id=admin-cli" 2>/dev/null | jq -r '.access_token')

alb_client_uuid=$(curl -sk -H "Authorization: Bearer $alb_client_secret" "https://localhost:8444/admin/realms/dive-v3-broker-alb/clients?clientId=dive-v3-broker-alb" 2>/dev/null | jq -r '.[0].id')

alb_secret=$(curl -sk -H "Authorization: Bearer $alb_client_secret" "https://localhost:8444/admin/realms/dive-v3-broker-alb/clients/$alb_client_uuid/client-secret" 2>/dev/null | jq -r '.value')

alb_token=$(curl -sk --max-time 10 -X POST "https://localhost:8444/realms/dive-v3-broker-alb/protocol/openid-connect/token" -H "Content-Type: application/x-www-form-urlencoded" -d "client_id=dive-v3-broker-alb&client_secret=$alb_secret&username=testuser-alb-1&password=TestUser2025!Pilot&grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

# Test ALB frontend session
echo "Testing ALB frontend session..."
alb_session=$(curl -sk --max-time 10 -H "Authorization: Bearer $alb_token" "https://localhost:3001/api/auth/session" 2>/dev/null)
echo "ALB session response: $alb_session"

# Test FRA frontend session with ALB token (cross-spoke)
echo "Testing FRA frontend session with ALB token..."
fra_session=$(curl -sk --max-time 10 -H "Authorization: Bearer $alb_token" "https://localhost:3010/api/auth/session" 2>/dev/null)
echo "FRA session response: $fra_session"

if echo "$fra_session" | grep -q '"user"'; then
  echo "✓ Cross-spoke session successful!"
else
  echo "✗ Cross-spoke session failed"
fi
