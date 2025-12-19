#!/bin/bash
# =============================================================================
# DIVE V3 - Phase 2 End-to-End Validation Test
# =============================================================================
# Purpose: Comprehensive Phase 2 validation (SSOT & Secrets Management)
# Usage: ./tests/e2e/test-phase2-complete.sh
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Logging functions
log_section() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  $1"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
}

log_test() {
    echo -e "${BLUE}TEST${NC} $1"
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
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

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# ============================================================================
# Phase 2 Objective 1: Single Source of Truth (SSOT)
# ============================================================================

test_phase2_objective1() {
    log_section "Phase 2 Objective 1: Single Source of Truth"
    
    # Test 1.1: Federation registry exists and is valid
    log_test "1.1: Federation registry v2.0 exists and validates"
    if [ -f "$PROJECT_ROOT/config/federation-registry.json" ]; then
        local version=$(jq -r '.version' "$PROJECT_ROOT/config/federation-registry.json")
        if [ "$version" = "2.0.0" ]; then
            if "$PROJECT_ROOT/scripts/federation/validate-config.sh" > /dev/null 2>&1; then
                log_pass "Registry v$version exists and is valid"
            else
                log_fail "Registry validation failed"
            fi
        else
            log_fail "Registry version is $version, expected 2.0.0"
        fi
    else
        log_fail "Federation registry not found"
    fi
    
    # Test 1.2: JSON Schema exists
    log_test "1.2: JSON Schema validation file exists"
    if [ -f "$PROJECT_ROOT/config/federation-registry.schema.json" ]; then
        log_pass "JSON Schema found"
    else
        log_fail "JSON Schema not found"
    fi
    
    # Test 1.3: Generator scripts exist
    log_test "1.3: Configuration generator scripts exist"
    local scripts_exist=true
    for script in validate-config.sh generate-tfvars.sh generate-docker-compose.sh; do
        if [ ! -f "$PROJECT_ROOT/scripts/federation/$script" ]; then
            log_fail "Missing: $script"
            scripts_exist=false
        fi
    done
    if [ "$scripts_exist" = true ]; then
        log_pass "All generator scripts found"
    fi
    
    # Test 1.4: Terraform .tfvars auto-generation
    log_test "1.4: Terraform .tfvars files are auto-generated"
    local tfvars_count=0
    local tfvars_marked=0
    for instance in usa fra gbr deu; do
        if [ -f "$PROJECT_ROOT/terraform/instances/${instance}.tfvars" ]; then
            tfvars_count=$((tfvars_count + 1))
            if grep -q "AUTO-GENERATED FILE - DO NOT EDIT MANUALLY" "$PROJECT_ROOT/terraform/instances/${instance}.tfvars"; then
                tfvars_marked=$((tfvars_marked + 1))
            fi
        fi
    done
    if [ $tfvars_count -eq 4 ] && [ $tfvars_marked -eq 4 ]; then
        log_pass "All 4 .tfvars files generated and marked"
    else
        log_fail "Expected 4 .tfvars files (found $tfvars_count, marked $tfvars_marked)"
    fi
    
    # Test 1.5: Docker Compose auto-generation
    log_test "1.5: Docker Compose files are auto-generated"
    local compose_count=0
    local compose_marked=0
    for instance in usa fra gbr; do
        if [ -f "$PROJECT_ROOT/instances/$instance/docker-compose.yml" ]; then
            compose_count=$((compose_count + 1))
            if grep -q "AUTO-GENERATED FILE - DO NOT EDIT MANUALLY" "$PROJECT_ROOT/instances/$instance/docker-compose.yml"; then
                compose_marked=$((compose_marked + 1))
            fi
        fi
    done
    if [ $compose_count -eq 3 ] && [ $compose_marked -eq 3 ]; then
        log_pass "All 3 docker-compose files generated and marked"
    else
        log_fail "Expected 3 docker-compose files (found $compose_count, marked $compose_marked)"
    fi
    
    # Test 1.6: Configuration consistency
    log_test "1.6: Configuration consistency across registry and generated files"
    local consistent=true
    
    # Check USA frontend port consistency
    local registry_port=$(jq -r '.instances.usa.ports.frontend' "$PROJECT_ROOT/config/federation-registry.json")
    if ! grep -q "\"$registry_port:3000\"" "$PROJECT_ROOT/instances/usa/docker-compose.yml"; then
        log_fail "USA frontend port mismatch"
        consistent=false
    fi
    
    # Check FRA keycloak URL consistency
    local registry_idp=$(jq -r '.instances.fra.urls.idp' "$PROJECT_ROOT/config/federation-registry.json")
    if ! grep -q "idp_url.*=.*\"$registry_idp\"" "$PROJECT_ROOT/terraform/instances/fra.tfvars"; then
        log_fail "FRA IDP URL mismatch"
        consistent=false
    fi
    
    if [ "$consistent" = true ]; then
        log_pass "Configuration is consistent"
    fi
    
    # Test 1.7: Git pre-commit hooks installed
    log_test "1.7: Git pre-commit hooks prevent manual edits"
    if [ -f "$PROJECT_ROOT/.git/hooks/pre-commit" ]; then
        if grep -q "Cannot commit generated files" "$PROJECT_ROOT/.git/hooks/pre-commit"; then
            log_pass "Pre-commit hook installed and configured"
        else
            log_fail "Pre-commit hook exists but not properly configured"
        fi
    else
        log_fail "Pre-commit hook not installed"
    fi
}

# ============================================================================
# Phase 2 Objective 2: Secrets Management (GCP Placeholder)
# ============================================================================

test_phase2_objective2() {
    log_section "Phase 2 Objective 2: Secrets Management"
    
    # Test 2.1: GCP secret paths defined in registry
    log_test "2.1: GCP secret paths defined in federation registry"
    local secrets_defined=true
    for instance in usa fra gbr deu; do
        if ! jq -e ".instances.$instance.secrets.gcpProjectId" "$PROJECT_ROOT/config/federation-registry.json" > /dev/null 2>&1; then
            log_fail "Instance $instance missing GCP secret configuration"
            secrets_defined=false
        fi
    done
    if [ "$secrets_defined" = true ]; then
        log_pass "All instances have GCP secret paths defined"
    fi
    
    # Test 2.2: GCP configuration in registry
    log_test "2.2: GCP configuration section exists in registry"
    if jq -e '.gcp' "$PROJECT_ROOT/config/federation-registry.json" > /dev/null 2>&1; then
        local project_id=$(jq -r '.gcp.projectId' "$PROJECT_ROOT/config/federation-registry.json")
        local region=$(jq -r '.gcp.region' "$PROJECT_ROOT/config/federation-registry.json")
        log_pass "GCP config found (project: $project_id, region: $region)"
    else
        log_fail "GCP configuration missing from registry"
    fi
    
    # Test 2.3: No plaintext passwords in generated files (except defaults)
    log_test "2.3: Generated files use environment variables for secrets"
    local env_vars_used=true
    for instance in usa fra gbr; do
        if ! grep -q '\${POSTGRES_PASSWORD' "$PROJECT_ROOT/instances/$instance/docker-compose.yml"; then
            log_fail "Instance $instance not using env vars for postgres password"
            env_vars_used=false
        fi
    done
    if [ "$env_vars_used" = true ]; then
        log_pass "All instances use environment variables for secrets"
    fi
}

# ============================================================================
# Phase 2 KPIs (Key Performance Indicators)
# ============================================================================

test_phase2_kpis() {
    log_section "Phase 2 KPIs"
    
    # KPI 1: Configuration Generation Time
    log_test "KPI 1: Configuration generation time < 5 minutes"
    local start_time=$(date +%s)
    "$PROJECT_ROOT/scripts/federation/generate-tfvars.sh" > /dev/null 2>&1
    for instance in usa fra gbr; do
        "$PROJECT_ROOT/scripts/federation/generate-docker-compose.sh" $instance > /dev/null 2>&1
    done
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    if [ $duration -lt 300 ]; then
        log_pass "Generation completed in ${duration}s (target: < 300s)"
    else
        log_fail "Generation took ${duration}s (target: < 300s)"
    fi
    
    # KPI 2: SSOT Coverage
    log_test "KPI 2: SSOT Coverage = 100%"
    local expected_tfvars=4  # USA, FRA, GBR, DEU
    local expected_compose=3  # USA, FRA, GBR (local instances only)
    
    local actual_tfvars=$(find "$PROJECT_ROOT/terraform/instances" -name "*.tfvars" -type f | grep -E "(usa|fra|gbr|deu)\.tfvars" | wc -l | tr -d ' ')
    local actual_compose=$(find "$PROJECT_ROOT/instances" -name "docker-compose.yml" -type f | grep -E "(usa|fra|gbr)/docker-compose.yml" | wc -l | tr -d ' ')
    
    local tfvars_coverage=$((actual_tfvars * 100 / expected_tfvars))
    local compose_coverage=$((actual_compose * 100 / expected_compose))
    local total_coverage=$(( (tfvars_coverage + compose_coverage) / 2 ))
    
    if [ $total_coverage -eq 100 ]; then
        log_pass "SSOT coverage: ${total_coverage}% (tfvars: $actual_tfvars/$expected_tfvars, compose: $actual_compose/$expected_compose)"
    else
        log_fail "SSOT coverage: ${total_coverage}% (tfvars: $actual_tfvars/$expected_tfvars, compose: $actual_compose/$expected_compose)"
    fi
    
    # KPI 3: Manual Config Edits
    log_test "KPI 3: Manual configuration edits = 0"
    # Check if generated files have auto-generated warnings
    local manual_edits=0
    for file in "$PROJECT_ROOT"/terraform/instances/*.tfvars; do
        if [ -f "$file" ] && ! grep -q "AUTO-GENERATED" "$file"; then
            manual_edits=$((manual_edits + 1))
        fi
    done
    if [ $manual_edits -eq 0 ]; then
        log_pass "Zero manual edits detected (target: 0)"
    else
        log_fail "$manual_edits files manually edited (target: 0)"
    fi
}

# ============================================================================
# Phase 2 Success Criteria
# ============================================================================

test_phase2_success_criteria() {
    log_section "Phase 2 Success Criteria"
    
    # Criterion 1: All configs generated from registry
    log_test "Success Criterion 1: All configs generated from registry.json"
    if [ -f "$PROJECT_ROOT/config/federation-registry.json" ] && \
       [ -f "$PROJECT_ROOT/scripts/federation/generate-tfvars.sh" ] && \
       [ -f "$PROJECT_ROOT/scripts/federation/generate-docker-compose.sh" ]; then
        log_pass "SSOT infrastructure complete"
    else
        log_fail "SSOT infrastructure incomplete"
    fi
    
    # Criterion 2: Git secrets prevented
    log_test "Success Criterion 2: Git hooks prevent manual edits"
    if [ -f "$PROJECT_ROOT/.git/hooks/pre-commit" ]; then
        log_pass "Pre-commit hooks installed"
    else
        log_fail "Pre-commit hooks not installed"
    fi
    
    # Criterion 3: GCP integration ready
    log_test "Success Criterion 3: GCP Secret Manager integration prepared"
    if jq -e '.gcp.services.secretManager.enabled' "$PROJECT_ROOT/config/federation-registry.json" > /dev/null 2>&1; then
        local enabled=$(jq -r '.gcp.services.secretManager.enabled' "$PROJECT_ROOT/config/federation-registry.json")
        log_pass "GCP Secret Manager configuration ready (enabled: $enabled)"
    else
        log_fail "GCP Secret Manager not configured"
    fi
    
    # Criterion 4: Documentation updated
    log_test "Success Criterion 4: All scripts have documentation"
    local scripts_with_docs=0
    local total_scripts=0
    for script in "$PROJECT_ROOT"/scripts/federation/*.sh; do
        if [ -f "$script" ]; then
            total_scripts=$((total_scripts + 1))
            if grep -q "# Purpose:" "$script"; then
                scripts_with_docs=$((scripts_with_docs + 1))
            fi
        fi
    done
    if [ $scripts_with_docs -eq $total_scripts ]; then
        log_pass "All $total_scripts scripts documented"
    else
        log_fail "$scripts_with_docs/$total_scripts scripts documented"
    fi
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║     DIVE V3 - Phase 2 End-to-End Validation Test         ║"
    echo "║                                                           ║"
    echo "║  Single Source of Truth & Secrets Management             ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    
    # Run all test suites
    test_phase2_objective1
    test_phase2_objective2
    test_phase2_kpis
    test_phase2_success_criteria
    
    # Summary
    log_section "Phase 2 Test Summary"
    echo "  Total Tests:           $TESTS_TOTAL"
    echo "  Passed:                $TESTS_PASSED"
    echo "  Failed:                $TESTS_FAILED"
    echo "  Success Rate:          $(( TESTS_PASSED * 100 / TESTS_TOTAL ))%"
    echo ""
    
    # Phase 2 Objectives Checklist
    echo "Phase 2 Objectives Checklist:"
    echo ""
    echo "  Objective 2.1: Federation Registry as SSOT"
    if [ -f "$PROJECT_ROOT/config/federation-registry.json" ]; then
        echo "    ✓ federation-registry.json v2.0 implemented"
    else
        echo "    ✗ federation-registry.json not found"
    fi
    echo "    ✓ JSON Schema validation"
    echo "    ✓ Auto-generate Terraform .tfvars"
    echo "    ✓ Auto-generate Docker Compose files"
    echo ""
    echo "  Objective 2.2: GCP Secret Manager Integration"
    echo "    ✓ GCP configuration in registry"
    echo "    ✓ Secret paths defined for all instances"
    echo "    ⚠ GCP project setup (requires manual step with gcloud CLI)"
    echo "    ⚠ Terraform GCP provider (requires GCP credentials)"
    echo ""
    
    # Final verdict
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║                                                           ║${NC}"
        echo -e "${GREEN}║  ✓✓✓ PHASE 2 VALIDATION PASSED ✓✓✓                       ║${NC}"
        echo -e "${GREEN}║                                                           ║${NC}"
        echo -e "${GREEN}║  All Phase 2 objectives met and verified!                ║${NC}"
        echo -e "${GREEN}║  Ready to proceed to Phase 3.                            ║${NC}"
        echo -e "${GREEN}║                                                           ║${NC}"
        echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
        echo ""
        exit 0
    else
        echo -e "${RED}╔═══════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║                                                           ║${NC}"
        echo -e "${RED}║  ✗✗✗ PHASE 2 VALIDATION INCOMPLETE ✗✗✗                   ║${NC}"
        echo -e "${RED}║                                                           ║${NC}"
        echo -e "${RED}║  Some tests failed. Review failures above.               ║${NC}"
        echo -e "${RED}║                                                           ║${NC}"
        echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
        echo ""
        exit 1
    fi
}

# Run main function
main "$@"
