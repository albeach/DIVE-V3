#!/usr/bin/env bash
# =============================================================================
# Environment Synchronization Utility
# =============================================================================
# Centralized functions to sync secrets between containers, .env files, and GCP
# =============================================================================

# Source common utilities
if [ -f "$(dirname "${BASH_SOURCE[0]}")/common.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fi

##
# Sync secrets from container environment to .env file
#
# Arguments:
#   $1 - Spoke code (e.g., nld, lux)
#
# Returns:
#   0 - Success
#   1 - Failed
##
sync_spoke_secrets_to_env() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")

    ensure_dive_root

    local spoke_env="${DIVE_ROOT}/instances/${code_lower}/.env"
    local keycloak_container="dive-spoke-${code_lower}-keycloak"

    if [ ! -f "$spoke_env" ]; then
        log_warn "Spoke .env file not found: $spoke_env"
        return 1
    fi

    if ! docker ps --format '{{.Names}}' | grep -q "^${keycloak_container}$"; then
        log_warn "Keycloak container not running: $keycloak_container"
        return 1
    fi

    log_step "Syncing secrets from container to .env file..."

    # Backup .env file
    cp "$spoke_env" "${spoke_env}.bak.$(date +%Y%m%d-%H%M%S)"

    # Get secrets from container
    local kc_pass
    kc_pass=$(docker exec "$keycloak_container" env | grep "^KEYCLOAK_ADMIN_PASSWORD=" | cut -d'=' -f2 | tr -d '\n\r')

    if [ -n "$kc_pass" ]; then
        local secret_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
        if grep -q "^${secret_var}=" "$spoke_env"; then
            sed -i.tmp "s|^${secret_var}=.*|${secret_var}=${kc_pass}|" "$spoke_env"
            rm -f "${spoke_env}.tmp"
            log_success "Updated $secret_var in .env"
        else
            echo "${secret_var}=${kc_pass}" >> "$spoke_env"
            log_success "Added $secret_var to .env"
        fi
    fi

    return 0
}

##
# Sync secrets from .env file to container environment
# Note: This requires container recreation to take effect
#
# Arguments:
#   $1 - Spoke code (e.g., nld, lux)
#
# Returns:
#   0 - Success
#   1 - Failed
##
sync_env_to_container() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")

    ensure_dive_root

    local spoke_env="${DIVE_ROOT}/instances/${code_lower}/.env"

    if [ ! -f "$spoke_env" ]; then
        log_warn "Spoke .env file not found: $spoke_env"
        return 1
    fi

    log_info "Note: Environment variables are loaded at container startup"
    log_info "To apply changes, recreate containers with: docker compose up -d --force-recreate"

    return 0
}

##
# Verify secret consistency across all sources
#
# Arguments:
#   $1 - Spoke code (e.g., nld, lux)
#
# Returns:
#   0 - All secrets consistent
#   1 - Inconsistencies found
##
verify_secret_consistency() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")

    ensure_dive_root

    local spoke_env="${DIVE_ROOT}/instances/${code_lower}/.env"
    local keycloak_container="dive-spoke-${code_lower}-keycloak"
    local secret_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"

    log_step "Verifying secret consistency for $code_upper..."

    local env_pass=""
    local container_pass=""
    local gcp_pass=""
    local inconsistencies=0

    # Get password from .env file (take first match only)
    if [ -f "$spoke_env" ]; then
        env_pass=$(grep -E "^${secret_var}=" "$spoke_env" | head -1 | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d '\n\r')
    fi

    # Get password from container
    if docker ps --format '{{.Names}}' | grep -q "^${keycloak_container}$"; then
        container_pass=$(docker exec "$keycloak_container" env | grep "^KEYCLOAK_ADMIN_PASSWORD=" | cut -d'=' -f2 | tr -d '\n\r')
    fi

    # Get password from GCP (if enabled)
    if [ "${USE_GCP_SECRETS:-false}" = "true" ] && command -v gcloud >/dev/null 2>&1; then
        local secret_name="dive-v3-keycloak-${code_lower}"
        local gcp_project="${GCP_PROJECT_ID:-dive25}"
        gcp_pass=$(gcloud secrets versions access latest \
            --secret="$secret_name" \
            --project="$gcp_project" 2>/dev/null | tr -d '\n\r' || echo "")
    fi


    # Compare passwords
    if [ -n "$env_pass" ] && [ -n "$container_pass" ] && [ "$env_pass" != "$container_pass" ]; then
        log_warn "Inconsistency: .env password differs from container password"
        inconsistencies=$((inconsistencies + 1))
    fi

    if [ -n "$env_pass" ] && [ -n "$gcp_pass" ] && [ "$env_pass" != "$gcp_pass" ]; then
        log_warn "Inconsistency: .env password differs from GCP Secret Manager"
        inconsistencies=$((inconsistencies + 1))
    fi

    if [ -n "$container_pass" ] && [ -n "$gcp_pass" ] && [ "$container_pass" != "$gcp_pass" ]; then
        log_warn "Inconsistency: container password differs from GCP Secret Manager"
        inconsistencies=$((inconsistencies + 1))
    fi

    if [ $inconsistencies -eq 0 ]; then
        log_success "All secrets are consistent"
        return 0
    else
        log_warn "Found $inconsistencies inconsistency(ies)"
        return 1
    fi
}

