#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Terraform Management Module (Consolidated)
# =============================================================================
# Terraform operations for Keycloak IaC
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - terraform.sh
#   - terraform-apply.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_CONFIGURATION_TERRAFORM_LOADED" ] && return 0
export DIVE_CONFIGURATION_TERRAFORM_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

CONFIG_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$CONFIG_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

TF_HUB_DIR="${DIVE_ROOT}/terraform/hub"
TF_SPOKE_DIR="${DIVE_ROOT}/terraform/spoke"

# =============================================================================
# TERRAFORM CORE FUNCTIONS
# =============================================================================

##
# Check if Terraform is available
##
terraform_check() {
    if ! command -v terraform >/dev/null 2>&1; then
        log_error "Terraform not found"
        log_error "Install Terraform: https://www.terraform.io/downloads"
        return 1
    fi

    log_verbose "Terraform version: $(terraform version -json | jq -r '.terraform_version')"
    return 0
}

##
# Initialize Terraform working directory
#
# Arguments:
#   $1 - Terraform directory
##
terraform_init() {
    local tf_dir="$1"

    if [ ! -d "$tf_dir" ]; then
        log_error "Terraform directory not found: $tf_dir"
        return 1
    fi

    log_info "Initializing Terraform in $tf_dir..."

    cd "$tf_dir"
    
    # ==========================================================================
    # CRITICAL FIX: Non-interactive Terraform init
    # ==========================================================================
    # Clean stale state before init to prevent migration prompts
    # Use -reconfigure to prevent interactive prompts
    # Use -input=false to ensure non-interactive operation
    # ==========================================================================
    rm -rf ".terraform" 2>/dev/null || true
    rm -rf "terraform.tfstate.d" 2>/dev/null || true
    
    terraform init \
        -reconfigure \
        -input=false \
        -upgrade \
        -no-color \
        >/dev/null 2>&1
    local result=$?
    cd - >/dev/null

    if [ $result -eq 0 ]; then
        log_success "Terraform initialized"
    else
        log_error "Terraform init failed"
    fi

    return $result
}

##
# Run Terraform plan
#
# Arguments:
#   $1 - Terraform directory
#   $2 - Var file (optional)
#   $@ - Additional arguments
##
terraform_plan() {
    local tf_dir="$1"
    local var_file="${2:-}"
    shift 2 || true

    terraform_check || return 1

    log_info "Running Terraform plan..."

    cd "$tf_dir"

    local cmd="terraform plan"
    [ -n "$var_file" ] && [ -f "$var_file" ] && cmd="$cmd -var-file=$var_file"

    $cmd "$@"
    local result=$?

    cd - >/dev/null
    return $result
}

##
# Apply Terraform configuration
#
# Arguments:
#   $1 - Terraform directory
#   $2 - Var file (optional)
#   $@ - Additional arguments
##
terraform_apply() {
    local tf_dir="$1"
    local var_file="${2:-}"
    shift 2 || true

    terraform_check || return 1

    log_info "Applying Terraform configuration (this may take 5-10 minutes)..."
    log_info "Progress: Creating Keycloak realm and resources..."

    cd "$tf_dir"

    local cmd="terraform apply -auto-approve -parallelism=20 -compact-warnings -no-color"
    [ -n "$var_file" ] && [ -f "$var_file" ] && cmd="$cmd -var-file=$var_file"

    # Execute with progress monitoring
    log_verbose "Command: $cmd $@"
    
    # Create temp file for output
    local tmp_output=$(mktemp)
    local start_time=$(date +%s)
    
    # ==========================================================================
    # CRITICAL FIX: Add timeout for Terraform apply (600s = 10 minutes)
    # ==========================================================================
    # Terraform can take 5-10 minutes for complex Keycloak configurations
    # Previous timeout was too aggressive, causing partial deployments
    # ==========================================================================
    log_verbose "Starting Terraform apply with 600s timeout..."
    echo -n "Progress: "
    
    # Run Terraform with timeout in background
    if timeout 600 $cmd "$@" > "$tmp_output" 2>&1 & then
        local tf_pid=$!
        
        # Show progress dots while Terraform runs
        while kill -0 $tf_pid 2>/dev/null; do
            echo -n "."
            sleep 2
        done
        
        wait $tf_pid
        local result=$?
        echo ""  # New line after progress dots
        
        if [ $result -eq 0 ]; then
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            log_success "Terraform apply complete in ${duration}s"
            
            # Show summary of changes
            if grep -q "Apply complete" "$tmp_output" 2>/dev/null; then
                grep "Apply complete" "$tmp_output" | head -1
            fi
            
            rm -f "$tmp_output"
            cd - >/dev/null
            return 0
        elif [ $result -eq 124 ]; then
            log_error "Terraform apply timed out after 600s"
            log_error "This may indicate Keycloak is not responding or network issues"
            log_error "Output saved to: $tmp_output"
            cd - >/dev/null
            return 1
        else
            log_error "Terraform apply failed"
            log_error "Output saved to: $tmp_output"
            log_verbose "Recent output:"
            tail -20 "$tmp_output" 2>/dev/null || true
            cd - >/dev/null
            return $result
        fi
    else
        log_error "Failed to start Terraform apply"
        cd - >/dev/null
        return 1
    fi
}

