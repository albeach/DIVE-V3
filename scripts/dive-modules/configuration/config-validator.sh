#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Configuration Validation Pre-flight
# =============================================================================
# Validates all configuration before deployment begins. Collects ALL errors
# before failing (not fail-fast) so operators can fix everything in one pass.
#
# Usage:
#   config_validate "hub"                    # Validate hub deployment config
#   config_validate "spoke" "FRA"            # Validate spoke deployment config
#   config_validate "hub" "" "--strict"      # Strict mode (warnings become errors)
# =============================================================================

# Prevent multiple sourcing
if [ -n "${CONFIG_VALIDATOR_LOADED:-}" ]; then
    return 0
fi
export CONFIG_VALIDATOR_LOADED=1

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# VALIDATION STATE
# =============================================================================

_CV_ERRORS=()
_CV_WARNINGS=()

_cv_error() {
    _CV_ERRORS+=("$1")
}

_cv_warn() {
    _CV_WARNINGS+=("$1")
}

_cv_reset() {
    _CV_ERRORS=()
    _CV_WARNINGS=()
}

# =============================================================================
# INDIVIDUAL CHECKS
# =============================================================================

##
# Check that a required variable is set and non-empty
#
# Arguments:
#   $1 - Variable name
#   $2 - Human-readable description
##
_config_check_required() {
    local var_name="$1"
    local description="$2"

    if [ -z "${!var_name:-}" ]; then
        _cv_error "$description: \$$var_name is not set (export $var_name=<value> or add to config/dive-defaults.env)"
    fi
}

##
# Check that a variable is one of allowed values
#
# Arguments:
#   $1 - Variable name
#   $2 - Comma-separated allowed values
#   $3 - Human-readable description
##
_config_check_enum() {
    local var_name="$1"
    local allowed="$2"
    local description="$3"

    local value="${!var_name:-}"
    [ -z "$value" ] && return 0  # Empty handled by _config_check_required

    local found=false
    IFS=',' read -ra vals <<< "$allowed"
    for v in "${vals[@]}"; do
        if [ "$value" = "$v" ]; then
            found=true
            break
        fi
    done

    if [ "$found" = false ]; then
        _cv_error "$description: \$$var_name='$value' is not valid (allowed: $allowed)"
    fi
}

##
# Check Docker daemon is running
##
_config_check_docker() {
    if ! docker info >/dev/null 2>&1; then
        _cv_error "Docker: daemon is not running or not accessible (start Docker Desktop or dockerd)"
    fi
}

##
# Check required compose file exists
#
# Arguments:
#   $1 - Type: hub or spoke
#   $2 - Instance code (for spoke)
##
_config_check_compose_file() {
    local type="$1"
    local instance_code="${2:-}"

    if [ "$type" = "hub" ]; then
        local compose_file="${DIVE_ROOT}/docker/docker-compose.hub.yml"
        if [ ! -f "$compose_file" ]; then
            _cv_error "Hub compose: $compose_file not found"
        fi
    else
        local code_lower
        code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')
        local spoke_dir="${DIVE_ROOT}/docker/spokes/${code_lower}"
        if [ ! -d "$spoke_dir" ]; then
            _cv_warn "Spoke directory: $spoke_dir not found (will be created during init)"
        fi
    fi
}

##
# Check Vault is reachable (if secrets provider is vault)
##
_config_check_vault_reachable() {
    local provider="${SECRETS_PROVIDER:-vault}"
    [ "$provider" != "vault" ] && return 0

    local vault_addr="${VAULT_ADDR:-https://localhost:8200}"

    # Only check if Vault container is expected to be running
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-vault"; then
        if ! curl -sk --max-time 3 "${vault_addr}/v1/sys/health" >/dev/null 2>&1; then
            _cv_warn "Vault: not responding at $vault_addr (may start during deployment)"
        fi
    fi
}

##
# Check GCP authentication (if secrets provider is gcp)
##
_config_check_gcp_auth() {
    local provider="${SECRETS_PROVIDER:-vault}"
    [ "$provider" != "gcp" ] && return 0

    if ! command -v gcloud >/dev/null 2>&1; then
        _cv_error "GCP: gcloud CLI not installed (required when SECRETS_PROVIDER=gcp)"
        return
    fi

    if ! gcloud auth print-access-token >/dev/null 2>&1; then
        _cv_error "GCP: not authenticated (run 'gcloud auth login')"
    fi

    if [ -z "${GCP_PROJECT:-}" ]; then
        _cv_warn "GCP: GCP_PROJECT not set (will use gcloud default project)"
    fi
}

##
# Check AWS credentials (if secrets provider is aws)
##
_config_check_aws_auth() {
    local provider="${SECRETS_PROVIDER:-vault}"
    [ "$provider" != "aws" ] && return 0

    if ! command -v aws >/dev/null 2>&1; then
        _cv_error "AWS: aws CLI not installed (required when SECRETS_PROVIDER=aws)"
        return
    fi

    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        _cv_error "AWS: credentials not valid (run 'aws configure' or set AWS_ACCESS_KEY_ID)"
    fi
}

