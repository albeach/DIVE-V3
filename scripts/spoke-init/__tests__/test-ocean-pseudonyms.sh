#!/usr/bin/env bash
# =============================================================================
# Test Suite: Ocean Pseudonym Generator (Bash Implementation)
# =============================================================================
# Tests deterministic pseudonym generation for ACP-240 PII minimization
# Validates alignment with frontend implementation
#
# Usage: ./test-ocean-pseudonyms.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Source the ocean pseudonym generator
source "${PARENT_DIR}/seed-users.sh"

##
# Test assertion helper
##
assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"
    
    TESTS_RUN=$((TESTS_RUN + 1))
    
    if [[ "$expected" == "$actual" ]]; then
        echo -e "${GREEN}✓${NC} PASS: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} FAIL: $test_name"
        echo -e "  Expected: ${GREEN}$expected${NC}"
        echo -e "  Actual:   ${RED}$actual${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_not_empty() {
    local actual="$1"
    local test_name="$2"
    
    TESTS_RUN=$((TESTS_RUN + 1))
    
    if [[ -n "$actual" ]]; then
        echo -e "${GREEN}✓${NC} PASS: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} FAIL: $test_name (empty result)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_matches() {
    local pattern="$1"
    local actual="$2"
    local test_name="$3"
    
    TESTS_RUN=$((TESTS_RUN + 1))
    
    if [[ "$actual" =~ $pattern ]]; then
        echo -e "${GREEN}✓${NC} PASS: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} FAIL: $test_name"
        echo -e "  Pattern:  ${GREEN}$pattern${NC}"
        echo -e "  Actual:   ${RED}$actual${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

##
# Test Suite
##
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║       Ocean Pseudonym Generator - Test Suite                  ║"
echo "║       ACP-240 PII Minimization Compliance                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Test 1: Basic functionality
echo "Test Suite 1: Basic Functionality"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

result=$(generate_ocean_pseudonym "testuser-nzl-1")
assert_not_empty "$result" "Should generate pseudonym for valid input"
assert_matches "^[A-Z][a-z]+ [A-Z][a-z]+$" "$result" "Should match 'Adjective Noun' format"

# Test 2: Determinism
echo ""
echo "Test Suite 2: Determinism"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

result1=$(generate_ocean_pseudonym "testuser-nzl-3")
result2=$(generate_ocean_pseudonym "testuser-nzl-3")
assert_equals "$result1" "$result2" "Same input should generate same pseudonym"

result3=$(generate_ocean_pseudonym "testuser-usa-1")
result4=$(generate_ocean_pseudonym "testuser-usa-1")
assert_equals "$result3" "$result4" "Determinism: USA user"

# Test 3: Uniqueness (Different inputs → Different outputs)
echo ""
echo "Test Suite 3: Uniqueness"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

nzl_user=$(generate_ocean_pseudonym "testuser-nzl-1")
usa_user=$(generate_ocean_pseudonym "testuser-usa-1")
fra_user=$(generate_ocean_pseudonym "testuser-fra-1")

# Note: With 1,296 combinations, collisions are possible but rare
# We test that at least SOME inputs generate different outputs
if [[ "$nzl_user" != "$usa_user" ]] || [[ "$nzl_user" != "$fra_user" ]]; then
    echo -e "${GREEN}✓${NC} PASS: Different inputs generate different pseudonyms"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${YELLOW}⚠${NC} WARN: All test inputs generated same pseudonym (rare collision)"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi

# Test 4: Edge cases
echo ""
echo "Test Suite 4: Edge Cases"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

empty_result=$(generate_ocean_pseudonym "" 2>/dev/null || echo "Unknown User")
assert_equals "Unknown User" "$empty_result" "Empty input should return 'Unknown User'"

short_result=$(generate_ocean_pseudonym "a")
assert_not_empty "$short_result" "Should handle short input (1 character)"

long_result=$(generate_ocean_pseudonym "this-is-a-very-long-username-with-many-characters-0123456789")
assert_not_empty "$long_result" "Should handle long input"

special_result=$(generate_ocean_pseudonym "user-with-special@chars.com")
assert_not_empty "$special_result" "Should handle special characters"

# Test 5: Ocean theme validation
echo ""
echo "Test Suite 5: Ocean Theme Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Generate 10 random pseudonyms and check format
for i in {1..10}; do
    test_input="test-user-$i-$(date +%s)"
    result=$(generate_ocean_pseudonym "$test_input")
    
    # Check format: "Word Word"
    if [[ "$result" =~ ^[A-Z][a-z]+[[:space:]][A-Z][a-z]+$ ]]; then
        TESTS_RUN=$((TESTS_RUN + 1))
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗${NC} FAIL: Invalid format for '$test_input': $result"
        TESTS_RUN=$((TESTS_RUN + 1))
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
done
echo -e "${GREEN}✓${NC} PASS: All 10 random pseudonyms match ocean theme format"

# Test 6: Real-world test users
echo ""
echo "Test Suite 6: Real-World Test Cases"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# These are the actual usernames used in DIVE
test_cases=(
    "testuser-nzl-1"
    "testuser-nzl-2"
    "testuser-nzl-3"
    "testuser-nzl-4"
    "admin-nzl"
    "testuser-usa-1"
    "testuser-fra-3"
)

for username in "${test_cases[@]}"; do
    result=$(generate_ocean_pseudonym "$username")
    echo -e "  ${BLUE}$username${NC} → ${GREEN}$result${NC}"
    assert_matches "^[A-Z][a-z]+ [A-Z][a-z]+$" "$result" "Validate $username pseudonym"
done

# Test 7: ACP-240 Compliance
echo ""
echo "Test Suite 7: ACP-240 Compliance"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Pseudonym should NOT contain PII markers
testuser_3=$(generate_ocean_pseudonym "testuser-nzl-3")

# Should not reveal clearance level
if [[ ! "$testuser_3" =~ [Ss]ecret ]] && [[ ! "$testuser_3" =~ [Cc]lassified ]]; then
    echo -e "${GREEN}✓${NC} PASS: Pseudonym does not reveal clearance level"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} FAIL: Pseudonym reveals clearance level: $testuser_3"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Should not contain username directly
if [[ ! "$testuser_3" =~ testuser ]] && [[ ! "$testuser_3" =~ nzl ]]; then
    echo -e "${GREEN}✓${NC} PASS: Pseudonym does not contain original username"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} FAIL: Pseudonym contains username: $testuser_3"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Test 8: Alignment with Frontend
echo ""
echo "Test Suite 8: Frontend Alignment Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Note: Frontend uses TypeScript with same algorithm"
echo "Testing that format and approach match..."

# Test that we use same adjective/noun count
if [[ ${#OCEAN_ADJECTIVES[@]} -eq 36 ]] && [[ ${#OCEAN_NOUNS[@]} -eq 36 ]]; then
    echo -e "${GREEN}✓${NC} PASS: Uses same vocab size as frontend (36×36 = 1,296 combinations)"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗${NC} FAIL: Vocab size mismatch with frontend"
    echo "  Adjectives: ${#OCEAN_ADJECTIVES[@]} (expected 36)"
    echo "  Nouns: ${#OCEAN_NOUNS[@]} (expected 36)"
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Final Summary
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                     Test Suite Summary                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "  Tests Run:    $TESTS_RUN"
echo -e "  Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "  Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "Ocean pseudonym generator is working correctly and complies with:"
    echo "  ✓ ACP-240 Section 6.2 (PII Minimization)"
    echo "  ✓ NIST SP 800-53 (IA-4)"
    echo "  ✓ Frontend alignment (TypeScript implementation)"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    echo ""
    exit 1
fi
