#!/bin/bash
##########################################################################################
# Red Team Exercise - Federation Constraints Security
#
# Simulates 5 attack scenarios to validate defense-in-depth.
# All attacks should be detected and blocked.
#
# Usage: ./red-team-exercise.sh
#
# Phase 5, Task 5.2
# Date: 2026-01-28
##########################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${RED}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║           🛡️  RED TEAM SECURITY EXERCISE  🛡️              ║${NC}"
echo -e "${RED}║                                                           ║${NC}"
echo -e "${RED}║     Testing Federation Constraints Defense Layers        ║${NC}"
echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}⚠  WARNING: This script simulates attacks on the system.${NC}"
echo -e "${YELLOW}   All attacks should be BLOCKED by defense mechanisms.${NC}"
echo ""

PASSED=0
FAILED=0
API_URL="${DIVE_API_URL:-https://localhost:4000}"

# Helper functions
test_pass() {
  echo -e "  ${GREEN}✓ BLOCKED${NC} - $1"
  PASSED=$((PASSED + 1))
}

test_fail() {
  echo -e "  ${RED}✗ BYPASSED${NC} - $1"
  FAILED=$((FAILED + 1))
}

##########################################################################################
# SCENARIO 1: Hub Federation Bypass Attempt
##########################################################################################

echo -e "${BLUE}Scenario 1: Hub Federation Bypass Attempt${NC}"
echo "  Attacker: FRA tenant admin"
echo "  Method: Attempt to create FRA→HUB hub_spoke constraint"
echo "  Expected: 403 Forbidden (RBAC layer blocks)"
echo ""

# Simulate attack (requires FRA admin token)
if [ -n "$FRA_ADMIN_TOKEN" ]; then
  RESPONSE=$(curl -s -k -X POST "${API_URL}/api/federation-constraints" \
    -H "Authorization: Bearer ${FRA_ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "ownerTenant": "FRA",
      "partnerTenant": "HUB",
      "relationshipType": "hub_spoke",
      "maxClassification": "TOP_SECRET"
    }' \
    -w "\n%{http_code}" -o /tmp/rt-scenario1.json)

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" = "403" ]; then
    MESSAGE=$(jq -r '.message // ""' /tmp/rt-scenario1.json)
    if echo "$MESSAGE" | grep -q "super administrator"; then
      test_pass "RBAC blocked hub_spoke creation by tenant admin"
    else
      test_fail "Blocked but wrong error message: $MESSAGE"
    fi
  else
    test_fail "Attack succeeded! HTTP $HTTP_CODE (expected 403)"
  fi
else
  echo -e "  ${YELLOW}⚠ SKIPPED${NC} - FRA_ADMIN_TOKEN not provided"
fi

echo ""

##########################################################################################
# SCENARIO 2: Tenant Scope Violation
##########################################################################################

echo -e "${BLUE}Scenario 2: Tenant Scope Violation${NC}"
echo "  Attacker: FRA tenant admin"
echo "  Method: Attempt to create DEU→GBR constraint"
echo "  Expected: 403 Forbidden (RBAC layer blocks)"
echo ""

if [ -n "$FRA_ADMIN_TOKEN" ]; then
  RESPONSE=$(curl -s -k -X POST "${API_URL}/api/federation-constraints" \
    -H "Authorization: Bearer ${FRA_ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "ownerTenant": "DEU",
      "partnerTenant": "GBR",
      "maxClassification": "UNCLASSIFIED"
    }' \
    -w "\n%{http_code}" -o /tmp/rt-scenario2.json)

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" = "403" ]; then
    MESSAGE=$(jq -r '.message // ""' /tmp/rt-scenario2.json)
    if echo "$MESSAGE" | grep -q "their own tenant"; then
      test_pass "RBAC blocked cross-tenant modification"
    else
      test_fail "Blocked but wrong error message"
    fi
  else
    test_fail "Attack succeeded! HTTP $HTTP_CODE (expected 403)"
  fi
else
  echo -e "  ${YELLOW}⚠ SKIPPED${NC} - FRA_ADMIN_TOKEN not provided"
fi

echo ""

##########################################################################################
# SCENARIO 3: OPA Guardrail Test (Simulated Backend Bypass)
##########################################################################################

