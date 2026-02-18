# =============================================================================
# DIVE V3 - Orchestration Dependency Graph & Context
# =============================================================================
# Sourced by orchestration/framework.sh — do not execute directly.
#
# Dependency graph resolution, circular detection, level calculation,
# deployment locking, context management, error recording
# =============================================================================

orch_detect_circular_dependencies() {
    log_verbose "Validating service dependency graph for circular dependencies..."

    local visited_services=""
    local cycles_found=0

    for service in "${!SERVICE_DEPENDENCIES[@]}"; do
        # Check if already visited
        if [[ " $visited_services " =~ " $service " ]]; then
            continue
        fi

        # Check this service and its dependencies
        # Capture cycle path from stderr if cycle detected
        local cycle_result
        cycle_result=$(_orch_check_cycle "$service" "" 2>&1)
        local cycle_exit=$?

        if [ $cycle_exit -ne 0 ]; then
            # Cycle detected
            ((cycles_found++))
            log_error "❌ Circular dependency detected!"
            log_error "Dependency cycle: $cycle_result"

            # Parse and display the cycle clearly
            local cycle_services=($cycle_result)
            log_error ""
            log_error "  Cycle visualization:"
            local prev=""
            for svc in "${cycle_services[@]}"; do
                if [ -n "$prev" ]; then
                    log_error "    $prev → $svc"
                fi
                prev="$svc"
            done
            log_error ""
        fi

        # Mark as visited
        visited_services="$visited_services $service"
    done

    if [ $cycles_found -gt 0 ]; then
        log_error "Found $cycles_found circular dependency chain(s)"
        log_error "Please fix SERVICE_DEPENDENCIES in orchestration-framework.sh"
        return 1
    fi

    log_success "✅ No circular dependencies found in service dependency graph"
    return 0
}

##
# Print visual dependency graph
#
# Arguments:
#   $1 - Output format: "text" or "mermaid" (default: text)
##
orch_print_dependency_graph() {
    local format="${1:-text}"

    case "$format" in
        mermaid)
            echo "```mermaid"
            echo "graph TD"
            for service in "${!SERVICE_DEPENDENCIES[@]}"; do
                local deps="${SERVICE_DEPENDENCIES[$service]}"
                if [ "$deps" = "none" ] || [ -z "$deps" ]; then
                    echo "    ${service}[${service}]"
                else
                    IFS=',' read -ra DEP_ARRAY <<< "$deps"
                    for dep in "${DEP_ARRAY[@]}"; do
                        dep=$(echo "$dep" | xargs)
                        echo "    ${dep} --> ${service}"
                    done
                fi
            done
            echo "```"
            ;;
        text|*)
            echo "=== Service Dependency Graph ==="
            echo ""

            # Group by dependency level
            local max_level=0
            declare -A service_levels

            for service in "${!SERVICE_DEPENDENCIES[@]}"; do
                local level=$(orch_calculate_dependency_level "$service")
                service_levels["$service"]=$level
                [ $level -gt $max_level ] && max_level=$level
            done

            for ((lvl=0; lvl<=max_level; lvl++)); do
                echo "Level $lvl ($([ $lvl -eq 0 ] && echo "no dependencies" || echo "depends on level $((lvl-1))"))):"
                for service in "${!service_levels[@]}"; do
                    if [ "${service_levels[$service]}" -eq $lvl ]; then
                        local deps="${SERVICE_DEPENDENCIES[$service]}"
                        if [ "$deps" = "none" ] || [ -z "$deps" ]; then
                            echo "  • $service"
                        else
                            echo "  • $service ← [$deps]"
                        fi
                    fi
                done
                echo ""
            done
            ;;
    esac
}

##
# Get services at a specific dependency level
#
# Arguments:
#   $1 - Dependency level (0, 1, 2, ...)
#
# Returns:
#   Space-separated list of services at that level
##
orch_get_services_at_level() {
    local target_level="$1"
    local services=""

    for service in "${!SERVICE_DEPENDENCIES[@]}"; do
        local level=$(orch_calculate_dependency_level "$service")
        if [ "$level" -eq "$target_level" ]; then
            services="$services $service"
        fi
    done

    echo "$services" | xargs
}

