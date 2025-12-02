#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - E2E Terraform User Login Verification Script
# =============================================================================
# Verifies all Terraform-created test users can authenticate and login
# successfully on all instances (USA, FRA, GBR, DEU).
#
# Usage:
#   ./scripts/tests/e2e-verify-terraform-logins.sh [options]
#
# Options:
#   --instance INSTANCE    Test specific instance only (usa|fra|gbr|deu)
#   --user USER           Test specific user only (e.g., testuser-usa-1)
#   --verbose             Show detailed token claims
#   --api-test            Also test API access with tokens
#
# Examples:
#   ./scripts/tests/e2e-verify-terraform-logins.sh
#   ./scripts/tests/e2e-verify-terraform-logins.sh --instance usa
#   ./scripts/tests/e2e-verify-terraform-logins.sh --user testuser-fra-3
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Counters
TOTAL_TESTS=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Options
INSTANCE_FILTER=""
USER_FILTER=""
VERBOSE=false
API_TEST=false

# =============================================================================
# PARSE ARGUMENTS
# =============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --instance)
            INSTANCE_FILTER="$2"
            shift 2
            ;;
        --user)
            USER_FILTER="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --api-test)
            API_TEST=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--instance INSTANCE] [--user USER] [--verbose] [--api-test]"
            exit 1
            ;;
    esac
done

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
    ((TOTAL_TESTS++))
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

# =============================================================================
# INSTANCE CONFIGURATION
# =============================================================================

declare -A INSTANCE_CONFIGS

INSTANCE_CONFIGS[usa_idp]="https://usa-idp.dive25.com"
INSTANCE_CONFIGS[usa_api]="https://usa-api.dive25.com"
INSTANCE_CONFIGS[usa_app]="https://usa-app.dive25.com"
INSTANCE_CONFIGS[usa_code]="usa"

INSTANCE_CONFIGS[fra_idp]="https://fra-idp.dive25.com"
INSTANCE_CONFIGS[fra_api]="https://fra-api.dive25.com"
INSTANCE_CONFIGS[fra_app]="https://fra-app.dive25.com"
INSTANCE_CONFIGS[fra_code]="fra"

INSTANCE_CONFIGS[gbr_idp]="https://gbr-idp.dive25.com"
INSTANCE_CONFIGS[gbr_api]="https://gbr-api.dive25.com"
INSTANCE_CONFIGS[gbr_app]="https://gbr-app.dive25.com"
INSTANCE_CONFIGS[gbr_code]="gbr"

INSTANCE_CONFIGS[deu_idp]="https://deu-idp.prosecurity.biz"
INSTANCE_CONFIGS[deu_api]="https://deu-api.prosecurity.biz"
INSTANCE_CONFIGS[deu_app]="https://deu-app.prosecurity.biz"
INSTANCE_CONFIGS[deu_code]="deu"

# Terraform test user password (from terraform/modules/federated-instance/test-users.tf)
TERRAFORM_PASSWORD="TestUser2025!Pilot"

# OIDC Configuration
REALM_NAME="dive-v3-broker"
CLIENT_ID="dive-v3-client-broker"

# =============================================================================
# LOAD CLIENT SECRETS FROM GCP
# =============================================================================

load_client_secrets() {
    log_header "Loading Client Secrets from GCP Secret Manager"
    
    # Check if gcloud is available
    if ! command -v gcloud &> /dev/null; then
        log_fail "gcloud CLI not found. Cannot load client secrets."
        return 1
    fi
    
    # Check authentication
    if ! gcloud auth print-access-token &>/dev/null; then
        log_fail "Not authenticated with GCP. Run: gcloud auth login"
        return 1
    fi
    
    # Load secrets for each instance
    for instance in usa fra gbr deu; do
        local secret_name="dive-v3-keycloak-client-secret-${instance}"
        local var_name="KEYCLOAK_CLIENT_SECRET_$(echo "$instance" | tr '[:lower:]' '[:upper:]')"
        
        local secret_value=$(gcloud secrets versions access latest --secret="$secret_name" --project=dive25 2>/dev/null || echo "")
        
        if [[ -n "$secret_value" ]]; then
            export "$var_name"="$secret_value"
            log_pass "Loaded client secret for ${instance^^}"
        else
            log_skip "Client secret not found for ${instance^^} (may use public client)"
        fi
    done
    
    echo ""
}

# =============================================================================
# JWT DECODING UTILITIES
# =============================================================================

decode_jwt_payload() {
    local token="$1"
    local payload=$(echo "$token" | cut -d'.' -f2)
    
    # Add padding if needed
    local padding=$((4 - ${#payload} % 4))
    if [[ $padding -ne 4 ]]; then
        payload="${payload}$(printf '%*s' $padding | tr ' ' '=')"
    fi
    
    echo "$payload" | base64 -d 2>/dev/null || echo "{}"
}

# =============================================================================
# AUTHENTICATION TEST
# =============================================================================

test_user_login() {
    local instance="$1"
    local username="$2"
    local password="$3"
    
    local idp_url="${INSTANCE_CONFIGS[${instance}_idp]}"
    local api_url="${INSTANCE_CONFIGS[${instance}_api]}"
    local instance_code="${INSTANCE_CONFIGS[${instance}_code]}"
    
    local token_url="${idp_url}/realms/${REALM_NAME}/protocol/openid-connect/token"
    local client_secret_var="KEYCLOAK_CLIENT_SECRET_$(echo "$instance" | tr '[:lower:]' '[:upper:]')"
    local client_secret="${!client_secret_var:-}"
    
    log_test "Login: ${username} on ${instance^^} instance"
    
    # Request token with proper URL encoding for special characters
    # Use --data-urlencode to handle special characters in client_secret (e.g., /, +, =)
    local curl_args=(
        -sk
        -X POST
        "$token_url"
        --data-urlencode "grant_type=password"
        --data-urlencode "client_id=${CLIENT_ID}"
        --data-urlencode "username=${username}"
        --data-urlencode "password=${password}"
        --data-urlencode "scope=openid profile email"
        --max-time 15
    )
    
    # Add client secret if available (must use --data-urlencode for special chars)
    if [[ -n "$client_secret" ]]; then
        curl_args+=(--data-urlencode "client_secret=${client_secret}")
    fi
    
    # Request token
    local token_response=$(curl "${curl_args[@]}" 2>/dev/null)
    
    # Check for errors
    if echo "$token_response" | jq -e '.error' >/dev/null 2>&1; then
        local error=$(echo "$token_response" | jq -r '.error // "unknown"')
        local error_desc=$(echo "$token_response" | jq -r '.error_description // ""')
        log_fail "${username} on ${instance^^}: ${error}${error_desc:+ - $error_desc}"
        return 1
    fi
    
    # Extract access token
    local access_token=$(echo "$token_response" | jq -r '.access_token // empty')
    
    if [[ -z "$access_token" || "$access_token" == "null" ]]; then
        log_fail "${username} on ${instance^^}: No access token in response"
        return 1
    fi
    
    log_pass "${username} on ${instance^^}: Authentication successful"
    
    # Decode and verify token claims
    local payload=$(decode_jwt_payload "$access_token")
    
    if [[ "$VERBOSE" == "true" ]]; then
        echo ""
        log_info "Token Claims for ${username}:"
        echo "$payload" | jq '.' 2>/dev/null || echo "$payload"
        echo ""
    fi
    
    # Verify expected claims
    local expected_clearance=""
    case "$username" in
        *-1) expected_clearance="UNCLASSIFIED" ;;
        *-2) expected_clearance="CONFIDENTIAL" ;;
        *-3) expected_clearance="SECRET" ;;
        *-4) expected_clearance="TOP_SECRET" ;;
    esac
    
    if [[ -n "$expected_clearance" ]]; then
        local actual_clearance=$(echo "$payload" | jq -r '.clearance // empty' 2>/dev/null)
        if [[ "$actual_clearance" == "$expected_clearance" ]]; then
            log_pass "${username}: Clearance claim correct (${expected_clearance})"
        else
            log_fail "${username}: Clearance mismatch (expected: ${expected_clearance}, got: ${actual_clearance})"
        fi
    fi
    
    # Verify countryOfAffiliation
    local expected_country=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
    local actual_country=$(echo "$payload" | jq -r '.countryOfAffiliation // empty' 2>/dev/null)
    if [[ "$actual_country" == "$expected_country" ]]; then
        log_pass "${username}: Country claim correct (${expected_country})"
    else
        log_fail "${username}: Country mismatch (expected: ${expected_country}, got: ${actual_country})"
    fi
    
    # Verify uniqueID
    local expected_uniqueid="$username"
    local actual_uniqueid=$(echo "$payload" | jq -r '.uniqueID // empty' 2>/dev/null)
    if [[ "$actual_uniqueid" == "$expected_uniqueid" ]]; then
        log_pass "${username}: uniqueID claim correct"
    else
        log_fail "${username}: uniqueID mismatch (expected: ${expected_uniqueid}, got: ${actual_uniqueid})"
    fi
    
    # Test API access if requested
    if [[ "$API_TEST" == "true" ]]; then
        test_api_access "$api_url" "$access_token" "$username" "$instance"
    fi
    
    return 0
}

# =============================================================================
# API ACCESS TEST
# =============================================================================

test_api_access() {
    local api_url="$1"
    local access_token="$2"
    local username="$3"
    local instance="$4"
    
    log_test "API Access: ${username} on ${instance^^}"
    
    # Test /api/auth/me endpoint
    local me_response=$(curl -sk -X GET "${api_url}/api/auth/me" \
        -H "Authorization: Bearer ${access_token}" \
        --max-time 10 \
        2>/dev/null)
    
    local http_code=$(curl -sk -o /dev/null -w "%{http_code}" -X GET "${api_url}/api/auth/me" \
        -H "Authorization: Bearer ${access_token}" \
        --max-time 10 \
        2>/dev/null)
    
    if [[ "$http_code" == "200" ]]; then
        log_pass "${username}: API /api/auth/me accessible"
        
        if [[ "$VERBOSE" == "true" ]]; then
            echo "$me_response" | jq '.' 2>/dev/null || echo "$me_response"
            echo ""
        fi
    else
        log_fail "${username}: API /api/auth/me returned HTTP ${http_code}"
    fi
    
    # Test /api/resources endpoint
    local resources_code=$(curl -sk -o /dev/null -w "%{http_code}" -X GET "${api_url}/api/resources" \
        -H "Authorization: Bearer ${access_token}" \
        --max-time 10 \
        2>/dev/null)
    
    if [[ "$resources_code" == "200" ]]; then
        log_pass "${username}: API /api/resources accessible"
    elif [[ "$resources_code" == "403" ]]; then
        log_skip "${username}: API /api/resources returned 403 (authorization denied - expected)"
    else
        log_fail "${username}: API /api/resources returned HTTP ${resources_code}"
    fi
}

# =============================================================================
# MAIN TEST EXECUTION
# =============================================================================

main() {
    log_header "DIVE V3 - Terraform User Login E2E Verification"
    echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    
    # Load client secrets
    load_client_secrets
    
    # Determine instances to test
    local instances_to_test=()
    if [[ -n "$INSTANCE_FILTER" ]]; then
        instances_to_test=("$(echo "$INSTANCE_FILTER" | tr '[:upper:]' '[:lower:]')")
    else
        instances_to_test=("usa" "fra" "gbr" "deu")
    fi
    
    # Test each instance
    for instance in "${instances_to_test[@]}"; do
        local instance_upper=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
        log_header "Testing ${instance_upper} Instance"
        
        local idp_url="${INSTANCE_CONFIGS[${instance}_idp]}"
        
        # Check if IdP is reachable
        log_test "IdP Reachability: ${idp_url}"
        local idp_status=$(curl -sk -o /dev/null -w "%{http_code}" "${idp_url}/realms/${REALM_NAME}" --max-time 10 2>/dev/null || echo "000")
        
        if [[ "$idp_status" == "200" ]]; then
            log_pass "IdP is reachable"
        else
            log_fail "IdP returned HTTP ${idp_status}"
            log_skip "Skipping ${instance_upper} instance tests"
            echo ""
            continue
        fi
        
        echo ""
        
        # Test each user (1-4)
        for level in 1 2 3 4; do
            local username="testuser-${instance}-${level}"
            
            # Apply user filter if specified
            if [[ -n "$USER_FILTER" && "$username" != "$USER_FILTER" ]]; then
                continue
            fi
            
            test_user_login "$instance" "$username" "$TERRAFORM_PASSWORD"
            echo ""
        done
        
        echo ""
    done
    
    # Summary
    log_header "Test Summary"
    echo "Total Tests:  ${TOTAL_TESTS}"
    echo -e "${GREEN}Passed:       ${TESTS_PASSED}${NC}"
    echo -e "${RED}Failed:       ${TESTS_FAILED}${NC}"
    echo -e "${YELLOW}Skipped:      ${TESTS_SKIPPED}${NC}"
    echo ""
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✅ All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some tests failed${NC}"
        exit 1
    fi
}

# Run main function
main

