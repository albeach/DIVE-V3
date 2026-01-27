#!/usr/bin/env bash
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

# =============================================================================
# VERSION CONSTANTS (SSOT - Single Source of Truth)
# =============================================================================
# All version numbers for external dependencies should be defined here.
# Update ONLY this section when upgrading versions.
# =============================================================================

# Keycloak Version - Used by Dockerfile, docker-compose, and Terraform
# Changelog: https://www.keycloak.org/docs/latest/release_notes/index.html
export KEYCLOAK_VERSION="26.5.2"
export KEYCLOAK_IMAGE="quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}"

# Node.js Version - Used by frontend/backend Dockerfiles
export NODE_VERSION="20"

# OPA Version - Use 'latest' to always get newest features and security patches
# Releases: https://github.com/open-policy-agent/opa/releases
export OPA_VERSION="latest"
export OPA_IMAGE="openpolicyagent/opa:${OPA_VERSION}"

# MongoDB Version - Used by docker-compose
export MONGODB_VERSION="7.0"

# PostgreSQL Version - Used by docker-compose (Keycloak database)
export POSTGRES_VERSION="15"

# =============================================================================
# LOAD NATO COUNTRIES DATABASE (SSOT for port offsets)
# =============================================================================

# =============================================================================
# ENVIRONMENT SETUP
# =============================================================================
# Ensure Docker and other tools are in PATH for all execution contexts
# (main shell, subshells, background processes, etc.)

# Add Docker to PATH if not already present (macOS Docker Desktop)
if ! command -v docker &>/dev/null; then
    # Common Docker Desktop locations
    if [ -d "/Applications/Docker.app/Contents/Resources/bin" ]; then
        export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
    fi
    # Homebrew location
    if [ -d "/usr/local/bin" ]; then
        export PATH="/usr/local/bin:$PATH"
    fi
    # Homebrew (Apple Silicon)
    if [ -d "/opt/homebrew/bin" ]; then
        export PATH="/opt/homebrew/bin:$PATH"
    fi
fi

# =============================================================================
# LOAD NATO COUNTRIES DATABASE (SSOT for port offsets)
# =============================================================================
# FIXED (Dec 2025): Load NATO database early so get_instance_ports can use it
# This must be loaded BEFORE get_instance_ports is called
# FIX (Dec 2025): Associative arrays can't be exported, so check if array
# is actually populated, not just if the flag is set.
# Also handle case where BASH_SOURCE is empty by using DIVE_ROOT fallback.
if [ -z "${NATO_COUNTRIES_LOADED:-}" ] || [ "${#NATO_COUNTRIES[@]}" -eq 0 ] 2>/dev/null; then
    if [ -n "${BASH_SOURCE[0]}" ]; then
        _NATO_DB_PATH="$(dirname "${BASH_SOURCE[0]}")/../nato-countries.sh"
    elif [ -n "$DIVE_ROOT" ]; then
        _NATO_DB_PATH="${DIVE_ROOT}/scripts/nato-countries.sh"
    else
        _NATO_DB_PATH=""
    fi

    if [ -n "$_NATO_DB_PATH" ] && [ -f "$_NATO_DB_PATH" ]; then
        source "$_NATO_DB_PATH"
        NATO_COUNTRIES_LOADED=1  # Don't export - just use as local flag
    fi
fi

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
export INSTANCE="${INSTANCE:-${DIVE_INSTANCE:-usa}}"
export GCP_PROJECT="${GCP_PROJECT:-dive25}"
export PILOT_VM="${PILOT_VM:-dive-v3-pilot}"
export PILOT_ZONE="${PILOT_ZONE:-us-east4-c}"
export DRY_RUN="${DRY_RUN:-false}"
export VERBOSE="${VERBOSE:-false}"
export QUIET="${QUIET:-false}"

# Pilot Mode Configuration
export PILOT_MODE="${DIVE_PILOT_MODE:-false}"

# =============================================================================
# HUB CONTAINER NAMING (SSOT - Never override during spoke operations!)
# =============================================================================
# Hub is a singleton. These names are derived from HUB_PROJECT_NAME.
# CRITICAL: Do NOT use COMPOSE_PROJECT_NAME for Hub names - it gets set to
# spoke names during spoke deployment and would pollute Hub detection.
#
# Convention: ${HUB_PROJECT_NAME}-<service>
#   - dive-hub-keycloak
#   - dive-hub-backend
#   - dive-hub-frontend
#   - etc.
#
# These are exported so they're available to all modules.
# Use consistent variable names (HUB_*_CONTAINER pattern).
export HUB_PROJECT_NAME="${HUB_PROJECT_NAME:-dive-hub}"
export HUB_KEYCLOAK_CONTAINER="${HUB_PROJECT_NAME}-keycloak"
export HUB_BACKEND_CONTAINER="${HUB_PROJECT_NAME}-backend"
export HUB_FRONTEND_CONTAINER="${HUB_PROJECT_NAME}-frontend"
# FIX (2026-01-15): Hub realm is dive-v3-broker-usa (USA is the hub)
# LEGACY dive-v3-broker (without suffix) is DEPRECATED and should not exist
# FIX (2026-01-18): Use conditional assignment to avoid readonly conflicts with other modules
: "${HUB_REALM:=dive-v3-broker-usa}"
export HUB_REALM

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

    # SSOT: Use "dive-shared" as the canonical network name
    # This matches docker-compose.hub.yml and spoke docker-compose files
    local network_name="dive-shared"

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

