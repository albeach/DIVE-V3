#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - OPA Authorization Policy Verification
# =============================================================================
# Tests OPA authorization policies with various clearance levels, countries,
# and COI combinations to ensure proper ABAC enforcement.
#
# Usage:
#   ./scripts/tests/verify-opa-policies.sh [--instance INST]
#
# Prerequisites:
#   - OPA service running and accessible
#   - Authorization policies deployed
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# OPA configuration
OPA_URL="${OPA_URL:-http://localhost:8181}"
OPA_DECISION_PATH="dive/authorization/decision"

TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log_header() {
    echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"
}

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

# Test OPA decision
test_opa_decision() {
    local test_name="$1"
    local input_json="$2"
    local expected_allow="$3"
    local expected_reason_pattern="${4:-}"
    
    log_test "$test_name"
    
    local response=$(curl -sk -X POST "${OPA_URL}/v1/data/${OPA_DECISION_PATH}" \
        -H "Content-Type: application/json" \
        -d "$input_json" \
        --max-time 5 \
        2>/dev/null)
    
    local result=$(echo "$response" | jq -r '.result // empty' 2>/dev/null)
    
    if [ -z "$result" ]; then
        log_fail "No result from OPA: ${response}"
        return 1
    fi
    
    local allow=$(echo "$result" | jq -r '.allow // false' 2>/dev/null)
    local reason=$(echo "$result" | jq -r '.reason // ""' 2>/dev/null)
    
    if [ "$allow" = "$expected_allow" ]; then
        if [ -n "$expected_reason_pattern" ]; then
            if echo "$reason" | grep -q "$expected_reason_pattern"; then
                log_pass "Decision correct: allow=${allow}, reason=${reason}"
                return 0
            else
                log_fail "Decision correct but reason mismatch: expected pattern '${expected_reason_pattern}', got '${reason}'"
                return 1
            fi
        else
            log_pass "Decision correct: allow=${allow}, reason=${reason}"
            return 0
        fi
    else
        log_fail "Decision incorrect: expected allow=${expected_allow}, got allow=${allow}, reason=${reason}"
        return 1
    fi
}

# =============================================================================
# TEST CASES
# =============================================================================

test_clearance_hierarchy() {
    log_header "Testing Clearance Hierarchy"
    
    # Test 1: UNCLASSIFIED user accessing UNCLASSIFIED resource
    test_opa_decision \
        "UNCLASSIFIED user → UNCLASSIFIED resource" \
        '{
            "input": {
                "subject": {
                    "uniqueID": "testuser-1",
                    "clearance": "UNCLASSIFIED",
                    "countryOfAffiliation": "USA",
                    "authenticated": true
                },
                "action": "read",
                "resource": {
                    "resourceId": "doc-1",
                    "classification": "UNCLASSIFIED",
                    "releasabilityTo": ["USA"]
                }
            }
        }' \
        "true"
    
    # Test 2: CONFIDENTIAL user accessing SECRET resource (should deny)
    test_opa_decision \
        "CONFIDENTIAL user → SECRET resource" \
        '{
            "input": {
                "subject": {
                    "uniqueID": "testuser-2",
                    "clearance": "CONFIDENTIAL",
                    "countryOfAffiliation": "USA",
                    "authenticated": true
                },
                "action": "read",
                "resource": {
                    "resourceId": "doc-2",
                    "classification": "SECRET",
                    "releasabilityTo": ["USA"]
                }
            }
        }' \
        "false" \
        "clearance"
    
    # Test 3: SECRET user accessing CONFIDENTIAL resource (should allow)
    test_opa_decision \
        "SECRET user → CONFIDENTIAL resource" \
        '{
            "input": {
                "subject": {
                    "uniqueID": "testuser-3",
                    "clearance": "SECRET",
                    "countryOfAffiliation": "USA",
                    "authenticated": true
                },
                "action": "read",
                "resource": {
                    "resourceId": "doc-3",
                    "classification": "CONFIDENTIAL",
                    "releasabilityTo": ["USA"]
                }
            }
        }' \
        "true"
    
    echo ""
}

