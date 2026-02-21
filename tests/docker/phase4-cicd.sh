#!/bin/bash
# =============================================================================
# DIVE V3 Phase 4: CI/CD Pipeline Tests
# =============================================================================
# Tests CI/CD workflow files, semantic versioning, and rollback mechanisms
# =============================================================================

# set -e  # Disabled to allow tests to continue on individual failures

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../scripts/dive-modules/common.sh"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

# Test helper functions
test_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
    ((TESTS_TOTAL++))
}

test_fail() {
    echo -e "${RED}✗${NC} $1"
    ((TESTS_FAILED++))
    ((TESTS_TOTAL++))
}

test_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

summary() {
    echo -e "\n════════════════════════════════════════════════════════════════════════"
    echo -e "Results: ${GREEN}${TESTS_PASSED} passed${NC}, ${RED}${TESTS_FAILED} failed${NC} (total: ${TESTS_TOTAL})"
    echo -e "════════════════════════════════════════════════════════════════════════"

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}Phase 4 CI/CD Pipeline tests PASSED${NC}"
    else
        echo -e "${RED}Phase 4 CI/CD Pipeline tests FAILED${NC}"
    fi
}

# Main test function
run_tests() {
    echo -e "╔════════════════════════════════════════════════════════════════════════╗"
    echo -e "║           DIVE V3 Phase 4: CI/CD Pipeline Tests                      ║"
    echo -e "╚════════════════════════════════════════════════════════════════════════╝"

    # =========================================================================
    # Workflow File Existence and Structure
    # =========================================================================

    test_header "Workflow File Existence"

    if [ -f ".github/workflows/dive-pr-checks.yml" ]; then
        test_pass "dive-pr-checks.yml exists"
    else
        test_fail "dive-pr-checks.yml missing"
    fi

    if [ -f ".github/workflows/dive-deploy.yml" ]; then
        test_pass "dive-deploy.yml exists"
    else
        test_fail "dive-deploy.yml missing"
    fi

    # =========================================================================
    # PR Checks Workflow Validation
    # =========================================================================

    test_header "PR Checks Workflow Structure"

    if grep -q "name: DIVE PR Checks" .github/workflows/dive-pr-checks.yml; then
        test_pass "PR checks workflow has correct name"
    else
        test_fail "PR checks workflow missing correct name"
    fi

    if grep -q "pull_request:" .github/workflows/dive-pr-checks.yml; then
        test_pass "PR checks workflow triggers on pull_request"
    else
        test_fail "PR checks workflow missing pull_request trigger"
    fi

    if grep -q "branches: \[main, develop\]" .github/workflows/dive-pr-checks.yml; then
        test_pass "PR checks workflow monitors main and develop branches"
    else
        test_fail "PR checks workflow missing branch configuration"
    fi

    if grep -q "concurrency:" .github/workflows/dive-pr-checks.yml; then
        test_pass "PR checks workflow has concurrency control"
    else
        test_fail "PR checks workflow missing concurrency control"
    fi

    # =========================================================================
    # PR Checks Job Validation
    # =========================================================================

    test_header "PR Checks Jobs"

    # Linting jobs
    if grep -q "lint-shell:" .github/workflows/dive-pr-checks.yml; then
        test_pass "ShellCheck lint job exists"
    else
        test_fail "ShellCheck lint job missing"
    fi

    if grep -q "lint-terraform:" .github/workflows/dive-pr-checks.yml; then
        test_pass "Terraform lint job exists"
    else
        test_fail "Terraform lint job missing"
    fi

    if grep -q "lint-compose:" .github/workflows/dive-pr-checks.yml; then
        test_pass "Docker Compose lint job exists"
    else
        test_fail "Docker Compose lint job missing"
    fi

    # Unit test jobs
    if grep -q "test-backend-unit:" .github/workflows/dive-pr-checks.yml; then
        test_pass "Backend unit test job exists"
    else
        test_fail "Backend unit test job missing"
    fi

    if grep -q "test-frontend-unit:" .github/workflows/dive-pr-checks.yml; then
        test_pass "Frontend unit test job exists"
    else
        test_fail "Frontend unit test job missing"
    fi

    if grep -q "test-opa:" .github/workflows/dive-pr-checks.yml; then
        test_pass "OPA test job exists"
    else
        test_fail "OPA test job missing"
    fi

    # Deploy validation
    if grep -q "test-deploy-dry-run:" .github/workflows/dive-pr-checks.yml; then
        test_pass "Deploy dry-run test job exists"
    else
        test_fail "Deploy dry-run test job missing"
    fi

    # Summary job
    if grep -q "pr-summary:" .github/workflows/dive-pr-checks.yml; then
        test_pass "PR summary job exists"
    else
        test_fail "PR summary job missing"
    fi

    # =========================================================================
    # Deploy Workflow Validation
    # =========================================================================

    test_header "Deploy Workflow Structure"

    if grep -q "name: DIVE Deploy" .github/workflows/dive-deploy.yml; then
        test_pass "Deploy workflow has correct name"
    else
        test_fail "Deploy workflow missing correct name"
    fi

    if grep -q "push:" .github/workflows/dive-deploy.yml && grep -q "branches: \[main\]" .github/workflows/dive-deploy.yml; then
        test_pass "Deploy workflow triggers on main branch push"
    else
        test_fail "Deploy workflow missing main branch trigger"
    fi

    if grep -q "workflow_dispatch:" .github/workflows/dive-deploy.yml; then
        test_pass "Deploy workflow supports manual dispatch"
    else
        test_fail "Deploy workflow missing manual dispatch"
    fi

    # =========================================================================
    # Deploy Jobs Validation
    # =========================================================================

    test_header "Deploy Workflow Jobs"

    # Build job
    if grep -q "build:" .github/workflows/dive-deploy.yml; then
        test_pass "Build job exists"
    else
        test_fail "Build job missing"
    fi

    # Deploy job
    if grep -q "deploy:" .github/workflows/dive-deploy.yml; then
        test_pass "Deploy job exists"
    else
        test_fail "Deploy job missing"
    fi

    # E2E tests job
    if grep -q "e2e-tests:" .github/workflows/dive-deploy.yml; then
        test_pass "E2E tests job exists"
    else
        test_fail "E2E tests job missing"
    fi

    # Rollback job
    if grep -q "rollback:" .github/workflows/dive-deploy.yml; then
        test_pass "Rollback job exists"
    else
        test_fail "Rollback job missing"
    fi

    # Summary job
    if grep -q "deploy-summary:" .github/workflows/dive-deploy.yml; then
        test_pass "Deploy summary job exists"
    else
        test_fail "Deploy summary job missing"
    fi

    # =========================================================================
    # Semantic Versioning
    # =========================================================================

    test_header "Semantic Versioning"

    if grep -q "git describe" .github/workflows/dive-deploy.yml; then
        test_pass "Workflow uses git describe for versioning"
    else
        test_fail "Workflow missing git describe versioning"
    fi

    if grep -q "Calculate Version" .github/workflows/dive-deploy.yml; then
        test_pass "Version calculation step exists"
    else
        test_fail "Version calculation step missing"
    fi

    if grep -q "version=\|sha=" .github/workflows/dive-deploy.yml; then
        test_pass "Version and SHA outputs configured"
    else
        test_fail "Version and SHA outputs missing"
    fi

    # =========================================================================
    # Rollback Mechanism
    # =========================================================================

    test_header "Rollback Mechanism"

    if grep -q "failure()" .github/workflows/dive-deploy.yml; then
        test_pass "Rollback job triggers on failure"
    else
        test_fail "Rollback job missing failure trigger"
    fi

    if grep -q "needs.deploy.result == 'success'" .github/workflows/dive-deploy.yml; then
        test_pass "Rollback only runs after successful deploy"
    else
        test_fail "Rollback missing deploy success condition"
    fi

    if grep -q "issues.create" .github/workflows/dive-deploy.yml; then
        test_pass "Rollback creates GitHub issue"
    else
        test_fail "Rollback missing issue creation"
    fi

    # =========================================================================
    # GCP Integration
    # =========================================================================

    test_header "GCP Integration"

    if grep -q "GCP_PROJECT:" .github/workflows/dive-deploy.yml; then
        test_pass "GCP project configured"
    else
        test_fail "GCP project missing"
    fi

    if grep -q "GCP_ZONE:" .github/workflows/dive-deploy.yml; then
        test_pass "GCP zone configured"
    else
        test_fail "GCP zone missing"
    fi

    if grep -q "secrets.GCP_SA_KEY" .github/workflows/dive-deploy.yml; then
        test_pass "GCP service account key referenced"
    else
        test_fail "GCP service account key missing"
    fi

    # =========================================================================
    # Docker Image Tagging
    # =========================================================================

    test_header "Docker Image Tagging"

    if grep -q "steps.version.outputs.sha" .github/workflows/dive-deploy.yml; then
        test_pass "Images tagged with SHA"
    else
        test_fail "SHA tagging missing"
    fi

    if grep -q "steps.version.outputs.version" .github/workflows/dive-deploy.yml; then
        test_pass "Images tagged with version"
    else
        test_fail "Version tagging missing"
    fi

    if grep -q "latest" .github/workflows/dive-deploy.yml; then
        test_pass "Images tagged with latest"
    else
        test_fail "Latest tagging missing"
    fi

    # =========================================================================
    # Branch Protection References
    # =========================================================================

    test_header "Branch Protection Alignment"

    # Check if workflow job names match branch protection requirements
    REQUIRED_JOBS=("ShellCheck" "Terraform Validate" "Docker Compose Validate" "Backend Unit Tests" "Frontend Unit Tests" "OPA Policy Tests" "Deploy Dry Run")

    for job in "${REQUIRED_JOBS[@]}"; do
        if grep -q "$job" .github/workflows/dive-pr-checks.yml; then
            test_pass "Branch protection job '$job' exists"
        else
            test_fail "Branch protection job '$job' missing"
        fi
    done

    # =========================================================================
    # Quality Gates
    # =========================================================================

    test_header "Quality Gates"

    # Check for timeout configurations
    if grep -q "timeout-minutes:" .github/workflows/dive-pr-checks.yml; then
        test_pass "PR workflow has timeout configurations"
    else
        test_fail "PR workflow missing timeout configurations"
    fi

    if grep -q "timeout-minutes:" .github/workflows/dive-deploy.yml; then
        test_pass "Deploy workflow has timeout configurations"
    else
        test_fail "Deploy workflow missing timeout configurations"
    fi

    # =========================================================================
    # YAML Validation
    # =========================================================================

    test_header "YAML Validation"

    # Check if workflows are valid YAML
    if command -v python3 &> /dev/null && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/dive-pr-checks.yml'))" 2>/dev/null; then
        test_pass "dive-pr-checks.yml is valid YAML"
    else
        test_fail "dive-pr-checks.yml is invalid YAML"
    fi

    if command -v python3 &> /dev/null && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/dive-deploy.yml'))" 2>/dev/null; then
        test_pass "dive-deploy.yml is valid YAML"
    else
        test_fail "dive-deploy.yml is invalid YAML"
    fi

    # =========================================================================
    # Security Checks
    # =========================================================================

    test_header "Security Checks"

    # Ensure no hardcoded secrets in workflows
    if ! grep -q "password.*:" .github/workflows/dive-pr-checks.yml && ! grep -q "secret.*:" .github/workflows/dive-pr-checks.yml; then
        test_pass "No hardcoded secrets in PR workflow"
    else
        test_fail "Hardcoded secrets found in PR workflow"
    fi

    if ! grep -q "password.*:" .github/workflows/dive-deploy.yml && ! grep -q "secret.*:" .github/workflows/dive-deploy.yml; then
        test_pass "No hardcoded secrets in deploy workflow"
    else
        test_fail "Hardcoded secrets found in deploy workflow"
    fi

    # =========================================================================
    # Local CI Simulation
    # =========================================================================

    test_header "Local CI Simulation"

    if [ -f "scripts/ci-local.sh" ]; then
        test_pass "Local CI simulation script exists"
    else
        test_fail "Local CI simulation script missing"
    fi

    if [ -f "scripts/ci-local.sh" ] && [ -x "scripts/ci-local.sh" ]; then
        test_pass "Local CI simulation script is executable"
    else
        test_fail "Local CI simulation script not executable"
    fi

    # =========================================================================
    # Test Results
    # =========================================================================

    summary
}

# Run tests and exit with appropriate code
run_tests
if [ $TESTS_FAILED -eq 0 ]; then
    exit 0
else
    exit 1
fi
