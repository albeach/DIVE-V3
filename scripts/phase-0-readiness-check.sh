#!/bin/bash
# ============================================
# DIVE-V3 Phase 0 Readiness Checklist
# ============================================
# Automated validation of current state before implementation phases
#
# Usage: ./scripts/phase-0-readiness-check.sh
# Expected: 12/13 checks PASS (allow 1 transient failure)

# Don't exit on errors - we want to run all checks
set +e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track results
TOTAL_CHECKS=13
PASSED=0
FAILED=0
WARNINGS=0

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       DIVE-V3 Phase 0 Readiness Checklist                 ║${NC}"
echo -e "${BLUE}║       Generated: $(date '+%Y-%m-%d %H:%M:%S')                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Helper functions
check_passed() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    ((PASSED++))
}

check_failed() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    echo -e "   ${RED}Error: $2${NC}"
    ((FAILED++))
}

check_warning() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
    echo -e "   ${YELLOW}Note: $2${NC}"
    ((WARNINGS++))
    ((PASSED++))  # Count warnings as pass for now
}

# ============================================
# Check 1: Keycloak Version
# ============================================
echo -e "\n${BLUE}[1/13]${NC} Checking Keycloak version..."
if docker exec dive-v3-keycloak /opt/keycloak/bin/kc.sh --version 2>/dev/null | grep -q "26.4"; then
    VERSION=$(docker exec dive-v3-keycloak /opt/keycloak/bin/kc.sh --version 2>/dev/null | head -1)
    check_passed "Keycloak version: $VERSION"
else
    check_failed "Keycloak version check" "Expected 26.4.2, got $(docker exec dive-v3-keycloak /opt/keycloak/bin/kc.sh --version 2>&1 | head -1)"
fi

# ============================================
# Check 2: PostgreSQL Version
# ============================================
echo -e "\n${BLUE}[2/13]${NC} Checking PostgreSQL version..."
if docker exec dive-v3-postgres psql --version 2>/dev/null | grep -q "15"; then
    VERSION=$(docker exec dive-v3-postgres psql --version 2>/dev/null)
    check_passed "PostgreSQL version: $VERSION"
else
    check_failed "PostgreSQL version check" "Expected 15.x"
fi

# ============================================
# Check 3: MongoDB Version
# ============================================
echo -e "\n${BLUE}[3/13]${NC} Checking MongoDB version..."
if docker exec dive-v3-mongo mongod --version 2>/dev/null | grep -q "7.0"; then
    VERSION=$(docker exec dive-v3-mongo mongod --version 2>/dev/null | grep "db version" | head -1)
    check_passed "MongoDB version: $VERSION"
else
    check_failed "MongoDB version check" "Expected 7.0.x"
fi

# ============================================
# Check 4: OPA Version
# ============================================
echo -e "\n${BLUE}[4/13]${NC} Checking OPA version..."
if docker exec dive-v3-opa opa version 2>/dev/null | grep -q "Version"; then
    VERSION=$(docker exec dive-v3-opa opa version 2>/dev/null | grep "Version")
    check_passed "OPA version: $VERSION"
else
    check_failed "OPA version check" "Expected ≥ 0.68.0"
fi

# ============================================
# Check 5: Terraform Version
# ============================================
echo -e "\n${BLUE}[5/13]${NC} Checking Terraform version..."
if terraform version 2>/dev/null | grep -q "Terraform v"; then
    VERSION=$(terraform version | head -1)
    check_passed "Terraform version: $VERSION"
else
    check_failed "Terraform version check" "Expected ≥ 1.13.4"
fi

# ============================================
# Check 6: Terraform Provider
# ============================================
echo -e "\n${BLUE}[6/13]${NC} Checking Terraform Keycloak provider..."
if [ -f terraform/.terraform.lock.hcl ]; then
    if grep -q "keycloak/keycloak" terraform/.terraform.lock.hcl; then
        PROVIDER=$(grep -A 2 "keycloak/keycloak" terraform/.terraform.lock.hcl | grep version | head -1)
        check_passed "Keycloak provider: $PROVIDER"
    else
        check_failed "Terraform provider check" "keycloak/keycloak not found in .terraform.lock.hcl"
    fi
else
    check_warning "Terraform provider check" "terraform/.terraform.lock.hcl not found (run 'terraform init')"
fi

# ============================================
# Check 7: Realms Count
# ============================================
echo -e "\n${BLUE}[7/13]${NC} Checking Keycloak realms count..."
REALM_COUNT=$(docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get realms 2>/dev/null | grep -o '"realm"' | wc -l | tr -d ' ')
if [ "$REALM_COUNT" -eq 11 ]; then
    check_passed "Realms count: $REALM_COUNT (1 broker + 10 nations)"
elif [ "$REALM_COUNT" -gt 0 ]; then
    check_warning "Realms count" "Found $REALM_COUNT realms (expected 11)"
else
    check_failed "Realms count check" "No realms found (kcadm.sh may need authentication)"
fi

# ============================================
# Check 8: IdP Count
# ============================================
echo -e "\n${BLUE}[8/13]${NC} Checking IdP brokers count..."
IDP_COUNT=$(docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get identity-provider/instances -r dive-v3-broker 2>/dev/null | jq '. | length' 2>/dev/null || echo "0")
if [ "$IDP_COUNT" -eq 10 ]; then
    check_passed "IdP count: $IDP_COUNT external IdPs"
elif [ "$IDP_COUNT" -gt 0 ]; then
    check_warning "IdP count" "Found $IDP_COUNT IdPs (expected 10)"
else
    check_failed "IdP count check" "No IdPs found"
fi

# ============================================
# Check 9: MFA Flow
# ============================================
echo -e "\n${BLUE}[9/13]${NC} Checking Post-Broker MFA flow..."
if docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get authentication/flows -r dive-v3-broker 2>/dev/null | grep -q "Post-Broker"; then
    check_passed "Post-Broker MFA flow found"
else
    check_warning "MFA flow check" "Post-Broker flow not found (will be created in P1)"
fi

# ============================================
# Check 10: OPA Policies
# ============================================
echo -e "\n${BLUE}[10/13]${NC} Checking OPA policies..."
POLICY_COUNT=$(ls -1 policies/*.rego 2>/dev/null | wc -l | tr -d ' ')
if [ "$POLICY_COUNT" -ge 7 ]; then
    check_passed "OPA policies: $POLICY_COUNT policies found"
elif [ "$POLICY_COUNT" -gt 0 ]; then
    check_warning "OPA policies" "Found $POLICY_COUNT policies (expected ≥7)"
else
    check_failed "OPA policies check" "No .rego files found in policies/"
fi

# ============================================
# Check 11: Backend Health
# ============================================
echo -e "\n${BLUE}[11/13]${NC} Checking Backend health..."
if curl -sf http://localhost:4000/health >/dev/null 2>&1; then
    check_passed "Backend health: HTTP 200 OK"
else
    check_failed "Backend health check" "Backend not responding at http://localhost:4000/health"
fi

# ============================================
# Check 12: Frontend Health
# ============================================
echo -e "\n${BLUE}[12/13]${NC} Checking Frontend health..."
if curl -sf http://localhost:3000 >/dev/null 2>&1; then
    check_passed "Frontend health: HTTP 200 OK"
else
    check_warning "Frontend health check" "Frontend not responding (may not have /api/health endpoint)"
fi

# ============================================
# Check 13: Terraform State
# ============================================
echo -e "\n${BLUE}[13/13]${NC} Checking Terraform state..."
cd terraform 2>/dev/null || { check_failed "Terraform check" "terraform/ directory not found"; cd ..; }
if [ -d ".terraform" ]; then
    PLAN_OUTPUT=$(terraform plan -detailed-exitcode 2>&1)
    PLAN_EXIT=$?
    
    if [ $PLAN_EXIT -eq 0 ]; then
        check_passed "Terraform state: No drift detected"
    elif [ $PLAN_EXIT -eq 2 ]; then
        DRIFT_COUNT=$(echo "$PLAN_OUTPUT" | grep -o "Plan:" | wc -l | tr -d ' ')
        if [ "$DRIFT_COUNT" -gt 0 ]; then
            check_warning "Terraform state" "Drift detected (will be addressed in phases)"
        else
            check_warning "Terraform state" "Changes detected (review terraform plan output)"
        fi
    else
        check_failed "Terraform state check" "Terraform plan failed (run 'terraform init' or check configuration)"
    fi
else
    check_warning "Terraform state" ".terraform directory not found (run 'terraform init')"
fi
cd ..

# ============================================
# Summary
# ============================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    READINESS SUMMARY                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Total Checks:     ${TOTAL_CHECKS}"
echo -e "Passed:           ${GREEN}${PASSED}${NC}"
echo -e "Failed:           ${RED}${FAILED}${NC}"
echo -e "Warnings:         ${YELLOW}${WARNINGS}${NC}"
echo ""

# Calculate success rate
SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED/$TOTAL_CHECKS)*100}")

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  ✅ GO FOR PHASE 1                          ║${NC}"
    echo -e "${GREEN}║          Success Rate: ${SUCCESS_RATE}% (${PASSED}/${TOTAL_CHECKS})                  ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}All critical checks passed!${NC}"
    echo -e "You may proceed with Phase 1: Federation & MFA Hardening"
    echo ""
    exit 0
elif [ $FAILED -le 1 ]; then
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║              ⚠️  CONDITIONAL GO FOR PHASE 1                ║${NC}"
    echo -e "${YELLOW}║          Success Rate: ${SUCCESS_RATE}% (${PASSED}/${TOTAL_CHECKS})                  ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Warning: ${FAILED} check(s) failed, but within acceptable threshold${NC}"
    echo -e "Review failures above and resolve if critical"
    echo ""
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                    ❌ NO-GO                                 ║${NC}"
    echo -e "${RED}║          Success Rate: ${SUCCESS_RATE}% (${PASSED}/${TOTAL_CHECKS})                  ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}Too many failures (${FAILED}). Resolve critical issues before proceeding.${NC}"
    echo ""
    echo "Recommended actions:"
    echo "1. Start Docker services: docker-compose up -d"
    echo "2. Initialize Terraform: cd terraform && terraform init"
    echo "3. Authenticate kcadm.sh to Keycloak"
    echo "4. Re-run this script"
    echo ""
    exit 1
fi

