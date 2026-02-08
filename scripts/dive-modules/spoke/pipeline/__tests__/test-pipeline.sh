#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline Integration Tests
# =============================================================================
# Tests the unified spoke deployment pipeline architecture.
# Run from project root: ./scripts/dive-modules/spoke/pipeline/__tests__/test-pipeline.sh
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

set -e

# Test configuration
TEST_INSTANCE="TST"  # Test instance code
TEST_NAME="Test Instance"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# TEST UTILITIES
# =============================================================================

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
    TESTS_RUN=$((TESTS_RUN + 1))
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

assert_file_exists() {
    local file="$1"
    local description="$2"

    log_test "Check file exists: $description"
    if [ -f "$file" ]; then
        log_pass "$description exists"
        return 0
    else
        log_fail "$description not found: $file"
        return 1
    fi
}

assert_function_exists() {
    local func_name="$1"
    local description="$2"

    log_test "Check function exists: $description"
    if type "$func_name" &>/dev/null; then
        log_pass "$description exists"
        return 0
    else
        log_fail "$description not found: $func_name"
        return 1
    fi
}

# =============================================================================
# SETUP
# =============================================================================

setup() {
    echo "========================================"
    echo "DIVE V3 Spoke Pipeline Integration Tests"
    echo "========================================"
    echo ""
    echo "Project root: $PROJECT_ROOT"
    echo "Test instance: $TEST_INSTANCE"
    echo ""

    # Load common functions
    if [ -f "$PROJECT_ROOT/scripts/dive-modules/common.sh" ]; then
        source "$PROJECT_ROOT/scripts/dive-modules/common.sh"
        export DIVE_ROOT="$PROJECT_ROOT"
        export DIVE_COMMON_LOADED=1
    else
        echo "ERROR: common.sh not found"
        exit 1
    fi

    # Load orchestration framework
    if [ -f "$PROJECT_ROOT/scripts/dive-modules/orchestration/framework.sh" ]; then
        source "$PROJECT_ROOT/scripts/dive-modules/orchestration/framework.sh"
    fi

    # Load orchestration state database
    if [ -f "$PROJECT_ROOT/scripts/dive-modules/orchestration/state.sh" ]; then
        source "$PROJECT_ROOT/scripts/dive-modules/orchestration/state.sh"
    fi

    # Load NATO countries database
    if [ -f "$PROJECT_ROOT/scripts/nato-countries.sh" ]; then
        source "$PROJECT_ROOT/scripts/nato-countries.sh"
    fi
}

# =============================================================================
# MODULE LOADING TESTS
# =============================================================================

test_module_loading() {
    echo ""
    echo "--- Module Loading Tests ---"

    # Test pipeline modules exist
    local pipeline_dir="$PROJECT_ROOT/scripts/dive-modules/spoke/pipeline"

    assert_file_exists "$pipeline_dir/spoke-pipeline.sh" "Pipeline controller"
    assert_file_exists "$pipeline_dir/spoke-error-codes.sh" "Error codes"
    assert_file_exists "$pipeline_dir/spoke-secrets.sh" "Secrets module"
    assert_file_exists "$pipeline_dir/spoke-containers.sh" "Containers module"
    assert_file_exists "$pipeline_dir/spoke-federation.sh" "Federation module"
    assert_file_exists "$pipeline_dir/spoke-compose-generator.sh" "Compose generator"
    assert_file_exists "$pipeline_dir/phase-preflight.sh" "Preflight phase"
    assert_file_exists "$pipeline_dir/phase-initialization.sh" "Initialization phase"
    assert_file_exists "$pipeline_dir/phase-deployment.sh" "Deployment phase"
    assert_file_exists "$pipeline_dir/phase-configuration.sh" "Configuration phase"
    assert_file_exists "$pipeline_dir/phase-verification.sh" "Verification phase"

    # Load pipeline modules
    source "$pipeline_dir/spoke-pipeline.sh"

    # Test functions are available
    assert_function_exists "spoke_pipeline_execute" "Pipeline execute"
    assert_function_exists "spoke_pipeline_deploy" "Pipeline deploy"
    assert_function_exists "spoke_pipeline_up" "Pipeline up"
    assert_function_exists "spoke_phase_preflight" "Preflight phase function"
    assert_function_exists "spoke_phase_deployment" "Deployment phase function"
    assert_function_exists "spoke_phase_configuration" "Configuration phase function"
    assert_function_exists "spoke_phase_verification" "Verification phase function"
}

# =============================================================================
# ERROR CODE TESTS
# =============================================================================

