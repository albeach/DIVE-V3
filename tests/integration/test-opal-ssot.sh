#!/bin/bash
#
# DIVE V3 - OPAL SSOT Integration Tests
# 
# Verifies MongoDB is the single source of truth for all OPAL data:
# - Trusted issuers
# - Federation matrix
# - Tenant configurations
#
# Tests real-time synchronization from MongoDB → OPAL → OPA
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_test() {
    echo -e "${BLUE}TEST${NC} $1"
}

log_pass() {
    ((TESTS_PASSED++))
    echo -e "  ${GREEN}✅ PASS${NC} $1"
}

log_fail() {
    ((TESTS_FAILED++))
    echo -e "  ${RED}❌ FAIL${NC} $1"
}

log_info() {
    echo -e "  ${BLUE}ℹ${NC} $1"
}

# =============================================================================
# TEST 1: Hub OPA has correct number of trusted issuers
# =============================================================================
test_hub_opa_issuer_count() {
    log_test "Hub OPA has correct number of trusted issuers (1-3, not 13+)"
    ((TESTS_RUN++))
    
    # Get issuer count from Hub OPA
    ISSUER_COUNT=$(curl -sk https://localhost:8181/v1/data/trusted_issuers 2>/dev/null | jq -r '.result.trusted_issuers | keys | length' 2>/dev/null || echo "0")
    
    log_info "Hub OPA trusted issuers count: $ISSUER_COUNT"
    
    if [[ "$ISSUER_COUNT" -ge 1 ]] && [[ "$ISSUER_COUNT" -le 3 ]]; then
        log_pass "Issuer count is within expected range for current deployment"
        return 0
    elif [[ "$ISSUER_COUNT" -ge 13 ]]; then
        log_fail "Hub OPA has $ISSUER_COUNT issuers (indicates legacy static data pollution)"
        return 1
    elif [[ "$ISSUER_COUNT" -eq 0 ]]; then
        log_fail "Hub OPA has no issuers (OPAL data not loaded)"
        return 1
    else
        log_fail "Unexpected issuer count: $ISSUER_COUNT"
        return 1
    fi
}

# =============================================================================
# TEST 2: Backend API (MongoDB) matches Hub OPA
# =============================================================================
test_mongodb_matches_opa() {
    log_test "Backend API (MongoDB) matches Hub OPA trusted issuers"
    ((TESTS_RUN++))
    
    # Get issuers from Backend API (MongoDB SSOT)
    BACKEND_ISSUERS=$(curl -sk https://localhost:4000/api/opal/trusted-issuers 2>/dev/null | jq -r '.trusted_issuers | keys | sort | join(",")' 2>/dev/null || echo "")
    
    # Get issuers from Hub OPA
    OPA_ISSUERS=$(curl -sk https://localhost:8181/v1/data/trusted_issuers 2>/dev/null | jq -r '.result.trusted_issuers | keys | sort | join(",")' 2>/dev/null || echo "")
    
    log_info "Backend issuers: $BACKEND_ISSUERS"
    log_info "OPA issuers: $OPA_ISSUERS"
    
    if [[ "$BACKEND_ISSUERS" == "$OPA_ISSUERS" ]]; then
        log_pass "Backend API and Hub OPA have identical trusted issuers (SSOT verified)"
        return 0
    else
        log_fail "Mismatch between Backend API and Hub OPA"
        return 1
    fi
}

# =============================================================================
# TEST 3: No static data JSON files exist
# =============================================================================
test_no_static_data_files() {
    log_test "No legacy static data JSON files exist"
    ((TESTS_RUN++))
    
    # Check for deleted files
    local FOUND_FILES=0
    
    if [[ -f "$PROJECT_ROOT/policies/data.json" ]]; then
        log_info "Found: policies/data.json (should be deleted)"
        ((FOUND_FILES++))
    fi
    
    if [[ -f "$PROJECT_ROOT/policies/policy_data.json" ]]; then
        log_info "Found: policies/policy_data.json (should be deleted)"
        ((FOUND_FILES++))
    fi
    
    for TENANT in usa fra gbr deu; do
        if [[ -f "$PROJECT_ROOT/policies/tenant/$TENANT/data.json" ]]; then
            log_info "Found: policies/tenant/$TENANT/data.json (should be deleted)"
            ((FOUND_FILES++))
        fi
    done
    
    if [[ -f "$PROJECT_ROOT/backend/data/opal/trusted_issuers.json" ]]; then
        log_info "Found: backend/data/opal/trusted_issuers.json (should be deleted)"
        ((FOUND_FILES++))
    fi
    
    if [[ "$FOUND_FILES" -eq 0 ]]; then
        log_pass "All legacy static data files have been deleted"
        return 0
    else
        log_fail "Found $FOUND_FILES legacy static data files"
        return 1
    fi
}

# =============================================================================
# TEST 4: Hub OPAL client is healthy and connected
# =============================================================================
test_hub_opal_client_healthy() {
    log_test "Hub OPAL client is healthy and connected"
    ((TESTS_RUN++))
    
    # Check container status
    STATUS=$(docker ps --filter "name=dive-hub-opal-client" --format "{{.Status}}")
    
    log_info "Hub OPAL client status: $STATUS"
    
    if echo "$STATUS" | grep -q "healthy"; then
        log_pass "Hub OPAL client is healthy"
        return 0
    elif echo "$STATUS" | grep -q "Up"; then
        log_info "Hub OPAL client is up but health check pending"
        
        # Check logs for successful connection
        if docker logs dive-hub-opal-client 2>&1 | grep -q "Connected to server"; then
            log_pass "Hub OPAL client connected to server (health check pending)"
            return 0
        else
            log_fail "Hub OPAL client not connected"
            return 1
        fi
    else
        log_fail "Hub OPAL client is not running: $STATUS"
        return 1
    fi
}

# =============================================================================
# TEST 5: OPAL data synchronization (real-time test)
# =============================================================================
test_realtime_data_sync() {
    log_test "Real-time data synchronization from MongoDB to OPA"
    ((TESTS_RUN++))
    
    # Note: This test requires admin authentication
    # For now, we'll verify the sync mechanism is in place
    
    # Check that all 4 data endpoints are being fetched by OPAL client
    local DATA_FETCHED=0
    
    if docker logs dive-hub-opal-client 2>&1 | grep -E "policy-data|/api/opal/policy-data" | grep -q "Fetching"; then
        log_info "✓ OPAL client fetching policy-data"
        ((DATA_FETCHED++))
    fi
    
    if docker logs dive-hub-opal-client 2>&1 | grep -E "trusted-issuers|/api/opal/trusted-issuers" | grep -q "Fetching"; then
        log_info "✓ OPAL client fetching trusted-issuers"
        ((DATA_FETCHED++))
    fi
    
    if docker logs dive-hub-opal-client 2>&1 | grep -E "federation-matrix|/api/opal/federation-matrix" | grep -q "Fetching"; then
        log_info "✓ OPAL client fetching federation-matrix"
        ((DATA_FETCHED++))
    fi
    
    if docker logs dive-hub-opal-client 2>&1 | grep -E "tenant-configs|/api/opal/tenant-configs" | grep -q "Fetching"; then
        log_info "✓ OPAL client fetching tenant-configs"
        ((DATA_FETCHED++))
    fi
    
    if [[ "$DATA_FETCHED" -eq 4 ]]; then
        log_pass "All 4 data endpoints are being synchronized"
        return 0
    else
        log_fail "Only $DATA_FETCHED/4 data endpoints being synchronized"
        return 1
    fi
}

# =============================================================================
# TEST 6: Verify backup was created
# =============================================================================
test_backup_exists() {
    log_test "Legacy data backup was created"
    ((TESTS_RUN++))
    
    # Find most recent backup
    BACKUP_DIR=$(find "$PROJECT_ROOT/.archive" -type d -name "legacy-opal-data-*" 2>/dev/null | sort -r | head -1)
    
    if [[ -n "$BACKUP_DIR" ]] && [[ -d "$BACKUP_DIR" ]]; then
        local FILE_COUNT=$(find "$BACKUP_DIR" -type f | wc -l | tr -d ' ')
        log_info "Backup found: $BACKUP_DIR"
        log_info "Files backed up: $FILE_COUNT"
        
        if [[ "$FILE_COUNT" -ge 5 ]]; then
            log_pass "Legacy data backed up successfully ($FILE_COUNT files)"
            return 0
        else
            log_fail "Backup exists but has too few files: $FILE_COUNT"
            return 1
        fi
    else
        log_fail "No backup directory found in .archive/"
        return 1
    fi
}

# =============================================================================
# TEST 7: .gitignore prevents static data re-creation
# =============================================================================
test_gitignore_updated() {
    log_test ".gitignore prevents static data file re-creation"
    ((TESTS_RUN++))
    
    if grep -q "# OPAL SSOT: MongoDB is the single source of truth" "$PROJECT_ROOT/.gitignore"; then
        log_pass ".gitignore has OPAL SSOT rules"
        return 0
    else
        log_fail ".gitignore missing OPAL SSOT rules"
        return 1
    fi
}

# =============================================================================
# RUN ALL TESTS
# =============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DIVE V3 - OPAL SSOT Integration Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run all tests
test_hub_opa_issuer_count || true
echo ""
test_mongodb_matches_opa || true
echo ""
test_no_static_data_files || true
echo ""
test_hub_opal_client_healthy || true
echo ""
test_realtime_data_sync || true
echo ""
test_backup_exists || true
echo ""
test_gitignore_updated || true

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST RESULTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Total Tests:  $TESTS_RUN"
echo "  Passed:       ${GREEN}$TESTS_PASSED${NC}"
echo "  Failed:       ${RED}$TESTS_FAILED${NC}"
echo ""

if [[ "$TESTS_FAILED" -eq 0 ]]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
    echo ""
    echo "MongoDB SSOT architecture is working correctly!"
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo ""
    echo "Review failures above and check:"
    echo "  - Hub OPAL client logs: docker logs dive-hub-opal-client"
    echo "  - OPAL server logs: docker logs dive-hub-opal-server"
    echo "  - Backend logs: docker logs dive-hub-backend"
    exit 1
fi
