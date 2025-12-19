#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - Phase 2 Regression Tests (Secrets Standardization)
# =============================================================================
# Validates secrets naming convention and lint integration.
# Run after Phase 1 tests: ./tests/docker/phase1-compose-tests.sh
#
# Usage:
#   ./tests/docker/phase2-secrets-tests.sh
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0

# Project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Test helpers
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((++PASSED)) || true
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((++FAILED)) || true
}

skip() {
    echo -e "${YELLOW}○${NC} $1 (skipped)"
}

section() {
    echo ""
    echo -e "${CYAN}=== $1 ===${NC}"
}

# =============================================================================
# TESTS
# =============================================================================

section "Secrets Lint Script"

# Test 1: Lint script exists and is executable
if [[ -x "$PROJECT_ROOT/scripts/lint-secrets.sh" ]]; then
    pass "lint-secrets.sh exists and is executable"
else
    fail "lint-secrets.sh missing or not executable"
fi

# Test 2: Lint script has proper structure
if grep -q 'check_compose_files' "$PROJECT_ROOT/scripts/lint-secrets.sh" 2>/dev/null; then
    pass "lint-secrets.sh has check_compose_files function"
else
    fail "lint-secrets.sh missing check_compose_files function"
fi

# Test 3: Lint script has --ci mode
if "$PROJECT_ROOT/scripts/lint-secrets.sh" --help 2>&1 | grep -q -- '--ci'; then
    pass "lint-secrets.sh supports --ci mode"
else
    fail "lint-secrets.sh missing --ci mode"
fi

section "Secrets Module CLI"

# Test 4: ./dive secrets lint command exists
if grep -q 'lint)' "$PROJECT_ROOT/scripts/dive-modules/secrets.sh" 2>/dev/null; then
    pass "./dive secrets lint command registered"
else
    fail "./dive secrets lint command not found"
fi

# Test 5: ./dive secrets verify-all command exists
if grep -q 'verify-all)' "$PROJECT_ROOT/scripts/dive-modules/secrets.sh" 2>/dev/null; then
    pass "./dive secrets verify-all command registered"
else
    fail "./dive secrets verify-all command not found"
fi

# Test 6: secrets_lint function defined
if grep -q 'secrets_lint()' "$PROJECT_ROOT/scripts/dive-modules/secrets.sh" 2>/dev/null; then
    pass "secrets_lint() function defined"
else
    fail "secrets_lint() function not found"
fi

section "Compose Files: Required Syntax"

