#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Common Functions
# =============================================================================
# Shared utilities used by all CLI modules
# Source this file at the top of each module
# =============================================================================
#
# SINGLE SOURCE OF TRUTH (SSOT) PATTERNS
# =============================================================================
#
# This module implements critical SSOT patterns to eliminate code duplication
# and ensure consistency across all 38 CLI modules.
#
# 1. PORT CALCULATION (✅ Centralized Dec 2025)
# -----------------------------------------------------------------------------
# FUNCTION: get_instance_ports <code>
# LOCATION: common.sh:513
# REPLACES: 6 duplicate implementations across modules
#
# Port allocation for NATO countries uses deterministic offset calculation:
#   - Frontend:   3000 + offset
#   - Backend:    4000 + offset
#   - Keycloak:   8443 + offset
#   - PostgreSQL: 5432 + offset
#   - MongoDB:    27017 + offset
#
# Offset sources (priority order):
#   1. NATO database (scripts/nato-countries.sh) - 32 countries (offset 0-31)
#   2. Partner nations - offset 32-39
#   3. Hash-based - offset 48+ for unknown codes
#
# DO NOT reimplement port calculation logic. Always use:
#   ports=$(get_instance_ports "$code")
#   frontend_port=$(echo "$ports" | jq -r '.frontend')
#
# DELEGATING MODULES:
#   - spoke.sh (formerly had duplicate)
#   - spoke-verification.sh (formerly had duplicate)
#   - spoke-kas.sh (formerly had duplicate)
#   - federation-test.sh (formerly had duplicate)
#   - federation-link.sh (formerly had duplicate)
#   - hub.sh (uses for spoke port lookups)
#
# TEST COVERAGE: tests/unit/test-port-calculation.sh (316 tests, 100% pass)
#
#
# 2. ADMIN TOKEN RETRIEVAL (✅ Centralized Dec 2025)
# -----------------------------------------------------------------------------
# FUNCTIONS:
#   - get_hub_admin_token() - federation-setup.sh:468
#   - get_spoke_admin_token() - federation-setup.sh:526
#
# LOCATION: federation-setup.sh (centralized from 10+ locations)
# FEATURES:
#   - 15-retry logic with exponential backoff
#   - Automatic password retrieval from GCP Secret Manager
#   - Password quality validation (no defaults)
#   - Resilient to slow Keycloak startup
#
# DO NOT implement local token retrieval. Always use:
#   token=$(get_hub_admin_token)
#   token=$(get_spoke_admin_token "$spoke_code")
#
# REPLACES: 10+ duplicate token retrieval blocks
#
#
# 3. SECRET LOADING PATTERNS (4 Patterns)
# -----------------------------------------------------------------------------
# The CLI uses 4 different patterns for loading secrets from GCP:
#
# Pattern A: Direct GCP Secret Manager (backend/src/utils/gcp-secrets.ts)
#   - Used by: Backend API, KAS service
#   - Method: TypeScript utility functions
#   - Best for: Runtime application code
#
# Pattern B: Environment Variable Export (secrets.sh)
#   - Used by: Docker compose files, shell scripts
#   - Method: `./dive secrets load` → exports to shell
#   - Best for: Deployment scripts, CI/CD
#
# Pattern C: Inline Secret Fetch (federation-setup.sh)
#   - Used by: Federation configuration, Keycloak API calls
#   - Method: get_keycloak_admin_password(), get_keycloak_client_secret()
#   - Best for: One-time configuration tasks
#
# Pattern D: Cached in .env Files (spoke instances)
#   - Used by: Spoke instances
#   - Location: instances/<code>/.env
#   - Method: Written during spoke init, synced on spoke up
#   - Best for: Persistent spoke configuration
#
# CRITICAL RULES:
#   - NEVER hardcode secrets (see docs/DEPRECATION-TIMELINE.md)
#   - ALL secrets must come from GCP Secret Manager (project: dive25)
#   - Naming convention: dive-v3-<type>-<instance>
#   - Use backend/src/utils/gcp-secrets.ts for TypeScript
#   - Use functions in secrets.sh for bash
#
#
# 4. CONTAINER NAMING RESOLUTION (Supports Legacy Patterns)
# -----------------------------------------------------------------------------
# FUNCTION: resolve_spoke_container <code> <service>
# LOCATION: common.sh (planned)
# STATUS: ⚠️ Not yet extracted (see Sprint 2-4 recommendations)
#
# Container naming evolved through 5 patterns:
#   1. dive-spoke-<code>-<service> (current, v4.0+)
#   2. <code>-<service>-<code>-1 (legacy, v3.x)
#   3. dive-v3-<code>-<service> (legacy, v2.x)
#   4. dive-<code>-<service> (legacy, v1.x)
#   5. dive-hub-<service> (hub only, all versions)
#
# resolve_spoke_container() tries all patterns for backward compatibility.
#
# DO NOT hardcode container names. Always use:
#   container=$(resolve_spoke_container "$code" "frontend")
#
# See: config/naming-conventions.json for migration status
#
#
# 5. HUB VS SPOKE ASYMMETRY (Design Pattern)
# -----------------------------------------------------------------------------
# Hub and spokes have intentionally different command sets:
#
# HUB (permanent, always-on):
#   - ❌ No cleanup/reset/teardown commands (hub is permanent)
#   - ❌ No resilience/failover commands (hub is always available)
#   - ✅ Spoke management commands (approve, reject, rotate-token)
#   - ✅ Policy distribution (push-policy)
#
# SPOKE (ephemeral, may disconnect):
#   - ✅ Cleanup commands (clean, reset, teardown)
#   - ✅ Resilience features (failover, maintenance mode)
#   - ✅ Policy sync (spoke sync, spoke policy status)
#   - ❌ No spoke management (delegated to hub)
#
# RATIONALE: Hub is the source of truth and cannot be offline. Spokes may
# disconnect for maintenance or network issues, requiring offline capabilities.
#
# See: docs/ADR-hub-spoke-asymmetry.md for full design rationale
#
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
export PILOT_MODE="${DIVE_PILOT_MODE:-false}"

