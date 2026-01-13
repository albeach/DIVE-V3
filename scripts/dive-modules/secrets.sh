#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Secrets Management Module (GCP Single Source of Truth)
# =============================================================================
# GCP Secret Manager is the authoritative source for ALL secrets.
# .env files contain configuration references, not secrets.
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CLEAN GCP SINGLE SOURCE OF TRUTH COMMANDS
# =============================================================================

secrets_create() {
    local instance="${1:-$INSTANCE}"
    [ -z "$instance" ] && instance="usa"
    ensure_gcp_secrets_exist "$instance"
}

secrets_list() {
    local instance="${1:-$INSTANCE}"
    [ -z "$instance" ] && instance="usa"

    echo -e "${CYAN}GCP Secrets Status for $(upper "$instance"):${NC}"
    echo ""

    local inst_lc
    inst_lc=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    local project="${GCP_PROJECT:-dive25}"

    # Check required secrets
    local secrets=(
        "dive-v3-postgres-${inst_lc}:PostgreSQL password"
        "dive-v3-keycloak-${inst_lc}:Keycloak admin password"
        "dive-v3-mongodb-${inst_lc}:MongoDB root password"
        "dive-v3-auth-secret-${inst_lc}:JWT/Auth secret"
        "dive-v3-keycloak-client-secret:Shared client secret"
        "dive-v3-redis-blacklist:Redis blacklist password"
    )

    for secret_info in "${secrets[@]}"; do
        local secret_name
        secret_name=$(echo "$secret_info" | cut -d: -f1)
        local description
        description=$(echo "$secret_info" | cut -d: -f2)

        if gcloud secrets versions access latest --secret="$secret_name" --project="$project" >/dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $secret_name - $description"
        else
            echo -e "  ${RED}✗${NC} $secret_name - $description ${YELLOW}(MISSING)${NC}"
        fi
    done

    echo ""
    echo -e "${CYAN}Note:${NC} GCP Secret Manager is the single source of truth."
    echo -e "      Secrets are loaded at runtime - never stored in .env files."
}

secrets_verify() {
    local instance="${1:-$INSTANCE}"
    [ -z "$instance" ] && instance="usa"

    echo -e "${CYAN}Verifying GCP secrets access for $(upper "$instance")...${NC}"

    if ! load_gcp_secrets "$instance" >/dev/null 2>&1; then
        echo -e "  ${RED}✗ Failed to load secrets from GCP${NC}"
        return 1
    fi

    local missing=0
    local vars=("POSTGRES_PASSWORD" "KEYCLOAK_ADMIN_PASSWORD" "MONGO_PASSWORD" "AUTH_SECRET" "KEYCLOAK_CLIENT_SECRET")

    for var in "${vars[@]}"; do
        if [ -n "${!var}" ]; then
            echo -e "  ${GREEN}✓${NC} $var loaded (length: ${#var})"
        else
            echo -e "  ${RED}✗${NC} $var missing"
            ((missing++))
        fi
    done

    if [ $missing -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✓ All secrets successfully loaded from GCP${NC}"
        return 0
    else
        echo ""
        echo -e "${RED}✗ $missing secrets missing or inaccessible${NC}"
        return 1
    fi
}

# =============================================================================
# MODULE DISPATCH - CLEAN GCP SINGLE SOURCE OF TRUTH
# =============================================================================

module_secrets() {
    local action="${1:-list}"
    shift || true

    case "$action" in
        create|generate)
            secrets_create "$@" ;;
        list|status)
            secrets_list "$@" ;;
        verify|check)
            secrets_verify "$@" ;;
        *)
            echo -e "${BOLD}DIVE Secrets Management (GCP Single Source of Truth):${NC}"
            echo ""
            echo -e "${CYAN}Commands:${NC}"
            echo "  create <instance>    Generate missing GCP secrets for instance"
            echo "  list <instance>      Check GCP secret status for instance"
            echo "  verify <instance>    Verify GCP secrets can be loaded"
            echo ""
            echo -e "${CYAN}Architecture:${NC}"
            echo "  • GCP Secret Manager is the single source of truth"
            echo "  • Secrets are generated once and stored in GCP"
            echo "  • Applications load secrets from GCP at runtime"
            echo "  • .env files contain configuration, not secrets"
            echo "  • No local secret storage or fallbacks"
            echo ""
            echo -e "${BOLD}Examples:${NC}"
            echo "  ./dive secrets create NZL    # Generate NZL secrets in GCP"
            echo "  ./dive secrets list USA      # Check USA secret status"
            echo "  ./dive secrets verify FRA    # Verify FRA secrets accessible"
            echo ""
            echo -e "${YELLOW}Security:${NC} Secrets are never displayed - only status is shown"
            ;;
    esac
}