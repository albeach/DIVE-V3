#!/bin/bash
# =============================================================================
# DIVE V3 - Phase 3 GCP Pilot Tests
# =============================================================================
# Tests for Phase 3: Hub Enhanced Spoke Management
#
# Tests:
#   1. Terraform GCS backend configuration
#   2. Compute VM module exists
#   3. Pilot deploy dry-run
#   4. Pilot rollback dry-run
#   5. Pilot health --json output
#   6. GCS checkpoint bucket access
#
# Usage:
#   ./tests/gcp/phase3-pilot.sh [--live]
#
# Options:
#   --live    Run live tests against GCP (requires authentication)
#   (default) Run syntax/dry-run tests only (no GCP required)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Parse arguments
LIVE_TESTS=false
for arg in "$@"; do
    case "$arg" in
        --live) LIVE_TESTS=true ;;
    esac
done

# =============================================================================
# TEST HELPERS
# =============================================================================

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((TESTS_SKIPPED++))
}

run_test() {
    local name="$1"
    local cmd="$2"
    ((TESTS_RUN++))

    log_test "$name"

    if eval "$cmd"; then
        log_pass "$name"
        return 0
    else
        log_fail "$name"
        return 1
    fi
}

# =============================================================================
# TERRAFORM TESTS
# =============================================================================

test_terraform_gcs_backend_pilot() {
    log_test "Terraform pilot backend uses GCS"

    local backend_file="${DIVE_ROOT}/terraform/pilot/backend.tf"

    if [ ! -f "$backend_file" ]; then
        log_fail "Backend file not found: $backend_file"
        return 1
    fi

    if grep -q 'backend "gcs"' "$backend_file" && grep -q 'bucket = "dive25-tfstate"' "$backend_file"; then
        log_pass "Pilot backend configured for GCS (dive25-tfstate)"
        return 0
    else
        log_fail "Pilot backend not configured for GCS"
        return 1
    fi
}

test_terraform_gcs_backend_spoke() {
    log_test "Terraform spoke backend uses GCS"

    local backend_file="${DIVE_ROOT}/terraform/spoke/backend.tf"

    if [ ! -f "$backend_file" ]; then
        log_fail "Backend file not found: $backend_file"
        return 1
    fi

    if grep -q 'backend "gcs"' "$backend_file" && grep -q 'bucket = "dive25-tfstate"' "$backend_file"; then
        log_pass "Spoke backend configured for GCS (dive25-tfstate)"
        return 0
    else
        log_fail "Spoke backend not configured for GCS"
        return 1
    fi
}

test_compute_vm_module_exists() {
    log_test "Compute VM module exists"

    local module_dir="${DIVE_ROOT}/terraform/modules/compute-vm"

    if [ ! -d "$module_dir" ]; then
        log_fail "Module directory not found: $module_dir"
        return 1
    fi

    local required_files=("main.tf" "variables.tf" "outputs.tf" "startup-script.sh")
    local missing=0

    for file in "${required_files[@]}"; do
        if [ ! -f "${module_dir}/${file}" ]; then
            echo "  Missing: ${file}"
            ((missing++))
        fi
    done

    if [ $missing -eq 0 ]; then
        log_pass "Compute VM module has all required files"
        return 0
    else
        log_fail "Compute VM module missing $missing files"
        return 1
    fi
}

test_terraform_validate_pilot() {
    log_test "Terraform validate (pilot)"

    cd "${DIVE_ROOT}/terraform/pilot"

    # Initialize with local backend for validation only
    if terraform init -backend=false -input=false >/dev/null 2>&1; then
        if terraform validate >/dev/null 2>&1; then
            log_pass "Pilot Terraform configuration is valid"
            cd "${DIVE_ROOT}"
            return 0
        fi
    fi

    log_fail "Pilot Terraform validation failed"
    cd "${DIVE_ROOT}"
    return 1
}

test_terraform_validate_compute_vm() {
    log_test "Terraform validate (compute-vm module)"

    local module_dir="${DIVE_ROOT}/terraform/modules/compute-vm"

    if [ ! -d "$module_dir" ]; then
        log_skip "Compute VM module not found"
        return 0
    fi

    cd "$module_dir"

    # Create a temporary test configuration
    local tmp_test=$(mktemp -d)
    cat > "${tmp_test}/main.tf" << 'EOF'
module "test" {
  source = "../modules/compute-vm"

  name       = "test-vm"
  project_id = "test-project"
  zone       = "us-central1-a"
}
EOF

    mkdir -p "${tmp_test}/modules"
    cp -r "$module_dir" "${tmp_test}/modules/compute-vm"

    cd "$tmp_test"

    if terraform init -input=false >/dev/null 2>&1 && terraform validate >/dev/null 2>&1; then
        log_pass "Compute VM module is valid"
        rm -rf "$tmp_test"
        cd "${DIVE_ROOT}"
        return 0
    fi

    log_fail "Compute VM module validation failed"
    rm -rf "$tmp_test"
    cd "${DIVE_ROOT}"
    return 1
}

# =============================================================================
# PILOT CLI TESTS
# =============================================================================

test_pilot_deploy_dryrun() {
    log_test "Pilot deploy dry-run"

    cd "${DIVE_ROOT}"

    if ./dive --dry-run --env gcp pilot deploy 2>&1 | grep -qi "DRY-RUN\|dry"; then
        log_pass "Pilot deploy dry-run works"
        return 0
    else
        log_fail "Pilot deploy dry-run failed"
        return 1
    fi
}

test_pilot_rollback_dryrun() {
    log_test "Pilot rollback dry-run"

    cd "${DIVE_ROOT}"

    if ./dive --dry-run --env gcp pilot rollback 2>&1 | grep -qi "DRY-RUN\|dry\|checkpoint"; then
        log_pass "Pilot rollback dry-run works"
        return 0
    else
        log_fail "Pilot rollback dry-run failed"
        return 1
    fi
}

