#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Comprehensive Federation Verification
# =============================================================================
# Tests federation authentication and resource access across all instances
# with all clearance levels and countries.
#
# Test Matrix:
#   - 4 Clearance Levels: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET
#   - 4 Countries: USA, FRA, GBR, DEU
#   - Cross-instance authentication and resource access
#
# Usage:
#   ./scripts/tests/verify-comprehensive-federation.sh [--instance INST] [--clearance LEVEL]
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
MAGENTA='\033[0;35m'
NC='\033[0m'

# Configuration
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
# Note: DEU uses prosecurity.biz domain, not dive25.com

# Test users matrix: username -> "clearance|country|uniqueID"
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
TESTS_SKIPPED=0

# Filters
INSTANCE_FILTER=""
CLEARANCE_FILTER=""

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

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((TESTS_SKIPPED++))
}

log_info() {
    echo -e "${MAGENTA}[INFO]${NC} $1"
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

# Decode JWT to verify claims
decode_jwt_payload() {
    local token="$1"
    local payload=$(echo "$token" | cut -d. -f2)
    # Add padding if needed
    local padding=$((4 - ${#payload} % 4))
    if [ $padding -ne 4 ]; then
        payload="${payload}$(printf '%*s' $padding | tr ' ' '=')"
    fi
    echo "$payload" | base64 -d 2>/dev/null | jq '.' 2>/dev/null || echo "{}"
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

# Test authentication on one instance and access resources on another
test_federated_authentication() {
    local auth_instance="$1"
    local username="$2"
    local access_instance="$3"
    local expected_clearance="$4"
    local expected_country="$5"
    
    log_test "Federation Auth: ${username} (${expected_clearance}, ${expected_country}) authenticates on ${auth_instance^^}, accesses ${access_instance^^}"
    
    # Step 1: Authenticate on auth_instance
    local token=$(get_user_token "$auth_instance" "$username" "$TEST_USER_PASSWORD")
    if [ -z "$token" ]; then
        log_fail "Failed to authenticate ${username} on ${auth_instance^^}"
        return 1
    fi
    
    # Step 2: Verify token claims
    local claims=$(decode_jwt_payload "$token")
    local token_clearance=$(echo "$claims" | jq -r '.clearance // ""' 2>/dev/null)
    local token_country=$(echo "$claims" | jq -r '.countryOfAffiliation // ""' 2>/dev/null)
    local token_uniqueid=$(echo "$claims" | jq -r '.uniqueID // ""' 2>/dev/null)
    
    if [ "$token_clearance" != "$expected_clearance" ]; then
        log_fail "Token clearance mismatch: expected ${expected_clearance}, got ${token_clearance}"
        return 1
    fi
    
    if [ "$token_country" != "$expected_country" ]; then
        log_fail "Token country mismatch: expected ${expected_country}, got ${token_country}"
        return 1
    fi
    
    log_info "Token verified: clearance=${token_clearance}, country=${token_country}, uniqueID=${token_uniqueid}"
    
    # Step 3: Access resources on access_instance using token from auth_instance
    local api_url="${INSTANCE_CONFIGS[${access_instance}_api]}"
    local search_result=$(federated_search "$api_url" "$token" "${access_instance}")
    
    # Check if search succeeded
    local error=$(echo "$search_result" | jq -r '.error // empty' 2>/dev/null)
    if [ -n "$error" ]; then
        log_fail "Federated access failed: ${error}"
        return 1
    fi
    
    # Extract results
    local total_count=$(echo "$search_result" | jq -r '.totalResults // .totalAccessible // 0' 2>/dev/null)
    local results=$(echo "$search_result" | jq -r '.results | length' 2>/dev/null)
    
    if [ "$total_count" -gt 0 ] || [ "$results" -gt 0 ]; then
        log_pass "Federated access successful: ${total_count} accessible resources on ${access_instance^^} using token from ${auth_instance^^}"
        return 0
    else
        log_fail "No resources found (may be expected based on clearance/releasability)"
        return 1
    fi
}

# Test cross-instance federated search
test_cross_instance_search() {
    local instance="$1"
    local username="$2"
    local expected_clearance="$3"
    local expected_country="$4"
    
    log_test "Cross-Instance Search: ${username} (${expected_clearance}, ${expected_country}) on ${instance^^} searches all instances"
    
    # Get token
    local token=$(get_user_token "$instance" "$username" "$TEST_USER_PASSWORD")
    if [ -z "$token" ]; then
        log_fail "Failed to authenticate ${username}"
        return 1
    fi
    
    # Perform federated search across all instances
    local api_url="${INSTANCE_CONFIGS[${instance}_api]}"
    local search_result=$(federated_search "$api_url" "$token" "USA,FRA,GBR,DEU")
    
    # Check if search succeeded
    local error=$(echo "$search_result" | jq -r '.error // empty' 2>/dev/null)
    if [ -n "$error" ]; then
        log_fail "Federated search failed: ${error}"
        return 1
    fi
    
    # Extract results
    local total_count=$(echo "$search_result" | jq -r '.totalResults // .totalAccessible // 0' 2>/dev/null)
    local results=$(echo "$search_result" | jq -r '.results | length' 2>/dev/null)
    local instance_results=$(echo "$search_result" | jq -r '.instanceResults // {}' 2>/dev/null)
    
    if [ "$total_count" -gt 0 ] || [ "$results" -gt 0 ]; then
        log_pass "Found ${total_count} accessible resources across all instances"
        
        # Show instance breakdown
        if [ -n "$instance_results" ] && [ "$instance_results" != "{}" ]; then
            echo "    Instance breakdown:"
            echo "$instance_results" | jq -r 'to_entries[] | "      \(.key): \(.value.totalCount // 0) resources"' 2>/dev/null || true
        fi
        
        return 0
    else
        log_fail "No resources found (may be expected based on clearance/releasability)"
        return 1
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    log_header "DIVE V3 - Comprehensive Federation Verification"
    echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    echo "Test Matrix:"
    echo "  - Clearance Levels: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET"
    echo "  - Countries: USA, FRA, GBR, DEU"
    echo "  - Total Test Users: 16"
    echo ""
    
    # Test 1: Authentication on each instance
    log_header "Test 1: Authentication Verification (All Clearance Levels × All Countries)"
    
    for instance in usa fra gbr deu; do
        if [[ -n "$INSTANCE_FILTER" && "$instance" != "$INSTANCE_FILTER" ]]; then
            continue
        fi
        
        echo ""
        echo "Testing ${instance^^} instance authentication:"
        
        for i in {1..4}; do
            local username="testuser-${instance}-${i}"
            local user_info="${TEST_USERS[$username]}"
            IFS='|' read -r clearance country uniqueid <<< "$user_info"
            
            if [[ -n "$CLEARANCE_FILTER" && "$clearance" != "$CLEARANCE_FILTER" ]]; then
                continue
            fi
            
            log_test "  ${username} (${clearance}, ${country})"
            
            local token=$(get_user_token "$instance" "$username" "$TEST_USER_PASSWORD")
            if [ -z "$token" ]; then
                log_fail "    Authentication failed"
            else
                local claims=$(decode_jwt_payload "$token")
                local token_clearance=$(echo "$claims" | jq -r '.clearance // ""' 2>/dev/null)
                local token_country=$(echo "$claims" | jq -r '.countryOfAffiliation // ""' 2>/dev/null)
                
                if [ "$token_clearance" = "$clearance" ] && [ "$token_country" = "$country" ]; then
                    log_pass "    Authentication successful (clearance=${token_clearance}, country=${token_country})"
                else
                    log_fail "    Token claims mismatch: expected clearance=${clearance}, country=${country}, got clearance=${token_clearance}, country=${token_country}"
                fi
            fi
        done
    done
    
    # Test 2: Cross-instance federated search
    log_header "Test 2: Cross-Instance Federated Search"
    
    # Test with representative users from each country and clearance level
    for instance in usa fra gbr; do
        if [[ -n "$INSTANCE_FILTER" && "$instance" != "$INSTANCE_FILTER" ]]; then
            continue
        fi
        
        # Test with SECRET clearance (should have good access)
        local username="testuser-${instance}-3"  # SECRET clearance
        local user_info="${TEST_USERS[$username]}"
        IFS='|' read -r clearance country uniqueid <<< "$user_info"
        
        test_cross_instance_search "$instance" "$username" "$clearance" "$country"
        echo ""
    done
    
    # Test 3: Federated authentication (authenticate on one instance, access another)
    log_header "Test 3: Federated Authentication (Cross-Instance Token Usage)"
    
    # Test: Authenticate on USA, access FRA resources
    test_federated_authentication "usa" "testuser-usa-3" "fra" "SECRET" "USA"
    echo ""
    
    # Test: Authenticate on FRA, access GBR resources
    test_federated_authentication "fra" "testuser-fra-3" "gbr" "SECRET" "FRA"
    echo ""
    
    # Test: Authenticate on GBR, access USA resources
    test_federated_authentication "gbr" "testuser-gbr-3" "usa" "SECRET" "GBR"
    echo ""
    
    # Summary
    log_header "Test Summary"
    echo "Total Tests:  $((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))"
    echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
    echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
    echo -e "${YELLOW}Skipped:      $TESTS_SKIPPED${NC}"
    echo ""
    
    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}✅ All federation tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some tests failed${NC}"
        exit 1
    fi
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --instance)
            INSTANCE_FILTER="$2"
            shift 2
            ;;
        --clearance)
            CLEARANCE_FILTER="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--instance INST] [--clearance LEVEL]"
            exit 1
            ;;
    esac
done

main

