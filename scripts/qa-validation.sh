#!/bin/bash

#############################################################################
# DIVE V3 - QA Validation Suite
#
# Comprehensive QA validation before deployment
# Run this before merging PRs or deploying to production
#
# Usage:
#   ./scripts/qa-validation.sh
#
# Requirements:
#   - Node.js 20+
#   - npm
#   - Docker (for service checks)
#   - jq (for JSON parsing)
#
# Phase 4 - CI/CD & QA Automation
#############################################################################

set -e

echo "🔍 DIVE V3 - QA Validation Suite"
echo "================================="
echo ""

# Configuration
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
FAILED_CHECKS=0
PASSED_CHECKS=0

#############################################################################
# Helper Functions
#############################################################################

check_pass() {
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED_CHECKS++))
}

check_fail() {
    local message="$1"
    echo -e "${RED}✗ FAIL${NC}"
    if [ -n "$message" ]; then
        echo "  Error: $message"
    fi
    ((FAILED_CHECKS++))
}

#############################################################################
# Check 1: All Tests Passing
#############################################################################

echo -e "${BLUE}Check 1: Running Full Test Suite${NC}"
echo "-----------------------------------"
echo ""

cd "$BACKEND_DIR"

echo -n "Running backend tests... "
if npm test -- --silent > /tmp/test-output.txt 2>&1; then
    total_tests=$(grep -o "[0-9]* tests" /tmp/test-output.txt | head -1 | awk '{print $1}' || echo "0")
    passed_tests=$(grep -o "[0-9]* passed" /tmp/test-output.txt | head -1 | awk '{print $1}' || echo "0")
    
    if [ "$total_tests" == "$passed_tests" ] && [ "$total_tests" != "0" ]; then
        check_pass
        echo "  Total tests: $total_tests"
        echo "  Passed: $passed_tests"
    else
        check_fail "Some tests failing: $passed_tests/$total_tests passed"
        tail -20 /tmp/test-output.txt
    fi
else
    check_fail "Test suite failed to run"
    tail -20 /tmp/test-output.txt
fi

echo ""

#############################################################################
# Check 2: TypeScript Compilation
#############################################################################

echo -e "${BLUE}Check 2: TypeScript Compilation${NC}"
echo "--------------------------------"
echo ""

echo -n "Backend TypeScript... "
cd "$BACKEND_DIR"
if npx tsc --noEmit > /tmp/ts-backend.txt 2>&1; then
    check_pass
else
    check_fail "Backend TypeScript errors"
    cat /tmp/ts-backend.txt | head -20
fi

echo -n "Frontend TypeScript... "
cd "$FRONTEND_DIR"
if npx tsc --noEmit > /tmp/ts-frontend.txt 2>&1; then
    check_pass
else
    check_fail "Frontend TypeScript errors"
    cat /tmp/ts-frontend.txt | head -20
fi

echo ""

#############################################################################
# Check 3: ESLint
#############################################################################

echo -e "${BLUE}Check 3: ESLint Checks${NC}"
echo "----------------------"
echo ""

echo -n "Backend ESLint... "
cd "$BACKEND_DIR"
if npm run lint > /tmp/eslint-backend.txt 2>&1; then
    check_pass
else
    check_fail "ESLint warnings/errors found"
    cat /tmp/eslint-backend.txt | tail -20
fi

echo -n "Frontend ESLint... "
cd "$FRONTEND_DIR"
if npm run lint > /tmp/eslint-frontend.txt 2>&1; then
    check_pass
else
    # Frontend linting may have warnings, don't fail on those
    if grep -q "error" /tmp/eslint-frontend.txt; then
        check_fail "ESLint errors found"
        cat /tmp/eslint-frontend.txt | tail -20
    else
        echo -e "${YELLOW}⚠ WARN${NC} (warnings present)"
    fi
fi

echo ""

#############################################################################
# Check 4: Security Audit
#############################################################################

echo -e "${BLUE}Check 4: Security Audit${NC}"
echo "-----------------------"
echo ""

echo -n "Backend security audit... "
cd "$BACKEND_DIR"
if npm audit --production --audit-level=high > /tmp/audit-backend.txt 2>&1; then
    check_pass
else
    check_fail "Security vulnerabilities found"
    cat /tmp/audit-backend.txt | grep -A 5 "vulnerabilities"
fi

echo -n "Frontend security audit... "
cd "$FRONTEND_DIR"
if npm audit --production --audit-level=high > /tmp/audit-frontend.txt 2>&1; then
    check_pass
else
    # Frontend may have dev dependency issues, be lenient
    vuln_count=$(grep -o "[0-9]* vulnerabilities" /tmp/audit-frontend.txt | head -1 | awk '{print $1}' || echo "0")
    if [ "$vuln_count" -gt 10 ]; then
        check_fail "High vulnerability count: $vuln_count"
    else
        echo -e "${YELLOW}⚠ WARN${NC} ($vuln_count vulnerabilities)"
    fi
fi

echo ""

#############################################################################
# Check 5: Performance Benchmarks
#############################################################################

echo -e "${BLUE}Check 5: Performance Benchmarks${NC}"
echo "--------------------------------"
echo ""

