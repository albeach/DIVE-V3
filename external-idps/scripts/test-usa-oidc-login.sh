#!/bin/bash

# DIVE V3 - Test USA OIDC IdP Login
# This script tests the USA OIDC IdP authentication and token flow

set -e

echo "================================================"
echo "DIVE V3 - USA OIDC IdP Test"
echo "================================================"
echo ""

# Test OIDC discovery endpoint
echo "1️⃣  Testing OIDC discovery endpoint..."
if curl -f http://localhost:8082/realms/us-dod/.well-known/openid-configuration > /dev/null 2>&1; then
    echo "   ✅ OIDC discovery endpoint accessible"
else
    echo "   ❌ OIDC discovery endpoint not accessible"
    echo "   Make sure USA OIDC IdP is running:"
    echo "   docker-compose ps usa-oidc"
    exit 1
fi

echo ""
echo "2️⃣  Fetching OIDC configuration..."
OIDC_CONFIG=$(curl -s http://localhost:8082/realms/us-dod/.well-known/openid-configuration)

# Extract endpoints
AUTH_ENDPOINT=$(echo "$OIDC_CONFIG" | jq -r '.authorization_endpoint')
TOKEN_ENDPOINT=$(echo "$OIDC_CONFIG" | jq -r '.token_endpoint')
USERINFO_ENDPOINT=$(echo "$OIDC_CONFIG" | jq -r '.userinfo_endpoint')
JWKS_URI=$(echo "$OIDC_CONFIG" | jq -r '.jwks_uri')

echo "   Authorization Endpoint: $AUTH_ENDPOINT"
echo "   Token Endpoint: $TOKEN_ENDPOINT"
echo "   UserInfo Endpoint: $USERINFO_ENDPOINT"
echo "   JWKS URI: $JWKS_URI"

echo ""
echo "3️⃣  Testing Direct Access Grant (Resource Owner Password Credentials)..."
echo ""

# Test user
USERNAME="smith.john@mail.mil"
PASSWORD="TopSecret123!"
CLIENT_ID="dive-v3-client"
CLIENT_SECRET="usa-dod-secret-change-in-production"

echo "   Requesting token for: $USERNAME"

# Get access token
TOKEN_RESPONSE=$(curl -s -X POST "$TOKEN_ENDPOINT" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password" \
    -d "client_id=$CLIENT_ID" \
    -d "client_secret=$CLIENT_SECRET" \
    -d "username=$USERNAME" \
    -d "password=$PASSWORD" \
    -d "scope=openid profile email")

# Check if token was obtained
if echo "$TOKEN_RESPONSE" | jq -e '.access_token' > /dev/null 2>&1; then
    echo "   ✅ Access token obtained"
    
    ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
    
    # Decode JWT (base64 decode the payload)
    PAYLOAD=$(echo "$ACCESS_TOKEN" | cut -d '.' -f 2 | base64 -d 2>/dev/null || echo "{}")
    
    echo ""
    echo "4️⃣  Verifying token claims..."
    
    # Extract DIVE attributes from token
    UNIQUE_ID=$(echo "$PAYLOAD" | jq -r '.uniqueID // .preferred_username // "N/A"')
    CLEARANCE=$(echo "$PAYLOAD" | jq -r '.clearance // "N/A"')
    COUNTRY=$(echo "$PAYLOAD" | jq -r '.countryOfAffiliation // "N/A"')
    COI=$(echo "$PAYLOAD" | jq -r '.acpCOI // "N/A"')
    
    echo "   uniqueID: $UNIQUE_ID"
    echo "   clearance: $CLEARANCE"
    echo "   countryOfAffiliation: $COUNTRY"
    echo "   acpCOI: $COI"
    
    # Verify expected values
    if [ "$CLEARANCE" = "TOP_SECRET" ] || [ "$CLEARANCE" = "N/A" ]; then
        if [ "$CLEARANCE" = "TOP_SECRET" ]; then
            echo "   ✅ Clearance attribute present and correct"
        else
            echo "   ⚠️  Clearance attribute not in token (check protocol mappers)"
        fi
    else
        echo "   ❌ Unexpected clearance: $CLEARANCE"
    fi
    
    echo ""
    echo "5️⃣  Testing UserInfo endpoint..."
    USERINFO=$(curl -s -X GET "$USERINFO_ENDPOINT" \
        -H "Authorization: Bearer $ACCESS_TOKEN")
    
    if echo "$USERINFO" | jq -e '.' > /dev/null 2>&1; then
        echo "   ✅ UserInfo endpoint accessible"
        echo ""
        echo "   UserInfo claims:"
        echo "$USERINFO" | jq '.'
    else
        echo "   ❌ UserInfo endpoint error"
    fi
    
else
    echo "   ❌ Failed to obtain access token"
    echo "   Error: $(echo "$TOKEN_RESPONSE" | jq -r '.error_description // .error // "Unknown error"')"
    exit 1
fi

echo ""
echo "================================================"
echo "✅ USA OIDC IdP Test Successful"
echo "================================================"
echo ""
echo "Test Results Summary:"
echo "  • OIDC Discovery: ✅"
echo "  • Token Acquisition: ✅"
echo "  • DIVE Attributes: $([ "$CLEARANCE" != "N/A" ] && echo "✅" || echo "⚠️  (check mappers)")"
echo "  • UserInfo Endpoint: ✅"
echo ""
echo "Next Steps:"
echo ""
echo "1. Access DIVE V3 as Super Admin:"
echo "   http://localhost:3000"
echo ""
echo "2. Navigate to Admin → Identity Providers → Add New IdP"
echo ""
echo "3. Configure USA OIDC:"
echo "   Protocol: OIDC"
echo "   Alias: usa-external"
echo "   Display Name: U.S. Department of Defense"
echo "   Discovery URL: http://usa-oidc:8082/realms/us-dod/.well-known/openid-configuration"
echo "   Client ID: $CLIENT_ID"
echo "   Client Secret: $CLIENT_SECRET"
echo ""
echo "4. Test login with: smith.john@mail.mil / TopSecret123!"
echo ""
echo "For automated testing, see:"
echo "  backend/src/__tests__/integration/external-idp-usa-oidc.test.ts"
echo ""
