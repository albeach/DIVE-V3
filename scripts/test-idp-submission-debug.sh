#!/bin/bash

###############################################################################
# IdP Submission Debug Script
# Tests the complete IdP submission flow and shows exactly what's failing
###############################################################################

set -e

echo "🔍 DIVE V3 - IdP Submission Debug"
echo "=================================="
echo ""

BACKEND_URL=${BACKEND_URL:-http://localhost:4000}

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "Step 1: Check Backend Health"
echo "-----------------------------"
if curl -s "$BACKEND_URL/health" | grep -q "healthy"; then
    echo -e "${GREEN}✓${NC} Backend is running"
else
    echo -e "${RED}✗${NC} Backend is NOT running!"
    echo "Start with: cd backend && npm run dev"
    exit 1
fi

echo ""
echo "Step 2: Get Admin Token (Simulated)"
echo "------------------------------------"
# In real usage, this comes from NextAuth session
# For testing, we'll try without auth to see the auth error
TOKEN="test-token-invalid"
echo "Using test token: $TOKEN"

echo ""
echo "Step 3: Submit Test IdP (Gold Tier Configuration)"
echo "--------------------------------------------------"

# Create a PERFECT configuration that SHOULD be auto-approved
cat > /tmp/test-gold-idp.json << 'EOF'
{
  "alias": "test-gold-microsoft",
  "displayName": "Microsoft Azure AD (Test)",
  "description": "Test gold-tier IdP with perfect configuration",
  "protocol": "oidc",
  "config": {
    "issuer": "https://login.microsoftonline.com/common/v2.0",
    "clientId": "test-client-12345",
    "clientSecret": "test-secret-67890",
    "authorizationUrl": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    "tokenUrl": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    "userInfoUrl": "https://graph.microsoft.com/oidc/userinfo",
    "jwksUrl": "https://login.microsoftonline.com/common/discovery/v2.0/keys",
    "defaultScopes": "openid profile email"
  },
  "attributeMappings": {
    "uniqueID": { "claim": "sub", "userAttribute": "uniqueID" },
    "clearance": { "claim": "clearance", "userAttribute": "clearance" },
    "countryOfAffiliation": { "claim": "country", "userAttribute": "countryOfAffiliation" },
    "acpCOI": { "claim": "groups", "userAttribute": "acpCOI" }
  },
  "operationalData": {
    "uptimeSLA": "99.99%",
    "incidentResponse": "24/7 SOC with 15-minute response time",
    "securityPatching": "<7 days for critical vulnerabilities",
    "supportContacts": ["security@microsoft.com", "azure-support@microsoft.com"]
  },
  "complianceDocuments": {
    "mfaPolicy": "Azure MFA enforced via Conditional Access",
    "acp240Certificate": "acp240-azure-cert.pdf",
    "stanag4774Certification": "stanag4774-cert.pdf",
    "auditPlan": "Azure audit logging enabled"
  },
  "metadata": {
    "country": "USA",
    "organization": "Microsoft Corporation",
    "contactEmail": "azure-admin@microsoft.com",
    "contactPhone": "+1-800-MICROSOFT"
  }
}
EOF

echo "Submitting to: $BACKEND_URL/api/admin/idps"
echo ""

# Submit and capture full response
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST "$BACKEND_URL/api/admin/idps" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d @/tmp/test-gold-idp.json)

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "HTTP Status: $HTTP_STATUS"
echo ""
echo "Response Body:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"

echo ""
echo "=================================="
echo "Analysis:"
echo "=================================="

case $HTTP_STATUS in
    401)
        echo -e "${RED}✗ AUTHENTICATION FAILED${NC}"
        echo ""
        echo "Issue: Invalid or expired JWT token"
        echo "Cause: You need to be logged in as super admin"
        echo ""
        echo "Solution:"
        echo "1. Open http://localhost:3000 in browser"
        echo "2. Login as super admin"
        echo "3. Try submitting from the UI (not this script)"
        ;;
    400)
        echo -e "${YELLOW}⚠ VALIDATION FAILED${NC}"
        echo ""
        echo "The configuration was rejected due to validation errors."
        echo ""
        echo "Check the 'criticalFailures' in the response above."
        echo ""
        echo "Common issues:"
        echo "- Invalid URL format (must be https://)"
        echo "- Unreachable endpoint"
        echo "- Weak TLS version (<1.2)"
        echo "- Weak cryptographic algorithms"
        ;;
    201|200)
        echo -e "${GREEN}✓ SUCCESS!${NC}"
        echo ""
        echo "IdP was validated and submitted successfully!"
        echo ""
        echo "Check the response for:"
        echo "- Validation results"
        echo "- Risk score"
        echo "- Approval decision"
        ;;
    500)
        echo -e "${RED}✗ SERVER ERROR${NC}"
        echo ""
        echo "The backend encountered an internal error."
        echo "Check backend logs for details."
        ;;
    *)
        echo -e "${YELLOW}? UNEXPECTED STATUS${NC}"
        echo "HTTP $HTTP_STATUS is not a standard response"
        ;;
esac

# Cleanup
rm -f /tmp/test-gold-idp.json

echo ""
echo "=================================="
echo "Next Step: Try from UI"
echo "=================================="
echo ""
echo "1. Open: http://localhost:3000/admin/idp/new"
echo "2. Use same values as above"
echo "3. You should see Phase 2 UI in Step 7!"

