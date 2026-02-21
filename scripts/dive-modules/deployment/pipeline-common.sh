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

# Load guided error recovery module (remediation catalog + interactive prompts)
if [ -f "$(dirname "${BASH_SOURCE[0]}")/../orchestration/error-recovery.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../orchestration/error-recovery.sh"
fi

# =============================================================================
# PIPELINE CONSTANTS
# =============================================================================

# Pipeline execution modes (shared between hub and spoke)
# Use idempotent assignment to avoid readonly collisions when modules are re-sourced.
: "${PIPELINE_MODE_DEPLOY:=deploy}"      # Full deployment (all phases)
: "${PIPELINE_MODE_UP:=up}"              # Quick start (skip initialization)
: "${PIPELINE_MODE_REDEPLOY:=redeploy}"  # Redeploy (skip init, full deploy)

# =============================================================================
# FLAG TAXONOMY (Phase 7: UX Polish)
# =============================================================================
#
# Confirmation flags: --confirm / --yes / -y
#   Meaning: "I acknowledge this destructive action"
#   Used by: nuke (required for all destructive operations)
#   In non-interactive mode, --confirm must be explicit (no default)
#
# Force flags: --force / -f
#   Meaning: "Override safety checks"
#   Used by:
#     - spoke deploy --force : Redeploy even if already deployed
#     - pipeline_validated_set_state --force : Override state transition validation
#     - nuke --force : Implies --confirm + skips interactive prompt
#
# Pipeline control flags:
#   --resume           : Resume from last checkpoint
#   --dry-run / -n     : Simulate deployment without making changes
#   --from-phase X     : Start from specified phase (skip earlier)
#   --skip-phase X     : Skip specified phase (can be repeated)
#   --only-phase X     : Run only the specified phase
#   --force-build      : Force rebuild Docker images (bypass cache)
#   --preserve-logs    : Keep deployment logs during nuke (Phase 6)
#
# Command aliases:
#   up / start         : Start services (hub and spoke)
#   down / stop        : Stop services (hub and spoke)
#   verify / health    : Run verification checks (spoke only)
#
# =============================================================================

# =============================================================================
# GRACEFUL SIGINT HANDLING
# =============================================================================

# Pipeline interrupt state — shared across all phase execution
export _PIPELINE_SIGINT_RECEIVED=false
export _PIPELINE_CURRENT_PHASE=""
export _PIPELINE_CURRENT_INSTANCE=""

##
# SIGINT handler for pipeline execution
#
# When Ctrl+C is received during a phase, this handler:
#   - In interactive mode: offers continue/pause/abort
#   - In non-interactive mode: saves checkpoint and aborts
##
_pipeline_sigint_handler() {
    export _PIPELINE_SIGINT_RECEIVED=true
    local phase="${_PIPELINE_CURRENT_PHASE:-unknown}"
    local instance="${_PIPELINE_CURRENT_INSTANCE:-unknown}"

    echo ""
    echo ""

    # Non-interactive: save checkpoint and abort
    if ! is_interactive 2>/dev/null; then
        log_warn "SIGINT received (non-interactive) — saving checkpoint and aborting"
        _pipeline_save_interrupt_checkpoint "$instance" "$phase"
        # Re-raise to allow cleanup traps in calling functions
        trap - INT
        kill -INT $$
        return
    fi

    echo "==============================================================================="
    echo "  Deployment interrupted during phase: $phase"
    echo "==============================================================================="
    echo ""
    echo "  Options:"
    echo "    [c] Continue deployment (resume from current phase)"
    echo "    [p] Pause and save checkpoint (resume later with --resume)"
    echo "    [a] Abort immediately"
    echo ""

    local choice
    read -r -p "  Choose [c/p/a]: " choice
    case "$choice" in
        [Cc])
            export _PIPELINE_SIGINT_RECEIVED=false
            log_info "Continuing deployment..."
            ;;
        [Pp])
            log_info "Saving checkpoint and pausing..."
            _pipeline_save_interrupt_checkpoint "$instance" "$phase"
            echo ""
            echo "  Deployment paused. Resume with:"
            echo "    ./dive hub deploy --resume"
            echo "    ./dive spoke deploy <CODE> --resume"
            echo ""
            # Exit the current phase (caller will see non-zero)
            return 1
            ;;
        *)
            log_warn "Aborting deployment..."
            _pipeline_save_interrupt_checkpoint "$instance" "$phase"
            # Re-raise to allow cleanup traps
            trap - INT
            kill -INT $$
            return
            ;;
    esac
}

##
# Save checkpoint when pipeline is interrupted
#
# Arguments:
#   $1 - Instance code
#   $2 - Current phase name (phase that was running when SIGINT arrived)
##
_pipeline_save_interrupt_checkpoint() {
    local instance_code="$1"
    local current_phase="$2"
    local code_upper
    code_upper=$(upper "$instance_code" 2>/dev/null || echo "$instance_code")

    # Record interrupted state
    if type deployment_set_state &>/dev/null; then
        deployment_set_state "$code_upper" "INTERRUPTED" \
            "User interrupted at phase: $current_phase" \
            "{\"interrupted_phase\":\"$current_phase\"}"
    fi

    # Record step as interrupted
    if type orch_db_record_step &>/dev/null; then
        orch_db_record_step "$code_upper" "$current_phase" "INTERRUPTED" "SIGINT received"
    fi
}

##
# Install SIGINT handler for pipeline execution
#
# Call this at the start of a pipeline run.
# Must be paired with pipeline_uninstall_sigint_handler on exit.
#
# Arguments:
#   $1 - Instance code
##
pipeline_install_sigint_handler() {
    local instance_code="$1"
    export _PIPELINE_CURRENT_INSTANCE="$instance_code"
    export _PIPELINE_SIGINT_RECEIVED=false
    trap '_pipeline_sigint_handler' INT
}

##
# Uninstall SIGINT handler (restore default behavior)
##
pipeline_uninstall_sigint_handler() {
    trap - INT
    export _PIPELINE_SIGINT_RECEIVED=false
    export _PIPELINE_CURRENT_PHASE=""
    export _PIPELINE_CURRENT_INSTANCE=""
}

##
# Check if SIGINT was received and the user chose to pause
#
# Returns:
#   0 - SIGINT received (should stop pipeline)
#   1 - No interrupt
##
pipeline_check_sigint() {
    [ "${_PIPELINE_SIGINT_RECEIVED:-false}" = "true" ]
}