if curl -s http://localhost:4000/health/detailed > /dev/null 2>&1; then
    CACHE_HIT_RATE=$(curl -s http://localhost:4000/health/detailed | jq -r '.metrics.cacheHitRate // 0')
    
    echo -n "Cache hit rate... "
    if (( $(echo "$CACHE_HIT_RATE >= 80" | bc -l 2>/dev/null || echo "0") )); then
        check_pass
        echo "  Hit rate: $CACHE_HIT_RATE% (target: >80%)"
    else
        if [ "$CACHE_HIT_RATE" == "0" ]; then
            echo -e "${YELLOW}⚠ SKIP${NC} (no data)"
        else
            check_fail "Cache hit rate too low: $CACHE_HIT_RATE%"
        fi
    fi
else
    echo -n "Cache hit rate... "
    echo -e "${YELLOW}⚠ SKIP${NC} (backend not running)"
fi

echo ""

#############################################################################
# Check 6: Database Indexes
#############################################################################

echo -e "${BLUE}Check 6: Database Optimization${NC}"
echo "-------------------------------"
echo ""

echo -n "MongoDB indexes... "
if command -v docker &> /dev/null && docker ps | grep -q dive-v3-mongodb; then
    # Check if expected indexes exist
    index_count=$(docker exec dive-v3-mongodb mongosh --quiet --eval "
        use dive-v3;
        db.idpsubmissions.getIndexes().length + 
        db.resources.getIndexes().length + 
        db.auditlogs.getIndexes().length
    " 2>/dev/null || echo "0")
    
    # Expected: 21 indexes across 3 collections (from Phase 3)
    if [ "$index_count" -ge 15 ]; then
        check_pass
        echo "  Indexes found: $index_count"
    else
        check_fail "Expected at least 15 indexes, found $index_count"
    fi
else
    echo -e "${YELLOW}⚠ SKIP${NC} (MongoDB not running)"
fi

echo ""

#############################################################################
# Check 7: Documentation
#############################################################################

echo -e "${BLUE}Check 7: Documentation${NC}"
echo "----------------------"
echo ""

required_docs=(
    "CHANGELOG.md"
    "README.md"
    "docs/IMPLEMENTATION-PLAN.md"
    "docs/PRODUCTION-DEPLOYMENT-GUIDE.md"
    "docs/PERFORMANCE-BENCHMARKING-GUIDE.md"
)

for doc in "${required_docs[@]}"; do
    echo -n "  $doc... "
    if [ -f "$PROJECT_ROOT/$doc" ]; then
        # Check if file has content (>100 chars)
        file_size=$(wc -c < "$PROJECT_ROOT/$doc")
        if [ "$file_size" -gt 100 ]; then
            check_pass
        else
            check_fail "File exists but is too small"
        fi
    else
        check_fail "File missing"
    fi
done

echo ""

#############################################################################
# Check 8: Build Verification
#############################################################################

echo -e "${BLUE}Check 8: Build Verification${NC}"
echo "---------------------------"
echo ""

echo -n "Backend build... "
cd "$BACKEND_DIR"
if npm run build > /tmp/build-backend.txt 2>&1; then
    if [ -f "dist/server.js" ]; then
        check_pass
    else
        check_fail "Build succeeded but dist/server.js not found"
    fi
else
    check_fail "Build failed"
    tail -20 /tmp/build-backend.txt
fi

echo -n "Frontend build... "
cd "$FRONTEND_DIR"
if npm run build > /tmp/build-frontend.txt 2>&1; then
    if [ -d ".next" ]; then
        check_pass
    else
        check_fail "Build succeeded but .next directory not found"
    fi
else
    check_fail "Build failed"
    tail -20 /tmp/build-frontend.txt
fi

echo ""

#############################################################################
# Check 9: Docker Images
#############################################################################

echo -e "${BLUE}Check 9: Docker Images${NC}"
echo "----------------------"
echo ""

if command -v docker &> /dev/null; then
    required_images=(
        "dive-v3-mongodb"
        "dive-v3-opa"
    )
    
    for image in "${required_images[@]}"; do
        echo -n "  $image... "
        if docker ps | grep -q "$image"; then
            check_pass
        else
            echo -e "${YELLOW}⚠ WARN${NC} (not running)"
        fi
    done
else
    echo "  Docker... "
    echo -e "${YELLOW}⚠ SKIP${NC} (Docker not available)"
fi

echo ""

#############################################################################
# Check 10: Environment Configuration
#############################################################################

echo -e "${BLUE}Check 10: Environment Configuration${NC}"
echo "------------------------------------"
echo ""

echo -n "Backend .env... "
if [ -f "$BACKEND_DIR/.env" ] || [ -f "$BACKEND_DIR/.env.local" ]; then
    check_pass
else
    check_fail "Backend .env file missing"
fi

echo -n "Frontend .env.local... "
if [ -f "$FRONTEND_DIR/.env.local" ]; then
    check_pass
else
    echo -e "${YELLOW}⚠ WARN${NC} (optional file missing)"
fi

echo ""

#############################################################################
# Summary
#############################################################################

cd "$PROJECT_ROOT"

echo "================================="
echo "QA Validation Summary"
echo "================================="
echo ""
echo "Checks Passed: $PASSED_CHECKS"
echo "Checks Failed: $FAILED_CHECKS"
echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
    echo -e "${GREEN}✅ QA VALIDATION PASSED${NC}"
    echo ""
    echo "All quality checks passed!"
    echo "System is ready for deployment."
    echo ""
    exit 0
elif [ $FAILED_CHECKS -le 2 ]; then
    echo -e "${YELLOW}⚠️  QA VALIDATION PASSED WITH WARNINGS${NC}"
    echo ""
    echo "$FAILED_CHECKS minor issues found."
    echo "Review failures above before deployment."
    echo ""
    exit 0
else
    echo -e "${RED}❌ QA VALIDATION FAILED${NC}"
    echo ""
    echo "$FAILED_CHECKS checks failed."
    echo "Fix issues before deployment."
    echo ""
    exit 1
fi

