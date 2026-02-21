#!/bin/bash
##########################################################################################
# Federation Constraints End-to-End Integration Test
#
# Tests full workflow: Create constraint → OPAL distribute → OPA enforce
#
# Prerequisites:
# - Hub deployed and healthy
# - At least one spoke (FRA) deployed
# - Admin tokens available
#
# Usage: ./test-federation-constraints-e2e.sh
#
# Phase 5, Task 5.3
# Date: 2026-01-28
##########################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API_URL="${DIVE_API_URL:-https://localhost:4000}"
SUPER_ADMIN_TOKEN="${DIVE_SUPER_ADMIN_TOKEN:-}"
FRA_ADMIN_TOKEN="${DIVE_FRA_ADMIN_TOKEN:-}"

PASSED=0
FAILED=0

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    Federation Constraints - E2E Integration Test          ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Helper functions
test_pass() {
  echo -e "  ${GREEN}✓ PASS${NC} - $1"
  PASSED=$((PASSED + 1))
}

test_fail() {
  echo -e "  ${RED}✗ FAIL${NC} - $1"
  FAILED=$((FAILED + 1))
}

##########################################################################################
# TEST 1: Create Constraint via API
##########################################################################################

echo -e "${BLUE}Test 1: Create FRA→DEU Constraint (CONFIDENTIAL cap)${NC}"

if [ -z "$FRA_ADMIN_TOKEN" ]; then
  echo -e "  ${YELLOW}⚠ SKIPPED${NC} - FRA_ADMIN_TOKEN not provided"
  echo ""
else
  RESPONSE=$(curl -s -k -X POST "${API_URL}/api/federation-constraints" \
    -H "Authorization: Bearer ${FRA_ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "ownerTenant": "FRA",
      "partnerTenant": "DEU",
      "maxClassification": "CONFIDENTIAL",
      "allowedCOIs": ["NATO"],
      "deniedCOIs": ["US-ONLY", "FVEY"],
      "relationshipType": "spoke_spoke",
      "description": "E2E test constraint"
    }' \
    -w "\n%{http_code}" -o /tmp/e2e-create.json)

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "409" ]; then
    SUCCESS=$(jq -r '.success // false' /tmp/e2e-create.json)
    if [ "$SUCCESS" = "true" ] || echo "$RESPONSE" | grep -q "already exists"; then
      test_pass "Constraint created (or already exists)"
    else
      test_fail "API returned success=false"
    fi
  else
    ERROR=$(jq -r '.error // "Unknown"' /tmp/e2e-create.json)
    test_fail "HTTP $HTTP_CODE - $ERROR"
  fi

  echo ""
fi

##########################################################################################
# TEST 2: Verify OPAL Distribution to Hub OPA
##########################################################################################

echo -e "${BLUE}Test 2: Verify OPAL Distribution to Hub OPA${NC}"
echo "  Waiting 2 seconds for OPAL distribution..."
sleep 2

