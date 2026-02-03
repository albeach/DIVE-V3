#!/bin/bash
# =============================================================================
# DIVE V3 - OPA Test Fixer Script
# =============================================================================
#
# This script systematically fixes OPA test files by adding required mock data
# injections for:
# - data.dive.tenant.base.trusted_issuers
# - data.dive.tenant.federation_constraints.federation_matrix
# - Required subject fields (mfaVerified, aal)
# - Action type standardization (action.type instead of action string)
#
# Usage: ./scripts/fix-opa-tests.sh [test-file.rego]
#
# Version: 1.0.0
# Date: 2026-01-30
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logger functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
POLICIES_DIR="$PROJECT_ROOT/policies"

# Test files to fix
TEST_FILES=(
    "$POLICIES_DIR/tests/aal_enforcement_test.rego"
    "$POLICIES_DIR/tests/observability_integration_test.rego"
    "$POLICIES_DIR/tests/bundle_test.rego"
    "$POLICIES_DIR/tests/coi_coherence_test.rego"
    "$POLICIES_DIR/tests/admin_authorization_test.rego"
    "$POLICIES_DIR/tests/fuel_inventory_test.rego"
    "$POLICIES_DIR/tests/multimedia_upload_policy_test.rego"
    "$POLICIES_DIR/tests/performance_test.rego"
    "$POLICIES_DIR/tests/guardrails_test.rego"
)

# Mock data templates
MOCK_TRUSTED_ISSUERS='with data.dive.tenant.base.trusted_issuers as {}'
MOCK_FEDERATION_MATRIX='with data.dive.tenant.federation_constraints.federation_matrix as {}'

# Function to add mock data to a test
fix_test_file() {
    local file="$1"

    if [[ ! -f "$file" ]]; then
        log_warning "File not found: $file"
        return 1
    fi

    log_info "Fixing test file: $(basename "$file")"

    # Create backup
    cp "$file" "${file}.backup"

    # Use Python for more sophisticated text processing
    python3 <<EOF
import re
import sys

# Read the file
with open("$file", "r") as f:
    content = f.read()

# Pattern to match test functions that call authorization.decision or authz.allow
# and don't already have mock data injections
pattern = r'(test_\w+\s+if\s+\{[^}]*?(?:authorization\.decision|authz\.allow|authz\.decision)[^}]*?with input as \{[^}]*?\})((?:\s*with data\.\w+\.\w+(?:\.\w+)* as [^\n]+)*)\s*(\n\s*result(?:\.allow)?\s*==)'

def add_mocks(match):
    test_start = match.group(1)
    existing_mocks = match.group(2) if match.group(2) else ""
    test_end = match.group(3)

    # Check if mocks already exist
    if "with data.dive.tenant" in existing_mocks:
        return match.group(0)  # Already has mocks

    # Add mock data injections
    mocks = "\n    with data.dive.tenant.base.trusted_issuers as {}"
    mocks += "\n    with data.dive.tenant.federation_constraints.federation_matrix as {}"

    return test_start + existing_mocks + mocks + test_end

# Apply the fix
fixed_content = re.sub(pattern, add_mocks, content, flags=re.DOTALL)

# Fix subject fields - add mfaVerified and aal if missing
def fix_subject_fields(match):
    subject_block = match.group(0)

    # Add mfaVerified if missing
    if '"mfaVerified"' not in subject_block and "'mfaVerified'" not in subject_block:
        # Determine appropriate value based on clearance
        if '"UNCLASSIFIED"' in subject_block or "'UNCLASSIFIED'" in subject_block:
            mfa_value = "false"
            aal_value = "1"
        else:
            mfa_value = "true"
            aal_value = "2"

        # Add before authenticated line
        if '"authenticated":' in subject_block:
            subject_block = subject_block.replace(
                '"authenticated":',
                f'"mfaVerified": {mfa_value},\n            "aal": {aal_value},\n            "authenticated":'
            )
        elif "'authenticated':" in subject_block:
            subject_block = subject_block.replace(
                "'authenticated':",
                f"'mfaVerified': {mfa_value},\n            'aal': {aal_value},\n            'authenticated':"
            )

    return subject_block

# Fix all subject blocks
subject_pattern = r'"subject":\s*\{[^}]+\}'
fixed_content = re.sub(subject_pattern, fix_subject_fields, fixed_content)

# Fix action field - change "action": "read" to "action": {"type": "read"}
action_pattern = r'"action":\s*"(\w+)"'
fixed_content = re.sub(action_pattern, r'"action": {"type": "\1"}', fixed_content)

# Write the fixed content
with open("$file", "w") as f:
    f.write(fixed_content)

print(f"Fixed: $file")
EOF

    if [[ $? -eq 0 ]]; then
        log_success "Fixed $(basename "$file")"
        return 0
    else
        log_error "Failed to fix $(basename "$file")"
        # Restore from backup
        mv "${file}.backup" "$file"
        return 1
    fi
}

# Main execution
main() {
    log_info "Starting OPA test fixer..."
    log_info "Found ${#TEST_FILES[@]} test files to fix"

    local fixed_count=0
    local failed_count=0

    for test_file in "${TEST_FILES[@]}"; do
        if fix_test_file "$test_file"; then
            ((fixed_count++))
        else
            ((failed_count++))
        fi
    done

    echo ""
    log_success "Fixed: $fixed_count files"
    if [[ $failed_count -gt 0 ]]; then
        log_warning "Failed: $failed_count files"
    fi

    # Run tests to verify
    log_info "Running OPA tests to verify fixes..."
    if cd "$POLICIES_DIR" && opa test . -v 2>&1 | tee /tmp/opa-test-results.txt; then
        log_success "OPA tests passed!"
    else
        log_warning "Some tests still failing. Check /tmp/opa-test-results.txt for details"
    fi
}

# Run main
main "$@"