# Common pipeline phases
: "${PIPELINE_PHASE_PREFLIGHT:=PREFLIGHT}"
: "${PIPELINE_PHASE_INITIALIZATION:=INITIALIZATION}"
: "${PIPELINE_PHASE_DEPLOYMENT:=DEPLOYMENT}"
: "${PIPELINE_PHASE_CONFIGURATION:=CONFIGURATION}"
: "${PIPELINE_PHASE_VERIFICATION:=VERIFICATION}"
: "${PIPELINE_PHASE_COMPLETE:=COMPLETE}"

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
    local code_upper
    code_upper=$(upper "$instance_code")

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
    local code_upper
    code_upper=$(upper "$instance_code")

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

    local code_upper
    code_upper=$(upper "$instance_code")
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
    local phase_start
    phase_start=$(date +%s)

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

    local phase_end
    phase_end=$(date +%s)
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

        # Interactive error recovery: offer retry/skip/abort
        local deploy_type="hub"
        [ "$code_upper" != "USA" ] && deploy_type="spoke"
        if type error_recovery_suggest &>/dev/null; then
            error_recovery_suggest "$phase_name" "$deploy_type" "$code_upper"
            local recovery_action=$?
            if [ $recovery_action -eq 0 ]; then
                # Retry: recurse
                log_info "Retrying phase $phase_name..."
                deployment_run_phase "$instance_code" "$phase_name" "$phase_function" "$pipeline_mode" "$resume_mode"
                return $?
            elif [ $recovery_action -eq 2 ]; then
                # Skip: treat as success
                log_warn "Skipping phase $phase_name (user chose to skip)"
                return 0
            fi
            # Abort: fall through to return 1
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
    local code_upper
    code_upper=$(upper "$instance_code")

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
    local code_upper
    code_upper=$(upper "$instance_code")

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
    local code_upper
    code_upper=$(upper "$instance_code")

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
    local code_upper
    code_upper=$(upper "$instance_code")
    local code_lower
    code_lower=$(lower "$instance_code")

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
    local code_lower
    code_lower=$(lower "$instance_code")

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
    local code_lower
    code_lower=$(lower "$instance_code")

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
# PHASE REGISTRY
# =============================================================================
# Declarative phase registration for pipeline execution.
# Phases are stored in parallel arrays (compatible with bash 4+).
#
# Usage:
#   pipeline_clear_phases
#   pipeline_register_phase 1 "VAULT_BOOTSTRAP" "Vault Bootstrap" "hub_phase_vault_bootstrap" "standard" "" ""
#   pipeline_register_phase 8 "VAULT_DB_ENGINE" "Vault DB Engine" "hub_phase_vault_db_engine" "non_fatal" "" "Backend will use static credentials"
#   pipeline_register_phase 6 "BUILD" "Build" "hub_phase_build" "direct" "" ""
# =============================================================================

# Registry arrays
_PIPELINE_REG_NUMS=()
_PIPELINE_REG_NAMES=()
_PIPELINE_REG_LABELS=()
_PIPELINE_REG_FUNCS=()
_PIPELINE_REG_MODES=()       # standard | non_fatal | direct
_PIPELINE_REG_STATES=()      # state transition before phase (empty = none)
_PIPELINE_REG_WARN_MSGS=()   # non-fatal failure message

##
# Clear all registered phases
##
pipeline_clear_phases() {
    _PIPELINE_REG_NUMS=()
    _PIPELINE_REG_NAMES=()
    _PIPELINE_REG_LABELS=()
    _PIPELINE_REG_FUNCS=()
    _PIPELINE_REG_MODES=()
    _PIPELINE_REG_STATES=()
    _PIPELINE_REG_WARN_MSGS=()
}

##
# Register a pipeline phase
#
# Arguments:
#   $1 - Phase number (display order)
#   $2 - Phase name (e.g., VAULT_BOOTSTRAP)
#   $3 - Display label (e.g., "Vault Bootstrap")
#   $4 - Function to execute
#   $5 - Mode: "standard" (fatal+circuit breaker), "non_fatal" (warn+circuit breaker), "direct" (no circuit breaker)
#   $6 - State transition before phase (empty for none, e.g., "DEPLOYING")
#   $7 - Warning message for non-fatal failures
##
pipeline_register_phase() {
    _PIPELINE_REG_NUMS+=("${1}")
    _PIPELINE_REG_NAMES+=("${2}")
    _PIPELINE_REG_LABELS+=("${3}")
    _PIPELINE_REG_FUNCS+=("${4}")
    _PIPELINE_REG_MODES+=("${5:-standard}")
    _PIPELINE_REG_STATES+=("${6:-}")
    _PIPELINE_REG_WARN_MSGS+=("${7:-}")
}

##
# Get count of registered phases
##
pipeline_get_phase_count() {
    echo "${#_PIPELINE_REG_NUMS[@]}"
}

##
# Get all registered phase names (space-separated)
##
pipeline_get_phase_names() {
    echo "${_PIPELINE_REG_NAMES[*]}"
}

# =============================================================================
# DRY-RUN MODE
# =============================================================================
# When DIVE_DRY_RUN=true, the pipeline simulates execution without making
# real changes. Validation-only phases (preflight, config checks) still run.
# =============================================================================

# Phases that execute even in dry-run mode (validation only, no side effects)
readonly PIPELINE_DRY_RUN_VALIDATION_PHASES="PREFLIGHT"

##
# Check if dry-run mode is active
#
# Returns:
#   0 - Dry-run mode is active
#   1 - Normal execution mode
##
pipeline_is_dry_run() {
    [ "${DIVE_DRY_RUN:-false}" = "true" ]
}

##
# Check if a phase should run in validation-only mode during dry-run
#
# Arguments:
#   $1 - Phase name
#
# Returns:
#   0 - Phase is a validation phase (should execute in dry-run)
#   1 - Phase is not a validation phase (should be simulated)
##
pipeline_is_validation_phase() {
    local phase_name="$1"
    local vp
    for vp in $PIPELINE_DRY_RUN_VALIDATION_PHASES; do
        [ "$vp" = "$phase_name" ] && return 0
    done
    return 1
}

##
# Simulate a phase execution in dry-run mode
#
# Prints what the phase would do without actually executing it.
#
# Arguments:
#   $1 - Phase number
#   $2 - Phase name
#   $3 - Phase label
#   $4 - Phase function
#   $5 - Phase mode (standard|non_fatal|direct)
#   $6 - State transition (if any)
##
pipeline_dry_run_phase() {
    local phase_num="$1"
    local phase_name="$2"
    local phase_label="$3"
    local phase_function="$4"
    local phase_mode="$5"
    local phase_state="${6:-}"

    echo ""
    echo "  [DRY-RUN] Phase ${phase_num}: ${phase_label} (${phase_name})"
    echo "    Function:  ${phase_function}()"
    echo "    Mode:      ${phase_mode}"

    if [ -n "$phase_state" ]; then
        echo "    State:     would transition to ${phase_state}"
    fi

    # Show mode-specific behavior
    case "$phase_mode" in
        standard)
            echo "    Behavior:  fatal on failure, circuit breaker protected"
            ;;
        non_fatal)
            echo "    Behavior:  warn on failure, pipeline continues"
            ;;
        direct)
            echo "    Behavior:  direct execution (no circuit breaker)"
            ;;
    esac
}

# Dry-run summary tracking arrays
_DRY_RUN_WOULD_EXECUTE=()
_DRY_RUN_WOULD_SKIP=()
_DRY_RUN_VALIDATED=()
_DRY_RUN_WARNINGS=()

##
# Reset dry-run tracking state
##
pipeline_dry_run_reset() {
    _DRY_RUN_WOULD_EXECUTE=()
    _DRY_RUN_WOULD_SKIP=()
    _DRY_RUN_VALIDATED=()
    _DRY_RUN_WARNINGS=()
}

##
# Record a phase that would execute in dry-run
#
# Arguments:
#   $1 - Phase label
##
pipeline_dry_run_record_execute() {
    _DRY_RUN_WOULD_EXECUTE+=("$1")
}

##
# Record a phase that would be skipped in dry-run
#
# Arguments:
#   $1 - Phase label
#   $2 - Reason for skip
##
pipeline_dry_run_record_skip() {
    _DRY_RUN_WOULD_SKIP+=("$1 ($2)")
}

##
# Record a validation that ran during dry-run
#
# Arguments:
#   $1 - Validation description
##
pipeline_dry_run_record_validation() {
    _DRY_RUN_VALIDATED+=("$1")
}

##
# Record a warning found during dry-run
#
# Arguments:
#   $1 - Warning message
##
pipeline_dry_run_record_warning() {
    _DRY_RUN_WARNINGS+=("$1")
}

