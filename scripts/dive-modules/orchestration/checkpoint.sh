# =============================================================================
# DIVE V3 - Orchestration Checkpoints, Metrics & Validation
# =============================================================================
# Sourced by orchestration/framework.sh — do not execute directly.
#
# Checkpoint management, rollback, metrics collection, dashboard,
# state validation, consistency checks
# =============================================================================

orch_create_checkpoint() {
    local instance_code="$1"
    local level="${2:-$CHECKPOINT_COMPLETE}"
    local description="${3:-Auto checkpoint}"

    # CRITICAL SIMPLIFICATION (2026-01-15): Database-only checkpoints
    # Root cause: Dual file/database system is flaky and causes issues
    # Previous: Created .dive-checkpoints/ files + database records
    # Fixed: Database ONLY - single source of truth
    #
    # Benefits:
    # - No file synchronization issues
    # - No stale checkpoint cleanup needed
    # - No disk I/O for checkpoint storage
    # - Database transactions ensure consistency
    # - Simpler rollback logic

    local checkpoint_id="$(date +%Y%m%d_%H%M%S)_${instance_code}_${level}"

    log_verbose "Creating $level checkpoint: $checkpoint_id (database-only)" >&2

    # Store checkpoint in database ONLY
    if orch_db_check_connection; then
        local code_lower=$(lower "$instance_code")
        local escaped_description="${description//\'/\'\'}"

        # CRITICAL FIX (2026-01-22): Use correct table name 'checkpoints' not 'orchestration_checkpoints'
        # ROOT CAUSE: Table name mismatch between schema and code caused INSERT failures
        orch_db_exec "
        INSERT INTO checkpoints (
            checkpoint_id, instance_code, checkpoint_level, description, created_at
        ) VALUES (
            '$checkpoint_id', '$code_lower', '$level', '$escaped_description', NOW()
        )" >/dev/null 2>&1 || true
    fi

    # Return checkpoint ID on stdout (no logging)
    echo "$checkpoint_id"
}

##
# Checkpoint container states
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint directory
##
orch_checkpoint_containers() {
    local instance_code="$1"
    local checkpoint_dir="$2"

    log_verbose "Checkpointing container states..."

    # Container status
    docker ps -a --filter "name=dive-spoke-${instance_code}" \
        --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" \
        > "${checkpoint_dir}/containers.tsv" 2>/dev/null || true

    # Container images (for recreation)
    docker ps -a --filter "name=dive-spoke-${instance_code}" \
        --format "table {{.Names}}\t{{.Image}}" \
        > "${checkpoint_dir}/container_images.tsv" 2>/dev/null || true

    # Network connections
    docker inspect $(docker ps -q --filter "name=dive-spoke-${instance_code}" 2>/dev/null || true) \
        --format='{{.Name}}: {{range .NetworkSettings.Networks}}{{.NetworkID}} {{end}}' \
        > "${checkpoint_dir}/networks.txt" 2>/dev/null || true
}

##
# Checkpoint configuration files
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint directory
##
orch_checkpoint_configuration() {
    local instance_code="$1"
    local checkpoint_dir="$2"

    log_verbose "Checkpointing configuration files..."

    local instance_dir="${DIVE_ROOT}/instances/${instance_code}"

    # Copy configuration files
    cp "${instance_dir}/.env" "${checkpoint_dir}/.env" 2>/dev/null || true
    cp "${instance_dir}/docker-compose.yml" "${checkpoint_dir}/docker-compose.yml" 2>/dev/null || true

    # Backup environment file with timestamp
    cp "${instance_dir}/.env" "${checkpoint_dir}/.env.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
}

##
# Checkpoint Keycloak realm state
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint directory
##
orch_checkpoint_keycloak() {
    local instance_code="$1"
    local checkpoint_dir="$2"

    log_verbose "Checkpointing Keycloak realm state..."

    local kc_container="dive-spoke-${instance_code}-keycloak"
    local realm="dive-v3-broker-${instance_code}"

    # Export realm configuration
    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh get realms/"$realm" \
            >/dev/null 2>&1 && \
        docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh get realms/"$realm" \
            > "${checkpoint_dir}/keycloak_realm.json" 2>/dev/null || true

        # Export client configurations
        docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh get clients -r "$realm" \
            --fields id,clientId,enabled,redirectUris,webOrigins \
            > "${checkpoint_dir}/keycloak_clients.json" 2>/dev/null || true
    fi
}

