#!/usr/bin/env bash
# =============================================================================
# PHASE 1 TEST SUITE: Deploy Script Validation
# =============================================================================
#
# Tests the enhanced deploy-dive-instance.sh script:
#   - Help flag functionality
#   - Dry-run validation
#   - Pre-flight checks
#   - Instance code validation
#   - Port calculation
#
# Usage:
#   ./scripts/tests/test-phase1-deploy.sh
#
# =============================================================================

set -uo pipefail
# Note: Not using -e so we can run all tests even if some fail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
TESTS_PASSED=0
TESTS_FAILED=0

# Script under test
DEPLOY_SCRIPT="./scripts/deploy-dive-instance.sh"

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

# Strip ANSI color codes from output
strip_ansi() {
  sed 's/\x1b\[[0-9;]*m//g'
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

# =============================================================================
# TEST FUNCTIONS
# =============================================================================

test_help_flag() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════════"
  echo " Testing: --help flag"
  echo "═══════════════════════════════════════════════════════════════════"
  
  local help_output
  help_output=$($DEPLOY_SCRIPT --help 2>&1 | strip_ansi)
  
  log_test "Checking --help returns exit code 0"
  if $DEPLOY_SCRIPT --help >/dev/null 2>&1; then
    log_pass "--help exits successfully"
  else
    log_fail "--help returned non-zero exit code"
  fi
  
  log_test "Checking --help output contains usage info"
  if echo "$help_output" | grep -q "Usage:"; then
    log_pass "--help shows usage information"
  else
    log_fail "--help missing usage information"
  fi
  
  log_test "Checking --help shows instance codes"
  if echo "$help_output" | grep -q "USA, FRA, DEU"; then
    log_pass "--help shows instance codes"
  else
    log_fail "--help missing instance codes"
  fi
  
  log_test "Checking --help shows test users"
  if echo "$help_output" | grep -q "testuser-"; then
    log_pass "--help shows test user format"
  else
    log_fail "--help missing test user format"
  fi
  
  log_test "Checking --help shows password"
  if echo "$help_output" | grep -q "DiveDemo2025!"; then
    log_pass "--help shows standard password"
  else
    log_fail "--help missing standard password"
  fi
}

test_dry_run() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════════"
  echo " Testing: --dry-run flag"
  echo "═══════════════════════════════════════════════════════════════════"
  
  log_test "Checking --dry-run returns exit code 0"
  if $DEPLOY_SCRIPT USA --dry-run >/dev/null 2>&1; then
    log_pass "--dry-run exits successfully"
  else
    log_fail "--dry-run returned non-zero exit code"
  fi
  
  log_test "Checking --dry-run shows planned URLs"
  local fra_output
  fra_output=$($DEPLOY_SCRIPT FRA --dry-run 2>&1 | strip_ansi)
  if echo "$fra_output" | grep -q "fra-app.dive25.com"; then
    log_pass "--dry-run shows correct URLs for FRA"
  else
    log_fail "--dry-run missing FRA URLs"
  fi
  
  log_test "Checking --dry-run shows planned ports"
  local deu_output
  deu_output=$($DEPLOY_SCRIPT DEU --dry-run 2>&1 | strip_ansi)
  if echo "$deu_output" | grep -q "Frontend:"; then
    log_pass "--dry-run shows port assignments"
  else
    log_fail "--dry-run missing port assignments"
  fi
  
  log_test "Checking --dry-run doesn't start Docker"
  local before=$(docker ps -q | wc -l)
  $DEPLOY_SCRIPT GBR --dry-run >/dev/null 2>&1
  local after=$(docker ps -q | wc -l)
  if [ "$before" == "$after" ]; then
    log_pass "--dry-run doesn't change Docker state"
  else
    log_fail "--dry-run modified Docker state"
  fi
}

test_preflight_checks() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════════"
  echo " Testing: Pre-flight checks"
  echo "═══════════════════════════════════════════════════════════════════"
  
  local output
  output=$($DEPLOY_SCRIPT USA --dry-run 2>&1 | strip_ansi)
  
  log_test "Checking pre-flight detects Docker"
  if echo "$output" | grep -q "Docker is running"; then
    log_pass "Pre-flight detects Docker"
  else
    log_fail "Pre-flight doesn't detect Docker"
  fi
  
  log_test "Checking pre-flight detects cloudflared"
  if echo "$output" | grep -qE "(cloudflared is installed|cloudflared is not installed)"; then
    log_pass "Pre-flight checks cloudflared"
  else
    log_fail "Pre-flight doesn't check cloudflared"
  fi
  
  log_test "Checking pre-flight detects terraform"
  if echo "$output" | grep -qE "(terraform is installed|terraform is not installed)"; then
    log_pass "Pre-flight checks terraform"
  else
    log_fail "Pre-flight doesn't check terraform"
  fi
  
  log_test "Checking pre-flight detects mkcert"
  if echo "$output" | grep -qE "(mkcert is installed|mkcert is not installed)"; then
    log_pass "Pre-flight checks mkcert"
  else
    log_fail "Pre-flight doesn't check mkcert"
  fi
}

