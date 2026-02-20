#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Hub Pipeline Engine & Operations
# =============================================================================
# Sourced by deployment/hub.sh — do not execute directly.
#
# Pipeline execution, circuit breaker, performance summary,
# hub_deploy, hub_preflight, hub_init, hub_up, hub_down
# =============================================================================

hub_pipeline_execute() {
    local pipeline_mode="${1:-deploy}"
    local instance_code="USA"
    local start_time
    start_time=$(date +%s)

    log_info "Starting Hub pipeline: $instance_code ($pipeline_mode mode)"

    # Source utilities (deployment logging + timing dashboard + pre-validation + health sentinel)
    local _utils_dir="${DIVE_ROOT}/scripts/dive-modules/utilities"
    if ! type deployment_log_start &>/dev/null; then
        [ -f "${_utils_dir}/deployment-logging.sh" ] && source "${_utils_dir}/deployment-logging.sh"
    fi
    if ! type deployment_print_timing_dashboard &>/dev/null; then
        [ -f "${_utils_dir}/deployment-dashboard.sh" ] && source "${_utils_dir}/deployment-dashboard.sh"
    fi
    if ! type pre_validate_hub &>/dev/null; then
        [ -f "${_utils_dir}/pre-validation.sh" ] && source "${_utils_dir}/pre-validation.sh"
    fi
    if ! type health_sentinel_start &>/dev/null; then
        [ -f "${_utils_dir}/health-sentinel.sh" ] && source "${_utils_dir}/health-sentinel.sh"
    fi
    if type deployment_log_start &>/dev/null; then
        if deployment_log_start "hub" "$instance_code"; then
            log_verbose "Deployment log: $(deployment_log_path)"
        fi
    fi

    # Pre-deployment validation gate (fail fast before any containers start)
    if type pre_validate_hub &>/dev/null; then
        if ! pre_validate_hub; then
            log_error "Pre-deployment validation failed. Aborting."
            if type deployment_log_stop &>/dev/null; then
                deployment_log_stop 1 "$(($(date +%s) - start_time))"
            fi
            return 1
        fi
    fi

    # Handle resume mode
    local resume_mode=false
    if [ "$pipeline_mode" = "resume" ]; then
        resume_mode=true
        pipeline_mode="deploy"

        # Check if we can resume
        if type hub_checkpoint_can_resume &>/dev/null; then
            if ! hub_checkpoint_can_resume; then
                log_error "Cannot resume - no valid hub checkpoints found"
                log_error "Run without --resume to start a new deployment"
                return 1
            fi

            # Validate checkpoint consistency
            if type hub_checkpoint_validate_state &>/dev/null; then
                hub_checkpoint_validate_state || log_warn "Checkpoint inconsistencies detected (auto-corrected)"
            fi

            # Show resume info
            log_info "Resuming hub deployment"
            if type hub_checkpoint_print_resume_info &>/dev/null; then
                hub_checkpoint_print_resume_info
            fi
        else
            log_warn "Checkpoint module not loaded - resume not available"
            resume_mode=false
        fi
    fi

    # Skip lock, SIGINT handler, and state writes in dry-run mode
    local lock_acquired=false
    if pipeline_is_dry_run 2>/dev/null; then
        log_verbose "Dry-run mode: skipping deployment lock acquisition"
    else
        # Acquire deployment lock
        if type deployment_acquire_lock &>/dev/null; then
            if ! deployment_acquire_lock "$instance_code"; then
                log_error "Cannot start hub deployment - lock acquisition failed"
                log_error "Another deployment may be in progress"
                return 1
            fi
            lock_acquired=true
        fi
    fi

    # Install SIGINT handler for graceful interrupt (skip in dry-run)
    if ! pipeline_is_dry_run 2>/dev/null && type pipeline_install_sigint_handler &>/dev/null; then
        pipeline_install_sigint_handler "$instance_code"
    fi

    # Execute pipeline with guaranteed lock cleanup
    local pipeline_result=0
    _hub_pipeline_execute_internal "$instance_code" "$pipeline_mode" "$start_time" "$resume_mode" || pipeline_result=$?

    # Uninstall SIGINT handler (skip in dry-run)
    if ! pipeline_is_dry_run 2>/dev/null && type pipeline_uninstall_sigint_handler &>/dev/null; then
        pipeline_uninstall_sigint_handler
    fi

    # Always release lock
    if [ "$lock_acquired" = true ] && type deployment_release_lock &>/dev/null; then
        deployment_release_lock "$instance_code"
    fi

    return $pipeline_result
}