##
# Checkpoint federation configuration
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint directory
##
orch_checkpoint_federation() {
    local instance_code="$1"
    local checkpoint_dir="$2"

    log_verbose "Checkpointing federation configuration..."

    # Export federation registry entries
    if [ -f "${DIVE_ROOT}/config/federation-registry.json" ]; then
        jq ".instances.\"${instance_code}\"" "${DIVE_ROOT}/config/federation-registry.json" \
            > "${checkpoint_dir}/federation_registry.json" 2>/dev/null || true
    fi
}

##
# Execute automatic rollback on failure
#
# Arguments:
#   $1 - Instance code
#   $2 - Failure reason
#   $3 - Rollback strategy (optional, default: CONFIG)
##
orch_execute_rollback() {
    local instance_code="$1"
    local failure_reason="$2"
    local strategy="${3:-$ROLLBACK_CONFIG}"

    log_error "Executing automatic rollback for $instance_code"
    log_error "Failure reason: $failure_reason"
    log_error "Rollback strategy: $strategy"

    # Find latest checkpoint
    local latest_checkpoint
    latest_checkpoint=$(orch_find_latest_checkpoint "$instance_code")

    if [ -z "$latest_checkpoint" ]; then
        log_error "No checkpoint available for rollback"
        return 1
    fi

    log_info "Rolling back to checkpoint: $latest_checkpoint"

    # Execute rollback based on strategy
    case "$strategy" in
        "$ROLLBACK_STOP")
            orch_rollback_stop_services "$instance_code"
            ;;
        "$ROLLBACK_CONFIG")
            orch_rollback_configuration "$instance_code" "$latest_checkpoint"
            ;;
        "$ROLLBACK_CONTAINERS")
            orch_rollback_containers "$instance_code" "$latest_checkpoint"
            ;;
        "$ROLLBACK_COMPLETE")
            orch_rollback_complete "$instance_code" "$latest_checkpoint"
            ;;
        *)
            log_error "Unknown rollback strategy: $strategy"
            return 1
            ;;
    esac

    # Update state
    set_deployment_state_enhanced "$instance_code" "ROLLED_BACK" "$failure_reason" \
        "{\"rollback_checkpoint\":\"$latest_checkpoint\",\"strategy\":\"$strategy\"}"

    orch_record_error "ROLLBACK_EXECUTED" "$ORCH_SEVERITY_MEDIUM" \
        "Automatic rollback completed" "rollback" \
        "Verify system state and retry deployment if needed" \
        "{\"instance_code\":\"$instance_code\",\"checkpoint\":\"$latest_checkpoint\",\"strategy\":\"$strategy\"}"

    log_warn "Rollback completed. Manual verification recommended."
}

##
# Find latest checkpoint for instance
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   Latest checkpoint ID, or empty string if none found
##
orch_find_latest_checkpoint() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    # CRITICAL FIX (2026-01-15): Database-only checkpoints
    # Previous: Searched .dive-checkpoints/ filesystem
    # Fixed: Query database for latest checkpoint

    if ! orch_db_check_connection; then
        echo ""
        return 1
    fi

    local checkpoint_id
    # CRITICAL FIX (2026-01-22): Use correct table name 'checkpoints'
    checkpoint_id=$(orch_db_exec "
        SELECT checkpoint_id
        FROM checkpoints
        WHERE instance_code = '$code_lower'
        ORDER BY created_at DESC
        LIMIT 1
    " 2>/dev/null | xargs)

    if [ -n "$checkpoint_id" ]; then
        echo "$checkpoint_id"
        return 0
    fi

    echo ""
    return 1
}

