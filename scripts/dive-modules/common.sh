#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Common Functions
# =============================================================================
# Shared utilities used by all CLI modules
# Source this file at the top of each module
# =============================================================================

# Colors
export GREEN='\033[0;32m'
export BLUE='\033[0;34m'
export RED='\033[0;31m'
export YELLOW='\033[1;33m'
export CYAN='\033[0;36m'
export GRAY='\033[0;90m'
export BOLD='\033[1m'
export NC='\033[0m'

# Defaults (can be overridden by environment)
export ENVIRONMENT="${DIVE_ENV:-local}"
export INSTANCE="${DIVE_INSTANCE:-usa}"
export GCP_PROJECT="${GCP_PROJECT:-dive25}"
export PILOT_VM="${PILOT_VM:-dive-v3-pilot}"
export PILOT_ZONE="${PILOT_ZONE:-us-east4-c}"
export DRY_RUN="${DRY_RUN:-false}"
export VERBOSE="${VERBOSE:-false}"
export QUIET="${QUIET:-false}"

# Pilot Mode Configuration
export PILOT_MODE="${DIVE_PILOT_MODE:-true}"
export HUB_API_URL="${DIVE_HUB_URL:-https://usa-api.dive25.com}"

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

upper() {
    echo "$1" | tr '[:lower:]' '[:upper:]'
}

lower() {
    echo "$1" | tr '[:upper:]' '[:lower:]'
}