##
# Internal hub pipeline execution
# Separated for proper cleanup handling
##
_hub_pipeline_execute_internal() {
    local instance_code="$1"
    local pipeline_mode="$2"
    local start_time="$3"
    local resume_mode="${4:-false}"

    local phase_result=0
    local phase_times=()

    local _is_dry_run=false
    if pipeline_is_dry_run 2>/dev/null; then
        _is_dry_run=true
    fi

    # Skip orchestration init and progress tracking in dry-run mode
    if [ "$_is_dry_run" = "false" ]; then
        # Initialize orchestration context
        if type orch_init_context &>/dev/null; then
            orch_init_context "$instance_code" "Hub Deployment"
        fi

        # Initialize metrics
        if type orch_init_metrics &>/dev/null; then
            orch_init_metrics "$instance_code"
        fi

        # Initialize progress tracking (13 phases: 1-13)
        if type progress_init &>/dev/null; then
            progress_init "hub" "USA" 13
        fi
    fi

    # =========================================================================
    # Pre-flight config validation
    # =========================================================================
    if type config_validate &>/dev/null; then
        if ! config_validate "hub"; then
            log_error "Hub deployment aborted: configuration validation failed"
            return 1
        fi
    else
        # Auto-source validator if available
        local _validator="${DIVE_ROOT}/scripts/dive-modules/configuration/config-validator.sh"
        if [ -f "$_validator" ]; then
            # shellcheck source=../configuration/config-validator.sh
            source "$_validator"
            if ! config_validate "hub"; then
                log_error "Hub deployment aborted: configuration validation failed"
                return 1
            fi
        fi
    fi

    # =========================================================================
    # Pre-deployment summary + confirmation
    # =========================================================================
    if ! type deployment_pre_summary_hub &>/dev/null; then
        local _summary="${DIVE_ROOT}/scripts/dive-modules/utilities/deployment-summary.sh"
        # shellcheck source=../utilities/deployment-summary.sh
        [ -f "$_summary" ] && source "$_summary"
    fi
    if type deployment_pre_summary_hub &>/dev/null; then
        if ! deployment_pre_summary_hub; then
            return 1
        fi
    fi

    # =========================================================================
    # PHASE REGISTRATION
    # =========================================================================
    # Declarative phase definitions. Each phase specifies:
    #   number, name, label, function, mode, state_transition, warn_message
    #
    # Modes:
    #   standard  — fatal on failure, uses circuit breaker + threshold check
    #   non_fatal — warns on failure, uses circuit breaker, continues pipeline
    #   direct    — no circuit breaker (for I/O-heavy phases like Docker build)
    #
    # Pre-validation gate (Docker, tools, disk, ports) runs before Phase 1.
    # Vault MUST be first infra phase — all other phases depend on secrets.
    # =========================================================================
    pipeline_clear_phases
    pipeline_register_phase 1  "VAULT_BOOTSTRAP" "Vault Bootstrap"   "hub_phase_vault_bootstrap"   "standard"  ""             ""
    pipeline_register_phase 2  "DATABASE_INIT"   "Database Init"     "hub_phase_database_init"     "standard"  ""             ""
    pipeline_register_phase 3  "PREFLIGHT"       "Preflight"         "hub_phase_preflight"         "standard"  ""             ""
    pipeline_register_phase 4  "INITIALIZATION"  "Initialization"    "hub_phase_initialization"    "standard"  ""             ""
    pipeline_register_phase 5  "MONGODB_INIT"    "MongoDB"           "hub_phase_mongodb_init"      "standard"  ""             ""
    pipeline_register_phase 6  "BUILD"           "Build"             "hub_phase_build"             "direct"    ""             ""
    pipeline_register_phase 7  "SERVICES"        "Services"          "hub_phase_services"          "standard"  "DEPLOYING"    ""
    pipeline_register_phase 8  "VAULT_DB_ENGINE" "Vault DB Engine"   "hub_phase_vault_db_engine"   "non_fatal" ""             "Vault database engine setup failed — backend will use static credentials"
    pipeline_register_phase 9  "KEYCLOAK_CONFIG" "Keycloak"          "hub_phase_keycloak_config"   "standard"  "CONFIGURING"  ""
    pipeline_register_phase 10 "REALM_VERIFY"    "Realm Verify"      "hub_phase_realm_verify"      "standard"  "VERIFYING"    ""
    pipeline_register_phase 11 "KAS_REGISTER"    "KAS Register"      "hub_phase_kas_register"      "non_fatal" ""             "Hub KAS registration failed - KAS decryption may not work"
    pipeline_register_phase 12 "SEEDING"         "Seeding"           "hub_phase_seeding"           "non_fatal" ""             "Database seeding failed - can be done manually: ./dive hub seed"
    pipeline_register_phase 13 "KAS_INIT"        "KAS Init"          "hub_phase_kas_init"          "non_fatal" ""             "KAS initialization had issues"

    # =========================================================================
    # EXECUTE REGISTERED PHASES
    # =========================================================================
    _hub_execute_registered_phases "$instance_code" "$pipeline_mode" "$resume_mode" phase_result phase_times

    # =========================================================================
    # Dry-run: summary already printed in _hub_execute_registered_phases
    # =========================================================================
    if [ "$_is_dry_run" = "true" ]; then
        return 0
    fi

    # =========================================================================
    # Stop Health Sentinel
    # =========================================================================
    if type health_sentinel_stop &>/dev/null; then
        health_sentinel_stop || true
    fi

    # =========================================================================
    # Finalize
    # =========================================================================
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [ $phase_result -eq 0 ]; then
        # State transition: VERIFYING → COMPLETE
        # (All verification phases passed, deployment successful)
        if type deployment_set_state &>/dev/null; then
            deployment_set_state "$instance_code" "COMPLETE" "" \
                "{\"duration_seconds\":$duration,\"mode\":\"$pipeline_mode\"}"
        fi

        # Create final checkpoint
        if type hub_checkpoint_mark_complete &>/dev/null; then
            hub_checkpoint_mark_complete "COMPLETE" "$duration"
        fi

        # Mark progress complete
        if type progress_complete &>/dev/null; then
            progress_complete
        fi

        # Print success banner and timing dashboard
        if type deployment_print_timing_dashboard &>/dev/null; then
            deployment_print_timing_dashboard "hub" "${phase_times[@]}" "$duration"
        else
            _hub_print_performance_summary "${phase_times[@]}" "$duration"
        fi
        deployment_print_success "$instance_code" "Hub" "$duration" "$pipeline_mode" "hub"

        # Health sentinel report (if any alerts during configuration phases)
        if type health_sentinel_report &>/dev/null; then
            health_sentinel_report || true
        fi

        # Post-deployment summary with URLs and next steps
        if type deployment_post_summary &>/dev/null; then
            deployment_post_summary "hub" "$instance_code" "$duration"
        fi

        # Show log file location
        if type deployment_log_path &>/dev/null; then
            local _log
            _log=$(deployment_log_path)
            [ -n "$_log" ] && log_info "Full deployment log: $_log"
        fi

        # Finalize log file
        if type deployment_log_stop &>/dev/null; then
            deployment_log_stop 0 "$duration"
        fi

        # Cleanup sentinel temp files
        if type health_sentinel_cleanup &>/dev/null; then
            health_sentinel_cleanup
        fi

        return 0
    else
        # Mark failed
        if type deployment_set_state &>/dev/null; then
            deployment_set_state "$instance_code" "FAILED" "Pipeline failed" \
                "{\"duration_seconds\":$duration,\"mode\":\"$pipeline_mode\"}"
        fi

        # Mark progress failed
        if type progress_fail &>/dev/null; then
            progress_fail "Hub deployment failed"
        fi

        # Generate error summary
        if type orch_generate_error_summary &>/dev/null; then
            orch_generate_error_summary "$instance_code"
        fi

        # Health sentinel report (may show service crashes that caused failure)
        if type health_sentinel_report &>/dev/null; then
            health_sentinel_report || true
        fi

        deployment_print_failure "$instance_code" "Hub" "$duration" "hub"

        # Show log file location
        if type deployment_log_path &>/dev/null; then
            local _log
            _log=$(deployment_log_path)
            [ -n "$_log" ] && log_info "Full deployment log: $_log"
        fi

        # Finalize log file
        if type deployment_log_stop &>/dev/null; then
            deployment_log_stop 1 "$duration"
        fi

        # Cleanup sentinel temp files
        if type health_sentinel_cleanup &>/dev/null; then
            health_sentinel_cleanup
        fi

        return 1
    fi
}