test_instance_validation() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════════"
  echo " Testing: Instance code validation"
  echo "═══════════════════════════════════════════════════════════════════"
  
  log_test "Checking valid instance code USA"
  if $DEPLOY_SCRIPT USA --dry-run >/dev/null 2>&1; then
    log_pass "USA is a valid instance code"
  else
    log_fail "USA rejected as instance code"
  fi
  
  log_test "Checking valid instance code FRA"
  if $DEPLOY_SCRIPT FRA --dry-run >/dev/null 2>&1; then
    log_pass "FRA is a valid instance code"
  else
    log_fail "FRA rejected as instance code"
  fi
  
  log_test "Checking lowercase conversion"
  local lower_output
  lower_output=$($DEPLOY_SCRIPT usa --dry-run 2>&1 | strip_ansi)
  if echo "$lower_output" | grep -q "USA"; then
    log_pass "Lowercase 'usa' converted to uppercase"
  else
    log_fail "Lowercase conversion failed"
  fi
  
  log_test "Checking invalid instance code rejection"
  if ! $DEPLOY_SCRIPT XYZ --dry-run >/dev/null 2>&1; then
    log_pass "Invalid code XYZ rejected"
  else
    log_fail "Invalid code XYZ not rejected"
  fi
  
  log_test "Checking missing instance code handling"
  # Note: Missing instance code shows help, which exits 0
  local missing_output
  missing_output=$($DEPLOY_SCRIPT --dry-run 2>&1 | strip_ansi || true)
  if echo "$missing_output" | grep -qE "(required|Usage)"; then
    log_pass "Missing instance code shows help/error"
  else
    log_fail "Missing instance code not handled properly"
  fi
}

test_port_calculations() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════════"
  echo " Testing: Port calculations"
  echo "═══════════════════════════════════════════════════════════════════"
  
  log_test "Checking USA ports (offset 0)"
  local usa_output=$($DEPLOY_SCRIPT USA --dry-run 2>&1 | strip_ansi)
  if echo "$usa_output" | grep -q "Frontend:  3000"; then
    log_pass "USA frontend port is 3000"
  else
    log_fail "USA frontend port incorrect"
  fi
  
  log_test "Checking FRA ports (offset 1)"
  local fra_output=$($DEPLOY_SCRIPT FRA --dry-run 2>&1 | strip_ansi)
  if echo "$fra_output" | grep -q "Frontend:  3001"; then
    log_pass "FRA frontend port is 3001"
  else
    log_fail "FRA frontend port incorrect"
  fi
  
  log_test "Checking DEU ports (offset 2)"
  local deu_output=$($DEPLOY_SCRIPT DEU --dry-run 2>&1 | strip_ansi)
  if echo "$deu_output" | grep -q "Frontend:  3002"; then
    log_pass "DEU frontend port is 3002"
  else
    log_fail "DEU frontend port incorrect"
  fi
  
  log_test "Checking ESP ports (offset 6)"
  local esp_output=$($DEPLOY_SCRIPT ESP --dry-run 2>&1 | strip_ansi)
  if echo "$esp_output" | grep -q "Frontend:  3006"; then
    log_pass "ESP frontend port is 3006"
  else
    log_fail "ESP frontend port incorrect"
  fi
}

# =============================================================================
# MAIN
# =============================================================================

cd "$(dirname "$0")/../.."

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║        PHASE 1 TEST SUITE: Deploy Script Validation              ║"
echo "╚══════════════════════════════════════════════════════════════════╝"

# Verify script exists
if [ ! -f "$DEPLOY_SCRIPT" ]; then
  echo -e "${RED}ERROR: Deploy script not found at $DEPLOY_SCRIPT${NC}"
  exit 1
fi

# Run all tests
test_help_flag
test_dry_run
test_preflight_checks
test_instance_validation
test_port_calculations

# Summary
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                        TEST SUMMARY                               ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
printf "║  Tests Passed: %-47s ║\n" "$TESTS_PASSED"
printf "║  Tests Failed: %-47s ║\n" "$TESTS_FAILED"
echo "╚══════════════════════════════════════════════════════════════════╝"

if [[ $TESTS_FAILED -gt 0 ]]; then
  echo ""
  echo -e "${RED}❌ DEPLOY SCRIPT TESTS FAILED${NC}"
  exit 1
else
  echo ""
  echo -e "${GREEN}✅ ALL DEPLOY SCRIPT TESTS PASSED${NC}"
  exit 0
fi

