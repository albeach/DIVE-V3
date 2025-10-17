#!/bin/bash

###############################################################################
# Test CI Pipeline Locally
# Simulates what GitHub Actions will do
# Run this BEFORE pushing to verify CI will pass
###############################################################################

set -e

echo "🔍 Testing CI Pipeline Locally"
echo "==============================="
echo ""

FAILED=0
PASSED=0

cd "$(dirname "$0")/.."

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

test_job() {
    local name="$1"
    local command="$2"
    
    echo -e "\n${YELLOW}Testing: $name${NC}"
    echo "Command: $command"
    echo "---"
    
    if eval "$command"; then
        echo -e "${GREEN}✓ PASS${NC} - $name"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC} - $name"
        ((FAILED++))
    fi
}

# Job 1: Backend Build
test_job "Backend Build & Type Check" "cd backend && npm ci && npx tsc --noEmit && npm run build && test -f dist/server.js"

# Job 2: Backend Unit Tests
test_job "Backend Unit Tests" "cd backend && NODE_ENV=test npm test -- --silent"

# Job 3: OPA Policy Tests
test_job "OPA Policy Tests" "./bin/opa test policies/ -v"

# Job 4: Frontend Build
test_job "Frontend Build & Type Check" "cd frontend && npm ci --legacy-peer-deps && npx tsc --noEmit && npm run build && test -d .next"

# Job 5: Security Audit (allow failure)
echo -e "\n${YELLOW}Testing: Security Audit (warnings acceptable)${NC}"
cd backend && npm audit --production --audit-level=high || echo "Security warnings present (acceptable)"
cd ..
((PASSED++))

# Summary
echo ""
echo "==============================="
echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
echo "==============================="

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All CI jobs will PASS on GitHub!${NC}"
    exit 0
else
    echo -e "${RED}❌ CI will FAIL - fix issues before pushing${NC}"
    exit 1
fi