##
# Run a hub phase with circuit breaker protection
#
# Arguments:
#   $1 - Instance code
#   $2 - Phase name
#   $3 - Phase function
#   $4 - Pipeline mode
#   $5 - Resume mode
#
# Returns:
#   0 - Success
#   1 - Failure
#   2 - Circuit breaker open
##
_hub_run_phase_with_circuit_breaker() {
    local instance_code="$1"
    local phase_name="$2"
    local phase_function="$3"
    local pipeline_mode="$4"
    local resume_mode="$5"

    local circuit_name="hub_phase_${phase_name}"

    # Check if pipeline was interrupted
    if pipeline_check_sigint 2>/dev/null; then
        log_warn "Skipping $phase_name (pipeline interrupted)"
        return 1
    fi

    # Track current phase for SIGINT handler
    export _PIPELINE_CURRENT_PHASE="$phase_name"

    # Check if phase should be skipped (resume mode + already complete)
    if [ "$resume_mode" = "true" ]; then
        if type hub_checkpoint_is_complete &>/dev/null; then
            if hub_checkpoint_is_complete "$phase_name"; then
                log_info "Skipping $phase_name (already complete - resuming)"
                return 0
            fi
        fi
    fi

    log_step "Phase: $phase_name"
    local phase_start
    phase_start=$(date +%s)

    # Initialize circuit breaker
    if type orch_circuit_breaker_init &>/dev/null; then
        orch_circuit_breaker_init "$circuit_name" "CLOSED"
    fi

    # Execute through circuit breaker
    local phase_result=0
    if type orch_circuit_breaker_execute &>/dev/null; then
        if ! orch_circuit_breaker_execute "$circuit_name" "$phase_function" "$instance_code" "$pipeline_mode"; then
            local exit_code=$?
            if [ $exit_code -eq 2 ]; then
                log_error "Phase $phase_name: Circuit breaker OPEN - fast fail"
                return 2
            fi
            phase_result=1
        fi
    else
        # Fallback: Direct execution
        if ! "$phase_function" "$instance_code" "$pipeline_mode"; then
            phase_result=1
        fi
    fi

    local phase_end
    phase_end=$(date +%s)
    local phase_duration=$((phase_end - phase_start))

    if [ $phase_result -eq 0 ]; then
        log_success "Phase $phase_name completed in ${phase_duration}s"

        # Mark checkpoint
        if type hub_checkpoint_mark_complete &>/dev/null; then
            hub_checkpoint_mark_complete "$phase_name" "$phase_duration"
        fi

        # Record step
        if type orch_db_record_step &>/dev/null; then
            orch_db_record_step "$instance_code" "$phase_name" "COMPLETED" ""
        fi

        return 0
    else
        log_error "Phase $phase_name failed after ${phase_duration}s"

        # Record error
        if type orch_record_error &>/dev/null; then
            orch_record_error "HUB_PHASE_${phase_name}_FAIL" "$ORCH_SEVERITY_CRITICAL" \
                "Phase $phase_name failed" "$phase_name" \
                "Check logs: docker logs dive-hub-*"
        fi

        # Record failed step
        if type orch_db_record_step &>/dev/null; then
            orch_db_record_step "$instance_code" "$phase_name" "FAILED" "Phase execution failed"
        fi

        # Guided error recovery
        if type error_recovery_suggest &>/dev/null; then
            error_recovery_suggest "$phase_name" "hub" "$instance_code"
            local recovery_action=$?
            if [ $recovery_action -eq 0 ]; then
                # Retry: recurse into this function
                log_info "Retrying phase $phase_name..."
                _hub_run_phase_with_circuit_breaker "$instance_code" "$phase_name" "$phase_function" "$pipeline_mode" "$resume_mode"
                return $?
            elif [ $recovery_action -eq 2 ]; then
                # Skip: return success
                log_warn "Skipping phase $phase_name (user chose to skip)"
                return 0
            fi
            # Abort: fall through to return 1
        fi

        return 1
    fi
}

