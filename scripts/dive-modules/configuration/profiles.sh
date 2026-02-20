#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Deployment Profiles
# =============================================================================
# Named configuration profiles for different environments. Save, load,
# switch, and delete profiles.
#
# Usage:
#   ./dive profile save <name>       # Save current config as named profile
#   ./dive profile load <name>       # Activate a profile
#   ./dive profile list              # Show available profiles
#   ./dive profile delete <name>     # Remove a profile
#   ./dive profile show <name>       # Display profile contents
#   ./dive --profile <name> hub deploy  # Use profile for this command
# =============================================================================

# Prevent multiple sourcing
if [ -n "${PROFILES_LOADED:-}" ]; then
    return 0
fi
export PROFILES_LOADED=1

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# PROFILE PATHS
# =============================================================================

_PROFILE_DIR="${DIVE_ROOT}/config/profiles"
_PROFILE_ACTIVE_FILE="${_PROFILE_DIR}/.active"

# Keys to include in profile snapshots
_PROFILE_KEYS=(
    ENVIRONMENT
    DIVE_DEFAULT_DOMAIN
    DIVE_DOMAIN_SUFFIX
    DIVE_CLOUD_PROVIDER
    SECRETS_PROVIDER
    GCP_PROJECT
    AWS_REGION
    DIVE_AWS_KEY_PAIR
    HUB_REALM
    HUB_FALLBACK_URL
    SEED_COUNT
    CLOUDFLARE_API_TOKEN
    KEYCLOAK_VERSION
    MONGODB_VERSION
    POSTGRES_VERSION
    NODE_VERSION
)

# =============================================================================
# COMMANDS
# =============================================================================

