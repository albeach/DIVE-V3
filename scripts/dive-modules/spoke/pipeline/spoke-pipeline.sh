#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Deployment Pipeline Controller
# =============================================================================
# Unified deployment pipeline that coordinates all phases using the
# orchestration framework. Replaces the sprawling spoke_deploy() and spoke_up()
# with a clean, modular architecture.
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# Prevent multiple sourcing
if [ -n "$SPOKE_PIPELINE_LOADED" ]; then
    return 0
fi
export SPOKE_PIPELINE_LOADED=1

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration framework
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../../orchestration-framework.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../../orchestration-framework.sh"
fi

# Load orchestration state database
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../../orchestration-state-db.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../../orchestration-state-db.sh"
fi

# =============================================================================
# PIPELINE CONSTANTS
# =============================================================================

# Pipeline execution modes
readonly PIPELINE_MODE_DEPLOY="deploy"      # Full deployment (all phases)
readonly PIPELINE_MODE_UP="up"              # Quick start (skip initialization)
readonly PIPELINE_MODE_REDEPLOY="redeploy"  # Redeploy (skip init, full deploy)

# Pipeline phases
readonly PIPELINE_PHASE_PREFLIGHT="PREFLIGHT"
readonly PIPELINE_PHASE_INITIALIZATION="INITIALIZATION"
readonly PIPELINE_PHASE_DEPLOYMENT="DEPLOYMENT"
readonly PIPELINE_PHASE_CONFIGURATION="CONFIGURATION"
readonly PIPELINE_PHASE_VERIFICATION="VERIFICATION"
readonly PIPELINE_PHASE_COMPLETE="COMPLETE"

# =============================================================================
# PIPELINE MODULE LOADING
# =============================================================================

_PIPELINE_DIR="$(dirname "${BASH_SOURCE[0]}")"

# Load pipeline modules
_spoke_pipeline_load_modules() {
    local modules=(
        "spoke-error-codes.sh"
        "spoke-secrets.sh"
        "spoke-containers.sh"
        "spoke-federation.sh"
        "spoke-compose-generator.sh"
        "phase-preflight.sh"
        "phase-initialization.sh"
        "phase-deployment.sh"
        "phase-configuration.sh"
        "phase-seeding.sh"
        "phase-verification.sh"
    )

    for module in "${modules[@]}"; do
        if [ -f "${_PIPELINE_DIR}/${module}" ]; then
            source "${_PIPELINE_DIR}/${module}"
        fi
    done
}

# Load modules on source
_spoke_pipeline_load_modules

# =============================================================================
# MAIN PIPELINE CONTROLLER
# =============================================================================

##
# Execute the spoke deployment pipeline
#
# Arguments:
#   $1 - Instance code (e.g., NZL, FRA)
#   $2 - Instance name (e.g., "New Zealand Defence")
#   $3 - Pipeline mode (deploy|up|redeploy)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_pipeline_execute() {
    local instance_code="$1"
    local instance_name="${2:-$instance_code Instance}"
    local pipeline_mode="${3:-$PIPELINE_MODE_DEPLOY}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local start_time=$(date +%s)

    # Validate inputs
    if [ -z "$instance_code" ]; then
        log_error "Instance code required"
        return 1
    fi

    # Initialize orchestration context
    orch_init_context "$code_upper" "$instance_name"
    if type orch_init_metrics &>/dev/null; then
        orch_init_metrics "$code_upper"
    fi

    log_info "Starting spoke pipeline: $code_upper ($pipeline_mode mode)"

    # Set initial state
    orch_db_set_state "$code_upper" "INITIALIZING" "" \
        "{\"mode\":\"$pipeline_mode\",\"instance_name\":\"$instance_name\"}"

    # Execute phases based on mode
    local phase_result=0

    # Phase 1: Preflight (always runs)
    if ! spoke_pipeline_run_phase "$code_upper" "$PIPELINE_PHASE_PREFLIGHT" "$pipeline_mode"; then
        phase_result=1
    fi

    # Phase 2: Initialization (skip for 'up' mode)
    if [ $phase_result -eq 0 ] && [ "$pipeline_mode" != "$PIPELINE_MODE_UP" ]; then
        if ! spoke_pipeline_run_phase "$code_upper" "$PIPELINE_PHASE_INITIALIZATION" "$pipeline_mode"; then
            phase_result=1
        fi
    fi

    # Phase 3: Deployment (always runs)
    if [ $phase_result -eq 0 ]; then
        if ! spoke_pipeline_run_phase "$code_upper" "$PIPELINE_PHASE_DEPLOYMENT" "$pipeline_mode"; then
            phase_result=1
        fi
    fi

    # Phase 4: Configuration (always runs)
    if [ $phase_result -eq 0 ]; then
        if ! spoke_pipeline_run_phase "$code_upper" "$PIPELINE_PHASE_CONFIGURATION" "$pipeline_mode"; then
            phase_result=1
        fi
    fi

    # Phase 5: Seeding (deploy mode only)
    if [ $phase_result -eq 0 ] && [ "$pipeline_mode" = "$PIPELINE_MODE_DEPLOY" ]; then
        if ! spoke_pipeline_run_phase "$code_upper" "SEEDING" "$pipeline_mode"; then
            phase_result=1
        fi
    fi

    # Phase 6: Verification (always runs)
    if [ $phase_result -eq 0 ]; then
        if ! spoke_pipeline_run_phase "$code_upper" "$PIPELINE_PHASE_VERIFICATION" "$pipeline_mode"; then
            phase_result=1
        fi
    fi

    # Calculate duration
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Finalize
    if [ $phase_result -eq 0 ]; then
        orch_db_set_state "$code_upper" "COMPLETE" "" \
            "{\"duration_seconds\":$duration,\"mode\":\"$pipeline_mode\"}"

        # Create final checkpoint
        if type orch_create_checkpoint &>/dev/null; then
            orch_create_checkpoint "$code_upper" "COMPLETE" "Pipeline completed successfully"
        fi

        spoke_pipeline_print_success "$code_upper" "$instance_name" "$duration" "$pipeline_mode"
        return 0
    else
        orch_db_set_state "$code_upper" "FAILED" "Pipeline failed" \
            "{\"duration_seconds\":$duration,\"mode\":\"$pipeline_mode\"}"

        # Generate error summary
        if type orch_generate_error_summary &>/dev/null; then
            orch_generate_error_summary "$code_upper"
        fi

        spoke_pipeline_print_failure "$code_upper" "$instance_name" "$duration"
        return 1
    fi
}

##
# Run a single pipeline phase with error handling
#
# Arguments:
#   $1 - Instance code
#   $2 - Phase name
#   $3 - Pipeline mode
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_pipeline_run_phase() {
    local instance_code="$1"
    local phase_name="$2"
    local pipeline_mode="$3"

    log_step "Phase: $phase_name"

    # Update state
    orch_db_set_state "$instance_code" "$phase_name"

    # Create checkpoint before phase
    if type orch_create_checkpoint &>/dev/null; then
        orch_create_checkpoint "$instance_code" "$phase_name" "Starting $phase_name phase"
    fi

    # Execute phase function
    local phase_function="spoke_phase_${phase_name,,}"  # Convert to lowercase

    if type "$phase_function" &>/dev/null; then
        if "$phase_function" "$instance_code" "$pipeline_mode"; then
            log_success "Phase $phase_name completed"
            return 0
        else
            log_error "Phase $phase_name failed"

            # Record error if orchestration framework available
            if type orch_record_error &>/dev/null; then
                orch_record_error "PHASE_${phase_name}_FAIL" "$ORCH_SEVERITY_CRITICAL" \
                    "Phase $phase_name failed for $instance_code" "$phase_name" \
                    "Check logs and retry: ./dive spoke deploy $instance_code"
            fi

            # Attempt rollback if enabled
            if [ "${SPOKE_PIPELINE_AUTO_ROLLBACK:-true}" = "true" ]; then
                spoke_pipeline_rollback "$instance_code" "$phase_name"
            fi

            return 1
        fi
    else
        log_warn "Phase function not found: $phase_function (skipping)"
        return 0
    fi
}

