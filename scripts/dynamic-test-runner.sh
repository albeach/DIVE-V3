#!/bin/bash
# =============================================================================
# DIVE V3 - Dynamic Test Runner
# =============================================================================
# Dynamically discovers and runs Playwright tests based on available instances
#
# Features:
# - Auto-discovers running DIVE instances
# - Generates Playwright configuration
# - Runs tests in parallel across instances
# - Provides comprehensive reporting
#
# Usage:
#   ./scripts/dynamic-test-runner.sh [options] [test-pattern]
#
# Options:
#   --instances URL1,URL2,...    Override instance discovery
#   --parallel N                 Number of parallel workers (default: auto)
#   --timeout N                  Test timeout in seconds (default: 300)
#   --retries N                  Number of retries on failure (default: 2)
#   --verbose                    Show detailed output
#   --dry-run                    Show what would be run without executing
#   --report                     Generate HTML report
#
# Examples:
#   ./scripts/dynamic-test-runner.sh                        # Run all tests
#   ./scripts/dynamic-test-runner.sh auth-flows.spec.ts     # Run specific test
#   ./scripts/dynamic-test-runner.sh --instances https://usa-app.dive25.com,https://fra-app.dive25.com
# =============================================================================

set -e

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default settings
PARALLEL_WORKERS="auto"
TEST_TIMEOUT=300
RETRIES=2
VERBOSE=false
DRY_RUN=false
GENERATE_REPORT=false
CUSTOM_INSTANCES=""

# ============================================================================
# Argument Parsing
# ============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --instances)
                CUSTOM_INSTANCES="$2"
                shift 2
                ;;
            --parallel)
                PARALLEL_WORKERS="$2"
                shift 2
                ;;
            --timeout)
                TEST_TIMEOUT="$2"
                shift 2
                ;;
            --retries)
                RETRIES="$2"
                shift 2
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --report)
                GENERATE_REPORT=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                TEST_PATTERN="$1"
                shift
                ;;
        esac
    done
}

show_help() {
    cat << EOF
DIVE V3 Dynamic Test Runner

Dynamically discovers and runs Playwright tests based on available instances.

USAGE:
    $0 [OPTIONS] [TEST_PATTERN]

OPTIONS:
    --instances URL1,URL2,...    Override automatic instance discovery
    --parallel N                 Number of parallel workers (default: auto)
    --timeout N                  Test timeout in seconds (default: 300)
    --retries N                  Number of retries on failure (default: 2)
    --verbose, -v                Show detailed output
    --dry-run                    Show what would be run without executing
    --report                     Generate HTML report after tests
    --help, -h                   Show this help

EXAMPLES:
    $0                             # Run all tests on discovered instances
    $0 auth-flows.spec.ts         # Run specific test file
    $0 --instances https://usa-app.dive25.com,https://fra-app.dive25.com
    $0 --parallel 4 --verbose     # Run with 4 workers, verbose output

EOF
}

# ============================================================================
# Instance Discovery
# ============================================================================

discover_instances() {
    log_info "Discovering DIVE instances..."

    local instances=()

    # If custom instances provided, use them
    if [ -n "$CUSTOM_INSTANCES" ]; then
        IFS=',' read -ra instances <<< "$CUSTOM_INSTANCES"
    else
        # Auto-discover instances from fixtures
        if [ -d "$DIVE_ROOT/tests/fixtures/federation/spoke-configs" ]; then
            for config_file in "$DIVE_ROOT/tests/fixtures/federation/spoke-configs"/*.json; do
                if [ -f "$config_file" ]; then
                    local base_url
                    base_url=$(jq -r '.endpoints.baseUrl // empty' "$config_file" 2>/dev/null)
                    if [ -n "$base_url" ] && [ "$base_url" != "null" ]; then
                        instances+=("$base_url")
                    fi
                fi
            done
        fi

        # Add localhost if no instances found
        if [ ${#instances[@]} -eq 0 ]; then
            instances=("https://localhost:3000")
        fi
    fi

    # Validate instances are accessible
    local valid_instances=()
    for instance in "${instances[@]}"; do
        log_verbose "Checking instance: $instance"
        if curl -k --max-time 10 --silent "$instance" >/dev/null 2>&1; then
            valid_instances+=("$instance")
            log_verbose "✓ Instance accessible: $instance"
        else
            log_verbose "✗ Instance not accessible: $instance"
        fi
    done

    echo "${valid_instances[@]}"
}

# ============================================================================
# Playwright Configuration Generation
# ============================================================================

generate_playwright_config() {
    local instances=("$@")
    local config_file="/tmp/playwright-dynamic.config.ts"

    log_info "Generating Playwright configuration..."

    cat > "$config_file" << EOF
import { defineConfig, devices } from '@playwright/test';

/**
 * Dynamic Playwright configuration generated by DIVE test runner
 * Instances: ${instances[*]}
 * Generated: $(date)
 */

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: ${RETRIES},

  /* Opt out of parallel tests on CI. */
  workers: '${PARALLEL_WORKERS}',

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results.json' }],
    ['line']
  ],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like \`await page.goto('/')\`. */
    baseURL: process.env.BASE_URL || '${instances[0]}',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot only when test fails */
    screenshot: 'only-on-failure',

    /* Record video only when test fails */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
EOF

    # Add projects for each instance
    local project_count=0
    for instance in "${instances[@]}"; do
        local instance_name
        instance_name=$(echo "$instance" | sed 's|https://||; s|http://||; s|[:/].*||')
        local project_name="${instance_name:-instance$project_count}"

        cat >> "$config_file" << EOF
    {
      name: '${project_name}',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: '${instance}',
        /* Override environment-specific settings */
        extraHTTPHeaders: {
          'X-Test-Instance': '${project_name}',
        },
      },
      testMatch: ${TEST_PATTERN:+['**/${TEST_PATTERN}**']},
      timeout: ${TEST_TIMEOUT}000,
    },
EOF
        ((project_count++))
    done

    cat >> "$config_file" << EOF
  ],

  /* Run your local dev server before starting the tests */
  webServer: undefined, // We don't start servers, they should be running
});
EOF

    echo "$config_file"
}

# ============================================================================
# Test Execution
# ============================================================================

run_tests() {
    local config_file="$1"
    shift
    local instances=("$@")

    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN - Would execute:"
        echo "npx playwright test --config=\"$config_file\" ${TEST_PATTERN:+--grep=\"$TEST_PATTERN\"}"
        return 0
    fi

    log_info "Running Playwright tests..."
    log_info "Instances: ${instances[*]}"
    log_info "Workers: $PARALLEL_WORKERS"
    log_info "Timeout: ${TEST_TIMEOUT}s"
    log_info "Retries: $RETRIES"

    local start_time
    start_time=$(date +%s)

    # Set environment variables for tests
    export DIVE_TEST_ENV=dynamic
    export DIVE_INSTANCES="${instances[*]}"

    # Run playwright tests
    if [ "$VERBOSE" = true ]; then
        npx playwright test --config="$config_file" ${TEST_PATTERN:+--grep="$TEST_PATTERN"}
    else
        npx playwright test --config="$config_file" ${TEST_PATTERN:+--grep="$TEST_PATTERN"} 2>&1 | grep -E "(Running|passed|failed|✓|✗)"
    fi

    local exit_code=$?
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log_info "Tests completed in ${duration}s"

    # Generate report if requested
    if [ "$GENERATE_REPORT" = true ] && [ $exit_code -eq 0 ]; then
        log_info "Generating HTML report..."
        npx playwright show-report
    fi

    return $exit_code
}

# ============================================================================
# Utility Functions
# ============================================================================

log_info()    { echo -e "${CYAN}[INFO]${NC} $*" >&2; }
log_success() { echo -e "${GREEN}[PASS]${NC} $*" >&2; }
log_fail()    { echo -e "${RED}[FAIL]${NC} $*" >&2; }
log_verbose() { [ "$VERBOSE" = true ] && echo -e "${CYAN}[DEBUG]${NC} $*" >&2; }

# ============================================================================
# Main
# ============================================================================

main() {
    parse_args "$@"

    echo ""
    echo "=============================================="
    echo " DIVE V3 - Dynamic Test Runner"
    echo "=============================================="
    echo ""

    # Discover instances
    local instances_string
    instances_string=$(discover_instances)
    IFS=' ' read -ra instances <<< "$instances_string"

    if [ ${#instances[@]} -eq 0 ]; then
        log_fail "No accessible instances found"
        echo ""
        echo "Troubleshooting:"
        echo "  - Ensure DIVE instances are running"
        echo "  - Check network connectivity"
        echo "  - Use --instances to specify manually"
        exit 1
    fi

    log_success "Found ${#instances[@]} accessible instances:"
    for instance in "${instances[@]}"; do
        log_info "  - $instance"
    done
    echo ""

    # Generate Playwright config
    local config_file
    config_file=$(generate_playwright_config "${instances[@]}")
    log_success "Generated config: $config_file"
    echo ""

    # Run tests
    run_tests "$config_file" "${instances[@]}"
    local exit_code=$?

    # Cleanup
    if [ "$DRY_RUN" = false ]; then
        rm -f "$config_file"
    fi

    echo ""
    if [ $exit_code -eq 0 ]; then
        log_success "All dynamic tests passed! ✓"
    else
        log_fail "Some tests failed ✗"
    fi

    return $exit_code
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
# sc2034-anchor
: "${YELLOW:-}"
