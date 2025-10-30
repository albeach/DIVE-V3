#!/bin/bash

###############################################################################
# Spain SAML Manual Test Guide
# Interactive browser test for Spain SAML authentication
###############################################################################

echo "=================================================="
echo "Spain SAML Manual Test - Step-by-Step Guide"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}This test will verify that the Spain SAML integration is working end-to-end.${NC}"
echo ""

echo "=================================================="
echo "Step 1: Verify Services Running"
echo "=================================================="
echo ""

# Check frontend
if docker ps | grep -q "dive-v3-frontend"; then
    echo -e "${GREEN}✅ Frontend running${NC}"
else
    echo -e "${RED}❌ Frontend not running${NC}"
    echo "Start with: docker-compose up -d dive-v3-frontend"
    exit 1
fi

# Check Keycloak
if docker ps | grep -q "keycloak"; then
    echo -e "${GREEN}✅ Keycloak running${NC}"
else
    echo -e "${RED}❌ Keycloak not running${NC}"
    echo "Start with: docker-compose up -d keycloak"
    exit 1
fi

# Check SimpleSAMLphp
if docker ps | grep -q "simplesamlphp"; then
    echo -e "${GREEN}✅ SimpleSAMLphp running${NC}"
else
    echo -e "${RED}❌ SimpleSAMLphp not running${NC}"
    echo "Start with: docker-compose up -d simplesamlphp"
    exit 1
fi

# Check PostgreSQL
if docker ps | grep -q "dive-v3-postgres"; then
    echo -e "${GREEN}✅ PostgreSQL running${NC}"
else
    echo -e "${RED}❌ PostgreSQL not running${NC}"
    echo "Start with: docker-compose up -d dive-v3-postgres"
    exit 1
fi

echo ""
echo "=================================================="
echo "Step 2: Pre-Test Cleanup (Optional)"
echo "=================================================="
echo ""

