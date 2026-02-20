#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Configuration Management CLI
# =============================================================================
# Provides ./dive config show|set|get|validate for managing configuration
# without editing files manually.
#
# Usage:
#   ./dive config show                # Display effective config with sources
#   ./dive config get KEY             # Show effective value for KEY
#   ./dive config set KEY VALUE       # Write to config/dive-local.env
#   ./dive config validate            # Run pre-deployment validation
#   ./dive config reset               # Remove config/dive-local.env
# =============================================================================

# Prevent multiple sourcing
if [ -n "${CONFIG_MANAGER_LOADED:-}" ]; then
    return 0
fi
export CONFIG_MANAGER_LOADED=1

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIG FILES
# =============================================================================

_CONFIG_DEFAULTS="${DIVE_ROOT}/config/dive-defaults.env"
_CONFIG_LOCAL="${DIVE_ROOT}/config/dive-local.env"

# Tracked config keys (subset shown by `config show`)
_CONFIG_TRACKED_KEYS=(
    ENVIRONMENT
    DIVE_DEFAULT_DOMAIN
    DIVE_DOMAIN_SUFFIX
    DIVE_CLOUD_PROVIDER
    SECRETS_PROVIDER
    GCP_PROJECT
    AWS_REGION
    HUB_REALM
    HUB_FALLBACK_URL
    SEED_COUNT
    CLOUDFLARE_API_TOKEN
    KEYCLOAK_VERSION
    MONGODB_VERSION
    POSTGRES_VERSION
    NODE_VERSION
    BOOTSTRAP_NODE_MAJOR
    BOOTSTRAP_TERRAFORM_VERSION
    BOOTSTRAP_VAULT_VERSION
    BOOTSTRAP_OPA_VERSION
)

# =============================================================================
# HELPERS
# =============================================================================

##
# Get the source of a config value (where it comes from)
#
# Arguments:
#   $1 - Variable name
#
# Returns: source description on stdout
##
_config_get_source() {
    local key="$1"
    local value="${!key:-}"

    # Check if set via CLI flag or direct env var (not from files)
    # We check by comparing against what the files would provide
    local defaults_val=""
    local local_val=""

    if [ -f "$_CONFIG_DEFAULTS" ]; then
        defaults_val=$(grep "^${key}=" "$_CONFIG_DEFAULTS" 2>/dev/null | tail -1 | cut -d= -f2-)
    fi
    if [ -f "$_CONFIG_LOCAL" ]; then
        local_val=$(grep "^${key}=" "$_CONFIG_LOCAL" 2>/dev/null | tail -1 | cut -d= -f2-)
    fi

    if [ -z "$value" ]; then
        echo "(not set)"
    elif [ -n "$local_val" ] && [ "$value" = "$local_val" ]; then
        echo "dive-local.env"
    elif [ -n "$defaults_val" ] && [ "$value" = "$defaults_val" ]; then
        echo "dive-defaults.env"
    else
        echo "env/cli"
    fi
}

# =============================================================================
# COMMANDS
# =============================================================================

##
# Show all tracked config with sources
##
config_show() {
    echo ""
    echo "==============================================================================="
    echo "  DIVE V3 — Effective Configuration"
    echo "==============================================================================="
    echo ""
    printf "  %-32s %-30s %s\n" "KEY" "VALUE" "SOURCE"
    printf "  %-32s %-30s %s\n" "---" "-----" "------"

    for key in "${_CONFIG_TRACKED_KEYS[@]}"; do
        local value="${!key:-}"
        local source
        source=$(_config_get_source "$key")

        # Mask sensitive values
        local display_val="$value"
        if [[ "$key" == *TOKEN* ]] || [[ "$key" == *SECRET* ]] || [[ "$key" == *PASSWORD* ]]; then
            if [ -n "$value" ]; then
                display_val="${value:0:4}****"
            fi
        fi

        if [ -z "$value" ]; then
            display_val="(not set)"
        fi

        printf "  %-32s %-30s %s\n" "$key" "$display_val" "$source"
    done

    echo ""
    echo "  Config files:"
    printf "    %-30s %s\n" "Defaults:" "$_CONFIG_DEFAULTS"
    printf "    %-30s %s\n" "Local overrides:" "$_CONFIG_LOCAL"
    if [ -f "$_CONFIG_LOCAL" ]; then
        printf "    %-30s %s\n" "" "(exists)"
    else
        printf "    %-30s %s\n" "" "(not created — run ./dive setup)"
    fi
    echo ""
    echo "  Precedence: CLI flags > env vars > .env.hub > dive-local.env > dive-defaults.env"
    echo ""
    echo "==============================================================================="
    echo ""
}

