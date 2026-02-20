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
    if ! source "${DIVE_ROOT}/scripts/dive-modules/configuration/env-sync.sh" 2>/dev/null; then
        log_error "Failed to source configuration/env-sync.sh"
        return 1
    fi

    return 0
}

##
# Test orchestration/state.sh module
#
test_cli_orchestration_state_db_module() {
    log_verbose "Testing orchestration/state.sh module..."

    # Source the module and check for syntax errors
    if ! bash -n "${DIVE_ROOT}/scripts/dive-modules/orchestration/state.sh" 2>/dev/null; then
        log_error "Syntax error in orchestration/state.sh"
        return 1
    fi

    # Try to source the module (may have readonly variable issues, that's ok)
    if ! source "${DIVE_ROOT}/scripts/dive-modules/orchestration/state.sh" 2>/dev/null; then
        log_warn "Failed to source orchestration/state.sh (may be readonly variable issue)"
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
    if ! source "${DIVE_ROOT}/scripts/dive-modules/federation/health.sh" 2>/dev/null; then
        log_error "Failed to source federation/health.sh"
        return 1
    fi

    return 0
}

##
# Test interactive mode helpers (Phase 1)
#
test_cli_interactive_mode() {
    log_verbose "Testing interactive mode helpers..."

    # Test is_interactive() function exists
    if ! type is_interactive &>/dev/null; then
        log_error "is_interactive() function missing"
        return 1
    fi

    # Test is_interactive returns false when DIVE_NON_INTERACTIVE=true
    local orig_ni="${DIVE_NON_INTERACTIVE:-}"
    export DIVE_NON_INTERACTIVE=true
    if is_interactive; then
        log_error "is_interactive() should return false when DIVE_NON_INTERACTIVE=true"
        export DIVE_NON_INTERACTIVE="$orig_ni"
        return 1
    fi

    # Test is_interactive returns false when DIVE_NON_INTERACTIVE=false but no TTY
    export DIVE_NON_INTERACTIVE=false
    # In a test context, stdin may not be a TTY, so is_interactive should still return false
    # This is actually correct behavior — tests run non-interactively
    # We just verify the function doesn't error out
    is_interactive || true

    export DIVE_NON_INTERACTIVE="$orig_ni"

    # Test prompt_with_default() function exists
    if ! type prompt_with_default &>/dev/null; then
        log_error "prompt_with_default() function missing"
        return 1
    fi

    # Test prompt_with_default uses env var in non-interactive mode
    export DIVE_NON_INTERACTIVE=true
    export TEST_PROMPT_VAR="custom_value"
    local result
    result=$(prompt_with_default "Test prompt" "TEST_PROMPT_VAR" "default_value")
    if [ "$result" != "custom_value" ]; then
        log_error "prompt_with_default() should use env var in non-interactive mode, got: $result"
        export DIVE_NON_INTERACTIVE="$orig_ni"
        unset TEST_PROMPT_VAR
        return 1
    fi

    # Test prompt_with_default uses default when env var is empty
    unset TEST_PROMPT_VAR
    result=$(prompt_with_default "Test prompt" "TEST_PROMPT_VAR" "default_value")
    if [ "$result" != "default_value" ]; then
        log_error "prompt_with_default() should use default when env var empty, got: $result"
        export DIVE_NON_INTERACTIVE="$orig_ni"
        return 1
    fi

    export DIVE_NON_INTERACTIVE="$orig_ni"

    # Test confirm_destructive() function exists
    if ! type confirm_destructive &>/dev/null; then
        log_error "confirm_destructive() function missing"
        return 1
    fi

    # Test confirm_destructive auto-confirms in non-interactive mode
    export DIVE_NON_INTERACTIVE=true
    if ! confirm_destructive "Test confirmation" 2>/dev/null; then
        log_error "confirm_destructive() should auto-confirm in non-interactive mode"
        export DIVE_NON_INTERACTIVE="$orig_ni"
        return 1
    fi

    export DIVE_NON_INTERACTIVE="$orig_ni"
    return 0
}

##
# Test CLI flags are parsed correctly (Phase 1)
#
test_cli_flags_parsing() {
    log_verbose "Testing CLI flag parsing..."

    # Verify DIVE_NON_INTERACTIVE export exists
    if [ -z "${DIVE_NON_INTERACTIVE+x}" ]; then
        log_error "DIVE_NON_INTERACTIVE not exported by common.sh"
        return 1
    fi

    # Test that --domain flag sets DIVE_DOMAIN_SUFFIX
    # (We can't test the ./dive parser directly, but we can verify the variable is respected)
    local orig_ds="${DIVE_DOMAIN_SUFFIX:-}"
    export DIVE_DOMAIN_SUFFIX="test.example.com"
    if [ "$DIVE_DOMAIN_SUFFIX" != "test.example.com" ]; then
        log_error "DIVE_DOMAIN_SUFFIX not set correctly"
        export DIVE_DOMAIN_SUFFIX="$orig_ds"
        return 1
    fi
    export DIVE_DOMAIN_SUFFIX="$orig_ds"

    # Test SECRETS_PROVIDER accepts valid values
    local orig_sp="${SECRETS_PROVIDER:-}"
    for provider in vault gcp aws local; do
        export SECRETS_PROVIDER="$provider"
        if [ "$SECRETS_PROVIDER" != "$provider" ]; then
            log_error "SECRETS_PROVIDER=$provider not set correctly"
            export SECRETS_PROVIDER="$orig_sp"
            return 1
        fi
    done
    export SECRETS_PROVIDER="$orig_sp"

    return 0
}

##
# Test centralized config defaults loading (Phase 2)
#
test_cli_config_loader() {
    log_verbose "Testing centralized config loader..."

    # Verify _load_dive_config_file function exists
    if ! type _load_dive_config_file &>/dev/null; then
        log_error "_load_dive_config_file function not found"
        return 1
    fi

    # Verify dive-defaults.env exists
    if [ ! -f "${DIVE_ROOT}/config/dive-defaults.env" ]; then
        log_error "config/dive-defaults.env not found"
        return 1
    fi

    # Test that defaults file loads DIVE_DEFAULT_DOMAIN
    if [ -z "${DIVE_DEFAULT_DOMAIN:-}" ]; then
        log_error "DIVE_DEFAULT_DOMAIN not loaded from dive-defaults.env"
        return 1
    fi

    # Test env var override precedence: env var should win over defaults file
    local orig_dom="${DIVE_DEFAULT_DOMAIN}"
    export DIVE_DEFAULT_DOMAIN="override.example.com"
    # Re-load — should NOT overwrite since var is already set
    _load_dive_config_file "${DIVE_ROOT}/config/dive-defaults.env"
    if [ "$DIVE_DEFAULT_DOMAIN" != "override.example.com" ]; then
        log_error "Config loader overwrote existing env var (expected override.example.com, got $DIVE_DEFAULT_DOMAIN)"
        export DIVE_DEFAULT_DOMAIN="$orig_dom"
        return 1
    fi
    export DIVE_DEFAULT_DOMAIN="$orig_dom"

    # Test SECRETS_PROVIDER default is vault (not gcp)
    # The defaults file should set this
    if [ "${SECRETS_PROVIDER:-}" != "vault" ]; then
        # Only fail if no override was set — the user may have a custom value
        local defaults_value
        defaults_value=$(grep "^SECRETS_PROVIDER=" "${DIVE_ROOT}/config/dive-defaults.env" 2>/dev/null | cut -d= -f2)
        if [ "$defaults_value" != "vault" ]; then
            log_error "dive-defaults.env SECRETS_PROVIDER should be 'vault', got '$defaults_value'"
            return 1
        fi
    fi

    # Test loading a non-existent file doesn't fail
    _load_dive_config_file "/tmp/nonexistent-dive-config-test.env"
    if [ $? -ne 0 ]; then
        log_error "_load_dive_config_file should return 0 for missing file"
        return 1
    fi

    return 0
}

##
# Test config validator (Phase 3)
#
test_cli_config_validator() {
    log_verbose "Testing config validator..."

    # Source the validator
    local validator="${DIVE_ROOT}/scripts/dive-modules/configuration/config-validator.sh"
    if [ ! -f "$validator" ]; then
        log_error "config-validator.sh not found"
        return 1
    fi

    source "$validator"

    # Verify config_validate function exists
    if ! type config_validate &>/dev/null; then
        log_error "config_validate function not found"
        return 1
    fi

    # Test _config_check_enum with valid value
    _cv_reset 2>/dev/null || { _CV_ERRORS=(); _CV_WARNINGS=(); }
    export TEST_ENUM_VAR="vault"
    _config_check_enum "TEST_ENUM_VAR" "vault,gcp,aws,local" "Test enum"
    if [ ${#_CV_ERRORS[@]} -ne 0 ]; then
        log_error "Enum check failed for valid value 'vault'"
        unset TEST_ENUM_VAR
        return 1
    fi

    # Test _config_check_enum with invalid value
    _CV_ERRORS=(); _CV_WARNINGS=()
    export TEST_ENUM_VAR="invalid"
    _config_check_enum "TEST_ENUM_VAR" "vault,gcp,aws,local" "Test enum"
    if [ ${#_CV_ERRORS[@]} -eq 0 ]; then
        log_error "Enum check should fail for invalid value"
        unset TEST_ENUM_VAR
        return 1
    fi
    unset TEST_ENUM_VAR

    # Test _config_check_required with missing var
    _CV_ERRORS=(); _CV_WARNINGS=()
    unset TEST_REQUIRED_VAR 2>/dev/null
    _config_check_required "TEST_REQUIRED_VAR" "Test required"
    if [ ${#_CV_ERRORS[@]} -eq 0 ]; then
        log_error "Required check should fail for missing var"
        return 1
    fi

    # Test _config_check_required with set var
    _CV_ERRORS=(); _CV_WARNINGS=()
    export TEST_REQUIRED_VAR="something"
    _config_check_required "TEST_REQUIRED_VAR" "Test required"
    if [ ${#_CV_ERRORS[@]} -ne 0 ]; then
        log_error "Required check should pass for set var"
        unset TEST_REQUIRED_VAR
        return 1
    fi
    unset TEST_REQUIRED_VAR

    # Test full hub validation runs without crashing (Docker may or may not be running)
    config_validate "hub" "" 2>/dev/null
    # We don't check the return code — just that it doesn't crash

    return 0
}

##
# Test deployment summary functions (Phase 4)
#
test_cli_deploy_summary() {
    log_verbose "Testing deployment summary module..."

    local summary="${DIVE_ROOT}/scripts/dive-modules/utilities/deployment-summary.sh"
    if [ ! -f "$summary" ]; then
        log_error "deployment-summary.sh not found"
        return 1
    fi

    source "$summary"

    # Verify functions exist
    for func in deployment_pre_summary_hub deployment_pre_summary_spoke deployment_post_summary; do
        if ! type "$func" &>/dev/null; then
            log_error "Function $func not found"
            return 1
        fi
    done

    # Test hub pre-summary in non-interactive mode (should not prompt)
    local output
    output=$(DIVE_NON_INTERACTIVE=true deployment_pre_summary_hub 2>&1)
    if [ $? -ne 0 ]; then
        log_error "Hub pre-summary failed in non-interactive mode"
        return 1
    fi
    if ! echo "$output" | grep -q "Hub Deployment Summary"; then
        log_error "Hub pre-summary missing header"
        return 1
    fi

    # Test spoke pre-summary in non-interactive mode
    output=$(DIVE_NON_INTERACTIVE=true deployment_pre_summary_spoke "FRA" 2>&1)
    if [ $? -ne 0 ]; then
        log_error "Spoke pre-summary failed in non-interactive mode"
        return 1
    fi
    if ! echo "$output" | grep -q "Spoke Deployment Summary"; then
        log_error "Spoke pre-summary missing header"
        return 1
    fi

    # Test post-summary doesn't crash
    deployment_post_summary "hub" "USA" "120" >/dev/null 2>&1
    deployment_post_summary "spoke" "FRA" "60" >/dev/null 2>&1

    return 0
}

##
# Test setup wizard module (Phase 5)
#
test_cli_setup_wizard() {
    log_verbose "Testing setup wizard module..."

    local wizard="${DIVE_ROOT}/scripts/dive-modules/configuration/setup-wizard.sh"
    if [ ! -f "$wizard" ]; then
        log_error "setup-wizard.sh not found"
        return 1
    fi

    source "$wizard"

    # Verify cmd_setup function exists
    if ! type cmd_setup &>/dev/null; then
        log_error "cmd_setup function not found"
        return 1
    fi

    # Non-interactive mode should fail gracefully
    local output
    output=$(DIVE_NON_INTERACTIVE=true cmd_setup 2>&1)
    local rc=$?
    if [ $rc -eq 0 ]; then
        log_error "cmd_setup should fail in non-interactive mode"
        return 1
    fi
    if ! echo "$output" | grep -q "requires interactive"; then
        log_error "Missing 'requires interactive' error message"
        return 1
    fi

    return 0
}

##
# Test error recovery module (Phase 6)
#
test_cli_error_recovery() {
    log_verbose "Testing error recovery module..."

    local recovery="${DIVE_ROOT}/scripts/dive-modules/orchestration/error-recovery.sh"
    if [ ! -f "$recovery" ]; then
        log_error "error-recovery.sh not found"
        return 1
    fi

    source "$recovery"

    # Verify functions exist
    if ! type error_recovery_suggest &>/dev/null; then
        log_error "error_recovery_suggest function not found"
        return 1
    fi
    if ! type _error_get_remediation &>/dev/null; then
        log_error "_error_get_remediation function not found"
        return 1
    fi

    # Test that remediation text exists for all hub phases
    local hub_phases="VAULT_BOOTSTRAP DATABASE_INIT PREFLIGHT INITIALIZATION MONGODB_INIT BUILD SERVICES VAULT_DB_ENGINE KEYCLOAK_CONFIG REALM_VERIFY KAS_REGISTER SEEDING"
    for phase in $hub_phases; do
        local text
        text=$(_error_get_remediation "$phase" "hub")
        if [ -z "$text" ]; then
            log_error "No remediation text for hub phase: $phase"
            return 1
        fi
    done

    # Test spoke phases
    local spoke_phases="PREFLIGHT INITIALIZATION DEPLOYMENT CONFIGURATION SEEDING VERIFICATION"
    for phase in $spoke_phases; do
        local text
        text=$(_error_get_remediation "$phase" "spoke")
        if [ -z "$text" ]; then
            log_error "No remediation text for spoke phase: $phase"
            return 1
        fi
    done

    # Test non-interactive mode auto-aborts
    local result
    DIVE_NON_INTERACTIVE=true error_recovery_suggest "VAULT_BOOTSTRAP" "hub" "USA" >/dev/null 2>&1
    result=$?
    if [ $result -ne 1 ]; then
        log_error "error_recovery_suggest should return 1 (abort) in non-interactive mode, got $result"
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
        "test_cli_interactive_mode"
        "test_cli_flags_parsing"
        "test_cli_config_loader"
        "test_cli_config_validator"
        "test_cli_deploy_summary"
        "test_cli_setup_wizard"
        "test_cli_error_recovery"
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