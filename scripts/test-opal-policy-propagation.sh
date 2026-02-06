#!/bin/bash
#
# OPAL Policy Propagation Testing Script
# Tests policy change detection, pub/sub broadcast, and spoke synchronization
#
# Usage: ./test-opal-policy-propagation.sh [test-type]
#   test-type: detection, broadcast, reload, latency, all (default: all)
#

set -eo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
POLICY_FILE="policies/base/common.rego"
HUB_OPAL_CONTAINER="dive-hub-opal-server"
FRA_OPAL_CONTAINER="dive-spoke-fra-opal-client"
GBR_OPAL_CONTAINER="dive-spoke-gbr-opal-client"
HUB_OPA_URL="http://localhost:8181"
FRA_OPA_URL="http://localhost:9191"
GBR_OPA_URL="http://localhost:9212"
MAX_WAIT_TIME=10  # Maximum wait time in seconds
POLL_INTERVAL=0.5  # Polling interval in seconds

# Test results
RESULTS_FILE="/tmp/opal-test-results-$(date +%Y%m%d-%H%M%S).json"

# Functions

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

get_timestamp() {
    date +%s.%N
}

calculate_duration() {
    local start=$1
    local end=$2
    echo "scale=3; $end - $start" | bc
}

check_container_running() {
    local container=$1
    if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        log_error "Container $container is not running"
        return 1
    fi
    return 0
}

check_opa_health() {
    local opa_url=$1
    local response=$(curl -s -o /dev/null -w "%{http_code}" "${opa_url}/health" 2>/dev/null || echo "000")
    if [[ "$response" == "200" ]]; then
        return 0
    else
        return 1
    fi
}

get_opa_policy_hash() {
    local opa_url=$1
    local policy_hash=$(curl -s "${opa_url}/v1/policies" 2>/dev/null | jq -r '.result | to_entries | map(.value.raw) | join("") | @base64' 2>/dev/null || echo "")
    echo "$policy_hash"
}

make_policy_change() {
    local comment="# OPAL Test - $(date +%Y-%m-%d\ %H:%M:%S.%N)"
    echo "" >> "$POLICY_FILE"
    echo "$comment" >> "$POLICY_FILE"
    log_info "Added test comment to $POLICY_FILE"
    echo "$comment"
}

wait_for_log_pattern() {
    local container=$1
    local pattern=$2
    local timeout=$3
    local start_time=$(get_timestamp)
    
    log_info "Waiting for pattern '$pattern' in $container logs (timeout: ${timeout}s)"
    
    while true; do
        local current_time=$(get_timestamp)
        local elapsed=$(calculate_duration $start_time $current_time)
        
        if (( $(echo "$elapsed > $timeout" | bc -l) )); then
            log_warning "Timeout waiting for pattern in $container"
            return 1
        fi
        
        if docker logs "$container" --since "${start_time}s" 2>&1 | grep -i "$pattern" > /dev/null; then
            local detection_time=$(get_timestamp)
            local duration=$(calculate_duration $start_time $detection_time)
            log_success "Pattern detected in $container after ${duration}s"
            echo "$duration"
            return 0
        fi
        
        sleep "$POLL_INTERVAL"
    done
}

wait_for_policy_change() {
    local opa_url=$1
    local original_hash=$2
    local timeout=$3
    local start_time=$(get_timestamp)
    
    log_info "Waiting for policy change at $opa_url (timeout: ${timeout}s)"
    
    while true; do
        local current_time=$(get_timestamp)
        local elapsed=$(calculate_duration $start_time $current_time)
        
        if (( $(echo "$elapsed > $timeout" | bc -l) )); then
            log_warning "Timeout waiting for policy change at $opa_url"
            return 1
        fi
        
        local current_hash=$(get_opa_policy_hash "$opa_url")
        if [[ "$current_hash" != "$original_hash" ]] && [[ -n "$current_hash" ]]; then
            local change_time=$(get_timestamp)
            local duration=$(calculate_duration $start_time $change_time)
            log_success "Policy changed at $opa_url after ${duration}s"
            echo "$duration"
            return 0
        fi
        
        sleep "$POLL_INTERVAL"
    done
}

