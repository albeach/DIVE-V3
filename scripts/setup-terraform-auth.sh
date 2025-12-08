#!/bin/bash
# =============================================================================
# DIVE V3 - Setup Terraform Authentication
# =============================================================================
# Sets up Application Default Credentials for Terraform using service account
# This enables automated, non-interactive Terraform operations
#
# Usage:
#   source scripts/setup-terraform-auth.sh
#   OR
#   export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/.terraform-keys/terraform-deployer.json
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KEY_FILE="$PROJECT_ROOT/.terraform-keys/terraform-deployer.json"

if [ ! -f "$KEY_FILE" ]; then
    echo "❌ Service account key not found: $KEY_FILE"
    echo ""
    echo "Creating service account and key..."
    
    # Create service account
    gcloud iam service-accounts create terraform-deployer \
        --display-name="Terraform Deployer" \
        --project=dive25 2>&1 | grep -v "already exists" || true
    
    # Grant permissions
    gcloud projects add-iam-policy-binding dive25 \
        --member="serviceAccount:terraform-deployer@dive25.iam.gserviceaccount.com" \
        --role="roles/owner" 2>&1 | grep -v "already" || true
    
    # Create key
    mkdir -p "$PROJECT_ROOT/.terraform-keys"
    gcloud iam service-accounts keys create "$KEY_FILE" \
        --iam-account=terraform-deployer@dive25.iam.gserviceaccount.com \
        --project=dive25
    
    echo "✅ Service account key created"
fi

# Export for current session
export GOOGLE_APPLICATION_CREDENTIALS="$KEY_FILE"

# Activate service account
gcloud auth activate-service-account terraform-deployer@dive25.iam.gserviceaccount.com \
    --key-file="$GOOGLE_APPLICATION_CREDENTIALS" 2>&1 | grep -v "already" || true

echo "✅ Terraform authentication configured"
echo "   GOOGLE_APPLICATION_CREDENTIALS=$GOOGLE_APPLICATION_CREDENTIALS"
echo ""
echo "To use in other shells, run:"
echo "   export GOOGLE_APPLICATION_CREDENTIALS=\"$GOOGLE_APPLICATION_CREDENTIALS\""






