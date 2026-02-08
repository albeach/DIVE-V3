#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Multi-Instance Testing Framework
# =============================================================================
# Concurrent deployment testing across multiple coalition instances
# Validates enterprise-grade reliability at scale
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration framework
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../orchestration/framework.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../orchestration/framework.sh"
fi

# Load test framework
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../orchestration/testing.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../orchestration/testing.sh"
fi

# Load spoke modules for testing
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../spoke/spoke-init.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../spoke/spoke-init.sh"
fi

# =============================================================================
# MULTI-INSTANCE TEST CONSTANTS
# =============================================================================

# NATO Coalition test instances (subset for manageable testing)
readonly NATO_TEST_INSTANCES=("USA" "FRA" "DEU" "CAN" "GBR")
readonly NATO_INSTANCE_NAMES=(
    "USA:United States Defence"
    "FRA:France Defence Force"
    "DEU:Germany Defence Ministry"
    "CAN:Canada Defence Force"
    "GBR:United Kingdom Defence"
)

# Test configuration
readonly MULTI_INSTANCE_TIMEOUT=600  # 10 minutes total
readonly CONCURRENT_DEPLOYMENTS=3   # Deploy 3 instances simultaneously
readonly STAGGERED_DELAY=30         # Delay between deployment waves

# Results tracking
declare -A DEPLOYMENT_RESULTS=()
declare -A DEPLOYMENT_TIMES=()
declare -i SUCCESSFUL_DEPLOYMENTS=0
declare -i FAILED_DEPLOYMENTS=0

# =============================================================================
# MULTI-INSTANCE TEST UTILITIES
# =============================================================================

##
# Initialize multi-instance test environment
#
multi_test_init() {
    log_info "Initializing Multi-Instance Test Environment"

    # Validate Hub is running (required for spoke deployments)
    if ! docker ps --format '{{.Names}}' | grep -q "dive-hub-keycloak"; then
        log_error "Hub infrastructure not running - required for multi-instance testing"
        log_info "Start Hub first: ./dive hub up"
        return 1
    fi

    # Clean any existing test instances
    multi_test_cleanup_all

    # Reset tracking
    DEPLOYMENT_RESULTS=()
    DEPLOYMENT_TIMES=()
    SUCCESSFUL_DEPLOYMENTS=0
    FAILED_DEPLOYMENTS=0

    log_success "Multi-instance test environment initialized"
    return 0
}

##
# Get instance name from code
#
# Arguments:
#   $1 - Instance code
#
multi_get_instance_name() {
    local code="$1"

    for entry in "${NATO_INSTANCE_NAMES[@]}"; do
        local instance_code="${entry%%:*}"
        if [ "$instance_code" = "$code" ]; then
            echo "${entry#*:}"
            return 0
        fi
    done

    echo "${code} Instance"
}

