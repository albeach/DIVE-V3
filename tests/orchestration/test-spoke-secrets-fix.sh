#!/usr/bin/env bash
# =============================================================================
# TEST: Spoke Secrets Fix Verification
# =============================================================================
# Validates the fix for Issue #1: Spoke environment variables not loading
#
# Root Cause: spoke-compose-generator.sh was doing double substitution:
#   1. Replace {{INSTANCE_CODE_UPPER}} → FRA ✅
#   2. Replace ${POSTGRES_PASSWORD_FRA} → actual password ❌ (WRONG!)
#
# Fix: Removed .env variable substitution from generator (lines 363-389)
#
# Expected Result:
#   - docker-compose.yml has ${POSTGRES_PASSWORD_FRA} references
#   - Docker Compose loads values from .env at runtime
#   - Terraform gets TF_VAR_* from environment variables
# =============================================================================

set -eo pipefail  # Allow unbound variables for testing

# Load common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

source "${PROJECT_ROOT}/scripts/dive-modules/common.sh"

# Test instance
TEST_INSTANCE="FRA"
TEST_INSTANCE_LOWER="fra"

log_info "====================================="
log_info "Spoke Secrets Fix Verification Test"
log_info "====================================="

# =============================================================================
# Test 1: Verify docker-compose template is correct
# =============================================================================
test_template_has_variable_references() {
    log_info ""
    log_info "TEST 1: Verify template has variable references (not hardcoded values)"

    local template_file="${PROJECT_ROOT}/templates/spoke/docker-compose.template.yml"

    if ! [ -f "$template_file" ]; then
        log_error "Template file not found: $template_file"
        return 1
    fi

    # Check template has variable placeholders
    if grep -q '\${POSTGRES_PASSWORD_{{INSTANCE_CODE_UPPER}}}' "$template_file"; then
        log_success "✓ Template has correct variable placeholder format"
    else
        log_error "✗ Template missing variable placeholder"
        return 1
    fi

    # Ensure template doesn't have hardcoded passwords
    if grep -qE 'POSTGRES_PASSWORD: [a-zA-Z0-9]{15,}' "$template_file"; then
        log_error "✗ Template has hardcoded password (should use variable)"
        return 1
    else
        log_success "✓ Template has no hardcoded passwords"
    fi
}

# =============================================================================
# Test 2: Regenerate FRA docker-compose and verify format
# =============================================================================
test_regenerate_fra_compose() {
    log_info ""
    log_info "TEST 2: Regenerate FRA docker-compose.yml with fixed generator"

    # Source the compose generator
    source "${PROJECT_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-compose-generator.sh"

    # Regenerate FRA docker-compose
    local fra_dir="${PROJECT_ROOT}/instances/fra"

    if ! [ -d "$fra_dir" ]; then
        log_error "FRA instance not found: $fra_dir"
        return 1
    fi

    # Backup existing compose
    if [ -f "$fra_dir/docker-compose.yml" ]; then
        cp "$fra_dir/docker-compose.yml" "$fra_dir/docker-compose.yml.bak.$(date +%Y%m%d-%H%M%S)"
        log_info "Backed up existing docker-compose.yml"
    fi

    # Regenerate
    log_info "Regenerating docker-compose.yml for FRA..."
    if spoke_compose_generate_file "FRA" "$fra_dir"; then
        log_success "✓ docker-compose.yml regenerated"
    else
        log_error "✗ Failed to regenerate docker-compose.yml"
        return 1
    fi
}

# =============================================================================
# Test 3: Verify generated compose has variable references (not hardcoded)
# =============================================================================
test_generated_compose_format() {
    log_info ""
    log_info "TEST 3: Verify generated docker-compose.yml has variable references"

    local compose_file="${PROJECT_ROOT}/instances/fra/docker-compose.yml"

    if ! [ -f "$compose_file" ]; then
        log_error "Generated compose file not found"
        return 1
    fi

    # Check for variable reference format (should be ${POSTGRES_PASSWORD_FRA})
    if grep -q '\${POSTGRES_PASSWORD_FRA}' "$compose_file"; then
        log_success "✓ docker-compose.yml has variable reference: \${POSTGRES_PASSWORD_FRA}"
    else
        log_error "✗ docker-compose.yml missing variable reference"
        log_error "Found instead:"
        grep -A1 "POSTGRES_PASSWORD:" "$compose_file" || true
        return 1
    fi

    # Verify NO hardcoded passwords (20+ char alphanumeric strings)
    if grep -qE 'POSTGRES_PASSWORD: [a-zA-Z0-9]{15,}$' "$compose_file"; then
        log_error "✗ docker-compose.yml has hardcoded password (should be \${VAR})"
        grep -E 'POSTGRES_PASSWORD: [a-zA-Z0-9]{15,}$' "$compose_file"
        return 1
    else
        log_success "✓ docker-compose.yml has no hardcoded passwords"
    fi

    # Check other critical variables
    local critical_vars=("MONGO_PASSWORD_FRA" "KEYCLOAK_ADMIN_PASSWORD_FRA" "KEYCLOAK_CLIENT_SECRET_FRA")

    for var in "${critical_vars[@]}"; do
        if grep -q "\${$var}" "$compose_file"; then
            log_success "✓ Found variable reference: \${$var}"
        else
            log_warn "⚠ Missing variable reference: \${$var}"
        fi
    done
}

# =============================================================================
# Test 4: Verify .env file has the actual values
# =============================================================================
test_env_file_has_values() {
    log_info ""
    log_info "TEST 4: Verify .env file has actual secret values"

    local env_file="${PROJECT_ROOT}/instances/fra/.env"

    if ! [ -f "$env_file" ]; then
        log_error ".env file not found: $env_file"
        return 1
    fi

    # Check that .env has the suffixed variables with values
    local required_vars=("POSTGRES_PASSWORD_FRA" "MONGO_PASSWORD_FRA" "KEYCLOAK_ADMIN_PASSWORD_FRA" "KEYCLOAK_CLIENT_SECRET_FRA" "AUTH_SECRET_FRA")

    local missing_count=0
    for var in "${required_vars[@]}"; do
        if grep -q "^${var}=" "$env_file"; then
            local value=$(grep "^${var}=" "$env_file" | cut -d'=' -f2 | tr -d '\n\r "')
            if [ -n "$value" ] && [ ${#value} -gt 10 ]; then
                log_success "✓ $var is set (${#value} chars)"
            else
                log_error "✗ $var is empty or too short"
                missing_count=$((missing_count + 1))
            fi
        else
            log_error "✗ $var not found in .env"
            missing_count=$((missing_count + 1))
        fi
    done

    if [ $missing_count -gt 0 ]; then
        log_error "$missing_count required variables missing or invalid"
        return 1
    fi

    log_success "✓ All required variables present in .env"
}

# =============================================================================
# Test 5: Verify secrets load correctly into environment
# =============================================================================
test_secrets_load_into_environment() {
    log_info ""
    log_info "TEST 5: Verify secrets load correctly via spoke_secrets_load"

    # Source the secrets module
    if [ -f "${PROJECT_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-secrets.sh" ]; then
        source "${PROJECT_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-secrets.sh"
    else
        log_error "spoke-secrets.sh not found"
        return 1
    fi

    # Load secrets for FRA
    log_info "Loading secrets for FRA..."
    if spoke_secrets_load "FRA" "load"; then
        log_success "✓ spoke_secrets_load succeeded"
    else
        log_error "✗ spoke_secrets_load failed"
        return 1
    fi

    # Verify they're in environment
    if [ -n "${POSTGRES_PASSWORD_FRA:-}" ]; then
        log_success "✓ POSTGRES_PASSWORD_FRA loaded (${#POSTGRES_PASSWORD_FRA} chars)"
    else
        log_error "✗ POSTGRES_PASSWORD_FRA not in environment"
        return 1
    fi

    if [ -n "${KEYCLOAK_ADMIN_PASSWORD_FRA:-}" ]; then
        log_success "✓ KEYCLOAK_ADMIN_PASSWORD_FRA loaded (${#KEYCLOAK_ADMIN_PASSWORD_FRA} chars)"
    else
        log_error "✗ KEYCLOAK_ADMIN_PASSWORD_FRA not in environment"
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================
main() {
    local test_count=0
    local pass_count=0

    # Run tests
    if test_template_has_variable_references; then
        pass_count=$((pass_count + 1))
    fi
    test_count=$((test_count + 1))

    if test_regenerate_fra_compose; then
        pass_count=$((pass_count + 1))
    fi
    test_count=$((test_count + 1))

    if test_generated_compose_format; then
        pass_count=$((pass_count + 1))
    fi
    test_count=$((test_count + 1))

    if test_env_file_has_values; then
        pass_count=$((pass_count + 1))
    fi
    test_count=$((test_count + 1))

    if test_secrets_load_into_environment; then
        pass_count=$((pass_count + 1))
    fi
    test_count=$((test_count + 1))

    # Summary
    log_info ""
    log_info "====================================="
    log_info "Test Summary"
    log_info "====================================="
    log_info "Passed: $pass_count / $test_count"

    if [ $pass_count -eq $test_count ]; then
        log_success "✅ ALL TESTS PASSED"
        log_info ""
        log_info "Next steps:"
        log_info "1. Restart FRA containers: cd instances/fra && docker compose down && docker compose up -d"
        log_info "2. Run Terraform: ./dive tf spoke apply FRA"
        log_info "3. Complete registration: ./dive spoke register FRA"
        return 0
    else
        log_error "❌ SOME TESTS FAILED"
        return 1
    fi
}

main "$@"
