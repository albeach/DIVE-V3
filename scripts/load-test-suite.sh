#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Load Testing Suite (100 req/s Target)
# =============================================================================
# Comprehensive load testing to achieve 100 req/s across different endpoints:
# - Authorization decisions: 100 req/s
# - Federation heartbeat: 50 req/s
# - Resource access: 75 req/s
# - Policy evaluation: 150 req/s
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-16
# =============================================================================

# Test framework
if [ -z "$DIVE_TEST_FRAMEWORK_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/test-framework.sh"
fi

# =============================================================================
# LOAD TESTING CONFIGURATION
# =============================================================================

# Test targets (requests per second)
declare -A LOAD_TARGETS=(
    ["authz_decisions"]=100
    ["federation_heartbeat"]=50
    ["resource_access"]=75
    ["policy_evaluation"]=150
)

# Test durations (seconds)
AUTHZ_DURATION=60
HEARTBEAT_DURATION=30
RESOURCE_DURATION=45
POLICY_DURATION=30

# Concurrent users
AUTHZ_CONCURRENT=20
HEARTBEAT_CONCURRENT=10
RESOURCE_CONCURRENT=15
POLICY_CONCURRENT=30

# =============================================================================
# LOAD TESTING FUNCTIONS
# =============================================================================

##
# Run authorization decisions load test
#
load_test_authz_decisions() {
    log_step "Load Testing Authorization Decisions (Target: ${LOAD_TARGETS[authz_decisions]} req/s)"

    local target_rps=${LOAD_TARGETS[authz_decisions]}
    local duration=$AUTHZ_DURATION
    local concurrent=$AUTHZ_CONCURRENT

    # Check if backend is running
    if ! curl -sk --max-time 5 "https://localhost:4000/health" &>/dev/null; then
        log_error "Backend not running - cannot perform authorization load test"
        return 1
    fi

    # Create test payload
    local payload
    payload='{
        "subject": {
            "uniqueID": "test-user-123",
            "clearance": "SECRET",
            "countryOfAffiliation": "USA",
            "acpCOI": ["NATO-COSMIC", "FVEY"]
        },
        "action": "read",
        "resource": {
            "resourceId": "doc-123",
            "classification": "CONFIDENTIAL",
            "releasabilityTo": ["USA", "GBR", "CAN"],
            "COI": ["FVEY"]
        },
        "context": {
            "currentTime": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
            "requestId": "load-test-'$(date +%s)'"
        }
    }'

    # Create temporary script for load testing
    local load_script="/tmp/dive-authz-load-test.sh"
    cat > "$load_script" << EOF
#!/bin/bash
curl -s -k -X POST "https://localhost:4000/api/authz/decision" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer \${AUTH_TOKEN:-test-token}" \\
  -d '$payload' \\
  --max-time 5 \\
  >/dev/null 2>&1
EOF
    chmod +x "$load_script"

    # Get auth token if available
    local auth_token=""
    if [ -f "${DIVE_ROOT}/instances/hub/.env" ]; then
        # Try to extract a test token (this is just for load testing)
        auth_token="test-load-token-$(date +%s)"
    fi

    # Run load test using parallel curl requests
    log_info "Starting authorization load test: $concurrent concurrent users for ${duration}s (target: ${target_rps} req/s)"

    local start_time
    start_time=$(date +%s)
    local request_count=0
    local error_count=0

    # Run multiple background processes
    for ((i=1; i<=concurrent; i++)); do
        (
            while true; do
                if [ $(($(date +%s) - start_time)) -ge $duration ]; then
                    break
                fi

                if AUTH_TOKEN="$auth_token" bash "$load_script"; then
                    ((request_count++))
                else
                    ((error_count++))
                fi

                # Small delay to prevent overwhelming
                sleep 0.01
            done
        ) &
    done

    # Wait for all background processes
    wait

    local end_time
    end_time=$(date +%s)
    local actual_duration=$((end_time - start_time))
    local actual_rps=$((request_count / actual_duration))

    log_info "Authorization Load Test Results:"
    log_info "  Duration: ${actual_duration}s"
    log_info "  Requests: $request_count"
    log_info "  Errors: $error_count"
    log_info "  Actual RPS: $actual_rps"
    log_info "  Target RPS: $target_rps"

    # Cleanup
    rm -f "$load_script"

    # Check if we met the target
    if [ "$actual_rps" -ge "$target_rps" ]; then
        log_success "✓ Authorization load test PASSED (${actual_rps} >= ${target_rps} req/s)"
        return 0
    else
        log_warn "⚠ Authorization load test BELOW TARGET (${actual_rps} < ${target_rps} req/s)"
        return 1
    fi
}

##
# Run federation heartbeat load test
#
load_test_federation_heartbeat() {
    log_step "Load Testing Federation Heartbeat (Target: ${LOAD_TARGETS[federation_heartbeat]} req/s)"

    local target_rps=${LOAD_TARGETS[federation_heartbeat]}
    local duration=$HEARTBEAT_DURATION
    local concurrent=$HEARTBEAT_CONCURRENT

    # Check if backend is running
    if ! curl -sk --max-time 5 "https://localhost:4000/health" &>/dev/null; then
        log_error "Backend not running - cannot perform heartbeat load test"
        return 1
    fi

    # Create test payload (simulating spoke heartbeat)
    local payload
    payload='{
        "spokeId": "load-test-spoke",
        "instanceCode": "TST",
        "policyVersion": "1.0.0",
        "services": {
            "opa": {"healthy": true, "lastCheck": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"},
            "mongodb": {"healthy": true, "lastCheck": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}
        },
        "metrics": {
            "uptime": 3600,
            "requestsLastHour": 1000,
            "authDecisionsLastHour": 500
        }
    }'

    # Create temporary script for load testing
    local load_script="/tmp/dive-heartbeat-load-test.sh"
    cat > "$load_script" << EOF
#!/bin/bash
curl -s -k -X POST "https://localhost:4000/api/federation/heartbeat" \\
  -H "Content-Type: application/json" \\
  -H "X-Spoke-Token: \${SPOKE_TOKEN:-test-spoke-token}" \\
  -d '$payload' \\
  --max-time 5 \\
  >/dev/null 2>&1
EOF
    chmod +x "$load_script"

    # Get spoke token if available
    local spoke_token=""
    if [ -f "${DIVE_ROOT}/instances/fra/.env" ]; then
        spoke_token=$(grep "^SPOKE_TOKEN=" "${DIVE_ROOT}/instances/fra/.env" | cut -d'=' -f2 | tr -d '"')
    fi

    if [ -z "$spoke_token" ]; then
        spoke_token="test-spoke-token-$(date +%s)"
    fi

    # Run load test
    log_info "Starting heartbeat load test: $concurrent concurrent spokes for ${duration}s (target: ${target_rps} req/s)"

    local start_time
    start_time=$(date +%s)
    local request_count=0
    local error_count=0

    # Run multiple background processes
    for ((i=1; i<=concurrent; i++)); do
        (
            while true; do
                if [ $(($(date +%s) - start_time)) -ge $duration ]; then
                    break
                fi

                if SPOKE_TOKEN="$spoke_token" bash "$load_script"; then
                    ((request_count++))
                else
                    ((error_count++))
                fi

                # Small delay to prevent overwhelming
                sleep 0.02  # 50 req/s per process = ~20ms delay
            done
        ) &
    done

    # Wait for all background processes
    wait

    local end_time
    end_time=$(date +%s)
    local actual_duration=$((end_time - start_time))
    local actual_rps=$((request_count / actual_duration))

    log_info "Heartbeat Load Test Results:"
    log_info "  Duration: ${actual_duration}s"
    log_info "  Requests: $request_count"
    log_info "  Errors: $error_count"
    log_info "  Actual RPS: $actual_rps"
    log_info "  Target RPS: $target_rps"

    # Cleanup
    rm -f "$load_script"

    # Check if we met the target
    if [ "$actual_rps" -ge "$target_rps" ]; then
        log_success "✓ Heartbeat load test PASSED (${actual_rps} >= ${target_rps} req/s)"
        return 0
    else
        log_warn "⚠ Heartbeat load test BELOW TARGET (${actual_rps} < ${target_rps} req/s)"
        return 1
    fi
}

##
# Run resource access load test
#
load_test_resource_access() {
    log_step "Load Testing Resource Access (Target: ${LOAD_TARGETS[resource_access]} req/s)"

    local target_rps=${LOAD_TARGETS[resource_access]}
    local duration=$RESOURCE_DURATION
    local concurrent=$RESOURCE_CONCURRENT

    # Check if backend is running
    if ! curl -sk --max-time 5 "https://localhost:4000/health" &>/dev/null; then
        log_error "Backend not running - cannot perform resource access load test"
        return 1
    fi

    # Create temporary script for load testing
    local load_script="/tmp/dive-resource-load-test.sh"
    cat > "$load_script" << EOF
#!/bin/bash
curl -s -k "https://localhost:4000/api/resources?limit=10&offset=\$((RANDOM % 100))" \\
  -H "Authorization: Bearer \${AUTH_TOKEN:-test-token}" \\
  --max-time 5 \\
  >/dev/null 2>&1
EOF
    chmod +x "$load_script"

    # Get auth token if available
    local auth_token=""
    if [ -f "${DIVE_ROOT}/instances/hub/.env" ]; then
        auth_token="test-resource-token-$(date +%s)"
    fi

    # Run load test
    log_info "Starting resource access load test: $concurrent concurrent users for ${duration}s (target: ${target_rps} req/s)"

    local start_time
    start_time=$(date +%s)
    local request_count=0
    local error_count=0

    # Run multiple background processes
    for ((i=1; i<=concurrent; i++)); do
        (
            while true; do
                if [ $(($(date +%s) - start_time)) -ge $duration ]; then
                    break
                fi

                if AUTH_TOKEN="$auth_token" bash "$load_script"; then
                    ((request_count++))
                else
                    ((error_count++))
                fi

                # Small delay to prevent overwhelming
                sleep 0.013  # ~75 req/s per process = ~13ms delay
            done
        ) &
    done

    # Wait for all background processes
    wait

    local end_time
    end_time=$(date +%s)
    local actual_duration=$((end_time - start_time))
    local actual_rps=$((request_count / actual_duration))

    log_info "Resource Access Load Test Results:"
    log_info "  Duration: ${actual_duration}s"
    log_info "  Requests: $request_count"
    log_info "  Errors: $error_count"
    log_info "  Actual RPS: $actual_rps"
    log_info "  Target RPS: $target_rps"

    # Cleanup
    rm -f "$load_script"

    # Check if we met the target
    if [ "$actual_rps" -ge "$target_rps" ]; then
        log_success "✓ Resource access load test PASSED (${actual_rps} >= ${target_rps} req/s)"
        return 0
    else
        log_warn "⚠ Resource access load test BELOW TARGET (${actual_rps} < ${target_rps} req/s)"
        return 1
    fi
}

##
# Run policy evaluation load test
#
load_test_policy_evaluation() {
    log_step "Load Testing Policy Evaluation (Target: ${LOAD_TARGETS[policy_evaluation]} req/s)"

    local target_rps=${LOAD_TARGETS[policy_evaluation]}
    local duration=$POLICY_DURATION
    local concurrent=$POLICY_CONCURRENT

    # Check if OPA is running
    if ! docker ps --filter "name=dive-hub-opa" --format "{{.Names}}" | grep -q "dive-hub-opa"; then
        log_error "OPA not running - cannot perform policy evaluation load test"
        return 1
    fi

    # Create test payload for OPA policy evaluation
    local payload
    payload='{
        "input": {
            "subject": {
                "uniqueID": "test-user-'$(date +%s)'",
                "clearance": "SECRET",
                "countryOfAffiliation": "USA",
                "acpCOI": ["NATO-COSMIC"]
            },
            "action": "read",
            "resource": {
                "resourceId": "doc-'$(date +%s)'",
                "classification": "CONFIDENTIAL",
                "releasabilityTo": ["USA", "GBR"],
                "COI": ["FVEY"]
            },
            "context": {
                "currentTime": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
                "requestId": "policy-load-test-'$(date +%s)'"
            }
        }
    }'

    # Create temporary script for load testing
    local load_script="/tmp/dive-policy-load-test.sh"
    cat > "$load_script" << EOF
#!/bin/bash
curl -s -k -X POST "http://localhost:8181/v1/data/dive/authorization" \\
  -H "Content-Type: application/json" \\
  -d '$payload' \\
  --max-time 2 \\
  >/dev/null 2>&1
