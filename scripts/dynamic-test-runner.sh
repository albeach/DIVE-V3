#!/bin/bash
# =============================================================================
# DIVE V3 - Dynamic Hub-Spoke Test Runner
# =============================================================================
# Automatically detects running instances and runs appropriate Playwright tests
#
# Features:
# - Scans Docker containers to detect running instances
# - Maps instances to appropriate test configurations
# - Runs tests dynamically based on what's actually running
# - Supports parallel execution across instances
#
# Usage:
#   ./scripts/dynamic-test-runner.sh              # Test all detected instances
#   ./scripts/dynamic-test-runner.sh --instance ALB  # Test specific instance
#   ./scripts/dynamic-test-runner.sh --federation    # Test federation features
#   ./scripts/dynamic-test-runner.sh --parallel      # Run in parallel
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRONTEND_DIR="${DIVE_ROOT}/frontend"

# Default settings
PARALLEL=false
FEDERATION_ONLY=false
SPECIFIC_INSTANCE=""
VERBOSE=false
DRY_RUN=false

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_header() {
    echo -e "${BOLD}${CYAN}$1${NC}"
    echo -e "${CYAN}$(printf '%.0s=' {1..60})${NC}"
}

# =============================================================================
# INSTANCE DETECTION
# =============================================================================

detect_running_instances() {
    log_info "Scanning for running DIVE instances..."

    # Get all running containers
    local containers=$(docker ps --format "table {{.Names}}|{{.Ports}}" | tail -n +2)

    # Initialize arrays
    DETECTED_INSTANCES=""

    # Parse container information
    while IFS='|' read -r name ports; do
        # Extract instance code from container name (e.g., "alb-frontend-alb-1" -> "alb")
        if [[ $name =~ ^([a-z]{3})-(frontend|backend)-([a-z]{3}) ]]; then
            local instance_code="${BASH_REMATCH[1]}"
            local service_type="${BASH_REMATCH[2]}"

            # Extract port from ports string (0.0.0.0:EXTERNAL_PORT->INTERNAL_PORT/tcp)
            local port=""
            port=$(echo "$ports" | grep -oE '0\.0\.0\.0:([0-9]+)->' | head -1 | sed 's/0\.0\.0\.0:\([0-9]*\)->.*/\1/')

            if [ -n "$port" ]; then
                # Export URL as environment variable
                export "INSTANCE_URL_${instance_code}_${service_type}=https://localhost:$port"

                # Add to detected instances list (avoid duplicates)
                if [[ "$DETECTED_INSTANCES" != *"$instance_code"* ]]; then
                    DETECTED_INSTANCES="$DETECTED_INSTANCES $instance_code"
                fi
            fi
        fi
    done <<< "$containers"

    # Check for hub instance (different naming pattern)
    if docker ps --format "{{.Names}}" | grep -q "^dive-hub-frontend"; then
        export "INSTANCE_URL_hub_frontend=https://localhost:3000"
        export "INSTANCE_URL_hub_backend=https://localhost:4000"
        DETECTED_INSTANCES="$DETECTED_INSTANCES hub"
    fi

    # Clean up detected instances
    DETECTED_INSTANCES=$(echo "$DETECTED_INSTANCES" | tr ' ' '\n' | sort | uniq | tr '\n' ' ')
}

# =============================================================================
# TEST CONFIGURATION
# =============================================================================

generate_test_config() {
    local instance="$1"
    local frontend_url_var="INSTANCE_URL_${instance}_frontend"
    local backend_url_var="INSTANCE_URL_${instance}_backend"
    local frontend_url="${!frontend_url_var}"
    local backend_url="${!backend_url_var}"

    if [ -z "$frontend_url" ]; then
        log_error "No frontend URL found for instance $instance"
        return 1
    fi

    cat << EOF > "/tmp/playwright-${instance}.json"
{
  "baseURL": "${frontend_url}",
  "backendURL": "${backend_url:-}",
  "instance": "${instance}",
  "instanceName": "$(get_instance_display_name "$instance")"
}
EOF

    log_info "Generated config for $instance: $frontend_url"
}