read -p "Do you want to delete existing juan.garcia user for fresh test? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Getting admin token..."
    ADMIN_TOKEN=$(curl -s -X POST http://localhost:8081/realms/master/protocol/openid-connect/token \
      -d "client_id=admin-cli" \
      -d "username=admin" \
      -d "password=admin" \
      -d "grant_type=password" | jq -r '.access_token')
    
    if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ]; then
        # Get user ID
        USER_ID=$(curl -s "http://localhost:8081/admin/realms/dive-v3-broker/users?username=juan.garcia" \
          -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id // empty')
        
        if [ -n "$USER_ID" ]; then
            echo "Deleting user $USER_ID..."
            curl -s -X DELETE "http://localhost:8081/admin/realms/dive-v3-broker/users/$USER_ID" \
              -H "Authorization: Bearer $ADMIN_TOKEN"
            echo -e "${GREEN}✅ User deleted - fresh test ready${NC}"
        else
            echo -e "${YELLOW}⚠️  User not found - already clean${NC}"
        fi
    else
        echo -e "${RED}❌ Failed to get admin token${NC}"
    fi
else
    echo "Skipping cleanup - using existing user state"
fi

echo ""
echo "=================================================="
echo "Step 3: Manual Browser Test"
echo "=================================================="
echo ""

echo -e "${BLUE}Please perform the following steps in your browser:${NC}"
echo ""

echo "1. Open DIVE V3 Frontend:"
echo -e "   ${GREEN}http://localhost:3000${NC}"
echo ""

echo "2. Click 'Login' button"
echo ""

echo "3. Select 'Spain SAML IdP' from the IdP selection page"
echo "   (Look for the Spain flag icon)"
echo ""

echo "4. SimpleSAMLphp Auto-Authentication:"
echo "   - Should auto-login as 'juan.garcia' (test mode)"
echo "   - No password prompt expected"
echo ""

echo "5. First Broker Login (if first time):"
echo "   - Keycloak may ask to update profile"
echo "   - Fields should be pre-filled:"
echo "     • Email: juan.garcia@mail.mil"
echo "     • First Name: Juan"
echo "     • Last Name: García López"
echo "   - Click 'Submit' to continue"
echo ""

echo "6. Expected Redirect:"
echo -e "   ${GREEN}http://localhost:3000/dashboard${NC}"
echo ""

echo "7. Verify Dashboard Shows:"
echo "   ✓ Name: Juan García López"
echo "   ✓ Clearance: SECRET (transformed from SECRETO)"
echo "   ✓ Country: ESP"
echo "   ✓ COI: [\"NATO-COSMIC\", \"OTAN-ESP\"]"
echo ""

echo "=================================================="
echo "Step 4: Watch Logs During Test"
echo "=================================================="
echo ""

echo "Open a second terminal and run:"
echo -e "${GREEN}docker logs dive-v3-frontend -f${NC}"
echo ""

echo "Look for these log entries:"
echo ""
echo "✓ '[NextAuth Debug] adapter_getSessionAndUser'"
echo "✓ '[DIVE] Account found for user:'"
echo "✓ '[DIVE] Transformed clearanceOriginal to clearance'"
echo "✓ 'clearanceOriginal: SECRETO'"
echo "✓ 'clearance: SECRET'"
echo ""

echo "❌ Should NOT see:"
echo "✗ 'CallbackRouteError'"
echo "✗ 'Configuration error'"
echo "✗ Redirect to '/?error=Configuration'"
echo ""

echo "=================================================="
echo "Step 5: Verify in Database"
echo "=================================================="
echo ""

echo "After successful login, verify session in database:"
echo ""

read -p "Press Enter to check database after login..." 

echo ""
echo "Checking database for juan.garcia session..."
echo ""

# Get user from Keycloak
ADMIN_TOKEN=$(curl -s -X POST http://localhost:8081/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ]; then
    echo "1. Keycloak User Attributes:"
    echo ""
    curl -s "http://localhost:8081/admin/realms/dive-v3-broker/users?username=juan.garcia" \
      -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.[0] | {
        username,
        email,
        attributes: .attributes | {
            clearanceOriginal,
            countryOfAffiliation,
            acpCOI,
            displayName,
            dutyOrg
        }
    }'
    echo ""
fi

echo "2. Database User Record:"
echo ""
docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -c \
  "SELECT id, name, email FROM \"user\" WHERE email LIKE '%juan.garcia%';" 2>&1

echo ""
echo "3. Active Sessions:"
echo ""
docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -c \
  "SELECT s.\"userId\", u.name, u.email, s.expires 
   FROM session s 
   JOIN \"user\" u ON s.\"userId\" = u.id 
   WHERE s.expires > NOW() 
   ORDER BY s.expires DESC 
   LIMIT 5;" 2>&1

echo ""
echo "4. Account Tokens:"
echo ""
docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -c \
  "SELECT a.\"userId\", a.provider, 
          CASE WHEN a.access_token IS NOT NULL THEN 'Present' ELSE 'Missing' END as access_token,
          CASE WHEN a.id_token IS NOT NULL THEN 'Present' ELSE 'Missing' END as id_token,
          a.expires_at
   FROM account a 
   JOIN \"user\" u ON a.\"userId\" = u.id 
   WHERE u.email LIKE '%juan.garcia%';" 2>&1

echo ""
echo "=================================================="
echo "Test Result Summary"
echo "=================================================="
echo ""

echo "Expected vs Actual:"
echo ""
echo "| Test | Expected | Status |"
echo "|------|----------|--------|"
echo "| SAML Redirect | SimpleSAMLphp login | _____ |"
echo "| Auto-Auth | juan.garcia | _____ |"
echo "| Keycloak Profile | Pre-filled form | _____ |"
echo "| Dashboard Redirect | /dashboard | _____ |"
echo "| Clearance Display | SECRET | _____ |"
echo "| Country Display | ESP | _____ |"
echo "| COI Display | NATO-COSMIC, OTAN-ESP | _____ |"
echo "| No Errors | No CallbackRouteError | _____ |"
echo ""

echo "=================================================="
echo "Troubleshooting"
echo "=================================================="
echo ""

echo "If test fails, check:"
echo ""
echo "1. Frontend logs:"
echo "   docker logs dive-v3-frontend --tail 50"
echo ""
echo "2. Keycloak IdP configuration:"
echo "   http://localhost:8081/admin/master/console/#/dive-v3-broker/identity-providers"
echo ""
echo "3. SimpleSAMLphp metadata:"
echo "   curl http://localhost:8082/simplesaml/saml2/idp/metadata.php"
echo ""
echo "4. Database connection:"
echo "   docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -c '\\dt'"
echo ""
echo "5. Re-run automated verification:"
echo "   ./test-nextauth-callback-fix.sh"
echo ""

echo "=================================================="
echo "Manual Test Guide Complete"
echo "=================================================="
echo ""
echo "Report results to development team with:"
echo "  - Screenshot of dashboard (if successful)"
echo "  - Frontend logs (docker logs dive-v3-frontend --tail 100 > logs.txt)"
echo "  - Database verification output (above)"
echo ""