EOF
    chmod +x "$load_script"

    # Run load test
    log_info "Starting policy evaluation load test: $concurrent concurrent requests for ${duration}s (target: ${target_rps} req/s)"

    local start_time
    start_time=$(date +%s)
    local request_count=0
    local error_count=0

    # Run multiple background processes
    for ((i=1; i<=concurrent; i++)); do
        (
            while true; do
                if [ $(($(date +%s) - start_time)) -ge $duration ]; then
                    break
                fi

                if bash "$load_script"; then
                    ((request_count++))
                else
                    ((error_count++))
                fi

                # Small delay to prevent overwhelming
                sleep 0.007  # ~150 req/s per process = ~7ms delay
            done
        ) &
    done

    # Wait for all background processes
    wait

    local end_time
    end_time=$(date +%s)
    local actual_duration=$((end_time - start_time))
    local actual_rps=$((request_count / actual_duration))

    log_info "Policy Evaluation Load Test Results:"
    log_info "  Duration: ${actual_duration}s"
    log_info "  Requests: $request_count"
    log_info "  Errors: $error_count"
    log_info "  Actual RPS: $actual_rps"
    log_info "  Target RPS: $target_rps"

    # Cleanup
    rm -f "$load_script"

    # Check if we met the target
    if [ "$actual_rps" -ge "$target_rps" ]; then
        log_success "✓ Policy evaluation load test PASSED (${actual_rps} >= ${target_rps} req/s)"
        return 0
    else
        log_warn "⚠ Policy evaluation load test BELOW TARGET (${actual_rps} < ${target_rps} req/s)"
        return 1
    fi
}

##
# Run comprehensive load test suite
#
load_test_run_suite() {
    log_step "Running DIVE V3 Load Test Suite (100 req/s Target)"

    local test_results=()
    local passed=0
    local total=4

    # Test 1: Authorization Decisions
    if load_test_authz_decisions; then
        test_results+=("✓ Authorization Decisions: PASSED")
        ((passed++))
    else
        test_results+=("✗ Authorization Decisions: FAILED")
    fi

    # Test 2: Federation Heartbeat
    if load_test_federation_heartbeat; then
        test_results+=("✓ Federation Heartbeat: PASSED")
        ((passed++))
    else
        test_results+=("✗ Federation Heartbeat: FAILED")
    fi

    # Test 3: Resource Access
    if load_test_resource_access; then
        test_results+=("✓ Resource Access: PASSED")
        ((passed++))
    else
        test_results+=("✗ Resource Access: FAILED")
    fi

    # Test 4: Policy Evaluation
    if load_test_policy_evaluation; then
        test_results+=("✓ Policy Evaluation: PASSED")
        ((passed++))
    else
        test_results+=("✗ Policy Evaluation: FAILED")
    fi

    # Summary
    log_step "Load Test Suite Results"
    printf '%s\n' "${test_results[@]}"
    echo ""
    log_info "Load Test Summary: $passed/$total tests passed"

    if [ "$passed" -eq "$total" ]; then
        log_success "🎉 All load tests PASSED - 100 req/s target achieved!"
        return 0
    else
        log_warn "⚠️ Some load tests failed - performance optimization needed"
        return 1
    fi
}

# =============================================================================
# CLI INTERFACE
# =============================================================================

##
# Main CLI handler for load testing
#
load_test_cli() {
    local command="${1:-suite}"
    shift || true

    case "$command" in
        "suite"|"all")
            load_test_run_suite "$@"
            ;;
        "authz"|"authorization")
            load_test_authz_decisions "$@"
            ;;
        "heartbeat"|"federation")
            load_test_federation_heartbeat "$@"
            ;;
        "resource"|"resources")
            load_test_resource_access "$@"
            ;;
        "policy"|"opa")
            load_test_policy_evaluation "$@"
            ;;
        "help"|*)
            load_test_cli_help
            ;;
    esac
}

##
# CLI help
#
load_test_cli_help() {
    echo -e "${BOLD}DIVE V3 Load Testing Suite${NC}"
    echo ""
    echo -e "${CYAN}Commands:${NC}"
    echo "  suite               Run complete load test suite (100 req/s target)"
    echo "  authz               Test authorization decisions only"
    echo "  heartbeat           Test federation heartbeat only"
    echo "  resource            Test resource access only"
    echo "  policy              Test policy evaluation only"
    echo ""
    echo -e "${CYAN}Targets (req/s):${NC}"
    echo "  Authorization Decisions: 100"
    echo "  Federation Heartbeat:     50"
    echo "  Resource Access:          75"
    echo "  Policy Evaluation:       150"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./dive test load suite     # Run complete load test suite"
    echo "  ./dive test load authz     # Test authorization only"
}

# Export functions for use in other scripts
export -f load_test_cli
export -f load_test_run_suite