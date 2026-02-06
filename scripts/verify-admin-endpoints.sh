#!/bin/bash

###############################################################################
# DIVE V3 - Admin API Endpoint Verification Script
# 
# Tests all migrated admin API endpoints to ensure they're working correctly
# Run this after Phase 2 completion to verify everything is operational
#
# Usage: ./scripts/verify-admin-endpoints.sh
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
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
    local expected_status=${2:-200}
    local method=${3:-GET}
    local data=${4:-}
    
    print_test "$method $endpoint"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$API_BASE_URL$endpoint" 2>/dev/null || echo "000")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$API_BASE_URL$endpoint" 2>/dev/null || echo "000")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "$expected_status" ]; then
        print_success "Status $http_code (expected $expected_status)"
        return 0
    else
        print_failure "Status $http_code (expected $expected_status)"
        echo "Response: $body"
        return 1
    fi
}

###############################################################################
# Main Tests
###############################################################################

print_header "DIVE V3 Admin API Endpoint Verification"
echo "Base URL: $API_BASE_URL"
echo "Start Time: $(date)"

# Check if server is running
print_test "Server health check"
if curl -s -o /dev/null -w "%{http_code}" "$API_BASE_URL" | grep -q "200\|302\|404"; then
    print_success "Server is running"
else
    print_failure "Server is not responding"
    echo -e "\n${RED}ERROR: Cannot connect to $API_BASE_URL${NC}"
    echo "Please start the development server with: npm run dev"
    exit 1
fi

###############################################################################
# Clearance Management Endpoints
###############################################################################

print_header "Clearance Management Endpoints"

# These will return 401 without auth, but we can verify the routes exist
test_endpoint "/api/admin/clearance/countries" 401
test_endpoint "/api/admin/clearance/mappings" 401
test_endpoint "/api/admin/clearance/stats" 401
test_endpoint "/api/admin/clearance/audit/USA" 401
test_endpoint "/api/admin/clearance/validate" 401 POST

###############################################################################
# Compliance Endpoints
###############################################################################

print_header "Security Compliance Endpoints"

test_endpoint "/api/admin/compliance/reports/nist?startDate=$TEST_START_DATE&endDate=$TEST_END_DATE" 401
test_endpoint "/api/admin/compliance/reports/nato?startDate=$TEST_START_DATE&endDate=$TEST_END_DATE" 401
test_endpoint "/api/admin/compliance/reports/export?reportType=NIST&startDate=$TEST_START_DATE&endDate=$TEST_END_DATE&format=json" 401

###############################################################################
# Federation Endpoints (Existing)
###############################################################################

print_header "Federation Endpoints"

test_endpoint "/api/admin/federation/instances" 401
test_endpoint "/api/admin/federation/health" 401

###############################################################################
# Logs Endpoints (Existing)
###############################################################################

print_header "Audit Logs Endpoints"

test_endpoint "/api/admin/logs?limit=10&offset=0" 401
test_endpoint "/api/admin/logs/stats?days=7" 401
test_endpoint "/api/admin/logs/retention" 401

###############################################################################
# Policy Endpoints (Existing)
###############################################################################

print_header "Policy Endpoints"

test_endpoint "/api/admin/policies/simulate" 401 POST '{"subject":{},"resource":{}}'
test_endpoint "/api/admin/policies/diff" 401 POST '{}'

###############################################################################
# Users Endpoints (Existing)
###############################################################################

print_header "User Management Endpoints"

test_endpoint "/api/admin/users?limit=10" 401
test_endpoint "/api/admin/users/provision" 401 POST '{}'

###############################################################################
# Session Endpoints (Existing)
###############################################################################

print_header "Session Management Endpoints"

test_endpoint "/api/admin/sessions/analytics" 401
test_endpoint "/api/admin/sessions?limit=10" 401

###############################################################################
# Certificates Endpoints (Existing)
###############################################################################

print_header "Certificate Management Endpoints"

test_endpoint "/api/admin/certificates" 401
test_endpoint "/api/admin/certificates/health" 401

###############################################################################
# Security Endpoints (Existing)
###############################################################################

print_header "Security Configuration Endpoints"

test_endpoint "/api/admin/security/mfa-config" 401
test_endpoint "/api/admin/security/password-policy" 401
test_endpoint "/api/admin/security/sessions" 401

###############################################################################
# Test Summary
###############################################################################

print_header "Test Summary"

echo -e "\nTotal Tests Run: ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}✓ All endpoint routes exist and respond correctly${NC}"
    echo -e "${YELLOW}Note: 401 responses are expected without authentication${NC}"
    echo -e "${YELLOW}Next step: Run authenticated integration tests${NC}"
    exit 0
else
    echo -e "\n${RED}✗ Some endpoints failed verification${NC}"
    echo -e "${YELLOW}Check the output above for details${NC}"
    exit 1
fi