##
# Check failure threshold for hub deployment
##
_hub_check_threshold() {
    local instance_code="$1"
    local phase_name="$2"

    if type orch_check_failure_threshold &>/dev/null; then
        if ! orch_check_failure_threshold "$instance_code"; then
            log_error "Failure threshold exceeded after $phase_name - aborting hub deployment"
            return 1
        fi
    fi

    return 0
}

##
# Check if a phase should be skipped based on DIVE_SKIP_PHASES or DIVE_ONLY_PHASE
#
# Arguments:
#   $1 - Phase name (e.g., VAULT_BOOTSTRAP, SEEDING)
#
# Returns:
#   0 - Phase should be skipped
#   1 - Phase should run
##
_hub_should_skip_phase() {
    local phase_name="$1"

    # --only-phase: if set, skip everything except the specified phase
    if [ -n "${DIVE_ONLY_PHASE:-}" ]; then
        if [ "$phase_name" != "$DIVE_ONLY_PHASE" ]; then
            log_info "Skipping $phase_name (--only-phase ${DIVE_ONLY_PHASE})"
            return 0
        fi
        return 1
    fi

    # --from-phase: skip all phases before the specified phase
    if [ -n "${DIVE_FROM_PHASE:-}" ]; then
        if [ "${_DIVE_FROM_PHASE_REACHED:-false}" = "false" ]; then
            if [ "$phase_name" = "$DIVE_FROM_PHASE" ]; then
                # Reached the target phase — run it and all subsequent
                export _DIVE_FROM_PHASE_REACHED=true
                return 1
            fi
            log_info "Skipping $phase_name (--from-phase ${DIVE_FROM_PHASE})"
            return 0
        fi
        return 1
    fi

    # --skip-phase: check if this phase is in the skip list
    if [ -n "${DIVE_SKIP_PHASES:-}" ]; then
        local skip_phase
        for skip_phase in ${DIVE_SKIP_PHASES}; do
            if [ "$skip_phase" = "$phase_name" ]; then
                log_info "Skipping $phase_name (--skip-phase)"
                return 0
            fi
        done
    fi

    return 1
}