test_error_codes() {
    echo ""
    echo "--- Error Code Tests ---"

    # Load error codes
    source "$PROJECT_ROOT/scripts/dive-modules/spoke/pipeline/spoke-error-codes.sh"

    # Test error code constants exist
    log_test "Check error code constants"

    if [ -n "$SPOKE_ERROR_HUB_NOT_FOUND" ] && [ -n "$SPOKE_ERROR_SECRET_LOAD" ]; then
        log_pass "Error code constants defined"
    else
        log_fail "Error code constants missing"
    fi

    # Test error code lookup
    log_test "Check error code lookup functions"

    local description
    description=$(spoke_error_get_description 1001)

    if [ -n "$description" ]; then
        log_pass "Error description lookup works: $description"
    else
        log_fail "Error description lookup failed"
    fi

    local remediation
    remediation=$(spoke_error_get_remediation 1001 "TST")

    if [ -n "$remediation" ]; then
        log_pass "Error remediation lookup works"
    else
        log_fail "Error remediation lookup failed"
    fi
}

# =============================================================================
# SECRET MODULE TESTS
# =============================================================================

test_secrets_module() {
    echo ""
    echo "--- Secrets Module Tests ---"

    # Load secrets module
    source "$PROJECT_ROOT/scripts/dive-modules/spoke/pipeline/spoke-secrets.sh"

    # Test constants exist
    log_test "Check secret constants"

    if [ ${#SPOKE_REQUIRED_SECRETS[@]} -gt 0 ]; then
        log_pass "Required secrets defined: ${#SPOKE_REQUIRED_SECRETS[@]} items"
    else
        log_fail "Required secrets not defined"
    fi

    # Test generate function
    log_test "Check secret generation function"

    if spoke_secrets_generate "TST"; then
        log_pass "Secret generation works"

        # Verify secrets were set with instance suffix
        local test_secret="${POSTGRES_PASSWORD_TST:-}"
        if [ -n "$test_secret" ]; then
            log_pass "Generated secrets are accessible (instance-suffixed)"
        else
            log_fail "Generated secrets not accessible"
        fi

        # Verify base names are NOT exported (single source of truth)
        local base_secret="${POSTGRES_PASSWORD:-}"
        if [ -z "$base_secret" ]; then
            log_pass "Base secrets not exported (correct - instance-suffixed only)"
        else
            log_warn "Base secrets exported (should be instance-suffixed only)"
        fi
    else
        log_fail "Secret generation failed"
    fi

    # Test validation function
    log_test "Check secret validation function"

    if spoke_secrets_validate "TST"; then
        log_pass "Secret validation works"
    else
        log_fail "Secret validation failed (may be expected without all secrets)"
    fi
}

# =============================================================================
# CONTAINER MODULE TESTS
# =============================================================================

test_container_module() {
    echo ""
    echo "--- Container Module Tests ---"

    # Load container module
    source "$PROJECT_ROOT/scripts/dive-modules/spoke/pipeline/spoke-containers.sh"

    # Test service order
    log_test "Check service order defined"

    if [ ${#SPOKE_SERVICE_ORDER[@]} -gt 0 ]; then
        log_pass "Service order defined: ${SPOKE_SERVICE_ORDER[*]}"
    else
        log_fail "Service order not defined"
    fi

    # Test service timeouts function
    log_test "Check service timeout function"

    if type spoke_get_service_timeout &>/dev/null; then
        local kc_timeout=$(spoke_get_service_timeout "keycloak")
        log_pass "Service timeout function works: keycloak=${kc_timeout}s"
    else
        log_fail "Service timeout function not defined"
    fi

    # Test functions exist
    assert_function_exists "spoke_containers_start" "Container start function"
    assert_function_exists "spoke_containers_stop" "Container stop function"
    assert_function_exists "spoke_containers_wait_for_healthy" "Health wait function"
    assert_function_exists "spoke_containers_status" "Status function"
}

# =============================================================================
# COMPOSE GENERATOR TESTS
# =============================================================================

test_compose_generator() {
    echo ""
    echo "--- Compose Generator Tests ---"

    # Load compose generator
    source "$PROJECT_ROOT/scripts/dive-modules/spoke/pipeline/spoke-compose-generator.sh"

    # Test template exists
    log_test "Check template file exists"

    if [ -f "$SPOKE_TEMPLATE_FILE" ]; then
        log_pass "Template file exists: $SPOKE_TEMPLATE_FILE"
    else
        log_fail "Template file not found"
    fi

    # Test placeholder generation
    log_test "Check placeholder generation"

    local placeholders
    placeholders=$(spoke_compose_get_placeholders "TST" "tst" "/tmp/test-tst")

    if echo "$placeholders" | grep -q "INSTANCE_CODE_UPPER"; then
        log_pass "Placeholder generation works"
    else
        log_fail "Placeholder generation failed"
    fi

    # Test functions exist
    assert_function_exists "spoke_compose_generate" "Compose generate function"
    assert_function_exists "spoke_compose_validate" "Compose validate function"
    assert_function_exists "spoke_compose_check_drift" "Drift check function"
}

# =============================================================================
# FEDERATION MODULE TESTS
# =============================================================================

test_federation_module() {
    echo ""
    echo "--- Federation Module Tests ---"

    # Load federation module
    source "$PROJECT_ROOT/scripts/dive-modules/spoke/pipeline/spoke-federation.sh"

    # Test constants
    log_test "Check federation constants"

    if [ -n "$HUB_REALM" ] && [ -n "$FED_STATUS_ACTIVE" ]; then
        log_pass "Federation constants defined"
    else
        log_fail "Federation constants missing"
    fi

    # Test functions exist
    assert_function_exists "spoke_federation_setup" "Federation setup function"
    assert_function_exists "spoke_federation_verify" "Federation verify function"
    assert_function_exists "spoke_federation_get_admin_token" "Admin token function"
}

# =============================================================================
# PHASE TESTS
# =============================================================================

test_phases() {
    echo ""
    echo "--- Phase Module Tests ---"

    local pipeline_dir="$PROJECT_ROOT/scripts/dive-modules/spoke/pipeline"

    # Load phases
    source "$pipeline_dir/phase-preflight.sh"
    source "$pipeline_dir/phase-initialization.sh"
    source "$pipeline_dir/phase-deployment.sh"
    source "$pipeline_dir/phase-configuration.sh"
    source "$pipeline_dir/phase-verification.sh"

    # Test preflight functions
    assert_function_exists "spoke_phase_preflight" "Preflight phase"
    assert_function_exists "spoke_preflight_check_hub" "Hub check"
    assert_function_exists "spoke_preflight_ensure_network" "Network setup"

    # Test initialization functions
    assert_function_exists "spoke_phase_initialization" "Initialization phase"
    assert_function_exists "spoke_init_setup_directories" "Directory setup"
    assert_function_exists "spoke_init_prepare_certificates" "Certificate prep"

    # Test deployment functions
    assert_function_exists "spoke_phase_deployment" "Deployment phase"
    assert_function_exists "spoke_deployment_wait_for_core_services" "Core service wait"

    # Test configuration functions
    assert_function_exists "spoke_phase_configuration" "Configuration phase"
    assert_function_exists "spoke_config_setup_federation" "Federation setup"

    # Test verification functions
    assert_function_exists "spoke_phase_verification" "Verification phase"
    assert_function_exists "spoke_verify_service_health" "Service health"
    assert_function_exists "spoke_verify_federation" "Federation verify"
}

# =============================================================================
# INTEGRATION TEST
# =============================================================================

test_pipeline_dry_run() {
    echo ""
    echo "--- Pipeline Dry Run Test ---"

    # Load all pipeline modules
    source "$PROJECT_ROOT/scripts/dive-modules/spoke/pipeline/spoke-pipeline.sh"

    log_test "Check pipeline can be initialized"

    # Test pipeline constants
    if [ -n "$PIPELINE_MODE_DEPLOY" ] && [ -n "$PIPELINE_PHASE_PREFLIGHT" ]; then
        log_pass "Pipeline constants available"
    else
        log_fail "Pipeline constants missing"
    fi

    log_test "Check pipeline execute function callable"

    # Can't actually run the pipeline without Docker, but verify it's callable
    if type spoke_pipeline_execute &>/dev/null; then
        log_pass "Pipeline execute function available"
    else
        log_fail "Pipeline execute function not available"
    fi
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    setup

    test_module_loading
    test_error_codes
    test_secrets_module
    test_container_module
    test_compose_generator
    test_federation_module
    test_phases
    test_pipeline_dry_run

    # Summary
    echo ""
    echo "========================================"
    echo "Test Summary"
    echo "========================================"
    echo "Tests run:    $TESTS_RUN"
    echo "Tests passed: $TESTS_PASSED"
    echo "Tests failed: $TESTS_FAILED"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed!${NC}"
        exit 1
    fi
}

# Run tests
main "$@"
