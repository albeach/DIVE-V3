#!/bin/bash
# =============================================================================
# DIVE V3 - GCP Deployment E2E Test
# =============================================================================
# Tests the complete GCP pilot deployment lifecycle:
# 1. Verify GCP connectivity and prerequisites
# 2. Create checkpoint
# 3. Deploy to GCP pilot VM
# 4. Health verification
# 5. Basic API endpoint tests
# 6. Rollback verification (if applicable)
#
# Usage:
#   ./tests/e2e/gcp-deploy.test.sh [--skip-deploy] [--verbose]
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - GCP_SA_KEY secret configured in GitHub
#   - Pilot VM running and accessible
#
# Exit codes:
#   0 - All tests passed
#   1 - Tests failed
#   2 - Prerequisites not met
# =============================================================================

set -e

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Options
SKIP_DEPLOY=false
VERBOSE=false

# GCP Configuration
GCP_PROJECT="dive25"
GCP_ZONE="us-east4-c"
PILOT_VM="dive-v3-pilot"
REGISTRY="us-east4-docker.pkg.dev/${GCP_PROJECT}/dive-v3-images"

# ============================================================================
# Argument Parsing
# ============================================================================

for arg in "$@"; do
    case "$arg" in
        --skip-deploy) SKIP_DEPLOY=true ;;
        --verbose|-v) VERBOSE=true ;;
        --help|-h)
            echo "DIVE V3 GCP Deployment E2E Test"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-deploy    Skip actual deployment (test connectivity only)"
            echo "  --verbose, -v    Show detailed output"
            echo "  --help, -h       Show this help"
            exit 0
            ;;
    esac
done

# ============================================================================
# Helper Functions
# ============================================================================

log_info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $*"; }
log_fail()    { echo -e "${RED}[FAIL]${NC} $*"; }
log_skip()    { echo -e "${YELLOW}[SKIP]${NC} $*"; }
log_verbose() { [ "$VERBOSE" = true ] && echo -e "${CYAN}[DEBUG]${NC} $*"; }

test_pass() {
    log_success "$1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

test_fail() {
    log_fail "$1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

test_skip() {
    log_skip "$1"
    TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
}

wait_for_url() {
    local url="$1"
    local timeout="${2:-120}"
    local elapsed=0

    while [ $elapsed -lt $timeout ]; do
        if curl -sfk --max-time 5 "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
        log_verbose "Waiting for $url... (${elapsed}s/${timeout}s)"
    done

    return 1
}

# ============================================================================
# Prerequisites Check
# ============================================================================

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check gcloud CLI
    if ! command -v gcloud &> /dev/null; then
        log_fail "gcloud CLI not found. Please install Google Cloud SDK."
        return 2
    fi

    # Check gcloud authentication
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        log_fail "gcloud not authenticated. Please run 'gcloud auth login'."
        return 2
    fi

    # Check project access
    if ! gcloud projects describe "$GCP_PROJECT" &> /dev/null; then
        log_fail "Cannot access GCP project '$GCP_PROJECT'. Check permissions."
        return 2
    fi

    # Check VM access
    if ! gcloud compute instances describe "$PILOT_VM" --zone="$GCP_ZONE" --project="$GCP_PROJECT" &> /dev/null; then
        log_fail "Cannot access pilot VM '$PILOT_VM'. Check if it exists and permissions."
        return 2
    fi

    log_success "All prerequisites met"
    return 0
}

# ============================================================================
# Test Suite
# ============================================================================

cd "$DIVE_ROOT"

echo ""
echo "=============================================="
echo " DIVE V3 - GCP Deployment E2E Test"
echo "=============================================="
echo ""
echo "Project: $GCP_PROJECT"
echo "Zone: $GCP_ZONE"
echo "VM: $PILOT_VM"
echo ""

# ============================================================================
# Test 1: Prerequisites
# ============================================================================

log_info "Test 1: Prerequisites check"

if ! check_prerequisites; then
    test_fail "Prerequisites check failed"
    echo ""
    echo -e "${RED}Cannot proceed with GCP deployment tests.${NC}"
    echo -e "${YELLOW}Please ensure:${NC}"
    echo "  - gcloud CLI is installed and authenticated"
    echo "  - Access to GCP project '$GCP_PROJECT'"
    echo "  - Pilot VM '$PILOT_VM' is running"
    exit 2
fi

test_pass "Prerequisites check passed"

# ============================================================================
# Test 2: GCP Connectivity
# ============================================================================

log_info "Test 2: GCP connectivity"

# Test SSH connectivity
if gcloud compute ssh "$PILOT_VM" --zone="$GCP_ZONE" --project="$GCP_PROJECT" \
    --command="echo 'SSH connection successful'" 2>/dev/null; then
    test_pass "SSH connectivity to pilot VM"
else
    test_fail "SSH connectivity to pilot VM failed"
fi

# Test VM status
vm_status=$(gcloud compute instances describe "$PILOT_VM" \
    --zone="$GCP_ZONE" --project="$GCP_PROJECT" \
    --format="value(status)" 2>/dev/null || echo "UNKNOWN")

if [ "$vm_status" = "RUNNING" ]; then
    test_pass "Pilot VM is running"
else
    test_fail "Pilot VM status: $vm_status (expected RUNNING)"
fi

# ============================================================================
# Test 3: Pre-deployment Checkpoint (if deploying)
# ============================================================================

if [ "$SKIP_DEPLOY" = false ]; then
    log_info "Test 3: Pre-deployment checkpoint"

    # Create checkpoint on pilot VM
    checkpoint_name="e2e-test-$(date +%Y%m%d-%H%M%S)"

    if gcloud compute ssh "$PILOT_VM" --zone="$GCP_ZONE" --project="$GCP_PROJECT" \
        --command="cd /opt/dive-v3 && ./dive checkpoint create '$checkpoint_name'" 2>/dev/null; then
        test_pass "Pre-deployment checkpoint created: $checkpoint_name"
    else
        test_skip "Checkpoint creation failed (may be expected for first deployment)"
    fi
else
    log_info "Test 3: Skipping pre-deployment checkpoint (--skip-deploy)"
    test_skip "Pre-deployment checkpoint (skipped by user)"
fi

# ============================================================================
# Test 4: Deployment (if not skipped)
# ============================================================================

if [ "$SKIP_DEPLOY" = false ]; then
    log_info "Test 4: GCP deployment"

    # Trigger deployment
    log_info "Starting deployment (this may take several minutes)..."

    deploy_start=$(date +%s)

    if [ "$VERBOSE" = true ]; then
        gcloud compute ssh "$PILOT_VM" --zone="$GCP_ZONE" --project="$GCP_PROJECT" \
            --command="cd /opt/dive-v3 && ./dive deploy"
    else
        gcloud compute ssh "$PILOT_VM" --zone="$GCP_ZONE" --project="$GCP_PROJECT" \
            --command="cd /opt/dive-v3 && ./dive deploy" >/dev/null 2>&1
    fi

    deploy_result=$?
    deploy_end=$(date +%s)
    deploy_duration=$((deploy_end - deploy_start))

    if [ $deploy_result -eq 0 ]; then
        test_pass "GCP deployment completed successfully (${deploy_duration}s)"
    else
        test_fail "GCP deployment failed with exit code $deploy_result"
    fi
else
    log_info "Test 4: Skipping deployment (--skip-deploy)"
    test_skip "GCP deployment (skipped by user)"
fi

# ============================================================================
# Test 5: Service Health Checks
# ============================================================================

log_info "Test 5: Service health checks"

# Wait for services to be ready (longer timeout for GCP)
log_info "Waiting for services to be healthy (up to 300s)..."
sleep 60

# Check external endpoints (adjust URLs based on your setup)
app_url="https://usa-app.dive25.com"
api_url="https://usa-api.dive25.com"
idp_url="https://usa-idp.dive25.com"

# Check App
if wait_for_url "$app_url" 240; then
    test_pass "Application is healthy ($app_url)"
else
    test_fail "Application failed to respond ($app_url)"
fi

# Check API
if wait_for_url "$api_url/health" 120; then
    test_pass "API is healthy ($api_url/health)"
else
    test_fail "API failed to respond ($api_url/health)"
fi

# Check IdP
if wait_for_url "$idp_url/realms/dive-v3-broker" 120; then
    test_pass "IdP is healthy ($idp_url/realms/dive-v3-broker)"
else
    test_fail "IdP failed to respond ($idp_url/realms/dive-v3-broker)"
fi

# ============================================================================
# Test 6: Container Status on Pilot VM
# ============================================================================

log_info "Test 6: Container status on pilot VM"

# Check if containers are running on the pilot VM
container_check=$(gcloud compute ssh "$PILOT_VM" --zone="$GCP_ZONE" --project="$GCP_PROJECT" \
    --command="docker ps --format 'table {{.Names}}\t{{.Status}}' | grep dive" 2>/dev/null || echo "")

if [ -n "$container_check" ]; then
    container_count=$(echo "$container_check" | wc -l | tr -d ' ')
    running_count=$(echo "$container_check" | grep -c "Up" || echo "0")

    if [ "$running_count" -gt 0 ]; then
        test_pass "Containers running on pilot VM: $running_count/$container_count"
        log_verbose "Container status:"
        log_verbose "$container_check"
    else
        test_fail "No containers running on pilot VM"
    fi
else
    test_fail "No DIVE containers found on pilot VM"
fi

# ============================================================================
# Test 7: Rollback Verification (if deployment failed)
# ============================================================================

if [ "$SKIP_DEPLOY" = false ] && [ $deploy_result -ne 0 ]; then
    log_info "Test 7: Rollback verification"

    # Check if rollback occurred
    rollback_check=$(gcloud compute ssh "$PILOT_VM" --zone="$GCP_ZONE" --project="$GCP_PROJECT" \
        --command="cd /opt/dive-v3 && ./dive checkpoint list | tail -5" 2>/dev/null || echo "")

    if echo "$rollback_check" | grep -q "rollback"; then
        test_pass "Rollback checkpoint created after deployment failure"
    else
        test_skip "No rollback checkpoint found (may be expected)"
    fi
else
    log_info "Test 7: Skipping rollback check (deployment successful or skipped)"
    test_skip "Rollback verification (not applicable)"
fi

# ============================================================================
# Test 8: Registry Images
# ============================================================================

log_info "Test 8: Container registry images"

# Check if images exist in registry
images=$(gcloud container images list --repository="$REGISTRY" 2>/dev/null | wc -l | tr -d ' ' || echo "0")

if [ "$images" -gt 0 ]; then
    test_pass "Container images found in registry: $images images"
else
    test_fail "No container images found in registry"
fi

# ============================================================================
# Summary
# ============================================================================

echo ""
echo "=============================================="
echo " GCP Deployment E2E Test Summary"
echo "=============================================="
echo ""
echo -e "  ${GREEN}Passed:${NC}  $TESTS_PASSED"
echo -e "  ${RED}Failed:${NC}  $TESTS_FAILED"
echo -e "  ${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All GCP deployment tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some GCP deployment tests failed.${NC}"
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "  - Check pilot VM logs: gcloud compute ssh $PILOT_VM --zone=$GCP_ZONE --command='docker logs \$(docker ps -q | head -1)'"
    echo "  - Verify firewall rules allow traffic to ports 80, 443"
    echo "  - Check load balancer configuration"
    exit 1
fi
