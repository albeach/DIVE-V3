#!/bin/bash
##########################################################################################
# Federation Constraints Deployment Validation Script
#
# Validates that federation constraints system is deployed and functional.
#
# Usage: ./validate-federation-constraints-deployment.sh
#
# Phase 2 - Deployment Validation
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
ADMIN_TOKEN="${DIVE_ADMIN_TOKEN:-}"

PASSED=0
FAILED=0

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    Federation Constraints - Deployment Validation         ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Helper functions
check_pass() {
  echo -e "  ${GREEN}✓${NC} $1"
  PASSED=$((PASSED + 1))
}

check_fail() {
  echo -e "  ${RED}✗${NC} $1"
  FAILED=$((FAILED + 1))
}

check_warn() {
  echo -e "  ${YELLOW}⚠${NC} $1"
}

##########################################################################################
# TEST 1: Backend Endpoint Availability
##########################################################################################

echo -e "${BLUE}Test 1: Backend OPAL Endpoint${NC}"

RESPONSE=$(curl -s -k "${API_URL}/api/opal/federation-constraints" -o /tmp/opal-check.json -w "%{http_code}")

if [ "$RESPONSE" = "200" ]; then
  SUCCESS=$(jq -r '.success // false' /tmp/opal-check.json)
  if [ "$SUCCESS" = "true" ]; then
    check_pass "OPAL endpoint responding correctly"
    COUNT=$(jq -r '.count // 0' /tmp/opal-check.json)
    echo "         Constraints loaded: $COUNT"
  else
    check_fail "OPAL endpoint returned success=false"
  fi
else
  check_fail "OPAL endpoint not accessible (HTTP $RESPONSE)"
fi

echo ""

##########################################################################################
# TEST 2: MongoDB Indexes
##########################################################################################

echo -e "${BLUE}Test 2: MongoDB Indexes${NC}"

# Check if MongoDB is accessible via dive CLI
if command -v ./dive &> /dev/null; then
  INDEX_OUTPUT=$(./dive hub exec mongo "mongosh dive-v3 --quiet --eval \"db.federation_constraints.getIndexes()\"" 2>/dev/null || echo "")

  if echo "$INDEX_OUTPUT" | grep -q "idx_owner_partner_unique"; then
    check_pass "Compound unique index created"
  else
    check_warn "Could not verify compound index (MongoDB may not be accessible)"
  fi
else
  check_warn "DIVE CLI not available - skipping MongoDB index check"
fi

echo ""

##########################################################################################
# TEST 3: OPA Policy Compilation
##########################################################################################

echo -e "${BLUE}Test 3: OPA Policy Tests${NC}"

if command -v opa &> /dev/null; then
  # Test federation constraints
  OPA_TEST_1=$(opa test policies/tenant/federation_constraints.rego policies/tenant/federation_constraints_test.rego 2>&1)
  if echo "$OPA_TEST_1" | grep -q "PASS: 20/20"; then
    check_pass "Federation constraints tests passing (20/20)"
  else
    check_fail "Federation constraints tests failing"
    echo "$OPA_TEST_1" | tail -5
  fi

  # Test hub guardrails
  OPA_TEST_2=$(opa test policies/base/guardrails/guardrails.rego policies/base/guardrails/guardrails_hub_federation_test.rego 2>&1)
  if echo "$OPA_TEST_2" | grep -q "PASS: 15/15"; then
    check_pass "Hub guardrails tests passing (15/15)"
  else
    check_fail "Hub guardrails tests failing"
    echo "$OPA_TEST_2" | tail -5
  fi
else
  check_warn "OPA not installed - skipping policy tests"
fi

echo ""

##########################################################################################
# TEST 4: Policy Pack Files
##########################################################################################

echo -e "${BLUE}Test 4: Policy Pack Files${NC}"

