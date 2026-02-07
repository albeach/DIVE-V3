#!/usr/bin/env bash
# test-port-ssot-compliance.sh
# Validates that all port calculation functions return consistent values
# SSOT: nato-countries.sh get_country_ports() function

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source required scripts
source "$DIVE_ROOT/scripts/dive-modules/common.sh" 2>/dev/null || true
source "$DIVE_ROOT/scripts/nato-countries.sh" 2>/dev/null || true

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED_TESTS=0
PASSED_TESTS=0

# Test helper
assert_port_match() {
    local test_name="$1"
    local expected_kas_port="$2"
    local actual_kas_port="$3"
    
    if [ "$expected_kas_port" -eq "$actual_kas_port" ]; then
        echo -e "${GREEN}✓${NC} $test_name: KAS port $actual_kas_port matches SSOT"
        ((PASSED_TESTS++))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name: Expected $expected_kas_port, got $actual_kas_port"
        ((FAILED_TESTS++))
        return 1
    fi
}

echo "======================================================================"
echo "PORT SSOT COMPLIANCE TEST"
echo "======================================================================"
echo "SSOT: nato-countries.sh:get_country_ports() → SPOKE_KAS_PORT=\$((9000 + offset))"
echo ""

# Test NATO countries (FRA, GBR, DEU, CAN, USA)
for country in FRA GBR DEU CAN USA; do
    echo "Testing: $country"
    echo "----------------------------------------------------------------------"
    
    # Get SSOT port from nato-countries.sh
    ssot_output=$(get_country_ports "$country" 2>&1 || echo "")
    if [ -n "$ssot_output" ] && ! echo "$ssot_output" | grep -q "ERROR"; then
        eval "$ssot_output"
        ssot_kas_port="$SPOKE_KAS_PORT"
        echo "  SSOT (get_country_ports): $ssot_kas_port"
        
        # Test get_instance_ports() from common.sh
        instance_output=$(get_instance_ports "$country" 2>&1 || echo "")
        if [ -n "$instance_output" ]; then
            eval "$instance_output"
            assert_port_match "get_instance_ports($country)" "$ssot_kas_port" "$SPOKE_KAS_PORT"
        fi
    else
        echo "  Skipped: $country not in NATO database"
    fi
    
    echo ""
done

# Verify the KAS port formula is 9000+offset (not 10000+offset)
echo "Verifying KAS Port Formula Compliance"
echo "----------------------------------------------------------------------"
if grep -q 'SPOKE_KAS_PORT=\$((10000' "$DIVE_ROOT/scripts/dive-modules/common.sh" 2>/dev/null; then
    echo -e "${RED}✗${NC} CRITICAL: common.sh still uses 10000+offset (should be 9000+offset)"
    ((FAILED_TESTS++))
else
    echo -e "${GREEN}✓${NC} common.sh uses correct formula: 9000+offset"
    ((PASSED_TESTS++))
fi

if grep -q 'SPOKE_KAS_PORT=\$((10000' "$DIVE_ROOT/scripts/nato-countries.sh" 2>/dev/null; then
    echo -e "${RED}✗${NC} CRITICAL: nato-countries.sh uses 10000+offset (should be 9000+offset)"
    ((FAILED_TESTS++))
else
    echo -e "${GREEN}✓${NC} nato-countries.sh uses correct formula: 9000+offset"
    ((PASSED_TESTS++))
fi

echo ""
echo "======================================================================"
echo "TEST RESULTS"
echo "======================================================================"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"

if [ "$FAILED_TESTS" -gt 0 ]; then
    echo ""
    echo -e "${RED}PORT SSOT COMPLIANCE FAILED${NC}"
    echo "Fix required: Align all port calculation functions with nato-countries.sh SSOT"
    exit 1
else
    echo ""
    echo -e "${GREEN}PORT SSOT COMPLIANCE PASSED${NC}"
    exit 0
fi
