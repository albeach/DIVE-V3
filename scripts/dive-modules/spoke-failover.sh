#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Spoke Failover & Maintenance Module
# =============================================================================
# Extracted from spoke.sh during refactoring for modularity
# Commands: spoke failover|maintenance|audit-status
# Implements Phase 5 resilience features
# =============================================================================
# Version: 1.0.0
# Date: 2025-12-23
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# FAILOVER MANAGEMENT (Phase 5)
# =============================================================================

spoke_failover() {
    local subcommand="${1:-status}"
    shift || true

    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"

    print_header
    echo -e "${BOLD}Spoke Failover Status:${NC} $(upper "$instance_code")"
    echo ""

    case "$subcommand" in
        status)      spoke_failover_status ;;
        force-open)  spoke_failover_force "open" ;;
        force-closed) spoke_failover_force "closed" ;;
        reset)       spoke_failover_reset ;;
        *)
            echo -e "${CYAN}Usage:${NC}"
            echo "  ./dive spoke failover [status|force-open|force-closed|reset]"
            echo ""
            echo -e "${CYAN}Subcommands:${NC}"
            echo "  status        Show current circuit breaker state and metrics"
            echo "  force-open    Force circuit breaker to OPEN state (stop Hub connections)"
            echo "  force-closed  Force circuit breaker to CLOSED state (resume normal operation)"
            echo "  reset         Reset circuit breaker metrics and return to CLOSED state"
            echo ""
            ;;
    esac
}

spoke_failover_status() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query backend for failover status"
        return 0
    fi

    # Query backend API for failover status
    local response=$(curl -s "http://localhost:4000/api/spoke/failover/status" --max-time 5 2>/dev/null)

    if [ -z "$response" ]; then
        echo -e "  Backend:           ${RED}Not Running${NC}"
        echo ""
        echo "  Cannot retrieve failover status. Ensure backend is running:"
        echo "    ./dive spoke up"
        return 1
    fi

    # Parse JSON response
    local state=$(echo "$response" | grep -o '"state"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local hub_healthy=$(echo "$response" | grep -o '"hubHealthy"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local opal_healthy=$(echo "$response" | grep -o '"opalHealthy"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local consecutive_failures=$(echo "$response" | grep -o '"consecutiveFailures"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local total_failures=$(echo "$response" | grep -o '"totalFailures"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local total_recoveries=$(echo "$response" | grep -o '"totalRecoveries"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local uptime=$(echo "$response" | grep -o '"uptimePercentage"[[:space:]]*:[[:space:]]*[0-9.]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local maintenance=$(echo "$response" | grep -o '"isInMaintenanceMode"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | cut -d: -f2 | tr -d ' ')

    # State color and icon
    local state_color="$GREEN"
    local state_icon="✓"
    case "$state" in
        CLOSED)    state_color="$GREEN"; state_icon="✓" ;;
        OPEN)      state_color="$RED"; state_icon="✗" ;;
        HALF_OPEN) state_color="$YELLOW"; state_icon="⚠" ;;
    esac

    echo -e "${CYAN}Circuit Breaker State:${NC}"
    echo -e "  State:             ${state_color}${state_icon} ${state:-UNKNOWN}${NC}"

    [ "$maintenance" = "true" ] && echo -e "  Maintenance Mode:  ${YELLOW}ENABLED${NC}"

    echo ""
    echo -e "${CYAN}Connection Health:${NC}"
    if [ "$hub_healthy" = "true" ]; then
        echo -e "  Hub Connection:    ${GREEN}✓ Healthy${NC}"
    else
        echo -e "  Hub Connection:    ${RED}✗ Unhealthy${NC}"
    fi

    if [ "$opal_healthy" = "true" ]; then
        echo -e "  OPAL Connection:   ${GREEN}✓ Healthy${NC}"
    else
        echo -e "  OPAL Connection:   ${RED}✗ Unhealthy${NC}"
    fi

    echo ""
    echo -e "${CYAN}Metrics:${NC}"
    echo "  Consecutive Failures:  ${consecutive_failures:-0}"
    echo "  Total Failures:        ${total_failures:-0}"
    echo "  Total Recoveries:      ${total_recoveries:-0}"
    echo "  Uptime:                ${uptime:-0}%"
    echo ""

    # Recommendations based on state
    if [ "$state" = "OPEN" ]; then
        echo -e "${YELLOW}⚠️  Circuit breaker is OPEN${NC}"
        echo "   The spoke is operating in offline mode."
        echo "   Policy decisions use cached policies."
        echo "   Audit logs are queued for later sync."
        echo ""
        echo "   To force recovery: ./dive spoke failover force-closed"
        echo ""
    elif [ "$state" = "HALF_OPEN" ]; then
        echo -e "${YELLOW}⚠️  Circuit breaker is testing recovery${NC}"
        echo "   The spoke is testing Hub connectivity."
        echo "   If successful, will transition to CLOSED."
        echo ""
    fi
}

spoke_failover_force() {
    local target_state="$1"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would force circuit breaker to: $target_state"
        return 0
    fi

    log_step "Forcing circuit breaker to: $(upper "$target_state")"

    local response=$(curl -s -X POST "http://localhost:4000/api/spoke/failover/force" \
        -H "Content-Type: application/json" \
        -d "{\"state\": \"$(upper "$target_state")\"}" \
        --max-time 5 2>/dev/null)

    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Circuit breaker state changed to: $(upper "$target_state")"
    else
        log_error "Failed to change circuit breaker state"
        echo "  Response: $response"
        return 1
    fi
}

spoke_failover_reset() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would reset circuit breaker metrics"
        return 0
    fi

    log_step "Resetting circuit breaker metrics"

    local response=$(curl -s -X POST "http://localhost:4000/api/spoke/failover/reset" \
        --max-time 5 2>/dev/null)

    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Circuit breaker metrics reset"
        echo ""
        spoke_failover_status
    else
        log_error "Failed to reset circuit breaker"
        echo "  Response: $response"
        return 1
    fi
}

# =============================================================================
# MAINTENANCE MODE (Phase 5)
# =============================================================================

spoke_maintenance() {
    local subcommand="${1:-status}"
    shift || true

    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"

    print_header
    echo -e "${BOLD}Spoke Maintenance Mode:${NC} $(upper "$instance_code")"
    echo ""

    case "$subcommand" in
        status)          spoke_maintenance_status ;;
        enter|start|on)  spoke_maintenance_enter "$@" ;;
        exit|stop|off)   spoke_maintenance_exit ;;
        *)
            echo -e "${CYAN}Usage:${NC}"
            echo "  ./dive spoke maintenance [status|enter|exit]"
            echo ""
            echo -e "${CYAN}Subcommands:${NC}"
            echo "  status              Show current maintenance mode status"
            echo "  enter [reason]      Enter maintenance mode (stops Hub sync)"
            echo "  exit                Exit maintenance mode (resume normal operation)"
            echo ""
            echo -e "${CYAN}Examples:${NC}"
            echo "  ./dive spoke maintenance enter 'Scheduled upgrade'"
            echo "  ./dive spoke maintenance exit"
            echo ""
            ;;
    esac
}

spoke_maintenance_status() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query backend for maintenance status"
        return 0
    fi

    local response=$(curl -s "http://localhost:4000/api/spoke/failover/status" --max-time 5 2>/dev/null)

    if [ -z "$response" ]; then
        echo -e "  Backend:           ${RED}Not Running${NC}"
        return 1
    fi

    local maintenance=$(echo "$response" | grep -o '"isInMaintenanceMode"[[:space:]]*:[[:space:]]*[^,}]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local reason=$(echo "$response" | grep -o '"maintenanceReason"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local entered=$(echo "$response" | grep -o '"maintenanceEnteredAt"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ "$maintenance" = "true" ]; then
        echo -e "  Status:            ${YELLOW}⚠️  MAINTENANCE MODE${NC}"
        [ -n "$reason" ] && echo "  Reason:            $reason"
        [ -n "$entered" ] && echo "  Entered At:        $entered"
        echo ""
        echo -e "${CYAN}During Maintenance:${NC}"
        echo "  • Hub heartbeats are paused"
        echo "  • Policy updates are suspended"
        echo "  • Local authorization continues with cached policies"
        echo "  • Audit logs are queued"
        echo ""
        echo "  Exit maintenance: ./dive spoke maintenance exit"
    else
        echo -e "  Status:            ${GREEN}✓ Normal Operation${NC}"
        echo ""
        echo "  Enter maintenance: ./dive spoke maintenance enter 'reason'"
    fi
    echo ""
}

spoke_maintenance_enter() {
    local reason="${*:-Manual maintenance}"

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would enter maintenance mode with reason: $reason"
        return 0
    fi

    log_step "Entering maintenance mode..."

    local response=$(curl -s -X POST "http://localhost:4000/api/spoke/maintenance/enter" \
        -H "Content-Type: application/json" \
        -d "{\"reason\": \"$reason\"}" \
        --max-time 5 2>/dev/null)

    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Entered maintenance mode"
        echo ""
        echo -e "${YELLOW}⚠️  Maintenance mode is now active${NC}"
        echo "   Reason: $reason"
        echo ""
        echo "   Hub sync is paused. Local operations continue."
        echo "   Exit when ready: ./dive spoke maintenance exit"
    else
        log_error "Failed to enter maintenance mode"
        echo "  Response: $response"
        return 1
    fi
}

spoke_maintenance_exit() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would exit maintenance mode"
        return 0
    fi

    log_step "Exiting maintenance mode..."

    local response=$(curl -s -X POST "http://localhost:4000/api/spoke/maintenance/exit" \
        --max-time 5 2>/dev/null)

    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Exited maintenance mode"
        echo ""
        echo -e "${GREEN}✓ Normal operation resumed${NC}"
        echo ""
        echo "   Hub sync will resume automatically."
        echo "   Queued audit logs will be synced."
    else
        log_error "Failed to exit maintenance mode"
        echo "  Response: $response"
        return 1
    fi
}

