#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Terraform Commands Module
# =============================================================================
# Commands: plan, apply, destroy, output
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# TERRAFORM COMMANDS
# =============================================================================

terraform_run() {
    local action="${1:-plan}"
    local tf_dir="${2:-pilot}"
    
    log_step "Running Terraform $action ($tf_dir)..."
    
    load_secrets
    
    ensure_dive_root
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "cd ${DIVE_ROOT}/terraform/$tf_dir"
        log_dry "terraform init (if needed)"
        log_dry "terraform $action -var-file=$INSTANCE.tfvars"
        return 0
    fi
    
    cd "${DIVE_ROOT}/terraform/${tf_dir}"
    
    if [ ! -d ".terraform" ]; then
        log_info "Initializing Terraform..."
        terraform init
    fi
    
    case "$action" in
        plan)
            terraform plan -var-file="${INSTANCE}.tfvars"
            ;;
        apply)
            terraform apply -var-file="${INSTANCE}.tfvars" -auto-approve
            ;;
        destroy)
            terraform destroy -var-file="${INSTANCE}.tfvars" -auto-approve
            ;;
        output)
            terraform output
            ;;
        *)
            echo "Usage: ./dive tf [plan|apply|destroy|output] [dir]"
            return 1
            ;;
    esac
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_terraform() {
    local action="${1:-plan}"
    shift || true
    
    case "$action" in
        plan|apply|destroy|output)
            terraform_run "$action" "$@"
            ;;
        init)
            local tf_dir="${1:-pilot}"
            ensure_dive_root
            cd "${DIVE_ROOT}/terraform/${tf_dir}"
            terraform init
            ;;
        *)
            module_terraform_help
            ;;
    esac
}

module_terraform_help() {
    echo -e "${BOLD}Terraform Commands:${NC}"
    echo "  plan [dir]      Show Terraform plan"
    echo "  apply [dir]     Apply Terraform configuration"
    echo "  destroy [dir]   Destroy Terraform resources"
    echo "  output [dir]    Show Terraform outputs"
    echo "  init [dir]      Initialize Terraform"
    echo ""
    echo "Directories: pilot, instances"
}