# Hub API URL - Environment aware
# - LOCAL/DEV: Use localhost hub
# - GCP/PILOT: Use production hub
if [ "$ENVIRONMENT" = "local" ] || [ "$ENVIRONMENT" = "dev" ]; then
    export HUB_API_URL="${DIVE_HUB_URL:-https://localhost:4000}"
else
    export HUB_API_URL="${DIVE_HUB_URL:-https://usa-api.dive25.com}"
fi

# =============================================================================
# NETWORK MANAGEMENT (LOCAL DEV ONLY)
# =============================================================================

# Ensure shared network exists for local cross-instance communication
# Only used when hub + spokes run on same server (development)
# In production, instances use external domains (no shared network needed)
ensure_shared_network() {
    # Only create shared network in local/dev environment
    if [ "$ENVIRONMENT" != "local" ] && [ "$ENVIRONMENT" != "dev" ]; then
        # Skipping shared network (production uses external domains)
        return 0
    fi

    local network_name="dive-v3-shared-network"

    if docker network ls --format '{{.Name}}' | grep -q "^${network_name}$"; then
        # Shared network already exists
        return 0
    fi

    log_info "Creating shared network for cross-instance communication..."

    if docker network create "$network_name" >/dev/null 2>&1; then
        log_success "Shared network created: $network_name"
    else
        log_warn "Could not create shared network (may already exist)"
    fi
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

upper() {
    echo "$1" | tr '[:lower:]' '[:upper:]'
}

lower() {
    echo "$1" | tr '[:upper:]' '[:lower:]'
}

# Resolve container name based on environment/prefix, with override support.
container_name() {
    local service="$1"
    local prefix="${CONTAINER_PREFIX:-}"
    if [ -z "$prefix" ]; then
        if [ "$ENVIRONMENT" = "pilot" ]; then
            prefix="dive-pilot"
        else
            prefix="dive-v3"
        fi
    fi
    echo "${prefix}-${service}"
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
    [ "$VERBOSE" = true ] && echo -e "${GRAY}  $1${NC}" || true
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
    local env_upper
    env_upper=$(upper "$ENVIRONMENT")
    local inst_upper
    inst_upper=$(upper "$INSTANCE")
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
    # Ensure mkcert is installed and CA present before regen
    if ! command -v mkcert >/dev/null 2>&1; then
        log_error "mkcert not installed. Install mkcert and trust the local CA."
        return 1
    fi

    local caroot
    caroot=$(mkcert -CAROOT 2>/dev/null || true)
    if [ -z "$caroot" ]; then
        # Fallback to default macOS path
        caroot="${HOME}/Library/Application Support/mkcert"
    fi

    local ca_key="${caroot}/rootCA-key.pem"
    local ca_cert="${caroot}/rootCA.pem"

    if [ ! -f "$ca_key" ] || [ ! -f "$ca_cert" ]; then
        log_warn "mkcert CA not found at ${caroot}; attempting mkcert -install..."
        if [ "$DRY_RUN" = true ]; then
            log_dry "Would run: mkcert -install"
        else
            mkcert -install || { log_error "mkcert -install failed"; return 1; }
        fi
    fi

    # Re-evaluate after install attempt
    if [ ! -f "$ca_key" ] || [ ! -f "$ca_cert" ]; then
        log_error "mkcert CA still missing at ${caroot}; please run mkcert -install manually"
        return 1
    fi

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
    # Normalize instance to lowercase for secret names (secrets use lowercase suffixes)
    local inst_lc
    inst_lc=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    # Use configured project, default to dive25 if not set
    local project="${GCP_PROJECT:-dive25}"

    # Debug: show which project/instance we will query
    echo "[secrets-debug] project=${project} instance=${inst_lc}"

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

    # Try secrets using documented naming; fall back to legacy variants if present.
    # CRITICAL: Do NOT overwrite existing values from .env if GCP fetch fails
    fetch_first_secret() {
        local var_ref="$1"
        shift
        local name
        for name in "$@"; do
            if value=$(gcloud secrets versions access latest --secret="$name" --project="$project" 2>/dev/null); then
                eval "$var_ref=\"\$value\""
                echo "[secrets-debug] loaded $name (len=${#value})"
                return 0
            fi
        done
        # Don't clear existing value - it might be set from .env
        # Only set to empty if variable is truly unset
        eval "local existing_val=\"\${$var_ref:-}\""
        if [ -z "$existing_val" ]; then
            eval "$var_ref=\"\""
        fi
        return 1
    }

    fetch_first_secret POSTGRES_PASSWORD "dive-v3-postgres-${inst_lc}"
    fetch_first_secret KEYCLOAK_ADMIN_PASSWORD "dive-v3-keycloak-${inst_lc}"
    fetch_first_secret MONGO_PASSWORD "dive-v3-mongodb-${inst_lc}"
    fetch_first_secret AUTH_SECRET "dive-v3-auth-secret-${inst_lc}"
    fetch_first_secret KEYCLOAK_CLIENT_SECRET "dive-v3-keycloak-client-secret" "dive-v3-keycloak-client-secret-${inst_lc}"
    fetch_first_secret REDIS_PASSWORD "dive-v3-redis-blacklist" "dive-v3-redis-${inst_lc}"

    # Export instance-suffixed variables for spoke docker-compose files
    # CRITICAL: Only overwrite if we have a non-empty value (preserve .env values)
    local inst_uc=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
    [ -n "$POSTGRES_PASSWORD" ] && eval "export POSTGRES_PASSWORD_${inst_uc}='${POSTGRES_PASSWORD}'"
    [ -n "$KEYCLOAK_ADMIN_PASSWORD" ] && eval "export KEYCLOAK_ADMIN_PASSWORD_${inst_uc}='${KEYCLOAK_ADMIN_PASSWORD}'"
    [ -n "$MONGO_PASSWORD" ] && eval "export MONGO_PASSWORD_${inst_uc}='${MONGO_PASSWORD}'"
    [ -n "$AUTH_SECRET" ] && eval "export AUTH_SECRET_${inst_uc}='${AUTH_SECRET}'"
    [ -n "$KEYCLOAK_CLIENT_SECRET" ] && eval "export KEYCLOAK_CLIENT_SECRET_${inst_uc}='${KEYCLOAK_CLIENT_SECRET}'"
    [ -n "$REDIS_PASSWORD" ] && eval "export REDIS_PASSWORD_${inst_uc}='${REDIS_PASSWORD}'"
    [ -n "$REDIS_PASSWORD" ] && export REDIS_PASSWORD_BLACKLIST="${REDIS_PASSWORD}"

    # Make secrets available to child processes (docker compose, terraform)
    export POSTGRES_PASSWORD KEYCLOAK_ADMIN_PASSWORD MONGO_PASSWORD AUTH_SECRET KEYCLOAK_CLIENT_SECRET REDIS_PASSWORD

    # For Hub deployment, also load spoke passwords for federation
    if [ "$inst_lc" = "usa" ] || [ "$inst_lc" = "hub" ]; then
        log_step "Loading spoke Keycloak passwords for federation..."
        for spoke in gbr fra deu can; do
            local spoke_uc=$(echo "$spoke" | tr '[:lower:]' '[:upper:]')
            local spoke_password
            if spoke_password=$(gcloud secrets versions access latest --secret="dive-v3-keycloak-${spoke}" --project="$project" 2>/dev/null); then
                eval "export KEYCLOAK_ADMIN_PASSWORD_${spoke_uc}='${spoke_password}'"
                echo "[secrets-debug] loaded KEYCLOAK_ADMIN_PASSWORD_${spoke_uc} (len=${#spoke_password})"
            else
                log_warn "Could not load KEYCLOAK_ADMIN_PASSWORD_${spoke_uc} (spoke may not exist yet)"
            fi
        done
    fi

    # Align NextAuth/JWT to AUTH secret unless explicitly provided
    [ -n "$AUTH_SECRET" ] && export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-$AUTH_SECRET}"
    [ -n "$AUTH_SECRET" ] && export JWT_SECRET="${JWT_SECRET:-$AUTH_SECRET}"

    # Terraform variables
    export TF_VAR_keycloak_admin_password="$KEYCLOAK_ADMIN_PASSWORD"
    export TF_VAR_client_secret="$KEYCLOAK_CLIENT_SECRET"
    export TF_VAR_test_user_password="${TF_VAR_test_user_password:-$KEYCLOAK_ADMIN_PASSWORD}"
    export TF_VAR_admin_user_password="${TF_VAR_admin_user_password:-$KEYCLOAK_ADMIN_PASSWORD}"
    # Pilot/default Keycloak URL (matches KC_HOSTNAME=localhost in docker-compose)
    export KEYCLOAK_URL="${KEYCLOAK_URL:-https://localhost:8443}"
    export KEYCLOAK_ADMIN_USERNAME="${KEYCLOAK_ADMIN_USERNAME:-admin}"
    # Verify critical secrets
    local missing=0
    [ -z "$POSTGRES_PASSWORD" ] && log_warn "Missing: POSTGRES_PASSWORD" && ((missing++))
    [ -z "$KEYCLOAK_ADMIN_PASSWORD" ] && log_warn "Missing: KEYCLOAK_ADMIN_PASSWORD" && ((missing++))
    [ -z "$MONGO_PASSWORD" ] && log_warn "Missing: MONGO_PASSWORD" && ((missing++))
    [ -z "$AUTH_SECRET" ] && log_warn "Missing: AUTH_SECRET" && ((missing++))
    [ -z "$KEYCLOAK_CLIENT_SECRET" ] && log_warn "Missing: KEYCLOAK_CLIENT_SECRET" && ((missing++))
    [ -z "$REDIS_PASSWORD" ] && log_warn "Missing: REDIS_PASSWORD" && ((missing++))

    if [ $missing -gt 0 ]; then
        log_error "Failed to load $missing critical secret(s)"
        return 1
    fi

    # Mirror base secrets into instance-scoped env vars expected by generated compose
    local inst_uc
    inst_uc=$(echo "$inst_lc" | tr '[:lower:]' '[:upper:]')
    map_if_empty() {
        local target_var="$1"
        local source_val="$2"
        eval "local current_val=\${$target_var:-}"
        if [ -z "$current_val" ] && [ -n "$source_val" ]; then
            export "$target_var=$source_val"
        fi
    }
    map_if_empty "POSTGRES_PASSWORD_${inst_uc}" "$POSTGRES_PASSWORD"
    map_if_empty "MONGO_PASSWORD_${inst_uc}" "$MONGO_PASSWORD"
    map_if_empty "REDIS_PASSWORD_${inst_uc}" "$REDIS_PASSWORD"
    map_if_empty "KEYCLOAK_ADMIN_PASSWORD_${inst_uc}" "$KEYCLOAK_ADMIN_PASSWORD"
    map_if_empty "KEYCLOAK_CLIENT_SECRET_${inst_uc}" "$KEYCLOAK_CLIENT_SECRET"
    map_if_empty "NEXTAUTH_SECRET_${inst_uc}" "$NEXTAUTH_SECRET"

    log_success "Secrets loaded from GCP"
    return 0
}