# =============================================================================
# AUDIT QUEUE STATUS (Phase 5)
# =============================================================================

spoke_audit_status() {
    ensure_dive_root
    local instance_code="${INSTANCE:-usa}"

    print_header
    echo -e "${BOLD}Spoke Audit Queue Status:${NC} $(upper "$instance_code")"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query backend for audit queue status"
        return 0
    fi

    local response=$(curl -s "http://localhost:4000/api/spoke/audit/status" --max-time 5 2>/dev/null)

    if [ -z "$response" ]; then
        echo -e "  Backend:           ${RED}Not Running${NC}"
        echo ""
        echo "  Cannot retrieve audit status. Ensure backend is running:"
        echo "    ./dive spoke up"
        return 1
    fi

    # Parse response
    local queue_size=$(echo "$response" | grep -o '"queueSize"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local queue_size_bytes=$(echo "$response" | grep -o '"queueSizeBytes"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local total_synced=$(echo "$response" | grep -o '"totalSynced"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local total_failed=$(echo "$response" | grep -o '"totalFailed"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')
    local last_sync=$(echo "$response" | grep -o '"lastSyncAt"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local last_sync_status=$(echo "$response" | grep -o '"lastSyncStatus"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
    local max_size=$(echo "$response" | grep -o '"maxQueueSize"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | cut -d: -f2 | tr -d ' ')

    # Calculate human-readable size
    local size_display="$queue_size_bytes bytes"
    if [ -n "$queue_size_bytes" ] && [ "$queue_size_bytes" -gt 1048576 ]; then
        size_display="$(echo "scale=2; $queue_size_bytes/1048576" | bc 2>/dev/null || echo "$queue_size_bytes") MB"
    elif [ -n "$queue_size_bytes" ] && [ "$queue_size_bytes" -gt 1024 ]; then
        size_display="$(echo "scale=2; $queue_size_bytes/1024" | bc 2>/dev/null || echo "$queue_size_bytes") KB"
    fi

    echo -e "${CYAN}Queue Status:${NC}"
    echo "  Pending Entries:   ${queue_size:-0}"
    echo "  Queue Size:        ${size_display}"
    echo "  Max Queue Size:    ${max_size:-10000} entries"
    echo ""

    # Queue health indicator
    local queue_percent=0
    if [ -n "$queue_size" ] && [ -n "$max_size" ] && [ "$max_size" -gt 0 ]; then
        queue_percent=$((queue_size * 100 / max_size))
    fi

    if [ "$queue_percent" -lt 50 ]; then
        echo -e "  Queue Health:      ${GREEN}✓ Healthy (${queue_percent}% full)${NC}"
    elif [ "$queue_percent" -lt 80 ]; then
        echo -e "  Queue Health:      ${YELLOW}⚠ Warning (${queue_percent}% full)${NC}"
    else
        echo -e "  Queue Health:      ${RED}✗ Critical (${queue_percent}% full)${NC}"
    fi

    echo ""
    echo -e "${CYAN}Sync Statistics:${NC}"
    echo "  Total Synced:      ${total_synced:-0}"
    echo "  Total Failed:      ${total_failed:-0}"

    [ -n "$last_sync" ] && echo "  Last Sync:         $last_sync"

    if [ -n "$last_sync_status" ]; then
        if [ "$last_sync_status" = "success" ]; then
            echo -e "  Last Status:       ${GREEN}✓ Success${NC}"
        else
            echo -e "  Last Status:       ${RED}✗ $last_sync_status${NC}"
        fi
    fi

    echo ""

    if [ -n "$queue_size" ] && [ "$queue_size" -gt 0 ]; then
        echo -e "${CYAN}Commands:${NC}"
        echo "  Force sync:        curl -X POST localhost:4000/api/spoke/audit/sync"
        echo "  Clear queue:       curl -X POST localhost:4000/api/spoke/audit/clear"
        echo ""
    fi
}

# Mark module as loaded
export DIVE_SPOKE_FAILOVER_LOADED=1

