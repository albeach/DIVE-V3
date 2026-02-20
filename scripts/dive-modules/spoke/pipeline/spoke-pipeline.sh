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
if [ -n "${SPOKE_PIPELINE_LOADED:-}" ]; then
    return 0
fi
export SPOKE_PIPELINE_LOADED=1

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration framework (includes state, errors, circuit-breaker, dependencies)
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../../orchestration/framework.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../../orchestration/framework.sh"
fi

# Load federation health module (includes fed_db_* functions)
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../../federation/health.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../../federation/health.sh"
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
        "spoke-checkpoint.sh"
        "spoke-preflight.sh"
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
#   $3 - Pipeline mode (deploy|up|redeploy|resume)
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

    # Handle resume mode
    local resume_mode=false
    if [ "$pipeline_mode" = "resume" ]; then
        resume_mode=true
        pipeline_mode="$PIPELINE_MODE_DEPLOY"  # Resume uses deploy mode

        # Check if we can resume
        if type spoke_checkpoint_can_resume &>/dev/null; then
            if ! spoke_checkpoint_can_resume "$code_upper"; then
                log_error "Cannot resume - no valid checkpoints found"
                log_error "Run without --resume to start a new deployment"
                return 1
            fi

            # Validate checkpoint consistency
            if type spoke_checkpoint_validate_state &>/dev/null; then
                spoke_checkpoint_validate_state "$code_upper" || log_warn "Checkpoint inconsistencies detected (auto-corrected)"
            fi

            # Show resume info
            log_info "Resuming deployment for $code_upper"
            if type spoke_checkpoint_print_resume_info &>/dev/null; then
                spoke_checkpoint_print_resume_info "$code_upper"
            fi
        else
            log_warn "Checkpoint module not loaded - resume not available"
            resume_mode=false
        fi
    fi

    # GAP-001 FIX: Acquire deployment lock to prevent concurrent deployments
    local lock_acquired=false
    if type orch_acquire_deployment_lock &>/dev/null; then
        if ! orch_acquire_deployment_lock "$code_upper"; then
            log_error "Cannot start deployment for $code_upper - lock acquisition failed"
            log_error "Another deployment is in progress"
            return 1
        fi
        lock_acquired=true
    fi

    # CRITICAL: Execute pipeline with guaranteed lock cleanup
    # Use subshell pattern to ensure cleanup happens even on early returns
    local pipeline_result=0
    _spoke_pipeline_execute_internal "$code_upper" "$instance_name" "$pipeline_mode" "$start_time" "$resume_mode" || pipeline_result=$?

    # ALWAYS release lock (runs whether pipeline succeeded or failed)
    if [ "$lock_acquired" = true ] && type orch_release_deployment_lock &>/dev/null; then
        orch_release_deployment_lock "$code_upper"
    fi

    return $pipeline_result
}

