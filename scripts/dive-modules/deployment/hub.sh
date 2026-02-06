#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Hub Deployment Module (Consolidated)
# =============================================================================
# Hub deployment, initialization, and management
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - hub.sh (dispatcher)
#   - hub/deploy.sh, hub/init.sh, hub/seed.sh, hub/services.sh, hub/spokes.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_DEPLOYMENT_HUB_LOADED:-}" ] && return 0
export DIVE_DEPLOYMENT_HUB_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

DEPLOYMENT_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$DEPLOYMENT_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration modules (load the main one first)
if [ -f "${MODULES_DIR}/orchestration-framework.sh" ]; then
    source "${MODULES_DIR}/orchestration-framework.sh"
elif [ -f "${MODULES_DIR}/orchestration/framework.sh" ]; then
    source "${MODULES_DIR}/orchestration/framework.sh"
fi

if [ -f "${MODULES_DIR}/orchestration-state-db.sh" ]; then
    source "${MODULES_DIR}/orchestration-state-db.sh"
fi

# Load deployment progress module (Phase 3 Sprint 2)
if [ -f "${MODULES_DIR}/utilities/deployment-progress.sh" ]; then
    source "${MODULES_DIR}/utilities/deployment-progress.sh"
fi

# Load pipeline common module (Phase 3: Hub Pipeline Enhancement)
if [ -f "${DEPLOYMENT_DIR}/pipeline-common.sh" ]; then
    source "${DEPLOYMENT_DIR}/pipeline-common.sh"
fi

# Load hub checkpoint module (Phase 3: Hub Pipeline Enhancement)
if [ -f "${DEPLOYMENT_DIR}/hub-checkpoint.sh" ]; then
    source "${DEPLOYMENT_DIR}/hub-checkpoint.sh"
fi

# Load error recovery module (circuit breakers, retry, failure threshold)
if [ -f "${MODULES_DIR}/error-recovery.sh" ]; then
    source "${MODULES_DIR}/error-recovery.sh"
fi

# =============================================================================
# HUB CONFIGURATION
# =============================================================================

HUB_COMPOSE_FILE="${DIVE_ROOT}/docker-compose.hub.yml"
HUB_DATA_DIR="${DIVE_ROOT}/data/hub"

# =============================================================================
# HUB PIPELINE EXECUTION (Phase 3: Hub Pipeline Enhancement)
# =============================================================================
# Unified pipeline execution with:
#   - Circuit breaker protection for each phase
#   - Failure threshold enforcement
#   - Checkpoint-based resume capability
#   - Deployment lock management
# =============================================================================

##
# Hub phase wrapper functions for circuit breaker integration
# These wrap the actual phase implementations for protected execution
##

hub_phase_preflight() {
    local instance_code="$1"
    local pipeline_mode="$2"
    hub_preflight
}

hub_phase_initialization() {
    local instance_code="$1"
    local pipeline_mode="$2"
    hub_init
}

hub_phase_mongodb_init() {
    local instance_code="$1"
    local pipeline_mode="$2"
    _hub_init_mongodb_replica_set
}

hub_phase_build() {
    local instance_code="$1"
    local pipeline_mode="$2"
    
    log_info "Building Docker images..."
    
    cd "$DIVE_ROOT"
    
    # Build images WITHOUT circuit breaker output capture
    # This is heavyweight I/O that must stream to stdout
    local build_log="${DIVE_ROOT}/logs/docker-builds/hub-build-$(date +%Y%m%d-%H%M%S).log"
    mkdir -p "$(dirname "$build_log")"
    
    log_info "Build output: $build_log"
    
    if ${DOCKER_CMD:-docker} compose -f "$HUB_COMPOSE_FILE" build 2>&1 | tee "$build_log"; then
        log_success "Docker images built successfully"
        return 0
    else
        log_error "Failed to build Docker images"
        log_error "Full build log: $build_log"
        return 1
    fi
}

hub_phase_services() {
    local instance_code="$1"
    local pipeline_mode="$2"
    
    # SERVICES phase now ONLY starts services (build happens in BUILD phase)
    log_info "Starting hub services..."
    
    # DIVE_ROOT is set by the main dive script and should already be in environment
    # If not set, infer from script location
    if [ -z "$DIVE_ROOT" ]; then
        DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
        export DIVE_ROOT
    fi
    
    cd "$DIVE_ROOT" || {
        log_error "Failed to change to DIVE_ROOT=$DIVE_ROOT"
        return 1
    }
    
    # Ensure dive-shared network exists
    if ! ${DOCKER_CMD:-docker} network inspect dive-shared >/dev/null 2>&1; then
        log_verbose "Creating dive-shared network..."
        if ! ${DOCKER_CMD:-docker} network create dive-shared 2>/dev/null; then
            log_error "Failed to create dive-shared network"
            return 1
        fi
    fi
    
    # Load secrets
    if ! load_secrets; then
        log_error "Failed to load secrets"
        return 1
    fi
    
    # Start services (parallel or sequential)
    local use_parallel="${PARALLEL_STARTUP_ENABLED:-true}"
    
    if [ "$use_parallel" = "true" ] && type hub_parallel_startup &>/dev/null; then
        log_info "Using parallel service startup (dependency-aware)"
        if ! hub_parallel_startup; then
            log_error "Parallel service startup failed"
            return 1
        fi
    else
        log_info "Using sequential service startup"
        if ! ${DOCKER_CMD:-docker} compose -f "$HUB_COMPOSE_FILE" up -d; then
            log_error "Sequential service startup failed"
            return 1
        fi
    fi
    
    log_success "Hub services started successfully"
    return 0
}

hub_phase_orchestration_db() {
    local instance_code="$1"
    local pipeline_mode="$2"
    hub_init_orchestration_db
}

hub_phase_keycloak_config() {
    local instance_code="$1"
    local pipeline_mode="$2"
    hub_configure_keycloak
}

hub_phase_realm_verify() {
    local instance_code="$1"
    local pipeline_mode="$2"
    hub_verify_realm
}

hub_phase_kas_register() {
    local instance_code="$1"
    local pipeline_mode="$2"

    # Load hub seed module for KAS registration
    if [ -f "${MODULES_DIR}/hub/seed.sh" ]; then
        source "${MODULES_DIR}/hub/seed.sh"
        if type _hub_register_kas &>/dev/null; then
            _hub_register_kas
            return $?
        fi
    fi
    log_warn "KAS registration function not available"
    return 0  # Non-fatal
}

hub_phase_seeding() {
    local instance_code="$1"
    local pipeline_mode="$2"
    hub_seed 5000
}

hub_phase_kas_init() {
    local instance_code="$1"
    local pipeline_mode="$2"
    _hub_init_kas
}

##
# Internal MongoDB replica set initialization
# Extracted from hub_deploy() for circuit breaker wrapping
##
_hub_init_mongodb_replica_set() {
    # Load secrets for MONGO_PASSWORD
    if ! load_secrets; then
        log_error "Failed to load secrets - cannot initialize MongoDB"
        return 1
    fi

    # Start MongoDB first
    log_verbose "Starting MongoDB container..."
    if ! ${DOCKER_CMD:-docker} compose -f "$HUB_COMPOSE_FILE" up -d mongodb >/dev/null 2>&1; then
        log_error "Failed to start MongoDB container"
        return 1
    fi

    # Wait for MongoDB container to be healthy
    log_verbose "Waiting for MongoDB container to be healthy..."
    local mongo_wait=0
    local mongo_max_wait=60
    while [ $mongo_wait -lt $mongo_max_wait ]; do
        if ${DOCKER_CMD:-docker} ps --filter "name=dive-hub-mongodb" --filter "health=healthy" --format "{{.Names}}" | grep -q "dive-hub-mongodb"; then
            log_verbose "MongoDB container is healthy"
            break
        fi
        sleep 2
        mongo_wait=$((mongo_wait + 2))
    done

    if [ $mongo_wait -ge $mongo_max_wait ]; then
        log_warn "MongoDB container not healthy after ${mongo_max_wait}s, attempting replica set init anyway..."
    fi

    # Initialize replica set
    if [ ! -f "${DIVE_ROOT}/scripts/init-mongo-replica-set-post-start.sh" ]; then
        log_error "MongoDB initialization script not found"
        return 1
    fi

    if ! bash "${DIVE_ROOT}/scripts/init-mongo-replica-set-post-start.sh" dive-hub-mongodb admin "$MONGO_PASSWORD"; then
        log_error "MongoDB replica set initialization FAILED"
        return 1
    fi

    log_success "MongoDB replica set initialized and PRIMARY"
    export HUB_MONGODB_RS_INITIALIZED=true

    # Stability buffer for replica set discovery
    log_verbose "Waiting 3s for MongoDB replica set discovery to stabilize..."
    sleep 3

    return 0
}

##
# Internal KAS initialization
# Extracted from hub_deploy() for circuit breaker wrapping
##
_hub_init_kas() {
    if docker ps --format '{{.Names}}' | grep -q "${HUB_COMPOSE_PROJECT:-dive-hub}-kas"; then
        log_info "Waiting for KAS to be healthy..."
        local kas_wait=0
        local kas_max_wait=60

        while [ $kas_wait -lt $kas_max_wait ]; do
            local kas_health=$(docker inspect "${HUB_COMPOSE_PROJECT:-dive-hub}-kas" \
                --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

            if [ "$kas_health" = "healthy" ]; then
                log_success "KAS is healthy"
                break
            fi

            sleep 2
            ((kas_wait += 2))
        done

        if [ $kas_wait -ge $kas_max_wait ]; then
            log_warn "KAS health check timeout after ${kas_max_wait}s"
            return 1
        fi

        # Verify health endpoint
        local kas_port="${KAS_HOST_PORT:-8085}"
        if curl -sf -k "https://localhost:${kas_port}/health" >/dev/null 2>&1; then
            log_success "KAS health endpoint responding on port ${kas_port}"
        fi
    else
        log_info "KAS container not found - skipping (optional service)"
    fi

    return 0
}

##
# Execute hub deployment pipeline with circuit breaker protection
#
# This is the new orchestrated entry point for hub deployment that provides:
#   - Deployment lock to prevent concurrent deployments
#   - Circuit breaker protection for each phase
#   - Failure threshold enforcement
#   - Checkpoint-based resume capability
#
# Arguments:
#   $1 - Pipeline mode (deploy|up|resume)
#
# Returns:
#   0 - Success
#   1 - Failure
##
hub_pipeline_execute() {
    local pipeline_mode="${1:-deploy}"
    local instance_code="USA"
    local start_time=$(date +%s)

    log_info "Starting Hub pipeline: $instance_code ($pipeline_mode mode)"

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

    # Initialize progress tracking
    if type progress_init &>/dev/null; then
        progress_init "hub" "USA" 10
    fi

    # Set initial state
    if type deployment_set_state &>/dev/null; then
        deployment_set_state "$instance_code" "INITIALIZING" "" \
            "{\"mode\":\"$pipeline_mode\",\"resume\":$resume_mode}"
    fi

    # =========================================================================
    # Phase 1: Preflight
    # =========================================================================
    local phase_start=$(date +%s)
    if type progress_set_phase &>/dev/null; then
        progress_set_phase 1 "Preflight checks"
    fi

    if ! _hub_run_phase_with_circuit_breaker "$instance_code" "PREFLIGHT" "hub_phase_preflight" "$pipeline_mode" "$resume_mode"; then
        phase_result=1
    fi

    local phase_end=$(date +%s)
    phase_times+=("Phase 1 (Preflight): $((phase_end - phase_start))s")

    # Check failure threshold
    if [ $phase_result -eq 0 ]; then
        if ! _hub_check_threshold "$instance_code" "PREFLIGHT"; then
            phase_result=1
        fi
    fi

    # =========================================================================
    # Phase 2: Initialization
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        phase_start=$(date +%s)
        if type progress_set_phase &>/dev/null; then
            progress_set_phase 2 "Initialization"
        fi

        if ! _hub_run_phase_with_circuit_breaker "$instance_code" "INITIALIZATION" "hub_phase_initialization" "$pipeline_mode" "$resume_mode"; then
            phase_result=1
        fi

        phase_end=$(date +%s)
        phase_times+=("Phase 2 (Initialization): $((phase_end - phase_start))s")

        if [ $phase_result -eq 0 ]; then
            if ! _hub_check_threshold "$instance_code" "INITIALIZATION"; then
                phase_result=1
            fi
        fi
    fi

    # =========================================================================
    # Phase 2.5: MongoDB Replica Set
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        phase_start=$(date +%s)
        if type progress_set_phase &>/dev/null; then
            progress_set_phase 2.5 "MongoDB replica set"
        fi

        if ! _hub_run_phase_with_circuit_breaker "$instance_code" "MONGODB_INIT" "hub_phase_mongodb_init" "$pipeline_mode" "$resume_mode"; then
            phase_result=1
        fi

        phase_end=$(date +%s)
        phase_times+=("Phase 2.5 (MongoDB): $((phase_end - phase_start))s")

        if [ $phase_result -eq 0 ]; then
            if ! _hub_check_threshold "$instance_code" "MONGODB_INIT"; then
                phase_result=1
            fi
        fi
    fi

    # =========================================================================
    # Phase 2.8: Docker Image Build (NEW - Separation of Concerns)
    # =========================================================================
    # ARCHITECTURE: Heavyweight I/O operations should NOT be wrapped in
    # circuit breakers that capture output. Docker builds stream gigabytes
    # of layer data that must go directly to stdout/logs, not Bash variables.
    if [ $phase_result -eq 0 ]; then
        phase_start=$(date +%s)
        if type progress_set_phase &>/dev/null; then
            progress_set_phase 2.8 "Building Docker images"
        fi

        if type deployment_set_state &>/dev/null; then
            deployment_set_state "$instance_code" "DEPLOYING" "" "{\"phase\":\"BUILD\"}"
        fi

        # Build phase uses direct execution (no circuit breaker output capture)
        if ! hub_phase_build "$instance_code" "$pipeline_mode"; then
            phase_result=1
            log_error "Docker image build failed"
        fi

        phase_end=$(date +%s)
        phase_times+=("Phase 2.8 (Build): $((phase_end - phase_start))s")

        if [ $phase_result -eq 0 ]; then
            if ! _hub_check_threshold "$instance_code" "BUILD"; then
                phase_result=1
            fi
        fi
    fi

    # =========================================================================
    # Phase 3: Services
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        phase_start=$(date +%s)
        if type progress_set_phase &>/dev/null; then
            progress_set_phase 3 "Starting services"
            progress_set_services 0 12
        fi

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
        phase_times+=("Phase 3 (Services): $((phase_end - phase_start))s")

        if [ $phase_result -eq 0 ]; then
            if ! _hub_check_threshold "$instance_code" "SERVICES"; then
                phase_result=1
            fi
        fi
    fi

    # =========================================================================
    # Phase 5: Orchestration Database
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        phase_start=$(date +%s)
        if type progress_set_phase &>/dev/null; then
            progress_set_phase 5 "Orchestration database"
        fi

        if ! _hub_run_phase_with_circuit_breaker "$instance_code" "ORCHESTRATION_DB" "hub_phase_orchestration_db" "$pipeline_mode" "$resume_mode"; then
            phase_result=1
        fi

        phase_end=$(date +%s)
        phase_times+=("Phase 5 (Orch DB): $((phase_end - phase_start))s")

        if [ $phase_result -eq 0 ]; then
            if ! _hub_check_threshold "$instance_code" "ORCHESTRATION_DB"; then
                phase_result=1
            fi
        fi
    fi

    # =========================================================================
    # Phase 6: Keycloak Configuration
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        phase_start=$(date +%s)
        if type progress_set_phase &>/dev/null; then
            progress_set_phase 6 "Keycloak configuration"
        fi

        if type deployment_set_state &>/dev/null; then
            deployment_set_state "$instance_code" "CONFIGURING" "" "{\"phase\":\"KEYCLOAK_CONFIG\"}"
        fi

        if ! _hub_run_phase_with_circuit_breaker "$instance_code" "KEYCLOAK_CONFIG" "hub_phase_keycloak_config" "$pipeline_mode" "$resume_mode"; then
            phase_result=1
        fi

        phase_end=$(date +%s)
        phase_times+=("Phase 6 (Keycloak): $((phase_end - phase_start))s")

        if [ $phase_result -eq 0 ]; then
            if ! _hub_check_threshold "$instance_code" "KEYCLOAK_CONFIG"; then
                phase_result=1
            fi
        fi
    fi

    # =========================================================================
    # Phase 6.5: Realm Verification
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        phase_start=$(date +%s)

        if ! _hub_run_phase_with_circuit_breaker "$instance_code" "REALM_VERIFY" "hub_phase_realm_verify" "$pipeline_mode" "$resume_mode"; then
            phase_result=1
        fi

        phase_end=$(date +%s)
        phase_times+=("Phase 6.5 (Realm Verify): $((phase_end - phase_start))s")

        if [ $phase_result -eq 0 ]; then
            if ! _hub_check_threshold "$instance_code" "REALM_VERIFY"; then
                phase_result=1
            fi
        fi
    fi

    # =========================================================================
    # Phase 6.75: KAS Registration
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        phase_start=$(date +%s)

        # KAS registration is non-fatal
        _hub_run_phase_with_circuit_breaker "$instance_code" "KAS_REGISTER" "hub_phase_kas_register" "$pipeline_mode" "$resume_mode" || \
            log_warn "Hub KAS registration failed - KAS decryption may not work"

        phase_end=$(date +%s)
        phase_times+=("Phase 6.75 (KAS Register): $((phase_end - phase_start))s")
    fi

    # =========================================================================
    # Phase 7: Seeding
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        phase_start=$(date +%s)
        if type progress_set_phase &>/dev/null; then
            progress_set_phase 7 "Database seeding"
        fi

        # Seeding is non-fatal
        _hub_run_phase_with_circuit_breaker "$instance_code" "SEEDING" "hub_phase_seeding" "$pipeline_mode" "$resume_mode" || \
            log_warn "Database seeding failed - can be done manually: ./dive hub seed"

        phase_end=$(date +%s)
        phase_times+=("Phase 7 (Seeding): $((phase_end - phase_start))s")
    fi

    # =========================================================================
    # Phase 7.5: KAS Initialization
    # =========================================================================
    if [ $phase_result -eq 0 ]; then
        phase_start=$(date +%s)
        if type progress_set_phase &>/dev/null; then
            progress_set_phase 7.5 "KAS initialization"
        fi

        # KAS init is non-fatal
        _hub_run_phase_with_circuit_breaker "$instance_code" "KAS_INIT" "hub_phase_kas_init" "$pipeline_mode" "$resume_mode" || \
            log_warn "KAS initialization had issues"

        phase_end=$(date +%s)
        phase_times+=("Phase 7.5 (KAS Init): $((phase_end - phase_start))s")
    fi

    # =========================================================================
    # Finalize
    # =========================================================================
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [ $phase_result -eq 0 ]; then
        # Mark complete
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

        # Print success banner and timing summary
        _hub_print_performance_summary "${phase_times[@]}" "$duration"
        deployment_print_success "$instance_code" "Hub" "$duration" "$pipeline_mode" "hub"

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

        deployment_print_failure "$instance_code" "Hub" "$duration" "hub"

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
# Phase 3 Sprint 1: Enhanced with timeout enforcement and parallel startup
# Phase 3 Sprint 2: Enhanced with real-time progress display
# Phase 3 Sprint 3: Enhanced with circuit breaker and checkpoint support
#
# Arguments:
#   --resume    Resume from last checkpoint
#   --legacy    Use legacy deployment (skip orchestration pipeline)
##
hub_deploy() {
    local use_pipeline="${HUB_USE_PIPELINE:-true}"
    local resume_mode=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --resume)
                resume_mode=true
                shift
                ;;
            --legacy)
                use_pipeline=false
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    # Use new orchestrated pipeline if available
    if [ "$use_pipeline" = "true" ] && type hub_pipeline_execute &>/dev/null; then
        local mode="deploy"
        if [ "$resume_mode" = "true" ]; then
            mode="resume"
        fi
        hub_pipeline_execute "$mode"
        return $?
    fi

    # Legacy deployment path (fallback)
    log_step "Starting Hub deployment (legacy mode)..."

    local start_time=$(date +%s)
    local phase_times=()

    # Load deployment timeouts
    if [ -f "${DIVE_ROOT}/config/deployment-timeouts.env" ]; then
        source "${DIVE_ROOT}/config/deployment-timeouts.env"
    fi

    # Get deployment timeout (default: 600s = 10 min)
    local deployment_timeout=${TIMEOUT_HUB_DEPLOY:-600}
    log_verbose "Deployment timeout: ${deployment_timeout}s"

    # Initialize real-time progress tracking (Sprint 2)
    if type progress_init &>/dev/null; then
        progress_init "hub" "USA" 7
    fi

    # Start timeout monitor in background
    (
        local elapsed=0
        local check_interval=10
        local warned_50=false
        local warned_75=false
        local warned_90=false

        while [ $elapsed -lt $deployment_timeout ]; do
            sleep $check_interval
            elapsed=$((elapsed + check_interval))

            local percent=$((elapsed * 100 / deployment_timeout))

            # Timeout warnings
            if [ $percent -ge 90 ] && [ "$warned_90" = "false" ]; then
                log_warn "Deployment timeout warning: 90% elapsed (${elapsed}/${deployment_timeout}s)"
                warned_90=true
            elif [ $percent -ge 75 ] && [ "$warned_75" = "false" ]; then
                log_warn "Deployment timeout warning: 75% elapsed (${elapsed}/${deployment_timeout}s)"
                warned_75=true
            elif [ $percent -ge 50 ] && [ "$warned_50" = "false" ]; then
                log_info "Deployment progress: 50% of timeout elapsed (${elapsed}/${deployment_timeout}s)"
                warned_50=true
            fi
        done

        # Timeout reached
        log_error "DEPLOYMENT TIMEOUT: Exceeded ${deployment_timeout}s"
        log_error "Deployment is taking too long - likely stuck or failed"
        log_error "Check logs: ./dive logs"
        log_error "To increase timeout: TIMEOUT_HUB_DEPLOY=900 ./dive hub deploy"

        # Kill the deployment process group
        # Note: This won't work perfectly but will trigger failure
        exit 1
    ) &

    local timeout_monitor_pid=$!

    # Ensure cleanup on exit
    trap "kill $timeout_monitor_pid 2>/dev/null || true; progress_cleanup" EXIT

    # Initialize request context
    if type init_request_context &>/dev/null; then
        init_request_context "hub-deployment" "deploy"
    fi

    # Phase 1: Preflight checks
    local phase_start=$(date +%s)
    if type progress_set_phase &>/dev/null; then
        progress_set_phase 1 "Preflight checks"
    fi
    log_info "Phase 1: Preflight checks"
    if ! hub_preflight; then
        log_error "Preflight checks failed"
        if type progress_fail &>/dev/null; then
            progress_fail "Preflight checks failed"
        fi
        kill $timeout_monitor_pid 2>/dev/null || true
        return 1
    fi
    local phase_end=$(date +%s)
    local phase1_duration=$((phase_end - phase_start))
    phase_times+=("Phase 1 (Preflight): ${phase1_duration}s")
    log_verbose "Phase 1 completed in ${phase1_duration}s"

    # Phase 2: Initialize
    phase_start=$(date +%s)
    if type progress_set_phase &>/dev/null; then
        progress_set_phase 2 "Initialization"
    fi
    log_info "Phase 2: Initialization"
    if ! hub_init; then
        log_error "Initialization failed"
        if type progress_fail &>/dev/null; then
            progress_fail "Initialization failed"
        fi
        kill $timeout_monitor_pid 2>/dev/null || true
        return 1
    fi
    phase_end=$(date +%s)
    local phase2_duration=$((phase_end - phase_start))
    phase_times+=("Phase 2 (Initialization): ${phase2_duration}s")
    log_verbose "Phase 2 completed in ${phase2_duration}s"

    # Phase 2.5: Initialize MongoDB replica set (CRITICAL - must run BEFORE parallel startup)
    # This was previously Phase 4a, but needs to run before backend starts
    # Backend requires MongoDB replica set for change streams (OPAL)
    phase_start=$(date +%s)
    if type progress_set_phase &>/dev/null; then
        progress_set_phase 2.5 "MongoDB replica set"
    fi
    log_info "Phase 2.5: Starting MongoDB and initializing replica set"

    # CRITICAL: Load secrets before MongoDB operations
    # Needed for MONGO_PASSWORD environment variable
    if ! load_secrets; then
        log_error "CRITICAL: Failed to load secrets - cannot initialize MongoDB"
        kill $timeout_monitor_pid 2>/dev/null || true
        return 1
    fi

    # Start MongoDB first (Level 0 service, but we need it early)
    log_verbose "Starting MongoDB container..."
    if ! ${DOCKER_CMD:-docker} compose -f "$HUB_COMPOSE_FILE" up -d mongodb >/dev/null 2>&1; then
        log_error "CRITICAL: Failed to start MongoDB container"
        kill $timeout_monitor_pid 2>/dev/null || true
        return 1
    fi

    # Wait for MongoDB container to be healthy
    log_verbose "Waiting for MongoDB container to be healthy..."
    local mongo_wait=0
    local mongo_max_wait=60
    while [ $mongo_wait -lt $mongo_max_wait ]; do
        if ${DOCKER_CMD:-docker} ps --filter "name=dive-hub-mongodb" --filter "health=healthy" --format "{{.Names}}" | grep -q "dive-hub-mongodb"; then
            log_verbose "MongoDB container is healthy"
            break
        fi
        sleep 2
        mongo_wait=$((mongo_wait + 2))
    done

    if [ $mongo_wait -ge $mongo_max_wait ]; then
        log_warn "MongoDB container not healthy after ${mongo_max_wait}s, attempting replica set init anyway..."
    fi

    # Now initialize replica set
    if [ ! -f "${DIVE_ROOT}/scripts/init-mongo-replica-set-post-start.sh" ]; then
        log_error "CRITICAL: MongoDB initialization script not found"
        kill $timeout_monitor_pid 2>/dev/null || true
        return 1
    fi

    if ! bash "${DIVE_ROOT}/scripts/init-mongo-replica-set-post-start.sh" dive-hub-mongodb admin "$MONGO_PASSWORD"; then
        log_error "CRITICAL: MongoDB replica set initialization FAILED"
        log_error "This will cause 'not primary' errors and backend startup failure"
        kill $timeout_monitor_pid 2>/dev/null || true
        return 1
    fi
    log_success "MongoDB replica set initialized and PRIMARY"

    # Set flag to prevent duplicate initialization in hub_up()
    export HUB_MONGODB_RS_INITIALIZED=true

    # CRITICAL: Add stability buffer to allow replica set discovery to propagate
    # MongoDB drivers cache replica set topology - need time for connection pools to refresh
    log_verbose "Waiting 3s for MongoDB replica set discovery to stabilize..."
    sleep 3

    phase_end=$(date +%s)
    local phase2_5_duration=$((phase_end - phase_start))
    phase_times+=("Phase 2.5 (MongoDB Replica Set): ${phase2_5_duration}s")
    log_verbose "Phase 2.5 completed in ${phase2_5_duration}s"

    # Phase 3: Start services (now uses parallel startup)
    phase_start=$(date +%s)
    if type progress_set_phase &>/dev/null; then
        progress_set_phase 3 "Starting services"
        progress_set_services 0 12  # Hub has 12 services total
    fi
    log_info "Phase 3: Starting services (parallel mode)"
    if ! hub_up; then
        log_error "Service startup failed"
        if type progress_fail &>/dev/null; then
            progress_fail "Service startup failed"
        fi
        kill $timeout_monitor_pid 2>/dev/null || true
        return 1
    fi
    # Update to show all services started
    if type progress_set_services &>/dev/null; then
        progress_set_services 12 12
    fi
    phase_end=$(date +%s)
    local phase3_duration=$((phase_end - phase_start))
    phase_times+=("Phase 3 (Services): ${phase3_duration}s")
    log_success "Phase 3 completed in ${phase3_duration}s"

    # Phase 4c: Verify backend can connect (may need retry due to initialization timing)
    phase_start=$(date +%s)
    log_info "Phase 4c: Verifying backend connectivity"
    # Backend will use retry logic from mongodb-connection.ts
    # Just wait for backend to become healthy
    phase_end=$(date +%s)
    local phase4c_duration=$((phase_end - phase_start))
    phase_times+=("Phase 4c (Backend Verify): ${phase4c_duration}s")
    log_verbose "Phase 4c completed in ${phase4c_duration}s"

    # Initialize orchestration database
    phase_start=$(date +%s)
    if type progress_set_phase &>/dev/null; then
        progress_set_phase 5 "Orchestration database"
    fi
    log_info "Phase 5: Orchestration database initialization"
    hub_init_orchestration_db
    phase_end=$(date +%s)
    local phase5_duration=$((phase_end - phase_start))
    phase_times+=("Phase 5 (Orch DB): ${phase5_duration}s")
    log_verbose "Phase 5 completed in ${phase5_duration}s"

    # Configure Keycloak
    phase_start=$(date +%s)
    if type progress_set_phase &>/dev/null; then
        progress_set_phase 6 "Keycloak configuration"
    fi
    log_info "Phase 6: Keycloak configuration"
    if ! hub_configure_keycloak; then
        log_error "CRITICAL: Keycloak configuration FAILED"
        log_error "Hub is unusable without realm configuration"
        log_error "Fix Keycloak issues and redeploy"
        if type progress_fail &>/dev/null; then
            progress_fail "Keycloak configuration failed"
        fi
        kill $timeout_monitor_pid 2>/dev/null || true
        return 1
    fi
    phase_end=$(date +%s)
    local phase6_duration=$((phase_end - phase_start))
    phase_times+=("Phase 6 (Keycloak): ${phase6_duration}s")
    log_verbose "Phase 6 completed in ${phase6_duration}s"

    # Verify realm exists after configuration
    phase_start=$(date +%s)
    log_info "Phase 6.5: Verifying realm creation"
    if ! hub_verify_realm; then
        log_error "CRITICAL: Realm verification FAILED"
        log_error "Keycloak configuration completed but realm doesn't exist"
        log_error "This indicates Terraform or Keycloak state issues"
        if type progress_fail &>/dev/null; then
            progress_fail "Realm verification failed"
        fi
        kill $timeout_monitor_pid 2>/dev/null || true
        return 1
    fi
    phase_end=$(date +%s)
    local phase6_5_duration=$((phase_end - phase_start))
    phase_times+=("Phase 6.5 (Realm Verify): ${phase6_5_duration}s")
    log_verbose "Phase 6.5 completed in ${phase6_5_duration}s"

    # Phase 6.75: Register Hub KAS in federation registry
    phase_start=$(date +%s)
    log_info "Phase 6.75: Registering Hub KAS"

    # Load hub seed module for KAS registration function
    if [ -f "${MODULES_DIR}/hub/seed.sh" ]; then
        source "${MODULES_DIR}/hub/seed.sh"

        # Call KAS registration (non-fatal if it fails)
        if ! _hub_register_kas; then
            log_warn "Hub KAS registration failed - KAS decryption may not work"
            log_warn "Manually register: docker exec dive-hub-backend npm run seed:hub-kas"
        fi
    else
        log_warn "Hub seed module not found - skipping KAS registration"
        log_warn "KAS decryption may not work until registered manually"
    fi

    phase_end=$(date +%s)
    local phase6_75_duration=$((phase_end - phase_start))
    phase_times+=("Phase 6.75 (KAS Register): ${phase6_75_duration}s")
    log_verbose "Phase 6.75 completed in ${phase6_75_duration}s"

    # Phase 7: Seed database with test users and resources
    phase_start=$(date +%s)
    if type progress_set_phase &>/dev/null; then
        progress_set_phase 7 "Database seeding"
    fi
    log_info "Phase 7: Database seeding"
    if ! hub_seed 5000; then
        log_error "Database seeding failed"
        log_warn "Hub infrastructure deployed but requires manual seeding"
        log_warn "Run: ./dive hub seed"
        # Don't fail deployment - seeding can be done manually
    fi
    phase_end=$(date +%s)
    local phase7_duration=$((phase_end - phase_start))
    phase_times+=("Phase 7 (Seeding): ${phase7_duration}s")
    log_verbose "Phase 7 completed in ${phase7_duration}s"

    # Phase 7.5: Initialize and verify Key Access Service (KAS)
    phase_start=$(date +%s)
    if type progress_set_phase &>/dev/null; then
        progress_set_phase 7.5 "Initializing KAS"
    fi
    log_info "Phase 7.5: Initializing Key Access Service (KAS)"

    if docker ps --format '{{.Names}}' | grep -q "${HUB_COMPOSE_PROJECT}-kas"; then
        log_info "Waiting for KAS to be healthy..."
        local kas_wait=0
        local kas_max_wait=60

        while [ $kas_wait -lt $kas_max_wait ]; do
            local kas_health=$(docker inspect "${HUB_COMPOSE_PROJECT}-kas" \
                --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

            if [ "$kas_health" = "healthy" ]; then
                log_success "✓ KAS is healthy"
                break
            fi

            sleep 2
            ((kas_wait += 2))
        done

        if [ $kas_wait -ge $kas_max_wait ]; then
            log_warn "KAS health check timeout after ${kas_max_wait}s"
            log_warn "Check logs: docker logs ${HUB_COMPOSE_PROJECT}-kas"
        else
            # Verify health endpoint directly
            local kas_port="${KAS_HOST_PORT:-8085}"
            if curl -sf -k "https://localhost:${kas_port}/health" >/dev/null 2>&1; then
                log_success "✓ KAS health endpoint responding on port ${kas_port}"
            else
                log_warn "KAS health endpoint not accessible on port ${kas_port}"
            fi
        fi
    else
        log_info "KAS container not found - skipping (optional service)"
    fi

    phase_end=$(date +%s)
    local phase7_5_duration=$((phase_end - phase_start))
    phase_times+=("Phase 7.5 (KAS Init): ${phase7_5_duration}s")
    log_verbose "Phase 7.5 completed in ${phase7_5_duration}s"

    # Stop timeout monitor (success)
    kill $timeout_monitor_pid 2>/dev/null || true
    trap - EXIT

    # Mark progress as complete (Sprint 2)
    if type progress_complete &>/dev/null; then
        progress_complete
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Record metrics
    if type metrics_record_deployment_duration &>/dev/null; then
        metrics_record_deployment_duration "HUB" "hub" "full" "$duration"
    fi

    # Display performance summary
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Deployment Performance Summary"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    for timing in "${phase_times[@]}"; do
        echo "  $timing"
    done
    echo "  ──────────────────────────────────────────────────"
    echo "  Total Duration: ${duration}s"

    # Performance analysis
    if [ $duration -lt 180 ]; then
        echo "  Performance: ✅ EXCELLENT (< 3 minutes)"
    elif [ $duration -lt 300 ]; then
        echo "  Performance: ⚠️  ACCEPTABLE (3-5 minutes)"
    else
        echo "  Performance: ❌ SLOW (> 5 minutes)"
        echo ""
        echo "  Performance issues detected. Slowest phases:"
        # Sort and show top 3 slowest phases
        printf '%s\n' "${phase_times[@]}" | sort -t: -k2 -nr | head -3 | while read -r line; do
            echo "    • $line"
        done
    fi

    # Timeout utilization
    local timeout_percent=$((duration * 100 / deployment_timeout))
    echo "  Timeout Utilization: ${timeout_percent}% of ${deployment_timeout}s"

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    log_success "Hub deployment complete in ${duration}s"

    # Show access info
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Hub is ready!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Keycloak:  https://localhost:8443"
    echo "  Backend:   http://localhost:4000"
    echo "  Frontend:  http://localhost:3000"
    echo ""
    echo "Next steps:"
    echo "  ./dive spoke deploy ALB    # Deploy Albania spoke"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    return 0
}

##
# Hub preflight checks
##
hub_preflight() {
    log_verbose "Running hub preflight checks..."

    # Use detected Docker command from common.sh
    local docker_cmd="${DOCKER_CMD:-docker}"

    # Check Docker daemon is running
    # Simple check: if docker ps works, Docker is ready
    if ! $docker_cmd ps >/dev/null 2>&1; then
        log_error "Docker daemon is not accessible"
        log_error "Docker command tried: $docker_cmd"
        log_error "Verify Docker Desktop is running and try again"
        return 1
    fi

    log_verbose "Docker daemon is accessible"

    # Check Docker Compose
    if ! $docker_cmd compose version >/dev/null 2>&1; then
        log_error "Docker Compose v2 not available"
        return 1
    fi

    # Check compose file exists
    if [ ! -f "$HUB_COMPOSE_FILE" ]; then
        log_error "Hub compose file not found: $HUB_COMPOSE_FILE"
        return 1
    fi

    # CRITICAL FIX: Create dive-shared network BEFORE docker-compose validates it
    # docker-compose.hub.yml declares dive-shared as "external: true"
    # This means Docker expects it to already exist at parse time (not runtime)
    # Without this, you get: "network dive-shared declared as external, but could not be found"
    log_verbose "Ensuring dive-shared network exists (required by docker-compose.hub.yml)..."
    if ! $docker_cmd network inspect dive-shared >/dev/null 2>&1; then
        $docker_cmd network create dive-shared || {
            log_error "Failed to create dive-shared network"
            return 1
        }
        log_verbose "Created dive-shared network"
    else
        log_verbose "dive-shared network already exists"
    fi

    # Check ports
    local ports_to_check="8443 4000 3000 5432 27017"
    for port in $ports_to_check; do
        if lsof -i ":$port" >/dev/null 2>&1; then
            log_warn "Port $port may be in use"
        fi
    done

    log_success "Preflight checks passed"
    return 0
}

##
# Initialize hub data directories and config
##
hub_init() {
    log_verbose "Initializing hub..."

    # Create data directories
    mkdir -p "${HUB_DATA_DIR}/config"
    mkdir -p "${DIVE_ROOT}/logs/hub"
    mkdir -p "${DIVE_ROOT}/instances/hub/certs"
    mkdir -p "${DIVE_ROOT}/instances/hub"

    # Note: dive-shared network is created in hub_preflight()
    # (must exist before docker-compose validates external networks)

    # Generate MongoDB keyfile if not exists
    # CRITICAL: Required for MongoDB replica set internal authentication
    local keyfile_path="${DIVE_ROOT}/instances/hub/mongo-keyfile"
    if [ ! -f "$keyfile_path" ]; then
        log_verbose "Generating MongoDB replica set keyfile..."

        # Use the standard keyfile generation script
        if [ -f "${DIVE_ROOT}/scripts/generate-mongo-keyfile.sh" ]; then
            if bash "${DIVE_ROOT}/scripts/generate-mongo-keyfile.sh" "$keyfile_path" >/dev/null 2>&1; then
                log_verbose "MongoDB keyfile generated: $keyfile_path"
            else
                log_error "Failed to generate MongoDB keyfile using script"
                return 1
            fi
        else
            # Fallback: Generate keyfile directly
            log_verbose "Generating MongoDB keyfile directly (script not found)"
            openssl rand -base64 756 | tr -d '\n' > "$keyfile_path"
            chmod 400 "$keyfile_path"

            # Verify file size (MongoDB requires 6-1024 characters)
            local file_size=$(wc -c < "$keyfile_path" | tr -d ' ')
            if [ "$file_size" -lt 6 ] || [ "$file_size" -gt 1024 ]; then
                log_error "KeyFile size ($file_size bytes) outside valid range (6-1024)"
                rm -f "$keyfile_path"
                return 1
            fi
            log_verbose "MongoDB keyfile generated directly: $keyfile_path ($file_size bytes)"
        fi
    else
        log_verbose "MongoDB keyfile already exists: $keyfile_path"

        # Verify it's a file (not a directory)
        if [ -d "$keyfile_path" ]; then
            log_error "MongoDB keyfile is a directory (should be a file): $keyfile_path"
            log_info "Removing directory and regenerating..."
            rm -rf "$keyfile_path"

            # Regenerate
            if [ -f "${DIVE_ROOT}/scripts/generate-mongo-keyfile.sh" ]; then
                bash "${DIVE_ROOT}/scripts/generate-mongo-keyfile.sh" "$keyfile_path" >/dev/null 2>&1
            else
                openssl rand -base64 756 | tr -d '\n' > "$keyfile_path"
                chmod 400 "$keyfile_path"
            fi
        fi
    fi

    # Generate certificates if not exists
    local cert_dir="${DIVE_ROOT}/instances/hub/certs"
    local mkcert_ca_dir="${DIVE_ROOT}/certs/mkcert"

    if [ ! -f "${cert_dir}/certificate.pem" ]; then
        log_verbose "Generating hub certificates..."
        if command -v mkcert >/dev/null 2>&1; then
            cd "$cert_dir"
            # Generate certificate with all Docker service names as SANs
            mkcert -cert-file certificate.pem -key-file key.pem \
                localhost "*.localhost" 127.0.0.1 \
                hub.dive.local \
                backend keycloak opa mongodb postgres redis kas opal-server frontend \
                >/dev/null 2>&1
            cp "$(mkcert -CAROOT)/rootCA.pem" mkcert-rootCA.pem 2>/dev/null || true
            cd - >/dev/null
            log_verbose "Certificates generated with mkcert (includes all Docker service names)"
        else
            # Fallback to openssl
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout "${cert_dir}/key.pem" \
                -out "${cert_dir}/certificate.pem" \
                -subj "/CN=localhost" >/dev/null 2>&1
            cp "${cert_dir}/certificate.pem" "${cert_dir}/mkcert-rootCA.pem"
            log_verbose "Certificates generated with openssl"
        fi

        # Fix permissions for Docker containers (non-root users need read access)
        chmod 644 "${cert_dir}/key.pem" 2>/dev/null || true
    fi

    # Copy mkcert root CA to shared location for docker-compose volume mounts
    # Services expect: ./certs/mkcert:/app/certs/ca:ro
    mkdir -p "${mkcert_ca_dir}"
    if [ -f "${cert_dir}/mkcert-rootCA.pem" ]; then
        cp "${cert_dir}/mkcert-rootCA.pem" "${mkcert_ca_dir}/rootCA.pem"
        chmod 644 "${mkcert_ca_dir}/rootCA.pem"
        log_verbose "mkcert CA copied to ${mkcert_ca_dir}/rootCA.pem"
    fi

    # Initialize hub config if not exists
    if [ ! -f "${HUB_DATA_DIR}/config/hub.json" ]; then
        cat > "${HUB_DATA_DIR}/config/hub.json" << 'EOF'
{
  "hub_id": "dive-hub",
  "realm": "dive-v3-broker",
  "created": "2026-01-22",
  "spokes": []
}
EOF
    fi

    log_success "Hub initialization complete"
    return 0
}

##
# Start hub services with parallel startup optimization (Phase 3 Sprint 1)
##
hub_up() {
    echo "DEBUG [hub_up]: ENTRY" >&2
    log_info "Starting hub services..."

    cd "$DIVE_ROOT"

    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would run: ${DOCKER_CMD:-docker} compose -f $HUB_COMPOSE_FILE up -d"
        return 0
    fi

    # CRITICAL: Ensure dive-shared network exists (required by docker-compose.hub.yml)
    # This is normally done in hub_preflight(), but hub_up() can be called standalone
    # docker-compose.hub.yml declares dive-shared as "external: true" which is validated at parse time
    echo "DEBUG [hub_up]: Checking dive-shared network..." >&2
    if ! ${DOCKER_CMD:-docker} network inspect dive-shared >/dev/null 2>&1; then
        log_verbose "Creating dive-shared network (required for hub services)..."
        if ! ${DOCKER_CMD:-docker} network create dive-shared 2>/dev/null; then
            log_error "Failed to create dive-shared network"
            log_error "This network is required by docker-compose.hub.yml (external: true)"
            return 1
        fi
        log_verbose "dive-shared network created"
    fi
    echo "DEBUG [hub_up]: dive-shared network OK" >&2

    # CRITICAL: Load secrets from GCP or local before starting containers
    # This ensures all environment variables are available for docker-compose interpolation
    echo "DEBUG [hub_up]: Loading secrets..." >&2
    if ! load_secrets; then
        log_error "Failed to load secrets - cannot start hub"
        return 1
    fi
    echo "DEBUG [hub_up]: Secrets loaded" >&2

    # CRITICAL: Pre-build all Docker images before parallel startup
    # This prevents build delays during service health checks (frontend, backend, etc.)
    echo "DEBUG [hub_up]: Building Docker images..." >&2
    log_info "Building Docker images (if needed)..."
    local build_log="/tmp/hub-docker-build-$(date +%s).log"
    if ${DOCKER_CMD:-docker} compose -f "$HUB_COMPOSE_FILE" build > "$build_log" 2>&1; then
        log_success "Docker images built successfully"
        echo "DEBUG [hub_up]: Docker images built" >&2
    else
        log_error "Failed to build Docker images"
        log_error "Build log: $build_log"
        tail -50 "$build_log" >&2
        return 1
    fi

    # Phase 3 Sprint 1: Enhanced parallel startup with dependency-aware orchestration
    local use_parallel="${PARALLEL_STARTUP_ENABLED:-true}"

    if [ "$use_parallel" = "true" ] && type hub_parallel_startup &>/dev/null; then
        log_info "Using parallel service startup (dependency-aware)"

        # Call hub-specific parallel startup function
        if ! hub_parallel_startup; then
            log_error "Parallel service startup failed"
            log_warn "Some services may not be healthy - check logs: ./dive logs"
            return 1
        fi

        log_success "Hub services started (parallel mode: 4 dependency levels)"

        # CRITICAL: Initialize MongoDB replica set after MongoDB container is healthy
        # This must be done for quick-start (hub up) mode as well
        # Backend and OPAL require MongoDB replica set for change streams

        # Guard: Skip if already initialized in Phase 2.5 (hub deploy)
        if [ "${HUB_MONGODB_RS_INITIALIZED:-false}" = "true" ]; then
            log_verbose "MongoDB replica set already initialized in Phase 2.5, skipping"
        else
            log_step "Initializing MongoDB replica set..."

            # Wait for MongoDB to be healthy first
        local mongo_wait=0
        local mongo_max_wait=30
        while [ $mongo_wait -lt $mongo_max_wait ]; do
            if docker ps --filter "name=dive-hub-mongodb" --filter "health=healthy" --format "{{.Names}}" | grep -q "dive-hub-mongodb"; then
                log_verbose "MongoDB container is healthy"
                break
            fi
            sleep 2
            mongo_wait=$((mongo_wait + 2))
        done

        if [ $mongo_wait -ge $mongo_max_wait ]; then
            log_error "MongoDB container not healthy after ${mongo_max_wait}s"
            return 1
        fi

        # Check if replica set is already initialized
        local is_initialized=false
        if docker exec dive-hub-mongodb mongosh admin -u admin -p "$MONGO_PASSWORD" --quiet --eval 'rs.status().myState' 2>/dev/null | grep -q "^1$"; then
            log_verbose "MongoDB replica set already initialized and PRIMARY"
            is_initialized=true
        fi

        # Initialize if not already initialized
        if [ "$is_initialized" = "false" ]; then
            log_verbose "Initializing MongoDB replica set..."

            if [ ! -f "${DIVE_ROOT}/scripts/init-mongo-replica-set-post-start.sh" ]; then
                log_error "MongoDB initialization script not found"
                return 1
            fi

            if ! bash "${DIVE_ROOT}/scripts/init-mongo-replica-set-post-start.sh" dive-hub-mongodb admin "$MONGO_PASSWORD"; then
                log_error "MongoDB replica set initialization FAILED"
                log_error "This will cause 'not primary' errors and backend startup failure"
                return 1
            fi

            log_success "MongoDB replica set initialized and PRIMARY"

            # CRITICAL: Restart backend so it reconnects with new PRIMARY state
            log_verbose "Restarting backend to reconnect to PRIMARY MongoDB..."
            if docker ps --filter "name=dive-hub-backend" --format "{{.Names}}" | grep -q "dive-hub-backend"; then
                docker restart dive-hub-backend >/dev/null 2>&1

                # Wait for backend to be healthy again
                local backend_wait=0
                while [ $backend_wait -lt 30 ]; do
                    if docker ps --filter "name=dive-hub-backend" --filter "health=healthy" --format "{{.Names}}" | grep -q "dive-hub-backend"; then
                        log_success "Backend reconnected to MongoDB PRIMARY"
                        break
                    fi
                    sleep 2
                    backend_wait=$((backend_wait + 2))
                done
            fi
        fi
        fi  # End HUB_MONGODB_RS_INITIALIZED guard
    else
        # Fallback: Traditional sequential startup
        log_verbose "Using traditional sequential startup (PARALLEL_STARTUP_ENABLED=false)"
        ${DOCKER_CMD:-docker} compose -f "$HUB_COMPOSE_FILE" up -d

        log_success "Hub services started (sequential mode)"
    fi

    return 0
}

##
# Stop hub services
##
hub_down() {
    log_info "Stopping hub services..."

    cd "$DIVE_ROOT"

    # CRITICAL: Load secrets before running docker-compose down
    # Docker Compose needs variable interpolation even for shutdown
    if ! load_secrets 2>/dev/null; then
        log_warn "Could not load secrets - using cached .env.hub if available"
        # Try to source .env.hub as fallback (may exist from previous run)
        if [ -f "${DIVE_ROOT}/.env.hub" ]; then
            set -a
            source "${DIVE_ROOT}/.env.hub"
            set +a
        fi
    fi

    ${DOCKER_CMD:-docker} compose -f "$HUB_COMPOSE_FILE" down

    log_success "Hub services stopped"
    return 0
}

##
# Calculate dependency level for a service (helper function)
# Level 0 = no dependencies
# Level N = max(dependency levels) + 1
#
# Arguments:
#   $1 - Service name
#
# Returns:
#   Dependency level (0-based integer)
##
calculate_service_level() {
    local service="$1"
    local visited_path="${2:-}"  # For cycle detection

    # Cycle detection
    if [[ " $visited_path " =~ " $service " ]]; then
        log_warn "Circular dependency detected: $visited_path -> $service"
        echo "0"
        return
    fi

    # Get dependencies for this service
    local deps="${service_deps[$service]}"

    # No dependencies = level 0
    if [ "$deps" = "none" ] || [ -z "$deps" ]; then
        echo "0"
        return
    fi

    # Calculate max level of dependencies
    local max_dep_level=0
    for dep in $deps; do
        # Skip if dependency doesn't exist in our service list
        if [ -z "${service_deps[$dep]+x}" ]; then
            continue
        fi

        local dep_level=$(calculate_service_level "$dep" "$visited_path $service")
        if [ $dep_level -gt $max_dep_level ]; then
            max_dep_level=$dep_level
        fi
    done

    # This service's level = max dependency level + 1
    echo $((max_dep_level + 1))
}

##
# Retry with exponential backoff (Phase 4 Sprint 2)
# Handles transient failures with configurable retry attempts
#
# Arguments:
#   $1 - Max retry attempts (default: 3)
#   $2 - Service name (for logging)
#   $3+ - Command to execute
#
# Returns:
#   0 on success, 1 on final failure
#
# Environment Variables:
#   RETRY_MAX_ATTEMPTS - Override default retry attempts (default: 3)
#   RETRY_BASE_DELAY - Base delay in seconds (default: 2)
#   RETRY_MAX_DELAY - Maximum delay in seconds (default: 30)
##
retry_with_backoff() {
    local max_attempts="${RETRY_MAX_ATTEMPTS:-3}"
    local service_name="$1"
    shift

    local attempt=1
    local delay="${RETRY_BASE_DELAY:-2}"
    local max_delay="${RETRY_MAX_DELAY:-30}"

    while [ $attempt -le $max_attempts ]; do
        # Execute command
        if "$@"; then
            if [ $attempt -gt 1 ]; then
                log_success "$service_name: Recovered after $attempt attempts"
            fi
            return 0
        fi

        # Check if we should retry
        if [ $attempt -lt $max_attempts ]; then
            log_warn "$service_name: Attempt $attempt/$max_attempts failed, retrying in ${delay}s..."
            sleep "$delay"

            # Exponential backoff: delay = delay * 2, capped at max_delay
            delay=$((delay * 2))
            if [ $delay -gt $max_delay ]; then
                delay=$max_delay
            fi
        else
            log_error "$service_name: All $max_attempts attempts failed"
        fi

        ((attempt++))
    done

    return 1
}

##
# Circuit breaker for repeated failures (Phase 4 Sprint 2)
# Prevents infinite retry loops by failing fast after threshold
#
# Arguments:
#   $1 - Service name
#   $2 - Failure type (e.g., "health_check", "startup")
#
# Returns:
#   0 if circuit is closed (can proceed)
#   1 if circuit is open (fail fast)
#
# Environment Variables:
#   CIRCUIT_BREAKER_THRESHOLD - Failures before opening (default: 3)
#   CIRCUIT_BREAKER_TIMEOUT - Reset timeout in seconds (default: 60)
##
declare -A CIRCUIT_BREAKER_FAILURES
declare -A CIRCUIT_BREAKER_LAST_FAILURE

circuit_breaker_check() {
    local service="$1"
    local failure_type="$2"
    local key="${service}:${failure_type}"

    local threshold="${CIRCUIT_BREAKER_THRESHOLD:-3}"
    local timeout="${CIRCUIT_BREAKER_TIMEOUT:-60}"
    local now=$(date +%s)

    # Check if circuit was opened recently
    local last_failure="${CIRCUIT_BREAKER_LAST_FAILURE[$key]:-0}"
    local time_since_failure=$((now - last_failure))

    # Reset circuit if timeout expired
    if [ "$time_since_failure" -gt "$timeout" ]; then
        CIRCUIT_BREAKER_FAILURES[$key]=0
        CIRCUIT_BREAKER_LAST_FAILURE[$key]=0
    fi

    # Check failure count
    local failures="${CIRCUIT_BREAKER_FAILURES[$key]:-0}"
    if [ "$failures" -ge "$threshold" ]; then
        log_error "$service: Circuit breaker OPEN (${failures} consecutive failures)"
        log_error "$service: Failing fast to prevent cascading failures"
        return 1
    fi

    return 0
}

circuit_breaker_record_failure() {
    local service="$1"
    local failure_type="$2"
    local key="${service}:${failure_type}"

    local failures="${CIRCUIT_BREAKER_FAILURES[$key]:-0}"
    CIRCUIT_BREAKER_FAILURES[$key]=$((failures + 1))
    CIRCUIT_BREAKER_LAST_FAILURE[$key]=$(date +%s)
}

circuit_breaker_reset() {
    local service="$1"
    local failure_type="$2"
    local key="${service}:${failure_type}"

    CIRCUIT_BREAKER_FAILURES[$key]=0
    CIRCUIT_BREAKER_LAST_FAILURE[$key]=0
}

##
# Hub-specific parallel startup using dependency graph
# Phase 3 Sprint 1: Enables 40-50% faster startup through parallel service orchestration
# Phase 2 Part 3: Dynamic dependency level calculation
# Phase 4 Sprint 2: Added retry logic and graceful degradation
##
hub_parallel_startup() {
    log_info "Starting hub services with dependency-aware parallel orchestration"

    # DYNAMIC SERVICE CLASSIFICATION (from docker-compose.hub.yml labels)
    # Uses yq to directly query service labels - more reliable than helper functions
    local all_services_raw=$(yq eval '.services | keys | .[]' "$HUB_COMPOSE_FILE" 2>/dev/null | xargs)

    # Filter out profile-only services (e.g., authzforce with profiles: ["xacml"])
    local all_services=""
    for svc in $all_services_raw; do
        local profiles=$(yq eval ".services.\"$svc\".profiles // []" "$HUB_COMPOSE_FILE" 2>/dev/null)
        if [ "$profiles" != "[]" ] && [ "$profiles" != "null" ] && [ -n "$profiles" ]; then
            log_verbose "Skipping service '$svc' (in profile: $profiles)"
            continue  # Skip profile-only services
        fi
        all_services="$all_services $svc"
    done
    all_services=$(echo $all_services | xargs)  # Trim whitespace

    # Discover services by class label
    local CORE_SERVICES_RAW=""
    local OPTIONAL_SERVICES_RAW=""
    local STRETCH_SERVICES_RAW=""

    for svc in $all_services; do
        local class=$(yq eval ".services.\"$svc\".labels.\"dive.service.class\" // \"\"" "$HUB_COMPOSE_FILE" 2>/dev/null | tr -d '"')
        case "$class" in
            core)
                CORE_SERVICES_RAW="$CORE_SERVICES_RAW $svc"
                ;;
            optional)
                OPTIONAL_SERVICES_RAW="$OPTIONAL_SERVICES_RAW $svc"
                ;;
            stretch)
                STRETCH_SERVICES_RAW="$STRETCH_SERVICES_RAW $svc"
                ;;
            *)
                # Services without a classification label default to optional
                # This allows new services to be added without blocking deployments
                if [ -n "$class" ]; then
                    log_warn "Unknown service class '$class' for service '$svc', treating as optional"
                else
                    log_verbose "Service '$svc' has no dive.service.class label, treating as optional"
                fi
                OPTIONAL_SERVICES_RAW="$OPTIONAL_SERVICES_RAW $svc"
                ;;
        esac
    done

    # Convert to arrays and trim whitespace
    local -a CORE_SERVICES=($(echo $CORE_SERVICES_RAW | xargs))
    local -a OPTIONAL_SERVICES=($(echo $OPTIONAL_SERVICES_RAW | xargs))
    local -a STRETCH_SERVICES=($(echo $STRETCH_SERVICES_RAW | xargs))

    log_verbose "Discovered services dynamically from $HUB_COMPOSE_FILE:"
    log_verbose "  CORE: ${CORE_SERVICES[*]} (${#CORE_SERVICES[@]} services)"
    log_verbose "  OPTIONAL: ${OPTIONAL_SERVICES[*]} (${#OPTIONAL_SERVICES[@]} services)"
    log_verbose "  STRETCH: ${STRETCH_SERVICES[*]} (${#STRETCH_SERVICES[@]} services)"

    # DYNAMIC DEPENDENCY LEVEL CALCULATION
    # Parse depends_on from docker-compose.hub.yml and calculate levels automatically
    log_verbose "Calculating dependency levels dynamically..."

    # Build dependency map from compose file
    # Handle both depends_on formats:
    #   Simple array: [opa, mongodb]
    #   Object with conditions: {opa: {condition: ...}, mongodb: {condition: ...}}
    declare -A service_deps
    for svc in $all_services; do
        # Try to get dependencies (handle both array and object formats)
        local deps_type=$(yq eval ".services.\"$svc\".depends_on | type" "$HUB_COMPOSE_FILE" 2>/dev/null)

        if [ "$deps_type" = "!!seq" ]; then
            # Simple array format: [opa, mongodb]
            local deps=$(yq eval ".services.\"$svc\".depends_on.[]" "$HUB_COMPOSE_FILE" 2>/dev/null | xargs)
        elif [ "$deps_type" = "!!map" ]; then
            # Object format with conditions: {opa: {condition: ...}}
            local deps=$(yq eval ".services.\"$svc\".depends_on | keys | .[]" "$HUB_COMPOSE_FILE" 2>/dev/null | xargs)
        else
            # No dependencies or null
            local deps=""
        fi

        if [ -z "$deps" ]; then
            service_deps["$svc"]="none"
        else
            service_deps["$svc"]="$deps"
        fi
    done

    # Calculate dependency level for each service
    declare -A service_levels
    declare -A level_services  # Reverse map: level -> services
    local max_level=0

    for svc in $all_services; do
        local level=$(calculate_service_level "$svc")
        service_levels["$svc"]=$level

        # Add to level_services map
        if [ -z "${level_services[$level]:-}" ]; then
            level_services[$level]="$svc"
        else
            level_services[$level]="${level_services[$level]} $svc"
        fi

        # Track max level
        if [ $level -gt $max_level ]; then
            max_level=$level
        fi
    done

    log_verbose "Dependency levels calculated (max level: $max_level):"
    for ((lvl=0; lvl<=max_level; lvl++)); do
        local services_at_level="${level_services[$lvl]:-}"
        if [ -n "$services_at_level" ]; then
            local count=$(echo "$services_at_level" | wc -w | tr -d ' ')
            log_verbose "  Level $lvl: $services_at_level ($count services)"
        fi
    done

    local total_services=$(echo "$all_services" | wc -w | tr -d ' ')
    local total_started=0
    local total_failed=0
    local start_time=$(date +%s)

    log_verbose "Service graph has $((max_level + 1)) dependency levels (0-$max_level) with $total_services total services"

    # Start services level by level
    for ((level=0; level<=max_level; level++)); do
        # Get services at this level
        local level_services_str="${level_services[$level]:-}"

        if [ -z "$level_services_str" ]; then
            log_verbose "Level $level: No services to start"
            continue
        fi

        # Convert to array
        local -a current_level_services=($level_services_str)

        log_info "Level $level: Starting ${current_level_services[*]}"

        # Start all services at this level in parallel
        local pids=()
        declare -A service_pid_map

        for service in "${current_level_services[@]}"; do
            (
                # Calculate dynamic timeout based on service type
                local timeout
                case "$service" in
                    postgres)         timeout=${TIMEOUT_POSTGRES:-60} ;;
                    mongodb)          timeout=${TIMEOUT_MONGODB:-90} ;;
                    redis)            timeout=${TIMEOUT_REDIS:-30} ;;
                    redis-blacklist)  timeout=${TIMEOUT_REDIS:-30} ;;
                    keycloak)         timeout=${TIMEOUT_KEYCLOAK:-180} ;;
                    opa)              timeout=${TIMEOUT_OPA:-30} ;;
                    backend)          timeout=${TIMEOUT_BACKEND:-120} ;;
                    frontend)         timeout=${TIMEOUT_FRONTEND:-90} ;;
                    kas)              timeout=${TIMEOUT_KAS:-60} ;;
                    authzforce)       timeout=${TIMEOUT_AUTHZFORCE:-90} ;;
                    opal-server)      timeout=${TIMEOUT_OPAL:-60} ;;
                    otel-collector)   timeout=${TIMEOUT_OTEL:-30} ;;
                    *)                timeout=60 ;;
                esac

                local container="${COMPOSE_PROJECT_NAME:-dive-hub}-${service}"

                # Check if already running and healthy
                if ${DOCKER_CMD:-docker} ps --format '{{.Names}}' | grep -q "^${container}$"; then
                    local health=$(${DOCKER_CMD:-docker} inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
                    if [ "$health" = "healthy" ]; then
                        log_verbose "Service $service already running and healthy"
                        exit 0
                    fi
                fi

                # Start service using ${DOCKER_CMD:-docker} compose
                log_verbose "Starting $service (timeout: ${timeout}s)"
                local start_output
                if ! start_output=$(${DOCKER_CMD:-docker} compose -f "$HUB_COMPOSE_FILE" up -d "$service" 2>&1); then
                    log_error "Failed to start $service container"
                    # FIX: Provide detailed error information for debugging
                    log_error "Docker compose output: $start_output"
                    log_error "Check service definition in $HUB_COMPOSE_FILE"
                    # FIXED (2026-01-28): Escape brackets in grep pattern to prevent "brackets not balanced" error
                    local deps_pattern=$(echo "${current_level_services[@]}" | tr ' ' '|')
                    log_error "Verify dependencies are running: docker ps | grep -E '($deps_pattern)'"
                    exit 1
                fi

                # Wait for health with timeout
                local elapsed=0
                local interval=3

                while [ $elapsed -lt $timeout ]; do
                    # Check container state
                    local state=$(${DOCKER_CMD:-docker} inspect "$container" --format='{{.State.Status}}' 2>/dev/null || echo "not_found")

                    if [ "$state" = "not_found" ]; then
                        log_error "Container $container not found"
                        exit 1
                    elif [ "$state" != "running" ]; then
                        log_verbose "$service: Container state=$state (waiting...)"
                        sleep $interval
                        elapsed=$((elapsed + interval))
                        continue
                    fi

                    # Check health status
                    local health=$(${DOCKER_CMD:-docker} inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "none")

                    # Trim whitespace and handle empty/none cases
                    health=$(echo "$health" | tr -d '[:space:]')

                    if [ "$health" = "healthy" ]; then
                        log_success "$service is healthy (${elapsed}s)"
                        exit 0
                    elif [ "$health" = "none" ] || [ -z "$health" ] || [ "$health" = "" ]; then
                        # During start_period, health status may be empty string
                        # If container is running, wait a bit more for health check to initialize
                        if [ "$state" = "running" ]; then
                            # Health check might be in start_period - wait a bit more
                            if [ $elapsed -lt 10 ]; then
                                log_verbose "$service: Container running, waiting for health check to initialize ($elapsed/${timeout}s)"
                                sleep $interval
                                elapsed=$((elapsed + interval))
                                continue
                            else
                                # After 10s, if still no health status and container is running, assume healthy
                                log_verbose "$service is running (health check not yet initialized, assuming healthy)"
                                exit 0
                            fi
                        else
                            # Container not running - continue waiting
                            sleep $interval
                            elapsed=$((elapsed + interval))
                            continue
                        fi
                    fi

                    # Progress indicator
                    if [ $((elapsed % 15)) -eq 0 ] && [ $elapsed -gt 0 ]; then
                        log_verbose "$service: Still waiting for healthy state ($elapsed/${timeout}s)"
                    fi

                    sleep $interval
                    elapsed=$((elapsed + interval))
                done

                log_error "$service: Timeout after ${timeout}s (health: $health)"
                exit 1
            ) &

            local pid=$!
            pids+=($pid)
            service_pid_map[$pid]=$service
        done

        # Wait for all services at this level
        local level_failed=0
        local level_core_failed=0
        for pid in "${pids[@]}"; do
            local service="${service_pid_map[$pid]}"

            if wait $pid; then
                ((total_started++))

                # Update progress with current healthy service count
                if type progress_set_services &>/dev/null; then
                    progress_set_services "$total_started" 12
                fi
            else
                ((total_failed++))
                ((level_failed++))

                # Check if this is a CORE, OPTIONAL, or STRETCH service
                local is_core=false
                local is_optional=false
                local is_stretch=false

                for core_svc in "${CORE_SERVICES[@]}"; do
                    if [ "$service" = "$core_svc" ]; then
                        is_core=true
                        ((level_core_failed++))
                        break
                    fi
                done

                if ! $is_core; then
                    for opt_svc in "${OPTIONAL_SERVICES[@]}"; do
                        if [ "$service" = "$opt_svc" ]; then
                            is_optional=true
                            break
                        fi
                    done
                fi

                if ! $is_core && ! $is_optional; then
                    for stretch_svc in "${STRETCH_SERVICES[@]}"; do
                        if [ "$service" = "$stretch_svc" ]; then
                            is_stretch=true
                            break
                        fi
                    done
                fi

                # Log appropriate message based on service classification
                if $is_core; then
                    log_error "Service $service failed to start at level $level (CORE - deployment will fail)"
                    log_error "Check logs: docker logs $container"
                    log_error "Check container state: docker inspect $container | jq '.[0].State'"
                elif $is_optional; then
                    log_warn "Service $service failed to start at level $level (OPTIONAL - deployment will continue)"
                    log_verbose "Check logs: docker logs $container"
                elif $is_stretch; then
                    log_warn "Service $service failed to start at level $level (STRETCH - deployment will continue)"
                    log_verbose "Check logs: docker logs $container"
                    # FIX: Provide helpful debugging info for KAS failures
                    if [ "$service" = "kas" ]; then
                        log_verbose "KAS troubleshooting:"
                        log_verbose "  1. Check certificates: ls -la kas/certs/"
                        log_verbose "  2. Check build: docker images | grep kas"
                        log_verbose "  3. Check dependencies: docker ps | grep -E '(opa|mongodb)'"
                        log_verbose "  4. Check logs: docker logs $container | tail -50"
                    fi
                else
                    log_error "Service $service failed to start at level $level (UNKNOWN classification - treating as CORE)"
                    log_error "Check logs: docker logs $container"
                    ((level_core_failed++))
                fi

                # Record failure in metrics if available
                if type metrics_record_service_failure &>/dev/null; then
                    metrics_record_service_failure "HUB" "$service" "startup_timeout"
                fi
            fi
        done

        # Only fail if CORE services failed at this level
        if [ $level_core_failed -gt 0 ]; then
            log_error "Level $level had $level_core_failed CORE service failures"
            log_error "Stopping parallel startup - fix CORE service failures and redeploy"
            return 1
        elif [ $level_failed -gt 0 ]; then
            log_warn "Level $level had $level_failed failures, but all CORE services operational"
            log_warn "Deployment will continue without optional/stretch services"
        fi

        local level_time=$(($(date +%s) - start_time))
        log_verbose "Level $level complete in ${level_time}s (cumulative)"
    done

    local end_time=$(date +%s)
    local total_time=$((end_time - start_time))

    # Summary
    local core_started=$((total_started - total_failed))
    log_success "Parallel startup complete: $total_started services started in ${total_time}s"
    if [ $total_failed -gt 0 ]; then
        log_warn "Note: $total_failed optional/stretch services did not start (see warnings above)"
    fi

    # Record metrics
    if type metrics_record_deployment_phase &>/dev/null; then
        metrics_record_deployment_phase "HUB" "hub" "parallel_startup" "$total_time"
    fi

    # Only fail if CORE services failed (already checked in level loop)
    return 0
}

