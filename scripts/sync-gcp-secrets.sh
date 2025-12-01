#!/bin/bash
# =============================================================================
# DIVE V3 - GCP Secrets Sync Script
# =============================================================================
# Loads secrets from GCP Secret Manager and exports them as environment variables.
# Run this script before starting Docker Compose stacks.
#
# Usage:
#   source ./scripts/sync-gcp-secrets.sh [instance]
#   
# Examples:
#   source ./scripts/sync-gcp-secrets.sh          # Load all secrets
#   source ./scripts/sync-gcp-secrets.sh usa      # Load USA instance secrets
#   source ./scripts/sync-gcp-secrets.sh fra      # Load FRA instance secrets
#
# =============================================================================

set -e  # Exit on error during sourcing

GCP_PROJECT="dive25"

# Get first argument or default to "all"
if [ -n "$1" ] && [ "$1" != "source" ]; then
    INSTANCE="$1"
else
    INSTANCE="all"
fi

echo "🔐 DIVE V3 - GCP Secrets Sync"
echo "   Project: $GCP_PROJECT"
echo "   Instance: $INSTANCE"
echo ""

# Check if gcloud is available
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Please install Google Cloud SDK."
    return 1 2>/dev/null || exit 1
fi

# Check authentication
if ! gcloud auth print-access-token &>/dev/null; then
    echo "❌ Not authenticated with GCP. Run: gcloud auth login"
    return 1 2>/dev/null || exit 1
fi

# Track failed secrets for validation
FAILED_SECRETS=()

# Function to fetch secret
fetch_secret() {
    local secret_name=$1
    local env_var=$2
    local required=${3:-false}
    
    value=$(gcloud secrets versions access latest --secret="$secret_name" --project="$GCP_PROJECT" 2>/dev/null || echo "")
    
    if [ -n "$value" ]; then
        export "$env_var"="$value"
        echo "✅ $env_var loaded from $secret_name"
        return 0
    else
        if [ "$required" = "true" ]; then
            echo "❌ REQUIRED: $secret_name not found!"
            FAILED_SECRETS+=("$secret_name")
        else
            echo "⚠️  $secret_name not found, using default"
        fi
        return 1
    fi
}

# =============================================================================
# SHARED SECRETS (loaded for all instances)
# =============================================================================
echo ""
echo "📦 Loading shared secrets..."

fetch_secret "dive-v3-redis-blacklist" "BLACKLIST_REDIS_PASSWORD" true
fetch_secret "dive-v3-grafana" "GRAFANA_ADMIN_PASSWORD" true

# Legacy single client secret (for backward compatibility)
fetch_secret "dive-v3-keycloak-client-secret" "KEYCLOAK_CLIENT_SECRET" false

# =============================================================================
# INSTANCE-SPECIFIC SECRETS
# =============================================================================