##
# Print comprehensive dry-run summary
#
# Arguments:
#   $1 - Deployment type (hub|spoke)
#   $2 - Instance code
##
pipeline_dry_run_summary() {
    local deploy_type="$1"
    local instance_code="$2"

    echo ""
    echo "==============================================================================="
    echo "  DRY-RUN SUMMARY — ${deploy_type^^} ${instance_code}"
    echo "==============================================================================="
    echo ""

    # Phases that would execute
    echo "  Phases that would execute: ${#_DRY_RUN_WOULD_EXECUTE[@]}"
    local phase
    for phase in "${_DRY_RUN_WOULD_EXECUTE[@]+"${_DRY_RUN_WOULD_EXECUTE[@]}"}"; do
        echo "    [+] $phase"
    done

    # Phases that would be skipped
    if [ ${#_DRY_RUN_WOULD_SKIP[@]} -gt 0 ]; then
        echo ""
        echo "  Phases that would be skipped: ${#_DRY_RUN_WOULD_SKIP[@]}"
        for phase in "${_DRY_RUN_WOULD_SKIP[@]+"${_DRY_RUN_WOULD_SKIP[@]}"}"; do
            echo "    [-] $phase"
        done
    fi

    # Validations that ran
    if [ ${#_DRY_RUN_VALIDATED[@]} -gt 0 ]; then
        echo ""
        echo "  Validations performed:"
        local validation
        for validation in "${_DRY_RUN_VALIDATED[@]+"${_DRY_RUN_VALIDATED[@]}"}"; do
            echo "    [v] $validation"
        done
    fi

    # Warnings
    if [ ${#_DRY_RUN_WARNINGS[@]} -gt 0 ]; then
        echo ""
        echo "  Warnings:"
        local warning
        for warning in "${_DRY_RUN_WARNINGS[@]+"${_DRY_RUN_WARNINGS[@]}"}"; do
            echo "    [!] $warning"
        done
    fi

    echo ""
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    echo "  No changes were made. Run without --dry-run to execute."
    echo "==============================================================================="
    echo ""
}

# =============================================================================
# STRUCTURED LOGGING
# =============================================================================
# JSON-formatted log entries for deployment observability.
# Each entry includes: timestamp, phase, level, message, duration_ms
# Logs to both stdout (human-readable) and a structured JSONL file.
# =============================================================================

# Log session state
export _DEPLOY_LOG_FILE=""
export _DEPLOY_LOG_TYPE=""
export _DEPLOY_LOG_INSTANCE=""

##
# Initialize structured logging for a deployment session
#
# Creates the log directory and opens a JSONL log file.
#
# Arguments:
#   $1 - Deployment type (hub|spoke)
#   $2 - Instance code (e.g., USA, GBR)
#
# Returns:
#   0 - Logging initialized
#   1 - Failed to create log directory
##
pipeline_log_init() {
    local deploy_type="$1"
    local instance_code="$2"
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)

    local log_dir="${DIVE_ROOT}/.dive-state/logs"
    if ! mkdir -p "$log_dir" 2>/dev/null; then
        log_verbose "Could not create log directory: $log_dir"
        return 1
    fi

    export _DEPLOY_LOG_FILE="${log_dir}/deploy-${deploy_type}-${instance_code}-${timestamp}.jsonl"
    export _DEPLOY_LOG_TYPE="$deploy_type"
    export _DEPLOY_LOG_INSTANCE="$instance_code"

    # Write session header
    pipeline_log_structured "info" "INIT" "Deployment session started" 0
    return 0
}

##
# Write a structured log entry
#
# Outputs JSON to the log file and a human-readable line to stdout.
#
# Arguments:
#   $1 - Level (info|warn|error|success)
#   $2 - Phase name (e.g., PREFLIGHT, BUILD, or INIT/COMPLETE)
#   $3 - Message
#   $4 - Duration in milliseconds (0 if not applicable)
##
pipeline_log_structured() {
    local level="$1"
    local phase="$2"
    local message="$3"
    local duration_ms="${4:-0}"
    local ts
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    # Write to JSONL file if session is active
    if [ -n "${_DEPLOY_LOG_FILE:-}" ]; then
        printf '{"timestamp":"%s","phase":"%s","level":"%s","message":"%s","duration_ms":%s,"type":"%s","instance":"%s"}\n' \
            "$ts" "$phase" "$level" "$message" "$duration_ms" \
            "${_DEPLOY_LOG_TYPE:-unknown}" "${_DEPLOY_LOG_INSTANCE:-unknown}" \
            >> "$_DEPLOY_LOG_FILE" 2>/dev/null || true
    fi
}

##
# Finalize structured logging session
#
# Writes a completion entry and returns the log file path.
#
# Arguments:
#   $1 - Exit code (0=success, 1=failure)
#   $2 - Total duration in seconds
##
pipeline_log_finalize() {
    local exit_code="$1"
    local duration_s="$2"
    local result="success"
    [ "$exit_code" -ne 0 ] && result="failure"

    pipeline_log_structured "info" "COMPLETE" "Deployment $result" "$((duration_s * 1000))"
}

##
# Get the current log file path
#
# Returns:
#   Log file path on stdout (empty if no active session)
##
pipeline_log_get_path() {
    echo "${_DEPLOY_LOG_FILE:-}"
}

# =============================================================================
# PHASE TIMING METRICS
# =============================================================================
# Tracks start/end/duration for each phase in a structured format.
# Data is stored in parallel arrays for later retrieval.
# =============================================================================

# Timing tracking arrays
_PIPELINE_TIMING_PHASES=()
_PIPELINE_TIMING_STARTS=()
_PIPELINE_TIMING_ENDS=()
_PIPELINE_TIMING_DURATIONS=()
_PIPELINE_TIMING_RESULTS=()

##
# Reset timing data for a new deployment
##
pipeline_timing_reset() {
    _PIPELINE_TIMING_PHASES=()
    _PIPELINE_TIMING_STARTS=()
    _PIPELINE_TIMING_ENDS=()
    _PIPELINE_TIMING_DURATIONS=()
    _PIPELINE_TIMING_RESULTS=()
}

##
# Record the start of a phase
#
# Arguments:
#   $1 - Phase name
##
pipeline_timing_start() {
    local phase="$1"
    _PIPELINE_TIMING_PHASES+=("$phase")
    _PIPELINE_TIMING_STARTS+=("$(date +%s)")
    _PIPELINE_TIMING_ENDS+=("0")
    _PIPELINE_TIMING_DURATIONS+=("0")
    _PIPELINE_TIMING_RESULTS+=("running")
}

##
# Record the end of a phase
#
# Arguments:
#   $1 - Phase name
#   $2 - Result (success|failure|skipped)
##
pipeline_timing_end() {
    local phase="$1"
    local result="${2:-success}"
    local end_time
    end_time=$(date +%s)

    local i
    for (( i = ${#_PIPELINE_TIMING_PHASES[@]} - 1; i >= 0; i-- )); do
        if [ "${_PIPELINE_TIMING_PHASES[$i]}" = "$phase" ]; then
            _PIPELINE_TIMING_ENDS[$i]="$end_time"
            _PIPELINE_TIMING_DURATIONS[$i]="$((end_time - ${_PIPELINE_TIMING_STARTS[$i]}))"
            _PIPELINE_TIMING_RESULTS[$i]="$result"
            break
        fi
    done
}

##
# Get timing data for a specific phase
#
# Arguments:
#   $1 - Phase name
#
# Returns:
#   "start_epoch end_epoch duration_s result" on stdout
#   Returns 1 if phase not found
##
pipeline_get_phase_timing() {
    local phase="$1"
    local i
    for (( i = ${#_PIPELINE_TIMING_PHASES[@]} - 1; i >= 0; i-- )); do
        if [ "${_PIPELINE_TIMING_PHASES[$i]}" = "$phase" ]; then
            echo "${_PIPELINE_TIMING_STARTS[$i]} ${_PIPELINE_TIMING_ENDS[$i]} ${_PIPELINE_TIMING_DURATIONS[$i]} ${_PIPELINE_TIMING_RESULTS[$i]}"
            return 0
        fi
    done
    return 1
}

##
# Print timing data for all phases in a formatted table
#
# Arguments:
#   $1 - Total deployment duration in seconds
##
pipeline_timing_print() {
    local total_duration="${1:-0}"

    echo ""
    echo "  Phase Timing Metrics"
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    printf "  %-25s %10s %10s\n" "Phase" "Duration" "Result"
    echo "  ─────────────────────────────────────────────────────────────────────────────"

    local i
    for (( i = 0; i < ${#_PIPELINE_TIMING_PHASES[@]}; i++ )); do
        local phase="${_PIPELINE_TIMING_PHASES[$i]}"
        local dur="${_PIPELINE_TIMING_DURATIONS[$i]}"
        local res="${_PIPELINE_TIMING_RESULTS[$i]}"

        printf "  %-25s %8ss %10s\n" "$phase" "$dur" "$res"
    done

    echo "  ─────────────────────────────────────────────────────────────────────────────"
    printf "  %-25s %8ss\n" "TOTAL" "$total_duration"
    echo ""
}

# =============================================================================
# DEPLOYMENT HISTORY
# =============================================================================
# Reads structured log files to show recent deployment attempts.
# =============================================================================

##
# List recent deployment history
#
# Arguments:
#   $1 - Deployment type (hub|spoke)
#   $2 - Instance code (e.g., USA, GBR) — optional, shows all if empty
#   $3 - Max entries to show (default: 10)
##
pipeline_show_history() {
    local deploy_type="$1"
    local instance_code="${2:-}"
    local max_entries="${3:-10}"

    local log_dir="${DIVE_ROOT}/.dive-state/logs"
    if [ ! -d "$log_dir" ]; then
        echo "  No deployment history found."
        return 0
    fi

    echo ""
    echo "==============================================================================="
    if [ -n "$instance_code" ]; then
        echo "  Deployment History — ${deploy_type^^} ${instance_code}"
    else
        echo "  Deployment History — ${deploy_type^^}"
    fi
    echo "==============================================================================="
    echo ""
    printf "  %-22s %-10s %-8s %-10s %s\n" "Timestamp" "Instance" "Result" "Duration" "Mode"
    echo "  ─────────────────────────────────────────────────────────────────────────────"

    # Build file pattern
    local pattern="deploy-${deploy_type}-"
    if [ -n "$instance_code" ]; then
        pattern="deploy-${deploy_type}-${instance_code}-"
    fi

    local count=0
    # List log files in reverse chronological order (newest first by filename)
    local log_file
    while IFS= read -r log_file; do
        [ -z "$log_file" ] && continue
        [ ! -f "$log_file" ] && continue

        # Extract metadata from COMPLETE entry (last line)
        local complete_line
        complete_line=$(tail -1 "$log_file" 2>/dev/null)

        local ts instance result duration_s mode_info
        # Parse timestamp from filename (deploy-type-INSTANCE-YYYYMMDD-HHMMSS.jsonl)
        local basename_f
        basename_f=$(basename "$log_file" .jsonl)
        ts=$(echo "$basename_f" | sed -E 's/deploy-[a-z]+-[A-Z]+-//' | sed 's/-/ /')
        instance=$(echo "$basename_f" | sed -E 's/deploy-[a-z]+-([A-Z]+)-.*/\1/')

        # Parse result from COMPLETE line
        result="unknown"
        duration_s="-"
        if echo "$complete_line" | grep -q '"phase":"COMPLETE"' 2>/dev/null; then
            if echo "$complete_line" | grep -q '"message":"Deployment success"' 2>/dev/null; then
                result="success"
            else
                result="failure"
            fi
            # Extract duration
            duration_s=$(echo "$complete_line" | sed -E 's/.*"duration_ms":([0-9]+).*/\1/' 2>/dev/null)
            if [ -n "$duration_s" ] && [ "$duration_s" != "$complete_line" ]; then
                duration_s="$((duration_s / 1000))s"
            else
                duration_s="-"
            fi
        fi

        # Parse mode from INIT line (if available)
        mode_info="deploy"

        printf "  %-22s %-10s %-8s %-10s %s\n" "$ts" "$instance" "$result" "$duration_s" "$mode_info"

        count=$((count + 1))
        [ "$count" -ge "$max_entries" ] && break
    done < <(ls -1r "${log_dir}/${pattern}"*.jsonl 2>/dev/null)

    if [ "$count" -eq 0 ]; then
        echo "  No deployment history found."
    fi

    echo ""
    echo "  ─────────────────────────────────────────────────────────────────────────────"
    echo "  Showing $count most recent deployments"
    echo "  Log directory: $log_dir"
    echo "==============================================================================="
    echo ""
}

# =============================================================================
# STATE MACHINE HARDENING (Phase 6)
# =============================================================================
# Validates state transitions, detects stuck deployments, and provides
# state audit/repair capabilities.
# =============================================================================

# Valid deployment states
readonly PIPELINE_STATE_UNKNOWN="UNKNOWN"
readonly PIPELINE_STATE_INITIALIZING="INITIALIZING"
readonly PIPELINE_STATE_DEPLOYING="DEPLOYING"
readonly PIPELINE_STATE_CONFIGURING="CONFIGURING"
readonly PIPELINE_STATE_VERIFYING="VERIFYING"
readonly PIPELINE_STATE_COMPLETE="COMPLETE"
readonly PIPELINE_STATE_FAILED="FAILED"
readonly PIPELINE_STATE_INTERRUPTED="INTERRUPTED"

# State transition matrix — each key maps to valid target states
# Format: "FROM_STATE:TO_STATE1,TO_STATE2,..."
_PIPELINE_VALID_TRANSITIONS=(
    "UNKNOWN:INITIALIZING,FAILED"
    "INITIALIZING:DEPLOYING,FAILED,INTERRUPTED"
    "DEPLOYING:CONFIGURING,FAILED,INTERRUPTED"
    "CONFIGURING:VERIFYING,FAILED,INTERRUPTED"
    "VERIFYING:COMPLETE,FAILED,INTERRUPTED"
    "COMPLETE:INITIALIZING,FAILED"
    "FAILED:INITIALIZING,UNKNOWN"
    "INTERRUPTED:INITIALIZING,FAILED,UNKNOWN"
)

# Active states (states that indicate a deployment is in progress)
readonly PIPELINE_ACTIVE_STATES="INITIALIZING DEPLOYING CONFIGURING VERIFYING"

# Default timeouts per active state (seconds)
readonly PIPELINE_STUCK_TIMEOUT_INITIALIZING="${DIVE_STUCK_TIMEOUT_INITIALIZING:-1800}"  # 30min
readonly PIPELINE_STUCK_TIMEOUT_DEPLOYING="${DIVE_STUCK_TIMEOUT_DEPLOYING:-1800}"        # 30min
readonly PIPELINE_STUCK_TIMEOUT_CONFIGURING="${DIVE_STUCK_TIMEOUT_CONFIGURING:-1200}"    # 20min
readonly PIPELINE_STUCK_TIMEOUT_VERIFYING="${DIVE_STUCK_TIMEOUT_VERIFYING:-600}"         # 10min

# Heartbeat tracking
export _PIPELINE_HEARTBEAT_FILE=""

##
# Validate a state transition
#
# Checks if transitioning from current_state to new_state is valid
# according to the state transition matrix.
#
# Arguments:
#   $1 - Current state
#   $2 - Proposed new state
#   $3 - Optional: "force" to allow invalid transitions with warning
#
# Returns:
#   0 - Transition is valid (or forced)
#   1 - Transition is invalid
##
pipeline_validate_state_transition() {
    local current_state="${1:-UNKNOWN}"
    local new_state="$2"
    local force="${3:-}"

    # Same state is always valid (no-op)
    if [ "$current_state" = "$new_state" ]; then
        return 0
    fi

    # Check transition matrix
    local entry
    for entry in "${_PIPELINE_VALID_TRANSITIONS[@]}"; do
        local from_state="${entry%%:*}"
        local valid_targets="${entry#*:}"

        if [ "$from_state" = "$current_state" ]; then
            # Check if new_state is in valid targets
            local target
            local IFS_OLD="$IFS"
            IFS=","
            for target in $valid_targets; do
                if [ "$target" = "$new_state" ]; then
                    IFS="$IFS_OLD"
                    return 0
                fi
            done
            IFS="$IFS_OLD"

            # Not in valid targets
            if [ "$force" = "force" ]; then
                log_warn "Forcing invalid state transition: $current_state -> $new_state"
                return 0
            fi

            log_warn "Invalid state transition: $current_state -> $new_state (allowed from $current_state: $valid_targets)"
            return 1
        fi
    done

    # Unknown source state — allow with warning
    log_warn "Unknown source state '$current_state' — allowing transition to $new_state"
    return 0
}

##
# Update deployment state with transition validation
#
# Wraps deployment_set_state with validation. If the transition is invalid,
# logs a warning but allows it with --force.
#
# Arguments:
#   $1 - Instance code
#   $2 - New state
#   $3 - Optional reason
#   $4 - Optional metadata JSON
#   $5 - Optional: "force" to override validation
#
# Returns:
#   0 - State updated
#   1 - Invalid transition (not forced)
##
pipeline_validated_set_state() {
    local instance_code="$1"
    local new_state="$2"
    local reason="${3:-}"
    local metadata="${4:-}"
    local force="${5:-}"
    local code_upper
    code_upper=$(upper "$instance_code")

    # Get current state
    local current_state
    current_state=$(deployment_get_state "$code_upper" 2>/dev/null || echo "UNKNOWN")

    # Validate transition
    if ! pipeline_validate_state_transition "$current_state" "$new_state" "$force"; then
        log_error "State transition rejected: $current_state -> $new_state for $code_upper"
        log_info "Use --force to override state validation"
        return 1
    fi

    # Proceed with state update
    deployment_set_state "$code_upper" "$new_state" "$reason" "$metadata"
    return $?
}

# =============================================================================
# HEARTBEAT & STUCK DEPLOYMENT DETECTION
# =============================================================================

##
# Initialize heartbeat file for deployment tracking
#
# Arguments:
#   $1 - Instance code
#   $2 - Deployment type (hub|spoke)
##
pipeline_heartbeat_init() {
    local instance_code="$1"
    local deploy_type="${2:-spoke}"
    local code_upper
    code_upper=$(upper "$instance_code")

    local heartbeat_dir="${DIVE_ROOT}/.dive-state/heartbeat"
    mkdir -p "$heartbeat_dir" 2>/dev/null || true

    export _PIPELINE_HEARTBEAT_FILE="${heartbeat_dir}/${deploy_type}-${code_upper}.heartbeat"

    # Write initial heartbeat
    pipeline_heartbeat_update "$code_upper" "INITIALIZING"
}

##
# Update heartbeat with current state and timestamp
#
# Arguments:
#   $1 - Instance code
#   $2 - Current state/phase
##
pipeline_heartbeat_update() {
    local instance_code="$1"
    local current_state="$2"

    if [ -n "${_PIPELINE_HEARTBEAT_FILE:-}" ]; then
        local ts
        ts=$(date +%s)
        printf '%s %s %s\n' "$ts" "$instance_code" "$current_state" > "$_PIPELINE_HEARTBEAT_FILE" 2>/dev/null || true
    fi
}

##
# Stop heartbeat (remove heartbeat file)
##
pipeline_heartbeat_stop() {
    if [ -n "${_PIPELINE_HEARTBEAT_FILE:-}" ] && [ -f "${_PIPELINE_HEARTBEAT_FILE}" ]; then
        rm -f "$_PIPELINE_HEARTBEAT_FILE" 2>/dev/null || true
    fi
    export _PIPELINE_HEARTBEAT_FILE=""
}

##
# Detect stuck deployments for an instance
#
# Checks if there's a heartbeat file that hasn't been updated within
# the timeout for its current state.
#
# Arguments:
#   $1 - Instance code
#   $2 - Deployment type (hub|spoke)
#
# Returns:
#   0 - Deployment appears stuck
#   1 - No stuck deployment detected
#
# Outputs:
#   If stuck: "STATE ELAPSED_SECONDS TIMEOUT_SECONDS" on stdout
##
pipeline_detect_stuck() {
    local instance_code="$1"
    local deploy_type="${2:-spoke}"
    local code_upper
    code_upper=$(upper "$instance_code")

    local heartbeat_file="${DIVE_ROOT}/.dive-state/heartbeat/${deploy_type}-${code_upper}.heartbeat"
    if [ ! -f "$heartbeat_file" ]; then
        return 1
    fi

    # Read heartbeat: timestamp instance_code state
    local hb_timestamp _hb_instance hb_state
    read -r hb_timestamp _hb_instance hb_state < "$heartbeat_file" 2>/dev/null || return 1

    # Check if state is an active state
    local is_active=false
    local s
    for s in $PIPELINE_ACTIVE_STATES; do
        if [ "$s" = "$hb_state" ]; then
            is_active=true
            break
        fi
    done

    if [ "$is_active" = "false" ]; then
        return 1
    fi

    # Get timeout for this state
    local timeout_var="PIPELINE_STUCK_TIMEOUT_${hb_state}"
    local timeout="${!timeout_var:-1800}"

    # Calculate elapsed time
    local now
    now=$(date +%s)
    local elapsed=$((now - hb_timestamp))

    if [ "$elapsed" -gt "$timeout" ]; then
        echo "$hb_state $elapsed $timeout"
        return 0
    fi

    return 1
}

##
# Check for stuck deployment before acquiring lock
#
# If a deployment appears stuck, offers to force-unlock (interactive)
# or automatically cleans up (non-interactive).
#
# Arguments:
#   $1 - Instance code
#   $2 - Deployment type (hub|spoke)
#
# Returns:
#   0 - No stuck deployment, or user chose to force-unlock
#   1 - User chose not to force-unlock
##
pipeline_check_stuck_before_lock() {
    local instance_code="$1"
    local deploy_type="${2:-spoke}"
    local code_upper
    code_upper=$(upper "$instance_code")

    local stuck_info
    stuck_info=$(pipeline_detect_stuck "$code_upper" "$deploy_type") || return 0

    local stuck_state stuck_elapsed stuck_timeout
    read -r stuck_state stuck_elapsed stuck_timeout <<< "$stuck_info"

    log_warn "Possible stuck deployment detected for $code_upper:"
    log_warn "  State: $stuck_state (stuck for ${stuck_elapsed}s, timeout: ${stuck_timeout}s)"

    # Non-interactive: auto-cleanup
    if ! is_interactive 2>/dev/null; then
        log_warn "Non-interactive mode: auto-cleaning stuck deployment state"
        pipeline_heartbeat_stop
        deployment_set_state "$code_upper" "FAILED" "Auto-recovered from stuck $stuck_state state" \
            "{\"stuck_state\":\"$stuck_state\",\"stuck_elapsed\":$stuck_elapsed,\"auto_recovered\":true}"
        return 0
    fi

    # Interactive: ask user
    echo ""
    echo "  A previous deployment appears to be stuck in $stuck_state state."
    echo "  It has been in this state for ${stuck_elapsed} seconds (timeout: ${stuck_timeout}s)."
    echo ""
    echo "  Options:"
    echo "    [f] Force-unlock and continue with new deployment"
    echo "    [c] Cancel (do not start new deployment)"
    echo ""

    local choice
    read -r -p "  Choose [f/c]: " choice
    case "$choice" in
        [Ff])
            log_info "Force-unlocking stuck deployment..."
            # Clean heartbeat
            local heartbeat_file="${DIVE_ROOT}/.dive-state/heartbeat/${deploy_type}-${code_upper}.heartbeat"
            rm -f "$heartbeat_file" 2>/dev/null || true
            # Mark as failed
            deployment_set_state "$code_upper" "FAILED" "Force-unlocked from stuck $stuck_state state" \
                "{\"stuck_state\":\"$stuck_state\",\"stuck_elapsed\":$stuck_elapsed,\"force_unlocked\":true}"
            return 0
            ;;
        *)
            log_info "Cancelled — not starting new deployment"
            return 1
            ;;
    esac
}

# =============================================================================
# STATE AUDIT & REPAIR
# =============================================================================

##
# Show current deployment state with metadata
#
# Arguments:
#   $1 - Deployment type (hub|spoke)
#   $2 - Instance code
##
pipeline_state_show() {
    local deploy_type="$1"
    local instance_code="$2"
    local code_upper
    code_upper=$(upper "$instance_code")

    echo ""
    echo "==============================================================================="
    echo "  Deployment State — ${deploy_type^^} ${code_upper}"
    echo "==============================================================================="
    echo ""

    # Current state from DB
    local current_state
    current_state=$(deployment_get_state "$code_upper" 2>/dev/null || echo "UNKNOWN")
    echo "  Current State: $current_state"

    # Heartbeat info
    local heartbeat_file="${DIVE_ROOT}/.dive-state/heartbeat/${deploy_type}-${code_upper}.heartbeat"
    if [ -f "$heartbeat_file" ]; then
        local hb_ts hb_inst hb_state
        read -r hb_ts hb_inst hb_state < "$heartbeat_file" 2>/dev/null
        if [ -n "$hb_ts" ]; then
            local now
            now=$(date +%s)
            local age=$((now - hb_ts))
            echo "  Heartbeat:     $hb_state (${age}s ago)"
        fi
    else
        echo "  Heartbeat:     none (no active deployment)"
    fi

    # Checkpoint status
    echo ""
    echo "  Checkpoint Status:"
    if [ "$deploy_type" = "hub" ]; then
        local ckpt_dir="${DIVE_ROOT}/.dive-state/hub/.phases"
        if [ -d "$ckpt_dir" ]; then
            local ckpt_count=0
            local ckpt_file
            for ckpt_file in "$ckpt_dir"/*.done; do
                [ -f "$ckpt_file" ] || continue
                local phase_name
                phase_name=$(basename "$ckpt_file" .done)
                ckpt_count=$((ckpt_count + 1))
                echo "    [+] $phase_name"
            done
            [ $ckpt_count -eq 0 ] && echo "    (no checkpoints)"
        else
            echo "    (no checkpoint directory)"
        fi
    else
        # Spoke checkpoints are DB-backed — check via function if available
        if type spoke_checkpoint_is_complete &>/dev/null; then
            local sp_phases=(PREFLIGHT INITIALIZATION DEPLOYMENT CONFIGURATION SEEDING VERIFICATION)
            local sp
            for sp in "${sp_phases[@]}"; do
                if spoke_checkpoint_is_complete "$code_upper" "$sp" 2>/dev/null; then
                    echo "    [+] $sp"
                else
                    echo "    [-] $sp"
                fi
            done
        else
            echo "    (checkpoint module not loaded)"
        fi
    fi

    # Log files
    echo ""
    echo "  Recent Logs:"
    local log_dir="${DIVE_ROOT}/.dive-state/logs"
    if [ -d "$log_dir" ]; then
        local log_pattern="deploy-${deploy_type}-${code_upper}-"
        local log_count=0
        local lf
        while IFS= read -r lf; do
            [ -z "$lf" ] && continue
            [ ! -f "$lf" ] && continue
            echo "    $(basename "$lf")"
            log_count=$((log_count + 1))
            [ "$log_count" -ge 5 ] && break
        done < <(ls -1r "${log_dir}/${log_pattern}"*.jsonl 2>/dev/null)
        [ "$log_count" -eq 0 ] && echo "    (no logs found)"
    else
        echo "    (no log directory)"
    fi

    echo ""
    echo "==============================================================================="
    echo ""
}

##
# Audit and repair deployment state
#
# Compares state DB against checkpoint files and container reality.
# Auto-fixes inconsistencies when --repair is specified.
#
# Arguments:
#   $1 - Deployment type (hub|spoke)
#   $2 - Instance code
#   $3 - Optional: "repair" to auto-fix inconsistencies
#
# Returns:
#   0 - State is consistent (or was repaired)
#   1 - Inconsistencies found (not repaired)
##
pipeline_state_audit() {
    local deploy_type="$1"
    local instance_code="$2"
    local repair_mode="${3:-}"
    local code_upper
    code_upper=$(upper "$instance_code")

    local issues=0
    local fixed=0

    echo ""
    echo "==============================================================================="
    echo "  State Audit — ${deploy_type^^} ${code_upper}"
    echo "==============================================================================="
    echo ""

    # Get current state from DB
    local current_state
    current_state=$(deployment_get_state "$code_upper" 2>/dev/null || echo "UNKNOWN")
    echo "  DB State: $current_state"

    # Check 1: State vs checkpoints
    echo ""
    echo "  Checking state consistency..."

    if [ "$deploy_type" = "hub" ]; then
        local ckpt_dir="${DIVE_ROOT}/.dive-state/hub/.phases"
        local all_complete=true
        local has_any=false

        if [ -d "$ckpt_dir" ]; then
            local hub_phases=(VAULT_BOOTSTRAP DATABASE_INIT PREFLIGHT INITIALIZATION MONGODB_INIT BUILD SERVICES VAULT_DB_ENGINE KEYCLOAK_CONFIG REALM_VERIFY KAS_REGISTER SEEDING KAS_INIT)
            local hp
            for hp in "${hub_phases[@]}"; do
                if [ -f "$ckpt_dir/${hp}.done" ]; then
                    has_any=true
                else
                    all_complete=false
                fi
            done
        fi

        # Inconsistency: all checkpoints complete but state is not COMPLETE
        if [ "$has_any" = "true" ] && [ "$all_complete" = "true" ] && [ "$current_state" != "COMPLETE" ]; then
            issues=$((issues + 1))
            echo "    [!] All checkpoints complete but state is $current_state (expected COMPLETE)"
            if [ "$repair_mode" = "repair" ]; then
                deployment_set_state "$code_upper" "COMPLETE" "Auto-repaired: all checkpoints complete" \
                    "{\"repaired\":true,\"previous_state\":\"$current_state\"}"
                echo "    [*] Repaired: state set to COMPLETE"
                fixed=$((fixed + 1))
            fi
        fi

        # Inconsistency: state is COMPLETE but not all checkpoints exist
        if [ "$current_state" = "COMPLETE" ] && [ "$all_complete" = "false" ] && [ "$has_any" = "true" ]; then
            issues=$((issues + 1))
            echo "    [!] State is COMPLETE but not all checkpoints exist"
            if [ "$repair_mode" = "repair" ]; then
                echo "    [*] Note: Cannot downgrade from COMPLETE (checkpoints may have been pruned)"
            fi
        fi
    fi

    # Check 2: Active state with no heartbeat (potentially crashed)
    local heartbeat_file="${DIVE_ROOT}/.dive-state/heartbeat/${deploy_type}-${code_upper}.heartbeat"
    local is_active=false
    for s in $PIPELINE_ACTIVE_STATES; do
        if [ "$s" = "$current_state" ]; then
            is_active=true
            break
        fi
    done

    if [ "$is_active" = "true" ] && [ ! -f "$heartbeat_file" ]; then
        issues=$((issues + 1))
        echo "    [!] State is $current_state (active) but no heartbeat file exists (deployment may have crashed)"
        if [ "$repair_mode" = "repair" ]; then
            deployment_set_state "$code_upper" "FAILED" "Auto-repaired: active state with no heartbeat" \
                "{\"repaired\":true,\"previous_state\":\"$current_state\",\"reason\":\"no_heartbeat\"}"
            echo "    [*] Repaired: state set to FAILED"
            fixed=$((fixed + 1))
        fi
    fi

    # Check 3: Stale heartbeat (stuck)
    if [ -f "$heartbeat_file" ]; then
        local stuck_info
        stuck_info=$(pipeline_detect_stuck "$code_upper" "$deploy_type") && {
            local stuck_state stuck_elapsed stuck_timeout
            read -r stuck_state stuck_elapsed stuck_timeout <<< "$stuck_info"
            issues=$((issues + 1))
            echo "    [!] Heartbeat is stale: $stuck_state for ${stuck_elapsed}s (timeout: ${stuck_timeout}s)"
            if [ "$repair_mode" = "repair" ]; then
                rm -f "$heartbeat_file" 2>/dev/null || true
                deployment_set_state "$code_upper" "FAILED" "Auto-repaired: stuck in $stuck_state" \
                    "{\"repaired\":true,\"previous_state\":\"$stuck_state\",\"stuck_elapsed\":$stuck_elapsed}"
                echo "    [*] Repaired: heartbeat removed, state set to FAILED"
                fixed=$((fixed + 1))
            fi
        }
    fi

    # Summary
    echo ""
    if [ $issues -eq 0 ]; then
        echo "  Result: No inconsistencies found"
    elif [ "$repair_mode" = "repair" ]; then
        echo "  Result: $issues issue(s) found, $fixed fixed"
    else
        echo "  Result: $issues issue(s) found"
        echo "  Run with --repair to auto-fix: ./dive ${deploy_type} state --repair"
    fi
    echo ""
    echo "==============================================================================="
    echo ""

    [ $issues -eq 0 ] || [ "$repair_mode" = "repair" -a $fixed -eq $issues ]
}

##
# Clean all deployment state for an instance
#
# Used during nuke to ensure clean state.
#
# Arguments:
#   $1 - Instance code (or "all" for all instances)
#   $2 - Deployment type (hub|spoke|all)
#   $3 - Optional: "preserve-logs" to keep log files
##
pipeline_state_cleanup() {
    local instance_code="$1"
    local deploy_type="${2:-all}"
    local preserve_logs="${3:-}"

    if [ "$instance_code" = "all" ]; then
        log_verbose "Cleaning all deployment state..."

        # Clear all heartbeat files
        rm -rf "${DIVE_ROOT}/.dive-state/heartbeat" 2>/dev/null || true

        # Clear hub checkpoints
        rm -rf "${DIVE_ROOT}/.dive-state/hub/.phases" 2>/dev/null || true

        # Clear timing data
        rm -rf "${DIVE_ROOT}/.dive-state/timing" 2>/dev/null || true

        # Clear logs (unless preserved)
        if [ "$preserve_logs" != "preserve-logs" ]; then
            rm -rf "${DIVE_ROOT}/.dive-state/logs" 2>/dev/null || true
        else
            log_verbose "  Preserving deployment logs"
        fi

        log_verbose "  All deployment state cleaned"
    else
        local code_upper
        code_upper=$(upper "$instance_code")

        # Clear instance-specific heartbeat
        if [ "$deploy_type" = "hub" ] || [ "$deploy_type" = "all" ]; then
            rm -f "${DIVE_ROOT}/.dive-state/heartbeat/hub-${code_upper}.heartbeat" 2>/dev/null || true
        fi
        if [ "$deploy_type" = "spoke" ] || [ "$deploy_type" = "all" ]; then
            rm -f "${DIVE_ROOT}/.dive-state/heartbeat/spoke-${code_upper}.heartbeat" 2>/dev/null || true
        fi

        # Clear hub checkpoints (hub is always USA)
        if [ "$deploy_type" = "hub" ] && [ "$code_upper" = "USA" ]; then
            rm -rf "${DIVE_ROOT}/.dive-state/hub/.phases" 2>/dev/null || true
        fi

        # Clear instance logs (unless preserved)
        if [ "$preserve_logs" != "preserve-logs" ]; then
            local log_dir="${DIVE_ROOT}/.dive-state/logs"
            if [ -d "$log_dir" ]; then
                rm -f "${log_dir}/deploy-hub-${code_upper}-"*.jsonl 2>/dev/null || true
                rm -f "${log_dir}/deploy-spoke-${code_upper}-"*.jsonl 2>/dev/null || true
            fi
        fi

        # Reset DB state
        if type orch_db_set_state &>/dev/null; then
            orch_db_set_state "$code_upper" "UNKNOWN" "State cleaned" "{\"cleaned\":true}" 2>/dev/null || true
        fi

        log_verbose "  Deployment state cleaned for $code_upper"
    fi
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f pipeline_validate_state_transition
export -f pipeline_validated_set_state
export -f pipeline_heartbeat_init
export -f pipeline_heartbeat_update
export -f pipeline_heartbeat_stop
export -f pipeline_detect_stuck
export -f pipeline_check_stuck_before_lock
export -f pipeline_state_show
export -f pipeline_state_audit
export -f pipeline_state_cleanup
export -f pipeline_log_init
export -f pipeline_log_structured
export -f pipeline_log_finalize
export -f pipeline_log_get_path
export -f pipeline_timing_reset
export -f pipeline_timing_start
export -f pipeline_timing_end
export -f pipeline_get_phase_timing
export -f pipeline_timing_print
export -f pipeline_show_history
export -f pipeline_clear_phases
export -f pipeline_register_phase
export -f pipeline_get_phase_count
export -f pipeline_get_phase_names
export -f deployment_acquire_lock
export -f deployment_release_lock
export -f deployment_run_phase
export -f deployment_check_threshold
export -f deployment_set_state
export -f deployment_get_state
export -f deployment_rollback
export -f deployment_print_success
export -f deployment_print_failure
export -f pipeline_install_sigint_handler
export -f pipeline_uninstall_sigint_handler
export -f pipeline_check_sigint
export -f _pipeline_sigint_handler
export -f _pipeline_save_interrupt_checkpoint
export -f pipeline_is_dry_run
export -f pipeline_is_validation_phase
export -f pipeline_dry_run_phase
export -f pipeline_dry_run_reset
export -f pipeline_dry_run_record_execute
export -f pipeline_dry_run_record_skip
export -f pipeline_dry_run_record_validation
export -f pipeline_dry_run_record_warning
export -f pipeline_dry_run_summary

log_verbose "Pipeline common module loaded"

# sc2034-anchor
: "${PIPELINE_MODE_DEPLOY:-}" "${PIPELINE_MODE_REDEPLOY:-}" "${PIPELINE_MODE_UP:-}" "${PIPELINE_PHASE_COMPLETE:-}" "${PIPELINE_PHASE_CONFIGURATION:-}" "${PIPELINE_PHASE_DEPLOYMENT:-}"
: "${PIPELINE_PHASE_INITIALIZATION:-}" "${PIPELINE_PHASE_PREFLIGHT:-}" "${PIPELINE_PHASE_VERIFICATION:-}" "${PIPELINE_DRY_RUN_VALIDATION_PHASES:-}"
: "${PIPELINE_STATE_UNKNOWN:-}" "${PIPELINE_STATE_INITIALIZING:-}" "${PIPELINE_STATE_DEPLOYING:-}" "${PIPELINE_STATE_CONFIGURING:-}"
: "${PIPELINE_STATE_VERIFYING:-}" "${PIPELINE_STATE_COMPLETE:-}" "${PIPELINE_STATE_FAILED:-}" "${PIPELINE_STATE_INTERRUPTED:-}"
: "${PIPELINE_ACTIVE_STATES:-}" "${PIPELINE_STUCK_TIMEOUT_INITIALIZING:-}" "${PIPELINE_STUCK_TIMEOUT_DEPLOYING:-}"
: "${PIPELINE_STUCK_TIMEOUT_CONFIGURING:-}" "${PIPELINE_STUCK_TIMEOUT_VERIFYING:-}"
