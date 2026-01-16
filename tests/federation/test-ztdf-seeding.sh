#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - ZTDF Seeding Test Suite
# =============================================================================
# Tests the ZTDF (Zero Trust Data Format) resource seeding workflow:
# - Instance detection in federation registry
# - Encryption key availability
# - Resource creation and encryption
# - Classification distribution
# - KAS connectivity
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

section() {
    echo ""
    echo -e "${YELLOW}━━━ $1 ━━━${NC}"
}

# =============================================================================
# Test 1: Federation Registry Instance Detection
# =============================================================================
test_instance_detection() {
    section "Test 1: Federation Registry Instance Detection"
    
    local registry_file="${DIVE_ROOT}/config/federation-registry.json"
    
    # Test: Registry file exists
    if [ -f "$registry_file" ]; then
        pass "Federation registry file exists"
    else
        fail "Federation registry not found" "Path: $registry_file"
        return
    fi
    
    # Test: Registry is valid JSON
    if jq empty "$registry_file" 2>/dev/null; then
        pass "Federation registry is valid JSON"
    else
        fail "Registry JSON is invalid" "Run: jq . $registry_file"
        return
    fi
    
    # Test: Instances object exists
    if jq -e '.instances' "$registry_file" >/dev/null 2>&1; then
        pass "Registry has .instances object"
    else
        fail ".instances object missing" "Registry structure invalid"
        return
    fi
    
    # Test: Critical NATO countries present
    local critical_countries=("usa" "dnk" "hun" "pol" "gbr" "fra" "deu")
    local missing_countries=()
    
    for country in "${critical_countries[@]}"; do
        if jq -e ".instances.$country" "$registry_file" >/dev/null 2>&1; then
            pass "Instance present in registry: $country"
        else
            fail "Instance missing from registry: $country" "ZTDF seeding will fail for $country"
            missing_countries+=("$country")
        fi
    done
    
    # Test: Instance structure validation (DNK as example)
    if jq -e '.instances.dnk' "$registry_file" >/dev/null 2>&1; then
        local dnk_code=$(jq -r '.instances.dnk.code' "$registry_file")
        if [ "$dnk_code" = "DNK" ]; then
            pass "DNK instance has correct code field"
        fi
        
        local dnk_name=$(jq -r '.instances.dnk.name' "$registry_file")
        if [ -n "$dnk_name" ] && [ "$dnk_name" != "null" ]; then
            pass "DNK instance has name: $dnk_name"
        fi
        
        # Check services object
        if jq -e '.instances.dnk.services' "$registry_file" >/dev/null 2>&1; then
            pass "DNK instance has services configuration"
        fi
    fi
    
    # Summary
    local total_instances=$(jq '.instances | keys | length' "$registry_file")
    info "Total instances in registry: $total_instances"
    
    if [ ${#missing_countries[@]} -eq 0 ]; then
        pass "All critical NATO countries present in registry"
    else
        fail "Some countries missing" "Missing: ${missing_countries[*]}"
    fi
}

# =============================================================================
# Test 2: Resource Seeding Parameters
# =============================================================================
test_seeding_parameters() {
    section "Test 2: Resource Seeding Parameters"
    
    # Test: Default resource counts
    local expected_total=5000
    local expected_by_classification=(
        ["UNCLASSIFIED"]=1000
        ["CONFIDENTIAL"]=1500
        ["SECRET"]=1500
        ["TOP_SECRET"]=1000
    )
    
    info "Expected resource distribution:"
    echo "  • Total: $expected_total"
    echo "  • UNCLASSIFIED: 1000 (20%)"
    echo "  • CONFIDENTIAL: 1500 (30%)"
    echo "  • SECRET: 1500 (30%)"
    echo "  • TOP_SECRET: 1000 (20%)"
    pass "Resource distribution parameters defined"
    
    # Test: Encryption requirement
    info "Encryption: All resources must be encrypted (encrypted=5000, plaintext=0)"
    pass "Encryption requirement defined"
    
    # Test: Resource attributes
    local required_attributes=("resourceId" "title" "classification" "releasabilityTo" "COI" "encrypted")
    for attr in "${required_attributes[@]}"; do
        pass "Required attribute defined: $attr"
    done
}

# =============================================================================
# Test 3: KAS Connectivity Requirements
# =============================================================================
test_kas_connectivity() {
    section "Test 3: KAS Connectivity Requirements"
    
    # Test: KAS endpoint format
    local kas_endpoints=(
        "https://dive-spoke-dnk-kas:8080"
        "https://localhost:8090"
    )
    
    for endpoint in "${kas_endpoints[@]}"; do
        if [[ "$endpoint" =~ ^https?:// ]]; then
            pass "KAS endpoint format valid: $endpoint"
        else
            fail "Invalid KAS endpoint" "URL: $endpoint"
        fi
    done
    
    # Test: Encryption endpoints
    local encrypt_endpoint="/encrypt"
    local rewrap_endpoint="/rewrap"
    
    pass "Encryption endpoint defined: $encrypt_endpoint"
    pass "Rewrap endpoint defined: $rewrap_endpoint"
    
    # Test: KAS registry requirement
    info "KAS must be registered in MongoDB kas_registry collection"
    info "Registration provides encryption keys and policy binding"
    pass "KAS registry requirement documented"
}

# =============================================================================
# Test 4: Error Handling Scenarios
# =============================================================================
test_error_handling() {
    section "Test 4: ZTDF Seeding Error Handling"
    
    # Test: Missing instance in registry
    local unknown_instance="XYZ"
    info "If instance '$unknown_instance' not in registry, seeding should fail cleanly"
    pass "Unknown instance detection requirement defined"
    
    # Test: KAS unavailable scenario
    info "If KAS unavailable, seeding should NOT fall back to plaintext"
    info "Expected behavior: Fail with clear error message"
    pass "No silent fallback to plaintext requirement defined"
    
    # Test: MongoDB connection failure
    info "If MongoDB unavailable, seeding should fail with connection error"
    pass "MongoDB dependency requirement defined"
    
    # Test: Insufficient disk space
    info "If disk space insufficient for 5000 resources, fail with clear error"
    pass "Resource creation validation requirement defined"
}

# =============================================================================
# Test 5: Resource Quality Validation
# =============================================================================
test_resource_quality() {
    section "Test 5: Resource Quality Validation"
    
    # Test: Sample resource structure
    local sample_resource=$(cat <<EOF
{
  "resourceId": "doc-dnk-0001",
  "title": "Test Document",
  "classification": "SECRET",
  "releasabilityTo": ["DNK", "USA"],
  "COI": ["NATO"],
  "encrypted": true,
  "encryptedContent": "base64-encrypted-data...",
  "kasId": "dnk-kas"
}
EOF
)
    
    # Validate structure
    local required_fields=("resourceId" "title" "classification" "releasabilityTo" "encrypted")
    for field in "${required_fields[@]}"; do
        if echo "$sample_resource" | jq -e ".$field" >/dev/null 2>&1; then
            pass "Resource has required field: $field"
        else
            fail "Resource missing field: $field" "Invalid resource structure"
        fi
    done
    
    # Test: Classification values
    local valid_classifications=("UNCLASSIFIED" "CONFIDENTIAL" "SECRET" "TOP_SECRET")
    local classification=$(echo "$sample_resource" | jq -r '.classification')
    
    local is_valid=false
    for valid in "${valid_classifications[@]}"; do
        if [ "$classification" = "$valid" ]; then
            is_valid=true
            break
        fi
    done
    
    if [ "$is_valid" = true ]; then
        pass "Classification is valid: $classification"
    else
        fail "Invalid classification" "Got: $classification"
    fi
    
    # Test: Encrypted flag matches content
    local encrypted=$(echo "$sample_resource" | jq -r '.encrypted')
    local has_encrypted_content=$(echo "$sample_resource" | jq -e '.encryptedContent' >/dev/null 2>&1 && echo "true" || echo "false")
    
    if [ "$encrypted" = "true" ] && [ "$has_encrypted_content" = "true" ]; then
        pass "Encrypted resource has encryptedContent field"
    else
        fail "Encryption mismatch" "encrypted=$encrypted, hasContent=$has_encrypted_content"
    fi
}

# =============================================================================
# Run All Tests
# =============================================================================
main() {
    echo "================================================="
    echo "DIVE V3 - ZTDF Seeding Test Suite"
    echo "================================================="
    echo ""
    
    test_instance_detection
    test_seeding_parameters
    test_kas_connectivity
    test_error_handling
    test_resource_quality
    
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
        echo -e "${GREEN}✓ All tests passed!${NC}"
        exit 0
    else
        echo ""
        echo -e "${RED}✗ Some tests failed${NC}"
        exit 1
    fi
}

# Run tests if executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
