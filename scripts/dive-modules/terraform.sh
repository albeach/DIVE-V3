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
# TERRAFORM WORKSPACE COMMANDS
# =============================================================================

terraform_workspace() {
    local subcommand="${1:-list}"
    local code="${2:-}"
    
    ensure_dive_root
    cd "${DIVE_ROOT}/terraform/spoke"
    
    # Ensure terraform is initialized (force reinit if .terraform exists but is stale)
    if [ ! -d ".terraform" ] || [ ! -f ".terraform/terraform.tfstate" ]; then
        log_info "Initializing Terraform..."
        rm -rf .terraform 2>/dev/null
        terraform init >/dev/null 2>&1
    fi
    
    case "$subcommand" in
        list)
            log_step "Listing Terraform workspaces..."
            terraform workspace list
            ;;
        new)
            if [ -z "$code" ]; then
                log_error "Country code required: ./dive tf workspace new <CODE>"
                return 1
            fi
            code="${code,,}"  # lowercase
            log_step "Creating workspace: $code"
            terraform workspace new "$code"
            ;;
        select)
            if [ -z "$code" ]; then
                log_error "Country code required: ./dive tf workspace select <CODE>"
                return 1
            fi
            code="${code,,}"  # lowercase
            log_step "Selecting workspace: $code"
            terraform workspace select "$code"
            ;;
        delete)
            if [ -z "$code" ]; then
                log_error "Country code required: ./dive tf workspace delete <CODE>"
                return 1
            fi
            code="${code,,}"  # lowercase
            log_step "Deleting workspace: $code"
            terraform workspace select default
            terraform workspace delete "$code"
            ;;
        show)
            terraform workspace show
            ;;
        *)
            echo "Workspace commands: list, new <CODE>, select <CODE>, delete <CODE>, show"
            return 1
            ;;
    esac
}

# =============================================================================
# TERRAFORM SPOKE COMMANDS
# =============================================================================

terraform_spoke() {
    local action="${1:-}"
    local code="${2:-}"
    
    if [ -z "$action" ] || [ -z "$code" ]; then
        echo "Usage: ./dive tf spoke <init|plan|apply|destroy> <CODE>"
        echo ""
        echo "Examples:"
        echo "  ./dive tf spoke init POL      Initialize Poland spoke"
        echo "  ./dive tf spoke plan POL      Plan Poland deployment"
        echo "  ./dive tf spoke apply POL     Apply Poland configuration"
        echo "  ./dive tf spoke destroy POL   Destroy Poland resources"
        return 1
    fi
    
    local code_upper="${code^^}"
    local code_lower="${code,,}"
    local tfvars_file="${DIVE_ROOT}/terraform/countries/${code_lower}.tfvars"
    
    ensure_dive_root
    
    # Check if tfvars exists
    if [ ! -f "$tfvars_file" ]; then
        log_warning "tfvars not found: $tfvars_file"
        log_info "Generating tfvars for $code_upper..."
        terraform_generate "$code_upper"
        
        if [ ! -f "$tfvars_file" ]; then
            log_error "Failed to generate tfvars for $code_upper"
            return 1
        fi
    fi
    
    cd "${DIVE_ROOT}/terraform/spoke"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "cd ${DIVE_ROOT}/terraform/spoke"
        log_dry "terraform workspace select $code_lower (or create)"
        log_dry "terraform $action -var-file=../countries/${code_lower}.tfvars"
        return 0
    fi
    
    case "$action" in
        init)
            log_step "Initializing spoke for $code_upper..."
            terraform init -backend=false
            
            # Create or select workspace
            if terraform workspace list | grep -q "^  ${code_lower}$\|^\* ${code_lower}$"; then
                log_info "Selecting existing workspace: $code_lower"
                terraform workspace select "$code_lower"
            else
                log_info "Creating new workspace: $code_lower"
                terraform workspace new "$code_lower"
            fi
            log_success "Spoke $code_upper initialized"
            ;;
        plan)
            terraform workspace select "$code_lower" 2>/dev/null || terraform workspace new "$code_lower"
            log_step "Planning spoke $code_upper..."
            load_secrets
            terraform plan -var-file="../countries/${code_lower}.tfvars"
            ;;
        apply)
            terraform workspace select "$code_lower" 2>/dev/null || terraform workspace new "$code_lower"
            log_step "Applying spoke $code_upper..."
            load_secrets
            terraform apply -var-file="../countries/${code_lower}.tfvars" -auto-approve
            ;;
        destroy)
            terraform workspace select "$code_lower" 2>/dev/null || {
                log_error "Workspace $code_lower does not exist"
                return 1
            }
            log_step "Destroying spoke $code_upper..."
            load_secrets
            terraform destroy -var-file="../countries/${code_lower}.tfvars" -auto-approve
            ;;
        *)
            log_error "Unknown action: $action"
            echo "Valid actions: init, plan, apply, destroy"
            return 1
            ;;
    esac
}

