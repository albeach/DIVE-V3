#!/bin/bash
# =============================================================================
# DIVE V3 Backup Module Enhancement Tests
# =============================================================================
# Validates the enhanced backup.sh module with archival strategy features
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
    ((TESTS_RUN++))
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_info() {
    echo -e "[INFO] $1"
}

# =============================================================================
# SETUP
# =============================================================================

setup_test_environment() {
    log_info "Setting up test environment..."
    
    # Create test backup directory
    export TEST_BACKUP_DIR="${PROJECT_ROOT}/backups/test-$(date +%s)"
    mkdir -p "$TEST_BACKUP_DIR"
    
    # Create test archive directory
    export TEST_ARCHIVE_DIR="${PROJECT_ROOT}/backups/test-archive-$(date +%s)"
    mkdir -p "$TEST_ARCHIVE_DIR"
    
    # Override environment variables for testing
    export BACKUP_DIR="$TEST_BACKUP_DIR"
    export ARCHIVE_DIR="$TEST_ARCHIVE_DIR"
    export BACKUP_ENCRYPT="false"  # Disable encryption for tests
    export EXTERNAL_STORAGE_TYPE=""  # Disable external sync for tests
    
    log_info "Test backup dir: $TEST_BACKUP_DIR"
    log_info "Test archive dir: $TEST_ARCHIVE_DIR"
}

cleanup_test_environment() {
    log_info "Cleaning up test environment..."
    
    if [ -d "$TEST_BACKUP_DIR" ]; then
        rm -rf "$TEST_BACKUP_DIR"
    fi
    
    if [ -d "$TEST_ARCHIVE_DIR" ]; then
        rm -rf "$TEST_ARCHIVE_DIR"
    fi
    
    log_info "Test environment cleaned up"
}

# =============================================================================
# MODULE LOADING TEST
# =============================================================================

test_module_loading() {
    log_test "Testing module loading..."
    
    # Source the backup module
    if source "${PROJECT_ROOT}/scripts/dive-modules/utilities/backup.sh" 2>/dev/null; then
        log_pass "Module loaded successfully"
        return 0
    else
        log_fail "Failed to load backup module"
        return 1
    fi
}

# =============================================================================
# CHECKSUM TESTS
# =============================================================================

test_checksum_creation() {
    log_test "Testing checksum creation..."
    
    # Create a test file
    local test_file="${TEST_BACKUP_DIR}/test-backup.tar.gz"
    echo "test data" | gzip > "$test_file"
    
    # Generate checksum
    if backup_checksum_create "$test_file" >/dev/null 2>&1; then
        if [ -f "${test_file}.sha256" ]; then
            log_pass "Checksum file created"
            return 0
        else
            log_fail "Checksum file not found"
            return 1
        fi
    else
        log_fail "Failed to create checksum"
        return 1
    fi
}

test_checksum_verification() {
    log_test "Testing checksum verification..."
    
    # Create test file and checksum
    local test_file="${TEST_BACKUP_DIR}/test-verify.tar.gz"
    echo "test data for verification" | gzip > "$test_file"
    backup_checksum_create "$test_file" >/dev/null 2>&1
    
    # Verify checksum
    if backup_checksum_verify "$test_file" >/dev/null 2>&1; then
        log_pass "Checksum verification passed"
        return 0
    else
        log_fail "Checksum verification failed"
        return 1
    fi
}

test_checksum_failure_detection() {
    log_test "Testing checksum failure detection..."
    
    # Create test file and checksum
    local test_file="${TEST_BACKUP_DIR}/test-corrupt.tar.gz"
    echo "original data" | gzip > "$test_file"
    backup_checksum_create "$test_file" >/dev/null 2>&1
    
    # Corrupt the file
    echo "corrupted data" | gzip > "$test_file"
    
    # Verify checksum should fail
    if ! backup_checksum_verify "$test_file" >/dev/null 2>&1; then
        log_pass "Corruption detected successfully"
        return 0
    else
        log_fail "Failed to detect corruption"
        return 1
    fi
}

# =============================================================================
# TIER CLASSIFICATION TESTS
# =============================================================================

test_tier_classification() {
    log_test "Testing tier classification..."
    
    local passed=0
    local failed=0
    
    # Test Tier 1 (Critical)
    local tier=$(backup_get_tier "${TEST_BACKUP_DIR}/production_backup.tar.gz")
    if [ "$tier" = "1" ]; then
        ((passed++))
    else
        ((failed++))
        log_info "  Expected Tier 1 for production backup, got Tier $tier"
    fi
    
    # Test Tier 2 (Historical)
    tier=$(backup_get_tier "${TEST_BACKUP_DIR}/docs-archive-20260125.tar.gz")
    if [ "$tier" = "2" ]; then
        ((passed++))
    else
        ((failed++))
        log_info "  Expected Tier 2 for docs archive, got Tier $tier"
    fi
    
    # Test Tier 3 (Development)
    tier=$(backup_get_tier "${TEST_BACKUP_DIR}/optional-items-backup.tar.gz")
    if [ "$tier" = "3" ]; then
        ((passed++))
    else
        ((failed++))
        log_info "  Expected Tier 3 for optional items, got Tier $tier"
    fi
    
    # Test Tier 4 (Temporary - default)
    tier=$(backup_get_tier "${TEST_BACKUP_DIR}/random-backup.tar.gz")
    if [ "$tier" = "4" ]; then
        ((passed++))
    else
        ((failed++))
        log_info "  Expected Tier 4 for random backup, got Tier $tier"
    fi
    
    if [ $failed -eq 0 ]; then
        log_pass "All tier classifications correct ($passed/4)"
        return 0
    else
        log_fail "Some tier classifications incorrect ($passed/4 passed)"
        return 1
    fi
}

