#!/usr/bin/env sh
# =============================================================================
# DIVE V3 - DEU Remote Instance Verification
# =============================================================================
# Runs comprehensive tests on DEU remote instance using correct domain
# (prosecurity.biz) and local endpoints.
#
# This script runs ON the DEU server and tests:
# - Authentication for all DEU users (all clearance levels)
# - Local resource access
# - Federation authentication (DEU → other instances)
# - Cross-instance federated search
#
# Usage:
#   Run via: ./scripts/tests/run-deu-tests-remote.sh verify-deu-remote.sh
#   Or directly on DEU server: ./scripts/tests/verify-deu-remote.sh
# =============================================================================

set -e

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

# Configuration - DEU uses prosecurity.biz domain
REALM_NAME="dive-v3-broker"
CLIENT_ID="dive-v3-client-broker"
TEST_USER_PASSWORD="TestUser2025!Pilot"

# DEU instance configuration (local endpoints on remote server)
DEU_IDP="https://deu-idp.prosecurity.biz"
DEU_API="https://deu-api.prosecurity.biz"

# Other instances (for federation testing)
USA_IDP="https://usa-idp.dive25.com"
USA_API="https://usa-api.dive25.com"
FRA_IDP="https://fra-idp.dive25.com"
FRA_API="https://fra-api.dive25.com"
GBR_IDP="https://gbr-idp.dive25.com"
GBR_API="https://gbr-api.dive25.com"

PASSED=0
FAILED=0

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
    PASSED=$((PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAILED=$((FAILED + 1))
}

# Load client secret from GCP
# Try multiple methods: Python script, gcloud CLI, or environment variable
load_client_secret() {
    local secret_name="dive-v3-keycloak-client-secret-deu"
    
    # Method 1: Try Python script (backend container has Python)
    local python_script="/tmp/load-deu-gcp-secret.py"
    local gcp_key_file="/tmp/deu-sa-key.json"
    if [ -f "$python_script" ] && [ -f "$gcp_key_file" ] && command -v python3 >/dev/null 2>&1; then
        local secret=$(python3 "$python_script" "$secret_name" "$gcp_key_file" 2>/dev/null)
        if [ -n "$secret" ]; then
            echo "$secret"
            return 0
        fi
    fi
    
    # Method 2: Try gcloud CLI if available (check both standard path and /tmp)
    local gcloud_path=""
    if command -v gcloud >/dev/null 2>&1; then
        gcloud_path="gcloud"
    elif [ -f "/tmp/google-cloud-sdk/bin/gcloud" ]; then
        gcloud_path="/tmp/google-cloud-sdk/bin/gcloud"
    fi
    
    if [ -n "$gcloud_path" ]; then
        local secret=$($gcloud_path secrets versions access latest --secret="$secret_name" --project=dive25 2>/dev/null)
        if [ -n "$secret" ]; then
            echo "$secret"
            return 0
        fi
    fi
    
    # Method 3: Try with GCP key file authentication (if gcloud available)
    if [ -f "$gcp_key_file" ] && [ -n "$gcloud_path" ]; then
        export GOOGLE_APPLICATION_CREDENTIALS="$gcp_key_file"
        $gcloud_path auth activate-service-account --key-file="$gcp_key_file" >/dev/null 2>&1
        local secret=$($gcloud_path secrets versions access latest --secret="$secret_name" --project=dive25 2>/dev/null)
        if [ -n "$secret" ]; then
            echo "$secret"
            return 0
        fi
    fi
    
    # Method 4: Try from environment variable (may be set by sync-gcp-secrets.sh)
    if [ -n "${KEYCLOAK_CLIENT_SECRET_DEU:-}" ]; then
        echo "$KEYCLOAK_CLIENT_SECRET_DEU"
        return 0
    fi
    
    echo ""
    return 1
}

# Get user token
get_user_token() {
    local username="$1"
    local password="$2"
    
    local client_secret=$(load_client_secret)
    
    if [ -z "$client_secret" ]; then
        echo ""
        return 1
    fi
    
    local token_response=$(curl -sk -X POST "${DEU_IDP}/realms/${REALM_NAME}/protocol/openid-connect/token" \
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

# Decode JWT payload
decode_jwt_payload() {
    local token="$1"
    local payload=$(echo "$token" | cut -d. -f2)
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

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    log_header "DIVE V3 - DEU Remote Instance Verification"
    echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Domain: prosecurity.biz"
    echo "Instance: DEU (Remote)"
    echo ""
    
    # Test 1: Authentication for all DEU users
    log_header "Test 1: DEU Authentication (All Clearance Levels)"
    
    for i in 1 2 3 4; do
        local username="testuser-deu-${i}"
        case $i in
            1) local clearance="UNCLASSIFIED" ;;
            2) local clearance="CONFIDENTIAL" ;;
            3) local clearance="SECRET" ;;
            4) local clearance="TOP_SECRET" ;;
        esac
        local country="DEU"
        local uniqueid="$username"
        
        log_test "${username} (${clearance}, ${country})"
        
        local token=$(get_user_token "$username" "$TEST_USER_PASSWORD")
        if [ -z "$token" ]; then
            log_fail "Authentication failed"
            continue
        fi
        
        local claims=$(decode_jwt_payload "$token")
        local token_clearance=$(echo "$claims" | jq -r '.clearance // ""' 2>/dev/null)
        local token_country=$(echo "$claims" | jq -r '.countryOfAffiliation // ""' 2>/dev/null)
        
        if [ "$token_clearance" = "$clearance" ] && [ "$token_country" = "$country" ]; then
            log_pass "Authentication successful (clearance=${token_clearance}, country=${token_country})"
        else
            log_fail "Token claims mismatch: expected clearance=${clearance}, country=${country}, got clearance=${token_clearance}, country=${token_country}"
        fi
    done
    echo ""
    
    # Test 2: Local resource access
    log_header "Test 2: DEU Local Resource Access"
    
    local username="testuser-deu-3"  # SECRET clearance
    local token=$(get_user_token "$username" "$TEST_USER_PASSWORD")
    
    if [ -n "$token" ]; then
        log_test "Searching DEU local resources"
        local search_result=$(federated_search "${DEU_API}" "$token" "DEU")
        local total=$(echo "$search_result" | jq -r '.totalAccessible // .totalResults // 0' 2>/dev/null)
        local instance_count=$(echo "$search_result" | jq -r '.instanceResults.DEU.accessibleCount // .instanceResults.DEU.count // 0' 2>/dev/null)
        
        if [ "$total" -gt 0 ] || [ "$instance_count" -gt 0 ]; then
            local display_count=$([ "$instance_count" -gt 0 ] && echo "$instance_count" || echo "$total")
            log_pass "Found ${display_count} accessible resources on DEU (totalAccessible: ${total})"
        else
            log_fail "No resources found"
        fi
    else
        log_fail "Failed to get token"
    fi
    echo ""
    
    # Test 3: Federation authentication (DEU → other instances)
    log_header "Test 3: Federation Authentication (DEU → Other Instances)"
    
    local username="testuser-deu-3"
    local token=$(get_user_token "$username" "$TEST_USER_PASSWORD")
    
    if [ -n "$token" ]; then
        # Test DEU → USA
        log_test "DEU token → USA resources"
        local usa_result=$(curl -sk -X POST "${USA_API}/api/resources/federated-query" \
            -H "Authorization: Bearer ${token}" \
            -H "Content-Type: application/json" \
            -d '{"query":"","instances":["USA"],"pagination":{"limit":5}}' \
            --max-time 30 2>/dev/null)
        local usa_total=$(echo "$usa_result" | jq -r '.totalAccessible // .totalResults // 0' 2>/dev/null)
        local usa_instance=$(echo "$usa_result" | jq -r '.instanceResults.USA.accessibleCount // .instanceResults.USA.count // 0' 2>/dev/null)
        local usa_display=$([ "$usa_instance" -gt 0 ] && echo "$usa_instance" || echo "$usa_total")
        
        if [ "$usa_total" -gt 0 ] || [ "$usa_instance" -gt 0 ]; then
            log_pass "Accessed ${usa_display} resources on USA using DEU token (totalAccessible: ${usa_total})"
        else
            log_fail "No resources accessed (may be expected based on releasability)"
        fi
        
        # Test DEU → FRA
        log_test "DEU token → FRA resources"
        local fra_result=$(curl -sk -X POST "${FRA_API}/api/resources/federated-query" \
            -H "Authorization: Bearer ${token}" \
            -H "Content-Type: application/json" \
            -d '{"query":"","instances":["FRA"],"pagination":{"limit":5}}' \
            --max-time 30 2>/dev/null)
        local fra_total=$(echo "$fra_result" | jq -r '.totalAccessible // .totalResults // 0' 2>/dev/null)
        local fra_instance=$(echo "$fra_result" | jq -r '.instanceResults.FRA.accessibleCount // .instanceResults.FRA.count // 0' 2>/dev/null)
        local fra_display=$([ "$fra_instance" -gt 0 ] && echo "$fra_instance" || echo "$fra_total")
        
        if [ "$fra_total" -gt 0 ] || [ "$fra_instance" -gt 0 ]; then
            log_pass "Accessed ${fra_display} resources on FRA using DEU token (totalAccessible: ${fra_total})"
        else
            log_fail "No resources accessed (may be expected based on releasability)"
        fi
    else
        log_fail "Failed to get token"
    fi
    echo ""
    
    # Test 4: Cross-instance federated search from DEU
    log_header "Test 4: Cross-Instance Federated Search (DEU user)"
    
    local username="testuser-deu-3"
    local token=$(get_user_token "$username" "$TEST_USER_PASSWORD")
    
    if [ -n "$token" ]; then
        log_test "DEU user searching all instances"
        local fed_result=$(federated_search "${DEU_API}" "$token" "USA,FRA,GBR,DEU")
        local total=$(echo "$fed_result" | jq -r '.totalAccessible // .totalResults // 0' 2>/dev/null)
        local instance_results=$(echo "$fed_result" | jq -r '.instanceResults // {}' 2>/dev/null)
        
        # Calculate sum of accessibleCount from all instances
        local sum_accessible=$(echo "$fed_result" | jq '[.instanceResults[]?.accessibleCount // 0] | add // 0' 2>/dev/null)
        local display_total=$([ "$sum_accessible" -gt 0 ] && echo "$sum_accessible" || echo "$total")
        
        if [ "$total" -gt 0 ] || [ "$sum_accessible" -gt 0 ]; then
            log_pass "Found ${display_total} accessible resources across all instances (totalAccessible: ${total})"
            if [ -n "$instance_results" ] && [ "$instance_results" != "{}" ]; then
                echo "  Instance breakdown:"
                echo "$instance_results" | jq -r 'to_entries[] | "    \(.key): \(.value.accessibleCount // .value.count // 0) accessible resources"' 2>/dev/null || true
            fi
        else
            log_fail "No resources found"
        fi
    else
        log_fail "Failed to get token"
    fi
    echo ""
    
    # Summary
    log_header "Test Summary"
    local total=$((PASSED + FAILED))
    echo "Total Tests:  $total"
    echo -e "${GREEN}Passed:       $PASSED${NC}"
    echo -e "${RED}Failed:       $FAILED${NC}"
    echo ""
    
    if [ "$FAILED" -eq 0 ]; then
        echo -e "${GREEN}✅ All DEU remote tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some tests failed${NC}"
        exit 1
    fi
}

main "$@"

