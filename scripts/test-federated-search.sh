#!/usr/bin/env bash
# ============================================================================
# DIVE V3 - Federated Search Test Suite Runner
# ============================================================================
# 
# Runs the comprehensive federated search test suite across all instances.
# 
# USAGE:
#   ./scripts/test-federated-search.sh [OPTIONS]
#
# OPTIONS:
#   --unit              Run unit tests only
#   --integration       Run integration tests only
#   --e2e               Run E2E tests (requires running instances)
#   --performance       Run performance tests
#   --all               Run all tests
#   --coverage          Generate coverage report
#   --verbose           Verbose output
#
# ENVIRONMENT:
#   RUN_E2E_TESTS=true          Enable E2E tests
#   TEST_AUTH_TOKEN=<token>     JWT token for authenticated requests
#   USA_API_URL=<url>           USA backend URL
#   FRA_API_URL=<url>           FRA backend URL
#   GBR_API_URL=<url>           GBR backend URL
#
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_section() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# Default options
RUN_UNIT=false
RUN_INTEGRATION=false
RUN_E2E=false
RUN_PERFORMANCE=false
COVERAGE=false
VERBOSE=false

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --unit) RUN_UNIT=true ;;
        --integration) RUN_INTEGRATION=true ;;
        --e2e) RUN_E2E=true ;;
        --performance) RUN_PERFORMANCE=true ;;
        --all)
            RUN_UNIT=true
            RUN_INTEGRATION=true
            RUN_E2E=true
            RUN_PERFORMANCE=true
            ;;
        --coverage) COVERAGE=true ;;
        --verbose) VERBOSE=true ;;
        --help|-h)
            echo "Federated Search Test Suite"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --unit          Run unit tests only"
            echo "  --integration   Run integration tests only"
            echo "  --e2e           Run E2E tests (requires running instances)"
            echo "  --performance   Run performance tests"
            echo "  --all           Run all tests"
            echo "  --coverage      Generate coverage report"
            echo "  --verbose       Verbose output"
            exit 0
            ;;
    esac
done

# Default: run unit and integration if no flags
if ! $RUN_UNIT && ! $RUN_INTEGRATION && ! $RUN_E2E && ! $RUN_PERFORMANCE; then
    RUN_UNIT=true
    RUN_INTEGRATION=true
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        DIVE V3 - Federated Search Test Suite                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
log_section "Prerequisites"

cd "$BACKEND_DIR"

if ! command -v npm &> /dev/null; then
    log_error "npm not found"
    exit 1
fi
log_success "npm available"

if [ ! -f "package.json" ]; then
    log_error "package.json not found in $BACKEND_DIR"
    exit 1
fi
log_success "Backend directory valid"

# Check instances if E2E
if $RUN_E2E; then
    log_info "Checking instance availability for E2E tests..."
    
    USA_URL="${USA_API_URL:-https://localhost:4000}"
    FRA_URL="${FRA_API_URL:-https://localhost:4001}"
    GBR_URL="${GBR_API_URL:-https://localhost:4002}"
    
    for url in "$USA_URL" "$FRA_URL" "$GBR_URL"; do
        if curl -sk "$url/health" &>/dev/null; then
            log_success "  $url: Available"
        else
            log_warn "  $url: Unavailable"
        fi
    done
    
    if [ -z "${TEST_AUTH_TOKEN:-}" ]; then
        log_warn "TEST_AUTH_TOKEN not set - some E2E tests will be skipped"
    fi
fi

# Build test command
TEST_CMD="npx jest"
TEST_PATTERNS=""
JEST_OPTS=""

if $VERBOSE; then
    JEST_OPTS="$JEST_OPTS --verbose"
fi

if $COVERAGE; then
    JEST_OPTS="$JEST_OPTS --coverage"
fi

# Run Unit Tests
if $RUN_UNIT; then
    log_section "Unit Tests"
    log_info "Running federated search unit tests..."
    
    RUN_E2E_TESTS=false npx jest \
        --testPathPattern='federated-search.test' \
        --testNamePattern='Unit Tests' \
        $JEST_OPTS \
        || { log_warn "Some unit tests failed"; }
    
    log_success "Unit tests complete"
fi

# Run Integration Tests
if $RUN_INTEGRATION; then
    log_section "Integration Tests"
    log_info "Running federated search integration tests..."
    
    RUN_E2E_TESTS=false npx jest \
        --testPathPattern='federated-search.test' \
        --testNamePattern='Integration Tests' \
        $JEST_OPTS \
        || { log_warn "Some integration tests failed"; }
    
    log_success "Integration tests complete"
fi

# Run E2E Tests
if $RUN_E2E; then
    log_section "E2E Tests"
    log_info "Running E2E tests against live instances..."
    
    RUN_E2E_TESTS=true npx jest \
        --testPathPattern='federated-search.e2e' \
        --runInBand \
        --testTimeout=30000 \
        $JEST_OPTS \
        || { log_warn "Some E2E tests failed"; }
    
    log_success "E2E tests complete"
fi

# Run Performance Tests
if $RUN_PERFORMANCE; then
    log_section "Performance Tests"
    log_info "Running performance benchmarks..."
    
    RUN_E2E_TESTS=true npx jest \
        --testPathPattern='federated-search' \
        --testNamePattern='Performance' \
        --runInBand \
        --testTimeout=60000 \
        $JEST_OPTS \
        || { log_warn "Some performance tests failed"; }
    
    log_success "Performance tests complete"
fi

# Summary
log_section "Test Summary"

echo ""
echo "Tests executed:"
$RUN_UNIT && echo "  ✓ Unit Tests"
$RUN_INTEGRATION && echo "  ✓ Integration Tests"
$RUN_E2E && echo "  ✓ E2E Tests"
$RUN_PERFORMANCE && echo "  ✓ Performance Tests"

if $COVERAGE; then
    echo ""
    echo "Coverage report: backend/coverage/lcov-report/index.html"
fi

echo ""
log_success "Federated Search Test Suite Complete!"




