#!/bin/bash
# Test Authentication Strength Policy Fix
# Tests ACR/AMR handling for classified resources

OPA_URL="${OPA_URL:-http://localhost:8181}"
ENDPOINT="$OPA_URL/v1/data/dive/authorization"

echo "=========================================="
echo "Testing Authentication Strength Policy Fix"
echo "=========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_count=0
pass_count=0
fail_count=0

# Function to test OPA decision
test_opa() {
    local test_name="$1"
    local expected_result="$2"
    local classification="$3"
    local acr="$4"
    local amr="$5"
    
    test_count=$((test_count + 1))
    
    echo "Test $test_count: $test_name"
    echo "  Classification: $classification"
    echo "  ACR: $acr"
    echo "  AMR: $amr"
    
    # Build OPA input
    local input=$(cat <<EOF
{
  "input": {
    "subject": {
      "authenticated": true,
      "uniqueID": "test-user@example.com",
      "clearance": "SECRET",
      "countryOfAffiliation": "USA",
      "acpCOI": []
    },
    "action": {
      "operation": "view"
    },
    "resource": {
      "resourceId": "test-doc-123",
      "classification": "$classification",
      "releasabilityTo": ["USA"],
      "COI": [],
      "encrypted": false
    },
    "context": {
      "currentTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
      "sourceIP": "127.0.0.1",
      "deviceCompliant": true,
      "requestId": "test-$(date +%s)",
      "acr": "$acr",
      "amr": $amr
    }
  }
}
EOF
)
    
    # Call OPA
    response=$(curl -s -X POST "$ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "$input")
    
    # Extract decision
    allow=$(echo "$response" | jq -r '.result.decision.allow // .result.allow // false')
    reason=$(echo "$response" | jq -r '.result.decision.reason // .result.reason // "No reason"')
    
    # Check result
    if [ "$allow" == "$expected_result" ]; then
        echo -e "  ${GREEN}✓ PASS${NC} - Decision: $allow (expected $expected_result)"
        pass_count=$((pass_count + 1))
    else
        echo -e "  ${RED}✗ FAIL${NC} - Decision: $allow (expected $expected_result)"
        echo "  Reason: $reason"
        fail_count=$((fail_count + 1))
    fi
    echo ""
}

# Test Suite
echo "Testing UNCLASSIFIED resources (should always allow):"
echo "------------------------------------------------------"
test_opa "UNCLASSIFIED with AAL1 (1 factor)" "true" "UNCLASSIFIED" "0" '["pwd"]'
test_opa "UNCLASSIFIED with AAL2" "true" "UNCLASSIFIED" "1" '["pwd","otp"]'

echo ""
echo "Testing CLASSIFIED resources - AAL1 with 1 factor (should DENY):"
echo "-----------------------------------------------------------------"
test_opa "SECRET with ACR=0 and 1 AMR factor" "false" "SECRET" "0" '["pwd"]'
test_opa "CONFIDENTIAL with ACR=0 and 1 AMR factor" "false" "CONFIDENTIAL" "0" '["pwd"]'
test_opa "TOP_SECRET with ACR=0 and 1 AMR factor" "false" "TOP_SECRET" "0" '["pwd"]'

echo ""
echo "Testing CLASSIFIED resources - AAL1 with 2+ factors (should ALLOW via AMR fallback):"
echo "-------------------------------------------------------------------------------------"
test_opa "SECRET with ACR=0 and 2 AMR factors" "true" "SECRET" "0" '["pwd","otp"]'
test_opa "SECRET with ACR=0 and 3 AMR factors" "true" "SECRET" "0" '["pwd","otp","webauthn"]'

echo ""
echo "Testing CLASSIFIED resources - AAL2 (should ALLOW):"
echo "----------------------------------------------------"
test_opa "SECRET with ACR=1 (AAL2) and 2 AMR" "true" "SECRET" "1" '["pwd","otp"]'
test_opa "SECRET with ACR=1 and 1 AMR (should DENY - need 2+ factors)" "false" "SECRET" "1" '["pwd"]'
test_opa "CONFIDENTIAL with ACR=1 and 2 AMR" "true" "CONFIDENTIAL" "1" '["pwd","otp"]'

echo ""
echo "Testing CLASSIFIED resources - AAL3 (should ALLOW):"
echo "----------------------------------------------------"
test_opa "SECRET with ACR=2 (AAL3) and 2 AMR" "true" "SECRET" "2" '["pwd","webauthn"]'
# Note: TOP_SECRET requires TOP_SECRET clearance - user has SECRET

echo ""
echo "Testing STRING ACR values (backward compatibility):"
echo "---------------------------------------------------"
test_opa "SECRET with ACR=silver (URN format)" "true" "SECRET" "silver" '["pwd","otp"]'
test_opa "SECRET with ACR=gold (URN format)" "true" "SECRET" "gold" '["pwd","webauthn"]'

echo ""
echo "=========================================="
echo "Test Results:"
echo "=========================================="
echo "Total: $test_count"
echo -e "${GREEN}Passed: $pass_count${NC}"
echo -e "${RED}Failed: $fail_count${NC}"
echo ""

if [ $fail_count -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi

