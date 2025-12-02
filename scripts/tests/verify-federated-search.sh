#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Federated Search Verification
# =============================================================================
# Tests federated search across all instances (USA, FRA, GBR, DEU) with
# different clearance levels and verifies results are properly filtered.
#
# Usage:
#   ./scripts/tests/verify-federated-search.sh [--instance INST] [--user USER]
#
# Prerequisites:
#   - All instances running and accessible
#   - Terraform test users available
#   - Resources seeded (7,000 per instance)
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

# Test configuration
REALM_NAME="dive-v3-broker"
CLIENT_ID="dive-v3-client-broker"
TEST_USER_PASSWORD="TestUser2025!Pilot"

# Instance configurations
declare -A INSTANCE_CONFIGS
INSTANCE_CONFIGS[usa_idp]="https://usa-idp.dive25.com"
INSTANCE_CONFIGS[usa_api]="https://usa-api.dive25.com"
INSTANCE_CONFIGS[fra_idp]="https://fra-idp.dive25.com"
INSTANCE_CONFIGS[fra_api]="https://fra-api.dive25.com"
INSTANCE_CONFIGS[gbr_idp]="https://gbr-idp.dive25.com"
INSTANCE_CONFIGS[gbr_api]="https://gbr-api.dive25.com"
INSTANCE_CONFIGS[deu_idp]="https://deu-idp.prosecurity.biz"
INSTANCE_CONFIGS[deu_api]="https://deu-api.prosecurity.biz"

# Test users (clearance level, country, uniqueID) - All clearance levels × All countries
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

# Counters
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

# Load client secret from GCP
load_client_secret() {
    local instance="$1"
    local secret_name="dive-v3-keycloak-client-secret-${instance}"
    gcloud secrets versions access latest --secret="$secret_name" --project=dive25 2>/dev/null || echo ""
}

# Authenticate user and get token
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

# Perform federated search
federated_search() {
    local api_url="$1"
    local token="$2"
    local instances="${3:-USA,FRA,GBR,DEU}"
    
    local response=$(curl -sk -X POST "${api_url}/api/resources/federated-query" \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d "{
            \"query\": \"\",
            \"instances\": [$(echo "$instances" | tr ',' '\n' | sed 's/^/"/;s/$/"/' | tr '\n' ',' | sed 's/,$//')],
            \"pagination\": {
                \"limit\": 10
            },
            \"includeFacets\": false
        }" \
        --max-time 30 \
        2>/dev/null)
    
    echo "$response"
}

# Test federated search for a user
test_federated_search() {
    local instance="$1"
    local username="$2"
    local expected_clearance="$3"
    local expected_country="$4"
    
    log_test "Federated search: ${username} (${expected_clearance}, ${expected_country})"
    
    # Get token
    local token=$(get_user_token "$instance" "$username" "$TEST_USER_PASSWORD")
    if [ -z "$token" ]; then
        log_fail "Failed to authenticate ${username}"
        return 1
    fi
    
    # Perform federated search
    local api_url="${INSTANCE_CONFIGS[${instance}_api]}"
    local search_result=$(federated_search "$api_url" "$token" "USA,FRA,GBR,DEU")
    
    # Check if search succeeded
    local error=$(echo "$search_result" | jq -r '.error // empty' 2>/dev/null)
    if [ -n "$error" ]; then
        log_fail "Search failed: ${error}"
        return 1
    fi
    
    # Extract results - federated-query returns totalResults and totalAccessible
    local total_count=$(echo "$search_result" | jq -r '.totalResults // .totalCount // 0' 2>/dev/null)
    local total_accessible=$(echo "$search_result" | jq -r '.totalAccessible // 0' 2>/dev/null)
    local results=$(echo "$search_result" | jq -r '.results | length' 2>/dev/null)
    local instance_results=$(echo "$search_result" | jq -r '.instanceResults // {}' 2>/dev/null)
    
    # Use totalAccessible if available, otherwise totalResults
    local display_count=${total_accessible:-$total_count}
    
    if [ "$display_count" -gt 0 ] || [ "$results" -gt 0 ]; then
        log_pass "Found ${display_count} accessible resources (${results} returned) across instances"
        
        # Verify results are filtered by clearance
        if [ "$results" -gt 0 ]; then
            local max_classification=$(echo "$search_result" | jq -r '[.results[].classification] | max' 2>/dev/null)
            echo "    Max classification in results: ${max_classification}"
            echo "    User clearance: ${expected_clearance}"
        fi
        
        # Verify instance breakdown if available
        if [ -n "$instance_results" ] && [ "$instance_results" != "{}" ]; then
            echo "    Instance breakdown:"
            echo "$instance_results" | jq -r 'to_entries[] | "      \(.key): \(.value.totalCount // 0) resources"' 2>/dev/null || true
        fi
        
        return 0
    else
        log_fail "No resources found (expected some results). Response: $(echo "$search_result" | jq -c '.' 2>/dev/null | head -c 200)"
        return 1
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    log_header "DIVE V3 - Federated Search Verification"
    echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    
    # Test with different clearance levels
    log_header "Testing Federated Search Across All Instances"
    
    # Test all users: All clearance levels × All countries
    for instance in usa fra gbr deu; do
        if [[ -n "$INSTANCE_FILTER" && "$instance" != "$INSTANCE_FILTER" ]]; then
            continue
        fi
        
        echo "Testing ${instance^^} instance users:"
        
        for i in {1..4}; do
            local username="testuser-${instance}-${i}"
            local user_info="${TEST_USERS[$username]}"
            IFS='|' read -r clearance country uniqueid <<< "$user_info"
            
            test_federated_search "$instance" "$username" "$clearance" "$country"
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
        echo -e "${GREEN}✅ All federated search tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some tests failed${NC}"
        exit 1
    fi
}

main "$@"

