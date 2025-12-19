#!/bin/bash
# =============================================================================
# DIVE V3 - Dynamic Test Runner
# =============================================================================
# Discovers running DIVE instances and runs Playwright tests against each.
#
# Usage:
#   ./scripts/dynamic-test-runner.sh [options]
#
# Options:
#   --hub-only        Only test the hub instance
#   --spokes-only     Only test spoke instances
#   --instance <code> Test specific instance (e.g., fra, gbr)
#   --parallel        Run tests in parallel (default: sequential)
#   --report-dir <dir> Output directory for reports
#   --verbose         Show detailed output
#
# The script:
# 1. Discovers running hub and spoke instances via Docker
# 2. Dynamically determines frontend URLs
# 3. Runs Playwright tests against each
# 4. Aggregates results
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Options
HUB_ONLY=false
SPOKES_ONLY=false
SPECIFIC_INSTANCE=""
PARALLEL=false
REPORT_DIR="${DIVE_ROOT}/test-results/playwright"
VERBOSE=false

# Results
INSTANCES_TESTED=0
INSTANCES_PASSED=0
INSTANCES_FAILED=0

# ============================================================================
# Argument Parsing
# ============================================================================

while [[ $# -gt 0 ]]; do
    case "$1" in
        --hub-only)     HUB_ONLY=true; shift ;;
        --spokes-only)  SPOKES_ONLY=true; shift ;;
        --instance)     SPECIFIC_INSTANCE="$2"; shift 2 ;;
        --parallel)     PARALLEL=true; shift ;;
        --report-dir)   REPORT_DIR="$2"; shift 2 ;;
        --verbose|-v)   VERBOSE=true; shift ;;
        --help|-h)
            echo "DIVE V3 Dynamic Test Runner"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --hub-only        Only test the hub instance"
            echo "  --spokes-only     Only test spoke instances"
            echo "  --instance <code> Test specific instance (e.g., fra, gbr)"
            echo "  --parallel        Run tests in parallel"
            echo "  --report-dir <dir> Output directory for reports"
            echo "  --verbose, -v     Show detailed output"
            exit 0
            ;;
        *) shift ;;
    esac
done

# ============================================================================
# Helper Functions
# ============================================================================

log_info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $*"; }
log_fail()    { echo -e "${RED}[FAIL]${NC} $*"; }
log_verbose() { [ "$VERBOSE" = true ] && echo -e "${CYAN}[DEBUG]${NC} $*"; }

# Discover running instances by looking at Docker containers
discover_instances() {
    local instances=()
    
    # Look for frontend containers
    for container in $(docker ps --format '{{.Names}}' 2>/dev/null | grep -E 'dive.*frontend' | sort); do
        local instance=""
        
        # Extract instance code from container name
        if [[ "$container" =~ dive-v3-frontend ]]; then
            instance="hub"
        elif [[ "$container" =~ dive-hub-frontend ]]; then
            instance="hub"
        elif [[ "$container" =~ dive-pilot-frontend ]]; then
            instance="hub"
        elif [[ "$container" =~ dive-spoke-([a-z]+)-frontend ]]; then
            instance="${BASH_REMATCH[1]}"
        elif [[ "$container" =~ ([a-z]+).*frontend ]]; then
            instance="${BASH_REMATCH[1]}"
        fi
        
        if [ -n "$instance" ]; then
            instances+=("$instance")
        fi
    done
    
    # Deduplicate
    printf '%s\n' "${instances[@]}" | sort -u
}

# Get the frontend URL for an instance
get_frontend_url() {
    local instance="$1"
    local url=""
    
    case "$instance" in
        hub|usa)
            # Try to find the hub frontend port
            local port=$(docker port dive-v3-frontend 3000 2>/dev/null | head -1 | cut -d: -f2 || \
                         docker port dive-hub-frontend 3000 2>/dev/null | head -1 | cut -d: -f2 || \
                         docker port dive-pilot-frontend 3000 2>/dev/null | head -1 | cut -d: -f2 || \
                         echo "3000")
            url="https://localhost:${port}"
            ;;
        *)
            # Look for spoke frontend
            local container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "dive-spoke-${instance}-frontend|${instance}.*frontend" | head -1)
            if [ -n "$container" ]; then
                local port=$(docker port "$container" 3000 2>/dev/null | head -1 | cut -d: -f2 || echo "")
                if [ -n "$port" ]; then
                    url="https://localhost:${port}"
                fi
            fi
            ;;
    esac
    
    echo "$url"
}