##
# Internal pipeline execution (separated for proper cleanup handling)
##
_spoke_pipeline_execute_internal() {
    local code_upper="$1"
    local instance_name="$2"
    local pipeline_mode="$3"
    local start_time="$4"
    local resume_mode="${5:-false}"

    # Initialize orchestration context
    orch_init_context "$code_upper" "$instance_name"
    if type orch_init_metrics &>/dev/null; then
        orch_init_metrics "$code_upper"
    fi

    log_info "Starting spoke pipeline: $code_upper ($pipeline_mode mode)"
    if [ "$lock_acquired" = true ]; then
        log_info "Deployment lock acquired - concurrent-safe deployment"
    fi

    # Check current state for logging
    local current_state=$(get_deployment_state "$code_upper" 2>/dev/null || echo "UNKNOWN")
    log_verbose "Current state before preflight: $current_state"

    # Execute phases based on mode
    local phase_result=0

    log_verbose "Starting phase execution (mode: $pipeline_mode, resume: $resume_mode)"

    # Pre-deployment summary + confirmation
    if ! type deployment_pre_summary_spoke &>/dev/null; then
        local _summary="${DIVE_ROOT}/scripts/dive-modules/utilities/deployment-summary.sh"
        [ -f "$_summary" ] && source "$_summary"
    fi
    if type deployment_pre_summary_spoke &>/dev/null; then
        if ! deployment_pre_summary_spoke "$code_upper"; then
            return 1
        fi
    fi

    # Phase 1: Preflight (always runs) - MUST run BEFORE setting state
    # This validates no other deployment is in progress
    log_verbose "Executing phase 1: PREFLIGHT"
    if ! spoke_pipeline_run_phase "$code_upper" "$PIPELINE_PHASE_PREFLIGHT" "$pipeline_mode" "$resume_mode"; then
        log_warn "Preflight phase failed, stopping pipeline"
        phase_result=1
    fi

    # Set initial state AFTER preflight passes (not before)
    if [ $phase_result -eq 0 ]; then
        log_verbose "Preflight passed, setting state to INITIALIZING..."
        if orch_db_set_state "$code_upper" "INITIALIZING" "" \
            "{\"mode\":\"$pipeline_mode\",\"instance_name\":\"$instance_name\"}"; then
            log_verbose "State set to INITIALIZING"
        else
            log_verbose "Could not update state to INITIALIZING (database may be unavailable)"
        fi
    fi

    # Phase 2: Initialization (skip for 'up' mode)
    if [ $phase_result -eq 0 ] && [ "$pipeline_mode" != "$PIPELINE_MODE_UP" ]; then
        log_verbose "Executing phase 2: INITIALIZATION"
        if ! spoke_pipeline_run_phase "$code_upper" "$PIPELINE_PHASE_INITIALIZATION" "$pipeline_mode" "$resume_mode"; then
            log_warn "Initialization phase failed, stopping pipeline"
            phase_result=1
        fi

        # Check failure threshold after INITIALIZATION
        if [ $phase_result -eq 0 ] && type orch_check_failure_threshold &>/dev/null; then
            if ! orch_check_failure_threshold "$code_upper"; then
                log_error "Failure threshold exceeded after INITIALIZATION - aborting deployment"
                phase_result=1
            fi
        fi
    else
        [ "$pipeline_mode" = "$PIPELINE_MODE_UP" ] && log_verbose "Skipping INITIALIZATION (up mode)"
    fi

    # Phase 3: Deployment (always runs)
    if [ $phase_result -eq 0 ]; then
        log_verbose "Executing phase 3: DEPLOYMENT"
        if ! spoke_pipeline_run_phase "$code_upper" "$PIPELINE_PHASE_DEPLOYMENT" "$pipeline_mode" "$resume_mode"; then
            log_warn "Deployment phase failed, stopping pipeline"
            phase_result=1
        fi

        # Check failure threshold after DEPLOYMENT
        if [ $phase_result -eq 0 ] && type orch_check_failure_threshold &>/dev/null; then
            if ! orch_check_failure_threshold "$code_upper"; then
                log_error "Failure threshold exceeded after DEPLOYMENT - aborting deployment"
                phase_result=1
            fi
        fi
    fi

    # Phase 4: Configuration (always runs)
    if [ $phase_result -eq 0 ]; then
        log_verbose "Executing phase 4: CONFIGURATION"
        if ! spoke_pipeline_run_phase "$code_upper" "$PIPELINE_PHASE_CONFIGURATION" "$pipeline_mode" "$resume_mode"; then
            log_warn "Configuration phase failed, stopping pipeline"
            phase_result=1
        fi

        # Check failure threshold after CONFIGURATION
        if [ $phase_result -eq 0 ] && type orch_check_failure_threshold &>/dev/null; then
            if ! orch_check_failure_threshold "$code_upper"; then
                log_error "Failure threshold exceeded after CONFIGURATION - aborting deployment"
                phase_result=1
            fi
        fi
    fi

    # Phase 5: Seeding (deploy mode only)
    if [ $phase_result -eq 0 ] && [ "$pipeline_mode" = "$PIPELINE_MODE_DEPLOY" ]; then
        log_verbose "Executing phase 5: SEEDING"
        if ! spoke_pipeline_run_phase "$code_upper" "SEEDING" "$pipeline_mode" "$resume_mode"; then
            log_warn "Seeding phase failed, stopping pipeline"
            phase_result=1
        fi

        # Check failure threshold after SEEDING
        if [ $phase_result -eq 0 ] && type orch_check_failure_threshold &>/dev/null; then
            if ! orch_check_failure_threshold "$code_upper"; then
                log_error "Failure threshold exceeded after SEEDING - aborting deployment"
                phase_result=1
            fi
        fi
    else
        [ "$pipeline_mode" != "$PIPELINE_MODE_DEPLOY" ] && log_verbose "Skipping SEEDING (not deploy mode)"
    fi

    # Phase 6: Verification (always runs)
    if [ $phase_result -eq 0 ]; then
        log_verbose "Executing phase 6: VERIFICATION"
        if ! spoke_pipeline_run_phase "$code_upper" "$PIPELINE_PHASE_VERIFICATION" "$pipeline_mode" "$resume_mode"; then
            log_warn "Verification phase failed, stopping pipeline"
            phase_result=1
        fi

        # Check failure threshold after VERIFICATION
        if [ $phase_result -eq 0 ] && type orch_check_failure_threshold &>/dev/null; then
            if ! orch_check_failure_threshold "$code_upper"; then
                log_error "Failure threshold exceeded after VERIFICATION - marking deployment degraded"
                # Don't fail here - verification complete, just warn
                log_warn "Deployment may have accumulated errors - review logs"
            fi
        fi
    fi

    log_verbose "Phase execution complete (result: $phase_result)"

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

        # Post-deployment summary with URLs and next steps
        if type deployment_post_summary &>/dev/null; then
            deployment_post_summary "spoke" "$code_upper" "$duration"
        fi

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
# Run a single pipeline phase with error handling and checkpoint support
#
# Arguments:
#   $1 - Instance code
#   $2 - Phase name
#   $3 - Pipeline mode
#   $4 - Resume mode (true/false)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_pipeline_run_phase() {
    local instance_code="$1"
    local phase_name="$2"
    local pipeline_mode="$3"
    local resume_mode="${4:-false}"

    # Check if phase should be skipped (resume mode + already complete)
    if [ "$resume_mode" = "true" ] && type spoke_checkpoint_is_complete &>/dev/null; then
        if spoke_checkpoint_is_complete "$instance_code" "$phase_name"; then
            log_info "Skipping $phase_name (already complete - resuming)"
            return 0
        fi
    fi

    log_step "Phase: $phase_name"
    local phase_start=$(date +%s)

    # Map pipeline phase names to orchestration states
    local state_name="$phase_name"
    case "$phase_name" in
        "PREFLIGHT")
            # Don't change state for preflight (validation only)
            ;;
        "INITIALIZATION")
            # State already set to INITIALIZING in pipeline_execute
            ;;
        "DEPLOYMENT")
            state_name="DEPLOYING"
            orch_db_set_state "$instance_code" "$state_name" "" "{\"phase\":\"$phase_name\"}"
            ;;
        "CONFIGURATION")
            state_name="CONFIGURING"
            orch_db_set_state "$instance_code" "$state_name" "" "{\"phase\":\"$phase_name\"}"
            ;;
        "VERIFICATION")
            state_name="VERIFYING"
            orch_db_set_state "$instance_code" "$state_name" "" "{\"phase\":\"$phase_name\"}"
            ;;
        "SEEDING")
            # Keep CONFIGURING state during seeding
            ;;
        *)
            # Custom phase - update state if valid
            if type orch_db_set_state &>/dev/null; then
                orch_db_set_state "$instance_code" "$phase_name" "" "{\"phase\":\"$phase_name\"}"
            fi
            ;;
    esac

    # Create checkpoint before critical phases
    if [[ "$phase_name" =~ ^(DEPLOYMENT|CONFIGURATION)$ ]]; then
        if type orch_create_checkpoint &>/dev/null; then
            if ! orch_create_checkpoint "$instance_code" "$phase_name" "Starting $phase_name phase" 2>/dev/null; then
                log_verbose "Could not create checkpoint for $phase_name (database may be unavailable)"
            fi
        fi
    fi

    # Execute phase function (with circuit breaker protection)
    local phase_function="spoke_phase_${phase_name,,}"  # Convert to lowercase
    local circuit_name="spoke_phase_${phase_name,,}"

    if type "$phase_function" &>/dev/null; then
        local phase_exit=0

        # Initialize circuit breaker for this phase
        if type orch_circuit_breaker_init &>/dev/null; then
            orch_circuit_breaker_init "$circuit_name" "CLOSED"
        fi

        # Check if circuit is already open (fast-fail from prior failures)
        if type orch_circuit_breaker_is_open &>/dev/null && orch_circuit_breaker_is_open "$circuit_name"; then
            log_error "Phase $phase_name: Circuit breaker OPEN - fast fail (prior failures exceeded threshold)"
            phase_exit=2
        fi

        # Execute through circuit breaker if available, otherwise direct
        if [ $phase_exit -eq 0 ]; then
            if type orch_circuit_breaker_execute &>/dev/null; then
                orch_circuit_breaker_execute "$circuit_name" "$phase_function" "$instance_code" "$pipeline_mode" || phase_exit=$?
            else
                "$phase_function" "$instance_code" "$pipeline_mode" || phase_exit=$?
            fi
        fi

        local phase_end=$(date +%s)
        local phase_duration=$((phase_end - phase_start))

        if [ $phase_exit -eq 0 ]; then
            log_success "Phase $phase_name completed in ${phase_duration}s"

            # Mark phase complete in checkpoint system
            if type spoke_checkpoint_mark_complete &>/dev/null; then
                spoke_checkpoint_mark_complete "$instance_code" "$phase_name" "$phase_duration"
            fi

            # Record successful step
            if type orch_db_record_step &>/dev/null; then
                orch_db_record_step "$instance_code" "$phase_name" "COMPLETED" ""
            fi

            return 0
        else
            if [ $phase_exit -eq 2 ]; then
                log_error "Phase $phase_name: Circuit breaker OPEN after ${phase_duration}s"
            else
                log_error "Phase $phase_name failed after ${phase_duration}s"
            fi

            # Record error
            if type orch_record_error &>/dev/null; then
                orch_record_error "PHASE_${phase_name}_FAIL" "$ORCH_SEVERITY_CRITICAL" \
                    "Phase $phase_name failed for $instance_code" "$phase_name" \
                    "Check logs and retry: ./dive spoke deploy $instance_code"
            fi

            # Record failed step
            if type orch_db_record_step &>/dev/null; then
                orch_db_record_step "$instance_code" "$phase_name" "FAILED" "Phase execution returned error (exit: $phase_exit)"
            fi

            # Guided error recovery (before rollback)
            if type error_recovery_suggest &>/dev/null; then
                error_recovery_suggest "$phase_name" "spoke" "$instance_code"
                local recovery_action=$?
                if [ $recovery_action -eq 0 ]; then
                    # Retry: recurse into this function
                    log_info "Retrying phase $phase_name..."
                    spoke_pipeline_run_phase "$instance_code" "$phase_name" "$pipeline_mode" "$resume_mode"
                    return $?
                elif [ $recovery_action -eq 2 ]; then
                    # Skip: return success
                    log_warn "Skipping phase $phase_name (user chose to skip)"
                    return 0
                fi
                # Abort: fall through to rollback
            fi

            # FIX (2026-02-09): Only rollback on early-phase failures where containers
            # and Terraform are inconsistent. For CONFIGURATION/SEEDING/VERIFICATION
            # failures, the infrastructure is intact — destructive rollback just wastes
            # 5-10 minutes forcing a complete re-deploy from scratch.
            if [ "${SPOKE_PIPELINE_AUTO_ROLLBACK:-true}" = "true" ]; then
                case "$phase_name" in
                    PREFLIGHT|INITIALIZATION|DEPLOYMENT)
                        # Early phases: infrastructure may be in bad state, full rollback
                        spoke_pipeline_rollback "$instance_code" "$phase_name"
                        ;;
                    CONFIGURATION|SEEDING|VERIFICATION)
                        # Late phases: containers/Terraform are fine, just log and let user retry
                        log_warn "Skipping destructive rollback for $phase_name failure"
                        log_warn "Infrastructure is intact — retry with: ./dive spoke deploy $instance_code"
                        # Clear only the failed phase checkpoint so it re-runs on retry
                        if type spoke_phase_clear &>/dev/null; then
                            spoke_phase_clear "$instance_code" "$phase_name" 2>/dev/null || true
                        fi
                        ;;
                    *)
                        spoke_pipeline_rollback "$instance_code" "$phase_name"
                        ;;
                esac
            fi

            return 1
        fi
    else
        log_warn "Phase function not found: $phase_function (skipping)"

        # Record skipped step
        if type orch_db_record_step &>/dev/null; then
            orch_db_record_step "$instance_code" "$phase_name" "SKIPPED" "Function not found"
        fi

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
    local code_lower=$(lower "$instance_code")

    log_warn "Attempting rollback for $instance_code after $failed_phase failure"

    # ==========================================================================
    # ROOT CAUSE FIX (2026-02-08): Clean Terraform state AND checkpoints during rollback
    # ==========================================================================
    # PRINCIPLE: Infrastructure state must match infrastructure reality.
    # When we destroy containers (Keycloak), we must destroy Terraform state.
    # When we destroy Terraform state, we must clear phase checkpoints that depend on it.
    # Otherwise next deployment skips CONFIGURATION phase, doesn't apply Terraform,
    # and protocol mappers are missing → no clearance claims in JWT tokens.
    # ==========================================================================
    log_step "Cleaning Terraform state and dependent checkpoints"

    local tf_spoke_dir="${DIVE_ROOT}/terraform/spoke"
    if [ -d "$tf_spoke_dir" ]; then
        (
            cd "$tf_spoke_dir"

            # Delete workspace entirely (cleanest approach)
            if terraform workspace list 2>/dev/null | grep -qw "$code_lower"; then
                terraform workspace select default >/dev/null 2>&1
                terraform workspace delete -force "$code_lower" >/dev/null 2>&1
                log_success "✓ Terraform workspace deleted: $code_lower"

                # Clear CONFIGURATION checkpoint so it re-runs on retry
                if type spoke_phase_clear &>/dev/null; then
                    spoke_phase_clear "$instance_code" "CONFIGURATION" 2>/dev/null || true
                    log_success "✓ CONFIGURATION checkpoint cleared"
                fi

                # Also clear any downstream checkpoints (SEEDING, VERIFICATION)
                if type spoke_phase_clear &>/dev/null; then
                    spoke_phase_clear "$instance_code" "SEEDING" 2>/dev/null || true
                    spoke_phase_clear "$instance_code" "VERIFICATION" 2>/dev/null || true
                    log_verbose "Cleared downstream checkpoints (SEEDING, VERIFICATION)"
                fi
            else
                log_verbose "Terraform workspace does not exist: $code_lower"
            fi
        )
    fi

    # CRITICAL: Always stop containers on failure
    # Don't rely on checkpoint restoration - just stop everything for clean state
    log_step "Stopping containers to prevent partial deployment state"

    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    if [ -d "$spoke_dir" ] && [ -f "$spoke_dir/docker-compose.yml" ]; then
        cd "$spoke_dir"
        if docker compose down 2>&1 | grep -q "Removed\|Stopped"; then
            log_success "✓ Containers stopped successfully"
        else
            log_warn "⚠ Container stop may have failed (check manually)"
        fi
        cd "$DIVE_ROOT"
    else
        log_verbose "No docker-compose.yml found - containers may not be running"
    fi

    # Update database state to FAILED
    if type orch_db_set_state &>/dev/null; then
        orch_db_set_state "$instance_code" "FAILED" "Deployment failed at phase: $failed_phase" \
            "{\"failed_phase\":\"$failed_phase\",\"rollback_executed\":true,\"terraform_cleaned\":true}"
    fi

    log_warn "Rollback complete - containers stopped, Terraform state cleaned"
    log_info "To retry: ./dive spoke deploy $instance_code"
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
