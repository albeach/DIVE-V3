#!/bin/bash
# =============================================================================
# DIVE V3 - DEU Instance GCP Secrets Sync Script
# =============================================================================
# Loads DEU-specific secrets from GCP Secret Manager.
# This script uses a limited-access service account that ONLY has access
# to DEU instance secrets - following principle of least privilege.
#
# Service Account: dive-v3-deu-secrets@dive25.iam.gserviceaccount.com
#
# Usage:
#   source ./scripts/sync-gcp-secrets-deu.sh
#
# =============================================================================

set -e  # Exit on error during sourcing

GCP_PROJECT="dive25"
GCLOUD_PATH="${GCLOUD_PATH:-$HOME/google-cloud-sdk/bin/gcloud}"

echo "🔐 DIVE V3 - DEU Instance GCP Secrets Sync"
echo "   Project: $GCP_PROJECT"
echo "   Instance: DEU"
echo ""

# Check if gcloud is available
if ! command -v "$GCLOUD_PATH" &> /dev/null && ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Please install Google Cloud SDK."
    return 1 2>/dev/null || exit 1
fi

# Use system gcloud if available, otherwise use the explicit path
if command -v gcloud &> /dev/null; then
    GCLOUD="gcloud"
else
    GCLOUD="$GCLOUD_PATH"
fi

# Check authentication
if ! $GCLOUD auth print-access-token &>/dev/null; then
    echo "❌ Not authenticated with GCP."
    echo "   Run: $GCLOUD auth activate-service-account --key-file=/opt/dive-v3/gcp/deu-sa-key.json"
    return 1 2>/dev/null || exit 1
fi

# Track failed secrets for validation
FAILED_SECRETS=()

# Function to fetch secret
fetch_secret() {
    local secret_name=$1
    local env_var=$2
    local required=${3:-false}
    
    value=$($GCLOUD secrets versions access latest --secret="$secret_name" --project="$GCP_PROJECT" 2>/dev/null || echo "")
    
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
# DEU-SPECIFIC SECRETS ONLY
# =============================================================================
echo ""
echo "📦 Loading DEU instance secrets..."

# Core database secrets
fetch_secret "dive-v3-mongodb-deu" "MONGO_PASSWORD_DEU" true
fetch_secret "dive-v3-postgres-deu" "POSTGRES_PASSWORD_DEU" true
fetch_secret "dive-v3-redis-deu" "REDIS_PASSWORD_DEU" true

# Keycloak secrets
fetch_secret "dive-v3-keycloak-deu" "KEYCLOAK_ADMIN_PASSWORD_DEU" true
fetch_secret "dive-v3-keycloak-client-secret-deu" "KEYCLOAK_CLIENT_SECRET_DEU" true

# Auth secrets
fetch_secret "dive-v3-auth-secret-deu" "AUTH_SECRET_DEU" true
fetch_secret "dive-v3-jwt-secret-deu" "JWT_SECRET_DEU" true
fetch_secret "dive-v3-nextauth-secret-deu" "NEXTAUTH_SECRET_DEU" true

# =============================================================================
# SET GENERIC ALIASES (for docker-compose compatibility)
# =============================================================================
echo ""
echo "📦 Setting generic variable aliases..."

export MONGO_PASSWORD="${MONGO_PASSWORD_DEU:-}"
export MONGO_INITDB_ROOT_PASSWORD="${MONGO_PASSWORD_DEU:-}"
export KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD_DEU:-}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD_DEU:-}"
export AUTH_SECRET="${AUTH_SECRET_DEU:-}"
export NEXTAUTH_SECRET="${NEXTAUTH_SECRET_DEU:-}"
export JWT_SECRET="${JWT_SECRET_DEU:-}"
export KEYCLOAK_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET_DEU:-}"
export REDIS_PASSWORD="${REDIS_PASSWORD_DEU:-}"

echo "✅ Generic aliases set"

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
    echo "   The DEU service account may not have access to these secrets."
    echo "   Check IAM permissions for: dive-v3-deu-secrets@dive25.iam.gserviceaccount.com"
    echo ""
    return 1 2>/dev/null || exit 1
fi

echo "✅ All DEU secrets loaded successfully!"
echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo "Environment variables set:"
env | grep -E "^(MONGO_|KEYCLOAK_|POSTGRES_|AUTH_|JWT_|NEXTAUTH_|REDIS_)" | sort | sed 's/=.*/=***/'
echo ""
echo "To start DEU Docker Compose stack:"
echo "  cd /opt/dive-v3"
echo "  docker compose -f docker-compose.deu.yml up -d"
echo ""


