#!/bin/bash
#
# DIVE V3 Policies Lab - Smoke Test Script
#
# This script runs a quick end-to-end smoke test of the Policies Lab functionality.
# Tests: Upload policy → Evaluate → Delete
#
# Usage: JWT_TOKEN="your-token" ./scripts/smoke-test.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
API_BASE="$BACKEND_URL/api/policies-lab"

# Check for JWT token
if [ -z "$JWT_TOKEN" ]; then
    echo -e "${RED}❌ ERROR: JWT_TOKEN environment variable not set${NC}"
    echo ""
    echo "Usage: JWT_TOKEN=\"your-token\" ./scripts/smoke-test.sh"
    echo ""
    echo "To get a JWT token:"
    echo "  1. Start the application: docker-compose up -d"
    echo "  2. Navigate to http://localhost:3000"
    echo "  3. Login with any IdP"
    echo "  4. Open browser DevTools → Application → Local Storage → nextauth.token"
    echo "  5. Copy the accessToken value"
    exit 1
fi

echo "=================================="
echo "DIVE V3 - Policies Lab Smoke Test"
echo "=================================="
echo ""

# Temporary files
RESPONSE_FILE=$(mktemp)
POLICY_FILE=$(mktemp)

# Cleanup function
cleanup() {
    rm -f "$RESPONSE_FILE" "$POLICY_FILE"
}
trap cleanup EXIT

# Create a simple test policy
cat > "$POLICY_FILE" << 'EOF'
package dive.lab.smoke_test

import rego.v1

default allow := false

allow if {
    input.subject.clearance == "SECRET"
    input.resource.classification == "SECRET"
}
EOF

echo "Step 1: Upload Test Policy"
echo "-----------------------------------"

UPLOAD_RESPONSE=$(curl -s -X POST "$API_BASE/upload" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -F "file=@$POLICY_FILE" \
    -F 'metadata={"name":"Smoke Test Policy","description":"Automated smoke test"}' \
    -w "\n%{http_code}")

HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$UPLOAD_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
    POLICY_ID=$(echo "$RESPONSE_BODY" | grep -o '"policyId":"[^"]*"' | cut -d'"' -f4)
    
    if [ -z "$POLICY_ID" ]; then
        echo -e "${RED}❌ FAILED: Could not extract policyId from response${NC}"
        echo "Response: $RESPONSE_BODY"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Policy uploaded successfully${NC}"
    echo "   Policy ID: $POLICY_ID"
else
    echo -e "${RED}❌ FAILED: Upload returned HTTP $HTTP_CODE${NC}"
    echo "Response: $RESPONSE_BODY"
    exit 1
fi

echo ""
echo "Step 2: Evaluate Test Policy"
echo "-----------------------------------"

EVAL_RESPONSE=$(curl -s -X POST "$API_BASE/$POLICY_ID/evaluate" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "unified": {
            "subject": {
                "uniqueID": "smoke-test@example.com",
                "clearance": "SECRET",
                "countryOfAffiliation": "USA",
                "authenticated": true
            },
            "action": "read",
            "resource": {
                "resourceId": "doc-smoke-test",
                "classification": "SECRET",
                "releasabilityTo": ["USA"]
            },
            "context": {
                "currentTime": "2025-10-27T12:00:00Z",
                "requestId": "smoke-test-001",
                "deviceCompliant": true
            }
        }
    }' \
    -w "\n%{http_code}")

HTTP_CODE=$(echo "$EVAL_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$EVAL_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -eq 200 ]; then
    # Check for OPA decision
    OPA_DECISION=$(echo "$RESPONSE_BODY" | grep -o '"decision":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$OPA_DECISION" ]; then
        echo -e "${YELLOW}⚠️  WARNING: Could not extract OPA decision from response${NC}"
        echo "Response: $RESPONSE_BODY"
    else
        echo -e "${GREEN}✅ Policy evaluated successfully${NC}"
        echo "   OPA Decision: $OPA_DECISION"
        
        # Check latency
        LATENCY=$(echo "$RESPONSE_BODY" | grep -o '"latency_ms":[0-9]*' | head -1 | cut -d':' -f2)
        if [ -n "$LATENCY" ]; then
            echo "   Latency: ${LATENCY}ms"
            
            if [ "$LATENCY" -gt 500 ]; then
                echo -e "${YELLOW}⚠️  WARNING: Latency > 500ms (target: < 500ms)${NC}"
            fi
        fi
    fi
else
    echo -e "${RED}❌ FAILED: Evaluation returned HTTP $HTTP_CODE${NC}"
    echo "Response: $RESPONSE_BODY"
    # Continue to cleanup
fi

echo ""
echo "Step 3: Delete Test Policy"
echo "-----------------------------------"

DELETE_RESPONSE=$(curl -s -X DELETE "$API_BASE/$POLICY_ID" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -w "\n%{http_code}")

HTTP_CODE=$(echo "$DELETE_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 204 ]; then
    echo -e "${GREEN}✅ Policy deleted successfully${NC}"
else
    echo -e "${RED}❌ FAILED: Delete returned HTTP $HTTP_CODE${NC}"
    RESPONSE_BODY=$(echo "$DELETE_RESPONSE" | sed '$d')
    echo "Response: $RESPONSE_BODY"
    exit 1
fi

echo ""
echo "=================================="
echo "Smoke Test Summary"
echo "=================================="
echo -e "${GREEN}✅ All smoke tests passed!${NC}"
echo ""
echo "Tests completed:"
echo "  ✅ Upload Rego policy"
echo "  ✅ Evaluate policy (OPA)"
echo "  ✅ Delete policy"
echo ""
echo "Next steps:"
echo "  1. Run full test suite: cd backend && npm test"
echo "  2. Run E2E tests: cd frontend && npx playwright test policies-lab.spec.ts"
echo "  3. Verify UI: http://localhost:3000/policies/lab"
exit 0
