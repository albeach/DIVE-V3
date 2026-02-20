#!/usr/bin/env bash
# =============================================================================
# Create GCP Secret for Redis Blacklist Password
# =============================================================================
# Phase 1.3: Create missing GCP secret dive-v3-redis-blacklist
# This script creates the secret if it doesn't exist
# =============================================================================

set -euo pipefail

# Load common functions
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/dive-modules/common.sh"
fi

# Configuration
PROJECT="${GCP_PROJECT:-dive25}"
SECRET_NAME="dive-v3-redis-blacklist"

log_step "Creating GCP secret: $SECRET_NAME"

# Check if gcloud is available
if ! check_gcloud; then
    log_error "GCP authentication required"
    log_error "Run: gcloud auth application-default login"
    exit 1
fi

# Check if secret already exists
if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT" >/dev/null 2>&1; then
    log_success "Secret already exists: $SECRET_NAME"
    log_info "To update: echo -n 'new-password' | gcloud secrets versions add $SECRET_NAME --data-file=- --project=$PROJECT"
    exit 0
fi

# Generate secure password
log_info "Generating secure password..."
PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 24)

# Create secret
log_info "Creating secret in GCP Secret Manager..."
creator_label="$(whoami)@$(hostname)"
created_at="$(date -u +%Y%m%d-%H%M%S)"
if echo -n "$PASSWORD" | gcloud secrets create "$SECRET_NAME" \
    --project="$PROJECT" \
    --data-file=- \
    --replication-policy="automatic" \
    --labels="environment=${ENVIRONMENT:-local},managed-by=dive-cli,created-by=${creator_label},created-at=${created_at}"; then
    log_success "✓ Secret created: $SECRET_NAME"
    log_info "Password length: ${#PASSWORD} characters"
    log_info "Project: $PROJECT"
    log_info ""
    log_info "To verify: gcloud secrets versions access latest --secret=$SECRET_NAME --project=$PROJECT"
    exit 0
else
    log_error "Failed to create secret: $SECRET_NAME"
    exit 1
fi
