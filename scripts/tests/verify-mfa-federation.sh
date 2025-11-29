#!/bin/bash
# ============================================================================
# MFA FEDERATION VERIFICATION SCRIPT
# ============================================================================
# This script comprehensively verifies that MFA enforcement is correctly
# configured across all DIVE V3 federated instances.
#
# Usage: ./scripts/tests/verify-mfa-federation.sh [--verbose]
#
# Exit Codes:
#   0 - All tests passed
#   1 - One or more tests failed
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-DivePilot2025!SecureAdmin}"
VERBOSE="${1:-}"

# Instance configurations
declare -A INSTANCES=(
  ["usa"]="https://usa-idp.dive25.com"
  ["fra"]="https://fra-idp.dive25.com"
  ["gbr"]="https://gbr-idp.dive25.com"
  ["deu"]="https://deu-idp.prosecurity.biz"
)

declare -A INSTANCE_NAMES=(
  ["usa"]="United States"
  ["fra"]="France"
  ["gbr"]="United Kingdom"
  ["deu"]="Germany"
)

ALL_INSTANCES=("usa" "fra" "gbr" "deu")

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Helper functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  ((PASSED_TESTS++))
  ((TOTAL_TESTS++))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  ((FAILED_TESTS++))
  ((TOTAL_TESTS++))
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

get_admin_token() {
  local url=$1
  curl -sk -X POST "$url/realms/master/protocol/openid-connect/token" \
    -d 'client_id=admin-cli' \
    -d 'username=admin' \
    -d "password=$ADMIN_PASSWORD" \
    -d 'grant_type=password' 2>/dev/null | jq -r '.access_token'
}

# ============================================================================
# TEST FUNCTIONS
# ============================================================================

test_simple_post_broker_otp_flow() {
  local instance=$1
  local url="${INSTANCES[$instance]}"
  local token=$(get_admin_token "$url")
  
  if [ "$token" == "null" ] || [ -z "$token" ]; then
    log_fail "$instance: Could not authenticate to Keycloak"
    return 1
  fi
  
  # Check flow exists
  local flow_data=$(curl -sk "$url/admin/realms/dive-v3-broker/authentication/flows" \
    -H "Authorization: Bearer $token" 2>/dev/null)
  
  local flow_id=$(echo "$flow_data" | jq -r '.[] | select(.alias == "Simple Post-Broker OTP") | .id')
  
  if [ -z "$flow_id" ]; then
    log_fail "$instance: Simple Post-Broker OTP flow does not exist"
    return 1
  fi
  
  log_pass "$instance: Simple Post-Broker OTP flow exists"
  
  # Check flow structure
  local exec_data=$(curl -sk "$url/admin/realms/dive-v3-broker/authentication/flows/Simple%20Post-Broker%20OTP/executions" \
    -H "Authorization: Bearer $token" 2>/dev/null)
  
  local exec_count=$(echo "$exec_data" | jq 'length')
  local exec_name=$(echo "$exec_data" | jq -r '.[0].displayName')
  local exec_req=$(echo "$exec_data" | jq -r '.[0].requirement')
  
  if [ "$exec_count" == "1" ] && [ "$exec_name" == "OTP Form" ] && [ "$exec_req" == "REQUIRED" ]; then
    log_pass "$instance: Flow structure correct (OTP Form [REQUIRED], single authenticator)"
  else
    log_fail "$instance: Flow structure incorrect (count=$exec_count, name=$exec_name, req=$exec_req)"
    return 1
  fi
  
  return 0
}

test_idp_bindings() {
  local instance=$1
  local url="${INSTANCES[$instance]}"
  local token=$(get_admin_token "$url")
  
  for partner in "${ALL_INSTANCES[@]}"; do
    if [ "$partner" == "$instance" ]; then
      continue
    fi
    
    local idp_data=$(curl -sk "$url/admin/realms/dive-v3-broker/identity-provider/instances/${partner}-federation" \
      -H "Authorization: Bearer $token" 2>/dev/null)
    
    local first_broker=$(echo "$idp_data" | jq -r '.firstBrokerLoginFlowAlias // "NOT SET"')
    local post_broker=$(echo "$idp_data" | jq -r '.postBrokerLoginFlowAlias // "NOT SET"')
    
    if [ "$first_broker" == "first broker login" ] && [ "$post_broker" == "Simple Post-Broker OTP" ]; then
      log_pass "$instance → ${partner}-federation: Bindings correct"
    else
      log_fail "$instance → ${partner}-federation: Bindings incorrect (first='$first_broker', post='$post_broker')"
    fi
  done
}

test_aal3_webauthn_flow() {
  local instance=$1
  local url="${INSTANCES[$instance]}"
  local name="${INSTANCE_NAMES[$instance]}"
  local token=$(get_admin_token "$url")
  
  local flow_name="Classified Access Browser Flow - $name"
  local flow_encoded=$(echo "$flow_name" | sed 's/ /%20/g')
  
  local exec_data=$(curl -sk "$url/admin/realms/dive-v3-broker/authentication/flows/$flow_encoded/executions" \
    -H "Authorization: Bearer $token" 2>/dev/null)
  
  # Check WebAuthn AAL3 subflow
  local webauthn_subflow=$(echo "$exec_data" | jq -r '.[] | select(.displayName | contains("Conditional WebAuthn AAL3")) | .displayName')
  if [ -n "$webauthn_subflow" ]; then
    log_pass "$instance: AAL3 WebAuthn subflow exists"
  else
    log_fail "$instance: AAL3 WebAuthn subflow missing"
  fi
  
  # Check TOP_SECRET condition
  local top_secret=$(echo "$exec_data" | jq -r '.[] | select(.alias != null) | select(.alias | contains("TOP SECRET")) | .alias')
  if [ -n "$top_secret" ]; then
    log_pass "$instance: TOP_SECRET condition exists"
  else
    log_fail "$instance: TOP_SECRET condition missing"
  fi
  
  # Check WebAuthn Authenticator
  local webauthn_auth=$(echo "$exec_data" | jq -r '.[] | select(.displayName == "WebAuthn Authenticator") | .displayName')
  if [ -n "$webauthn_auth" ]; then
    log_pass "$instance: WebAuthn Authenticator exists"
  else
    log_fail "$instance: WebAuthn Authenticator missing"
  fi
}

test_aal2_otp_flow() {
  local instance=$1
  local url="${INSTANCES[$instance]}"
  local name="${INSTANCE_NAMES[$instance]}"
  local token=$(get_admin_token "$url")
  
  local flow_name="Classified Access Browser Flow - $name"
  local flow_encoded=$(echo "$flow_name" | sed 's/ /%20/g')
  
  local exec_data=$(curl -sk "$url/admin/realms/dive-v3-broker/authentication/flows/$flow_encoded/executions" \
    -H "Authorization: Bearer $token" 2>/dev/null)
  
  # Check OTP AAL2 subflow
  local otp_subflow=$(echo "$exec_data" | jq -r '.[] | select(.displayName | contains("Conditional OTP AAL2")) | .displayName')
  if [ -n "$otp_subflow" ]; then
    log_pass "$instance: AAL2 OTP subflow exists"
  else
    log_fail "$instance: AAL2 OTP subflow missing"
  fi
  
  # Check CONFIDENTIAL/SECRET condition
  local conf_secret=$(echo "$exec_data" | jq -r '.[] | select(.alias != null) | select(.alias | contains("CONFIDENTIAL SECRET")) | .alias')
  if [ -n "$conf_secret" ]; then
    log_pass "$instance: CONFIDENTIAL/SECRET condition exists"
  else
    log_fail "$instance: CONFIDENTIAL/SECRET condition missing"
  fi
}

test_keycloak_health() {
  local instance=$1
  local url="${INSTANCES[$instance]}"
  
  local health=$(curl -sk "$url/health/ready" 2>/dev/null | jq -r '.status // "UNKNOWN"')
  
  if [ "$health" == "UP" ]; then
    log_pass "$instance: Keycloak is healthy"
  else
    # Try alternative health check
    local realm_check=$(curl -sk "$url/realms/dive-v3-broker/.well-known/openid-configuration" 2>/dev/null | jq -r '.issuer // "UNKNOWN"')
    if [ "$realm_check" != "UNKNOWN" ]; then
      log_pass "$instance: Keycloak is responding (OIDC discovery)"
    else
      log_fail "$instance: Keycloak health check failed"
    fi
  fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

echo "============================================================================"
echo "MFA FEDERATION VERIFICATION"
echo "============================================================================"
echo ""
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Instances: ${ALL_INSTANCES[*]}"
echo ""

# Phase 1: Health Check
echo "============================================================================"
echo "PHASE 1: KEYCLOAK HEALTH CHECK"
echo "============================================================================"
for instance in "${ALL_INSTANCES[@]}"; do
  test_keycloak_health "$instance"
done
echo ""

# Phase 2: Simple Post-Broker OTP Flow
echo "============================================================================"
echo "PHASE 2: SIMPLE POST-BROKER OTP FLOW (AAL2 for Federation)"
echo "============================================================================"
for instance in "${ALL_INSTANCES[@]}"; do
  test_simple_post_broker_otp_flow "$instance"
done
echo ""

# Phase 3: IdP Bindings
echo "============================================================================"
echo "PHASE 3: IDENTITY PROVIDER BINDINGS"
echo "============================================================================"
for instance in "${ALL_INSTANCES[@]}"; do
  echo "--- $instance ---"
  test_idp_bindings "$instance"
  echo ""
done

# Phase 4: AAL3 WebAuthn Flow (Direct Login)
echo "============================================================================"
echo "PHASE 4: AAL3 WEBAUTHN FLOW (TOP_SECRET - Direct Login)"
echo "============================================================================"
for instance in "${ALL_INSTANCES[@]}"; do
  test_aal3_webauthn_flow "$instance"
done
echo ""

# Phase 5: AAL2 OTP Flow (Direct Login)
echo "============================================================================"
echo "PHASE 5: AAL2 OTP FLOW (CONFIDENTIAL/SECRET - Direct Login)"
echo "============================================================================"
for instance in "${ALL_INSTANCES[@]}"; do
  test_aal2_otp_flow "$instance"
done
echo ""

# Summary
echo "============================================================================"
echo "SUMMARY"
echo "============================================================================"
echo ""
echo -e "Total Tests:  ${TOTAL_TESTS}"
echo -e "Passed:       ${GREEN}${PASSED_TESTS}${NC}"
echo -e "Failed:       ${RED}${FAILED_TESTS}${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}============================================================================${NC}"
  echo -e "${GREEN}ALL TESTS PASSED - MFA FEDERATION IS CORRECTLY CONFIGURED${NC}"
  echo -e "${GREEN}============================================================================${NC}"
  exit 0
else
  echo -e "${RED}============================================================================${NC}"
  echo -e "${RED}SOME TESTS FAILED - REVIEW CONFIGURATION${NC}"
  echo -e "${RED}============================================================================${NC}"
  exit 1
fi

