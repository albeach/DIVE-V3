#!/bin/bash
echo "Testing ALB → FRA SSO..."

# Hardcoded ports for testing
alb_port=4001
alb_kc_port=8444
fra_port=4007

echo "ALB Backend: $alb_port, Keycloak: $alb_kc_port"
echo "FRA Backend: $fra_port"

# Try to authenticate ALB user
echo "Authenticating ALB user..."
token=$(curl -sk --max-time 10 -X POST \
  "https://localhost:$alb_kc_port/realms/dive-v3-broker-alb/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=dive-v3-broker-alb&username=testuser-alb-1&password=TestUser2025!Pilot&grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

echo "Token length: ${#token}"

if [ -n "$token" ] && [ "$token" != "null" ] && [ ${#token} -gt 10 ]; then
  echo "✓ ALB authentication successful"
  
  # Try to access FRA resource
  echo "Testing cross-spoke access to FRA..."
  response=$(curl -sk --max-time 10 \
    -H "Authorization: Bearer $token" \
    "https://localhost:$fra_port/api/auth/session" 2>/dev/null)
  
  echo "Response: $response"
  
  user_name=$(echo "$response" | jq -r '.user.name // empty' 2>/dev/null)
  
  if [ -n "$user_name" ] && [ "$user_name" != "null" ]; then
    echo "✓ Cross-spoke access successful: $user_name"
  else
    echo "✗ Cross-spoke access failed"
    echo "Checking if FRA is responding..."
    fra_health=$(curl -sk --max-time 5 "https://localhost:$fra_port/health" 2>/dev/null | jq -r '.status // empty' 2>/dev/null || echo "no response")
    echo "FRA health: $fra_health"
  fi
else
  echo "✗ ALB authentication failed"
  echo "Checking ALB Keycloak..."
  alb_discovery=$(curl -sk --max-time 5 "https://localhost:$alb_kc_port/realms/dive-v3-broker-alb/.well-known/openid-configuration" 2>/dev/null | jq -r '.issuer // empty' 2>/dev/null || echo "no response")
  echo "ALB discovery: $alb_discovery"
fi
