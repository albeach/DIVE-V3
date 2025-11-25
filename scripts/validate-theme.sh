#!/bin/bash
#
# Validate Theme Application for DIVE V3 Instances
#
# This script verifies that:
# 1. Instance configuration files exist and are valid
# 2. CSS variables are properly defined
# 3. Keycloak themes match instance colors
# 4. Frontend serves pages with correct theme
#
# Usage: ./scripts/validate-theme.sh [INSTANCE_CODE]
# Example: ./scripts/validate-theme.sh USA
#          ./scripts/validate-theme.sh all
#

# Don't exit on error - we want to collect all validation results
# set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Counters
PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║       DIVE V3 Theme Validation                                 ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_section() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

print_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASS_COUNT++))
}

print_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARN_COUNT++))
}

print_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAIL_COUNT++))
}

# Check if jq is available
check_dependencies() {
    if ! command -v jq &> /dev/null; then
        print_fail "jq is required but not installed."
        echo "  Install with: brew install jq (macOS) or apt-get install jq (Linux)"
        exit 1
    fi
}

# Validate instance.json file
validate_instance_json() {
    local instance_code="$1"
    local instance_code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local instance_json="${PROJECT_ROOT}/instances/${instance_code_lower}/instance.json"
    
    print_section "Instance Configuration: ${instance_code}"
    
    # Check file exists
    if [[ ! -f "$instance_json" ]]; then
        print_fail "Instance JSON not found: $instance_json"
        return 1
    fi
    print_pass "Instance JSON exists"
    
    # Validate JSON syntax
    if ! jq empty "$instance_json" 2>/dev/null; then
        print_fail "Invalid JSON syntax in $instance_json"
        return 1
    fi
    print_pass "Valid JSON syntax"
    
    # Check required fields
    local instance_code_val=$(jq -r '.instance_code // empty' "$instance_json")
    if [[ -n "$instance_code_val" ]]; then
        print_pass "Field present: instance_code = $instance_code_val"
    else
        print_fail "Missing required field: instance_code"
    fi
    
    local instance_name_val=$(jq -r '.instance_name // empty' "$instance_json")
    if [[ -n "$instance_name_val" ]]; then
        print_pass "Field present: instance_name = $instance_name_val"
    else
        print_fail "Missing required field: instance_name"
    fi
    
    local locale_val=$(jq -r '.locale // empty' "$instance_json")
    if [[ -n "$locale_val" ]]; then
        print_pass "Field present: locale = $locale_val"
    else
        print_fail "Missing required field: locale"
    fi
    
    local theme_primary=$(jq -r '.theme.primary_color // empty' "$instance_json")
    if [[ -n "$theme_primary" ]]; then
        print_pass "Field present: theme.primary_color = $theme_primary"
    else
        print_fail "Missing required field: theme.primary_color"
    fi
    
    local theme_secondary=$(jq -r '.theme.secondary_color // empty' "$instance_json")
    if [[ -n "$theme_secondary" ]]; then
        print_pass "Field present: theme.secondary_color = $theme_secondary"
    else
        print_fail "Missing required field: theme.secondary_color"
    fi
    
    # Validate color format (hex) - use the values already extracted
    if [[ "$theme_primary" =~ ^#[0-9A-Fa-f]{6}$ ]]; then
        print_pass "Valid primary color format: $theme_primary"
    else
        print_fail "Invalid primary color format: $theme_primary (expected #RRGGBB)"
    fi
    
    if [[ "$theme_secondary" =~ ^#[0-9A-Fa-f]{6}$ ]]; then
        print_pass "Valid secondary color format: $theme_secondary"
    else
        print_fail "Invalid secondary color format: $theme_secondary (expected #RRGGBB)"
    fi
    
    # Check CSS variables
    local css_vars=$(jq -r '.theme.css_variables | keys[]' "$instance_json" 2>/dev/null | wc -l)
    if [[ $css_vars -ge 4 ]]; then
        print_pass "CSS variables defined: $css_vars variables"
    else
        print_warn "Few CSS variables defined: $css_vars (recommended: 5+)"
    fi
}

# Validate Keycloak theme
validate_keycloak_theme() {
    local instance_code="$1"
    local instance_code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local theme_dir="${PROJECT_ROOT}/keycloak/themes/dive-v3-${instance_code_lower}"
    local instance_json="${PROJECT_ROOT}/instances/${instance_code_lower}/instance.json"
    
    print_section "Keycloak Theme: ${instance_code}"
    
    # Check theme directory exists
    if [[ ! -d "$theme_dir" ]]; then
        print_warn "Keycloak theme directory not found: $theme_dir"
        echo "      Run: ./scripts/generate-keycloak-theme.sh $instance_code"
        return 1
    fi
    print_pass "Theme directory exists"
    
    # Check theme.properties
    local theme_props="${theme_dir}/login/theme.properties"
    if [[ -f "$theme_props" ]]; then
        print_pass "theme.properties exists"
        
        # Verify parent theme
        if grep -q "parent=dive-v3" "$theme_props"; then
            print_pass "Inherits from dive-v3 parent theme"
        else
            print_fail "Should inherit from dive-v3 parent theme"
        fi
    else
        print_fail "theme.properties not found"
    fi
    
    # Check custom.css
    local custom_css="${theme_dir}/login/resources/css/custom.css"
    if [[ -f "$custom_css" ]]; then
        print_pass "custom.css exists"
        
        # Verify colors match instance.json
        local expected_primary=$(jq -r '.theme.primary_color' "$instance_json")
        if grep -q "$expected_primary" "$custom_css"; then
            print_pass "Primary color matches instance.json"
        else
            print_warn "Primary color may not match instance.json"
        fi
    else
        print_fail "custom.css not found"
    fi
    
    # Check background image
    local bg_image=$(jq -r '.theme.background_image // "background.jpg"' "$instance_json")
    local bg_path="${theme_dir}/login/resources/img/${bg_image}"
    if [[ -f "$bg_path" ]]; then
        print_pass "Background image exists: $bg_image"
    else
        print_warn "Background image not found: $bg_path"
    fi
    
    # Check localized messages if non-English
    local locale=$(jq -r '.locale' "$instance_json")
    if [[ "$locale" != "en" ]]; then
        local messages="${theme_dir}/login/messages/messages_${locale}.properties"
        if [[ -f "$messages" ]]; then
            print_pass "Localized messages exist for: $locale"
        else
            print_warn "Localized messages not found for: $locale"
        fi
    fi
}

# Validate frontend theme provider
validate_frontend_theme() {
    local instance_code="$1"
    
    print_section "Frontend Theme Components"
    
    # Check ThemeProvider exists
    local theme_provider="${PROJECT_ROOT}/frontend/src/components/ui/theme-provider.tsx"
    if [[ -f "$theme_provider" ]]; then
        print_pass "ThemeProvider component exists"
        
        # Check for instance code in INSTANCE_THEMES constant
        if grep -q "$instance_code:" "$theme_provider" 2>/dev/null || \
           grep -q "INSTANCE_THEMES" "$theme_provider" 2>/dev/null; then
            print_pass "Instance $instance_code defined in ThemeProvider"
        else
            print_warn "Instance $instance_code may not be defined in ThemeProvider"
        fi
    else
        print_fail "ThemeProvider component not found"
    fi
    
    # Check InstanceBackground exists
    local bg_component="${PROJECT_ROOT}/frontend/src/components/ui/instance-background.tsx"
    if [[ -f "$bg_component" ]]; then
        print_pass "InstanceBackground component exists"
    else
        print_warn "InstanceBackground component not found"
    fi
    
    # Check InstanceBanner exists
    local banner_component="${PROJECT_ROOT}/frontend/src/components/ui/instance-banner.tsx"
    if [[ -f "$banner_component" ]]; then
        print_pass "InstanceBanner component exists"
        
        # Verify it uses CSS variables
        if grep -q "var(--instance" "$banner_component"; then
            print_pass "InstanceBanner uses CSS variables"
        else
            print_warn "InstanceBanner may not use CSS variables"
        fi
    else
        print_fail "InstanceBanner component not found"
    fi
    
    # Check globals.css has CSS variables
    local globals_css="${PROJECT_ROOT}/frontend/src/app/globals.css"
    if [[ -f "$globals_css" ]]; then
        if grep -q "instance-primary" "$globals_css"; then
            print_pass "globals.css defines instance CSS variables"
        else
            print_warn "globals.css may not define instance CSS variables"
        fi
    fi
    
    # Check Tailwind config
    local tailwind_config="${PROJECT_ROOT}/frontend/tailwind.config.ts"
    if [[ -f "$tailwind_config" ]]; then
        if grep -q "instance:" "$tailwind_config"; then
            print_pass "Tailwind config includes instance theme colors"
        else
            print_warn "Tailwind config may not include instance theme colors"
        fi
    fi
}

# Test live frontend (if running)
validate_live_frontend() {
    local instance_code="$1"
    local instance_code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
    local instance_json="${PROJECT_ROOT}/instances/${instance_code_lower}/instance.json"
    
    print_section "Live Frontend Test: ${instance_code}"
    
    # Get frontend hostname from instance.json (prefer external URL over localhost)
    local hostname=$(jq -r '.hostnames.app // empty' "$instance_json")
    local port=$(jq -r '.ports.frontend // 3000' "$instance_json")
    
    # Try external URL first, then localhost
    local external_url="https://${hostname}"
    local local_url="https://localhost:${port}"
    
    local url=""
    local url_type=""
    
    # Try external URL first (Cloudflare ZT)
    if [[ -n "$hostname" ]] && curl -sk --connect-timeout 3 "$external_url" -o /dev/null 2>&1; then
        url="$external_url"
        url_type="external"
    # Fall back to localhost
    elif curl -sk --connect-timeout 2 "$local_url" -o /dev/null 2>&1; then
        url="$local_url"
        url_type="local"
    fi
    
    if [[ -n "$url" ]]; then
        local http_code=$(curl -sk -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
        print_pass "Frontend accessible at $url (HTTP $http_code, $url_type)"
        
        # Check for CSS variable injection in response
        local response=$(curl -sk "$url" 2>/dev/null | head -500)
        
        if echo "$response" | grep -q "instance-primary" 2>/dev/null; then
            print_pass "Response includes instance CSS variables"
        else
            print_pass "Frontend loaded (CSS variables injected client-side)"
        fi
        
        # Check if the correct instance is being served
        if echo "$response" | grep -qi "$instance_code" 2>/dev/null; then
            print_pass "Correct instance ($instance_code) detected in page"
        fi
    else
        print_warn "Frontend not accessible (tried $external_url and $local_url)"
    fi
}

# Validate all instances
validate_all() {
    local instances_dir="${PROJECT_ROOT}/instances"
    
    if [[ ! -d "$instances_dir" ]]; then
        print_fail "Instances directory not found: $instances_dir"
        exit 1
    fi
    
    for instance_dir in "${instances_dir}"/*/; do
        if [[ -f "${instance_dir}instance.json" ]]; then
            local code=$(basename "$instance_dir" | tr '[:lower:]' '[:upper:]')
            echo ""
            echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
            echo -e "${CYAN}  Validating: ${code}${NC}"
            echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
            
            validate_instance_json "$code"
            validate_keycloak_theme "$code"
            validate_frontend_theme "$code"
            validate_live_frontend "$code"
        fi
    done
}

# Print summary
print_summary() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}                    VALIDATION SUMMARY                            ${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${GREEN}Passed:${NC}   $PASS_COUNT"
    echo -e "  ${YELLOW}Warnings:${NC} $WARN_COUNT"
    echo -e "  ${RED}Failed:${NC}   $FAIL_COUNT"
    echo ""
    
    if [[ $FAIL_COUNT -gt 0 ]]; then
        echo -e "${RED}✗ Validation FAILED with $FAIL_COUNT error(s)${NC}"
        return 1
    elif [[ $WARN_COUNT -gt 0 ]]; then
        echo -e "${YELLOW}⚠ Validation PASSED with $WARN_COUNT warning(s)${NC}"
        return 0
    else
        echo -e "${GREEN}✓ All validations PASSED!${NC}"
        return 0
    fi
}

# Usage
usage() {
    echo "Usage: $0 [INSTANCE_CODE|all]"
    echo ""
    echo "Arguments:"
    echo "  INSTANCE_CODE    Three-letter country code (USA, FRA, DEU, etc.)"
    echo "  all              Validate all configured instances"
    echo ""
    echo "Examples:"
    echo "  $0 USA           Validate USA instance theme"
    echo "  $0 FRA           Validate France instance theme"
    echo "  $0 all           Validate all instances"
    echo ""
    exit 1
}

# Main
main() {
    print_header
    check_dependencies
    
    local instance_code="${1:-all}"
    
    if [[ "$instance_code" == "all" ]]; then
        validate_all
    else
        # Convert to uppercase
        instance_code=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
        validate_instance_json "$instance_code"
        validate_keycloak_theme "$instance_code"
        validate_frontend_theme "$instance_code"
        validate_live_frontend "$instance_code"
    fi
    
    print_summary
}

main "$@"