##
# Save current config as a named profile
#
# Arguments:
#   $1 - Profile name
##
profile_save() {
    local name="${1:?Usage: ./dive profile save <name>}"

    # Validate name
    if [[ ! "$name" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        log_error "Invalid profile name: $name (use alphanumeric, hyphens, underscores)"
        return 1
    fi

    mkdir -p "$_PROFILE_DIR"

    local profile_file="${_PROFILE_DIR}/${name}.env"

    {
        echo "# DIVE V3 Deployment Profile: $name"
        echo "# Saved: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo "# Active environment: ${ENVIRONMENT:-local}"
        echo ""
        for key in "${_PROFILE_KEYS[@]}"; do
            local value="${!key:-}"
            if [ -n "$value" ]; then
                echo "${key}=${value}"
            fi
        done
    } > "$profile_file"

    log_success "Profile '$name' saved to $profile_file"
}

##
# Load (activate) a named profile
#
# Arguments:
#   $1 - Profile name
##
profile_load() {
    local name="${1:?Usage: ./dive profile load <name>}"

    local profile_file="${_PROFILE_DIR}/${name}.env"

    if [ ! -f "$profile_file" ]; then
        log_error "Profile '$name' not found"
        log_info "Available profiles:"
        profile_list
        return 1
    fi

    # Load profile values
    if type _load_dive_config_file &>/dev/null; then
        # Use existing loader (respects env var precedence)
        _load_dive_config_file "$profile_file"
    else
        # Fallback: source directly
        set -a
        # shellcheck source=/dev/null
        source "$profile_file"
        set +a
    fi

    # Mark as active
    echo "$name" > "$_PROFILE_ACTIVE_FILE"

    log_success "Profile '$name' activated"
}

##
# List available profiles
##
profile_list() {
    mkdir -p "$_PROFILE_DIR"

    local active=""
    if [ -f "$_PROFILE_ACTIVE_FILE" ]; then
        active=$(cat "$_PROFILE_ACTIVE_FILE" 2>/dev/null)
    fi

    local found=false
    echo ""
    echo "  Available Profiles:"
    echo "  ───────────────────"

    for profile_file in "$_PROFILE_DIR"/*.env; do
        [ -f "$profile_file" ] || continue
        found=true
        local pname
        pname=$(basename "$profile_file" .env)
        local penv
        penv=$(grep "^ENVIRONMENT=" "$profile_file" 2>/dev/null | cut -d= -f2)

        if [ "$pname" = "$active" ]; then
            echo "  * $pname (${penv:-?}) [active]"
        else
            echo "    $pname (${penv:-?})"
        fi
    done

    if [ "$found" = false ]; then
        echo "    (none — use './dive profile save <name>' to create one)"
    fi
    echo ""
}

##
# Delete a named profile
#
# Arguments:
#   $1 - Profile name
##
profile_delete() {
    local name="${1:?Usage: ./dive profile delete <name>}"

    local profile_file="${_PROFILE_DIR}/${name}.env"

    if [ ! -f "$profile_file" ]; then
        log_error "Profile '$name' not found"
        return 1
    fi

    if is_interactive; then
        local answer
        read -r -p "  Delete profile '$name'? [y/N]: " answer
        case "$answer" in
            [Yy]|[Yy][Ee][Ss]) ;;
            *) log_info "Delete cancelled"; return 0 ;;
        esac
    fi

    rm -f "$profile_file"

    # Clear active marker if this was the active profile
    if [ -f "$_PROFILE_ACTIVE_FILE" ]; then
        local active
        active=$(cat "$_PROFILE_ACTIVE_FILE" 2>/dev/null)
        if [ "$active" = "$name" ]; then
            rm -f "$_PROFILE_ACTIVE_FILE"
        fi
    fi

    log_success "Profile '$name' deleted"
}

##
# Show contents of a named profile
#
# Arguments:
#   $1 - Profile name
##
profile_show() {
    local name="${1:?Usage: ./dive profile show <name>}"

    local profile_file="${_PROFILE_DIR}/${name}.env"

    if [ ! -f "$profile_file" ]; then
        log_error "Profile '$name' not found"
        return 1
    fi

    echo ""
    echo "  Profile: $name"
    echo "  ─────────────"
    while IFS= read -r line; do
        # Skip comments/blanks for display
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "$line" ]] && continue
        local key="${line%%=*}"
        local val="${line#*=}"
        # Mask sensitive values
        if [[ "$key" == *TOKEN* ]] || [[ "$key" == *SECRET* ]]; then
            val="${val:0:4}****"
        fi
        printf "    %-28s %s\n" "$key:" "$val"
    done < "$profile_file"
    echo ""
}

# =============================================================================
# CLI DISPATCHER
# =============================================================================

##
# Main profile command entry point
##
module_profile() {
    local command="${1:-help}"
    shift || true

    case "$command" in
        save)    profile_save "$@" ;;
        load|activate|use)    profile_load "$@" ;;
        list|ls) profile_list ;;
        delete|rm|remove)    profile_delete "$@" ;;
        show|view)    profile_show "$@" ;;
        help|*)
            echo ""
            echo "DIVE V3 — Deployment Profiles"
            echo "=============================="
            echo ""
            echo "Usage:"
            echo "  ./dive profile save <name>         Save current config as named profile"
            echo "  ./dive profile load <name>         Activate a profile"
            echo "  ./dive profile list                Show available profiles"
            echo "  ./dive profile show <name>         Display profile contents"
            echo "  ./dive profile delete <name>       Remove a profile"
            echo ""
            echo "Per-command usage:"
            echo "  ./dive --profile <name> hub deploy   Use profile for this command"
            echo ""
            echo "Examples:"
            echo "  ./dive profile save local-dev"
            echo "  ./dive profile save aws-staging"
            echo "  ./dive profile load aws-staging"
            echo "  ./dive --profile local-dev hub deploy"
            echo ""
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f module_profile
export -f profile_save
export -f profile_load
export -f profile_list
export -f profile_delete
export -f profile_show

log_verbose "Profiles module loaded"
