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
    local start_time=$(date +%s)

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

    # Acquire deployment lock
    local lock_acquired=false
    if type deployment_acquire_lock &>/dev/null; then
        if ! deployment_acquire_lock "$instance_code"; then
            log_error "Cannot start hub deployment - lock acquisition failed"
            log_error "Another deployment may be in progress"
            return 1
        fi
        lock_acquired=true
    fi

    # Execute pipeline with guaranteed lock cleanup
    local pipeline_result=0
    _hub_pipeline_execute_internal "$instance_code" "$pipeline_mode" "$start_time" "$resume_mode" || pipeline_result=$?

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
        [ -f "$_summary" ] && source "$_summary"
    fi
    if type deployment_pre_summary_hub &>/dev/null; then
        if ! deployment_pre_summary_hub; then
            return 1
        fi
    fi

    # =========================================================================
    # Phase 1: Vault Bootstrap (start, init, setup, seed)
    # =========================================================================
    # Pre-validation gate (Docker, tools, disk, ports) runs before this point.
    # Vault MUST be first infra phase — all other phases depend on secrets from Vault.
    if _hub_should_skip_phase "VAULT_BOOTSTRAP"; then
        phase_times+=("Phase 1 (Vault Bootstrap): skipped")
    else
        local phase_start=$(date +%s)
        if type progress_set_phase &>/dev/null; then
            progress_set_phase 1 "Vault bootstrap"
        fi

        if ! _hub_run_phase_with_circuit_breaker "$instance_code" "VAULT_BOOTSTRAP" "hub_phase_vault_bootstrap" "$pipeline_mode" "$resume_mode"; then
            phase_result=1
        fi

        local phase_end=$(date +%s)
        phase_times+=("Phase 1 (Vault Bootstrap): $((phase_end - phase_start))s")

        if [ $phase_result -eq 0 ]; then
            if ! _hub_check_threshold "$instance_code" "VAULT_BOOTSTRAP"; then
                phase_result=1
            fi
        fi
    fi

    # =========================================================================
    # Phase 2: Database Infrastructure (PostgreSQL + orchestration DB)
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        if _hub_should_skip_phase "DATABASE_INIT"; then
            phase_times+=("Phase 2 (Database Init): skipped")
        else
            phase_start=$(date +%s)
            if type progress_set_phase &>/dev/null; then
                progress_set_phase 2 "Database infrastructure"
            fi

            if ! _hub_run_phase_with_circuit_breaker "$instance_code" "DATABASE_INIT" "hub_phase_database_init" "$pipeline_mode" "$resume_mode"; then
                phase_result=1
            fi

            phase_end=$(date +%s)
            phase_times+=("Phase 2 (Database Init): $((phase_end - phase_start))s")

            if [ $phase_result -eq 0 ]; then
                if ! _hub_check_threshold "$instance_code" "DATABASE_INIT"; then
                    phase_result=1
                fi
            fi
        fi
    fi

    # =========================================================================
    # Set Initial State (AFTER Phase 2 - database now exists!)
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        if type deployment_set_state &>/dev/null; then
            deployment_set_state "$instance_code" "INITIALIZING" "" \
                "{\"mode\":\"$pipeline_mode\",\"resume\":$resume_mode,\"phase\":\"POST_DATABASE_INIT\"}"
        fi
    fi

    # =========================================================================
    # CA Trust: Install Vault Root CA into host system trust store
    # =========================================================================
    # Runs after Phase 2 (certs + CA bundle exist). Non-blocking — warns on failure.
    # Spokes use the same Hub Root CA, so this covers all instances.
    if [ $phase_result -eq 0 ]; then
        _hub_install_ca_trust || true
    fi

    # =========================================================================
    # Phase 3: Preflight (infrastructure-dependent checks)
    # =========================================================================
    # Basic checks (Docker, tools, disk, ports) handled by pre-validation gate.
    # This phase runs Vault/cert-dependent validation that requires infra up.
    if [ $phase_result -eq 0 ]; then
        if _hub_should_skip_phase "PREFLIGHT"; then
            phase_times+=("Phase 3 (Preflight): skipped")
        else
            phase_start=$(date +%s)
            if type progress_set_phase &>/dev/null; then
                progress_set_phase 3 "Preflight checks"
            fi

            if ! _hub_run_phase_with_circuit_breaker "$instance_code" "PREFLIGHT" "hub_phase_preflight" "$pipeline_mode" "$resume_mode"; then
                phase_result=1
            fi

            phase_end=$(date +%s)
            phase_times+=("Phase 3 (Preflight): $((phase_end - phase_start))s")

            if [ $phase_result -eq 0 ]; then
                if ! _hub_check_threshold "$instance_code" "PREFLIGHT"; then
                    phase_result=1
                fi
            fi
        fi
    fi

    # =========================================================================
    # Phase 4: Initialization
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        if _hub_should_skip_phase "INITIALIZATION"; then
            phase_times+=("Phase 4 (Initialization): skipped")
        else
            phase_start=$(date +%s)
            if type progress_set_phase &>/dev/null; then
                progress_set_phase 4 "Initialization"
            fi

            if ! _hub_run_phase_with_circuit_breaker "$instance_code" "INITIALIZATION" "hub_phase_initialization" "$pipeline_mode" "$resume_mode"; then
                phase_result=1
            fi

            phase_end=$(date +%s)
            phase_times+=("Phase 4 (Initialization): $((phase_end - phase_start))s")

            if [ $phase_result -eq 0 ]; then
                if ! _hub_check_threshold "$instance_code" "INITIALIZATION"; then
                    phase_result=1
                fi
            fi
        fi
    fi

    # =========================================================================
    # Phase 5: MongoDB Replica Set
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        if _hub_should_skip_phase "MONGODB_INIT"; then
            phase_times+=("Phase 5 (MongoDB): skipped")
        else
            phase_start=$(date +%s)
            if type progress_set_phase &>/dev/null; then
                progress_set_phase 5 "MongoDB replica set"
            fi

            if ! _hub_run_phase_with_circuit_breaker "$instance_code" "MONGODB_INIT" "hub_phase_mongodb_init" "$pipeline_mode" "$resume_mode"; then
                phase_result=1
            fi

            phase_end=$(date +%s)
            phase_times+=("Phase 5 (MongoDB): $((phase_end - phase_start))s")

            if [ $phase_result -eq 0 ]; then
                if ! _hub_check_threshold "$instance_code" "MONGODB_INIT"; then
                    phase_result=1
                fi
            fi
        fi
    fi

    # =========================================================================
    # Phase 6: Docker Image Build (Separation of Concerns)
    # =========================================================================
    # ARCHITECTURE: Heavyweight I/O operations should NOT be wrapped in
    # circuit breakers that capture output. Docker builds stream gigabytes
    # of layer data that must go directly to stdout/logs, not Bash variables.
    if [ $phase_result -eq 0 ]; then
        if _hub_should_skip_phase "BUILD"; then
            phase_times+=("Phase 6 (Build): skipped")
        else
            phase_start=$(date +%s)
            if type progress_set_phase &>/dev/null; then
                progress_set_phase 6 "Building Docker images"
            fi

            # NOTE: State remains INITIALIZING during build
            # State will transition to DEPLOYING at Phase 7 (Services)

            # Build phase uses direct execution (no circuit breaker output capture)
            if ! hub_phase_build "$instance_code" "$pipeline_mode"; then
                phase_result=1
                log_error "Docker image build failed"
            fi

            phase_end=$(date +%s)
            phase_times+=("Phase 6 (Build): $((phase_end - phase_start))s")

            # Mark checkpoint manually (build phase doesn't use circuit breaker)
            if [ $phase_result -eq 0 ] && type hub_checkpoint_mark_complete &>/dev/null; then
                hub_checkpoint_mark_complete "BUILD" "$((phase_end - phase_start))"
            fi

            if [ $phase_result -eq 0 ]; then
                if ! _hub_check_threshold "$instance_code" "BUILD"; then
                    phase_result=1
                fi
            fi
        fi
    fi

    # =========================================================================
    # Phase 7: Services
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        if _hub_should_skip_phase "SERVICES"; then
            phase_times+=("Phase 7 (Services): skipped")
        else
            phase_start=$(date +%s)
            if type progress_set_phase &>/dev/null; then
                progress_set_phase 7 "Starting services"
                progress_set_services 0 12
            fi

            # State transition: INITIALIZING → DEPLOYING
            # (Infrastructure ready, now deploying services)
            if type deployment_set_state &>/dev/null; then
                deployment_set_state "$instance_code" "DEPLOYING" "" "{\"phase\":\"SERVICES\"}"
            fi

            if ! _hub_run_phase_with_circuit_breaker "$instance_code" "SERVICES" "hub_phase_services" "$pipeline_mode" "$resume_mode"; then
                phase_result=1
            fi

            if type progress_set_services &>/dev/null; then
                progress_set_services 12 12
            fi

            phase_end=$(date +%s)
            phase_times+=("Phase 7 (Services): $((phase_end - phase_start))s")

            if [ $phase_result -eq 0 ]; then
                if ! _hub_check_threshold "$instance_code" "SERVICES"; then
                    phase_result=1
                fi
            fi
        fi
    fi

    # =========================================================================
    # Health Sentinel: Start monitoring during configuration phases (8-13)
    # =========================================================================
    if [ $phase_result -eq 0 ] && type health_sentinel_start &>/dev/null; then
        health_sentinel_start "hub" "dive-hub" || true
    fi

    # =========================================================================
    # Phase 8: Vault Database Engine (dynamic credentials)
    # =========================================================================
    # Non-fatal: if this fails, backend falls back to static credentials
    if [ $phase_result -eq 0 ]; then
        if _hub_should_skip_phase "VAULT_DB_ENGINE"; then
            phase_times+=("Phase 8 (Vault DB Engine): skipped")
        else
            phase_start=$(date +%s)
            if type progress_set_phase &>/dev/null; then
                progress_set_phase 8 "Vault database engine"
            fi

            _hub_run_phase_with_circuit_breaker "$instance_code" "VAULT_DB_ENGINE" "hub_phase_vault_db_engine" "$pipeline_mode" "$resume_mode" || \
                log_warn "Vault database engine setup failed — backend will use static credentials"

            phase_end=$(date +%s)
            phase_times+=("Phase 8 (Vault DB Engine): $((phase_end - phase_start))s")
        fi
    fi

    # =========================================================================
    # Phase 9: Keycloak Configuration
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        if _hub_should_skip_phase "KEYCLOAK_CONFIG"; then
            phase_times+=("Phase 9 (Keycloak): skipped")
        else
            phase_start=$(date +%s)
            if type progress_set_phase &>/dev/null; then
                progress_set_phase 9 "Keycloak configuration"
            fi

            # State transition: DEPLOYING → CONFIGURING
            # (Services deployed, now configuring Keycloak realm)
            if type deployment_set_state &>/dev/null; then
                deployment_set_state "$instance_code" "CONFIGURING" "" "{\"phase\":\"KEYCLOAK_CONFIG\"}"
            fi

            if ! _hub_run_phase_with_circuit_breaker "$instance_code" "KEYCLOAK_CONFIG" "hub_phase_keycloak_config" "$pipeline_mode" "$resume_mode"; then
                phase_result=1
            fi

            phase_end=$(date +%s)
            phase_times+=("Phase 9 (Keycloak): $((phase_end - phase_start))s")

            if [ $phase_result -eq 0 ]; then
                if ! _hub_check_threshold "$instance_code" "KEYCLOAK_CONFIG"; then
                    phase_result=1
                fi
            fi
        fi
    fi

    # =========================================================================
    # Phase 10: Realm Verification
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        if _hub_should_skip_phase "REALM_VERIFY"; then
            phase_times+=("Phase 10 (Realm Verify): skipped")
        else
            phase_start=$(date +%s)

            # State transition: CONFIGURING → VERIFYING
            # (Keycloak realm configuration complete, now verifying it works)
            if type deployment_set_state &>/dev/null; then
                deployment_set_state "$instance_code" "VERIFYING" "" "{\"phase\":\"REALM_VERIFY\"}"
            fi

            if ! _hub_run_phase_with_circuit_breaker "$instance_code" "REALM_VERIFY" "hub_phase_realm_verify" "$pipeline_mode" "$resume_mode"; then
                phase_result=1
            fi

            phase_end=$(date +%s)
            phase_times+=("Phase 10 (Realm Verify): $((phase_end - phase_start))s")

            if [ $phase_result -eq 0 ]; then
                if ! _hub_check_threshold "$instance_code" "REALM_VERIFY"; then
                    phase_result=1
                fi
            fi
        fi
    fi

    # =========================================================================
    # Phase 11: KAS Registration
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        if _hub_should_skip_phase "KAS_REGISTER"; then
            phase_times+=("Phase 11 (KAS Register): skipped")
        else
            phase_start=$(date +%s)

            # KAS registration is non-fatal
            _hub_run_phase_with_circuit_breaker "$instance_code" "KAS_REGISTER" "hub_phase_kas_register" "$pipeline_mode" "$resume_mode" || \
                log_warn "Hub KAS registration failed - KAS decryption may not work"

            phase_end=$(date +%s)
            phase_times+=("Phase 11 (KAS Register): $((phase_end - phase_start))s")
        fi
    fi

    # =========================================================================
    # Phase 12: Seeding
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        if _hub_should_skip_phase "SEEDING"; then
            phase_times+=("Phase 12 (Seeding): skipped")
        else
            phase_start=$(date +%s)
            if type progress_set_phase &>/dev/null; then
                progress_set_phase 12 "Database seeding"
            fi

            # Seeding is non-fatal
            _hub_run_phase_with_circuit_breaker "$instance_code" "SEEDING" "hub_phase_seeding" "$pipeline_mode" "$resume_mode" || \
                log_warn "Database seeding failed - can be done manually: ./dive hub seed"

            phase_end=$(date +%s)
            phase_times+=("Phase 12 (Seeding): $((phase_end - phase_start))s")
        fi
    fi

    # =========================================================================
    # Phase 13: KAS Initialization
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        if _hub_should_skip_phase "KAS_INIT"; then
            phase_times+=("Phase 13 (KAS Init): skipped")
        else
            phase_start=$(date +%s)
            if type progress_set_phase &>/dev/null; then
                progress_set_phase 13 "KAS initialization"
            fi

            # KAS init is non-fatal
            _hub_run_phase_with_circuit_breaker "$instance_code" "KAS_INIT" "hub_phase_kas_init" "$pipeline_mode" "$resume_mode" || \
                log_warn "KAS initialization had issues"

            phase_end=$(date +%s)
            phase_times+=("Phase 13 (KAS Init): $((phase_end - phase_start))s")
        fi
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
    local end_time=$(date +%s)
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
    local phase_start=$(date +%s)

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

    local phase_end=$(date +%s)
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
    export DIVE_FORCE_BUILD="false"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --resume)
                resume_mode=true
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
            *)
                shift
                ;;
        esac
    done

    # Validate: --skip-phase and --only-phase are mutually exclusive
    if [ -n "$DIVE_SKIP_PHASES" ] && [ -n "$DIVE_ONLY_PHASE" ]; then
        log_error "--skip-phase and --only-phase are mutually exclusive"
        return 1
    fi

    # Log phase control flags
    if [ -n "$DIVE_SKIP_PHASES" ]; then
        log_info "Skipping phases: $DIVE_SKIP_PHASES"
    fi
    if [ -n "$DIVE_ONLY_PHASE" ]; then
        log_info "Running only phase: $DIVE_ONLY_PHASE"
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
# LIFECYCLE OPERATIONS (preflight, init, up, down, startup helpers)
# =============================================================================
source "$(dirname "${BASH_SOURCE[0]}")/hub-lifecycle.sh"
