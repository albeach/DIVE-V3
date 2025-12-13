#!/bin/bash
# Generate Test Coverage Matrix for OPA Policies
# Phase 0: Safety Net for Policy Refactoring
#
# This script generates a comprehensive test matrix and validates
# that all policy rules have adequate test coverage.
#
# Usage:
#   ./scripts/policy/generate-test-matrix.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
POLICIES_DIR="$PROJECT_ROOT/policies"
OUTPUT_DIR="$POLICIES_DIR/baselines"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     DIVE V3 Policy Test Coverage Matrix Generator           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check OPA is available
if ! command -v opa &> /dev/null; then
    echo -e "${RED}Error: OPA not found. Install it first:${NC}"
    echo "  brew install opa  # macOS"
    echo "  # or download from https://github.com/open-policy-agent/opa/releases"
    exit 1
fi

echo -e "${GREEN}✓${NC} OPA version: $(opa version | head -1)"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# ============================================
# Step 1: Validate Policy Syntax
# ============================================
echo -e "${BLUE}Step 1: Validating policy syntax...${NC}"

if opa check "$POLICIES_DIR" --strict 2>&1; then
    echo -e "${GREEN}✓${NC} All policies pass syntax check"
else
    echo -e "${RED}✗${NC} Syntax errors found"
    exit 1
fi
echo ""

# ============================================
# Step 2: Run All Policy Tests
# ============================================
echo -e "${BLUE}Step 2: Running policy tests...${NC}"

# Run tests and capture output
TEST_OUTPUT=$(opa test "$POLICIES_DIR" -v --coverage 2>&1) || true

# Count tests
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -c "PASS" || echo "0")
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -c "FAIL" || echo "0")
TOTAL_COUNT=$((PASS_COUNT + FAIL_COUNT))

# Extract coverage
COVERAGE=$(echo "$TEST_OUTPUT" | grep -E "Coverage:" | head -1 | awk '{print $2}' || echo "N/A")

echo -e "  Tests passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "  Tests failed: ${RED}$FAIL_COUNT${NC}"
echo -e "  Total tests:  $TOTAL_COUNT"
echo -e "  Coverage:     ${YELLOW}$COVERAGE${NC}"
echo ""

# ============================================
# Step 3: Generate Policy Inventory
# ============================================
echo -e "${BLUE}Step 3: Generating policy inventory...${NC}"

INVENTORY_FILE="$OUTPUT_DIR/policy-inventory.json"

# Create inventory JSON
cat > "$INVENTORY_FILE" << 'HEREDOC'
{
  "generated_at": "TIMESTAMP",
  "policies": [],
  "tests": [],
  "coverage": {
    "total": "COVERAGE",
    "by_package": {}
  }
}
HEREDOC

# Replace placeholders
sed -i.bak "s/TIMESTAMP/$(date -u +"%Y-%m-%dT%H:%M:%SZ")/" "$INVENTORY_FILE"
sed -i.bak "s/COVERAGE/$COVERAGE/" "$INVENTORY_FILE"
rm -f "${INVENTORY_FILE}.bak"

echo -e "${GREEN}✓${NC} Inventory saved to: $INVENTORY_FILE"
echo ""

# ============================================
# Step 4: List All Rules Without Tests
# ============================================
echo -e "${BLUE}Step 4: Analyzing rule coverage...${NC}"