##
# Get maximum dependency level in the graph
#
# Returns:
#   Maximum level number
##
orch_get_max_dependency_level() {
    local max_level=0

    for service in "${!SERVICE_DEPENDENCIES[@]}"; do
        local level=$(orch_calculate_dependency_level "$service")
        [ $level -gt $max_level ] && max_level=$level
    done

    echo $max_level
}

##
# Check for circular dependency (internal helper)
#
# Arguments:
#   $1 - Current service
#   $2 - Path so far (space-separated)
#
# Returns:
#   0 - No cycle
#   1 - Cycle detected (prints cycle path to stderr)
##
_orch_check_cycle() {
    local service="$1"
    local path="$2"

    # Check if service is in current path (cycle!)
    if [[ " $path " =~ " $service " ]]; then
        # Cycle detected - output the cycle path
        echo "$path $service" >&2
        return 1  # Cycle detected
    fi

    # Add to path
    local new_path="$path $service"

    # Get dependencies
    local deps="${SERVICE_DEPENDENCIES[$service]}"

    # Process dependencies
    if [ "$deps" != "none" ] && [ -n "$deps" ]; then
        IFS=',' read -ra DEP_ARRAY <<< "$deps"
        for dep in "${DEP_ARRAY[@]}"; do
            dep=$(echo "$dep" | xargs)  # Trim whitespace

            # Validate dependency exists
            if [ -z "${SERVICE_DEPENDENCIES[$dep]}" ]; then
                log_verbose "Service $service depends on undefined service: $dep (will be treated as leaf)"
                continue
            fi

            # Recurse - if returns 1 (cycle), propagate up
            if ! _orch_check_cycle "$dep" "$new_path"; then
                return 1  # Cycle found in recursion
            fi
        done
    fi

    return 0  # No cycle found
}

##
# Calculate dependency level for a service (for parallel startup)
#
# Arguments:
#   $1 - Service name
#
# Returns:
#   Dependency level (0 = no deps, 1 = depends on level 0, etc.)
##
orch_calculate_dependency_level() {
    local service="$1"
    _orch_calc_level "$service" ""
}

##
# Recursive dependency level calculation (internal helper)
#
# Arguments:
#   $1 - Service name
#   $2 - Already calculated levels (space-separated "service:level")
#
# Returns:
#   Dependency level (via echo)
##
_orch_calc_level() {
    local service="$1"
    local calculated="$2"

    # Check if already calculated
    for entry in $calculated; do
        local svc="${entry%%:*}"
        local lvl="${entry##*:}"
        if [ "$svc" = "$service" ]; then
            echo "$lvl"
            return 0
        fi
    done

    local deps="${SERVICE_DEPENDENCIES[$service]}"

    # No dependencies = level 0
    if [ "$deps" = "none" ] || [ -z "$deps" ]; then
        echo "0"
        return 0
    fi

    # Calculate max dependency level + 1
    local max_dep_level=0
    IFS=',' read -ra DEP_ARRAY <<< "$deps"
    for dep in "${DEP_ARRAY[@]}"; do
        dep=$(echo "$dep" | xargs)

        # Recurse to get dependency's level
        local dep_level=$(_orch_calc_level "$dep" "$calculated")
        calculated="$calculated $dep:$dep_level"

        if [ "$dep_level" -gt "$max_dep_level" ]; then
            max_dep_level=$dep_level
        fi
    done

    echo $((max_dep_level + 1))
}