##
# Get a specific config value
#
# Arguments:
#   $1 - Variable name
##
config_get() {
    local key="${1:?Usage: ./dive config get KEY}"
    local value="${!key:-}"
    local source
    source=$(_config_get_source "$key")

    if [ -z "$value" ]; then
        echo "$key is not set"
        return 1
    fi

    echo "$key=$value (source: $source)"
}

##
# Set a config value in dive-local.env
#
# Arguments:
#   $1 - Variable name
#   $2 - Value
##
config_set() {
    local key="${1:?Usage: ./dive config set KEY VALUE}"
    local value="${2:?Usage: ./dive config set KEY VALUE}"

    # Validate key format
    if [[ ! "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
        log_error "Invalid key format: $key (must be UPPER_SNAKE_CASE)"
        return 1
    fi

    # Create config dir if needed
    mkdir -p "$(dirname "$_CONFIG_LOCAL")"

    # Create file if it doesn't exist
    if [ ! -f "$_CONFIG_LOCAL" ]; then
        {
            echo "# DIVE V3 — Local Configuration Overrides"
            echo "# Generated by: ./dive config set"
            echo "# Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
            echo ""
        } > "$_CONFIG_LOCAL"
    fi

    # Check if key already exists in the file
    if grep -q "^${key}=" "$_CONFIG_LOCAL" 2>/dev/null; then
        # Update existing
        local tmp
        tmp=$(mktemp)
        sed "s|^${key}=.*|${key}=${value}|" "$_CONFIG_LOCAL" > "$tmp"
        mv "$tmp" "$_CONFIG_LOCAL"
        log_success "Updated $key=$value in dive-local.env"
    else
        # Append new
        echo "${key}=${value}" >> "$_CONFIG_LOCAL"
        log_success "Added $key=$value to dive-local.env"
    fi

    # Export so it takes effect immediately
    export "$key=$value"
}

##
# Run config validation
##
config_validate_cmd() {
    # Source validator if needed
    if ! type config_validate &>/dev/null; then
        local validator="${DIVE_ROOT}/scripts/dive-modules/configuration/config-validator.sh"
        if [ -f "$validator" ]; then
            source "$validator"
        else
            log_error "Config validator not available"
            return 1
        fi
    fi

    config_validate "hub"
}

##
# Remove dive-local.env
##
config_reset() {
    if [ ! -f "$_CONFIG_LOCAL" ]; then
        log_info "No local config to reset (dive-local.env doesn't exist)"
        return 0
    fi

    if is_interactive; then
        local answer
        read -r -p "  Remove $_CONFIG_LOCAL? [y/N]: " answer
        case "$answer" in
            [Yy]|[Yy][Ee][Ss]) ;;
            *) log_info "Reset cancelled"; return 0 ;;
        esac
    fi

    rm -f "$_CONFIG_LOCAL"
    log_success "Removed dive-local.env"
}

# =============================================================================
# CLI DISPATCHER
# =============================================================================

##
# Main config command entry point
##
module_config() {
    local command="${1:-help}"
    shift || true

    case "$command" in
        show|list)
            config_show
            ;;
        get)
            config_get "$@"
            ;;
        set)
            config_set "$@"
            ;;
        validate|check)
            config_validate_cmd
            ;;
        reset)
            config_reset
            ;;
        help|*)
            echo ""
            echo "DIVE V3 — Configuration Management"
            echo "==================================="
            echo ""
            echo "Usage:"
            echo "  ./dive config show                  Display effective config with sources"
            echo "  ./dive config get KEY               Show value and source for KEY"
            echo "  ./dive config set KEY VALUE          Set value in dive-local.env"
            echo "  ./dive config validate               Run pre-deployment validation"
            echo "  ./dive config reset                  Remove dive-local.env"
            echo ""
            echo "Config Precedence:"
            echo "  CLI flags > env vars > .env.hub > dive-local.env > dive-defaults.env"
            echo ""
            echo "Examples:"
            echo "  ./dive config set DIVE_DEFAULT_DOMAIN myorg.com"
            echo "  ./dive config set SECRETS_PROVIDER aws"
            echo "  ./dive config get ENVIRONMENT"
            echo "  ./dive config show"
            echo ""
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f module_config
export -f config_show
export -f config_get
export -f config_set

log_verbose "Config manager module loaded"
