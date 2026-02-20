#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Common Pipeline Infrastructure
# =============================================================================
# Shared pipeline functions for both Hub and Spoke deployments.
# Provides a unified interface for:
#   - Phase execution with error handling
#   - Circuit breaker integration
#   - Failure threshold enforcement
#   - Checkpoint management (via deployment-checkpoint.sh)
#
# This module extracts common patterns from spoke-pipeline.sh to avoid
# code duplication when implementing hub_pipeline_execute().
#
# See: docs/session-context/DEPLOYMENT-PIPELINE-PHASE2-SESSION.md
# =============================================================================
# Version: 1.0.0
# Date: 2026-02-05
# =============================================================================

# Prevent multiple sourcing
if [ -n "${PIPELINE_COMMON_LOADED:-}" ]; then
    return 0
fi
export PIPELINE_COMMON_LOADED=1

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration state database
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../orchestration/state.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../orchestration/state.sh"
fi

# Load error recovery module (circuit breakers, retry, failure threshold)
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../orchestration/errors.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../orchestration/errors.sh"
fi

# =============================================================================
# PIPELINE CONSTANTS
# =============================================================================

# Pipeline execution modes (shared between hub and spoke)
readonly PIPELINE_MODE_DEPLOY="deploy"      # Full deployment (all phases)
readonly PIPELINE_MODE_UP="up"              # Quick start (skip initialization)
readonly PIPELINE_MODE_REDEPLOY="redeploy"  # Redeploy (skip init, full deploy)

# Common pipeline phases
readonly PIPELINE_PHASE_PREFLIGHT="PREFLIGHT"
readonly PIPELINE_PHASE_INITIALIZATION="INITIALIZATION"
readonly PIPELINE_PHASE_DEPLOYMENT="DEPLOYMENT"
readonly PIPELINE_PHASE_CONFIGURATION="CONFIGURATION"
readonly PIPELINE_PHASE_VERIFICATION="VERIFICATION"
readonly PIPELINE_PHASE_COMPLETE="COMPLETE"

# =============================================================================
# DEPLOYMENT LOCK MANAGEMENT
# =============================================================================

##
# Acquire deployment lock for an instance
# Prevents concurrent deployments to the same instance
#
# Arguments:
#   $1 - Instance code (e.g., USA, GBR)
#   $2 - Optional timeout in seconds (default: 30)
#
# Returns:
#   0 - Lock acquired
#   1 - Lock acquisition failed
##
deployment_acquire_lock() {
    local instance_code="$1"
    local timeout="${2:-30}"
    local code_upper=$(upper "$instance_code")

    log_verbose "Acquiring deployment lock for $code_upper..."

    # Try orchestration framework lock first
    if type orch_acquire_deployment_lock &>/dev/null; then
        if orch_acquire_deployment_lock "$code_upper" "$timeout"; then
            log_verbose "Deployment lock acquired via orchestration framework"
            return 0
        fi
    fi

    # Fallback to database advisory lock
    if type orch_db_acquire_lock &>/dev/null; then
        if orch_db_acquire_lock "$code_upper" "$timeout"; then
            log_verbose "Deployment lock acquired via database advisory lock"
            return 0
        fi
    fi

    log_error "Failed to acquire deployment lock for $code_upper"
    return 1
}

##
# Release deployment lock for an instance
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Lock released
#   1 - Release failed (non-fatal)
##
deployment_release_lock() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")

    log_verbose "Releasing deployment lock for $code_upper..."

    # Release via orchestration framework
    if type orch_release_deployment_lock &>/dev/null; then
        orch_release_deployment_lock "$code_upper" && return 0
    fi

    # Fallback to database advisory lock release
    if type orch_db_release_lock &>/dev/null; then
        orch_db_release_lock "$code_upper" && return 0
    fi

    log_verbose "Could not release lock (may not have been held)"
    return 1
}

# =============================================================================
# PHASE EXECUTION WITH CIRCUIT BREAKER
# =============================================================================

