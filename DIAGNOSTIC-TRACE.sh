#!/bin/bash
echo "🔍 FULL DIAGNOSTIC TRACE"
echo "======================="
echo ""

echo "1️⃣ Docker Container Status:"
echo "----------------------------"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep dive-v3

echo ""
echo "2️⃣ Backend API - Direct Test:"
echo "------------------------------"
echo "Health endpoint:"
curl -v http://localhost:4000/health 2>&1 | grep -E "HTTP|Connected|status"

echo ""
echo "List IdPs endpoint (public):"
curl -s http://localhost:4000/api/public/idps | jq -r '.idps[].displayName' 2>/dev/null || curl -s http://localhost:4000/api/public/idps

echo ""
echo "3️⃣ Keycloak Broker Status:"
echo "--------------------------"
curl -s http://localhost:8081/realms/dive-v3-broker/.well-known/openid-configuration | jq -r '.issuer' 2>/dev/null || echo "Keycloak not ready"

echo ""
echo "4️⃣ Frontend Compilation:"
echo "------------------------"
docker logs dive-v3-frontend 2>&1 | tail -20

echo ""
echo "5️⃣ Backend Logs (last 20 lines):"
echo "---------------------------------"
docker logs dive-v3-backend 2>&1 | tail -20

echo ""
echo "6️⃣ Check IdP themes in MongoDB:"
echo "--------------------------------"
docker exec dive-v3-mongo mongosh -u admin -p password --authenticationDatabase admin dive-v3 --quiet --eval "db.idp_themes.find({}, {idpAlias: 1, enabled: 1})"

echo ""
echo "DIAGNOSIS COMPLETE"
