#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Secrets Management Module
# =============================================================================
# Commands: load, show, list, verify, export
# Manages GCP Secret Manager integration
# =============================================================================

# shellcheck source=common.sh disable=SC1091
# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# SECRETS COMMANDS
# =============================================================================

secrets_load() {
    local instance="${1:-$INSTANCE}"
    load_gcp_secrets "$instance"
    log_success "Secrets loaded into environment"
}

secrets_show() {
    local instance="${1:-$INSTANCE}"
    echo -e "${CYAN}Secrets for $(upper "$instance"):${NC}"
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query: gcloud secrets list --project=$GCP_PROJECT"
    else
        gcloud secrets list --project="$GCP_PROJECT" --filter="name:dive-v3" --format="table(name,createTime)" | grep -i "$instance" || echo "No instance-specific secrets found"
    fi
}

secrets_list() {
    echo -e "${CYAN}All DIVE V3 secrets in GCP:${NC}"
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would query: gcloud secrets list --project=$GCP_PROJECT"
    else
        gcloud secrets list --project="$GCP_PROJECT" --filter="name:dive-v3" --format="table(name,createTime)"
    fi
}

secrets_verify() {
    local instance="${1:-$INSTANCE}"
    echo -e "${CYAN}Verifying secrets can be accessed...${NC}"
    load_gcp_secrets "$instance"
    echo ""
    echo -e "  POSTGRES_PASSWORD:        $([ -n "$POSTGRES_PASSWORD" ] && echo -e "${GREEN}✓ loaded${NC}" || echo -e "${RED}✗ missing${NC}")"
    echo -e "  KEYCLOAK_ADMIN_PASSWORD:  $([ -n "$KEYCLOAK_ADMIN_PASSWORD" ] && echo -e "${GREEN}✓ loaded${NC}" || echo -e "${RED}✗ missing${NC}")"
    echo -e "  MONGO_PASSWORD:           $([ -n "$MONGO_PASSWORD" ] && echo -e "${GREEN}✓ loaded${NC}" || echo -e "${RED}✗ missing${NC}")"
    echo -e "  AUTH_SECRET:              $([ -n "$AUTH_SECRET" ] && echo -e "${GREEN}✓ loaded${NC}" || echo -e "${RED}✗ missing${NC}")"
    echo -e "  KEYCLOAK_CLIENT_SECRET:   $([ -n "$KEYCLOAK_CLIENT_SECRET" ] && echo -e "${GREEN}✓ loaded${NC}" || echo -e "${RED}✗ missing${NC}")"
    echo -e "  JWT_SECRET:               $([ -n "$JWT_SECRET" ] && echo -e "${GREEN}✓ loaded${NC}" || echo -e "${RED}✗ missing${NC}")"
    echo -e "  NEXTAUTH_SECRET:          $([ -n "$NEXTAUTH_SECRET" ] && echo -e "${GREEN}✓ loaded${NC}" || echo -e "${RED}✗ missing${NC}")"
}

secrets_export() {
    local unsafe=false
    if [ "${1:-}" = "--unsafe" ]; then
        unsafe=true
        shift
    fi

    local instance="${1:-$INSTANCE}"
    # Export secrets as env vars to stdout (for piping)
    load_gcp_secrets "$instance" >/dev/null 2>&1

    redact() {
        local value="$1"
        if [ "$unsafe" = true ]; then
            echo "$value"
        else
            echo "<redacted>"
        fi
    }

    echo "export POSTGRES_PASSWORD='$(redact "$POSTGRES_PASSWORD")'"
    echo "export KEYCLOAK_ADMIN_PASSWORD='$(redact "$KEYCLOAK_ADMIN_PASSWORD")'"
    echo "export MONGO_PASSWORD='$(redact "$MONGO_PASSWORD")'"
    echo "export AUTH_SECRET='$(redact "$AUTH_SECRET")'"
    echo "export KEYCLOAK_CLIENT_SECRET='$(redact "$KEYCLOAK_CLIENT_SECRET")'"
    echo "export JWT_SECRET='$(redact "$JWT_SECRET")'"
    echo "export NEXTAUTH_SECRET='$(redact "$NEXTAUTH_SECRET")'"
    echo "export TF_VAR_keycloak_admin_password='$(redact "$KEYCLOAK_ADMIN_PASSWORD")'"
    echo "export TF_VAR_client_secret='$(redact "$KEYCLOAK_CLIENT_SECRET")'"

    if [ "$unsafe" != true ]; then
        log_warn "Secrets redacted. Re-run with --unsafe to print raw values."
    fi
}

secrets_lint() {
    local verbose=""
    local fix=""
    
    # Parse options
    while [[ $# -gt 0 ]]; do
        case $1 in
            --verbose|-v) verbose="--verbose" ;;
            --fix) fix="--fix" ;;
            --ci) verbose="--ci" ;;
            *) ;;
        esac
        shift
    done
    
    echo -e "${CYAN}Running secret lint scan...${NC}"
    
    local script_path
    script_path="$(dirname "${BASH_SOURCE[0]}")/../lint-secrets.sh"
    
    if [ ! -x "$script_path" ]; then
        log_error "Lint script not found: $script_path"
        return 1
    fi
    
    # Run lint script
    "$script_path" $verbose $fix
    return $?
}

secrets_verify_all() {
    echo -e "${CYAN}Verifying secrets for all instances...${NC}"
    echo ""
    
    local instances=("usa" "gbr" "fra" "deu" "dnk" "pol" "nor" "esp" "ita" "bel" "alb")
    local failed=0
    local passed=0
    
    for inst in "${instances[@]}"; do
        local inst_uc
        inst_uc=$(echo "$inst" | tr '[:lower:]' '[:upper:]')
        
        echo -e "${CYAN}Checking $inst_uc...${NC}"
        
        # Try to fetch required secrets
        local missing=0
        local secrets=("postgres-$inst" "mongodb-$inst" "keycloak-$inst")
        
        for secret in "${secrets[@]}"; do
            if ! gcloud secrets versions access latest --secret="dive-v3-$secret" --project="$GCP_PROJECT" >/dev/null 2>&1; then
                echo -e "  ${RED}✗${NC} dive-v3-$secret"
                ((missing++))
            else
                echo -e "  ${GREEN}✓${NC} dive-v3-$secret"
            fi
        done
        
        if [ $missing -eq 0 ]; then
            ((passed++))
        else
            ((failed++))
        fi
    done
    
    echo ""
    echo -e "${CYAN}Summary:${NC} ${GREEN}$passed passed${NC}, ${RED}$failed failed${NC}"
    
    [ $failed -eq 0 ]
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_secrets() {
    local action="${1:-show}"
    shift || true
    
    case "$action" in
        load)       secrets_load "$@" ;;
        show)       secrets_show "$@" ;;
        list)       secrets_list ;;
        verify)     secrets_verify "$@" ;;
        verify-all) secrets_verify_all ;;
        export)     secrets_export "$@" ;;
        lint)       secrets_lint "$@" ;;
        *)          module_secrets_help ;;
    esac
}

module_secrets_help() {
    echo -e "${BOLD}Secrets Commands:${NC}"
    echo "  load [instance]        Load secrets into environment"
    echo "  show [instance]        Show secrets for instance"
    echo "  list                   List all DIVE secrets in GCP"
    echo "  verify [instance]      Verify secrets can be accessed"
    echo "  verify-all             Verify secrets for all instances"
    echo "  export [--unsafe] [instance]  Export secrets as shell commands"
    echo "  lint [--verbose|--fix] Lint codebase for hardcoded secrets"
    echo ""
    echo "Usage: ./dive secrets [load|show|list|verify|verify-all|export|lint] [options]"
}
