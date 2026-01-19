#!/bin/bash
# =============================================================================
# DIVE V3 Hub - Terraform Runner Script
# =============================================================================
# Correctly loads secrets from .env.hub and sets TF_VAR_ environment variables
# for Terraform without hardcoding sensitive values.
# =============================================================================

set -e

# Get the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load secrets from .env.hub
if [ ! -f "$PROJECT_ROOT/.env.hub" ]; then
    echo "❌ Error: .env.hub file not found at $PROJECT_ROOT/.env.hub"
    exit 1
fi

echo "🔐 Loading secrets from .env.hub..."
source "$PROJECT_ROOT/.env.hub"

# Export secrets as TF_VAR_ environment variables
export TF_VAR_keycloak_admin_password="$KEYCLOAK_ADMIN_PASSWORD"
export TF_VAR_client_secret="$KEYCLOAK_CLIENT_SECRET"

# Optional: Export other terraform variables if needed
# export TF_VAR_test_user_password="$TEST_USER_PASSWORD"
# export TF_VAR_admin_user_password="$ADMIN_USER_PASSWORD"

echo "✅ Terraform environment variables set"
echo "   TF_VAR_keycloak_admin_password: ${TF_VAR_keycloak_admin_password:0:10}..."
echo "   TF_VAR_client_secret: ${TF_VAR_client_secret:0:10}..."

# Run terraform with provided arguments
echo "🚀 Running: terraform $@"
exec terraform "$@"