test_policy_detection() {
    log_info "=== Test 1: Policy Change Detection by Hub ==="
    
    # Check hub container
    if ! check_container_running "$HUB_OPAL_CONTAINER"; then
        return 1
    fi
    
    # Make policy change
    local start_time=$(get_timestamp)
    local test_comment=$(make_policy_change)
    
    # Wait for hub to detect change
    local detection_duration=$(wait_for_log_pattern "$HUB_OPAL_CONTAINER" "policy" "$MAX_WAIT_TIME")
    local result=$?
    
    if [[ $result -eq 0 ]]; then
        log_success "Hub detected policy change in ${detection_duration}s"
        
        if (( $(echo "$detection_duration < 5" | bc -l) )); then
            log_success "Detection time < 5s target: PASS"
            echo "{ \"test\": \"policy_detection\", \"status\": \"PASS\", \"duration_s\": $detection_duration, \"target_s\": 5 }"
            return 0
        else
            log_warning "Detection time >= 5s target: MARGINAL"
            echo "{ \"test\": \"policy_detection\", \"status\": \"MARGINAL\", \"duration_s\": $detection_duration, \"target_s\": 5 }"
            return 0
        fi
    else
        log_error "Hub failed to detect policy change within ${MAX_WAIT_TIME}s"
        echo "{ \"test\": \"policy_detection\", \"status\": \"FAIL\", \"duration_s\": null, \"target_s\": 5 }"
        return 1
    fi
}

test_pubsub_broadcast() {
    log_info "=== Test 2: Pub/Sub Broadcast to Spokes ==="
    
    # Check spoke containers
    if ! check_container_running "$FRA_OPAL_CONTAINER" || ! check_container_running "$GBR_OPAL_CONTAINER"; then
        return 1
    fi
    
    # Make policy change
    local start_time=$(get_timestamp)
    local test_comment=$(make_policy_change)
    
    # Wait for spokes to receive notification
    local fra_duration=$(wait_for_log_pattern "$FRA_OPAL_CONTAINER" "policy\|update" "$MAX_WAIT_TIME")
    local fra_result=$?
    
    local gbr_duration=$(wait_for_log_pattern "$GBR_OPAL_CONTAINER" "policy\|update" "$MAX_WAIT_TIME")
    local gbr_result=$?
    
    if [[ $fra_result -eq 0 ]] && [[ $gbr_result -eq 0 ]]; then
        local max_duration=$(echo "if ($fra_duration > $gbr_duration) $fra_duration else $gbr_duration" | bc)
        log_success "All spokes received notification (FRA: ${fra_duration}s, GBR: ${gbr_duration}s)"
        
        if (( $(echo "$max_duration < 1" | bc -l) )); then
            log_success "Broadcast time < 1s target: PASS"
            echo "{ \"test\": \"pubsub_broadcast\", \"status\": \"PASS\", \"fra_duration_s\": $fra_duration, \"gbr_duration_s\": $gbr_duration, \"target_s\": 1 }"
            return 0
        else
            log_warning "Broadcast time >= 1s target: MARGINAL"
            echo "{ \"test\": \"pubsub_broadcast\", \"status\": \"MARGINAL\", \"fra_duration_s\": $fra_duration, \"gbr_duration_s\": $gbr_duration, \"target_s\": 1 }"
            return 0
        fi
    else
        log_error "Not all spokes received notification within ${MAX_WAIT_TIME}s"
        echo "{ \"test\": \"pubsub_broadcast\", \"status\": \"FAIL\", \"fra_result\": $fra_result, \"gbr_result\": $gbr_result, \"target_s\": 1 }"
        return 1
    fi
}

test_opa_reload() {
    log_info "=== Test 3: OPA Policy Reload ==="
    
    # Check OPA health
    if ! check_opa_health "$HUB_OPA_URL"; then
        log_error "Hub OPA is not healthy"
        return 1
    fi
    
    if ! check_opa_health "$FRA_OPA_URL"; then
        log_error "FRA OPA is not healthy"
        return 1
    fi
    
    if ! check_opa_health "$GBR_OPA_URL"; then
        log_error "GBR OPA is not healthy"
        return 1
    fi
    
    # Get initial policy hashes
    local hub_original=$(get_opa_policy_hash "$HUB_OPA_URL")
    local fra_original=$(get_opa_policy_hash "$FRA_OPA_URL")
    local gbr_original=$(get_opa_policy_hash "$GBR_OPA_URL")
    
    log_info "Initial policy hashes captured"
    
    # Make policy change
    local start_time=$(get_timestamp)
    local test_comment=$(make_policy_change)
    
    # Wait for OPA instances to reload
    local hub_duration=$(wait_for_policy_change "$HUB_OPA_URL" "$hub_original" "$MAX_WAIT_TIME")
    local hub_result=$?
    
    local fra_duration=$(wait_for_policy_change "$FRA_OPA_URL" "$fra_original" "$MAX_WAIT_TIME")
    local fra_result=$?
    
    local gbr_duration=$(wait_for_policy_change "$GBR_OPA_URL" "$gbr_original" "$MAX_WAIT_TIME")
    local gbr_result=$?
    
    if [[ $hub_result -eq 0 ]] && [[ $fra_result -eq 0 ]] && [[ $gbr_result -eq 0 ]]; then
        log_success "All OPA instances reloaded (Hub: ${hub_duration}s, FRA: ${fra_duration}s, GBR: ${gbr_duration}s)"
        echo "{ \"test\": \"opa_reload\", \"status\": \"PASS\", \"hub_duration_s\": $hub_duration, \"fra_duration_s\": $fra_duration, \"gbr_duration_s\": $gbr_duration }"
        return 0
    else
        log_error "Not all OPA instances reloaded within ${MAX_WAIT_TIME}s"
        echo "{ \"test\": \"opa_reload\", \"status\": \"FAIL\", \"hub_result\": $hub_result, \"fra_result\": $fra_result, \"gbr_result\": $gbr_result }"
        return 1
    fi
}

test_propagation_latency() {
    log_info "=== Test 4: End-to-End Propagation Latency ==="
    
    # Pre-flight checks
    for container in "$HUB_OPAL_CONTAINER" "$FRA_OPAL_CONTAINER" "$GBR_OPAL_CONTAINER"; do
        if ! check_container_running "$container"; then
            return 1
        fi
    done
    
    for opa_url in "$HUB_OPA_URL" "$FRA_OPA_URL" "$GBR_OPA_URL"; do
        if ! check_opa_health "$opa_url"; then
            log_error "OPA at $opa_url is not healthy"
            return 1
        fi
    done
    
    # Get initial policy hashes
    local hub_original=$(get_opa_policy_hash "$HUB_OPA_URL")
    local fra_original=$(get_opa_policy_hash "$FRA_OPA_URL")
    local gbr_original=$(get_opa_policy_hash "$GBR_OPA_URL")
    
    # Make policy change and start timer
    local start_time=$(get_timestamp)
    local test_comment=$(make_policy_change)
    log_info "Policy change made at $(date '+%Y-%m-%d %H:%M:%S')"
    
    # Wait for all stages
    log_info "Stage 1: Waiting for hub detection..."
    local hub_detection=$(wait_for_log_pattern "$HUB_OPAL_CONTAINER" "policy" "$MAX_WAIT_TIME")
    local hub_detection_result=$?
    
    log_info "Stage 2: Waiting for spoke notifications..."
    local fra_notification=$(wait_for_log_pattern "$FRA_OPAL_CONTAINER" "policy\|update" "$MAX_WAIT_TIME")
    local fra_notification_result=$?
    
    local gbr_notification=$(wait_for_log_pattern "$GBR_OPAL_CONTAINER" "policy\|update" "$MAX_WAIT_TIME")
    local gbr_notification_result=$?
    
    log_info "Stage 3: Waiting for OPA reloads..."
    local fra_reload=$(wait_for_policy_change "$FRA_OPA_URL" "$fra_original" "$MAX_WAIT_TIME")
    local fra_reload_result=$?
    
    local gbr_reload=$(wait_for_policy_change "$GBR_OPA_URL" "$gbr_original" "$MAX_WAIT_TIME")
    local gbr_reload_result=$?
    
    # Calculate end-to-end latency (from policy change to last spoke reload)
    local end_time=$(get_timestamp)
    local total_latency=$(calculate_duration $start_time $end_time)
    
    if [[ $hub_detection_result -eq 0 ]] && [[ $fra_notification_result -eq 0 ]] && [[ $gbr_notification_result -eq 0 ]] && [[ $fra_reload_result -eq 0 ]] && [[ $gbr_reload_result -eq 0 ]]; then
        log_success "End-to-end propagation completed in ${total_latency}s"
        
        echo "Breakdown:"
        echo "  - Hub detection: ${hub_detection}s"
        echo "  - FRA notification: ${fra_notification}s"
        echo "  - GBR notification: ${gbr_notification}s"
        echo "  - FRA reload: ${fra_reload}s"
        echo "  - GBR reload: ${gbr_reload}s"
        
        if (( $(echo "$total_latency < 5" | bc -l) )); then
            log_success "Total latency < 5s target: PASS"
            echo "{ \"test\": \"propagation_latency\", \"status\": \"PASS\", \"total_latency_s\": $total_latency, \"target_s\": 5, \"hub_detection_s\": $hub_detection, \"fra_notification_s\": $fra_notification, \"gbr_notification_s\": $gbr_notification, \"fra_reload_s\": $fra_reload, \"gbr_reload_s\": $gbr_reload }"
            return 0
        else
            log_warning "Total latency >= 5s target: MARGINAL"
            echo "{ \"test\": \"propagation_latency\", \"status\": \"MARGINAL\", \"total_latency_s\": $total_latency, \"target_s\": 5, \"hub_detection_s\": $hub_detection, \"fra_notification_s\": $fra_notification, \"gbr_notification_s\": $gbr_notification, \"fra_reload_s\": $fra_reload, \"gbr_reload_s\": $gbr_reload }"
            return 0
        fi
    else
        log_error "Propagation did not complete successfully within ${MAX_WAIT_TIME}s per stage"
        echo "{ \"test\": \"propagation_latency\", \"status\": \"FAIL\", \"total_latency_s\": $total_latency, \"target_s\": 5 }"
        return 1
    fi
}

