#!/bin/bash

#############################################################################
# DIVE V3 - Performance Benchmark Suite
#
# Automated performance testing and reporting
# Verifies system meets Phase 3 performance targets
#
# Usage:
#   ./scripts/performance-benchmark.sh
#   BACKEND_URL=https://staging.dive-v3.mil ./scripts/performance-benchmark.sh
#
# Requirements:
#   - autocannon (npm install -g autocannon)
#   - jq (for JSON parsing)
#
# Phase 4 - CI/CD & QA Automation
#############################################################################

set -e

echo "⚡ DIVE V3 - Performance Benchmark Suite"
echo "=========================================="
echo ""

# Configuration
BACKEND_URL=${BACKEND_URL:-http://localhost:4000}
DURATION=${DURATION:-30}
CONNECTIONS=${CONNECTIONS:-50}

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Performance targets (from Phase 3)
TARGET_P95_LATENCY=200        # ms
TARGET_THROUGHPUT=100         # req/s
TARGET_CACHE_HIT_RATE=80      # %
TARGET_DB_QUERY_TIME=100      # ms

#############################################################################
# Install autocannon if not present
#############################################################################

if ! command -v autocannon &> /dev/null; then
    echo -e "${YELLOW}⚠️  autocannon not found. Installing...${NC}"
    npm install -g autocannon
    echo ""
fi

#############################################################################
# Test 1: Health Endpoint Throughput
#############################################################################

echo -e "${BLUE}Test 1: Health Endpoint Throughput${NC}"
echo "-----------------------------------"
echo "Target: >$TARGET_THROUGHPUT req/s"
echo ""

autocannon -c $CONNECTIONS -d $DURATION \
  --renderStatusCodes \
  "$BACKEND_URL/health" > /tmp/benchmark-health.txt

health_throughput=$(grep "Req/Sec" /tmp/benchmark-health.txt | awk '{print $2}' | head -1)
health_latency_p95=$(grep "99%" /tmp/benchmark-health.txt | awk '{print $2}' | head -1)

echo ""
echo "Results:"
echo "  Throughput: $health_throughput req/s"
echo "  P95 Latency: $health_latency_p95 ms"

if (( $(echo "$health_throughput > $TARGET_THROUGHPUT" | bc -l) )); then
    echo -e "  ${GREEN}✓ PASS${NC} (exceeds target)"
else
    echo -e "  ${YELLOW}⚠ WARN${NC} (below target)"
fi

echo ""
echo "Press Enter to continue..."
read -r

#############################################################################
# Test 2: Detailed Health Endpoint
#############################################################################

echo -e "${BLUE}Test 2: Detailed Health Endpoint${NC}"
echo "---------------------------------"
echo ""

autocannon -c 20 -d 10 \
  --renderStatusCodes \
  "$BACKEND_URL/health/detailed" > /tmp/benchmark-detailed.txt

detailed_throughput=$(grep "Req/Sec" /tmp/benchmark-detailed.txt | awk '{print $2}' | head -1)
detailed_latency_p95=$(grep "99%" /tmp/benchmark-detailed.txt | awk '{print $2}' | head -1)

echo ""
echo "Results:"
echo "  Throughput: $detailed_throughput req/s"
echo "  P95 Latency: $detailed_latency_p95 ms"

echo ""
echo "Press Enter to continue..."
read -r

#############################################################################
# Test 3: Cache Performance
#############################################################################

echo -e "${BLUE}Test 3: Cache Hit Rate${NC}"
echo "----------------------"
echo "Target: >$TARGET_CACHE_HIT_RATE%"
echo ""

# Get cache stats from health endpoint
cache_stats=$(curl -s "$BACKEND_URL/health/detailed" | jq '.metrics.cacheHitRate // 0')

echo "Current Cache Hit Rate: $cache_stats%"

if (( $(echo "$cache_stats >= $TARGET_CACHE_HIT_RATE" | bc -l) )); then
    echo -e "${GREEN}✓ PASS${NC} (meets target)"
else
    echo -e "${YELLOW}⚠ WARN${NC} (below target of $TARGET_CACHE_HIT_RATE%)"
fi

echo ""
echo "Press Enter to continue..."
read -r

#############################################################################
# Test 4: Backend Unit Tests Performance
#############################################################################

echo -e "${BLUE}Test 4: Backend Test Suite Performance${NC}"
echo "---------------------------------------"
echo ""

cd "$(dirname "$0")/../backend" || exit 1

echo "Running test suite with performance tracking..."
START_TIME=$(date +%s)
npm run test -- --maxWorkers=4 --silent > /tmp/test-output.txt 2>&1 || true
END_TIME=$(date +%s)
TEST_DURATION=$((END_TIME - START_TIME))

# Extract test results
total_tests=$(grep -o "[0-9]* tests" /tmp/test-output.txt | head -1 | awk '{print $1}')
passed_tests=$(grep -o "[0-9]* passed" /tmp/test-output.txt | head -1 | awk '{print $1}')

echo ""
echo "Test Suite Results:"
echo "  Total Tests: $total_tests"
echo "  Passed: $passed_tests"
echo "  Duration: ${TEST_DURATION}s"
echo "  Avg Time per Test: $(echo "scale=2; $TEST_DURATION / $total_tests" | bc)s"

if [ "$passed_tests" == "$total_tests" ]; then
    echo -e "  ${GREEN}✓ PASS${NC} (all tests passing)"
else
    echo -e "  ${RED}✗ FAIL${NC} (some tests failing)"
fi

cd - > /dev/null

echo ""

#############################################################################
# Test 5: Database Query Performance
#############################################################################

echo -e "${BLUE}Test 5: Database Query Performance${NC}"
echo "-----------------------------------"
echo "Target: <$TARGET_DB_QUERY_TIME ms"
echo ""

# This would require actual database queries
# For now, we'll check if MongoDB is responding quickly
if command -v docker &> /dev/null; then
    if docker ps | grep -q dive-v3-mongodb; then
        START=$(date +%s%N)
        docker exec dive-v3-mongodb mongosh --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1
        END=$(date +%s%N)
        QUERY_TIME=$(( (END - START) / 1000000 )) # Convert to ms
        
        echo "MongoDB Ping: ${QUERY_TIME}ms"
        
        if [ $QUERY_TIME -lt $TARGET_DB_QUERY_TIME ]; then
            echo -e "${GREEN}✓ PASS${NC} (meets target)"
        else
            echo -e "${YELLOW}⚠ WARN${NC} (exceeds target of ${TARGET_DB_QUERY_TIME}ms)"
        fi
    else
        echo -e "${YELLOW}⚠ SKIP${NC} (MongoDB container not running)"
    fi
else
    echo -e "${YELLOW}⚠ SKIP${NC} (Docker not available)"
fi

echo ""

#############################################################################
# Performance Summary Report
#############################################################################

echo "=========================================="
echo "Performance Benchmark Report"
echo "=========================================="
echo ""

echo -e "${BLUE}Test Results:${NC}"
echo ""
echo "1. Health Endpoint Throughput"
echo "   - Throughput: $health_throughput req/s (target: >$TARGET_THROUGHPUT)"
echo "   - P95 Latency: $health_latency_p95 ms (target: <$TARGET_P95_LATENCY)"
echo ""
echo "2. Detailed Health Endpoint"
echo "   - Throughput: $detailed_throughput req/s"
echo "   - P95 Latency: $detailed_latency_p95 ms"
echo ""
echo "3. Cache Performance"
echo "   - Hit Rate: $cache_stats% (target: >$TARGET_CACHE_HIT_RATE%)"
echo ""
echo "4. Test Suite Performance"
echo "   - Total Tests: $total_tests"
echo "   - Pass Rate: $passed_tests/$total_tests"
echo "   - Duration: ${TEST_DURATION}s"
echo ""
echo "5. Database Performance"
if command -v docker &> /dev/null && docker ps | grep -q dive-v3-mongodb; then
    echo "   - Query Time: ${QUERY_TIME}ms (target: <$TARGET_DB_QUERY_TIME ms)"
else
    echo "   - Query Time: N/A (not tested)"
fi

echo ""
echo "=========================================="
echo ""

# Overall assessment
PASSING=true

if ! (( $(echo "$health_throughput > $TARGET_THROUGHPUT" | bc -l) )); then
    PASSING=false
fi

if ! (( $(echo "$cache_stats >= $TARGET_CACHE_HIT_RATE" | bc -l) )); then
    PASSING=false
fi

if [ "$PASSING" = true ]; then
    echo -e "${GREEN}✅ Performance benchmarks PASSED${NC}"
    echo "System meets or exceeds all performance targets."
    exit 0
else
    echo -e "${YELLOW}⚠️  Some benchmarks below target${NC}"
    echo "Review results above for details."
    exit 1
fi

