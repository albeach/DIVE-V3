#!/bin/bash
# Check authentication flow execution order

set -e

echo "=== Checking Keycloak Authentication Flow Execution Order ==="

# Get admin token
TOKEN=$(curl -s 'http://localhost:8081/realms/master/protocol/openid-connect/token' \
  -d 'client_id=admin-cli' \
  -d 'username=admin' \
  -d 'password=admin' \
  -d 'grant_type=password' | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: Failed to get admin token. Is Keycloak running?"
  exit 1
fi

echo -e "\n--- USA Realm: Conditional OTP Subflow ---"
curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:8081/admin/realms/dive-v3-usa/authentication/flows/Classified%20Access%20Browser%20Flow/executions' \
  | jq '.[] | select(.level==2) | {index, displayName, requirement, id}'

echo -e "\n--- France Realm: Conditional OTP Subflow ---"
curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:8081/admin/realms/dive-v3-fra/authentication/flows/Classified%20Access%20Browser%20Flow%20-%20France/executions' \
  | jq '.[] | select(.level==2) | {index, displayName, requirement, id}'

echo -e "\n--- Canada Realm: Conditional OTP Subflow ---"
curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:8081/admin/realms/dive-v3-can/authentication/flows/Classified%20Access%20Browser%20Flow%20-%20Canada/executions' \
  | jq '.[] | select(.level==2) | {index, displayName, requirement, id}'

echo -e "\n--- Broker Realm: Conditional OTP Subflow ---"
curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:8081/admin/realms/dive-v3-broker/authentication/flows/Classified%20Access%20Browser%20Flow%20-%20Broker/executions' \
  | jq '.[] | select(.level==2) | {index, displayName, requirement, id}'

echo -e "\n=== Check Complete ==="

