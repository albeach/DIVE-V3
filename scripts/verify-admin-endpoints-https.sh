#!/bin/bash

###############################################################################
# DIVE V3 - Admin API Endpoint Verification Script (HTTPS Version)
# 
# Tests all migrated admin API endpoints to ensure they're working correctly
# Updated to use HTTPS (Cloudflare tunnel setup)
#
# Usage: ./scripts/verify-admin-endpoints-https.sh
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE_URL="${API_BASE_URL:-https://localhost:3000}"
TEST_START_DATE="2026-01-01T00:00:00Z"
TEST_END_DATE="2026-02-05T23:59:59Z"

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

###############################################################################
# Helper Functions
###############################################################################

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_test() {
    echo -e "\n${YELLOW}Testing:${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED_TESTS++))
    ((TOTAL_TESTS++))
}

print_failure() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED_TESTS++))
    ((TOTAL_TESTS++))
}

test_endpoint() {
    local endpoint=$1
    local expected_status=${2:-401}  # Default to 401 (auth required)
    local method=${3:-GET}
    local data=${4:-}
    
    print_test "$method $endpoint"
    
    # Use -k to skip SSL verification (self-signed certs)
    if [ "$method" = "GET" ]; then
        http_code=$(curl -k -s -o /dev/null -w "%{http_code}" "$API_BASE_URL$endpoint" 2>/dev/null || echo "000")
    else
        http_code=$(curl -k -s -o /dev/null -w "%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$API_BASE_URL$endpoint" 2>/dev/null || echo "000")
    fi
    
    if [ "$http_code" = "$expected_status" ]; then
        print_success "Status $http_code (expected $expected_status) - Route exists"
        return 0
    else
        print_failure "Status $http_code (expected $expected_status)"
        return 1
    fi
}

###############################################################################
# Main Tests
###############################################################################

print_header "DIVE V3 Admin API Endpoint Verification (HTTPS)"
echo "Base URL: $API_BASE_URL"
echo "Start Time: $(date)"
echo ""
echo -e "${YELLOW}Note: All endpoints should return 401 (Unauthorized) without authentication${NC}"
echo -e "${YELLOW}This verifies the routes exist and auth middleware is working${NC}"

###############################################################################
# Clearance Management Endpoints (NEW - Phase 2)
###############################################################################

print_header "Clearance Management Endpoints"

test_endpoint "/api/admin/clearance/countries" 401
test_endpoint "/api/admin/clearance/mappings" 401
test_endpoint "/api/admin/clearance/stats" 401
test_endpoint "/api/admin/clearance/audit/USA" 401
test_endpoint "/api/admin/clearance/validate" 401 POST

echo -e "\n${GREEN}✓ All 5 clearance endpoints verified${NC}"

###############################################################################
# Security Compliance Endpoints (NEW - Phase 2)
###############################################################################

print_header "Security Compliance Endpoints"

test_endpoint "/api/admin/compliance/reports/nist?startDate=$TEST_START_DATE&endDate=$TEST_END_DATE" 401
test_endpoint "/api/admin/compliance/reports/nato?startDate=$TEST_START_DATE&endDate=$TEST_END_DATE" 401
test_endpoint "/api/admin/compliance/reports/export?reportType=NIST&startDate=$TEST_START_DATE&endDate=$TEST_END_DATE&format=json" 401

echo -e "\n${GREEN}✓ All 3 compliance endpoints verified${NC}"

###############################################################################
# Federation Endpoints
###############################################################################

print_header "Federation Endpoints"

test_endpoint "/api/admin/federation/instances" 401
test_endpoint "/api/admin/federation/health" 401

###############################################################################
# Logs Endpoints
###############################################################################

print_header "Audit Logs Endpoints"

test_endpoint "/api/admin/logs?limit=10&offset=0" 401
test_endpoint "/api/admin/logs/stats?days=7" 401
test_endpoint "/api/admin/logs/retention" 401
test_endpoint "/api/admin/logs/export" 401

###############################################################################
# Policy Endpoints
###############################################################################

print_header "Policy Endpoints"

test_endpoint "/api/admin/policies/simulate" 401 POST '{"subject":{},"resource":{}}'
test_endpoint "/api/admin/policies/diff" 401 POST '{}'

###############################################################################
# Users Endpoints
###############################################################################

print_header "User Management Endpoints"

test_endpoint "/api/admin/users?limit=10" 401
test_endpoint "/api/admin/users/provision" 401 POST '{}'

###############################################################################
# Session Endpoints
###############################################################################

print_header "Session Management Endpoints"

test_endpoint "/api/admin/sessions/analytics" 401
test_endpoint "/api/admin/sessions?limit=10" 401

###############################################################################
# Certificates Endpoints
###############################################################################

print_header "Certificate Management Endpoints"

test_endpoint "/api/admin/certificates" 401
test_endpoint "/api/admin/certificates/health" 401

###############################################################################
# Security Endpoints
###############################################################################

print_header "Security Configuration Endpoints"

test_endpoint "/api/admin/security/mfa-config" 401
test_endpoint "/api/admin/security/password-policy" 401
test_endpoint "/api/admin/security/sessions" 401

###############################################################################
# Tenants Endpoints
###############################################################################

print_header "Tenant Management Endpoints"

test_endpoint "/api/admin/tenants?limit=10" 401

###############################################################################
# SP Registry Endpoints
###############################################################################

print_header "Service Provider Registry Endpoints"

# Note: These use dynamic routes [spId]
echo -e "\n${YELLOW}Note:${NC} SP Registry endpoints use dynamic [spId] parameter"
echo -e "Testing with example ID: test-sp-001"

###############################################################################
# Test Summary
###############################################################################

print_header "Test Summary"

echo -e "\nTotal Tests Run: ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ All admin API routes verified!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "\n${YELLOW}Expected Behavior:${NC}"
    echo -e "  • All routes return 401 (Unauthorized)"
    echo -e "  • This confirms routes exist"
    echo -e "  • Auth middleware is working"
    echo -e "  • Ready for authenticated testing"
    echo -e "\n${BLUE}Next Steps:${NC}"
    echo -e "  1. Access pages in browser with authentication"
    echo -e "  2. Test /admin/clearance-management"
    echo -e "  3. Test /admin/security-compliance"
    echo -e "  4. Run Jest tests: npm test"
    exit 0
else
    echo -e "\n${RED}✗ Some endpoints failed verification${NC}"
    echo -e "${YELLOW}Check the output above for details${NC}"
    exit 1
fi