load_instance_secrets() {
    local inst=$1
    local INST_UPPER=$(echo "$inst" | tr '[:lower:]' '[:upper:]')
    
    echo ""
    echo "📦 Loading $INST_UPPER instance secrets..."
    
    # Core secrets
    fetch_secret "dive-v3-mongodb-$inst" "MONGO_PASSWORD_$INST_UPPER" true
    fetch_secret "dive-v3-keycloak-$inst" "KEYCLOAK_ADMIN_PASSWORD_$INST_UPPER" true
    fetch_secret "dive-v3-postgres-$inst" "POSTGRES_PASSWORD_$INST_UPPER" true
    fetch_secret "dive-v3-auth-secret-$inst" "AUTH_SECRET_$INST_UPPER" true
    
    # New instance-specific secrets
    fetch_secret "dive-v3-jwt-secret-$inst" "JWT_SECRET_$INST_UPPER" true
    fetch_secret "dive-v3-nextauth-secret-$inst" "NEXTAUTH_SECRET_$INST_UPPER" true
    fetch_secret "dive-v3-keycloak-client-secret-$inst" "KEYCLOAK_CLIENT_SECRET_$INST_UPPER" true
    fetch_secret "dive-v3-redis-$inst" "REDIS_PASSWORD_$INST_UPPER" true
    
    # Export alias for Docker MongoDB init
    local mongo_var="MONGO_PASSWORD_$INST_UPPER"
    if [ -n "${!mongo_var:-}" ]; then
        export "MONGO_INITDB_ROOT_PASSWORD_$INST_UPPER"="${!mongo_var}"
    fi
    
    # Also set generic vars if this is the primary instance (USA)
    if [ "$inst" = "usa" ]; then
        local var_name="MONGO_PASSWORD_$INST_UPPER"
        export MONGO_PASSWORD="${!var_name:-}"
        export MONGO_INITDB_ROOT_PASSWORD="${!var_name:-}"
        var_name="KEYCLOAK_ADMIN_PASSWORD_$INST_UPPER"
        export KEYCLOAK_ADMIN_PASSWORD="${!var_name:-}"
        var_name="POSTGRES_PASSWORD_$INST_UPPER"
        export POSTGRES_PASSWORD="${!var_name:-}"
        var_name="AUTH_SECRET_$INST_UPPER"
        export AUTH_SECRET="${!var_name:-}"
        var_name="NEXTAUTH_SECRET_$INST_UPPER"
        export NEXTAUTH_SECRET="${!var_name:-}"
        var_name="JWT_SECRET_$INST_UPPER"
        export JWT_SECRET="${!var_name:-}"
        var_name="KEYCLOAK_CLIENT_SECRET_$INST_UPPER"
        # Always use instance-specific client secret if available
        # This ensures each instance uses its own Keycloak client secret
        if [ -n "${!var_name:-}" ]; then
            export KEYCLOAK_CLIENT_SECRET="${!var_name}"
        fi
        var_name="REDIS_PASSWORD_$INST_UPPER"
        export REDIS_PASSWORD="${!var_name:-}"
    fi
}

if [ "$INSTANCE" = "all" ]; then
    load_instance_secrets "usa"
    load_instance_secrets "fra"
    load_instance_secrets "gbr"
    load_instance_secrets "deu"
else
    load_instance_secrets "$INSTANCE"
fi

# =============================================================================
# FEDERATION SECRETS
# =============================================================================
echo ""
echo "📦 Loading federation secrets..."

INSTANCES=("usa" "fra" "gbr" "deu")
for src in "${INSTANCES[@]}"; do
    for tgt in "${INSTANCES[@]}"; do
        if [ "$src" != "$tgt" ]; then
            SRC_UPPER=$(echo "$src" | tr '[:lower:]' '[:upper:]')
            TGT_UPPER=$(echo "$tgt" | tr '[:lower:]' '[:upper:]')
            fetch_secret "dive-v3-federation-$src-$tgt" "FEDERATION_SECRET_${SRC_UPPER}_${TGT_UPPER}" false
        fi
    done
done

# =============================================================================
# VALIDATION
# =============================================================================
echo ""
if [ ${#FAILED_SECRETS[@]} -gt 0 ]; then
    echo "❌ CRITICAL: ${#FAILED_SECRETS[@]} required secrets are missing!"
    echo "   Missing secrets:"
    for secret in "${FAILED_SECRETS[@]}"; do
        echo "   - $secret"
    done
    echo ""
    echo "   To create missing secrets, run:"
    echo "   gcloud secrets create <secret-name> --project=$GCP_PROJECT"
    echo "   echo -n 'your-value' | gcloud secrets versions add <secret-name> --data-file=- --project=$GCP_PROJECT"
    echo ""
    return 1 2>/dev/null || exit 1
fi

echo "✅ All required GCP secrets loaded successfully!"
echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo "Environment variables set:"
env | grep -E "^(MONGO_|KEYCLOAK_|POSTGRES_|AUTH_|BLACKLIST_|GRAFANA_|FEDERATION_|JWT_|NEXTAUTH_|REDIS_)" | sort | sed 's/=.*/=***/'
echo ""
echo "To start Docker Compose stacks:"
echo "  docker compose -p shared -f docker-compose.shared.yml up -d"
echo "  docker compose -p usa -f docker-compose.yml up -d"
echo "  docker compose -p fra -f docker-compose.fra.yml up -d"
echo "  docker compose -p gbr -f docker-compose.gbr.yml up -d"
echo "  docker compose -p deu -f docker-compose.deu.yml up -d"
echo ""
echo "To use with Terraform (reads from TF_VAR_ environment variables):"
echo "  export TF_VAR_keycloak_admin_password=\"\$KEYCLOAK_ADMIN_PASSWORD_USA\""
echo "  terraform -chdir=terraform/instances apply -var-file=usa.tfvars"

