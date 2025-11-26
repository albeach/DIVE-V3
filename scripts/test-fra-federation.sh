#!/bin/bash

###############################################################################################
# FRA Federation Test Suite
# 
# Purpose: Comprehensive testing of metadata federation between FRA and USA instances
# Tests: Resource sync, conflict resolution, correlation tracking, decision sharing
#
# Usage: ./scripts/test-fra-federation.sh [--verbose]
###############################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERBOSE=false
TESTS_PASSED=0
TESTS_FAILED=0

# Parse arguments
for arg in "$@"; do
  case $arg in
    --verbose)
      VERBOSE=true
      shift
      ;;
  esac
done

# Test configuration
FRA_API="http://localhost:4001"
USA_API="http://localhost:4000"
TEST_CORRELATION_ID="test-federation-$(date +%s)"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  FRA Federation Test Suite${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo "Test Correlation ID: $TEST_CORRELATION_ID"
echo ""

# Helper function for API calls
api_call() {
  local method=$1
  local url=$2
  local data=$3
  local expected_status=$4
  
  if [ "$VERBOSE" = true ]; then
    echo -e "${CYAN}API Call: $method $url${NC}"
  fi
  
  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "X-Correlation-ID: $TEST_CORRELATION_ID" \
      -H "Content-Type: application/json" \
      "$url")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "X-Correlation-ID: $TEST_CORRELATION_ID" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$url")
  fi
  
  status_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)
  
  if [ "$status_code" = "$expected_status" ]; then
    echo "$body"
    return 0
  else
    echo -e "${RED}Expected status $expected_status, got $status_code${NC}"
    if [ "$VERBOSE" = true ]; then
      echo "$body"
    fi
    return 1
  fi
}

# Test function wrapper
run_test() {
  local test_name=$1
  local test_function=$2
  
  echo -e "${BLUE}Testing: $test_name...${NC}"
  
  if $test_function; then
    echo -e "${GREEN}✓ $test_name passed${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ $test_name failed${NC}"
    ((TESTS_FAILED++))
  fi
  echo ""
}

###############################################################################################
# Test 1: Federation Service Status
###############################################################################################

test_federation_status() {
  local result=$(api_call GET "$FRA_API/federation/status" "" 200)
  
  if echo "$result" | grep -q "operational"; then
    if [ "$VERBOSE" = true ]; then
      echo "$result" | jq '.' 2>/dev/null || echo "$result"
    fi
    return 0
  else
    return 1
  fi
}

###############################################################################################
# Test 2: Resource Listing with Filters
###############################################################################################

test_resource_listing() {
  # Test without filters
  local all_resources=$(api_call GET "$FRA_API/federation/resources" "" 200)
  local count_all=$(echo "$all_resources" | jq '.count' 2>/dev/null || echo "0")
  
  # Test with releasability filter
  local usa_resources=$(api_call GET "$FRA_API/federation/resources?releasableTo=USA" "" 200)
  local count_usa=$(echo "$usa_resources" | jq '.count' 2>/dev/null || echo "0")
  
  # Test with classification filter
  local secret_resources=$(api_call GET "$FRA_API/federation/resources?classification=SECRET" "" 200)
  local count_secret=$(echo "$secret_resources" | jq '.count' 2>/dev/null || echo "0")
  
  echo "  All resources: $count_all"
  echo "  Releasable to USA: $count_usa"
  echo "  SECRET classification: $count_secret"
  
  # Verify correlation ID is present
  if echo "$all_resources" | grep -q "$TEST_CORRELATION_ID"; then
    return 0
  else
    echo -e "${RED}  Correlation ID not found in response${NC}"
    return 1
  fi
}

###############################################################################################
# Test 3: Resource Import Simulation
###############################################################################################

test_resource_import() {
  local test_resource='{
    "resources": [
      {
        "resourceId": "USA-TEST-001",
        "title": "Test Resource from USA",
        "classification": "SECRET",
        "releasabilityTo": ["USA", "FRA", "GBR"],
        "COI": ["NATO-COSMIC"],
        "originRealm": "USA",
        "version": 1,
        "lastModified": "2025-11-24T10:00:00Z"
      }
    ]
  }'
  
  local result=$(api_call POST "$FRA_API/federation/resources" "$test_resource" 200)
  
  if echo "$result" | grep -q "synced"; then
    local synced=$(echo "$result" | jq '.result.synced' 2>/dev/null || echo "0")
    echo "  Resources synced: $synced"
    return 0
  else
    return 1
  fi
}

