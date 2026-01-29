#!/bin/bash
##########################################################################################
# Federation Constraints Performance Benchmark
#
# Measures:
# 1. OPAL distribution latency (MongoDB → Spoke OPA)
# 2. OPA evaluation latency (authorization decision time)
# 3. CDC detection latency (MongoDB change → CDC trigger)
# 4. System throughput under load
#
# Usage: ./benchmark-federation-constraints.sh
#
# Phase 5, Task 5.3
# Date: 2026-01-28
##########################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API_URL="${DIVE_API_URL:-https://localhost:4000}"
ADMIN_TOKEN="${DIVE_ADMIN_TOKEN:-}"

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      Federation Constraints - Performance Benchmark       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

##########################################################################################
# BENCHMARK 1: OPAL Distribution Latency
##########################################################################################

echo -e "${BLUE}Benchmark 1: OPAL Distribution Latency${NC}"
echo "  Measuring: MongoDB insert → Spoke OPA data availability"
echo ""

if [ -z "$ADMIN_TOKEN" ]; then
  echo -e "  ${YELLOW}⚠ SKIPPED${NC} - DIVE_ADMIN_TOKEN not provided"
  echo ""
else
  # Generate unique test constraint
  TEST_ID=$(date +%s)

  # Record start time (nanoseconds)
  START_NS=$(date +%s%N)

  # Create constraint
  curl -s -k -X POST "${API_URL}/api/federation-constraints" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"ownerTenant\": \"TEST\",
      \"partnerTenant\": \"BENCH${TEST_ID}\",
      \"maxClassification\": \"SECRET\",
      \"allowedCOIs\": [\"NATO\"],
      \"deniedCOIs\": [],
      \"relationshipType\": \"spoke_spoke\",
      \"description\": \"Performance benchmark test\"
    }" > /dev/null

  # Poll Hub OPA until data appears (max 10 seconds)
  MAX_WAIT=10
  ELAPSED=0
  FOUND=false

  while [ $ELAPSED -lt $MAX_WAIT ]; do
    OPA_DATA=$(curl -s -k https://localhost:8181/v1/data/federation_constraints 2>/dev/null || echo "")

    if echo "$OPA_DATA" | jq -e ".result.federation_constraints.TEST.BENCH${TEST_ID}" > /dev/null 2>&1; then
      END_NS=$(date +%s%N)
      LATENCY_MS=$(( (END_NS - START_NS) / 1000000 ))
      FOUND=true
      break
    fi

    sleep 0.1
    ELAPSED=$((ELAPSED + 1))
  done

  if [ "$FOUND" = true ]; then
    echo -e "  ${GREEN}OPAL Distribution Latency: ${LATENCY_MS}ms${NC}"

    if [ "$LATENCY_MS" -lt 1000 ]; then
      echo -e "  ${GREEN}✓${NC} Meets target (< 1000ms)"
    else
      echo -e "  ${YELLOW}⚠${NC} Exceeds target (${LATENCY_MS}ms > 1000ms)"
    fi
  else
    echo -e "  ${RED}✗${NC} Constraint data not found in OPA after ${MAX_WAIT}s"
  fi

  # Cleanup test constraint
  curl -s -k -X DELETE "${API_URL}/api/federation-constraints/TEST/BENCH${TEST_ID}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" > /dev/null

  echo ""
fi

##########################################################################################
# BENCHMARK 2: OPA Evaluation Latency
##########################################################################################

echo -e "${BLUE}Benchmark 2: OPA Policy Evaluation Latency${NC}"
echo "  Measuring: OPA decision endpoint response time"
echo ""

if command -v opa &> /dev/null; then
  # Create test input
  cat > /tmp/opa-bench-input.json << 'EOFOPA'
{
  "input": {
    "subject": {
      "authenticated": true,
      "uniqueID": "bench-user@dive.nato.int",
      "clearance": "SECRET",
      "countryOfAffiliation": "DEU",
      "acpCOI": ["NATO"],
      "issuer": "https://keycloak-deu:8443/realms/dive-v3-broker-deu"
    },
    "resource": {
      "resourceId": "bench-doc-123",
      "classification": "CONFIDENTIAL",
      "ownerTenant": "FRA",
      "releasabilityTo": ["FRA", "DEU"],
      "COI": ["NATO"]
    },
    "action": {"operation": "GET"},
    "context": {
      "currentTime": "2026-01-28T12:00:00Z",
      "tenant": "FRA"
    }
  }
}
EOFOPA

  # Run 100 evaluations and measure
  TOTAL_MS=0
  RUNS=100

  for i in $(seq 1 $RUNS); do
    START=$(date +%s%N)
    curl -s -k https://localhost:8181/v1/data/dive/authz/decision \
      -H "Content-Type: application/json" \
      -d @/tmp/opa-bench-input.json > /dev/null
    END=$(date +%s%N)

    LATENCY=$(( (END - START) / 1000000 ))
    TOTAL_MS=$((TOTAL_MS + LATENCY))
  done

  AVG_MS=$((TOTAL_MS / RUNS))

  echo -e "  ${GREEN}OPA Evaluation Latency (avg of $RUNS runs): ${AVG_MS}ms${NC}"

  if [ "$AVG_MS" -lt 5 ]; then
    echo -e "  ${GREEN}✓${NC} Meets target (< 5ms)"
  else
    echo -e "  ${YELLOW}⚠${NC} Exceeds target (${AVG_MS}ms > 5ms)"
  fi

  echo ""
else
  echo -e "  ${YELLOW}⚠ SKIPPED${NC} - OPA not installed"
  echo ""
fi

##########################################################################################
# BENCHMARK 3: CDC Detection Latency
##########################################################################################

echo -e "${BLUE}Benchmark 3: CDC Detection Latency${NC}"
echo "  Measuring: MongoDB change → CDC publish"
echo ""
echo -e "  ${YELLOW}⚠ INFO${NC} - CDC latency is logged in backend"
echo "    Check logs: ./dive hub logs backend | grep 'CDC: Published data'"
echo "    Expected: < 100ms detection + 1000ms debounce"
echo ""

##########################################################################################
# BENCHMARK 4: System Throughput
##########################################################################################

echo -e "${BLUE}Benchmark 4: System Throughput (Optional)${NC}"
echo "  Measuring: Requests per second capacity"
echo ""

if command -v ab &> /dev/null; then
  echo "  Running Apache Bench (100 requests, concurrency 10)..."

  # Note: Requires valid auth token in header
  ab -n 100 -c 10 -k \
    -H "Authorization: Bearer ${ADMIN_TOKEN:-test}" \
    "${API_URL}/api/federation-constraints" 2>&1 | grep -E "Requests per second|Time per request|Failed requests" || echo "  Benchmark requires valid token"

  echo ""
else
  echo -e "  ${YELLOW}⚠ SKIPPED${NC} - Apache Bench (ab) not installed"
  echo "    Install: brew install httpd (macOS) or apt-get install apache2-utils (Linux)"
  echo ""
fi

##########################################################################################
# SUMMARY
##########################################################################################

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Benchmark Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "Performance Targets:"
echo "  • OPAL Distribution: < 1000ms"
echo "  • OPA Evaluation: < 5ms"
echo "  • CDC Detection: < 100ms (+ 1s debounce)"
echo "  • System Throughput: 100 req/s"
echo ""
echo "For detailed performance analysis:"
echo "  1. Check backend logs: ./dive hub logs backend | grep 'Federation constraint'"
echo "  2. Check OPAL Server logs: ./dive hub logs opal-server | grep 'Broadcasting'"
echo "  3. Monitor Prometheus metrics (if configured)"
echo ""
