#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Deployment Performance Benchmark
# =============================================================================
# Measures deployment performance across multiple runs
# Generates before/after comparison metrics
# =============================================================================

set -eo pipefail

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIVE_ROOT"

# Source common functions
set +u
source "${DIVE_ROOT}/scripts/dive-modules/common.sh" 2>/dev/null || true
set -u

# =============================================================================
# CONFIGURATION
# =============================================================================

BENCHMARK_TYPE="${1:-hub}"          # hub or spoke
ITERATIONS="${2:-10}"                # Number of test runs
SPOKE_CODE="${3:-ALB}"               # Spoke code if benchmarking spoke

RESULTS_DIR="${DIVE_ROOT}/benchmarks"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RESULTS_FILE="${RESULTS_DIR}/benchmark-${BENCHMARK_TYPE}-${TIMESTAMP}.json"
REPORT_FILE="${RESULTS_DIR}/benchmark-${BENCHMARK_TYPE}-${TIMESTAMP}-report.md"

mkdir -p "$RESULTS_DIR"

# =============================================================================
# BENCHMARK FUNCTIONS
# =============================================================================

log_benchmark() {
    echo "[$(date '+%H:%M:%S')] $*"
}

##
# Run single deployment and measure time
#
# Returns: Duration in seconds
##
run_single_deployment() {
    local iteration=$1

    log_benchmark "Run $iteration/$ITERATIONS: Cleaning environment..."

    # Nuke previous deployment
    if [ "$BENCHMARK_TYPE" = "hub" ]; then
        ./dive nuke hub --yes >/dev/null 2>&1 || true
    else
        ./dive nuke spoke "$SPOKE_CODE" --yes >/dev/null 2>&1 || true
    fi

    # Wait for cleanup to complete
    sleep 5

    log_benchmark "Run $iteration/$ITERATIONS: Starting deployment..."
    local start_time=$(date +%s)

    # Run deployment
    local exit_code=0
    if [ "$BENCHMARK_TYPE" = "hub" ]; then
        ./dive deploy hub >/dev/null 2>&1 || exit_code=$?
    else
        ./dive deploy spoke "$SPOKE_CODE" >/dev/null 2>&1 || exit_code=$?
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [ $exit_code -eq 0 ]; then
        log_benchmark "Run $iteration/$ITERATIONS: ✅ SUCCESS in ${duration}s"
    else
        log_benchmark "Run $iteration/$ITERATIONS: ❌ FAILED in ${duration}s (exit code: $exit_code)"
    fi

    echo "$duration:$exit_code"
}

