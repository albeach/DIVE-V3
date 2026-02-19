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
# Ensure Docker, Vault, and other tools are in PATH for all execution contexts
# (main shell, subshells, background processes, etc.)

# Add common tool directories to PATH if not already present
# Note: We add these regardless of docker availability because other tools (vault, terraform) may be in these locations
for _tool_dir in "/usr/local/bin" "/opt/homebrew/bin" "/Applications/Docker.app/Contents/Resources/bin"; do
    if [ -d "$_tool_dir" ] && [[ ":$PATH:" != *":$_tool_dir:"* ]]; then
        export PATH="$_tool_dir:$PATH"
    fi
done
unset _tool_dir

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
# Valid environments: local, dev, staging, pilot, hub
export ENVIRONMENT="${ENVIRONMENT:-${DIVE_ENV:-local}}"
export INSTANCE="${INSTANCE:-${DIVE_INSTANCE:-usa}}"
export GCP_PROJECT="${GCP_PROJECT:-dive25}"
export PILOT_VM="${PILOT_VM:-dive-v3-pilot}"
export PILOT_ZONE="${PILOT_ZONE:-us-east4-c}"
export DRY_RUN="${DRY_RUN:-false}"
export VERBOSE="${VERBOSE:-false}"
export QUIET="${QUIET:-false}"

# =============================================================================
# AWS CONFIGURATION (used by dev/staging environments)
# =============================================================================
export AWS_REGION="${AWS_REGION:-us-gov-east-1}"
export AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
export DIVE_AWS_KEY_PAIR="${DIVE_AWS_KEY_PAIR:-ABeach-SSH-Key}"
export DIVE_AWS_SSH_KEY="${DIVE_AWS_SSH_KEY:-${HOME}/.ssh/ABeach-SSH-Key.pem}"

# Source key vars from .env.hub early (before EC2 auto-config and Caddy domain computation).
# Only pulls specific vars to avoid overriding unrelated shell settings.
# NOTE: ENVIRONMENT is NOT read here — remote-exec deliberately passes --env local
# to prevent SSH recursion, and we must respect that.
if [ -f "${DIVE_ROOT}/.env.hub" ]; then
    _hub_val() { grep "^${1}=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | head -1 | cut -d= -f2-; }
    [ -z "${DIVE_DOMAIN_SUFFIX:-}" ]    && { _v=$(_hub_val DIVE_DOMAIN_SUFFIX);    [ -n "$_v" ] && export DIVE_DOMAIN_SUFFIX="$_v"; }
    [ -z "${CLOUDFLARE_API_TOKEN:-}" ]  && { _v=$(_hub_val CLOUDFLARE_API_TOKEN);  [ -n "$_v" ] && export CLOUDFLARE_API_TOKEN="$_v"; }
    [ -z "${HUB_EXTERNAL_ADDRESS:-}" ]  && { _v=$(_hub_val HUB_EXTERNAL_ADDRESS);  [ -n "$_v" ] && export HUB_EXTERNAL_ADDRESS="$_v"; }
    unset -f _hub_val; unset _v
fi

# Derive DIVE_DOMAIN_SUFFIX from ENVIRONMENT early (before Caddy domain computation at line ~290).
# remote-exec passes DIVE_DOMAIN_SUFFIX directly for EC2 deploys, so this is a fallback
# for when ./dive --env dev is run locally without remote-exec.
if [ -z "${DIVE_DOMAIN_SUFFIX:-}" ]; then
    case "${ENVIRONMENT:-local}" in
        dev)     export DIVE_DOMAIN_SUFFIX="dev.dive25.com" ;;
        staging) export DIVE_DOMAIN_SUFFIX="staging.dive25.com" ;;
    esac
fi

# EC2 instance metadata auto-detection (IMDSv2 first, then v1 fallback)
if [ -z "${INSTANCE_PRIVATE_IP:-}" ]; then
    _imds_token=$(curl -sX PUT "http://169.254.169.254/latest/api/token" \
        -H "X-aws-ec2-metadata-token-ttl-seconds: 300" -m 2 2>/dev/null || echo "")
    if [ -n "$_imds_token" ]; then
        # IMDSv2 (required on newer AWS instances)
        export INSTANCE_PRIVATE_IP="$(curl -sH "X-aws-ec2-metadata-token: $_imds_token" \
            -m 2 http://169.254.169.254/latest/meta-data/local-ipv4 2>/dev/null || echo "")"
        export INSTANCE_PUBLIC_IP="$(curl -sH "X-aws-ec2-metadata-token: $_imds_token" \
            -m 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "")"
    elif curl -sf -m 1 http://169.254.169.254/latest/meta-data/ >/dev/null 2>&1; then
        # IMDSv1 fallback
        export INSTANCE_PRIVATE_IP="$(curl -sf -m 2 http://169.254.169.254/latest/meta-data/local-ipv4)"
        export INSTANCE_PUBLIC_IP="$(curl -sf -m 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "")"
    fi
    unset _imds_token
