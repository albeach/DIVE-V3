#!/bin/bash
#
# Validate Instance Theme Configuration
#
# Usage:
#   ./scripts/validate-theme.sh USA
#   ./scripts/validate-theme.sh --all
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
INSTANCES_DIR="$PROJECT_ROOT/instances"
THEMES_DIR="$PROJECT_ROOT/keycloak/themes"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

log_header() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }
log_pass() { echo -e "  ${GREEN}✓${NC} $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
log_fail() { echo -e "  ${RED}✗${NC} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
log_warn() { echo -e "  ${YELLOW}⚠${NC} $1"; WARN_COUNT=$((WARN_COUNT + 1)); }
log_info() { echo -e "  ${BLUE}ℹ${NC} $1"; }

check_deps() {
    command -v jq &>/dev/null || { echo "jq required"; exit 1; }
}

is_valid_hex() {
    [[ "$1" =~ ^#[0-9A-Fa-f]{6}$ ]]
}

validate_instance() {
    local code=$(echo "$1" | tr '[:lower:]' '[:upper:]')
    local code_lower=$(echo "$1" | tr '[:upper:]' '[:lower:]')
    local instance_file="$INSTANCES_DIR/$code_lower/instance.json"
    
    log_header "Validating $code Instance"
    
    # Check file exists
    if [[ ! -f "$instance_file" ]]; then
        log_fail "instance.json not found: $instance_file"
        return 1
    fi
    log_pass "instance.json exists"
    
    # Validate JSON
    if ! jq empty "$instance_file" 2>/dev/null; then
        log_fail "instance.json is not valid JSON"
        return 1
    fi
    log_pass "instance.json is valid JSON"
    
    # Read fields
    local instance_code=$(jq -r '.instance_code // ""' "$instance_file")
    local instance_name=$(jq -r '.instance_name // ""' "$instance_file")
    local locale=$(jq -r '.locale // ""' "$instance_file")
    local primary=$(jq -r '.theme.primary_color // ""' "$instance_file")
    local secondary=$(jq -r '.theme.secondary_color // ""' "$instance_file")
    local accent=$(jq -r '.theme.accent_color // ""' "$instance_file")
    
    # Check required fields
    [[ -n "$instance_code" ]] && log_pass "instance_code: $instance_code" || log_fail "instance_code missing"
    [[ -n "$instance_name" ]] && log_pass "instance_name: $instance_name" || log_fail "instance_name missing"
    [[ -n "$locale" ]] && log_pass "locale: $locale" || log_fail "locale missing"
    
    # Validate colors
    if [[ -n "$primary" ]]; then
        is_valid_hex "$primary" && log_pass "primary_color: $primary" || log_fail "primary_color invalid: $primary"
    else
        log_fail "primary_color missing"
    fi
    
    if [[ -n "$secondary" ]]; then
        is_valid_hex "$secondary" && log_pass "secondary_color: $secondary" || log_fail "secondary_color invalid: $secondary"
    else
        log_fail "secondary_color missing"
    fi
    
    if [[ -n "$accent" ]]; then
        is_valid_hex "$accent" && log_pass "accent_color: $accent" || log_fail "accent_color invalid: $accent"
    else
        log_fail "accent_color missing"
    fi
    
    # Check Keycloak theme
    log_info "Checking Keycloak theme..."
    local theme_css="$THEMES_DIR/dive-v3-$code_lower/login/resources/css/custom.css"
    if [[ -f "$theme_css" ]]; then
        log_pass "Keycloak custom.css exists"
        grep -q "$primary" "$theme_css" 2>/dev/null && log_pass "CSS contains primary color" || log_warn "CSS missing primary color"
    else
        log_warn "Keycloak custom.css not found (run generate-keycloak-theme.sh)"
    fi
    
    # Check partners
    local partners=$(jq -r '.federation_partners | length' "$instance_file" 2>/dev/null)
    [[ "$partners" -gt 0 ]] && log_pass "Federation partners: $partners" || log_warn "No federation partners"
    
    return 0
}

validate_all() {
    for instance_dir in "$INSTANCES_DIR"/*/; do
        [[ -d "$instance_dir" ]] && validate_instance "$(basename "$instance_dir")"
    done
}

print_summary() {
    echo -e "\n${CYAN}━━━ SUMMARY ━━━${NC}"
    echo -e "  ${GREEN}Passed:${NC}   $PASS_COUNT"
    echo -e "  ${RED}Failed:${NC}   $FAIL_COUNT"
    echo -e "  ${YELLOW}Warnings:${NC} $WARN_COUNT"
    
    [[ $FAIL_COUNT -eq 0 ]] && echo -e "\n  ${GREEN}✓ All validations passed!${NC}" || echo -e "\n  ${RED}✗ Some validations failed${NC}"
    [[ $FAIL_COUNT -eq 0 ]]
}

main() {
    check_deps
    
    case "${1:-}" in
        --all|-a) validate_all ;;
        --help|-h) echo "Usage: $0 [INSTANCE_CODE|--all]" ;;
        "") echo "Usage: $0 [INSTANCE_CODE|--all]" ;;
        *) validate_instance "$1" ;;
    esac
    
    print_summary
}

main "$@"
