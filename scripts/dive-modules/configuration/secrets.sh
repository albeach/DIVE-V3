#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 Secret Management Module (Consolidated)
# =============================================================================
# GCP Secret Manager integration (SSOT)
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - secrets.sh
#   - secret-sync.sh
#   - spoke/pipeline/spoke-secrets.sh
#
# CRITICAL: All secrets must come from GCP Secret Manager
# NO hardcoded secrets allowed per project rules
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_CONFIGURATION_SECRETS_LOADED" ] && return 0
export DIVE_CONFIGURATION_SECRETS_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

CONFIG_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$CONFIG_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

GCP_PROJECT_ID="${GCP_PROJECT_ID:-dive25}"
USE_GCP_SECRETS="${USE_GCP_SECRETS:-true}"

# Secret naming convention: dive-v3-<type>-<instance>
SECRET_PREFIX="dive-v3"

# =============================================================================
# GCP SECRET MANAGER FUNCTIONS
# =============================================================================

##
# Check if GCP is authenticated
##
gcp_is_authenticated() {
    gcloud auth print-access-token >/dev/null 2>&1
}

##
# Get secret from GCP Secret Manager
#
# Arguments:
#   $1 - Secret name (without prefix)
#   $2 - Instance code (optional)
#
# Returns:
#   Secret value on stdout
##
gcp_get_secret() {
    local secret_name="$1"
    local instance_code="${2:-}"

    local full_name="${SECRET_PREFIX}-${secret_name}"
    [ -n "$instance_code" ] && full_name="${full_name}-$(lower "$instance_code")"

    if [ "$USE_GCP_SECRETS" != "true" ]; then
        log_warn "GCP secrets disabled - returning empty"
        return 1
    fi

    if ! gcp_is_authenticated; then
        log_error "GCP not authenticated - run: gcloud auth application-default login"
        return 1
    fi

    gcloud secrets versions access latest \
        --secret="$full_name" \
        --project="$GCP_PROJECT_ID" \
        2>/dev/null
}

##
# Set secret in GCP Secret Manager
#
# Arguments:
#   $1 - Secret name (without prefix)
#   $2 - Secret value
#   $3 - Instance code (optional)
##
gcp_set_secret() {
    local secret_name="$1"
    local secret_value="$2"
    local instance_code="${3:-}"

    local full_name="${SECRET_PREFIX}-${secret_name}"
    [ -n "$instance_code" ] && full_name="${full_name}-$(lower "$instance_code")"

    if ! gcp_is_authenticated; then
        log_error "GCP not authenticated"
        return 1
    fi

    # Create secret if not exists
    gcloud secrets describe "$full_name" --project="$GCP_PROJECT_ID" >/dev/null 2>&1 || \
        gcloud secrets create "$full_name" --project="$GCP_PROJECT_ID" >/dev/null 2>&1

    # Add new version
    echo -n "$secret_value" | gcloud secrets versions add "$full_name" \
        --data-file=- \
        --project="$GCP_PROJECT_ID" \
        >/dev/null 2>&1

    log_verbose "Secret updated: $full_name"
}

##
# Check if secret exists
#
# Arguments:
#   $1 - Secret name (without prefix)
#   $2 - Instance code (optional)
##
gcp_secret_exists() {
    local secret_name="$1"
    local instance_code="${2:-}"

    local full_name="${SECRET_PREFIX}-${secret_name}"
    [ -n "$instance_code" ] && full_name="${full_name}-$(lower "$instance_code")"

    gcloud secrets describe "$full_name" --project="$GCP_PROJECT_ID" >/dev/null 2>&1
}

# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

##
# Get Keycloak admin password for instance
#
# Arguments:
#   $1 - Instance code
##
get_keycloak_admin_password() {
    local instance_code="$1"
    gcp_get_secret "keycloak" "$instance_code"
}