load_local_defaults() {
    log_warn "Local/dev mode: using fixed defaults for reproducibility (override via env)."
    export KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-KeycloakAdminSecure123!}"
    export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-LocalPgSecure123!}"
    export MONGO_PASSWORD="${MONGO_PASSWORD:-LocalMongoSecure123!}"
    export REDIS_PASSWORD="${REDIS_PASSWORD:-LocalRedisSecure123!}"
    export AUTH_SECRET="${AUTH_SECRET:-LocalAuthSecure123!}"
    export KEYCLOAK_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-LocalClientSecret123!}"
    export JWT_SECRET="${JWT_SECRET:-$AUTH_SECRET}"
    export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-$AUTH_SECRET}"
    export TF_VAR_keycloak_admin_password="$KEYCLOAK_ADMIN_PASSWORD"
    export TF_VAR_client_secret="$KEYCLOAK_CLIENT_SECRET"
    export TF_VAR_test_user_password="${TF_VAR_test_user_password:-KeycloakAdminSecure123!}"
    export TF_VAR_admin_user_password="${TF_VAR_admin_user_password:-$TF_VAR_test_user_password}"
}

load_secrets() {
    case "$ENVIRONMENT" in
        local|dev)
            # Prefer GCP secrets in dev by default (can be disabled via DEV_USE_GCP_SECRETS=false).
            # For local, only use GCP when explicitly requested.
            local want_gcp=false
            if [ "$ENVIRONMENT" = "dev" ]; then
                if [ "${DEV_USE_GCP_SECRETS:-${USE_GCP_SECRETS:-true}}" = "true" ]; then
                    want_gcp=true
                fi
            else
                if [ "${USE_GCP_SECRETS:-}" = "true" ] || [ "${DEV_USE_GCP_SECRETS:-}" = "true" ]; then
                    want_gcp=true
                fi
            fi

            if [ "$want_gcp" = true ]; then
                if load_gcp_secrets "$INSTANCE"; then
                    return 0
                else
                    log_warn "GCP secrets load failed; falling back to local defaults for env '$ENVIRONMENT'"
                fi
            fi
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

