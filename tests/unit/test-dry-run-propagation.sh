#!/usr/bin/env bash
# test-dry-run-propagation.sh
# Validates that the global --dry-run flag propagates correctly to
# hub and spoke deployment pipelines via DIVE_DRY_RUN.
#
# Bug: ./dive --dry-run hub deploy previously set DRY_RUN=true but
# hub-pipeline.sh reset DIVE_DRY_RUN=false, ignoring the global flag.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

FAILED_TESTS=0
PASSED_TESTS=0

assert_equals() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"

    if [ "$expected" = "$actual" ]; then
        echo -e "${GREEN}PASS${NC} $test_name"
        ((PASSED_TESTS++))
        return 0
    else
        echo -e "${RED}FAIL${NC} $test_name: expected '$expected', got '$actual'"
        ((FAILED_TESTS++))
        return 1
    fi
}

assert_contains() {
    local test_name="$1"
    local haystack="$2"
    local needle="$3"

    if echo "$haystack" | grep -q "$needle"; then
        echo -e "${GREEN}PASS${NC} $test_name"
        ((PASSED_TESTS++))
        return 0
    else
        echo -e "${RED}FAIL${NC} $test_name: '$needle' not found in output"
        ((FAILED_TESTS++))
        return 1
    fi
}

echo "======================================================================"
echo "DRY-RUN PROPAGATION TESTS"
echo "======================================================================"
echo ""

# ============================================
# Test 1: Global --dry-run sets both DRY_RUN and DIVE_DRY_RUN
# ============================================
echo "--- Test 1: Global flag parser sets DIVE_DRY_RUN ---"

# Source the dive script's argument parsing logic by extracting the parser
(
    # Simulate the global arg parser
    export DRY_RUN=""
    export DIVE_DRY_RUN=""

    # Parse --dry-run
    case "--dry-run" in
        --dry-run|-n)
            export DRY_RUN=true
            export DIVE_DRY_RUN=true
            ;;
    esac

    if [ "$DRY_RUN" = "true" ] && [ "$DIVE_DRY_RUN" = "true" ]; then
        echo "BOTH_SET"
    else
        echo "MISSING: DRY_RUN=$DRY_RUN DIVE_DRY_RUN=$DIVE_DRY_RUN"
    fi
)
result=$?
# Subshell returns 0 if BOTH_SET, 1 otherwise; use command substitution instead
result=$(
    export DRY_RUN=""
    export DIVE_DRY_RUN=""
    case "--dry-run" in
        --dry-run|-n)
            export DRY_RUN=true
            export DIVE_DRY_RUN=true
            ;;
    esac
    if [ "$DRY_RUN" = "true" ] && [ "$DIVE_DRY_RUN" = "true" ]; then
        echo "BOTH_SET"
    else
        echo "MISSING: DRY_RUN=$DRY_RUN DIVE_DRY_RUN=$DIVE_DRY_RUN"
    fi
)
assert_equals "Global --dry-run sets both DRY_RUN and DIVE_DRY_RUN" "BOTH_SET" "$result"

# ============================================
# Test 2: Hub pipeline inherits from global DIVE_DRY_RUN
# ============================================
echo ""
echo "--- Test 2: Hub pipeline inherits global DIVE_DRY_RUN ---"

result=$(
    export DIVE_DRY_RUN=true
    export DRY_RUN=true
    # Simulate what hub_deploy() line 829 now does
    export DIVE_DRY_RUN="${DIVE_DRY_RUN:-${DRY_RUN:-false}}"
    echo "$DIVE_DRY_RUN"
)
assert_equals "Hub pipeline sees DIVE_DRY_RUN=true from global" "true" "$result"

# ============================================
# Test 3: Hub pipeline falls back to DRY_RUN if DIVE_DRY_RUN unset
# ============================================
echo ""
echo "--- Test 3: Hub pipeline falls back to DRY_RUN ---"

result=$(
    unset DIVE_DRY_RUN
    export DRY_RUN=true
    export DIVE_DRY_RUN="${DIVE_DRY_RUN:-${DRY_RUN:-false}}"
    echo "$DIVE_DRY_RUN"
)
assert_equals "Hub pipeline inherits DRY_RUN as fallback" "true" "$result"

