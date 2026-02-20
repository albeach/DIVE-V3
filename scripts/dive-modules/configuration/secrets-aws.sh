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

AWS_REGION="${AWS_REGION:-us-gov-east-1}"
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
    local secret_list=(
        "keycloak-admin-password"
        "mongo-password"
        "postgres-password"
        "redis-password"
        "keycloak-client-secret"
        "auth-secret"
    )
    
    for secret in "${secret_list[@]}"; do
        migrate_secret_from_gcp "$secret" "$instance_code" || log_warn "Failed to migrate $secret"
    done
    
    log_success "Migration complete for $instance_code"
}

# =============================================================================
# SEED COMMAND — Generate and store all secrets for a fresh environment
# =============================================================================

##
# Generate a cryptographically secure random string
#
# Arguments:
#   $1 - Length (default: 32)
##
_generate_secret() {
    local length="${1:-32}"
    openssl rand -base64 "$length" | tr -d '/+=' | head -c "$length"
}

##
# Seed all required secrets for a given instance.
# Generates new random values and stores them in AWS Secrets Manager.
# Skips secrets that already exist (use --force to overwrite).
#
# Arguments:
#   $1 - Instance code (e.g., USA, FRA, GBR)
#   --force  Overwrite existing secrets
##
aws_seed_instance_secrets() {
    local instance_code="${1:-}"
    local force=false
    shift || true

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force) force=true; shift ;;
            *) instance_code="${instance_code:-$1}"; shift ;;
        esac
    done

    if [ -z "$instance_code" ]; then
        log_error "Usage: aws_seed_instance_secrets <INSTANCE_CODE> [--force]"
        return 1
    fi

    aws_is_authenticated || return 1

    instance_code=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
    log_step "Seeding secrets for instance: $instance_code"

    # Define secrets and their generation rules
    declare -A secrets=(
        ["keycloak-admin-password"]=32
        ["mongo-password"]=32
        ["postgres-password"]=32
        ["redis-password"]=32
        ["keycloak-client-secret"]=48
        ["auth-secret"]=64
    )

    local created=0
    local skipped=0

    for secret_name in "${!secrets[@]}"; do
        local length="${secrets[$secret_name]}"

        if [ "$force" = "false" ] && aws_secret_exists "$secret_name" "$instance_code"; then
            log_verbose "  Exists: $secret_name ($instance_code) — skipping"
            skipped=$((skipped + 1))
            continue
        fi

        local secret_value
        secret_value=$(_generate_secret "$length")
        aws_set_secret "$secret_name" "$secret_value" "$instance_code"
        log_info "  Created: $secret_name ($instance_code)"
        created=$((created + 1))
    done

    log_success "Instance $instance_code: $created created, $skipped skipped"
}

##
# Seed shared (non-instance-specific) secrets
#
# Arguments:
#   --force  Overwrite existing secrets
##
aws_seed_shared_secrets() {
    local force=false
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force) force=true; shift ;;
            *) shift ;;
        esac
    done

    aws_is_authenticated || return 1

    log_step "Seeding shared secrets..."

    declare -A shared_secrets=(
        ["opal-auth-master-token"]=48
        ["vault-root-token"]=48
        ["redis-blacklist-password"]=32
    )

    local created=0
    local skipped=0

    for secret_name in "${!shared_secrets[@]}"; do
        local length="${shared_secrets[$secret_name]}"

        if [ "$force" = "false" ] && aws_secret_exists "$secret_name"; then
            log_verbose "  Exists: $secret_name — skipping"
            skipped=$((skipped + 1))
            continue
        fi

        local secret_value
        secret_value=$(_generate_secret "$length")
        aws_set_secret "$secret_name" "$secret_value"
        log_info "  Created: $secret_name"
        created=$((created + 1))
    done

    log_success "Shared secrets: $created created, $skipped skipped"
}

##
# Seed ALL secrets for a complete environment (hub + spokes)
#
# Arguments:
#   --spokes "GBR FRA DEU"   Spoke codes (space-separated)
#   --force                  Overwrite existing
#
# Example:
#   aws_seed_environment --spokes "GBR FRA DEU NZL"
##
aws_seed_environment() {
    local spoke_list=""
    local force=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --spokes) spoke_list="$2"; shift 2 ;;
            --force)  force="--force"; shift ;;
            *) shift ;;
        esac
    done

    aws_is_authenticated || return 1

    echo ""
    echo -e "${BOLD}DIVE V3 — Seed AWS Secrets (${ENVIRONMENT})${NC}"
    echo "================================================"
    echo ""

    # Shared secrets
    aws_seed_shared_secrets $force

    # Hub (USA)
    aws_seed_instance_secrets "USA" $force

    # Spokes
    if [ -n "$spoke_list" ]; then
        for code in $spoke_list; do
            aws_seed_instance_secrets "$code" $force
        done
    fi

    echo ""
    log_success "Environment secrets seeded. Verify with: ./dive secrets list"
}

##
# Export all secrets for an instance as environment variables
# (used during .env file generation for Docker Compose)
#
# Arguments:
#   $1 - Instance code
##
aws_export_instance_secrets() {
    local instance_code="${1:-USA}"
    instance_code=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')

    aws_is_authenticated || return 1

    local kc_pass mongo_pass pg_pass redis_pass kc_client auth_sec

    kc_pass=$(aws_get_secret "keycloak-admin-password" "$instance_code" 2>/dev/null) || true
    mongo_pass=$(aws_get_secret "mongo-password" "$instance_code" 2>/dev/null) || true
    pg_pass=$(aws_get_secret "postgres-password" "$instance_code" 2>/dev/null) || true
    redis_pass=$(aws_get_secret "redis-password" "$instance_code" 2>/dev/null) || true
    kc_client=$(aws_get_secret "keycloak-client-secret" "$instance_code" 2>/dev/null) || true
    auth_sec=$(aws_get_secret "auth-secret" "$instance_code" 2>/dev/null) || true

    # Shared secrets
    local opal_token vault_token redis_bl_pass
    opal_token=$(aws_get_secret "opal-auth-master-token" 2>/dev/null) || true
    vault_token=$(aws_get_secret "vault-root-token" 2>/dev/null) || true
    redis_bl_pass=$(aws_get_secret "redis-blacklist-password" 2>/dev/null) || true

    # Export with instance-suffixed names (matches .env.hub convention)
    export "KC_ADMIN_PASSWORD_${instance_code}=${kc_pass}"
    export "MONGO_PASSWORD_${instance_code}=${mongo_pass}"
    export "POSTGRES_PASSWORD_${instance_code}=${pg_pass}"
    export "REDIS_PASSWORD_${instance_code}=${redis_pass}"
    export "KEYCLOAK_CLIENT_SECRET_${instance_code}=${kc_client}"
    export "AUTH_SECRET_${instance_code}=${auth_sec}"

    # Shared
    export "OPAL_AUTH_MASTER_TOKEN=${opal_token}"
    export "VAULT_TOKEN=${vault_token}"
    export "REDIS_PASSWORD_BLACKLIST=${redis_bl_pass}"

    log_verbose "Exported secrets for $instance_code"
}

log_verbose "AWS Secrets Manager module loaded (region: $AWS_REGION)"
