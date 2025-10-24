#!/bin/bash
set -e

echo "════════════════════════════════════════════════════════════════"
echo "  DEBUG: Admin IdP Session Error"
echo "════════════════════════════════════════════════════════════════"

echo ""
echo "Step 1: Checking if you're logged in..."
echo "Please open http://localhost:3000/admin/idp in your browser"
echo "Then press ENTER to check the frontend logs"
read -p ""

echo ""
echo "Step 2: Checking frontend logs for session errors..."
docker logs dive-v3-frontend --tail 50 | grep -E "IdP Management|Session state|IdPs data|SessionErrorBoundary" || echo "No relevant logs found"

echo ""
echo "Step 3: Testing backend IdP API with your session token..."
echo "Please paste your accessToken from the browser console:"
echo "(Run: console.log(await fetch('/api/auth/session').then(r => r.json())))"
read -p "Token: " TOKEN

if [ -n "$TOKEN" ]; then
    echo ""
    echo "Testing /api/admin/idps endpoint..."
    curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/admin/idps | jq .
else
    echo "No token provided, skipping backend test"
fi

echo ""
echo "Step 4: Checking session data in PostgreSQL..."
docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -c "
SELECT 
    u.email,
    s.\"sessionToken\" as session_token,
    s.expires as session_expires,
    a.access_token IS NOT NULL as has_access_token,
    a.id_token IS NOT NULL as has_id_token,
    a.expires_at as token_expires_at
FROM \"user\" u
LEFT JOIN \"session\" s ON u.id = s.\"userId\"
LEFT JOIN \"account\" a ON u.id = a.\"userId\"
ORDER BY s.expires DESC
LIMIT 5;
"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Debug Complete"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Common Issues:"
echo "1. No accessToken in session → Custom login didn't store tokens properly"
echo "2. idps = undefined → useIdPs hook failed due to missing/invalid token"
echo "3. idps is not iterable → Backend returned non-array response"
echo ""
echo "Next Steps:"
echo "- If no session found: Re-login via /login/dive-v3-broker"
echo "- If no tokens: Check custom-session endpoint created account properly"
echo "- If API fails: Check backend logs: docker logs dive-v3-backend --tail 50"

