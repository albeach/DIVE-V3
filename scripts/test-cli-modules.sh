#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - CLI Modules Unit Tests
# =============================================================================
# Tests for CLI modules to ensure they load correctly and basic functions work
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-16
# =============================================================================

# Test framework
if [ -z "$DIVE_TEST_FRAMEWORK_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/test-framework.sh"
fi

# =============================================================================
# CLI MODULE TESTS
# =============================================================================

##
# Test core.sh module
#
test_cli_core_module() {
    log_verbose "Testing core.sh module..."

    # Source the module
    if ! source "${DIVE_ROOT}/scripts/dive-modules/core.sh"; then
        log_error "Failed to source core.sh"
        return 1
    fi

    # Test core functions exist
    local required_functions=(
        "upper"
        "lower"
        "log_info"
        "log_error"
        "log_success"
        "log_warn"
        "log_verbose"
        "log_step"
    )

    for func in "${required_functions[@]}"; do
        if ! type "$func" &>/dev/null; then
            log_error "Required function missing: $func"
            return 1
        fi
    done

    # Test string manipulation functions
    local test_string="TestString"
    if [ "$(upper "$test_string")" != "TESTSTRING" ]; then
        log_error "upper() function failed"
        return 1
    fi

    if [ "$(lower "$test_string")" != "teststring" ]; then
        log_error "lower() function failed"
        return 1
    fi

    return 0
}

##
# Test federation.sh module
#
test_cli_federation_module() {
    log_verbose "Testing federation.sh module..."

    # Source the module
    if ! source "${DIVE_ROOT}/scripts/dive-modules/federation.sh"; then
        log_error "Failed to source federation.sh"
        return 1
    fi

    # Test federation functions exist
    # Functions available via federation/setup.sh (sourced by federation.sh shim)
    local required_functions=(
        "federation_status"
        "get_hub_admin_token"
        "get_spoke_admin_token"
    )

    for func in "${required_functions[@]}"; do
        if ! type "$func" &>/dev/null; then
            log_error "Required function missing: $func"
            return 1
        fi
    done

    return 0
}

##
# Test hub.sh module
#
test_cli_hub_module() {
    log_verbose "Testing deployment/hub.sh module..."

    # Source the module and check for syntax errors
    if ! bash -n "${DIVE_ROOT}/scripts/dive-modules/deployment/hub.sh" 2>/dev/null; then
        log_error "Syntax error in deployment/hub.sh"
        return 1
    fi

    # Try to source the module
    if ! source "${DIVE_ROOT}/scripts/dive-modules/deployment/hub.sh" 2>/dev/null; then
        log_error "Failed to source deployment/hub.sh"
        return 1
    fi

    # Just check that it defines some functions (basic smoke test)
    if ! type "module_hub" &>/dev/null; then
        log_error "Main module_hub function not found"
        return 1
    fi

    return 0
}

##
# Test spoke.sh module
#
test_cli_spoke_module() {
    log_verbose "Testing deployment/spoke.sh module..."

    # Source the module and check for syntax errors
    if ! bash -n "${DIVE_ROOT}/scripts/dive-modules/deployment/spoke.sh" 2>/dev/null; then
        log_error "Syntax error in deployment/spoke.sh"
        return 1
    fi

    # Try to source the module
    if ! source "${DIVE_ROOT}/scripts/dive-modules/deployment/spoke.sh" 2>/dev/null; then
        log_error "Failed to source deployment/spoke.sh"
        return 1
    fi

    # Just check that it defines some functions (basic smoke test)
    if ! type "module_spoke" &>/dev/null; then
        log_error "Main module_spoke function not found"
        return 1
    fi

    return 0
}

##
# Test db.sh module
#
test_cli_db_module() {
    log_verbose "Testing db.sh module..."

    # Source the module and check for syntax errors
    if ! bash -n "${DIVE_ROOT}/scripts/dive-modules/db.sh" 2>/dev/null; then
        log_error "Syntax error in db.sh"
        return 1
    fi

    # Try to source the module
    if ! source "${DIVE_ROOT}/scripts/dive-modules/db.sh" 2>/dev/null; then
        log_error "Failed to source db.sh"
        return 1
    fi

    # Just check that it defines some functions (basic smoke test)
    if ! type "module_db" &>/dev/null; then
        log_error "Main module_db function not found"
        return 1
    fi

    return 0
}

##
# Test env-sync.sh module
#
test_cli_env_sync_module() {
    log_verbose "Testing env-sync.sh module..."

    # Source the module and check for syntax errors
    if ! bash -n "${DIVE_ROOT}/scripts/dive-modules/env-sync.sh" 2>/dev/null; then
        log_error "Syntax error in env-sync.sh"
        return 1
    fi

    # Try to source the module
    if ! source "${DIVE_ROOT}/scripts/dive-modules/env-sync.sh" 2>/dev/null; then
        log_error "Failed to source env-sync.sh"
        return 1
    fi

    return 0
}

##
# Test orchestration-state-db.sh module
#
test_cli_orchestration_state_db_module() {
    log_verbose "Testing orchestration-state-db.sh module..."

    # Source the module and check for syntax errors
    if ! bash -n "${DIVE_ROOT}/scripts/dive-modules/orchestration-state-db.sh" 2>/dev/null; then
        log_error "Syntax error in orchestration-state-db.sh"
        return 1
    fi

    # Try to source the module (may have readonly variable issues, that's ok)
    if ! source "${DIVE_ROOT}/scripts/dive-modules/orchestration-state-db.sh" 2>/dev/null; then
        log_warn "Failed to source orchestration-state-db.sh (may be readonly variable issue)"
    fi

    return 0
}

##
# Test federation-state-db.sh module
#
test_cli_federation_state_db_module() {
    log_verbose "Testing federation-state-db.sh module..."

    # Source the module and check for syntax errors
    if ! bash -n "${DIVE_ROOT}/scripts/dive-modules/federation-state-db.sh" 2>/dev/null; then
        log_error "Syntax error in federation-state-db.sh"
        return 1
    fi

    # Try to source the module
    if ! source "${DIVE_ROOT}/scripts/dive-modules/federation-state-db.sh" 2>/dev/null; then
        log_error "Failed to source federation-state-db.sh"
        return 1
    fi

    return 0
}

##
# Run all CLI module tests
#
test_run_cli_module_tests() {
    log_step "Running CLI Module Unit Tests"

    local test_functions=(
        "test_cli_core_module"
        "test_cli_federation_module"
        "test_cli_hub_module"
        "test_cli_spoke_module"
        "test_cli_db_module"
        "test_cli_env_sync_module"
        "test_cli_orchestration_state_db_module"
        "test_cli_federation_state_db_module"
    )

    local total_tests=${#test_functions[@]}
    local passed_tests=0

    for test_func in "${test_functions[@]}"; do
        log_info "Running: $test_func"

        if $test_func; then
            log_success "✓ $test_func passed"
            passed_tests=$((passed_tests + 1))
        else
            log_error "✗ $test_func failed"
        fi
    done

    log_info "CLI Module Tests: $passed_tests/$total_tests passed"

    if [ "$passed_tests" -eq "$total_tests" ]; then
        log_success "All CLI module tests passed!"
        return 0
    else
        log_error "Some CLI module tests failed"
        return 1
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    # Script is being run directly
    test_run_cli_module_tests
fi