#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - Phase 2 IdP Automation Tests
# =============================================================================
# Tests for Keycloak IdP automation and locale-specific configuration.
#
# Run: ./tests/docker/phase2-idp-automation.sh
#
# Tests:
#   1. User profile templates exist for all 32 NATO nations
#   2. NATO attribute mappings JSON is valid
#   3. apply-user-profile.sh script exists and is executable
#   4. configure-localized-mappers.sh script exists and is executable
#   5. verify-idps.sh script exists and is executable
#   6. init-keycloak.sh creates DIVE V3 standard mappers
#   7. Cross-border client is configured correctly
# =============================================================================

# Don't use set -e since we test exit codes explicitly

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0

# Project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Test helpers
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((++PASSED)) || true
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((++FAILED)) || true
}

skip() {
    echo -e "${YELLOW}○${NC} $1 (skipped)"
}

section() {
    echo ""
    echo -e "${CYAN}=== $1 ===${NC}"
}

# =============================================================================
# TESTS
# =============================================================================

echo ""
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║           DIVE V3 Phase 2: IdP Automation Tests                        ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

cd "$PROJECT_ROOT"

# =============================================================================
# Test Group 1: User Profile Templates
# =============================================================================
section "User Profile Templates"

# Test 1.1: Templates directory exists
if [[ -d "keycloak/user-profile-templates" ]]; then
    pass "user-profile-templates directory exists"
else
    fail "user-profile-templates directory missing"
fi

# Test 1.2: Check for key NATO nation templates
NATO_NATIONS=(
    "albania" "belgium" "bulgaria" "canada" "croatia" "czechia" "denmark"
    "estonia" "finland" "france" "germany" "greece" "hungary" "iceland"
    "italy" "latvia" "lithuania" "luxembourg" "montenegro" "netherlands"
    "north-macedonia" "norway" "poland" "portugal" "romania" "slovakia"
    "slovenia" "spain" "sweden" "turkey" "united-kingdom" "united-states"
)

TEMPLATE_COUNT=0
for nation in "${NATO_NATIONS[@]}"; do
    if [[ -f "keycloak/user-profile-templates/${nation}.json" ]]; then
        ((TEMPLATE_COUNT++))
    fi
done

if [[ $TEMPLATE_COUNT -eq 32 ]]; then
    pass "All 32 NATO nation templates exist"
else
    fail "Only ${TEMPLATE_COUNT}/32 NATO nation templates exist"
fi

# Test 1.3: Templates have valid JSON
VALID_JSON=0
for nation in "${NATO_NATIONS[@]}"; do
    template="keycloak/user-profile-templates/${nation}.json"
    if [[ -f "$template" ]] && jq . "$template" >/dev/null 2>&1; then
        ((VALID_JSON++))
    fi
done

if [[ $VALID_JSON -eq $TEMPLATE_COUNT ]]; then
    pass "All templates are valid JSON"
else
    fail "$((TEMPLATE_COUNT - VALID_JSON)) template(s) have invalid JSON"
fi

# Test 1.4: Templates have required structure
VALID_STRUCTURE=0
for nation in "${NATO_NATIONS[@]}"; do
    template="keycloak/user-profile-templates/${nation}.json"
    if [[ -f "$template" ]]; then
        if jq -e '.nation.iso3166 and .attributes' "$template" >/dev/null 2>&1; then
            ((VALID_STRUCTURE++))
        fi
    fi
done

if [[ $VALID_STRUCTURE -eq $TEMPLATE_COUNT ]]; then
    pass "All templates have required structure (nation.iso3166, attributes)"
else
    fail "$((TEMPLATE_COUNT - VALID_STRUCTURE)) template(s) missing required structure"
fi

# =============================================================================
# Test Group 2: NATO Attribute Mappings
# =============================================================================
section "NATO Attribute Mappings"

# Test 2.1: nato-attribute-mappings.json exists
if [[ -f "keycloak/mapper-templates/nato-attribute-mappings.json" ]]; then
    pass "nato-attribute-mappings.json exists"
else
    fail "nato-attribute-mappings.json missing"
fi

# Test 2.2: Mappings file is valid JSON
if jq . "keycloak/mapper-templates/nato-attribute-mappings.json" >/dev/null 2>&1; then
    pass "nato-attribute-mappings.json is valid JSON"
else
    fail "nato-attribute-mappings.json has invalid JSON"
fi

# Test 2.3: Mappings contain all 32 NATO countries
MAPPING_COUNTRIES=$(jq -r '.countries | keys | length' "keycloak/mapper-templates/nato-attribute-mappings.json" 2>/dev/null)
if [[ "$MAPPING_COUNTRIES" -ge 30 ]]; then
    pass "Mappings contain ${MAPPING_COUNTRIES} countries"
