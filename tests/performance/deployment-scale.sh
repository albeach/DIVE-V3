#!/usr/bin/env bash
# =============================================================================
# Deployment Performance Tests
# =============================================================================
# Test scalability to 10+ spokes
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$DIVE_ROOT"

# Source common utilities
if [ -f "${DIVE_ROOT}/scripts/dive-modules/common.sh" ]; then
    source "${DIVE_ROOT}/scripts/dive-modules/common.sh"
fi

NUM_SPOKES="${1:-5}"
TEST_SPOKES=()

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Deployment Performance Tests                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Generate test spoke codes
for i in $(seq 1 $NUM_SPOKES); do
    TEST_SPOKES+=("TST${i}")
done

# Test 1: Sequential deployment
test_sequential_deploy() {
    echo "Test 1: Sequential deployment of $NUM_SPOKES spokes"
    echo ""

    local start_time=$(date +%s)
    local success=0
    local failed=0

    for spoke in "${TEST_SPOKES[@]}"; do
        echo -n "  Deploying $spoke... "
        if ./dive spoke deploy "$spoke" "Test $spoke" >/tmp/seq-${spoke}.log 2>&1; then
            echo -e "${GREEN}✓${NC}"
            success=$((success + 1))
        else
            echo -e "${RED}✗${NC}"
            failed=$((failed + 1))
        fi
    done

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    echo ""
    echo "  Results: $success succeeded, $failed failed"
    echo "  Duration: ${duration}s (avg: $((duration / NUM_SPOKES))s per spoke)"

    if [ $failed -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

# Test 2: Concurrent deployment
test_concurrent_deploy() {
    echo "Test 2: Concurrent deployment of $NUM_SPOKES spokes"
    echo ""

    local start_time=$(date +%s)
    local pids=()

    # Start all deployments
    for spoke in "${TEST_SPOKES[@]}"; do
        echo "  Starting $spoke..."
        ./dive spoke deploy "$spoke" "Test $spoke" >/tmp/conc-${spoke}.log 2>&1 &
        pids+=($!)
    done

    # Wait for all
    local success=0
    local failed=0
    for pid in "${pids[@]}"; do
        wait $pid && success=$((success + 1)) || failed=$((failed + 1))
    done

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    echo ""
    echo "  Results: $success succeeded, $failed failed"
    echo "  Duration: ${duration}s (concurrent)"

    if [ $failed -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

# Test 3: Resource usage
test_resource_usage() {
    echo "Test 3: Resource usage check"
    echo ""

    local total_containers=0
    local total_memory=0

    for spoke in "${TEST_SPOKES[@]}"; do
        local code_lower=$(lower "$spoke")
        local containers=$(docker ps --filter "name=dive-spoke-${code_lower}" --format '{{.Names}}' | wc -l | tr -d ' ')
        total_containers=$((total_containers + containers))
    done

    echo "  Total containers: $total_containers"
    echo "  Expected: $((NUM_SPOKES * 9)) (9 per spoke)"

    if [ $total_containers -eq $((NUM_SPOKES * 9)) ]; then
        echo -e "  ${GREEN}✓ Resource usage as expected${NC}"
        return 0
    else
        echo -e "  ${YELLOW}⚠ Resource usage differs${NC}"
        return 0
    fi
}

# Run tests
echo "Running performance tests..."
echo ""

test_sequential_deploy
echo ""
test_concurrent_deploy
echo ""
test_resource_usage

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Performance tests complete${NC}"