##
# Rollback to last known good state
#
# Arguments:
#   $1 - Instance code
#   $2 - Failed phase name
##
spoke_pipeline_rollback() {
    local instance_code="$1"
    local failed_phase="$2"

    log_warn "Attempting rollback for $instance_code after $failed_phase failure"

    # Find latest checkpoint before failure
    if type orch_find_latest_checkpoint &>/dev/null; then
        local checkpoint
        checkpoint=$(orch_find_latest_checkpoint "$instance_code")

        if [ -n "$checkpoint" ]; then
            log_info "Rolling back to checkpoint: $checkpoint"
            if type orch_execute_rollback &>/dev/null; then
                orch_execute_rollback "$instance_code" "Phase $failed_phase failed" "$ROLLBACK_CONTAINERS"
            fi
        fi
    fi
}

##
# Print success banner
##
spoke_pipeline_print_success() {
    local instance_code="$1"
    local instance_name="$2"
    local duration="$3"
    local mode="$4"

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                          ║${NC}"
    echo -e "${GREEN}║                    🎉 SPOKE DEPLOYMENT COMPLETE! 🎉                     ║${NC}"
    echo -e "${GREEN}║                                                                          ║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════════════╣${NC}"
    printf "${GREEN}║  Instance: %-65s║${NC}\n" "$instance_code - $instance_name"
    printf "${GREEN}║  Duration: %-65s║${NC}\n" "${duration} seconds"
    printf "${GREEN}║  Mode:     %-65s║${NC}\n" "$mode"
    echo -e "${GREEN}║                                                                          ║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  Useful Commands:                                                       ║${NC}"
    printf "${GREEN}║    ./dive --instance %-3s spoke status       # Check status              ║${NC}\n" "$(lower "$instance_code")"
    printf "${GREEN}║    ./dive --instance %-3s spoke health       # Health check              ║${NC}\n" "$(lower "$instance_code")"
    printf "${GREEN}║    ./dive federation verify %-3s            # Check federation          ║${NC}\n" "$instance_code"
    echo -e "${GREEN}║                                                                          ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

##
# Print failure banner
##
spoke_pipeline_print_failure() {
    local instance_code="$1"
    local instance_name="$2"
    local duration="$3"

    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                                                                          ║${NC}"
    echo -e "${RED}║                    ❌ SPOKE DEPLOYMENT FAILED ❌                         ║${NC}"
    echo -e "${RED}║                                                                          ║${NC}"
    echo -e "${RED}╠══════════════════════════════════════════════════════════════════════════╣${NC}"
    printf "${RED}║  Instance: %-65s║${NC}\n" "$instance_code - $instance_name"
    printf "${RED}║  Duration: %-65s║${NC}\n" "${duration} seconds"
    echo -e "${RED}║                                                                          ║${NC}"
    echo -e "${RED}╠══════════════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${RED}║  Troubleshooting:                                                        ║${NC}"
    printf "${RED}║    ./dive --instance %-3s spoke logs          # View logs                ║${NC}\n" "$(lower "$instance_code")"
    printf "${RED}║    ./dive --instance %-3s spoke clean         # Clean up                 ║${NC}\n" "$(lower "$instance_code")"
    printf "${RED}║    ./dive orch-db status                     # Check state DB           ║${NC}\n"
    echo -e "${RED}║                                                                          ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# =============================================================================
# CONVENIENCE WRAPPERS
# =============================================================================

##
# Deploy a new spoke (full pipeline)
##
spoke_pipeline_deploy() {
    local instance_code="$1"
    local instance_name="$2"

    spoke_pipeline_execute "$instance_code" "$instance_name" "$PIPELINE_MODE_DEPLOY"
}

##
# Start an existing spoke (quick mode)
##
spoke_pipeline_up() {
    local instance_code="${1:-$INSTANCE}"

    if [ -z "$instance_code" ]; then
        instance_code="usa"
    fi

    spoke_pipeline_execute "$instance_code" "$instance_code Instance" "$PIPELINE_MODE_UP"
}

##
# Redeploy an existing spoke (skip init)
##
spoke_pipeline_redeploy() {
    local instance_code="$1"
    local instance_name="$2"

    spoke_pipeline_execute "$instance_code" "$instance_name" "$PIPELINE_MODE_REDEPLOY"
}
