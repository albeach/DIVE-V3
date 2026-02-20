#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Parallel Multi-Spoke Deployment
# =============================================================================
# Concurrent deployment of multiple spokes with per-spoke log files,
# PID tracking, and aggregated summary dashboard.
#
# Usage:
#   spoke_parallel_deploy GBR FRA DEU       # Deploy 3 spokes in parallel
#   spoke_parallel_deploy --all             # Deploy all provisioned spokes
#   spoke_parallel_deploy --dry-run GBR FRA # Preview without deploying
#
# Each spoke runs in a background subshell with its own log file at:
#   logs/deployments/spoke-{code}-YYYYMMDD-HHMMSS.log
#
# Port conflicts are impossible: NATO port SSOT assigns deterministic,
# non-overlapping ports per country code.
# =============================================================================

# Prevent multiple sourcing
if [ -n "${PARALLEL_DEPLOY_LOADED:-}" ]; then
    return 0
fi
export PARALLEL_DEPLOY_LOADED=1

# =============================================================================
# CONFIGURATION
# =============================================================================

PARALLEL_DEPLOY_MAX_CONCURRENT="${PARALLEL_DEPLOY_MAX_CONCURRENT:-5}"

# =============================================================================
# INTERNAL STATE
# =============================================================================

# Parallel arrays for tracking background spoke deployments
_PD_CODES=()
_PD_NAMES=()
_PD_PIDS=()
_PD_LOG_FILES=()
_PD_RESULTS=()
_PD_DURATIONS=()

_pd_clear() {
    _PD_CODES=()
    _PD_NAMES=()
    _PD_PIDS=()
    _PD_LOG_FILES=()
    _PD_RESULTS=()
    _PD_DURATIONS=()
}

# =============================================================================
# VALIDATION
# =============================================================================

##
# Validate a list of spoke codes before deployment
#
# Arguments:
#   $@ - Spoke codes to validate
#
# Returns:
#   0 - All codes valid
#   1 - One or more codes invalid (errors printed)
##
_pd_validate_codes() {
    local codes=("$@")
    local has_error=false

    for code in "${codes[@]}"; do
        local code_upper
        code_upper=$(echo "$code" | tr '[:lower:]' '[:upper:]')

        # Cannot deploy USA as spoke (it's the hub)
        if [ "$code_upper" = "USA" ]; then
            log_error "Cannot deploy USA as a spoke (USA is the hub)"
            has_error=true
            continue
        fi

        # Check if it's a valid NATO country
        if type is_nato_country &>/dev/null; then
            if ! is_nato_country "$code_upper"; then
                log_error "Invalid spoke code: $code_upper (not a NATO country)"
                has_error=true
            fi
        fi
    done

    # Check for duplicates
    local seen=""
    for code in "${codes[@]}"; do
        local code_upper
        code_upper=$(echo "$code" | tr '[:lower:]' '[:upper:]')
        case " $seen " in
            *" $code_upper "*)
                log_error "Duplicate spoke code: $code_upper"
                has_error=true
                ;;
        esac
        seen="$seen $code_upper"
    done

    if [ "$has_error" = true ]; then
        return 1
    fi
    return 0
}

# =============================================================================
# SPOKE RESOLUTION
# =============================================================================