# =============================================================================
# TERRAFORM VALIDATE & FORMAT
# =============================================================================

terraform_validate() {
    ensure_dive_root
    
    log_step "Validating Terraform configurations..."
    
    local errors=0
    
    for dir in pilot spoke; do
        local full_path="${DIVE_ROOT}/terraform/${dir}"
        if [ -d "$full_path" ]; then
            cd "$full_path"
            
            # Initialize if needed
            if [ ! -d ".terraform" ]; then
                terraform init -backend=false >/dev/null 2>&1
            fi
            
            if terraform validate >/dev/null 2>&1; then
                echo "  ✓ $dir: valid"
            else
                echo "  ✗ $dir: INVALID"
                terraform validate
                errors=$((errors + 1))
            fi
        fi
    done
    
    if [ "$errors" -eq 0 ]; then
        log_success "All configurations valid"
    else
        log_error "$errors configuration(s) have errors"
        return 1
    fi
}

terraform_fmt() {
    ensure_dive_root
    
    log_step "Formatting Terraform files..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "terraform fmt -recursive -check ${DIVE_ROOT}/terraform"
        return 0
    fi
    
    local check_only="${1:-}"
    
    if [ "$check_only" = "--check" ]; then
        terraform fmt -recursive -check "${DIVE_ROOT}/terraform"
    else
        terraform fmt -recursive "${DIVE_ROOT}/terraform"
        log_success "Terraform files formatted"
    fi
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
        workspace|ws)
            terraform_workspace "$@"
            ;;
        spoke)
            terraform_spoke "$@"
            ;;
        validate)
            terraform_validate
            ;;
        fmt|format)
            terraform_fmt "$@"
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
    echo "  plan [dir]              Show Terraform plan"
    echo "  apply [dir]             Apply Terraform configuration"
    echo "  destroy [dir]           Destroy Terraform resources"
    echo "  output [dir]            Show Terraform outputs"
    echo "  init [dir]              Initialize Terraform"
    echo "  validate                Validate all configurations"
    echo "  fmt                     Format all Terraform files"
    echo ""
    echo -e "${CYAN}NATO Country tfvars Generation:${NC}"
    echo "  generate <CODE>         Generate tfvars for a NATO country"
    echo "  generate --all          Generate tfvars for all 32 NATO countries"
    echo "  list-countries          List generated tfvars files"
    echo ""
    echo -e "${CYAN}Workspace Management:${NC}"
    echo "  workspace list          List all workspaces"
    echo "  workspace new <CODE>    Create workspace for a country"
    echo "  workspace select <CODE> Select workspace"
    echo "  workspace delete <CODE> Delete workspace"
    echo "  workspace show          Show current workspace"
    echo ""
    echo -e "${CYAN}Spoke Deployment:${NC}"
    echo "  spoke init <CODE>       Initialize spoke for a country"
    echo "  spoke plan <CODE>       Plan spoke deployment"
    echo "  spoke apply <CODE>      Apply spoke configuration"
    echo "  spoke destroy <CODE>    Destroy spoke resources"
    echo ""
    echo -e "${CYAN}Directories:${NC}"
    echo "  pilot                   Pilot VM configuration (USA hub)"
    echo "  spoke                   Spoke deployment (NATO countries)"
    echo "  countries/              Per-country tfvars files"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  ./dive tf generate POL              Generate Poland tfvars"
    echo "  ./dive tf generate --all            Generate all 32 tfvars"
    echo "  ./dive tf plan pilot                Plan pilot deployment"
    echo "  ./dive tf apply pilot               Apply pilot configuration"
    echo ""
    echo "  ./dive tf spoke init POL            Initialize Poland spoke"
    echo "  ./dive tf spoke plan POL            Plan Poland deployment"
    echo "  ./dive tf spoke apply POL           Apply Poland configuration"
    echo ""
    echo "  ./dive tf workspace list            List all workspaces"
    echo "  ./dive tf workspace new fra         Create France workspace"
    echo ""
    echo "  ./dive tf validate                  Validate all configs"
    echo "  ./dive tf fmt                       Format all Terraform files"
    echo ""
}