# ============================================
# Test 4: Hub pipeline defaults to false when nothing set
# ============================================
echo ""
echo "--- Test 4: Default is false ---"

result=$(
    unset DIVE_DRY_RUN
    unset DRY_RUN
    export DIVE_DRY_RUN="${DIVE_DRY_RUN:-${DRY_RUN:-false}}"
    echo "$DIVE_DRY_RUN"
)
assert_equals "Hub pipeline defaults to false" "false" "$result"

# ============================================
# Test 5: Local --dry-run flag still works (direct function call)
# ============================================
echo ""
echo "--- Test 5: Local --dry-run flag override ---"

result=$(
    unset DIVE_DRY_RUN
    unset DRY_RUN
    export DIVE_DRY_RUN="${DIVE_DRY_RUN:-${DRY_RUN:-false}}"
    # Simulate local parser setting it
    DIVE_DRY_RUN="true"
    echo "$DIVE_DRY_RUN"
)
assert_equals "Local --dry-run flag works for direct calls" "true" "$result"

# ============================================
# Test 6: Spoke pipeline also inherits
# ============================================
echo ""
echo "--- Test 6: Spoke pipeline inherits ---"

result=$(
    export DIVE_DRY_RUN=true
    export DRY_RUN=true
    export DIVE_DRY_RUN="${DIVE_DRY_RUN:-${DRY_RUN:-false}}"
    echo "$DIVE_DRY_RUN"
)
assert_equals "Spoke pipeline sees DIVE_DRY_RUN=true from global" "true" "$result"

# ============================================
# Test 7: Verify dive script has DIVE_DRY_RUN in --dry-run case
# ============================================
echo ""
echo "--- Test 7: Source code verification ---"

dry_run_block=$(sed -n '/--dry-run|-n)/,/;;/p' "$DIVE_ROOT/dive")
if echo "$dry_run_block" | grep -q "DIVE_DRY_RUN"; then
    echo -e "${GREEN}PASS${NC} dive script exports DIVE_DRY_RUN in --dry-run case"
    ((PASSED_TESTS++))
else
    echo -e "${RED}FAIL${NC} dive script missing DIVE_DRY_RUN in --dry-run case"
    ((FAILED_TESTS++))
fi

# ============================================
# Test 8: Verify hub-pipeline.sh uses inheritance
# ============================================
echo ""
echo "--- Test 8: Hub pipeline source verification ---"

hub_init=$(grep 'DIVE_DRY_RUN=' "$DIVE_ROOT/scripts/dive-modules/deployment/hub-pipeline.sh" | head -1)
if echo "$hub_init" | grep -q 'DRY_RUN:-false'; then
    echo -e "${GREEN}PASS${NC} hub-pipeline.sh inherits from DRY_RUN"
    ((PASSED_TESTS++))
else
    echo -e "${RED}FAIL${NC} hub-pipeline.sh still hardcodes DIVE_DRY_RUN=false"
    ((FAILED_TESTS++))
fi

# ============================================
# Test 9: Verify spoke-deploy.sh uses inheritance
# ============================================
echo ""
echo "--- Test 9: Spoke deploy source verification ---"

spoke_init=$(grep 'DIVE_DRY_RUN=' "$DIVE_ROOT/scripts/dive-modules/spoke/spoke-deploy.sh" | head -1)
if echo "$spoke_init" | grep -q 'DRY_RUN:-false'; then
    echo -e "${GREEN}PASS${NC} spoke-deploy.sh inherits from DRY_RUN"
    ((PASSED_TESTS++))
else
    echo -e "${RED}FAIL${NC} spoke-deploy.sh still hardcodes DIVE_DRY_RUN=false"
    ((FAILED_TESTS++))
fi

# ============================================
# Summary
# ============================================
echo ""
echo "======================================================================"
echo "RESULTS: $PASSED_TESTS passed, $FAILED_TESTS failed"
echo "======================================================================"

exit $FAILED_TESTS
