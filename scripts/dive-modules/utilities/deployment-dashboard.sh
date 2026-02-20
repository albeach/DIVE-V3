#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Deployment Timing Dashboard
# =============================================================================
# Rich per-phase timing dashboard with duration, percentage, target comparison,
# bar chart, and bottleneck identification. Reads targets from
# config/deployment-timeouts.env.
#
# Usage:
#   deployment_print_timing_dashboard "hub" "${phase_times[@]}" "$total_duration"
#   deployment_print_timing_dashboard "spoke" "${phase_times[@]}" "$total_duration"
# =============================================================================

# Prevent multiple sourcing
if [ -n "${DEPLOYMENT_DASHBOARD_LOADED:-}" ]; then
    return 0
fi
export DEPLOYMENT_DASHBOARD_LOADED=1

# =============================================================================
# TARGET CONFIGURATION
# =============================================================================

# Phase-level target times (seconds) — loaded from deployment-timeouts.env
# or use sensible defaults. These map phase NAMES to expected durations.
declare -A _DASHBOARD_PHASE_TARGETS 2>/dev/null || true

_dashboard_load_targets() {
    local deploy_type="${1:-hub}"
    local config_file="${DIVE_ROOT:-.}/config/deployment-timeouts.env"

    # Hub phase targets (seconds)
    _DASHBOARD_PHASE_TARGETS=(
        ["Vault Bootstrap"]=60
        ["Database Init"]=30
        ["Preflight"]=60
        ["Initialization"]=30
        ["MongoDB"]=30
        ["Build"]=300
        ["Services"]=180
        ["Vault DB Engine"]=30
        ["Keycloak"]=120
        ["Realm Verify"]=30
        ["KAS Register"]=30
        ["Seeding"]=60
        ["KAS Init"]=30
    )

    # Spoke phase targets (seconds)
    if [ "$deploy_type" = "spoke" ]; then
        _DASHBOARD_PHASE_TARGETS=(
            ["Preflight"]=30
            ["Initialization"]=30
            ["Deployment"]=120
            ["Configuration"]=120
            ["Seeding"]=60
            ["Verification"]=30
        )
    fi

    # Override from config if available
    if [ -f "$config_file" ]; then
        local target_hub target_spoke
        target_hub=$(grep -E '^TARGET_HUB_DEPLOY_TIME=' "$config_file" 2>/dev/null | cut -d= -f2 | awk '{print $1}')
        target_spoke=$(grep -E '^TARGET_SPOKE_DEPLOY_TIME=' "$config_file" 2>/dev/null | cut -d= -f2 | awk '{print $1}')
        if [ "$deploy_type" = "hub" ] && [ -n "$target_hub" ]; then
            _DASHBOARD_TOTAL_TARGET="$target_hub"
        elif [ "$deploy_type" = "spoke" ] && [ -n "$target_spoke" ]; then
            _DASHBOARD_TOTAL_TARGET="$target_spoke"
        fi
    fi

    # Default total targets
    : "${_DASHBOARD_TOTAL_TARGET:=$([ "$deploy_type" = "hub" ] && echo 300 || echo 240)}"
}

# =============================================================================
# TIMING PARSER
# =============================================================================

# Parse "Phase N (Name): Xs" or "Phase N (Name): skipped" into components
# Sets: _parsed_num, _parsed_name, _parsed_seconds, _parsed_skipped
_dashboard_parse_timing() {
    local entry="$1"
    _parsed_num=""
    _parsed_name=""
    _parsed_seconds=0
    _parsed_skipped=false

    # Match: "Phase N (Name): Xs" or "Phase N (Name): skipped"
    # Store regex in variable to avoid bash -n parsing issues with parentheses
    local _re='^Phase ([0-9]+) \(([^)]+)\): (.+)$'
    if [[ "$entry" =~ $_re ]]; then
        _parsed_num="${BASH_REMATCH[1]}"
        _parsed_name="${BASH_REMATCH[2]}"
        local value="${BASH_REMATCH[3]}"
        if [ "$value" = "skipped" ]; then
            _parsed_skipped=true
        else
            _parsed_seconds="${value%s}"
        fi
    fi
}

# =============================================================================
# BAR CHART RENDERING
# =============================================================================

_dashboard_render_bar() {
    local value="$1"
    local max_value="$2"
    local bar_width="${3:-20}"

    if [ "$max_value" -eq 0 ]; then
        printf '%*s' "$bar_width" ""
        return
    fi

    local filled=$(( (value * bar_width) / max_value ))
    [ "$filled" -gt "$bar_width" ] && filled="$bar_width"
    [ "$filled" -lt 0 ] && filled=0

    local empty=$(( bar_width - filled ))
    local bar=""
    local i
    for (( i=0; i<filled; i++ )); do bar+="#"; done
    for (( i=0; i<empty; i++ )); do bar+="."; done
    printf '%s' "$bar"
}

# =============================================================================
# STATUS DETERMINATION
# =============================================================================

_dashboard_phase_status() {
    local seconds="$1"
    local target="$2"
    local skipped="$3"

    if [ "$skipped" = true ]; then
        echo "SKIP"
    elif [ "$target" -eq 0 ]; then
        echo "  OK"
    elif [ "$seconds" -le "$target" ]; then
        echo "  OK"
    elif [ "$seconds" -le $(( target * 3 / 2 )) ]; then
        echo "SLOW"
    else
        echo "OVER"
    fi
}

