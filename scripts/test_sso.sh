#!/bin/bash
# Simple SSO test

echo "Testing ALB → FRA SSO..."

# Get ALB ports
source scripts/dive-modules/common.sh
eval "$(get_instance_ports ALB)"
alb_port=$SPOKE_BACKEND_PORT
alb_kc_port=$SPOKE_KEYCLOAK_HTTPS_PORT

eval "$(get_instance_ports FRA)"
fra_port=$SPOKE_BACKEND_PORT

echo "ALB Backend: $alb_port, Keycloak: $alb_kc_port"
echo "FRA Backend: $fra_port"

# Try to authenticate ALB user
echo "Authenticating ALB user..."
token=$(curl -sk --max-time 10 -X POST \
  "https://localhost:$alb_kc_port/realms/dive-v3-broker-alb/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=dive-v3-broker-alb&username=testuser-alb-1&password=TestUser2025!Pilot&grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

if [ -n "$token" ] && [ "$token" != "null" ]; then
  echo "✓ ALB authentication successful"
  
  # Try to access FRA resource
  echo "Testing cross-spoke access to FRA..."
  response=$(curl -sk --max-time 10 \
    -H "Authorization: Bearer $token" \
    "https://localhost:$fra_port/api/auth/session" 2>/dev/null | jq -r '.user.name // empty')
  
  if [ -n "$response" ] && [ "$response" != "null" ]; then
    echo "✓ Cross-spoke access successful: $response"
  else
    echo "✗ Cross-spoke access failed"
  fi
else
  echo "✗ ALB authentication failed"
fi
