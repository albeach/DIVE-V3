#!/bin/bash
echo "🔍 TESTING ACTUAL LOGIN FLOW"
echo "============================"
echo ""

echo "Step 1: What issuer does NextAuth expect?"
docker exec dive-v3-frontend sh -c 'echo "Expected: $KEYCLOAK_URL/realms/$KEYCLOAK_REALM"'
echo ""

echo "Step 2: What issuer does Keycloak return?"
echo "From localhost perspective:"
curl -s http://localhost:8081/realms/dive-v3-broker/.well-known/openid-configuration | jq -r '.issuer'
echo ""
echo "From container perspective:"
docker exec dive-v3-frontend curl -s http://localhost:8081/realms/dive-v3-broker/.well-known/openid-configuration 2>&1 | jq -r '.issuer' 2>/dev/null || echo "Can't reach from container"
echo ""

echo "Step 3: Checking frontend .env.local file:"
cat frontend/.env.local | grep KEYCLOAK | grep -v "^#"
echo ""

echo "Step 4: Recent auth errors:"
docker logs dive-v3-frontend 2>&1 | grep "\[auth\]\[error\]" | tail -3
echo ""

echo "Step 5: Testing if we can even start signin:"
curl -s -I "http://localhost:3000/api/auth/signin/keycloak" | head -5
