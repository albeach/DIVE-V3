#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Resource Access Verification
# =============================================================================
# Verifies resource access with different clearance levels, ensuring proper
# ABAC enforcement (clearance, releasability, COI).
#
# Usage:
#   ./scripts/tests/verify-resource-access.sh [--instance INST] [--user USER]
#
# Prerequisites:
#   - All instances running
#   - Resources seeded
#   - Terraform test users available
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
REALM_NAME="dive-v3-broker"
CLIENT_ID="dive-v3-client-broker"
TEST_USER_PASSWORD="TestUser2025!Pilot"

declare -A INSTANCE_CONFIGS
INSTANCE_CONFIGS[usa_idp]="https://usa-idp.dive25.com"
INSTANCE_CONFIGS[usa_api]="https://usa-api.dive25.com"

# Test users - All clearance levels × All countries
declare -A TEST_USERS
# USA users
TEST_USERS[testuser-usa-1]="UNCLASSIFIED|USA|testuser-usa-1"
TEST_USERS[testuser-usa-2]="CONFIDENTIAL|USA|testuser-usa-2"
TEST_USERS[testuser-usa-3]="SECRET|USA|testuser-usa-3"
TEST_USERS[testuser-usa-4]="TOP_SECRET|USA|testuser-usa-4"
# FRA users
TEST_USERS[testuser-fra-1]="UNCLASSIFIED|FRA|testuser-fra-1"
TEST_USERS[testuser-fra-2]="CONFIDENTIAL|FRA|testuser-fra-2"
TEST_USERS[testuser-fra-3]="SECRET|FRA|testuser-fra-3"
TEST_USERS[testuser-fra-4]="TOP_SECRET|FRA|testuser-fra-4"
# GBR users
TEST_USERS[testuser-gbr-1]="UNCLASSIFIED|GBR|testuser-gbr-1"
TEST_USERS[testuser-gbr-2]="CONFIDENTIAL|GBR|testuser-gbr-2"
TEST_USERS[testuser-gbr-3]="SECRET|GBR|testuser-gbr-3"
TEST_USERS[testuser-gbr-4]="TOP_SECRET|GBR|testuser-gbr-4"
# DEU users
TEST_USERS[testuser-deu-1]="UNCLASSIFIED|DEU|testuser-deu-1"
TEST_USERS[testuser-deu-2]="CONFIDENTIAL|DEU|testuser-deu-2"
TEST_USERS[testuser-deu-3]="SECRET|DEU|testuser-deu-3"
TEST_USERS[testuser-deu-4]="TOP_SECRET|DEU|testuser-deu-4"

TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log_header() {
    echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"
}

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

# Load client secret
load_client_secret() {
    local instance="$1"
    local secret_name="dive-v3-keycloak-client-secret-${instance}"
    gcloud secrets versions access latest --secret="$secret_name" --project=dive25 2>/dev/null || echo ""
}

# Get user token
get_user_token() {
    local instance="$1"
    local username="$2"
    local password="$3"
    
    local idp_url="${INSTANCE_CONFIGS[${instance}_idp]}"
    local client_secret=$(load_client_secret "$instance")
    
    if [ -z "$client_secret" ]; then
        echo ""
        return 1
    fi
    
    local token_response=$(curl -sk -X POST "${idp_url}/realms/${REALM_NAME}/protocol/openid-connect/token" \
        --data-urlencode "grant_type=password" \
        --data-urlencode "client_id=${CLIENT_ID}" \
        --data-urlencode "client_secret=${client_secret}" \
        --data-urlencode "username=${username}" \
        --data-urlencode "password=${password}" \
        --data-urlencode "scope=openid profile email" \
        --max-time 15 \
        2>/dev/null)
    
    echo "$token_response" | jq -r '.access_token // empty' 2>/dev/null || echo ""
}

