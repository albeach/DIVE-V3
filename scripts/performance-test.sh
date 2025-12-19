#!/bin/bash
set -e

# DIVE V3 Performance Benchmarking Script
# Tests API latency, throughput, and federation performance
# Target: < 200ms p95 latency for authorization decisions

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
KEYCLOAK_URL="${KEYCLOAK_URL:-https://localhost:8443}"
OPA_URL="${OPA_URL:-http://localhost:8181}"

# Test parameters
CONCURRENT_USERS="${CONCURRENT_USERS:-10}"
TEST_DURATION="${TEST_DURATION:-60}"  # seconds
WARMUP_DURATION="${WARMUP_DURATION:-10}"  # seconds

# Results storage
RESULTS_DIR="$PROJECT_ROOT/performance-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULT_FILE="$RESULTS_DIR/performance_$TIMESTAMP.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create results directory
setup_results_dir() {
    mkdir -p "$RESULTS_DIR"
    log_info "Results will be saved to: $RESULT_FILE"
}

# Check if services are running
check_services() {
    log_info "Checking service availability..."

    # Check backend
    if curl -s -f "$BACKEND_URL/health" > /dev/null 2>&1; then
        log_success "Backend is responding"
    else
        log_error "Backend is not responding at $BACKEND_URL"
        exit 1
    fi

    # Check frontend
    if curl -s -f "$FRONTEND_URL" > /dev/null 2>&1; then
        log_success "Frontend is responding"
    else
        log_warning "Frontend is not responding at $FRONTEND_URL (optional for API tests)"
    fi

    # Check Keycloak
    if curl -s -f -k "$KEYCLOAK_URL/realms/master" > /dev/null 2>&1; then
        log_success "Keycloak is responding"
    else
        log_error "Keycloak is not responding at $KEYCLOAK_URL"
        exit 1
    fi

    # Check OPA
    if curl -s -f "$OPA_URL/health" > /dev/null 2>&1; then
        log_success "OPA is responding"
    else
        log_error "OPA is not responding at $OPA_URL"
        exit 1
    fi
}

# Get authentication token for testing
get_auth_token() {
    log_info "Obtaining authentication token..."

    # This is a simplified token acquisition for testing
    # In production, this would use actual IdP credentials
    TEST_TOKEN="${TEST_TOKEN:-test-jwt-token-for-performance-testing}"

    if [ "$TEST_TOKEN" = "test-jwt-token-for-performance-testing" ]; then
        log_warning "Using test token - set TEST_TOKEN environment variable for real authentication"
    fi

    echo "$TEST_TOKEN"
}

# Single API call timing function
time_api_call() {
    local url="$1"
    local method="${2:-GET}"
    local data="$3"
    local token="$4"

    local start_time=$(date +%s%N)
    local http_code

    if [ "$method" = "POST" ]; then
        http_code=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $token" \
            -d "$data" \
            "$url")
    else
        http_code=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Authorization: Bearer $token" \
            "$url")
    fi

    local end_time=$(date +%s%N)
    local duration_ns=$((end_time - start_time))
    local duration_ms=$((duration_ns / 1000000))

    echo "{\"duration_ms\": $duration_ms, \"http_code\": $http_code}"
}

