#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Terraform Apply Module
# =============================================================================
# Wrapper for applying Terraform configuration to Keycloak instances.
# This is the SSOT for Keycloak configuration (realm, client, mappers, etc.)
#
# Usage:
#   source terraform-apply.sh
#   spoke_terraform_apply "FRA"
#   hub_terraform_apply
#
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-01
# Author: DIVE V3 Team
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Mark this module as loaded
export DIVE_TERRAFORM_APPLY_LOADED=1

# =============================================================================
# SPOKE TERRAFORM APPLY
# =============================================================================
# Applies Terraform configuration for a spoke instance.
# Creates/updates: realm, client, mappers, WebAuthn policy, ACR-LoA mapping
#
# Arguments:
#   $1 - Instance code (e.g., FRA, DEU, POL)
#
# Environment:
#   DIVE_ROOT - Project root directory
#   TF_VAR_* - Terraform variables (loaded from secrets)
#
# Returns:
#   0 - Success
#   1 - Failure
# =============================================================================
spoke_terraform_apply() {
    local code="${1:?Instance code required}"
    local code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')
    local code_upper=$(echo "$code" | tr '[:lower:]' '[:upper:]')

    log_step "Applying Terraform configuration for ${code_upper}..."

    # Ensure we're in the project root
    ensure_dive_root
    cd "${DIVE_ROOT}/terraform/spoke" || {
        log_error "Terraform spoke directory not found"
        return 1
    }

    # Check if tfvars exists
    local tfvars_file="../countries/${code_lower}.tfvars"
    if [ ! -f "$tfvars_file" ]; then
        log_warn "tfvars not found: $tfvars_file"
        log_info "Generating tfvars for ${code_upper}..."

        # Generate tfvars
        local generator="${DIVE_ROOT}/scripts/generate-country-tfvars.sh"
        if [ -x "$generator" ]; then
            "$generator" "$code_upper" || {
                log_error "Failed to generate tfvars for ${code_upper}"
                return 1
            }
        else
            log_error "tfvars generator not found: $generator"
            return 1
        fi
    fi

    # Initialize Terraform if needed
    if [ ! -d ".terraform" ]; then
        log_info "Initializing Terraform..."
        terraform init -backend=false >/dev/null 2>&1 || {
            log_error "Terraform init failed"
            return 1
        }
    fi

    # Select or create workspace
    if terraform workspace list 2>/dev/null | grep -qE "^\*?\s+${code_lower}$"; then
        log_verbose "Selecting existing workspace: ${code_lower}"
        terraform workspace select "$code_lower" >/dev/null 2>&1
    else
        log_info "Creating new workspace: ${code_lower}"
        terraform workspace new "$code_lower" >/dev/null 2>&1 || {
            log_error "Failed to create workspace: ${code_lower}"
            return 1
        }
    fi

    # Load secrets if not already loaded
    if [ -z "$KEYCLOAK_CLIENT_SECRET" ]; then
        log_verbose "Loading secrets..."
        load_secrets 2>/dev/null || true
    fi

    # Export required Terraform variables
    _export_terraform_vars "$code_upper"

    # Apply Terraform
    log_info "Applying Terraform (realm, client, mappers, WebAuthn, ACR-LoA)..."
    if terraform apply \
        -var-file="$tfvars_file" \
        -auto-approve \
        -compact-warnings 2>&1 | grep -vE "^(Acquiring|Releasing|Reading|Planning)" | head -50; then
        log_success "Terraform applied for ${code_upper}"
        return 0
    else
        log_error "Terraform apply failed for ${code_upper}"
        return 1
    fi
}

# =============================================================================
# HUB TERRAFORM APPLY
# =============================================================================
# Applies Terraform configuration for the USA Hub.
# =============================================================================
hub_terraform_apply() {
    log_step "Applying Terraform configuration for Hub (USA)..."

    ensure_dive_root
    cd "${DIVE_ROOT}/terraform/hub" || {
        log_error "Terraform hub directory not found"
        return 1
    }

    # Initialize if needed
    if [ ! -d ".terraform" ]; then
        log_info "Initializing Terraform..."
        terraform init >/dev/null 2>&1 || {
            log_error "Terraform init failed"
            return 1
        }
    fi

    # Load secrets
    load_secrets 2>/dev/null || true

    # Export Terraform variables
    _export_terraform_vars "USA"

    # Apply
    log_info "Applying Terraform (realm, client, mappers, WebAuthn, ACR-LoA)..."
    if terraform apply \
        -var-file="hub.tfvars" \
        -auto-approve \
        -compact-warnings 2>&1 | grep -vE "^(Acquiring|Releasing|Reading|Planning)" | head -50; then
        log_success "Terraform applied for Hub (USA)"
        return 0
    else
        log_error "Terraform apply failed for Hub"
        return 1
    fi
}