##
# Get Keycloak port for a spoke instance
#
# Arguments:
#   $1 - Instance code (e.g., FRA, USA)
#
# Returns:
#   Keycloak HTTPS port number
#
# Uses: get_instance_ports() SSOT for port calculation
##
_get_spoke_keycloak_port() {
    local code="$1"
    local code_upper="${code^^}"

    # Use the centralized get_instance_ports function
    eval "$(get_instance_ports "$code_upper")"

    echo "$SPOKE_KEYCLOAK_HTTPS_PORT"
}

upper() {
    echo "$1" | tr '[:lower:]' '[:upper:]'
}

lower() {
    echo "$1" | tr '[:upper:]' '[:lower:]'
}

##
# Get Keycloak admin password from container environment (SSOT helper)
# Handles both modern Keycloak 26+ (KC_BOOTSTRAP_ADMIN_PASSWORD) and legacy
#
# Arguments:
#   $1 - Container name
#
# Returns:
#   Password string on stdout, or empty if not found
##
get_keycloak_password() {
    local container="${1:?Container name required}"
    local password=""

    # Try KC_BOOTSTRAP_ADMIN_PASSWORD first (Keycloak 26+)
    password=$(docker exec "$container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')

    # Fallback to legacy KEYCLOAK_ADMIN_PASSWORD
    if [ -z "$password" ]; then
        password=$(docker exec "$container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    fi

    echo "$password"
}

# Resolve container name based on environment/prefix, with override support.
# Hub deployments use "dive-hub-*", spoke uses "dive-spoke-{code}-*"
container_name() {
    local service="$1"
    local instance_code="${2:-${INSTANCE:-}}"
    local prefix="${CONTAINER_PREFIX:-}"

    if [ -z "$prefix" ]; then
        if [ "$ENVIRONMENT" = "pilot" ]; then
            prefix="dive-pilot"
        elif [ -n "$instance_code" ]; then
            local code_upper
            code_upper=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
            if [ "$code_upper" = "USA" ] || [ "$code_upper" = "HUB" ]; then
                prefix="dive-hub"
            else
                local code_lower
                code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
                prefix="dive-spoke-${code_lower}"
            fi
        else
            # Fallback - check if we're in hub context
            if [ "${COMPOSE_PROJECT_NAME:-}" = "dive-hub" ]; then
                prefix="dive-hub"
            else
                prefix="dive-v3"
            fi
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
    # SSOT: Use certificates.sh module for all certificate operations
    # This matches the spoke pipeline approach for consistency

    # Ensure mkcert is installed and CA present
    if ! command -v mkcert >/dev/null 2>&1; then
        log_error "mkcert not installed. Install mkcert and trust the local CA."
        return 1
    fi

    local caroot
    caroot=$(mkcert -CAROOT 2>/dev/null || true)
    if [ -z "$caroot" ]; then
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

    if [ ! -f "$ca_key" ] || [ ! -f "$ca_cert" ]; then
        log_error "mkcert CA still missing at ${caroot}; please run mkcert -install manually"
        return 1
    fi

    # Determine certificate target directory based on context
    local cert_dir="${DIVE_ROOT}/instances/hub/certs"

    # Check if valid certificates already exist
    if [ -f "$cert_dir/certificate.pem" ] && [ -f "$cert_dir/key.pem" ]; then
        # Verify certificate hasn't expired
        local expiry_check
        expiry_check=$(openssl x509 -in "$cert_dir/certificate.pem" -checkend 86400 2>/dev/null && echo "valid" || echo "expiring")
        if [ "$expiry_check" = "valid" ]; then
            log_info "Hub certificates exist and are valid - skipping regeneration"
            log_info "To force regeneration: rm -f $cert_dir/certificate.pem"
            # Still sync mkcert CA to truststores
            _sync_mkcert_ca_to_hub
            return 0
        fi
        log_warn "Certificate expiring within 24h - regenerating"
    fi

    log_step "Generating hub certificates via SSOT (instances/hub/certs)..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would generate certificates to $cert_dir"
        return 0
    fi

    mkdir -p "$cert_dir"

    # Hub certificate SANs - same approach as spoke pipeline
    local hostnames="localhost 127.0.0.1 ::1 host.docker.internal"

    # Hub container names (SSOT naming convention)
    hostnames="$hostnames dive-hub-keycloak dive-hub-backend dive-hub-frontend"
    hostnames="$hostnames dive-hub-opa dive-hub-opal-server dive-hub-kas"
    hostnames="$hostnames dive-hub-mongodb dive-hub-postgres dive-hub-redis"
    hostnames="$hostnames dive-hub-redis-blacklist dive-hub-authzforce"

    # Service aliases (used in compose networks)
    hostnames="$hostnames keycloak backend frontend opa opal-server kas"
    hostnames="$hostnames mongodb postgres redis redis-blacklist authzforce"

    # External access
    hostnames="$hostnames *.dive25.com usa-idp.dive25.com usa-api.dive25.com usa-app.dive25.com"

    # Generate certificate
    # shellcheck disable=SC2086
    if mkcert -key-file "$cert_dir/key.pem" \
              -cert-file "$cert_dir/certificate.pem" \
              $hostnames 2>/dev/null; then
        chmod 600 "$cert_dir/key.pem"
        chmod 644 "$cert_dir/certificate.pem"
        log_success "Hub certificates generated to $cert_dir"

        # Sync mkcert CA to truststores
        _sync_mkcert_ca_to_hub

        return 0
    else
        log_error "Failed to generate hub certificates"
        return 1
    fi
}

# Helper: Sync mkcert root CA to hub truststores
_sync_mkcert_ca_to_hub() {
    local caroot
    caroot=$(mkcert -CAROOT 2>/dev/null || true)
    local hub_cert_dir="${DIVE_ROOT}/instances/hub/certs"
    local hub_truststore="${DIVE_ROOT}/instances/hub/truststores"

    if [ -f "$caroot/rootCA.pem" ]; then
        mkdir -p "$hub_cert_dir" "$hub_truststore"
        cp "$caroot/rootCA.pem" "$hub_cert_dir/mkcert-rootCA.pem" 2>/dev/null || true
        cp "$caroot/rootCA.pem" "$hub_cert_dir/rootCA.pem" 2>/dev/null || true
        cp "$caroot/rootCA.pem" "$hub_truststore/mkcert-rootCA.pem" 2>/dev/null || true
        chmod 644 "$hub_cert_dir/mkcert-rootCA.pem" "$hub_cert_dir/rootCA.pem" 2>/dev/null || true
        log_verbose "Synced mkcert CA to hub truststores"
    fi
}

# =============================================================================
# SECRETS LOADING (used by multiple modules)
# =============================================================================

# Ensure required GCP secrets exist, generating them if necessary
ensure_gcp_secrets_exist() {
    local instance="${1:-usa}"
    local inst_lc
    inst_lc=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    local project="${GCP_PROJECT:-dive25}"

    log_step "Ensuring GCP secrets exist for $(upper "$instance")..."

    if [ "$DRY_RUN" = true ]; then
        log_dry "Would check/create secrets in GCP Secret Manager"
        return 0
    fi

    check_gcloud || { log_error "GCP authentication required"; return 1; }

    # Function to generate a secure password
    generate_secure_password() {
        openssl rand -base64 32 | tr -d '/+=' | head -c 24
    }

    # Function to create secret if it doesn't exist
    create_secret_if_missing() {
        local secret_name="$1"
        local description="$2"

        if ! gcloud secrets describe "$secret_name" --project="$project" >/dev/null 2>&1; then
            local password
            password=$(generate_secure_password)
            log_info "Creating GCP secret: $secret_name"

            echo -n "$password" | gcloud secrets create "$secret_name" \
                --project="$project" \
                --data-file=- \
                --description="$description" \
                --labels=environment="$ENVIRONMENT",instance="$inst_lc",managed-by=dive-cli,created-by="$(whoami)@$(hostname)",created-at="$(date -u +%Y%m%d-%H%M%S)"
        fi
    }

    # Create instance-specific secrets
    create_secret_if_missing "dive-v3-postgres-${inst_lc}" "PostgreSQL password for ${instance} database"
    create_secret_if_missing "dive-v3-keycloak-${inst_lc}" "Keycloak admin password for ${instance}"
    create_secret_if_missing "dive-v3-mongodb-${inst_lc}" "MongoDB root password for ${instance}"
    create_secret_if_missing "dive-v3-auth-secret-${inst_lc}" "JWT/Auth secret for ${instance}"

    # Create shared secrets (only once)
    create_secret_if_missing "dive-v3-keycloak-client-secret" "Shared Keycloak client secret"
    create_secret_if_missing "dive-v3-redis-blacklist" "Shared Redis blacklist password"

    log_success "All GCP secrets verified/created for $(upper "$instance")"
}

load_gcp_secrets() {
    local instance="${1:-usa}"
    # Normalize instance to lowercase for secret names (secrets use lowercase suffixes)
    local inst_lc
    inst_lc=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    # Use configured project, default to dive25 if not set
    local project="${GCP_PROJECT:-dive25}"

    # Debug: show which project/instance we will query (verbose-only to avoid stdout pollution)
    log_verbose "[secrets-debug] project=${project} instance=${inst_lc}"

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
                log_verbose "[secrets-debug] loaded $name (len=${#value})"
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

    # CRITICAL: Only load from GCP if not already set (preserve .env values)
    [ -z "${POSTGRES_PASSWORD:-}" ] && fetch_first_secret POSTGRES_PASSWORD "dive-v3-postgres-${inst_lc}"
    [ -z "${KEYCLOAK_ADMIN_PASSWORD:-}" ] && fetch_first_secret KEYCLOAK_ADMIN_PASSWORD "dive-v3-keycloak-${inst_lc}"
    [ -z "${MONGO_PASSWORD:-}" ] && fetch_first_secret MONGO_PASSWORD "dive-v3-mongodb-${inst_lc}"
    [ -z "${AUTH_SECRET:-}" ] && fetch_first_secret AUTH_SECRET "dive-v3-auth-secret-${inst_lc}"
    [ -z "${KEYCLOAK_CLIENT_SECRET:-}" ] && fetch_first_secret KEYCLOAK_CLIENT_SECRET "dive-v3-keycloak-client-secret" "dive-v3-keycloak-client-secret-${inst_lc}"
    [ -z "${REDIS_PASSWORD:-}" ] && fetch_first_secret REDIS_PASSWORD "dive-v3-redis-blacklist" "dive-v3-redis-${inst_lc}"

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
    # FIX: Only load spoke passwords when actually needed (federation setup), not during clean slate hub deployment
    # Spoke passwords are only needed when:
    #   1. Setting up federation with existing spokes (federation-link.sh, federation-setup.sh)
    #   2. Spoke registration operations
    # They are NOT needed during initial clean slate hub deployment
    if [ "$inst_lc" = "usa" ] || [ "$inst_lc" = "hub" ]; then
        # Only load spoke passwords if explicitly requested via LOAD_SPOKE_PASSWORDS=true
        # OR if we're in a context where federation is being set up (detected via function call context)
        # Default: Skip during clean slate hub deployment to avoid unnecessary GCP calls
        if [ "${LOAD_SPOKE_PASSWORDS:-false}" = "true" ] || [ "${FEDERATION_SETUP:-false}" = "true" ]; then
            log_verbose "Loading spoke Keycloak passwords for federation operations..."
            for spoke in gbr fra deu can; do
                local spoke_uc=$(echo "$spoke" | tr '[:lower:]' '[:upper:]')
                local spoke_password
                if spoke_password=$(gcloud secrets versions access latest --secret="dive-v3-keycloak-${spoke}" --project="$project" 2>/dev/null); then
                    eval "export KEYCLOAK_ADMIN_PASSWORD_${spoke_uc}='${spoke_password}'"
                    log_verbose "[secrets-debug] loaded KEYCLOAK_ADMIN_PASSWORD_${spoke_uc} (len=${#spoke_password})"
                else
                    log_verbose "Could not load KEYCLOAK_ADMIN_PASSWORD_${spoke_uc} (spoke may not exist yet)"
                fi
            done
        else
            # Clean slate hub deployment - skip spoke password loading
            # They will be loaded on-demand when federation is actually set up
            log_verbose "Skipping spoke password loading (clean slate hub deployment - not needed until federation setup)"
        fi
    fi

    # Align NextAuth/JWT to AUTH secret unless explicitly provided
    [ -n "$AUTH_SECRET" ] && export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-$AUTH_SECRET}"
    [ -n "$AUTH_SECRET" ] && export JWT_SECRET="${JWT_SECRET:-$AUTH_SECRET}"

    # KC_ADMIN_PASSWORD is the SSOT naming convention for docker-compose
    export KC_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD"

    # OPAL authentication token - generate from AUTH_SECRET if not explicitly set
    if [ -z "${OPAL_AUTH_MASTER_TOKEN:-}" ] && [ -n "$AUTH_SECRET" ]; then
        # Generate a deterministic token from AUTH_SECRET for OPAL
        export OPAL_AUTH_MASTER_TOKEN=$(echo -n "opal-${AUTH_SECRET}" | openssl dgst -sha256 | awk '{print $2}' | cut -c1-64)
    fi

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

    # Note: Environment variables are now available for docker-compose
    # The --env-file flag in hub/services.sh ensures .env.hub is still used as fallback
    log_success "Secrets loaded from GCP"

    log_success "Secrets loaded from GCP"
    return 0
}

load_local_defaults() {
    # SECURITY: Load from .env.hub if available (contains GCP-synced secrets)
    # No hardcoded defaults - secrets MUST be in .env file or GCP Secret Manager

    local env_file="${DIVE_ROOT}/.env.hub"

    if [ -f "$env_file" ] && [ -s "$env_file" ]; then
        log_warn "⚠️  USING LOCAL ENV FILE: $env_file"
        log_warn "This file should contain GCP-synced secrets (use ./dive secrets sync)"

        # Export variables from .env.hub
        set -a
        source "$env_file" 2>/dev/null || {
            log_error "Failed to source $env_file"
            return 1
        }
        set +a

        log_success "Secrets loaded from local env file"
        return 0
    fi

    log_error "FATAL: No secrets available (no GCP access and no .env.hub file)"
    log_error ""
    log_error "To fix this issue:"
    log_error "  1. Ensure GCP authentication: gcloud auth application-default login"
    log_error "  2. Run: ./dive secrets sync ${INSTANCE:-usa}"
    log_error ""
    log_error "Or manually create .env.hub with required secrets"
    return 1
}

##
# Activate GCP service account for secret access
# Automatically uses service account key from gcp/ directory if available
#
# Returns:
#   0 if GCP is authenticated (user or service account)
#   1 if GCP is not available
##
activate_gcp_service_account() {
    local instance="${1:-usa}"
    local inst_lc
    inst_lc=$(echo "$instance" | tr '[:upper:]' '[:lower:]')

    # Check if already authenticated
    if gcloud auth application-default print-access-token &>/dev/null 2>&1; then
        log_verbose "GCP already authenticated (user or service account)"
        return 0
    fi

    # Try to use service account key if available
    local sa_key_file="${DIVE_ROOT}/gcp/${inst_lc}-sa-key.json"

    if [ -f "$sa_key_file" ]; then
        log_info "Activating GCP service account from $sa_key_file..."

        # Set GOOGLE_APPLICATION_CREDENTIALS for automatic authentication
        export GOOGLE_APPLICATION_CREDENTIALS="$sa_key_file"

        # Verify service account works
        if gcloud auth application-default print-access-token &>/dev/null 2>&1; then
            log_success "GCP service account activated successfully"
            return 0
        else
            log_warn "Service account key found but authentication failed"
            unset GOOGLE_APPLICATION_CREDENTIALS
            return 1
        fi
    fi

    # Try usa key as fallback (hub can access all spokes)
    local usa_sa_key="${DIVE_ROOT}/gcp/usa-sa-key.json"
    if [ "$inst_lc" != "usa" ] && [ -f "$usa_sa_key" ]; then
        log_info "Using USA service account as fallback..."
        export GOOGLE_APPLICATION_CREDENTIALS="$usa_sa_key"

        if gcloud auth application-default print-access-token &>/dev/null 2>&1; then
            log_success "GCP service account activated (usa fallback)"
            return 0
        else
            unset GOOGLE_APPLICATION_CREDENTIALS
        fi
    fi

    log_verbose "No service account key found, user authentication required"
    return 1
}

load_secrets() {
    case "$ENVIRONMENT" in
        local|dev)
            # ENHANCED: Automatically try service account before user auth
            local gcp_available=false

            if command -v gcloud >/dev/null 2>&1; then
                # First try to activate service account (silent)
                if activate_gcp_service_account "$INSTANCE" 2>/dev/null; then
                    gcp_available=true
                    log_verbose "Using GCP service account for secrets"
                # Then check if user is authenticated
                elif gcloud auth application-default print-access-token &>/dev/null; then
                    gcp_available=true
                    log_verbose "Using GCP user authentication for secrets"
                fi
            fi

            # Prefer GCP secrets if available (can be overridden)
            local want_gcp=false
            if [ "$ENVIRONMENT" = "dev" ]; then
                # Dev: Use GCP by default if available
                if [ "${DEV_USE_GCP_SECRETS:-${USE_GCP_SECRETS:-auto}}" = "auto" ]; then
                    want_gcp="$gcp_available"
                elif [ "${DEV_USE_GCP_SECRETS:-${USE_GCP_SECRETS:-true}}" = "true" ]; then
                    want_gcp=true
                fi
            else
                # Local: Explicit opt-in or auto-detect
                if [ "${USE_GCP_SECRETS:-auto}" = "auto" ]; then
                    want_gcp="$gcp_available"
                elif [ "${USE_GCP_SECRETS:-}" = "true" ]; then
                    want_gcp=true
                fi
            fi

            if [ "$want_gcp" = true ]; then
                if [ "$gcp_available" = false ]; then
                    # Try one more time with explicit activation (with output)
                    if activate_gcp_service_account "$INSTANCE"; then
                        gcp_available=true
                    else
                        log_error "❌ GCP secrets requested but authentication failed"
                        log_error ""
                        log_error "Options:"
                        log_error "  1. User authentication: gcloud auth application-default login"
                        log_error "  2. Service account: Place key in gcp/${INSTANCE,,}-sa-key.json"
                        log_error "  3. Local development: export ALLOW_INSECURE_LOCAL_DEVELOPMENT=true"
                        log_error ""
                        return 1
                    fi
                fi
                ensure_gcp_secrets_exist "$INSTANCE" || return 1
                load_gcp_secrets "$INSTANCE" || return 1
                return 0
            fi

            # Local development without GCP - require explicit opt-in
            if [ "${ALLOW_INSECURE_LOCAL_DEVELOPMENT:-false}" = "true" ]; then
                log_warn "⚠️  USING INSECURE LOCAL DEVELOPMENT MODE ⚠️"
                log_warn "This should NEVER be used in shared or production environments"
                load_local_defaults
            else
                log_error "❌ No GCP Secret Manager access"
                if [ "$gcp_available" = false ] && command -v gcloud >/dev/null 2>&1; then
                    log_error ""
                    log_error "Authentication Options:"
                    log_error "  1. User auth:    gcloud auth application-default login"
                    log_error "  2. Service acct: Place key in gcp/${INSTANCE,,}-sa-key.json"
                    log_error "  3. Auto-detect:  export USE_GCP_SECRETS=auto (default)"
                    log_error "  4. Local dev:    export ALLOW_INSECURE_LOCAL_DEVELOPMENT=true"
                    log_error ""
                elif ! command -v gcloud >/dev/null 2>&1; then
                    log_error ""
                    log_error "GCP CLI not found. Install with:"
                    log_error "  https://cloud.google.com/sdk/docs/install"
                    log_error ""
                    log_error "Or use local development mode:"
                    log_error "  export ALLOW_INSECURE_LOCAL_DEVELOPMENT=true"
                    log_error ""
                fi
                return 1
            fi
            ;;
        gcp|pilot|prod|staging)
            # Production: Activate service account, then load secrets
            activate_gcp_service_account "$INSTANCE" || {
                log_error "Failed to activate service account in $ENVIRONMENT environment"
                return 1
            }
            load_gcp_secrets "$INSTANCE" || return 1
            ;;
        *)
            log_error "Unknown environment: $ENVIRONMENT"
            return 1
            ;;
    esac
}