fi

# Auto-derive HUB_EXTERNAL_ADDRESS from EC2 metadata (any environment, including local-on-EC2).
# When remote-exec dispatches hub deploy to EC2, it uses --env local to prevent recursion.
# This ensures the proxy overlay and external SANs activate on any EC2 instance.
if [ -z "${HUB_EXTERNAL_ADDRESS:-}" ] && [ -n "${INSTANCE_PUBLIC_IP:-}" ]; then
    export HUB_EXTERNAL_ADDRESS="$INSTANCE_PUBLIC_IP"
fi

# Auto-configure external access when running on EC2.
# Two modes: Caddy (domain-based, Let's Encrypt) or IP (direct IP:port, Vault PKI).
if [ -n "${HUB_EXTERNAL_ADDRESS:-}" ] && [ "$HUB_EXTERNAL_ADDRESS" != "localhost" ]; then

    if [ -n "${DIVE_DOMAIN_SUFFIX:-}" ]; then
        # =================================================================
        # CADDY MODE — Domain-based URLs (Let's Encrypt TLS on port 443)
        # =================================================================
        # Caddy handles external access; services stay on 127.0.0.1.
        export BIND_ADDRESS="${BIND_ADDRESS:-127.0.0.1}"

        # Derive domain names: dev.dive25.com → dev, usa → dev-usa-{service}.dive25.com
        _country_lower="$(echo "${INSTANCE:-usa}" | tr '[:upper:]' '[:lower:]')"
        _env_prefix="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f1)"
        _base_domain="$(echo "${DIVE_DOMAIN_SUFFIX}" | cut -d. -f2-)"

        export CADDY_DOMAIN_APP="${CADDY_DOMAIN_APP:-${_env_prefix}-${_country_lower}-app.${_base_domain}}"
        export CADDY_DOMAIN_API="${CADDY_DOMAIN_API:-${_env_prefix}-${_country_lower}-api.${_base_domain}}"
        export CADDY_DOMAIN_IDP="${CADDY_DOMAIN_IDP:-${_env_prefix}-${_country_lower}-idp.${_base_domain}}"
        export CADDY_DOMAIN_OPAL="${CADDY_DOMAIN_OPAL:-${_env_prefix}-${_country_lower}-opal.${_base_domain}}"
        export CADDY_DOMAIN_VAULT="${CADDY_DOMAIN_VAULT:-${_env_prefix}-${_country_lower}-vault.${_base_domain}}"

        unset _country_lower _env_prefix _base_domain

        # Keycloak issuer — must match the domain users see in their browser
        export KEYCLOAK_HOSTNAME="${CADDY_DOMAIN_IDP}"

        # Browser-facing URLs (domain-based, standard HTTPS port — no :PORT suffix)
        export NEXT_PUBLIC_API_URL="https://${CADDY_DOMAIN_API}"
        export NEXT_PUBLIC_BACKEND_URL="https://${CADDY_DOMAIN_API}"
        export NEXT_PUBLIC_BASE_URL="https://${CADDY_DOMAIN_APP}"
        export NEXT_PUBLIC_KEYCLOAK_URL="https://${CADDY_DOMAIN_IDP}"
        export NEXTAUTH_URL="https://${CADDY_DOMAIN_APP}"
        export AUTH_URL="https://${CADDY_DOMAIN_APP}"
        export KEYCLOAK_ISSUER="https://${CADDY_DOMAIN_IDP}/realms/${HUB_REALM:-dive-v3-broker-usa}"
        export AUTH_KEYCLOAK_ISSUER="https://${CADDY_DOMAIN_IDP}/realms/${HUB_REALM:-dive-v3-broker-usa}"
        export KEYCLOAK_URL="https://${CADDY_DOMAIN_IDP}"

        # TRUSTED_ISSUERS — backend needs both external (browser tokens) and internal (container) issuers
        export TRUSTED_ISSUERS="https://${CADDY_DOMAIN_IDP}/realms/${HUB_REALM:-dive-v3-broker-usa},https://keycloak:8443/realms/${HUB_REALM:-dive-v3-broker-usa},https://localhost:8443/realms/${HUB_REALM:-dive-v3-broker-usa}"

        # External domains list for CORS and CSP
        export NEXT_PUBLIC_EXTERNAL_DOMAINS="https://${CADDY_DOMAIN_APP},https://${CADDY_DOMAIN_API},https://${CADDY_DOMAIN_IDP}"
        # Host-accessible URLs for scripts (localhost, standard ports)
        export HUB_KC_URL="https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}"
        export HUB_BACKEND_URL="https://localhost:${BACKEND_PORT:-4000}"
        export HUB_OPAL_URL="https://localhost:${OPAL_PORT:-7002}"

        # Terraform Keycloak provider (runs on host, connects via localhost)
        export TF_VAR_keycloak_url="https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}"

        # Enable Caddy compose profile
        export DIVE_CADDY_ENABLED="true"

        # Persist Caddy domains and derived URLs to .env.hub so Docker Compose picks them up
        # (shell exports don't survive container recreation / reboot)
        if [ -f "${DIVE_ROOT}/.env.hub" ]; then
            _caddy_set() { local k="$1" v="$2"; if grep -q "^${k}=" "${DIVE_ROOT}/.env.hub" 2>/dev/null; then sed -i "s|^${k}=.*|${k}=${v}|" "${DIVE_ROOT}/.env.hub" 2>/dev/null || sed -i '' "s|^${k}=.*|${k}=${v}|" "${DIVE_ROOT}/.env.hub"; else echo "${k}=${v}" >> "${DIVE_ROOT}/.env.hub"; fi; }
            _caddy_set "CADDY_DOMAIN_APP" "${CADDY_DOMAIN_APP}"
            _caddy_set "CADDY_DOMAIN_API" "${CADDY_DOMAIN_API}"
            _caddy_set "CADDY_DOMAIN_IDP" "${CADDY_DOMAIN_IDP}"
            _caddy_set "CADDY_DOMAIN_OPAL" "${CADDY_DOMAIN_OPAL}"
            _caddy_set "CADDY_DOMAIN_VAULT" "${CADDY_DOMAIN_VAULT}"
            _caddy_set "KEYCLOAK_HOSTNAME" "${CADDY_DOMAIN_IDP}"
            _caddy_set "NEXT_PUBLIC_API_URL" "https://${CADDY_DOMAIN_API}"
            _caddy_set "NEXT_PUBLIC_BACKEND_URL" "https://${CADDY_DOMAIN_API}"
            _caddy_set "NEXT_PUBLIC_BASE_URL" "https://${CADDY_DOMAIN_APP}"
            _caddy_set "NEXT_PUBLIC_KEYCLOAK_URL" "https://${CADDY_DOMAIN_IDP}"
            _caddy_set "NEXTAUTH_URL" "https://${CADDY_DOMAIN_APP}"
            _caddy_set "AUTH_URL" "https://${CADDY_DOMAIN_APP}"
            _caddy_set "KEYCLOAK_ISSUER" "https://${CADDY_DOMAIN_IDP}/realms/${HUB_REALM:-dive-v3-broker-usa}"
            _caddy_set "AUTH_KEYCLOAK_ISSUER" "https://${CADDY_DOMAIN_IDP}/realms/${HUB_REALM:-dive-v3-broker-usa}"
            _caddy_set "KEYCLOAK_URL" "https://${CADDY_DOMAIN_IDP}"
            _caddy_set "TRUSTED_ISSUERS" "${TRUSTED_ISSUERS}"
            _caddy_set "NEXT_PUBLIC_EXTERNAL_DOMAINS" "${NEXT_PUBLIC_EXTERNAL_DOMAINS}"
            unset -f _caddy_set
        fi

    else
        # =================================================================
        # IP MODE — Direct IP:port access (Vault PKI certs, no Caddy)
        # =================================================================
        # Services bind to 0.0.0.0 for direct external access.
        export BIND_ADDRESS="${BIND_ADDRESS:-0.0.0.0}"

        export KEYCLOAK_HOSTNAME="${KEYCLOAK_HOSTNAME:-${HUB_EXTERNAL_ADDRESS}}"

        export NEXT_PUBLIC_API_URL="https://${HUB_EXTERNAL_ADDRESS}:${BACKEND_PORT:-4000}"
        export NEXT_PUBLIC_BACKEND_URL="https://${HUB_EXTERNAL_ADDRESS}:${BACKEND_PORT:-4000}"
        export NEXT_PUBLIC_BASE_URL="https://${HUB_EXTERNAL_ADDRESS}:${FRONTEND_PORT:-3000}"
        export NEXT_PUBLIC_KEYCLOAK_URL="https://${HUB_EXTERNAL_ADDRESS}:${KEYCLOAK_HTTPS_PORT:-8443}"
        export NEXTAUTH_URL="https://${HUB_EXTERNAL_ADDRESS}:${FRONTEND_PORT:-3000}"
        export AUTH_URL="https://${HUB_EXTERNAL_ADDRESS}:${FRONTEND_PORT:-3000}"
        export KEYCLOAK_ISSUER="https://${HUB_EXTERNAL_ADDRESS}:${KEYCLOAK_HTTPS_PORT:-8443}/realms/${HUB_REALM:-dive-v3-broker-usa}"
        export AUTH_KEYCLOAK_ISSUER="https://${HUB_EXTERNAL_ADDRESS}:${KEYCLOAK_HTTPS_PORT:-8443}/realms/${HUB_REALM:-dive-v3-broker-usa}"
        export KEYCLOAK_URL="https://${HUB_EXTERNAL_ADDRESS}:${KEYCLOAK_HTTPS_PORT:-8443}"

        export HUB_KC_URL="https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}"
        export HUB_BACKEND_URL="https://localhost:${BACKEND_PORT:-4000}"
        export HUB_OPAL_URL="https://localhost:${OPAL_PORT:-7002}"

        export TF_VAR_keycloak_url="https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}"
    fi
fi

# Environment-specific AWS defaults
case "$ENVIRONMENT" in
    dev)
        export DIVE_AWS_INSTANCE_TYPE="${DIVE_AWS_INSTANCE_TYPE:-t3.xlarge}"
        export DIVE_AWS_VOLUME_SIZE="${DIVE_AWS_VOLUME_SIZE:-100}"
        export SECRETS_PROVIDER="${SECRETS_PROVIDER:-vault}"
        export DIVE_DOCKER_BUILD_MODE="${DIVE_DOCKER_BUILD_MODE:-source}"
        export DIVE_DOMAIN_SUFFIX="${DIVE_DOMAIN_SUFFIX:-dev.dive25.com}"
        export HUB_EXTERNAL_ADDRESS="${HUB_EXTERNAL_ADDRESS:-${INSTANCE_PUBLIC_IP:-localhost}}"
        ;;
    staging)
        export DIVE_AWS_INSTANCE_TYPE="${DIVE_AWS_INSTANCE_TYPE:-t3.2xlarge}"
        export DIVE_AWS_VOLUME_SIZE="${DIVE_AWS_VOLUME_SIZE:-200}"
        export SECRETS_PROVIDER="${SECRETS_PROVIDER:-vault}"
        export DIVE_DOCKER_BUILD_MODE="${DIVE_DOCKER_BUILD_MODE:-source}"
        export DIVE_DOMAIN_SUFFIX="${DIVE_DOMAIN_SUFFIX:-staging.dive25.com}"
        export HUB_EXTERNAL_ADDRESS="${HUB_EXTERNAL_ADDRESS:-${INSTANCE_PUBLIC_IP:-localhost}}"
        ;;
esac

# Configurable timeouts (override via environment variables)
export DIVE_TIMEOUT_KEYCLOAK_READY="${DIVE_TIMEOUT_KEYCLOAK_READY:-30}"  # Reduced from 180s - containers already healthy by federation phase
export DIVE_TIMEOUT_CURL_DEFAULT="${DIVE_TIMEOUT_CURL_DEFAULT:-10}"
export DIVE_TIMEOUT_CURL_QUICK="${DIVE_TIMEOUT_CURL_QUICK:-5}"
export DIVE_TIMEOUT_POLL_INTERVAL="${DIVE_TIMEOUT_POLL_INTERVAL:-2}"
export DIVE_TIMEOUT_FEDERATION_STABILIZE="${DIVE_TIMEOUT_FEDERATION_STABILIZE:-35}"
export DIVE_TIMEOUT_OPAL_STABILIZE="${DIVE_TIMEOUT_OPAL_STABILIZE:-45}"
export DIVE_TIMEOUT_VAULT_SEAL_READY="${DIVE_TIMEOUT_VAULT_SEAL_READY:-30}"
export DIVE_TIMEOUT_VAULT_CLUSTER_READY="${DIVE_TIMEOUT_VAULT_CLUSTER_READY:-60}"
export DIVE_TIMEOUT_VAULT_ROTATION="${DIVE_TIMEOUT_VAULT_ROTATION:-300}"
export VAULT_AUDIT_LOG_MAX_SIZE_MB="${VAULT_AUDIT_LOG_MAX_SIZE_MB:-100}"
export VAULT_AUDIT_LOG_RETENTION_DAYS="${VAULT_AUDIT_LOG_RETENTION_DAYS:-30}"

# Spoke list — no default; spokes are provisioned on demand via: ./dive vault provision <CODE>
export DIVE_SPOKE_LIST="${DIVE_SPOKE_LIST:-}"

##
# Discover provisioned spokes dynamically
# Priority: 1) DIVE_SPOKE_LIST env var  2) Vault AppRoles  3) instances/ directories
# Results cached in _DIVE_PROVISIONED_SPOKES for the session
##
dive_get_provisioned_spokes() {
    # Return cached result if available
    if [ -n "${_DIVE_PROVISIONED_SPOKES:-}" ]; then
        echo "$_DIVE_PROVISIONED_SPOKES"
        return 0
    fi

    # If DIVE_SPOKE_LIST is explicitly set, use it
    if [ -n "${DIVE_SPOKE_LIST:-}" ]; then
        _DIVE_PROVISIONED_SPOKES="$DIVE_SPOKE_LIST"
        echo "$_DIVE_PROVISIONED_SPOKES"
        return 0
    fi

    local spokes=""

    # Try Vault AppRole listing
    if command -v vault >/dev/null 2>&1 && vault status >/dev/null 2>&1; then
        local roles
        roles=$(vault list -format=json auth/approle/role/ 2>/dev/null || echo "[]")
        spokes=$(echo "$roles" | grep '"spoke-' | sed 's/.*"spoke-\([^"]*\)".*/\1/' | tr '\n' ' ' | sed 's/ $//')
    fi

    # Fallback: scan instances/ for any deployed spoke (has .env or docker-compose.yml)
    if [ -z "$spokes" ] && [ -d "${DIVE_ROOT}/instances" ]; then
        for dir in "${DIVE_ROOT}/instances"/*/; do
            [ -d "$dir" ] || continue
            local code=$(basename "$dir")
            [ "$code" = "usa" ] && continue
            [[ "$code" == .* ]] && continue
            if [ -f "${dir}.env" ] || [ -f "${dir}docker-compose.yml" ]; then
                spokes="${spokes:+$spokes }${code}"
            fi
        done
    fi

    _DIVE_PROVISIONED_SPOKES="$spokes"
    echo "$_DIVE_PROVISIONED_SPOKES"
}

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
# LEGACY dive-v3-broker-usa (without suffix) is DEPRECATED and should not exist
# FIX (2026-01-18): Use conditional assignment to avoid readonly conflicts with other modules
: "${HUB_REALM:=dive-v3-broker-usa}"
export HUB_REALM

# Hub API URL - Environment aware
# - LOCAL: Use localhost hub
# - DEV/STAGING: Use HUB_EXTERNAL_ADDRESS (auto-detected on EC2, or set manually)
# - GCP/PILOT: Use production hub
case "$ENVIRONMENT" in
    local)
        export HUB_API_URL="${DIVE_HUB_URL:-https://localhost:4000}"
        ;;
    dev)
        export HUB_API_URL="${DIVE_HUB_URL:-https://${HUB_EXTERNAL_ADDRESS:-localhost}:4000}"
        ;;
    staging)
        export HUB_API_URL="${DIVE_HUB_URL:-https://${HUB_EXTERNAL_ADDRESS:-localhost}:4000}"
        ;;
    *)
        export HUB_API_URL="${DIVE_HUB_URL:-https://usa-api.dive25.com}"
        ;;
esac

# Derived hub URLs for cross-instance communication (set when hub is remote)
if [ -n "${HUB_EXTERNAL_ADDRESS:-}" ] && [ "$HUB_EXTERNAL_ADDRESS" != "localhost" ]; then
    export HUB_KC_URL="${HUB_KC_URL:-https://${HUB_EXTERNAL_ADDRESS}:8443}"
    export HUB_OPAL_URL="${HUB_OPAL_URL:-https://${HUB_EXTERNAL_ADDRESS}:7002}"
    export HUB_VAULT_URL="${HUB_VAULT_URL:-https://${HUB_EXTERNAL_ADDRESS}:8200}"
fi

# =============================================================================
# ENVIRONMENT DETECTION HELPERS
# =============================================================================

##
# Returns true (0) when running on a cloud/EC2 instance (NOT local dev).
# Used to skip mkcert code paths and enable cloud-specific behavior.
##
is_cloud_environment() {
    [ -n "${INSTANCE_PRIVATE_IP:-}" ] && return 0
    { [ -n "${HUB_EXTERNAL_ADDRESS:-}" ] && [ "$HUB_EXTERNAL_ADDRESS" != "localhost" ]; } && return 0
    return 1
}
export -f is_cloud_environment

# =============================================================================
# NETWORK MANAGEMENT (LOCAL DEV ONLY)
# =============================================================================

# Ensure shared network exists for local cross-instance communication
# Only used when hub + spokes run on same server (development)
# In production, instances use external domains (no shared network needed)
ensure_shared_network() {
    # Create shared network in local/dev/staging environments (hub+spoke on same host)
    # In production, instances use external domains (no shared network needed)
    case "$ENVIRONMENT" in
        local|dev|staging) ;;
        *) return 0 ;;
    esac

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

# Preferred case conversion API (POSIX-compatible via tr).
# Use these instead of bash-isms like ${var^^} or ${var,,} for consistency.
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
    docker exec "$container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r'
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

log_success_inline() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error_inline() {
    echo -e "${RED}❌ $1${NC}"
}

log_warn_inline() {
    echo -e "${YELLOW}⚠️  $1${NC}"
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

    # Vault PKI path: if CERT_PROVIDER=vault, issue from Vault and return early
    if type use_vault_pki &>/dev/null && use_vault_pki; then
        log_info "CERT_PROVIDER=vault — using Vault PKI for hub certificates"
        if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
            source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
        fi
        if type generate_hub_certificate_vault &>/dev/null && generate_hub_certificate_vault; then
            return 0
        fi
        log_warn "Vault PKI cert issuance failed — trying fallback"
    fi

    local cert_dir="${DIVE_ROOT}/instances/hub/certs"

    # Check if valid certificates already exist
    if [ -f "$cert_dir/certificate.pem" ] && [ -f "$cert_dir/key.pem" ]; then
        local expiry_check
        expiry_check=$(openssl x509 -in "$cert_dir/certificate.pem" -checkend 86400 2>/dev/null && echo "valid" || echo "expiring")
        if [ "$expiry_check" = "valid" ]; then
            log_info "Hub certificates exist and are valid - skipping regeneration"
            is_cloud_environment || _sync_mkcert_ca_to_hub
            return 0
        fi
        log_warn "Certificate expiring within 24h - regenerating"
    fi

    # Cloud/EC2: generate OpenSSL self-signed certs (no mkcert dependency)
    if is_cloud_environment; then
        log_info "Cloud environment: generating hub certificate with OpenSSL..."
        mkdir -p "$cert_dir"
        local san_str="DNS:localhost,DNS:backend,DNS:keycloak,DNS:frontend,DNS:opal-server,DNS:kas,DNS:postgres,DNS:mongodb,DNS:redis,IP:127.0.0.1"
        [ -n "${INSTANCE_PRIVATE_IP:-}" ] && san_str="${san_str},IP:${INSTANCE_PRIVATE_IP}"
        [ -n "${INSTANCE_PUBLIC_IP:-}" ] && san_str="${san_str},IP:${INSTANCE_PUBLIC_IP}"
        [ -n "${HUB_EXTERNAL_ADDRESS:-}" ] && [ "$HUB_EXTERNAL_ADDRESS" != "localhost" ] && san_str="${san_str},DNS:${HUB_EXTERNAL_ADDRESS}"
        if openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
            -keyout "${cert_dir}/key.pem" -out "${cert_dir}/certificate.pem" \
            -subj "/CN=hub.dive-v3.local" \
            -addext "subjectAltName=${san_str}" 2>/dev/null; then
            chmod 644 "${cert_dir}/key.pem" "${cert_dir}/certificate.pem"
            cp "${cert_dir}/certificate.pem" "${cert_dir}/fullchain.pem" 2>/dev/null || true
            _rebuild_ca_bundle 2>/dev/null || true
            log_success "Hub certificates generated (OpenSSL self-signed)"
            return 0
        fi
        log_error "OpenSSL certificate generation failed"
        return 1
    fi

    # Local dev: use mkcert
    if ! command -v mkcert >/dev/null 2>&1; then
        log_error "mkcert not installed. Install: brew install mkcert && mkcert -install"
        return 1
    fi

    local caroot
    caroot=$(mkcert -CAROOT 2>/dev/null || true)
    [ -z "$caroot" ] && caroot="${HOME}/Library/Application Support/mkcert"

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

    log_step "Generating hub certificates via SSOT (instances/hub/certs)..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would generate certificates to $cert_dir"
        return 0
    fi

    mkdir -p "$cert_dir"

    # Hub certificate SANs — delegate to SSOT in certificates.sh
    if ! type _hub_service_sans &>/dev/null; then
        if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
            source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"
        fi
    fi

    local hostnames
    if type _hub_service_sans &>/dev/null; then
        hostnames="$(_hub_service_sans) 127.0.0.1 ::1 *.dive25.com"
    else
        hostnames="localhost 127.0.0.1 ::1 host.docker.internal"
        hostnames="$hostnames dive-hub-keycloak dive-hub-backend dive-hub-frontend"
        hostnames="$hostnames dive-hub-opa dive-hub-opal-server dive-hub-kas"
        hostnames="$hostnames dive-hub-mongodb dive-hub-postgres dive-hub-redis"
        hostnames="$hostnames dive-hub-redis-blacklist dive-hub-authzforce"
        hostnames="$hostnames keycloak backend frontend opa opal-server kas"
        hostnames="$hostnames mongodb postgres redis redis-blacklist authzforce"
        hostnames="$hostnames *.dive25.com usa-idp.dive25.com usa-api.dive25.com usa-app.dive25.com"
    fi

    # shellcheck disable=SC2086
    if mkcert -key-file "$cert_dir/key.pem" \
              -cert-file "$cert_dir/certificate.pem" \
              $hostnames 2>/dev/null; then
        chmod 644 "$cert_dir/key.pem" "$cert_dir/certificate.pem"
        log_success "Hub certificates generated to $cert_dir"
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


# Load docker and network helper functions
source "$(dirname "${BASH_SOURCE[0]}")/utilities/docker-helpers.sh"

# =============================================================================
# ENVIRONMENT PROFILE APPLICATION
# =============================================================================
# Sets environment-specific variables (URLs, CORS, etc.) based on ENVIRONMENT
# Does NOT calculate ports - use get_instance_ports() for that.
#
# Arguments:
#   Uses global $INSTANCE and $ENVIRONMENT variables
#
# Exports:
#   COMPOSE_PROJECT_NAME, NEXTAUTH_URL, KEYCLOAK_ISSUER, CORS_ALLOWED_ORIGINS, etc.
# =============================================================================
apply_environment_config() {
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
            log_warn "Unknown environment '$ENVIRONMENT' for env config; skipping config application"
            ;;
    esac

    log_verbose "Applied environment config (${ENVIRONMENT}) for instance ${inst_lc}"
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

# Load port and environment helper functions
source "$(dirname "${BASH_SOURCE[0]}")/utilities/env-helpers.sh"

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

##
# Get the Docker Compose Vault profile for the current environment.
# Returns "vault-dev" for dev/development, "vault-ha" for everything else.
##
_vault_get_profile() {
    case "${DIVE_ENV:-local}" in
        dev|development)
            echo "vault-dev"
            ;;
        *)
            echo "vault-ha"
            ;;
    esac
}
export -f _vault_get_profile

##
# Check if current environment uses Vault dev mode (single node, root token).
# Returns 0 for dev mode, 1 for HA mode.
##
_vault_is_dev_mode() {
    [ "$(_vault_get_profile)" = "vault-dev" ]
}
export -f _vault_is_dev_mode

# =============================================================================
# JSON PARSING UTILITIES
# =============================================================================

##
# Extract JSON field value using jq (BEST PRACTICE for grep pattern fix)
# Falls back to grep if jq unavailable
#
# =============================================================================
# spoke_config_get — Database SSOT spoke configuration helper
# =============================================================================
# Computes spoke configuration values from get_instance_ports() and env vars.
# Hub MongoDB is the runtime SSOT; this function provides local computation
# for shell scripts that run during deployment.
#
# Arguments:
#   $1 - Instance code (e.g., FRA, USA, GBR)
#   $2 - Field path (e.g., "ports.frontend", "endpoints.baseUrl")
#   $3 - Default value (optional)
#
# Examples:
#   frontend_port=$(spoke_config_get "FRA" "ports.frontend")
#   hub_url=$(spoke_config_get "FRA" "endpoints.hubUrl")
##
spoke_config_get() {
    local instance_code="$1"
    local field="$2"
    local default="${3:-}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    # Load port assignments from SSOT
    eval "$(get_instance_ports "$code_upper")"

    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local env_file="$spoke_dir/.env"

    case "$field" in
        ports.frontend|frontend_port)
            echo "${SPOKE_FRONTEND_PORT:-3000}" ;;
        ports.backend|backend_port)
            echo "${SPOKE_BACKEND_PORT:-4000}" ;;
        ports.keycloak|keycloak_port)
            echo "${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}" ;;
        ports.kas|kas_port)
            echo "${SPOKE_KAS_PORT:-9000}" ;;
        identity.instanceCode)
            echo "$code_upper" ;;
        identity.name)
            if [ -n "${NATO_COUNTRIES[$code_upper]:-}" ]; then
                echo "${NATO_COUNTRIES[$code_upper]}" | cut -d'|' -f1
            else
                echo "${default:-$code_upper Instance}"
            fi
            ;;
        identity.contactEmail)
            if [ -f "$env_file" ]; then
                local email
                email=$(grep "^CONTACT_EMAIL=" "$env_file" 2>/dev/null | cut -d= -f2-)
                [ -n "$email" ] && echo "$email" && return 0
            fi
            echo "${CONTACT_EMAIL:-admin@${code_lower}.dive25.com}" ;;
        identity.spokeId|spokeId)
            if [ -f "$env_file" ]; then
                local sid
                sid=$(grep "^SPOKE_ID=" "$env_file" 2>/dev/null | cut -d= -f2-)
                [ -n "$sid" ] && echo "$sid" && return 0
            fi
            echo "${SPOKE_ID:-spoke-${code_lower}}" ;;
        endpoints.hubUrl|hubUrl)
            if [ -f "$env_file" ]; then
                local hu
                hu=$(grep "^HUB_URL=" "$env_file" 2>/dev/null | cut -d= -f2-)
                [ -n "$hu" ] && echo "$hu" && return 0
            fi
            echo "${HUB_URL:-https://dive-hub-backend:4000}" ;;
        endpoints.hubApiUrl)
            local hub
            hub=$(spoke_config_get "$instance_code" "endpoints.hubUrl")
            echo "${hub}/api" ;;
        endpoints.hubOpalUrl)
            echo "https://dive-hub-opal-server:7002" ;;
        endpoints.baseUrl|baseUrl)
            echo "https://localhost:${SPOKE_FRONTEND_PORT:-3000}" ;;
        endpoints.apiUrl|apiUrl)
            echo "https://localhost:${SPOKE_BACKEND_PORT:-4000}" ;;
        endpoints.idpUrl|idpUrl)
            echo "https://dive-spoke-${code_lower}-keycloak:8443" ;;
        endpoints.idpPublicUrl|idpPublicUrl)
            echo "https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}" ;;
        endpoints.kasUrl|kasUrl)
            echo "https://localhost:${SPOKE_KAS_PORT:-9000}" ;;
        federation.status)
            echo "${default:-unregistered}" ;;
        *)
            echo "$default" ;;
    esac
}

# CRITICAL FIX (2026-02-06): Replaces fragile grep patterns like:
#   grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"'
# which cause "brackets not balanced" errors on macOS BSD grep.
#
# Arguments:
#   $1 - JSON file path
#   $2 - Field name (supports dot notation: "endpoints.baseUrl")
#   $3 - Default value (optional, defaults to empty string)
#
# Returns:
#   Field value or default
#
# Examples:
#   spoke_id=$(json_get_field "$config_file" "spokeId" "spoke-unknown")
#   hub_url=$(json_get_field "$config_file" "hubUrl" "https://hub.dive25.com")
#   base_url=$(json_get_field "$config_file" "endpoints.baseUrl" "https://localhost:3000")
##
json_get_field() {
    local file="$1"
    local field="$2"
    local default="${3:-}"

    if [ ! -f "$file" ]; then
        echo "$default"
        return 1
    fi

    # Prefer jq (correct JSON parsing)
    if command -v jq &>/dev/null; then
        local result
        result=$(jq -r ".$field // empty" "$file" 2>/dev/null)
        if [ -n "$result" ]; then
            echo "$result"
            return 0
        else
            echo "$default"
            return 0
        fi
    fi

    # Fallback to grep - may fail on nested JSON or special characters.
    # jq should always be available in DIVE environments.
    log_verbose "json_get_field: jq not available, using grep fallback for $field (may be inaccurate)"
    local simple_field="${field##*.}"  # Get last component for simple JSON
    local pattern="\"${simple_field}\"[ \\t]*:[ \\t]*\"([^\"]*)\""
    local value
    value=$(grep -Eo "$pattern" "$file" 2>/dev/null | head -1 | sed 's/.*:[ \t]*"\(.*\)"/\1/')

    if [ -n "$value" ]; then
        echo "$value"
    else
        echo "$default"
    fi
}

# Ensure DIVE_ROOT is set when common.sh is sourced
ensure_dive_root