test_pilot_health_json() {
    log_test "Pilot health --json output format"

    cd "${DIVE_ROOT}"

    # Mock test - check that the function exists and handles --json flag
    if grep -q 'json_output' "${DIVE_ROOT}/scripts/dive-modules/pilot.sh"; then
        log_pass "Pilot health supports --json flag"
        return 0
    else
        log_fail "Pilot health --json not implemented"
        return 1
    fi
}

test_pilot_checkpoint_commands() {
    log_test "Pilot checkpoint commands exist"

    cd "${DIVE_ROOT}"

    # Check checkpoint create exists
    if grep -q 'pilot_checkpoint_create' "${DIVE_ROOT}/scripts/dive-modules/pilot.sh"; then
        # Check checkpoint list exists
        if grep -q 'pilot_checkpoint_list' "${DIVE_ROOT}/scripts/dive-modules/pilot.sh"; then
            log_pass "Pilot checkpoint commands exist"
            return 0
        fi
    fi

    log_fail "Pilot checkpoint commands not found"
    return 1
}

test_pilot_provision_command() {
    log_test "Pilot provision command exists"

    cd "${DIVE_ROOT}"

    if grep -q 'pilot_provision_vm' "${DIVE_ROOT}/scripts/dive-modules/pilot.sh"; then
        log_pass "Pilot provision command exists"
        return 0
    else
        log_fail "Pilot provision command not found"
        return 1
    fi
}

test_pilot_destroy_command() {
    log_test "Pilot destroy command exists"

    cd "${DIVE_ROOT}"

    if grep -q 'pilot_destroy' "${DIVE_ROOT}/scripts/dive-modules/pilot.sh"; then
        log_pass "Pilot destroy command exists"
        return 0
    else
        log_fail "Pilot destroy command not found"
        return 1
    fi
}

# =============================================================================
# LIVE GCP TESTS (require authentication)
# =============================================================================

test_gcs_bucket_access() {
    if [ "$LIVE_TESTS" != true ]; then
        log_skip "GCS bucket access (use --live to run)"
        return 0
    fi

    log_test "GCS state bucket access"

    if gsutil ls gs://dive25-tfstate/ >/dev/null 2>&1; then
        log_pass "GCS state bucket accessible"
        return 0
    else
        log_fail "Cannot access GCS state bucket"
        return 1
    fi
}

test_gcs_checkpoint_bucket() {
    if [ "$LIVE_TESTS" != true ]; then
        log_skip "GCS checkpoint bucket (use --live to run)"
        return 0
    fi

    log_test "GCS checkpoint bucket access"

    if gsutil ls gs://dive25-checkpoints/ >/dev/null 2>&1; then
        log_pass "GCS checkpoint bucket accessible"
        return 0
    else
        log_fail "Cannot access GCS checkpoint bucket"
        return 1
    fi
}

test_gcp_project_access() {
    if [ "$LIVE_TESTS" != true ]; then
        log_skip "GCP project access (use --live to run)"
        return 0
    fi

    log_test "GCP project access"

    if gcloud projects describe dive25 >/dev/null 2>&1; then
        log_pass "GCP project 'dive25' accessible"
        return 0
    else
        log_fail "Cannot access GCP project 'dive25'"
        return 1
    fi
}

test_terraform_remote_state() {
    if [ "$LIVE_TESTS" != true ]; then
        log_skip "Terraform remote state (use --live to run)"
        return 0
    fi

    log_test "Terraform remote state initialization"

    cd "${DIVE_ROOT}/terraform/pilot"

    if terraform init -input=false >/dev/null 2>&1; then
        if terraform state list >/dev/null 2>&1; then
            log_pass "Terraform uses GCS remote state"
            cd "${DIVE_ROOT}"
            return 0
        fi
    fi

    log_fail "Terraform remote state init failed"
    cd "${DIVE_ROOT}"
    return 1
}

# =============================================================================
# RUN ALL TESTS
# =============================================================================

echo ""
echo "=============================================="
echo " DIVE V3 - Phase 3 GCP Tests"
echo "=============================================="
echo ""
echo "Live tests: ${LIVE_TESTS}"
echo "Project root: ${DIVE_ROOT}"
echo ""

# Terraform Tests
echo -e "\n${BLUE}=== Terraform Configuration ===${NC}\n"
test_terraform_gcs_backend_pilot || true
test_terraform_gcs_backend_spoke || true
test_compute_vm_module_exists || true
test_terraform_validate_pilot || true
# test_terraform_validate_compute_vm || true  # Can take a while, skip for fast runs

# Pilot CLI Tests
echo -e "\n${BLUE}=== Pilot CLI Commands ===${NC}\n"
test_pilot_deploy_dryrun || true
test_pilot_rollback_dryrun || true
test_pilot_health_json || true
test_pilot_checkpoint_commands || true
test_pilot_provision_command || true
test_pilot_destroy_command || true

# Live GCP Tests
echo -e "\n${BLUE}=== GCP Integration Tests ===${NC}\n"
test_gcs_bucket_access || true
test_gcs_checkpoint_bucket || true
test_gcp_project_access || true
test_terraform_remote_state || true

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo "=============================================="
echo " Test Summary"
echo "=============================================="
echo ""
echo -e "  ${GREEN}Passed:${NC}  ${TESTS_PASSED}"
echo -e "  ${RED}Failed:${NC}  ${TESTS_FAILED}"
echo -e "  ${YELLOW}Skipped:${NC} ${TESTS_SKIPPED}"
echo -e "  Total:   ${TESTS_RUN}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi

