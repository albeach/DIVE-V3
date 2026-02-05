#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Secret Management Module - AWS Secrets Manager Integration
# =============================================================================
# AWS Secrets Manager integration as alternative to GCP
# =============================================================================
# Version: 1.0.0
# Date: 2026-02-04
#
# This module provides AWS Secrets Manager integration for DIVE V3
# Drop-in replacement for GCP Secret Manager functions
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_CONFIGURATION_SECRETS_AWS_LOADED:-}" ] && return 0
export DIVE_CONFIGURATION_SECRETS_AWS_LOADED=1

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

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_SECRET_PREFIX="${AWS_SECRET_PREFIX:-dive-v3}"
USE_AWS_SECRETS="${USE_AWS_SECRETS:-true}"

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
    
    # Check if AWS credentials are available
    aws sts get-caller-identity >/dev/null 2>&1
}

##
# Get secret from AWS Secrets Manager
#
# Arguments:
#   $1 - Secret name (without prefix)
#   $2 - Instance code (optional)
#
# Returns:
#   Secret value on stdout
##
aws_get_secret() {
    local secret_name="$1"
    local instance_code="${2:-}"
    
    local full_name="${AWS_SECRET_PREFIX}-${secret_name}"
    [ -n "$instance_code" ] && full_name="${full_name}-$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')"
    
    if [ "$USE_AWS_SECRETS" != "true" ]; then
        log_warn "AWS secrets disabled - returning empty"
        return 1
    fi
    
    if ! aws_is_authenticated; then
        log_error "AWS not authenticated - configure AWS CLI credentials"
        return 1
    fi
    
    # Get secret value from AWS Secrets Manager
    aws secretsmanager get-secret-value \
        --secret-id "$full_name" \
        --region "$AWS_REGION" \
        --query 'SecretString' \
        --output text \
        2>/dev/null
}

##
# Set secret in AWS Secrets Manager
#
# Arguments:
#   $1 - Secret name (without prefix)
#   $2 - Secret value
#   $3 - Instance code (optional)
##
aws_set_secret() {
    local secret_name="$1"
    local secret_value="$2"
    local instance_code="${3:-}"
    
    local full_name="${AWS_SECRET_PREFIX}-${secret_name}"
    [ -n "$instance_code" ] && full_name="${full_name}-$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')"
    
    if ! aws_is_authenticated; then
        log_error "AWS not authenticated"
        return 1
    fi
    
    # Try to create secret first (will fail if exists)
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
# Check if secret exists
#
# Arguments:
#   $1 - Secret name (without prefix)
#   $2 - Instance code (optional)
##
aws_secret_exists() {
    local secret_name="$1"
    local instance_code="${2:-}"
    
    local full_name="${AWS_SECRET_PREFIX}-${secret_name}"
    [ -n "$instance_code" ] && full_name="${full_name}-$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')"
    
    aws secretsmanager describe-secret \
        --secret-id "$full_name" \
        --region "$AWS_REGION" \
        >/dev/null 2>&1
}

# =============================================================================
# CONVENIENCE FUNCTIONS (AWS equivalents)
# =============================================================================

##
# Get Keycloak admin password for instance
#
# Arguments:
#   $1 - Instance code
##
get_keycloak_admin_password() {
    local instance_code="$1"
    aws_get_secret "keycloak-admin-password" "$instance_code"
}

##
# Get MongoDB password for instance
#
# Arguments:
#   $1 - Instance code
##
get_mongo_password() {
    local instance_code="$1"
    # Note: AWS uses consistent naming (mongo not mongodb)
    aws_get_secret "mongo-password" "$instance_code"
}

##
# Get PostgreSQL password for instance
#
# Arguments:
#   $1 - Instance code
##
get_postgres_password() {
    local instance_code="$1"
    aws_get_secret "postgres-password" "$instance_code"
}

##
# Get Redis password for instance
#
# Arguments:
#   $1 - Instance code
##
get_redis_password() {
    local instance_code="$1"
    aws_get_secret "redis-password" "$instance_code"
}

##
# Get Keycloak client secret for instance
#
# Arguments:
#   $1 - Instance code
##
get_keycloak_client_secret() {
    local instance_code="$1"
    aws_get_secret "keycloak-client-secret" "$instance_code"
}

##
# Get NextAuth secret for instance
#
# Arguments:
#   $1 - Instance code
##
get_auth_secret() {
    local instance_code="$1"
    aws_get_secret "auth-secret" "$instance_code"
}

##
# List all DIVE secrets in AWS
##
list_secrets() {
    if ! aws_is_authenticated; then
        log_error "AWS not authenticated"
        return 1
    fi
    
    echo "=== DIVE Secrets in AWS (region: $AWS_REGION) ==="
    echo ""
    
    aws secretsmanager list-secrets \
        --region "$AWS_REGION" \
        --query "SecretList[?starts_with(Name, '${AWS_SECRET_PREFIX}')].Name" \
        --output table
}

# =============================================================================
# MIGRATION HELPER
# =============================================================================

##
# Migrate a secret from GCP to AWS
#
# Arguments:
#   $1 - Secret name (without prefix)
#   $2 - Instance code (optional)
##
migrate_secret_from_gcp() {
    local secret_name="$1"
    local instance_code="${2:-}"
    
    log_step "Migrating secret: $secret_name${instance_code:+ for $instance_code}"
    
    # Get from GCP
    local gcp_full_name="dive-v3-${secret_name}"
    [ -n "$instance_code" ] && gcp_full_name="${gcp_full_name}-$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')"
    
    local secret_value
    secret_value=$(gcloud secrets versions access latest \
        --secret="$gcp_full_name" \
        --project="${GCP_PROJECT_ID:-dive25}" \
        2>/dev/null)
    
    if [ -z "$secret_value" ]; then
        log_error "Failed to get secret from GCP: $gcp_full_name"
        return 1
    fi
    
    # Set in AWS
    aws_set_secret "$secret_name" "$secret_value" "$instance_code"
    
    log_success "Migrated: $gcp_full_name → AWS"
}

##
# Migrate all DIVE secrets from GCP to AWS for a given instance
#
# Arguments:
#   $1 - Instance code (e.g., USA, FRA, GBR)
##
migrate_instance_secrets_from_gcp() {
    local instance_code="$1"
    
    log_step "Migrating all secrets for instance: $instance_code"
    
    # Core secrets
    local secrets=(
        "keycloak-admin-password"
        "mongo-password"
        "postgres-password"
        "redis-password"
        "keycloak-client-secret"
        "auth-secret"
    )
    
    for secret in "${secrets[@]}"; do
        migrate_secret_from_gcp "$secret" "$instance_code" || log_warn "Failed to migrate $secret"
    done
    
    log_success "Migration complete for $instance_code"
}

log_verbose "AWS Secrets Manager module loaded (region: $AWS_REGION)"
