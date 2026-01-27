#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Secret Synchronization Module
# =============================================================================
# Ensures secrets are consistent between:
# - GCP Secret Manager (source of truth)
# - Container environment variables (runtime)
# - .env files (persistence)
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

export DIVE_SECRET_SYNC_LOADED=1

##
# Sync container secrets to .env file
# Ensures .env file matches what containers are actually running with
#
# Arguments:
#   $1 - Instance code (e.g., DEU, BGR, USA)
#
# Returns:
#   0 - Success
#   1 - Failed
##
sync_container_secrets_to_env() {
    local instance_code="${1:?Instance code required}"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    ensure_dive_root

    local env_file
    if [ "$code_upper" = "USA" ]; then
        env_file="${DIVE_ROOT}/.env.hub"
    else
        env_file="${DIVE_ROOT}/instances/${code_lower}/.env"
    fi

    if [ ! -f "$env_file" ]; then
        log_error ".env file not found: $env_file"
        return 1
    fi

    log_step "Syncing ${code_upper} secrets: Container → .env file"

    # Backup .env
    cp "$env_file" "${env_file}.bak.$(date +%Y%m%d-%H%M%S)"

    # Get container prefix
    local container_prefix
    if [ "$code_upper" = "USA" ]; then
        container_prefix="dive-hub"
    else
        container_prefix="dive-spoke-${code_lower}"
    fi

    # Sync Keycloak admin password
    local kc_container="${container_prefix}-keycloak"
    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        local kc_password
        kc_password=$(docker exec "$kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null)

        if [ -n "$kc_password" ]; then
            local var_name="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
            update_env_var "$env_file" "$var_name" "$kc_password"
            log_success "Synced $var_name"
        fi
    fi

    # Sync PostgreSQL password
    local pg_container="${container_prefix}-postgres"
    if docker ps --format '{{.Names}}' | grep -q "^${pg_container}$"; then
        local pg_password
        pg_password=$(docker exec "$pg_container" printenv POSTGRES_PASSWORD 2>/dev/null)

        if [ -n "$pg_password" ]; then
            local var_name="POSTGRES_PASSWORD_${code_upper}"
            update_env_var "$env_file" "$var_name" "$pg_password"
            log_success "Synced $var_name"
        fi
    fi

    # Sync MongoDB password
    local mongo_container="${container_prefix}-mongodb"
    if docker ps --format '{{.Names}}' | grep -q "^${mongo_container}$"; then
        local mongo_password
        mongo_password=$(docker exec "$mongo_container" printenv MONGO_INITDB_ROOT_PASSWORD 2>/dev/null)

        if [ -n "$mongo_password" ]; then
            local var_name="MONGO_PASSWORD_${code_upper}"
            update_env_var "$env_file" "$var_name" "$mongo_password"
            log_success "Synced $var_name"
        fi
    fi

    log_success ".env file updated with container secrets"
    return 0
}

##
# Update or add environment variable in .env file
# Handles both macOS and Linux sed syntax
#
# Arguments:
#   $1 - .env file path
#   $2 - Variable name
#   $3 - Variable value
##
update_env_var() {
    local env_file="$1"
    local var_name="$2"
    local var_value="$3"

    if grep -q "^${var_name}=" "$env_file"; then
        # Update existing (portable sed for macOS + Linux)
        local tmpfile=$(mktemp)
        sed "s|^${var_name}=.*|${var_name}=${var_value}|" "$env_file" > "$tmpfile" && mv "$tmpfile" "$env_file"
    else
        # Append new
        echo "${var_name}=${var_value}" >> "$env_file"
    fi
}

##
# Module command dispatcher
##
module_secret_sync() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        sync)
            local instance="${1:?Instance code required}"
            sync_container_secrets_to_env "$instance"
            ;;
        help|*)
            echo -e "${BOLD}Secret Sync Commands:${NC}"
            echo ""
            echo "  sync <instance>    Sync container secrets to .env file"
            echo ""
            echo "Examples:"
            echo "  ./dive secret-sync sync DEU"
            echo "  ./dive secret-sync sync USA"
            ;;
    esac
}

