#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 Error Analytics Module (GAP-004 Fix)
# =============================================================================
# Implements error trend analysis, root cause identification,
# and proactive alerting for orchestration errors
# =============================================================================

# Prevent multiple sourcing
if [ -n "$ERROR_ANALYTICS_LOADED" ]; then
    return 0
fi
export ERROR_ANALYTICS_LOADED=1

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration state database
if [ -f "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-db.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-db.sh"
fi

# =============================================================================
# ERROR ANALYTICS FUNCTIONS
# =============================================================================

##
# Generate comprehensive error analytics report
#
# Arguments:
#   $1 - Number of days to analyze (default: 7)
#   $2 - Instance code filter (optional, analyzes all if not specified)
#
# Returns:
#   0 - Report generated successfully
#   1 - Failed to generate report
##
generate_error_analytics() {
    local days="${1:-7}"
    local instance_filter="${2:-}"

    log_info "Generating error analytics for last $days days..."

    if ! orch_db_check_connection; then
        log_error "Database not available for error analytics"
        return 1
    fi

    local report_file="${DIVE_ROOT}/logs/error-analytics-$(date +%Y%m%d-%H%M%S).txt"
    local instance_clause=""

    if [ -n "$instance_filter" ]; then
        instance_clause="AND instance_code = '$(lower "$instance_filter")'"
    fi

    # Generate report sections
    {
        echo "═══════════════════════════════════════════════════════════"
        echo "DIVE V3 Orchestration Error Analytics Report"
        echo "═══════════════════════════════════════════════════════════"
        echo "Period: Last $days days"
        if [ -n "$instance_filter" ]; then
            echo "Instance: $instance_filter"
        else
            echo "Scope: All instances"
        fi
        echo "Generated: $(date)"
        echo ""

        # Section 1: Top Errors by Frequency
        echo "1. TOP ERRORS BY FREQUENCY"
        echo "───────────────────────────────────────────────────────────"
        orch_db_exec "
            SELECT
                error_code,
                COUNT(*) as occurrences,
                MAX(severity) as max_severity,
                ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - timestamp))), 2) as avg_resolution_sec
            FROM orchestration_errors
            WHERE timestamp > NOW() - INTERVAL '$days days'
            $instance_clause
            GROUP BY error_code
            ORDER BY occurrences DESC
            LIMIT 10
        " | column -t -s '|'
        echo ""

        # Section 2: Error Trend (by day)
        echo "2. ERROR TREND (by day)"
        echo "───────────────────────────────────────────────────────────"
        orch_db_exec "
            SELECT
                DATE(timestamp) as day,
                COUNT(*) as total,
                SUM(CASE WHEN severity = 1 THEN 1 ELSE 0 END) as critical,
                SUM(CASE WHEN severity = 2 THEN 1 ELSE 0 END) as high,
                SUM(CASE WHEN severity = 3 THEN 1 ELSE 0 END) as medium,
                SUM(CASE WHEN severity = 4 THEN 1 ELSE 0 END) as low
            FROM orchestration_errors
            WHERE timestamp > NOW() - INTERVAL '$days days'
            $instance_clause
            GROUP BY day
            ORDER BY day DESC
        " | column -t -s '|'
        echo ""

        # Section 3: Errors by Instance
        echo "3. ERRORS BY INSTANCE"
        echo "───────────────────────────────────────────────────────────"
        orch_db_exec "
            SELECT
                instance_code,
                COUNT(*) as total_errors,
                SUM(CASE WHEN severity <= 2 THEN 1 ELSE 0 END) as critical_high,
                COUNT(DISTINCT error_code) as unique_errors,
                MAX(timestamp) as last_error
            FROM orchestration_errors
            WHERE timestamp > NOW() - INTERVAL '$days days'
            $instance_clause
            GROUP BY instance_code
            ORDER BY total_errors DESC
        " | column -t -s '|'
        echo ""

        # Section 4: Error Correlation (errors that occur together)
        echo "4. ERROR CORRELATION (errors within 5 minutes)"
        echo "───────────────────────────────────────────────────────────"
        orch_db_exec "
            SELECT
                e1.error_code as error_1,
                e2.error_code as error_2,
                COUNT(*) as co_occurrences
            FROM orchestration_errors e1
            JOIN orchestration_errors e2
                ON e1.instance_code = e2.instance_code
                AND e2.timestamp BETWEEN e1.timestamp AND e1.timestamp + INTERVAL '5 minutes'
                AND e1.id < e2.id
            WHERE e1.timestamp > NOW() - INTERVAL '$days days'
            $instance_clause
            GROUP BY error_1, error_2
            HAVING COUNT(*) > 2
            ORDER BY co_occurrences DESC
            LIMIT 10
        " | column -t -s '|'
        echo ""

        # Section 5: Unresolved Errors
        echo "5. UNRESOLVED ERRORS"
        echo "───────────────────────────────────────────────────────────"
        orch_db_exec "
            SELECT
                instance_code,
                error_code,
                severity,
                component,
                message,
                timestamp
            FROM orchestration_errors
            WHERE resolved = FALSE
            $instance_clause
            ORDER BY severity ASC, timestamp DESC
            LIMIT 20
        " | column -t -s '|'
        echo ""

        # Section 6: Error Rate by Component
        echo "6. ERROR RATE BY COMPONENT"
        echo "───────────────────────────────────────────────────────────"
        orch_db_exec "
            SELECT
                component,
                COUNT(*) as errors,
                ROUND(COUNT(*)::NUMERIC / $days, 2) as errors_per_day,
                STRING_AGG(DISTINCT error_code, ', ') as error_types
            FROM orchestration_errors
            WHERE timestamp > NOW() - INTERVAL '$days days'
            $instance_clause
            GROUP BY component
            ORDER BY errors DESC
        " | column -t -s '|'
        echo ""

        # Section 7: Recommendations
        echo "7. AUTOMATED RECOMMENDATIONS"
        echo "───────────────────────────────────────────────────────────"
        generate_error_recommendations "$days" "$instance_filter"
        echo ""

        echo "═══════════════════════════════════════════════════════════"
        echo "End of Report"
        echo "═══════════════════════════════════════════════════════════"

    } > "$report_file"

    # Also output to stdout
    cat "$report_file"

    log_success "Error analytics report saved to: $report_file"
    return 0
}

