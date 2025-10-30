#!/bin/bash

# Spain SAML E2E Test Script
# Tests the complete authentication flow from SimpleSAMLphp to Keycloak to Backend

set -e

echo "=========================================="
echo "Spain SAML E2E Integration Test"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Function to test a service
test_service() {
    local name=$1
    local url=$2
    local expected=$3
    
    echo -n "Testing $name... "
    
    if curl -s -f "$url" | grep -q "$expected"; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo "=== Phase 1: Service Health Checks ==="
echo ""

# Test 1: Frontend
test_service "Frontend (Next.js)" "http://localhost:3000" "DIVE V3"

# Test 2: Keycloak
test_service "Keycloak Realm" "http://localhost:8081/realms/dive-v3-broker" "dive-v3-broker"

# Test 3: SimpleSAMLphp
test_service "SimpleSAMLphp Metadata" "http://localhost:9443/simplesaml/saml2/idp/metadata.php" "EntityDescriptor"

# Test 4: Backend
test_service "Backend API" "http://localhost:4000/health" "\"status\":"

echo ""
echo "=== Phase 2: Keycloak IdP Configuration ==="
echo ""

# Get admin token
echo -n "Getting Keycloak admin token... "
ADMIN_TOKEN=$(curl -s -X POST http://localhost:8081/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
fi

# Test 5: Check if esp-realm-external IdP exists
echo -n "Checking esp-realm-external IdP... "
IDP_EXISTS=$(curl -s "http://localhost:8081/admin/realms/dive-v3-broker/identity-provider/instances/esp-realm-external" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.alias')

if [ "$IDP_EXISTS" == "esp-realm-external" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
fi

# Test 6: Check attribute mappers
echo -n "Checking attribute mappers... "
MAPPERS_COUNT=$(curl -s "http://localhost:8081/admin/realms/dive-v3-broker/identity-provider/instances/esp-realm-external/mappers" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq 'length')

if [ "$MAPPERS_COUNT" -ge 8 ]; then
    echo -e "${GREEN}✓ PASS (${MAPPERS_COUNT} mappers)${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL (only ${MAPPERS_COUNT} mappers)${NC}"
    ((TESTS_FAILED++))
fi

echo ""
echo "=== Phase 3: SimpleSAMLphp Configuration ==="
echo ""

# Test 7: Check if test users are configured
echo -n "Checking test users in SimpleSAMLphp... "
docker exec dive-spain-saml-idp cat /var/www/simplesamlphp/config/authsources.php | grep -q "juan.garcia" && \
docker exec dive-spain-saml-idp cat /var/www/simplesamlphp/config/authsources.php | grep -q "maria.rodriguez" && \
docker exec dive-spain-saml-idp cat /var/www/simplesamlphp/config/authsources.php | grep -q "carlos.fernandez" && \
docker exec dive-spain-saml-idp cat /var/www/simplesamlphp/config/authsources.php | grep -q "elena.sanchez"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PASS (4 test users configured)${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
fi

# Test 8: Check SP metadata configuration
echo -n "Checking SP metadata in SimpleSAMLphp... "
docker exec dive-spain-saml-idp test -f /var/www/simplesamlphp/metadata/saml20-sp-remote.php

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL (metadata file not found)${NC}"
    ((TESTS_FAILED++))
fi

# Test 9: Verify metadata contains Keycloak endpoint
echo -n "Verifying SP metadata content... "
docker exec dive-spain-saml-idp cat /var/www/simplesamlphp/metadata/saml20-sp-remote.php | grep -q "dive-v3-broker"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
fi

echo ""
echo "=== Phase 4: Backend Configuration ==="
echo ""

# Test 10: Check clearance normalization mapping
echo -n "Checking Spanish clearance mappings... "
if grep -q "SECRETO" /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend/src/services/clearance-normalization.service.ts && \
   grep -q "CONFIDENCIAL" /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend/src/services/clearance-normalization.service.ts && \
   grep -q "NO_CLASIFICADO" /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend/src/services/clearance-normalization.service.ts && \
   grep -q "ALTO_SECRETO" /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend/src/services/clearance-normalization.service.ts; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((TESTS_FAILED++))
fi

echo ""
echo "=== Test Summary ==="
echo ""
echo -e "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests Failed: ${RED}${TESTS_FAILED}${NC}"
echo -e "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}=========================================="
    echo "All automated tests PASSED!"
    echo "=========================================="
    echo ""
    echo -e "${YELLOW}READY FOR MANUAL E2E TESTING${NC}"
    echo ""
    echo "Next Steps:"
    echo "1. Open browser to http://localhost:3000"
    echo "2. Select 'Spain Ministry of Defense (External SAML)'"
    echo "3. Login with: juan.garcia / EspanaDefensa2025!"
    echo "4. Verify dashboard shows Spanish attributes"
    echo "5. Test resource access with SECRET-level resources"
    echo ""
    echo "Test Users:"
    echo "  juan.garcia       (SECRET, NATO-COSMIC)"
    echo "  maria.rodriguez   (CONFIDENTIAL, OTAN-ESP)"
    echo "  carlos.fernandez  (UNCLASSIFIED, no COI)"
    echo "  elena.sanchez     (TOP_SECRET, NATO-COSMIC)"
    echo -e "${NC}"
    exit 0
else
    echo -e "${RED}=========================================="
    echo "Some tests FAILED!"
    echo "=========================================="
    echo ""
    echo "Please check the failed tests above and fix before manual testing."
    echo -e "${NC}"
    exit 1
fi

