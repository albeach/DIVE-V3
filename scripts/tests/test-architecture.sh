#!/usr/bin/env bash

# =============================================================================
# DIVE V3 - Architecture Improvement Test Suite
# =============================================================================
# Tests for:
# - Instance isolation
# - Configuration completeness
# - No cross-instance dependencies
# - Terraform structure
# =============================================================================

set +e  # Don't exit on individual test failures

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

test_passed() {
    ((TESTS_PASSED++))
    ((TESTS_RUN++))
    echo -e "${GREEN}✓${NC} $1"
}

test_failed() {
    ((TESTS_FAILED++))
    ((TESTS_RUN++))
    echo -e "${RED}✗${NC} $1"
    if [[ -n "$2" ]]; then
        echo -e "  ${RED}Error: $2${NC}"
    fi
}

section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           DIVE V3 - Architecture Test Suite                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# Test 1: Instance Directory Structure
# =============================================================================
section "Test 1: Instance Directory Structure"

INSTANCES=("usa" "fra" "deu")

for inst in "${INSTANCES[@]}"; do
    inst_dir="$PROJECT_ROOT/instances/$inst"
    
    if [[ -d "$inst_dir" ]]; then
        test_passed "instances/$inst directory exists"
    else
        test_failed "instances/$inst directory missing"
        continue
    fi
    
    # Check for required files
    if [[ -f "$inst_dir/instance.json" ]]; then
        test_passed "instances/$inst/instance.json exists"
    else
        test_failed "instances/$inst/instance.json missing"
    fi
    
    if [[ -f "$inst_dir/docker-compose.yml" ]]; then
        test_passed "instances/$inst/docker-compose.yml exists"
    else
        test_failed "instances/$inst/docker-compose.yml missing"
    fi
    
    if [[ -f "$inst_dir/.env" ]]; then
        test_passed "instances/$inst/.env exists"
    else
        test_failed "instances/$inst/.env missing"
    fi
    
    if [[ -d "$inst_dir/certs" ]]; then
        test_passed "instances/$inst/certs directory exists"
    else
        test_failed "instances/$inst/certs directory missing"
    fi
    
    if [[ -f "$inst_dir/cloudflared/config.yml" ]]; then
        test_passed "instances/$inst/cloudflared/config.yml exists"
    else
        test_failed "instances/$inst/cloudflared/config.yml missing"
    fi
done

# =============================================================================
# Test 2: Instance Configuration Completeness
# =============================================================================
section "Test 2: Instance Configuration Completeness"

for inst in "${INSTANCES[@]}"; do
    config_file="$PROJECT_ROOT/instances/$inst/instance.json"
    
    if [[ ! -f "$config_file" ]]; then
        test_failed "Cannot test $inst - config missing"
        continue
    fi
    
    # Check required JSON fields
    instance_code=$(jq -r '.instance_code' "$config_file" 2>/dev/null)
    if [[ -n "$instance_code" && "$instance_code" != "null" ]]; then
        test_passed "[$inst] instance_code defined: $instance_code"
    else
        test_failed "[$inst] instance_code missing"
    fi
    
    hostname_app=$(jq -r '.hostnames.app' "$config_file" 2>/dev/null)
    if [[ -n "$hostname_app" && "$hostname_app" != "null" ]]; then
        test_passed "[$inst] hostname_app defined: $hostname_app"
    else
        test_failed "[$inst] hostname_app missing"
    fi
    
    port_frontend=$(jq -r '.ports.frontend' "$config_file" 2>/dev/null)
    if [[ -n "$port_frontend" && "$port_frontend" != "null" ]]; then
        test_passed "[$inst] port_frontend defined: $port_frontend"
    else
        test_failed "[$inst] port_frontend missing"
    fi
    
    theme_primary=$(jq -r '.theme.primary_color' "$config_file" 2>/dev/null)
    if [[ -n "$theme_primary" && "$theme_primary" != "null" ]]; then
        test_passed "[$inst] theme_primary defined: $theme_primary"
    else
        test_failed "[$inst] theme_primary missing"
    fi
done

# =============================================================================
# Test 3: Port Isolation (No Conflicts)
# =============================================================================
section "Test 3: Port Isolation"

declare -A all_ports
port_conflicts=0

for inst in "${INSTANCES[@]}"; do
    config_file="$PROJECT_ROOT/instances/$inst/instance.json"
    
    if [[ ! -f "$config_file" ]]; then
        continue
    fi
    
    # Extract all ports
    ports=$(jq -r '.ports | to_entries[] | "\(.key):\(.value)"' "$config_file" 2>/dev/null)
    
    while IFS= read -r line; do
        port_name="${line%%:*}"
        port_num="${line##*:}"
        
        if [[ -n "${all_ports[$port_num]:-}" ]]; then
            test_failed "Port conflict: $port_num used by ${all_ports[$port_num]} and $inst:$port_name"
            ((port_conflicts++))
        else
            all_ports[$port_num]="$inst:$port_name"
        fi
    done <<< "$ports"
done

if [[ $port_conflicts -eq 0 ]]; then
    test_passed "No port conflicts detected across instances"
fi

# =============================================================================
# Test 4: Network Isolation (Unique Networks)
# =============================================================================
section "Test 4: Network Isolation"

declare -A networks
network_conflicts=0

for inst in "${INSTANCES[@]}"; do
    compose_file="$PROJECT_ROOT/instances/$inst/docker-compose.yml"
    
    if [[ ! -f "$compose_file" ]]; then
        continue
    fi
    
    # Extract network names
    network_name=$(grep -oE 'dive-[a-z]+-network' "$compose_file" | head -1)
    
    if [[ -n "$network_name" ]]; then
        if [[ -n "${networks[$network_name]:-}" ]]; then
            test_failed "Network conflict: $network_name used by multiple instances"
            ((network_conflicts++))
        else
            networks[$network_name]="$inst"
            test_passed "[$inst] uses isolated network: $network_name"
        fi
    else
        test_failed "[$inst] no network definition found"
    fi
done

# =============================================================================
# Test 5: Hostname Configuration Validation
# =============================================================================
section "Test 5: Hostname Configuration"

for inst in "${INSTANCES[@]}"; do
    config_file="$PROJECT_ROOT/instances/$inst/instance.json"
    compose_file="$PROJECT_ROOT/instances/$inst/docker-compose.yml"
    
    if [[ ! -f "$config_file" || ! -f "$compose_file" ]]; then
        continue
    fi
    
    hostname_idp=$(jq -r '.hostnames.idp' "$config_file" 2>/dev/null)
    
    # Check if hostname is in compose file
    if grep -q "$hostname_idp" "$compose_file"; then
        test_passed "[$inst] hostname '$hostname_idp' configured in docker-compose"
    else
        test_failed "[$inst] hostname '$hostname_idp' not found in docker-compose"
    fi
    
    # Check hostname follows pattern
    if [[ "$hostname_idp" =~ ^${inst}-idp\.dive25\.com$ ]]; then
        test_passed "[$inst] hostname follows naming convention"
    else
        test_failed "[$inst] hostname doesn't follow naming convention: $hostname_idp"
    fi
done

# =============================================================================
# Test 6: Terraform Architecture
# =============================================================================
section "Test 6: Terraform Architecture"

# Check conflicting files are archived
archived_count=$(ls "$PROJECT_ROOT/terraform/archive/"*.tf 2>/dev/null | wc -l)
if [[ $archived_count -gt 0 ]]; then
    test_passed "Conflicting Terraform files archived ($archived_count files)"
else
    test_failed "No archived Terraform files (expected legacy files)"
fi

# Check instances directory structure
if [[ -d "$PROJECT_ROOT/terraform/instances" ]]; then
    test_passed "terraform/instances directory exists"
else
    test_failed "terraform/instances directory missing"
fi

if [[ -f "$PROJECT_ROOT/terraform/instances/instance.tf" ]]; then
    test_passed "terraform/instances/instance.tf exists"
else
    test_failed "terraform/instances/instance.tf missing"
fi

# Check modules exist
if [[ -d "$PROJECT_ROOT/terraform/modules/federated-instance" ]]; then
    test_passed "terraform/modules/federated-instance exists"
else
    test_failed "terraform/modules/federated-instance missing"
fi

# =============================================================================
# Test 7: Generator Script
# =============================================================================
section "Test 7: Generator Script"

if [[ -x "$PROJECT_ROOT/scripts/generate-instance.sh" ]]; then
    test_passed "generate-instance.sh is executable"
else
    test_failed "generate-instance.sh not executable"
fi

# Test dry-run
output=$("$PROJECT_ROOT/scripts/generate-instance.sh" --all --dry-run 2>&1)
if echo "$output" | grep -q "\[DRY-RUN\]"; then
    test_passed "generate-instance.sh --dry-run works"
else
    test_failed "generate-instance.sh --dry-run failed"
fi

# Test help
output=$("$PROJECT_ROOT/scripts/generate-instance.sh" --help 2>&1)
if echo "$output" | grep -q "Usage:"; then
    test_passed "generate-instance.sh --help works"
else
    test_failed "generate-instance.sh --help failed"
fi

# =============================================================================
# Test 8: No Shared Mutable Resources
# =============================================================================
section "Test 8: No Shared Mutable Resources"

# Check that docker-compose files don't reference root compose volumes
shared_volume_refs=0

for inst in "${INSTANCES[@]}"; do
    compose_file="$PROJECT_ROOT/instances/$inst/docker-compose.yml"
    
    if [[ ! -f "$compose_file" ]]; then
        continue
    fi
    
    # Check for references to ../keycloak/certs (should use ./certs)
    if grep -q "\.\./keycloak/certs" "$compose_file"; then
        test_failed "[$inst] references shared ../keycloak/certs"
        ((shared_volume_refs++))
    else
        test_passed "[$inst] uses isolated ./certs directory"
    fi
done

# =============================================================================
# Test Summary
# =============================================================================
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  TEST SUMMARY${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Tests Run:    ${TESTS_RUN}"
echo -e "Passed:       ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Failed:       ${RED}${TESTS_FAILED}${NC}"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║            ALL ARCHITECTURE TESTS PASSED! ✓                           ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║            SOME TESTS FAILED                                           ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi

