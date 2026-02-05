#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Migrate Secrets from GCP to AWS
# =============================================================================
# This script migrates all DIVE V3 secrets from GCP Secret Manager
# to AWS Secrets Manager
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load DIVE modules
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

source "$SCRIPT_DIR/dive-modules/common.sh"
source "$SCRIPT_DIR/dive-modules/configuration/secrets.sh"

# =============================================================================
# FUNCTIONS
# =============================================================================

log_step() {
    echo -e "${BLUE}▶${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

##
# Migrate a single secret from GCP to AWS
##
migrate_secret() {
    local secret_type="$1"
    local instance_code="$2"
    
    local gcp_name aws_name
    
    # Determine GCP secret name (old format)
    case "$secret_type" in
        keycloak)
            gcp_name="keycloak"
            aws_name="keycloak-admin-password"
            ;;
        postgres)
            gcp_name="postgres"
            aws_name="postgres-password"
            ;;
        mongodb)
            gcp_name="mongodb"
            aws_name="mongo-password"
            ;;
        *)
            gcp_name="$secret_type"
            aws_name="$secret_type"
            ;;
    esac
    
    local full_gcp_name="dive-v3-${gcp_name}-$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')"
    local full_aws_name="dive-v3-${aws_name}-$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')"
    
    log_step "Migrating: $full_gcp_name → $full_aws_name"
    
    # Get from GCP
    local secret_value
    if ! secret_value=$(gcloud secrets versions access latest \
        --secret="$full_gcp_name" \
        --project="${GCP_PROJECT_ID:-dive25}" \
        2>/dev/null); then
        log_error "Failed to get secret from GCP: $full_gcp_name"
        return 1
    fi
    
    if [ -z "$secret_value" ]; then
        log_error "Secret is empty: $full_gcp_name"
        return 1
    fi
    
    # Check if exists in AWS
    if aws secretsmanager describe-secret \
        --secret-id "$full_aws_name" \
        --region "${AWS_REGION:-us-east-1}" \
        >/dev/null 2>&1; then
        log_warn "Secret already exists in AWS: $full_aws_name (updating)"
        aws secretsmanager update-secret \
            --secret-id "$full_aws_name" \
            --secret-string "$secret_value" \
            --region "${AWS_REGION:-us-east-1}" \
            >/dev/null 2>&1
    else
        # Create in AWS
        aws secretsmanager create-secret \
            --name "$full_aws_name" \
            --secret-string "$secret_value" \
            --region "${AWS_REGION:-us-east-1}" \
            --description "Migrated from GCP Secret Manager for DIVE V3 instance $instance_code" \
            >/dev/null 2>&1
    fi
    
    log_success "Migrated: $full_gcp_name → $full_aws_name"
}

##
# Migrate all secrets for an instance
##
migrate_instance() {
    local instance_code="$1"
    
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo " Migrating secrets for: $instance_code"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    
    local secrets=("keycloak" "postgres" "mongodb" "auth-secret")
    local success=0
    local failed=0
    
    for secret in "${secrets[@]}"; do
        if migrate_secret "$secret" "$instance_code"; then
            ((success++))
        else
            ((failed++))
        fi
    done
    
    echo ""
    log_success "$instance_code: $success secrets migrated, $failed failed"
    echo ""
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo "═══════════════════════════════════════════════════════════"
    echo " DIVE V3 - Migrate Secrets from GCP to AWS"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    
    # Check prerequisites
    if ! command -v gcloud >/dev/null 2>&1; then
        log_error "gcloud CLI not found"
        exit 1
    fi
    
    if ! command -v aws >/dev/null 2>&1; then
        log_error "AWS CLI not found"
        exit 1
    fi
    
    # Check GCP authentication
    if ! gcloud auth print-access-token >/dev/null 2>&1; then
        log_error "GCP not authenticated. Run: gcloud auth application-default login"
        exit 1
    fi
    
    log_success "GCP authenticated"
    
    # Check AWS authentication
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log_error "AWS not authenticated. Configure AWS CLI credentials."
        exit 1
    fi
    
    log_success "AWS authenticated"
    
    echo ""
    echo "Configuration:"
    echo "  GCP Project: ${GCP_PROJECT_ID:-dive25}"
    echo "  AWS Region:  ${AWS_REGION:-us-east-1}"
    echo ""
    
    # Determine instances to migrate
    local instances=("$@")
    
    if [ ${#instances[@]} -eq 0 ]; then
        # Default to USA if no instances specified
        echo "No instances specified. Migrating: USA"
        echo ""
        read -p "Continue? (y/N): " confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            echo "Aborted"
            exit 0
        fi
        instances=("USA")
    fi
    
    # Migrate each instance
    for instance in "${instances[@]}"; do
        migrate_instance "$instance"
    done
    
    echo "═══════════════════════════════════════════════════════════"
    echo " Migration Complete!"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "Next steps:"
    echo "  1. Set environment variable: export SECRETS_PROVIDER=aws"
    echo "  2. Test deployment: ./dive hub deploy"
    echo "  3. Verify secrets: ./dive secrets verify USA"
    echo ""
}

# Run main
main "$@"
