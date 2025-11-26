#!/usr/bin/env bash
# =============================================================================
# PHASE 1 TEST SUITE: Test User Validation
# =============================================================================
#
# Tests that pilot test users are correctly provisioned with:
#   - Predictable naming: testuser-{code}-{level}
#   - Correct clearance levels (1=UNCLASSIFIED, 4=TOP_SECRET)
#   - Standard password: DiveDemo2025!
#   - Required attributes
#
# Usage:
#   ./scripts/tests/test-phase1-users.sh [instance_code]
#   ./scripts/tests/test-phase1-users.sh usa
#   ./scripts/tests/test-phase1-users.sh       # Tests all instances
#
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TESTS_PASSED=0
TESTS_FAILED=0

# Test password
TEST_PASSWORD="DiveDemo2025!"

# Clearance level mapping
declare -A CLEARANCE_MAP=(
  [1]="UNCLASSIFIED"
  [2]="CONFIDENTIAL"
  [3]="SECRET"
  [4]="TOP_SECRET"
)

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

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
}

# Get Keycloak admin token
get_admin_token() {
  local keycloak_url=$1
  
  curl -sf -X POST "${keycloak_url}/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=admin" \
    2>/dev/null | jq -r '.access_token'
}

# Check if user exists in Keycloak
check_user_exists() {
  local keycloak_url=$1
  local token=$2
  local username=$3
  
  local response=$(curl -sf -X GET \
    "${keycloak_url}/admin/realms/dive-v3-broker/users?username=${username}&exact=true" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    2>/dev/null)
  
  local count=$(echo "$response" | jq 'length')
  [[ "$count" == "1" ]]
}

# Get user attributes
get_user_attributes() {
  local keycloak_url=$1
  local token=$2
  local username=$3
  
  curl -sf -X GET \
    "${keycloak_url}/admin/realms/dive-v3-broker/users?username=${username}&exact=true" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    2>/dev/null | jq '.[0].attributes // {}'
}

# Test user authentication via OIDC
test_user_auth() {
  local keycloak_url=$1
  local username=$2
  local password=$3
  
  local response=$(curl -sf -X POST "${keycloak_url}/realms/dive-v3-broker/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password" \
    -d "client_id=dive-v3-client-broker" \
    -d "username=${username}" \
    -d "password=${password}" \
    2>/dev/null)
  
  local access_token=$(echo "$response" | jq -r '.access_token // empty')
  [[ -n "$access_token" ]]
}

# =============================================================================
# TEST FUNCTIONS
# =============================================================================

test_instance_users() {
  local code=$1
  local code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')
  local keycloak_url="https://${code_lower}-idp.dive25.com"
  
  echo ""
  echo "═══════════════════════════════════════════════════════════════════"
  echo " Testing Instance: ${code}"
  echo " Keycloak URL: ${keycloak_url}"
  echo "═══════════════════════════════════════════════════════════════════"
  
  # Check Keycloak is reachable
  log_test "Checking Keycloak availability..."
  if ! curl -sf "${keycloak_url}/realms/dive-v3-broker/.well-known/openid-configuration" >/dev/null 2>&1; then
    log_fail "Keycloak not reachable at ${keycloak_url}"
    return 1
  fi
  log_pass "Keycloak is reachable"
  
  # Get admin token
  log_test "Obtaining admin token..."
  local token=$(get_admin_token "$keycloak_url")
  if [[ -z "$token" || "$token" == "null" ]]; then
    log_fail "Could not obtain admin token"
    return 1
  fi
  log_pass "Admin token obtained"
  
  # Test each clearance level (1-4)
  for level in 1 2 3 4; do
    local username="testuser-${code_lower}-${level}"
    local expected_clearance="${CLEARANCE_MAP[$level]}"
    
    echo ""
    echo "--- Testing: ${username} (Expected: ${expected_clearance}) ---"
    
    # Test 1: User exists
    log_test "Checking user exists..."
    if check_user_exists "$keycloak_url" "$token" "$username"; then
      log_pass "User ${username} exists"
    else
      log_fail "User ${username} does not exist"
      continue
    fi
    
    # Test 2: User can authenticate
    log_test "Testing authentication..."
    if test_user_auth "$keycloak_url" "$username" "$TEST_PASSWORD"; then
      log_pass "User ${username} can authenticate with standard password"
    else
      log_fail "User ${username} failed to authenticate"
    fi
    
    # Test 3: Clearance attribute is correct
    log_test "Checking clearance attribute..."
    local attrs=$(get_user_attributes "$keycloak_url" "$token" "$username")
    local actual_clearance=$(echo "$attrs" | jq -r '.clearance[0] // empty')
    
    if [[ "$actual_clearance" == "$expected_clearance" ]]; then
      log_pass "Clearance is correct: ${actual_clearance}"
    else
      log_fail "Clearance mismatch: expected ${expected_clearance}, got ${actual_clearance}"
    fi
    
    # Test 4: Country attribute is correct
    log_test "Checking countryOfAffiliation attribute..."
    local actual_country=$(echo "$attrs" | jq -r '.countryOfAffiliation[0] // empty')
    
    if [[ "$actual_country" == "$code" ]]; then
      log_pass "Country is correct: ${actual_country}"
    else
      log_fail "Country mismatch: expected ${code}, got ${actual_country}"
    fi
    
    # Test 5: uniqueID attribute exists
    log_test "Checking uniqueID attribute..."
    local unique_id=$(echo "$attrs" | jq -r '.uniqueID[0] // empty')
    
    if [[ -n "$unique_id" ]]; then
      log_pass "uniqueID is set: ${unique_id}"
    else
      log_fail "uniqueID is not set"
    fi
  done
}

# =============================================================================
# MAIN
# =============================================================================

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║          PHASE 1 TEST SUITE: Test User Validation                ║"
echo "╚══════════════════════════════════════════════════════════════════╝"

# Determine which instances to test
if [[ $# -gt 0 ]]; then
  INSTANCES=("$@")
else
  # Auto-detect instances from docker-compose files
  INSTANCES=()
  for compose_file in docker-compose*.yml; do
    if [[ "$compose_file" == "docker-compose.yml" ]]; then
      INSTANCES+=("USA")
    else
      code=$(echo "$compose_file" | sed 's/docker-compose\.\(.*\)\.yml/\1/' | tr '[:lower:]' '[:upper:]')
      INSTANCES+=("$code")
    fi
  done
fi

echo ""
echo "Instances to test: ${INSTANCES[*]}"

# Run tests for each instance
for instance in "${INSTANCES[@]}"; do
  test_instance_users "$instance"
done

# Summary
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                        TEST SUMMARY                               ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  Tests Passed: ${TESTS_PASSED}                                              ║"
echo "║  Tests Failed: ${TESTS_FAILED}                                              ║"
echo "╚══════════════════════════════════════════════════════════════════╝"

if [[ $TESTS_FAILED -gt 0 ]]; then
  echo ""
  echo -e "${RED}❌ PHASE 1 TESTS FAILED${NC}"
  exit 1
else
  echo ""
  echo -e "${GREEN}✅ ALL PHASE 1 TESTS PASSED${NC}"
  exit 0
fi