##
# Rollback: Stop services only
#
# Arguments:
#   $1 - Instance code
##
orch_rollback_stop_services() {
    local instance_code="$1"

    log_info "Stopping services for rollback..."

    cd "${DIVE_ROOT}/instances/${instance_code}"
    docker compose down 2>/dev/null || true

    log_success "Services stopped"
}

##
# Rollback: Restore configuration files
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint ID
##
orch_rollback_configuration() {
    local instance_code="$1"
    local checkpoint_id="$2"

    # CRITICAL SIMPLIFICATION (2026-01-15): Database-only rollback
    # Root cause: File-based checkpoint restoration is flaky and unnecessary
    # Previous: Restored .env, docker-compose.yml from checkpoint files
    # Fixed: These files are regenerated from SSOT (templates) on redeployment
    #
    # Best Practice: Don't restore config files - regenerate from authoritative sources
    # - .env: Generated from template + secrets from GCP
    # - spoke config: Computed from get_instance_ports / spoke_config_get
    # - docker-compose.yml: Generated from template

    log_info "Configuration rollback skipped - files regenerated from templates on redeploy"

    # Note: Actual rollback is handled by stopping containers and redeploying
    # Database state tracks deployment phase for recovery
    return 0
}

##
# Rollback: Recreate containers
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint ID
##
orch_rollback_containers() {
    local instance_code="$1"
    local checkpoint_id="$2"

    # CRITICAL SIMPLIFICATION (2026-01-15): Database-only rollback
    # Rollback = stop containers, database tracks state for recovery
    # Previous: Stopped + restarted containers from checkpoint files
    # Fixed: Just stop containers, redeployment handles recreation

    log_info "Stopping containers for rollback..."

    # Stop existing containers
    orch_rollback_stop_services "$instance_code"

    log_success "Containers stopped for rollback"
    log_info "To recover: redeploy the spoke instance"
}

##
# Complete system rollback
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint ID
##
##
# Complete system rollback with comprehensive cleanup
#
# This function performs a complete rollback including:
# 1. Stop and remove all containers
# 2. Remove Docker networks
# 3. Clean Terraform state
# 4. Remove orchestration database entries
# 5. Clear checkpoints
# 6. Optionally remove instance directory (--clean-slate)
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint ID (unused, kept for compatibility)
#   $3 - Clean slate flag (optional: "clean-slate" to remove instance directory)
##
orch_rollback_complete() {
    local instance_code="$1"
    local checkpoint_id="$2"
    local clean_slate="${3:-}"

    log_info "Executing comprehensive rollback for $instance_code..."
    local code_lower=$(lower "$instance_code")
    local instance_dir="${DIVE_ROOT}/instances/${code_lower}"

    # Track what was cleaned
    local cleaned=0
    local total_steps=6

    # Step 1: Stop and remove all containers with volumes
    log_step "1/$total_steps: Stopping and removing containers..."
    if [ -d "$instance_dir" ] && [ -f "$instance_dir/docker-compose.yml" ]; then
        cd "$instance_dir"
        if docker compose down -v --remove-orphans 2>&1 | grep -q "Removed\|Stopped"; then
            log_success "✓ Containers stopped and removed"
            ((cleaned++))
        else
            # Fallback: manually remove containers
            docker ps -a --filter "name=dive-spoke-${code_lower}-" -q | grep . | xargs docker rm -f 2>/dev/null && ((cleaned++))
        fi
        cd "$DIVE_ROOT"
    else
        log_verbose "No docker-compose.yml found - skipping container cleanup"
    fi

    # Step 2: Remove Docker networks
    log_step "2/$total_steps: Cleaning Docker networks..."
    local networks=$(docker network ls --filter "name=dive-spoke-${code_lower}" -q 2>/dev/null)
    if [ -n "$networks" ]; then
        echo "$networks" | grep . | xargs docker network rm 2>/dev/null && {
            log_success "✓ Docker networks removed"
            ((cleaned++))
        }
    else
        log_verbose "No networks to clean"
    fi

    # Step 3: Clean Terraform state
    log_step "3/$total_steps: Cleaning Terraform state..."
    local tf_spoke_dir="${DIVE_ROOT}/terraform/spoke"
    if [ -d "$tf_spoke_dir" ]; then
        cd "$tf_spoke_dir"

        # Remove workspace if it exists
        if terraform workspace list 2>/dev/null | grep -q "$code_lower"; then
            terraform workspace select default 2>/dev/null || true
            terraform workspace delete "$code_lower" 2>/dev/null && {
                log_success "✓ Terraform workspace deleted"
                ((cleaned++))
            }
        else
            log_verbose "No Terraform workspace to clean"
        fi

        # Remove state files
        rm -f "terraform.tfstate.d/${code_lower}/terraform.tfstate" 2>/dev/null
        rm -rf ".terraform" 2>/dev/null

        cd "$DIVE_ROOT"
    else
        log_verbose "Terraform directory not found"
    fi

    # Step 4: Remove orchestration state
    log_step "4/$total_steps: Cleaning orchestration database..."
    if type orch_db_delete_instance &>/dev/null && orch_db_check_connection 2>/dev/null; then
        if orch_db_delete_instance "$instance_code"; then
            log_success "✓ Orchestration state removed"
            ((cleaned++))
        fi
    else
        log_verbose "Database not available or function not found"
    fi

    # Step 5: Clear checkpoints
    log_step "5/$total_steps: Clearing checkpoints..."
    if type spoke_checkpoint_clear_all &>/dev/null; then
        if spoke_checkpoint_clear_all "$instance_code" "confirm"; then
            log_success "✓ Checkpoints cleared"
            ((cleaned++))
        fi
    else
        # Manual checkpoint cleanup
        if [ -d "$instance_dir/.phases" ]; then
            rm -rf "$instance_dir/.phases" 2>/dev/null && {
                log_success "✓ Checkpoints cleared (manual)"
                ((cleaned++))
            }
        fi
    fi

    # Step 6: Optionally remove instance directory
    if [ "$clean_slate" = "clean-slate" ]; then
        log_step "6/$total_steps: Removing instance directory (clean slate)..."
        if [ -d "$instance_dir" ]; then
            # Backup critical files before removal
            local backup_dir="${DIVE_ROOT}/.rollback-backups/${code_lower}-$(date +%Y%m%d-%H%M%S)"
            mkdir -p "$backup_dir"

            # Backup config files if they exist
            [ -f "$instance_dir/.env" ] && cp "$instance_dir/.env" "$backup_dir/" 2>/dev/null

            # Remove instance directory
            rm -rf "$instance_dir" 2>/dev/null && {
                log_success "✓ Instance directory removed (backup: $backup_dir)"
                ((cleaned++))
            }
        else
            log_verbose "No instance directory to remove"
        fi
    else
        log_verbose "6/$total_steps: Instance directory preserved (use --clean-slate to remove)"
    fi

    # Summary
    echo ""
    if [ $cleaned -gt 0 ]; then
        log_success "Rollback complete: $cleaned/$total_steps steps completed"
    else
        log_warn "Rollback complete: No cleanup performed (nothing to clean)"
    fi

    # Update database state to FAILED
    if orch_db_check_connection 2>/dev/null; then
        orch_db_set_state "$instance_code" "FAILED" "Rollback executed - manual redeploy required" \
            "{\"rollback_timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"clean_slate\":\"$clean_slate\"}"
    fi

    echo ""
    log_info "Recovery options:"
    log_info "  • Full redeploy: ./dive spoke deploy $instance_code"
    if [ "$clean_slate" != "clean-slate" ]; then
        log_info "  • Clean slate:   ./dive spoke rollback $instance_code --clean-slate"
    fi
    echo ""

    return 0
}


# Load checkpoint recovery functions
source "$(dirname "${BASH_SOURCE[0]}")/checkpoint-recovery.sh"

# STATE CONSISTENCY VALIDATION (Phase 3.3)
# =============================================================================
# Validates that orchestration DB state matches actual system state.
# Detects and corrects inconsistencies like:
# - DB shows "deployed" but containers not running
# - DB shows "unregistered" but containers running
# - DB shows "complete" but realm missing
# =============================================================================