##
# Execute a deployment phase with circuit breaker protection
#
# This wrapper provides:
#   - Circuit breaker fast-fail if circuit is open
#   - Phase execution with timing
#   - Error recording and threshold checking
#   - Checkpoint creation on success
#
# Arguments:
#   $1 - Instance code (e.g., USA, GBR)
#   $2 - Phase name (e.g., PREFLIGHT, INITIALIZATION)
#   $3 - Phase function name to execute
#   $4 - Optional: Pipeline mode (deploy|up|redeploy)
#   $5 - Optional: Resume mode (true|false)
#
# Returns:
#   0 - Phase completed successfully
#   1 - Phase failed
#   2 - Circuit breaker open (fast fail)
##
deployment_run_phase() {
    local instance_code="$1"
    local phase_name="$2"
    local phase_function="$3"
    local pipeline_mode="${4:-deploy}"
    local resume_mode="${5:-false}"

    local code_upper=$(upper "$instance_code")
    local circuit_name="${code_upper}_phase_${phase_name}"

    # Check if phase should be skipped (resume mode + already complete)
    if [ "$resume_mode" = "true" ]; then
        if type deployment_checkpoint_is_complete &>/dev/null; then
            if deployment_checkpoint_is_complete "$code_upper" "$phase_name"; then
                log_info "Skipping $phase_name (already complete - resuming)"
                return 0
            fi
        fi
    fi

    log_step "Phase: $phase_name"
    local phase_start=$(date +%s)

    # Initialize circuit breaker for this phase
    if type orch_circuit_breaker_init &>/dev/null; then
        orch_circuit_breaker_init "$circuit_name" "CLOSED"
    fi

    # Execute phase through circuit breaker
    local phase_result=0
    if type orch_circuit_breaker_execute &>/dev/null; then
        # Use circuit breaker for protected execution
        if ! orch_circuit_breaker_execute "$circuit_name" "$phase_function" "$instance_code" "$pipeline_mode"; then
            local exit_code=$?
            if [ $exit_code -eq 2 ]; then
                log_error "Phase $phase_name: Circuit breaker OPEN - fast fail"
                return 2
            fi
            phase_result=1
        fi
    else
        # Fallback: Direct execution without circuit breaker
        if ! "$phase_function" "$instance_code" "$pipeline_mode"; then
            phase_result=1
        fi
    fi

    local phase_end=$(date +%s)
    local phase_duration=$((phase_end - phase_start))

    if [ $phase_result -eq 0 ]; then
        log_success "Phase $phase_name completed in ${phase_duration}s"

        # Mark phase complete in checkpoint system
        if type deployment_checkpoint_mark_complete &>/dev/null; then
            deployment_checkpoint_mark_complete "$code_upper" "$phase_name" "$phase_duration"
        fi

        # Record successful step in database
        if type orch_db_record_step &>/dev/null; then
            orch_db_record_step "$code_upper" "$phase_name" "COMPLETED" ""
        fi

        return 0
    else
        log_error "Phase $phase_name failed after ${phase_duration}s"

        # Record error
        if type orch_record_error &>/dev/null; then
            orch_record_error "PHASE_${phase_name}_FAIL" "$ORCH_SEVERITY_CRITICAL" \
                "Phase $phase_name failed for $code_upper" "$phase_name" \
                "Check logs and retry deployment"
        fi

        # Record failed step in database
        if type orch_db_record_step &>/dev/null; then
            orch_db_record_step "$code_upper" "$phase_name" "FAILED" "Phase execution returned error"
        fi

        return 1
    fi
}

##
# Check failure threshold after phase execution
#
# Arguments:
#   $1 - Instance code
#   $2 - Phase name (for logging)
#
# Returns:
#   0 - Below threshold, can continue
#   1 - Threshold exceeded, must abort
##
deployment_check_threshold() {
    local instance_code="$1"
    local phase_name="$2"
    local code_upper=$(upper "$instance_code")

    if type orch_check_failure_threshold &>/dev/null; then
        if ! orch_check_failure_threshold "$code_upper"; then
            log_error "Failure threshold exceeded after $phase_name - aborting deployment"
            return 1
        fi
    fi

    return 0
}

# =============================================================================
# STATE MANAGEMENT
# =============================================================================