##
# Get PostgreSQL password for instance
#
# Arguments:
#   $1 - Instance code
##
get_postgres_password() {
    local instance_code="$1"
    gcp_get_secret "postgres" "$instance_code"
}

##
# Get MongoDB password for instance
#
# Arguments:
#   $1 - Instance code
##
get_mongodb_password() {
    local instance_code="$1"
    gcp_get_secret "mongodb" "$instance_code"
}

##
# Get NextAuth secret for instance
#
# Arguments:
#   $1 - Instance code
##
get_auth_secret() {
    local instance_code="$1"
    gcp_get_secret "auth-secret" "$instance_code"
}

##
# Get Keycloak client secret
##
get_keycloak_client_secret() {
    gcp_get_secret "keycloak-client-secret"
}

##
# Get federation secret between two instances
#
# Arguments:
#   $1 - Source instance code
#   $2 - Target instance code
##
get_federation_secret() {
    local source="$1"
    local target="$2"

    gcp_get_secret "federation-$(lower "$source")-$(lower "$target")"
}

# =============================================================================
# SECRET LOADING
# =============================================================================

##
# Load all secrets for an instance into environment
#
# Arguments:
#   $1 - Instance code
##
secrets_load_for_instance() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_info "Loading secrets for $instance_code..."

    if [ "$USE_GCP_SECRETS" != "true" ]; then
        log_warn "GCP secrets disabled"
        return 1
    fi

    # Load secrets into environment
    export KEYCLOAK_ADMIN_PASSWORD=$(get_keycloak_admin_password "$instance_code")
    export POSTGRES_PASSWORD=$(get_postgres_password "$instance_code")
    export MONGODB_PASSWORD=$(get_mongodb_password "$instance_code")
    export AUTH_SECRET=$(get_auth_secret "$instance_code")

    # Validate loaded
    if [ -z "$KEYCLOAK_ADMIN_PASSWORD" ]; then
        log_error "Failed to load Keycloak password - secrets may not be configured"
        log_error "Run: ./dive secrets ensure $instance_code"
        return 1
    fi

    log_success "Secrets loaded for $instance_code"
    return 0
}

##
# Export secrets as shell commands (for .env generation)
#
# Arguments:
#   $1 - Instance code
##
secrets_export() {
    local instance_code="$1"

    cat << EOF
export KEYCLOAK_ADMIN_PASSWORD='$(get_keycloak_admin_password "$instance_code")'
export POSTGRES_PASSWORD='$(get_postgres_password "$instance_code")'
export MONGODB_PASSWORD='$(get_mongodb_password "$instance_code")'
export AUTH_SECRET='$(get_auth_secret "$instance_code")'
EOF
}

# =============================================================================
# SECRET MANAGEMENT
# =============================================================================

##
# Ensure all required secrets exist for an instance
#
# Arguments:
#   $1 - Instance code
##
secrets_ensure() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_info "Ensuring secrets exist for $instance_code..."

    if ! gcp_is_authenticated; then
        log_error "GCP not authenticated - run: gcloud auth application-default login"
        return 1
    fi

    local secrets=("keycloak" "postgres" "mongodb" "auth-secret")
    local created=0

    for secret in "${secrets[@]}"; do
        if ! gcp_secret_exists "$secret" "$instance_code"; then
            log_info "Creating secret: ${SECRET_PREFIX}-${secret}-${code_lower}"

            # Generate secure random password
            local password=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
            gcp_set_secret "$secret" "$password" "$instance_code"
            ((created++))
        fi
    done

    if [ $created -gt 0 ]; then
        log_success "Created $created secrets for $instance_code"
    else
        log_info "All secrets already exist for $instance_code"
    fi

    return 0
}