test_releasability() {
    log_header "Testing Country Releasability"
    
    # Test 1: USA user accessing USA-releasable resource
    test_opa_decision \
        "USA user → USA-releasable resource" \
        '{
            "input": {
                "subject": {
                    "uniqueID": "testuser-usa",
                    "clearance": "SECRET",
                    "countryOfAffiliation": "USA",
                    "authenticated": true
                },
                "action": "read",
                "resource": {
                    "resourceId": "doc-usa",
                    "classification": "SECRET",
                    "releasabilityTo": ["USA"]
                }
            }
        }' \
        "true"
    
    # Test 2: FRA user accessing USA-only resource (should deny)
    test_opa_decision \
        "FRA user → USA-only resource" \
        '{
            "input": {
                "subject": {
                    "uniqueID": "testuser-fra",
                    "clearance": "SECRET",
                    "countryOfAffiliation": "FRA",
                    "authenticated": true
                },
                "action": "read",
                "resource": {
                    "resourceId": "doc-usa-only",
                    "classification": "SECRET",
                    "releasabilityTo": ["USA"]
                }
            }
        }' \
        "false" \
        "releasability"
    
    # Test 3: USA user accessing multi-country resource
    test_opa_decision \
        "USA user → USA+GBR-releasable resource" \
        '{
            "input": {
                "subject": {
                    "uniqueID": "testuser-usa",
                    "clearance": "SECRET",
                    "countryOfAffiliation": "USA",
                    "authenticated": true
                },
                "action": "read",
                "resource": {
                    "resourceId": "doc-multi",
                    "classification": "SECRET",
                    "releasabilityTo": ["USA", "GBR"]
                }
            }
        }' \
        "true"
    
    echo ""
}

test_coi() {
    log_header "Testing Community of Interest (COI)"
    
    # Test 1: User with matching COI
    test_opa_decision \
        "User with FVEY COI → FVEY resource" \
        '{
            "input": {
                "subject": {
                    "uniqueID": "testuser-fvey",
                    "clearance": "SECRET",
                    "countryOfAffiliation": "USA",
                    "acpCOI": ["FVEY"],
                    "authenticated": true
                },
                "action": "read",
                "resource": {
                    "resourceId": "doc-fvey",
                    "classification": "SECRET",
                    "releasabilityTo": ["USA"],
                    "COI": ["FVEY"]
                }
            }
        }' \
        "true"
    
    # Test 2: User without matching COI (should deny)
    test_opa_decision \
        "User without COI → FVEY resource" \
        '{
            "input": {
                "subject": {
                    "uniqueID": "testuser-no-coi",
                    "clearance": "SECRET",
                    "countryOfAffiliation": "USA",
                    "acpCOI": [],
                    "authenticated": true
                },
                "action": "read",
                "resource": {
                    "resourceId": "doc-fvey",
                    "classification": "SECRET",
                    "releasabilityTo": ["USA"],
                    "COI": ["FVEY"]
                }
            }
        }' \
        "false" \
        "COI"
    
    echo ""
}

test_authentication() {
    log_header "Testing Authentication Requirement"
    
    # Test 1: Unauthenticated user (should deny)
    test_opa_decision \
        "Unauthenticated user" \
        '{
            "input": {
                "subject": {
                    "uniqueID": "testuser-unauth",
                    "clearance": "SECRET",
                    "countryOfAffiliation": "USA",
                    "authenticated": false
                },
                "action": "read",
                "resource": {
                    "resourceId": "doc-1",
                    "classification": "UNCLASSIFIED",
                    "releasabilityTo": ["USA"]
                }
            }
        }' \
        "false" \
        "authenticated"
    
    echo ""
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    log_header "DIVE V3 - OPA Authorization Policy Verification"
    echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "OPA URL: ${OPA_URL}"
    echo ""
    
    # Check OPA connectivity
    log_test "Checking OPA connectivity"
    if curl -sk "${OPA_URL}/health" >/dev/null 2>&1; then
        log_pass "OPA is accessible"
    else
        log_fail "OPA is not accessible at ${OPA_URL}"
        exit 1
    fi
    echo ""
    
    # Run test suites
    test_clearance_hierarchy
    test_releasability
    test_coi
    test_authentication
    
    # Summary
    log_header "Test Summary"
    echo "Total Tests:  $((TESTS_PASSED + TESTS_FAILED))"
    echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
    echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
    echo ""
    
    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}✅ All OPA policy tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}❌ Some tests failed${NC}"
        exit 1
    fi
}

main "$@"

