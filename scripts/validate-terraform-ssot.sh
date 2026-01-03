#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - Terraform SSOT Validation Script
# =============================================================================
# Validates that shell scripts do not contain Keycloak configuration that
# should be managed by Terraform.
#
# Usage:
#   ./scripts/validate-terraform-ssot.sh [--fix] [--verbose]
#
# This script checks for:
# 1. Direct Keycloak client creation API calls in shell scripts
# 2. Direct protocol mapper creation API calls in shell scripts
# 3. Direct realm configuration API calls in shell scripts
#
# These should all be managed by Terraform as the Single Source of Truth.
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-01
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse arguments
VERBOSE=false
FIX_MODE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --verbose|-v) VERBOSE=true; shift ;;
        --fix) FIX_MODE=true; shift ;;
        *) shift ;;
    esac
done

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_verbose() { [ "$VERBOSE" = true ] && echo -e "${CYAN}»${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        DIVE V3 Terraform SSOT Validation                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

VIOLATIONS=0
WARNINGS=0

# =============================================================================
# Check 1: No direct client creation in init-keycloak.sh (except legacy block)
# =============================================================================
check_no_client_creation() {
    local file="$1"
    local violations=0

    log_info "Checking for direct client creation in $(basename "$file")..."

    # Look for POST to /admin/realms/.../clients outside of legacy blocks
    # The legacy block is marked with "TERRAFORM_APPLIED != true"
    local in_legacy_block=false
    local line_num=0

    while IFS= read -r line; do
        line_num=$((line_num + 1))

        # Check for entering legacy block
        if echo "$line" | grep -q 'TERRAFORM_APPLIED.*!=.*true'; then
            in_legacy_block=true
            log_verbose "Entered legacy block at line $line_num"
        fi

        # Check for exiting legacy block
        if [ "$in_legacy_block" = true ] && echo "$line" | grep -q '^fi.*#.*End.*TERRAFORM_APPLIED'; then
            in_legacy_block=false
            log_verbose "Exited legacy block at line $line_num"
        fi

        # Only report violations outside legacy blocks
        if [ "$in_legacy_block" = false ]; then
            # Check for direct client creation
            if echo "$line" | grep -qE 'POST.*admin/realms/.*/clients[^/]' && ! echo "$line" | grep -q 'identity-provider'; then
                log_warn "Line $line_num: Direct client creation outside legacy block"
                log_verbose "  $line"
                violations=$((violations + 1))
            fi

            # Check for direct mapper creation
            if echo "$line" | grep -qE 'POST.*protocol-mappers/models' && ! echo "$line" | grep -q 'identity-provider'; then
                log_warn "Line $line_num: Direct mapper creation outside legacy block"
                log_verbose "  $line"
                violations=$((violations + 1))
            fi
        fi
    done < "$file"

    return $violations
}

# =============================================================================
# Check 2: Federation-link.sh respects USE_TERRAFORM_SSOT
# =============================================================================
check_federation_link_ssot() {
    local file="${PROJECT_ROOT}/scripts/dive-modules/federation-link.sh"

    if [ ! -f "$file" ]; then
        log_warn "federation-link.sh not found"
        return 0
    fi

    log_info "Checking federation-link.sh for SSOT compliance..."

    # Check that _ensure_federation_client_mappers has USE_TERRAFORM_SSOT check
    if grep -q 'USE_TERRAFORM_SSOT' "$file"; then
        log_success "federation-link.sh respects USE_TERRAFORM_SSOT"
        return 0
    else
        log_error "federation-link.sh does not check USE_TERRAFORM_SSOT"
        return 1
    fi
}

# =============================================================================
# Check 3: Terraform modules have required resources
# =============================================================================
check_terraform_completeness() {
    local tf_dir="${PROJECT_ROOT}/terraform/modules/federated-instance"

    if [ ! -d "$tf_dir" ]; then
        log_warn "Terraform federated-instance module not found"
        return 0
    fi

    log_info "Checking Terraform module completeness..."

    local missing=0

    # Check for required files
    for file in main.tf variables.tf cross-border-client.tf; do
        if [ -f "$tf_dir/$file" ]; then
            log_verbose "Found: $file"
        else
            log_error "Missing: $tf_dir/$file"
            missing=$((missing + 1))
        fi
    done

    # Check for required resources in main.tf
    local required_resources=(
        "keycloak_realm"
        "keycloak_openid_client"
        "keycloak_openid_user_attribute_protocol_mapper.*clearance"
        "keycloak_openid_user_attribute_protocol_mapper.*country"
        "keycloak_openid_user_attribute_protocol_mapper.*unique_id"
        "keycloak_openid_user_attribute_protocol_mapper.*acp_coi"
        "keycloak_generic_protocol_mapper.*amr"
        "keycloak_generic_protocol_mapper.*acr"
    )

    for resource in "${required_resources[@]}"; do
        if grep -rq "$resource" "$tf_dir"; then
            log_verbose "Found resource: $resource"
        else
            log_error "Missing resource: $resource"
            missing=$((missing + 1))
        fi
    done

    # Check for new variables
    local required_vars=(
        "cross_border_client_secret"
        "local_keycloak_port"
        "local_frontend_port"
    )

    for var in "${required_vars[@]}"; do
        if grep -q "variable.*\"${var}\"" "$tf_dir/variables.tf"; then
            log_verbose "Found variable: $var"
        else
            log_error "Missing variable: $var"
            missing=$((missing + 1))
        fi
    done

    return $missing
}

# =============================================================================
# Check 4: spoke.sh exports USE_TERRAFORM_SSOT
# =============================================================================
check_spoke_exports_ssot() {
    local file="${PROJECT_ROOT}/scripts/dive-modules/spoke.sh"

    if [ ! -f "$file" ]; then
        log_warn "spoke.sh not found"
        return 0
    fi

    log_info "Checking spoke.sh for USE_TERRAFORM_SSOT export..."

    if grep -q 'export USE_TERRAFORM_SSOT=true' "$file"; then
        log_success "spoke.sh exports USE_TERRAFORM_SSOT=true"
        return 0
    else
        log_error "spoke.sh does not export USE_TERRAFORM_SSOT"
        return 1
    fi
}

# =============================================================================
# Check 5: terraform-apply.sh wrapper exists
# =============================================================================
check_terraform_wrapper() {
    local file="${PROJECT_ROOT}/scripts/dive-modules/terraform-apply.sh"

    log_info "Checking for terraform-apply.sh wrapper..."

    if [ -f "$file" ]; then
        log_success "terraform-apply.sh wrapper exists"

        # Verify it has required functions
        local required_funcs=("spoke_terraform_apply" "_export_terraform_vars")
        for func in "${required_funcs[@]}"; do
            if grep -q "$func" "$file"; then
                log_verbose "Found function: $func"
            else
                log_warn "Missing function: $func"
                WARNINGS=$((WARNINGS + 1))
            fi
        done
        return 0
    else
        log_error "terraform-apply.sh wrapper not found"
        return 1
    fi
}

# =============================================================================
# Run all checks
# =============================================================================

# Check 1: init-keycloak.sh
if [ -f "${PROJECT_ROOT}/scripts/spoke-init/init-keycloak.sh" ]; then
    check_no_client_creation "${PROJECT_ROOT}/scripts/spoke-init/init-keycloak.sh" || VIOLATIONS=$((VIOLATIONS + $?))
fi

# Check 2: federation-link.sh
check_federation_link_ssot || VIOLATIONS=$((VIOLATIONS + 1))

# Check 3: Terraform completeness
check_terraform_completeness || VIOLATIONS=$((VIOLATIONS + $?))

# Check 4: spoke.sh exports
check_spoke_exports_ssot || VIOLATIONS=$((VIOLATIONS + 1))

# Check 5: Terraform wrapper
check_terraform_wrapper || VIOLATIONS=$((VIOLATIONS + 1))

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "════════════════════════════════════════════════════════════════"

if [ $VIOLATIONS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All SSOT validation checks passed!${NC}"
    echo ""
    echo "  Terraform is the Single Source of Truth for:"
    echo "  - Keycloak realm configuration"
    echo "  - Client configuration and secrets"
    echo "  - Protocol mappers (clearance, countryOfAffiliation, etc.)"
    echo "  - WebAuthn policy"
    echo "  - ACR-LoA mapping"
    echo "  - Cross-border federation client"
    echo ""
    echo "  Shell scripts handle dynamic operations only:"
    echo "  - IdP creation (cross-instance references)"
    echo "  - User seeding"
    echo "  - Federation linking"
    echo ""
    exit 0
elif [ $VIOLATIONS -eq 0 ]; then
    echo -e "${YELLOW}⚠ Validation passed with ${WARNINGS} warnings${NC}"
    exit 0
else
    echo -e "${RED}✗ SSOT validation failed with ${VIOLATIONS} violations${NC}"
    echo ""
    echo "  To fix:"
    echo "  1. Ensure Keycloak config is in Terraform, not shell scripts"
    echo "  2. Use USE_TERRAFORM_SSOT=true to skip legacy API calls"
    echo "  3. Run: terraform apply -var-file=countries/<code>.tfvars"
    echo ""
    exit 1
fi
