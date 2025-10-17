#!/bin/bash

#############################################################################
# DIVE V3 - Smoke Test Suite
#
# Quick verification that all critical functionality works
# Run this after deployment to verify system health
#
# Usage:
#   ./scripts/smoke-test.sh
#   BACKEND_URL=https://staging.dive-v3.mil ./scripts/smoke-test.sh
#
# Phase 4 - CI/CD & QA Automation
#############################################################################

set -e

echo "🧪 DIVE V3 - Smoke Test Suite"
echo "================================"
echo ""

# Configuration
BACKEND_URL=${BACKEND_URL:-http://localhost:4000}
FRONTEND_URL=${FRONTEND_URL:-http://localhost:3000}
TIMEOUT=${TIMEOUT:-10}

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

#############################################################################
# Helper Functions
#############################################################################

test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="$3"
    
    echo -n "  Testing $name... "
    
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
    
    if [ "$status" == "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $status)"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (Expected $expected_status, got $status)"
        ((FAILED++))
        return 1
    fi
}

test_json_response() {
    local name="$1"
    local url="$2"
    local expected_key="$3"
    
    echo -n "  Testing $name... "
    
    response=$(curl -s --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "{}")
    
    if echo "$response" | jq -e ".$expected_key" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC} (key '$expected_key' found)"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (key '$expected_key' not found)"
        ((FAILED++))
        return 1
    fi
}

#############################################################################
# Test Suites
#############################################################################

echo -e "${BLUE}📊 Health Checks${NC}"
echo "----------------"
test_endpoint "Basic Health" "$BACKEND_URL/health" "200"
test_endpoint "Detailed Health" "$BACKEND_URL/health/detailed" "200"
test_endpoint "Readiness Probe" "$BACKEND_URL/health/ready" "200"
test_endpoint "Liveness Probe" "$BACKEND_URL/health/live" "200"

echo ""
echo -e "${BLUE}🔐 Authentication Endpoints${NC}"
echo "----------------------------"
# These should return 401 without authentication
test_endpoint "Admin Dashboard" "$BACKEND_URL/api/admin/dashboard" "401"
test_endpoint "Admin Submissions" "$BACKEND_URL/api/admin/submissions" "401"

echo ""
echo -e "${BLUE}📈 Analytics Endpoints${NC}"
echo "----------------------"
# These should require authentication (401 without token)
test_endpoint "Risk Distribution" "$BACKEND_URL/api/admin/analytics/risk-distribution" "401"
test_endpoint "Compliance Trends" "$BACKEND_URL/api/admin/analytics/compliance-trends" "401"
test_endpoint "SLA Metrics" "$BACKEND_URL/api/admin/analytics/sla-metrics" "401"
test_endpoint "Authz Metrics" "$BACKEND_URL/api/admin/analytics/authz-metrics" "401"
test_endpoint "Security Posture" "$BACKEND_URL/api/admin/analytics/security-posture" "401"

echo ""
echo -e "${BLUE}🎨 Frontend Pages${NC}"
echo "-----------------"
test_endpoint "Home Page" "$FRONTEND_URL" "200"
test_endpoint "Admin Dashboard" "$FRONTEND_URL/admin/dashboard" "200"
test_endpoint "Analytics Dashboard" "$FRONTEND_URL/admin/analytics" "200"

echo ""
echo -e "${BLUE}💾 Database Connectivity${NC}"
echo "-------------------------"
echo -n "  Testing MongoDB... "
if command -v docker &> /dev/null; then
    if docker ps | grep -q dive-v3-mongodb; then
        if docker exec dive-v3-mongodb mongosh --quiet --eval "db.adminCommand('ping').ok" 2>/dev/null | grep -q "1"; then
            echo -e "${GREEN}✓ PASS${NC} (MongoDB responding)"
            ((PASSED++))
        else
            echo -e "${RED}✗ FAIL${NC} (MongoDB not responding)"
            ((FAILED++))
        fi
    else
        echo -e "${YELLOW}⚠ WARN${NC} (Container not found)"
        ((WARNINGS++))
    fi
else
    echo -e "${YELLOW}⚠ SKIP${NC} (Docker not available)"
    ((WARNINGS++))
fi

echo ""
echo -e "${BLUE}🔧 OPA Policy Service${NC}"
echo "---------------------"
echo -n "  Testing OPA Health... "
if command -v docker &> /dev/null; then
    if docker ps | grep -q dive-v3-opa; then
        opa_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8181/health 2>/dev/null || echo "000")
        if [ "$opa_status" == "200" ]; then
            echo -e "${GREEN}✓ PASS${NC} (OPA healthy)"
            ((PASSED++))
        else
            echo -e "${RED}✗ FAIL${NC} (OPA not responding)"
            ((FAILED++))
        fi
    else
        echo -e "${YELLOW}⚠ WARN${NC} (Container not found)"
        ((WARNINGS++))
    fi
else
    echo -e "${YELLOW}⚠ SKIP${NC} (Docker not available)"
    ((WARNINGS++))
fi

echo ""
echo -e "${BLUE}📊 Service Metrics${NC}"
echo "------------------"
echo -n "  Checking metrics endpoint... "
detailed_health=$(curl -s "$BACKEND_URL/health/detailed" 2>/dev/null || echo "{}")

if echo "$detailed_health" | jq -e '.metrics' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
    
    # Extract key metrics
    cache_hit_rate=$(echo "$detailed_health" | jq -r '.metrics.cacheHitRate // "N/A"')
    uptime=$(echo "$detailed_health" | jq -r '.uptime // "N/A"')
    
    echo "    Cache Hit Rate: $cache_hit_rate%"
    echo "    Uptime: $uptime"
else
    echo -e "${YELLOW}⚠ WARN${NC} (Metrics not available)"
    ((WARNINGS++))
fi

#############################################################################
# Summary
#############################################################################

echo ""
echo "================================"
echo "Summary: $PASSED passed, $FAILED failed, $WARNINGS warnings"
echo "================================"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All smoke tests passed!${NC}"
    echo ""
    echo "System is operational and ready for use."
    exit 0
elif [ $FAILED -le 2 ]; then
    echo -e "${YELLOW}⚠️  Some tests failed (${FAILED})${NC}"
    echo ""
    echo "System may be partially operational. Review failures above."
    exit 1
else
    echo -e "${RED}❌ Multiple tests failed (${FAILED})${NC}"
    echo ""
    echo "System is not operational. Critical issues detected."
    exit 1
fi

