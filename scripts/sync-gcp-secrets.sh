#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 - GCP Secret Manager Sync Script
# =============================================================================
# Creates and manages GCP secrets for NATO country deployments.
# Uses dive25 project with naming convention: dive-v3-<type>-<code>
#
# Usage:
#   ./scripts/sync-gcp-secrets.sh create <COUNTRY_CODE>   # Create secrets for country
#   ./scripts/sync-gcp-secrets.sh list [COUNTRY_CODE]     # List secrets
#   ./scripts/sync-gcp-secrets.sh load <COUNTRY_CODE>     # Export secrets as env vars
#   ./scripts/sync-gcp-secrets.sh --all                   # Create for all NATO countries
#
# Secret Types:
#   - dive-v3-keycloak-<code>      : Keycloak admin password
#   - dive-v3-mongodb-<code>       : MongoDB root password
#   - dive-v3-postgres-<code>      : PostgreSQL password
#   - dive-v3-auth-secret-<code>   : NextAuth secret
#   - dive-v3-federation-usa-<code>: Federation secret from USA to spoke
#   - dive-v3-federation-<code>-usa: Federation secret from spoke to USA
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load NATO countries database
source "$SCRIPT_DIR/nato-countries.sh"

# GCP Configuration
GCP_PROJECT="${GCP_PROJECT_ID:-dive25}"
SECRET_PREFIX="dive-v3"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Helper functions
log_info() { echo -e "${CYAN}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# Generate secure password
generate_password() {
    openssl rand -base64 24 | tr -d '/+=' | head -c 24
}

# Check if secret exists
secret_exists() {
    local name="$1"
    gcloud secrets describe "$name" --project="$GCP_PROJECT" >/dev/null 2>&1
}

# Create a secret with generated password
create_secret() {
    local name="$1"
    local description="$2"
    
    if secret_exists "$name"; then
        log_info "Secret exists: $name"
        return 0
    fi
    
    local password=$(generate_password)
    
    # Create secret
    gcloud secrets create "$name" \
        --project="$GCP_PROJECT" \
        --labels="app=dive-v3,managed-by=sync-script" \
        2>/dev/null
    
    # Add initial value
    echo -n "$password" | gcloud secrets versions add "$name" \
        --project="$GCP_PROJECT" \
        --data-file=- \
        2>/dev/null
    
    log_success "Created: $name"
}

# Create all secrets for a country
create_country_secrets() {
    local code="$1"
    local code_lower="${code,,}"
    local name=$(get_country_name "$code")
    local flag=$(get_country_flag "$code")
    
    echo ""
    echo -e "${BOLD}Creating secrets for $name ($code) $flag${NC}"
    echo ""
    
    # Core secrets
    create_secret "${SECRET_PREFIX}-keycloak-${code_lower}" "Keycloak admin password for $name"
    create_secret "${SECRET_PREFIX}-mongodb-${code_lower}" "MongoDB root password for $name"
    create_secret "${SECRET_PREFIX}-postgres-${code_lower}" "PostgreSQL password for $name"
    create_secret "${SECRET_PREFIX}-auth-secret-${code_lower}" "NextAuth secret for $name"
    
    # Federation secrets (bidirectional with USA hub)
    if [[ "$code" != "USA" ]]; then
        create_secret "${SECRET_PREFIX}-federation-usa-${code_lower}" "Federation: USA → $name"
        create_secret "${SECRET_PREFIX}-federation-${code_lower}-usa" "Federation: $name → USA"
    fi
    
    log_success "All secrets created for $name"
}

# List secrets for a country or all
list_secrets() {
    local filter="name:${SECRET_PREFIX}"
    
    if [[ -n "$1" ]]; then
        local code_lower="${1,,}"
        filter="name:${SECRET_PREFIX}-*-${code_lower} OR name:${SECRET_PREFIX}-*-${code_lower}-*"
    fi
    
    echo ""
    echo -e "${BOLD}GCP Secrets in project: $GCP_PROJECT${NC}"
    echo ""
    
    gcloud secrets list \
        --project="$GCP_PROJECT" \
        --filter="$filter" \
        --format="table(name,createTime.date('%Y-%m-%d'),labels.app)"
}

# Load secrets as environment variables
load_secrets() {
    local code="$1"
    local code_lower="${code,,}"
    local code_upper="${code^^}"
    
    echo "# DIVE V3 Secrets for $code"
    echo "# Generated: $(date -Iseconds)"
    echo "# Usage: eval \"\$(./scripts/sync-gcp-secrets.sh load $code)\""
    echo ""
    
    # Core secrets
    local kc_secret=$(gcloud secrets versions access latest \
        --secret="${SECRET_PREFIX}-keycloak-${code_lower}" \
        --project="$GCP_PROJECT" 2>/dev/null || echo "")
    
    if [[ -n "$kc_secret" ]]; then
        echo "export KEYCLOAK_ADMIN_PASSWORD_${code_upper}='${kc_secret}'"
        echo "export TF_VAR_keycloak_admin_password='${kc_secret}'"
    fi
    
    local mongo_secret=$(gcloud secrets versions access latest \
        --secret="${SECRET_PREFIX}-mongodb-${code_lower}" \
        --project="$GCP_PROJECT" 2>/dev/null || echo "")
    
    if [[ -n "$mongo_secret" ]]; then
        echo "export MONGO_PASSWORD_${code_upper}='${mongo_secret}'"
    fi
    
    local pg_secret=$(gcloud secrets versions access latest \
        --secret="${SECRET_PREFIX}-postgres-${code_lower}" \
        --project="$GCP_PROJECT" 2>/dev/null || echo "")
    
    if [[ -n "$pg_secret" ]]; then
        echo "export POSTGRES_PASSWORD_${code_upper}='${pg_secret}'"
    fi
    
    local auth_secret=$(gcloud secrets versions access latest \
        --secret="${SECRET_PREFIX}-auth-secret-${code_lower}" \
        --project="$GCP_PROJECT" 2>/dev/null || echo "")
    
    if [[ -n "$auth_secret" ]]; then
        echo "export AUTH_SECRET_${code_upper}='${auth_secret}'"
    fi
    
    # Client secret (shared across all instances)
    local client_secret=$(gcloud secrets versions access latest \
        --secret="${SECRET_PREFIX}-keycloak-client-secret" \
        --project="$GCP_PROJECT" 2>/dev/null || echo "")
    
    if [[ -n "$client_secret" ]]; then
        echo "export KEYCLOAK_CLIENT_SECRET='${client_secret}'"
        echo "export TF_VAR_client_secret='${client_secret}'"
    fi
    
    # Test user password (shared)
    local test_pwd=$(gcloud secrets versions access latest \
        --secret="${SECRET_PREFIX}-test-user-password" \
        --project="$GCP_PROJECT" 2>/dev/null || echo "")
    
    if [[ -n "$test_pwd" ]]; then
        echo "export TEST_USER_PASSWORD='${test_pwd}'"
        echo "export TF_VAR_test_user_password='${test_pwd}'"
    fi
    
    # Federation secrets
    if [[ "$code" != "USA" ]]; then
        local fed_usa_to=$(gcloud secrets versions access latest \
            --secret="${SECRET_PREFIX}-federation-usa-${code_lower}" \
            --project="$GCP_PROJECT" 2>/dev/null || echo "")
        
        if [[ -n "$fed_usa_to" ]]; then
            echo "export FEDERATION_SECRET_USA_${code_upper}='${fed_usa_to}'"
        fi
        
        local fed_to_usa=$(gcloud secrets versions access latest \
            --secret="${SECRET_PREFIX}-federation-${code_lower}-usa" \
            --project="$GCP_PROJECT" 2>/dev/null || echo "")
        
        if [[ -n "$fed_to_usa" ]]; then
            echo "export FEDERATION_SECRET_${code_upper}_USA='${fed_to_usa}'"
        fi
    fi
}

# Verify secrets exist for a country
verify_secrets() {
    local code="$1"
    local code_lower="${code,,}"
    local name=$(get_country_name "$code")
    local missing=0
    
    echo ""
    echo -e "${BOLD}Verifying secrets for $name ($code)${NC}"
    echo ""
    
    local required_secrets=(
        "${SECRET_PREFIX}-keycloak-${code_lower}"
        "${SECRET_PREFIX}-mongodb-${code_lower}"
        "${SECRET_PREFIX}-postgres-${code_lower}"
        "${SECRET_PREFIX}-auth-secret-${code_lower}"
    )
    
    if [[ "$code" != "USA" ]]; then
        required_secrets+=(
            "${SECRET_PREFIX}-federation-usa-${code_lower}"
            "${SECRET_PREFIX}-federation-${code_lower}-usa"
        )
    fi
    
    for secret in "${required_secrets[@]}"; do
        if secret_exists "$secret"; then
            log_success "$secret"
        else
            log_error "$secret (MISSING)"
            ((missing++))
        fi
    done
    
    echo ""
    if [[ $missing -eq 0 ]]; then
        log_success "All required secrets exist for $name"
    else
        log_error "$missing secret(s) missing"
        log_info "Run: $0 create $code"
    fi
}

# =============================================================================
# Main Command Handler
# =============================================================================

show_help() {
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  create <CODE>     Create secrets for a country"
    echo "  create --all      Create secrets for all NATO countries"
    echo "  list [CODE]       List secrets (optionally filter by country)"
    echo "  load <CODE>       Export secrets as environment variables"
    echo "  verify <CODE>     Verify secrets exist for a country"
    echo "  help              Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 create POL                    # Create secrets for Poland"
    echo "  $0 create --all                  # Create for all 32 NATO countries"
    echo "  $0 list POL                      # List Poland's secrets"
    echo "  eval \"\$($0 load POL)\"           # Load Poland secrets to env"
    echo ""
    echo "Environment Variables:"
    echo "  GCP_PROJECT_ID    GCP project (default: dive25)"
}

# Parse command
COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
    create)
        if [[ "$1" == "--all" || "$1" == "-a" ]]; then
            echo "═══════════════════════════════════════════════════════════════════════"
            echo "  DIVE V3 - Create GCP Secrets for All NATO Countries"
            echo "═══════════════════════════════════════════════════════════════════════"
            echo ""
            log_info "Creating secrets for all 32 NATO countries..."
            
            for code in $(echo "${!NATO_COUNTRIES[@]}" | tr ' ' '\n' | sort); do
                create_country_secrets "$code"
            done
            
            echo ""
            log_success "All NATO country secrets created"
        elif [[ -n "$1" ]]; then
            code="${1^^}"
            if ! is_nato_country "$code"; then
                log_error "'$code' is not a valid NATO country code"
                exit 1
            fi
            create_country_secrets "$code"
        else
            log_error "Country code required"
            echo "Usage: $0 create <CODE> or $0 create --all"
            exit 1
        fi
        ;;
        
    list)
        list_secrets "${1^^}"
        ;;
        
    load)
        if [[ -z "$1" ]]; then
            log_error "Country code required"
            exit 1
        fi
        code="${1^^}"
        if ! is_nato_country "$code"; then
            log_error "'$code' is not a valid NATO country code"
            exit 1
        fi
        load_secrets "$code"
        ;;
        
    verify)
        if [[ -z "$1" ]]; then
            log_error "Country code required"
            exit 1
        fi
        code="${1^^}"
        if ! is_nato_country "$code"; then
            log_error "'$code' is not a valid NATO country code"
            exit 1
        fi
        verify_secrets "$code"
        ;;
        
    help|--help|-h)
        show_help
        ;;
        
    *)
        log_error "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac
