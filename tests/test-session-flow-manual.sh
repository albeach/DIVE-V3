#!/usr/bin/env bash
# Test session token flow with real user session
# This simulates what happens when a user accesses /resources

set -euo pipefail

echo "==============================================="
echo "Session Token Flow Test"
echo "==============================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test endpoints
FRONTEND_URL="https://localhost:3000"
BACKEND_URL="https://localhost:4000"

echo "1. Testing frontend health..."
HEALTH=$(curl -sk "${FRONTEND_URL}/api/health" 2>&1)
if echo "$HEALTH" | grep -q "ok"; then
    echo -e "${GREEN}✓${NC} Frontend is healthy"
else
    echo -e "${RED}✗${NC} Frontend health check failed: $HEALTH"
    exit 1
fi

echo ""
echo "2. Testing backend health..."
BACKEND_HEALTH=$(curl -sk "${BACKEND_URL}/api/health" 2>&1)
if echo "$BACKEND_HEALTH" | grep -q "status"; then
    echo -e "${GREEN}✓${NC} Backend is healthy"
else
    echo -e "${RED}✗${NC} Backend health check failed"
fi

echo ""
echo "3. Testing /api/resources/search without auth (should return 401)..."
SEARCH_RESPONSE=$(curl -sk -w "\nHTTP_CODE:%{http_code}" -X POST "${FRONTEND_URL}/api/resources/search" \
    -H "Content-Type: application/json" \
    -d '{"limit":10}' 2>&1)

HTTP_CODE=$(echo "$SEARCH_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
RESPONSE_BODY=$(echo "$SEARCH_RESPONSE" | grep -v "HTTP_CODE")

echo "Response code: $HTTP_CODE"
echo "Response body: $RESPONSE_BODY"

if [[ "$HTTP_CODE" == "401" ]]; then
    echo -e "${GREEN}✓${NC} Correctly returns 401 without authentication"
    
    if echo "$RESPONSE_BODY" | grep -q "Invalid or expired JWT token"; then
        echo -e "${GREEN}✓${NC} Error message is correct: 'Invalid or expired JWT token'"
    else
        echo -e "${YELLOW}⚠${NC} Error message differs from expected"
    fi
else
    echo -e "${YELLOW}⚠${NC} Expected 401, got $HTTP_CODE"
fi

echo ""
echo "==============================================="
echo "To test with actual user session:"
echo "==============================================="
echo "1. Login to https://localhost:3000 as testuser-usa-4@mil"
echo "2. Open browser devtools > Network tab"
echo "3. Navigate to /resources"
echo "4. Look for /api/resources/search request"
echo "5. Check response status and error message"
echo ""
echo "Expected with fix:"
echo "  - Status: 200 OK"
echo "  - Response: {results: [...], pagination: {...}}"
echo ""
echo "If still failing:"
echo "  - Status: 401"
echo "  - Response: {error: 'Invalid or expired JWT token'}"
echo "  - Check logs: ./dive logs frontend | grep SessionValidation"
echo ""