PACKS_DIR="scripts/policy-presets/packs"
EXPECTED_PACKS=("NATO_STANDARD" "FVEY_EXPANDED" "BILATERAL_RESTRICTED" "INDUSTRY_LOCKDOWN" "HIGH_WATERMARK" "EMBARGO_TEMPLATE" "ATTRIBUTE_RELEASE_TEMPLATE")
FOUND_COUNT=0

for pack in "${EXPECTED_PACKS[@]}"; do
  if [ -f "${PACKS_DIR}/${pack}.json" ]; then
    FOUND_COUNT=$((FOUND_COUNT + 1))
  fi
done

if [ "$FOUND_COUNT" -eq 7 ]; then
  check_pass "All 7 policy packs present"
else
  check_fail "Only $FOUND_COUNT/7 policy packs found"
fi

echo ""

##########################################################################################
# TEST 5: Admin Scripts
##########################################################################################

echo -e "${BLUE}Test 5: Admin Scripts${NC}"

SCRIPTS=("apply-pack.sh" "preview-pack.sh" "rollback-pack.sh" "list-packs.sh")
SCRIPTS_OK=0

for script in "${SCRIPTS[@]}"; do
  if [ -x "scripts/policy-presets/$script" ]; then
    SCRIPTS_OK=$((SCRIPTS_OK + 1))
  fi
done

if [ "$SCRIPTS_OK" -eq 4 ]; then
  check_pass "All 4 admin scripts executable"
else
  check_fail "Only $SCRIPTS_OK/4 admin scripts executable"
fi

echo ""

##########################################################################################
# TEST 6: Documentation
##########################################################################################

echo -e "${BLUE}Test 6: Documentation${NC}"

DOCS=("docs/ADMIN-QUICK-START-FEDERATION-CONSTRAINTS.md" "docs/FEDERATION-CONSTRAINTS-DEPLOYMENT-GUIDE.md" "docs/IMPLEMENTATION-STATUS-REPORT-2026-01-28.md")
DOCS_OK=0

for doc in "${DOCS[@]}"; do
  if [ -f "$doc" ]; then
    DOCS_OK=$((DOCS_OK + 1))
  fi
done

if [ "$DOCS_OK" -eq 3 ]; then
  check_pass "All documentation files present"
else
  check_fail "Only $DOCS_OK/3 documentation files found"
fi

echo ""

##########################################################################################
# TEST 7: OPAL Configuration
##########################################################################################

echo -e "${BLUE}Test 7: OPAL Configuration${NC}"

if grep -q "federation_constraints" docker-compose.hub.yml; then
  check_pass "Hub OPAL configured for federation_constraints"
else
  check_fail "Hub OPAL missing federation_constraints config"
fi

if grep -q "federation_constraints" templates/spoke/docker-compose.template.yml; then
  check_pass "Spoke OPAL template configured"
else
  check_fail "Spoke OPAL template missing federation_constraints"
fi

echo ""

##########################################################################################
# SUMMARY
##########################################################################################

TOTAL=$((PASSED + FAILED))

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Validation Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}Passed:${NC} $PASSED/$TOTAL"
echo -e "${RED}Failed:${NC} $FAILED/$TOTAL"
echo ""

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║         ✅ ALL VALIDATION CHECKS PASSED! ✅                ║${NC}"
  echo -e "${GREEN}║                                                           ║${NC}"
  echo -e "${GREEN}║     Federation Constraints System is Ready!               ║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Deploy Hub: ./dive hub deploy"
  echo "  2. Deploy Spokes: ./dive spoke deploy FRA"
  echo "  3. Apply policy packs: cd scripts/policy-presets && ./apply-pack.sh NATO_STANDARD --tenant FRA"
  exit 0
else
  echo -e "${RED}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║         ⚠  VALIDATION FAILURES DETECTED  ⚠                ║${NC}"
  echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "Please fix failed checks before deploying."
  exit 1
fi

# sc2034-anchor
: "${ADMIN_TOKEN:-}"