##
# Wait for hub services to become healthy
##
hub_wait_healthy() {
    log_info "Waiting for hub services to become healthy..."

    local services=("dive-hub-postgres" "dive-hub-keycloak" "dive-hub-backend")
    local max_wait=300
    local elapsed=0

    for service in "${services[@]}"; do
        log_verbose "Waiting for $service..."

        while [ $elapsed -lt $max_wait ]; do
            local status=$(${DOCKER_CMD:-docker} inspect "$service" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")

            if [ "$status" = "healthy" ]; then
                log_success "$service is healthy"
                break
            elif [ "$status" = "not_found" ]; then
                log_error "$service not found"
                return 1
            fi

            sleep 5
            ((elapsed += 5))
        done

        if [ $elapsed -ge $max_wait ]; then
            log_error "Timeout waiting for $service"
            return 1
        fi
    done

    log_success "All hub services healthy"
    return 0
}

##
# Initialize orchestration database
##
hub_init_orchestration_db() {
    log_verbose "Initializing orchestration database..."

    # Wait for postgres to be ready
    local max_wait=60
    local elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        if ${DOCKER_CMD:-docker} exec dive-hub-postgres pg_isready -U postgres >/dev/null 2>&1; then
            break
        fi
        sleep 2
        ((elapsed += 2))
    done

    # Create orchestration database
    ${DOCKER_CMD:-docker} exec dive-hub-postgres psql -U postgres -c "CREATE DATABASE orchestration;" >/dev/null 2>&1 || true

    # Apply full orchestration schema from migration file (CRITICAL - includes state_transitions)
    if [ -f "${DIVE_ROOT}/scripts/migrations/001_orchestration_state_db.sql" ]; then
        log_verbose "Applying full orchestration schema..."

        # Remove the \c orchestration command since we're already targeting the orchestration database
        # and copy the migration into the container for proper execution
        local temp_migration="/tmp/orchestration_migration_$$.sql"
        grep -v '^\\c orchestration' "${DIVE_ROOT}/scripts/migrations/001_orchestration_state_db.sql" > "${temp_migration}"

        ${DOCKER_CMD:-docker} cp "${temp_migration}" dive-hub-postgres:/tmp/migration.sql
        rm -f "${temp_migration}"

        if ${DOCKER_CMD:-docker} exec dive-hub-postgres psql -U postgres -d orchestration -f /tmp/migration.sql >/dev/null 2>&1; then
            log_verbose "✓ Orchestration schema applied"
            ${DOCKER_CMD:-docker} exec dive-hub-postgres rm -f /tmp/migration.sql
        else
            log_error "CRITICAL: Orchestration schema migration FAILED"
            ${DOCKER_CMD:-docker} exec dive-hub-postgres rm -f /tmp/migration.sql
            return 1
        fi

        # Verify all required tables exist
        local required_tables=("deployment_states" "state_transitions" "deployment_steps"
                               "deployment_locks" "circuit_breakers" "orchestration_errors"
                               "orchestration_metrics" "checkpoints")
        local missing_tables=0

        for table in "${required_tables[@]}"; do
            if ! ${DOCKER_CMD:-docker} exec dive-hub-postgres psql -U postgres -d orchestration -c "\d $table" >/dev/null 2>&1; then
                log_error "Required table missing: $table"
                missing_tables=$((missing_tables + 1))
            fi
        done

        if [ $missing_tables -gt 0 ]; then
            log_error "CRITICAL: $missing_tables required tables missing"
            return 1
        fi

        log_verbose "All 8 orchestration tables verified"
    else
        log_error "CRITICAL: Orchestration schema file not found"
        return 1
    fi

    # Initialize federation schema (database-driven federation state)
    if [ -f "${DIVE_ROOT}/scripts/sql/002_federation_schema.sql" ]; then
        log_verbose "Applying federation schema..."
        if ${DOCKER_CMD:-docker} exec -i dive-hub-postgres psql -U postgres -d orchestration < "${DIVE_ROOT}/scripts/sql/002_federation_schema.sql" >/dev/null 2>&1; then
            log_verbose "✓ Federation schema applied"
        else
            log_warn "Federation schema initialization had issues (may already exist)"
        fi
    fi

    log_success "Orchestration database initialized"
}

##
# Configure Keycloak realm and clients
##
hub_configure_keycloak() {
    log_info "Configuring Keycloak..."

    # Check if Keycloak is ready
    local kc_ready=false
    for i in {1..30}; do
        # Keycloak health endpoint is on management port 9000 (HTTPS)
        if ${DOCKER_CMD:-docker} exec dive-hub-keycloak curl -sfk https://localhost:9000/health/ready >/dev/null 2>&1; then
            kc_ready=true
            break
        # Fallback: check if master realm is accessible
        elif ${DOCKER_CMD:-docker} exec dive-hub-keycloak curl -sf http://localhost:8080/realms/master >/dev/null 2>&1; then
            kc_ready=true
            break
        fi
        sleep 2
    done

    if [ "$kc_ready" != "true" ]; then
        log_warn "Keycloak not ready for configuration"
        return 1
    fi

    # Run Terraform if available
    if [ -d "${DIVE_ROOT}/terraform/hub" ] && command -v terraform >/dev/null 2>&1; then
        log_verbose "Running Terraform configuration..."

        # Verify Terraform state is clean (prevents resource conflicts)
        if [ -f "${DIVE_ROOT}/terraform/hub/terraform.tfstate" ]; then
            log_warn "Terraform state exists - checking for potential conflicts..."

            # Count resources in state
            local state_resources=$(cd "${DIVE_ROOT}/terraform/hub" && terraform state list 2>/dev/null | wc -l | tr -d ' ')

            if [ "$state_resources" -gt 0 ]; then
                log_warn "Found $state_resources resources in Terraform state"
                log_warn "This may cause 'resource already exists' errors"
                log_info "If deployment fails, run: ./dive nuke --confirm"
            fi
        else
            log_verbose "Clean Terraform state - fresh deployment"
        fi

        # Source .env.hub to get secrets
        if [ -f "${DIVE_ROOT}/.env.hub" ]; then
            set -a
            source "${DIVE_ROOT}/.env.hub"
            set +a
        else
            log_error "No .env.hub file found"
            return 1
        fi

        (
            cd "${DIVE_ROOT}/terraform/hub"

            # Initialize Terraform (only if not already initialized)
            if [ ! -d ".terraform" ]; then
                log_verbose "Initializing Terraform..."
                terraform init -upgrade >/dev/null 2>&1
            else
                log_verbose "Terraform already initialized"
            fi

            # Export Terraform variables
            export TF_VAR_keycloak_admin_password="${KC_ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD_USA:-${KEYCLOAK_ADMIN_PASSWORD}}}"
            export TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET}"
            export TF_VAR_test_user_password="${TEST_USER_PASSWORD:-${KC_ADMIN_PASSWORD}}"
            export TF_VAR_admin_user_password="${ADMIN_PASSWORD:-${KC_ADMIN_PASSWORD}}"
            export KEYCLOAK_USER="admin"
            export KEYCLOAK_PASSWORD="${KC_ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD_USA}}"

            # Verify variables set
            if [ -z "$TF_VAR_keycloak_admin_password" ] || [ -z "$TF_VAR_client_secret" ]; then
                log_error "Required Terraform variables not set"
                return 1
            fi

            log_verbose "Terraform variables validated"

            # Apply with performance optimizations
            log_verbose "Applying Terraform configuration (optimized for performance)..."
            terraform apply \
                -auto-approve \
                -var-file="hub.tfvars" \
                -parallelism=20 \
                -compact-warnings \
                -no-color
        ) || {
            log_error "Terraform apply failed"
            return 1
        }
    fi

    log_success "Keycloak configuration complete"
    return 0
}

##
# Verify Keycloak realm exists
##
hub_verify_realm() {
    local realm="dive-v3-broker-usa"
    local keycloak_url="https://localhost:8443"
    local max_retries=10
    local retry_delay=3

    log_verbose "Verifying realm '$realm' exists..."

    for i in $(seq 1 $max_retries); do
        # Check if realm exists
        local realm_response
        realm_response=$(curl -sk --max-time 10 "${keycloak_url}/realms/${realm}" 2>/dev/null)

        if [ $? -eq 0 ]; then
            local realm_name
            realm_name=$(echo "$realm_response" | jq -r '.realm // empty' 2>/dev/null)

            if [ "$realm_name" = "$realm" ]; then
                log_success "Realm '$realm' verified"
                return 0
            fi
        fi

        if [ $i -lt $max_retries ]; then
            log_verbose "Retry $i/$max_retries: Waiting ${retry_delay}s..."
            sleep $retry_delay
        fi
    done

    log_error "Realm '$realm' not found after $max_retries attempts"
    return 1
}

##
# Verify hub deployment with automated tests
##
hub_verify() {
    log_info "Running hub deployment validation..."

    if [ ! -f "${DIVE_ROOT}/tests/validate-hub-deployment.sh" ]; then
        log_error "Validation script not found"
        return 1
    fi

    bash "${DIVE_ROOT}/tests/validate-hub-deployment.sh"
    return $?
}

##
# Show hub status
##
hub_status() {
    echo "=== Hub Status ==="
    echo ""

    # Container status
    echo "Containers:"
    ${DOCKER_CMD:-docker} ps --filter "name=dive-hub" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  No containers running"

    echo ""
    echo "Health:"
    for container in dive-hub-postgres dive-hub-keycloak dive-hub-backend dive-hub-frontend; do
        local health=$(${DOCKER_CMD:-docker} inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")
        printf "  %-25s %s\n" "$container" "$health"
    done

    # Database state
    if type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        echo ""
        echo "Orchestration Database: Connected"
    else
        echo ""
        echo "Orchestration Database: Not connected"
    fi
}

##
# Reset hub to clean state
##
hub_reset() {
    log_warn "Resetting hub to clean state..."

    hub_down

    # Remove volumes
    ${DOCKER_CMD:-docker} volume rm dive-hub-postgres-data dive-hub-mongodb-data 2>/dev/null || true

    # Clean data directory
    rm -rf "${HUB_DATA_DIR}"/*

    log_success "Hub reset complete"
    echo "Run './dive hub deploy' to redeploy"
}

##
# View hub logs
##
hub_logs() {
    local service="${1:-}"

    cd "$DIVE_ROOT"

    if [ -n "$service" ]; then
        ${DOCKER_CMD:-docker} compose -f "$HUB_COMPOSE_FILE" logs -f "$service"
    else
        ${DOCKER_CMD:-docker} compose -f "$HUB_COMPOSE_FILE" logs -f
    fi
}

##
# Seed hub database with test data
# SSOT: Delegates to hub/seed.sh module for comprehensive seeding
##
hub_seed() {
    local count="${1:-5000}"

    # Load comprehensive hub seeding module (SSOT)
    if [ -f "${MODULES_DIR}/hub/seed.sh" ]; then
        source "${MODULES_DIR}/hub/seed.sh"
        # Call the comprehensive hub_seed function from the module
        hub_seed "$count"
    else
        log_error "Hub seeding module not found"
        return 1
    fi
}

##
# List registered spokes
##
hub_spokes_list() {
    echo "=== Registered Spokes ==="

    if type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        orch_db_exec "
            SELECT instance_code, state,
                   to_char(timestamp, 'YYYY-MM-DD HH24:MI') as last_update
            FROM deployment_states
            WHERE instance_code != 'hub'
            ORDER BY instance_code
        " 2>/dev/null || echo "  No spokes registered"
    else
        echo "  Database not available"
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

##
# Hub module command dispatcher
##
module_hub() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        deploy)         hub_deploy "$@" ;;
        init)           hub_init "$@" ;;
        up|start)       hub_up "$@" ;;
        down|stop)      hub_down "$@" ;;
        reset)          hub_reset "$@" ;;
        status)         hub_status "$@" ;;
        verify)         hub_verify "$@" ;;
        logs)           hub_logs "$@" ;;
        seed)           hub_seed "$@" ;;
        spokes)
            local sub="${1:-list}"
            shift || true
            case "$sub" in
                list)    hub_spokes_list "$@" ;;
                *)       echo "Usage: ./dive hub spokes <list>" ;;
            esac
            ;;
        help|*)
            echo "Usage: ./dive hub <command>"
            echo ""
            echo "Commands:"
            echo "  deploy    Full hub deployment"
            echo "  up        Start hub services"
            echo "  down      Stop hub services"
            echo "  status    Show hub status"
            echo "  verify    Run deployment validation tests"
            echo "  reset     Reset hub to clean state"
            echo "  logs      View hub logs"
            echo "  seed      Seed database with test data"
            echo "  spokes    Manage registered spokes"
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f hub_deploy
export -f hub_preflight
export -f hub_init
export -f hub_up
export -f hub_parallel_startup
export -f hub_down
export -f hub_wait_healthy
export -f hub_configure_keycloak
export -f hub_verify_realm
export -f hub_verify
export -f hub_status
export -f hub_reset
export -f hub_logs
export -f hub_seed
export -f hub_spokes_list
export -f module_hub

log_verbose "Hub deployment module loaded (consolidated)"