# Service startup timeouts (seconds)
# Updated 2026-01-25: Migrated to config/deployment-timeouts.env (Phase 2)
# Values can be overridden via environment variables before deployment
# Rationale: Each timeout calculated as P99 startup time + safety margin
declare -A SERVICE_TIMEOUTS=(
    ["postgres"]="${TIMEOUT_POSTGRES:-60}"
    ["mongodb"]="${TIMEOUT_MONGODB:-90}"
    ["redis"]="${TIMEOUT_REDIS:-30}"
    ["redis-blacklist"]="${TIMEOUT_REDIS_BLACKLIST:-30}"
    ["keycloak"]="${TIMEOUT_KEYCLOAK:-180}"
    ["backend"]="${TIMEOUT_BACKEND:-120}"
    ["frontend"]="${TIMEOUT_FRONTEND:-90}"
    ["opa"]="${TIMEOUT_OPA:-30}"
    ["kas"]="${TIMEOUT_KAS:-60}"
    ["opal-client"]="${TIMEOUT_OPAL_CLIENT:-30}"
    ["opal-server"]="${TIMEOUT_OPAL_SERVER:-60}"
    ["opal-data-source"]="${TIMEOUT_OPAL_DATA_SOURCE:-30}"
    ["authzforce"]="${TIMEOUT_AUTHZFORCE:-90}"
    ["otel-collector"]="${TIMEOUT_OTEL_COLLECTOR:-30}"
    ["prometheus"]="${TIMEOUT_PROMETHEUS:-45}"
    ["grafana"]="${TIMEOUT_GRAFANA:-45}"
    ["loki"]="${TIMEOUT_LOKI:-45}"
    ["tempo"]="${TIMEOUT_TEMPO:-45}"
    ["nginx"]="${TIMEOUT_NGINX:-20}"
    ["cloudflared"]="${TIMEOUT_CLOUDFLARED:-30}"
)

# Timeout bounds for dynamic calculation (Phase 3 enhancement)
declare -A SERVICE_MIN_TIMEOUTS=(
    ["keycloak"]="${TIMEOUT_KEYCLOAK_MIN:-180}"
    ["backend"]="${TIMEOUT_BACKEND_MIN:-90}"
    ["frontend"]="${TIMEOUT_FRONTEND_MIN:-45}"
)

declare -A SERVICE_MAX_TIMEOUTS=(
    ["keycloak"]="${TIMEOUT_KEYCLOAK_MAX:-300}"
    ["backend"]="${TIMEOUT_BACKEND_MAX:-180}"
    ["frontend"]="${TIMEOUT_FRONTEND_MAX:-90}"
)

# =============================================================================
# ORCHESTRATION CONTEXT MANAGEMENT
# =============================================================================

# Global orchestration context
declare -A ORCH_CONTEXT=(
    [instance_code]=""
    [instance_name]=""
    [start_time]=""
    [current_phase]=""
    [errors_critical]=0
    [errors_high]=0
    [errors_medium]=0
    [errors_low]=0
    [retry_count]=0
    [checkpoint_enabled]="true"
    [lock_acquired]="false"
    [lock_fd]=0
)

# Error tracking
declare -a ORCHESTRATION_ERRORS=()

# =============================================================================
# CONCURRENT DEPLOYMENT PROTECTION (GAP-001 Fix - PostgreSQL Only)
# =============================================================================
# Uses PostgreSQL advisory locks exclusively to prevent concurrent deployments
# of the same instance from corrupting state.
#
# NOTE (2026-01-22): File-based locking has been REMOVED as part of the
# database-only state management refactoring. PostgreSQL advisory locks
# are now the SOLE locking mechanism.
#
# For Hub (USA) deployments where the database doesn't exist yet:
# - Lock is skipped (Hub creates the database)
# - Concurrent Hub deployments are prevented by Docker container names
# =============================================================================

