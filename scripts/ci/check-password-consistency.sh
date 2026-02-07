#!/usr/bin/env bash
# =============================================================================
# CI Check: Password Consistency Validator
# =============================================================================
# Purpose: Verify all password definitions match the SSOT
#
# SSOT Established: Phase 4 Session 6 (2026-02-06)
# - Test User Password: TestUser2025!Pilot
# - Admin User Password: TestUser2025!SecureAdmin
#
# This script ensures no files use the old password (DiveTestSecure2025!)
# or introduce new conflicting password definitions.
#
# Usage: ./scripts/ci/check-password-consistency.sh
# Exit: 0 if consistent, 1 if conflicts found
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_step()    { echo -e "${BLUE}▶${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn()    { echo -e "${YELLOW}⚠${NC} $1"; }
log_error()   { echo -e "${RED}✗${NC} $1"; }
log_info()    { echo -e "${CYAN}ℹ${NC} $1"; }

# =============================================================================
# SSOT DEFINITIONS
# =============================================================================
SSOT_TEST_PASSWORD="TestUser2025!Pilot"
SSOT_ADMIN_PASSWORD="TestUser2025!SecureAdmin"

# OLD passwords that should NOT appear
OLD_TEST_PASSWORD="DiveTestSecure2025!"

# Files that MUST contain SSOT password
CRITICAL_FILES=(
    "scripts/hub-init/seed-hub-users.sh"
    "scripts/spoke-init/seed-spoke-users.sh"
    "docker-compose.hub.yml"
    "templates/spoke/docker-compose.template.yml"
    "keycloak/scripts/import-realm.sh"
)

# =============================================================================
# CHECK FUNCTIONS
# =============================================================================

check_file_for_password() {
    local file="$1"
    local expected_password="$2"
    local password_var="$3"

    if [ ! -f "$file" ]; then
        log_warn "File not found: $file"
        return 1
    fi

    # Check if file contains the SSOT password
    if grep -q "$expected_password" "$file"; then
        return 0
    else
        return 1
    fi
}

check_file_for_old_password() {
    local file="$1"
    local old_password="$2"

    if [ ! -f "$file" ]; then
        return 0 # File doesn't exist, so no old password
    fi

    # Check if file contains the old password
    if grep -q "$old_password" "$file"; then
        return 1 # Found old password
    else
        return 0 # No old password found
    fi
}

# =============================================================================
# MAIN VALIDATION
# =============================================================================

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Password Consistency Validation                      ║"
echo "║              SSOT: Phase 4 Session 6                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

log_step "SSOT Passwords:"
echo "  Test User:  $SSOT_TEST_PASSWORD"
echo "  Admin User: $SSOT_ADMIN_PASSWORD"
echo ""

ERRORS=0

# =============================================================================
# Check 1: Critical files contain SSOT password
# =============================================================================
log_step "Check 1/4: Verifying critical files contain SSOT password..."
echo ""

for file in "${CRITICAL_FILES[@]}"; do
    full_path="${PROJECT_ROOT}/${file}"

    if check_file_for_password "$full_path" "$SSOT_TEST_PASSWORD" "TEST_USER_PASSWORD"; then
        log_success "$file ✓"
    else
        log_error "$file ✗ (missing SSOT password)"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# =============================================================================
# Check 2: No files contain OLD password
# =============================================================================
log_step "Check 2/4: Scanning for old password (should be 0 occurrences)..."
echo ""

# Search for old password in key file types
OLD_PASSWORD_FILES=$(grep -r "$OLD_TEST_PASSWORD" "$PROJECT_ROOT" \
    --include="*.sh" \
    --include="*.yml" \
    --include="*.yaml" \
    --include="*.ts" \
    --include="*.tsx" \
    --include="*.js" \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=dist \
    --exclude-dir=build \
    --files-with-matches 2>/dev/null || echo "")

if [ -z "$OLD_PASSWORD_FILES" ]; then
    log_success "No files contain old password ($OLD_TEST_PASSWORD)"
else
    log_error "Found old password in the following files:"
    echo "$OLD_PASSWORD_FILES" | while read -r file; do
        echo "  ❌ $file"
        ERRORS=$((ERRORS + 1))
    done
fi
echo ""

# =============================================================================
# Check 3: Password variable assignments are correct
# =============================================================================
log_step "Check 3/4: Validating password variable assignments..."
echo ""

# Check TEST_USER_PASSWORD assignments
TEST_PWD_ASSIGNMENTS=$(grep -r "TEST_USER_PASSWORD=" "$PROJECT_ROOT" \
    --include="*.sh" \
    --include="*.yml" \
    --include="*.yaml" \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    2>/dev/null | grep -v "export TEST_USER_PASSWORD=" || echo "")

if [ -n "$TEST_PWD_ASSIGNMENTS" ]; then
    echo "$TEST_PWD_ASSIGNMENTS" | while IFS= read -r line; do
        file=$(echo "$line" | cut -d: -f1)
        assignment=$(echo "$line" | cut -d: -f2-)

        if echo "$assignment" | grep -q "$SSOT_TEST_PASSWORD"; then
            log_success "$(basename "$file"): $assignment ✓"
        elif echo "$assignment" | grep -q "\${TEST_USER_PASSWORD"; then
            log_info "$(basename "$file"): $assignment (using env var)"
        else
            log_error "$(basename "$file"): $assignment ✗"
            ERRORS=$((ERRORS + 1))
        fi
    done
fi
echo ""

# =============================================================================
# Check 4: Documentation is up to date
# =============================================================================
log_step "Check 4/4: Verifying documentation references..."
echo ""

DOCS_TO_CHECK=(
    "docs/USER-SEEDING-SSOT.md"
    "docs/FEDERATION-ATTRIBUTE-SYNC-FIX.md"
    "PHASE4_SESSION6_SUMMARY.md"
)

for doc in "${DOCS_TO_CHECK[@]}"; do
    doc_path="${PROJECT_ROOT}/${doc}"

    if [ ! -f "$doc_path" ]; then
        log_warn "$doc not found (may not be created yet)"
        continue
    fi

    if grep -q "$SSOT_TEST_PASSWORD" "$doc_path"; then
        log_success "$doc references correct password ✓"
    else
        log_warn "$doc does not reference SSOT password"
    fi
done
echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo "═══════════════════════════════════════════════════════════════"

if [ $ERRORS -eq 0 ]; then
    log_success "✅ PASS: All password definitions are consistent with SSOT"
    echo ""
    echo "  SSOT Test Password: $SSOT_TEST_PASSWORD"
    echo "  No conflicts found"
    echo ""
    exit 0
else
    log_error "❌ FAIL: Found $ERRORS password consistency issue(s)"
    echo ""
    echo "  SSOT Test Password: $SSOT_TEST_PASSWORD"
    echo ""
    echo "  To fix:"
    echo "  1. Replace all occurrences of old password with SSOT password"
    echo "  2. Update any hardcoded passwords to use environment variables"
    echo "  3. Reference docs/USER-SEEDING-SSOT.md for guidelines"
    echo ""
    echo "  Common locations to check:"
    echo "    - docker-compose*.yml files"
    echo "    - scripts/**/seed-*-users.sh"
    echo "    - keycloak/scripts/*.sh"
    echo "    - tests/**/*.ts"
    echo ""
    exit 1
fi