##
# Validate state consistency between orchestration DB and actual system
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - State consistent or corrected
#   1 - Fatal inconsistency that requires manual intervention
##
orch_validate_state_consistency() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_verbose "Validating state consistency for $instance_code..."

    # Get current DB state
    local db_state="UNKNOWN"
    if type orch_db_get_state &>/dev/null && orch_db_check_connection 2>/dev/null; then
        db_state=$(orch_db_get_state "$instance_code" 2>/dev/null || echo "UNKNOWN")
    fi

    # Determine actual system state
    local actual_state=$(orch_determine_actual_state "$instance_code")

    log_verbose "DB state: $db_state | Actual state: $actual_state"

    # If states match, we're good
    if [ "$db_state" = "$actual_state" ]; then
        log_verbose "State consistent: $db_state"
        return 0
    fi

    # States don't match - auto-correct if possible
    log_warn "State inconsistency detected:"
    log_warn "  DB shows: $db_state"
    log_warn "  Actual:   $actual_state"

    # Auto-correct the DB state
    if type orch_db_set_state &>/dev/null && orch_db_check_connection 2>/dev/null; then
        if orch_db_set_state "$instance_code" "$actual_state" "Auto-corrected from $db_state" \
            "{\"previous_state\":\"$db_state\",\"corrected_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"; then
            log_success "✓ State corrected: $db_state → $actual_state"
            return 0
        else
            log_error "Failed to correct state in database"
            return 1
        fi
    else
        log_warn "Cannot auto-correct - database unavailable"
        return 1
    fi
}

##
# Determine actual deployment state by inspecting the system
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   State name on stdout (UNKNOWN, PARTIAL, COMPLETE, FAILED, etc.)
##
orch_determine_actual_state() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    # Check 1: Do containers exist?
    local container_count=$(docker ps -a --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$container_count" -eq 0 ]; then
        # No containers = not deployed
        echo "UNKNOWN"
        return 0
    fi

    # Check 2: Are containers running?
    local running_count=$(docker ps --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$running_count" -eq 0 ]; then
        # Containers exist but none running = failed or rolled back
        echo "FAILED"
        return 0
    fi

    # Check 3: Are core services healthy?
    local core_services=("keycloak" "backend" "postgres")
    local healthy_core=0

    for service in "${core_services[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-healthcheck")
            if [ "$health" = "healthy" ] || [ "$health" = "no-healthcheck" ]; then
                ((healthy_core++))
            fi
        fi
    done

    if [ $healthy_core -lt 2 ]; then
        # Core services not healthy = deploying or failed
        echo "DEPLOYING"
        return 0
    fi

    # Check 4: Does Keycloak realm exist?
    local kc_container="dive-spoke-${code_lower}-keycloak"
    local realm="dive-v3-broker-${code_lower}"

    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        local realm_check=$(docker exec "$kc_container" curl -sf \
            "http://localhost:8080/realms/${realm}" 2>/dev/null | \
            jq -r '.realm // empty' 2>/dev/null)

        if [ "$realm_check" != "$realm" ]; then
            # Containers healthy but realm missing = PARTIAL deployment
            echo "PARTIAL"
            return 0
        fi
    fi

    # Check 5: Is spoke registered in Hub?
    local backend_container="dive-spoke-${code_lower}-backend"
    if docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        # Check if backend can reach Hub (indicates federation)
        local hub_check=$(docker exec "$backend_container" curl -sf \
            "https://dive-hub-backend:4000/health" 2>/dev/null | \
            jq -r '.status // empty' 2>/dev/null)

        if [ -z "$hub_check" ]; then
            # Backend running but can't reach Hub = PARTIAL (federation not setup)
            echo "PARTIAL"
            return 0
        fi
    fi

    # All checks passed = COMPLETE
    echo "COMPLETE"
    return 0
}

# =============================================================================
# PHASE MANAGEMENT
# =============================================================================

##
# Execute orchestration phase with error handling
#
# Arguments:
#   $1 - Phase name
#   $2 - Phase function to execute
#
# Returns:
#   0 - Phase completed successfully
#   1 - Phase failed
##