##
# Check Cloudflare API token (if domain mode requires it)
##
_config_check_cloudflare_token() {
    # Only relevant for non-local environments with custom domains
    local env="${ENVIRONMENT:-local}"
    [ "$env" = "local" ] && return 0

    if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
        # Validate token format (should be non-empty string)
        if [ ${#CLOUDFLARE_API_TOKEN} -lt 20 ]; then
            _cv_warn "Cloudflare: API token looks too short (expected 40+ chars)"
        fi
    else
        _cv_warn "Cloudflare: CLOUDFLARE_API_TOKEN not set (DNS records won't be auto-managed)"
    fi
}

##
# Check Hub API is reachable (spoke deploy only)
#
# Arguments:
#   $1 - Instance code
##
_config_check_hub_reachable() {
    local instance_code="$1"

    # Get hub URL
    local hub_url="${DIVE_HUB_URL:-${HUB_FALLBACK_URL:-}}"
    if [ -z "$hub_url" ]; then
        # Try to derive from config
        if type spoke_config_get &>/dev/null; then
            hub_url=$(spoke_config_get "$instance_code" "endpoints.hubUrl" "")
        fi
    fi

    # In local mode, check localhost
    local env="${ENVIRONMENT:-local}"
    if [ "$env" = "local" ]; then
        hub_url="https://localhost:4000"
    fi

    if [ -n "$hub_url" ]; then
        if ! curl -sk --max-time 5 "${hub_url}/health" >/dev/null 2>&1; then
            _cv_warn "Hub API: not reachable at $hub_url (is hub deployed?)"
        fi
    else
        _cv_warn "Hub API: URL not configured (spoke may fail to federate)"
    fi
}

##
# Check defaults file is loaded
##
_config_check_defaults_loaded() {
    if [ ! -f "${DIVE_ROOT}/config/dive-defaults.env" ]; then
        _cv_warn "Config: config/dive-defaults.env not found (using built-in fallbacks)"
    fi
}

# =============================================================================
# MAIN VALIDATION ENTRY POINT
# =============================================================================

##
# Validate configuration for a deployment type
#
# Arguments:
#   $1 - Deployment type: "hub" or "spoke"
#   $2 - Instance code (required for spoke, optional for hub)
#   $3 - Optional flags: "--strict" makes warnings into errors
#
# Returns:
#   0 - Validation passed
#   1 - Validation failed (errors found)
##
config_validate() {
    local deploy_type="${1:?Usage: config_validate hub|spoke [INSTANCE_CODE] [--strict]}"
    local instance_code="${2:-}"
    local strict="${3:-}"

    _cv_reset

    log_step "Validating ${deploy_type} deployment configuration..."

    # --- Common checks ---
    _config_check_defaults_loaded
    _config_check_docker
    _config_check_enum "ENVIRONMENT" "local,dev,staging,production" "Environment"
    _config_check_enum "SECRETS_PROVIDER" "vault,gcp,aws,local" "Secrets provider"

    # Cloud provider auth
    _config_check_vault_reachable
    _config_check_gcp_auth
    _config_check_aws_auth

    # --- Hub-specific checks ---
    if [ "$deploy_type" = "hub" ]; then
        _config_check_compose_file "hub"

        # Check hub-specific env vars
        if [ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ] && [ ${#KEYCLOAK_ADMIN_PASSWORD} -lt 8 ]; then
            _cv_warn "Keycloak: admin password is shorter than 8 characters"
        fi
    fi

    # --- Spoke-specific checks ---
    if [ "$deploy_type" = "spoke" ]; then
        if [ -z "$instance_code" ]; then
            _cv_error "Spoke validation: instance code is required"
        else
            _config_check_compose_file "spoke" "$instance_code"
            _config_check_hub_reachable "$instance_code"
            _config_check_cloudflare_token
        fi
    fi

    # --- Report results ---
    local error_count=${#_CV_ERRORS[@]}
    local warn_count=${#_CV_WARNINGS[@]}

    # Treat warnings as errors in strict mode
    if [ "$strict" = "--strict" ]; then
        for w in "${_CV_WARNINGS[@]}"; do
            _CV_ERRORS+=("(strict) $w")
        done
        error_count=${#_CV_ERRORS[@]}
        warn_count=0
    fi

    # Display warnings
    if [ $warn_count -gt 0 ]; then
        log_warn "Configuration warnings ($warn_count):"
        for w in "${_CV_WARNINGS[@]}"; do
            echo "  ⚠  $w"
        done
    fi

    # Display errors
    if [ $error_count -gt 0 ]; then
        log_error "Configuration errors ($error_count):"
        for e in "${_CV_ERRORS[@]}"; do
            echo "  ✗  $e"
        done
        echo ""
        log_error "Fix the above errors before deploying. Run './dive config validate' to re-check."
        return 1
    fi

    if [ $warn_count -gt 0 ]; then
        log_success "Configuration valid ($warn_count warning(s))"
    else
        log_success "Configuration valid"
    fi
    return 0
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f config_validate
export -f _config_check_required
export -f _config_check_enum
export -f _config_check_docker
export -f _config_check_compose_file
export -f _config_check_vault_reachable
export -f _config_check_gcp_auth
export -f _config_check_aws_auth
export -f _config_check_cloudflare_token
export -f _config_check_hub_reachable
export -f _config_check_defaults_loaded

log_verbose "Config validator module loaded"
