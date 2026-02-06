#!/bin/bash
#
# OPAL Policy Distribution Testing - Best Practice Implementation
# Based on official OPAL documentation: https://docs.opal.ac/tutorials/monitoring_opal
#
# This script tests OPAL's policy distribution mechanism using official monitoring approaches:
#   1. Health checks (/healthcheck, /ready endpoints)
#   2. Statistics API (/statistics endpoint)
#   3. OPAL Server logs
#   4. OPA bundle verification
#
# Usage: ./test-opal-distribution.sh [test-phase]
#   test-phase: health, statistics, distribution, full (default: full)
#

set -eo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
HUB_OPAL_SERVER="https://localhost:7002"
FRA_OPAL_CLIENT_PORT="9191"
GBR_OPAL_CLIENT_PORT="9212"
HUB_OPA_PORT="8181"
FRA_OPA_PORT="8281"
GBR_OPA_PORT="8491"

POLICY_TEST_FILE="policies/base/common.rego"
MAX_WAIT=30
POLL_INTERVAL=2

# Results
RESULTS_DIR="/tmp/opal-tests-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RESULTS_DIR"

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }

# ============================================
# TEST 1: Health Checks (Official Method)
# ============================================

test_health_checks() {
    log_info "========================================="
    log_info "Test 1: OPAL Health Checks"
    log_info "Using official OPAL monitoring endpoints"
    log_info "========================================="
    
    local all_healthy=true
    
    # Test OPAL Server health
    log_info "Checking OPAL Server health..."
    local server_health=$(curl -sk "${HUB_OPAL_SERVER}/healthcheck" 2>&1)
    local server_status=$?
    
    if [[ $server_status -eq 0 ]]; then
        log_success "OPAL Server: healthy"
        echo "$server_health" > "$RESULTS_DIR/hub-server-health.json"
    else
        log_error "OPAL Server: unhealthy"
        all_healthy=false
    fi
    
    # Test FRA OPAL Client readiness
    log_info "Checking FRA OPAL Client readiness..."
    local fra_ready=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${FRA_OPAL_CLIENT_PORT}/ready" 2>&1)
    
    if [[ "$fra_ready" == "200" ]]; then
        log_success "FRA OPAL Client: ready (has loaded policy & data at least once)"
    else
        log_warning "FRA OPAL Client: not ready (status: $fra_ready)"
        all_healthy=false
    fi
    
    # Test FRA OPAL Client liveness
    local fra_live=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${FRA_OPAL_CLIENT_PORT}/healthcheck" 2>&1)
    
    if [[ "$fra_live" == "200" ]]; then
        log_success "FRA OPAL Client: live (last load attempts succeeded)"
    else
        log_warning "FRA OPAL Client: not live (status: $fra_live)"
        all_healthy=false
    fi
    
    # Test GBR OPAL Client readiness
    log_info "Checking GBR OPAL Client readiness..."
    local gbr_ready=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${GBR_OPAL_CLIENT_PORT}/ready" 2>&1)
    
    if [[ "$gbr_ready" == "200" ]]; then
        log_success "GBR OPAL Client: ready"
    else
        log_warning "GBR OPAL Client: not ready (status: $gbr_ready)"
        all_healthy=false
    fi
    
    # Test GBR OPAL Client liveness
    local gbr_live=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${GBR_OPAL_CLIENT_PORT}/healthcheck" 2>&1)
    
    if [[ "$gbr_live" == "200" ]]; then
        log_success "GBR OPAL Client: live"
    else
        log_warning "GBR OPAL Client: not live (status: $gbr_live)"
        all_healthy=false
    fi
    
    # Test OPA instances
    log_info "Checking OPA instances..."
    for opa_name in "Hub:$HUB_OPA_PORT" "FRA:$FRA_OPA_PORT" "GBR:$GBR_OPA_PORT"; do
        IFS=':' read -r name port <<< "$opa_name"
        local opa_health=$(curl -sk "https://localhost:${port}/health" 2>&1)
        
        if [[ "$opa_health" == "{}" ]]; then
            log_success "$name OPA: healthy"
        else
            log_error "$name OPA: unhealthy"
            all_healthy=false
        fi
    done
    
    if $all_healthy; then
        log_success "All health checks passed"
        return 0
    else
        log_warning "Some health checks failed"
        return 1
    fi
}

# ============================================
# TEST 2: Statistics API (Official Method)
# ============================================

