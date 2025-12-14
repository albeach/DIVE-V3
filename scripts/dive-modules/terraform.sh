#!/usr/local/bin/bash
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
# TFVARS GENERATION
# =============================================================================

terraform_generate() {
    local code="${1:-}"
    local force="${2:-}"
    
    ensure_dive_root
    
    local script="${DIVE_ROOT}/scripts/generate-country-tfvars.sh"
    
    if [ ! -f "$script" ]; then
        log_error "Tfvars generator script not found: $script"
        return 1
    fi
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would generate tfvars for: $code $force"
        return 0
    fi
    
    # Build arguments
    local args=""
    if [ "$code" = "--all" ] || [ "$code" = "-a" ]; then
        args="--all"
    elif [ -n "$code" ]; then
        args="$code"
    else
        # Default to current instance
        args="${INSTANCE:-USA}"
    fi
    
    if [ "$force" = "--force" ] || [ "$force" = "-f" ]; then
        args="$args --force"
    fi
    
    # Run the tfvars generator
    "$script" $args
}

terraform_list_countries() {
    ensure_dive_root
    
    local tfvars_dir="${DIVE_ROOT}/terraform/countries"
    
    print_header
    echo -e "${BOLD}Generated Terraform Variable Files${NC}"
    echo ""
    
    if [ ! -d "$tfvars_dir" ] || [ -z "$(ls -A "$tfvars_dir" 2>/dev/null)" ]; then
        echo "No tfvars files found."
        echo ""
        echo "Generate with: ./dive tf generate --all"
        return 0
    fi
    
    local count=0
    for f in "$tfvars_dir"/*.tfvars; do
        if [ -f "$f" ]; then
            local basename=$(basename "$f" .tfvars)
            local code="${basename^^}"
            echo "  ✓ $code: $f"
            count=$((count + 1))
        fi
    done
    
    echo ""
    echo "Total: $count tfvars files"
    echo ""
    echo "Usage: terraform plan -var-file=countries/<code>.tfvars"
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
        generate|gen)
            terraform_generate "$@"
            ;;
        list-countries|countries)
            terraform_list_countries
            ;;
        *)
            module_terraform_help
            ;;
    esac
}

module_terraform_help() {
    print_header
    echo -e "${BOLD}Terraform Commands:${NC}"
    echo ""
    echo -e "${CYAN}Core Operations:${NC}"
    echo "  plan [dir]          Show Terraform plan"
    echo "  apply [dir]         Apply Terraform configuration"
    echo "  destroy [dir]       Destroy Terraform resources"
    echo "  output [dir]        Show Terraform outputs"
    echo "  init [dir]          Initialize Terraform"
    echo ""
    echo -e "${CYAN}NATO Country tfvars Generation:${NC}"
    echo "  generate <CODE>     Generate tfvars for a NATO country"
    echo "  generate --all      Generate tfvars for all 32 NATO countries"
    echo "  list-countries      List generated tfvars files"
    echo ""
    echo -e "${CYAN}Directories:${NC}"
    echo "  pilot               Pilot VM configuration"
    echo "  countries           Per-country tfvars files"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  ./dive tf generate POL              Generate Poland tfvars"
    echo "  ./dive tf generate --all            Generate all 32 tfvars"
    echo "  ./dive tf plan pilot                Plan pilot deployment"
    echo "  ./dive tf apply pilot               Apply pilot configuration"
    echo ""
}