test_retention_policies() {
    log_test "Testing retention policies..."
    
    # Test retention periods for each tier
    local ret1=$(backup_get_retention "${TEST_BACKUP_DIR}/production_backup.tar.gz")
    local ret2=$(backup_get_retention "${TEST_BACKUP_DIR}/docs-archive.tar.gz")
    local ret3=$(backup_get_retention "${TEST_BACKUP_DIR}/optional-backup.tar.gz")
    local ret4=$(backup_get_retention "${TEST_BACKUP_DIR}/temp-backup.tar.gz")
    
    log_info "  Tier 1 retention: ${ret1} days"
    log_info "  Tier 2 retention: ${ret2} days"
    log_info "  Tier 3 retention: ${ret3} days"
    log_info "  Tier 4 retention: ${ret4} days"
    
    # Validate retention values are reasonable
    if [ "$ret1" -gt "$ret2" ] && [ "$ret2" -gt "$ret3" ] && [ "$ret3" -gt "$ret4" ]; then
        log_pass "Retention policies correctly ordered (T1 > T2 > T3 > T4)"
        return 0
    else
        log_fail "Retention policies not correctly ordered"
        return 1
    fi
}

# =============================================================================
# ARCHIVE MANAGEMENT TESTS
# =============================================================================

test_archive_old_backups() {
    log_test "Testing archive management..."
    
    # Create test backup files with different ages
    local old_backup="${TEST_BACKUP_DIR}/old-backup-20250101.tar.gz"
    local recent_backup="${TEST_BACKUP_DIR}/recent-backup-$(date +%Y%m%d).tar.gz"
    
    echo "old data" | gzip > "$old_backup"
    echo "recent data" | gzip > "$recent_backup"
    
    # Make old backup appear old (8 days)
    touch -t $(date -v-8d +%Y%m%d0000 2>/dev/null || date -d "8 days ago" +%Y%m%d0000) "$old_backup" 2>/dev/null || true
    
    # Archive old backups (older than 7 days)
    if backup_archive_old 7 >/dev/null 2>&1; then
        # Check if old backup was archived
        if [ -f "${ARCHIVE_DIR}/tier4/$(basename "$old_backup")" ]; then
            # Check if recent backup remains
            if [ -f "$recent_backup" ]; then
                log_pass "Old backups archived, recent backups preserved"
                return 0
            else
                log_fail "Recent backup was incorrectly archived"
                return 1
            fi
        else
            log_fail "Old backup was not archived"
            return 1
        fi
    else
        log_fail "Archive operation failed"
        return 1
    fi
}

# =============================================================================
# ENCRYPTION TESTS
# =============================================================================

test_encryption_keygen() {
    log_test "Testing encryption key generation..."
    
    # Remove existing key if any
    local test_key_file="${PROJECT_ROOT}/certs/test-backup-key.pem"
    rm -f "$test_key_file"
    
    # Set temporary key file location
    export BACKUP_KEY_FILE="$test_key_file"
    export BACKUP_ENCRYPT="true"
    
    # Create test file
    local test_file="${TEST_BACKUP_DIR}/test-encrypt.tar.gz"
    echo "data to encrypt" | gzip > "$test_file"
    
    # Attempt encryption (should create key)
    if backup_encrypt "$test_file" >/dev/null 2>&1; then
        if [ -f "$test_key_file" ]; then
            log_pass "Encryption key generated successfully"
            rm -f "$test_key_file"
            return 0
        else
            log_fail "Encryption key not created"
            return 1
        fi
    else
        log_fail "Encryption failed"
        return 1
    fi
}

# =============================================================================
# INTEGRATION TESTS
# =============================================================================

test_backup_list_enhanced() {
    log_test "Testing enhanced backup list..."
    
    # Create test backups of different tiers
    echo "tier1" | gzip > "${TEST_BACKUP_DIR}/production_20260125.tar.gz"
    echo "tier2" | gzip > "${TEST_BACKUP_DIR}/docs-archive-20260125.tar.gz"
    echo "tier3" | gzip > "${TEST_BACKUP_DIR}/optional-20260125.tar.gz"
    
    # Generate checksums
    backup_checksum_create "${TEST_BACKUP_DIR}/production_20260125.tar.gz" >/dev/null 2>&1
    backup_checksum_create "${TEST_BACKUP_DIR}/docs-archive-20260125.tar.gz" >/dev/null 2>&1
    
    # List backups
    if backup_list | grep -q "TIER"; then
        if backup_list | grep -q "CHECKSUM"; then
            log_pass "Enhanced backup list displays tier and checksum info"
            return 0
        else
            log_fail "Checksum column not displayed"
            return 1
        fi
    else
        log_fail "Tier column not displayed"
        return 1
    fi
}

# =============================================================================
# MAIN TEST EXECUTION
# =============================================================================

main() {
    echo ""
    echo "========================================"
    echo "DIVE V3 Backup Module Enhancement Tests"
    echo "========================================"
    echo ""
    
    # Setup
    setup_test_environment
    
    # Run tests
    test_module_loading
    test_checksum_creation
    test_checksum_verification
    test_checksum_failure_detection
    test_tier_classification
    test_retention_policies
    test_archive_old_backups
    test_encryption_keygen
    test_backup_list_enhanced
    
    # Cleanup
    cleanup_test_environment
    
    # Summary
    echo ""
    echo "========================================"
    echo "TEST SUMMARY"
    echo "========================================"
    echo "Tests Run:    $TESTS_RUN"
    echo "Tests Passed: $TESTS_PASSED"
    echo "Tests Failed: $TESTS_FAILED"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
        echo ""
        exit 0
    else
        echo -e "${RED}✗ SOME TESTS FAILED${NC}"
        echo ""
        exit 1
    fi
}

main "$@"