##
# Update deployment state with validation
#
# Arguments:
#   $1 - Instance code
#   $2 - New state
#   $3 - Optional reason
#   $4 - Optional metadata JSON
#
# Returns:
#   0 - State updated
#   1 - State update failed
##
deployment_set_state() {
    local instance_code="$1"
    local new_state="$2"
    local reason="${3:-}"
    local metadata="${4:-}"
    local code_upper=$(upper "$instance_code")

    if type orch_db_set_state &>/dev/null; then
        orch_db_set_state "$code_upper" "$new_state" "$reason" "$metadata"
        return $?
    fi

    log_verbose "State database not available - state not persisted"
    return 0
}

##
# Get current deployment state
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   State name on stdout
##
deployment_get_state() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")

    if type orch_db_get_state &>/dev/null; then
        orch_db_get_state "$code_upper"
        return $?
    fi

    echo "UNKNOWN"
    return 0
}

# =============================================================================
# ROLLBACK SUPPORT
# =============================================================================

##
# Execute deployment rollback
#
# Arguments:
#   $1 - Instance code
#   $2 - Failed phase name
#   $3 - Deployment type (hub|spoke)
#
# Returns:
#   0 - Rollback completed
#   1 - Rollback failed
##
deployment_rollback() {
    local instance_code="$1"
    local failed_phase="$2"
    local deployment_type="${3:-spoke}"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_warn "Attempting rollback for $code_upper after $failed_phase failure"

    # Stop containers based on deployment type
    if [ "$deployment_type" = "hub" ]; then
        local compose_file="${DIVE_ROOT}/docker-compose.hub.yml"
        local compose_project="dive-hub"
    else
        local compose_file="${DIVE_ROOT}/instances/${code_lower}/docker-compose.yml"
        local compose_project="dive-spoke-${code_lower}"
    fi

    if [ -f "$compose_file" ]; then
        log_step "Stopping containers to prevent partial deployment state"
        if COMPOSE_PROJECT_NAME="$compose_project" docker compose -f "$compose_file" down 2>&1 | grep -q "Removed\|Stopped"; then
            log_success "Containers stopped successfully"
        else
            log_warn "Container stop may have failed (check manually)"
        fi
    fi

    # Update state to FAILED
    deployment_set_state "$code_upper" "FAILED" \
        "Deployment failed at phase: $failed_phase" \
        "{\"failed_phase\":\"$failed_phase\",\"rollback_executed\":true}"

    log_warn "Rollback complete - state marked FAILED"
    return 0
}

# =============================================================================
# SUCCESS/FAILURE BANNERS
# =============================================================================

##
# Print deployment success banner
#
# Arguments:
#   $1 - Instance code
#   $2 - Instance name
#   $3 - Duration in seconds
#   $4 - Pipeline mode
#   $5 - Deployment type (hub|spoke)
##
deployment_print_success() {
    local instance_code="$1"
    local instance_name="$2"
    local duration="$3"
    local mode="$4"
    local deployment_type="${5:-spoke}"
    local code_lower=$(lower "$instance_code")

    echo ""
    if [ "$deployment_type" = "hub" ]; then
        echo -e "${GREEN}+==============================================================================+${NC}"
        echo -e "${GREEN}|                                                                              |${NC}"
        echo -e "${GREEN}|                      HUB DEPLOYMENT COMPLETE!                                |${NC}"
        echo -e "${GREEN}|                                                                              |${NC}"
        echo -e "${GREEN}+==============================================================================+${NC}"
        printf "${GREEN}|  Duration: %-65s|${NC}\n" "${duration} seconds"
        printf "${GREEN}|  Mode:     %-65s|${NC}\n" "$mode"
        echo -e "${GREEN}|                                                                              |${NC}"
        echo -e "${GREEN}|  Useful Commands:                                                            |${NC}"
        echo -e "${GREEN}|    ./dive hub status         # Check status                                  |${NC}"
        echo -e "${GREEN}|    ./dive hub health         # Health check                                  |${NC}"
        echo -e "${GREEN}|    ./dive spoke deploy GBR   # Deploy a spoke                                |${NC}"
        echo -e "${GREEN}|                                                                              |${NC}"
        echo -e "${GREEN}+==============================================================================+${NC}"
    else
        echo -e "${GREEN}+==============================================================================+${NC}"
        echo -e "${GREEN}|                                                                              |${NC}"
        echo -e "${GREEN}|                    SPOKE DEPLOYMENT COMPLETE!                                |${NC}"
        echo -e "${GREEN}|                                                                              |${NC}"
        echo -e "${GREEN}+==============================================================================+${NC}"
        printf "${GREEN}|  Instance: %-65s|${NC}\n" "$instance_code - $instance_name"
        printf "${GREEN}|  Duration: %-65s|${NC}\n" "${duration} seconds"
        printf "${GREEN}|  Mode:     %-65s|${NC}\n" "$mode"
        echo -e "${GREEN}|                                                                              |${NC}"
        echo -e "${GREEN}|  Useful Commands:                                                            |${NC}"
        printf "${GREEN}|    ./dive --instance %-3s spoke status       # Check status              |${NC}\n" "$code_lower"
        printf "${GREEN}|    ./dive --instance %-3s spoke health       # Health check              |${NC}\n" "$code_lower"
        printf "${GREEN}|    ./dive federation verify %-3s             # Check federation          |${NC}\n" "$instance_code"
        echo -e "${GREEN}|                                                                              |${NC}"
        echo -e "${GREEN}+==============================================================================+${NC}"
    fi
    echo ""
}

##
# Print deployment failure banner
#
# Arguments:
#   $1 - Instance code
#   $2 - Instance name
#   $3 - Duration in seconds
#   $4 - Deployment type (hub|spoke)
##
deployment_print_failure() {
    local instance_code="$1"
    local instance_name="$2"
    local duration="$3"
    local deployment_type="${4:-spoke}"
    local code_lower=$(lower "$instance_code")

    echo ""
    if [ "$deployment_type" = "hub" ]; then
        echo -e "${RED}+==============================================================================+${NC}"
        echo -e "${RED}|                                                                              |${NC}"
        echo -e "${RED}|                        HUB DEPLOYMENT FAILED                                 |${NC}"
        echo -e "${RED}|                                                                              |${NC}"
        echo -e "${RED}+==============================================================================+${NC}"
        printf "${RED}|  Duration: %-65s|${NC}\n" "${duration} seconds"
        echo -e "${RED}|                                                                              |${NC}"
        echo -e "${RED}|  Troubleshooting:                                                            |${NC}"
        echo -e "${RED}|    ./dive logs                            # View logs                        |${NC}"
        echo -e "${RED}|    ./dive hub status                      # Check status                     |${NC}"
        echo -e "${RED}|    ./dive orch-db status                  # Check state DB                   |${NC}"
        echo -e "${RED}|                                                                              |${NC}"
        echo -e "${RED}+==============================================================================+${NC}"
    else
        echo -e "${RED}+==============================================================================+${NC}"
        echo -e "${RED}|                                                                              |${NC}"
        echo -e "${RED}|                      SPOKE DEPLOYMENT FAILED                                 |${NC}"
        echo -e "${RED}|                                                                              |${NC}"
        echo -e "${RED}+==============================================================================+${NC}"
        printf "${RED}|  Instance: %-65s|${NC}\n" "$instance_code - $instance_name"
        printf "${RED}|  Duration: %-65s|${NC}\n" "${duration} seconds"
        echo -e "${RED}|                                                                              |${NC}"
        echo -e "${RED}|  Troubleshooting:                                                            |${NC}"
        printf "${RED}|    ./dive --instance %-3s spoke logs          # View logs                |${NC}\n" "$code_lower"
        printf "${RED}|    ./dive --instance %-3s spoke clean         # Clean up                 |${NC}\n" "$code_lower"
        echo -e "${RED}|    ./dive orch-db status                     # Check state DB               |${NC}"
        echo -e "${RED}|                                                                              |${NC}"
        echo -e "${RED}+==============================================================================+${NC}"
    fi
    echo ""
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f deployment_acquire_lock
export -f deployment_release_lock
export -f deployment_run_phase
export -f deployment_check_threshold
export -f deployment_set_state
export -f deployment_get_state
export -f deployment_rollback
export -f deployment_print_success
export -f deployment_print_failure

log_verbose "Pipeline common module loaded"
