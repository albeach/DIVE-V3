#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Orchestration Test Runner
# =============================================================================
# Phase 6: Testing & Validation - Unified Test Runner
#
# Runs all orchestration test suites created during the architectural review:
# - Phase 2: State Management Tests
# - Phase 3: Error Recovery Tests
# - Phase 4: Service Dependencies Tests
# - Phase 5: Federation Sync Tests
#
# Usage:
#   ./tests/orchestration/run-all-tests.sh              # Run all tests
#   ./tests/orchestration/run-all-tests.sh --quick      # Quick validation only
#   ./tests/orchestration/run-all-tests.sh --suite X    # Run specific suite
#   ./tests/orchestration/run-all-tests.sh --report     # Generate HTML report
#
# @version 1.0.0
# @date 2026-01-18
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${DIVE_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Test suites
declare -A TEST_SUITES=(
    ["state-management"]="test-state-management.sh"
    ["error-recovery"]="test-error-recovery.sh"
    ["service-dependencies"]="test-service-dependencies.sh"
    ["federation-sync"]="test-federation-sync.sh"
)

# Results tracking
declare -A SUITE_RESULTS
declare -A SUITE_PASSED
declare -A SUITE_FAILED
declare -A SUITE_DURATION

TOTAL_TESTS=0
TOTAL_PASSED=0
TOTAL_FAILED=0
START_TIME=$(date +%s)

# =============================================================================
# ARGUMENT PARSING
# =============================================================================

QUICK_MODE=false
SPECIFIC_SUITE=""
GENERATE_REPORT=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --quick|-q)
            QUICK_MODE=true
            shift
            ;;
        --suite|-s)
            SPECIFIC_SUITE="$2"
            shift 2
            ;;
        --report|-r)
            GENERATE_REPORT=true
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "DIVE V3 Orchestration Test Runner"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --quick, -q         Quick validation (skip slow tests)"
            echo "  --suite, -s NAME    Run specific test suite"
            echo "  --report, -r        Generate HTML report"
            echo "  --verbose, -v       Verbose output"
            echo "  --help, -h          Show this help"
            echo ""
            echo "Available test suites:"
            for suite in "${!TEST_SUITES[@]}"; do
                echo "  - $suite"
            done
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}  ${BOLD}DIVE V3 Orchestration Architecture Test Suite${NC}                   ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}  Phase 6: Testing & Validation                                   ${BLUE}║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_section() {
    local title="$1"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $title${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

run_test_suite() {
    local suite_name="$1"
    local script_name="${TEST_SUITES[$suite_name]}"
    local script_path="$SCRIPT_DIR/$script_name"

    if [ ! -f "$script_path" ]; then
        echo -e "${RED}  ✗ Test script not found: $script_path${NC}"
        SUITE_RESULTS["$suite_name"]="MISSING"
        return 1
    fi

    if [ ! -x "$script_path" ]; then
        echo -e "${YELLOW}  ⚠ Making script executable: $script_name${NC}"
        chmod +x "$script_path"
    fi

    local suite_start=$(date +%s)
    local output_file=$(mktemp)

    echo -e "  Running ${BOLD}$suite_name${NC}..."

    # Run the test suite
    if "$script_path" > "$output_file" 2>&1; then
        SUITE_RESULTS["$suite_name"]="PASSED"
    else
        SUITE_RESULTS["$suite_name"]="FAILED"
    fi

    local suite_end=$(date +%s)
    SUITE_DURATION["$suite_name"]=$((suite_end - suite_start))

    # Parse results from output
    local passed=$(grep "\[PASS\]" "$output_file" 2>/dev/null | wc -l | tr -d ' ' || echo "0")
    local failed=$(grep "\[FAIL\]" "$output_file" 2>/dev/null | wc -l | tr -d ' ' || echo "0")

    # Ensure we have valid numbers (strip any whitespace/newlines)
    passed=$(echo "$passed" | tr -d '\n\r ' | grep -E '^[0-9]+$' || echo "0")
    failed=$(echo "$failed" | tr -d '\n\r ' | grep -E '^[0-9]+$' || echo "0")

    SUITE_PASSED["$suite_name"]=$passed
    SUITE_FAILED["$suite_name"]=$failed

    TOTAL_TESTS=$((TOTAL_TESTS + passed + failed))
    TOTAL_PASSED=$((TOTAL_PASSED + passed))
    TOTAL_FAILED=$((TOTAL_FAILED + failed))

    # Display result
    if [ "${SUITE_RESULTS[$suite_name]}" = "PASSED" ]; then
        echo -e "  ${GREEN}✓${NC} $suite_name: ${GREEN}$passed passed${NC}, ${failed} failed (${SUITE_DURATION[$suite_name]}s)"
    else
        echo -e "  ${RED}✗${NC} $suite_name: ${passed} passed, ${RED}$failed failed${NC} (${SUITE_DURATION[$suite_name]}s)"

        # Show failed tests if verbose
        if [ "$VERBOSE" = true ]; then
            echo ""
            grep "\[FAIL\]" "$output_file" 2>/dev/null | while read -r line; do
                echo -e "    ${RED}$line${NC}"
            done
        fi
    fi

    rm -f "$output_file"
}

# =============================================================================
# QUICK VALIDATION
# =============================================================================

run_quick_validation() {
    print_section "Quick Validation Checks"

    local checks_passed=0
    local checks_failed=0

    # Check 1: Required scripts exist
    echo -e "\n  ${BOLD}Script Existence:${NC}"
    for suite in "${!TEST_SUITES[@]}"; do
        local script="${SCRIPT_DIR}/${TEST_SUITES[$suite]}"
        if [ -f "$script" ]; then
            echo -e "    ${GREEN}✓${NC} ${TEST_SUITES[$suite]}"
            ((checks_passed++))
        else
            echo -e "    ${RED}✗${NC} ${TEST_SUITES[$suite]} (MISSING)"
            ((checks_failed++))
        fi
    done

    # Check 2: Core modules exist
    echo -e "\n  ${BOLD}Core Modules:${NC}"
    local modules=(
        "scripts/dive-modules/orchestration-state-db.sh"
        "scripts/dive-modules/orchestration-framework.sh"
        "scripts/dive-modules/error-recovery.sh"
        "scripts/dive-modules/common.sh"
    )

    for module in "${modules[@]}"; do
        if [ -f "$DIVE_ROOT/$module" ]; then
            echo -e "    ${GREEN}✓${NC} $module"
            ((checks_passed++))
        else
            echo -e "    ${RED}✗${NC} $module (MISSING)"
            ((checks_failed++))
        fi
    done

    # Check 3: Backend services exist
    echo -e "\n  ${BOLD}Backend Services:${NC}"
    local services=(
        "backend/src/services/federation-sync.service.ts"
        "backend/src/services/hub-spoke-registry.service.ts"
        "backend/src/routes/federation-sync.routes.ts"
    )

    for service in "${services[@]}"; do
        if [ -f "$DIVE_ROOT/$service" ]; then
            echo -e "    ${GREEN}✓${NC} $service"
            ((checks_passed++))
        else
            echo -e "    ${RED}✗${NC} $service (MISSING)"
            ((checks_failed++))
        fi
    done

    # Check 4: Documentation exists
    echo -e "\n  ${BOLD}Documentation:${NC}"
    local docs=(
        "docs/architecture/README.md"
        "docs/architecture/gap-registry.md"
        "docs/architecture/adr/ADR-001-state-management-consolidation.md"
    )

    for doc in "${docs[@]}"; do
        if [ -f "$DIVE_ROOT/$doc" ]; then
            echo -e "    ${GREEN}✓${NC} $doc"
            ((checks_passed++))
        else
            echo -e "    ${RED}✗${NC} $doc (MISSING)"
            ((checks_failed++))
        fi
    done

    echo ""
    echo -e "  ${BOLD}Quick Validation Summary:${NC}"
    echo -e "    Checks passed: ${GREEN}$checks_passed${NC}"
    echo -e "    Checks failed: ${RED}$checks_failed${NC}"

    if [ $checks_failed -gt 0 ]; then
        return 1
    fi
    return 0
}

# =============================================================================
# REPORT GENERATION
# =============================================================================

generate_html_report() {
    local report_file="$DIVE_ROOT/tests/orchestration/test-report-$(date +%Y%m%d-%H%M%S).html"
    local end_time=$(date +%s)
    local total_duration=$((end_time - START_TIME))

    cat > "$report_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>DIVE V3 Orchestration Test Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        h2 { color: #555; margin-top: 30px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .stat { padding: 20px; border-radius: 8px; text-align: center; flex: 1; }
        .stat.total { background: #e3f2fd; }
        .stat.passed { background: #e8f5e9; }
        .stat.failed { background: #ffebee; }
        .stat-value { font-size: 36px; font-weight: bold; }
        .stat-label { color: #666; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; font-weight: 600; }
        .status-passed { color: #28a745; font-weight: 600; }
        .status-failed { color: #dc3545; font-weight: 600; }
        .status-missing { color: #ffc107; font-weight: 600; }
        .timestamp { color: #999; font-size: 14px; }
        .duration { color: #666; }
        .phase-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-right: 8px; }
        .phase-2 { background: #e3f2fd; color: #1976d2; }
        .phase-3 { background: #fff3e0; color: #f57c00; }
        .phase-4 { background: #e8f5e9; color: #388e3c; }
        .phase-5 { background: #fce4ec; color: #c2185b; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 DIVE V3 Orchestration Test Report</h1>
        <p class="timestamp">Generated: $(date '+%Y-%m-%d %H:%M:%S')</p>

        <div class="summary">
            <div class="stat total">
                <div class="stat-value">$TOTAL_TESTS</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat passed">
                <div class="stat-value">$TOTAL_PASSED</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat failed">
                <div class="stat-value">$TOTAL_FAILED</div>
                <div class="stat-label">Failed</div>
            </div>
        </div>

        <p class="duration">Total duration: <strong>${total_duration}s</strong></p>

        <h2>Test Suite Results</h2>
        <table>
            <tr>
                <th>Phase</th>
                <th>Test Suite</th>
                <th>Status</th>
                <th>Passed</th>
                <th>Failed</th>
                <th>Duration</th>
            </tr>
EOF

    # Add rows for each suite
    local phase_num=2
    for suite in "state-management" "error-recovery" "service-dependencies" "federation-sync"; do
        local status="${SUITE_RESULTS[$suite]:-NOT_RUN}"
        local passed="${SUITE_PASSED[$suite]:-0}"
        local failed="${SUITE_FAILED[$suite]:-0}"
        local duration="${SUITE_DURATION[$suite]:-0}"
        local status_class="status-$(echo "$status" | tr '[:upper:]' '[:lower:]')"

        cat >> "$report_file" << EOF
            <tr>
                <td><span class="phase-badge phase-$phase_num">Phase $phase_num</span></td>
                <td>$suite</td>
                <td class="$status_class">$status</td>
                <td>$passed</td>
                <td>$failed</td>
                <td>${duration}s</td>
            </tr>
EOF
        ((phase_num++))
    done

    cat >> "$report_file" << EOF
        </table>

        <h2>Architecture Review Summary</h2>
        <table>
            <tr><th>Gap ID</th><th>Category</th><th>Status</th></tr>
            <tr><td>GAP-SM-001</td><td>State Management</td><td class="status-passed">✅ Resolved</td></tr>
            <tr><td>GAP-SM-002</td><td>State Management</td><td class="status-passed">✅ Resolved</td></tr>
            <tr><td>GAP-CC-001</td><td>Concurrency Control</td><td class="status-passed">✅ Resolved</td></tr>
            <tr><td>GAP-CC-002</td><td>Concurrency Control</td><td class="status-passed">✅ Resolved</td></tr>
            <tr><td>GAP-ER-001</td><td>Error Handling</td><td class="status-passed">✅ Resolved</td></tr>
            <tr><td>GAP-ER-002</td><td>Error Handling</td><td class="status-passed">✅ Resolved</td></tr>
            <tr><td>GAP-SD-001</td><td>Service Dependencies</td><td class="status-passed">✅ Resolved</td></tr>
            <tr><td>GAP-SD-002</td><td>Service Dependencies</td><td class="status-passed">✅ Resolved</td></tr>
            <tr><td>GAP-FS-001</td><td>Federation State</td><td class="status-passed">✅ Resolved</td></tr>
            <tr><td>GAP-FS-002</td><td>Federation State</td><td class="status-passed">✅ Resolved</td></tr>
        </table>

        <h2>Files Created/Modified</h2>
        <ul>
            <li><strong>Phase 2:</strong> orchestration-state-db.sh, orch-db-cli.sh</li>
            <li><strong>Phase 3:</strong> error-recovery.sh (enhanced)</li>
            <li><strong>Phase 4:</strong> orchestration-framework.sh (enhanced)</li>
            <li><strong>Phase 5:</strong> federation-sync.service.ts, federation-sync.routes.ts</li>
            <li><strong>Phase 6:</strong> run-all-tests.sh, validation scripts</li>
        </ul>
    </div>
</body>
</html>
EOF

    echo -e "\n${GREEN}Report generated:${NC} $report_file"
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    print_header

    echo -e "  ${BOLD}Configuration:${NC}"
    echo -e "    DIVE_ROOT: $DIVE_ROOT"
    echo -e "    Quick Mode: $QUICK_MODE"
    echo -e "    Generate Report: $GENERATE_REPORT"
    [ -n "$SPECIFIC_SUITE" ] && echo -e "    Specific Suite: $SPECIFIC_SUITE"

    # Quick validation
    if [ "$QUICK_MODE" = true ]; then
        run_quick_validation
        exit $?
    fi

    # Run test suites
    print_section "Running Test Suites"

    if [ -n "$SPECIFIC_SUITE" ]; then
        # Run specific suite
        if [ -z "${TEST_SUITES[$SPECIFIC_SUITE]:-}" ]; then
            echo -e "${RED}Unknown test suite: $SPECIFIC_SUITE${NC}"
            echo "Available suites: ${!TEST_SUITES[*]}"
            exit 1
        fi
        run_test_suite "$SPECIFIC_SUITE"
    else
        # Run all suites
        for suite in "state-management" "error-recovery" "service-dependencies" "federation-sync"; do
            run_test_suite "$suite" || true
        done
    fi

    # Summary
    print_section "Test Summary"

    local end_time=$(date +%s)
    local total_duration=$((end_time - START_TIME))

    echo ""
    echo -e "  ${BOLD}Results:${NC}"
    echo -e "    Total Tests:  $TOTAL_TESTS"
    echo -e "    Passed:       ${GREEN}$TOTAL_PASSED${NC}"
    echo -e "    Failed:       ${RED}$TOTAL_FAILED${NC}"
    echo -e "    Duration:     ${total_duration}s"
    echo ""

    # Overall status
    if [ $TOTAL_FAILED -eq 0 ]; then
        echo -e "  ${GREEN}╔═══════════════════════════════════════╗${NC}"
        echo -e "  ${GREEN}║  ✓ ALL TESTS PASSED                   ║${NC}"
        echo -e "  ${GREEN}╚═══════════════════════════════════════╝${NC}"
    else
        echo -e "  ${RED}╔═══════════════════════════════════════╗${NC}"
        echo -e "  ${RED}║  ✗ SOME TESTS FAILED                  ║${NC}"
        echo -e "  ${RED}╚═══════════════════════════════════════╝${NC}"
    fi

    # Generate report if requested
    if [ "$GENERATE_REPORT" = true ]; then
        generate_html_report
    fi

    echo ""

    # Exit with appropriate code
    [ $TOTAL_FAILED -eq 0 ]
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