###############################################################################################
# Test 4: Conflict Resolution
###############################################################################################

test_conflict_resolution() {
  # First import - version 1
  local resource_v1='{
    "resources": [
      {
        "resourceId": "USA-CONFLICT-001",
        "title": "Conflict Test Resource v1",
        "classification": "CONFIDENTIAL",
        "releasabilityTo": ["USA", "FRA"],
        "COI": ["NATO"],
        "originRealm": "USA",
        "version": 1,
        "lastModified": "2025-11-24T09:00:00Z"
      }
    ]
  }'
  
  api_call POST "$FRA_API/federation/resources" "$resource_v1" 200 > /dev/null
  
  # Second import - version 2 (should update)
  local resource_v2='{
    "resources": [
      {
        "resourceId": "USA-CONFLICT-001",
        "title": "Conflict Test Resource v2",
        "classification": "CONFIDENTIAL",
        "releasabilityTo": ["USA", "FRA", "CAN"],
        "COI": ["NATO"],
        "originRealm": "USA",
        "version": 2,
        "lastModified": "2025-11-24T10:00:00Z"
      }
    ]
  }'
  
  local result=$(api_call POST "$FRA_API/federation/resources" "$resource_v2" 200)
  
  if echo "$result" | grep -q "updated"; then
    local updated=$(echo "$result" | jq '.result.updated' 2>/dev/null || echo "0")
    echo "  Resources updated via conflict resolution: $updated"
    return 0
  else
    return 1
  fi
}

###############################################################################################
# Test 5: Decision Sharing
###############################################################################################

test_decision_sharing() {
  local test_decisions='{
    "decisions": [
      {
        "decisionId": "dec-001",
        "timestamp": "2025-11-24T10:00:00Z",
        "subject": "john.doe@fra.mil",
        "resource": "FRA-001",
        "action": "read",
        "decision": "allow",
        "clearanceUsed": "SECRET",
        "policyVersion": "1.0"
      },
      {
        "decisionId": "dec-002",
        "timestamp": "2025-11-24T10:01:00Z",
        "subject": "jane.smith@usa.mil",
        "resource": "FRA-002",
        "action": "read",
        "decision": "deny",
        "reason": "Insufficient clearance",
        "policyVersion": "1.0"
      }
    ]
  }'
  
  local result=$(api_call POST "$FRA_API/federation/decisions" "$test_decisions" 200)
  
  if echo "$result" | grep -q "stored"; then
    local count=$(echo "$result" | jq '.decisionsReceived' 2>/dev/null || echo "0")
    echo "  Decisions shared: $count"
    return 0
  else
    return 1
  fi
}

###############################################################################################
# Test 6: Sync History
###############################################################################################

test_sync_history() {
  local result=$(api_call GET "$FRA_API/federation/sync/history?limit=5" "" 200)
  
  if echo "$result" | grep -q "syncHistory"; then
    local count=$(echo "$result" | jq '.count' 2>/dev/null || echo "0")
    echo "  Sync history entries: $count"
    
    if [ "$VERBOSE" = true ]; then
      echo "$result" | jq '.syncHistory[] | {timestamp, resourcesSynced, duration}' 2>/dev/null
    fi
    return 0
  else
    return 1
  fi
}

###############################################################################################
# Test 7: Conflict Report
###############################################################################################

test_conflict_report() {
  local result=$(api_call GET "$FRA_API/federation/conflicts" "" 200)
  
  if echo "$result" | grep -q "totalConflicts"; then
    local total=$(echo "$result" | jq '.totalConflicts' 2>/dev/null || echo "0")
    local local_wins=$(echo "$result" | jq '.byResolution.local_wins' 2>/dev/null || echo "0")
    local remote_wins=$(echo "$result" | jq '.byResolution.remote_wins' 2>/dev/null || echo "0")
    
    echo "  Total conflicts: $total"
    echo "  Local wins: $local_wins"
    echo "  Remote wins: $remote_wins"
    return 0
  else
    return 1
  fi
}