##
# Resolve --all to list of provisioned spoke codes
#
# Output:
#   Space-separated list of spoke codes
##
_pd_resolve_all_spokes() {
    if type dive_get_provisioned_spokes &>/dev/null; then
        dive_get_provisioned_spokes
        echo "${_DIVE_PROVISIONED_SPOKES:-}"
    elif [ -n "${DIVE_SPOKE_LIST:-}" ]; then
        echo "$DIVE_SPOKE_LIST"
    else
        # Scan instances/ directories
        local codes=""
        if [ -d "${DIVE_ROOT}/instances" ]; then
            local dir
            for dir in "${DIVE_ROOT}"/instances/*/; do
                [ -d "$dir" ] || continue
                local dirname
                dirname=$(basename "$dir")
                local code_upper
                code_upper=$(echo "$dirname" | tr '[:lower:]' '[:upper:]')
                [ "$code_upper" = "USA" ] && continue
                codes="${codes:+$codes }$code_upper"
            done
        fi
        echo "$codes"
    fi
}

# =============================================================================
# PARALLEL EXECUTION
# =============================================================================

##
# Deploy a single spoke in a background subshell
#
# Arguments:
#   $1 - Spoke code (uppercase)
#   $2 - Log file path
#   $3... - Extra args to pass to spoke_deploy
#
# Returns:
#   Exit code written to temp file
##
_pd_deploy_single() {
    local code="$1"
    local log_file="$2"
    shift 2
    local extra_args=("$@")

    local code_lower
    code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')

    local spoke_name=""
    if type get_country_name &>/dev/null; then
        spoke_name=$(get_country_name "$code" 2>/dev/null || echo "$code")
    else
        spoke_name="$code"
    fi

    # Run spoke_deploy with output redirected to log file
    (
        spoke_deploy "$code" "$spoke_name" "${extra_args[@]}" 2>&1
    ) >> "$log_file" 2>&1
}

# =============================================================================
# PRE-DEPLOY SUMMARY
# =============================================================================

##
# Print pre-deployment summary for parallel deploy
#
# Arguments:
#   $@ - Spoke codes to deploy
##
_pd_print_pre_summary() {
    local codes=("$@")
    local count=${#codes[@]}

    echo ""
    echo "==============================================================================="
    echo "  DIVE V3 — Parallel Spoke Deployment"
    echo "==============================================================================="
    echo "  Spokes:     ${count} instances"
    printf "  Codes:      "
    local i=0
    for code in "${codes[@]}"; do
        local name=""
        if type get_country_name &>/dev/null; then
            name=$(get_country_name "$code" 2>/dev/null || echo "")
        fi
        if [ $i -gt 0 ]; then
            printf ", "
        fi
        if [ -n "$name" ]; then
            printf "%s (%s)" "$code" "$name"
        else
            printf "%s" "$code"
        fi
        i=$((i + 1))
    done
    echo ""
    echo "  Concurrency: up to ${PARALLEL_DEPLOY_MAX_CONCURRENT} at a time"
    echo "  Logs:        logs/deployments/spoke-{code}-*.log"
    echo "==============================================================================="
    echo ""
}

# =============================================================================
# RESULTS DASHBOARD
# =============================================================================

##
# Print aggregated deployment results
#
# Arguments:
#   $1 - Total duration in seconds
##
_pd_print_results() {
    local total_duration="$1"

    local count=${#_PD_CODES[@]}
    local success_count=0
    local fail_count=0

    for (( i = 0; i < count; i++ )); do
        if [ "${_PD_RESULTS[$i]}" = "0" ]; then
            success_count=$((success_count + 1))
        else
            fail_count=$((fail_count + 1))
        fi
    done

    echo ""
    echo "==============================================================================="
    echo "  Parallel Spoke Deployment Results"
    echo "==============================================================================="
    printf "  %-6s %-25s %10s %10s %s\n" "Code" "Name" "Duration" "Status" "Log"
    echo "  ────── ───────────────────────── ────────── ────────── ────────────────────"

    for (( i = 0; i < count; i++ )); do
        local status_text="OK"
        if [ "${_PD_RESULTS[$i]}" != "0" ]; then
            status_text="FAILED"
        fi
        local duration_text="${_PD_DURATIONS[$i]}s"
        local log_short
        log_short=$(basename "${_PD_LOG_FILES[$i]}")
        printf "  %-6s %-25s %10s %10s %s\n" \
            "${_PD_CODES[$i]}" "${_PD_NAMES[$i]}" "$duration_text" "$status_text" "$log_short"
    done

    echo "  ────── ───────────────────────── ────────── ────────── ────────────────────"
    echo "  Total:  ${count} spokes, ${success_count} succeeded, ${fail_count} failed (${total_duration}s wall clock)"
    echo "==============================================================================="

    if [ $fail_count -gt 0 ]; then
        echo ""
        echo "  Failed spoke logs:"
        for (( i = 0; i < count; i++ )); do
            if [ "${_PD_RESULTS[$i]}" != "0" ]; then
                echo "    ${_PD_CODES[$i]}: ${_PD_LOG_FILES[$i]}"
            fi
        done
    fi
    echo ""
}

# =============================================================================
# PUBLIC API
# =============================================================================

##
# Deploy multiple spokes in parallel
#
# Arguments:
#   [--all]            Deploy all provisioned spokes
#   [--dry-run]        Preview deployment plan without executing
#   [--force]          Pass --force to each spoke_deploy
#   [CODES...]         Space-separated spoke codes (e.g., GBR FRA DEU)
#
# Returns:
#   0 - All spokes deployed successfully
#   1 - One or more spokes failed
##
spoke_parallel_deploy() {
    local dry_run=false
    local force=false
    local use_all=false
    local codes=()
    local extra_args=()

    # Parse arguments
    while [ $# -gt 0 ]; do
        case "$1" in
            --dry-run)
                dry_run=true
                shift
                ;;
            --force)
                force=true
                extra_args+=("--force")
                shift
                ;;
            --all)
                use_all=true
                shift
                ;;
            --skip-phase|--only-phase)
                if [ -n "${2:-}" ]; then
                    extra_args+=("$1" "$2")
                    shift 2
                else
                    log_error "$1 requires a phase name"
                    return 1
                fi
                ;;
            --skip-federation|--resume)
                extra_args+=("$1")
                shift
                ;;
            -*)
                log_warn "Unknown option: $1 (passing through to spoke_deploy)"
                extra_args+=("$1")
                shift
                ;;
            *)
                local code_upper
                code_upper=$(echo "$1" | tr '[:lower:]' '[:upper:]')
                codes+=("$code_upper")
                shift
                ;;
        esac
    done

    # Resolve --all to spoke codes
    if [ "$use_all" = true ]; then
        local all_spokes
        all_spokes=$(_pd_resolve_all_spokes)
        if [ -z "$all_spokes" ]; then
            log_error "No provisioned spokes found. Set DIVE_SPOKE_LIST or run spoke authorize first."
            return 1
        fi
        for code in $all_spokes; do
            codes+=("$code")
        done
    fi

    # Validate
    if [ ${#codes[@]} -eq 0 ]; then
        log_error "No spoke codes specified"
        log_info "Usage: ./dive spoke deploy-all [--all | CODE1 CODE2 ...]"
        log_info "Example: ./dive spoke deploy-all GBR FRA DEU"
        return 1
    fi

    if ! _pd_validate_codes "${codes[@]}"; then
        return 1
    fi

    # Pre-deployment summary
    _pd_print_pre_summary "${codes[@]}"

    if [ "$dry_run" = true ]; then
        log_info "Dry run — no spokes will be deployed"
        return 0
    fi

    # Interactive confirmation (if not forced)
    if [ "$force" != true ] && type is_interactive &>/dev/null && is_interactive; then
        echo -n "  Deploy ${#codes[@]} spokes in parallel? [y/N] "
        local confirm
        read -r confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            log_info "Deployment cancelled"
            return 0
        fi
    fi

    # Ensure logs directory exists
    mkdir -p "${DIVE_ROOT}/logs/deployments"

    # Reset tracking state
    _pd_clear

    local total_start
    total_start=$(date +%s)
    local timestamp
    timestamp=$(date '+%Y%m%d-%H%M%S')

    # Launch spoke deployments in background
    local launched=0
    for code in "${codes[@]}"; do
        local code_upper
        code_upper=$(echo "$code" | tr '[:lower:]' '[:upper:]')
        local code_lower
        code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')

        local spoke_name=""
        if type get_country_name &>/dev/null; then
            spoke_name=$(get_country_name "$code_upper" 2>/dev/null || echo "$code_upper")
        else
            spoke_name="$code_upper"
        fi

        local log_file="${DIVE_ROOT}/logs/deployments/spoke-${code_lower}-${timestamp}.log"

        # Track this deployment
        _PD_CODES+=("$code_upper")
        _PD_NAMES+=("$spoke_name")
        _PD_LOG_FILES+=("$log_file")
        _PD_RESULTS+=("pending")
        _PD_DURATIONS+=("0")

        log_info "Starting spoke $code_upper ($spoke_name) → $log_file"

        # Launch in background subshell
        local spoke_start
        spoke_start=$(date +%s)
        (
            _pd_deploy_single "$code_upper" "$log_file" "${extra_args[@]}"
        ) &
        _PD_PIDS+=($!)

        launched=$((launched + 1))

        # Respect max concurrency: wait for a slot if at limit
        if [ $launched -ge "$PARALLEL_DEPLOY_MAX_CONCURRENT" ]; then
            # Wait for any one process to finish
            wait -n 2>/dev/null || true
        fi
    done

    # Wait for all remaining processes and collect results
    log_info "Waiting for ${#_PD_PIDS[@]} spoke deployments to complete..."

    for (( i = 0; i < ${#_PD_PIDS[@]}; i++ )); do
        local pid="${_PD_PIDS[$i]}"
        local spoke_start_time
        spoke_start_time=$(date +%s)

        local rc=0
        wait "$pid" 2>/dev/null || rc=$?

        local spoke_end_time
        spoke_end_time=$(date +%s)

        _PD_RESULTS[$i]="$rc"
        # Duration approximation: total time from launch to completion
        # (Individual process start times aren't easily accessible from parent)
    done

    local total_end
    total_end=$(date +%s)
    local total_duration=$((total_end - total_start))

    # Calculate per-spoke durations from log files (look for duration in log footer)
    for (( i = 0; i < ${#_PD_CODES[@]}; i++ )); do
        local log="${_PD_LOG_FILES[$i]}"
        if [ -f "$log" ]; then
            local duration_line
            duration_line=$(grep -o 'Duration:.*[0-9]\+s' "$log" 2>/dev/null | tail -1 || true)
            if [ -n "$duration_line" ]; then
                local secs
                secs=$(echo "$duration_line" | grep -o '[0-9]\+' | tail -1 || true)
                if [ -n "$secs" ]; then
                    _PD_DURATIONS[$i]="$secs"
                    continue
                fi
            fi
        fi
        # Fallback: use total wall clock divided by count
        _PD_DURATIONS[$i]="$total_duration"
    done

    # Print results dashboard
    _pd_print_results "$total_duration"

    # Return non-zero if any spoke failed
    local has_failure=false
    for result in "${_PD_RESULTS[@]}"; do
        if [ "$result" != "0" ]; then
            has_failure=true
            break
        fi
    done

    if [ "$has_failure" = true ]; then
        return 1
    fi
    return 0
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f spoke_parallel_deploy
export -f _pd_validate_codes
export -f _pd_resolve_all_spokes
export -f _pd_deploy_single
export -f _pd_print_pre_summary
export -f _pd_print_results
export -f _pd_clear