test_statistics_api() {
    log_info "========================================="
    log_info "Test 2: OPAL Statistics API"
    log_info "Using /statistics endpoint to check client state"
    log_info "========================================="
    
    log_info "Fetching OPAL Server statistics..."
    
    # Query statistics endpoint
    local stats=$(curl -sk "${HUB_OPAL_SERVER}/statistics" 2>&1)
    local stats_status=$?
    
    if [[ $stats_status -eq 0 ]]; then
        echo "$stats" > "$RESULTS_DIR/opal-statistics.json"
        
        # Parse statistics (if OPAL_STATISTICS_ENABLED=true)
        if echo "$stats" | jq . > /dev/null 2>&1; then
            local client_count=$(echo "$stats" | jq -r '.clients | length' 2>/dev/null || echo "0")
            local topics=$(echo "$stats" | jq -r '.topics[]?' 2>/dev/null || echo "")
            
            log_success "Statistics retrieved successfully"
            log_info "Connected clients: $client_count"
            
            if [[ -n "$topics" ]]; then
                log_info "Subscribed topics:"
                echo "$topics" | while read -r topic; do
                    echo "  - $topic"
                done
            fi
            
            return 0
        else
            log_warning "Statistics API returned non-JSON response (OPAL_STATISTICS_ENABLED might be false)"
            log_info "Response: $stats"
            return 1
        fi
    else
        log_error "Failed to fetch statistics"
        return 1
    fi
}

# ============================================
# TEST 3: Policy Distribution End-to-End
# ============================================

test_policy_distribution() {
    log_info "========================================="
    log_info "Test 3: Policy Distribution End-to-End"
    log_info "Testing policy change propagation to spokes"
    log_info "========================================="
    
    # Step 1: Get baseline policy from OPA instances
    log_info "Step 1: Capturing baseline policy state..."
    
    local hub_baseline=$(curl -sk "https://localhost:${HUB_OPA_PORT}/v1/policies" | jq -r '.result | keys | length' 2>/dev/null)
    local fra_baseline=$(curl -sk "https://localhost:${FRA_OPA_PORT}/v1/policies" | jq -r '.result | keys | length' 2>/dev/null)
    local gbr_baseline=$(curl -sk "https://localhost:${GBR_OPA_PORT}/v1/policies" | jq -r '.result | keys | length' 2>/dev/null)
    
    log_info "Baseline policy count - Hub: $hub_baseline, FRA: $fra_baseline, GBR: $gbr_baseline"
    
    # Step 2: Make policy change
    log_info "Step 2: Making policy change..."
    
    local test_comment="# OPAL Distribution Test - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "" >> "$POLICY_TEST_FILE"
    echo "$test_comment" >> "$POLICY_TEST_FILE"
    
    log_success "Added test comment to $POLICY_TEST_FILE"
    
    # Step 3: Wait for OPAL to detect and propagate
    log_info "Step 3: Waiting for OPAL to detect and propagate change..."
    log_info "OPAL_POLICY_REPO_POLLING_INTERVAL is set to 5 seconds"
    log_info "Maximum wait time: ${MAX_WAIT}s"
    
    local start_time=$(date +%s)
    local detected=false
    
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [[ $elapsed -ge $MAX_WAIT ]]; then
            log_warning "Timeout after ${MAX_WAIT}s"
            break
        fi
        
        # Check if policy count changed (indicates reload occurred)
        local hub_current=$(curl -sk "https://localhost:${HUB_OPA_PORT}/v1/policies" | jq -r '.result | keys | length' 2>/dev/null)
        local fra_current=$(curl -sk "https://localhost:${FRA_OPA_PORT}/v1/policies" | jq -r '.result | keys | length' 2>/dev/null)
        local gbr_current=$(curl -sk "https://localhost:${GBR_OPA_PORT}/v1/policies" | jq -r '.result | keys | length' 2>/dev/null)
        
        # In file-based mode, OPAL reloads the entire policy directory
        # So we check if a reload happened (policy might have been re-parsed)
        if [[ $elapsed -ge 10 ]]; then
            log_info "After ${elapsed}s - Hub: $hub_current, FRA: $fra_current, GBR: $gbr_current"
            detected=true
            break
        fi
        
        sleep "$POLL_INTERVAL"
    done
    
    # Step 4: Verify change was applied
    log_info "Step 4: Verifying policy update..."
    
    # Check if our test comment exists in the loaded policy
    local hub_has_change=$(curl -sk "https://localhost:${HUB_OPA_PORT}/v1/policies/base/common.rego" 2>/dev/null | grep -c "OPAL Distribution Test" || echo "0")
    local fra_has_change=$(curl -sk "https://localhost:${FRA_OPA_PORT}/v1/policies/base/common.rego" 2>/dev/null | grep -c "OPAL Distribution Test" || echo "0")
    local gbr_has_change=$(curl -sk "https://localhost:${GBR_OPA_PORT}/v1/policies/base/common.rego" 2>/dev/null | grep -c "OPAL Distribution Test" || echo "0")
    
    local all_updated=true
    
    if [[ "$hub_has_change" -gt 0 ]]; then
        log_success "Hub OPA: policy updated (found test comment)"
    else
        log_warning "Hub OPA: policy not updated"
        all_updated=false
    fi
    
    if [[ "$fra_has_change" -gt 0 ]]; then
        log_success "FRA OPA: policy updated (found test comment)"
    else
        log_warning "FRA OPA: policy not updated"
        all_updated=false
    fi
    
    if [[ "$gbr_has_change" -gt 0 ]]; then
        log_success "GBR OPA: policy updated (found test comment)"
    else
        log_warning "GBR OPA: policy not updated"
        all_updated=false
    fi
    
    if $all_updated; then
        log_success "Policy distribution successful"
        return 0
    else
        log_warning "Policy distribution incomplete"
        return 1
    fi
}

# ============================================
# TEST 4: Backend OPAL Metrics API
# ============================================

test_backend_metrics() {
    log_info "========================================="
    log_info "Test 4: DIVE Backend OPAL Metrics"
    log_info "Testing custom metrics service"
    log_info "========================================="
    
    log_info "Querying DIVE backend OPAL health endpoint..."
    
    # Query our custom metrics endpoint
    local metrics=$(curl -sk "https://localhost:4000/api/opal/health" 2>&1)
    local metrics_status=$?
    
    if [[ $metrics_status -eq 0 ]] && echo "$metrics" | jq . > /dev/null 2>&1; then
        echo "$metrics" > "$RESULTS_DIR/dive-opal-metrics.json"
        
        local healthy=$(echo "$metrics" | jq -r '.healthy' 2>/dev/null)
        local redis_connected=$(echo "$metrics" | jq -r '.redis.connected' 2>/dev/null)
        local clients=$(echo "$metrics" | jq -r '.redis.clients' 2>/dev/null)
        
        log_success "Backend metrics retrieved"
        log_info "Overall health: $healthy"
        log_info "Redis connected: $redis_connected"
        log_info "Connected clients: $clients"
        
        return 0
    else
        log_warning "Backend metrics endpoint unavailable"
        return 1
    fi
}

# ============================================
# MAIN EXECUTION
# ============================================

run_full_test_suite() {
    log_info "========================================="
    log_info "OPAL Policy Distribution Test Suite"
    log_info "Based on OPAL official best practices"
    log_info "$(date '+%Y-%m-%d %H:%M:%S')"
    log_info "========================================="
    echo ""
    
    local results=()
    local test_start=$(date +%s)
    
    # Pre-flight check
    log_info "Pre-flight: Verifying OPAL containers are running..."
    if ! docker ps --filter "name=opal" --format "{{.Names}}" | grep -q "dive-hub-opal-server"; then
        log_error "OPAL server container not running"
        exit 1
    fi
    log_success "OPAL containers are running"
    echo ""
    
    # Test 1: Health Checks
    if test_health_checks; then
        results+=("PASS")
    else
        results+=("FAIL")
    fi
    echo ""
    
    # Test 2: Statistics API
    if test_statistics_api; then
        results+=("PASS")
    else
        results+=("WARN")  # Statistics might not be enabled
    fi
    echo ""
    
    # Test 3: Policy Distribution
    if test_policy_distribution; then
        results+=("PASS")
    else
        results+=("FAIL")
    fi
    echo ""
    
    # Test 4: Backend Metrics
    if test_backend_metrics; then
        results+=("PASS")
    else
        results+=("WARN")
    fi
    echo ""
    
    local test_end=$(date +%s)
    local total_duration=$((test_end - test_start))
    
    # Summary
    log_info "========================================="
    log_info "Test Suite Complete (${total_duration}s)"
    log_info "========================================="
    log_info "Results saved to: $RESULTS_DIR"
    
    local pass_count=0
    local fail_count=0
    local warn_count=0
    
    for result in "${results[@]}"; do
        case "$result" in
            PASS) ((pass_count++)) ;;
            FAIL) ((fail_count++)) ;;
            WARN) ((warn_count++)) ;;
        esac
    done
    
    echo "Results: ${pass_count} passed, ${fail_count} failed, ${warn_count} warnings"
    
    if [[ $fail_count -eq 0 ]]; then
        log_success "All critical tests passed!"
        return 0
    else
        log_error "$fail_count critical test(s) failed"
        return 1
    fi
}

main() {
    local test_phase="${1:-full}"
    
    case "$test_phase" in
        health)
            test_health_checks
            ;;
        statistics)
            test_statistics_api
            ;;
        distribution)
            test_policy_distribution
            ;;
        metrics)
            test_backend_metrics
            ;;
        full)
            run_full_test_suite
            ;;
        *)
            log_error "Unknown test phase: $test_phase"
            echo "Usage: $0 [health|statistics|distribution|metrics|full]"
            exit 1
            ;;
    esac
}

main "$@"