# =============================================================================
# HELPER: Export Terraform Variables
# =============================================================================
# Exports environment variables as TF_VAR_* for Terraform to use.
#
# Arguments:
#   $1 - Instance code (e.g., FRA, USA)
# =============================================================================
_export_terraform_vars() {
    local code_upper="${1:?Instance code required}"
    local code_lower=$(echo "$code_upper" | tr '[:upper:]' '[:lower:]')

    # Instance-specific password variable name
    local password_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
    local client_secret_var="KEYCLOAK_CLIENT_SECRET_${code_upper}"

    # Export to Terraform
    export TF_VAR_test_user_password="${!password_var:-${KEYCLOAK_ADMIN_PASSWORD:-admin}}"
    export TF_VAR_client_secret="${!client_secret_var:-${KEYCLOAK_CLIENT_SECRET:-}}"

    # Cross-border client secret
    export TF_VAR_cross_border_client_secret="${CROSS_BORDER_CLIENT_SECRET:-${KEYCLOAK_CLIENT_SECRET:-}}"

    # Local development ports (from NATO database if available)
    if type -t get_country_offset >/dev/null 2>&1; then
        local offset=$(get_country_offset "$code_upper" 2>/dev/null || echo "0")
        export TF_VAR_local_keycloak_port=$((8443 + offset))
        export TF_VAR_local_frontend_port=$((3000 + offset))
    fi

    # WebAuthn RP ID (localhost for local dev)
    export TF_VAR_webauthn_rp_id="${WEBAUTHN_RP_ID:-localhost}"

    log_verbose "Exported TF_VAR_* for ${code_upper}"
}

# =============================================================================
# TERRAFORM STATUS CHECK
# =============================================================================
# Checks if Terraform state exists and is valid for an instance.
#
# Arguments:
#   $1 - Instance code (e.g., FRA)
#
# Returns:
#   0 - Terraform state exists
#   1 - No Terraform state
# =============================================================================
terraform_state_exists() {
    local code="${1:?Instance code required}"
    local code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')

    ensure_dive_root
    local tf_dir="${DIVE_ROOT}/terraform/spoke"

    if [ ! -d "$tf_dir/.terraform" ]; then
        return 1
    fi

    cd "$tf_dir"

    # Check if workspace exists and has state
    if terraform workspace list 2>/dev/null | grep -qE "^\*?\s+${code_lower}$"; then
        terraform workspace select "$code_lower" >/dev/null 2>&1
        local resources=$(terraform state list 2>/dev/null | wc -l)
        if [ "$resources" -gt 0 ]; then
            log_verbose "Terraform state exists for ${code_lower} (${resources} resources)"
            return 0
        fi
    fi

    return 1
}

# =============================================================================
# TERRAFORM DRIFT CHECK
# =============================================================================
# Checks for configuration drift between Terraform and Keycloak.
#
# Arguments:
#   $1 - Instance code (e.g., FRA)
#
# Returns:
#   0 - No drift
#   1 - Drift detected
# =============================================================================
terraform_check_drift() {
    local code="${1:?Instance code required}"
    local code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')

    log_step "Checking for Terraform drift (${code})..."

    ensure_dive_root
    cd "${DIVE_ROOT}/terraform/spoke" || return 1

    terraform workspace select "$code_lower" >/dev/null 2>&1 || return 1

    # Export variables
    _export_terraform_vars "${code^^}"

    # Run plan and check for changes
    local plan_output
    plan_output=$(terraform plan \
        -var-file="../countries/${code_lower}.tfvars" \
        -detailed-exitcode 2>&1)
    local exit_code=$?

    case $exit_code in
        0)
            log_success "No drift detected for ${code}"
            return 0
            ;;
        2)
            log_warn "Drift detected for ${code}"
            echo "$plan_output" | grep -E "^\s+(~|+|-)" | head -20
            return 1
            ;;
        *)
            log_error "Terraform plan failed for ${code}"
            return 1
            ;;
    esac
}