##
# Acquire deployment lock for instance (PostgreSQL advisory lock only)
#
# Arguments:
#   $1 - Instance code
#   $2 - Timeout seconds (optional, default: 30)
#
# Returns:
#   0 - Lock acquired
#   1 - Lock acquisition failed (another deployment in progress)
##
orch_acquire_deployment_lock() {
    local instance_code="$1"
    local timeout="${2:-30}"
    local code_upper=$(upper "$instance_code")

    # Ensure ORCH_CONTEXT exists (in case module was sourced in subshell)
    if ! declare -p ORCH_CONTEXT &>/dev/null; then
        declare -gA ORCH_CONTEXT=(
            [instance_code]=""
            [instance_name]=""
            [start_time]=""
            [current_phase]=""
            [errors_critical]=0
            [errors_high]=0
            [errors_medium]=0
            [errors_low]=0
            [retry_count]=0
            [checkpoint_enabled]="true"
            [lock_acquired]="false"
            [lock_fd]=0
        )
    fi

    log_verbose "Attempting to acquire deployment lock for $instance_code (timeout: ${timeout}s)..."

    # REMOTE MODE: No Hub PostgreSQL available — use file-based locking only
    if [ "${ORCH_DB_ENABLED:-true}" = "false" ] || [ "${DEPLOYMENT_MODE:-local}" = "remote" ]; then
        local lock_dir="${DIVE_ROOT}/.dive-state"
        mkdir -p "$lock_dir"
        local lock_file="${lock_dir}/${code_upper}.lock"
        if [ -f "$lock_file" ]; then
            local lock_age=$(( $(date +%s) - $(stat -c %Y "$lock_file" 2>/dev/null || stat -f %m "$lock_file" 2>/dev/null || echo 0) ))
            if [ "$lock_age" -gt 3600 ]; then
                log_warn "Stale lock file detected (${lock_age}s old) — removing"
                rm -f "$lock_file"
            else
                log_error "Deployment already in progress for $code_upper (file lock age: ${lock_age}s)"
                return 1
            fi
        fi
        echo "$$:$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$lock_file"
        ORCH_CONTEXT[lock_acquired]="true"
        ORCH_CONTEXT[lock_type]="file"
        log_success "Deployment lock acquired for $instance_code (file-based, remote mode)"
        return 0
    fi

    # RESILIENCE FIX (2026-02-07): Check for stale deployment states BEFORE acquiring lock
    # If state shows in-progress but no lock exists, auto-recover
    if [ "$code_upper" != "USA" ] && type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        local current_state=$(orch_db_get_state "$code_upper" 2>/dev/null || echo "UNKNOWN")
        case "$current_state" in
            INITIALIZING|DEPLOYING|CONFIGURING|VERIFYING)
                # Check if there's an actual lock (another process is deploying)
                if type orch_check_lock &>/dev/null && orch_check_lock "$code_upper"; then
                    log_error "Deployment already in progress for $code_upper (state: $current_state, lock: active)"
                    return 1
                else
                    # Stale state detected - no lock but in-progress state
                    log_warn "Detected stale deployment state '$current_state' for $code_upper (no active lock)"
                    log_info "Auto-recovering: transitioning to FAILED state (allows retry)"
                    if type orch_db_set_state &>/dev/null; then
                        # Use FAILED which is always allowed from any state
                        orch_db_set_state "$code_upper" "FAILED" "Auto-recovery from stale state (no active lock)" || true
                    fi
                fi
                ;;
        esac
    fi

    # SPECIAL CASE: Hub (USA) deployment
    # Hub creates the orchestration database, so it can't use database locking initially
    if [ "$code_upper" = "USA" ]; then
        echo "DEBUG: Checking hub bootstrap mode for USA" >&2
        if ! type -t orch_db_check_connection >/dev/null 2>&1; then
            echo "DEBUG: orch_db_check_connection function not found - skipping DB lock" >&2
            ORCH_CONTEXT[lock_acquired]="true"
            ORCH_CONTEXT[lock_type]="hub-bootstrap"
            log_success "Deployment lock acquired for $instance_code (hub-bootstrap mode - function not available)"
            return 0
        fi
        if ! orch_db_check_connection; then
            echo "DEBUG: Database not connected - skipping DB lock" >&2
            ORCH_CONTEXT[lock_acquired]="true"
            ORCH_CONTEXT[lock_type]="hub-bootstrap"
            log_success "Deployment lock acquired for $instance_code (hub-bootstrap mode - DB not available)"
            return 0
        fi
        echo "DEBUG: Database IS connected - will try to acquire DB lock" >&2
    fi

    # PostgreSQL advisory locking (MANDATORY for non-Hub instances)
    if type -t orch_db_acquire_lock >/dev/null 2>&1; then
        if orch_db_acquire_lock "$instance_code" "$timeout"; then
            log_verbose "DEBUG: About to set lock_acquired"
            ORCH_CONTEXT[lock_acquired]="true"
            log_verbose "DEBUG: lock_acquired set successfully"
            ORCH_CONTEXT[lock_type]="database"
            log_success "Deployment lock acquired for $instance_code (PostgreSQL advisory lock)"
            return 0
        else
            # Database locking failed - fail fast, no file-based fallback
            if orch_db_check_connection 2>/dev/null; then
                log_error "Failed to acquire deployment lock for $instance_code (timeout)"
                # Show current database lock holder
                local db_locks=$(docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c "SELECT instance_code, acquired_at, acquired_by FROM deployment_locks WHERE instance_code = '$(lower "$instance_code")';" 2>/dev/null | head -1)
                if [ -n "$db_locks" ]; then
                    log_error "Current lock holder:"
                    echo "$db_locks" | tr '|' '\n' | xargs -I {} echo "  {}"
                fi
                log_error ""
                log_error "To force-release the lock (if deployment crashed):"
                log_error "  ./dive spoke clean-locks $instance_code"
                return 1
            else
                # Provide detailed diagnostics
                log_error "FATAL: Orchestration database unavailable"

                # Check container status
                if docker ps --format '{{.Names}}' | grep -q "^dive-hub-postgres$"; then
                    log_error "  → Container dive-hub-postgres is running"
                    # Check PostgreSQL readiness
                    if docker exec dive-hub-postgres pg_isready -U postgres >/dev/null 2>&1; then
                        log_error "  → PostgreSQL is ready"
                        # Check database exists
                        local db_exists
                        db_exists=$(docker exec dive-hub-postgres psql -U postgres -t -c \
                            "SELECT 1 FROM pg_database WHERE datname = 'orchestration';" 2>/dev/null | xargs)
                        if [ "$db_exists" = "1" ]; then
                            log_error "  → Database 'orchestration' exists"
                            log_error "  → Connection test failed - check PostgreSQL logs"
                        else
                            log_error "  → Database 'orchestration' does not exist"
                            log_error "  → Run: ./dive hub init-db"
                        fi
                    else
                        log_error "  → PostgreSQL is not ready (waiting for initialization)"
                        log_error "  → Wait a few seconds and retry"
                    fi
                else
                    log_error "  → Container dive-hub-postgres is not running"
                    log_error "  → Start Hub: ./dive hub up"
                fi
                return 1
            fi
        fi
    else
        log_error "FATAL: Database locking function not available"
        log_error "  → Source orchestration-state-db.sh first"
        return 1
    fi
}