# Run Playwright tests for an instance
run_playwright_tests() {
    local instance="$1"
    local url="$2"
    local output_dir="${REPORT_DIR}/${instance}"
    
    log_info "Testing instance: ${instance} (${url})"
    
    mkdir -p "$output_dir"
    
    cd "${DIVE_ROOT}/frontend"
    
    # Check if Playwright is installed
    if [ ! -d "node_modules/playwright" ] && [ ! -d "node_modules/@playwright" ]; then
        log_info "Installing Playwright dependencies..."
        npm install >/dev/null 2>&1
    fi
    
    # Run tests
    local result=0
    if [ "$VERBOSE" = true ]; then
        BASE_URL="$url" npx playwright test \
            --project=chromium \
            --reporter=list \
            --output="${output_dir}" \
            || result=$?
    else
        BASE_URL="$url" npx playwright test \
            --project=chromium \
            --reporter=dot \
            --output="${output_dir}" \
            2>&1 | tail -20 || result=$?
    fi
    
    return $result
}

# ============================================================================
# Main
# ============================================================================

cd "$DIVE_ROOT"

echo ""
echo "=============================================="
echo " DIVE V3 - Dynamic Test Runner"
echo "=============================================="
echo ""

# Create report directory
mkdir -p "$REPORT_DIR"

# Discover instances
log_info "Discovering running instances..."
instances=($(discover_instances))

if [ ${#instances[@]} -eq 0 ]; then
    log_fail "No running DIVE instances found"
    echo ""
    echo "Make sure you have started the stack:"
    echo "  ./dive up          # For hub"
    echo "  ./dive spoke up    # For spokes"
    exit 1
fi

log_info "Found ${#instances[@]} instance(s): ${instances[*]}"
echo ""

# Filter instances based on options
if [ -n "$SPECIFIC_INSTANCE" ]; then
    instances=("$SPECIFIC_INSTANCE")
elif [ "$HUB_ONLY" = true ]; then
    instances=("hub")
elif [ "$SPOKES_ONLY" = true ]; then
    # Remove hub from list
    instances=(${instances[@]/hub/})
fi

# Run tests for each instance
for instance in "${instances[@]}"; do
    [ -z "$instance" ] && continue
    
    url=$(get_frontend_url "$instance")
    
    if [ -z "$url" ]; then
        log_fail "Could not determine URL for instance: ${instance}"
        INSTANCES_FAILED=$((INSTANCES_FAILED + 1))
        continue
    fi
    
    # Check if instance is reachable
    if ! curl -sfk --max-time 5 "$url" >/dev/null 2>&1; then
        log_fail "Instance ${instance} is not reachable at ${url}"
        INSTANCES_FAILED=$((INSTANCES_FAILED + 1))
        continue
    fi
    
    INSTANCES_TESTED=$((INSTANCES_TESTED + 1))
    
    if run_playwright_tests "$instance" "$url"; then
        log_success "Instance ${instance} - All tests passed"
        INSTANCES_PASSED=$((INSTANCES_PASSED + 1))
    else
        log_fail "Instance ${instance} - Some tests failed"
        INSTANCES_FAILED=$((INSTANCES_FAILED + 1))
    fi
    
    echo ""
done

# ============================================================================
# Summary
# ============================================================================

echo "=============================================="
echo " Test Summary"
echo "=============================================="
echo ""
echo "  Instances tested: $INSTANCES_TESTED"
echo -e "  ${GREEN}Passed:${NC}           $INSTANCES_PASSED"
echo -e "  ${RED}Failed:${NC}           $INSTANCES_FAILED"
echo ""
echo "  Reports: ${REPORT_DIR}"
echo ""

if [ $INSTANCES_FAILED -eq 0 ] && [ $INSTANCES_TESTED -gt 0 ]; then
    echo -e "${GREEN}✓ All instances passed!${NC}"
    exit 0
elif [ $INSTANCES_TESTED -eq 0 ]; then
    echo -e "${YELLOW}⚠ No instances were tested${NC}"
    exit 1
else
    echo -e "${RED}✗ Some instances failed${NC}"
    exit 1
fi
