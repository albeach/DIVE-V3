#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Chaos Tests - Run All
# =============================================================================
# Executes all chaos tests and generates a comprehensive report
# =============================================================================

set -e

CHAOS_DIR="$(dirname "${BASH_SOURCE[0]}")"
DIVE_ROOT="$(cd "${CHAOS_DIR}/../.." && pwd)"

source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

# =============================================================================
# CONFIGURATION
# =============================================================================

TARGET="${1:-hub}"
REPORT_DIR="${DIVE_ROOT}/logs/chaos-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${REPORT_DIR}/chaos-report-${TARGET}-${TIMESTAMP}.json"

mkdir -p "$REPORT_DIR"

# =============================================================================
# RUN ALL TESTS
# =============================================================================

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  DIVE V3 CHAOS TEST SUITE"
echo "║  Target: $TARGET"
echo "║  Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Initialize results
declare -A suite_results

# Run each test suite
echo "Running Database Failure Tests..."
if bash "${CHAOS_DIR}/database-failure.sh" "$TARGET" 2>&1 | tee "${REPORT_DIR}/db-failure-${TIMESTAMP}.log"; then
    suite_results["database_failure"]="passed"
else
    suite_results["database_failure"]="failed"
fi

echo ""
echo "Running Network Partition Tests..."
if bash "${CHAOS_DIR}/network-partition.sh" "$TARGET" 2>&1 | tee "${REPORT_DIR}/network-${TIMESTAMP}.log"; then
    suite_results["network_partition"]="passed"
else
    suite_results["network_partition"]="failed"
fi

echo ""
echo "Running Secret Unavailability Tests..."
if bash "${CHAOS_DIR}/secret-unavailable.sh" 2>&1 | tee "${REPORT_DIR}/secrets-${TIMESTAMP}.log"; then
    suite_results["secret_unavailable"]="passed"
else
    suite_results["secret_unavailable"]="failed"
fi

echo ""
echo "Running Container Crash Tests..."
if bash "${CHAOS_DIR}/container-crash.sh" "$TARGET" 2>&1 | tee "${REPORT_DIR}/container-${TIMESTAMP}.log"; then
    suite_results["container_crash"]="passed"
else
    suite_results["container_crash"]="failed"
fi

echo ""
echo "Running Concurrent Deployment Tests..."
if bash "${CHAOS_DIR}/concurrent-deployments.sh" 2>&1 | tee "${REPORT_DIR}/concurrent-${TIMESTAMP}.log"; then
    suite_results["concurrent_deployment"]="passed"
else
    suite_results["concurrent_deployment"]="failed"
fi

# =============================================================================
# GENERATE REPORT
# =============================================================================

passed_count=0
failed_count=0

for suite in "${!suite_results[@]}"; do
    if [ "${suite_results[$suite]}" = "passed" ]; then
        ((passed_count++))
    else
        ((failed_count++))
    fi
done

total_count=$((passed_count + failed_count))
success_rate=0
if [ $total_count -gt 0 ]; then
    success_rate=$((passed_count * 100 / total_count))
fi

# Generate JSON report
cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "target": "$TARGET",
  "suites": {
    "database_failure": "${suite_results[database_failure]}",
    "network_partition": "${suite_results[network_partition]}",
    "secret_unavailable": "${suite_results[secret_unavailable]}",
    "container_crash": "${suite_results[container_crash]}",
    "concurrent_deployment": "${suite_results[concurrent_deployment]}"
  },
  "summary": {
    "total": $total_count,
    "passed": $passed_count,
    "failed": $failed_count,
    "success_rate": $success_rate
  }
}
EOF

# =============================================================================
# FINAL SUMMARY
# =============================================================================

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  CHAOS TEST SUMMARY"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Suites Passed: $passed_count / $total_count"
echo "║  Suites Failed: $failed_count / $total_count"
echo "║  Success Rate:  ${success_rate}%"
echo "║  Target Rate:   95%"
echo "╠══════════════════════════════════════════════════════════════╣"

if [ $success_rate -ge 95 ]; then
    echo "║  STATUS: ✓ PASSED"
    exit_code=0
else
    echo "║  STATUS: ✗ FAILED (${success_rate}% < 95%)"
    exit_code=1
fi

echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Report: $REPORT_FILE"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

exit $exit_code