echo -e "${BLUE}Scenario 3: OPA Guardrail Validation (Backend Bypass Simulation)${NC}"
echo "  Attack: Direct MongoDB insert (simulated compromise)"
echo "  Defense: OPA guardrail layer"
echo "  Expected: Authorization denied with tampering detection"
echo ""

echo -e "  ${BLUE}→${NC} This scenario requires:"
echo "    1. Direct MongoDB access (./dive hub exec mongo)"
echo "    2. Insert tampered constraint"
echo "    3. Wait for OPAL distribution"
echo "    4. Attempt resource access"
echo "    5. Verify OPA denies with HUB_FEDERATION_TAMPERING"
echo ""
echo -e "  ${YELLOW}⚠ MANUAL TEST REQUIRED${NC} - Run after deployment"
echo "    See: docs/FEDERATION-CONSTRAINTS-DEPLOYMENT-GUIDE.md (Test 2)"

echo ""

##########################################################################################
# SCENARIO 4: Invalid Input Validation
##########################################################################################

echo -e "${BLUE}Scenario 4: Invalid Input Validation${NC}"
echo "  Attack: Submit invalid classification level"
echo "  Expected: 400 Bad Request"
echo ""

if [ -n "$FRA_ADMIN_TOKEN" ]; then
  RESPONSE=$(curl -s -k -X POST "${API_URL}/api/federation-constraints" \
    -H "Authorization: Bearer ${FRA_ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "ownerTenant": "FRA",
      "partnerTenant": "DEU",
      "maxClassification": "INVALID_LEVEL"
    }' \
    -w "\n%{http_code}" -o /tmp/rt-scenario4.json)

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" = "400" ]; then
    test_pass "Input validation rejected invalid classification"
  else
    test_fail "Invalid input accepted! HTTP $HTTP_CODE (expected 400)"
  fi
else
  echo -e "  ${YELLOW}⚠ SKIPPED${NC} - FRA_ADMIN_TOKEN not provided"
fi

echo ""

##########################################################################################
# SCENARIO 5: Same Tenant Constraint
##########################################################################################

echo -e "${BLUE}Scenario 5: Same Tenant Constraint (FRA→FRA)${NC}"
echo "  Attack: Create constraint where owner == partner"
echo "  Expected: 400 Bad Request (validation error)"
echo ""

if [ -n "$FRA_ADMIN_TOKEN" ]; then
  RESPONSE=$(curl -s -k -X POST "${API_URL}/api/federation-constraints" \
    -H "Authorization: Bearer ${FRA_ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "ownerTenant": "FRA",
      "partnerTenant": "FRA",
      "maxClassification": "SECRET"
    }' \
    -w "\n%{http_code}" -o /tmp/rt-scenario5.json)

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" = "400" ]; then
    MESSAGE=$(jq -r '.error // ""' /tmp/rt-scenario5.json)
    if echo "$MESSAGE" | grep -q "same"; then
      test_pass "Validation rejected same-tenant constraint"
    else
      test_fail "Blocked but wrong error message"
    fi
  else
    test_fail "Attack succeeded! HTTP $HTTP_CODE (expected 400)"
  fi
else
  echo -e "  ${YELLOW}⚠ SKIPPED${NC} - FRA_ADMIN_TOKEN not provided"
fi

echo ""

##########################################################################################
# SUMMARY
##########################################################################################

TOTAL=$((PASSED + FAILED))

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Red Team Exercise Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ "$TOTAL" -gt 0 ]; then
  echo -e "${GREEN}Attacks Blocked:${NC} $PASSED/$TOTAL"
  echo -e "${RED}Attacks Bypassed:${NC} $FAILED/$TOTAL"
  echo ""
fi

if [ "$FAILED" -eq 0 ] && [ "$TOTAL" -gt 0 ]; then
  echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║         ✅ ALL ATTACKS SUCCESSFULLY BLOCKED! ✅            ║${NC}"
  echo -e "${GREEN}║                                                           ║${NC}"
  echo -e "${GREEN}║     Defense-in-Depth is functioning correctly!           ║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
  exit 0
else
  echo -e "${RED}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║         ⚠  SECURITY VULNERABILITIES DETECTED  ⚠           ║${NC}"
  echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "CRITICAL: Fix security issues before deploying to production!"
  exit 1
fi
