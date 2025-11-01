#!/bin/bash
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                    E2E TESTING - admin-dive                                  ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Test 1: Services Health
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: Services Health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Keycloak HTTPS: $(curl -s -k https://localhost:8443/realms/dive-v3-broker | jq -r '.realm' 2>/dev/null || echo 'FAILED')"
echo "Backend HTTPS: $(curl -s -k https://localhost:4000/health | jq -r '.status' 2>/dev/null || echo 'FAILED')"
echo "KAS: $(curl -s http://localhost:8080/health | jq -r '.status' 2>/dev/null || echo 'FAILED')"
echo "MongoDB: $(docker-compose exec -T mongo mongosh --quiet --eval 'db.adminCommand({ping:1})' 2>/dev/null | grep -q 'ok.*1' && echo 'healthy' || echo 'FAILED')"
echo "OPA: $(curl -s http://localhost:8181/health | jq -r '.status' 2>/dev/null || echo 'FAILED')"
echo ""

# Test 2: Keycloak Configuration
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: Keycloak Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ADMIN_TOKEN=$(curl -s -k -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=admin" -d "grant_type=password" | jq -r .access_token)

# Check admin-dive user
USER_DATA=$(curl -s -k -H "Authorization: Bearer $ADMIN_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/users?username=admin-dive" | jq -r '.[0]')
echo "Username: $(echo $USER_DATA | jq -r '.username')"
echo "Required Actions: $(echo $USER_DATA | jq -r '.requiredActions | length') (should be 0)"
echo "OTP Configured: $(echo $USER_DATA | jq -r '.totp')"

# Check client scopes
CLIENT_ID=$(curl -s -k -H "Authorization: Bearer $ADMIN_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/clients" | jq -r '.[] | select(.clientId == "dive-v3-client-broker") | .id')
SCOPES=$(curl -s -k -H "Authorization: Bearer $ADMIN_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/clients/$CLIENT_ID/default-client-scopes" | jq -r '.[].name')
echo "Client Scopes: $(echo $SCOPES | grep -c 'acr') acr, $(echo $SCOPES | grep -c 'basic') basic"

# Check event listeners
EVENT_LISTENERS=$(curl -s -k -H "Authorization: Bearer $ADMIN_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker" | jq -r '.eventsListeners | length')
echo "Event Listeners: $EVENT_LISTENERS (should have dive-amr-enrichment)"
echo ""

# Test 3: Backend Logs
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: Recent Backend Errors"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker-compose logs backend --tail=100 2>&1 | grep -i "error\|failed" | tail -n 5
echo ""

# Test 4: KAS Logs
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 4: Recent KAS Errors"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker-compose logs kas --tail=50 2>&1 | grep -i "error\|failed\|invalid" | tail -n 5
echo ""

# Test 5: Keycloak AMR Event Listener
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 5: AMR Event Listener Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker-compose logs keycloak 2>&1 | grep -i "dive amr" | tail -n 3
echo ""

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                         E2E TEST COMPLETE                                    ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