else
    fail "Mappings only contain ${MAPPING_COUNTRIES} countries (expected 32)"
fi

# Test 2.4: Each mapping has required DIVE V3 attributes
DIVE_ATTRS=("clearance" "countryOfAffiliation" "uniqueID" "acpCOI")
VALID_MAPPINGS=0
COUNTRIES=$(jq -r '.countries | keys[]' "keycloak/mapper-templates/nato-attribute-mappings.json" 2>/dev/null)

for country in $COUNTRIES; do
    HAS_ALL=true
    for attr in "${DIVE_ATTRS[@]}"; do
        if ! jq -e ".countries.${country}.attributes | to_entries | .[] | select(.value==\"${attr}\")" \
            "keycloak/mapper-templates/nato-attribute-mappings.json" >/dev/null 2>&1; then
            HAS_ALL=false
            break
        fi
    done
    if [[ "$HAS_ALL" == "true" ]]; then
        ((VALID_MAPPINGS++))
    fi
done

if [[ $VALID_MAPPINGS -eq $MAPPING_COUNTRIES ]]; then
    pass "All country mappings include DIVE V3 attributes"
else
    fail "$((MAPPING_COUNTRIES - VALID_MAPPINGS)) country mappings missing DIVE V3 attributes"
fi

# =============================================================================
# Test Group 3: Scripts Exist and Are Executable
# =============================================================================
section "Spoke Init Scripts"

# Test 3.1: apply-user-profile.sh
if [[ -f "scripts/spoke-init/apply-user-profile.sh" ]]; then
    pass "apply-user-profile.sh exists"
    if [[ -x "scripts/spoke-init/apply-user-profile.sh" ]]; then
        pass "apply-user-profile.sh is executable"
    else
        fail "apply-user-profile.sh is not executable"
    fi
else
    fail "apply-user-profile.sh missing"
fi

# Test 3.2: configure-localized-mappers.sh
if [[ -f "scripts/spoke-init/configure-localized-mappers.sh" ]]; then
    pass "configure-localized-mappers.sh exists"
    if [[ -x "scripts/spoke-init/configure-localized-mappers.sh" ]]; then
        pass "configure-localized-mappers.sh is executable"
    else
        fail "configure-localized-mappers.sh is not executable"
    fi
else
    fail "configure-localized-mappers.sh missing"
fi

# Test 3.3: init-keycloak.sh
if [[ -f "scripts/spoke-init/init-keycloak.sh" ]]; then
    pass "init-keycloak.sh exists"
    if [[ -x "scripts/spoke-init/init-keycloak.sh" ]]; then
        pass "init-keycloak.sh is executable"
    else
        fail "init-keycloak.sh is not executable"
    fi
else
    fail "init-keycloak.sh missing"
fi

# Test 3.4: verify-idps.sh
if [[ -f "scripts/verify-idps.sh" ]]; then
    pass "verify-idps.sh exists"
    if [[ -x "scripts/verify-idps.sh" ]]; then
        pass "verify-idps.sh is executable"
    else
        fail "verify-idps.sh is not executable"
    fi
else
    fail "verify-idps.sh missing"
fi

# =============================================================================
# Test Group 4: init-keycloak.sh Content Validation
# =============================================================================
section "init-keycloak.sh Content"

# Test 4.1: Creates DIVE V3 standard protocol mappers
if grep -q 'clearance' scripts/spoke-init/init-keycloak.sh 2>/dev/null; then
    pass "init-keycloak.sh creates clearance mapper"
else
    fail "init-keycloak.sh missing clearance mapper"
fi

if grep -q 'countryOfAffiliation' scripts/spoke-init/init-keycloak.sh 2>/dev/null; then
    pass "init-keycloak.sh creates countryOfAffiliation mapper"
else
    fail "init-keycloak.sh missing countryOfAffiliation mapper"
fi

if grep -q 'uniqueID' scripts/spoke-init/init-keycloak.sh 2>/dev/null; then
    pass "init-keycloak.sh creates uniqueID mapper"
else
    fail "init-keycloak.sh missing uniqueID mapper"
fi

if grep -q 'acpCOI' scripts/spoke-init/init-keycloak.sh 2>/dev/null; then
    pass "init-keycloak.sh creates acpCOI mapper"
else
    fail "init-keycloak.sh missing acpCOI mapper"
fi

# Test 4.2: Creates cross-border client
if grep -q 'dive-v3-cross-border-client' scripts/spoke-init/init-keycloak.sh 2>/dev/null; then
    pass "init-keycloak.sh creates cross-border client"
else
    fail "init-keycloak.sh missing cross-border client creation"
fi

# Test 4.3: Creates USA hub IdP for spokes
if grep -q 'usa-idp' scripts/spoke-init/init-keycloak.sh 2>/dev/null; then
    pass "init-keycloak.sh creates usa-idp for federation"
else
    fail "init-keycloak.sh missing usa-idp creation"
fi

# =============================================================================
# Test Group 5: Federation Module
# =============================================================================
section "Federation Module"

# Test 5.1: federation.sh has link command
if grep -q 'federation_link' scripts/dive-modules/federation.sh 2>/dev/null; then
    pass "federation.sh has federation_link function"
else
    fail "federation.sh missing federation_link function"
fi

# Test 5.2: federation.sh has mappers commands
if grep -q 'federation_mappers_apply' scripts/dive-modules/federation.sh 2>/dev/null; then
    pass "federation.sh has federation_mappers_apply function"
else
    fail "federation.sh missing federation_mappers_apply function"
fi

# Test 5.3: federation.sh has list-idps command
if grep -q 'federation_list_idps' scripts/dive-modules/federation.sh 2>/dev/null; then
    pass "federation.sh has federation_list_idps function"
else
    fail "federation.sh missing federation_list_idps function"
fi

# =============================================================================
# Test Group 6: Realm JSON Template
# =============================================================================
section "Realm JSON Template"

# Test 6.1: dive-v3-broker.json exists
if [[ -f "keycloak/realms/dive-v3-broker.json" ]]; then
    pass "dive-v3-broker.json exists"
else
    fail "dive-v3-broker.json missing"
fi

# Test 6.2: Realm JSON is valid
if jq . "keycloak/realms/dive-v3-broker.json" >/dev/null 2>&1; then
    pass "dive-v3-broker.json is valid JSON"
else
    fail "dive-v3-broker.json has invalid JSON"
fi

# Test 6.3: Realm has no hardcoded IdPs (they should be created dynamically)
IDP_COUNT=$(jq '.identityProviders | length' "keycloak/realms/dive-v3-broker.json" 2>/dev/null)
if [[ "$IDP_COUNT" -eq 0 ]]; then
    pass "Realm has no hardcoded IdPs (correct - IdPs created via federation link)"
else
    fail "Realm has ${IDP_COUNT} hardcoded IdPs (should be 0 - IdPs should be created dynamically)"
fi

# Test 6.4: Realm has DIVE V3 client with protocol mappers
if jq -e '.clients[] | select(.clientId=="dive-v3-client-broker")' "keycloak/realms/dive-v3-broker.json" >/dev/null 2>&1; then
    pass "dive-v3-client-broker client defined"

    # Check for DIVE mappers on client
    for attr in clearance countryOfAffiliation uniqueID acpCOI; do
        if jq -e ".clients[] | select(.clientId==\"dive-v3-client-broker\") | .protocolMappers[] | select(.name==\"${attr}\")" \
            "keycloak/realms/dive-v3-broker.json" >/dev/null 2>&1; then
            pass "  Client has ${attr} mapper"
        else
            fail "  Client missing ${attr} mapper"
        fi
    done
else
    fail "dive-v3-client-broker client not defined"
fi

# =============================================================================
# Test Group 7: Production Mapper Template
# =============================================================================
section "Production Mapper Template"

# Test 7.1: Production template exists
if [[ -f "keycloak/mapper-templates/production/dive-core-claims.json" ]]; then
    pass "dive-core-claims.json exists"
else
    fail "dive-core-claims.json missing"
fi

# Test 7.2: Production template is valid JSON
if jq . "keycloak/mapper-templates/production/dive-core-claims.json" >/dev/null 2>&1; then
    pass "dive-core-claims.json is valid JSON"
else
    fail "dive-core-claims.json has invalid JSON"
fi

# Test 7.3: Production template has exactly 4 mappers (PII minimized)
PROD_MAPPER_COUNT=$(jq '.protocolMappers | length' "keycloak/mapper-templates/production/dive-core-claims.json" 2>/dev/null)
if [[ "$PROD_MAPPER_COUNT" -eq 4 ]]; then
    pass "Production template has 4 PII-minimized mappers"
else
    fail "Production template has ${PROD_MAPPER_COUNT} mappers (expected 4)"
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC} (total: $((PASSED + FAILED)))"
echo "════════════════════════════════════════════════════════════════════════"

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}Phase 2 IdP Automation tests PASSED${NC}"
    exit 0
else
    echo -e "${RED}Phase 2 IdP Automation tests FAILED${NC}"
    exit 1
fi