# Get the correct external ports for a spoke instance
_get_spoke_ports() {
    local code="$1"
    local code_lc
    code_lc=$(echo "$code" | tr '[:upper:]' '[:lower:]')

    # Load NATO country data to get port offsets
    if [ -z "${NATO_COUNTRIES_LOADED:-}" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/../nato-countries.sh" 2>/dev/null || true
        export NATO_COUNTRIES_LOADED=1
    fi

    # Calculate port offsets (same logic as nato-countries.sh)
    local offset=0
    case "$code_lc" in
        gbr) offset=1 ;;
        fra) offset=2 ;;
        deu) offset=3 ;;
        can) offset=4 ;;
        dnk) offset=5 ;;
        pol) offset=6 ;;
        nor) offset=7 ;;
        esp) offset=8 ;;
        ita) offset=9 ;;
        bel) offset=10 ;;
        alb) offset=11 ;;
        hrv) offset=12 ;;
        est) offset=13 ;;
        lva) offset=14 ;;
        ltu) offset=15 ;;
        lux) offset=16 ;;
        nld) offset=17 ;;
        svk) offset=18 ;;
        svn) offset=19 ;;
        swe) offset=20 ;;
        tur) offset=21 ;;
        hun) offset=22 ;;
        bgr) offset=23 ;;
        rou) offset=24 ;;
        prt) offset=25 ;;
        grc) offset=26 ;;
        isl) offset=27 ;;
        mne) offset=28 ;;
        cze) offset=29 ;;
        fin) offset=30 ;;
        nzl) offset=32 ;;  # NZL is at offset 32
        *) offset=0 ;;      # USA and others at base ports
    esac

    # Export the calculated ports
    export SPOKE_FRONTEND_PORT=$((3000 + offset))
    export SPOKE_BACKEND_PORT=$((4000 + offset))
    export SPOKE_KEYCLOAK_HTTPS_PORT=$((8443 + offset))
    export SPOKE_KEYCLOAK_HTTP_PORT=$((8080 + offset))  # Keycloak HTTP management port
    export SPOKE_OPA_PORT=$((8181 + offset))
    export SPOKE_KAS_PORT=$((9000 + offset))  # Fixed: was 8080 (conflicted with Keycloak HTTP)
    export SPOKE_POSTGRES_PORT=$((5432 + offset))
    export SPOKE_MONGODB_PORT=$((27017 + offset))
    export SPOKE_REDIS_PORT=$((6379 + offset))

    # Output for eval
    echo "SPOKE_FRONTEND_PORT=$SPOKE_FRONTEND_PORT"
    echo "SPOKE_BACKEND_PORT=$SPOKE_BACKEND_PORT"
    echo "SPOKE_KEYCLOAK_HTTPS_PORT=$SPOKE_KEYCLOAK_HTTPS_PORT"
    echo "SPOKE_KEYCLOAK_HTTP_PORT=$SPOKE_KEYCLOAK_HTTP_PORT"  # Added HTTP port
    echo "SPOKE_OPA_PORT=$SPOKE_OPA_PORT"
    echo "SPOKE_KAS_PORT=$SPOKE_KAS_PORT"
    echo "SPOKE_POSTGRES_PORT=$SPOKE_POSTGRES_PORT"
    echo "SPOKE_MONGODB_PORT=$SPOKE_MONGODB_PORT"
    echo "SPOKE_REDIS_PORT=$SPOKE_REDIS_PORT"
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
            # FIX (2026-01-15): Realm name includes instance code suffix (dive-v3-broker-{code})
            export KEYCLOAK_ISSUER="${KEYCLOAK_ISSUER:-https://${inst_lc}-idp.dive25.com/realms/dive-v3-broker-${inst_lc}}"
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
            # FIX (2026-01-15): Realm name includes instance code suffix (dive-v3-broker-{code})
            export KEYCLOAK_ISSUER="${KEYCLOAK_ISSUER:-https://${inst_lc}-idp.dive25.com/realms/dive-v3-broker-${inst_lc}}"
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
    elif type -t is_custom_test_code &>/dev/null && is_custom_test_code "$code_upper" 2>/dev/null; then
        # Custom test codes (TST, DEV, QAA, etc.) get offsets 200+ from iso-countries.sh
        if type -t get_custom_test_offset &>/dev/null; then
            port_offset=$(get_custom_test_offset "$code_upper" 2>/dev/null || echo "200")
        else
            port_offset=200  # Default for test codes if function not available
        fi
    elif type -t is_iso_country &>/dev/null && is_iso_country "$code_upper" 2>/dev/null; then
        # ISO countries (non-NATO, non-Partner) use calculated offsets 40-199
        if type -t get_iso_country_offset &>/dev/null; then
            port_offset=$(get_iso_country_offset "$code_upper" 2>/dev/null || echo "40")
        fi
    else
        # Unknown countries: use hash-based offset (48+) to avoid conflicts
        port_offset=$(( ($(echo "$code_upper" | cksum | cut -d' ' -f1) % 20) + 48 ))
        # FIXED (Dec 2025): Redirect warning to stderr to avoid polluting stdout
        # This function's stdout is captured by eval, so logging must go to stderr
        log_warn "Country '$code_upper' not in NATO database, using hash-based port offset: $port_offset" >&2
    fi

    # Export calculated ports (can be sourced or eval'd)
    # Port scheme ensures no conflicts for 100+ simultaneous spokes
    # FIXED: Changed OPA from 8181+(offset*10) to 9100+offset to avoid conflicts
    # FIXED (Jan 2026): Changed Keycloak HTTP from 8080+offset to 8100+offset
    #                   to avoid conflict with Hub KAS at 8085
    echo "export SPOKE_PORT_OFFSET=$port_offset"
    echo "export SPOKE_FRONTEND_PORT=$((3000 + port_offset))"
    echo "export SPOKE_BACKEND_PORT=$((4000 + port_offset))"
    echo "export SPOKE_KEYCLOAK_HTTPS_PORT=$((8443 + port_offset))"
    echo "export SPOKE_KEYCLOAK_HTTP_PORT=$((8100 + port_offset))"
    echo "export SPOKE_POSTGRES_PORT=$((5432 + port_offset))"
    echo "export SPOKE_MONGODB_PORT=$((27017 + port_offset))"
    echo "export SPOKE_REDIS_PORT=$((6379 + port_offset))"
    echo "export SPOKE_OPA_PORT=$((9100 + port_offset))"
    echo "export SPOKE_KAS_PORT=$((10000 + port_offset))"
}