_dashboard_total_status() {
    local duration="$1"
    local target="$2"

    if [ "$duration" -le "$target" ]; then
        echo "OK"
    elif [ "$duration" -le $(( target * 3 / 2 )) ]; then
        echo "SLOW"
    else
        echo "OVER"
    fi
}

# =============================================================================
# MAIN DASHBOARD
# =============================================================================

##
# Print a rich timing dashboard for deployment phases
#
# Arguments:
#   $1 - Deploy type: "hub" or "spoke"
#   $2..$(N-1) - Phase timing entries: "Phase N (Name): Xs" or "Phase N (Name): skipped"
#   $N (last) - Total duration in seconds
#
# Output:
#   Formatted dashboard to stdout
##
deployment_print_timing_dashboard() {
    local deploy_type="$1"; shift

    # Last argument is total duration
    local -a entries=("${@:1:$#-1}")
    local total_duration="${!#}"

    # Load targets
    _dashboard_load_targets "$deploy_type"

    # Parse all entries and find max duration for bar scaling
    local -a names=()
    local -a nums=()
    local -a seconds=()
    local -a skipped=()
    local max_seconds=0
    local bottleneck_idx=0
    local bottleneck_secs=0
    local active_total=0

    for i in "${!entries[@]}"; do
        _dashboard_parse_timing "${entries[$i]}"
        names+=("$_parsed_name")
        nums+=("$_parsed_num")
        seconds+=("$_parsed_seconds")
        skipped+=("$_parsed_skipped")

        if [ "$_parsed_skipped" = false ]; then
            active_total=$(( active_total + _parsed_seconds ))
            if [ "$_parsed_seconds" -gt "$max_seconds" ]; then
                max_seconds="$_parsed_seconds"
            fi
            if [ "$_parsed_seconds" -gt "$bottleneck_secs" ]; then
                bottleneck_secs="$_parsed_seconds"
                bottleneck_idx="$i"
            fi
        fi
    done

    # Scale bar chart to longest phase
    [ "$max_seconds" -eq 0 ] && max_seconds=1

    # Compute label for deploy type (capitalize first letter, macOS-compatible)
    local type_label
    type_label="$(echo "${deploy_type:0:1}" | tr '[:lower:]' '[:upper:]')${deploy_type:1}"

    # Print dashboard
    echo ""
    echo "==============================================================================="
    echo "  Deployment Timing Dashboard (${type_label})"
    echo "==============================================================================="
    printf "  %-4s %-22s %8s %6s %-20s %8s %s\n" "#" "Phase" "Duration" "%" "Bar" "Target" "Status"
    echo "  ──── ────────────────────── ──────── ────── ──────────────────── ──────── ──────"

    for i in "${!names[@]}"; do
        local name="${names[$i]}"
        local num="${nums[$i]}"
        local secs="${seconds[$i]}"
        local skip="${skipped[$i]}"

        # Compute percentage of total
        local pct=0
        if [ "$active_total" -gt 0 ] && [ "$skip" = false ]; then
            pct=$(( (secs * 100) / active_total ))
        fi

        # Get target for this phase
        local target="${_DASHBOARD_PHASE_TARGETS[$name]:-0}"

        # Get status
        local status
        status=$(_dashboard_phase_status "$secs" "$target" "$skip")

        if [ "$skip" = true ]; then
            printf "  %2s.  %-22s %8s %6s %-20s %8s %s\n" \
                "$num" "$name" "---" "---" "                    " "---" "$status"
        else
            local bar
            bar=$(_dashboard_render_bar "$secs" "$max_seconds" 20)
            printf "  %2s.  %-22s %6ds %4d%%  %-20s %5ds   %s\n" \
                "$num" "$name" "$secs" "$pct" "$bar" "$target" "$status"
        fi
    done

    echo "  ──── ────────────────────── ──────── ────── ──────────────────── ──────── ──────"

    # Total line
    local total_target="${_DASHBOARD_TOTAL_TARGET:-300}"
    local total_status
    total_status=$(_dashboard_total_status "$total_duration" "$total_target")
    printf "  %-27s %6ds %5s  %-20s %5ds   %s\n" \
        "Total" "$total_duration" "100%" "" "$total_target" "$total_status"

    # Bottleneck identification
    if [ "${#names[@]}" -gt 0 ] && [ "$active_total" -gt 0 ]; then
        local bn_pct=$(( (bottleneck_secs * 100) / active_total ))
        if [ "$bn_pct" -ge 30 ]; then
            echo ""
            echo "  Bottleneck: Phase ${nums[$bottleneck_idx]} (${names[$bottleneck_idx]}) — ${bn_pct}% of total time"
        fi
    fi

    # Performance summary
    echo ""
    if [ "$total_duration" -lt $(( total_target * 2 / 3 )) ]; then
        echo "  Performance: EXCELLENT"
    elif [ "$total_duration" -le "$total_target" ]; then
        echo "  Performance: GOOD"
    elif [ "$total_duration" -le $(( total_target * 3 / 2 )) ]; then
        echo "  Performance: ACCEPTABLE"
    else
        echo "  Performance: NEEDS IMPROVEMENT"
    fi
    echo "==============================================================================="
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f deployment_print_timing_dashboard 2>/dev/null || true