##
# Execute all registered pipeline phases in order.
#
# Handles three execution modes (standard, non_fatal, direct), between-phase
# hooks (state init after DATABASE_INIT, CA trust, health sentinel before
# VAULT_DB_ENGINE), and special-case handling (BUILD direct mode,
# SERVICES progress tracking).
#
# Arguments:
#   $1 - Instance code (e.g., "USA")
#   $2 - Pipeline mode (e.g., "deploy")
#   $3 - Resume mode (true/false)
#   $4 - Name of phase_result variable (nameref)
#   $5 - Name of phase_times array variable (nameref)
##
_hub_execute_registered_phases() {
    local instance_code="$1"
    local pipeline_mode="$2"
    local resume_mode="$3"
    # Use nameref-style: caller passes variable names, we update via eval
    local _result_var="$4"
    local _times_var="$5"

    local _phase_count
    _phase_count=$(pipeline_get_phase_count)

    local _is_dry_run=false
    if pipeline_is_dry_run 2>/dev/null; then
        _is_dry_run=true
        pipeline_dry_run_reset 2>/dev/null || true
        echo ""
        echo "==============================================================================="
        echo "  DRY-RUN: Hub Deployment Plan — ${instance_code}"
        echo "==============================================================================="
    fi

    # Reset --from-phase tracking state
    export _DIVE_FROM_PHASE_REACHED=false

    local i
    for (( i = 0; i < _phase_count; i++ )); do
        local _num="${_PIPELINE_REG_NUMS[$i]}"
        local _name="${_PIPELINE_REG_NAMES[$i]}"
        local _label="${_PIPELINE_REG_LABELS[$i]}"
        local _func="${_PIPELINE_REG_FUNCS[$i]}"
        local _mode="${_PIPELINE_REG_MODES[$i]}"
        local _state="${_PIPELINE_REG_STATES[$i]}"
        local _warn="${_PIPELINE_REG_WARN_MSGS[$i]}"

        # Gate: skip remaining phases if a previous fatal phase failed
        local _current_result
        eval "_current_result=\${$_result_var}"
        if [ "$_current_result" -ne 0 ]; then
            break
        fi

        # Skip check (--skip-phase / --only-phase / --from-phase)
        if _hub_should_skip_phase "$_name"; then
            eval "${_times_var}+=(\"Phase $_num ($_label): skipped\")"
            if [ "$_is_dry_run" = "true" ]; then
                pipeline_dry_run_record_skip "$_label" "phase control flag" 2>/dev/null || true
            fi
            continue
        fi

        # === DRY-RUN MODE ===
        if [ "$_is_dry_run" = "true" ]; then
            # Validation phases execute even in dry-run
            if pipeline_is_validation_phase "$_name" 2>/dev/null; then
                echo ""
                echo "  [DRY-RUN VALIDATION] Phase ${_num}: ${_label} (${_name})"
                echo "    Executing validation checks..."

                local _phase_rc=0
                "$_func" "$instance_code" "$pipeline_mode" || _phase_rc=$?

                if [ $_phase_rc -eq 0 ]; then
                    echo "    Result: PASSED"
                    pipeline_dry_run_record_validation "$_label: passed" 2>/dev/null || true
                else
                    echo "    Result: FAILED"
                    pipeline_dry_run_record_warning "$_label validation failed" 2>/dev/null || true
                    # In dry-run, validation failures are warnings, not fatal
                fi
            else
                # Simulate phase
                pipeline_dry_run_phase "$_num" "$_name" "$_label" "$_func" "$_mode" "$_state" 2>/dev/null || true
                pipeline_dry_run_record_execute "$_label" 2>/dev/null || true
            fi

            eval "${_times_var}+=(\"Phase $_num ($_label): dry-run\")"
            continue
        fi

        # === Between-phase hooks (BEFORE this phase) ===

        # After DATABASE_INIT (Phase 2): set initial state + install CA trust
        if [ "$_name" = "PREFLIGHT" ] && [ "$_current_result" -eq 0 ]; then
            if type deployment_set_state &>/dev/null; then
                deployment_set_state "$instance_code" "INITIALIZING" "" \
                    "{\"mode\":\"$pipeline_mode\",\"resume\":$resume_mode,\"phase\":\"POST_DATABASE_INIT\"}"
            fi
            _hub_install_ca_trust || true
        fi

        # Before VAULT_DB_ENGINE (Phase 8): start health sentinel
        if [ "$_name" = "VAULT_DB_ENGINE" ] && type health_sentinel_start &>/dev/null; then
            health_sentinel_start "hub" "dive-hub" || true
        fi

        # State transition before phase (if specified in registry)
        if [ -n "$_state" ] && type deployment_set_state &>/dev/null; then
            deployment_set_state "$instance_code" "$_state" "" "{\"phase\":\"$_name\"}"
        fi

        # === Phase execution ===
        local _phase_start
        _phase_start=$(date +%s)

        if type progress_set_phase &>/dev/null; then
            progress_set_phase "$_num" "$_label"
        fi

        # Special: SERVICES phase has progress_set_services before execution
        if [ "$_name" = "SERVICES" ] && type progress_set_services &>/dev/null; then
            progress_set_services 0 12
        fi

        local _phase_rc=0
        case "$_mode" in
            direct)
                # Direct execution (no circuit breaker) — used for Docker build
                if ! "$_func" "$instance_code" "$pipeline_mode"; then
                    _phase_rc=1
                    log_error "$_label failed"
                fi
                # Manual checkpoint for direct phases
                if [ $_phase_rc -eq 0 ] && type hub_checkpoint_mark_complete &>/dev/null; then
                    local _phase_end_direct
                    _phase_end_direct=$(date +%s)
                    hub_checkpoint_mark_complete "$_name" "$((_phase_end_direct - _phase_start))"
                fi
                ;;
            non_fatal)
                # Non-fatal: warn on failure, continue pipeline
                _hub_run_phase_with_circuit_breaker "$instance_code" "$_name" "$_func" "$pipeline_mode" "$resume_mode" || {
                    if [ -n "$_warn" ]; then
                        log_warn "$_warn"
                    fi
                }
                ;;
            standard|*)
                # Fatal: failure stops the pipeline
                if ! _hub_run_phase_with_circuit_breaker "$instance_code" "$_name" "$_func" "$pipeline_mode" "$resume_mode"; then
                    _phase_rc=1
                fi
                ;;
        esac

        # Special: SERVICES phase has progress_set_services after execution
        if [ "$_name" = "SERVICES" ] && type progress_set_services &>/dev/null; then
            progress_set_services 12 12
        fi

        local _phase_end
        _phase_end=$(date +%s)
        eval "${_times_var}+=(\"Phase $_num ($_label): $((_phase_end - _phase_start))s\")"

        # For fatal modes (standard + direct), update result and check threshold
        if [ "$_mode" = "standard" ] || [ "$_mode" = "direct" ]; then
            if [ $_phase_rc -ne 0 ]; then
                eval "${_result_var}=1"
            else
                if ! _hub_check_threshold "$instance_code" "$_name"; then
                    eval "${_result_var}=1"
                fi
            fi
        fi
    done

    # Print dry-run summary
    if [ "$_is_dry_run" = "true" ]; then
        pipeline_dry_run_summary "hub" "$instance_code" 2>/dev/null || true
    fi
}

