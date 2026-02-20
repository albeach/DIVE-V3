#!/usr/bin/env bash
# test-opa-policy-suite.sh
# Validates that all OPA policy tests pass with the --bundle flag.
# This test should be run before committing policy changes.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

FAILED_TESTS=0
PASSED_TESTS=0

echo "======================================================================"
echo "OPA POLICY TEST SUITE"
echo "======================================================================"
echo ""

# Test 1: OPA is installed
echo "--- Test 1: OPA binary available ---"
if command -v opa >/dev/null 2>&1; then
    opa_version=$(opa version 2>/dev/null | head -1)
    echo -e "${GREEN}PASS${NC} OPA available: $opa_version"
    ((PASSED_TESTS++))
else
    echo -e "${RED}FAIL${NC} OPA not installed"
    ((FAILED_TESTS++))
    echo "Install: brew install opa (macOS) or download from https://www.openpolicyagent.org"
    exit 1
fi

# Test 2: Policies directory exists
echo ""
echo "--- Test 2: Policies directory structure ---"
if [ -d "$DIVE_ROOT/policies" ]; then
    policy_count=$(find "$DIVE_ROOT/policies" -name "*.rego" ! -name "*_test.rego" | wc -l | tr -d ' ')
    test_count=$(find "$DIVE_ROOT/policies" -name "*_test.rego" | wc -l | tr -d ' ')
    echo -e "${GREEN}PASS${NC} Found $policy_count policy files, $test_count test files"
    ((PASSED_TESTS++))
else
    echo -e "${RED}FAIL${NC} Policies directory not found"
    ((FAILED_TESTS++))
fi

# Test 3: OPA check passes (strict syntax)
echo ""
echo "--- Test 3: Rego syntax check (strict) ---"
if opa check "$DIVE_ROOT/policies/" --strict 2>/dev/null; then
    echo -e "${GREEN}PASS${NC} Rego syntax valid (strict mode)"
    ((PASSED_TESTS++))
else
    echo -e "${RED}FAIL${NC} Rego syntax errors found"
    ((FAILED_TESTS++))
fi

# Test 4: All OPA tests pass with --bundle
echo ""
echo "--- Test 4: OPA test suite (with --bundle) ---"
test_output=$(opa test "$DIVE_ROOT/policies/" -v --bundle 2>&1)
test_exit=$?

# Extract pass/fail counts
pass_line=$(echo "$test_output" | grep "^PASS:")
if [ $test_exit -eq 0 ] && echo "$pass_line" | grep -q "PASS:"; then
    echo -e "${GREEN}PASS${NC} $pass_line"
    ((PASSED_TESTS++))
else
    fail_line=$(echo "$test_output" | grep "^FAIL:")
    echo -e "${RED}FAIL${NC} OPA tests failed: $fail_line"
    echo "$test_output" | grep "FAIL" | head -10
    ((FAILED_TESTS++))
fi

# Test 5: Verify --bundle is required (without it, test results should differ or fail)
echo ""
echo "--- Test 5: Bundle flag usage in CI workflow ---"
ci_file="$DIVE_ROOT/.github/workflows/policy-bundle.yml"
if grep -q "\-\-bundle" "$ci_file"; then
    echo -e "${GREEN}PASS${NC} CI workflow uses --bundle flag"
    ((PASSED_TESTS++))
else
    echo -e "${RED}FAIL${NC} CI workflow missing --bundle flag"
    ((FAILED_TESTS++))
fi

# Test 6: Verify policy_test function uses --bundle
echo ""
echo "--- Test 6: CLI policy test uses --bundle ---"
policy_module="$DIVE_ROOT/scripts/dive-modules/utilities/policy.sh"
if grep -q "\-\-bundle" "$policy_module"; then
    echo -e "${GREEN}PASS${NC} policy_test() function uses --bundle flag"
    ((PASSED_TESTS++))
else
    echo -e "${RED}FAIL${NC} policy_test() function missing --bundle flag"
    ((FAILED_TESTS++))
fi

# Summary
echo ""
echo "======================================================================"
echo "RESULTS: $PASSED_TESTS passed, $FAILED_TESTS failed"
echo "======================================================================"

exit $FAILED_TESTS