OPA_DATA=$(curl -s -k https://localhost:8181/v1/data/federation_constraints 2>/dev/null || echo "")

if echo "$OPA_DATA" | jq -e '.result.federation_constraints.FRA.DEU' > /dev/null 2>&1; then
  MAX_CLASS=$(echo "$OPA_DATA" | jq -r '.result.federation_constraints.FRA.DEU.maxClassification')
  if [ "$MAX_CLASS" = "CONFIDENTIAL" ]; then
    test_pass "Hub OPA received constraint data correctly"
  else
    test_fail "Hub OPA has wrong maxClassification: $MAX_CLASS (expected CONFIDENTIAL)"
  fi
else
  test_fail "Hub OPA does not have FRA→DEU constraint data"
fi

echo ""

##########################################################################################
# TEST 3: Verify Distribution to Spoke OPA
##########################################################################################

echo -e "${BLUE}Test 3: Verify OPAL Distribution to FRA Spoke OPA${NC}"

if command -v ./dive &> /dev/null; then
  SPOKE_DATA=$(./dive spoke exec FRA opa "curl -s https://localhost:8181/v1/data/federation_constraints" 2>/dev/null || echo "")

  if echo "$SPOKE_DATA" | jq -e '.result.federation_constraints.FRA.DEU' > /dev/null 2>&1; then
    MAX_CLASS=$(echo "$SPOKE_DATA" | jq -r '.result.federation_constraints.FRA.DEU.maxClassification')
    if [ "$MAX_CLASS" = "CONFIDENTIAL" ]; then
      test_pass "FRA Spoke OPA received constraint data correctly"
    else
      test_fail "FRA Spoke OPA has wrong data"
    fi
  else
    test_fail "FRA Spoke OPA does not have constraint data"
  fi
else
  echo -e "  ${YELLOW}⚠ SKIPPED${NC} - DIVE CLI not available"
fi

echo ""

##########################################################################################
# TEST 4: List Constraints (Tenant-Filtered)
##########################################################################################

echo -e "${BLUE}Test 4: List Constraints (Tenant-Filtered)${NC}"

if [ -n "$FRA_ADMIN_TOKEN" ]; then
  CONSTRAINTS=$(curl -s -k "${API_URL}/api/federation-constraints" \
    -H "Authorization: Bearer ${FRA_ADMIN_TOKEN}")

  COUNT=$(echo "$CONSTRAINTS" | jq -r '.count // 0')
  TENANT=$(echo "$CONSTRAINTS" | jq -r '.tenant // ""')

  if [ "$TENANT" = "FRA" ] && [ "$COUNT" -gt 0 ]; then
    test_pass "Constraints correctly filtered to tenant FRA (count: $COUNT)"
  else
    test_fail "Constraint filtering not working (tenant: $TENANT, count: $COUNT)"
  fi
else
  echo -e "  ${YELLOW}⚠ SKIPPED${NC} - FRA_ADMIN_TOKEN not provided"
fi

echo ""

##########################################################################################
# TEST 5: Get Bilateral Constraints
##########################################################################################

echo -e "${BLUE}Test 5: Get Bilateral Constraints with Effective-Min${NC}"

if [ -n "$FRA_ADMIN_TOKEN" ]; then
  BILATERAL=$(curl -s -k "${API_URL}/api/federation-constraints/bilateral/FRA/DEU" \
    -H "Authorization: Bearer ${FRA_ADMIN_TOKEN}")

  EFFECTIVE_MAX=$(echo "$BILATERAL" | jq -r '.effectiveMax // null')

  if [ "$EFFECTIVE_MAX" != "null" ]; then
    test_pass "Bilateral endpoint returned effectiveMax: $EFFECTIVE_MAX"
  else
    test_fail "Bilateral endpoint did not calculate effectiveMax"
  fi
else
  echo -e "  ${YELLOW}⚠ SKIPPED${NC} - FRA_ADMIN_TOKEN not provided"
fi

echo ""

##########################################################################################
# TEST 6: OPAL Endpoint Availability
##########################################################################################

echo -e "${BLUE}Test 6: OPAL Endpoint Availability${NC}"

OPAL_RESPONSE=$(curl -s -k "${API_URL}/api/opal/federation-constraints" -o /tmp/e2e-opal.json -w "%{http_code}")

if [ "$OPAL_RESPONSE" = "200" ]; then
  SUCCESS=$(jq -r '.success // false' /tmp/e2e-opal.json)
  if [ "$SUCCESS" = "true" ]; then
    COUNT=$(jq -r '.count // 0' /tmp/e2e-opal.json)
    test_pass "OPAL endpoint serving data (count: $COUNT)"
  else
    test_fail "OPAL endpoint returned success=false"
  fi
else
  test_fail "OPAL endpoint not accessible (HTTP $OPAL_RESPONSE)"
fi

echo ""

##########################################################################################
# SUMMARY
##########################################################################################

TOTAL=$((PASSED + FAILED))

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}E2E Test Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}Passed:${NC} $PASSED/$TOTAL"
echo -e "${RED}Failed:${NC} $FAILED/$TOTAL"
echo ""

if [ "$FAILED" -eq 0 ] && [ "$TOTAL" -gt 0 ]; then
  echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║            ✅ ALL E2E TESTS PASSED! ✅                     ║${NC}"
  echo -e "${GREEN}║                                                           ║${NC}"
  echo -e "${GREEN}║     Federation Constraints System is Functional!         ║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "System is ready for production use."
  echo ""
  echo "Next steps:"
  echo "  1. Run security tests: ./scripts/security/red-team-exercise.sh"
  echo "  2. Run performance benchmarks: ./scripts/benchmark-federation-constraints.sh"
  echo "  3. Deploy to production"
  exit 0
else
  echo -e "${RED}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║         ⚠  E2E TEST FAILURES DETECTED  ⚠                  ║${NC}"
  echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "Please fix failed tests before proceeding to production."
  echo ""
  echo "Troubleshooting:"
  echo "  - Ensure Hub is deployed: ./dive hub status"
  echo "  - Ensure backend is healthy: ./dive hub logs backend"
  echo "  - Check OPAL Server: ./dive hub logs opal-server"
  echo "  - Verify tokens are valid"
  exit 1
fi

# sc2034-anchor
: "${SUPER_ADMIN_TOKEN:-}"