# =============================================================================
# ACR/AMR SSOT FIX (Jan 2026)
# =============================================================================
# Applies the session-based ACR/AMR mapper pattern to all instances.
# This replaces user-attribute-based mappers with session-based mappers.
#
# What it does:
#   1. Removes IdP mappers that store ACR/AMR to user attributes (federatedAcr, federatedAmr)
#   2. Removes protocol mappers that read from user attributes (federated_acr, federated_amr)
#   3. Adds native oidc-amr-mapper to broker clients
#   4. Adds native oidc-acr-mapper and oidc-amr-mapper to incoming federation clients
#
# Files changed:
#   - terraform/modules/federated-instance/idp-brokers.tf (deprecated mappers commented)
#   - terraform/modules/federated-instance/main.tf (deprecated mappers commented)
#   - terraform/modules/federated-instance/acr-amr-session-mappers.tf (new file)
#
# Returns:
#   0 - Success
#   1 - User cancelled or failure
# =============================================================================
terraform_apply_acr_amr_ssot() {
    log_step "🔐 Applying ACR/AMR SSOT Fix (Session-Based Mappers)"
    echo ""
    log_info "This will replace user-attribute-based ACR/AMR mappers with session-based mappers."
    log_info "Changes:"
    echo "  • Remove IdP mappers: acr_mapper, amr_mapper (store to federatedAcr/federatedAmr)"
    echo "  • Remove protocol mappers: federated_acr_mapper, federated_amr_mapper"
    echo "  • Add native oidc-acr-mapper, oidc-amr-mapper to all clients"
    echo ""

    # Confirm with user unless in quiet mode or dry-run
    if [ "$QUIET" != true ] && [ "$DRY_RUN" != true ]; then
        log_warn "This will modify Keycloak ACR/AMR mappers for ALL instances (Hub + Spokes)."
        read -rp "Continue? (yes/no): " confirm
        if [[ "$confirm" != "yes" ]]; then
            log_error "Aborted by user"
            return 1
        fi
        echo ""
    fi

    # Apply to Hub first
    log_step "Step 1: Applying to Hub (USA)..."
    hub_terraform_apply || {
        log_error "Failed to apply Terraform for Hub"
        return 1
    }

    echo ""
    log_step "Step 2: Applying to Spokes..."

    # Get list of spokes from instances directory
    local spoke_instances
    spoke_instances=$(find "${DIVE_ROOT}/instances" -maxdepth 1 -type d ! -name "." ! -name "hub" -exec basename {} \; 2>/dev/null | sort)

    local failed_spokes=()
    for spoke_code in $spoke_instances; do
        if [[ -f "${DIVE_ROOT}/instances/$spoke_code/config.json" ]]; then
            log_info "  → Applying for Spoke: ${spoke_code^^}"
            if spoke_terraform_apply "${spoke_code^^}"; then
                log_success "  ✅ ${spoke_code^^}"
            else
                log_error "  ✗ ${spoke_code^^} FAILED"
                failed_spokes+=("${spoke_code^^}")
            fi
        fi
    done

    echo ""
    if [ ${#failed_spokes[@]} -eq 0 ]; then
        log_success "✅ ACR/AMR SSOT fix applied to all instances"
        echo ""
        log_info "Next steps:"
        echo "  1. Restart all instances:"
        echo "     ./dive hub restart"
        for spoke in $spoke_instances; do
            if [[ -f "${DIVE_ROOT}/instances/$spoke/config.json" ]]; then
                echo "     ./dive --instance $spoke spoke restart"
            fi
        done
        echo "  2. Clear browser cookies"
        echo "  3. Re-authenticate with WebAuthn/OTP"
        echo "  4. Verify ACR/AMR values in session JSON on dashboard"
        return 0
    else
        log_error "Failed to apply to ${#failed_spokes[@]} spoke(s): ${failed_spokes[*]}"
        return 1
    fi
}