##
# Print performance summary
##
_hub_print_performance_summary() {
    local -a phase_times=("${@:1:$#-1}")
    local duration="${!#}"

    echo ""
    echo "==============================================================================="
    echo "Deployment Performance Summary"
    echo "==============================================================================="
    for timing in "${phase_times[@]}"; do
        echo "  $timing"
    done
    echo "  -------------------------------------------------------------------------------"
    echo "  Total Duration: ${duration}s"

    # Performance analysis
    if [ $duration -lt 180 ]; then
        echo "  Performance: EXCELLENT (< 3 minutes)"
    elif [ $duration -lt 300 ]; then
        echo "  Performance: ACCEPTABLE (3-5 minutes)"
    else
        echo "  Performance: SLOW (> 5 minutes)"
    fi
    echo "==============================================================================="
}

# =============================================================================
# HUB DEPLOYMENT
# =============================================================================

##
# Full hub deployment workflow
# Uses orchestrated pipeline with circuit breakers and checkpoints
#
# Arguments:
#   --resume              Resume from last checkpoint
#   --skip-phase PHASE    Skip specified phase (can be repeated)
#   --only-phase PHASE    Run only the specified phase
##
hub_deploy() {
    local resume_mode=false
    export DIVE_SKIP_PHASES=""
    export DIVE_ONLY_PHASE=""
    export DIVE_FROM_PHASE=""
    export DIVE_FORCE_BUILD="false"
    export DIVE_DRY_RUN="false"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --resume)
                resume_mode=true
                shift
                ;;
            --dry-run)
                DIVE_DRY_RUN="true"
                shift
                ;;
            --force-build)
                DIVE_FORCE_BUILD="true"
                shift
                ;;
            --skip-phase)
                if [ -n "${2:-}" ]; then
                    local phase_upper
                    phase_upper=$(echo "$2" | tr '[:lower:]' '[:upper:]')
                    DIVE_SKIP_PHASES="${DIVE_SKIP_PHASES:+$DIVE_SKIP_PHASES }${phase_upper}"
                    shift 2
                else
                    log_error "--skip-phase requires a phase name"
                    log_info "Valid phases: VAULT_BOOTSTRAP DATABASE_INIT PREFLIGHT INITIALIZATION MONGODB_INIT BUILD SERVICES VAULT_DB_ENGINE KEYCLOAK_CONFIG REALM_VERIFY KAS_REGISTER SEEDING KAS_INIT"
                    return 1
                fi
                ;;
            --only-phase)
                if [ -n "${2:-}" ]; then
                    DIVE_ONLY_PHASE=$(echo "$2" | tr '[:lower:]' '[:upper:]')
                    shift 2
                else
                    log_error "--only-phase requires a phase name"
                    log_info "Valid phases: VAULT_BOOTSTRAP DATABASE_INIT PREFLIGHT INITIALIZATION MONGODB_INIT BUILD SERVICES VAULT_DB_ENGINE KEYCLOAK_CONFIG REALM_VERIFY KAS_REGISTER SEEDING KAS_INIT"
                    return 1
                fi
                ;;
            --from-phase)
                if [ -n "${2:-}" ]; then
                    DIVE_FROM_PHASE=$(echo "$2" | tr '[:lower:]' '[:upper:]')
                    shift 2
                else
                    log_error "--from-phase requires a phase name"
                    log_info "Valid phases: VAULT_BOOTSTRAP DATABASE_INIT PREFLIGHT INITIALIZATION MONGODB_INIT BUILD SERVICES VAULT_DB_ENGINE KEYCLOAK_CONFIG REALM_VERIFY KAS_REGISTER SEEDING KAS_INIT"
                    return 1
                fi
                ;;
            *)
                shift
                ;;
        esac
    done

    # Validate: --skip-phase, --only-phase, --from-phase are mutually exclusive
    local _flag_count=0
    [ -n "$DIVE_SKIP_PHASES" ] && _flag_count=$((_flag_count + 1))
    [ -n "$DIVE_ONLY_PHASE" ] && _flag_count=$((_flag_count + 1))
    [ -n "$DIVE_FROM_PHASE" ] && _flag_count=$((_flag_count + 1))
    if [ $_flag_count -gt 1 ]; then
        log_error "--skip-phase, --only-phase, and --from-phase are mutually exclusive"
        return 1
    fi

    # Log phase control flags
    if [ "$DIVE_DRY_RUN" = "true" ]; then
        log_info "DRY-RUN MODE: simulating hub deployment (no changes will be made)"
    fi
    if [ -n "$DIVE_SKIP_PHASES" ]; then
        log_info "Skipping phases: $DIVE_SKIP_PHASES"
    fi
    if [ -n "$DIVE_ONLY_PHASE" ]; then
        log_info "Running only phase: $DIVE_ONLY_PHASE"
    fi
    if [ -n "$DIVE_FROM_PHASE" ]; then
        log_info "Starting from phase: $DIVE_FROM_PHASE"
    fi

    # Execute orchestrated pipeline
    if ! type hub_pipeline_execute &>/dev/null; then
        log_error "Hub pipeline not available - module not loaded"
        log_error "This is a critical error - cannot deploy without pipeline"
        return 1
    fi

    local mode="deploy"
    if [ "$resume_mode" = "true" ]; then
        mode="resume"
    fi

    hub_pipeline_execute "$mode"
    return $?
}

# =============================================================================
# PHASE STATUS DISPLAY
# =============================================================================

##
# Display the status of all hub pipeline phases
#
# Shows each phase with its status (pending/complete/failed),
# completion timestamp, duration, and which phase would resume next.
##
hub_phases() {
    local show_timing=false
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --timing) show_timing=true; shift ;;
            *) shift ;;
        esac
    done

    echo ""
    echo "==============================================================================="
    echo "  Hub Pipeline Phases"
    echo "==============================================================================="
    echo ""

    # Define ordered phases with display labels
    local -a phase_names=(
        VAULT_BOOTSTRAP DATABASE_INIT PREFLIGHT INITIALIZATION MONGODB_INIT
        BUILD SERVICES VAULT_DB_ENGINE KEYCLOAK_CONFIG REALM_VERIFY
        KAS_REGISTER SEEDING KAS_INIT
    )
    local -a phase_labels=(
        "Vault Bootstrap" "Database Init" "Preflight" "Initialization" "MongoDB"
        "Build" "Services" "Vault DB Engine" "Keycloak" "Realm Verify"
        "KAS Register" "Seeding" "KAS Init"
    )

    local next_phase=""
    if type hub_checkpoint_get_next_phase &>/dev/null; then
        next_phase=$(hub_checkpoint_get_next_phase)
    fi

    local total=${#phase_names[@]}
    local completed=0
    local failed=0
    local total_duration=0

    # Timing header
    if [ "$show_timing" = "true" ]; then
        printf "  %-4s %-18s %-10s %10s %s\n" "#" "Phase" "Status" "Duration" ""
        echo "  ─────────────────────────────────────────────────────────────────────────────"
    fi

    local i
    for (( i = 0; i < total; i++ )); do
        local name="${phase_names[$i]}"
        local label="${phase_labels[$i]}"
        local num=$((i + 1))

        local status="pending"
        local timestamp=""
        local duration=""

        # Check checkpoint status
        if type hub_checkpoint_is_complete &>/dev/null && hub_checkpoint_is_complete "$name"; then
            status="complete"
            completed=$((completed + 1))
            if type hub_checkpoint_get_timestamp &>/dev/null; then
                timestamp=$(hub_checkpoint_get_timestamp "$name")
            fi
            # Read duration from checkpoint file
            local ckpt_file="${HUB_CHECKPOINT_DIR:-${DIVE_ROOT}/.dive-state/hub/.phases}/${name}.done"
            if [ -f "$ckpt_file" ] && type jq &>/dev/null; then
                duration=$(jq -r '.duration_seconds // empty' "$ckpt_file" 2>/dev/null)
            fi
        fi

        # Check orchestration DB for failed status
        if type orch_db_record_step &>/dev/null && type orch_db_get_step_status &>/dev/null; then
            local db_status
            db_status=$(orch_db_get_step_status "USA" "$name" 2>/dev/null || echo "")
            if [ "$db_status" = "FAILED" ] && [ "$status" != "complete" ]; then
                status="failed"
                failed=$((failed + 1))
            fi
        fi

        # Accumulate total duration
        if [ -n "$duration" ] && [ "$duration" != "null" ] && [ "$duration" != "0" ]; then
            total_duration=$((total_duration + duration))
        fi

        # Format output
        local icon=" "
        local color="${NC:-}"
        case "$status" in
            complete)
                icon="+"
                color="${GREEN:-}"
                ;;
            failed)
                icon="x"
                color="${RED:-}"
                ;;
            pending)
                icon="-"
                color="${YELLOW:-}"
                ;;
        esac

        # Mark the resume point
        local resume_marker=""
        if [ -n "$next_phase" ] && [ "$name" = "$next_phase" ]; then
            resume_marker=" <-- resume point"
        fi

        if [ "$show_timing" = "true" ]; then
            # Timing-focused format
            local dur_str="-"
            if [ -n "$duration" ] && [ "$duration" != "null" ] && [ "$duration" != "0" ]; then
                dur_str="${duration}s"
            fi
            printf "  %s[%s]%s %2d %-18s %-10s %10s" \
                "$color" "$icon" "${NC:-}" "$num" "$label" "($status)" "$dur_str"
        else
            # Standard format
            printf "  %s[%s]%s Phase %2d: %-18s %-10s" \
                "$color" "$icon" "${NC:-}" "$num" "$label" "($status)"

            if [ -n "$duration" ] && [ "$duration" != "null" ] && [ "$duration" != "0" ]; then
                printf " %ss" "$duration"
            fi

            if [ -n "$timestamp" ] && [ "$timestamp" != "null" ]; then
                printf " @ %s" "$timestamp"
            fi
        fi

        if [ -n "$resume_marker" ]; then
            printf "%s%s%s" "${CYAN:-}" "$resume_marker" "${NC:-}"
        fi

        echo ""
    done

    echo ""
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    echo "  Summary: $completed/$total complete, $failed failed"

    if [ "$show_timing" = "true" ] && [ "$total_duration" -gt 0 ]; then
        echo "  Total duration: ${total_duration}s"
    fi

    if [ -n "$next_phase" ]; then
        echo "  Resume:  ./dive hub deploy --resume  (starts at $next_phase)"
    elif [ "$completed" -eq "$total" ]; then
        echo "  Status:  All phases complete"
    fi

    echo "==============================================================================="
    echo ""
}

# =============================================================================
# LIFECYCLE OPERATIONS (preflight, init, up, down, startup helpers)
# =============================================================================
source "$(dirname "${BASH_SOURCE[0]}")/hub-lifecycle.sh"