##
# Calculate statistics from array of values
#
# Arguments:
#   $@ - Array of numbers
#
# Outputs: min avg p50 p95 max
##
calculate_stats() {
    local values=("$@")

    # Sort values
    local sorted=($(printf '%s\n' "${values[@]}" | sort -n))

    local count=${#sorted[@]}
    local sum=0

    for val in "${sorted[@]}"; do
        sum=$((sum + val))
    done

    local min=${sorted[0]}
    local max=${sorted[$((count - 1))]}
    local avg=$((sum / count))

    # Calculate P50 (median)
    local p50_index=$((count / 2))
    local p50=${sorted[$p50_index]}

    # Calculate P95
    local p95_index=$(( (count * 95) / 100 ))
    [ $p95_index -ge $count ] && p95_index=$((count - 1))
    local p95=${sorted[$p95_index]}

    echo "$min $avg $p50 $p95 $max"
}

##
# Generate JSON results
##
generate_json_results() {
    local durations=("$@")

    cat > "$RESULTS_FILE" <<EOF
{
  "benchmark_type": "$BENCHMARK_TYPE",
  "timestamp": "$TIMESTAMP",
  "iterations": $ITERATIONS,
  "results": [
EOF

    local first=true
    for i in "${!durations[@]}"; do
        local data="${durations[$i]}"
        local duration="${data%%:*}"
        local exit_code="${data##*:}"
        local success="true"
        [ "$exit_code" != "0" ] && success="false"

        [ "$first" = true ] && first=false || echo "," >> "$RESULTS_FILE"

        cat >> "$RESULTS_FILE" <<EOF
    {
      "run": $((i + 1)),
      "duration_seconds": $duration,
      "exit_code": $exit_code,
      "success": $success
    }
EOF
    done

    cat >> "$RESULTS_FILE" <<EOF

  ]
}
EOF

    log_benchmark "Results saved to: $RESULTS_FILE"
}

##
# Generate markdown report
##
generate_report() {
    local durations_only=()
    local success_count=0
    local durations_with_status=("$@")

    # Extract just durations and count successes
    for data in "${durations_with_status[@]}"; do
        local duration="${data%%:*}"
        local exit_code="${data##*:}"
        durations_only+=($duration)
        [ "$exit_code" = "0" ] && ((success_count++))
    done

    # Calculate statistics
    read min avg p50 p95 max <<< $(calculate_stats "${durations_only[@]}")

    local success_rate=$(( (success_count * 100) / ITERATIONS ))

    # Generate report
    cat > "$REPORT_FILE" <<EOF
# DIVE V3 Deployment Performance Benchmark Report

**Benchmark Type:** $BENCHMARK_TYPE
**Date:** $(date '+%Y-%m-%d %H:%M:%S')
**Iterations:** $ITERATIONS

---

## Results Summary

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| **Success Rate** | $success_count/$ITERATIONS ($success_rate%) | 100% | $([ $success_rate -eq 100 ] && echo "✅" || echo "⚠️") |
| **Min Duration** | ${min}s | - | - |
| **Average Duration** | ${avg}s | <300s | $([ $avg -lt 300 ] && echo "✅" || echo "⚠️") |
| **Median (P50)** | ${p50}s | - | - |
| **P95 Duration** | ${p95}s | <360s | $([ $p95 -lt 360 ] && echo "✅" || echo "⚠️") |
| **Max Duration** | ${max}s | <400s | $([ $max -lt 400 ] && echo "✅" || echo "⚠️") |

---

## Performance Assessment

EOF

    if [ $success_rate -eq 100 ] && [ $avg -lt 300 ]; then
        echo "✅ **EXCELLENT** - All targets met" >> "$REPORT_FILE"
    elif [ $success_rate -ge 90 ] && [ $avg -lt 360 ]; then
        echo "⚠️  **ACCEPTABLE** - Most targets met" >> "$REPORT_FILE"
    else
        echo "❌ **NEEDS IMPROVEMENT** - Targets not met" >> "$REPORT_FILE"
    fi

    cat >> "$REPORT_FILE" <<EOF

---

## Detailed Results

| Run | Duration (s) | Status |
|-----|--------------|--------|
EOF

    for i in "${!durations_with_status[@]}"; do
        local data="${durations_with_status[$i]}"
        local duration="${data%%:*}"
        local exit_code="${data##*:}"
        local status="✅ Success"
        [ "$exit_code" != "0" ] && status="❌ Failed (exit: $exit_code)"

        echo "| $((i + 1)) | ${duration}s | $status |" >> "$REPORT_FILE"
    done

    cat >> "$REPORT_FILE" <<EOF

---

## Performance Distribution

\`\`\`
Min:  ${min}s  |━━━━━━━━━━━━━━━━━━━━|
Avg:  ${avg}s  |━━━━━━━━━━━━━━━━━━━━━━━━━━|
P50:  ${p50}s  |━━━━━━━━━━━━━━━━━━━━━━|
P95:  ${p95}s  |━━━━━━━━━━━━━━━━━━━━━━━━━━━━━|
Max:  ${max}s  |━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━|
\`\`\`

---

## Recommendations

EOF

    if [ $avg -gt 300 ]; then
        echo "- ⚠️  Average deployment time exceeds target (${avg}s > 300s)" >> "$REPORT_FILE"
        echo "- Consider parallel service startup optimization" >> "$REPORT_FILE"
        echo "- Review service startup times: \`./dive orch-db status\`" >> "$REPORT_FILE"
    fi

    if [ $success_rate -lt 100 ]; then
        local failure_count=$((ITERATIONS - success_count))
        echo "- ❌ $failure_count deployment failure(s) detected" >> "$REPORT_FILE"
        echo "- Review logs: \`./dive logs\`" >> "$REPORT_FILE"
        echo "- Check for timeout issues in \`config/deployment-timeouts.env\`" >> "$REPORT_FILE"
    fi

    if [ $success_rate -eq 100 ] && [ $avg -lt 300 ]; then
        echo "- ✅ Performance is excellent, no improvements needed" >> "$REPORT_FILE"
    fi

    cat >> "$REPORT_FILE" <<EOF

---

**Report Generated:** $(date '+%Y-%m-%d %H:%M:%S')
**Results File:** $RESULTS_FILE
EOF

    log_benchmark "Report saved to: $REPORT_FILE"
}

# =============================================================================
# MAIN BENCHMARK EXECUTION
# =============================================================================

main() {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "DIVE V3 Deployment Performance Benchmark"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Type:       $BENCHMARK_TYPE"
    echo "Iterations: $ITERATIONS"
    [ "$BENCHMARK_TYPE" = "spoke" ] && echo "Spoke Code: $SPOKE_CODE"
    echo "Started:    $(date '+%Y-%m-%d %H:%M:%S')"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    local durations=()
    local overall_start=$(date +%s)

    # Run benchmarks
    for i in $(seq 1 $ITERATIONS); do
        local result=$(run_single_deployment $i)
        durations+=("$result")
        echo ""
    done

    local overall_end=$(date +%s)
    local overall_duration=$((overall_end - overall_start))

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Benchmark Complete"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Total Time: ${overall_duration}s ($((overall_duration / 60))m $((overall_duration % 60))s)"
    echo ""

    # Generate results
    generate_json_results "${durations[@]}"
    generate_report "${durations[@]}"

    echo ""
    echo "📊 Results:"
    echo "  JSON:   $RESULTS_FILE"
    echo "  Report: $REPORT_FILE"
    echo ""

    # Show quick summary
    cat "$REPORT_FILE" | grep -A 10 "## Results Summary"
}

main "$@"
