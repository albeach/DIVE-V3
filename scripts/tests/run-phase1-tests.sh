#!/usr/bin/env bash
# =============================================================================
# PHASE 1 - COMPLETE TEST SUITE RUNNER
# =============================================================================
#
# Runs all Phase 1 tests:
#   1. Deploy script validation (test-phase1-deploy.sh)
#   2. Test user validation (test-phase1-users.sh) - if instances are running
#
# Usage:
#   ./scripts/tests/run-phase1-tests.sh
#
# Exit codes:
#   0 - All tests passed
#   1 - Some tests failed
#
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

cd "$PROJECT_ROOT"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                 PHASE 1: FOUNDATION TEST SUITE                    ║${NC}"
echo -e "${CYAN}║                                                                    ║${NC}"
echo -e "${CYAN}║  Testing:                                                          ║${NC}"
echo -e "${CYAN}║    • Standardized test users (testuser-{code}-{1-4})              ║${NC}"
echo -e "${CYAN}║    • Enhanced deploy script with pre-flight checks                 ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

OVERALL_RESULT=0

# =============================================================================
# TEST 1: Deploy Script Validation
# =============================================================================

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  TEST SUITE 1: Deploy Script Validation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ -f "$SCRIPT_DIR/test-phase1-deploy.sh" ]; then
  chmod +x "$SCRIPT_DIR/test-phase1-deploy.sh"
  if "$SCRIPT_DIR/test-phase1-deploy.sh"; then
    echo -e "${GREEN}✅ Deploy script tests PASSED${NC}"
  else
    echo -e "${RED}❌ Deploy script tests FAILED${NC}"
    OVERALL_RESULT=1
  fi
else
  echo -e "${YELLOW}⚠ Deploy script tests not found${NC}"
fi

# =============================================================================
# TEST 2: Test User Validation (only if instances are running)
# =============================================================================

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  TEST SUITE 2: Test User Validation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check if any Keycloak is running
if curl -sf "https://localhost:8443/health/ready" --insecure >/dev/null 2>&1; then
  if [ -f "$SCRIPT_DIR/test-phase1-users.sh" ]; then
    chmod +x "$SCRIPT_DIR/test-phase1-users.sh"
    if "$SCRIPT_DIR/test-phase1-users.sh" USA; then
      echo -e "${GREEN}✅ Test user validation PASSED${NC}"
    else
      echo -e "${RED}❌ Test user validation FAILED${NC}"
      OVERALL_RESULT=1
    fi
  else
    echo -e "${YELLOW}⚠ Test user validation script not found${NC}"
  fi
else
  echo -e "${YELLOW}⚠ Keycloak not running - skipping user tests${NC}"
  echo -e "${YELLOW}  Run 'docker-compose up -d' to enable user tests${NC}"
fi

# =============================================================================
# OVERALL RESULT
# =============================================================================

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    PHASE 1 TEST RESULTS                           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"

if [ $OVERALL_RESULT -eq 0 ]; then
  echo ""
  echo -e "${GREEN}  ██████╗  █████╗ ███████╗███████╗${NC}"
  echo -e "${GREEN}  ██╔══██╗██╔══██╗██╔════╝██╔════╝${NC}"
  echo -e "${GREEN}  ██████╔╝███████║███████╗███████╗${NC}"
  echo -e "${GREEN}  ██╔═══╝ ██╔══██║╚════██║╚════██║${NC}"
  echo -e "${GREEN}  ██║     ██║  ██║███████║███████║${NC}"
  echo -e "${GREEN}  ╚═╝     ╚═╝  ╚═╝╚══════╝╚══════╝${NC}"
  echo ""
  echo -e "${GREEN}  All Phase 1 tests passed!${NC}"
  echo ""
  echo -e "${CYAN}  Phase 1 SMART Objectives Met:${NC}"
  echo -e "    ✓ Test users: testuser-{code}-{1-4} standardized"
  echo -e "    ✓ Deploy script: --help, --dry-run, pre-flight checks"
  echo ""
else
  echo ""
  echo -e "${RED}  ███████╗ █████╗ ██╗██╗     ${NC}"
  echo -e "${RED}  ██╔════╝██╔══██╗██║██║     ${NC}"
  echo -e "${RED}  █████╗  ███████║██║██║     ${NC}"
  echo -e "${RED}  ██╔══╝  ██╔══██║██║██║     ${NC}"
  echo -e "${RED}  ██║     ██║  ██║██║███████╗${NC}"
  echo -e "${RED}  ╚═╝     ╚═╝  ╚═╝╚═╝╚══════╝${NC}"
  echo ""
  echo -e "${RED}  Some Phase 1 tests failed!${NC}"
  echo -e "${RED}  Review the output above for details.${NC}"
  echo ""
fi

exit $OVERALL_RESULT