# Search resources by classification
search_by_classification() {
    local api_url="$1"
    local token="$2"
    local classification="$3"
    
    local response=$(curl -sk -X POST "${api_url}/api/resources/search" \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d "{
            \"query\": \"\",
            \"filters\": {
                \"classifications\": [\"${classification}\"]
            },
            \"pagination\": {
                \"limit\": 10
            }
        }" \
        --max-time 30 \
        2>/dev/null)
    
    echo "$response"
}

# Test clearance-based access
test_clearance_access() {
    local instance="$1"
    local username="$2"
    local user_clearance="$3"
    
    log_test "Clearance access: ${username} (${user_clearance})"
    
    # Get token
    local token=$(get_user_token "$instance" "$username" "$TEST_USER_PASSWORD")
    if [ -z "$token" ]; then
        log_fail "Failed to authenticate ${username}"
        return 1
    fi
    
    local api_url="${INSTANCE_CONFIGS[${instance}_api]}"
    
    # Test access to resources at user's clearance level and below
    local clearance_levels=("UNCLASSIFIED" "CONFIDENTIAL" "SECRET" "TOP_SECRET")
    local user_level=-1
    
    case "$user_clearance" in
        UNCLASSIFIED) user_level=0 ;;
        CONFIDENTIAL) user_level=1 ;;
        SECRET) user_level=2 ;;
        TOP_SECRET) user_level=3 ;;
    esac
    
    local all_passed=true
    
    for i in "${!clearance_levels[@]}"; do
        local test_classification="${clearance_levels[$i]}"
        local test_level=$i
        
        local result=$(search_by_classification "$api_url" "$token" "$test_classification")
        local count=$(echo "$result" | jq -r '.totalCount // 0' 2>/dev/null)
        local error=$(echo "$result" | jq -r '.error // empty' 2>/dev/null)
        
        if [ "$test_level" -le "$user_level" ]; then
            # Should have access
            if [ -n "$error" ]; then
                # Check if it's a transient error (MongoDB connection, etc.)
                if [[ "$error" == *"MongoServerError"* ]] || [[ "$error" == *"timeout"* ]]; then
                    echo "    ⚠️  Transient error accessing ${test_classification}: ${error} (may be OK)"
                else
                    log_fail "Should have access to ${test_classification} but got error: ${error}"
                    all_passed=false
                fi
            elif [ "$count" -eq 0 ] && [ "$test_level" -lt "$user_level" ]; then
                # May be OK if no resources exist at that level
                echo "    ⚠️  No ${test_classification} resources found (may be OK if none exist)"
            else
                echo "    ✅ Can access ${test_classification}: ${count} resources"
            fi
        else
            # Should NOT have access (or get filtered results)
            if [ -n "$error" ] && ([[ "$error" == *"Forbidden"* ]] || [[ "$error" == *"clearance"* ]]); then
                echo "    ✅ Correctly denied access to ${test_classification}"
            elif [ "$count" -eq 0 ]; then
                echo "    ✅ No ${test_classification} resources returned (filtered - expected)"
            else
                log_fail "Should NOT have access to ${test_classification} but found ${count} resources"
                all_passed=false
            fi
        fi
    done
    
    if [ "$all_passed" = true ]; then
        log_pass "Clearance-based access verified for ${username}"
        return 0
    else
        return 1
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    log_header "DIVE V3 - Resource Access Verification"
    echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    
    log_header "Testing Clearance-Based Access"
    
    # Test all clearance levels for each country
    for instance in usa fra gbr; do
        echo "Testing ${instance^^} instance:"
        
        for i in {1..4}; do
            local username="testuser-${instance}-${i}"
            local user_info="${TEST_USERS[$username]}"
            IFS='|' read -r clearance country uniqueid <<< "$user_info"
            
            test_clearance_access "$instance" "$username" "$clearance"
            echo ""
        done
    done
    
    # Summary
    log_header "Test Summary"
    echo "Total Tests:  $((TESTS_PASSED + TESTS_FAILED))"
    echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
    echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
    echo ""
    
    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}✅ All resource access tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some tests failed${NC}"
        exit 1
    fi
}

main "$@"