# Extract rule names from policies
RULES_FILE="$OUTPUT_DIR/rules.txt"
grep -rh "^[a-z_]*\s*:=" "$POLICIES_DIR"/*.rego 2>/dev/null | \
    grep -v "^#" | \
    grep -v "_test.rego" | \
    awk -F':=' '{print $1}' | \
    tr -d ' ' | \
    sort -u > "$RULES_FILE" 2>/dev/null || true

RULE_COUNT=$(wc -l < "$RULES_FILE" | tr -d ' ')
echo -e "  Total rules found: $RULE_COUNT"

# Extract test function names
TESTS_FILE="$OUTPUT_DIR/tests.txt"
grep -rh "^test_" "$POLICIES_DIR"/*_test.rego "$POLICIES_DIR"/tests/*.rego 2>/dev/null | \
    awk '{print $1}' | \
    sort -u > "$TESTS_FILE" 2>/dev/null || true

TEST_FUNC_COUNT=$(wc -l < "$TESTS_FILE" | tr -d ' ')
echo -e "  Test functions:     $TEST_FUNC_COUNT"
echo ""

# ============================================
# Step 5: Generate Coverage Report
# ============================================
echo -e "${BLUE}Step 5: Generating coverage report...${NC}"

REPORT_FILE="$OUTPUT_DIR/coverage-report.md"

cat > "$REPORT_FILE" << EOF
# DIVE V3 Policy Coverage Report

Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

## Summary

| Metric | Value |
|--------|-------|
| Total Policies | $(find "$POLICIES_DIR" -name "*.rego" ! -name "*_test.rego" | wc -l | tr -d ' ') |
| Total Test Files | $(find "$POLICIES_DIR" -name "*_test.rego" | wc -l | tr -d ' ') |
| Total Rules | $RULE_COUNT |
| Test Functions | $TEST_FUNC_COUNT |
| Tests Passed | $PASS_COUNT |
| Tests Failed | $FAIL_COUNT |
| Coverage | $COVERAGE |

## Policy Files

| File | Package | Rules | Has Tests |
|------|---------|-------|-----------|
EOF

# List each policy file
for policy in "$POLICIES_DIR"/*.rego; do
    if [[ -f "$policy" && ! "$policy" =~ "_test.rego" ]]; then
        FILENAME=$(basename "$policy")
        PACKAGE=$(grep "^package" "$policy" | awk '{print $2}' || echo "unknown")
        RULE_COUNT_FILE=$(grep -c "^[a-z_]*\s*:=" "$policy" 2>/dev/null || echo "0")
        TEST_FILE="${policy%.rego}_test.rego"
        if [[ -f "$TEST_FILE" ]]; then
            HAS_TESTS="✅"
        else
            HAS_TESTS="❌"
        fi
        echo "| $FILENAME | $PACKAGE | $RULE_COUNT_FILE | $HAS_TESTS |" >> "$REPORT_FILE"
    fi
done

# Add base layer policies
echo "" >> "$REPORT_FILE"
echo "### Base Layer Policies" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

for policy in "$POLICIES_DIR"/base/*/*.rego; do
    if [[ -f "$policy" && ! "$policy" =~ "_test.rego" ]]; then
        FILENAME=$(basename "$policy")
        PACKAGE=$(grep "^package" "$policy" | awk '{print $2}' || echo "unknown")
        RULE_COUNT_FILE=$(grep -c "^[a-z_]*\s*:=" "$policy" 2>/dev/null || echo "0")
        TEST_FILE="${policy%.rego}_test.rego"
        if [[ -f "$TEST_FILE" ]]; then
            HAS_TESTS="✅"
        else
            HAS_TESTS="❌"
        fi
        echo "- \`$FILENAME\` ($PACKAGE): $RULE_COUNT_FILE rules, Tests: $HAS_TESTS" >> "$REPORT_FILE"
    fi
done

echo -e "${GREEN}✓${NC} Coverage report: $REPORT_FILE"
echo ""

# ============================================
# Step 6: Summary
# ============================================
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Coverage Matrix Generation Complete!${NC}"
echo ""
echo "Output files:"
echo "  - $INVENTORY_FILE"
echo "  - $REPORT_FILE"
echo "  - $RULES_FILE"
echo "  - $TESTS_FILE"
echo ""

# Show test results if there were failures
if [[ "$FAIL_COUNT" -gt 0 ]]; then
    echo -e "${RED}⚠️  $FAIL_COUNT tests failed. Review output above.${NC}"
    echo "$TEST_OUTPUT" | grep "FAIL"
fi

# Coverage threshold check
if [[ "$COVERAGE" != "N/A" ]]; then
    COVERAGE_NUM=$(echo "$COVERAGE" | tr -d '%')
    if (( $(echo "$COVERAGE_NUM < 70" | bc -l) )); then
        echo -e "${YELLOW}⚠️  Coverage $COVERAGE is below 70% threshold${NC}"
    fi
fi

echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Review coverage report: cat $REPORT_FILE"
echo "  2. Add tests for uncovered rules"
echo "  3. Run baseline capture: npx ts-node scripts/policy/capture-baseline.ts capture"












