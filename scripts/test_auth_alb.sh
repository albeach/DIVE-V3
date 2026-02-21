#!/bin/bash
echo "Testing ALB user authentication..."

# Try with client secret
token=$(curl -sk --max-time 10 -X POST \
  "https://localhost:8444/realms/dive-v3-broker-alb/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=dive-v3-broker-alb&client_secret=C7M2fTbgqn4bjv0izg81jfXZHLW93Yp&username=testuser-alb-1&password=TestUser2025!Pilot&grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

if [ -n "$token" ] && [ "$token" != "null" ] && [ ${#token} -gt 10 ]; then
  echo "✓ ALB authentication successful with client secret"
  echo "Token length: ${#token}"
else
  echo "✗ ALB authentication failed with client secret"
  
  # Try without client secret (public client)
  token=$(curl -sk --max-time 10 -X POST \
    "https://localhost:8444/realms/dive-v3-broker-alb/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=dive-v3-broker-alb&username=testuser-alb-1&password=TestUser2025!Pilot&grant_type=password" 2>/dev/null | jq -r '.access_token // empty')
  
  if [ -n "$token" ] && [ "$token" != "null" ] && [ ${#token} -gt 10 ]; then
    echo "✓ ALB authentication successful as public client"
    echo "Token length: ${#token}"
  else
    echo "✗ ALB authentication failed as public client"
    echo "Checking if user exists..."
    # Check if user exists in Keycloak
    admin_token=$(curl -sk --max-time 5 -X POST \
      "https://localhost:8444/realms/master/protocol/openid-connect/token" \
      -d "grant_type=password&username=admin&password=MePnSfvk1wKj9Ij6JPunvw&client_id=admin-cli" 2>/dev/null | jq -r '.access_token // empty')
    
    if [ -n "$admin_token" ]; then
      user_check=$(curl -sk --max-time 5 \
        -H "Authorization: Bearer $admin_token" \
        "https://localhost:8444/admin/realms/dive-v3-broker-alb/users?username=testuser-alb-1" 2>/dev/null | jq . 2>/dev/null)
      echo "User check result: $user_check"
    else
      echo "Cannot get admin token"
    fi
  fi
fi