run_all_tests() {
    log_info "========================================="
    log_info "OPAL Policy Propagation Test Suite"
    log_info "$(date '+%Y-%m-%d %H:%M:%S')"
    log_info "========================================="
    echo ""
    
    local results=()
    local test_start=$(get_timestamp)
    
    # Test 1: Policy Detection
    if test_policy_detection; then
        results+=("PASS")
    else
        results+=("FAIL")
    fi
    echo ""
    sleep 2
    
    # Test 2: Pub/Sub Broadcast
    if test_pubsub_broadcast; then
        results+=("PASS")
    else
        results+=("FAIL")
    fi
    echo ""
    sleep 2
    
    # Test 3: OPA Reload
    if test_opa_reload; then
        results+=("PASS")
    else
        results+=("FAIL")
    fi
    echo ""
    sleep 2
    
    # Test 4: Propagation Latency
    if test_propagation_latency; then
        results+=("PASS")
    else
        results+=("FAIL")
    fi
    echo ""
    
    local test_end=$(get_timestamp)
    local total_duration=$(calculate_duration $test_start $test_end)
    
    # Summary
    log_info "========================================="
    log_info "Test Suite Complete (${total_duration}s)"
    log_info "========================================="
    
    local pass_count=0
    local fail_count=0
    for result in "${results[@]}"; do
        if [[ "$result" == "PASS" ]]; then
            ((pass_count++))
        else
            ((fail_count++))
        fi
    done
    
    echo "Results: ${pass_count} passed, ${fail_count} failed"
    
    if [[ $fail_count -eq 0 ]]; then
        log_success "All tests passed!"
        return 0
    else
        log_error "$fail_count test(s) failed"
        return 1
    fi
}

# Main execution
main() {
    local test_type="${1:-all}"
    
    case "$test_type" in
        detection)
            test_policy_detection
            ;;
        broadcast)
            test_pubsub_broadcast
            ;;
        reload)
            test_opa_reload
            ;;
        latency)
            test_propagation_latency
            ;;
        all)
            run_all_tests
            ;;
        *)
            log_error "Unknown test type: $test_type"
            echo "Usage: $0 [detection|broadcast|reload|latency|all]"
            exit 1
            ;;
    esac
}

main "$@"