apply_env_profile() {
    local inst_lc
    inst_lc=$(lower "$INSTANCE")

    # Isolate docker compose projects per instance to avoid shared volumes/credentials.
    # Respect an existing override if the caller set COMPOSE_PROJECT_NAME explicitly.
    if [ -z "${COMPOSE_PROJECT_NAME:-}" ]; then
        export COMPOSE_PROJECT_NAME="dive-v3-${inst_lc}"
    fi

    case "$ENVIRONMENT" in
        local|dev)
            # Dev defaults to tunnel hosts; local still works via overrides/env.
            export NEXTAUTH_URL="${NEXTAUTH_URL:-https://${inst_lc}-app.dive25.com}"
            export KEYCLOAK_ISSUER="${KEYCLOAK_ISSUER:-https://${inst_lc}-idp.dive25.com/realms/dive-v3-broker}"
            export KEYCLOAK_URL_PUBLIC="${KEYCLOAK_URL_PUBLIC:-https://${inst_lc}-idp.dive25.com}"
            export KEYCLOAK_URL_INTERNAL="${KEYCLOAK_URL_INTERNAL:-https://keycloak:8443}"
            export KEYCLOAK_URL="${KEYCLOAK_URL_INTERNAL}"
            export CERT_HOST_SCOPE="${CERT_HOST_SCOPE:-local_minimal}"
            export SKIP_CERT_REGEN_IF_PRESENT="${SKIP_CERT_REGEN_IF_PRESENT:-true}"
            export NEXT_PUBLIC_BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-https://${inst_lc}-api.dive25.com}"
            export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://${inst_lc}-api.dive25.com}"
            export NEXT_PUBLIC_BASE_URL="${NEXT_PUBLIC_BASE_URL:-https://${inst_lc}-app.dive25.com}"
            export NEXT_PUBLIC_KEYCLOAK_URL="${NEXT_PUBLIC_KEYCLOAK_URL:-https://${inst_lc}-idp.dive25.com}"
            export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-https://${inst_lc}-app.dive25.com,https://${inst_lc}-api.dive25.com,https://${inst_lc}-idp.dive25.com,http://localhost:3000,https://localhost:3000,http://localhost:4000,https://localhost:4000}"
            ;;
        gcp|pilot|prod|staging)
            export KEYCLOAK_HOSTNAME="${KEYCLOAK_HOSTNAME:-${inst_lc}-idp.dive25.com}"
            export NEXTAUTH_URL="${NEXTAUTH_URL:-https://${inst_lc}-app.dive25.com}"
            export KEYCLOAK_ISSUER="${KEYCLOAK_ISSUER:-https://${inst_lc}-idp.dive25.com/realms/dive-v3-broker}"
            export NEXT_PUBLIC_BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-https://${inst_lc}-api.dive25.com}"
            export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://${inst_lc}-api.dive25.com}"
            export NEXT_PUBLIC_BASE_URL="${NEXT_PUBLIC_BASE_URL:-https://${inst_lc}-app.dive25.com}"
            export NEXT_PUBLIC_KEYCLOAK_URL="${NEXT_PUBLIC_KEYCLOAK_URL:-https://${inst_lc}-idp.dive25.com}"
            export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-https://${inst_lc}-app.dive25.com,https://${inst_lc}-api.dive25.com,https://${inst_lc}-idp.dive25.com}"
            ;;
        *)
            log_warn "Unknown environment '$ENVIRONMENT' for env profile; skipping profile application"
            ;;
    esac

    log_verbose "Applied env profile (${ENVIRONMENT}) for instance ${inst_lc}"
}

