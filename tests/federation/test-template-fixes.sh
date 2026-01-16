#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Template Fixes Validation Test Suite
# =============================================================================
# Validates the critical docker-compose template fixes including:
# - SPOKE_TOKEN environment variable mapping (critical bug fix)
# - Template regeneration workflow
# - Environment variable propagation
# - Container configuration correctness
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${SCRIPT_DIR}/../.."

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
    ((TESTS_RUN++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    echo -e "  ${RED}Details:${NC} $2"
    ((TESTS_FAILED++))
    ((TESTS_RUN++))
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

critical() {
    echo -e "${RED}🔴 CRITICAL:${NC} $1"
}

section() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN} $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# =============================================================================
# Test 1: Critical Bug Fix - SPOKE_TOKEN Mapping
# =============================================================================
test_spoke_token_mapping_fix() {
    section "Test 1: CRITICAL BUG FIX - SPOKE_TOKEN Environment Mapping"

    local template="${DIVE_ROOT}/templates/spoke/docker-compose.template.yml"

    critical "Testing the SPOKE_TOKEN environment variable mapping fix"
    echo ""
    info "Background: This was a critical bug that prevented ALL spoke heartbeat"
    info "authentication from working. The template was using SPOKE_OPAL_TOKEN"
    info "(OPAL client JWT) instead of SPOKE_TOKEN (Hub API token)."
    echo ""

    # Test: Template exists
    if [ -f "$template" ]; then
        pass "Docker-compose template file exists"
    else
        fail "Template not found" "Path: $template"
        return
    fi

    # Test: CRITICAL - Correct SPOKE_TOKEN mapping
    if grep -q 'SPOKE_TOKEN: ${SPOKE_TOKEN:-}' "$template"; then
        pass "✨ Template uses CORRECT mapping: \${SPOKE_TOKEN:-}"
        info "This mapping allows the Hub API token to pass through correctly"
    else
        fail "🔴 Template missing correct SPOKE_TOKEN mapping" "Expected: SPOKE_TOKEN: \${SPOKE_TOKEN:-}"
    fi

    # Test: CRITICAL - No SPOKE_OPAL_TOKEN mapping (the bug)
    if grep -q 'SPOKE_TOKEN: ${SPOKE_OPAL_TOKEN' "$template"; then
        fail "🔴 CRITICAL BUG STILL PRESENT!" "Template uses \${SPOKE_OPAL_TOKEN:-} for SPOKE_TOKEN"
        critical "This causes heartbeat to fail with 'Unauthorized' errors!"
        critical "The backend receives OPAL JWT instead of Hub API token"
    else
        pass "✅ Bug is FIXED: Template does NOT use SPOKE_OPAL_TOKEN"
    fi

    # Test: Comment explaining the fix
    if grep -A1 'SPOKE_TOKEN:' "$template" | grep -q 'Hub API token'; then
        pass "Comment added explaining SPOKE_TOKEN purpose"
    else
        info "Consider adding comment: # Hub API token for heartbeat authentication"
    fi
}

# =============================================================================
# Test 2: Template Substitution Variables
# =============================================================================
test_template_substitution() {
    section "Test 2: Template Substitution Variables"

    local template="${DIVE_ROOT}/templates/spoke/docker-compose.template.yml"

    # Test: Critical substitution variables present
    local required_vars=(
        "{{INSTANCE_CODE_LOWER}}"
        "{{INSTANCE_CODE_UPPER}}"
        "{{FRONTEND_HOST_PORT}}"
        "{{BACKEND_HOST_PORT}}"
        "{{KEYCLOAK_HTTPS_HOST_PORT}}"
    )

    for var in "${required_vars[@]}"; do
        if grep -q "$var" "$template" 2>/dev/null; then
            pass "Template variable present: $var"
        else
            fail "Template variable missing: $var" "Required for spoke-init.sh"
        fi
    done

    # Test: Environment variable references
    local env_vars=(
        '${SPOKE_TOKEN:-}'
        '${SPOKE_OPAL_TOKEN:-}'
        '${KEYCLOAK_ADMIN_PASSWORD'
        '${MONGO_PASSWORD'
    )

    for var in "${env_vars[@]}"; do
        if grep -q "$var" "$template" 2>/dev/null; then
            pass "Environment variable reference found: $var"
        fi
    done
}

# =============================================================================
# Test 3: Healthcheck Configurations
# =============================================================================
test_healthcheck_configurations() {
    section "Test 3: Healthcheck Configurations"

    local template="${DIVE_ROOT}/templates/spoke/docker-compose.template.yml"

    # Test: All services have healthchecks
    local services_with_healthchecks=(
        "postgres"
        "mongodb"
        "redis"
        "keycloak"
        "opa"
        "backend"
        "frontend"
        "kas"
    )

    for service in "${services_with_healthchecks[@]}"; do
        if grep -A10 "  ${service}-{{INSTANCE_CODE_LOWER}}:" "$template" 2>/dev/null | grep -q "healthcheck:"; then
            pass "Service has healthcheck: $service"
        else
            warn "Service missing healthcheck: $service"
        fi
    done

    # Test: Keycloak healthcheck uses management port 9000
    if grep -A20 "keycloak-{{INSTANCE_CODE_LOWER}}:" "$template" | grep -q "https://localhost:9000/health/ready"; then
        pass "Keycloak healthcheck uses correct management port 9000"
    else
        fail "Keycloak healthcheck misconfigured" "Should use port 9000 for health endpoint"
    fi
}

# =============================================================================
# Test 4: Network Configuration
# =============================================================================
test_network_configuration() {
    section "Test 4: Network Configuration"

    local template="${DIVE_ROOT}/templates/spoke/docker-compose.template.yml"

    # Test: Network definitions
    if grep -q "networks:" "$template"; then
        pass "Network configuration present in template"
    else
        fail "Network configuration missing" "Docker Compose requires networks section"
    fi

    # Test: Service network assignments
    if grep -q "- dive-v3-{{INSTANCE_CODE_LOWER}}" "$template"; then
        pass "Services assigned to instance-specific network"
    fi

    # Test: External network references
    if grep -q "dive-v3-shared-network" "$template"; then
        pass "Shared network reference present (for blacklist Redis)"
    fi
}

# =============================================================================
# Test 5: Verify Generated Files
# =============================================================================
test_generated_files() {
    section "Test 5: Generated File Validation"

    # Check if any instance directories exist
    local instance_dirs=("${DIVE_ROOT}"/instances/*/)
    local instances_tested=0

    for instance_dir in "${instance_dirs[@]}"; do
        if [ ! -d "$instance_dir" ]; then
            continue
        fi

        local instance_name=$(basename "$instance_dir")

        # Skip special directories
        if [ "$instance_name" = "hub" ] || [ "$instance_name" = "shared" ]; then
            continue
        fi

        local compose_file="${instance_dir}docker-compose.yml"

        if [ -f "$compose_file" ]; then
            ((instances_tested++))

            # Test: Correct SPOKE_TOKEN mapping in generated file
            if grep -q 'SPOKE_TOKEN: ${SPOKE_TOKEN:-}' "$compose_file" 2>/dev/null; then
                pass "$instance_name: Correct SPOKE_TOKEN mapping"
            elif grep -q 'SPOKE_TOKEN: ${SPOKE_OPAL_TOKEN' "$compose_file" 2>/dev/null; then
                fail "$instance_name: 🔴 Has the BUG - uses SPOKE_OPAL_TOKEN" "Regenerate from fixed template"
            else
                info "$instance_name: SPOKE_TOKEN mapping not found"
            fi
        fi
    done

    if [ $instances_tested -gt 0 ]; then
        info "Tested $instances_tested deployed instance(s)"
    else
        info "No deployed instances found to test"
    fi
}

# =============================================================================
# Main Test Runner
# =============================================================================
main() {
    echo "================================================="
    echo "DIVE V3 - Template Fixes Validation Test Suite"
    echo "================================================="
    echo ""
    echo "🎯 Purpose: Validate the CRITICAL docker-compose template bug fix"
    echo ""
    echo "🔴 The Bug: SPOKE_TOKEN was mapped to \${SPOKE_OPAL_TOKEN:-}"
    echo "   Impact: ALL spoke heartbeat authentication failed"
    echo "   Symptom: Backend logs showed 'Unauthorized: Token may be invalid'"
    echo ""
    echo "✅ The Fix: SPOKE_TOKEN now maps to \${SPOKE_TOKEN:-}"
    echo "   Result: Backend receives Hub API token for heartbeat"
    echo ""

    # Run test suites
    test_spoke_token_mapping_fix
    test_template_substitution
    test_healthcheck_configurations
    test_network_configuration
    test_generated_files

    # Summary
    echo ""
    echo "================================================="
    echo "Test Summary"
    echo "================================================="
    echo -e "Total Tests:  $TESTS_RUN"
    echo -e "${GREEN}Passed:${NC}       $TESTS_PASSED"
    echo -e "${RED}Failed:${NC}       $TESTS_FAILED"

    if [ $TESTS_FAILED -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✓✓✓ All template validation tests passed! ✓✓✓${NC}"
        echo ""
        echo -e "${GREEN}🎉 The CRITICAL bug fix is verified!${NC}"
        echo "   Template now correctly maps SPOKE_TOKEN for heartbeat authentication"
        echo ""
        exit 0
    else
        echo ""
        echo -e "${RED}✗ Some tests failed${NC}"

        # Check if the critical bug is still present
        if grep -q 'SPOKE_TOKEN: ${SPOKE_OPAL_TOKEN' "${DIVE_ROOT}/templates/spoke/docker-compose.template.yml" 2>/dev/null; then
            critical "THE CRITICAL BUG IS STILL PRESENT IN TEMPLATE!"
            critical "Fix required: Change SPOKE_OPAL_TOKEN to SPOKE_TOKEN in template"
        fi

        exit 1
    fi
}

# Show usage
show_usage() {
    echo "DIVE V3 - Template Fixes Validation"
    echo ""
    echo "This test validates the critical docker-compose template bug fix"
    echo "that was preventing spoke heartbeat authentication from working."
    echo ""
    echo "Usage: $0"
    echo ""
    echo "No arguments required. This test validates:"
    echo "  1. Template has correct SPOKE_TOKEN mapping"
    echo "  2. Template does NOT use SPOKE_OPAL_TOKEN (the bug)"
    echo "  3. All deployed instances use correct mapping"
    echo "  4. Healthcheck and network configurations are correct"
    echo ""
}

# Handle help flag
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_usage
    exit 0
fi

# Run tests if executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