##
# Destroy Terraform resources
#
# Arguments:
#   $1 - Terraform directory
#   $2 - Var file (optional)
##
terraform_destroy() {
    local tf_dir="$1"
    local var_file="${2:-}"

    terraform_check || return 1

    log_warn "Destroying Terraform resources..."

    cd "$tf_dir"

    local cmd="terraform destroy -auto-approve"
    [ -n "$var_file" ] && [ -f "$var_file" ] && cmd="$cmd -var-file=$var_file"

    $cmd
    local result=$?

    cd - >/dev/null
    return $result
}

##
# Get Terraform outputs
#
# Arguments:
#   $1 - Terraform directory
#   $2 - Output name (optional, returns all if not specified)
##
terraform_output() {
    local tf_dir="$1"
    local output_name="${2:-}"

    cd "$tf_dir"

    if [ -n "$output_name" ]; then
        terraform output -raw "$output_name" 2>/dev/null
    else
        terraform output -json 2>/dev/null
    fi

    cd - >/dev/null
}

# =============================================================================
# HUB TERRAFORM FUNCTIONS
# =============================================================================

##
# Apply Hub Terraform configuration
##
terraform_apply_hub() {
    log_info "Applying Hub Terraform configuration..."

    if [ ! -d "$TF_HUB_DIR" ]; then
        log_warn "Hub Terraform directory not found, skipping"
        return 0
    fi

    terraform_init "$TF_HUB_DIR" || return 1
    terraform_apply "$TF_HUB_DIR" "hub.tfvars"
}

##
# Plan Hub Terraform changes
##
terraform_plan_hub() {
    if [ ! -d "$TF_HUB_DIR" ]; then
        log_warn "Hub Terraform directory not found"
        return 0
    fi

    terraform_init "$TF_HUB_DIR" || return 1
    terraform_plan "$TF_HUB_DIR" "hub.tfvars"
}

# =============================================================================
# SPOKE TERRAFORM FUNCTIONS
# =============================================================================

##
# Apply Spoke Terraform configuration
#
# Arguments:
#   $1 - Instance code
##
terraform_apply_spoke() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_info "Applying Spoke Terraform configuration for $code_upper..."

    if [ ! -d "$TF_SPOKE_DIR" ]; then
        log_warn "Spoke Terraform directory not found, skipping"
        return 0
    fi

    terraform_init "$TF_SPOKE_DIR" || return 1
    
    # CRITICAL: Select or create workspace for this spoke instance
    # Each spoke must have its own workspace to maintain separate state
    (
        cd "$TF_SPOKE_DIR"
        
        if terraform workspace list | grep -qw "$code_lower"; then
            log_verbose "Selecting existing workspace: $code_lower"
            terraform workspace select "$code_lower" >/dev/null 2>&1
        else
            log_verbose "Creating new workspace: $code_lower"
            terraform workspace new "$code_lower" >/dev/null 2>&1
        fi
        
        # Verify we're on the correct workspace
        local current_workspace
        current_workspace=$(terraform workspace show)
        if [ "$current_workspace" != "$code_lower" ]; then
            log_error "CRITICAL: Terraform workspace mismatch!"
            log_error "Expected: $code_lower, Current: $current_workspace"
            return 1
        fi
        
        log_verbose "Terraform workspace: $current_workspace"
    ) || return 1
    
    # Instance code must be uppercase per ISO 3166-1 alpha-3 validation
    # Spoke tfvars are in terraform/countries/<code>.tfvars (not terraform/spoke/spoke.tfvars)
    local tfvars_file="${DIVE_ROOT}/terraform/countries/${code_lower}.tfvars"
    
    if [ ! -f "$tfvars_file" ]; then
        log_error "Country tfvars file not found: $tfvars_file"
        log_error "Spoke Terraform requires country-specific configuration"
        return 1
    fi
    
    log_verbose "Using tfvars: $tfvars_file"
    terraform_apply "$TF_SPOKE_DIR" "$tfvars_file" -var="instance_code=${code_upper}"
}