# =============================================================================
# INSTANCE PORT CALCULATION - SINGLE SOURCE OF TRUTH
# =============================================================================
# This is the AUTHORITATIVE port calculation for ALL instances.
# Used by: spoke.sh, federation-setup.sh, federation-link.sh, spoke-kas.sh, etc.
#
# DO NOT duplicate this logic elsewhere - call this function instead!
#
# Port allocation strategy:
# 1. NATO countries (0-31): Use NATO database offset (scripts/nato-countries.sh)
# 2. Partner nations (32-39): Hardcoded (AUS, NZL, JPN, KOR, ISR, UKR)
# 3. Unknown countries (48+): Hash-based to avoid conflicts
#
# Port ranges:
#   Frontend:   3000-3099
#   Backend:    4000-4099
#   Keycloak:   8443-8543
#   PostgreSQL: 5432-5531
#   MongoDB:    27017-27116
#   Redis:      6379-6478
#   OPA:        8181-8490 (offset * 10 for OPA)
#   KAS:        9000-9099
#
# Arguments:
#   $1 - Instance code (e.g., USA, FRA, POL)
#
# Returns:
#   Exports 10 port variables via echo (use with eval)
#
# Example:
#   eval "$(get_instance_ports "FRA")"
#   echo $SPOKE_FRONTEND_PORT  # 3010
# =============================================================================

get_instance_ports() {
    local code="$1"
    local code_upper="${code^^}"
    local port_offset=0

    # Check if it's a NATO country (uses centralized database)
    if type -t is_nato_country &>/dev/null && is_nato_country "$code_upper" 2>/dev/null; then
        # Use centralized NATO port offset
        if type -t get_country_offset &>/dev/null; then
            port_offset=$(get_country_offset "$code_upper" 2>/dev/null || echo "0")
        fi
    elif type -t is_partner_nation &>/dev/null && is_partner_nation "$code_upper" 2>/dev/null; then
        # Partner nations get offsets 32-39
        case "$code_upper" in
            AUS) port_offset=32 ;;
            NZL) port_offset=33 ;;
            JPN) port_offset=34 ;;
            KOR) port_offset=35 ;;
            ISR) port_offset=36 ;;
            UKR) port_offset=37 ;;
            *)   port_offset=$(( ($(echo "$code_upper" | cksum | cut -d' ' -f1) % 10) + 38 )) ;;
        esac
    else
        # Unknown countries: use hash-based offset (48+) to avoid conflicts
        port_offset=$(( ($(echo "$code_upper" | cksum | cut -d' ' -f1) % 20) + 48 ))
        log_warn "Country '$code_upper' not in NATO database, using hash-based port offset: $port_offset"
    fi

    # Export calculated ports (can be sourced or eval'd)
    # Port scheme ensures no conflicts for 100+ simultaneous spokes
    # FIXED: Changed OPA from 8181+(offset*10) to 9100+offset to avoid conflicts
    echo "export SPOKE_PORT_OFFSET=$port_offset"
    echo "export SPOKE_FRONTEND_PORT=$((3000 + port_offset))"
    echo "export SPOKE_BACKEND_PORT=$((4000 + port_offset))"
    echo "export SPOKE_KEYCLOAK_HTTPS_PORT=$((8443 + port_offset))"
    echo "export SPOKE_KEYCLOAK_HTTP_PORT=$((8080 + port_offset))"
    echo "export SPOKE_POSTGRES_PORT=$((5432 + port_offset))"
    echo "export SPOKE_MONGODB_PORT=$((27017 + port_offset))"
    echo "export SPOKE_REDIS_PORT=$((6379 + port_offset))"
    echo "export SPOKE_OPA_PORT=$((9100 + port_offset))"
    echo "export SPOKE_KAS_PORT=$((10000 + port_offset))"
}

# Ensure DIVE_ROOT is set
ensure_dive_root() {
    if [ -z "$DIVE_ROOT" ]; then
        local root_path
        root_path="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
        export DIVE_ROOT="$root_path"
    fi
}