##
# Release deployment lock for instance (PostgreSQL advisory lock only)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Lock released
#   1 - Lock was not acquired
##
orch_release_deployment_lock() {
    local instance_code="$1"

    if [ "${ORCH_CONTEXT[lock_acquired]}" != "true" ]; then
        log_verbose "No lock to release for $instance_code"
        return 1
    fi

    log_verbose "Releasing deployment lock for $instance_code..."

    local lock_type="${ORCH_CONTEXT[lock_type]:-database}"

    # Release PostgreSQL advisory lock
    if [ "$lock_type" = "database" ]; then
        if type -t orch_db_release_lock >/dev/null 2>&1; then
            orch_db_release_lock "$instance_code" 2>/dev/null || true
        fi
    fi
    # hub-bootstrap mode doesn't have a lock to release

    # Reset context
    ORCH_CONTEXT[lock_acquired]="false"
    ORCH_CONTEXT[lock_type]=""

    log_success "Deployment lock released for $instance_code"
    return 0
}

##
# Execute function with deployment lock protection (PostgreSQL advisory lock)
#
# Arguments:
#   $1 - Instance code
#   $2 - Function to execute
#   $@ - Arguments to pass to function
#
# Returns:
#   Function exit code
##
orch_with_deployment_lock() {
    local instance_code="$1"
    local func="$2"
    shift 2
    local func_args=("$@")

    # Acquire PostgreSQL advisory lock
    if ! orch_acquire_deployment_lock "$instance_code"; then
        orch_record_error "LOCK_ACQUISITION_FAILED" \
            "$ORCH_SEVERITY_CRITICAL" \
            "Could not acquire deployment lock for $instance_code" \
            "deployment-lock" \
            "Wait for current deployment to complete or run: ./dive spoke clean-locks $instance_code" \
            "{\"instance_code\":\"$instance_code\"}"
        return 1
    fi

    # Set up cleanup trap
    trap "orch_release_deployment_lock '$instance_code'" EXIT ERR INT TERM

    # Execute function
    local exit_code=0
    $func "${func_args[@]}" || exit_code=$?

    # Release lock
    orch_release_deployment_lock "$instance_code"

    # Clear trap
    trap - EXIT ERR INT TERM

    return $exit_code
}

##
# Initialize orchestration context
#
# Arguments:
#   $1 - Instance code
#   $2 - Instance name
##