##
# Plan Spoke Terraform changes
#
# Arguments:
#   $1 - Instance code
##
terraform_plan_spoke() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    if [ ! -d "$TF_SPOKE_DIR" ]; then
        log_warn "Spoke Terraform directory not found"
        return 0
    fi

    terraform_init "$TF_SPOKE_DIR" || return 1
    
    # Spoke tfvars are in terraform/countries/<code>.tfvars
    local tfvars_file="${DIVE_ROOT}/terraform/countries/${code_lower}.tfvars"
    
    if [ ! -f "$tfvars_file" ]; then
        log_error "Country tfvars file not found: $tfvars_file"
        return 1
    fi
    
    # Instance code must be uppercase per ISO 3166-1 alpha-3 validation
    terraform_plan "$TF_SPOKE_DIR" "$tfvars_file" -var="instance_code=${code_upper}"
}

# =============================================================================
# BACKWARD COMPATIBILITY WRAPPER
# =============================================================================

##
# Spoke Terraform wrapper (for backward compatibility)
# Called as: terraform_spoke init|apply|plan <CODE>
#
# Arguments:
#   $1 - Action (init|apply|plan)
#   $2 - Instance code
##
terraform_spoke() {
    local action="${1:-help}"
    local instance_code="${2:-}"
    local code_upper=$(upper "$instance_code")

    case "$action" in
        init)
            if [ ! -d "$TF_SPOKE_DIR" ]; then
                log_warn "Spoke Terraform directory not found, skipping"
                return 0
            fi
            terraform_init "$TF_SPOKE_DIR"
            ;;
        apply)
            terraform_apply_spoke "$code_upper"
            ;;
        plan)
            terraform_plan_spoke "$code_upper"
            ;;
        *)
            log_error "Unknown terraform_spoke action: $action"
            return 1
            ;;
    esac
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

##
# Terraform module command dispatcher
##
module_terraform() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        init)
            local target="${1:-hub}"
            if [ "$target" = "hub" ]; then
                terraform_init "$TF_HUB_DIR"
            else
                terraform_init "$TF_SPOKE_DIR"
            fi
            ;;
        plan)
            local target="${1:-hub}"
            if [ "$target" = "hub" ]; then
                terraform_plan_hub
            else
                terraform_plan_spoke "$target"
            fi
            ;;
        apply)
            local target="${1:-hub}"
            if [ "$target" = "hub" ]; then
                terraform_apply_hub
            else
                terraform_apply_spoke "$target"
            fi
            ;;
        destroy)
            local target="${1:-hub}"
            local tf_dir="$TF_HUB_DIR"
            local var_file="hub.tfvars"

            if [ "$target" != "hub" ]; then
                tf_dir="$TF_SPOKE_DIR"
                var_file="spoke.tfvars"
            fi

            terraform_destroy "$tf_dir" "$var_file"
            ;;
        output)
            local target="${1:-hub}"
            local tf_dir="$TF_HUB_DIR"
            [ "$target" != "hub" ] && tf_dir="$TF_SPOKE_DIR"
            terraform_output "$tf_dir" "${2:-}"
            ;;
        help|*)
            echo "Usage: ./dive tf <command> [target] [args]"
            echo ""
            echo "Commands:"
            echo "  init <target>       Initialize Terraform"
            echo "  plan <target>       Show Terraform plan"
            echo "  apply <target>      Apply Terraform configuration"
            echo "  destroy <target>    Destroy Terraform resources"
            echo "  output <target>     Show Terraform outputs"
            echo ""
            echo "Targets:"
            echo "  hub                 Hub Terraform (default)"
            echo "  <CODE>              Spoke Terraform (e.g., ALB, FRA)"
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f terraform_check
export -f terraform_init
export -f terraform_plan
export -f terraform_apply
export -f terraform_destroy
export -f terraform_output
export -f terraform_apply_hub
export -f terraform_plan_hub
export -f terraform_apply_spoke
export -f terraform_plan_spoke
export -f terraform_spoke
export -f module_terraform

log_verbose "Terraform module loaded"