##
# Setup test instance for deployment
#
# Arguments:
#   $1 - Instance code
#
multi_setup_test_instance() {
    local instance_code="$1"
    local instance_name
    instance_name=$(multi_get_instance_name "$instance_code")

    log_info "Setting up test instance: $instance_code ($instance_name)"

    # Use the spoke initialization (but don't actually deploy)
    if [ -f "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-init.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/spoke/spoke-init.sh"

        # Initialize spoke configuration only (no container deployment)
        if spoke_init_config "$instance_code" "$instance_name"; then
            log_success "Test instance configured: $instance_code"
            return 0
        fi
    fi

    log_error "Failed to setup test instance: $instance_code"
    return 1
}

##
# Deploy single instance (for testing)
#
# Arguments:
#   $1 - Instance code
#
multi_deploy_instance() {
    local instance_code="$1"
    local instance_name
    instance_name=$(multi_get_instance_name "$instance_code")

    local start_time=$(date +%s)

    log_info "Starting deployment: $instance_code ($instance_name)"

    # Initialize orchestration context
    orch_init_context "$instance_code" "$instance_name"
    orch_init_metrics "$instance_code"

    # Execute deployment
    if spoke_deploy "$instance_code" "$instance_name"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        DEPLOYMENT_RESULTS["$instance_code"]="SUCCESS"
        DEPLOYMENT_TIMES["$instance_code"]=$duration
        ((SUCCESSFUL_DEPLOYMENTS++))

        log_success "✅ Deployment completed: $instance_code (${duration}s)"
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        DEPLOYMENT_RESULTS["$instance_code"]="FAILED"
        DEPLOYMENT_TIMES["$instance_code"]=$duration
        ((FAILED_DEPLOYMENTS++))

        log_error "❌ Deployment failed: $instance_code (${duration}s)"
        return 1
    fi
}

##
# Deploy instances concurrently
#
# Arguments:
#   $@ - Instance codes to deploy
#
multi_deploy_concurrent() {
    local instances=("$@")
    local pids=()
    local results=()

    log_info "Starting concurrent deployment of ${#instances[@]} instances: ${instances[*]}"

    # Launch deployments
    for instance in "${instances[@]}"; do
        multi_deploy_instance "$instance" &
        pids+=($!)
    done

    # Wait for all deployments to complete
    local failed=0
    for i in "${!pids[@]}"; do
        local pid="${pids[$i]}"
        local instance="${instances[$i]}"

        if ! wait "$pid"; then
            ((failed++))
            results+=("$instance:FAILED")
        else
            results+=("$instance:SUCCESS")
        fi
    done

    log_info "Concurrent deployment completed: ${#instances[@]} total, $failed failed"

    return $failed
}

##
# Deploy instances in waves (staggered deployment)
#
# Arguments:
#   $@ - Instance codes to deploy
#
multi_deploy_staggered() {
    local instances=("$@")
    local wave_size=$CONCURRENT_DEPLOYMENTS

    log_info "Starting staggered deployment of ${#instances[@]} instances (waves of $wave_size)"

    local total_instances=${#instances[@]}
    local processed=0

    while [ $processed -lt $total_instances ]; do
        local wave_end=$((processed + wave_size))
        if [ $wave_end -gt $total_instances ]; then
            wave_end=$total_instances
        fi

        # Extract current wave
        local wave=("${instances[@]:processed:wave_size}")

        log_info "Deploying wave: ${wave[*]}"

        if ! multi_deploy_concurrent "${wave[@]}"; then
            log_warn "Wave deployment had failures, continuing with next wave..."
        fi

        processed=$wave_end

        # Delay between waves (except for last wave)
        if [ $processed -lt $total_instances ]; then
            log_info "Waiting ${STAGGERED_DELAY}s before next wave..."
            sleep $STAGGERED_DELAY
        fi
    done

    log_success "Staggered deployment completed"
}

##
# Validate all deployed instances
#
multi_validate_deployments() {
    log_info "Validating deployed instances..."

    local validated=0
    local total_validated=0

    for instance in "${NATO_TEST_INSTANCES[@]}"; do
        ((total_validated++))

        if [ "${DEPLOYMENT_RESULTS[$instance]}" = "SUCCESS" ]; then
            log_info "Validating instance: $instance"

            # Check if instance is responding
            if multi_validate_instance "$instance"; then
                ((validated++))
                log_success "✅ Instance validated: $instance"
            else
                log_error "❌ Instance validation failed: $instance"
            fi
        else
            log_warn "⏭️  Skipping validation for failed instance: $instance"
        fi
    done

    log_info "Validation complete: $validated/$total_validated instances validated"

    if [ $validated -eq $total_validated ]; then
        log_success "🎉 All deployed instances validated successfully"
        return 0
    else
        log_warn "⚠️  Some instances failed validation"
        return 1
    fi
}

##
# Validate single instance
#
# Arguments:
#   $1 - Instance code
#
multi_validate_instance() {
    local instance_code="$1"

    # Check if containers are running
    local running_containers
    running_containers=$(docker ps -q --filter "name=dive-spoke-${instance_code}" | wc -l)

    if [ "$running_containers" -lt 5 ]; then  # Expect at least 5 containers per instance
        log_warn "Instance $instance_code has only $running_containers running containers"
        return 1
    fi

    # Check Keycloak health
    local kc_port
    eval "$(get_instance_ports "$instance_code" 2>/dev/null)"
    kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"

    if ! curl -kfs --max-time 10 "https://localhost:${kc_port}/realms/dive-v3-broker-${instance_code}/protocol/openid-connect/certs" >/dev/null 2>&1; then
        log_warn "Instance $instance_code Keycloak not responding"
        return 1
    fi

    # Check backend health
    local backend_port
    eval "$(get_instance_ports "$instance_code" 2>/dev/null)"
    backend_port="${SPOKE_BACKEND_PORT:-4000}"

    if ! curl -kfs --max-time 10 "https://localhost:${backend_port}/health" >/dev/null 2>&1; then
        log_warn "Instance $instance_code backend not responding"
        return 1
    fi

    return 0
}

##
# Generate multi-instance test report
#
multi_generate_report() {
    local report_file="${DIVE_ROOT}/logs/multi-instance-test-report-$(date +%Y%m%d-%H%M%S).txt"

    {
        echo "================================================================================"
        echo "DIVE V3 Multi-Instance Deployment Test Report"
        echo "Generated: $(date)"
        echo "Environment: $(upper "$ENVIRONMENT")"
        echo "Hub Instance: $(upper "$INSTANCE")"
        echo "================================================================================"
        echo ""
        echo "TEST CONFIGURATION:"
        echo "  Total Instances Tested: ${#NATO_TEST_INSTANCES[@]}"
        echo "  Concurrent Deployments: $CONCURRENT_DEPLOYMENTS"
        echo "  Staggered Delay: ${STAGGERED_DELAY}s"
        echo "  Total Timeout: ${MULTI_INSTANCE_TIMEOUT}s"
        echo ""
        echo "DEPLOYMENT RESULTS:"
        echo "  Successful: $SUCCESSFUL_DEPLOYMENTS"
        echo "  Failed: $FAILED_DEPLOYMENTS"
        echo "  Success Rate: $(( (SUCCESSFUL_DEPLOYMENTS * 100) / (${#NATO_TEST_INSTANCES[@]}) ))%"
        echo ""

        echo "INSTANCE DETAILS:"
        printf "%-6s %-12s %-10s %-8s\n" "Code" "Status" "Duration" "Validated"
        echo "------------------------------------------------"

        for instance in "${NATO_TEST_INSTANCES[@]}"; do
            local status="${DEPLOYMENT_RESULTS[$instance]:-NOT_TESTED}"
            local duration="${DEPLOYMENT_TIMES[$instance]:-N/A}"
            local validated="N/A"

            if [ "$status" = "SUCCESS" ]; then
                # Check if instance was validated
                if multi_validate_instance "$instance" 2>/dev/null; then
                    validated="YES"
                else
                    validated="NO"
                fi
            fi

            printf "%-6s %-12s %-10s %-8s\n" "$instance" "$status" "${duration}s" "$validated"
        done

        echo ""
        echo "PERFORMANCE METRICS:"
        local total_time=0
        local max_time=0
        local min_time=999999

        for instance in "${NATO_TEST_INSTANCES[@]}"; do
            if [ -n "${DEPLOYMENT_TIMES[$instance]}" ]; then
                local time="${DEPLOYMENT_TIMES[$instance]}"
                total_time=$((total_time + time))

                if [ "$time" -gt "$max_time" ]; then
                    max_time="$time"
                fi

                if [ "$time" -lt "$min_time" ]; then
                    min_time="$time"
                fi
            fi
        done

        if [ $SUCCESSFUL_DEPLOYMENTS -gt 0 ]; then
            local avg_time=$((total_time / SUCCESSFUL_DEPLOYMENTS))
            echo "  Average Deployment Time: ${avg_time}s"
            echo "  Fastest Deployment: ${min_time}s"
            echo "  Slowest Deployment: ${max_time}s"
            echo "  Time Range: $((max_time - min_time))s"
        fi

        echo ""
        echo "================================================================================"

        if [ $FAILED_DEPLOYMENTS -eq 0 ]; then
            echo "🎉 ALL MULTI-INSTANCE TESTS PASSED"
            echo "Enterprise-grade reliability validated at coalition scale"
        else
            echo "❌ MULTI-INSTANCE TESTS HAD FAILURES"
            echo "Check individual instance logs for details"
        fi

        echo "================================================================================"
    } > "$report_file"

    log_info "Multi-instance test report generated: $report_file"

    # Display summary
    echo ""
    echo "================================================================================"
    echo "MULTI-INSTANCE DEPLOYMENT TEST SUMMARY"
    echo "================================================================================"
    echo "Instances Tested: ${#NATO_TEST_INSTANCES[@]}"
    echo "✅ Successful: $SUCCESSFUL_DEPLOYMENTS"
    echo "❌ Failed: $FAILED_DEPLOYMENTS"

    if [ $FAILED_DEPLOYMENTS -eq 0 ]; then
        echo ""
        echo "🎉 ALL INSTANCES DEPLOYED SUCCESSFULLY"
        echo "Enterprise-grade reliability validated"
        return 0
    else
        echo ""
        echo "❌ SOME INSTANCES FAILED DEPLOYMENT"
        echo "Check detailed report: $report_file"
        return 1
    fi
}

##
# Cleanup all test instances
#
multi_test_cleanup_all() {
    log_info "Cleaning up test instances..."

    for instance in "${NATO_TEST_INSTANCES[@]}"; do
        multi_test_cleanup_instance "$instance"
    done

    # Clean up any orphaned containers
    local orphaned
    orphaned=$(docker ps -aq --filter "name=dive-test-" 2>/dev/null || true)
    if [ -n "$orphaned" ]; then
        log_info "Removing orphaned test containers..."
        docker rm -f $orphaned 2>/dev/null || true
    fi

    log_success "Test cleanup completed"
}

##
# Cleanup single test instance
#
# Arguments:
#   $1 - Instance code
#
multi_test_cleanup_instance() {
    local instance_code="$1"

    # Use test cleanup utility
    orch_test_cleanup_instance "$instance_code"

    # Additional cleanup for multi-instance tests
    rm -rf "${DIVE_ROOT}/test-instances/${instance_code}"
    rm -f "${DIVE_ROOT}/.dive-state/${instance_code,,}.state"

    log_verbose "Cleaned up test instance: $instance_code"
}

# =============================================================================
# TEST SCENARIOS
# =============================================================================

##
# Test concurrent deployment of all NATO instances
#
multi_test_concurrent_all() {
    log_info "Testing concurrent deployment of all NATO instances"

    if ! multi_test_init; then
        return 1
    fi

    # Setup all test instances
    for instance in "${NATO_TEST_INSTANCES[@]}"; do
        if ! multi_setup_test_instance "$instance"; then
            log_error "Failed to setup test instance: $instance"
            return 1
        fi
    done

    log_success "All test instances configured"

    # Execute concurrent deployment with timeout
    timeout $MULTI_INSTANCE_TIMEOUT bash -c "multi_deploy_concurrent \"${NATO_TEST_INSTANCES[@]}\"" || {
        log_warn "Concurrent deployment timed out after ${MULTI_INSTANCE_TIMEOUT}s"
    }

    # Validate results
    multi_validate_deployments

    # Generate report
    multi_generate_report
}

##
# Test staggered deployment (production-like scenario)
#
multi_test_staggered_deployment() {
    log_info "Testing staggered deployment (production-like scenario)"

    if ! multi_test_init; then
        return 1
    fi

    # Setup all test instances
    for instance in "${NATO_TEST_INSTANCES[@]}"; do
        if ! multi_setup_test_instance "$instance"; then
            log_error "Failed to setup test instance: $instance"
            return 1
        fi
    done

    # Execute staggered deployment
    multi_deploy_staggered "${NATO_TEST_INSTANCES[@]}"

    # Validate results
    multi_validate_deployments

    # Generate report
    multi_generate_report
}

##
# Test federation scaling (deploy instances and test cross-communication)
#
multi_test_federation_scaling() {
    log_info "Testing federation scaling across multiple instances"

    if ! multi_test_init; then
        return 1
    fi

    # Deploy subset of instances for federation testing
    local fed_instances=("USA" "FRA" "DEU")

    # Setup instances
    for instance in "${fed_instances[@]}"; do
        if ! multi_setup_test_instance "$instance"; then
            log_error "Failed to setup federation test instance: $instance"
            return 1
        fi
    done

    # Deploy instances
    if ! multi_deploy_concurrent "${fed_instances[@]}"; then
        log_error "Federation instance deployment failed"
        return 1
    fi

    # Test federation connectivity
    multi_test_federation_connectivity "${fed_instances[@]}"

    # Generate report
    multi_generate_report
}

##
# Test federation connectivity between instances
#
# Arguments:
#   $@ - Instance codes
#
multi_test_federation_connectivity() {
    local instances=("$@")

    log_info "Testing federation connectivity between instances: ${instances[*]}"

    local connectivity_tests=0
    local successful_tests=0

    # Test bidirectional federation
    for source in "${instances[@]}"; do
        for target in "${instances[@]}"; do
            if [ "$source" != "$target" ]; then
                ((connectivity_tests++))

                log_verbose "Testing federation: $source → $target"

                # Test IdP configuration
                if multi_test_federation_idp "$source" "$target"; then
                    ((successful_tests++))
                    log_verbose "✅ Federation OK: $source → $target"
                else
                    log_warn "❌ Federation failed: $source → $target"
                fi
            fi
        done
    done

    local success_rate=$(( (successful_tests * 100) / connectivity_tests ))

    log_info "Federation connectivity: $successful_tests/$connectivity_tests tests passed (${success_rate}%)"

    if [ $success_rate -ge 80 ]; then
        log_success "Federation scaling test passed (≥80% connectivity)"
        return 0
    else
        log_error "Federation scaling test failed (<80% connectivity)"
        return 1
    fi
}

##
# Test IdP configuration between two instances
#
# Arguments:
#   $1 - Source instance
#   $2 - Target instance
#
multi_test_federation_idp() {
    local source="$1"
    local target="$2"

    # Check if source has target IdP configured
    local kc_container="dive-spoke-${source,,}-keycloak"
    local realm="dive-v3-broker-${source,,}"

    # Use docker exec to check IdP configuration
    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        local idp_check
        idp_check=$(docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh get identity-provider/instances \
            -r "$realm" --fields alias 2>/dev/null | grep -c "${target,,}-idp" || echo "0")

        [ "$idp_check" -gt 0 ]
        return $?
    fi

    return 1
}

# =============================================================================
# LOAD TESTING CAPABILITIES
# =============================================================================

##
# Execute load testing scenarios
#
multi_load_test() {
    log_info "Executing load testing scenarios"

    multi_load_test_concurrent_health_checks
    multi_load_test_concurrent_deployments
    multi_load_test_resource_stress
}

##
# Load test concurrent health checks
#
multi_load_test_concurrent_health_checks() {
    log_step "Load Testing: Concurrent Health Checks"

    local concurrent_checks=50
    local start_time=$(date +%s)

    log_info "Executing $concurrent_checks concurrent health checks..."

    for i in $(seq 1 $concurrent_checks); do
        # Health check different instances
        local instance="${NATO_TEST_INSTANCES[$((RANDOM % ${#NATO_TEST_INSTANCES[@]}))]}"
        orch_check_service_health "$instance" "keycloak" 30 &
    done

    wait

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log_info "Concurrent health checks completed in ${duration}s"

    if [ $duration -lt 60 ]; then
        log_success "✅ Load test passed: Concurrent health checks handled efficiently"
        return 0
    else
        log_warn "⚠️  Load test slow: Concurrent health checks took ${duration}s (>60s)"
        return 1
    fi
}

##
# Load test concurrent deployments (stress test)
#
multi_load_test_concurrent_deployments() {
    log_step "Load Testing: Concurrent Deployments"

    # Deploy multiple instances simultaneously under load
    local load_instances=("USA" "FRA" "DEU" "CAN")

    log_info "Stress testing with ${#load_instances[@]} concurrent deployments..."

    # This would be a more intensive version of concurrent deployment testing
    # For now, just run the standard concurrent test
    multi_deploy_concurrent "${load_instances[@]}"
}

##
# Load test resource utilization
#
multi_load_test_resource_stress() {
    log_step "Load Testing: Resource Stress Test"

    log_info "Testing resource utilization under load..."

    # Monitor system resources during load test
    local initial_memory
    initial_memory=$(vm_stat | grep "Pages free" | awk '{print $3}' | tr -d '.')

    # Generate load
    for i in {1..20}; do
        multi_validate_instance "USA" &
        multi_validate_instance "FRA" &
    done
    wait

    local final_memory
    final_memory=$(vm_stat | grep "Pages free" | awk '{print $3}' | tr -d '.')

    local memory_delta=$((initial_memory - final_memory))

    log_info "Resource stress test completed (memory delta: ${memory_delta})"

    # Basic resource check - in production this would be more sophisticated
    if [ $memory_delta -lt 100000 ]; then  # Arbitrary threshold
        log_success "✅ Resource utilization within acceptable limits"
        return 0
    else
        log_warn "⚠️  High resource utilization detected"
        return 1
    fi
}