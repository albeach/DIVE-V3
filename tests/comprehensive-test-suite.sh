#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - Comprehensive Test Suite
# Secret Drift & KAS Terminology Validation
# =============================================================================

set -e

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GCP_PROJECT="dive25"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✅${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠️${NC} $1"; }
log_error() { echo -e "${RED}❌${NC} $1"; }
log_section() { echo -e "\n${BOLD}═══ $1 ═══${NC}\n"; }

TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# =============================================================================
# TEST SUITE 1: SECRET SYNCHRONIZATION
# =============================================================================

test_secret_sync_hub() {
    log_section "TEST: Hub Secret Synchronization"

    # Get Terraform secret
    cd "${DIVE_ROOT}/terraform/hub"
    TF_SECRET=$(terraform output -raw client_secret 2>/dev/null || echo "")

    # Get GCP secret
    GCP_SECRET=$(gcloud secrets versions access latest \
        --secret=dive-v3-keycloak-client-secret \
        --project="${GCP_PROJECT}" 2>/dev/null || echo "")

    # Get container secret
    CONTAINER_SECRET=$(docker exec dive-hub-frontend env 2>/dev/null | \
        grep "AUTH_KEYCLOAK_SECRET" | cut -d= -f2 || echo "")

    log_info "Terraform: ${TF_SECRET:0:8}..."
    log_info "GCP:       ${GCP_SECRET:0:8}..."
    log_info "Container: ${CONTAINER_SECRET:0:8}..."

    if [ "$TF_SECRET" = "$GCP_SECRET" ] && [ "$GCP_SECRET" = "$CONTAINER_SECRET" ]; then
        log_success "Hub secrets are synchronized"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "Hub secrets are OUT OF SYNC"
        ((TESTS_FAILED++))
        return 1
    fi
}

test_secret_sync_spoke() {
    local SPOKE_CODE=$1
    local spoke_lower=$(echo "$SPOKE_CODE" | tr '[:upper:]' '[:lower:]')

    log_section "TEST: ${SPOKE_CODE} Secret Synchronization"

    # Check if spoke is running
    if ! docker ps | grep -q "dive-spoke-${spoke_lower}-frontend"; then
        log_warn "${SPOKE_CODE} spoke not running, skipping"
        ((TESTS_SKIPPED++))
        return 0
    fi

    # Get Terraform secret
    cd "${DIVE_ROOT}/terraform/spoke"
    terraform workspace select "${spoke_lower}" >/dev/null 2>&1
    TF_SECRET=$(terraform output -raw client_secret 2>/dev/null || echo "")

    # Get GCP secret
    GCP_SECRET=$(gcloud secrets versions access latest \
        --secret="dive-v3-keycloak-client-secret-${spoke_lower}" \
        --project="${GCP_PROJECT}" 2>/dev/null || echo "")

    # Get container secret
    CONTAINER_SECRET=$(docker exec "dive-spoke-${spoke_lower}-frontend" env 2>/dev/null | \
        grep "AUTH_KEYCLOAK_SECRET" | cut -d= -f2 || echo "")

    log_info "Terraform: ${TF_SECRET:0:8}..."
    log_info "GCP:       ${GCP_SECRET:0:8}..."
    log_info "Container: ${CONTAINER_SECRET:0:8}..."

    if [ "$TF_SECRET" = "$GCP_SECRET" ] && [ "$GCP_SECRET" = "$CONTAINER_SECRET" ]; then
        log_success "${SPOKE_CODE} secrets are synchronized"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "${SPOKE_CODE} secrets are OUT OF SYNC"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST SUITE 2: KAS TERMINOLOGY CONSISTENCY
# =============================================================================

test_kas_terminology_code() {
    log_section "TEST: KAS Terminology in Code"

    cd "${DIVE_ROOT}/backend/src"

    # Check for kasInstances (should be 0)
    KASINSTANCES_COUNT=$(grep -r "kasInstances" . --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')

    # Check for kasServers (should be > 0)
    KASSERVERS_COUNT=$(grep -r "kasServers" . --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')

    log_info "kasInstances references: $KASINSTANCES_COUNT (should be 0)"
    log_info "kasServers references: $KASSERVERS_COUNT (should be > 0)"

    if [ "$KASINSTANCES_COUNT" -eq 0 ] && [ "$KASSERVERS_COUNT" -gt 0 ]; then
        log_success "KAS terminology is consistent (kasServers)"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "KAS terminology is INCONSISTENT"
        ((TESTS_FAILED++))
        return 1
    fi
}

test_kas_mongodb_collection() {
    log_section "TEST: KAS MongoDB Collection Name"

    # Check hub MongoDB
    MONGO_PASSWORD=$(gcloud secrets versions access latest \
        --secret=dive-v3-mongodb-usa \
        --project="${GCP_PROJECT}" 2>/dev/null)

    if [ -z "$MONGO_PASSWORD" ]; then
        log_warn "Could not retrieve MongoDB password, skipping"
        ((TESTS_SKIPPED++))
        return 0
    fi

    # Check if kas_servers collection exists
    COLLECTION_EXISTS=$(docker exec dive-hub-mongodb mongosh \
        "mongodb://admin:${MONGO_PASSWORD}@localhost:27017/dive-v3?authSource=admin" \
        --quiet --eval "db.getCollectionNames().includes('kas_servers')" 2>/dev/null || echo "false")

    log_info "kas_servers collection exists: $COLLECTION_EXISTS"

    if [ "$COLLECTION_EXISTS" = "true" ]; then
        log_success "MongoDB collection correctly named (kas_servers)"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "MongoDB collection NOT found or incorrectly named"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST SUITE 3: VALIDATION ENDPOINT
# =============================================================================

test_validation_endpoint() {
    log_section "TEST: Validation Endpoint"

    # Check if backend is running
    if ! docker ps | grep -q "dive-hub-backend"; then
        log_warn "Hub backend not running, skipping"
        ((TESTS_SKIPPED++))
        return 0
    fi

    # Test health check endpoint (no auth required)
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -k "https://localhost:4000/api/admin/health-check" 2>/dev/null || echo "000")

    log_info "Health check HTTP status: $HTTP_CODE"

    if [ "$HTTP_CODE" = "200" ]; then
        log_success "Validation endpoint is accessible"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "Validation endpoint NOT accessible (HTTP $HTTP_CODE)"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST SUITE 4: END-TO-END LOGIN
# =============================================================================

test_login_hub() {
    log_section "TEST: USA Hub Login Flow"

    # Check if hub is running
    if ! docker ps | grep -q "dive-hub-frontend"; then
        log_warn "Hub not running, skipping"
        ((TESTS_SKIPPED++))
        return 0
    fi

    # Test that homepage loads
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -k "https://localhost:3000" 2>/dev/null || echo "000")

    log_info "Hub homepage HTTP status: $HTTP_CODE"

    if [ "$HTTP_CODE" = "200" ]; then
        log_success "Hub homepage accessible"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "Hub homepage NOT accessible (HTTP $HTTP_CODE)"
        ((TESTS_FAILED++))
        return 1
    fi
}

test_login_spoke() {
    local SPOKE_CODE=$1
    local spoke_lower=$(echo "$SPOKE_CODE" | tr '[:upper:]' '[:lower:]')
    local PORT=$2

    log_section "TEST: ${SPOKE_CODE} Spoke Login Flow"

    # Check if spoke is running
    if ! docker ps | grep -q "dive-spoke-${spoke_lower}-frontend"; then
        log_warn "${SPOKE_CODE} not running, skipping"
        ((TESTS_SKIPPED++))
        return 0
    fi

    # Test that homepage loads
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -k "https://localhost:${PORT}" 2>/dev/null || echo "000")

    log_info "${SPOKE_CODE} homepage HTTP status: $HTTP_CODE"

    if [ "$HTTP_CODE" = "200" ]; then
        log_success "${SPOKE_CODE} homepage accessible"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "${SPOKE_CODE} homepage NOT accessible (HTTP $HTTP_CODE)"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST SUITE 5: SCRIPT FUNCTIONALITY
# =============================================================================

test_sync_script_exists() {
    log_section "TEST: Sync Script Exists"

    if [ -f "${DIVE_ROOT}/scripts/sync-terraform-secrets.sh" ]; then
        log_success "Sync script exists"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "Sync script NOT found"
        ((TESTS_FAILED++))
        return 1
    fi
}

test_migration_script_exists() {
    log_section "TEST: Migration Script Exists"

    if [ -f "${DIVE_ROOT}/scripts/migrate-kas-collection.sh" ]; then
        log_success "Migration script exists"
        ((TESTS_PASSED++))
        return 0
    else
        log_error "Migration script NOT found"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# MAIN TEST RUNNER
# =============================================================================

run_all_tests() {
    log_section "DIVE V3 COMPREHENSIVE TEST SUITE"
    log_info "Testing Secret Drift & KAS Terminology Fixes"
    echo ""

    # Suite 1: Secret Sync
    test_secret_sync_hub
    test_secret_sync_spoke "NZL"
    test_secret_sync_spoke "FRA"

    # Suite 2: KAS Terminology
    test_kas_terminology_code
    test_kas_mongodb_collection

    # Suite 3: Validation
    test_validation_endpoint

    # Suite 4: Login Flows
    test_login_hub
    test_login_spoke "NZL" "3032"

    # Suite 5: Scripts
    test_sync_script_exists
    test_migration_script_exists

    # Print summary
    log_section "TEST SUMMARY"
    echo -e "${GREEN}✅ Passed:  $TESTS_PASSED${NC}"
    echo -e "${RED}❌ Failed:  $TESTS_FAILED${NC}"
    echo -e "${YELLOW}⏭️  Skipped: $TESTS_SKIPPED${NC}"
    echo ""

    TOTAL=$((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))
    if [ $TOTAL -gt 0 ]; then
        PASS_RATE=$((TESTS_PASSED * 100 / (TESTS_PASSED + TESTS_FAILED)))
        echo -e "${BOLD}Pass Rate: ${PASS_RATE}%${NC}"
    fi

    if [ $TESTS_FAILED -eq 0 ]; then
        log_success "ALL TESTS PASSED!"
        return 0
    else
        log_error "SOME TESTS FAILED"
        return 1
    fi
}

# =============================================================================
# COMMAND DISPATCH
# =============================================================================

case "${1:-all}" in
    all)
        run_all_tests
        ;;
    secrets)
        test_secret_sync_hub
        test_secret_sync_spoke "NZL"
        ;;
    kas)
        test_kas_terminology_code
        test_kas_mongodb_collection
        ;;
    validation)
        test_validation_endpoint
        ;;
    login)
        test_login_hub
        test_login_spoke "NZL" "3032"
        ;;
    scripts)
        test_sync_script_exists
        test_migration_script_exists
        ;;
    help|--help|-h)
        cat << EOF
DIVE V3 Comprehensive Test Suite

Usage:
  ./tests/comprehensive-test-suite.sh [suite]

Suites:
  all         Run all test suites (default)
  secrets     Test secret synchronization
  kas         Test KAS terminology consistency
  validation  Test validation endpoint
  login       Test login flows
  scripts     Test script existence

Examples:
  ./tests/comprehensive-test-suite.sh
  ./tests/comprehensive-test-suite.sh secrets
  ./tests/comprehensive-test-suite.sh kas

EOF
        ;;
    *)
        log_error "Unknown test suite: $1"
        exit 1
        ;;
esac