# Run latency test for a specific endpoint
run_latency_test() {
    local endpoint="$1"
    local method="${2:-GET}"
    local data="$3"
    local test_name="$4"
    local iterations="${5:-100}"

    log_info "Running latency test: $test_name ($iterations iterations)"

    local token=$(get_auth_token)
    local results=()
    local total_duration=0
    local success_count=0

    for i in $(seq 1 "$iterations"); do
        local result=$(time_api_call "$BACKEND_URL$endpoint" "$method" "$data" "$token")
        local duration_ms=$(echo "$result" | jq -r '.duration_ms')
        local http_code=$(echo "$result" | jq -r '.http_code')

        results+=("$duration_ms")

        if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
            total_duration=$((total_duration + duration_ms))
            success_count=$((success_count + 1))
        fi

        # Progress indicator
        if [ $((i % 10)) -eq 0 ]; then
            echo -n "."
        fi
    done
    echo ""

    # Calculate statistics
    local success_rate=$((success_count * 100 / iterations))
    local avg_latency=0
    if [ "$success_count" -gt 0 ]; then
        avg_latency=$((total_duration / success_count))
    fi

    # Sort results for percentiles
    IFS=$'\n' sorted_results=($(sort -n <<<"${results[*]}"))
    unset IFS

    local p50=${sorted_results[$((iterations / 2))]}
    local p95=${sorted_results[$((iterations * 95 / 100))]}
    local p99=${sorted_results[$((iterations * 99 / 100))]}

    echo "{
        \"test_name\": \"$test_name\",
        \"endpoint\": \"$endpoint\",
        \"iterations\": $iterations,
        \"success_rate\": $success_rate,
        \"avg_latency_ms\": $avg_latency,
        \"p50_latency_ms\": $p50,
        \"p95_latency_ms\": $p95,
        \"p99_latency_ms\": $p99
    }"
}

# Run throughput test
run_throughput_test() {
    local endpoint="$1"
    local method="${2:-GET}"
    local data="$3"
    local concurrent_users="${4:-10}"
    local duration="${5:-60}"

    log_info "Running throughput test: $concurrent_users concurrent users for ${duration}s"

    local token=$(get_auth_token)
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))

    # Start background processes
    local pids=()
    local results_files=()

    for i in $(seq 1 "$concurrent_users"); do
        local result_file="/tmp/perf_test_$i.json"
        results_files+=("$result_file")

        (
            local count=0
            local successes=0
            local total_duration=0

            while [ $(date +%s) -lt "$end_time" ]; do
                local result=$(time_api_call "$BACKEND_URL$endpoint" "$method" "$data" "$token")
                local duration_ms=$(echo "$result" | jq -r '.duration_ms')
                local http_code=$(echo "$result" | jq -r '.http_code')

                count=$((count + 1))

                if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
                    successes=$((successes + 1))
                    total_duration=$((total_duration + duration_ms))
                fi
            done

            local avg_latency=0
            if [ "$successes" -gt 0 ]; then
                avg_latency=$((total_duration / successes))
            fi

            echo "{
                \"user_id\": $i,
                \"requests\": $count,
                \"successes\": $successes,
                \"avg_latency_ms\": $avg_latency
            }" > "$result_file"
        ) &
        pids+=($!)
    done

    # Wait for all processes to complete
    for pid in "${pids[@]}"; do
        wait "$pid"
    done

    # Aggregate results
    local total_requests=0
    local total_successes=0
    local total_latency=0
    local user_results=()

    for result_file in "${results_files[@]}"; do
        if [ -f "$result_file" ]; then
            local user_result=$(cat "$result_file")
            user_results+=("$user_result")

            local requests=$(echo "$user_result" | jq -r '.requests')
            local successes=$(echo "$user_result" | jq -r '.successes')
            local avg_latency=$(echo "$user_result" | jq -r '.avg_latency_ms')

            total_requests=$((total_requests + requests))
            total_successes=$((total_successes + successes))
            total_latency=$((total_latency + (avg_latency * successes)))

            rm "$result_file"
        fi
    done

    local throughput=$((total_requests / duration))
    local success_rate=0
    if [ "$total_requests" -gt 0 ]; then
        success_rate=$((total_successes * 100 / total_requests))
    fi

    local avg_latency=0
    if [ "$total_successes" -gt 0 ]; then
        avg_latency=$((total_latency / total_successes))
    fi

    echo "{
        \"test_type\": \"throughput\",
        \"concurrent_users\": $concurrent_users,
        \"duration_seconds\": $duration,
        \"total_requests\": $total_requests,
        \"throughput_rps\": $throughput,
        \"success_rate\": $success_rate,
        \"avg_latency_ms\": $avg_latency
    }"
}

# Test authorization decision performance
test_authorization_performance() {
    log_info "Testing authorization decision performance..."

    # Test data for different authorization scenarios
    local test_cases=(
        "UNCLASSIFIED resource access"
        "SECRET resource access"
        "TOP_SECRET resource access"
        "Country restriction check"
        "COI intersection check"
    )

    local auth_results=()

    # Test different clearance levels
    local clearances=("UNCLASSIFIED" "CONFIDENTIAL" "SECRET" "TOP_SECRET")
    local countries=("USA" "GBR" "FRA" "DEU")

    for clearance in "${clearances[@]}"; do
        for country in "${countries[@]}"; do
            local data="{
                \"subject\": {
                    \"uniqueID\": \"test-user-$clearance-$country\",
                    \"clearance\": \"$clearance\",
                    \"countryOfAffiliation\": \"$country\",
                    \"acpCOI\": [\"FVEY\"],
                    \"authenticated\": true
                },
                \"action\": \"read\",
                \"resource\": {
                    \"resourceId\": \"test-doc-1\",
                    \"classification\": \"$clearance\",
                    \"releasabilityTo\": [\"USA\", \"GBR\", \"FRA\"],
                    \"COI\": [\"FVEY\"]
                }
            }"

            local result=$(run_latency_test "/api/authz/check" "POST" "$data" "AuthZ $clearance $country" 50)
            auth_results+=("$result")
        done
    done

    echo "{
        \"authorization_tests\": [$(IFS=,; echo "${auth_results[*]}")],
        \"target_p95_latency_ms\": 200
    }"
}

# Test federation performance (if available)
test_federation_performance() {
    log_info "Testing federation performance..."

    # This would test cross-instance performance
    # For now, just check if federation endpoints are available

    local federation_results="{}"

    # Check if federation services are available
    if curl -s -f "$BACKEND_URL/api/federation/health" > /dev/null 2>&1; then
        log_success "Federation services detected"
        federation_results=$(run_latency_test "/api/federation/health" "GET" "" "Federation Health Check" 20)
    else
        log_warning "Federation services not available - skipping federation tests"
        federation_results="{\"federation_available\": false}"
    fi

    echo "$federation_results"
}

# Main performance test execution
run_performance_tests() {
    log_info "Starting DIVE V3 Performance Benchmarking Suite"
    log_info "Target: < 200ms p95 latency for authorization decisions"
    echo

    # Basic health checks
    check_services
    echo

    # API Latency Tests
    log_info "=== API Latency Tests ==="

    local health_result=$(run_latency_test "/health" "GET" "" "Health Check")
    local resources_result=$(run_latency_test "/api/resources" "GET" "" "List Resources")

    echo

    # Authorization Performance Tests
    log_info "=== Authorization Performance Tests ==="
    local authz_result=$(test_authorization_performance)
    echo

    # Throughput Tests
    log_info "=== Throughput Tests ==="
    local throughput_result=$(run_throughput_test "/api/authz/check" "POST" "{
        \"subject\": {
            \"uniqueID\": \"perf-test-user\",
            \"clearance\": \"SECRET\",
            \"countryOfAffiliation\": \"USA\",
            \"acpCOI\": [\"FVEY\"],
            \"authenticated\": true
        },
        \"action\": \"read\",
        \"resource\": {
            \"resourceId\": \"perf-test-doc\",
            \"classification\": \"SECRET\",
            \"releasabilityTo\": [\"USA\"],
            \"COI\": [\"FVEY\"]
        }
    }" "$CONCURRENT_USERS" "$TEST_DURATION")
    echo

    # Federation Tests
    log_info "=== Federation Performance Tests ==="
    local federation_result=$(test_federation_performance)
    echo

    # Generate comprehensive results
    local results="{
        \"timestamp\": \"$TIMESTAMP\",
        \"configuration\": {
            \"backend_url\": \"$BACKEND_URL\",
            \"frontend_url\": \"$FRONTEND_URL\",
            \"keycloak_url\": \"$KEYCLOAK_URL\",
            \"opa_url\": \"$OPA_URL\",
            \"concurrent_users\": $CONCURRENT_USERS,
            \"test_duration_seconds\": $TEST_DURATION
        },
        \"health_check\": $health_result,
        \"api_latency\": $resources_result,
        \"authorization_performance\": $authz_result,
        \"throughput_test\": $throughput_result,
        \"federation_performance\": $federation_result
    }"

    echo "$results" | jq '.' > "$RESULT_FILE"

    # Analyze results and provide summary
    analyze_results "$results"
}

# Analyze results and check against targets
analyze_results() {
    local results="$1"

    echo
    log_info "=== Performance Test Results Summary ==="

    # Extract key metrics
    local authz_p95=$(echo "$results" | jq -r '.authorization_performance.authorization_tests[0].p95_latency_ms')
    local throughput_rps=$(echo "$results" | jq -r '.throughput_test.throughput_rps')
    local throughput_success_rate=$(echo "$results" | jq -r '.throughput_test.success_rate')

    echo "Authorization Decision P95 Latency: ${authz_p95}ms (Target: < 200ms)"
    echo "Throughput: ${throughput_rps} requests/second"
    echo "Success Rate: ${throughput_success_rate}%"
    echo

    # Check against targets
    local passed=true

    if [ "$authz_p95" -gt 200 ]; then
        log_error "❌ FAILED: Authorization P95 latency ${authz_p95}ms exceeds 200ms target"
        passed=false
    else
        log_success "✅ PASSED: Authorization P95 latency ${authz_p95}ms within target"
    fi

    if [ "$throughput_success_rate" -lt 99 ]; then
        log_error "❌ FAILED: Throughput success rate ${throughput_success_rate}% below 99% target"
        passed=false
    else
        log_success "✅ PASSED: Throughput success rate ${throughput_success_rate}% meets target"
    fi

    echo
    if [ "$passed" = true ]; then
        log_success "🎉 ALL PERFORMANCE TARGETS MET!"
        log_success "DIVE V3 is production-ready for coalition deployment"
    else
        log_error "⚠️  SOME PERFORMANCE TARGETS NOT MET"
        log_warning "Review results and optimize before production deployment"
    fi

    echo
    log_info "Detailed results saved to: $RESULT_FILE"
}

# Warmup function
warmup_services() {
    log_info "Warming up services for ${WARMUP_DURATION} seconds..."

    local token=$(get_auth_token)
    local end_time=$(( $(date +%s) + WARMUP_DURATION ))

    while [ $(date +%s) -lt "$end_time" ]; do
        time_api_call "$BACKEND_URL/health" "GET" "" "$token" > /dev/null
        sleep 0.1
    done

    log_success "Warmup complete"
    echo
}

# Main execution
main() {
    setup_results_dir

    echo "DIVE V3 Performance Benchmarking Suite"
    echo "======================================"
    echo "Backend URL: $BACKEND_URL"
    echo "Concurrent Users: $CONCURRENT_USERS"
    echo "Test Duration: ${TEST_DURATION}s"
    echo "Results: $RESULT_FILE"
    echo

    warmup_services
    run_performance_tests
}

# Show usage if requested
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "DIVE V3 Performance Benchmarking Script"
    echo
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  --help, -h          Show this help message"
    echo "  --warmup SEC        Warmup duration in seconds (default: $WARMUP_DURATION)"
    echo "  --duration SEC      Test duration in seconds (default: $TEST_DURATION)"
    echo "  --users NUM         Number of concurrent users (default: $CONCURRENT_USERS)"
    echo
    echo "Environment Variables:"
    echo "  BACKEND_URL         Backend API URL (default: $BACKEND_URL)"
    echo "  FRONTEND_URL        Frontend URL (default: $FRONTEND_URL)"
    echo "  KEYCLOAK_URL        Keycloak URL (default: $KEYCLOAK_URL)"
    echo "  OPA_URL            OPA URL (default: $OPA_URL)"
    echo "  TEST_TOKEN          JWT token for testing (default: test token)"
    echo
    exit 0
fi

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --warmup)
            WARMUP_DURATION="$2"
            shift 2
            ;;
        --duration)
            TEST_DURATION="$2"
            shift 2
            ;;
        --users)
            CONCURRENT_USERS="$2"
            shift 2
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Run main function
main
