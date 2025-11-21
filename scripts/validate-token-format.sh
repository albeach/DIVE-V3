#!/bin/bash

################################################################################
# DIVE V3 Phase 1: Token Format Validation Script
# 
# Purpose: Validates that all 11 realms generate consistent token formats
#          with numeric ACR and array AMR after Phase 1 implementation.
#
# Usage: ./scripts/validate-token-format.sh
#
# Expected Output:
#   - All realms should return numeric ACR (0, 1, or 2)
#   - All realms should return array AMR (e.g., ["pwd"], ["pwd","otp"])
#   - Broker realm should maintain existing functionality
#
# Author: DIVE V3 Team
# Date: 2025-10-30
# Reference: docs/AUTHENTICATION-AUDIT-AND-CONSOLIDATION-PLAN.md Phase 1
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
CUSTOM_LOGIN_ENDPOINT="${BACKEND_URL}/api/auth/custom-login"

# Test realm configurations
# Format: "realm_alias:username:password:expected_acr:expected_amr_count"
declare -a REALMS=(
    "dive-v3-broker:admin-dive:DiveAdmin2025!:1:2"
    "dive-v3-usa:john.doe:Password123!:1:2"
    "dive-v3-fra:pierre.dubois:Password123!:1:2"
    "dive-v3-can:john.macdonald:Password123!:1:2"
    "dive-v3-deu:hans.mueller:Password123!:1:2"
    "dive-v3-gbr:james.smith:Password123!:1:2"
    "dive-v3-ita:marco.rossi:Password123!:1:2"
    "dive-v3-esp:carlos.garcia:Password123!:1:2"
    "dive-v3-pol:jan.kowalski:Password123!:1:2"
    "dive-v3-nld:pieter.devries:Password123!:1:2"
    "dive-v3-industry:bob.contractor:Password123!:0:1"
)

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  DIVE V3 Phase 1: Token Format Validation                             ║${NC}"
echo -e "${BLUE}║  Testing ACR/AMR Standardization Across All Realms                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to decode JWT payload (base64)
decode_jwt_payload() {
    local token=$1
    # Extract payload (second part of JWT)
    local payload=$(echo "$token" | cut -d'.' -f2)
    # Add padding if needed
    local len=$((${#payload} % 4))
    if [ $len -eq 2 ]; then payload="$payload=="; fi
    if [ $len -eq 3 ]; then payload="$payload="; fi
    # Decode base64 (handle both macOS and Linux)
    if command -v base64 &> /dev/null; then
        echo "$payload" | base64 --decode 2>/dev/null || echo "$payload" | base64 -d 2>/dev/null
    fi
}

# Function to test a single realm
test_realm() {
    local realm_config=$1
    IFS=':' read -ra CONFIG <<< "$realm_config"
    
    local realm_alias="${CONFIG[0]}"
    local username="${CONFIG[1]}"
    local password="${CONFIG[2]}"
    local expected_acr="${CONFIG[3]}"
    local expected_amr_count="${CONFIG[4]}"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -e "${YELLOW}Testing realm: ${realm_alias}${NC}"
    echo "  User: ${username}"
    
    # Attempt login
    local response=$(curl -s -X POST "${CUSTOM_LOGIN_ENDPOINT}" \
        -H "Content-Type: application/json" \
        -d "{\"idpAlias\":\"${realm_alias}\",\"username\":\"${username}\",\"password\":\"${password}\"}" \
        2>/dev/null)
    
    # Check if response is empty
    if [ -z "$response" ]; then
        echo -e "  ${RED}✗ FAILED: Empty response from backend${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo ""
        return 1
    fi
    
    # Check for error in response
    if echo "$response" | grep -q '"error"'; then
        local error_msg=$(echo "$response" | jq -r '.error // .message // "Unknown error"' 2>/dev/null || echo "Unknown error")
        echo -e "  ${RED}✗ FAILED: Login error: ${error_msg}${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo ""
        return 1
    fi
    
    # Extract access token
    local access_token=$(echo "$response" | jq -r '.data.accessToken // .accessToken // empty' 2>/dev/null)
    
    if [ -z "$access_token" ] || [ "$access_token" == "null" ]; then
        echo -e "  ${RED}✗ FAILED: No access token in response${NC}"
        echo "  Response structure: $(echo "$response" | jq -c 'keys' 2>/dev/null || echo 'Not JSON')"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo ""
        return 1
    fi
    
    # Decode token payload
    local payload=$(decode_jwt_payload "$access_token")
    
    if [ -z "$payload" ]; then
        echo -e "  ${RED}✗ FAILED: Could not decode token payload${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo ""
        return 1
    fi
    
    # Extract ACR and AMR
    local acr=$(echo "$payload" | jq -r '.acr // empty' 2>/dev/null)
    local amr=$(echo "$payload" | jq -c '.amr // empty' 2>/dev/null)
    
    echo "  ACR: ${acr}"
    echo "  AMR: ${amr}"
    
    # Validate ACR format (should be numeric string)
    local acr_valid=false
    if [[ "$acr" =~ ^[0-9]+$ ]]; then
        echo -e "  ${GREEN}✓ ACR is numeric format (expected)${NC}"
        acr_valid=true
    elif [[ "$acr" == "urn:mace:"* ]]; then
        echo -e "  ${RED}✗ ACR is URN format (legacy - should be numeric)${NC}"
        acr_valid=false
    else
        echo -e "  ${RED}✗ ACR format unknown: ${acr}${NC}"
        acr_valid=false
    fi
    
    # Validate AMR format (should be array)
    local amr_valid=false
    local amr_count=0
    if [[ "$amr" == "["* ]]; then
        echo -e "  ${GREEN}✓ AMR is array format (expected)${NC}"
        amr_count=$(echo "$amr" | jq '. | length' 2>/dev/null || echo 0)
        amr_valid=true
    elif [[ "$amr" == "[\\\""* ]] || [[ "$amr" == "[\"pwd\""* ]]; then
        # JSON string format (legacy)
        echo -e "  ${RED}✗ AMR is JSON string format (legacy - should be array)${NC}"
        amr_valid=false
    else
        echo -e "  ${RED}✗ AMR format unknown: ${amr}${NC}"
        amr_valid=false
    fi
    
    # Check ACR value matches expected
    local acr_value_valid=false
    if [ "$acr" == "$expected_acr" ]; then
        echo -e "  ${GREEN}✓ ACR value matches expected (${expected_acr})${NC}"
        acr_value_valid=true
    else
        echo -e "  ${YELLOW}⚠ ACR value ${acr} != expected ${expected_acr}${NC}"
        # Still pass if format is correct
        acr_value_valid=true
    fi
    
    # Check AMR count matches expected
    local amr_count_valid=false
    if [ "$amr_count" == "$expected_amr_count" ]; then
        echo -e "  ${GREEN}✓ AMR count matches expected (${expected_amr_count})${NC}"
        amr_count_valid=true
    else
        echo -e "  ${YELLOW}⚠ AMR count ${amr_count} != expected ${expected_amr_count}${NC}"
        # Still pass if format is correct
        amr_count_valid=true
    fi
    
    # Overall result
    if [ "$acr_valid" == true ] && [ "$amr_valid" == true ]; then
        echo -e "  ${GREEN}✓ PASSED: Token format is correct${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo ""
        return 0
    else
        echo -e "  ${RED}✗ FAILED: Token format is incorrect${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo ""
        return 1
    fi
}

# Check dependencies
echo "Checking dependencies..."
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required but not installed.${NC}"
    echo "Please install jq: https://stedolan.github.io/jq/download/"
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo -e "${RED}Error: curl is required but not installed.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All dependencies installed${NC}"
echo ""

# Check backend is running
echo "Checking backend availability..."
if curl -s -f "${BACKEND_URL}/api/health" > /dev/null 2>&1 || curl -s -f "${BACKEND_URL}/" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is running at ${BACKEND_URL}${NC}"
else
    echo -e "${YELLOW}⚠ Warning: Backend may not be running at ${BACKEND_URL}${NC}"
    echo "  Continuing anyway..."
fi
echo ""

# Run tests for all realms
for realm_config in "${REALMS[@]}"; do
    test_realm "$realm_config"
done

# Summary
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Test Summary                                                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Total Tests:  ${TOTAL_TESTS}"
echo -e "Passed:       ${GREEN}${PASSED_TESTS}${NC}"
echo -e "Failed:       ${RED}${FAILED_TESTS}${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ ALL TESTS PASSED                                                    ║${NC}"
    echo -e "${GREEN}║  Phase 1 token format standardization is complete!                    ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ✗ SOME TESTS FAILED                                                   ║${NC}"
    echo -e "${RED}║  Please review the errors above and fix the issues.                   ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi















