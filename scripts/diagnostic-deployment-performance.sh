#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Deployment Performance Diagnostic Tool
# =============================================================================
# Identifies bottlenecks, timeouts, and performance issues in deployment
# =============================================================================

set -eo pipefail

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIVE_ROOT"

# Source common functions (allow unbound variables for compatibility)
set +u
source "${DIVE_ROOT}/scripts/dive-modules/common.sh" 2>/dev/null || true
set -u

# =============================================================================
# CONFIGURATION
# =============================================================================

DIAGNOSTIC_LOG="${DIVE_ROOT}/logs/deployment-diagnostic-$(date +%Y%m%d-%H%M%S).log"
DIAGNOSTIC_REPORT="${DIVE_ROOT}/docs/deployment-audit-$(date +%Y%m%d).md"

# Ensure logs directory exists
mkdir -p "$(dirname "$DIAGNOSTIC_LOG")"
mkdir -p "$(dirname "$DIAGNOSTIC_REPORT")"

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

log_diagnostic() {
    local timestamp
    timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    echo "[$timestamp] $*" | tee -a "$DIAGNOSTIC_LOG"
}

measure_time() {
    local start=$1
    local end
    end=$(date +%s)
    echo $((end - start))
}

# =============================================================================
# DIAGNOSTIC CHECKS
# =============================================================================

diagnostic_check_docker() {
    log_diagnostic "=== Docker Performance Check ==="

    # Docker daemon status
    if docker info >/dev/null 2>&1; then
        log_diagnostic "✅ Docker daemon is running"

        # Get Docker resource usage
        local container_count
        container_count=$(docker ps -q | wc -l | xargs)
        local image_count
        image_count=$(docker images -q | wc -l | xargs)
        local volume_count
        volume_count=$(docker volume ls -q | wc -l | xargs)
        local network_count
        network_count=$(docker network ls -q | wc -l | xargs)

        log_diagnostic "📊 Docker Resources:"
        log_diagnostic "  - Containers: $container_count"
        log_diagnostic "  - Images: $image_count"
        log_diagnostic "  - Volumes: $volume_count"
        log_diagnostic "  - Networks: $network_count"

        # Check for orphaned resources
        local exited_containers
        exited_containers=$(docker ps -a -f status=exited -q | wc -l | xargs)
        if [ "$exited_containers" -gt 0 ]; then
            log_diagnostic "⚠️  Found $exited_containers exited containers (may slow down operations)"
        fi

        local dangling_images
        dangling_images=$(docker images -f dangling=true -q | wc -l | xargs)
        if [ "$dangling_images" -gt 0 ]; then
            log_diagnostic "⚠️  Found $dangling_images dangling images (may slow down operations)"
        fi
    else
        log_diagnostic "❌ Docker daemon is NOT running"
        return 1
    fi

    echo ""
}

diagnostic_check_filesystem() {
    log_diagnostic "=== Filesystem Performance Check ==="

    # Check disk space
    local disk_usage
    disk_usage=$(df -h "$DIVE_ROOT" | tail -1 | awk '{print $5}' | sed 's/%//')
    log_diagnostic "💾 Disk Usage: ${disk_usage}%"

    if [ "$disk_usage" -gt 80 ]; then
        log_diagnostic "⚠️  Disk usage is high (>${disk_usage}%) - may impact performance"
    fi

    # Check write performance (create temporary 10MB file)
    log_diagnostic "📝 Testing filesystem write performance..."
    local write_start
    write_start=$(date +%s)
    dd if=/dev/zero of="${DIVE_ROOT}/logs/.write-test" bs=1M count=10 2>/dev/null
    local write_end
    write_end=$(date +%s)
    local write_duration=$((write_end - write_start))
    rm -f "${DIVE_ROOT}/logs/.write-test"

    if [ "$write_duration" -gt 5 ]; then
        log_diagnostic "⚠️  Slow filesystem write: ${write_duration}s for 10MB (expected <5s)"
    else
        log_diagnostic "✅ Filesystem write: ${write_duration}s for 10MB"
    fi

    echo ""
}

diagnostic_check_network() {
    log_diagnostic "=== Network Performance Check ==="

    # Check Docker networks
    local dive_networks
    dive_networks=$(docker network ls --filter "name=dive" --format "{{.Name}}")

    if [ -z "$dive_networks" ]; then
        log_diagnostic "✅ No pre-existing DIVE networks (clean state)"
    else
        log_diagnostic "📡 Existing DIVE networks:"
        echo "$dive_networks" | while read net; do
            log_diagnostic "  - $net"
        done
    fi

    # Check localhost connectivity
    if curl -sf --max-time 2 http://localhost:80 >/dev/null 2>&1; then
        log_diagnostic "✅ Localhost port 80 reachable"
    fi

    echo ""
}

diagnostic_analyze_orchestration() {
    log_diagnostic "=== Orchestration Framework Analysis ==="

    local orch_file="${DIVE_ROOT}/scripts/dive-modules/orchestration/framework.sh"

    if [ ! -f "$orch_file" ]; then
        log_diagnostic "❌ orchestration/framework.sh not found"
        return 1
    fi

    local line_count
    line_count=$(wc -l < "$orch_file" | xargs)
    log_diagnostic "📄 orchestration/framework.sh: $line_count lines"

    if [ "$line_count" -gt 1500 ]; then
        log_diagnostic "⚠️  Orchestration framework is very large (${line_count} lines)"
        log_diagnostic "    Recommendation: Consider splitting into modules (<500 lines each)"
    fi

    # Count hardcoded timeouts
    local timeout_count
    timeout_count=$(grep -c "sleep\|timeout" "$orch_file" || echo "0")
    log_diagnostic "⏱️  Found $timeout_count timeout/sleep references"

    # Count error handling
    local error_handling_count
    error_handling_count=$(grep -c "set -e\|trap\||| true" "$orch_file" || echo "0")
    log_diagnostic "🛡️  Found $error_handling_count error handling statements"

    # Identify potential sequential bottlenecks
    local sequential_ops
    sequential_ops=$(grep -n "&&" "$orch_file" | wc -l | xargs)
    log_diagnostic "🔗 Found $sequential_ops sequential operations (&&)"
    log_diagnostic "   Consider parallelizing independent operations"

    echo ""
}

diagnostic_check_service_timeouts() {
    log_diagnostic "=== Service Timeout Configuration Analysis ==="

    # Extract service timeouts from orchestration/framework.sh
    local orch_file="${DIVE_ROOT}/scripts/dive-modules/orchestration/framework.sh"

    log_diagnostic "📊 Configured Service Timeouts:"

    # Parse SERVICE_TIMEOUTS array
    grep -A 15 "declare -A SERVICE_TIMEOUTS=" "$orch_file" | grep '^\s*\["' | while read line; do
        log_diagnostic "  $line"
    done

    # Check if timeouts are parameterized
    local hardcoded_timeouts
    hardcoded_timeouts=$(grep -c "sleep [0-9]" "$orch_file" || echo "0")
    if [ "$hardcoded_timeouts" -gt 5 ]; then
        log_diagnostic "⚠️  Found $hardcoded_timeouts hardcoded sleep statements"
        log_diagnostic "    Recommendation: Parameterize all timeouts in config file"
    fi

    echo ""
}

diagnostic_check_database_state() {
    log_diagnostic "=== Orchestration Database State ==="

    # Check if hub postgres is running
    if docker ps --format '{{.Names}}' | grep -q "dive-hub-postgres"; then
        log_diagnostic "✅ Hub PostgreSQL is running"

        # Check orchestration database
        local db_check
        db_check=$(docker exec dive-hub-postgres psql -U postgres -d orchestration -c "SELECT COUNT(*) FROM deployment_states" 2>/dev/null | grep -E "^\s*[0-9]+" | xargs || echo "0")

        if [ "$db_check" != "0" ]; then
            log_diagnostic "📊 Orchestration database has $db_check deployment state records"

            # Check for stuck deployments
            local stuck_deploys
            stuck_deploys=$(docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c "
                SELECT COUNT(*) FROM deployment_states
                WHERE current_state IN ('DEPLOYING', 'INITIALIZING', 'CONFIGURING')
                AND updated_at < NOW() - INTERVAL '1 hour'
            " 2>/dev/null | xargs || echo "0")

            if [ "$stuck_deploys" -gt 0 ]; then
                log_diagnostic "⚠️  Found $stuck_deploys stuck deployments (>1 hour in DEPLOYING state)"
            fi
        else
            log_diagnostic "ℹ️  Orchestration database is empty (no deployments recorded)"
        fi
    else
        log_diagnostic "❌ Hub PostgreSQL is not running - cannot check database state"
    fi

    echo ""
}

diagnostic_measure_deployment_phases() {
    log_diagnostic "=== Deployment Phase Timing Analysis ==="

    # Check for recent deployment metrics in database
    if docker ps --format '{{.Names}}' | grep -q "dive-hub-postgres"; then
        local recent_deploys
        recent_deploys=$(docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c "
            SELECT
                instance_code,
                current_state,
                EXTRACT(EPOCH FROM (updated_at - created_at))::INTEGER as duration_seconds
            FROM deployment_states
            WHERE updated_at > NOW() - INTERVAL '24 hours'
            ORDER BY updated_at DESC
            LIMIT 10
        " 2>/dev/null)

        if [ -n "$recent_deploys" ]; then
            log_diagnostic "📈 Recent Deployment Durations (last 24h):"
            echo "$recent_deploys" | while IFS='|' read instance state duration; do
                instance=$(echo "$instance" | xargs)
                state=$(echo "$state" | xargs)
                duration=$(echo "$duration" | xargs)
                log_diagnostic "  - $instance: $state (${duration}s)"
            done
        else
            log_diagnostic "ℹ️  No recent deployments found (last 24h)"
        fi
    fi

    echo ""
}

diagnostic_check_health_check_configs() {
    log_diagnostic "=== Health Check Configuration Analysis ==="

    local hub_compose="${DIVE_ROOT}/docker-compose.hub.yml"

    if [ -f "$hub_compose" ]; then
        # Count services with health checks
        local health_check_count
        health_check_count=$(grep -c "healthcheck:" "$hub_compose" || echo "0")
        local service_count
        service_count=$(grep -c "^  [a-z].*:$" "$hub_compose" || echo "0")

        log_diagnostic "📊 Health Checks: $health_check_count / $service_count services"

        if [ "$health_check_count" -lt "$service_count" ]; then
            log_diagnostic "⚠️  Not all services have health checks"
            log_diagnostic "    Services without health checks may cause startup delays"
        fi

        # Find aggressive health check intervals
        local aggressive_intervals
        aggressive_intervals=$(grep -A 3 "healthcheck:" "$hub_compose" | grep "interval:" | sed 's/.*interval: //' | while read interval; do
            if [[ "$interval" =~ ([0-9]+)s ]]; then
                local seconds="${BASH_REMATCH[1]}"
                if [ "$seconds" -lt 10 ]; then
                    echo "$seconds"
                fi
            fi
        done | wc -l | xargs)

        if [ "$aggressive_intervals" -gt 0 ]; then
            log_diagnostic "⚠️  Found $aggressive_intervals health checks with interval <10s"
            log_diagnostic "    Recommendation: Use 10-30s intervals to reduce overhead"
        fi
    fi

    echo ""
}

# =============================================================================
# REPORT GENERATION
# =============================================================================

generate_diagnostic_report() {
    log_diagnostic "=== Generating Diagnostic Report ==="

    cat > "$DIAGNOSTIC_REPORT" <<'REPORT_EOF'
# DIVE V3 Deployment Performance Diagnostic Report

**Generated:** $(date "+%Y-%m-%d %H:%M:%S")

## Executive Summary

This report identifies performance bottlenecks, timeout issues, and technical debt in the DIVE V3 deployment orchestration system.

## Findings Summary

### Critical Issues
REPORT_EOF

    # Analyze log for critical issues
    local critical_count=0

    if grep -q "Docker daemon is NOT running" "$DIAGNOSTIC_LOG"; then
        echo "- ❌ Docker daemon not running" >> "$DIAGNOSTIC_REPORT"
        ((critical_count++))
    fi

    if grep -q "Disk usage is high" "$DIAGNOSTIC_LOG"; then
        echo "- ⚠️ Disk usage >80% (may impact performance)" >> "$DIAGNOSTIC_REPORT"
        ((critical_count++))
    fi

    if grep -q "stuck deployments" "$DIAGNOSTIC_LOG"; then
        echo "- ⚠️ Stuck deployments detected in database" >> "$DIAGNOSTIC_REPORT"
        ((critical_count++))
    fi

    if [ "$critical_count" -eq 0 ]; then
        echo "- ✅ No critical issues detected" >> "$DIAGNOSTIC_REPORT"
    fi

    cat >> "$DIAGNOSTIC_REPORT" <<'REPORT_EOF2'

### Performance Bottlenecks

REPORT_EOF2

    # Extract orchestration issues
    if grep -q "Orchestration framework is very large" "$DIAGNOSTIC_LOG"; then
        local lines
        lines=$(grep "orchestration/framework.sh:" "$DIAGNOSTIC_LOG" | sed 's/.* //')
        echo "- 📄 Monolithic orchestration/framework.sh ($lines)" >> "$DIAGNOSTIC_REPORT"
        echo "  - Recommendation: Split into modules (<500 lines each)" >> "$DIAGNOSTIC_REPORT"
    fi

    # Extract timeout issues
    local timeout_count
    timeout_count=$(grep "timeout/sleep references" "$DIAGNOSTIC_LOG" | sed 's/.* //' || echo "0")
    if [ "$timeout_count" -gt 50 ]; then
        echo "- ⏱️ Excessive timeout references ($timeout_count)" >> "$DIAGNOSTIC_REPORT"
        echo "  - Recommendation: Centralize timeout configuration" >> "$DIAGNOSTIC_REPORT"
    fi

    # Extract sequential operation issues
    local sequential_ops
    sequential_ops=$(grep "sequential operations" "$DIAGNOSTIC_LOG" | sed 's/.* //' || echo "0")
    if [ "$sequential_ops" -gt 100 ]; then
        echo "- 🔗 Many sequential operations ($sequential_ops)" >> "$DIAGNOSTIC_REPORT"
        echo "  - Recommendation: Parallelize independent operations" >> "$DIAGNOSTIC_REPORT"
    fi

    cat >> "$DIAGNOSTIC_REPORT" <<'REPORT_EOF3'

## Detailed Findings

### 1. Docker Environment
REPORT_EOF3

    grep -A 20 "=== Docker Performance Check ===" "$DIAGNOSTIC_LOG" >> "$DIAGNOSTIC_REPORT"

    cat >> "$DIAGNOSTIC_REPORT" <<'REPORT_EOF4'

### 2. Filesystem Performance
REPORT_EOF4

    grep -A 10 "=== Filesystem Performance Check ===" "$DIAGNOSTIC_LOG" >> "$DIAGNOSTIC_REPORT"

    cat >> "$DIAGNOSTIC_REPORT" <<'REPORT_EOF5'

### 3. Orchestration Framework
REPORT_EOF5

    grep -A 15 "=== Orchestration Framework Analysis ===" "$DIAGNOSTIC_LOG" >> "$DIAGNOSTIC_REPORT"

    cat >> "$DIAGNOSTIC_REPORT" <<'REPORT_EOF6'

### 4. Service Timeouts
REPORT_EOF6

    grep -A 20 "=== Service Timeout Configuration ===" "$DIAGNOSTIC_LOG" >> "$DIAGNOSTIC_REPORT"

    cat >> "$DIAGNOSTIC_REPORT" <<'REPORT_EOF7'

### 5. Database State
REPORT_EOF7

    grep -A 15 "=== Orchestration Database State ===" "$DIAGNOSTIC_LOG" >> "$DIAGNOSTIC_REPORT"

    cat >> "$DIAGNOSTIC_REPORT" <<'REPORT_EOF8'

## Recommendations

### High Priority
1. **Split orchestration/framework.sh** into modules (<500 lines each)
   - Modularize by concern: init, deploy, validate, cleanup
   - Easier to maintain and test

2. **Centralize timeout configuration**
   - Move all timeouts to config/deployment-timeouts.env
   - Allow environment variable overrides
   - Document rationale for each timeout

3. **Implement parallel service startup**
   - Identify services with no dependencies
   - Start independent services concurrently
   - Use job control (&, wait) for background processes

4. **Optimize health checks**
   - Review all healthcheck: configs
   - Ensure start_period is sufficient
   - Use 10-30s intervals (not <10s)

### Medium Priority
5. **Add deployment phase metrics**
   - Record start/end time for each phase
   - Track time spent in each phase
   - Identify slowest phases

6. **Implement circuit breakers**
   - Fail-fast for known-failing operations
   - Reduce time wasted on retries
   - Auto-recovery after timeout period

7. **Add resume capability**
   - Save deployment state to file
   - Allow resuming from last successful phase
   - Useful for long-running deployments

## Next Steps

1. Review this report with team
2. Prioritize fixes based on impact vs effort
3. Implement Phase 2 fixes (critical timeouts, parallel startup)
4. Run performance benchmarks before/after
5. Document improvements in deployment-performance-report.md

---

**Log File:** $(basename "$DIAGNOSTIC_LOG")
**Report Generated:** $(date "+%Y-%m-%d %H:%M:%S")
REPORT_EOF8

    log_diagnostic "✅ Diagnostic report generated: $DIAGNOSTIC_REPORT"
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    log_diagnostic "=================================="
    log_diagnostic "DIVE V3 Deployment Diagnostics"
    log_diagnostic "=================================="
    log_diagnostic "Started: $(date "+%Y-%m-%d %H:%M:%S")"
    log_diagnostic ""

    # Run all diagnostic checks
    diagnostic_check_docker
    diagnostic_check_filesystem
    diagnostic_check_network
    diagnostic_analyze_orchestration
    diagnostic_check_service_timeouts
    diagnostic_check_database_state
    diagnostic_measure_deployment_phases
    diagnostic_check_health_check_configs

    # Generate report
    generate_diagnostic_report

    log_diagnostic ""
    log_diagnostic "=================================="
    log_diagnostic "Diagnostics Complete"
    log_diagnostic "=================================="
    log_diagnostic "Log: $DIAGNOSTIC_LOG"
    log_diagnostic "Report: $DIAGNOSTIC_REPORT"

    echo ""
    echo "✅ Diagnostics complete!"
    echo ""
    echo "📄 Detailed log: $DIAGNOSTIC_LOG"
    echo "📊 Report: $DIAGNOSTIC_REPORT"
    echo ""
}

main "$@"