get_instance_display_name() {
    local instance="$1"
    case $instance in
        hub) echo "DIVE Hub" ;;
        usa) echo "United States" ;;
        gbr) echo "United Kingdom" ;;
        fra) echo "France" ;;
        deu) echo "Germany" ;;
        can) echo "Canada" ;;
        alb) echo "Albania" ;;
        dnk) echo "Denmark" ;;
        rou) echo "Romania" ;;
        aus) echo "Australia" ;;
        nzl) echo "New Zealand" ;;
        *) echo "$instance" ;;
    esac
}

# =============================================================================
# TEST EXECUTION
# =============================================================================

run_instance_tests() {
    local instance="$1"

    log_header "Testing Instance: $(get_instance_display_name "$instance") ($instance)"

    # Generate dynamic Playwright config
    if [ "$DRY_RUN" != true ]; then
        log_info "Generating dynamic Playwright configuration..."
        node "$SCRIPT_DIR/generate-playwright-config.js"
    fi

    # Set environment variables for this instance
    local frontend_url_var="INSTANCE_URL_${instance}_frontend"
    local backend_url_var="INSTANCE_URL_${instance}_backend"
    export DIVE_INSTANCE="$instance"
    export BASE_URL="${!frontend_url_var:-}"
    export BACKEND_URL="${!backend_url_var:-}"

    log_info "Frontend URL: $BASE_URL"
    if [ -n "$BACKEND_URL" ]; then
        log_info "Backend URL: $BACKEND_URL"
    fi

    # Run tests
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would run: cd $FRONTEND_DIR && npx playwright test --config playwright.dynamic.config.ts --project ${instance}-chromium"
        return 0
    fi

    cd "$FRONTEND_DIR"

    # Use the dynamically generated config
    local config_file="playwright.dynamic.config.ts"
    if [ ! -f "$config_file" ]; then
        log_error "Dynamic config file not found: $config_file"
        return 1
    fi

    if [ "$FEDERATION_ONLY" = true ]; then
        log_info "Running federation tests..."
        npx playwright test --config "$config_file" --project federation-chromium --reporter=list
    else
        log_info "Running instance-specific tests..."
        npx playwright test --config "$config_file" --project ${instance}-chromium --reporter=list
    fi

    local exit_code=$?
    cd "$DIVE_ROOT"

    if [ $exit_code -eq 0 ]; then
        log_success "Tests passed for $instance"
    else
        log_error "Tests failed for $instance"
    fi

    return $exit_code
}

run_parallel_tests() {
    log_header "Running Parallel Tests Across All Instances"

    local pids=()
    local results=()

    for instance in $DETECTED_INSTANCES; do
        # Skip if specific instance requested and this isn't it
        if [ -n "$SPECIFIC_INSTANCE" ] && [ "$instance" != "$SPECIFIC_INSTANCE" ]; then
            continue
        fi

        generate_test_config "$instance" || continue

        run_instance_tests "$instance" &
        pids+=($!)
        results+=("$instance:$!")
    done

    # Wait for all tests to complete
    local failed_instances=()
    for result in "${results[@]}"; do
        IFS=':' read -r instance pid <<< "$result"
        if ! wait "$pid"; then
            failed_instances+=("$instance")
        fi
    done

    # Report results
    if [ ${#failed_instances[@]} -eq 0 ]; then
        log_success "All parallel tests passed!"
    else
        log_error "Failed instances: ${failed_instances[*]}"
        return 1
    fi
}

run_federation_tests() {
    log_header "Running Federation Tests"

    # Federation tests require hub to be running
    if [[ ! " ${DETECTED_INSTANCES[*]} " =~ " hub " ]]; then
        log_error "Federation tests require hub instance to be running"
        return 1
    fi

    local hub_url="${INSTANCE_URL_hub_frontend}"
    export HUB_FRONTEND_URL="$hub_url"
    export FEDERATION_TEST_MODE=true

    cd "$FRONTEND_DIR"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY RUN] Would run: npm run test:e2e:federation"
        return 0
    fi

    log_info "Running federation integration tests..."
    npm run test:e2e:federation -- --reporter=list

    local exit_code=$?
    cd "$DIVE_ROOT"

    return $exit_code
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --instance|-i)
                SPECIFIC_INSTANCE="$2"
                shift 2
                ;;
            --federation|-f)
                FEDERATION_ONLY=true
                shift
                ;;
            --parallel|-p)
                PARALLEL=true
                shift
                ;;
            --dry-run|-d)
                DRY_RUN=true
                shift
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            # Handle instance as positional argument (backward compatibility)
            [A-Z][A-Z][A-Z])
                if [ -z "$SPECIFIC_INSTANCE" ]; then
                    SPECIFIC_INSTANCE="$1"
                fi
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # Detect running instances
    detect_running_instances

    if [ ${#DETECTED_INSTANCES[@]} -eq 0 ]; then
        log_error "No running DIVE instances detected!"
        log_info "Make sure instances are started with: ./dive [instance] up"
        exit 1
    fi

    log_success "Detected instances: ${DETECTED_INSTANCES[*]}"

    if [ "$VERBOSE" = true ]; then
        log_info "Instance URLs:"
        for instance in $DETECTED_INSTANCES; do
            local frontend_var="INSTANCE_URL_${instance}_frontend"
            local backend_var="INSTANCE_URL_${instance}_backend"
            local frontend="${!frontend_var}"
            local backend="${!backend_var}"
            echo "  $instance:"
            echo "    Frontend: $frontend"
            [ -n "$backend" ] && echo "    Backend: $backend"
        done
    fi

    # Generate configs for all instances
    for instance in $DETECTED_INSTANCES; do
        generate_test_config "$instance"
    done

    # Execute tests based on mode
    if [ "$FEDERATION_ONLY" = true ]; then
        run_federation_tests
    elif [ "$PARALLEL" = true ]; then
        run_parallel_tests
    elif [ -n "$SPECIFIC_INSTANCE" ]; then
        # Case-insensitive match for instance codes
        local instance_found=false
        for detected_instance in $DETECTED_INSTANCES; do
            if [[ "${detected_instance,,}" == "${SPECIFIC_INSTANCE,,}" ]]; then
                instance_found=true
                SPECIFIC_INSTANCE="$detected_instance"  # Use the detected case
                break
            fi
        done

        if [ "$instance_found" = true ]; then
            run_instance_tests "$SPECIFIC_INSTANCE"
        else
            log_error "Instance '$SPECIFIC_INSTANCE' is not running"
            log_info "Available instances: $DETECTED_INSTANCES"
            exit 1
        fi
    else
        # Sequential execution
        local failed_instances=()
        for instance in $DETECTED_INSTANCES; do
            if ! run_instance_tests "$instance"; then
                failed_instances+=("$instance")
            fi
        done

        if [ ${#failed_instances[@]} -gt 0 ]; then
            log_error "Failed instances: ${failed_instances[*]}"
            exit 1
        else
            log_success "All tests passed!"
        fi
    fi
}

show_help() {
    cat << EOF
DIVE V3 Dynamic Test Runner

Automatically detects running instances and runs appropriate Playwright tests.

USAGE:
    $0 [OPTIONS]

OPTIONS:
    -i, --instance CODE    Test specific instance (e.g., ALB, DNK, GBR)
    -f, --federation       Run federation tests only
    -p, --parallel         Run tests in parallel across instances
    -d, --dry-run          Show what would be executed without running
    -v, --verbose          Show detailed output
    -h, --help             Show this help

EXAMPLES:
    $0                          # Test all detected instances
    $0 --instance ALB           # Test only ALB instance
    $0 --federation             # Test federation features
    $0 --parallel               # Run all tests in parallel
    $0 --dry-run --verbose      # Preview what would run

DETECTED INSTANCES:
    The script automatically detects running Docker containers with names like:
    - alb-frontend-alb-1 (Albania instance)
    - dnk-backend-dnk-1 (Denmark instance)
    - gbr-frontend-gbr-1 (UK instance)
    - rou-frontend-rou-1 (Romania instance)
    - dive-hub-frontend (Hub instance)
EOF
}

# Run main function
main "$@"