##
# Wait for Keycloak Admin API to be fully ready
#
# This function ensures Keycloak is not just "healthy" according to Docker,
# but that the admin API is fully initialized and ready to accept requests.
#
# Background:
# Docker healthchecks often pass before Keycloak admin console is ready,
# causing authentication failures during federation setup. This was masked
# by retry logic (removed in Phase 1) which was a bandaid fix.
#
# Arguments:
#   $1 - Container name (e.g., "dive-hub-keycloak" or "dive-spoke-est-keycloak")
#   $2 - Max wait time in seconds (default: 180)
#   $3 - Admin password (optional, will try to retrieve if not provided)
#
# Returns:
#   0 - Admin API ready
#   1 - Timeout or error
#
# Usage:
#   wait_for_keycloak_admin_api_ready "dive-spoke-est-keycloak" 180
#   wait_for_keycloak_admin_api_ready "dive-hub-keycloak" 120 "$admin_password"
##
wait_for_keycloak_admin_api_ready() {
    local container_name="${1:?container name required}"
    local max_wait="${2:-180}"  # 3 minutes default
    local admin_password="${3:-}"

    log_verbose "Waiting for Keycloak admin API to be ready: $container_name (max ${max_wait}s)"

    # Extract instance type and code from container name
    local instance_type="hub"
    local instance_code=""
    if [[ "$container_name" =~ spoke-([a-z]+)-keycloak ]]; then
        instance_type="spoke"
        instance_code="${BASH_REMATCH[1]}"
    fi

    # Check 1: Container must be running
    if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
        log_error "Container not running: $container_name"
        return 1
    fi

    # Check 2: Container must be healthy
    local start_time=$(date +%s)
    local elapsed=0
    local healthy=false

    while [ $elapsed -lt $max_wait ]; do
        local health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "unknown")

        if [ "$health_status" = "healthy" ]; then
            healthy=true
            log_verbose "Container healthy after ${elapsed}s"
            break
        fi

        sleep 2
        elapsed=$(( $(date +%s) - start_time ))

        if [ $((elapsed % 10)) -eq 0 ]; then
            log_verbose "Waiting for container health... ${elapsed}s elapsed (status: $health_status)"
        fi
    done

    if [ "$healthy" = "false" ]; then
        log_error "Container did not become healthy within ${max_wait}s"
        return 1
    fi

    # Check 3: Admin user can authenticate
    # Get admin password if not provided
    if [ -z "$admin_password" ]; then
        if [ "$instance_type" = "hub" ]; then
            # Hub: Try KC_BOOTSTRAP_ADMIN_PASSWORD, then KEYCLOAK_ADMIN_PASSWORD
            admin_password="${KC_BOOTSTRAP_ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD:-}}"

            # Try to get from GCP if still empty
            if [ -z "$admin_password" ] && command -v gcloud &>/dev/null; then
                admin_password=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-usa --project=dive25 2>/dev/null || echo "")
            fi
        else
            # Spoke: Get from GCP or environment
            local code_upper=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
            local pass_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
            admin_password="${!pass_var:-}"

            if [ -z "$admin_password" ] && command -v gcloud &>/dev/null; then
                admin_password=$(gcloud secrets versions access latest --secret="dive-v3-keycloak-${instance_code}" --project=dive25 2>/dev/null || echo "")
            fi
        fi
    fi

    if [ -z "$admin_password" ]; then
        log_error "Cannot verify admin API readiness: admin password not available"
        log_verbose "Checked: function argument, KC_BOOTSTRAP_ADMIN_PASSWORD, KEYCLOAK_ADMIN_PASSWORD, GCP secrets"
        return 1
    fi

    # Check 4: Can authenticate and get token
    local authenticated=false
    start_time=$(date +%s)
    elapsed=0

    while [ $elapsed -lt $max_wait ]; do
        # Try to get admin token
        local auth_response
        auth_response=$(docker exec "$container_name" curl -s --max-time 10 \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" \
            -d "username=admin" \
            -d "password=${admin_password}" \
            -d "client_id=admin-cli" 2>&1)

        # Check if we got a token
        local access_token
        access_token=$(echo "$auth_response" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

        if [ -n "$access_token" ]; then
            authenticated=true
            log_verbose "Admin API authenticated successfully after ${elapsed}s"
            break
        fi

        # Log errors for debugging (verbose only)
        if echo "$auth_response" | grep -q "error"; then
            local error_desc=$(echo "$auth_response" | grep -o '"error_description":"[^"]*' | cut -d'"' -f4)
            if [ -n "$error_desc" ] && [ $((elapsed % 30)) -eq 0 ]; then
                log_verbose "Authentication error: $error_desc (will retry)"
            fi
        fi

        sleep 2
        elapsed=$(( $(date +%s) - start_time ))

        if [ $((elapsed % 15)) -eq 0 ]; then
            log_verbose "Waiting for admin API authentication... ${elapsed}s elapsed"
        fi
    done

    if [ "$authenticated" = "false" ]; then
        log_error "Admin API did not become ready within ${max_wait}s"
        log_error "Container is healthy but authentication fails - Keycloak may still be initializing"
        return 1
    fi

    # Check 5: Master realm is accessible
    local realm_check
    realm_check=$(docker exec "$container_name" curl -s --max-time 5 \
        "http://localhost:8080/realms/master" 2>&1)

    if ! echo "$realm_check" | grep -q '"realm":"master"'; then
        log_warn "Master realm not fully accessible yet, but authentication works"
        # Don't fail - authentication working is sufficient
    fi

    log_success "Keycloak admin API ready: $container_name (total wait: ${elapsed}s)"
    return 0
}

# Ensure DIVE_ROOT is set
ensure_dive_root() {
    if [ -z "$DIVE_ROOT" ]; then
        local root_path
        root_path="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
        export DIVE_ROOT="$root_path"
    fi
}

##
# Detect and return Docker command location
# Handles Docker Desktop on macOS where docker may not be in PATH
# Returns full path to docker binary or 'docker' if in PATH
##
detect_docker_command() {
    # Check if docker is in PATH
    if command -v docker >/dev/null 2>&1; then
        echo "docker"
        return 0
    fi

    # Try common Docker Desktop locations
    local docker_paths=(
        "/usr/local/bin/docker"
        "/Applications/Docker.app/Contents/Resources/bin/docker"
        "/opt/homebrew/bin/docker"
    )

    for docker_path in "${docker_paths[@]}"; do
        if [ -x "$docker_path" ]; then
            echo "$docker_path"
            return 0
        fi
    done

    # Docker not found
    return 1
}

# Initialize Docker command (called once at module load)
if [ -z "$DOCKER_CMD" ]; then
    if DOCKER_CMD=$(detect_docker_command); then
        export DOCKER_CMD
    else
        # Don't fail here - let individual commands handle the error
        export DOCKER_CMD="docker"
    fi
fi

# =============================================================================
# DEPLOYMENT MODE DETECTION
# =============================================================================

##
# Detect if running in production mode
#
# Production mode is detected when:
#   - DIVE_ENV=production explicitly set
#   - KUBERNETES_SERVICE_HOST is set (running in K8s cluster)
#
# Production mode enforces stricter security requirements:
#   - All secrets must come from GCP Secret Manager
#   - No .env file fallbacks allowed
#   - All security warnings become hard failures
#   - No optional services (all services required)
#
# Returns:
#   0 - Production mode detected
#   1 - Development/test mode
##
is_production_mode() {
    [ "${DIVE_ENV:-}" = "production" ] || [ -n "${KUBERNETES_SERVICE_HOST:-}" ]
}


