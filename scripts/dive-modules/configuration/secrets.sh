#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Secret Management Module (Consolidated)
# =============================================================================
# Multi-Provider Secret Manager (GCP / AWS)
# =============================================================================
# Version: 6.0.0 (AWS Support Added)
# Date: 2026-02-04
#
# Consolidates:
#   - secrets.sh
#   - secret-sync.sh
#   - spoke/pipeline/spoke-secrets.sh
#
# Supports:
#   - GCP Secret Manager (default)
#   - AWS Secrets Manager (set SECRETS_PROVIDER=aws)
#
# CRITICAL: All secrets must come from Secret Manager
# NO hardcoded secrets allowed per project rules
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_CONFIGURATION_SECRETS_LOADED:-}" ] && return 0
export DIVE_CONFIGURATION_SECRETS_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

CONFIG_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$CONFIG_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

# Provider selection: gcp or aws
SECRETS_PROVIDER="${SECRETS_PROVIDER:-gcp}"

# GCP Configuration
GCP_PROJECT_ID="${GCP_PROJECT_ID:-dive25}"
USE_GCP_SECRETS="${USE_GCP_SECRETS:-true}"

# AWS Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
USE_AWS_SECRETS="${USE_AWS_SECRETS:-false}"

# Secret naming convention: dive-v3-<type>-<instance>
SECRET_PREFIX="dive-v3"

# Auto-detect provider if not explicitly set
if [ "$SECRETS_PROVIDER" = "auto" ] || [ -z "$SECRETS_PROVIDER" ]; then
    if command -v aws >/dev/null 2>&1 && aws sts get-caller-identity >/dev/null 2>&1; then
        SECRETS_PROVIDER="aws"
        log_verbose "Auto-detected AWS credentials, using AWS Secrets Manager"
    elif command -v gcloud >/dev/null 2>&1 && gcloud auth print-access-token >/dev/null 2>&1; then
        SECRETS_PROVIDER="gcp"
        log_verbose "Auto-detected GCP credentials, using GCP Secret Manager"
    else
        SECRETS_PROVIDER="gcp"  # Default fallback
    fi
fi

# Update provider-specific flags
if [ "$SECRETS_PROVIDER" = "aws" ]; then
    USE_AWS_SECRETS="true"
    USE_GCP_SECRETS="false"
else
    USE_GCP_SECRETS="true"
    USE_AWS_SECRETS="false"
fi

# =============================================================================
# AWS SECRETS MANAGER FUNCTIONS
# =============================================================================

##
# Check if AWS CLI is available and configured
##
aws_is_authenticated() {
    if ! command -v aws >/dev/null 2>&1; then
        return 1
    fi
    aws sts get-caller-identity >/dev/null 2>&1
}

##
# Get secret from AWS Secrets Manager
##
aws_get_secret() {
    local secret_name="$1"
    local instance_code="${2:-}"
    
    local full_name="${SECRET_PREFIX}-${secret_name}"
    [ -n "$instance_code" ] && full_name="${full_name}-$(lower "$instance_code")"
    
    if ! aws_is_authenticated; then
        log_error "AWS not authenticated"
        return 1
    fi
    
    aws secretsmanager get-secret-value \
        --secret-id "$full_name" \
        --region "$AWS_REGION" \
        --query 'SecretString' \
        --output text \
        2>/dev/null
}

##
# Set secret in AWS Secrets Manager
##
aws_set_secret() {
    local secret_name="$1"
    local secret_value="$2"
    local instance_code="${3:-}"
    
    local full_name="${SECRET_PREFIX}-${secret_name}"
    [ -n "$instance_code" ] && full_name="${full_name}-$(lower "$instance_code")"
    
    if ! aws_is_authenticated; then
        log_error "AWS not authenticated"
        return 1
    fi
    
    # Try to create secret first
    if ! aws secretsmanager describe-secret --secret-id "$full_name" --region "$AWS_REGION" >/dev/null 2>&1; then
        aws secretsmanager create-secret \
            --name "$full_name" \
            --secret-string "$secret_value" \
            --region "$AWS_REGION" \
            >/dev/null 2>&1
    else
        # Update existing secret
        aws secretsmanager update-secret \
            --secret-id "$full_name" \
            --secret-string "$secret_value" \
            --region "$AWS_REGION" \
            >/dev/null 2>&1
    fi
    
    log_verbose "Secret updated: $full_name"
}

##
# Check if AWS secret exists
##
aws_secret_exists() {
    local secret_name="$1"
    local instance_code="${2:-}"
    
    local full_name="${SECRET_PREFIX}-${secret_name}"
    [ -n "$instance_code" ] && full_name="${full_name}-$(lower "$instance_code")"
    
    aws secretsmanager describe-secret \
        --secret-id "$full_name" \
        --region "$AWS_REGION" \
        >/dev/null 2>&1
}

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
# UNIFIED CONVENIENCE FUNCTIONS (Provider-agnostic)
# =============================================================================

##
# Get secret (routes to correct provider)
##
get_secret() {
    local secret_name="$1"
    local instance_code="${2:-}"
    
    if [ "$SECRETS_PROVIDER" = "aws" ]; then
        aws_get_secret "$secret_name" "$instance_code"
    else
        gcp_get_secret "$secret_name" "$instance_code"
    fi
}

##
# Set secret (routes to correct provider)
##
set_secret() {
    local secret_name="$1"
    local secret_value="$2"
    local instance_code="${3:-}"
    
    if [ "$SECRETS_PROVIDER" = "aws" ]; then
        aws_set_secret "$secret_name" "$secret_value" "$instance_code"
    else
        gcp_set_secret "$secret_name" "$secret_value" "$instance_code"
    fi
}

##
# Check if secret exists (routes to correct provider)
##
secret_exists() {
    local secret_name="$1"
    local instance_code="${2:-}"
    
    if [ "$SECRETS_PROVIDER" = "aws" ]; then
        aws_secret_exists "$secret_name" "$instance_code"
    else
        gcp_secret_exists "$secret_name" "$instance_code"
    fi
}

##
# Check if authenticated (routes to correct provider)
##
is_authenticated() {
    if [ "$SECRETS_PROVIDER" = "aws" ]; then
        aws_is_authenticated
    else
        gcp_is_authenticated
    fi
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
    if [ "$SECRETS_PROVIDER" = "aws" ]; then
        aws_get_secret "keycloak-admin-password" "$instance_code"
    else
        gcp_get_secret "keycloak" "$instance_code"
    fi
}

##
# Get PostgreSQL password for instance
#
# Arguments:
#   $1 - Instance code
##
get_postgres_password() {
    local instance_code="$1"
    if [ "$SECRETS_PROVIDER" = "aws" ]; then
        aws_get_secret "postgres-password" "$instance_code"
    else
        gcp_get_secret "postgres" "$instance_code"
    fi
}

##
# Get MongoDB password for instance
#
# Arguments:
#   $1 - Instance code
##
get_mongodb_password() {
    local instance_code="$1"
    if [ "$SECRETS_PROVIDER" = "aws" ]; then
        aws_get_secret "mongo-password" "$instance_code"
    else
        gcp_get_secret "mongodb" "$instance_code"
    fi
}

##
# Get NextAuth secret for instance
#
# Arguments:
#   $1 - Instance code
##
get_auth_secret() {
    local instance_code="$1"
    if [ "$SECRETS_PROVIDER" = "aws" ]; then
        aws_get_secret "auth-secret" "$instance_code"
    else
        gcp_get_secret "auth-secret" "$instance_code"
    fi
}

##
# Get Keycloak client secret
##
get_keycloak_client_secret() {
    if [ "$SECRETS_PROVIDER" = "aws" ]; then
        aws_get_secret "keycloak-client-secret"
    else
        gcp_get_secret "keycloak-client-secret"
    fi
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
    
    get_secret "federation-$(lower "$source")-$(lower "$target")"
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

    log_info "Loading secrets for $instance_code (provider: $SECRETS_PROVIDER)..."

    if ! is_authenticated; then
        if [ "$SECRETS_PROVIDER" = "aws" ]; then
            log_error "AWS not authenticated - configure AWS CLI credentials"
        else
            log_error "GCP not authenticated - run: gcloud auth application-default login"
        fi
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

    log_info "Ensuring secrets exist for $instance_code (provider: $SECRETS_PROVIDER)..."

    if ! is_authenticated; then
        if [ "$SECRETS_PROVIDER" = "aws" ]; then
            log_error "AWS not authenticated - configure AWS CLI credentials"
        else
            log_error "GCP not authenticated - run: gcloud auth application-default login"
        fi
        return 1
    fi

    # Define secret names based on provider
    local secrets
    if [ "$SECRETS_PROVIDER" = "aws" ]; then
        secrets=("keycloak-admin-password" "postgres-password" "mongo-password" "auth-secret")
    else
        secrets=("keycloak" "postgres" "mongodb" "auth-secret")
    fi
    
    local created=0

    for secret in "${secrets[@]}"; do
        if ! secret_exists "$secret" "$instance_code"; then
            log_info "Creating secret: ${SECRET_PREFIX}-${secret}-${code_lower}"

            # Generate secure random password
            local password=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
            set_secret "$secret" "$password" "$instance_code"
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

    log_warn "Rotating secrets for $instance_code (type: $secret_type, provider: $SECRETS_PROVIDER)..."

    if ! is_authenticated; then
        log_error "Not authenticated"
        return 1
    fi

    local secrets
    if [ "$secret_type" = "all" ]; then
        if [ "$SECRETS_PROVIDER" = "aws" ]; then
            secrets=("keycloak-admin-password" "postgres-password" "mongo-password" "auth-secret")
        else
            secrets=("keycloak" "postgres" "mongodb" "auth-secret")
        fi
    else
        secrets=("$secret_type")
    fi

    for secret in "${secrets[@]}"; do
        log_info "Rotating: ${SECRET_PREFIX}-${secret}-${code_lower}"

        # Generate new password
        local new_password=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-24)
        set_secret "$secret" "$new_password" "$instance_code"
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

    log_info "Verifying secrets for $instance_code (provider: $SECRETS_PROVIDER)..."

    local secrets
    if [ "$SECRETS_PROVIDER" = "aws" ]; then
        secrets=("keycloak-admin-password" "postgres-password" "mongo-password" "auth-secret")
    else
        secrets=("keycloak" "postgres" "mongodb" "auth-secret")
    fi
    
    local accessible=0
    local total=${#secrets[@]}

    for secret in "${secrets[@]}"; do
        local full_name="${SECRET_PREFIX}-${secret}-${code_lower}"

        if get_secret "$secret" "$instance_code" >/dev/null 2>&1; then
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
# List all DIVE secrets
##
secrets_list() {
    if ! is_authenticated; then
        log_error "Not authenticated"
        return 1
    fi

    if [ "$SECRETS_PROVIDER" = "aws" ]; then
        echo "=== DIVE Secrets in AWS (region: $AWS_REGION) ==="
        echo ""
        aws secretsmanager list-secrets \
            --region "$AWS_REGION" \
            --query "SecretList[?starts_with(Name, '${SECRET_PREFIX}')].{Name:Name,LastChanged:LastChangedDate}" \
            --output table
    else
        echo "=== DIVE Secrets in GCP (project: $GCP_PROJECT_ID) ==="
        echo ""
        gcloud secrets list --project="$GCP_PROJECT_ID" --filter="name:${SECRET_PREFIX}" \
            --format="table(name,createTime,replication.automatic.customerManagedEncryption)"
    fi
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
        provider)
            if [ -n "$1" ]; then
                export SECRETS_PROVIDER="$1"
                log_success "Secrets provider set to: $SECRETS_PROVIDER"
            else
                echo "Current provider: $SECRETS_PROVIDER"
            fi
            ;;
        get)
            local name="$1"
            local instance="${2:-}"
            get_secret "$name" "$instance"
            ;;
        set)
            local name="$1"
            local value="$2"
            local instance="${3:-}"
            set_secret "$name" "$value" "$instance"
            ;;
        help|*)
            echo "Usage: ./dive secrets <command> [args]"
            echo ""
            echo "Commands:"
            echo "  list                  List all DIVE secrets"
            echo "  ensure <CODE>         Ensure secrets exist for instance"
            echo "  rotate <CODE> [type]  Rotate secrets"
            echo "  verify <CODE>         Verify secret access"
            echo "  load <CODE>           Load secrets into environment"
            echo "  export <CODE>         Export secrets as shell commands"
            echo "  provider [gcp|aws]    Get/set secrets provider"
            echo "  get <name> [CODE]     Get specific secret"
            echo "  set <name> <value> [CODE]  Set specific secret"
            echo ""
            echo "Current provider: $SECRETS_PROVIDER"
            echo ""
            echo "Environment Variables:"
            echo "  SECRETS_PROVIDER      Provider to use (gcp, aws, auto)"
            echo "  GCP_PROJECT_ID        GCP project ID (default: dive25)"
            echo "  AWS_REGION            AWS region (default: us-east-1)"
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f aws_is_authenticated
export -f aws_get_secret
export -f aws_set_secret
export -f aws_secret_exists
export -f gcp_is_authenticated
export -f gcp_get_secret
export -f gcp_set_secret
export -f gcp_secret_exists
export -f get_secret
export -f set_secret
export -f secret_exists
export -f is_authenticated
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

log_verbose "Secrets module loaded (provider: $SECRETS_PROVIDER)"