##
# Rotate secrets for an instance
#
# Arguments:
#   $1 - Instance code
#   $2 - Secret type (optional, rotates all if not specified)
##
secrets_rotate() {
    local instance_code="$1"
    local secret_type="${2:-all}"
    local code_lower=$(lower "$instance_code")

    log_warn "Rotating secrets for $instance_code (type: $secret_type)..."

    if ! gcp_is_authenticated; then
        log_error "GCP not authenticated"
        return 1
    fi

    local secrets
    if [ "$secret_type" = "all" ]; then
        secrets=("keycloak" "postgres" "mongodb" "auth-secret")
    else
        secrets=("$secret_type")
    fi

    for secret in "${secrets[@]}"; do
        log_info "Rotating: ${SECRET_PREFIX}-${secret}-${code_lower}"

        # Generate new password
        local new_password=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
        gcp_set_secret "$secret" "$new_password" "$instance_code"
    done

    log_success "Secret rotation complete for $instance_code"
    log_warn "IMPORTANT: Restart services to apply new secrets"

    return 0
}

##
# Verify secrets can be accessed
#
# Arguments:
#   $1 - Instance code
##
secrets_verify() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_info "Verifying secrets for $instance_code..."

    local secrets=("keycloak" "postgres" "mongodb" "auth-secret")
    local accessible=0
    local total=${#secrets[@]}

    for secret in "${secrets[@]}"; do
        local full_name="${SECRET_PREFIX}-${secret}-${code_lower}"

        if gcp_get_secret "$secret" "$instance_code" >/dev/null 2>&1; then
            log_verbose "Accessible: $full_name"
            ((accessible++))
        else
            log_error "Not accessible: $full_name"
        fi
    done

    log_info "Secret verification: $accessible/$total accessible"

    [ $accessible -eq $total ]
}

##
# List all DIVE secrets in GCP
##
secrets_list() {
    if ! gcp_is_authenticated; then
        log_error "GCP not authenticated"
        return 1
    fi

    echo "=== DIVE Secrets in GCP (project: $GCP_PROJECT_ID) ==="
    echo ""

    gcloud secrets list --project="$GCP_PROJECT_ID" --filter="name:${SECRET_PREFIX}" \
        --format="table(name,createTime,replication.automatic.customerManagedEncryption)"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

##
# Secrets module command dispatcher
##
module_secrets() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        list)           secrets_list "$@" ;;
        ensure)         secrets_ensure "$@" ;;
        rotate)         secrets_rotate "$@" ;;
        verify)         secrets_verify "$@" ;;
        load)           secrets_load_for_instance "$@" ;;
        export)         secrets_export "$@" ;;
        get)
            local name="$1"
            local instance="${2:-}"
            gcp_get_secret "$name" "$instance"
            ;;
        set)
            local name="$1"
            local value="$2"
            local instance="${3:-}"
            gcp_set_secret "$name" "$value" "$instance"
            ;;
        help|*)
            echo "Usage: ./dive secrets <command> [args]"
            echo ""
            echo "Commands:"
            echo "  list                  List all DIVE secrets in GCP"
            echo "  ensure <CODE>         Ensure secrets exist for instance"
            echo "  rotate <CODE> [type]  Rotate secrets"
            echo "  verify <CODE>         Verify secret access"
            echo "  load <CODE>           Load secrets into environment"
            echo "  export <CODE>         Export secrets as shell commands"
            echo "  get <name> [CODE]     Get specific secret"
            echo "  set <name> <value> [CODE]  Set specific secret"
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f gcp_is_authenticated
export -f gcp_get_secret
export -f gcp_set_secret
export -f gcp_secret_exists
export -f get_keycloak_admin_password
export -f get_postgres_password
export -f get_mongodb_password
export -f get_auth_secret
export -f get_keycloak_client_secret
export -f get_federation_secret
export -f secrets_load_for_instance
export -f secrets_export
export -f secrets_ensure
export -f secrets_rotate
export -f secrets_verify
export -f secrets_list
export -f module_secrets

log_verbose "Secrets module loaded (GCP Secret Manager SSOT)"