##
# Generate automated recommendations based on error patterns
#
# Arguments:
#   $1 - Number of days analyzed
#   $2 - Instance filter (optional)
##
generate_error_recommendations() {
    local days="$1"
    local instance_filter="${2:-}"
    local instance_clause=""

    if [ -n "$instance_filter" ]; then
        instance_clause="AND instance_code = '$(lower "$instance_filter")'"
    fi

    echo "Based on error analysis, here are recommendations:"
    echo ""

    # 1. Check for high-frequency errors
    local high_freq_errors=$(orch_db_exec "
        SELECT error_code
        FROM orchestration_errors
        WHERE timestamp > NOW() - INTERVAL '$days days'
        $instance_clause
        GROUP BY error_code
        HAVING COUNT(*) > 10
        ORDER BY COUNT(*) DESC
    " 2>/dev/null)

    if [ -n "$high_freq_errors" ]; then
        echo "⚠️  HIGH FREQUENCY ERRORS (>10 occurrences):"
        echo "$high_freq_errors" | while read -r error; do
            local count=$(orch_db_exec "
                SELECT COUNT(*)
                FROM orchestration_errors
                WHERE error_code = '$error'
                AND timestamp > NOW() - INTERVAL '$days days'
                $instance_clause
            " 2>/dev/null | xargs)
            echo "   - $error ($count times) - Investigate root cause urgently"
        done
        echo ""
    fi

    # 2. Check for trending errors (increasing)
    local trending_errors=$(orch_db_exec "
        WITH this_week AS (
            SELECT error_code, COUNT(*) as count
            FROM orchestration_errors
            WHERE timestamp > NOW() - INTERVAL '$days days'
            AND timestamp >= CURRENT_DATE - 7
            $instance_clause
            GROUP BY error_code
        ),
        last_week AS (
            SELECT error_code, COUNT(*) as count
            FROM orchestration_errors
            WHERE timestamp > NOW() - INTERVAL '$((days * 2)) days'
            AND timestamp < CURRENT_DATE - 7
            $instance_clause
            GROUP BY error_code
        )
        SELECT t.error_code
        FROM this_week t
        LEFT JOIN last_week l ON t.error_code = l.error_code
        WHERE t.count > COALESCE(l.count, 0) * 1.5
        ORDER BY t.count DESC
    " 2>/dev/null)

    if [ -n "$trending_errors" ]; then
        echo "📈 TRENDING UP ERRORS (50%+ increase this week):"
        echo "$trending_errors" | while read -r error; do
            echo "   - $error - Requires urgent investigation"
        done
        echo ""
    fi

    # 3. Check for correlated errors (potential root cause)
    echo "🔗 CORRELATED ERRORS (may share root cause):"
    orch_db_exec "
        SELECT
            e1.error_code || ' → ' || e2.error_code as pattern,
            COUNT(*) as occurrences
        FROM orchestration_errors e1
        JOIN orchestration_errors e2
            ON e1.instance_code = e2.instance_code
            AND e2.timestamp BETWEEN e1.timestamp AND e1.timestamp + INTERVAL '5 minutes'
            AND e1.id < e2.id
        WHERE e1.timestamp > NOW() - INTERVAL '$days days'
        $instance_clause
        GROUP BY e1.error_code, e2.error_code
        HAVING COUNT(*) > 3
        ORDER BY occurrences DESC
        LIMIT 5
    " 2>/dev/null | while IFS='|' read -r pattern count; do
        echo "   - $pattern ($count times)"
    done
    echo ""

    # 4. Check for unresolved critical/high errors
    local unresolved_critical=$(orch_db_exec "
        SELECT COUNT(*)
        FROM orchestration_errors
        WHERE resolved = FALSE
        AND severity <= 2
        $instance_clause
    " 2>/dev/null | xargs)

    if [ "$unresolved_critical" -gt 0 ]; then
        echo "🚨 UNRESOLVED CRITICAL/HIGH ERRORS: $unresolved_critical"
        echo "   Action required: Review and resolve these errors immediately"
        echo ""
    fi

    # 5. Instance-specific recommendations
    if [ -z "$instance_filter" ]; then
        local problematic_instances=$(orch_db_exec "
            SELECT instance_code
            FROM orchestration_errors
            WHERE timestamp > NOW() - INTERVAL '$days days'
            AND severity <= 2
            GROUP BY instance_code
            HAVING COUNT(*) > 5
            ORDER BY COUNT(*) DESC
        " 2>/dev/null)

        if [ -n "$problematic_instances" ]; then
            echo "🎯 INSTANCES NEEDING ATTENTION:"
            echo "$problematic_instances" | while read -r instance; do
                local error_count=$(orch_db_exec "
                    SELECT COUNT(*)
                    FROM orchestration_errors
                    WHERE instance_code = '$instance'
                    AND severity <= 2
                    AND timestamp > NOW() - INTERVAL '$days days'
                " 2>/dev/null | xargs)
                echo "   - $instance ($error_count critical/high errors)"
            done
            echo ""
        fi
    fi

    echo "💡 GENERAL RECOMMENDATIONS:"
    echo "   - Review high-frequency errors for potential fixes"
    echo "   - Investigate trending errors before they escalate"
    echo "   - Analyze correlated errors to find root causes"
    echo "   - Resolve all critical/high severity errors promptly"
}

##
# Get error trends for specific error code
#
# Arguments:
#   $1 - Error code
#   $2 - Number of days (default: 14)
#
# Returns:
#   Trend data (increasing, stable, decreasing)
##
analyze_error_trend() {
    local error_code="$1"
    local days="${2:-14}"

    if ! orch_db_check_connection; then
        log_error "Database not available for trend analysis"
        return 1
    fi

    log_info "Analyzing trend for error: $error_code (last $days days)"

    # Get daily counts
    local trend_data=$(orch_db_exec "
        SELECT
            DATE(timestamp) as day,
            COUNT(*) as count
        FROM orchestration_errors
        WHERE error_code = '$error_code'
        AND timestamp > NOW() - INTERVAL '$days days'
        GROUP BY day
        ORDER BY day ASC
    ")

    # Calculate trend (simple linear regression would be better, but this works)
    local this_week=$(orch_db_exec "
        SELECT COUNT(*)
        FROM orchestration_errors
        WHERE error_code = '$error_code'
        AND timestamp > NOW() - INTERVAL '7 days'
    " | xargs)

    local last_week=$(orch_db_exec "
        SELECT COUNT(*)
        FROM orchestration_errors
        WHERE error_code = '$error_code'
        AND timestamp BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
    " | xargs)

    echo "Error Code: $error_code"
    echo "This week: $this_week occurrences"
    echo "Last week: $last_week occurrences"
    echo ""

    if [ "$this_week" -gt "$((last_week * 15 / 10))" ]; then
        echo -e "${RED}Trend: INCREASING (+$(( (this_week - last_week) * 100 / last_week ))%)${NC}"
        echo "⚠️  Urgent investigation recommended"
    elif [ "$this_week" -lt "$((last_week * 7 / 10))" ]; then
        echo -e "${GREEN}Trend: DECREASING ($(( (last_week - this_week) * 100 / last_week ))%)${NC}"
        echo "✅ Improvement detected"
    else
        echo -e "${YELLOW}Trend: STABLE${NC}"
    fi

    echo ""
    echo "Daily Breakdown:"
    echo "$trend_data" | column -t -s '|'
}

##
# Identify root cause candidates for error
#
# Arguments:
#   $1 - Error code
#   $2 - Number of recent occurrences to analyze (default: 10)
#
# Returns:
#   List of potential root causes
##
identify_root_cause() {
    local error_code="$1"
    local limit="${2:-10}"

    if ! orch_db_check_connection; then
        return 1
    fi

    log_info "Identifying potential root causes for: $error_code"

    # Get recent occurrences with context
    local recent_errors=$(orch_db_exec_json "
        SELECT
            instance_code,
            component,
            message,
            context,
            timestamp
        FROM orchestration_errors
        WHERE error_code = '$error_code'
        ORDER BY timestamp DESC
        LIMIT $limit
    ")

    # Analyze patterns
    echo "Recent Occurrences Analysis:"
    echo "$recent_errors" | jq -r '.[] | "\(.timestamp) - \(.instance_code) - \(.component) - \(.message)"'
    echo ""

    # Common components
    local common_components=$(orch_db_exec "
        SELECT component, COUNT(*) as count
        FROM orchestration_errors
        WHERE error_code = '$error_code'
        AND timestamp > NOW() - INTERVAL '7 days'
        GROUP BY component
        ORDER BY count DESC
        LIMIT 3
    ")

    echo "Most Affected Components:"
    echo "$common_components" | column -t -s '|'
    echo ""

    # Common instances
    local common_instances=$(orch_db_exec "
        SELECT instance_code, COUNT(*) as count
        FROM orchestration_errors
        WHERE error_code = '$error_code'
        AND timestamp > NOW() - INTERVAL '7 days'
        GROUP BY instance_code
        ORDER BY count DESC
        LIMIT 5
    ")

    echo "Most Affected Instances:"
    echo "$common_instances" | column -t -s '|'
    echo ""

    # Potential Root Causes
    echo "Potential Root Causes:"
    case "$error_code" in
        *TIMEOUT*)
            echo "  - Network latency increased"
            echo "  - Service taking longer to start"
            echo "  - Resource contention (CPU/memory)"
            echo "  - Timeout value too aggressive"
            ;;
        *UNAVAILABLE*)
            echo "  - Service crashed or not started"
            echo "  - Network partition or firewall"
            echo "  - Configuration error"
            echo "  - Dependency failure"
            ;;
        *FAILED*)
            echo "  - Invalid configuration"
            echo "  - Missing required resources"
            echo "  - Authentication/authorization issue"
            echo "  - Software bug"
            ;;
        *)
            echo "  - Review error messages for specific causes"
            echo "  - Check component logs"
            echo "  - Verify configuration"
            ;;
    esac
}

##
# Generate error alert if thresholds exceeded
#
# Arguments:
#   $1 - Instance code (optional)
#
# Returns:
#   0 - No alerts
#   1 - Alerts generated
##
check_error_alerts() {
    local instance_code="${1:-}"
    local instance_clause=""

    if [ -n "$instance_code" ]; then
        instance_clause="AND instance_code = '$(lower "$instance_code")'"
    fi

    if ! orch_db_check_connection; then
        return 0
    fi

    local alerts_triggered=0

    # Alert 1: Unresolved critical errors
    local unresolved_critical=$(orch_db_exec "
        SELECT COUNT(*)
        FROM orchestration_errors
        WHERE resolved = FALSE
        AND severity = 1
        $instance_clause
    " | xargs)

    if [ "$unresolved_critical" -gt 0 ]; then
        log_error "🚨 ALERT: $unresolved_critical unresolved CRITICAL errors"
        ((alerts_triggered++))
    fi

    # Alert 2: High error rate (>10 errors/day)
    local error_rate=$(orch_db_exec "
        SELECT COUNT(*)
        FROM orchestration_errors
        WHERE timestamp > NOW() - INTERVAL '1 day'
        AND severity <= 2
        $instance_clause
    " | xargs)

    if [ "$error_rate" -gt 10 ]; then
        log_warn "⚠️  ALERT: High error rate ($error_rate critical/high errors in last 24h)"
        ((alerts_triggered++))
    fi

    # Alert 3: Trending errors (50% increase)
    local trending=$(orch_db_exec "
        WITH this_week AS (
            SELECT error_code, COUNT(*) as count
            FROM orchestration_errors
            WHERE timestamp >= CURRENT_DATE - 7
            $instance_clause
            GROUP BY error_code
        ),
        last_week AS (
            SELECT error_code, COUNT(*) as count
            FROM orchestration_errors
            WHERE timestamp BETWEEN CURRENT_DATE - 14 AND CURRENT_DATE - 7
            $instance_clause
            GROUP BY error_code
        )
        SELECT COUNT(*)
        FROM this_week t
        LEFT JOIN last_week l ON t.error_code = l.error_code
        WHERE t.count > COALESCE(l.count, 0) * 1.5
    " | xargs)

    if [ "$trending" -gt 0 ]; then
        log_warn "📈 ALERT: $trending error types trending UP (50%+ increase)"
        ((alerts_triggered++))
    fi

    if [ "$alerts_triggered" -gt 0 ]; then
        log_warn "Total alerts: $alerts_triggered"
        log_warn "Run: ./dive error-analytics for detailed analysis"
        return 1
    else
        log_success "No error alerts (system healthy)"
        return 0
    fi
}

##
# Export error data to JSON for external tools
#
# Arguments:
#   $1 - Number of days (default: 7)
#   $2 - Output file (optional, stdout if not specified)
#
# Returns:
#   JSON error data
##
export_error_data_json() {
    local days="${1:-7}"
    local output_file="${2:-}"

    if ! orch_db_check_connection; then
        log_error "Database not available"
        return 1
    fi

    local json_data=$(orch_db_exec "
        SELECT json_agg(row_to_json(errors))
        FROM (
            SELECT
                id,
                instance_code,
                error_code,
                severity,
                component,
                message,
                remediation,
                context,
                timestamp,
                resolved
            FROM orchestration_errors
            WHERE timestamp > NOW() - INTERVAL '$days days'
            ORDER BY timestamp DESC
        ) errors
    " 2>/dev/null)

    if [ -n "$output_file" ]; then
        echo "$json_data" | jq '.' > "$output_file"
        log_success "Error data exported to: $output_file"
    else
        echo "$json_data" | jq '.'
    fi
}

# =============================================================================
# MODULE INITIALIZATION
# =============================================================================

log_verbose "Error analytics module loaded"