# Test 7: All spoke compose files use ${VAR:?required} for passwords
MISSING_REQUIRED=0
for spoke_dir in "$PROJECT_ROOT"/instances/*/; do
    local_file="${spoke_dir}docker-compose.yml"
    [[ ! -f "$local_file" ]] && continue
    
    # Skip hub/shared
    dirname=$(basename "$spoke_dir")
    [[ "$dirname" == "hub" || "$dirname" == "shared" ]] && continue
    
    # Check for PASSWORD vars using :? syntax
    if grep -E 'PASSWORD.*\$\{[A-Z_]+\}' "$local_file" 2>/dev/null | grep -qv ':?'; then
        ((MISSING_REQUIRED++))
    fi
done

if [[ $MISSING_REQUIRED -eq 0 ]]; then
    pass "All spoke compose files use \${VAR:?required} syntax"
else
    fail "$MISSING_REQUIRED spoke files missing :? required syntax"
fi

# Test 8: No hardcoded passwords in compose files
HARDCODED=0
for file in "$PROJECT_ROOT/docker-compose.hub.yml" "$PROJECT_ROOT/docker-compose.yml"; do
    [[ ! -f "$file" ]] && continue
    if grep -E '(PASSWORD|SECRET):\s+[a-zA-Z0-9]' "$file" 2>/dev/null | grep -qv '\$'; then
        ((HARDCODED++)) || true
    fi
done

if [[ $HARDCODED -eq 0 ]]; then
    pass "No hardcoded passwords in hub compose files"
else
    fail "$HARDCODED compose files have hardcoded passwords"
fi

section "GCP Secrets Integration"

# Test 9: gcp-secrets.ts utility exists
if [[ -f "$PROJECT_ROOT/backend/src/utils/gcp-secrets.ts" ]]; then
    pass "gcp-secrets.ts utility exists"
else
    fail "gcp-secrets.ts utility missing"
fi

# Test 10: gcp-secrets.ts has getMongoDBPassword function
if grep -q 'getMongoDBPassword' "$PROJECT_ROOT/backend/src/utils/gcp-secrets.ts" 2>/dev/null; then
    pass "gcp-secrets.ts has getMongoDBPassword()"
else
    fail "gcp-secrets.ts missing getMongoDBPassword()"
fi

# Test 11: gcp-secrets.ts has getKeycloakPassword function
if grep -q 'getKeycloakPassword' "$PROJECT_ROOT/backend/src/utils/gcp-secrets.ts" 2>/dev/null; then
    pass "gcp-secrets.ts has getKeycloakPassword()"
else
    fail "gcp-secrets.ts missing getKeycloakPassword()"
fi

section "Documentation"

# Test 12: Secrets naming convention document exists
if [[ -f "$PROJECT_ROOT/docs/SECRETS_NAMING_CONVENTION.md" ]]; then
    pass "SECRETS_NAMING_CONVENTION.md exists"
else
    fail "SECRETS_NAMING_CONVENTION.md missing"
fi

# Test 13: Document covers GCP naming pattern
if grep -q 'dive-v3-{type}-{instance}' "$PROJECT_ROOT/docs/SECRETS_NAMING_CONVENTION.md" 2>/dev/null; then
    pass "Documentation covers GCP naming pattern"
else
    fail "Documentation missing GCP naming pattern"
fi

# Test 14: Document covers environment variable pattern
if grep -qE '\{SERVICE\}_\{TYPE\}_\{INSTANCE\}' "$PROJECT_ROOT/docs/SECRETS_NAMING_CONVENTION.md" 2>/dev/null; then
    pass "Documentation covers env var naming pattern"
else
    fail "Documentation missing env var naming pattern"
fi

section "Common.sh Secret Loading"

# Test 15: load_gcp_secrets function exists
if grep -q 'load_gcp_secrets()' "$PROJECT_ROOT/scripts/dive-modules/common.sh" 2>/dev/null; then
    pass "load_gcp_secrets() function exists"
else
    fail "load_gcp_secrets() function missing"
fi

# Test 16: load_gcp_secrets exports suffixed variables
if grep -qE 'export.*PASSWORD.*\$\{inst' "$PROJECT_ROOT/scripts/dive-modules/common.sh" 2>/dev/null; then
    pass "load_gcp_secrets exports instance-suffixed variables"
else
    fail "load_gcp_secrets missing instance suffix exports"
fi

section "Security Checks"

# Test 17: No weak passwords in compose files
WEAK_FOUND=0
weak_patterns=("password123" "admin123" "changeme" "secret123")
for file in "$PROJECT_ROOT/docker-compose.hub.yml" "$PROJECT_ROOT/docker/base/services.yml"; do
    [[ ! -f "$file" ]] && continue
    for pattern in "${weak_patterns[@]}"; do
        if grep -qiF "$pattern" "$file" 2>/dev/null; then
            ((WEAK_FOUND++))
        fi
    done
done

if [[ $WEAK_FOUND -eq 0 ]]; then
    pass "No weak passwords in compose files"
else
    fail "$WEAK_FOUND weak password patterns found"
fi

# Test 18: .env files are in .gitignore
if grep -qE '\.env\.local' "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
    pass ".env.local is in .gitignore"
else
    fail ".env.local not in .gitignore"
fi

section "Spoke Consistency"

# Test 19: All spokes use consistent NEXTAUTH_SECRET naming
NEXTAUTH_INCONSISTENT=0
for spoke_dir in "$PROJECT_ROOT"/instances/*/; do
    local_file="${spoke_dir}docker-compose.yml"
    [[ ! -f "$local_file" ]] && continue
    
    dirname=$(basename "$spoke_dir")
    [[ "$dirname" == "hub" || "$dirname" == "shared" ]] && continue
    
    # Check for NEXTAUTH_SECRET_* (not just AUTH_SECRET)
    if grep -qE 'NEXTAUTH_SECRET.*\$\{NEXTAUTH_SECRET_' "$local_file" 2>/dev/null; then
        : # Good
    elif grep -qE 'AUTH_SECRET.*\$\{NEXTAUTH_SECRET_' "$local_file" 2>/dev/null; then
        : # Also acceptable
    else
        ((NEXTAUTH_INCONSISTENT++))
    fi
done

if [[ $NEXTAUTH_INCONSISTENT -eq 0 ]]; then
    pass "All spokes use NEXTAUTH_SECRET_* naming"
else
    fail "$NEXTAUTH_INCONSISTENT spokes have inconsistent NEXTAUTH naming"
fi

# Test 20: All spokes use consistent KEYCLOAK_ADMIN_PASSWORD naming
KC_INCONSISTENT=0
for spoke_dir in "$PROJECT_ROOT"/instances/*/; do
    local_file="${spoke_dir}docker-compose.yml"
    [[ ! -f "$local_file" ]] && continue
    
    dirname=$(basename "$spoke_dir")
    [[ "$dirname" == "hub" || "$dirname" == "shared" ]] && continue
    
    # Check for KEYCLOAK_ADMIN_PASSWORD_* 
    if grep -qE 'KEYCLOAK_ADMIN_PASSWORD.*\$\{KEYCLOAK_ADMIN_PASSWORD_' "$local_file" 2>/dev/null; then
        : # Good
    else
        ((KC_INCONSISTENT++))
    fi
done

if [[ $KC_INCONSISTENT -eq 0 ]]; then
    pass "All spokes use KEYCLOAK_ADMIN_PASSWORD_* naming"
else
    fail "$KC_INCONSISTENT spokes have inconsistent Keycloak password naming"
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════════════════${NC}"
echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC} (total: $((PASSED + FAILED)))"
echo -e "${CYAN}════════════════════════════════════════════════════════════════════════${NC}"

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}Phase 2 tests PASSED${NC}"
    exit 0
else
    echo -e "${RED}Phase 2 tests FAILED${NC}"
    exit 1
fi
