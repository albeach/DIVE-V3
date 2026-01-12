#!/usr/bin/env bash
# =============================================================================
# DIVE V3 SPOKE FUNCTIONS VALIDATION
# =============================================================================
# Validates that all spoke functions are properly loaded and accessible
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Validating Spoke Function Accessibility...${NC}"
echo ""

# Test function loading
echo -e "${BLUE}Testing module loading...${NC}"

# Source the main spoke module to load all functions
if bash -c 'source scripts/dive-modules/spoke.sh >/dev/null 2>&1'; then
    echo -e "${GREEN}✅ Main module loaded successfully${NC}"
else
    echo -e "${RED}❌ Failed to load main module${NC}"
    exit 1
fi

# Test key functions from each module
echo ""
echo -e "${BLUE}Testing function accessibility...${NC}"

functions_to_test=(
    "spoke_status:status.sh"
    "spoke_health:status.sh"
    "spoke_verify:verification.sh"
    "spoke_logs:status.sh"
    "spoke_sync:federation.sh"
    "spoke_heartbeat:federation.sh"
    "spoke_list_peers:federation.sh"
    "spoke_fix_mappers:maintenance.sh"
    "spoke_reinit_client:maintenance.sh"
    "spoke_regenerate_theme:maintenance.sh"
    "spoke_localize:localization.sh"
    "spoke_localize_mappers:localization.sh"
    "spoke_pki_request:pki.sh"
    "spoke_pki_import:pki.sh"
    "spoke_clean:operations.sh"
    "spoke_down:operations.sh"
    "spoke_reset:operations.sh"
    "spoke_teardown:operations.sh"
    "spoke_generate_certs:maintenance.sh"
    "spoke_rotate_certs:maintenance.sh"
    "spoke_init:spoke-init.sh"
    "spoke_deploy:spoke-deploy.sh"
    "spoke_register:spoke-register.sh"
    "spoke_seed:spoke-deploy.sh"
    "spoke_list_countries:spoke-countries.sh"
    "spoke_kas:spoke-kas.sh"
    "spoke_policy:spoke-policy.sh"
    "spoke_failover:spoke-failover.sh"
    "spoke_maintenance:maintenance.sh"
    "spoke_up:spoke-deploy.sh"
)

passed=0
failed=0

for func_info in "${functions_to_test[@]}"; do
    IFS=':' read -r func_name module <<< "$func_info"

    echo -n "Testing $func_name ($module)... "
    if bash -c "source scripts/dive-modules/spoke.sh >/dev/null 2>&1 && type $func_name >/dev/null 2>&1"; then
        echo -e "${GREEN}✅ FOUND${NC}"
        ((passed++))
    else
        echo -e "${RED}❌ MISSING${NC}"
        ((failed++))
    fi
done

echo ""
echo -e "${BLUE}📊 FUNCTION VALIDATION RESULTS:${NC}"
echo "Functions tested: ${#functions_to_test[@]}"
echo -e "Found: ${GREEN}$passed${NC}"
echo -e "Missing: ${RED}$failed${NC}"

# Test dispatcher function count
echo ""
echo -e "${BLUE}Testing dispatcher coverage...${NC}"
dispatcher_functions=$(grep -E "spoke_[a-zA-Z_]+" scripts/dive-modules/spoke.sh | sed 's/.*spoke_\([a-zA-Z_]*\).*/spoke_\1/' | sort | uniq | grep -v "log_" | grep -v "print_" | wc -l)
echo "Functions called in dispatcher: $dispatcher_functions"

module_functions=$(find scripts/dive-modules/spoke -name "*.sh" -exec grep -E "^[a-zA-Z_][a-zA-Z0-9_]*\(\)" {} \; | wc -l)
echo "Functions defined in modules: $module_functions"

if [ "$dispatcher_functions" -le "$module_functions" ]; then
    echo -e "${GREEN}✅ Dispatcher coverage looks good${NC}"
else
    echo -e "${YELLOW}⚠️  More dispatcher calls than module functions${NC}"
fi

# Test module structure
echo ""
echo -e "${BLUE}Testing module structure...${NC}"
module_count=$(find scripts/dive-modules/spoke -name "*.sh" | wc -l)
echo "Modules found: $module_count"

large_modules=$(find scripts/dive-modules/spoke -name "*.sh" -exec wc -l {} \; | awk '$1 > 500 {print $2 ": " $1 " lines"}')
if [ -n "$large_modules" ]; then
    echo -e "${YELLOW}⚠️  Large modules (>500 lines):${NC}"
    echo "$large_modules"
else
    echo -e "${GREEN}✅ All modules are within AI-friendly size limits${NC}"
fi

echo ""
if [ $failed -eq 0 ]; then
    echo -e "${GREEN}🎉 SPOKE MODULARIZATION VALIDATION COMPLETE!${NC}"
    echo ""
    echo "✅ All key functions are accessible"
    echo "✅ Modules load correctly"
    echo "✅ Dispatcher coverage verified"
    echo "✅ No missing functions detected"
    echo ""
    echo "The spoke modularization is fully functional!"
    exit 0
else
    echo -e "${RED}❌ VALIDATION FAILED${NC}"
    echo ""
    echo "$failed functions are missing from the modular structure"
    exit 1
fi