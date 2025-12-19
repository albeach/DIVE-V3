#!/bin/bash
# =============================================================================
# DIVE V3 - Federation Configuration Generation Tests
# =============================================================================
# Purpose: Test configuration generation from federation-registry.json
# Usage: ./tests/federation/test-generation.sh
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Logging functions
log_test() {
    echo -e "${BLUE}TEST${NC} $1"
}

log_pass() {
    echo -e "${GREEN}  ✓ PASS${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}  ✗ FAIL${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_info() {
    echo -e "${BLUE}  ℹ${NC} $1"
}

# Test wrapper
run_test() {
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    log_test "$1"
}

# ============================================================================
# Test Suite: Validation
# ============================================================================

test_validation_script_exists() {
    run_test "Validation script exists"
    if [ -f "$PROJECT_ROOT/scripts/federation/validate-config.sh" ]; then
        log_pass "validate-config.sh found"
    else
        log_fail "validate-config.sh not found"
    fi
}

test_validation_runs_successfully() {
    run_test "Validation runs successfully"
    if "$PROJECT_ROOT/scripts/federation/validate-config.sh" > /dev/null 2>&1; then
        log_pass "Validation passed"
    else
        log_fail "Validation failed"
    fi
}

# ============================================================================
# Test Suite: Terraform .tfvars Generation
# ============================================================================

test_generate_all_tfvars() {
    run_test "Generate all .tfvars files"
    "$PROJECT_ROOT/scripts/federation/generate-tfvars.sh" > /dev/null 2>&1
    
    local all_generated=true
    for instance in usa fra gbr deu; do
        if [ ! -f "$PROJECT_ROOT/terraform/instances/${instance}.tfvars" ]; then
            log_fail "${instance}.tfvars not generated"
            all_generated=false
        fi
    done
    
    if [ "$all_generated" = true ]; then
        log_pass "All .tfvars files generated"
    fi
}

test_tfvars_usa_content() {
    run_test "USA .tfvars content validation"
    local tfvars_file="$PROJECT_ROOT/terraform/instances/usa.tfvars"
    
    local checks_passed=true
    
    # Check keycloak_url
    if ! grep -q 'keycloak_url.*=.*"https://localhost:8443"' "$tfvars_file"; then
        log_fail "USA keycloak_url incorrect"
        checks_passed=false
    fi
    
    # Check federation partners
    if ! grep -q 'federation_partners = {' "$tfvars_file"; then
        log_fail "USA federation_partners missing"
        checks_passed=false
    fi
    
    # Check FRA partner
    if ! grep -q 'fra = {' "$tfvars_file"; then
        log_fail "USA → FRA federation missing"
        checks_passed=false
    fi
    
    # Check GBR partner
    if ! grep -q 'gbr = {' "$tfvars_file"; then
        log_fail "USA → GBR federation missing"
        checks_passed=false
    fi
    
    # Check DEU partner
    if ! grep -q 'deu = {' "$tfvars_file"; then
        log_fail "USA → DEU federation missing"
        checks_passed=false
    fi
    
    # Check DEU uses prosecurity.biz domain
    if ! grep -q 'deu-idp.prosecurity.biz' "$tfvars_file"; then
        log_fail "DEU domain should be prosecurity.biz"
        checks_passed=false
    fi
    
    if [ "$checks_passed" = true ]; then
        log_pass "USA .tfvars content valid"
    fi
}

test_tfvars_fra_content() {
    run_test "FRA .tfvars content validation"
    local tfvars_file="$PROJECT_ROOT/terraform/instances/fra.tfvars"
    
    local checks_passed=true
    
    # Check keycloak_url (FRA uses different port)
    if ! grep -q 'keycloak_url.*=.*"https://localhost:8444"' "$tfvars_file"; then
        log_fail "FRA keycloak_url incorrect (should be port 8444)"
        checks_passed=false
    fi
    
    # Check FRA has all federation partners
    for partner in usa gbr deu; do
        if ! grep -q "$partner = {" "$tfvars_file"; then
            log_fail "FRA → $partner federation missing"
            checks_passed=false
        fi
    done
    
    if [ "$checks_passed" = true ]; then
        log_pass "FRA .tfvars content valid"
    fi
}

test_tfvars_deu_content() {
    run_test "DEU .tfvars content validation (remote instance)"
    local tfvars_file="$PROJECT_ROOT/terraform/instances/deu.tfvars"
    
    local checks_passed=true
    
    # DEU is remote, so keycloak_url should be public URL
    if ! grep -q 'keycloak_url.*=.*"https://deu-idp.prosecurity.biz"' "$tfvars_file"; then
        log_fail "DEU keycloak_url should be public URL"
        checks_passed=false
    fi
    
    # Check DEU has all federation partners
    for partner in usa fra gbr; do
        if ! grep -q "$partner = {" "$tfvars_file"; then
            log_fail "DEU → $partner federation missing"
            checks_passed=false
        fi
    done
    
    if [ "$checks_passed" = true ]; then
        log_pass "DEU .tfvars content valid"
    fi
}

test_tfvars_auto_generated_warning() {
    run_test ".tfvars files have auto-generated warning"
    
    local all_have_warning=true
    for instance in usa fra gbr deu; do
        if ! grep -q "AUTO-GENERATED FILE - DO NOT EDIT MANUALLY" "$PROJECT_ROOT/terraform/instances/${instance}.tfvars"; then
            log_fail "${instance}.tfvars missing auto-generated warning"
            all_have_warning=false
        fi
    done
    
    if [ "$all_have_warning" = true ]; then
        log_pass "All .tfvars have auto-generated warning"
    fi
}

# ============================================================================
# Test Suite: Docker Compose Generation
# ============================================================================

test_generate_docker_compose_usa() {
    run_test "Generate docker-compose.yml for USA"
    if "$PROJECT_ROOT/scripts/federation/generate-docker-compose.sh" usa > /dev/null 2>&1; then
        if [ -f "$PROJECT_ROOT/instances/usa/docker-compose.yml" ]; then
            log_pass "USA docker-compose.yml generated"
        else
            log_fail "USA docker-compose.yml not found"
        fi
    else
        log_fail "docker-compose generation failed"
    fi
}

test_generate_docker_compose_fra() {
    run_test "Generate docker-compose.yml for FRA"
    if "$PROJECT_ROOT/scripts/federation/generate-docker-compose.sh" fra > /dev/null 2>&1; then
        if [ -f "$PROJECT_ROOT/instances/fra/docker-compose.yml" ]; then
            log_pass "FRA docker-compose.yml generated"
        else
            log_fail "FRA docker-compose.yml not found"
        fi
    else
        log_fail "docker-compose generation failed"
    fi
}

test_generate_docker_compose_gbr() {
    run_test "Generate docker-compose.yml for GBR"
    if "$PROJECT_ROOT/scripts/federation/generate-docker-compose.sh" gbr > /dev/null 2>&1; then
        if [ -f "$PROJECT_ROOT/instances/gbr/docker-compose.yml" ]; then
            log_pass "GBR docker-compose.yml generated"
        else
            log_fail "GBR docker-compose.yml not found"
        fi
    else
        log_fail "docker-compose generation failed"
    fi
}

test_docker_compose_port_mappings() {
    run_test "Validate port mappings in docker-compose files"
    
    local checks_passed=true
    
    # USA should use port 3000 for frontend
    if ! grep -q '3000:3000' "$PROJECT_ROOT/instances/usa/docker-compose.yml"; then
        log_fail "USA frontend port mapping incorrect"
        checks_passed=false
    fi
    
    # FRA should use port 3001 for frontend
    if ! grep -q '3001:3000' "$PROJECT_ROOT/instances/fra/docker-compose.yml"; then
        log_fail "FRA frontend port mapping incorrect"
        checks_passed=false
    fi
    
    # GBR should use port 3002 for frontend
    if ! grep -q '3002:3000' "$PROJECT_ROOT/instances/gbr/docker-compose.yml"; then
        log_fail "GBR frontend port mapping incorrect"
        checks_passed=false
    fi
    
    if [ "$checks_passed" = true ]; then
        log_pass "Port mappings correct"
    fi
}

test_docker_compose_service_names() {
    run_test "Validate service naming conventions"
    
    local checks_passed=true
    
    # Check USA has instance-specific service names
    for service in postgres-usa keycloak-usa mongodb-usa redis-usa opa-usa backend-usa frontend-usa; do
        if ! grep -q "$service:" "$PROJECT_ROOT/instances/usa/docker-compose.yml"; then
            log_fail "USA missing service: $service"
            checks_passed=false
        fi
    done
    
    # Check FRA has instance-specific service names
    for service in postgres-fra keycloak-fra mongodb-fra redis-fra opa-fra backend-fra frontend-fra; do
        if ! grep -q "$service:" "$PROJECT_ROOT/instances/fra/docker-compose.yml"; then
            log_fail "FRA missing service: $service"
            checks_passed=false
        fi
    done
    
    if [ "$checks_passed" = true ]; then
        log_pass "Service naming conventions correct"
    fi
}

test_docker_compose_networks() {
    run_test "Validate network isolation"
    
    local checks_passed=true
    
    # USA should use dive-usa-network
    if ! grep -q 'dive-usa-network:' "$PROJECT_ROOT/instances/usa/docker-compose.yml"; then
        log_fail "USA network not configured"
        checks_passed=false
    fi
    
    # FRA should use dive-fra-network
    if ! grep -q 'dive-fra-network:' "$PROJECT_ROOT/instances/fra/docker-compose.yml"; then
        log_fail "FRA network not configured"
        checks_passed=false
    fi
    
    # GBR should use dive-gbr-network
    if ! grep -q 'dive-gbr-network:' "$PROJECT_ROOT/instances/gbr/docker-compose.yml"; then
        log_fail "GBR network not configured"
        checks_passed=false
    fi
    
    if [ "$checks_passed" = true ]; then
        log_pass "Network isolation correct"
    fi
}

test_docker_compose_volumes() {
    run_test "Validate volume naming"
    
    local checks_passed=true
    
    # USA should have instance-specific volumes
    for volume in postgres_usa_data mongodb_usa_data redis_usa_data; do
        if ! grep -q "$volume:" "$PROJECT_ROOT/instances/usa/docker-compose.yml"; then
            log_fail "USA missing volume: $volume"
            checks_passed=false
        fi
    done
    
    if [ "$checks_passed" = true ]; then
        log_pass "Volume naming correct"
    fi
}

test_docker_compose_healthchecks() {
    run_test "Validate healthchecks present"
    
    local checks_passed=true
    
    # Check USA has healthchecks for critical services
    for service in postgres-usa keycloak-usa mongodb-usa redis-usa; do
        if ! grep -A 20 "$service:" "$PROJECT_ROOT/instances/usa/docker-compose.yml" | grep -q 'healthcheck:'; then
            log_fail "USA $service missing healthcheck"
            checks_passed=false
        fi
    done
    
    if [ "$checks_passed" = true ]; then
        log_pass "Healthchecks configured"
    fi
}

# ============================================================================
# Test Suite: Configuration Consistency
# ============================================================================

test_registry_and_tfvars_consistency() {
    run_test "Registry and .tfvars consistency"
    
    # Check USA app URL matches
    local registry_app_url=$(jq -r '.instances.usa.urls.app' "$PROJECT_ROOT/config/federation-registry.json")
    local tfvars_app_url=$(grep 'app_url' "$PROJECT_ROOT/terraform/instances/usa.tfvars" | awk -F'"' '{print $2}')
    
    if [ "$registry_app_url" != "$tfvars_app_url" ]; then
        log_fail "USA app_url mismatch: registry=$registry_app_url, tfvars=$tfvars_app_url"
    else
        log_pass "Registry and .tfvars consistent"
    fi
}

test_registry_and_docker_compose_consistency() {
    run_test "Registry and docker-compose consistency"
    
    # Check USA frontend port appears in docker-compose
    local registry_port=$(jq -r '.instances.usa.ports.frontend' "$PROJECT_ROOT/config/federation-registry.json")
    
    if grep -q "\"$registry_port:3000\"" "$PROJECT_ROOT/instances/usa/docker-compose.yml"; then
        log_pass "Registry and docker-compose consistent (port $registry_port)"
    else
        log_fail "USA frontend port $registry_port not found in docker-compose.yml"
    fi
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  DIVE V3 Federation Configuration Generation Tests"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    
    # Run all test suites
    echo "Test Suite: Validation"
    test_validation_script_exists
    test_validation_runs_successfully
    echo ""
    
    echo "Test Suite: Terraform .tfvars Generation"
    test_generate_all_tfvars
    test_tfvars_usa_content
    test_tfvars_fra_content
    test_tfvars_deu_content
    test_tfvars_auto_generated_warning
    echo ""
    
    echo "Test Suite: Docker Compose Generation"
    test_generate_docker_compose_usa
    test_generate_docker_compose_fra
    test_generate_docker_compose_gbr
    test_docker_compose_port_mappings
    test_docker_compose_service_names
    test_docker_compose_networks
    test_docker_compose_volumes
    test_docker_compose_healthchecks
    echo ""
    
    echo "Test Suite: Configuration Consistency"
    test_registry_and_tfvars_consistency
    test_registry_and_docker_compose_consistency
    echo ""
    
    # Summary
    echo "═══════════════════════════════════════════════════════════"
    echo "  Test Summary"
    echo "═══════════════════════════════════════════════════════════"
    echo "  Total Tests:  $TESTS_TOTAL"
    echo "  Passed:       $TESTS_PASSED"
    echo "  Failed:       $TESTS_FAILED"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓✓✓ All configuration generation tests passed! ✓✓✓${NC}"
        exit 0
    else
        echo -e "${RED}✗✗✗ Some tests failed ✗✗✗${NC}"
        exit 1
    fi
}

# Run main function
main "$@"
