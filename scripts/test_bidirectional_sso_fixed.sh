#!/bin/bash
echo "🔄 Testing Bidirectional SSO: ALB ↔ FRA"
echo "========================================"

# ALB config (from docker-compose)
alb_port=8444
alb_backend_port=4001
alb_admin_pass="MePnSfvk1wKj9Ij6JPunvw"

# FRA config (from docker-compose) 
fra_port=8453
fra_backend_port=4010
fra_admin_pass="DISgxJbZVSOIIl8yYUzA"

echo "ALB Keycloak: $alb_port, Backend: $alb_backend_port"
echo "FRA Keycloak: $fra_port, Backend: $fra_backend_port"
echo ""

# Get client secrets
get_client_secret() {
  local instance=$1
  local port=$2
  local admin_pass=$3
  
  admin_token=$(curl -sk -X POST "https://localhost:$port/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password&username=admin&password=$admin_pass&client_id=admin-cli" 2>/dev/null | jq -r '.access_token')
  
  if [ -z "$admin_token" ] || [ "$admin_token" = "null" ]; then
    echo "Cannot get admin token for $instance" >&2
    return 1
  fi
  
  client_uuid=$(curl -sk -H "Authorization: Bearer $admin_token" \
    "https://localhost:$port/admin/realms/dive-v3-broker-$instance/clients?clientId=dive-v3-broker-$instance" 2>/dev/null | jq -r '.[0].id')
  
  if [ -z "$client_uuid" ] || [ "$client_uuid" = "null" ]; then
    echo "Cannot get client UUID for $instance" >&2
    return 1
  fi
  
  client_secret=$(curl -sk -H "Authorization: Bearer $admin_token" \
    "https://localhost:$port/admin/realms/dive-v3-broker-$instance/clients/$client_uuid/client-secret" 2>/dev/null | jq -r '.value')
  
  echo "$client_secret"
}

alb_client_secret=$(get_client_secret "alb" "$alb_port" "$alb_admin_pass")
fra_client_secret=$(get_client_secret "fra" "$fra_port" "$fra_admin_pass")

tests_passed=0
tests_total=0

# Test 1: ALB user authentication
((tests_total++))
echo -n "1. ALB user authentication: "
alb_token=$(curl -sk --max-time 10 -X POST \
  "https://localhost:$alb_port/realms/dive-v3-broker-alb/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=dive-v3-broker-alb&client_secret=$alb_client_secret&username=testuser-alb-1&password=TestUser2025!Pilot&grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

if [ -n "$alb_token" ] && [ "$alb_token" != "null" ] && [ ${#alb_token} -gt 10 ]; then
  echo -e "\033[0;32m✓ PASS\033[0m (Token obtained)"
  ((tests_passed++))
else
  echo -e "\033[0;31m✗ FAIL\033[0m (Cannot authenticate ALB user)"
  exit 1
fi

# Test 2: ALB user can access FRA protected resource
((tests_total++))
echo -n "2. ALB→FRA cross-spoke access: "
fra_response=$(curl -sk --max-time 10 \
  -H "Authorization: Bearer $alb_token" \
  "https://localhost:$fra_backend_port/api/auth/session" 2>/dev/null)

user_name=$(echo "$fra_response" | jq -r '.user.name // empty' 2>/dev/null)

if [ -n "$user_name" ] && [ "$user_name" != "null" ]; then
  echo -e "\033[0;32m✓ PASS\033[0m (User: $user_name)"
  ((tests_passed++))
else
  echo -e "\033[0;31m✗ FAIL\033[0m (ALB user cannot access FRA resource)"
  echo "  Response: ${fra_response:0:100}"
fi

# Test 3: FRA user authentication
((tests_total++))
echo -n "3. FRA user authentication: "
fra_token=$(curl -sk --max-time 10 -X POST \
  "https://localhost:$fra_port/realms/dive-v3-broker-fra/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=dive-v3-broker-fra&client_secret=$fra_client_secret&username=testuser-fra-1&password=TestUser2025!Pilot&grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

if [ -n "$fra_token" ] && [ "$fra_token" != "null" ] && [ ${#fra_token} -gt 10 ]; then
  echo -e "\033[0;32m✓ PASS\033[0m (Token obtained)"
  ((tests_passed++))
else
  echo -e "\033[0;31m✗ FAIL\033[0m (Cannot authenticate FRA user)"
  echo "  Checking FRA client secret..."
fi

# Test 4: FRA user can access ALB protected resource
((tests_total++))
echo -n "4. FRA→ALB cross-spoke access: "
alb_response=$(curl -sk --max-time 10 \
  -H "Authorization: Bearer $fra_token" \
  "https://localhost:$alb_backend_port/api/auth/session" 2>/dev/null)

user_name=$(echo "$alb_response" | jq -r '.user.name // empty' 2>/dev/null)

if [ -n "$user_name" ] && [ "$user_name" != "null" ]; then
  echo -e "\033[0;32m✓ PASS\033[0m (User: $user_name)"
  ((tests_passed++))
else
  echo -e "\033[0;31m✗ FAIL\033[0m (FRA user cannot access ALB resource)"
  echo "  Response: ${alb_response:0:100}"
fi

echo ""
echo "========================================"
echo "Bidirectional SSO Test Results: $tests_passed/$tests_total passed"

if [ $tests_passed -eq $tests_total ]; then
  echo -e "\033[0;32m🎉 BIDIRECTIONAL SSO IS WORKING! 🎉\033[0m"
  echo "Phase 2 authentication requirements met."
else
  echo -e "\033[0;31m❌ BIDIRECTIONAL SSO HAS ISSUES\033[0m"
  echo "Some tests failed - check federation configuration."
fi