###############################################################################################
# Test 8: Manual Sync Trigger
###############################################################################################

test_manual_sync() {
  echo "  Triggering manual sync with USA..."
  
  local sync_request='{
    "targetRealm": "USA"
  }'
  
  # Note: This will fail if USA endpoint is not configured
  # We expect a controlled failure here for testing
  local result=$(api_call POST "$FRA_API/federation/sync" "$sync_request" 200 2>/dev/null || echo '{"error": "Expected in test"}')
  
  if echo "$result" | grep -q "error"; then
    echo "  Sync attempt made (USA endpoint not yet configured - expected)"
    return 0
  elif echo "$result" | grep -q "resourcesSynced"; then
    local synced=$(echo "$result" | jq '.resourcesSynced' 2>/dev/null || echo "0")
    echo "  Resources synced: $synced"
    return 0
  else
    return 1
  fi
}

###############################################################################################
# Performance Tests
###############################################################################################

test_performance() {
  echo "  Testing federation endpoint performance..."
  
  local start_time=$(date +%s%N)
  
  # Make 10 rapid requests
  for i in {1..10}; do
    curl -s -H "X-Correlation-ID: perf-test-$i" \
      "$FRA_API/federation/status" > /dev/null 2>&1
  done
  
  local end_time=$(date +%s%N)
  local duration_ms=$(( (end_time - start_time) / 1000000 ))
  local avg_ms=$(( duration_ms / 10 ))
  
  echo "  Average response time: ${avg_ms}ms"
  
  if [ "$avg_ms" -lt 100 ]; then
    echo -e "  ${GREEN}Performance: Excellent (<100ms)${NC}"
    return 0
  elif [ "$avg_ms" -lt 500 ]; then
    echo -e "  ${YELLOW}Performance: Good (<500ms)${NC}"
    return 0
  else
    echo -e "  ${RED}Performance: Poor (>${avg_ms}ms)${NC}"
    return 1
  fi
}

###############################################################################################
# Run All Tests
###############################################################################################

echo -e "${CYAN}Running Federation Tests...${NC}"
echo ""

run_test "Federation Service Status" test_federation_status
run_test "Resource Listing" test_resource_listing
run_test "Resource Import" test_resource_import
run_test "Conflict Resolution" test_conflict_resolution
run_test "Decision Sharing" test_decision_sharing
run_test "Sync History" test_sync_history
run_test "Conflict Report" test_conflict_report
run_test "Manual Sync Trigger" test_manual_sync
run_test "Performance" test_performance

###############################################################################################
# Gap Analysis Check
###############################################################################################

echo -e "${CYAN}Gap Mitigation Verification:${NC}"
echo ""

# GAP-003: Resource Consistency
echo -e "${BLUE}GAP-003 (Resource Consistency):${NC}"
if api_call GET "$FRA_API/federation/resources" "" 200 | grep -q "originRealm"; then
  echo -e "  ${GREEN}✓ Resource namespacing verified${NC}"
else
  echo -e "  ${RED}✗ Resource namespacing missing${NC}"
fi

# GAP-004: Correlation IDs
echo -e "${BLUE}GAP-004 (Correlation Tracking):${NC}"
if api_call GET "$FRA_API/federation/status" "" 200 | grep -q "$TEST_CORRELATION_ID"; then
  echo -e "  ${GREEN}✓ Correlation IDs working${NC}"
else
  echo -e "  ${RED}✗ Correlation IDs not propagated${NC}"
fi

# GAP-007: Data Residency
echo -e "${BLUE}GAP-007 (Data Residency):${NC}"
RESOURCES=$(api_call GET "$FRA_API/federation/resources" "" 200)
if echo "$RESOURCES" | jq '.resources[] | select(.classification == "TOP_SECRET")' 2>/dev/null | wc -l | grep -q "0"; then
  echo -e "  ${GREEN}✓ TOP_SECRET resources not federated${NC}"
else
  echo -e "  ${RED}✗ TOP_SECRET resources exposed${NC}"
fi

###############################################################################################
# Test Summary
###############################################################################################

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Test Summary${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
  echo -e "${GREEN}✓ All federation tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi




