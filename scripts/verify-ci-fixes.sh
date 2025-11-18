#!/bin/bash
# CI/CD Pipeline Fixes Verification Script
# Validates that all root cause fixes have been applied

set -e

echo "🔍 DIVE V3 CI/CD Pipeline Fixes Verification"
echo "=========================================="

ERRORS=0

# Check 1: Keycloak health check fixes
echo ""
echo "1️⃣ Checking Keycloak Health Check Fixes..."
if grep -q "nc -z localhost 9000" .github/workflows/test-e2e.yml && grep -q "nc -z localhost 9000" .github/workflows/test-specialty.yml; then
    echo "✅ Keycloak health checks use nc instead of curl"
else
    echo "❌ Keycloak health checks still use curl"
    ERRORS=$((ERRORS+1))
fi

# Check 2: Certificate generation script improvements
echo ""
echo "2️⃣ Checking Certificate Generation Improvements..."
if grep -q "command -v openssl" backend/scripts/generate-test-certs.sh && grep -q "Verifying generated files" backend/scripts/generate-test-certs.sh; then
    echo "✅ Certificate generation has error checking and verification"
else
    echo "❌ Certificate generation missing error checking"
    ERRORS=$((ERRORS+1))
fi

# Check 3: MongoDB authentication fixes
echo ""
echo "3️⃣ Checking MongoDB Authentication Fixes..."
if grep -q "\-\-noauth" .github/workflows/ci-comprehensive.yml && grep -q "MONGODB_AUTH_DISABLED.*true" .github/workflows/ci-comprehensive.yml; then
    echo "✅ MongoDB authentication disabled in CI"
else
    echo "❌ MongoDB authentication not properly disabled"
    ERRORS=$((ERRORS+1))
fi

# Check 4: E2E test race condition fixes
echo ""
echo "4️⃣ Checking E2E Test Race Condition Fixes..."
if grep -q "Verify certificates exist" .github/workflows/test-e2e.yml && grep -q "NEXTJS_PID=\$!" .github/workflows/test-e2e.yml; then
    echo "✅ E2E tests have certificate verification and PID tracking"
else
    echo "❌ E2E tests missing race condition fixes"
    ERRORS=$((ERRORS+1))
fi

# Check 5: Playwright configuration fixes
echo ""
echo "5️⃣ Checking Playwright Configuration Fixes..."
if grep -q "process\.env\.CI" frontend/playwright.config.ts && grep -q "localhost:3000" frontend/playwright.config.ts; then
    echo "✅ Playwright uses localhost in CI environment"
else
    echo "❌ Playwright configuration not fixed for CI"
    ERRORS=$((ERRORS+1))
fi

# Check 6: Workflow consolidation
echo ""
echo "6️⃣ Checking Workflow Consolidation..."
ACTIVE_WORKFLOWS=$(ls -1 .github/workflows/*.yml | wc -l)
if [ "$ACTIVE_WORKFLOWS" -le 8 ]; then
    echo "✅ Workflow consolidation completed ($ACTIVE_WORKFLOWS active workflows)"
else
    echo "⚠️  More workflows than expected ($ACTIVE_WORKFLOWS active)"
fi

# Check 7: Service container standardization
echo ""
echo "7️⃣ Checking Service Container Standardization..."
if grep -q "image: openpolicyagent/opa" .github/workflows/ci-comprehensive.yml; then
    echo "✅ OPA service containers standardized"
else
    echo "⚠️  OPA service containers may not be fully standardized"
fi

# Check 8: KAS HTTPS references
echo ""
echo "8️⃣ Checking KAS HTTPS References..."
if grep -q "https://kas" backend/src/controllers/resource.controller.ts && grep -q "https://kas" backend/src/services/upload.service.ts; then
    echo "✅ KAS URLs use HTTPS"
else
    echo "⚠️  Some KAS URLs may still use HTTP"
fi

# Summary
echo ""
echo "=========================================="
if [ "$ERRORS" -eq 0 ]; then
    echo "🎉 ALL CRITICAL FIXES VERIFIED!"
    echo ""
    echo "✅ CI/CD pipeline should now pass with all root causes resolved"
    echo ""
    echo "Next Steps:"
    echo "1. Push changes to trigger CI/CD pipelines"
    echo "2. Monitor workflow results"
    echo "3. Address any remaining failures with root cause analysis"
    echo ""
    echo "Expected Results:"
    echo "- ci-fast.yml: <5 min for PR feedback"
    echo "- ci-comprehensive.yml: Full test suite passing"
    echo "- test-e2e.yml: All 4 E2E suites passing"
    echo "- test-specialty.yml: Specialty tests passing"
else
    echo "❌ $ERRORS CRITICAL FIXES MISSING!"
    echo ""
    echo "Please review and apply the missing fixes before proceeding."
    exit 1
fi

echo "=========================================="