log_info() {
    [ "$QUIET" = true ] && return
    echo -e "${BLUE}ℹ ${NC}$1"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_step() {
    [ "$QUIET" = true ] && return
    echo -e "${CYAN}→ $1${NC}"
}

log_dry() {
    echo -e "${GRAY}[DRY-RUN] $1${NC}"
}

log_verbose() {
    [ "$VERBOSE" = true ] && echo -e "${GRAY}  $1${NC}"
}

# Execute command (or log if dry-run)
run() {
    if [ "$DRY_RUN" = true ]; then
        log_dry "$*"
        return 0
    fi
    [ "$VERBOSE" = true ] && log_verbose "Executing: $*"
    "$@"
}

# Execute docker compose with current compose file
dc() {
    local compose_file="${COMPOSE_FILE:-docker-compose.yml}"
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f $compose_file $*"
        return 0
    fi
    docker compose -f "$compose_file" "$@"
}

print_header() {
    [ "$QUIET" = true ] && return
    local env_upper=$(upper "$ENVIRONMENT")
    local inst_upper=$(upper "$INSTANCE")
    local dry_flag=""
    [ "$DRY_RUN" = true ] && dry_flag=" [DRY-RUN]"
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════════════════════════════════════╗"
    echo "║                         DIVE V3 CLI                                    ║"
    printf "║          Environment: %-6s | Instance: %-4s%-12s       ║\n" "$env_upper" "$inst_upper" "$dry_flag"
    echo "╚════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================

check_docker() {
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker is not running."
        return 1
    fi
    log_verbose "Docker is running"
    return 0
}

check_gcloud() {
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI not installed"
        return 1
    fi
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q "@"; then
        log_error "Not authenticated to GCP. Run: gcloud auth login"
        return 1
    fi
    log_verbose "gcloud is authenticated"
    return 0
}

check_terraform() {
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform not installed"
        return 1
    fi
    log_verbose "Terraform is installed: $(terraform version -json 2>/dev/null | jq -r '.terraform_version' || terraform version | head -1)"
    return 0
}

check_certs() {
    # Always regenerate mkcert certificates to cover the entire stack (frontend/backend/keycloak/kas)
    log_step "Regenerating mkcert certificates for all services..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would regenerate certificates via ./scripts/generate-dev-certs.sh"
        return 0
    fi

    if [ -x "./scripts/generate-dev-certs.sh" ]; then
        ./scripts/generate-dev-certs.sh
    else
        log_error "scripts/generate-dev-certs.sh not found"
        return 1
    fi

    log_success "mkcert certificates regenerated"
    return 0
}

# =============================================================================
# SECRETS LOADING (used by multiple modules)
# =============================================================================

load_gcp_secrets() {
    local instance="${1:-usa}"
    
    log_step "Loading secrets from GCP Secret Manager ($(upper "$instance"))..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would fetch: dive-v3-postgres-${instance}"
        log_dry "Would fetch: dive-v3-keycloak-${instance}"
        log_dry "Would fetch: dive-v3-mongodb-${instance}"
        export POSTGRES_PASSWORD="<gcp-secret>"
        export KEYCLOAK_ADMIN_PASSWORD="<gcp-secret>"
        export MONGO_PASSWORD="<gcp-secret>"
        export AUTH_SECRET="<gcp-secret>"
        export KEYCLOAK_CLIENT_SECRET="<gcp-secret>"
        return 0
    fi
    
    check_gcloud || { log_error "GCP authentication required for environment '$ENVIRONMENT'"; return 1; }
    
    export POSTGRES_PASSWORD=$(gcloud secrets versions access latest --secret="dive-v3-postgres-${instance}" --project="$GCP_PROJECT" 2>/dev/null || echo "")
    export KEYCLOAK_ADMIN_PASSWORD=$(gcloud secrets versions access latest --secret="dive-v3-keycloak-${instance}" --project="$GCP_PROJECT" 2>/dev/null || echo "")
    export MONGO_PASSWORD=$(gcloud secrets versions access latest --secret="dive-v3-mongodb-${instance}" --project="$GCP_PROJECT" 2>/dev/null || echo "")
    export AUTH_SECRET=$(gcloud secrets versions access latest --secret="dive-v3-auth-secret-${instance}" --project="$GCP_PROJECT" 2>/dev/null || echo "")
    export KEYCLOAK_CLIENT_SECRET=$(gcloud secrets versions access latest --secret="dive-v3-keycloak-client-secret-${instance}" --project="$GCP_PROJECT" 2>/dev/null || echo "")
    export JWT_SECRET=$(gcloud secrets versions access latest --secret="dive-v3-jwt-secret-${instance}" --project="$GCP_PROJECT" 2>/dev/null || echo "")
    export NEXTAUTH_SECRET=$(gcloud secrets versions access latest --secret="dive-v3-nextauth-secret-${instance}" --project="$GCP_PROJECT" 2>/dev/null || echo "")
    
    # Terraform variables
    export TF_VAR_keycloak_admin_password="$KEYCLOAK_ADMIN_PASSWORD"
    export TF_VAR_client_secret="$KEYCLOAK_CLIENT_SECRET"
    
    # Verify critical secrets
    local missing=0
    [ -z "$POSTGRES_PASSWORD" ] && log_warn "Missing: POSTGRES_PASSWORD" && ((missing++))
    [ -z "$KEYCLOAK_ADMIN_PASSWORD" ] && log_warn "Missing: KEYCLOAK_ADMIN_PASSWORD" && ((missing++))
    [ -z "$MONGO_PASSWORD" ] && log_warn "Missing: MONGO_PASSWORD" && ((missing++))
    
    if [ $missing -gt 0 ]; then
        log_error "Failed to load $missing critical secret(s)"
        return 1
    fi
    
    log_success "Secrets loaded from GCP"
    return 0
}

load_local_defaults() {
    log_warn "Using local development defaults (NOT for production!)"
    export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-DivePilot2025!}"
    export KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-DivePilot2025!SecureAdmin}"
    export MONGO_PASSWORD="${MONGO_PASSWORD:-DivePilot2025!}"
    export AUTH_SECRET="${AUTH_SECRET:-local-dev-secret-not-for-production}"
    export KEYCLOAK_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-dive-v3-client-secret}"
    export JWT_SECRET="${JWT_SECRET:-local-jwt-secret}"
    export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-local-nextauth-secret}"
    export TF_VAR_keycloak_admin_password="$KEYCLOAK_ADMIN_PASSWORD"
    export TF_VAR_client_secret="$KEYCLOAK_CLIENT_SECRET"
}

load_secrets() {
    case "$ENVIRONMENT" in
        local|dev)
            load_local_defaults
            ;;
        gcp|pilot|prod|staging)
            load_gcp_secrets "$INSTANCE" || return 1
            ;;
        *)
            log_error "Unknown environment: $ENVIRONMENT"
            return 1
            ;;
    esac
}

# Ensure DIVE_ROOT is set
ensure_dive_root() {
    if [ -z "$DIVE_ROOT" ]; then
        export DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    fi
}



