#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Secrets Management Module
# =============================================================================
# Commands: load, show, list, verify, export
# Manages GCP Secret Manager integration
# =============================================================================

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
    local instance="${1:-$INSTANCE}"
    # Export secrets as env vars to stdout (for piping)
    load_gcp_secrets "$instance" >/dev/null 2>&1
    echo "export POSTGRES_PASSWORD='$POSTGRES_PASSWORD'"
    echo "export KEYCLOAK_ADMIN_PASSWORD='$KEYCLOAK_ADMIN_PASSWORD'"
    echo "export MONGO_PASSWORD='$MONGO_PASSWORD'"
    echo "export AUTH_SECRET='$AUTH_SECRET'"
    echo "export KEYCLOAK_CLIENT_SECRET='$KEYCLOAK_CLIENT_SECRET'"
    echo "export JWT_SECRET='$JWT_SECRET'"
    echo "export NEXTAUTH_SECRET='$NEXTAUTH_SECRET'"
    echo "export TF_VAR_keycloak_admin_password='$KEYCLOAK_ADMIN_PASSWORD'"
    echo "export TF_VAR_client_secret='$KEYCLOAK_CLIENT_SECRET'"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_secrets() {
    local action="${1:-show}"
    shift || true
    
    case "$action" in
        load)   secrets_load "$@" ;;
        show)   secrets_show "$@" ;;
        list)   secrets_list ;;
        verify) secrets_verify "$@" ;;
        export) secrets_export "$@" ;;
        *)      module_secrets_help ;;
    esac
}

module_secrets_help() {
    echo -e "${BOLD}Secrets Commands:${NC}"
    echo "  load [instance]     Load secrets into environment"
    echo "  show [instance]     Show secrets for instance"
    echo "  list                List all DIVE secrets in GCP"
    echo "  verify [instance]   Verify secrets can be accessed"
    echo "  export [instance]   Export secrets as shell commands"
    echo ""
    echo "Usage: ./dive secrets [load|show|list|verify|export] [instance]"
}






